/**
 * Resolve IANA timezone for fingerprint punch parsing.
 * Chain: workLocation.timezone → tenant.timezone → PUNCH_TIMEZONE env → Africa/Cairo
 */

const { DEFAULT_PUNCH_TIMEZONE } = require('./punchTime');

function envFallbackTimezone() {
  return process.env.PUNCH_TIMEZONE || DEFAULT_PUNCH_TIMEZONE;
}

async function resolveDeviceTimezone(db, device) {
  const tenantId = device.tenantId || 'default';

  if (device.workLocationId) {
    const locSnap = await db.collection('workLocations').doc(device.workLocationId).get();
    if (locSnap.exists) {
      const tz = locSnap.data()?.timezone;
      if (tz && String(tz).trim()) return String(tz).trim();
    }
  }

  const tenantSnap = await db.collection('tenants').doc(tenantId).get();
  if (tenantSnap.exists) {
    const tz = tenantSnap.data()?.timezone;
    if (tz && String(tz).trim()) return String(tz).trim();
  }

  return envFallbackTimezone();
}

async function resolveTimezoneFromLocation(workLocation, tenantId, db) {
  if (workLocation?.timezone && String(workLocation.timezone).trim()) {
    return String(workLocation.timezone).trim();
  }
  if (db) {
    const tenantSnap = await db.collection('tenants').doc(tenantId || 'default').get();
    if (tenantSnap.exists) {
      const tz = tenantSnap.data()?.timezone;
      if (tz && String(tz).trim()) return String(tz).trim();
    }
  }
  return envFallbackTimezone();
}

module.exports = {
  resolveDeviceTimezone,
  resolveTimezoneFromLocation,
};
