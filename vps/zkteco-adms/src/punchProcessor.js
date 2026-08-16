/**
 * Process ZKTeco fingerprint punches into Firestore attendance records.
 * Adapted from functions/punchProcessor.js for VPS / Express environment.
 */

const { GeoPoint, Timestamp } = require('firebase-admin/firestore');
const {
  DEFAULT_SCHEDULE,
  toDateString,
  computeLateMinutes,
  computeEarlyLeaveMinutes,
  calculateDuration,
  calculateAttendanceStatus,
  normalizeEmployeeId,
} = require('./attendanceMath');
const { resolveTimezoneFromLocation } = require('./deviceTimezone');

async function loadWorkLocation(db, device) {
  if (!device.workLocationId) return null;
  const locSnap = await db.collection('workLocations').doc(device.workLocationId).get();
  if (!locSnap.exists) return null;
  return { id: locSnap.id, ...locSnap.data() };
}

async function resolveSchedule(db, user, tenantId) {
  if (user.workShiftId) {
    const shiftSnap = await db.collection('workShifts').doc(user.workShiftId).get();
    if (shiftSnap.exists) {
      const s = shiftSnap.data();
      return {
        workStart: s.workStart || DEFAULT_SCHEDULE.workStart,
        workEnd: s.workEnd || DEFAULT_SCHEDULE.workEnd,
        fullDayHours: s.fullDayHours ?? DEFAULT_SCHEDULE.fullDayHours,
        lateGraceMinutes: s.lateGraceMinutes ?? DEFAULT_SCHEDULE.lateGraceMinutes,
      };
    }
  }
  const tenantSnap = await db.collection('tenants').doc(tenantId || 'default').get();
  const ws = tenantSnap.exists ? tenantSnap.data()?.workSchedule : null;
  return {
    workStart: ws?.workStart || DEFAULT_SCHEDULE.workStart,
    workEnd: ws?.workEnd || DEFAULT_SCHEDULE.workEnd,
    fullDayHours: ws?.fullDayHours ?? DEFAULT_SCHEDULE.fullDayHours,
    lateGraceMinutes: ws?.lateGraceMinutes ?? DEFAULT_SCHEDULE.lateGraceMinutes,
  };
}

async function findUserByPin(db, tenantId, employeePin) {
  const pin = normalizeEmployeeId(employeePin);
  if (!pin) return null;
  const snap = await db
    .collection('users')
    .where('tenantId', '==', tenantId)
    .where('employeeId', '==', pin)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const data = doc.data();
  if (data.active === false) return null;
  return { uid: doc.id, ...data };
}

