/**
 * Employee History — month filter, attendance + delays, late minutes
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  db,
  collection,
  query,
  where,
  getDocs,
  orderBy,
} from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import PeriodField from '../../components/PeriodField';
import { getFriendlyDateLabel, formatTime, formatDuration } from '../../utils/time';
import {
  currentPeriod,
  filterAttendanceByPeriod,
  filterDelays,
  periodBounds,
} from '../../utils/reports';
import type { AttendanceRecord } from '../../types';
import type { TranslationKey } from '../../i18n/translations';

function statusLabelKey(status: string): TranslationKey {
  switch (status) {
    case 'present':
      return 'present';
    case 'half-day':
      return 'halfDay';
    case 'absent':
      return 'absent';
    case 'late':
      return 'late';
    default:
      return 'status';
  }
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useLanguage();
  let bgColor = 'bg-surface-100';
  let textColor = 'text-surface-500';

  switch (status) {
    case 'present':
      bgColor = 'bg-accent-50';
      textColor = 'text-accent-600';
      break;
    case 'half-day':
      bgColor = 'bg-warning-50';
      textColor = 'text-warning-600';
      break;
    case 'absent':
    case 'late':
      bgColor = 'bg-danger-50';
      textColor = 'text-danger-600';
      break;
  }

  return (
    <View className={`${bgColor} px-2.5 py-1 rounded-full`}>
      <Text className={`${textColor} text-xs font-semibold`}>{t(statusLabelKey(status))}</Text>
    </View>
  );
}

function RecordCard({ record }: { record: AttendanceRecord }) {
  const { t } = useLanguage();
  const clockInTime = record.clockIn ? formatTime(record.clockIn.toDate()) : '—';
  const clockOutTime = record.clockOut ? formatTime(record.clockOut.toDate()) : '—';
  const hoursWorked = record.totalHours
    ? formatDuration(record.totalHours)
    : record.clockIn && !record.clockOut
      ? t('inProgress')
      : '—';
  const late = record.lateMinutes || 0;
  const early = record.earlyLeaveMinutes || 0;
  const inSource =
    record.clockInSource === 'fingerprint' ? t('punchSourceFingerprint') : null;
  const outSource =
    record.clockOutSource === 'fingerprint' ? t('punchSourceFingerprint') : null;

  return (
    <View className="bg-white rounded-xl p-4 mb-3 shadow-sm">
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center">
          <MaterialCommunityIcons name="calendar-blank-outline" size={18} color="#64748B" />
          <Text className="text-surface-700 font-semibold text-sm ml-2">
            {getFriendlyDateLabel(record.date)}
          </Text>
        </View>
        <StatusBadge status={record.status} />
      </View>

      <View className="flex-row justify-between">
        <View className="flex-1">
          <Text className="text-surface-400 text-xs uppercase font-medium">{t('clockIn')}</Text>
          <View className="flex-row items-center mt-1">
            <MaterialCommunityIcons name="login-variant" size={16} color="#10B981" />
            <Text className="text-surface-800 font-medium text-sm ml-1.5">{clockInTime}</Text>
          </View>
          {inSource ? (
            <Text className="text-surface-400 text-[10px] mt-0.5">{inSource}</Text>
          ) : null}
        </View>

        <View className="w-px bg-surface-200 mx-4" />

        <View className="flex-1">
          <Text className="text-surface-400 text-xs uppercase font-medium">{t('clockOut')}</Text>
          <View className="flex-row items-center mt-1">
            <MaterialCommunityIcons name="logout-variant" size={16} color="#EF4444" />
            <Text className="text-surface-800 font-medium text-sm ml-1.5">{clockOutTime}</Text>
          </View>
          {outSource ? (
            <Text className="text-surface-400 text-[10px] mt-0.5">{outSource}</Text>
          ) : null}
        </View>

        <View className="items-end flex-1">
          <Text className="text-surface-400 text-xs uppercase font-medium">{t('hours')}</Text>
          <Text className="text-primary-500 font-semibold text-sm mt-1">{hoursWorked}</Text>
        </View>
      </View>

      {(late > 0 || early > 0) && (
        <View className="flex-row mt-3 pt-2 border-t border-surface-100">
          {late > 0 && (
            <Text className="text-danger-600 text-xs mr-4">
              {t('lateMinutesLabel', { min: late })}
            </Text>
          )}
          {early > 0 && (
            <Text className="text-warning-600 text-xs">
              {t('earlyLeaveMinutesLabel', { min: early })}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

export default function HistoryScreen() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [period, setPeriod] = useState(currentPeriod());
  const [mode, setMode] = useState<'all' | 'delays'>('all');
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { start, end } = periodBounds(period);
      const q = query(
        collection(db, 'attendance'),
        where('userId', '==', user.uid),
        orderBy('date', 'desc'),
      );
      const snap = await getDocs(q);
      const all = snap.docs.map((d) => ({ ...(d.data() as AttendanceRecord), id: d.id }));
      const inMonth = all.filter((r) => r.date >= start && r.date <= end);
      setRecords(inMonth);
    } catch {
      // Fallback without orderBy if index missing
      try {
        const snap = await getDocs(
          query(collection(db, 'attendance'), where('userId', '==', user.uid)),
        );
        const all = snap.docs.map((d) => ({ ...(d.data() as AttendanceRecord), id: d.id }));
        setRecords(filterAttendanceByPeriod(all, period));
      } catch {
        setRecords([]);
      }
    } finally {
      setLoading(false);
    }
  }, [user, period]);

  useEffect(() => {
    load();
  }, [load]);

  const delays = useMemo(() => filterDelays(records), [records]);
  const shown = mode === 'delays' ? delays : records;

  return (
    <View className="flex-1 bg-surface-50">
      <View className="px-6 pt-12 pb-4 bg-white border-b border-surface-100">
        <Text className="text-2xl font-bold text-surface-800">{t('attendanceHistory')}</Text>
        <View className="mt-3 mb-3">
          <PeriodField label={t('reportPeriod')} value={period} onChange={setPeriod} />
        </View>
        <View className="flex-row bg-surface-100 rounded-xl p-1">
          <TouchableOpacity
            onPress={() => setMode('all')}
            className={`flex-1 h-9 rounded-lg items-center justify-center ${
              mode === 'all' ? 'bg-white' : ''
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                mode === 'all' ? 'text-primary-500' : 'text-surface-500'
              }`}
            >
              {t('reportMonthlyAttendance')} ({records.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setMode('delays')}
            className={`flex-1 h-9 rounded-lg items-center justify-center ${
              mode === 'delays' ? 'bg-white' : ''
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                mode === 'delays' ? 'text-primary-500' : 'text-surface-500'
              }`}
            >
              {t('reportDelays')} ({delays.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={shown}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <RecordCard record={item} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={load}
            tintColor="#1E3A5F"
            colors={['#1E3A5F']}
          />
        }
        ListEmptyComponent={
          <View className="items-center justify-center py-16">
            <MaterialCommunityIcons name="calendar-blank-outline" size={64} color="#CBD5E1" />
            <Text className="text-surface-400 text-base mt-4">{t('noAttendance')}</Text>
          </View>
        }
      />
    </View>
  );
}
