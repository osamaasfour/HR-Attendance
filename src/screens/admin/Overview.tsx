/**
 * Admin Overview Screen
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  Pressable,
  Platform,
  TextInput,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAdminData } from '../../hooks/useAdminData';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useCompany } from '../../context/CompanyContext';
import { formatTime, toDateString } from '../../utils/time';
import { LicenseExpiryBanner } from '../../components/LicenseExpiryBanner';
import BarChart from '../../components/charts/BarChart';
import { buildWeekAttendanceBars, lastNDateKeys } from '../../utils/reportAnalytics';
import { useHolidays } from '../../hooks/useHolidays';
import { findHolidayOnDate, holidayDateSet } from '../../utils/holidays';
import { loadTenantRecords } from '../../utils/tenantScope';
import type { Branch, Department, EmployeeStatus } from '../../types';
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
  const clampedRate = Math.max(0, Math.min(100, rate));

  return (
    <View className="flex-row items-center">
      <View className="w-[112px] h-[112px] items-center justify-center">
        <View className="w-[96px] h-[96px] rounded-full bg-surface-100 items-center justify-center">
          <View
            className="absolute inset-2 rounded-full"
            style={{ backgroundColor: colors.primary50 }}
          />
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
      className={`px-4 py-2 rounded-full mr-2 mb-2 ${
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
        <Text className="text-surface-400 text-xs mt-0.5">
          {employee.employeeId}
          {employee.branchName ? ` · ${employee.branchName}` : ''}
          {employee.department ? ` · ${employee.department}` : ''}
        </Text>
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
  const { user } = useAuth();
  const { tenant } = useCompany();
  const { employees, stats, weekRecords, isRefreshing, refresh } = useAdminData();
  const { holidays } = useHolidays();
  const tenantId = user?.tenantId || tenant.id || 'default';
  const [filter, setFilter] = useState<EmployeeFilter>('all');
  const [branchId, setBranchId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [search, setSearch] = useState('');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const todayKey = toDateString();
  const todayHoliday = findHolidayOnDate(todayKey, holidays);

  useEffect(() => {
    void (async () => {
      const [branchRows, deptRows] = await Promise.all([
        loadTenantRecords<Branch>('branches', tenantId),
        loadTenantRecords<Department>('departments', tenantId),
      ]);
      setBranches(branchRows.filter((b) => b.active !== false).sort((a, b) => a.name.localeCompare(b.name)));
      setDepartments(
        deptRows.filter((d) => d.active !== false).sort((a, b) => a.name.localeCompare(b.name)),
      );
    })();
  }, [tenantId]);

  const scopedEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((employee) => {
      if (branchId && employee.branchId !== branchId) return false;
      if (departmentId && employee.departmentId !== departmentId) return false;
      if (q) {
        const name = (employee.fullName || '').toLowerCase();
        const id = (employee.employeeId || '').toLowerCase();
        if (!name.includes(q) && !id.includes(q)) return false;
      }
      return true;
    });
  }, [employees, branchId, departmentId, search]);

  const filteredEmployees = useMemo(() => {
    switch (filter) {
      case 'checked-in':
        return scopedEmployees.filter((employee) => employee.isCheckedIn);
      case 'absent':
        return todayHoliday ? [] : scopedEmployees.filter((employee) => !employee.isCheckedIn);
      default:
        return scopedEmployees;
    }
  }, [scopedEmployees, filter, todayHoliday]);

  const scopedCheckedIn = scopedEmployees.filter((e) => e.isCheckedIn).length;
  const scopedAbsent = todayHoliday ? 0 : Math.max(0, scopedEmployees.length - scopedCheckedIn);
  const attendanceRate =
    scopedEmployees.length > 0
      ? Math.round((scopedCheckedIn / scopedEmployees.length) * 100)
      : 0;

  const deptOptions = useMemo(
    () => (branchId ? departments.filter((d) => d.branchId === branchId) : departments),
    [departments, branchId],
  );

  const weekBars = useMemo(() => {
    const locale = language === 'ar' ? 'ar-EG' : 'en-US';
    const weekDates = lastNDateKeys(7);
    return buildWeekAttendanceBars({
      dates: weekDates,
      userIds: new Set(scopedEmployees.map((e) => e.uid)),
      attendance: weekRecords,
      weeklyOffDays: tenant.workSchedule?.weeklyOffDays,
      holidayDates: holidayDateSet(holidays, weekDates[0], weekDates[weekDates.length - 1]),
      locale,
    });
  }, [scopedEmployees, weekRecords, tenant.workSchedule?.weeklyOffDays, language, holidays]);

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
                checkedIn={scopedCheckedIn}
                total={scopedEmployees.length || stats.totalEmployees}
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
                value={scopedEmployees.length || stats.totalEmployees}
                icon="account-group-outline"
                accent="primary"
              />
              <StatCard
                label={t('checkedIn')}
                value={scopedCheckedIn}
                icon="check-circle-outline"
                accent="accent"
              />
              <StatCard
                label={t('absent')}
                value={scopedAbsent}
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

            <TextInput
              className="bg-white border border-surface-200 rounded-xl px-3 h-11 mb-3"
              placeholder={t('overviewSearchPlaceholder')}
              value={search}
              onChangeText={setSearch}
              placeholderTextColor="#94A3B8"
            />

            {branches.length > 0 && (
              <View className="mb-2">
                <Text className="text-xs text-surface-400 mb-1">{t('filterByBranch')}</Text>
                <View className="flex-row flex-wrap">
                  <FilterChip
                    label={t('filterAllBranches')}
                    active={!branchId}
                    onPress={() => {
                      setBranchId('');
                      setDepartmentId('');
                    }}
                  />
                  {branches.map((b) => (
                    <FilterChip
                      key={b.id}
                      label={b.name}
                      active={branchId === b.id}
                      onPress={() => {
                        setBranchId(b.id);
                        setDepartmentId('');
                      }}
                    />
                  ))}
                </View>
              </View>
            )}

            {deptOptions.length > 0 && (
              <View className="mb-2">
                <Text className="text-xs text-surface-400 mb-1">{t('filterByDepartment')}</Text>
                <View className="flex-row flex-wrap">
                  <FilterChip
                    label={t('filterAllDepartments')}
                    active={!departmentId}
                    onPress={() => setDepartmentId('')}
                  />
                  {deptOptions.map((d) => (
                    <FilterChip
                      key={d.id}
                      label={d.name}
                      active={departmentId === d.id}
                      onPress={() => setDepartmentId(d.id)}
                    />
                  ))}
                </View>
              </View>
            )}

            <View className="flex-row flex-wrap mb-4">
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
                {t('reportRowsCount', { count: filteredEmployees.length })}
              </Text>
            </View>
          </View>
        }
        data={filteredEmployees}
        keyExtractor={(item) => item.uid}
        renderItem={({ item }) => <EmployeeRow employee={item} />}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
        ListEmptyComponent={
          <Text className="text-center text-surface-400 mt-6">{t('noFilterResults')}</Text>
        }
      />
    </SafeAreaView>
  );
}
