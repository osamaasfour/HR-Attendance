/**
 * Types for the HR Attendance Application
 */

import { Timestamp, GeoPoint } from 'firebase/firestore';

export type UserRole = 'employee' | 'manager' | 'admin';

/** Default tenant used when migrating single-company installs to SaaS */
export const DEFAULT_TENANT_ID = 'default';

/** 0 = Sunday … 6 = Saturday (JS Date.getDay()) */
export type WeekdayNumber = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Company work schedule — drives late/early punches and absence counting */
export interface WorkSchedule {
  /** Local start time HH:mm */
  workStart: string;
  /** Local end time HH:mm */
  workEnd: string;
  /** Hours required for a full present day */
  fullDayHours: number;
  /** Minutes after workStart before late penalty applies */
  lateGraceMinutes: number;
  /** Weekdays that are OFF (not counted as absences). Default Sat+Sun. */
  weeklyOffDays: WeekdayNumber[];
}

export const DEFAULT_WORK_SCHEDULE: WorkSchedule = {
  workStart: '09:00',
  workEnd: '17:00',
  fullDayHours: 8,
  lateGraceMinutes: 10,
  weeklyOffDays: [0, 6],
};

export function resolveWorkSchedule(
  schedule?: Partial<WorkSchedule> | null,
): WorkSchedule {
  const base = DEFAULT_WORK_SCHEDULE;
  const offs = schedule?.weeklyOffDays;
  return {
    workStart: schedule?.workStart || base.workStart,
    workEnd: schedule?.workEnd || base.workEnd,
    fullDayHours:
      schedule?.fullDayHours != null && schedule.fullDayHours > 0
        ? schedule.fullDayHours
        : base.fullDayHours,
    lateGraceMinutes:
      schedule?.lateGraceMinutes != null && schedule.lateGraceMinutes >= 0
        ? schedule.lateGraceMinutes
        : base.lateGraceMinutes,
    weeklyOffDays:
      Array.isArray(offs) && offs.length > 0
        ? ([...new Set(offs.map((d) => Number(d) as WeekdayNumber))].filter(
            (d) => d >= 0 && d <= 6,
          ) as WeekdayNumber[])
        : [...base.weeklyOffDays],
  };
}

export interface Tenant {
  id: string;
  /** Human company name */
  name: string;
  /** Short invite / join code (unique), e.g. ecf-hr */
  slug: string;
  logoUrl?: string;
  countryCode?: string;
  currencyCode?: string;
  currencySymbol?: string;
  locale?: string;
  defaultLanguage?: 'en' | 'ar';
  timezone?: string;
  /** Working days & hours for attendance / absences */
  workSchedule?: WorkSchedule;
  plan?: 'free' | 'pro' | 'enterprise';
  /** Soft-delete / suspend — blocks all logins for this tenant */
  active?: boolean;
  /** Billing period used to compute licenseExpiresAt */
  licenseTerm?: 'monthly' | 'quarterly' | 'annual' | 'trial';
  /** Trial length in days when licenseTerm === 'trial' */
  trialDays?: number;
  /** ISO date YYYY-MM-DD or Timestamp — license end (inclusive day). Missing = grandfathered valid. */
  licenseExpiresAt?: string | Timestamp;
  /** Max active users (employees+managers+admins). Missing/0 = unlimited */
  maxUsers?: number;
  /** Optional invoice / PO / contract reference for your records only */
  licenseKey?: string;
  /** Notes for platform owner */
  licenseNotes?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  createdBy?: string;
}

export const DEFAULT_TENANT: Tenant = {
  id: DEFAULT_TENANT_ID,
  name: 'Company',
  slug: 'default',
  logoUrl: 'https://ecf-hr.web.app/branding/ECF-Logo.jpg?v=2',
  countryCode: 'EG',
  currencyCode: 'EGP',
  currencySymbol: 'E£',
  locale: 'en-EG',
  defaultLanguage: 'en',
  timezone: 'Africa/Cairo',
  workSchedule: { ...DEFAULT_WORK_SCHEDULE, weeklyOffDays: [...DEFAULT_WORK_SCHEDULE.weeklyOffDays] },
  plan: 'free',
  active: true,
};

