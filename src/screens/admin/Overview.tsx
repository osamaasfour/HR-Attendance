/**
 * Admin Overview Screen
 */

import React from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAdminData } from '../../hooks/useAdminData';
import { useLanguage } from '../../context/LanguageContext';
import { formatTime } from '../../utils/time';
import { LicenseExpiryBanner } from '../../components/LicenseExpiryBanner';
import type { EmployeeStatus } from '../../types';

function StatCard({
  label,
  value,
  icon,
  colorClass,
  bgColorClass,
}: {
  label: string;
  value: number | string;
  icon: string;
  colorClass: string;
  bgColorClass: string;
}) {
  return (
    <View className={`${bgColorClass} rounded-xl p-4 flex-1 items-center`}>
      <View className={`w-10 h-10 rounded-full ${bgColorClass} items-center justify-center mb-2`}>
        <MaterialCommunityIcons
          name={icon as any}
          size={22}
          color={
            colorClass === 'text-accent-500'
              ? '#10B981'
              : colorClass === 'text-danger-500'
                ? '#EF4444'
                : colorClass === 'text-warning-500'
                  ? '#F59E0B'
                  : '#1E3A5F'
          }
        />
      </View>
      <Text className={`text-2xl font-bold ${colorClass}`}>{value}</Text>
      <Text className="text-surface-400 text-xs mt-1">{label}</Text>
    </View>
  );
}

function EmployeeRow({ employee }: { employee: EmployeeStatus }) {
  const { t } = useLanguage();
  return (
    <View className="flex-row items-center bg-white rounded-xl p-4 mb-2 shadow-sm">
      <View
        className={`w-3 h-3 rounded-full ${
          employee.isCheckedIn ? 'bg-accent-500' : 'bg-danger-400'
        }`}
      />

      <View className="w-10 h-10 rounded-full bg-primary-50 items-center justify-center ml-3">
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
        <Text className="text-surface-400 text-xs">{employee.employeeId}</Text>
      </View>

      {employee.isCheckedIn && employee.clockInTime ? (
        <View className="bg-accent-50 px-3 py-1 rounded-full">
          <Text className="text-accent-600 text-xs font-medium">
            {t('inAt')} {formatTime(employee.clockInTime)}
          </Text>
        </View>
      ) : (
        <View className="bg-danger-50 px-3 py-1 rounded-full">
          <Text className="text-danger-600 text-xs font-medium">{t('absent')}</Text>
        </View>
      )}
    </View>
  );
}

export default function AdminOverviewScreen() {
  const { t } = useLanguage();
  const { employees, stats, isRefreshing, refresh } = useAdminData();

  return (
    <View className="flex-1 bg-surface-50">
      <View className="px-6 pt-12 pb-4 bg-white border-b border-surface-100">
        <Text className="text-2xl font-bold text-surface-800">{t('adminDashboard')}</Text>
        <Text className="text-surface-400 text-sm mt-1">{t('todaySummary')}</Text>
        <LicenseExpiryBanner className="mt-3" />
      </View>

      <FlatList
        ListHeaderComponent={
          <View className="px-6 pt-4 pb-2">
            <View className="flex-row gap-3 mb-6">
              <StatCard
                label={t('totalEmployees')}
                value={stats.totalEmployees}
                icon="account-group"
                colorClass="text-primary-500"
                bgColorClass="bg-primary-50"
              />
              <StatCard
                label={t('checkedIn')}
                value={stats.checkedInCount}
                icon="check-circle"
                colorClass="text-accent-500"
                bgColorClass="bg-accent-50"
              />
              <StatCard
                label={t('absent')}
                value={stats.absentCount}
                icon="close-circle"
                colorClass="text-danger-500"
                bgColorClass="bg-danger-50"
              />
            </View>
            {stats.halfDayCount > 0 && (
              <Text className="text-surface-400 text-sm mb-2">
                {t('halfDay')}: {stats.halfDayCount}
              </Text>
            )}

            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-surface-700 font-semibold text-base">{t('allEmployees')}</Text>
              <Text className="text-surface-400 text-xs">
                {t('peopleCount', { count: employees.length })}
              </Text>
            </View>
          </View>
        }
        data={employees}
        keyExtractor={(item) => item.uid}
        renderItem={({ item }) => <EmployeeRow employee={item} />}
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor="#1E3A5F"
            colors={['#1E3A5F']}
          />
        }
      />
    </View>
  );
}
