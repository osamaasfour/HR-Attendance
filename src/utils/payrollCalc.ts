/**
 * Egyptian monthly payroll — 5-step net salary formula using live admin settings.
 *
 * STEP 1: Monthly Base Earnings = Gross Base + Overtime
 * STEP 2: Total Reductions = Absence + Check-in + Check-out + Loans (+ unpaid vacation)
 * STEP 3: Adjusted Gross = Base Earnings − Reductions
 * STEP 4: Taxable Income = Adjusted Gross − Employee SI − Monthly Personal Exemption
 * STEP 5: Net = Adjusted Gross − Employee SI − Income Tax
 *
 * Employer SI is tracked for reporting only and never reduces net pay.
 * Net is floored at 0.
 */

import { DEFAULT_PAYROLL_SETTINGS } from '../constants/theme';
import type {
  AttendanceRecord,
  Compensation,
  HrRequest,
  InsuranceBracket,
  Loan,
  OccurrenceRule,
  PayrollSettings,
  PayslipBreakdown,
  PayslipLine,
  PenaltyTierRow,
  SalaryAllowances,
  TaxBracket,
} from '../types';

export function sumAllowances(allowances?: SalaryAllowances | null): number {
  if (!allowances) return 0;
  return (
    Math.max(0, allowances.housing || 0) +
    Math.max(0, allowances.transportation || 0) +
    Math.max(0, allowances.meal || 0) +
    Math.max(0, allowances.natureOfWork || 0) +
    Math.max(0, allowances.other || 0)
  );
}

