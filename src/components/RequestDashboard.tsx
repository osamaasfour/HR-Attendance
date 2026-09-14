/**
 * Shared request status & history dashboard for staff and managers.
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Linking,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLanguage } from '../context/LanguageContext';
import { requestTypeKey } from '../i18n/translations';
import type { HrRequest, HrRequestStatus } from '../types';
import { colors } from '../constants/colors';

export type RequestDashboardMode = 'staff' | 'manager';

type StatusFilter = 'all' | HrRequestStatus;

const STATUS_COLORS: Record<HrRequestStatus, { bg: string; text: string }> = {
  pending: { bg: 'bg-amber-50', text: 'text-amber-700' },
  approved: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  rejected: { bg: 'bg-red-50', text: 'text-red-600' },
};

function formatCreatedAt(req: HrRequest): string {
  const ts = req.createdAt as any;
  if (!ts) return '';
  try {
    const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
    return d.toLocaleString();
  } catch {
    return '';
  }
}

type Props = {
  mode: RequestDashboardMode;
  requests: HrRequest[];
  isLoading: boolean;
  onRefresh: () => void;
  /** When manager is deciding on a pending item */
  onDecide?: (id: string, userId: string, status: 'approved' | 'rejected') => void;
  busyId?: string | null;
  emptyLabel?: string;
};

export default function RequestDashboard({
  mode,
  requests,
  isLoading,
  onRefresh,
  onDecide,
  busyId,
  emptyLabel,
}: Props) {
  const { t } = useLanguage();
  const [filter, setFilter] = useState<StatusFilter>('all');

  const counts = useMemo(() => {
    const c = { all: requests.length, pending: 0, approved: 0, rejected: 0 };
    for (const r of requests) {
      if (r.status === 'pending') c.pending += 1;
      else if (r.status === 'approved') c.approved += 1;
      else if (r.status === 'rejected') c.rejected += 1;
    }
    return c;
  }, [requests]);

  const filtered = useMemo(() => {
    if (filter === 'all') return requests;
    return requests.filter((r) => r.status === filter);
  }, [requests, filter]);

  const chips: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'all', label: t('all'), count: counts.all },
    { key: 'pending', label: t('pending'), count: counts.pending },
    { key: 'approved', label: t('approved'), count: counts.approved },
    { key: 'rejected', label: t('rejected'), count: counts.rejected },
  ];

  const statusText = (status: HrRequestStatus) => {
    if (status === 'pending') return t('pending');
    if (status === 'approved') return t('approved');
    return t('rejected');
  };

  return (
    <View className="flex-1">
      <View className="flex-row flex-wrap px-4 pt-3 pb-2">
        {chips.map((chip) => {
          const active = filter === chip.key;
          return (
            <TouchableOpacity
              key={chip.key}
              onPress={() => setFilter(chip.key)}
              className={`mr-2 mb-2 px-3 py-2 rounded-full flex-row items-center ${
                active ? 'bg-primary-500' : 'bg-white border border-surface-200'
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  active ? 'text-white' : 'text-surface-600'
                }`}
              >
                {chip.label}
              </Text>
              <View
                className={`ml-1.5 min-w-[18px] h-[18px] px-1 rounded-full items-center justify-center ${
                  active ? 'bg-white/25' : 'bg-surface-100'
                }`}
              >
                <Text
                  className={`text-[10px] font-bold ${
                    active ? 'text-white' : 'text-surface-500'
                  }`}
                >
                  {chip.count}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View className="flex-row px-4 mb-2">
        <StatMini
          icon="clock-outline"
          label={t('pending')}
          value={counts.pending}
          color="#D97706"
        />
        <StatMini
          icon="check-circle-outline"
          label={t('approved')}
          value={counts.approved}
          color={colors.accent700}
        />
        <StatMini
          icon="close-circle-outline"
          label={t('rejected')}
          value={counts.rejected}
          color="#DC2626"
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        ListEmptyComponent={
          <Text className="text-center text-surface-400 mt-10">
            {emptyLabel || t('requestsFilterEmpty')}
          </Text>
        }
        renderItem={({ item }) => {
          const colors = STATUS_COLORS[item.status] || STATUS_COLORS.pending;
          const showActions =
            mode === 'manager' && item.status === 'pending' && !!onDecide;

          return (
            <View className="bg-white rounded-xl p-4 mb-3 border border-surface-100">
              <View className="flex-row justify-between items-start">
                <View className="flex-1 mr-2">
                  {mode === 'manager' && (
                    <Text className="font-semibold text-surface-800">{item.userName}</Text>
                  )}
                  <Text
                    className={`font-semibold text-surface-800 ${
                      mode === 'manager' ? 'text-sm mt-0.5' : ''
                    }`}
                  >
                    {t(requestTypeKey(item.type))}
                    {item.days ? ` · ${item.days}d` : ''}
                  </Text>
                  {mode === 'manager' && !!item.employeeId && (
                    <Text className="text-surface-400 text-xs">{item.employeeId}</Text>
                  )}
                </View>
                <View className={`px-2.5 py-1 rounded-full ${colors.bg}`}>
                  <Text className={`text-[10px] font-bold uppercase ${colors.text}`}>
                    {statusText(item.status)}
                  </Text>
                </View>
              </View>

              <Text className="text-surface-500 text-sm mt-2">
                {item.startDate}
                {item.endDate && item.endDate !== item.startDate
                  ? ` → ${item.endDate}`
                  : ''}
              </Text>
              {!!item.location && (
                <Text className="text-surface-400 text-sm">
                  {t('location')}: {item.location}
                </Text>
              )}
              {!!item.plannedTime && (
                <Text className="text-surface-400 text-sm">
                  {t('time')}: {item.plannedTime}
                </Text>
              )}
              {!!item.minutes && (
                <Text className="text-surface-400 text-sm">
                  {t('minutes')}: {item.minutes}
                </Text>
              )}
              {!!item.attachmentUrl && (
                <TouchableOpacity onPress={() => Linking.openURL(item.attachmentUrl!)}>
                  <Text className="text-primary-500 text-sm mt-1">
                    {t('document')}: {item.attachmentName || t('viewAttachment')}
                  </Text>
                </TouchableOpacity>
              )}
              <Text className="text-surface-400 text-sm mt-1">{item.reason}</Text>
              {!!formatCreatedAt(item) && (
                <Text className="text-surface-600 text-[11px] mt-2">
                  {t('submittedAt')} {formatCreatedAt(item)}
                </Text>
              )}

              {showActions && (
                <View className="flex-row mt-3">
                  <TouchableOpacity
                    disabled={busyId === item.id}
                    onPress={() => onDecide!(item.id, item.userId, 'approved')}
                    className="flex-1 bg-emerald-500 rounded-xl h-11 items-center justify-center mr-2"
                  >
                    <Text className="text-white font-semibold">{t('approve')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={busyId === item.id}
                    onPress={() => onDecide!(item.id, item.userId, 'rejected')}
                    className="flex-1 bg-red-500 rounded-xl h-11 items-center justify-center"
                  >
                    <Text className="text-white font-semibold">{t('reject')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

function StatMini({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View className="flex-1 bg-white rounded-xl border border-surface-100 p-3 mr-2 last:mr-0">
      <MaterialCommunityIcons name={icon} size={18} color={color} />
      <Text className="text-lg font-bold text-surface-800 mt-1">{value}</Text>
      <Text className="text-[10px] text-surface-400 uppercase font-medium">{label}</Text>
    </View>
  );
}
