/**
 * Egyptian Tax Authority e-Salary column map (نموذج القطاع الخاص).
 * Codes match e-salary.xlsx row 2. Unmapped money fields stay blank/0.
 */

import type {
  Compensation,
  InsuranceStatus,
  Nationality,
  PayrollSettings,
  Payslip,
  TaxTreatment,
  Tenant,
  UserData,
} from '../types';
import { insuranceSubscriptionWage, mergePayrollSettings, sumAllowances } from './payrollCalc';

export type ESalaryCode =
  | 'EI005' | 'EI010' | 'EI015' | 'EI020' | 'EI025' | 'EI026' | 'EI027' | 'EI030'
  | 'EI035' | 'EI040' | 'EI045' | 'EI055' | 'EI060' | 'EI065' | 'EI130' | 'EI070'
  | 'EI075' | 'EI080' | 'EI085' | 'EI090' | 'EI095' | 'EI100' | 'EI105' | 'EI110'
  | 'EI115' | 'EI120' | 'EI125'
  | 'DTE160' | 'DTE170' | 'DTE180' | 'DTE175' | 'DTE190' | 'DTE230' | 'DTE235'
  | 'DTE260' | 'DTE240' | 'DTE245' | 'DTE250' | 'DTE255' | 'DTE265' | 'DTE270'
  | 'DTE275' | 'DTE280' | 'DTE285' | 'DTE290' | 'DTE200' | 'DTE205' | 'DTE210'
  | 'DTE215' | 'DTE220' | 'DTE225' | 'DTE295'
  | 'DAE405' | 'DAE410' | 'DAE415' | 'DAE420' | 'DAE425' | 'DAE430' | 'DAE435'
  | 'DAE440' | 'DAE450' | 'DAE451' | 'DAE455' | 'DAE460' | 'DAE465' | 'DAE470'
  | 'DAE475'
  | 'TC505' | 'TC510' | 'TC515' | 'TC520' | 'TC525' | 'TC530' | 'END705'
  | 'TC535' | 'TC540' | 'TC545' | 'TC550' | 'TC555' | 'TC560' | 'TC565'
  | 'NAD610' | 'CLD825' | 'NAD615' | 'NAD620' | 'NAD625' | 'NAD630' | 'NAD635'
  | 'NAD640' | 'NAD645' | 'NAD650' | 'NAD655' | 'NAD660'
  | 'CLD805' | 'CLD810' | 'CLD815' | 'CLD820' | 'NAD665';

export const ESALARY_SHEET_NAME = 'نموذج القطاع الخاص';

/**
 * Unmapped money columns stay blank/0 until payroll grows:
 * DTE180/175 special allowances, DTE190 commissions, DTE230 profit share,
 * DTE235 service, DTE260 tips, DTE240 board, DTE245 leave cash, DTE250 EOS,
 * DTE255 special-law, DTE270 tax borne by employer, DTE275 SI borne,
 * DTE280/285/290 periodic, DTE200–225 in-kind benefits,
 * DAE410 UHI employee, DAE415–425 extra exemptions, DAE440–470 insurance funds,
 * NAD610 martyrs, CLD825 disability fund, NAD615–635 additions,
 * NAD645 unions, NAD655 life policy, NAD660 other deductions,
 * CLD810 UHI employer, CLD815 martyrs contribution, CLD820 stamps.
 */