export function mergePayrollSettings(
  partial?: Partial<PayrollSettings> | null,
): PayrollSettings {
  const base = DEFAULT_PAYROLL_SETTINGS as PayrollSettings;
  const p = partial || {};

  // Migrate legacy flat % fields into nested socialInsurance if needed
  const socialInsurance = {
    ...base.socialInsurance,
    ...(p.socialInsurance || {}),
  };
  if (p.employeeInsurancePct != null && p.socialInsurance?.employeeSharePct == null) {
    socialInsurance.employeeSharePct = p.employeeInsurancePct;
  }
  if (p.companyInsurancePct != null && p.socialInsurance?.employerSharePct == null) {
    socialInsurance.employerSharePct = p.companyInsurancePct;
  }

  let insuranceBrackets: InsuranceBracket[] =
    p.insuranceBrackets?.length ? p.insuranceBrackets : base.insuranceBrackets;
  if (!p.insuranceBrackets?.length) {
    // Synthesize one band from legacy flat shares when brackets missing
    insuranceBrackets = [
      {
        id: 'ins-legacy',
        upToMonthlyBasic: 999999999,
        employeeSharePct: socialInsurance.employeeSharePct ?? 11,
        employerSharePct: socialInsurance.employerSharePct ?? 18.75,
      },
    ];
  }

  return {
    ...base,
    ...p,
    workingDaysPerMonth: p.workingDaysPerMonth ?? base.workingDaysPerMonth,
    unpaidVacationDayMultiplier:
      p.unpaidVacationDayMultiplier ?? base.unpaidVacationDayMultiplier,
    absenceDayMultiplier: p.absenceDayMultiplier ?? base.absenceDayMultiplier,
    overtime: { ...base.overtime, ...(p.overtime || {}) },
    checkInTiers: p.checkInTiers?.length ? p.checkInTiers : base.checkInTiers,
    checkOutTiers: p.checkOutTiers?.length ? p.checkOutTiers : base.checkOutTiers,
    checkInOccurrence: { ...base.checkInOccurrence, ...(p.checkInOccurrence || {}) },
    checkOutOccurrence: { ...base.checkOutOccurrence, ...(p.checkOutOccurrence || {}) },
    socialInsurance,
    insuranceBrackets,
    monthlyPersonalExemption:
      p.monthlyPersonalExemption ??
      (p.annualPersonalExemption != null
        ? p.annualPersonalExemption / 12
        : base.monthlyPersonalExemption),
    annualPersonalExemption: p.annualPersonalExemption ?? base.annualPersonalExemption,
    taxBrackets: p.taxBrackets?.length ? p.taxBrackets : base.taxBrackets,
    loanDeductionCapPct: p.loanDeductionCapPct ?? base.loanDeductionCapPct,
  };
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function daysInPeriod(period: string): { start: string; end: string } {
  const [y, m] = period.split('-').map(Number);
  const start = `${period}-01`;
  const last = new Date(y, m, 0).getDate();
  const end = `${period}-${String(last).padStart(2, '0')}`;
  return { start, end };
}

function inPeriod(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

function hourlyRate(gross: number, settings: PayrollSettings): number {
  const shift = Math.max(1, settings.overtime.shiftHours || 8);
  if (settings.overtime.hourlyRateBase === 'working_days_shift') {
    const days = Math.max(1, settings.workingDaysPerMonth);
    return gross / days / shift;
  }
  return gross / 30 / 8;
}

function dailyRate(gross: number, settings: PayrollSettings): number {
  if (settings.overtime.hourlyRateBase === 'working_days_shift') {
    return gross / Math.max(1, settings.workingDaysPerMonth);
  }
  return gross / 30;
}

function minuteRate(gross: number, settings: PayrollSettings): number {
  return hourlyRate(gross, settings) / 60;
}

function applyTier(
  minutes: number,
  tiers: PenaltyTierRow[],
  daily: number,
  perMinute: number,
): number {
  if (minutes <= 0) return 0;
  const sorted = [...tiers].sort((a, b) => a.minMinutes - b.minMinutes);
  const tier =
    sorted.find((t) => minutes >= t.minMinutes && minutes <= t.maxMinutes) ||
    sorted[sorted.length - 1];
  if (!tier) return 0;
  const fromDays = (tier.deductionDays || 0) * daily;
  const fromMins = (tier.deductionMinutes || 0) * perMinute;
  return fromDays + fromMins;
}

function applyOccurrencePenalties(
  eventMinutes: number[],
  tiers: PenaltyTierRow[],
  occurrence: OccurrenceRule,
  daily: number,
  perMinute: number,
): number {
  let total = 0;
  eventMinutes.forEach((mins, idx) => {
    if (mins <= 0) return;
    const occurrenceHit =
      occurrence?.enabled && occurrence.afterCount > 0 && idx + 1 >= occurrence.afterCount;
    if (occurrenceHit) {
      total += (occurrence.penaltyDays || 0) * daily;
    } else {
      total += applyTier(mins, tiers, daily, perMinute);
    }
  });
  return total;
}

/**
 * Progressive annual brackets → monthly withholding.
 * Annualize monthly taxable, compute annual tax, divide by 12.
 */
export function computeMonthlyIncomeTax(
  monthlyTaxable: number,
  brackets: TaxBracket[],
): number {
  if (monthlyTaxable <= 0) return 0;
  const annual = monthlyTaxable * 12;
  const sorted = [...brackets].sort((a, b) => a.upToAnnual - b.upToAnnual);
  let remaining = annual;
  let lower = 0;
  let annualTax = 0;
  for (const b of sorted) {
    if (remaining <= 0) break;
    const span = Math.max(0, b.upToAnnual - lower);
    const taxableHere = Math.min(remaining, span);
    annualTax += taxableHere * ((b.ratePct || 0) / 100);
    remaining -= taxableHere;
    lower = b.upToAnnual;
  }
  return roundMoney(annualTax / 12);
}

export function insuranceSubscriptionWage(base: number, settings: PayrollSettings): number {
  const { monthlyWageMin, monthlyWageMax } = settings.socialInsurance;
  return Math.min(Math.max(base, monthlyWageMin || 0), monthlyWageMax || base);
}

/**
 * Lookup insurance rate band by monthly basic salary (not progressive).
 * Sorted ascending by upToMonthlyBasic; first band where basic <= ceiling wins.
 */
export function resolveInsuranceBracket(
  basicSalary: number,
  brackets: InsuranceBracket[],
): InsuranceBracket {
  const sorted = [...brackets].sort((a, b) => a.upToMonthlyBasic - b.upToMonthlyBasic);
  const match = sorted.find((b) => basicSalary <= b.upToMonthlyBasic);
  return (
    match ||
    sorted[sorted.length - 1] || {
      id: 'ins-fallback',
      upToMonthlyBasic: 999999999,
      employeeSharePct: 11,
      employerSharePct: 18.75,
    }
  );
}

export interface PayrollCalcInput {
  userId: string;
  userName: string;
  employeeId: string;
  period: string;
  compensation: Compensation | null;
  settings: PayrollSettings;
  attendance: AttendanceRecord[];
  requests: HrRequest[];
  loans: Loan[];
  /** Weekdays that are OFF (0=Sun…6=Sat). Defaults to Sat+Sun. */
  weeklyOffDays?: number[];
  /** YYYY-MM-DD company holidays in this period (not counted as absence). */
  holidayDates?: Set<string>;
}

export interface PayrollCalcResult {
  earnings: PayslipLine[];
  deductions: PayslipLine[];
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  monthlyBaseEarnings: number;
  totalReductions: number;
  adjustedGross: number;
  taxableIncome: number;
  employeeInsurance: number;
  employerInsurance: number;
  incomeTax: number;
  breakdown: PayslipBreakdown;
}

export function calculatePayslip(input: PayrollCalcInput): PayrollCalcResult {
  const settings = mergePayrollSettings(input.settings);
  const grossBase = Math.max(0, input.compensation?.basicSalary ?? 0);
  const allowancesTotal = roundMoney(sumAllowances(input.compensation?.allowances));
  const allowances = input.compensation?.allowances;
  const daily = dailyRate(grossBase, settings);
  const perMinute = minuteRate(grossBase, settings);
  const hour = hourlyRate(grossBase, settings);
  const shiftHours = Math.max(1, settings.overtime.shiftHours || 8);
  const { start, end } = daysInPeriod(input.period);

  const periodAtt = input.attendance.filter((a) => inPeriod(a.date, start, end));
  const periodReq = input.requests.filter(
    (r) =>
      r.status === 'approved' &&
      (inPeriod(r.startDate, start, end) || inPeriod(r.endDate || r.startDate, start, end)),
  );

  const coveredDates = new Set<string>();
  periodReq.forEach((r) => {
    if (['vacation', 'sick', 'business_trip'].includes(r.type)) {
      const d = new Date(r.startDate + 'T00:00:00');
      const last = new Date((r.endDate || r.startDate) + 'T00:00:00');
      while (d <= last) {
        coveredDates.add(
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        );
        d.setDate(d.getDate() + 1);
      }
    }
  });

  // —— Overtime ——
  let dayOtMinutes = 0;
  let nightOtMinutes = 0;
  periodAtt.forEach((a) => {
    if (a.overtimeDayMinutes != null || a.overtimeNightMinutes != null) {
      dayOtMinutes += a.overtimeDayMinutes || 0;
      nightOtMinutes += a.overtimeNightMinutes || 0;
      return;
    }
    const worked = (a.totalHours || 0) * 60;
    const ot = Math.max(0, worked - shiftHours * 60);
    dayOtMinutes += ot;
  });
  const overtimePay = roundMoney(
    (dayOtMinutes / 60) * hour * settings.overtime.daytimeMultiplier +
      (nightOtMinutes / 60) * hour * settings.overtime.nighttimeMultiplier,
  );

  // STEP 1 — basic + allowances + overtime
  const monthlyBaseEarnings = roundMoney(grossBase + allowancesTotal + overtimePay);

  // —— Absences ——
  const presentDates = new Set(periodAtt.map((a) => a.date));
  const weeklyOffDays =
    input.weeklyOffDays?.length ? input.weeklyOffDays : [0, 6];
  let absentDays = 0;
  {
    const d = new Date(start + 'T00:00:00');
    const last = new Date(end + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    while (d <= last && d < today) {
      const day = d.getDay();
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const isOff = weeklyOffDays.includes(day);
      const isHoliday = Boolean(input.holidayDates?.has(key));
      if (!isOff && !isHoliday && !presentDates.has(key) && !coveredDates.has(key)) {
        absentDays += 1;
      }
      d.setDate(d.getDate() + 1);
    }
  }
  const absenceDeductions = roundMoney(
    absentDays * daily * (settings.absenceDayMultiplier || 1),
  );

  const unpaidDays = periodReq
    .filter((r) => r.type === 'unpaid')
    .reduce((s, r) => s + (r.days || 0), 0);
  const unpaidVacation = roundMoney(
    unpaidDays * daily * (settings.unpaidVacationDayMultiplier || 1),
  );

  // —— Check-in / check-out matrices ——
  const lateEvents = periodAtt
    .map((a) => a.lateMinutes || 0)
    .filter((m) => m > 0)
    .sort((a, b) => b - a);
  const earlyEvents = periodAtt
    .map((a) => a.earlyLeaveMinutes || 0)
    .filter((m) => m > 0)
    .sort((a, b) => b - a);

  const checkInPenalties = roundMoney(
    applyOccurrencePenalties(
      lateEvents,
      settings.checkInTiers,
      settings.checkInOccurrence,
      daily,
      perMinute,
    ),
  );
  const checkOutPenalties = roundMoney(
    applyOccurrencePenalties(
      earlyEvents,
      settings.checkOutTiers,
      settings.checkOutOccurrence,
      daily,
      perMinute,
    ),
  );

  // —— Loans (capped) ——
  const rawLoan = input.loans
    .filter((l) => l.active)
    .reduce((s, l) => s + (l.installment || 0), 0);
  const loanCap =
    ((grossBase + allowancesTotal) * (settings.loanDeductionCapPct || 100)) / 100;
  const loanInstallments = roundMoney(Math.min(rawLoan, Math.max(0, loanCap)));

  // STEP 2
  const totalReductions = roundMoney(
    absenceDeductions +
      checkInPenalties +
      checkOutPenalties +
      loanInstallments +
      unpaidVacation,
  );

  // STEP 3
  const adjustedGross = roundMoney(Math.max(0, monthlyBaseEarnings - totalReductions));

  // Social insurance: clamp BASIC salary only, rates from admin salary brackets
  const insWage = insuranceSubscriptionWage(grossBase, settings);
  const insBracket = resolveInsuranceBracket(grossBase, settings.insuranceBrackets);
  const employeeInsurance = roundMoney(
    (insWage * (insBracket.employeeSharePct || 0)) / 100,
  );
  const employerInsurance = roundMoney(
    (insWage * (insBracket.employerSharePct || 0)) / 100,
  );

  // STEP 4
  const taxableIncome = roundMoney(
    Math.max(
      0,
      adjustedGross - employeeInsurance - (settings.monthlyPersonalExemption || 0),
    ),
  );

  // STEP 5 tax + net
  const incomeTax = computeMonthlyIncomeTax(taxableIncome, settings.taxBrackets);
  const netPay = roundMoney(
    Math.max(0, adjustedGross - employeeInsurance - incomeTax),
  );

  const earnings: PayslipLine[] = [
    { code: 'basic', label: 'Gross base salary', amount: roundMoney(grossBase) },
  ];
  if ((allowances?.housing || 0) > 0) {
    earnings.push({
      code: 'allowance_housing',
      label: 'Housing allowance',
      amount: roundMoney(allowances!.housing || 0),
    });
  }
  if ((allowances?.transportation || 0) > 0) {
    earnings.push({
      code: 'allowance_transport',
      label: 'Transportation allowance',
      amount: roundMoney(allowances!.transportation || 0),
    });
  }
  if ((allowances?.meal || 0) > 0) {
    earnings.push({
      code: 'allowance_meal',
      label: 'Meal allowance',
      amount: roundMoney(allowances!.meal || 0),
    });
  }
  if ((allowances?.natureOfWork || 0) > 0) {
    earnings.push({
      code: 'allowance_nature',
      label: 'Nature of work allowance',
      amount: roundMoney(allowances!.natureOfWork || 0),
    });
  }
  if ((allowances?.other || 0) > 0) {
    earnings.push({
      code: 'allowance_other',
      label: 'Other allowance',
      amount: roundMoney(allowances!.other || 0),
    });
  }
  if (overtimePay > 0) {
    earnings.push({
      code: 'overtime',
      label: `Overtime (${roundMoney((dayOtMinutes + nightOtMinutes) / 60)}h)`,
      amount: overtimePay,
    });
  }

  const deductions: PayslipLine[] = [];
  if (absenceDeductions > 0) {
    deductions.push({
      code: 'absent',
      label: `Absence (${absentDays}d × ${settings.absenceDayMultiplier})`,
      amount: absenceDeductions,
    });
  }
  if (checkInPenalties > 0) {
    deductions.push({
      code: 'checkin_penalty',
      label: `Check-in penalties (${lateEvents.length} events)`,
      amount: checkInPenalties,
    });
  }
  if (checkOutPenalties > 0) {
    deductions.push({
      code: 'checkout_penalty',
      label: `Check-out penalties (${earlyEvents.length} events)`,
      amount: checkOutPenalties,
    });
  }
  if (unpaidVacation > 0) {
    deductions.push({
      code: 'unpaid_vacation',
      label: `Unpaid vacation (${unpaidDays}d)`,
      amount: unpaidVacation,
    });
  }
  if (loanInstallments > 0) {
    const capped = rawLoan > loanInstallments;
    deductions.push({
      code: 'loan',
      label: capped
        ? `Loan installment (capped at ${settings.loanDeductionCapPct}% gross)`
        : 'Loan installment',
      amount: loanInstallments,
    });
  }
  if (employeeInsurance > 0) {
    deductions.push({
      code: 'emp_insurance',
      label: `Employee social insurance (${insBracket.employeeSharePct}%)`,
      amount: employeeInsurance,
    });
  }
  if (incomeTax > 0) {
    deductions.push({
      code: 'tax',
      label: 'Income tax',
      amount: incomeTax,
    });
  }

  // Employer SI is reporting-only — listed with amount 0 impact on net via separate field
  const totalDeductions = roundMoney(deductions.reduce((s, d) => s + d.amount, 0));

  return {
    earnings,
    deductions,
    grossPay: monthlyBaseEarnings,
    totalDeductions,
    netPay,
    monthlyBaseEarnings,
    totalReductions,
    adjustedGross,
    taxableIncome,
    employeeInsurance,
    employerInsurance,
    incomeTax,
    breakdown: {
      overtimePay,
      absenceDeductions,
      checkInPenalties,
      checkOutPenalties,
      loanInstallments,
      unpaidVacation,
    },
  };
}
