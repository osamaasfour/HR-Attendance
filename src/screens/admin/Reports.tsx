/**
 * Admin Reports — monthly attendance, delays, absences, requests, vacation balances
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { db, collection, getDocs } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import { useAppAlert } from '../../context/AlertContext';
import { useCompany } from '../../context/CompanyContext';
import { useLanguage } from '../../context/LanguageContext';
import PeriodField from '../../components/PeriodField';
import { toCsv, downloadCsv } from '../../utils/csv';
import {
  buildVacationBalances,
  countAbsencesForUser,
  currentPeriod,
  filterAttendanceByPeriod,
  filterDelays,
  filterRequestsByPeriod,
  formatTsTime,
  periodBounds,
} from '../../utils/reports';
import type {
  AttendanceRecord,
  HrRequest,
  UserData,
  WorkShift,
} from '../../types';

const PREVIEW_LIMIT = 80;

export default function AdminReportsScreen() {
  const { user } = useAuth();
  const { showAlert } = useAppAlert();
  const { tenant } = useCompany();
  const { t } = useLanguage();
  const tid = user?.tenantId || tenant.id || 'default';

  const [period, setPeriod] = useState(currentPeriod());
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [users, setUsers] = useState<UserData[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [requests, setRequests] = useState<HrRequest[]>([]);
  const [shifts, setShifts] = useState<WorkShift[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [uSnap, aSnap, rSnap, sSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'attendance')),
        getDocs(collection(db, 'hrRequests')),
        getDocs(collection(db, 'workShifts')),
      ]);
      setUsers(
        uSnap.docs
          .map((d) => ({ ...(d.data() as UserData), uid: d.id }))
          .filter((u) => (u.tenantId || 'default') === tid),
      );
      setAttendance(
        aSnap.docs
          .map((d) => ({ ...(d.data() as AttendanceRecord), id: d.id }))
          .filter((a) => (a.tenantId || 'default') === tid || !a.tenantId),
      );
      setRequests(
        rSnap.docs.map((d) => ({ ...(d.data() as HrRequest), id: d.id })),
      );
      setShifts(
        sSnap.docs
          .map((d) => ({ ...(d.data() as WorkShift), id: d.id }))
          .filter((s) => (s.tenantId || 'default') === tid && s.active !== false),
      );
    } catch (e: any) {
      showAlert(t('error'), e?.message || t('actionFailed'));
    } finally {
      setLoading(false);
    }
  }, [tid, showAlert, t]);

  useEffect(() => {
    load();
  }, [load]);

  const shiftsById = useMemo(() => new Map(shifts.map((s) => [s.id, s])), [shifts]);
  const periodAtt = useMemo(
    () =>
      filterAttendanceByPeriod(attendance, period).sort((a, b) =>
        (b.date || '').localeCompare(a.date || ''),
      ),
    [attendance, period],
  );
  const periodDelays = useMemo(() => filterDelays(periodAtt), [periodAtt]);
  const periodReq = useMemo(
    () =>
      filterRequestsByPeriod(requests, period).sort((a, b) =>
        (b.startDate || '').localeCompare(a.startDate || ''),
      ),
    [requests, period],
  );
  const vacBalances = useMemo(
    () => buildVacationBalances(users, requests, Number(period.slice(0, 4))),
    [users, requests, period],
  );

  const absenceRows = useMemo(() => {
    const rows: {
      employeeId: string;
      fullName: string;
      absentDays: number;
      dates: string;
    }[] = [];
    users
      .filter((u) => u.active !== false && (u.role === 'employee' || u.role === 'manager'))
      .forEach((u) => {
        const { absentDays, absentDates } = countAbsencesForUser({
          user: u,
          period,
          attendance,
          requests,
          shiftsById,
          tenantSchedule: tenant.workSchedule,
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
  }, [users, period, attendance, requests, shiftsById, tenant.workSchedule]);

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
        toCsv(
          ['employeeId', 'name', 'date', 'clockIn', 'clockOut', 'lateMinutes', 'earlyLeaveMinutes'],
          rows,
        ),
      );
    });

  const exportAbsences = () =>
    runExport('abs', async () => {
      const rows = absenceRows.map((r) => [
        r.employeeId,
        r.fullName,
        r.absentDays,
        r.dates,
      ]);
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
        toCsv(
          ['employeeId', 'name', 'type', 'start', 'end', 'days', 'status', 'reason'],
          rows,
        ),
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
        toCsv(
          ['employeeId', 'name', 'allowance', 'used', 'adjustment', 'remaining'],
          rows,
        ),
      );
    });

  const bounds = periodBounds(period);

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
        <View className="bg-white rounded-2xl p-4 mb-4 border border-surface-100">
          <PeriodField label={t('reportPeriod')} value={period} onChange={setPeriod} />
          <Text className="text-[11px] text-surface-400 mt-2">
            {bounds.start} → {bounds.end}
          </Text>
        </View>

        <ReportCard
          title={t('reportMonthlyAttendance')}
          summary={t('reportRowsCount', { count: periodAtt.length })}
          exportLabel={t('exportAttendanceCsv')}
          busy={exporting === 'att'}
          onExport={exportAttendance}
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

        <ReportCard
          title={t('reportDelays')}
          summary={t('reportRowsCount', { count: periodDelays.length })}
          exportLabel={t('exportDelaysCsv')}
          busy={exporting === 'delay'}
          onExport={exportDelays}
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

        <ReportCard
          title={t('reportAbsences')}
          summary={t('reportAbsenceSummary', {
            people: absenceRows.length,
            days: absenceRows.reduce((s, r) => s + r.absentDays, 0),
          })}
          exportLabel={t('exportAbsencesCsv')}
          busy={exporting === 'abs'}
          onExport={exportAbsences}
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

        <ReportCard
          title={t('reportRequests')}
          summary={t('reportRowsCount', { count: periodReq.length })}
          exportLabel={t('exportRequestsCsv')}
          busy={exporting === 'req'}
          onExport={exportRequests}
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
              r.type || '',
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
      </View>
    </ScrollView>
  );
}

function ReportCard({
  title,
  summary,
  exportLabel,
  busy,
  onExport,
  children,
}: {
  title: string;
  summary: string;
  exportLabel: string;
  busy: boolean;
  onExport: () => void;
  children: React.ReactNode;
}) {
  return (
    <View className="bg-white rounded-2xl p-4 mb-4 border border-surface-100">
      <Text className="font-semibold text-surface-800 mb-1">{title}</Text>
      <Text className="text-surface-500 text-sm mb-3">{summary}</Text>
      {children}
      <TouchableOpacity
        onPress={onExport}
        disabled={busy}
        className="bg-primary-500 rounded-xl h-12 items-center justify-center mt-3"
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-white font-semibold">{exportLabel}</Text>
        )}
      </TouchableOpacity>
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
