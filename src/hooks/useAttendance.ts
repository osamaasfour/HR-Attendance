/**
 * useAttendance — punch pipeline + shared attendance state logic
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Location from 'expo-location';
import { Platform, Linking } from 'react-native';
import {
  db,
  doc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  Timestamp,
  GeoPoint,
} from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { useAppAlert } from '../context/AlertContext';
import { useLanguage } from '../context/LanguageContext';
import { useCompany } from '../context/CompanyContext';
import { findMatchingGeofence, type GeofenceSite } from '../utils/geo';
import { toDateString, formatTime, calculateDuration, calculateAttendanceStatus, computeLateMinutes, computeEarlyLeaveMinutes } from '../utils/time';
import { storePendingPunch, getPendingPunches, removePendingPunch } from '../utils/offlineSync';
import {
  OFFICE_LATITUDE,
  OFFICE_LONGITUDE,
  GEOFENCE_RADIUS_METERS,
  HISTORY_LIMIT,
} from '../constants/theme';
import { resolveWorkSchedule, workShiftToSchedule } from '../types';
import type {
  AttendanceRecord,
  PunchResult,
  ClockState,
  PendingPunch,
  WorkLocation,
  WorkSchedule,
  WorkShift,
} from '../types';

export function useAttendance() {
  const { user } = useAuth();
  const { showAlert } = useAppAlert();
  const { t } = useLanguage();
  const { tenant } = useCompany();
  const companyTimezone = tenant.timezone || 'Africa/Cairo';
  const currentRecordRef = useRef<AttendanceRecord | null>(null);

  const [employeeShift, setEmployeeShift] = useState<WorkShift | null>(null);
  const schedule: WorkSchedule = employeeShift
    ? workShiftToSchedule(employeeShift)
    : resolveWorkSchedule(tenant.workSchedule);

  useEffect(() => {
    let cancelled = false;
    const loadShift = async () => {
      if (!user?.workShiftId) {
        setEmployeeShift(null);
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'workShifts', user.workShiftId));
        if (cancelled) return;
        if (!snap.exists()) {
          setEmployeeShift(null);
          return;
        }
        const data = { ...(snap.data() as WorkShift), id: snap.id };
        if (data.active === false) {
          setEmployeeShift(null);
          return;
        }
        setEmployeeShift(data);
      } catch {
        if (!cancelled) setEmployeeShift(null);
      }
    };
    loadShift();
    return () => {
      cancelled = true;
    };
  }, [user?.workShiftId]);

  const [clockState, setClockState] = useState<ClockState>('idle');
  const [currentRecord, setCurrentRecord] = useState<AttendanceRecord | null>(null);
  const [historyRecords, setHistoryRecords] = useState<AttendanceRecord[]>([]);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [liveTime, setLiveTime] = useState(
    new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: companyTimezone,
    }),
  );

  useEffect(() => {
    currentRecordRef.current = currentRecord;
  }, [currentRecord]);

  useEffect(() => {
    const interval = setInterval(() => {
      setLiveTime(
        new Date().toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
          timeZone: companyTimezone,
        }),
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [companyTimezone]);

  const checkTodayStatus = useCallback(async () => {
    if (!user) return;
    try {
      const today = toDateString(new Date(), companyTimezone);
      const q = query(
        collection(db, 'attendance'),
        where('userId', '==', user.uid),
        where('date', '==', today),
        limit(1),
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const docSnap = snapshot.docs[0];
        const record: AttendanceRecord = {
          ...(docSnap.data() as AttendanceRecord),
          id: docSnap.id,
        };
        setCurrentRecord(record);
        setClockState(record.clockIn && !record.clockOut ? 'clocked-in' : 'idle');
      } else {
        setCurrentRecord(null);
        setClockState('idle');
      }
    } catch (error) {
      console.error('[Attendance] Failed to check today status:', error);
    }
  }, [user, companyTimezone]);

  const fetchHistory = useCallback(async () => {
    if (!user) return;
    setIsLoadingRecords(true);
    try {
      const q = query(
        collection(db, 'attendance'),
        where('userId', '==', user.uid),
        orderBy('date', 'desc'),
        limit(HISTORY_LIMIT),
      );
      const snapshot = await getDocs(q);
      setHistoryRecords(
        snapshot.docs.map((docSnap) => ({
          ...(docSnap.data() as AttendanceRecord),
          id: docSnap.id,
        })),
      );
    } catch (error) {
      console.error('[Attendance] Failed to fetch history:', error);
    } finally {
      setIsLoadingRecords(false);
    }
  }, [user]);

  const authenticateUser = async (): Promise<boolean> => {
    try {
      // Web browsers cannot reliably use device fingerprint via Expo
      if (Platform.OS === 'web') {
        showAlert(t('biometricRequired'), t('biometricRequiredMobile'));
        return false;
      }

      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) {
        showAlert(t('biometricRequired'), t('biometricNoHardware'));
        return false;
      }

      const supported = await LocalAuthentication.supportedAuthenticationTypesAsync();
      const hasFingerprint = supported.includes(
        LocalAuthentication.AuthenticationType.FINGERPRINT,
      );
      const hasFace = supported.includes(
        LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
      );
      if (!hasFingerprint && !hasFace) {
        showAlert(t('biometricRequired'), t('biometricNoHardware'));
        return false;
      }

      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!isEnrolled) {
        showAlert(t('biometricRequired'), t('biometricNotEnrolled'), [
          { text: t('cancel'), style: 'cancel' },
          { text: t('ok'), onPress: () => Linking.openSettings() },
        ]);
        return false;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: hasFingerprint ? t('biometricPromptFingerprint') : t('biometricPromptFace'),
        cancelLabel: t('cancel'),
        disableDeviceFallback: true,
        biometricsSecurityLevel: 'strong',
      });

      if (!result.success) {
        if (result.error === 'user_cancel' || result.error === 'system_cancel') {
          return false;
        }
        showAlert(t('error'), t('biometricFailed'));
        return false;
      }
      return true;
    } catch (error: any) {
      console.error('[Biometrics] Auth error:', error);
      showAlert(t('error'), t('biometricFailed'));
      return false;
    }
  };

  const getCurrentLocation = async (): Promise<{ latitude: number; longitude: number } | null> => {
    if (Platform.OS === 'web') {
      // Browser geolocation may be blocked; fall back to office coords for punch testing
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          return {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          };
        }
      } catch {
        /* use office fallback */
      }
      return { latitude: OFFICE_LATITUDE, longitude: OFFICE_LONGITUDE };
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showAlert(t('locationDenied'), t('geofenceHint'), [
          { text: t('cancel'), style: 'cancel' },
          { text: t('ok'), onPress: () => Linking.openSettings() },
        ]);
        return null;
      }
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
    } catch (error) {
      console.error('[Location] Failed to get location:', error);
      showAlert(t('error'), t('locationDenied'));
      return null;
    }
  };

  const loadAllowedGeofenceSites = async (): Promise<GeofenceSite[]> => {
    const assignedIds = user?.workLocationIds || [];
    if (assignedIds.length === 0) {
      return [
        {
          id: 'default-office',
          name: 'Office',
          latitude: OFFICE_LATITUDE,
          longitude: OFFICE_LONGITUDE,
          radiusMeters: GEOFENCE_RADIUS_METERS,
          timezone: companyTimezone,
        },
      ];
    }
    try {
      const docs = await Promise.all(
        assignedIds.map((id) => getDoc(doc(db, 'workLocations', id))),
      );
      const tid = user?.tenantId || 'default';
      return docs
        .filter((d) => d.exists())
        .map((d) => ({ ...(d.data() as WorkLocation), id: d.id }))
        .filter(
          (loc) =>
            loc.active !== false &&
            (loc.tenantId || 'default') === tid,
        )
        .map((loc) => ({
          id: loc.id,
          name: loc.name,
          latitude: Number(loc.latitude),
          longitude: Number(loc.longitude),
          radiusMeters: Number(loc.radiusMeters) || GEOFENCE_RADIUS_METERS,
          timezone: loc.timezone || companyTimezone,
        }));
    } catch (error) {
      console.error('[Geofence] Failed to load work locations:', error);
      return [];
    }
  };

  const resolveGeofenceMatch = async (
    latitude: number,
    longitude: number,
  ): Promise<GeofenceSite | null> => {
    if (Platform.OS === 'web' && __DEV__) {
      return {
        id: 'dev-bypass',
        name: 'Dev',
        latitude,
        longitude,
        radiusMeters: 99999,
      };
    }
    const sites = await loadAllowedGeofenceSites();
    if (sites.length === 0) {
      showAlert(t('outsideGeofence'), t('outsideAssignedLocations'));
      return null;
    }
    const match = findMatchingGeofence(latitude, longitude, sites);
    if (!match) {
      const msg =
        (user?.workLocationIds?.length || 0) > 0
          ? t('outsideAssignedLocations')
          : t('geofenceHint');
      showAlert(t('outsideGeofence'), msg);
      return null;
    }
    return match;
  };

  const performClockIn = async (
    userId: string,
    userName: string,
    employeeId: string,
    latitude: number,
    longitude: number,
    matchedLocation?: GeofenceSite | null,
  ): Promise<PunchResult> => {
    try {
      const punchTimezone = matchedLocation?.timezone || companyTimezone;
      const today = toDateString(new Date(), punchTimezone);
      const now = new Date();
      const lateMinutes = computeLateMinutes(
        now,
        schedule.workStart,
        schedule.lateGraceMinutes,
        punchTimezone,
      );
      const checkInPenaltyEligible = lateMinutes > 0;
      const status = calculateAttendanceStatus(0.1, lateMinutes, schedule.fullDayHours);
      const newDocRef = doc(collection(db, 'attendance'));
      const record: AttendanceRecord = {
        id: newDocRef.id,
        userId,
        userName,
        employeeId,
        tenantId: user?.tenantId || 'default',
        clockIn: Timestamp.fromDate(now),
        clockOut: null,
        clockInLocation: new GeoPoint(latitude, longitude),
        clockOutLocation: null,
        workLocationId: matchedLocation?.id || null,
        workLocationName: matchedLocation?.name || null,
        punchTimezone,
        status,
        date: today,
        lateMinutes,
        checkInPenaltyEligible,
        clockInSource: 'mobile',
        createdAt: Timestamp.fromDate(now),
      };
      await setDoc(newDocRef, record);
      setCurrentRecord(record);
      setClockState('clocked-in');
      return {
        success: true,
        message: `${t('clockInSuccess')} ${formatTime(now, punchTimezone)}`,
        timestamp: now,
        recordId: newDocRef.id,
      };
    } catch (error: any) {
      if (error?.code === 'UNAVAILABLE' || error?.message?.includes('network')) {
        await storePendingPunch({
          type: 'clock-in',
          userId,
          userName,
          employeeId,
          location: { latitude, longitude },
          timestamp: new Date().toISOString(),
          date: toDateString(new Date(), companyTimezone),
        });
        setClockState('clocked-in');
        return {
          success: true,
          message: t('clockInSuccess'),
          timestamp: new Date(),
        };
      }
      console.error('[Attendance] Clock-in failed:', error);
      return { success: false, message: t('punchFailed') };
    }
  };

  const performClockOut = async (
    latitude: number,
    longitude: number,
    recordOverride?: AttendanceRecord | null,
  ): Promise<PunchResult> => {
    let record = recordOverride ?? currentRecordRef.current;
    if (!record && user) {
      await checkTodayStatus();
      record = currentRecordRef.current;
    }
    if (!record?.id) {
      return { success: false, message: t('punchFailed') };
    }

    try {
      const punchTimezone = record.punchTimezone || companyTimezone;
      const now = new Date();
      const clockInTime = record.clockIn?.toDate() || now;
      const totalHours = calculateDuration(clockInTime, now);
      const earlyLeaveMinutes = computeEarlyLeaveMinutes(now, schedule.workEnd, punchTimezone);
      const lateMinutes = record.lateMinutes || 0;
      const checkOutPenaltyEligible = earlyLeaveMinutes > schedule.lateGraceMinutes;
      const status = calculateAttendanceStatus(
        totalHours,
        lateMinutes,
        schedule.fullDayHours,
      );
      await updateDoc(doc(db, 'attendance', record.id), {
        clockOut: Timestamp.fromDate(now),
        clockOutLocation: new GeoPoint(latitude, longitude),
        clockOutSource: 'mobile',
        status,
        totalHours,
        earlyLeaveMinutes,
        checkOutPenaltyEligible,
      });
      setCurrentRecord({
        ...record,
        clockOut: Timestamp.fromDate(now),
        clockOutLocation: new GeoPoint(latitude, longitude),
        status,
        totalHours,
        earlyLeaveMinutes,
        checkOutPenaltyEligible,
      });
      setClockState('idle');
      return {
        success: true,
        message: `${t('clockOutSuccess')} ${formatTime(now, punchTimezone)}`,
        timestamp: now,
        recordId: record.id,
      };
    } catch (error: any) {
      if (error?.code === 'UNAVAILABLE' || error?.message?.includes('network')) {
        await storePendingPunch({
          type: 'clock-out',
          userId: user!.uid,
          userName: user!.fullName,
          employeeId: user!.employeeId,
          location: { latitude, longitude },
          timestamp: new Date().toISOString(),
          date: toDateString(new Date(), companyTimezone),
        });
        setClockState('idle');
        return {
          success: true,
          message: t('clockOutSuccess'),
          timestamp: new Date(),
        };
      }
      console.error('[Attendance] Clock-out failed:', error);
      return { success: false, message: t('punchFailed') };
    }
  };

  const handlePunch = useCallback(async (): Promise<PunchResult> => {
    if (!user) {
      return { success: false, message: t('punchFailed') };
    }
    const wasClockedIn = !!currentRecordRef.current?.clockIn && !currentRecordRef.current?.clockOut;
    setClockState('loading');
    try {
      const isAuthed = await authenticateUser();
      if (!isAuthed) {
        setClockState(wasClockedIn ? 'clocked-in' : 'idle');
        return { success: false, message: t('biometricFailed') };
      }
      const location = await getCurrentLocation();
      if (!location) {
        setClockState(wasClockedIn ? 'clocked-in' : 'idle');
        return { success: false, message: t('locationDenied') };
      }
      const matched = await resolveGeofenceMatch(location.latitude, location.longitude);
      if (!matched) {
        setClockState(wasClockedIn ? 'clocked-in' : 'idle');
        return { success: false, message: t('outsideGeofence') };
      }
      if (wasClockedIn) {
        return await performClockOut(location.latitude, location.longitude);
      }
      return await performClockIn(
        user.uid,
        user.fullName,
        user.employeeId,
        location.latitude,
        location.longitude,
        matched,
      );
    } catch (error) {
      console.error('[Punch] Unexpected error:', error);
      setClockState(wasClockedIn ? 'clocked-in' : 'idle');
      return { success: false, message: t('punchFailed') };
    }
  }, [user, showAlert, t]);

  const syncPendingPunches = useCallback(async () => {
    const pending = await getPendingPunches();
    if (pending.length === 0) return;
    await checkTodayStatus();
    for (const punch of pending) {
      try {
        if (punch.type === 'clock-in') {
          await performClockIn(
            punch.userId,
            punch.userName,
            punch.employeeId,
            punch.location.latitude,
            punch.location.longitude,
          );
        } else {
          await performClockOut(
            punch.location.latitude,
            punch.location.longitude,
            currentRecordRef.current,
          );
        }
        await removePendingPunch((punch as PendingPunch & { id?: string }).id!);
      } catch (error) {
        console.error('[Offline] Failed to sync punch', error);
      }
    }
    await fetchHistory();
  }, [checkTodayStatus, fetchHistory]);

  useEffect(() => {
    if (user) {
      checkTodayStatus();
      fetchHistory();
      syncPendingPunches();
    } else {
      setCurrentRecord(null);
      setHistoryRecords([]);
      setClockState('idle');
    }
  }, [user, checkTodayStatus, fetchHistory, syncPendingPunches]);

  return {
    clockState,
    currentRecord,
    historyRecords,
    isLoadingRecords,
    liveTime,
    handlePunch,
    checkTodayStatus,
    fetchHistory,
    syncPendingPunches,
  };
}
