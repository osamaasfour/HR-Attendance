/** Curated IANA timezones for work locations (admin picker). */
export const LOCATION_TIMEZONE_OPTIONS = [
  { value: 'Africa/Cairo', label: 'Africa/Cairo (Egypt)' },
  { value: 'Asia/Riyadh', label: 'Asia/Riyadh (Saudi Arabia)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (UAE)' },
  { value: 'Asia/Kuwait', label: 'Asia/Kuwait' },
  { value: 'Asia/Qatar', label: 'Asia/Qatar' },
  { value: 'Asia/Bahrain', label: 'Asia/Bahrain' },
  { value: 'Asia/Amman', label: 'Asia/Amman (Jordan)' },
  { value: 'Asia/Beirut', label: 'Asia/Beirut (Lebanon)' },
  { value: 'Europe/London', label: 'Europe/London (UK)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (France)' },
  { value: 'UTC', label: 'UTC' },
] as const;

export const DEFAULT_PUNCH_TIMEZONE = 'Africa/Cairo';
