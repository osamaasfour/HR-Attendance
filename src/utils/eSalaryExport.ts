import * as XLSX from 'xlsx';
import {
  ESALARY_COLUMNS,
  ESALARY_SHEET_NAME,
  eSalaryRowValues,
  mapPayslipToESalaryRow,
} from './eSalaryMap';
import {
  BANK_TRANSFER_COLUMNS,
  BANK_TRANSFER_SHEET_NAME,
  bankTransferRowValues,
  mapPayslipToBankTransferRow,
} from './bankTransferMap';
import type { Compensation, PayrollSettings, Payslip, Tenant, UserData } from '../types';
import { downloadXlsx } from './csv';

export async function exportESalaryXlsx(opts: {
  period: string;
  payslips: Payslip[];
  users: UserData[];
  compensations: Record<string, Compensation>;
  tenant: Tenant;
  settings: PayrollSettings;
}): Promise<number> {
  const { period, payslips, users, compensations, tenant, settings } = opts;
  const aoa: (string | number)[][] = [
    ESALARY_COLUMNS.map((c) => c.header),
    ESALARY_COLUMNS.map((c) => c.code),
  ];

  payslips.forEach((payslip, idx) => {
    const user = users.find((u) => u.uid === payslip.userId);
    const row = mapPayslipToESalaryRow({
      serial: idx + 1,
      user,
      tenant,
      compensation: compensations[payslip.userId],
      payslip,
      settings,
    });
    aoa.push(eSalaryRowValues(row));
  });

  const bankAoa: (string | number)[][] = [
    BANK_TRANSFER_COLUMNS.map((c) => c.header),
    BANK_TRANSFER_COLUMNS.map((c) => c.headerEn),
  ];
  payslips.forEach((payslip, idx) => {
    const user = users.find((u) => u.uid === payslip.userId);
    bankAoa.push(
      bankTransferRowValues(
        mapPayslipToBankTransferRow({
          serial: idx + 1,
          user,
          compensation: compensations[payslip.userId],
          payslip,
          tenant,
          period,
        }),
      ),
    );
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const bankWs = XLSX.utils.aoa_to_sheet(bankAoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, ESALARY_SHEET_NAME);
  XLSX.utils.book_append_sheet(wb, bankWs, BANK_TRANSFER_SHEET_NAME);
  const base64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' }) as string;
  await downloadXlsx(`e-salary-${period}.xlsx`, base64);
  return payslips.length;
}