export interface UserData {
  uid: string;
  email: string;
  fullName: string;
  role: UserRole;
  employeeId: string;
  /** SaaS workspace — all data scoped by this */
  tenantId: string;
  department?: string;
  departmentId?: string;
  branchId?: string;
  branchName?: string;
  /** Punch geofence sites assigned to this user */
  workLocationIds?: string[];
  /** Assigned named shift (from workShifts). Falls back to company workSchedule. */
  workShiftId?: string;
  /** Bound native device — employees/managers locked to one phone */
  allowedDeviceId?: string;
  deviceBoundAt?: Timestamp;
  deviceLabel?: string;
  /** Annual vacation days (defaults to ANNUAL_LEAVE_ALLOWANCE = 21) */
  annualLeaveAllowance?: number;
  /**
   * Signed adjustment to remaining balance.
   * Remaining = max(0, annualLeaveAllowance − used + leaveBalanceAdjustment)
   */
  leaveBalanceAdjustment?: number;
  managerId?: string;
  jobTitle?: string;
  phone?: string;
  photoURL?: string;
  active?: boolean;
  /** Platform owner — can manage all tenants / licenses (vendor console) */
  platformAdmin?: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface AppUser {
  uid: string;
  email: string | null;
  fullName: string;
  role: UserRole;
  employeeId: string;
  tenantId: string;
  department?: string;
  departmentId?: string;
  branchId?: string;
  branchName?: string;
  workLocationIds?: string[];
  workShiftId?: string;
  allowedDeviceId?: string;
  deviceLabel?: string;
  annualLeaveAllowance?: number;
  leaveBalanceAdjustment?: number;
  managerId?: string;
  jobTitle?: string;
  phone?: string;
  photoURL?: string;
  active?: boolean;
  platformAdmin?: boolean;
}

/** @deprecated Prefer Tenant — kept for merge of companySettings/main */
export interface CompanySettings {
  id: string;
  name: string;
  logoUrl?: string;
  countryCode?: string;
  currencyCode?: string;
  currencySymbol?: string;
  locale?: string;
  defaultLanguage?: 'en' | 'ar';
  timezone?: string;
  updatedAt?: Timestamp;
  updatedBy?: string;
}

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  id: 'main',
  name: 'Company',
  countryCode: 'EG',
  currencyCode: 'EGP',
  currencySymbol: 'E£',
  locale: 'en-EG',
  defaultLanguage: 'en',
  timezone: 'Africa/Cairo',
};

/**
 * Outbound email via EmailJS (Spark-compatible HTTPS).
 * Stored at `payrollSettings/smtp` (admin-only).
 * Connect Zoho (or any SMTP) inside the EmailJS dashboard — not from this app.
 */
export interface EmailSettings {
  enabled: boolean;
  provider: 'emailjs';
  /** EmailJS Public Key (Account → API Keys) */
  publicKey: string;
  /** EmailJS Service ID (Email Services) */
  serviceId: string;
  /** EmailJS Template ID */
  templateId: string;
  /**
   * Optional Private Key for restricted API access.
   * Admin-only Firestore; prefer creating templates that don't need it.
   */
  privateKey?: string;
  fromEmail: string;
  fromName?: string;
  updatedAt?: Timestamp;
  updatedBy?: string;
}

/** @deprecated Use EmailSettings — kept for merge/migration of old docs */
export type SmtpSettings = EmailSettings & {
  host?: string;
  port?: number;
  secure?: boolean;
  username?: string;
};

export const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  enabled: false,
  provider: 'emailjs',
  publicKey: '',
  serviceId: '',
  templateId: '',
  fromEmail: 'noreply@ecfshipment.com',
  fromName: 'ECF HR',
};

/** @deprecated alias */
export const DEFAULT_SMTP_SETTINGS = DEFAULT_EMAIL_SETTINGS;

export interface Branch {
  id: string;
  name: string;
  companyId: string;
  tenantId?: string;
  active?: boolean;
  createdAt?: Timestamp;
}

export interface Department {
  id: string;
  name: string;
  branchId: string;
  tenantId?: string;
  active?: boolean;
  createdAt?: Timestamp;
}

/** Admin-managed punch geofence (login / clock-in area) */
export interface WorkLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Geofence radius in meters */
  radiusMeters: number;
  tenantId: string;
  active?: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/** How the VPS syncs with this terminal */
export type FingerprintConnectionType = 'adms' | 'ip';

