import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Platform,
  ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useAttendanceContext } from '../../context/AttendanceContext';
import { useAppAlert } from '../../context/AlertContext';
import { useLanguage } from '../../context/LanguageContext';
import { useCompany } from '../../context/CompanyContext';
import { NotificationBell } from '../shared/Notifications';
import {
  calculateDuration,
  formatDuration,
  formatTime,
  getFriendlyDateLabel,
  resolveAttendanceTimezone,
  toDateString,
} from '../../utils/time';
import { colors } from '../../constants/colors';
import { useHolidays } from '../../hooks/useHolidays';
import { findHolidayOnDate, upcomingHolidays } from '../../utils/holidays';

type InfoRowProps = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  tone?: 'neutral' | 'accent' | 'primary';
};

function InfoRow({ icon, label, tone = 'neutral' }: InfoRowProps) {
  const toneClasses = {
    neutral: { bg: 'bg-surface-100', icon: '#64748B' },
    accent: { bg: 'bg-accent-50', icon: colors.accent },
    primary: { bg: 'bg-primary-50', icon: colors.primary },
  }[tone];

  return (
    <View className={`${toneClasses.bg} rounded-2xl px-4 py-3 flex-row items-center mb-2`}>
      <View className="w-9 h-9 rounded-xl bg-white/80 items-center justify-center">
        <MaterialCommunityIcons name={icon} size={18} color={toneClasses.icon} />
      </View>
      <Text className="text-surface-600 text-sm font-medium ml-3 flex-1 leading-5">{label}</Text>
    </View>
  );
}

function useShiftElapsed(clockIn?: Date | null) {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    if (!clockIn) {
      setElapsed('');
      return;
    }

    const tick = () => {
      setElapsed(formatDuration(calculateDuration(clockIn, new Date())));
    };

    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [clockIn]);

  return elapsed;
}

