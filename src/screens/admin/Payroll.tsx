/**
 * Admin Payroll — Egyptian formula settings, compensation, loans, generate payslips
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Switch,
  Modal,
  Pressable,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  db,
  collection,
  getDocs,
  getDoc,
  doc,
  setDoc,
  addDoc,
  query,
  where,
  Timestamp,
} from '../../services/firebase';
import { useAppAlert } from '../../context/AlertContext';
import { useAuth } from '../../context/AuthContext';
import { useCompany } from '../../context/CompanyContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  calculatePayslip,
  insuranceSubscriptionWage,
  mergePayrollSettings,
  resolveInsuranceBracket,
  sumAllowances,
} from '../../utils/payrollCalc';
import type {
  AttendanceRecord,
  Compensation,
  HourlyRateBase,
  HrRequest,
  InsuranceBracket,
  Loan,
  PenaltyTierRow,
  PayrollSettings,
  Payslip,
  SalaryAllowances,
  TaxBracket,
  UserData,
  WorkShift,
} from '../../types';
import { resolveWorkSchedule, workShiftToSchedule } from '../../types';
import type { TranslationKey } from '../../i18n/translations';
import { toCsv, downloadCsv } from '../../utils/csv';
import { exportESalaryXlsx } from '../../utils/eSalaryExport';
import {
  bankTransferCsvHeaders,
  bankTransferRowValues,
  hasBankAccount,
  mapPayslipToBankTransferRow,
} from '../../utils/bankTransferMap';
import { payrollSettingsDocId } from '../../utils/sendEmail';
import { fetchHolidays, holidayDateSet } from '../../utils/holidays';
import { colors } from '../../constants/colors';

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function NumField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number | string;
  onChange: (n: number) => void;
  hint?: string;
}) {
  return (
    <View className="mb-2">
      <Text className="text-xs text-surface-400 mb-1">{label}</Text>
      <TextInput
        className="border border-surface-200 rounded-xl px-3 h-10"
        keyboardType="decimal-pad"
        value={String(value ?? '')}
        onChangeText={(v) => onChange(Number(v) || 0)}
      />
      {!!hint && <Text className="text-[10px] text-surface-400 mt-0.5">{hint}</Text>}
    </View>
  );
}

export default function AdminPayrollScreen() {
  const navigation = useNavigation<any>();
  const { showAlert } = useAppAlert();
  const { user } = useAuth();
  const { company, tenant } = useCompany();
  const { t } = useLanguage();
  const [period, setPeriod] = useState(currentPeriod());
  const [settings, setSettings] = useState<PayrollSettings>(mergePayrollSettings(null));
  const [users, setUsers] = useState<UserData[]>([]);
  const [compensations, setCompensations] = useState<Record<string, Compensation>>({});
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(false);
  const [salaryUserId, setSalaryUserId] = useState('');
  const [salaryAmount, setSalaryAmount] = useState('');
  const [allowHousing, setAllowHousing] = useState('');
  const [allowTransport, setAllowTransport] = useState('');
  const [allowMeal, setAllowMeal] = useState('');
  const [allowNature, setAllowNature] = useState('');
  const [allowOther, setAllowOther] = useState('');
  const [salaryPanelOpen, setSalaryPanelOpen] = useState(false);
  const [salarySearch, setSalarySearch] = useState('');
  const [filterMissingSalary, setFilterMissingSalary] = useState(false);
  const [loanUserId, setLoanUserId] = useState('');
  const [loanInstallment, setLoanInstallment] = useState('');
  const [loanPrincipal, setLoanPrincipal] = useState('');
  const [section, setSection] = useState<
    'run' | 'overtime' | 'penalties' | 'insurance' | 'tax' | 'comp'
  >('run');

  const tenantId = user?.tenantId || company.id || 'default';
  const currency = company.currencyCode || 'EGP';

  const salaryKpis = useMemo(() => {
    let totalBasic = 0;
    let totalAllowances = 0;
    let missing = 0;
    users.forEach((u) => {
      const sal = compensations[u.uid]?.basicSalary;
      const allow = sumAllowances(compensations[u.uid]?.allowances);
      if (sal != null && sal > 0) totalBasic += sal;
      else missing += 1;
      totalAllowances += allow;
    });
    return {
      headcount: users.length,
      totalBasic,
      totalAllowances,
      totalGross: totalBasic + totalAllowances,
      missing,
    };
  }, [users, compensations]);

  const missingBankOnPayslips = useMemo(
    () =>
      payslips.filter(
        (p) => !hasBankAccount(users.find((u) => u.uid === p.userId), compensations[p.userId]),
      ).length,
    [payslips, users, compensations],
  );

  const rosterUsers = useMemo(() => {
    const q = salarySearch.trim().toLowerCase();
    return users
      .filter((u) => {
        const sal = compensations[u.uid]?.basicSalary;
        const isMissing = !(sal != null && sal > 0);
        if (filterMissingSalary && !isMissing) return false;
        if (!q) return true;
        return (
          (u.fullName || '').toLowerCase().includes(q) ||
          (u.employeeId || '').toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [users, compensations, salarySearch, filterMissingSalary]);

  const selectedSalaryUser = useMemo(
    () => users.find((u) => u.uid === salaryUserId) || null,
    [users, salaryUserId],
  );

  const salaryPreview = useMemo(() => {
    const basic = Number(salaryAmount) || 0;
    const live = mergePayrollSettings(settings);
    const bracket = resolveInsuranceBracket(basic, live.insuranceBrackets || []);
    const insWage = insuranceSubscriptionWage(basic, live);
    return { bracket, insWage, basic };
  }, [salaryAmount, settings]);

  const formatCompDate = (comp?: Compensation) => {
    const ts = comp?.updatedAt as Timestamp | undefined;
    if (!ts?.toDate) return '—';
    try {
      return ts.toDate().toLocaleDateString();
    } catch {
      return '—';
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const tid = user?.tenantId || company.id || 'default';
      const settingsId = payrollSettingsDocId(tid);
      const settingsSnap = await getDoc(doc(db, 'payrollSettings', settingsId));
      if (settingsSnap.exists()) {
        setSettings(mergePayrollSettings(settingsSnap.data() as PayrollSettings));
      } else {
        const legacy = await getDoc(doc(db, 'payrollSettings', 'default'));
        if (legacy.exists()) {
          setSettings(mergePayrollSettings(legacy.data() as PayrollSettings));
        }
      }
      const usersSnap = await getDocs(collection(db, 'users'));
      setUsers(
        usersSnap.docs
          .map((d) => ({ ...(d.data() as UserData), uid: d.id }))
          .filter(
            (u) =>
              u.active !== false &&
              u.role !== 'admin' &&
              (u.tenantId || 'default') === tid,
          ),
      );
      const compSnap = await getDocs(collection(db, 'compensation'));
      const compMap: Record<string, Compensation> = {};
      compSnap.docs.forEach((d) => {
        const data = d.data() as Compensation;
        if ((data.tenantId || 'default') === tid || !data.tenantId) {
          compMap[d.id] = { ...data, userId: data.userId || d.id };
        }
      });
      setCompensations(compMap);
      const slipSnap = await getDocs(
        query(collection(db, 'payslips'), where('period', '==', period)),
      );
      setPayslips(
        slipSnap.docs
          .map((d) => ({ ...(d.data() as Payslip), id: d.id }))
          .filter((p: any) => (p.tenantId || 'default') === tid),
      );
    } catch (e) {
      console.error('[Payroll] load', e);
    } finally {
      setLoading(false);
    }
  }, [period, user?.tenantId, company.id]);

  useEffect(() => {
    load();
  }, [load]);

  const openSalaryPanel = (uid: string) => {
    setSalaryUserId(uid);
    const existing = compensations[uid];
    setSalaryAmount(
      existing?.basicSalary != null && existing.basicSalary > 0
        ? String(existing.basicSalary)
        : '',
    );
    const a = existing?.allowances;
    setAllowHousing(a?.housing ? String(a.housing) : '');
    setAllowTransport(a?.transportation ? String(a.transportation) : '');
    setAllowMeal(a?.meal ? String(a.meal) : '');
    setAllowNature(a?.natureOfWork ? String(a.natureOfWork) : '');
    setAllowOther(a?.other ? String(a.other) : '');
    setSalaryPanelOpen(true);
  };

  const closeSalaryPanel = () => {
    setSalaryPanelOpen(false);
  };

  const buildAllowancesPayload = (): SalaryAllowances | undefined => {
    const housing = Number(allowHousing) || 0;
    const transportation = Number(allowTransport) || 0;
    const meal = Number(allowMeal) || 0;
    const natureOfWork = Number(allowNature) || 0;
    const other = Number(allowOther) || 0;
    if (housing + transportation + meal + natureOfWork + other <= 0) {
      return undefined;
    }
    const out: SalaryAllowances = {};
    if (housing > 0) out.housing = housing;
    if (transportation > 0) out.transportation = transportation;
    if (meal > 0) out.meal = meal;
    if (natureOfWork > 0) out.natureOfWork = natureOfWork;
    if (other > 0) out.other = other;
    return out;
  };

  const saveSettings = async () => {
    const next = mergePayrollSettings(settings);
    const tid = tenantId;
    const settingsId = payrollSettingsDocId(tid);
    await setDoc(doc(db, 'payrollSettings', settingsId), {
      ...next,
      tenantId: tid,
      updatedAt: Timestamp.now(),
    });
    setSettings(next);
    showAlert(t('success'), t('payrollSaved'));
  };

  const saveSalary = async () => {
    if (!salaryUserId || !salaryAmount) {
      showAlert(t('missing'), t('selectEmployeeSalary'));
      return;
    }
    const basicSalary = Number(salaryAmount);
    if (!Number.isFinite(basicSalary) || basicSalary < 0) {
      showAlert(t('missing'), t('selectEmployeeSalary'));
      return;
    }
    const allowances = buildAllowancesPayload();
    const payload: Compensation = {
      userId: salaryUserId,
      basicSalary,
      ...(allowances ? { allowances } : {}),
      currency,
      tenantId,
      updatedAt: Timestamp.now(),
    };
    const existing = compensations[salaryUserId];
    if (existing?.bankName) payload.bankName = existing.bankName;
    if (existing?.accountHolder) payload.accountHolder = existing.accountHolder;
    if (existing?.accountNumber) payload.accountNumber = existing.accountNumber;
    if (existing?.iban) payload.iban = existing.iban;
    await setDoc(doc(db, 'compensation', salaryUserId), payload);
    setCompensations((prev) => ({ ...prev, [salaryUserId]: payload }));
    setSalaryPanelOpen(false);
    showAlert(t('success'), t('compensationSaved', { currency }));
  };

  const exportBankTransferCsv = async () => {
    if (payslips.length === 0) {
      showAlert(t('warning'), t('eSalaryExportEmpty'));
      return;
    }
    try {
      const missing = payslips.filter(
        (p) => !hasBankAccount(users.find((e) => e.uid === p.userId), compensations[p.userId]),
      ).length;
      const rows = payslips.map((p, idx) =>
        bankTransferRowValues(
          mapPayslipToBankTransferRow({
            serial: idx + 1,
            user: users.find((e) => e.uid === p.userId),
            compensation: compensations[p.userId],
            payslip: p,
            tenant,
            period,
          }),
        ),
      );
      const csv = toCsv(bankTransferCsvHeaders(), rows);
      await downloadCsv(`bank-transfer-${period}.csv`, csv);
      const done = t('bankExportDone', { count: rows.length, period });
      showAlert(
        t('success'),
        missing > 0 ? `${done}\n${t('bankExportMissingAccounts', { count: missing })}` : done,
      );
    } catch (e: any) {
      showAlert(t('error'), e?.message || t('actionFailed'));
    }
  };

  const exportESalary = async () => {
    if (payslips.length === 0) {
      showAlert(t('warning'), t('eSalaryExportEmpty'));
      return;
    }
    try {
      const count = await exportESalaryXlsx({
        period,
        payslips,
        users,
        compensations,
        tenant,
        settings,
      });
      showAlert(t('success'), t('eSalaryExportDone', { count, period }));
    } catch (e: any) {
      showAlert(t('error'), e?.message || t('actionFailed'));
    }
  };

  const addLoan = async () => {
    if (!loanUserId || !loanInstallment) {
      showAlert(t('missing'), t('selectEmployeeLoan'));
      return;
    }
    const u = users.find((x) => x.uid === loanUserId);
    await addDoc(collection(db, 'loans'), {
      userId: loanUserId,
      userName: u?.fullName || '',
      principal: Number(loanPrincipal) || Number(loanInstallment) * 12,
      installment: Number(loanInstallment),
      remaining: Number(loanPrincipal) || Number(loanInstallment) * 12,
      active: true,
      tenantId,
      createdAt: Timestamp.now(),
    });
    showAlert(t('success'), t('loanCreated'));
    setLoanInstallment('');
    setLoanPrincipal('');
  };

  const generate = async (publish: boolean) => {
    setLoading(true);
    try {
      const [y, m] = period.split('-').map(Number);
      const start = `${period}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const end = `${period}-${String(lastDay).padStart(2, '0')}`;
      const liveSettings = mergePayrollSettings(settings);
      const tid = tenantId;

      const attSnap = await getDocs(collection(db, 'attendance'));
      const allAtt = attSnap.docs.map((d) => ({
        ...(d.data() as AttendanceRecord),
        id: d.id,
      }));
      const reqSnap = await getDocs(collection(db, 'hrRequests'));
      const allReq = reqSnap.docs.map((d) => ({ ...(d.data() as HrRequest), id: d.id }));
      const loanSnap = await getDocs(collection(db, 'loans'));
      const allLoans = loanSnap.docs.map((d) => ({ ...(d.data() as Loan), id: d.id }));
      const compSnap = await getDocs(collection(db, 'compensation'));
      const comps = new Map(compSnap.docs.map((d) => [d.id, d.data() as Compensation]));
      const shiftSnap = await getDocs(collection(db, 'workShifts'));
      const shiftsById = new Map(
        shiftSnap.docs
          .map((d) => ({ ...(d.data() as WorkShift), id: d.id }))
          .filter((s) => (s.tenantId || 'default') === tid && s.active !== false)
          .map((s) => [s.id, s]),
      );
      const defaultOffDays = resolveWorkSchedule(tenant.workSchedule).weeklyOffDays;
      const holidayList = await fetchHolidays(tid);
      const holidayDates = holidayDateSet(holidayList, start, end);

      const missingSalary = users.filter(
        (u) => !comps.get(u.uid)?.basicSalary || (comps.get(u.uid)?.basicSalary || 0) <= 0,
      );
      if (missingSalary.length > 0) {
        showAlert(
          t('warning'),
          t('payrollMissingSalaries', {
            count: missingSalary.length,
            names: missingSalary
              .slice(0, 3)
              .map((u) => u.fullName)
              .join(', '),
          }),
        );
      }

      const existing = await getDocs(
        query(collection(db, 'payslips'), where('period', '==', period)),
      );

      let count = 0;
      for (const u of users) {
        const userShift = u.workShiftId ? shiftsById.get(u.workShiftId) : undefined;
        const weeklyOffDays = userShift
          ? workShiftToSchedule(userShift).weeklyOffDays
          : defaultOffDays;
        const calc = calculatePayslip({
          userId: u.uid,
          userName: u.fullName,
          employeeId: u.employeeId,
          period,
          compensation: comps.get(u.uid) || null,
          settings: liveSettings,
          attendance: allAtt.filter(
            (a) => a.userId === u.uid && a.date >= start && a.date <= end,
          ),
          requests: allReq.filter((r) => r.userId === u.uid),
          loans: allLoans.filter((l) => l.userId === u.uid && l.active),
          weeklyOffDays,
          holidayDates,
        });

        const existingForUser = existing.docs.find((d) => d.data().userId === u.uid);
        const payload: Omit<Payslip, 'id'> = {
          userId: u.uid,
          userName: u.fullName,
          employeeId: u.employeeId,
          period,
          tenantId: tid,
          earnings: calc.earnings,
          deductions: calc.deductions,
          monthlyBaseEarnings: calc.monthlyBaseEarnings,
          totalReductions: calc.totalReductions,
          adjustedGross: calc.adjustedGross,
          taxableIncome: calc.taxableIncome,
          employeeInsurance: calc.employeeInsurance,
          employerInsurance: calc.employerInsurance,
          incomeTax: calc.incomeTax,
          breakdown: calc.breakdown,
          grossPay: calc.grossPay,
          totalDeductions: calc.totalDeductions,
          netPay: calc.netPay,
          ratesSnapshot: liveSettings,
          published: publish,
          createdAt: Timestamp.now(),
        };
        if (existingForUser) {
          await setDoc(existingForUser.ref, { ...payload, id: existingForUser.id });
        } else {
          const ref = doc(collection(db, 'payslips'));
          await setDoc(ref, { ...payload, id: ref.id });
        }
        count += 1;
      }

      await setDoc(doc(db, 'payrollRuns', period), {
        period,
        status: publish ? 'published' : 'draft',
        tenantId: tid,
        generatedAt: Timestamp.now(),
        payslipCount: count,
      });

      showAlert(
        publish ? t('published') : t('draftReady'),
        t('payslipsGenerated', { count, period }),
      );
      await load();
    } catch (e: any) {
      showAlert(t('error'), e?.message || t('payrollGenerateFailed'));
    } finally {
      setLoading(false);
    }
  };

  const updateTier = (
    key: 'checkInTiers' | 'checkOutTiers',
    index: number,
    patch: Partial<PenaltyTierRow>,
  ) => {
    setSettings((s) => {
      const rows = [...s[key]];
      rows[index] = { ...rows[index], ...patch };
      return { ...s, [key]: rows };
    });
  };

  const addTier = (key: 'checkInTiers' | 'checkOutTiers') => {
    setSettings((s) => ({
      ...s,
      [key]: [
        ...s[key],
        {
          id: newId(key === 'checkInTiers' ? 'ci' : 'co'),
          minMinutes: 0,
          maxMinutes: 15,
          deductionMinutes: 0,
          deductionDays: 0,
        },
      ],
    }));
  };

  const removeTier = (key: 'checkInTiers' | 'checkOutTiers', index: number) => {
    setSettings((s) => ({
      ...s,
      [key]: s[key].filter((_, i) => i !== index),
    }));
  };

  const updateBracket = (index: number, patch: Partial<TaxBracket>) => {
    setSettings((s) => {
      const taxBrackets = [...s.taxBrackets];
      taxBrackets[index] = { ...taxBrackets[index], ...patch };
      return { ...s, taxBrackets };
    });
  };

  const updateInsuranceBracket = (index: number, patch: Partial<InsuranceBracket>) => {
    setSettings((s) => {
      const insuranceBrackets = [...(s.insuranceBrackets || [])];
      insuranceBrackets[index] = { ...insuranceBrackets[index], ...patch };
      return { ...s, insuranceBrackets };
    });
  };

  const tabs: { id: typeof section; labelKey: TranslationKey }[] = [
    { id: 'run', labelKey: 'payrollRun' },
    { id: 'overtime', labelKey: 'overtime' },
    { id: 'penalties', labelKey: 'penalties' },
    { id: 'insurance', labelKey: 'insurance' },
    { id: 'tax', labelKey: 'taxAndLoans' },
    { id: 'comp', labelKey: 'payAndLoans' },
  ];

  return (
    <ScrollView
      className="flex-1 bg-surface-50"
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      contentContainerStyle={{ paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="px-6 pt-12 pb-4 bg-white border-b border-surface-100">
        <Text className="text-2xl font-bold text-surface-800">{t('payrollTitle')}</Text>
        <Text className="text-surface-400 text-sm mt-1">{t('payrollSubtitle')}</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="px-4 py-3"
        contentContainerStyle={{ paddingRight: 24 }}
      >
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            onPress={() => setSection(tab.id)}
            className={`px-3 py-2 rounded-lg mr-2 ${
              section === tab.id ? 'bg-primary-500' : 'bg-white border border-surface-200'
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                section === tab.id ? 'text-white' : 'text-surface-600'
              }`}
            >
              {t(tab.labelKey)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {section === 'run' && (
        <>
          <View className="mx-4 mb-4 bg-white rounded-2xl p-4 border border-surface-100">
            <Text className="font-semibold text-surface-800 mb-2">{t('periodLabel')}</Text>
            <TextInput
              className="border border-surface-200 rounded-xl px-3 h-11 mb-3"
              value={period}
              onChangeText={setPeriod}
              placeholder="2026-08"
            />
            <View className="flex-row">
              <TouchableOpacity
                onPress={() => generate(false)}
                className="flex-1 bg-primary-500 rounded-xl h-11 items-center justify-center mr-2"
              >
                <Text className="text-white font-semibold">{t('generateDraft')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => generate(true)}
                className="flex-1 bg-accent-500 rounded-xl h-11 items-center justify-center"
              >
                <Text className="text-white font-semibold">{t('publishPayslips')}</Text>
              </TouchableOpacity>
            </View>
            <Text className="text-[10px] text-surface-400 mt-2">{t('payrollFormulaHint')}</Text>
            <TouchableOpacity
              onPress={exportBankTransferCsv}
              className="mt-3 bg-surface-800 rounded-xl h-11 items-center justify-center"
            >
              <Text className="text-white font-semibold">{t('exportBankTransferCsv')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={exportESalary}
              className="mt-2 bg-primary-600 rounded-xl h-11 items-center justify-center"
            >
              <Text className="text-white font-semibold">{t('exportESalary')}</Text>
            </TouchableOpacity>
            <Text className="text-[10px] text-surface-400 mt-2">{t('exportBankTransferHint')}</Text>
            {payslips.length > 0 && missingBankOnPayslips > 0 ? (
              <Text className="text-[10px] text-warning-600 mt-1">
                {t('bankExportMissingAccounts', { count: missingBankOnPayslips })}
              </Text>
            ) : null}
          </View>

          <View className="mx-4 mb-4">
            <Text className="font-semibold text-surface-800 mb-2">
              {t('payslipsForPeriod', { period, count: payslips.length })}
            </Text>
            {payslips.map((p) => (
              <TouchableOpacity
                key={p.id}
                onPress={() => navigation.navigate('PayslipDetail', { payslip: p })}
                className="bg-white rounded-xl p-4 mb-2 border border-surface-100"
              >
                <View className="flex-row justify-between">
                  <Text className="font-semibold text-surface-800">{p.userName}</Text>
                  <Text className="text-primary-500 font-semibold">{p.netPay.toFixed(2)}</Text>
                </View>
                <Text className="text-surface-400 text-xs mt-1">
                  {p.published ? t('published') : t('draft')}
                  {p.adjustedGross != null
                    ? ` · ${t('adjGross')} ${p.adjustedGross.toFixed(2)}`
                    : ''}
                  {p.employerInsurance
                    ? ` · ${t('employerSi')} ${p.employerInsurance.toFixed(2)}`
                    : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {section === 'overtime' && (
        <View className="mx-4 mb-4 bg-white rounded-2xl p-4 border border-surface-100">
          <Text className="font-semibold text-surface-800 mb-1">{t('overtimeConfig')}</Text>
          <Text className="text-xs text-surface-400 mb-3">{t('overtimeConfigHint')}</Text>
          <NumField
            label={t('daytimeOtMultiplier')}
            value={settings.overtime.daytimeMultiplier}
            onChange={(n) =>
              setSettings((s) => ({ ...s, overtime: { ...s.overtime, daytimeMultiplier: n } }))
            }
            hint={t('defaultOtDay')}
          />
          <NumField
            label={t('nightOtMultiplier')}
            value={settings.overtime.nighttimeMultiplier}
            onChange={(n) =>
              setSettings((s) => ({
                ...s,
                overtime: { ...s.overtime, nighttimeMultiplier: n },
              }))
            }
            hint={t('defaultOtNight')}
          />
          <NumField
            label={t('shiftHours')}
            value={settings.overtime.shiftHours}
            onChange={(n) =>
              setSettings((s) => ({ ...s, overtime: { ...s.overtime, shiftHours: n } }))
            }
          />
          <NumField
            label={t('workingDaysMonth')}
            value={settings.workingDaysPerMonth}
            onChange={(n) => setSettings((s) => ({ ...s, workingDaysPerMonth: n }))}
          />
          <Text className="text-xs text-surface-400 mb-2">{t('hourlyRateBase')}</Text>
          {(
            [
              ['calendar_30_8', 'hourlyRateCalendar'],
              ['working_days_shift', 'hourlyRateWorkingDays'],
            ] as [HourlyRateBase, TranslationKey][]
          ).map(([id, labelKey]) => (
            <TouchableOpacity
              key={id}
              onPress={() =>
                setSettings((s) => ({
                  ...s,
                  overtime: { ...s.overtime, hourlyRateBase: id },
                }))
              }
              className={`px-3 py-3 rounded-xl mb-2 border ${
                settings.overtime.hourlyRateBase === id
                  ? 'bg-primary-50 border-primary-500'
                  : 'bg-surface-50 border-surface-200'
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  settings.overtime.hourlyRateBase === id
                    ? 'text-primary-600'
                    : 'text-surface-700'
                }`}
              >
                {t(labelKey)}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            onPress={saveSettings}
            className="bg-primary-500 rounded-xl h-11 items-center justify-center mt-2"
          >
            <Text className="text-white font-semibold">{t('saveOvertimeSettings')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {section === 'penalties' && (
        <View className="mx-4 mb-4">
          <View className="bg-white rounded-2xl p-4 border border-surface-100 mb-4">
            <Text className="font-semibold text-surface-800 mb-2">{t('absence')}</Text>
            <NumField
              label={t('unexcusedAbsenceMultiplier')}
              value={settings.absenceDayMultiplier}
              onChange={(n) => setSettings((s) => ({ ...s, absenceDayMultiplier: n }))}
              hint={t('absenceMultiplierHint')}
            />
            <NumField
              label={t('unpaidVacationMultiplier')}
              value={settings.unpaidVacationDayMultiplier}
              onChange={(n) => setSettings((s) => ({ ...s, unpaidVacationDayMultiplier: n }))}
            />
          </View>

          {(
            [
              ['checkInTiers', 'checkInOccurrence', 'checkInLateTiers'],
              ['checkOutTiers', 'checkOutOccurrence', 'checkOutEarlyTiers'],
            ] as const
          ).map(([tierKey, occKey, titleKey]) => (
            <View
              key={tierKey}
              className="bg-white rounded-2xl p-4 border border-surface-100 mb-4"
            >
              <Text className="font-semibold text-surface-800 mb-2">{t(titleKey)}</Text>
              <View className="flex-row mb-1">
                <Text className="flex-1 text-[10px] text-surface-400">{t('minLabel')}</Text>
                <Text className="flex-1 text-[10px] text-surface-400">{t('maxLabel')}</Text>
                <Text className="flex-1 text-[10px] text-surface-400">{t('dedMin')}</Text>
                <Text className="flex-1 text-[10px] text-surface-400">{t('dedDays')}</Text>
                <Text className="w-8" />
              </View>
              {settings[tierKey].map((row, idx) => (
                <View key={row.id} className="flex-row items-center mb-2">
                  {(['minMinutes', 'maxMinutes', 'deductionMinutes', 'deductionDays'] as const).map(
                    (field) => (
                      <TextInput
                        key={field}
                        className="flex-1 border border-surface-200 rounded-lg px-1 h-9 mr-1 text-xs"
                        keyboardType="decimal-pad"
                        value={String(row[field])}
                        onChangeText={(v) => updateTier(tierKey, idx, { [field]: Number(v) || 0 })}
                      />
                    ),
                  )}
                  <TouchableOpacity onPress={() => removeTier(tierKey, idx)} className="w-8">
                    <Text className="text-red-500 text-center font-bold">×</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                onPress={() => addTier(tierKey)}
                className="bg-surface-100 rounded-lg py-2 mb-3"
              >
                <Text className="text-center text-surface-600 text-xs font-semibold">
                  {t('addTier')}
                </Text>
              </TouchableOpacity>

              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-surface-700 text-sm font-medium">{t('occurrenceRule')}</Text>
                <Switch
                  value={settings[occKey].enabled}
                  onValueChange={(v) =>
                    setSettings((s) => ({
                      ...s,
                      [occKey]: { ...s[occKey], enabled: v },
                    }))
                  }
                  trackColor={{ false: '#E2E8F0', true: '#93C5FD' }}
                  thumbColor={settings[occKey].enabled ? colors.primary : colors.switchTrack}
                />
              </View>
              <NumField
                label={t('afterNEvents')}
                value={settings[occKey].afterCount}
                onChange={(n) =>
                  setSettings((s) => ({
                    ...s,
                    [occKey]: { ...s[occKey], afterCount: n },
                  }))
                }
                hint={t('occurrenceHint')}
              />
              <NumField
                label={t('occurrencePenaltyDays')}
                value={settings[occKey].penaltyDays}
                onChange={(n) =>
                  setSettings((s) => ({
                    ...s,
                    [occKey]: { ...s[occKey], penaltyDays: n },
                  }))
                }
              />
            </View>
          ))}

          <TouchableOpacity
            onPress={saveSettings}
            className="bg-primary-500 rounded-xl h-11 items-center justify-center mb-4"
          >
            <Text className="text-white font-semibold">{t('savePenaltySettings')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {section === 'insurance' && (
        <View className="mx-4 mb-4 bg-white rounded-2xl p-4 border border-surface-100">
          <Text className="font-semibold text-surface-800 mb-1">{t('socialInsuranceNosi')}</Text>
          <Text className="text-xs text-surface-400 mb-3">{t('socialInsuranceHint')}</Text>
          <NumField
            label={t('wageMin')}
            value={settings.socialInsurance.monthlyWageMin}
            onChange={(n) =>
              setSettings((s) => ({
                ...s,
                socialInsurance: { ...s.socialInsurance, monthlyWageMin: n },
              }))
            }
          />
          <NumField
            label={t('wageMax')}
            value={settings.socialInsurance.monthlyWageMax}
            onChange={(n) =>
              setSettings((s) => ({
                ...s,
                socialInsurance: { ...s.socialInsurance, monthlyWageMax: n },
              }))
            }
          />

          <Text className="font-semibold text-surface-800 mt-3 mb-1">
            {t('insuranceBracketsBasic')}
          </Text>
          <Text className="text-xs text-surface-400 mb-2">{t('insuranceBracketsHint')}</Text>
          <View className="flex-row mb-1">
            <Text className="flex-1 text-[10px] text-surface-400">{t('upToMonthlyBasic')}</Text>
            <Text className="w-16 text-[10px] text-surface-400">{t('employeeSharePct')}</Text>
            <Text className="w-16 text-[10px] text-surface-400 ml-1">{t('employerSharePct')}</Text>
            <Text className="w-8" />
          </View>
          {(settings.insuranceBrackets || []).map((b, idx) => (
            <View key={b.id} className="flex-row items-center mb-2">
              <TextInput
                className="flex-1 border border-surface-200 rounded-lg px-2 h-9 mr-1 text-xs"
                keyboardType="decimal-pad"
                value={String(b.upToMonthlyBasic)}
                onChangeText={(v) =>
                  updateInsuranceBracket(idx, { upToMonthlyBasic: Number(v) || 0 })
                }
              />
              <TextInput
                className="w-16 border border-surface-200 rounded-lg px-2 h-9 mr-1 text-xs"
                keyboardType="decimal-pad"
                value={String(b.employeeSharePct)}
                onChangeText={(v) =>
                  updateInsuranceBracket(idx, { employeeSharePct: Number(v) || 0 })
                }
              />
              <TextInput
                className="w-16 border border-surface-200 rounded-lg px-2 h-9 mr-1 text-xs"
                keyboardType="decimal-pad"
                value={String(b.employerSharePct)}
                onChangeText={(v) =>
                  updateInsuranceBracket(idx, { employerSharePct: Number(v) || 0 })
                }
              />
              <TouchableOpacity
                onPress={() =>
                  setSettings((s) => ({
                    ...s,
                    insuranceBrackets: (s.insuranceBrackets || []).filter((_, i) => i !== idx),
                  }))
                }
                className="w-8"
              >
                <Text className="text-red-500 text-center font-bold">×</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity
            onPress={() =>
              setSettings((s) => ({
                ...s,
                insuranceBrackets: [
                  ...(s.insuranceBrackets || []),
                  {
                    id: newId('ins'),
                    upToMonthlyBasic: 999999999,
                    employeeSharePct: 11,
                    employerSharePct: 18.75,
                  },
                ],
              }))
            }
            className="bg-surface-100 rounded-lg py-2 mb-3"
          >
            <Text className="text-center text-surface-600 text-xs font-semibold">
              {t('addInsuranceBracket')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={saveSettings}
            className="bg-primary-500 rounded-xl h-11 items-center justify-center mt-2"
          >
            <Text className="text-white font-semibold">{t('saveInsuranceSettings')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {section === 'tax' && (
        <View className="mx-4 mb-4">
          <View className="bg-white rounded-2xl p-4 border border-surface-100 mb-4">
            <Text className="font-semibold text-surface-800 mb-2">{t('personalExemption')}</Text>
            <NumField
              label={t('annualPersonalExemption')}
              value={settings.annualPersonalExemption}
              onChange={(n) =>
                setSettings((s) => ({
                  ...s,
                  annualPersonalExemption: n,
                  monthlyPersonalExemption: round2(n / 12),
                }))
              }
            />
            <NumField
              label={t('monthlyPersonalExemption')}
              value={settings.monthlyPersonalExemption}
              onChange={(n) => setSettings((s) => ({ ...s, monthlyPersonalExemption: n }))}
              hint={t('step4TaxHint')}
            />
          </View>

          <View className="bg-white rounded-2xl p-4 border border-surface-100 mb-4">
            <Text className="font-semibold text-surface-800 mb-2">{t('taxBracketsAnnual')}</Text>
            <Text className="text-xs text-surface-400 mb-2">{t('taxBracketsHint')}</Text>
            <View className="flex-row mb-1">
              <Text className="flex-1 text-[10px] text-surface-400">{t('upToAnnual')}</Text>
              <Text className="w-20 text-[10px] text-surface-400">{t('ratePct')}</Text>
              <Text className="w-8" />
            </View>
            {settings.taxBrackets.map((b, idx) => (
              <View key={b.id} className="flex-row items-center mb-2">
                <TextInput
                  className="flex-1 border border-surface-200 rounded-lg px-2 h-9 mr-2 text-xs"
                  keyboardType="decimal-pad"
                  value={String(b.upToAnnual)}
                  onChangeText={(v) => updateBracket(idx, { upToAnnual: Number(v) || 0 })}
                />
                <TextInput
                  className="w-20 border border-surface-200 rounded-lg px-2 h-9 mr-1 text-xs"
                  keyboardType="decimal-pad"
                  value={String(b.ratePct)}
                  onChangeText={(v) => updateBracket(idx, { ratePct: Number(v) || 0 })}
                />
                <TouchableOpacity
                  onPress={() =>
                    setSettings((s) => ({
                      ...s,
                      taxBrackets: s.taxBrackets.filter((_, i) => i !== idx),
                    }))
                  }
                  className="w-8"
                >
                  <Text className="text-red-500 text-center font-bold">×</Text>
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity
              onPress={() =>
                setSettings((s) => ({
                  ...s,
                  taxBrackets: [
                    ...s.taxBrackets,
                    { id: newId('tx'), upToAnnual: 999999999, ratePct: 0 },
                  ],
                }))
              }
              className="bg-surface-100 rounded-lg py-2 mb-2"
            >
              <Text className="text-center text-surface-600 text-xs font-semibold">
                {t('addBracket')}
              </Text>
            </TouchableOpacity>
          </View>

          <View className="bg-white rounded-2xl p-4 border border-surface-100 mb-4">
            <Text className="font-semibold text-surface-800 mb-2">{t('loanDeductionCap')}</Text>
            <NumField
              label={t('maxLoanInstallmentPct')}
              value={settings.loanDeductionCapPct}
              onChange={(n) => setSettings((s) => ({ ...s, loanDeductionCapPct: n }))}
              hint={t('loanCapHint')}
            />
          </View>

          <TouchableOpacity
            onPress={saveSettings}
            className="bg-primary-500 rounded-xl h-11 items-center justify-center mb-4"
          >
            <Text className="text-white font-semibold">{t('saveTaxLoanSettings')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {section === 'comp' && (
        <>
          <View className="mx-4 mb-4 bg-white rounded-2xl p-4 border border-surface-100">
            <Text className="font-semibold text-surface-800 text-base mb-1">
              {t('salaryRosterTitle')}
            </Text>
            <Text className="text-xs text-surface-400 mb-3">{t('salaryRosterHint')}</Text>

            <View className="flex-row flex-wrap mb-3">
              <View className="bg-surface-50 rounded-xl px-3 py-2 mr-2 mb-2 min-w-[100px]">
                <Text className="text-[10px] text-surface-400 uppercase">{t('kpiEmployees')}</Text>
                <Text className="text-lg font-bold text-surface-800">{salaryKpis.headcount}</Text>
              </View>
              <View className="bg-surface-50 rounded-xl px-3 py-2 mr-2 mb-2 min-w-[120px]">
                <Text className="text-[10px] text-surface-400 uppercase">{t('kpiTotalBasic')}</Text>
                <Text className="text-lg font-bold text-surface-800">
                  {salaryKpis.totalBasic.toLocaleString()} {currency}
                </Text>
              </View>
              <View className="bg-surface-50 rounded-xl px-3 py-2 mr-2 mb-2 min-w-[120px]">
                <Text className="text-[10px] text-surface-400 uppercase">{t('kpiTotalAllowances')}</Text>
                <Text className="text-lg font-bold text-surface-800">
                  {salaryKpis.totalAllowances.toLocaleString()} {currency}
                </Text>
              </View>
              <View className="bg-primary-50 rounded-xl px-3 py-2 mr-2 mb-2 min-w-[120px]">
                <Text className="text-[10px] text-primary-600 uppercase">{t('kpiTotalGross')}</Text>
                <Text className="text-lg font-bold text-primary-700">
                  {salaryKpis.totalGross.toLocaleString()} {currency}
                </Text>
              </View>
              <View
                className={`rounded-xl px-3 py-2 mb-2 min-w-[100px] ${
                  salaryKpis.missing > 0 ? 'bg-warning-50' : 'bg-surface-50'
                }`}
              >
                <Text className="text-[10px] text-surface-400 uppercase">{t('kpiMissingSalary')}</Text>
                <Text
                  className={`text-lg font-bold ${
                    salaryKpis.missing > 0 ? 'text-warning-600' : 'text-surface-800'
                  }`}
                >
                  {salaryKpis.missing}
                </Text>
              </View>
            </View>

            <TextInput
              className="border border-surface-200 rounded-xl px-3 h-11 mb-2 bg-white"
              placeholder={t('searchEmployees')}
              value={salarySearch}
              onChangeText={setSalarySearch}
            />
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-sm text-surface-600">{t('filterMissingSalary')}</Text>
              <Switch
                value={filterMissingSalary}
                onValueChange={setFilterMissingSalary}
                trackColor={{ false: '#E2E8F0', true: '#93C5FD' }}
                thumbColor={filterMissingSalary ? colors.primary : colors.switchTrackAlt}
              />
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View style={{ minWidth: 1280 }}>
                <View className="flex-row bg-surface-100 rounded-t-xl px-3 py-2 border-b border-surface-200">
                  <Text className="w-40 text-[10px] font-bold text-surface-500 uppercase">
                    {t('colEmployee')}
                  </Text>
                  <Text className="w-24 text-[10px] font-bold text-surface-500 uppercase">
                    {t('colBasicSalary')}
                  </Text>
                  <Text className="w-20 text-[10px] font-bold text-surface-500 uppercase">
                    {t('colAllowHousing')}
                  </Text>
                  <Text className="w-20 text-[10px] font-bold text-surface-500 uppercase">
                    {t('colAllowTransport')}
                  </Text>
                  <Text className="w-16 text-[10px] font-bold text-surface-500 uppercase">
                    {t('colAllowMeal')}
                  </Text>
                  <Text className="w-16 text-[10px] font-bold text-surface-500 uppercase">
                    {t('colAllowNature')}
                  </Text>
                  <Text className="w-16 text-[10px] font-bold text-surface-500 uppercase">
                    {t('colAllowOther')}
                  </Text>
                  <Text className="w-20 text-[10px] font-bold text-surface-500 uppercase">
                    {t('colAllowances')}
                  </Text>
                  <Text className="w-24 text-[10px] font-bold text-primary-600 uppercase">
                    {t('colTotalGross')}
                  </Text>
                  <Text className="w-24 text-[10px] font-bold text-surface-500 uppercase">
                    {t('colInsuranceBand')}
                  </Text>
                  <Text className="w-20 text-[10px] font-bold text-surface-500 uppercase">
                    {t('colUpdated')}
                  </Text>
                </View>

                {rosterUsers.length === 0 ? (
                  <Text className="text-center text-surface-400 py-8">{t('noEmployeesMatch')}</Text>
                ) : (
                  rosterUsers.map((u) => {
                    const comp = compensations[u.uid];
                    const sal = comp?.basicSalary ?? 0;
                    const a = comp?.allowances;
                    const allowTot = sumAllowances(a);
                    const totalGross = (sal > 0 ? sal : 0) + allowTot;
                    const hasSalary = comp?.basicSalary != null && comp.basicSalary > 0;
                    const band = hasSalary
                      ? resolveInsuranceBracket(sal, settings.insuranceBrackets || [])
                      : null;
                    return (
                      <TouchableOpacity
                        key={u.uid}
                        onPress={() => openSalaryPanel(u.uid)}
                        className="flex-row items-center px-3 py-3 border-b border-surface-100 active:bg-primary-50"
                      >
                        <View className="w-40 pr-2">
                          <Text className="text-sm font-semibold text-primary-600" numberOfLines={1}>
                            {u.fullName}
                          </Text>
                          <Text className="text-[10px] text-surface-400" numberOfLines={2}>
                            {[u.employeeId, u.branchName, u.department].filter(Boolean).join(' · ') ||
                              '—'}
                          </Text>
                        </View>
                        <Text
                          className={`w-24 text-xs font-semibold ${
                            hasSalary ? 'text-surface-800' : 'text-warning-600'
                          }`}
                          numberOfLines={1}
                        >
                          {hasSalary
                            ? formatRosterAmount(sal, currency)
                            : t('salaryNotSet')}
                        </Text>
                        <Text className="w-20 text-xs text-surface-600" numberOfLines={1}>
                          {formatRosterAmount(a?.housing, currency)}
                        </Text>
                        <Text className="w-20 text-xs text-surface-600" numberOfLines={1}>
                          {formatRosterAmount(a?.transportation, currency)}
                        </Text>
                        <Text className="w-16 text-xs text-surface-600" numberOfLines={1}>
                          {formatRosterAmount(a?.meal, currency)}
                        </Text>
                        <Text className="w-16 text-xs text-surface-600" numberOfLines={1}>
                          {formatRosterAmount(a?.natureOfWork, currency)}
                        </Text>
                        <Text className="w-16 text-xs text-surface-600" numberOfLines={1}>
                          {formatRosterAmount(a?.other, currency)}
                        </Text>
                        <Text className="w-20 text-xs text-surface-600 font-medium" numberOfLines={1}>
                          {formatRosterAmount(allowTot, currency)}
                        </Text>
                        <Text className="w-24 text-xs font-bold text-primary-700" numberOfLines={1}>
                          {hasSalary || allowTot > 0
                            ? formatRosterAmount(totalGross, currency)
                            : '—'}
                        </Text>
                        <Text className="w-24 text-[10px] text-surface-600" numberOfLines={2}>
                          {band
                            ? t('insuranceBandPct', {
                                emp: band.employeeSharePct,
                                er: band.employerSharePct,
                              })
                            : '—'}
                        </Text>
                        <Text className="w-20 text-[10px] text-surface-400" numberOfLines={1}>
                          {formatCompDate(comp)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            </ScrollView>
            <Text className="text-[10px] text-surface-400 mt-2">{t('clickNameToEditSalary')}</Text>
          </View>

          <View className="mx-4 mb-4 bg-white rounded-2xl p-4 border border-surface-100">
            <Text className="font-semibold text-surface-800 mb-2">{t('loans')}</Text>
            <View className="flex-row flex-wrap mb-2">
              {users.map((u) => (
                <TouchableOpacity
                  key={u.uid}
                  onPress={() => setLoanUserId(u.uid)}
                  className={`px-3 py-2 rounded-lg mr-2 mb-2 ${
                    loanUserId === u.uid ? 'bg-primary-500' : 'bg-surface-100'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      loanUserId === u.uid ? 'text-white' : 'text-surface-600'
                    }`}
                  >
                    {u.fullName}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              className="border border-surface-200 rounded-xl px-3 h-11 mb-2"
              placeholder={t('principal')}
              keyboardType="numeric"
              value={loanPrincipal}
              onChangeText={setLoanPrincipal}
            />
            <TextInput
              className="border border-surface-200 rounded-xl px-3 h-11 mb-2"
              placeholder={t('monthlyInstallment')}
              keyboardType="numeric"
              value={loanInstallment}
              onChangeText={setLoanInstallment}
            />
            <TouchableOpacity
              onPress={addLoan}
              className="bg-primary-500 rounded-xl h-11 items-center justify-center"
            >
              <Text className="text-white font-semibold">{t('addLoan')}</Text>
            </TouchableOpacity>
          </View>

          <Modal
            visible={salaryPanelOpen}
            transparent
            animationType="fade"
            onRequestClose={closeSalaryPanel}
          >
            <Pressable
              className="flex-1 bg-black/40 justify-center px-4"
              onPress={closeSalaryPanel}
            >
              <Pressable
                className="bg-white rounded-2xl p-5 max-w-lg w-full self-center max-h-[90%]"
                onPress={() => {}}
              >
                <ScrollView keyboardShouldPersistTaps="handled">
                  <Text className="text-lg font-bold text-surface-900 mb-1">
                    {selectedSalaryUser?.fullName || t('saveSalary')}
                  </Text>
                  <Text className="text-xs text-surface-400 mb-4">
                    {[
                      selectedSalaryUser?.employeeId,
                      selectedSalaryUser?.role,
                      selectedSalaryUser?.branchName,
                      selectedSalaryUser?.department,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>

                  <Text className="text-xs text-surface-400 mb-1">{t('currentBasicSalary')}</Text>
                  <Text className="text-base font-semibold text-surface-800 mb-3">
                    {compensations[salaryUserId]?.basicSalary
                      ? `${compensations[salaryUserId].basicSalary.toLocaleString()} ${currency}`
                      : t('salaryNotSet')}
                  </Text>

                  <Text className="text-xs text-surface-400 mb-1">{t('basicGrossSalary')}</Text>
                  <TextInput
                    className="border border-surface-200 rounded-xl px-3 h-12 mb-3 bg-white"
                    placeholder={t('basicGrossSalary')}
                    keyboardType="numeric"
                    value={salaryAmount}
                    onChangeText={setSalaryAmount}
                  />

                  <Text className="text-sm font-semibold text-surface-800 mb-1">
                    {t('allowancesTitle')}
                  </Text>
                  <Text className="text-xs text-surface-400 mb-2">{t('allowancesHint')}</Text>
                  <Text className="text-xs text-surface-400 mb-1">{t('allowanceHousing')}</Text>
                  <TextInput
                    className="border border-surface-200 rounded-xl px-3 h-11 mb-2 bg-white"
                    keyboardType="numeric"
                    value={allowHousing}
                    onChangeText={setAllowHousing}
                    placeholder="0"
                  />
                  <Text className="text-xs text-surface-400 mb-1">{t('allowanceTransport')}</Text>
                  <TextInput
                    className="border border-surface-200 rounded-xl px-3 h-11 mb-2 bg-white"
                    keyboardType="numeric"
                    value={allowTransport}
                    onChangeText={setAllowTransport}
                    placeholder="0"
                  />
                  <Text className="text-xs text-surface-400 mb-1">{t('allowanceMeal')}</Text>
                  <TextInput
                    className="border border-surface-200 rounded-xl px-3 h-11 mb-2 bg-white"
                    keyboardType="numeric"
                    value={allowMeal}
                    onChangeText={setAllowMeal}
                    placeholder="0"
                  />
                  <Text className="text-xs text-surface-400 mb-1">{t('allowanceNature')}</Text>
                  <TextInput
                    className="border border-surface-200 rounded-xl px-3 h-11 mb-2 bg-white"
                    keyboardType="numeric"
                    value={allowNature}
                    onChangeText={setAllowNature}
                    placeholder="0"
                  />
                  <Text className="text-xs text-surface-400 mb-1">{t('allowanceOther')}</Text>
                  <TextInput
                    className="border border-surface-200 rounded-xl px-3 h-11 mb-3 bg-white"
                    keyboardType="numeric"
                    value={allowOther}
                    onChangeText={setAllowOther}
                    placeholder="0"
                  />
                  <Text className="text-xs text-primary-600 font-semibold mb-3">
                    {t('allowancesTotal', {
                      amount: sumAllowances({
                        housing: Number(allowHousing) || 0,
                        transportation: Number(allowTransport) || 0,
                        meal: Number(allowMeal) || 0,
                        natureOfWork: Number(allowNature) || 0,
                        other: Number(allowOther) || 0,
                      }).toLocaleString(),
                      currency,
                    })}
                  </Text>

                  <View className="bg-surface-50 rounded-xl p-3 mb-4">
                    <Text className="text-xs font-semibold text-surface-500 mb-1">
                      {t('salarySiPreview')}
                    </Text>
                    <Text className="text-sm text-surface-700">
                      {t('insuranceBandPct', {
                        emp: salaryPreview.bracket.employeeSharePct,
                        er: salaryPreview.bracket.employerSharePct,
                      })}
                    </Text>
                    <Text className="text-xs text-surface-400 mt-1">
                      {t('insWagePreview', {
                        amount: salaryPreview.insWage.toLocaleString(),
                        currency,
                      })}
                    </Text>
                  </View>

                  <View className="flex-row mb-2">
                    <TouchableOpacity
                      onPress={closeSalaryPanel}
                      className="flex-1 bg-surface-100 rounded-xl h-12 items-center justify-center mr-2"
                    >
                      <Text className="text-surface-600 font-semibold">{t('cancel')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={saveSalary}
                      disabled={!salaryUserId || !salaryAmount}
                      className={`flex-1 rounded-xl h-12 items-center justify-center ${
                        !salaryUserId || !salaryAmount ? 'bg-surface-300' : 'bg-primary-500'
                      }`}
                    >
                      <Text className="text-white font-bold">{t('saveSalary')}</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>
        </>
      )}
    </ScrollView>
  );
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function formatRosterAmount(
  amount: number | undefined | null,
  currency: string,
  empty = '—',
): string {
  if (amount == null || amount <= 0) return empty;
  return `${amount.toLocaleString()} ${currency}`;
}
