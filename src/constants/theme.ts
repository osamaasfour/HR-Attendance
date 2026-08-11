/**
 * Constants used throughout the application.
 */

import {
  OFFICE_LATITUDE as ENV_LAT,
  OFFICE_LONGITUDE as ENV_LNG,
  GEOFENCE_RADIUS_METERS as ENV_RADIUS,
} from '@env';

const parseNum = (value: string | undefined, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const OFFICE_LATITUDE = parseNum(ENV_LAT, 37.7749);
export const OFFICE_LONGITUDE = parseNum(ENV_LNG, -122.4194);
export const GEOFENCE_RADIUS_METERS = parseNum(ENV_RADIUS, 100);

export const BIOMETRIC_PROMPT = 'Scan your fingerprint to punch attendance';
export const BIOMETRIC_FALLBACK_TITLE = 'Use device PIN';

export const FULL_DAY_HOURS = 8;
export const HISTORY_LIMIT = 30;
export const ANNUAL_LEAVE_ALLOWANCE = 21;

/** Default shift — HH:mm local time */
export const WORK_START = '09:00';
export const WORK_END = '17:00';
export const LATE_GRACE_MINUTES = 10;

const DEFAULT_CHECK_IN_TIERS = [
  { id: 'ci-1', minMinutes: 0, maxMinutes: 15, deductionMinutes: 0, deductionDays: 0 },
  { id: 'ci-2', minMinutes: 16, maxMinutes: 30, deductionMinutes: 15, deductionDays: 0 },
  { id: 'ci-3', minMinutes: 31, maxMinutes: 60, deductionMinutes: 30, deductionDays: 0 },
  { id: 'ci-4', minMinutes: 61, maxMinutes: 9999, deductionMinutes: 0, deductionDays: 0.5 },
];

const DEFAULT_CHECK_OUT_TIERS = [
  { id: 'co-1', minMinutes: 0, maxMinutes: 15, deductionMinutes: 0, deductionDays: 0 },
  { id: 'co-2', minMinutes: 16, maxMinutes: 30, deductionMinutes: 15, deductionDays: 0 },
  { id: 'co-3', minMinutes: 31, maxMinutes: 60, deductionMinutes: 30, deductionDays: 0 },
  { id: 'co-4', minMinutes: 61, maxMinutes: 9999, deductionMinutes: 0, deductionDays: 0.5 },
];

/** Egyptian-style annual income tax brackets (illustrative defaults — editable in admin) */
const DEFAULT_TAX_BRACKETS = [
  { id: 'tx-1', upToAnnual: 40000, ratePct: 0 },
  { id: 'tx-2', upToAnnual: 55000, ratePct: 10 },
  { id: 'tx-3', upToAnnual: 70000, ratePct: 15 },
  { id: 'tx-4', upToAnnual: 200000, ratePct: 20 },
  { id: 'tx-5', upToAnnual: 400000, ratePct: 22.5 },
  { id: 'tx-6', upToAnnual: 1200000, ratePct: 25 },
  { id: 'tx-7', upToAnnual: 999999999, ratePct: 27.5 },
];

/** Default SI rate band — matches legacy flat 11% / 18.75% */
export const DEFAULT_INSURANCE_BRACKETS = [
  {
    id: 'ins-1',
    upToMonthlyBasic: 999999999,
    employeeSharePct: 11,
    employerSharePct: 18.75,
  },
];

export const DEFAULT_PAYROLL_SETTINGS = {
  workingDaysPerMonth: 30,
  unpaidVacationDayMultiplier: 1,
  absenceDayMultiplier: 1,
  overtime: {
    daytimeMultiplier: 1.35,
    nighttimeMultiplier: 1.7,
    hourlyRateBase: 'calendar_30_8' as const,
    shiftHours: FULL_DAY_HOURS,
  },
  checkInTiers: DEFAULT_CHECK_IN_TIERS,
  checkOutTiers: DEFAULT_CHECK_OUT_TIERS,
  checkInOccurrence: { enabled: true, afterCount: 3, penaltyDays: 1 },
  checkOutOccurrence: { enabled: false, afterCount: 3, penaltyDays: 1 },
  socialInsurance: {
    monthlyWageMin: 2000,
    monthlyWageMax: 14500,
    employeeSharePct: 11,
    employerSharePct: 18.75,
  },
  insuranceBrackets: DEFAULT_INSURANCE_BRACKETS,
  monthlyPersonalExemption: 1666.67,
  annualPersonalExemption: 20000,
  taxBrackets: DEFAULT_TAX_BRACKETS,
  loanDeductionCapPct: 25,
};

export const STORAGE_KEYS = {
  USER_SESSION: '@hr_attendance_user',
  PENDING_PUNCHES: '@hr_attendance_pending_punches',
  ONBOARDING_COMPLETE: '@hr_attendance_onboarding_done',
} as const;
