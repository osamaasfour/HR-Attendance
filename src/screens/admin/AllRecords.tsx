/**
 * Admin All Records Screen
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAdminData } from '../../hooks/useAdminData';
import { useLanguage } from '../../context/LanguageContext';
import { formatTime, formatDuration, toDateString } from '../../utils/time';
import { toCsv, downloadCsv } from '../../utils/csv';
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
  const inSource =
    record.clockInSource === 'fingerprint' ? t('punchSourceFingerprint') : null;
  const outSource =
    record.clockOutSource === 'fingerprint' ? t('punchSourceFingerprint') : null;

  return (
    <View className="bg-white rounded-xl p-4 mb-3 shadow-sm">
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center flex-1">
          <View className="w-10 h-10 rounded-full bg-primary-50 items-center justify-center mr-3">
            <Text className="text-primary-500 font-bold text-xs">
              {record.userName
                .split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2)}
            </Text>
          </View>
          <View>
            <Text className="text-surface-800 font-semibold text-sm">{record.userName}</Text>
            <Text className="text-surface-400 text-xs">{record.employeeId}</Text>
          </View>
        </View>
        <StatusBadge status={record.status} />
      </View>

      <View className="flex-row justify-between bg-surface-50 rounded-lg p-3">
        <View className="flex-1 items-center">
          <MaterialCommunityIcons name="login-variant" size={18} color="#10B981" />
          <Text className="text-surface-400 text-xs mt-1">{t('clockIn')}</Text>
          <Text className="text-surface-800 font-semibold text-sm mt-0.5">{clockInTime}</Text>
          {inSource ? (
            <Text className="text-surface-400 text-[10px] mt-0.5">{inSource}</Text>
          ) : null}
        </View>

        <View className="w-px bg-surface-200 mx-2" />

        <View className="flex-1 items-center">
          <MaterialCommunityIcons name="logout-variant" size={18} color="#EF4444" />
          <Text className="text-surface-400 text-xs mt-1">{t('clockOut')}</Text>
          <Text className="text-surface-800 font-semibold text-sm mt-0.5">{clockOutTime}</Text>
          {outSource ? (
            <Text className="text-surface-400 text-[10px] mt-0.5">{outSource}</Text>
          ) : null}
        </View>

        <View className="w-px bg-surface-200 mx-2" />

        <View className="flex-1 items-center">
          <MaterialCommunityIcons name="clock-outline" size={18} color="#1E3A5F" />
          <Text className="text-surface-400 text-xs mt-1">{t('hours')}</Text>
          <Text className="text-primary-500 font-semibold text-sm mt-0.5">{hoursWorked}</Text>
        </View>
      </View>
    </View>
  );
}

function EmptyState() {
  const { t } = useLanguage();
  return (
    <View className="flex-1 items-center justify-center py-16">
      <MaterialCommunityIcons name="clipboard-text-outline" size={64} color="#CBD5E1" />
      <Text className="text-surface-400 text-base mt-4">{t('noAttendance')}</Text>
    </View>
  );
}

export default function AdminAllRecordsScreen() {
  const { t } = useLanguage();
  const [selectedDate, setSelectedDate] = useState(toDateString());
  const { todayRecords, isRefreshing, refresh } = useAdminData(selectedDate);

  const shiftDay = (delta: number) => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    setSelectedDate(toDateString(d));
  };

  const exportCsv = async () => {
    const rows = todayRecords.map((r) => [
      r.employeeId,
      r.userName,
      r.date,
      r.clockIn?.toDate?.()?.toLocaleTimeString?.() || '',
      r.clockOut?.toDate?.()?.toLocaleTimeString?.() || '',
      r.totalHours ?? '',
      r.status,
    ]);
    const csv = toCsv(
      ['employeeId', 'name', 'date', 'clockIn', 'clockOut', 'hours', 'status'],
      rows,
    );
    await downloadCsv(`attendance-${selectedDate}.csv`, csv);
  };

  return (
    <View className="flex-1 bg-surface-50">
      <View className="px-6 pt-12 pb-4 bg-white border-b border-surface-100">
        <View className="flex-row items-center justify-between">
          <Text className="text-2xl font-bold text-surface-800">{t('allRecords')}</Text>
          <TouchableOpacity onPress={exportCsv} className="bg-primary-50 px-3 py-2 rounded-lg">
            <Text className="text-primary-500 text-xs font-semibold">{t('exportCsv')}</Text>
          </TouchableOpacity>
        </View>
        <View className="flex-row items-center mt-3">
          <TouchableOpacity onPress={() => shiftDay(-1)} className="px-3 py-2 bg-surface-100 rounded-lg">
            <Text className="text-surface-700 font-semibold">{t('prev')}</Text>
          </TouchableOpacity>
          <Text className="flex-1 text-center text-surface-800 font-semibold">{selectedDate}</Text>
          <TouchableOpacity onPress={() => shiftDay(1)} className="px-3 py-2 bg-surface-100 rounded-lg">
            <Text className="text-surface-700 font-semibold">{t('next')}</Text>
          </TouchableOpacity>
        </View>
        <Text className="text-surface-400 text-sm mt-2">
          {t('peopleCount', { count: todayRecords.length })}
        </Text>
      </View>

      <FlatList
        data={todayRecords}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <RecordCard record={item} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor="#1E3A5F"
            colors={['#1E3A5F']}
          />
        }
        ListEmptyComponent={<EmptyState />}
      />
    </View>
  );
}