async function findTodayRecord(db, userId, date) {
  const snap = await db
    .collection('attendance')
    .where('userId', '==', userId)
    .where('date', '==', date)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function writePunchLog(db, entry) {
  await db.collection('fingerprintPunchLog').add({
    ...entry,
    createdAt: Timestamp.now(),
  });
}

/**
 * @param {object} params
 * @param {import('firebase-admin/firestore').Firestore} params.db
 * @param {object} params.device — fingerprintDevices doc data + id
 * @param {string} params.rawLine
 * @param {string} params.pin
 * @param {Date}   params.punchTime
 * @param {string} [params.externalPunchId]
 */
async function processFingerprintPunch({ db, device, rawLine, pin, punchTime, externalPunchId }) {
  const tenantId = device.tenantId || 'default';
  const workLocation = await loadWorkLocation(db, device);
  const punchTimezone = await resolveTimezoneFromLocation(workLocation, tenantId, db);
  const baseLog = {
    deviceSerial: device.serialNumber,
    deviceId: device.id,
    tenantId,
    employeePin: pin,
    punchTime: Timestamp.fromDate(punchTime),
    rawLine,
  };

  const employeeId = normalizeEmployeeId(pin);
  if (!employeeId) {
    await writePunchLog(db, { ...baseLog, status: 'failed', reason: 'Invalid employee PIN format' });
    return { ok: false, reason: 'invalid_pin' };
  }

  const user = await findUserByPin(db, tenantId, employeeId);
  if (!user) {
    await writePunchLog(db, {
      ...baseLog,
      employeePin: employeeId,
      status: 'failed',
      reason: `No active user for PIN ${employeeId}`,
    });
    return { ok: false, reason: 'user_not_found' };
  }

  const date = toDateString(punchTime, punchTimezone);
  const existing = await findTodayRecord(db, user.uid, date);

  if (externalPunchId && existing?.externalPunchId === externalPunchId) {
    await writePunchLog(db, {
      ...baseLog,
      employeePin: employeeId,
      status: 'ignored',
      reason: 'Duplicate external punch id',
      attendanceRecordId: existing.id,
    });
    return { ok: true, action: 'ignored_duplicate' };
  }

  const minuteKey = `${user.uid}:${Math.floor(punchTime.getTime() / 60000)}`;
  if (existing?.lastFingerprintMinuteKey === minuteKey) {
    await writePunchLog(db, {
      ...baseLog,
      employeePin: employeeId,
      status: 'ignored',
      reason: 'Duplicate punch within same minute',
      attendanceRecordId: existing.id,
    });
    return { ok: true, action: 'ignored_duplicate' };
  }

  const lat = workLocation?.latitude ?? 0;
  const lng = workLocation?.longitude ?? 0;
  const geo = new GeoPoint(lat, lng);
  const schedule = await resolveSchedule(db, user, tenantId);

  const openRecord = existing && existing.clockIn && !existing.clockOut ? existing : null;
  const completeRecord = existing && existing.clockIn && existing.clockOut ? existing : null;

  if (completeRecord) {
    await writePunchLog(db, {
      ...baseLog,
      employeePin: employeeId,
      status: 'ignored',
      reason: 'Day already complete (clock-in and clock-out recorded)',
      attendanceRecordId: completeRecord.id,
    });
    return { ok: true, action: 'ignored_complete' };
  }

  if (openRecord) {
    const clockInTime = openRecord.clockIn.toDate();
    const totalHours = calculateDuration(clockInTime, punchTime);
    const earlyLeaveMinutes = computeEarlyLeaveMinutes(
      punchTime,
      schedule.workEnd,
      punchTimezone,
    );
    const lateMinutes = openRecord.lateMinutes || 0;
    const checkOutPenaltyEligible = earlyLeaveMinutes > schedule.lateGraceMinutes;
    const status = calculateAttendanceStatus(totalHours, lateMinutes, schedule.fullDayHours);

    await db.collection('attendance').doc(openRecord.id).update({
      clockOut: Timestamp.fromDate(punchTime),
      clockOutLocation: geo,
      clockOutSource: 'fingerprint',
      clockOutDeviceId: device.id,
      punchTimezone,
      status,
      totalHours,
      earlyLeaveMinutes,
      checkOutPenaltyEligible,
      lastFingerprintMinuteKey: minuteKey,
      ...(externalPunchId ? { externalPunchId } : {}),
    });

    await db.collection('fingerprintDevices').doc(device.id).update({
      lastPunchAt: Timestamp.fromDate(punchTime),
      lastSeenAt: Timestamp.now(),
    });

    await writePunchLog(db, {
      ...baseLog,
      employeePin: employeeId,
      status: 'processed',
      reason: 'clock-out',
      attendanceRecordId: openRecord.id,
    });

    return { ok: true, action: 'clock-out', recordId: openRecord.id };
  }

  const lateMinutes = computeLateMinutes(
    punchTime,
    schedule.workStart,
    schedule.lateGraceMinutes,
    punchTimezone,
  );
  const checkInPenaltyEligible = lateMinutes > 0;
  const status = calculateAttendanceStatus(0.1, lateMinutes, schedule.fullDayHours);

  const record = {
    userId: user.uid,
    userName: user.fullName || employeeId,
    employeeId,
    tenantId,
    clockIn: Timestamp.fromDate(punchTime),
    clockOut: null,
    clockInLocation: geo,
    clockOutLocation: null,
    workLocationId: workLocation?.id || device.workLocationId || null,
    workLocationName: workLocation?.name || device.workLocationName || null,
    punchTimezone,
    status,
    date,
    lateMinutes,
    checkInPenaltyEligible,
    clockInSource: 'fingerprint',
    clockInDeviceId: device.id,
    lastFingerprintMinuteKey: minuteKey,
    createdAt: Timestamp.fromDate(punchTime),
    ...(externalPunchId ? { externalPunchId } : {}),
  };

  const ref = await db.collection('attendance').add(record);

  await db.collection('fingerprintDevices').doc(device.id).update({
    lastPunchAt: Timestamp.fromDate(punchTime),
    lastSeenAt: Timestamp.now(),
  });

  await writePunchLog(db, {
    ...baseLog,
    employeePin: employeeId,
    status: 'processed',
    reason: 'clock-in',
    attendanceRecordId: ref.id,
  });

  return { ok: true, action: 'clock-in', recordId: ref.id };
}

module.exports = { processFingerprintPunch };
