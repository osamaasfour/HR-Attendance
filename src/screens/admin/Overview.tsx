/**
 * Admin Overview Screen
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  Pressable,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { useAdminData } from '../../hooks/useAdminData';
import { useLanguage } from '../../context/LanguageContext';
import { useCompany } from '../../context/CompanyContext';
import { formatTime, toDateString } from '../../utils/time';
import { LicenseExpiryBanner } from '../../components/LicenseExpiryBanner';
import BarChart from '../../components/charts/BarChart';
import { buildWeekAttendanceBars, lastNDateKeys } from '../../utils/reportAnalytics';
import { useHolidays } from '../../hooks/useHolidays';
import { findHolidayOnDate, holidayDateSet } from '../../utils/holidays';
import type { EmployeeStatus } from '../../types';
import { colors } from '../../constants/colors';

type EmployeeFilter = 'all' | 'checked-in' | 'absent';

function AttendanceRing({
  rate,
  checkedIn,
  total,
}: {
  rate: number;
  checkedIn: number;
  total: number;
}) {
  const { t } = useLanguage();
  const size = 112;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedRate = Math.max(0, Math.min(100, rate));
  const offset = circumference - (clampedRate / 100) * circumference;

  return (
    <View className="flex-row items-center">
      <View className="w-[112px] h-[112px] items-center justify-center">
        <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.muted}
            strokeWidth={stroke}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.accent}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </Svg>
        <View className="absolute items-center">
          <Text className="text-2xl font-bold text-surface-800">{Math.round(clampedRate)}%</Text>
          <Text className="text-surface-400 text-[10px] font-semibold uppercase mt-0.5">
            {t('attendanceRate')}
          </Text>
        </View>
      </View>
      <View className="flex-1 ml-5">
        <Text className="text-surface-800 font-bold text-lg">{t('todaySummary')}</Text>
        <Text className="text-surface-400 text-sm mt-1">
          {checkedIn} {t('ofTotal', { total })}
        </Text>
        <View className="flex-row items-center mt-3">
          <MaterialCommunityIcons name="account-check-outline" size={16} color={colors.accent} />
          <Text className="text-accent-600 text-sm font-medium ml-1.5">
            {checkedIn} {t('checkedIn').toLowerCase()}
          </Text>
        </View>
        <View className="flex-row items-center mt-1.5">
          <MaterialCommunityIcons name="account-off-outline" size={16} color={colors.danger} />
          <Text className="text-danger-600 text-sm font-medium ml-1.5">
            {Math.max(0, total - checkedIn)} {t('absent').toLowerCase()}
          </Text>
        </View>
      </View>
    </View>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number | string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  accent: 'primary' | 'accent' | 'danger' | 'warning';
}) {
  const palette = {
    primary: { bg: 'bg-primary-50', icon: colors.primary, text: 'text-primary-600' },
    accent: { bg: 'bg-accent-50', icon: colors.accent, text: 'text-accent-600' },
    danger: { bg: 'bg-danger-50', icon: colors.danger, text: 'text-danger-600' },
    warning: { bg: 'bg-warning-50', icon: '#F59E0B', text: 'text-warning-600' },
  }[accent];

  return (
    <View className={`${palette.bg} rounded-2xl p-4 flex-1 min-h-[104px]`}>
      <View className="w-9 h-9 rounded-xl bg-white/70 items-center justify-center mb-3">
        <MaterialCommunityIcons name={icon} size={20} color={palette.icon} />
      </View>
      <Text className={`text-2xl font-bold ${palette.text}`}>{value}</Text>
      <Text className="text-surface-500 text-xs font-medium mt-1">{label}</Text>
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      android_ripple={
        Platform.OS === 'android' ? { color: 'rgba(30,58,95,0.12)' } : undefined
      }
      className={`px-4 py-2 rounded-full mr-2 ${
        active ? 'bg-primary-500' : 'bg-white border border-surface-200'
      }`}
      style={({ pressed }) =>
        Platform.OS === 'ios' ? { opacity: pressed ? 0.85 : 1 } : undefined
      }
    >
      <Text
        className={`text-sm font-semibold ${active ? 'text-white' : 'text-surface-600'}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function EmployeeRow({ employee }: { employee: EmployeeStatus }) {
  const { t } = useLanguage();
  const { company } = useCompany();

  return (
    <View className="flex-row items-center bg-white rounded-2xl p-4 mb-2 border border-surface-100">
      <View
        className={`w-2.5 h-2.5 rounded-full ${
          employee.isCheckedIn ? 'bg-accent-500' : 'bg-danger-400'
        }`}
        accessibilityLabel={employee.isCheckedIn ? t('checkedIn') : t('absent')}
      />

      <View className="w-11 h-11 rounded-2xl bg-primary-50 items-center justify-center ml-3">
        <Text className="text-primary-500 font-bold text-sm">
          {employee.fullName
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2)}
        </Text>
      </View>

      <View className="flex-1 ml-3">
        <Text className="text-surface-800 font-semibold text-sm">{employee.fullName}</Text>
        <Text className="text-surface-400 text-xs mt-0.5">{employee.employeeId}</Text>
      </View>

      {employee.isCheckedIn && employee.clockInTime ? (
        <View className="bg-accent-50 px-3 py-1.5 rounded-full flex-row items-center">
          <MaterialCommunityIcons name="clock-outline" size={12} color={colors.accent700} />
          <Text className="text-accent-700 text-xs font-semibold ml-1">
            {t('inAt')} {formatTime(employee.clockInTime, company.timezone)}
          </Text>
        </View>
      ) : (
        <View className="bg-danger-50 px-3 py-1.5 rounded-full">
          <Text className="text-danger-700 text-xs font-semibold">{t('absent')}</Text>
        </View>
      )}
    </View>
  );
}

export default function AdminOverviewScreen() {
  const { t, language } = useLanguage();
  const { tenant } = useCompany();
  const { employees, stats, weekRecords, isRefreshing, refresh } = useAdminData();
  const { holidays } = useHolidays();
  const [filter, setFilter] = useState<EmployeeFilter>('all');
  const todayKey = toDateString();
  const todayHoliday = findHolidayOnDate(todayKey, holidays);
  const absentCount = todayHoliday ? 0 : stats.absentCount;

  const attendanceRate =
    stats.totalEmployees > 0
      ? Math.round((stats.checkedInCount / stats.totalEmployees) * 100)
      : 0;

  const filteredEmployees = useMemo(() => {
    switch (filter) {
      case 'checked-in':
        return employees.filter((employee) => employee.isCheckedIn);
      case 'absent':
        return todayHoliday ? [] : employees.filter((employee) => !employee.isCheckedIn);
      default:
        return employees;
    }
  }, [employees, filter, todayHoliday]);

  const weekBars = useMemo(() => {
    const locale = language === 'ar' ? 'ar-EG' : 'en-US';
    const weekDates = lastNDateKeys(7);
    return buildWeekAttendanceBars({
      dates: weekDates,
      userIds: new Set(employees.map((e) => e.uid)),
      attendance: weekRecords,
      weeklyOffDays: tenant.workSchedule?.weeklyOffDays,
      holidayDates: holidayDateSet(holidays, weekDates[0], weekDates[weekDates.length - 1]),
      locale,
    });
  }, [employees, weekRecords, tenant.workSchedule?.weeklyOffDays, language, holidays]);

  return (
    <SafeAreaView className="flex-1 bg-surface-50" edges={['top']}>
      <View className="px-6 pt-2 pb-4 bg-white border-b border-surface-100">
        <Text className="text-2xl font-bold text-surface-800">{t('adminDashboard')}</Text>
        <Text className="text-surface-400 text-sm mt-1">{t('teamLive')}</Text>
        <LicenseExpiryBanner className="mt-3" />
        {todayHoliday ? (
          <View className="mt-3 bg-primary-50 rounded-2xl px-4 py-3 flex-row items-center">
            <MaterialCommunityIcons name="calendar-star" size={20} color={colors.primary} />
            <Text className="text-primary-700 text-sm font-semibold ml-2 flex-1">
              {t('todayHoliday', { name: todayHoliday.name })}
            </Text>
          </View>
        ) : null}
      </View>

      <FlatList
        ListHeaderComponent={
          <View className="px-6 pt-4 pb-2">
            <View className="bg-white rounded-3xl p-5 mb-4 border border-surface-100">
              <AttendanceRing
                rate={attendanceRate}
                checkedIn={stats.checkedInCount}
                total={stats.totalEmployees}
              />
              <View className="mt-5 pt-4 border-t border-surface-100">
                <Text className="text-xs font-semibold text-surface-500 mb-2">{t('last7Days')}</Text>
                <BarChart
                  items={weekBars.map((d) => ({
                    label: d.label,
                    parts: [
                      { value: d.present, color: colors.primary },
                      { value: d.absent, color: colors.danger },
                    ],
                  }))}
                  legend={[
                    { label: t('presentShort'), color: colors.primary },
                    { label: t('absentShort'), color: colors.danger },
                  ]}
                  emptyLabel={t('chartEmpty')}
                  barWidth={22}
                  height={96}
                />
              </View>
            </View>

            <View className="flex-row gap-3 mb-3">
              <StatCard
                label={t('totalEmployees')}
                value={stats.totalEmployees}
                icon="account-group-outline"
                accent="primary"
              />
              <StatCard
                label={t('checkedIn')}
                value={stats.checkedInCount}
                icon="check-circle-outline"
                accent="accent"
              />
              <StatCard
                label={t('absent')}
                value={absentCount}
                icon="close-circle-outline"
                accent="danger"
              />
            </View>

            {stats.halfDayCount > 0 && (
              <View className="bg-warning-50 rounded-2xl px-4 py-3 mb-4 flex-row items-center">
                <MaterialCommunityIcons name="clock-alert-outline" size={18} color="#D97706" />
                <Text className="text-warning-600 text-sm font-medium ml-2">
                  {t('halfDay')}: {stats.halfDayCount}
                </Text>
              </View>
            )}

            <View className="flex-row mb-4">
              <FilterChip
                label={t('all')}
                active={filter === 'all'}
                onPress={() => setFilter('all')}
              />
              <FilterChip
                label={t('checkedIn')}
                active={filter === 'checked-in'}
                onPress={() => setFilter('checked-in')}
              />
              <FilterChip
                label={t('absent')}
                active={filter === 'absent'}
                onPress={() => setFilter('absent')}
              />
            </View>

            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-surface-800 font-bold text-base">{t('allEmployees')}</Text>
              <Text className="text-surface-400 text-xs">
                {t('peopleCount', { count: filteredEmployees.length })}
              </Text>
            </View>
          </View>
        }
        data={filteredEmployees}
        keyExtractor={(item) => item.uid}
        renderItem={({ item }) => <EmployeeRow employee={item} />}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View className="bg-white rounded-2xl p-8 items-center border border-surface-100">
            <MaterialCommunityIcons name="account-search-outline" size={36} color={colors.inactive} />
            <Text className="text-surface-400 text-sm mt-3 text-center">{t('noFilterResults')}</Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      />
    </SafeAreaView>
  );
}