export const ESALARY_COLUMNS: { code: ESalaryCode; header: string }[] = [
  { code: 'EI005', header: 'مسلسل' },
  { code: 'EI010', header: 'كود الموظف' },
  { code: 'EI015', header: 'اسم الموظف' },
  { code: 'EI020', header: 'الجنسية' },
  { code: 'EI025', header: 'الرقم القومي' },
  { code: 'EI026', header: 'رقم جواز السفر' },
  { code: 'EI027', header: 'رقم جواز السفر الجديد' },
  { code: 'EI030', header: 'رقم التليفون' },
  { code: 'EI035', header: 'حالة تصريح العمل لغير المصريين' },
  { code: 'EI040', header: 'رقم تصريح العمل' },
  { code: 'EI045', header: 'الوظيفة' },
  { code: 'EI055', header: 'اسم الجهة/الفرع' },
  { code: 'EI060', header: 'المعاملة الضريبية' },
  { code: 'EI065', header: 'رقم التسجيل الضريبي لجهة العمل الأصلية' },
  { code: 'EI130', header: 'مدة العمل' },
  { code: 'EI070', header: 'الحالة التأمينية' },
  { code: 'EI075', header: 'الرقم التأمينى' },
  { code: 'EI080', header: 'تاريخ الالتحاق بالتأمينات' },
  { code: 'EI085', header: 'قسط مدة سابقة' },
  { code: 'EI090', header: 'تاريخ نهاية الخدمة' },
  { code: 'EI095', header: 'تاريخ انتهاء الاشتراك من التأمينات الاجتماعية' },
  { code: 'EI100', header: 'الأجر الشامل' },
  { code: 'EI105', header: 'بدلات غير خاضعة تأمينيأ' },
  { code: 'EI110', header: 'الأجر التأميني' },
  { code: 'EI115', header: 'حالة التأمين  الصحي الشامل' },
  { code: 'EI120', header: 'عدد الزوجات الغير عاملات (التأمين الصحي الشامل)' },
  { code: 'EI125', header: 'عدد المعالين (التأمين الصحي  الشامل)' },
  { code: 'DTE160', header: 'المرتب الأساسي' },
  { code: 'DTE170', header: 'مكافات وحوافز/أجر إضافي/منح' },
  { code: 'DTE180', header: 'علاوات خاصة معفاة' },
  { code: 'DTE175', header: 'علاوات خاصة خاضعة' },
  { code: 'DTE190', header: 'عمولات' },
  { code: 'DTE230', header: 'نصيب العامل في الأرباح' },
  { code: 'DTE235', header: 'مقابل الخدمة' },
  { code: 'DTE260', header: 'البقشيش' },
  { code: 'DTE240', header: 'مرتبات ومكافات رؤساء اعضاء مجلس الادارة (مقابل العمل الإداري)' },
  { code: 'DTE245', header: 'المقابل النقدى لرصيد الاجازات أثناء الخدمة' },
  { code: 'DTE250', header: 'مكافأة نهاية الخدمة الخاضعة' },
  { code: 'DTE255', header: 'مبالغ منصرفة بقوانين خاصة (الجزء المعفي منها)' },
  { code: 'DTE265', header: 'إضافات وبدلات اخرى خاضعة' },
  { code: 'DTE270', header: 'ما تحملته المنشاة من ضريبة مرتبات' },
  { code: 'DTE275', header: 'ما تحملته المنشأه من حصة العامل في التأمينات الاجتماعيه' },
  { code: 'DTE280', header: 'مبالغ خاضعة منصرفة بصورة ربع سنوية' },
  { code: 'DTE285', header: 'مبالغ خاضعة منصرفة بصورة نصف سنوية' },
  { code: 'DTE290', header: 'مبالغ خاضعة منصرفة بصورة  سنوية' },
  { code: 'DTE200', header: 'مزايا: السيارات' },
  { code: 'DTE205', header: 'مزايا: الهواتف المحمولة' },
  { code: 'DTE210', header: 'مزايا: قروض وسلف' },
  { code: 'DTE215', header: 'مزايا: التأمين على الحياة (حصة صاحب العمل)' },
  { code: 'DTE220', header: 'مزايا: اسهم الشركة داخل مصر او خارج مصر' },
  { code: 'DTE225', header: 'مزايا أخرى' },
  { code: 'DTE295', header: 'اجمالى الاستحقاقات' },
  { code: 'DAE405', header: 'حصة العامل فى التأمينات الإجتماعية  والمعاشات' },
  { code: 'DAE410', header: 'حصة العامل المستقطعة في التأمين الصحي الشامل' },
  { code: 'DAE415', header: 'مبالغ معفاة  بقوانين خاصة' },
  { code: 'DAE420', header: 'علاوات خاصة معفاة' },
  { code: 'DAE425', header: 'العلاوة الاجتماعية/الإضافية لجهات حكومية و ق.ع. وغير خاضع للخدمة المدنية' },
  { code: 'DAE430', header: 'الاعفاء الشخصى' },
  { code: 'DAE435', header: 'اقساط (مدة سابقة/اعارة/اعتبارية)' },
  { code: 'DAE440', header: 'نصيب العامل في الأرباح' },
  { code: 'DAE450', header: 'اشتراكات العاملين فى صناديق التامين التى تنشاء طبقا لاحكام ق 54 لسنة 75' },
  { code: 'DAE451', header: 'اشتراكات العاملين فى صناديق التامين التى تنشأ طبقا لاحكام ق 155 لسنة 2024' },
  { code: 'DAE455', header: 'أقساط التأمين على حياة الممول لمصلحتة ومصلحةزوجته وأولاده القصر' },
  { code: 'DAE460', header: 'أقساط التأمين الصحي' },
  { code: 'DAE465', header: 'أقساط تأمين لإستحقاق معاش' },
  { code: 'DAE470', header: 'إجمالي اشتراكات صناديق التأمين' },
  { code: 'DAE475', header: 'اجمالى الاستقطاعات' },
  { code: 'TC505', header: 'صافى الدخل (وعاء الفتره)' },
  { code: 'TC510', header: 'الوعاء السنوى' },
  { code: 'TC515', header: 'الضريبة  المستحقة عن الفترة للعمالة الاصلية' },
  { code: 'TC520', header: 'الضريبة  المستحقة عن الفترة للعمالة المدرجه بنموذج 3 مرتبات' },
  { code: 'TC525', header: 'الضريبة المستحقة عن الفترة للعمالة المدرجه بنموذج 2 مرتبات' },
  { code: 'TC530', header: 'اجمالى الضريبة المستحقة عن جميع انواع العمالة' },
  { code: 'END705', header: 'الضريبة المحتسبة عن الفترة' },
  { code: 'TC535', header: 'الضريبة المحتسبة عن الفترات السابقة للمعاملات الضريبية 1 و4 و5 و6 و7' },
  { code: 'TC540', header: 'الضريبة المحتسبة عن الفترة للمعاملات الضريبية 1 و4 و5 و6 و7' },
  { code: 'TC545', header: 'الضريبة المحتسبة عن الفترات السابقة للمعاملة ضريبية 2' },
  { code: 'TC550', header: 'الضريبة المحتسبة عن الفترة للمعاملة ضريبية 2' },
  { code: 'TC555', header: 'الضريبة المحتسبة عن الفترات السابقة للمعاملة ضريبية 3' },
  { code: 'TC560', header: 'الضريبة المحتسبة عن الفترة للمعاملة ضريبية 3' },
  { code: 'TC565', header: 'صافي الأجر النهائي' },
  { code: 'NAD610', header: 'مشاركه اجتماعيه استقطاع لصندوق الشهداء وما فى حكمها' },
  { code: 'CLD825', header: 'دعم ذوي الهمم (قانون 200 لسنة 2020)' },
  { code: 'NAD615', header: 'اضافات: قيمة السلفة/قروض' },
  { code: 'NAD620', header: 'اضافات: قيمة مكافأة نهاية الخدمة الغير خاضعة' },
  { code: 'NAD625', header: 'اضافات: قيمة رصيد الأجازات الغير خاضعة' },
  { code: 'NAD630', header: 'اضافات أخرى' },
  { code: 'NAD635', header: 'استقطاعات: نفقة' },
  { code: 'NAD640', header: 'استقطاعات: قيمة قسط السلفة/القرض' },
  { code: 'NAD645', header: 'استقطاعات: اشتراكات نقابات/أندية' },
  { code: 'NAD650', header: 'استقطاعات: جزاءات' },
  { code: 'NAD655', header: 'استقطاعات: قيمة قسط بوليصة التأمين على الحياة' },
  { code: 'NAD660', header: 'استقطاعات أخرى' },
  { code: 'CLD805', header: 'حصة الشركة في التأمينات الاجتماعية' },
  { code: 'CLD810', header: 'حصة الشركة في التأمين الصحي الشامل' },
  { code: 'CLD815', header: 'المساهمة فى صندوق الشهداء' },
  { code: 'CLD820', header: 'الدمغات' },
  { code: 'NAD665', header: 'المبالغ المحولة فعلياً' },
];