/** ZKTeco fingerprint terminal linked to a work location */
export interface FingerprintDevice {
  id: string;
  tenantId: string;
  name: string;
  /** ZKTeco serial number (SN) — globally unique */
  serialNumber: string;
  workLocationId: string;
  workLocationName?: string;
  /**
   * ADMS cloud push (default) or TCP pull via IP:4370.
   * Missing on older docs → treat as 'adms'.
   */
  connectionType?: FingerprintConnectionType;
  /** Public IP or hostname (IP mode) */
  host?: string | null;
  /** TCP port (IP mode); default 4370 */
  port?: number | null;
  /** Communication password for ADMS push (optional for IP mode) */
  deviceSecret: string;
  active?: boolean;
  timezone?: string;
  lastSeenAt?: Timestamp;
  lastPunchAt?: Timestamp;
  /** Last successful/attempted IP poll */
  lastPollAt?: Timestamp;
  lastPollError?: string | null;
  /** Watermark: only process IP punches strictly after this time */
  ipSyncAfter?: Timestamp | null;
  /**
   * IP mode only. If true, clear attendance log on the machine after a successful pull.
   * Default / missing = false (download without emptying the device).
   */
  clearDeviceLogAfterSync?: boolean;
  /** If true, next IP poll clears the device attendance log (then resets to false). */
  clearDeviceLogNextPoll?: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type FingerprintPunchLogStatus = 'processed' | 'ignored' | 'failed';

/** Audit log for raw machine punches */
export interface FingerprintPunchLog {
  id: string;
  deviceSerial: string;
  deviceId?: string;
  tenantId: string;
  employeePin?: string;
  punchTime?: Timestamp;
  rawLine: string;
  status: FingerprintPunchLogStatus;
  reason?: string;
  attendanceRecordId?: string;
  createdAt?: Timestamp;
}

/** Named work shift — assignable per employee */
export interface WorkShift {
  id: string;
  name: string;
  tenantId: string;
  workStart: string;
  workEnd: string;
  fullDayHours: number;
  lateGraceMinutes: number;
  weeklyOffDays: WeekdayNumber[];
  active?: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export function workShiftToSchedule(shift: Pick<
  WorkShift,
  'workStart' | 'workEnd' | 'fullDayHours' | 'lateGraceMinutes' | 'weeklyOffDays'
>): WorkSchedule {
  return resolveWorkSchedule({
    workStart: shift.workStart,
    workEnd: shift.workEnd,
    fullDayHours: shift.fullDayHours,
    lateGraceMinutes: shift.lateGraceMinutes,
    weeklyOffDays: shift.weeklyOffDays,
  });
}

export type AttendanceStatus = 'present' | 'absent' | 'half-day' | 'late';

export interface AttendanceRecord {
  id: string;
  userId: string;
  userName: string;
  employeeId: string;
  tenantId?: string;
  clockIn: Timestamp | null;
  clockOut: Timestamp | null;
  clockInLocation: GeoPoint | null;
  clockOutLocation: GeoPoint | null;
  /** Matched work location when punch passed geofence */
  workLocationId?: string | null;
  workLocationName?: string | null;
  status: AttendanceStatus;
  date: string;
  totalHours?: number;
  lateMinutes?: number;
  earlyLeaveMinutes?: number;
  checkInPenaltyEligible?: boolean;
  checkOutPenaltyEligible?: boolean;
  /** Optional explicit OT minutes (daytime) */
  overtimeDayMinutes?: number;
  /** Optional explicit OT minutes (night / holiday) */
  overtimeNightMinutes?: number;
  /** How clock-in was recorded */
  clockInSource?: 'mobile' | 'fingerprint';
  /** How clock-out was recorded */
  clockOutSource?: 'mobile' | 'fingerprint';
  /** Fingerprint terminal doc id (clock-in) */
  clockInDeviceId?: string | null;
  /** Fingerprint terminal doc id (clock-out) */
  clockOutDeviceId?: string | null;
  /** Machine log id for deduplication */
  externalPunchId?: string | null;
  createdAt?: Timestamp;
}

export interface ClockInPayload {
  userId: string;
  userName: string;
  employeeId: string;
  clockIn: Timestamp;
  clockInLocation: GeoPoint;
  status: AttendanceStatus;
  date: string;
  lateMinutes?: number;
  checkInPenaltyEligible?: boolean;
}

export interface ClockOutPayload {
  clockOut: Timestamp;
  clockOutLocation: GeoPoint;
  status: AttendanceStatus;
  totalHours: number;
  earlyLeaveMinutes?: number;
  checkOutPenaltyEligible?: boolean;
}

export type ClockState = 'idle' | 'clocked-in' | 'loading';

export interface PunchResult {
  success: boolean;
  message: string;
  timestamp?: Date;
  recordId?: string;
}

export interface PendingPunch {
  type: 'clock-in' | 'clock-out';
  userId: string;
  userName: string;
  employeeId: string;
  location: { latitude: number; longitude: number };
  timestamp: string;
  date: string;
}

export interface EmployeeStatus {
  uid: string;
  fullName: string;
  employeeId: string;
  isCheckedIn: boolean;
  clockInTime?: Date;
}

export interface DailyStats {
  totalEmployees: number;
  checkedInCount: number;
  absentCount: number;
  halfDayCount: number;
}

/** @deprecated Prefer HrRequestType — kept for migration compatibility */
export type LeaveType = 'annual' | 'sick' | 'unpaid';
export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export interface LeaveRequest {
  id: string;
  userId: string;
  userName: string;
  employeeId: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  reviewedBy?: string;
  reviewedAt?: Timestamp;
  createdAt?: Timestamp;
}

export type HrRequestType =
  | 'vacation'
  | 'sick'
  | 'unpaid'
  | 'business_trip'
  | 'early_leave'
  | 'late_arrive'
  | 'missing';

export type HrRequestStatus = 'pending' | 'approved' | 'rejected';

export interface HrRequest {
  id: string;
  userId: string;
  userName: string;
  employeeId: string;
  tenantId?: string;
  departmentId?: string | null;
  managerId?: string | null;
  type: HrRequestType;
  status: HrRequestStatus;
  startDate: string;
  endDate: string;
  date?: string;
  days: number;
  reason: string;
  minutes?: number;
  plannedTime?: string;
  /** Business trip destination */
  location?: string | null;
  /** Sick leave supporting document */
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentPath?: string | null;
  reviewedBy?: string;
  reviewedAt?: Timestamp;
  createdAt?: Timestamp;
}

export type NotificationType =
  | 'leave_decision'
  | 'leave_submitted'
  | 'request_submitted'
  | 'request_decision'
  | 'general';

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  read: boolean;
  type: NotificationType;
  createdAt?: Timestamp;
}

export interface Department {
  id: string;
  name: string;
  headUserId?: string | null;
}

export interface SalaryAllowances {
  /** Housing / residence allowance */
  housing?: number;
  /** Transportation / commuting */
  transportation?: number;
  /** Meal / food allowance */
  meal?: number;
  /** Nature of work / representation */
  natureOfWork?: number;
  /** Other fixed monthly allowance */
  other?: number;
}

export interface Compensation {
  userId: string;
  basicSalary: number;
  /** Fixed monthly allowances (added to gross; SI brackets still use basic) */
  allowances?: SalaryAllowances;
  currency?: string;
  tenantId?: string;
  /** Bank transfer details for salary export */
  bankName?: string;
  accountHolder?: string;
  accountNumber?: string;
  iban?: string;
  updatedAt?: Timestamp;
}

export interface Loan {
  id: string;
  userId: string;
  userName: string;
  principal: number;
  installment: number;
  remaining: number;
  active: boolean;
  createdAt?: Timestamp;
}

/** How overtime hourly rate is derived from gross salary */
export type HourlyRateBase = 'calendar_30_8' | 'working_days_shift';

export interface OvertimeConfig {
  daytimeMultiplier: number;
  nighttimeMultiplier: number;
  hourlyRateBase: HourlyRateBase;
  shiftHours: number;
}

/** Late / early penalty band (minutes of lateness → wage deduction) */
export interface PenaltyTierRow {
  id: string;
  minMinutes: number;
  maxMinutes: number;
  /** Minutes of wage deducted (0 if using days) */
  deductionMinutes: number;
  /** Days of salary deducted (0 if using minutes) */
  deductionDays: number;
}

/** After N occurrences in the month, apply day-based penalty instead of tier minutes */
export interface OccurrenceRule {
  enabled: boolean;
  afterCount: number;
  penaltyDays: number;
}

export interface SocialInsuranceConfig {
  /** Monthly insurance subscription wage floor (EGP) */
  monthlyWageMin: number;
  /** Monthly insurance subscription wage ceiling (EGP) */
  monthlyWageMax: number;
  /** @deprecated Prefer insuranceBrackets — kept as migration fallback */
  employeeSharePct: number;
  /** Tracked for reporting — not deducted from employee net */
  /** @deprecated Prefer insuranceBrackets — kept as migration fallback */
  employerSharePct: number;
}

/**
 * Insurance rate band by monthly basic salary (lookup, not progressive).
 * Pick the first band where basicSalary <= upToMonthlyBasic (sorted ascending).
 */
export interface InsuranceBracket {
  id: string;
  /** Upper monthly basic salary for this band (EGP) */
  upToMonthlyBasic: number;
  employeeSharePct: number;
  /** Reporting only — not deducted from net */
  employerSharePct: number;
}

/** Annual progressive income-tax bracket (Egyptian-style) */
export interface TaxBracket {
  id: string;
  /** Upper annual taxable income for this bracket (EGP) */
  upToAnnual: number;
  ratePct: number;
}

export interface PayrollSettings {
  workingDaysPerMonth: number;
  unpaidVacationDayMultiplier: number;
  absenceDayMultiplier: number;
  overtime: OvertimeConfig;
  checkInTiers: PenaltyTierRow[];
  checkOutTiers: PenaltyTierRow[];
  checkInOccurrence: OccurrenceRule;
  checkOutOccurrence: OccurrenceRule;
  socialInsurance: SocialInsuranceConfig;
  /** Rate bands by monthly basic salary */
  insuranceBrackets: InsuranceBracket[];
  /** Monthly personal exemption used in STEP 4 */
  monthlyPersonalExemption: number;
  /** Annual personal exemption (shown in tax editor; monthly = annual/12 if monthly unset) */
  annualPersonalExemption: number;
  taxBrackets: TaxBracket[];
  /** Max loan installment as % of gross base salary (e.g. 25) */
  loanDeductionCapPct: number;
  updatedAt?: Timestamp;

