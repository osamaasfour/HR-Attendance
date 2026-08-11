import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useAttendanceContext } from '../../context/AttendanceContext';
import { useAppAlert } from '../../context/AlertContext';
import { useLanguage } from '../../context/LanguageContext';
import { NotificationBell } from '../shared/Notifications';
import { formatTime, getFriendlyDateLabel } from '../../utils/time';

export default function EmployeeHomeScreen() {
  const { user } = useAuth();
  const { showAlert } = useAppAlert();
  const { t } = useLanguage();
  const navigation = useNavigation<any>();
  const { clockState, currentRecord, liveTime, handlePunch } = useAttendanceContext();

  const isClockedIn = clockState === 'clocked-in';
  const isLoading = clockState === 'loading';

  const onPunchPress = useCallback(async () => {
    const result = await handlePunch();
    if (result.success) {
      showAlert(t('success'), result.message);
    } else if (result.message && !result.message.includes('cancelled')) {
      showAlert(t('error'), result.message);
    }
  }, [handlePunch, showAlert, t]);

  const clockInTime = currentRecord?.clockIn
    ? formatTime(currentRecord.clockIn.toDate())
    : null;

  return (
    <SafeAreaView className="flex-1 bg-surface-50" edges={['top']}>
      <View className="flex-1 px-6 pt-4">
        <View className="mb-2 flex-row items-start justify-between">
          <View>
            <Text className="text-surface-400 text-sm">{getFriendlyDateLabel(new Date())}</Text>
            <Text className="text-2xl font-bold text-surface-800 mt-1">
              {t('hello')}, {user?.fullName?.split(' ')[0] || t('roleEmployee')}
            </Text>
          </View>
          <NotificationBell onPress={() => navigation.navigate('Notifications')} />
        </View>

        <View className="bg-white rounded-2xl p-6 mt-4 items-center">
          <Text className="text-surface-400 text-sm font-medium tracking-wider uppercase">
            {t('currentTime')}
          </Text>
          <Text className="text-4xl font-bold text-primary-500 mt-2">{liveTime}</Text>
        </View>

        <View
          className={`mt-4 rounded-2xl px-4 py-3 flex-row items-center ${
            isClockedIn ? 'bg-accent-50' : 'bg-surface-100'
          }`}
        >
          <MaterialCommunityIcons
            name={isClockedIn ? 'check-circle' : 'clock-outline'}
            size={22}
            color={isClockedIn ? '#10B981' : '#94A3B8'}
          />
          <View className="ml-3">
            <Text className="text-surface-400 text-xs font-semibold">{t('status')}</Text>
            <Text
              className={`font-semibold ${isClockedIn ? 'text-accent-500' : 'text-surface-500'}`}
            >
              {isClockedIn
                ? clockInTime
                  ? `${t('clockedIn')} · ${clockInTime}`
                  : t('clockedIn')
                : t('notClockedIn')}
            </Text>
          </View>
        </View>

        <View className="flex-1 items-center justify-center">
          <TouchableOpacity
            onPress={onPunchPress}
            disabled={isLoading}
            activeOpacity={0.85}
            className={`w-44 h-44 rounded-full items-center justify-center ${
              isLoading ? 'bg-surface-300' : isClockedIn ? 'bg-danger-500' : 'bg-accent-500'
            }`}
          >
            <MaterialCommunityIcons
              name={isClockedIn ? 'logout-variant' : 'login-variant'}
              size={44}
              color="white"
            />
            <Text className="text-white font-bold text-lg mt-2">
              {isLoading ? t('working') : isClockedIn ? t('clockOut') : t('clockIn')}
            </Text>
          </TouchableOpacity>
          <Text className="text-surface-400 text-sm mt-4 text-center">{t('biometricHint')}</Text>
          <Text className="text-surface-300 text-xs mt-1 text-center">{t('fingerprintTerminalHint')}</Text>
          <Text className="text-surface-300 text-xs mt-2 text-center">
            {Platform.OS === 'web' ? t('biometricRequiredMobile') : t('geofenceHint')}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
