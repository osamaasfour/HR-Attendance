/**
 * Admin Reports — filtered attendance, payroll, and leave with charts + CSV
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { getDocs, where } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import { useAppAlert } from '../../context/AlertContext';
import { useCompany } from '../../context/CompanyContext';
import { useLanguage } from '../../context/LanguageContext';
import ReportFilters, { type ReportFiltersValue } from '../../components/ReportFilters';
import BarChart from '../../components/charts/BarChart';
import DonutChart from '../../components/charts/DonutChart';
import { toCsv, downloadCsv } from '../../utils/csv';
import {
  buildVacationBalances,
  countAbsencesForUser,
  currentPeriod,
  filterAttendanceByPeriod,
  filterDelays,
  filterRequestsByPeriod,
  formatPeriodLabel,
  formatTsTime,
  periodBounds,
} from '../../utils/reports';
import {
  attendanceKpis,
  buildDailyAttendanceSeries,
  filterReportUsers,
  leaveTypeCounts,
  money,
  payrollKpis,
  topPayslipsByNet,
  userIdSet,
} from '../../utils/reportAnalytics';
import { buildAttendanceRegister } from '../../utils/attendanceRegister';
import {
  exportAttendanceRegisterXlsx,
  printAttendanceRegister,
} from '../../utils/attendanceRegisterExport';
import { printReportDocument } from '../../utils/printReportDocument';
import AttendanceRegisterCard from '../../components/AttendanceRegisterCard';
import { loadTenantRecords, tenantQuery } from '../../utils/tenantScope';
import { requestTypeKey } from '../../i18n/translations';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { colors } from '../../constants/colors';
import { fetchHolidays, holidayDateSet, holidayOccursOn } from '../../utils/holidays';
import {
  DEFAULT_TENANT_ID,
  resolveWorkSchedule,
  type AttendanceRecord,
  type Branch,
  type Department,
  type Holiday,
  type HrRequest,
  type Payslip,
  type UserData,
  type WorkShift,
} from '../../types';

const PREVIEW_LIMIT = 80;
type ReportTab = 'register' | 'attendance' | 'payroll' | 'leave';

export default function AdminReportsScreen() {
  return (
    <ErrorBoundary compact>
      <ReportsBody />
    </ErrorBoundary>
  );
}

function ReportsBody() {
  const { user } = useAuth();
  const { showAlert } = useAppAlert();
  const { tenant } = useCompany();
  const { t, language, isRTL } = useLanguage();
  const tid = user?.tenantId || tenant.id || DEFAULT_TENANT_ID;
  const schedule = resolveWorkSchedule(tenant.workSchedule);

  const [tab, setTab] = useState<ReportTab>('attendance');
  const [filters, setFilters] = useState<ReportFiltersValue>({
    period: currentPeriod(),
    branchId: '',
    departmentId: '',
    employeeQuery: '',
    status: '',
    typeId: '',
  });
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [users, setUsers] = useState<UserData[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [requests, setRequests] = useState<HrRequest[]>([]);
  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);

  const period = filters.period;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = periodBounds(period);
      const [usersRows, aSnap, requestsRows, shiftsRows, branchRows, deptRows, pSnap, holidayList] =
        await Promise.all([
          loadTenantRecords<UserData>('users', tid, 'uid'),
          getDocs(
            tenantQuery(
              'attendance',
              tid,
              where('date', '>=', start),
              where('date', '<=', end),
            ),
          ),
          loadTenantRecords<HrRequest>('hrRequests', tid),
          loadTenantRecords<WorkShift>('workShifts', tid),
          loadTenantRecords<Branch>('branches', tid),
          loadTenantRecords<Department>('departments', tid),
          getDocs(tenantQuery('payslips', tid, where('period', '==', period))),
          fetchHolidays(tid),
        ]);
      setUsers(usersRows);
      setAttendance(
        aSnap.docs.map((d) => ({ ...(d.data() as AttendanceRecord), id: d.id })),
      );
      setRequests(requestsRows);
      setShifts(shiftsRows.filter((s) => s.active !== false));
      setBranches(
        branchRows
          .filter((b) => b.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setDepartments(deptRows.filter((d) => d.active !== false));
      setPayslips(pSnap.docs.map((d) => ({ ...(d.data() as Payslip), id: d.id })));
      setHolidays(holidayList);
    } catch (e: any) {
      showAlert(t('error'), e?.message || t('actionFailed'));
    } finally {
      setLoading(false);
    }
  }, [tid, period, showAlert, t]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredUsers = useMemo(
    () =>
      filterReportUsers(users, {
        branchId: filters.branchId,
        departmentId: filters.departmentId,
        employeeQuery: filters.employeeQuery,
      }),
    [users, filters.branchId, filters.departmentId, filters.employeeQuery],
  );
  const ids = useMemo(() => userIdSet(filteredUsers), [filteredUsers]);
  const usersById = useMemo(() => new Map(filteredUsers.map((u) => [u.uid, u])), [filteredUsers]);
  const shiftsById = useMemo(() => new Map(shifts.map((s) => [s.id, s])), [shifts]);
  const holidayDates = useMemo(() => {
    const { start, end } = periodBounds(period);
    return holidayDateSet(holidays, start, end);
  }, [holidays, period]);

  const register = useMemo(
    () =>
      buildAttendanceRegister({
        period,
        users: filteredUsers,
        attendance,
        requests,
        holidays,
        shiftsById,
        tenantSchedule: schedule,
      }),
    [period, filteredUsers, attendance, requests, holidays, shiftsById, schedule],
  );

  const monthHolidays = useMemo(
    () => holidays.filter((h) => register.dates.some((d) => holidayOccursOn(h, d))),
    [holidays, register.dates],
  );

  const periodAttAll = useMemo(
    () =>
      filterAttendanceByPeriod(attendance, period)
        .filter((r) => ids.has(r.userId))
        .sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    [attendance, period, ids],
  );

  const periodAtt = useMemo(() => {
    if (filters.status === 'late') {
      return periodAttAll.filter((r) => (r.lateMinutes || 0) > 0);
    }
    if (filters.status === 'present') {
      return periodAttAll.filter((r) => (r.lateMinutes || 0) === 0);
    }
    if (filters.status === 'absent') return [];
    return periodAttAll;
  }, [periodAttAll, filters.status]);

  const periodDelays = useMemo(() => filterDelays(periodAtt), [periodAtt]);

  const periodReq = useMemo(() => {
    let rows = filterRequestsByPeriod(requests, period)
      .filter((r) => ids.has(r.userId))
      .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
    if (filters.status) rows = rows.filter((r) => r.status === filters.status);
    if (filters.typeId) rows = rows.filter((r) => r.type === filters.typeId);
    return rows;
  }, [requests, period, ids, filters.status, filters.typeId]);

  const vacBalances = useMemo(
    () => buildVacationBalances(filteredUsers, requests, Number(period.slice(0, 4))),
    [filteredUsers, requests, period],
  );

  const absenceRows = useMemo(() => {
    const rows: {
      employeeId: string;
      fullName: string;
      absentDays: number;
      dates: string;
    }[] = [];
    filteredUsers.forEach((u) => {
      const { absentDays, absentDates } = countAbsencesForUser({
        user: u,
        period,
        attendance,
        requests,
        shiftsById,
        tenantSchedule: schedule,
        holidayDates,
      });
      if (absentDays > 0) {
        rows.push({
          employeeId: u.employeeId || '',
          fullName: u.fullName || '',
          absentDays,
          dates: absentDates.join(' '),
        });
      }
    });
    return rows.sort((a, b) => b.absentDays - a.absentDays);
  }, [filteredUsers, period, attendance, requests, shiftsById, schedule, holidayDates]);

  const totalAbsentDays = useMemo(
    () => absenceRows.reduce((s, r) => s + r.absentDays, 0),
    [absenceRows],
  );

  const attKpis = useMemo(
    () => attendanceKpis(periodAttAll, totalAbsentDays),
    [periodAttAll, totalAbsentDays],
  );

  const dailySeries = useMemo(
    () =>
      buildDailyAttendanceSeries({
        period,
        userIds: ids,
        attendance: periodAttAll,
        weeklyOffDays: schedule.weeklyOffDays,
        holidayDates,
      }),
    [period, ids, periodAttAll, schedule.weeklyOffDays, holidayDates],
  );

  const filteredPayslips = useMemo(() => {
    let rows = payslips.filter((p) => ids.has(p.userId));
    if (filters.status === 'published') rows = rows.filter((p) => p.published);
    if (filters.status === 'draft') rows = rows.filter((p) => !p.published);
    return rows;
  }, [payslips, ids, filters.status]);

  const payKpis = useMemo(() => payrollKpis(filteredPayslips), [filteredPayslips]);
  const topNet = useMemo(() => topPayslipsByNet(filteredPayslips), [filteredPayslips]);

  const typeCounts = useMemo(() => leaveTypeCounts(periodReq), [periodReq]);
  const pendingCount = useMemo(
    () => periodReq.filter((r) => r.status === 'pending').length,
    [periodReq],
  );
  const approvedVacDays = useMemo(
    () =>
      periodReq
        .filter((r) => r.status === 'approved' && r.type === 'vacation')
        .reduce((s, r) => s + (r.days || 0), 0),
    [periodReq],
  );
  const lowVac = useMemo(
    () => vacBalances.filter((r) => r.remaining < 5).length,
    [vacBalances],
  );

  const runExport = async (key: string, fn: () => Promise<void>) => {
    setExporting(key);
    try {
      await fn();
    } catch (e: any) {
      showAlert(t('error'), e?.message || t('actionFailed'));
    } finally {
      setExporting(null);
    }
  };

  const exportAttendance = () =>
    runExport('att', async () => {
      const rows = periodAtt.map((r) => [
        r.employeeId,
        r.userName,
        r.date,
        formatTsTime(r.clockIn),
        formatTsTime(r.clockOut),
        r.totalHours ?? '',
        r.status,
        r.lateMinutes ?? 0,
        r.earlyLeaveMinutes ?? 0,
      ]);
      await downloadCsv(
        `attendance-${period}.csv`,
        toCsv(
          [
            'employeeId',
            'name',
            'date',
            'clockIn',
            'clockOut',
            'hours',
            'status',
            'lateMinutes',
            'earlyLeaveMinutes',
          ],
          rows,
        ),
      );
    });

  const exportDelays = () =>
    runExport('delay', async () => {
      const rows = periodDelays.map((r) => [
        r.employeeId,
        r.userName,
        r.date,
        formatTsTime(r.clockIn),
        formatTsTime(r.clockOut),
        r.lateMinutes ?? 0,
        r.earlyLeaveMinutes ?? 0,
      ]);
      await downloadCsv(
        `delays-${period}.csv`,
        toCsv(['employeeId', 'name', 'date', 'clockIn', 'clockOut', 'lateMinutes', 'earlyLeaveMinutes'], rows),
      );
    });

  const exportAbsences = () =>
    runExport('abs', async () => {
      const rows = absenceRows.map((r) => [r.employeeId, r.fullName, r.absentDays, r.dates]);
      await downloadCsv(
        `absences-${period}.csv`,
        toCsv(['employeeId', 'name', 'absentDays', 'dates'], rows),
      );
    });

  const exportRequests = () =>
    runExport('req', async () => {
      const rows = periodReq.map((r) => [
        r.employeeId,
        r.userName,
        r.type,
        r.startDate,
        r.endDate || '',
        r.days ?? '',
        r.status,
        r.reason || '',
      ]);
      await downloadCsv(
        `requests-${period}.csv`,
        toCsv(['employeeId', 'name', 'type', 'start', 'end', 'days', 'status', 'reason'], rows),
      );
    });

  const exportVacation = () =>
    runExport('vac', async () => {
      const rows = vacBalances.map((r) => [
        r.employeeId,
        r.fullName,
        r.allowance,
        r.used,
        r.adjustment,
        r.remaining,
      ]);
      await downloadCsv(
        `vacation-balances-${period.slice(0, 4)}.csv`,
        toCsv(['employeeId', 'name', 'allowance', 'used', 'adjustment', 'remaining'], rows),
      );
    });

  const exportPayroll = () =>
    runExport('pay', async () => {
      const rows = filteredPayslips.map((p) => {
        const u = usersById.get(p.userId);
        return [
          p.employeeId,
          p.userName,
          u?.branchName || '',
          money(p.monthlyBaseEarnings ?? p.grossPay),
          money(p.employeeInsurance),
          money(p.incomeTax),
          money(p.totalDeductions),
          money(p.netPay),
          p.published ? 'published' : 'draft',
        ];
      });
      await downloadCsv(
        `payroll-${period}.csv`,
        toCsv(
          ['employeeId', 'name', 'branch', 'gross', 'employeeSi', 'tax', 'deductions', 'net', 'status'],
          rows,
        ),
      );
    });

  const periodLabel = formatPeriodLabel(period, language === 'ar' ? 'ar-EG' : 'en-US');

  const exportTimesheet = () =>
    runExport('timesheet', async () => {
      await exportAttendanceRegisterXlsx(
        `timesheet-${period}.xlsx`,
        register,
        {
          companyName: tenant.name,
          periodLabel,
          employee: t('fullName'),
          employeeId: t('employeeId'),
          date: t('date'),
          weekday: t('timesheetWeekday'),
          status: t('timesheetStatus'),
          clockIn: t('clockIn'),
          clockOut: t('clockOut'),
          notes: t('timesheetNotes'),
          present: t('present'),
          late: t('late'),
          early: t('codeEarly'),
          vacation: t('typeVacation'),
          sick: t('typeSick'),
          unpaid: t('typeUnpaid'),
          trip: t('typeBusinessTrip'),
          absent: t('absent'),
          holiday: t('codeHoliday'),
          weekend: t('codeWeekend'),
        },
        language === 'ar' ? 'ar-EG' : 'en-US',
      );
    });

  const printTimesheet = () => {
    printAttendanceRegister({
      companyName: tenant.name,
      periodLabel,
      generatedAt: new Date().toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US'),
      title: t('reportTabTimesheet'),
      employeeCol: t('fullName'),
      idCol: t('employeeId'),
      dateCol: t('date'),
      weekdayCol: t('timesheetWeekday'),
      statusCol: t('timesheetStatus'),
      inCol: t('clockIn'),
      outCol: t('clockOut'),
      notesCol: t('timesheetNotes'),
      locale: language === 'ar' ? 'ar-EG' : 'en-US',
      dir: isRTL ? 'rtl' : 'ltr',
      legend: [
        { code: 'P', label: t('codePresent') },
        { code: 'L', label: t('codeLate') },
        { code: 'E', label: t('codeEarly') },
        { code: 'LE', label: t('codeLateEarly') },
        { code: 'V', label: t('typeVacation') },
        { code: 'S', label: t('typeSick') },
        { code: 'U', label: t('typeUnpaid') },
        { code: 'T', label: t('typeBusinessTrip') },
        { code: 'H', label: t('codeHoliday') },
        { code: 'W', label: t('codeWeekend') },
        { code: 'A', label: t('codeAbsent') },
      ],
      register,
      holidays: monthHolidays,
      holidaysTitle: t('holidaysTitle'),
      signatureHr: t('timesheetHrSign'),
      signatureManager: t('timesheetManagerSign'),
    });
  };

  const filterSummary = useMemo(() => {
    const parts: string[] = [periodLabel];
    const branch = branches.find((b) => b.id === filters.branchId);
    const dept = departments.find((d) => d.id === filters.departmentId);
    if (branch) parts.push(`${t('filterByBranch')}: ${branch.name}`);
    if (dept) parts.push(`${t('filterByDepartment')}: ${dept.name}`);
    if (filters.employeeQuery.trim()) parts.push(`${t('search')}: ${filters.employeeQuery.trim()}`);
    if (filters.status) parts.push(`${t('status')}: ${filters.status}`);
    if (filters.typeId) parts.push(`${t('requestType')}: ${filters.typeId}`);
    return parts.length > 1
      ? t('reportDocumentFilters', { summary: parts.join(' · ') })
      : t('reportFilterNone');
  }, [periodLabel, branches, departments, filters, t]);

  const openPrintDocument = (title: string, headers: string[], rows: (string | number)[][]) => {
    if (Platform.OS !== 'web') {
      showAlert(t('printReport'), t('print'));
      return;
    }
    printReportDocument({
      companyName: tenant.name,
      title,
      subtitle: periodLabel,
      generatedAt: new Date().toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US'),
      filterSummary,
      dir: isRTL ? 'rtl' : 'ltr',
      tables: [{ title, headers, rows }],
      signatureLeft: t('timesheetHrSign'),
      signatureRight: t('timesheetManagerSign'),
      printLabel: t('print'),
    });
  };

  const statusOptions = useMemo(() => {
    if (tab === 'register') return [];
    if (tab === 'attendance') {
      return [
        { id: '', label: t('all') },
        { id: 'present', label: t('present') },
        { id: 'late', label: t('late') },
        { id: 'absent', label: t('absent') },
      ];
    }
    if (tab === 'payroll') {
      return [
        { id: '', label: t('all') },
        { id: 'published', label: t('published') },
        { id: 'draft', label: t('draft') },
      ];
    }
    return [
      { id: '', label: t('all') },
      { id: 'pending', label: t('pending') },
      { id: 'approved', label: t('approved') },
      { id: 'rejected', label: t('rejected') },
    ];
  }, [tab, t]);

  const typeOptions = useMemo(() => {
    if (tab !== 'leave') return undefined;
    return [
      { id: '', label: t('all') },
      { id: 'vacation', label: t('typeVacation') },
      { id: 'sick', label: t('typeSick') },
      { id: 'unpaid', label: t('typeUnpaid') },
      { id: 'business_trip', label: t('typeBusinessTrip') },
    ];
  }, [tab, t]);

  const onFiltersChange = (next: ReportFiltersValue) => setFilters(next);

  const switchTab = (next: ReportTab) => {
    setTab(next);
    setFilters((prev) => ({ ...prev, status: '', typeId: '' }));
  };

  return (
    <ScrollView
      className="flex-1 bg-surface-50"
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <View className="px-6 pt-12 pb-4 bg-white border-b border-surface-100">
        <Text className="text-2xl font-bold text-surface-800">{t('reportsTitle')}</Text>
        <Text className="text-surface-400 text-sm mt-1">{t('reportsSubtitle')}</Text>
      </View>

      <View className="p-4">
        <View className="flex-row mb-2">
          {(['attendance', 'payroll', 'leave'] as ReportTab[]).map((id, idx) => {
            const label =
              id === 'attendance'
                ? t('reportTabAttendance')
                : id === 'payroll'
                  ? t('reportTabPayroll')
                  : t('reportTabLeave');
            const active = tab === id;
            return (
              <TouchableOpacity
                key={id}
                onPress={() => switchTab(id)}
                className={`flex-1 h-10 rounded-xl items-center justify-center ${idx < 2 ? 'mr-2' : ''} ${
                  active ? 'bg-primary-500' : 'bg-white border border-surface-200'
                }`}
              >
                <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-surface-600'}`}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity
          onPress={() => switchTab('register')}
          className={`h-10 rounded-xl items-center justify-center mb-3 ${
            tab === 'register' ? 'bg-primary-500' : 'bg-white border border-surface-200'
          }`}
        >
          <Text className={`text-xs font-semibold ${tab === 'register' ? 'text-white' : 'text-primary-700'}`}>
            {t('reportTabTimesheet')}
          </Text>
        </TouchableOpacity>

        <ReportFilters
          value={filters}
          onChange={onFiltersChange}
          branches={branches}
          departments={departments}
          statusOptions={statusOptions}
          typeOptions={typeOptions}
        />

        {tab === 'register' && (
          <AttendanceRegisterCard
            register={register}
            loading={loading}
            companyName={tenant.name}
            periodLabel={periodLabel}
            exporting={exporting === 'timesheet'}
            onExport={exportTimesheet}
            onPrint={printTimesheet}
          />
        )}

        {tab === 'attendance' && (
          <>
            <KpiRow
              items={[
                { label: t('kpiPresentDays'), value: attKpis.presentDays },
                { label: t('kpiLatePunches'), value: attKpis.latePunches },
                { label: t('kpiEarlyLeaves'), value: attKpis.earlyLeaves },
                { label: t('kpiAbsentDays'), value: attKpis.absentDays },
              ]}
            />
            <View className="bg-white rounded-2xl p-4 mb-4 border border-surface-100">
              <Text className="font-semibold text-surface-800 mb-3">{t('chartDailyAttendance')}</Text>
              <BarChart
                items={dailySeries.map((d) => ({
                  label: d.label,
                  parts: [
                    { value: d.present, color: colors.primary },
                    { value: d.late, color: colors.warning },
                    { value: d.absent, color: colors.danger },
                  ],
                }))}
                legend={[
                  { label: t('present'), color: colors.primary },
                  { label: t('late'), color: colors.warning },
                  { label: t('absent'), color: colors.danger },
                ]}
                emptyLabel={t('chartEmpty')}
              />
            </View>

            {filters.status !== 'absent' && (
              <ReportCard
                title={t('reportMonthlyAttendance')}
                summary={t('reportRowsCount', { count: periodAtt.length })}
                exportLabel={t('exportAttendanceCsv')}
                busy={exporting === 'att'}
                onExport={exportAttendance}
                onPrint={() =>
                  openPrintDocument(
                    t('reportMonthlyAttendance'),
                    [
                      t('employeeId'),
                      t('fullName'),
                      t('date'),
                      t('clockIn'),
                      t('clockOut'),
                      t('hours'),
                      t('status'),
                      t('lateShort'),
                      t('earlyShort'),
                    ],
                    periodAtt.map((r) => [
                      r.employeeId || '',
                      r.userName || '',
                      r.date || '',
                      formatTsTime(r.clockIn),
                      formatTsTime(r.clockOut),
                      r.totalHours != null ? String(r.totalHours) : '',
                      r.status || '',
                      String(r.lateMinutes ?? 0),
                      String(r.earlyLeaveMinutes ?? 0),
                    ]),
                  )
                }
              >
                <PreviewTable
                  headers={[
                    t('employeeId'),
                    t('fullName'),
                    t('date'),
                    t('clockIn'),
                    t('clockOut'),
                    t('hours'),
                    t('status'),
                    t('lateShort'),
                    t('earlyShort'),
                  ]}
                  rows={periodAtt.slice(0, PREVIEW_LIMIT).map((r) => [
                    r.employeeId || '',
                    r.userName || '',
                    r.date || '',
                    formatTsTime(r.clockIn),
                    formatTsTime(r.clockOut),
                    r.totalHours != null ? String(r.totalHours) : '',
                    r.status || '',
                    String(r.lateMinutes ?? 0),
                    String(r.earlyLeaveMinutes ?? 0),
                  ])}
                  total={periodAtt.length}
                  emptyLabel={t('noData')}
                  truncatedLabel={t('previewTruncated', {
                    shown: Math.min(PREVIEW_LIMIT, periodAtt.length),
                    total: periodAtt.length,
                  })}
                />
              </ReportCard>
            )}

            {filters.status !== 'present' && filters.status !== 'absent' && (
              <ReportCard
                title={t('reportDelays')}
                summary={t('reportRowsCount', { count: periodDelays.length })}
                exportLabel={t('exportDelaysCsv')}
                busy={exporting === 'delay'}
                onExport={exportDelays}
                onPrint={() =>
                  openPrintDocument(
                    t('reportDelays'),
                    [
                      t('employeeId'),
                      t('fullName'),
                      t('date'),
                      t('clockIn'),
                      t('clockOut'),
                      t('lateShort'),
                      t('earlyShort'),
                    ],
                    periodDelays.map((r) => [
                      r.employeeId || '',
                      r.userName || '',
                      r.date || '',
                      formatTsTime(r.clockIn),
                      formatTsTime(r.clockOut),
                      String(r.lateMinutes ?? 0),
                      String(r.earlyLeaveMinutes ?? 0),
                    ]),
                  )
                }
              >
                <PreviewTable
                  headers={[
                    t('employeeId'),
                    t('fullName'),
                    t('date'),
                    t('clockIn'),
                    t('clockOut'),
                    t('lateShort'),
                    t('earlyShort'),
                  ]}
                  rows={periodDelays.slice(0, PREVIEW_LIMIT).map((r) => [
                    r.employeeId || '',
                    r.userName || '',
                    r.date || '',
                    formatTsTime(r.clockIn),
                    formatTsTime(r.clockOut),
                    String(r.lateMinutes ?? 0),
                    String(r.earlyLeaveMinutes ?? 0),
                  ])}
                  total={periodDelays.length}
                  emptyLabel={t('noData')}
                  truncatedLabel={t('previewTruncated', {
                    shown: Math.min(PREVIEW_LIMIT, periodDelays.length),
                    total: periodDelays.length,
                  })}
                />
              </ReportCard>
            )}

            {filters.status !== 'present' && filters.status !== 'late' && (
              <ReportCard
                title={t('reportAbsences')}
                summary={t('reportAbsenceSummary', {
                  people: absenceRows.length,
                  days: totalAbsentDays,
                })}
                exportLabel={t('exportAbsencesCsv')}
                busy={exporting === 'abs'}
                onExport={exportAbsences}
                onPrint={() =>
                  openPrintDocument(
                    t('reportAbsences'),
                    [t('employeeId'), t('fullName'), t('absentDays'), t('dates')],
                    absenceRows.map((r) => [
                      r.employeeId,
                      r.fullName,
                      String(r.absentDays),
                      r.dates,
                    ]),
                  )
                }
              >
                <PreviewTable
                  headers={[t('employeeId'), t('fullName'), t('absentDays'), t('dates')]}
                  rows={absenceRows.slice(0, PREVIEW_LIMIT).map((r) => [
                    r.employeeId,
                    r.fullName,
                    String(r.absentDays),
                    r.dates,
                  ])}
                  total={absenceRows.length}
                  emptyLabel={t('noData')}
                  truncatedLabel={t('previewTruncated', {
                    shown: Math.min(PREVIEW_LIMIT, absenceRows.length),
                    total: absenceRows.length,
                  })}
                />
              </ReportCard>
            )}
          </>
        )}

        {tab === 'payroll' && (
          <>
            <KpiRow
              items={[
                { label: t('kpiHeadcount'), value: payKpis.headcount },
                { label: t('gross'), value: money(payKpis.gross).toLocaleString() },
                { label: t('kpiEmployeeSi'), value: money(payKpis.employeeSi).toLocaleString() },
                { label: t('tax'), value: money(payKpis.tax).toLocaleString() },
                { label: t('netPay'), value: money(payKpis.net).toLocaleString() },
              ]}
            />
            <View className="bg-white rounded-2xl p-4 mb-4 border border-surface-100">
              <Text className="font-semibold text-surface-800 mb-3">{t('chartNetVsDeductions')}</Text>
              <DonutChart
                slices={[
                  { label: t('netPay'), value: money(payKpis.net), color: colors.primary },
                  { label: t('deductions'), value: money(payKpis.deductions), color: colors.warning },
                ]}
                emptyLabel={t('chartEmpty')}
                centerLabel={String(payKpis.headcount)}
              />
            </View>
            <View className="bg-white rounded-2xl p-4 mb-4 border border-surface-100">
              <Text className="font-semibold text-surface-800 mb-3">{t('chartTopNet')}</Text>
              <BarChart
                items={topNet.map((p) => ({
                  label: (p.userName || p.employeeId || '').slice(0, 8),
                  parts: [{ value: money(p.netPay), color: colors.accent }],
                }))}
                emptyLabel={t('chartEmpty')}
                barWidth={18}
              />
            </View>
            <ReportCard
              title={t('reportPayroll')}
              summary={t('reportRowsCount', { count: filteredPayslips.length })}
              exportLabel={t('exportPayrollCsv')}
              busy={exporting === 'pay'}
              onExport={exportPayroll}
              onPrint={() =>
                openPrintDocument(
                  t('reportPayroll'),
                  [
                    t('employeeId'),
                    t('fullName'),
                    t('branch'),
                    t('gross'),
                    t('kpiEmployeeSi'),
                    t('tax'),
                    t('netPay'),
                    t('status'),
                  ],
                  filteredPayslips.map((p) => {
                    const u = usersById.get(p.userId);
                    return [
                      p.employeeId || '',
                      p.userName || '',
                      u?.branchName || '',
                      money(p.monthlyBaseEarnings ?? p.grossPay).toFixed(2),
                      money(p.employeeInsurance).toFixed(2),
                      money(p.incomeTax).toFixed(2),
                      money(p.netPay).toFixed(2),
                      p.published ? t('published') : t('draft'),
                    ];
                  }),
                )
              }
            >
              <PreviewTable
                headers={[
                  t('employeeId'),
                  t('fullName'),
                  t('branch'),
                  t('gross'),
                  t('kpiEmployeeSi'),
                  t('tax'),
                  t('netPay'),
                  t('status'),
                ]}
                rows={filteredPayslips.slice(0, PREVIEW_LIMIT).map((p) => {
                  const u = usersById.get(p.userId);
                  return [
                    p.employeeId || '',
                    p.userName || '',
                    u?.branchName || '',
                    money(p.monthlyBaseEarnings ?? p.grossPay).toFixed(2),
                    money(p.employeeInsurance).toFixed(2),
                    money(p.incomeTax).toFixed(2),
                    money(p.netPay).toFixed(2),
                    p.published ? t('published') : t('draft'),
                  ];
                })}
                total={filteredPayslips.length}
                emptyLabel={t('noData')}
                truncatedLabel={t('previewTruncated', {
                  shown: Math.min(PREVIEW_LIMIT, filteredPayslips.length),
                  total: filteredPayslips.length,
                })}
              />
            </ReportCard>
          </>
        )}

        {tab === 'leave' && (
          <>
            <KpiRow
              items={[
                { label: t('pending'), value: pendingCount },
                { label: t('kpiApprovedVacationDays'), value: approvedVacDays },
                { label: t('kpiLowVacation'), value: lowVac },
              ]}
            />
            <View className="bg-white rounded-2xl p-4 mb-4 border border-surface-100">
              <Text className="font-semibold text-surface-800 mb-3">{t('chartRequestTypes')}</Text>
              <DonutChart
                slices={Object.entries(typeCounts).map(([type, value], i) => ({
                  label: t(requestTypeKey(type)),
                  value,
                  color: [colors.primary, colors.accent, colors.warning, colors.danger, colors.primary600, colors.primary400][i % 6],
                }))}
                emptyLabel={t('chartEmpty')}
              />
            </View>
            <View className="bg-white rounded-2xl p-4 mb-4 border border-surface-100">
              <Text className="font-semibold text-surface-800 mb-3">
                {t('chartVacationUsedRemaining')}
              </Text>
              <BarChart
                items={vacBalances.slice(0, 8).map((r) => ({
                  label: r.fullName.slice(0, 8),
                  parts: [
                    { value: r.used, color: colors.warning },
                    { value: r.remaining, color: colors.primary },
                  ],
                }))}
                legend={[
                  { label: t('vacationUsedCol'), color: colors.warning },
                  { label: t('vacationRemainingCol'), color: colors.primary },
                ]}
                emptyLabel={t('chartEmpty')}
                barWidth={16}
              />
              <Text className="text-[10px] text-surface-400 mt-2">{t('lowVacationHint')}</Text>
            </View>
            <ReportCard
              title={t('reportRequests')}
              summary={t('reportRowsCount', { count: periodReq.length })}
              exportLabel={t('exportRequestsCsv')}
              busy={exporting === 'req'}
              onExport={exportRequests}
              onPrint={() =>
                openPrintDocument(
                  t('reportRequests'),
                  [
                    t('employeeId'),
                    t('fullName'),
                    t('requestType'),
                    t('startDate'),
                    t('endDate'),
                    t('days'),
                    t('status'),
                    t('reason'),
                  ],
                  periodReq.map((r) => [
                    r.employeeId || '',
                    r.userName || '',
                    t(requestTypeKey(r.type || '')),
                    r.startDate || '',
                    r.endDate || '',
                    r.days != null ? String(r.days) : '',
                    r.status || '',
                    r.reason || '',
                  ]),
                )
              }
            >
              <PreviewTable
                headers={[
                  t('employeeId'),
                  t('fullName'),
                  t('requestType'),
                  t('startDate'),
                  t('endDate'),
                  t('days'),
                  t('status'),
                  t('reason'),
                ]}
                rows={periodReq.slice(0, PREVIEW_LIMIT).map((r) => [
                  r.employeeId || '',
                  r.userName || '',
                  t(requestTypeKey(r.type || '')),
                  r.startDate || '',
                  r.endDate || '',
                  r.days != null ? String(r.days) : '',
                  r.status || '',
                  r.reason || '',
                ])}
                total={periodReq.length}
                emptyLabel={t('noData')}
                truncatedLabel={t('previewTruncated', {
                  shown: Math.min(PREVIEW_LIMIT, periodReq.length),
                  total: periodReq.length,
                })}
              />
            </ReportCard>
            <ReportCard
              title={t('reportVacationBalances')}
              summary={`${t('vacationBalancesPerEmployee')} · ${t('reportRowsCount', {
                count: vacBalances.length,
              })}`}
              exportLabel={t('exportVacationCsv')}
              busy={exporting === 'vac'}
              onExport={exportVacation}
              onPrint={() =>
                openPrintDocument(
                  t('reportVacationBalances'),
                  [
                    t('employeeId'),
                    t('fullName'),
                    t('vacationAllowanceCol'),
                    t('vacationUsedCol'),
                    t('leaveBalanceAdjustment'),
                    t('vacationRemainingCol'),
                  ],
                  vacBalances.map((r) => [
                    r.employeeId,
                    r.fullName,
                    String(r.allowance),
                    String(r.used),
                    String(r.adjustment),
                    String(r.remaining),
                  ]),
                )
              }
            >
              <PreviewTable
                headers={[
                  t('employeeId'),
                  t('fullName'),
                  t('vacationAllowanceCol'),
                  t('vacationUsedCol'),
                  t('leaveBalanceAdjustment'),
                  t('vacationRemainingCol'),
                ]}
                rows={vacBalances.slice(0, PREVIEW_LIMIT).map((r) => [
                  r.employeeId,
                  r.fullName,
                  String(r.allowance),
                  String(r.used),
                  String(r.adjustment),
                  String(r.remaining),
                ])}
                total={vacBalances.length}
                emptyLabel={t('noData')}
                truncatedLabel={t('previewTruncated', {
                  shown: Math.min(PREVIEW_LIMIT, vacBalances.length),
                  total: vacBalances.length,
                })}
              />
            </ReportCard>
          </>
        )}
      </View>
    </ScrollView>
  );
}

function KpiRow({ items }: { items: { label: string; value: string | number }[] }) {
  return (
    <View className="flex-row flex-wrap mb-2">
      {items.map((it) => (
        <View key={it.label} className="bg-white rounded-xl px-3 py-2 mr-2 mb-2 border border-surface-100 min-w-[96px]">
          <Text className="text-lg font-bold text-primary-700">{it.value}</Text>
          <Text className="text-[10px] text-surface-500">{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

function ReportCard({
  title,
  summary,
  exportLabel,
  busy,
  onExport,
  onPrint,
  children,
}: {
  title: string;
  summary: string;
  exportLabel: string;
  busy: boolean;
  onExport: () => void;
  onPrint?: () => void;
  children: React.ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <View className="bg-white rounded-2xl p-4 mb-4 border border-surface-100">
      <Text className="font-semibold text-surface-800 mb-1">{title}</Text>
      <Text className="text-surface-500 text-sm mb-3">{summary}</Text>
      {children}
      <View className="flex-row mt-3">
        {onPrint && Platform.OS === 'web' ? (
          <TouchableOpacity
            onPress={onPrint}
            className="flex-1 bg-white border border-primary-200 rounded-xl h-12 items-center justify-center mr-2"
          >
            <Text className="text-primary-700 font-semibold">{t('printReport')}</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={onExport}
          disabled={busy}
          className="flex-1 bg-primary-500 rounded-xl h-12 items-center justify-center"
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-semibold">{exportLabel}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function PreviewTable({
  headers,
  rows,
  total,
  emptyLabel,
  truncatedLabel,
}: {
  headers: string[];
  rows: string[][];
  total: number;
  emptyLabel: string;
  truncatedLabel: string;
}) {
  const { t } = useLanguage();
  if (total === 0) {
    return (
      <View className="bg-surface-50 rounded-xl px-3 py-4 mb-1">
        <Text className="text-surface-400 text-sm text-center">{emptyLabel}</Text>
      </View>
    );
  }

  return (
    <View className="mb-1">
      <Text className="text-xs font-semibold text-surface-500 mb-2">{t('reportPreview')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          <View className="flex-row bg-surface-100 rounded-t-lg border border-surface-200">
            {headers.map((h) => (
              <Text
                key={h}
                className="text-[10px] font-bold text-surface-600 px-2 py-2 w-24"
                numberOfLines={2}
              >
                {h}
              </Text>
            ))}
          </View>
          <ScrollView style={{ maxHeight: 260 }} nestedScrollEnabled>
            {rows.map((row, idx) => (
              <View
                key={`r-${idx}`}
                className={`flex-row border-l border-r border-b border-surface-100 ${
                  idx % 2 === 0 ? 'bg-white' : 'bg-surface-50'
                }`}
              >
                {row.map((cell, cIdx) => (
                  <Text
                    key={`c-${idx}-${cIdx}`}
                    className="text-[11px] text-surface-700 px-2 py-2 w-24"
                    numberOfLines={2}
                  >
                    {cell || '—'}
                  </Text>
                ))}
              </View>
            ))}
          </ScrollView>
        </View>
      </ScrollView>
      {total > rows.length && (
        <Text className="text-[10px] text-surface-400 mt-1">{truncatedLabel}</Text>
      )}
    </View>
  );
}
