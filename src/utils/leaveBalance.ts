/**
 * Per-employee annual leave allowance + optional remaining-balance adjustment.
 * Remaining = max(0, allowance − used + adjustment)
 */

import { ANNUAL_LEAVE_ALLOWANCE } from '../constants/theme';

export function resolveAnnualLeaveAllowance(
  user?: { annualLeaveAllowance?: number | null } | null,
): number {
  const n = user?.annualLeaveAllowance;
  if (typeof n === 'number' && Number.isFinite(n) && n >= 0) return Math.floor(n);
  return ANNUAL_LEAVE_ALLOWANCE;
}

export function resolveLeaveBalanceAdjustment(
  user?: { leaveBalanceAdjustment?: number | null } | null,
): number {
  const n = user?.leaveBalanceAdjustment;
  if (typeof n === 'number' && Number.isFinite(n)) return Math.trunc(n);
  return 0;
}

export function computeRemainingVacation(
  allowance: number,
  used: number,
  adjustment = 0,
): number {
  return Math.max(0, allowance - Math.max(0, used) + adjustment);
}
