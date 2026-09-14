import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLanguage } from '../context/LanguageContext';

type Period = 'AM' | 'PM';

type Props = {
  label: string;
  value: string;
  /** Always receives 24h HH:mm */
  onChange: (hhmm: string) => void;
  placeholder?: string;
};

const HOURS_12 = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

function snapMinute(m: string): string {
  if (MINUTES.includes(m)) return m;
  return MINUTES.reduce((best, cand) =>
    Math.abs(Number(cand) - Number(m)) < Math.abs(Number(best) - Number(m)) ? cand : best,
  );
}

function parseTo12(value: string): { hour12: string; minute: string; period: Period } {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return { hour12: '9', minute: '00', period: 'AM' };
  let h24 = Number(match[1]);
  const minute = snapMinute(match[2]);
  if (!Number.isFinite(h24) || h24 < 0 || h24 > 23) h24 = 9;
  const period: Period = h24 >= 12 ? 'PM' : 'AM';
  let hour12 = h24 % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour12: String(hour12), minute, period };
}

function to24(hour12: string, minute: string, period: Period): string {
  let h = Number(hour12);
  if (!Number.isFinite(h) || h < 1 || h > 12) h = 9;
  if (period === 'AM') {
    h = h === 12 ? 0 : h;
  } else {
    h = h === 12 ? 12 : h + 12;
  }
  return `${String(h).padStart(2, '0')}:${snapMinute(minute)}`;
}

export function formatTime12h(hhmm: string): string {
  const { hour12, minute, period } = parseTo12(hhmm);
  return `${hour12}:${minute} ${period}`;
}

export default function TimeField({
  label,
  value,
  onChange,
  placeholder,
}: Props) {
  const { t } = useLanguage();
  const resolvedPlaceholder = placeholder || t('selectTime');
  const initial = parseTo12(value || '09:00');
  const [open, setOpen] = useState(false);
  const [hour12, setHour12] = useState(initial.hour12);
  const [minute, setMinute] = useState(initial.minute);
  const [period, setPeriod] = useState<Period>(initial.period);

  const display = useMemo(() => {
    if (!value) return resolvedPlaceholder;
    return formatTime12h(value);
  }, [value, resolvedPlaceholder]);

  const openPicker = () => {
    const parsed = parseTo12(value || '09:00');
    setHour12(parsed.hour12);
    setMinute(parsed.minute);
    setPeriod(parsed.period);
    setOpen(true);
  };

  const confirm = () => {
    onChange(to24(hour12, minute, period));
    setOpen(false);
  };

  return (
    <View className="mb-3">
      <Text className="text-xs text-surface-400 mb-1">{label}</Text>
      <TouchableOpacity
        onPress={openPicker}
        activeOpacity={0.85}
        className="border border-surface-200 rounded-xl px-3 h-11 flex-row items-center justify-between bg-white"
      >
        <Text className={`text-base ${value ? 'text-surface-800' : 'text-surface-500'}`}>
          {display}
        </Text>
        <MaterialCommunityIcons name="clock-outline" size={22} color="#64748B" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setOpen(false)} />
          <View className="bg-white rounded-2xl p-4 mx-5" style={styles.sheet}>
            <Text className="text-base font-semibold text-surface-800 mb-3 text-center">
              {t('selectTime')}
            </Text>
            <View className="flex-row mb-3">
              <TouchableOpacity
                onPress={() => setPeriod('AM')}
                className={`flex-1 h-10 rounded-xl items-center justify-center mr-2 ${
                  period === 'AM' ? 'bg-primary-500' : 'bg-surface-100'
                }`}
              >
                <Text
                  className={`font-bold ${period === 'AM' ? 'text-white' : 'text-surface-600'}`}
                >
                  {t('periodAm')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setPeriod('PM')}
                className={`flex-1 h-10 rounded-xl items-center justify-center ${
                  period === 'PM' ? 'bg-primary-500' : 'bg-surface-100'
                }`}
              >
                <Text
                  className={`font-bold ${period === 'PM' ? 'text-white' : 'text-surface-600'}`}
                >
                  {t('periodPm')}
                </Text>
              </TouchableOpacity>
            </View>
            <View className="flex-row">
              <View className="flex-1 mr-2">
                <Text className="text-xs text-surface-400 mb-2 text-center">{t('hour')}</Text>
                <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
                  {HOURS_12.map((h) => (
                    <TouchableOpacity
                      key={h}
                      onPress={() => setHour12(h)}
                      className={`h-10 rounded-lg items-center justify-center mb-1 ${
                        hour12 === h ? 'bg-primary-500' : 'bg-surface-50'
                      }`}
                    >
                      <Text
                        className={hour12 === h ? 'text-white font-semibold' : 'text-surface-700'}
                      >
                        {h}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View className="flex-1 ml-2">
                <Text className="text-xs text-surface-400 mb-2 text-center">{t('minute')}</Text>
                <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
                  {MINUTES.map((m) => (
                    <TouchableOpacity
                      key={m}
                      onPress={() => setMinute(m)}
                      className={`h-10 rounded-lg items-center justify-center mb-1 ${
                        minute === m ? 'bg-primary-500' : 'bg-surface-50'
                      }`}
                    >
                      <Text
                        className={minute === m ? 'text-white font-semibold' : 'text-surface-700'}
                      >
                        {m}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
            <Text className="text-center text-surface-500 text-sm mt-3">
              {hour12}:{minute} {period === 'AM' ? t('periodAm') : t('periodPm')}
            </Text>
            <View className="flex-row mt-4">
              <TouchableOpacity
                onPress={() => setOpen(false)}
                className="flex-1 h-11 rounded-xl bg-surface-100 items-center justify-center mr-2"
              >
                <Text className="text-surface-600 font-semibold">{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirm}
                className="flex-1 h-11 rounded-xl bg-primary-500 items-center justify-center"
              >
                <Text className="text-white font-semibold">{t('done')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
  },
  sheet: {
    zIndex: 1,
  },
});