  /** @deprecated migrated into socialInsurance / taxBrackets */
  employeeInsurancePct?: number;
  companyInsurancePct?: number;
  taxPct?: number;
  latePenaltyPerMinute?: number;
  checkInPenaltyFlat?: number;
  checkOutPenaltyFlat?: number;
  lateGraceMinutes?: number;
}

export type DeductionCode =
  | 'loan'
  | 'absent'
  | 'penalty'
  | 'deduction'
  | 'lateness'
  | 'emp_insurance'
  | 'company_insurance'
  | 'tax'
  | 'unpaid_vacation'
  | 'checkin_penalty'
  | 'checkout_penalty'
  | 'overtime'
  | 'basic'
  | 'allowance_housing'
  | 'allowance_transport'
  | 'allowance_meal'
  | 'allowance_nature'
  | 'allowance_other';

export interface PayslipLine {
  code: DeductionCode | string;
  label: string;
  amount: number;
}

export interface PayslipBreakdown {
  overtimePay: number;
  absenceDeductions: number;
  checkInPenalties: number;
  checkOutPenalties: number;
  loanInstallments: number;
  unpaidVacation: number;
}

export interface Payslip {
  id: string;
  userId: string;
  userName: string;
  employeeId: string;
  period: string;
  earnings: PayslipLine[];
  deductions: PayslipLine[];
  /** STEP 1 — Gross + OT */
  monthlyBaseEarnings?: number;
  /** STEP 2 — absence + penalties + loans (+ unpaid) */
  totalReductions?: number;
  /** STEP 3 */
  adjustedGross?: number;
  /** STEP 4 */
  taxableIncome?: number;
  employeeInsurance?: number;
  /** Employer NOSI share — reporting only, not in net */
  employerInsurance?: number;
  incomeTax?: number;
  breakdown?: PayslipBreakdown;
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  ratesSnapshot?: Partial<PayrollSettings>;
  published: boolean;
  tenantId?: string;
  createdAt?: Timestamp;
}

export interface PayrollRun {
  id: string;
  period: string;
  status: 'draft' | 'published';
  tenantId?: string;
  generatedAt?: Timestamp;
  payslipCount?: number;
}
