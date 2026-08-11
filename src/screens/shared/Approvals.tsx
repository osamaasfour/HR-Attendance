import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useHrRequests } from '../../hooks/useHrRequests';
import { useAppAlert } from '../../context/AlertContext';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import RequestDashboard from '../../components/RequestDashboard';

export default function ApprovalsScreen() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const {
    pendingRequests,
    teamRequests,
    isLoading,
    refreshPending,
    refreshTeam,
    decideRequest,
  } = useHrRequests();
  const { showAlert } = useAppAlert();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tab, setTab] = useState<'pending' | 'history'>('pending');

  const onDecide = (id: string, userId: string, status: 'approved' | 'rejected') => {
    showAlert(
      status === 'approved' ? t('approveConfirm') : t('rejectConfirm'),
      t('willNotifyEmployee'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: status === 'approved' ? t('approve') : t('reject'),
          style: status === 'approved' ? 'default' : 'destructive',
          onPress: async () => {
            setBusyId(id);
            try {
              await decideRequest(id, status, userId);
            } catch (e: any) {
              showAlert(t('error'), e?.message || t('actionFailed'));
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  };

  return (
    <View className="flex-1 bg-surface-50">
      <View className="px-6 pt-12 pb-3 bg-white border-b border-surface-100">
        <Text className="text-2xl font-bold text-surface-800">{t('approvalsTitle')}</Text>
        <Text className="text-surface-400 text-sm mt-1">
          {tab === 'pending'
            ? `${user?.role === 'admin' ? t('all') : t('team')} · ${t('approvalsPendingSubtitle')} · ${pendingRequests.length}`
            : t('approvalsHistorySubtitle')}
        </Text>

        <View className="flex-row mt-3 bg-surface-100 rounded-xl p-1">
          <TouchableOpacity
            onPress={() => setTab('pending')}
            className={`flex-1 h-10 rounded-lg items-center justify-center ${
              tab === 'pending' ? 'bg-white' : ''
            }`}
          >
            <Text
              className={`text-sm font-semibold ${
                tab === 'pending' ? 'text-primary-500' : 'text-surface-500'
              }`}
            >
              {t('approvalsPendingTab')} ({pendingRequests.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setTab('history');
              refreshTeam();
            }}
            className={`flex-1 h-10 rounded-lg items-center justify-center ${
              tab === 'history' ? 'bg-white' : ''
            }`}
          >
            <Text
              className={`text-sm font-semibold ${
                tab === 'history' ? 'text-primary-500' : 'text-surface-500'
              }`}
            >
              {t('approvalsHistoryTab')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {tab === 'pending' ? (
        <RequestDashboard
          mode="manager"
          requests={pendingRequests}
          isLoading={isLoading}
          onRefresh={refreshPending}
          onDecide={onDecide}
          busyId={busyId}
          emptyLabel={t('noPending')}
        />
      ) : (
        <RequestDashboard
          mode="manager"
          requests={teamRequests}
          isLoading={isLoading}
          onRefresh={refreshTeam}
          onDecide={onDecide}
          busyId={busyId}
          emptyLabel={t('requestsFilterEmpty')}
        />
      )}
    </View>
  );
}