export default function EmployeeHomeScreen() {
  const { user } = useAuth();
  const { showAlert } = useAppAlert();
  const { t, language } = useLanguage();
  const { company } = useCompany();
  const { holidays } = useHolidays();
  const navigation = useNavigation<any>();
  const { clockState, currentRecord, liveTime, handlePunch } = useAttendanceContext();

  const todayKey = toDateString(new Date(), company.timezone);
  const todayHoliday = findHolidayOnDate(todayKey, holidays);
  const nextHolidays = useMemo(() => {
    const d = new Date(todayKey + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    const tomorrow = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return upcomingHolidays(holidays, tomorrow, 5);
  }, [holidays, todayKey]);
  const locale = language === 'ar' ? 'ar-EG' : 'en-US';
  const formatYmd = (ymd: string) => {
    const d = new Date(`${ymd}T12:00:00`);
    if (Number.isNaN(d.getTime())) return ymd;
    return d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const isClockedIn = clockState === 'clocked-in';
  const isLoading = clockState === 'loading';

  const clockInDate = currentRecord?.clockIn?.toDate?.() ?? null;
  const shiftElapsed = useShiftElapsed(isClockedIn ? clockInDate : null);

  const firstName = useMemo(
    () => user?.fullName?.split(' ')[0] || t('roleEmployee'),
    [user?.fullName, t],
  );

  const initials = useMemo(() => {
    const parts = (user?.fullName || t('roleEmployee')).split(' ').filter(Boolean);
    return parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('');
  }, [user?.fullName, t]);

  const onPunchPress = useCallback(async () => {
    const result = await handlePunch();
    if (result.success) {
      showAlert(t('success'), result.message);
    } else if (result.message && !result.message.includes('cancelled')) {
      showAlert(t('error'), result.message);
    }
  }, [handlePunch, showAlert, t]);

  const clockInTime = clockInDate
    ? formatTime(clockInDate, resolveAttendanceTimezone(currentRecord, company.timezone))
    : null;

  const punchLabel = isLoading ? t('working') : isClockedIn ? t('clockOut') : t('clockIn');
  const punchIcon = isClockedIn ? 'logout-variant' : 'login-variant';
  const punchBg = isLoading ? 'bg-surface-300' : isClockedIn ? 'bg-danger-500' : 'bg-accent-500';
  const ringColor = isClockedIn ? colors.ringClockedIn : isLoading ? colors.ringLoading : colors.ringReady;

  const locationHint =
    Platform.OS === 'web' ? t('biometricRequiredMobile') : t('geofenceHint');

  return (
    <SafeAreaView className="flex-1 bg-surface-50" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-start justify-between mb-6">
          <View className="flex-row items-center flex-1 pr-3">
            <View className="w-12 h-12 rounded-2xl bg-primary-500 items-center justify-center">
              <Text className="text-white font-bold text-base">{initials}</Text>
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-surface-400 text-xs font-medium uppercase tracking-wide">
                {getFriendlyDateLabel(new Date())}
              </Text>
              <Text className="text-xl font-bold text-surface-800 mt-0.5">
                {t('hello')}, {firstName}
              </Text>
            </View>
          </View>
          <NotificationBell onPress={() => navigation.navigate('Notifications')} />
        </View>

        <View className="bg-primary-500 rounded-3xl px-5 py-6 shadow-sm">
          <Text className="text-primary-100 text-xs font-semibold uppercase tracking-widest">
            {t('currentTime')}
          </Text>
          <Text
            className="text-white text-5xl font-bold mt-2"
            accessibilityRole="text"
            accessibilityLabel={`${t('currentTime')}: ${liveTime}`}
          >
            {liveTime}
          </Text>
          <View className="flex-row mt-4 gap-3">
            <View
              className={`flex-1 rounded-2xl px-3 py-3 ${
                isClockedIn ? 'bg-white/15' : 'bg-white/10'
              }`}
            >
              <Text className="text-primary-100 text-[11px] font-semibold uppercase">
                {t('status')}
              </Text>
              <View className="flex-row items-center mt-1">
                <MaterialCommunityIcons
                  name={isClockedIn ? 'check-circle' : 'clock-outline'}
                  size={16}
                  color={isClockedIn ? colors.primary300 : colors.ringLoading}
                />
                <Text className="text-white font-semibold text-sm ml-1.5">
                  {isClockedIn
                    ? clockInTime
                      ? `${t('clockedIn')} · ${clockInTime}`
                      : t('clockedIn')
                    : t('notClockedIn')}
                </Text>
              </View>
            </View>
            {isClockedIn && shiftElapsed ? (
              <View className="flex-1 rounded-2xl px-3 py-3 bg-white/15">
                <Text className="text-primary-100 text-[11px] font-semibold uppercase">
                  {t('shiftElapsed')}
                </Text>
                <Text className="text-white font-semibold text-sm mt-1">{shiftElapsed}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View className="items-center mt-10 mb-6">
          <View
            className="w-[196px] h-[196px] rounded-full items-center justify-center"
            style={{ borderWidth: 4, borderColor: ringColor }}
          >
            <Pressable
              onPress={onPunchPress}
              disabled={isLoading}
              accessibilityRole="button"
              accessibilityLabel={punchLabel}
              accessibilityState={{ disabled: isLoading, busy: isLoading }}
              android_ripple={
                Platform.OS === 'android'
                  ? { color: 'rgba(255,255,255,0.25)', borderless: false, radius: 88 }
                  : undefined
              }
              className={`w-44 h-44 rounded-full items-center justify-center ${punchBg}`}
              style={({ pressed }) =>
                Platform.OS === 'ios'
                  ? { transform: [{ scale: pressed && !isLoading ? 0.96 : 1 }] }
                  : undefined
              }
            >
              <MaterialCommunityIcons name={punchIcon} size={44} color="white" />
              <Text className="text-white font-bold text-lg mt-2">{punchLabel}</Text>
            </Pressable>
          </View>
          <Text className="text-surface-500 text-sm mt-5 text-center font-medium">
            {t('punchActionHint')}
          </Text>
        </View>

        {todayHoliday ? (
          <View className="bg-primary-50 rounded-2xl px-4 py-3 mb-4 flex-row items-center border border-primary-100">
            <MaterialCommunityIcons name="calendar-star" size={22} color={colors.primary} />
            <Text className="text-primary-800 text-sm font-semibold ml-3 flex-1">
              {t('todayHoliday', { name: todayHoliday.name })}
            </Text>
          </View>
        ) : null}

        {nextHolidays.length > 0 ? (
          <View className="mb-6">
            <Text className="text-surface-700 font-semibold text-sm mb-3">
              {t('upcomingHolidays')}
            </Text>
            {nextHolidays.map(({ holiday, nextDate, nextEndDate }) => (
              <View
                key={`${holiday.id}-${nextDate}`}
                className="bg-white rounded-2xl px-4 py-3 flex-row items-center mb-2 border border-surface-100"
              >
                <View className="w-9 h-9 rounded-xl bg-primary-50 items-center justify-center">
                  <MaterialCommunityIcons name="calendar-star" size={18} color={colors.primary} />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-surface-800 text-sm font-semibold">{holiday.name}</Text>
                  <Text className="text-surface-400 text-xs mt-0.5">
                    {nextEndDate && nextEndDate !== nextDate
                      ? `${formatYmd(nextDate)} – ${formatYmd(nextEndDate)}`
                      : formatYmd(nextDate)}
                    {holiday.recurring ? ` · ${t('holidayEveryYear')}` : ''}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <Text className="text-surface-700 font-semibold text-sm mb-3">{t('securityChecks')}</Text>
        <InfoRow icon="fingerprint" label={t('biometricHint')} tone="accent" />
        <InfoRow icon="map-marker-radius" label={locationHint} tone="primary" />
        <InfoRow icon="devices" label={t('fingerprintTerminalHint')} tone="neutral" />
      </ScrollView>
    </SafeAreaView>
  );
}
