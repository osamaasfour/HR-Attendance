/**
 * Bank salary-transfer column map.
 * Source: user bank fields (Users page), with compensation fallback + payslip net.
 */

import type { Compensation, Payslip, Tenant, UserData } from '../types';

export type BankTransferCode =
  | 'serial'
  | 'employeeId'
  | 'fullName'
  | 'nationalId'
  | 'bankName'
  | 'accountHolder'
  | 'accountNumber'
  | 'iban'
  | 'netPay'
  | 'currency'
  | 'period';

export const BANK_TRANSFER_SHEET_NAME = 'تحويل بنكي';

export const BANK_TRANSFER_COLUMNS: {
  code: BankTransferCode;
  header: string;
  headerEn: string;
}[] = [
  { code: 'serial', header: 'مسلسل', headerEn: 'serial' },
  { code: 'employeeId', header: 'كود الموظف', headerEn: 'employeeId' },
  { code: 'fullName', header: 'اسم الموظف', headerEn: 'fullName' },
  { code: 'nationalId', header: 'الرقم القومي', headerEn: 'nationalId' },
  { code: 'bankName', header: 'اسم البنك', headerEn: 'bankName' },
  { code: 'accountHolder', header: 'اسم صاحب الحساب', headerEn: 'accountHolder' },
  { code: 'accountNumber', header: 'رقم الحساب', headerEn: 'accountNumber' },
  { code: 'iban', header: 'IBAN', headerEn: 'iban' },
  { code: 'netPay', header: 'المبلغ المحول / صافي الأجر', headerEn: 'netPay' },
  { code: 'currency', header: 'العملة', headerEn: 'currency' },
  { code: 'period', header: 'الفترة', headerEn: 'period' },
];

export function hasBankAccount(
  user?: UserData | null,
  compensation?: Compensation | null,
): boolean {
  return Boolean(
    user?.accountNumber?.trim() ||
      user?.iban?.trim() ||
      compensation?.accountNumber?.trim() ||
      compensation?.iban?.trim(),
  );
}

export type BankTransferRowInput = {
  serial: number;
  user?: UserData;
  compensation?: Compensation;
  payslip?: Payslip;
  tenant?: Tenant;
  period: string;
};

export function mapPayslipToBankTransferRow(
  input: BankTransferRowInput,
): Record<BankTransferCode, string | number> {
  const { serial, user, compensation, payslip, tenant, period } = input;
  const name = user?.fullName || payslip?.userName || '';
  const net = Number(payslip?.netPay);
  return {
    serial,
    employeeId: user?.employeeId || payslip?.employeeId || '',
    fullName: name,
    nationalId: user?.nationalId || '',
    bankName: user?.bankName?.trim() || compensation?.bankName?.trim() || '',
    accountHolder:
      user?.accountHolder?.trim() || compensation?.accountHolder?.trim() || name,
    accountNumber: user?.accountNumber?.trim() || compensation?.accountNumber?.trim() || '',
    iban: user?.iban?.trim() || compensation?.iban?.trim() || '',
    netPay: Number.isFinite(net) ? Math.round(net * 100) / 100 : 0,
    currency: compensation?.currency || tenant?.currencyCode || '',
    period: payslip?.period || period,
  };
}

export function bankTransferRowValues(
  row: Record<BankTransferCode, string | number>,
): (string | number)[] {
  return BANK_TRANSFER_COLUMNS.map((c) => row[c.code] ?? '');
}

export function bankTransferCsvHeaders(): string[] {
  return BANK_TRANSFER_COLUMNS.map((c) => c.headerEn);
}