function lineAmount(payslip: Payslip | undefined, code: string): number {
  if (!payslip) return 0;
  const fromEarn = payslip.earnings?.find((l) => l.code === code)?.amount;
  if (fromEarn != null) return Number(fromEarn) || 0;
  const fromDed = payslip.deductions?.find((l) => l.code === code)?.amount;
  return Number(fromDed) || 0;
}

function nationalityLabel(n?: Nationality): string {
  return n === 'other' ? 'غير مصري' : 'مصري';
}

function taxTreatmentLabel(t?: TaxTreatment): string {
  switch (t) {
    case 'form2':
      return '2';
    case 'form3':
      return '3';
    case 'other':
      return '4';
    default:
      return '1';
  }
}

function insuranceStatusLabel(s?: InsuranceStatus): string {
  switch (s) {
    case 'not_insured':
      return 'غير مؤمن عليه';
    case 'ended':
      return 'منتهي';
    default:
      return 'مؤمن عليه';
  }
}

function uhiLabel(status?: string): string {
  return status === 'enrolled' ? 'مشترك' : 'غير مشترك';
}

/** Whole months from hireDate to last day of YYYY-MM period. */
export function workDurationMonths(hireDate?: string, period?: string): number | '' {
  if (!hireDate || !/^\d{4}-\d{2}-\d{2}$/.test(hireDate) || !period) return '';
  const [hy, hm] = hireDate.split('-').map(Number);
  const [py, pm] = period.split('-').map(Number);
  if (!hy || !hm || !py || !pm) return '';
  const months = (py - hy) * 12 + (pm - hm) + 1;
  return months > 0 ? months : 0;
}

function money(n: number | undefined | null): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

export type ESalaryRowInput = {
  serial: number;
  user?: UserData;
  tenant?: Tenant;
  compensation?: Compensation;
  payslip?: Payslip;
  settings?: PayrollSettings;
};

export function mapPayslipToESalaryRow(
  input: ESalaryRowInput,
): Record<ESalaryCode, string | number> {
  const { serial, user, tenant, compensation, payslip } = input;
  const settings = mergePayrollSettings(input.settings);
  const basic = money(compensation?.basicSalary);
  const allowances = money(sumAllowances(compensation?.allowances));
  const overtime = money(payslip?.breakdown?.overtimePay ?? lineAmount(payslip, 'overtime'));
  const gross = money(payslip?.monthlyBaseEarnings ?? payslip?.grossPay);
  const empSi = money(payslip?.employeeInsurance);
  const erSi = money(payslip?.employerInsurance);
  const tax = money(payslip?.incomeTax);
  const taxable = money(payslip?.taxableIncome);
  const net = money(payslip?.netPay);
  const loans = money(payslip?.breakdown?.loanInstallments ?? lineAmount(payslip, 'loan'));
  const penalties = money(
    (payslip?.breakdown?.absenceDeductions || 0) +
      (payslip?.breakdown?.checkInPenalties || 0) +
      (payslip?.breakdown?.checkOutPenalties || 0),
  );
  const insWage = money(insuranceSubscriptionWage(basic, settings));
  const treatment = user?.taxTreatment || 'original';
  const taxOriginal = treatment === 'original' || treatment === 'other' ? tax : 0;
  const taxForm3 = treatment === 'form3' ? tax : 0;
  const taxForm2 = treatment === 'form2' ? tax : 0;

  const row: Record<ESalaryCode, string | number> = {} as Record<ESalaryCode, string | number>;
  for (const col of ESALARY_COLUMNS) row[col.code] = '';

  row.EI005 = serial;
  row.EI010 = user?.employeeId || '';
  row.EI015 = user?.fullName || payslip?.userName || '';
  row.EI020 = nationalityLabel(user?.nationality);
  row.EI025 = user?.nationalId || '';
  row.EI026 = user?.passportNumber || '';
  row.EI027 = user?.passportNumberNew || '';
  row.EI030 = user?.phone || '';
  row.EI035 = user?.nationality === 'other' ? user?.workPermitStatus || '' : '';
  row.EI040 = user?.nationality === 'other' ? user?.workPermitNumber || '' : '';
  row.EI045 = user?.jobTitle || '';
  row.EI055 = user?.branchName || tenant?.name || '';
  row.EI060 = taxTreatmentLabel(treatment);
  row.EI065 = tenant?.taxRegistrationNumber || '';
  row.EI130 = workDurationMonths(user?.hireDate, payslip?.period);
  row.EI070 = insuranceStatusLabel(user?.insuranceStatus);
  row.EI075 = user?.insuranceNumber || '';
  row.EI080 = user?.insuranceJoinDate || '';
  row.EI085 = user?.priorPeriodInstallment ?? '';
  row.EI090 = user?.serviceEndDate || '';
  row.EI095 = user?.insuranceUnsubscribeDate || '';
  row.EI100 = gross;
  row.EI105 = 0;
  row.EI110 = insWage;
  row.EI115 = uhiLabel(user?.uhiStatus);
  row.EI120 = user?.uhiNonWorkingSpouses ?? 0;
  row.EI125 = user?.uhiDependents ?? 0;

  row.DTE160 = basic;
  row.DTE170 = overtime;
  row.DTE265 = allowances;
  row.DTE295 = gross;

  row.DAE405 = empSi;
  row.DAE430 = money(settings.monthlyPersonalExemption);
  row.DAE435 = user?.priorPeriodInstallment ?? 0;
  row.DAE475 = money(payslip?.totalDeductions);

  row.TC505 = taxable;
  row.TC510 = money(taxable * 12);
  row.TC515 = taxOriginal;
  row.TC520 = taxForm3;
  row.TC525 = taxForm2;
  row.TC530 = tax;
  row.END705 = tax;
  row.TC540 = treatment === 'original' || treatment === 'other' ? tax : 0;
  row.TC550 = taxForm2;
  row.TC560 = taxForm3;
  row.TC565 = net;

  row.NAD640 = loans;
  row.NAD650 = penalties;
  row.CLD805 = erSi;
  /** NAD665 المبالغ المحولة فعلياً — same net as bank-transfer export */
  row.NAD665 = net;

  return row;
}

export function eSalaryRowValues(row: Record<ESalaryCode, string | number>): (string | number)[] {
  return ESALARY_COLUMNS.map((c) => row[c.code] ?? '');
}
