/**
 * Month/year period picker (YYYY-MM) — no free-text entry.
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLanguage } from '../context/LanguageContext';
import { currentPeriod, formatPeriodLabel, shiftPeriod } from '../utils/reports';

type Props = {
  label?: string;
  value: string;
  onChange: (period: string) => void;
  /** How many months back from current to offer in the picker list */
  monthsBack?: number;
  /** How many months forward from current to offer */
  monthsForward?: number;
};

function buildPeriodOptions(back: number, forward: number): string[] {
  const cur = currentPeriod();
  const out: string[] = [];
  for (let i = -back; i <= forward; i++) {
    out.push(shiftPeriod(cur, i));
  }
  return out.reverse();
}

export default function PeriodField({
  label,
  value,
  onChange,
  monthsBack = 36,
  monthsForward = 3,
}: Props) {
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
  const locale = language === 'ar' ? 'ar-EG' : 'en-US';
  const options = useMemo(
    () => buildPeriodOptions(monthsBack, monthsForward),
    [monthsBack, monthsForward],
  );

  return (
    <View>
      {!!label && <Text className="text-xs text-surface-400 mb-1">{label}</Text>}
      <View className="flex-row items-center">
        <TouchableOpacity
          onPress={() => onChange(shiftPeriod(value, -1))}
          className="w-11 h-11 rounded-xl bg-surface-100 items-center justify-center mr-2"
          accessibilityLabel={t('previousMonth')}
        >
          <MaterialCommunityIcons name="chevron-left" size={26} color="#475569" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setOpen(true)}
          className="flex-1 h-11 border border-surface-200 rounded-xl px-3 flex-row items-center justify-between bg-white"
        >
          <Text className="text-surface-800 font-semibold">
            {formatPeriodLabel(value, locale)}
          </Text>
          <MaterialCommunityIcons name="calendar-month" size={20} color="#64748B" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onChange(shiftPeriod(value, 1))}
          className="w-11 h-11 rounded-xl bg-surface-100 items-center justify-center ml-2"
          accessibilityLabel={t('nextMonth')}
        >
          <MaterialCommunityIcons name="chevron-right" size={26} color="#475569" />
        </TouchableOpacity>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 bg-black/40 justify-end" onPress={() => setOpen(false)}>
          <Pressable
            className="bg-white rounded-t-3xl max-h-[70%] px-4 pt-4 pb-8"
            onPress={() => {}}
          >
            <Text className="text-lg font-bold text-surface-800 mb-3">{t('selectPeriod')}</Text>
            <ScrollView>
              {options.map((p) => {
                const selected = p === value;
                return (
                  <TouchableOpacity
                    key={p}
                    onPress={() => {
                      onChange(p);
                      setOpen(false);
                    }}
                    className={`px-3 py-3 rounded-xl mb-1 flex-row items-center justify-between ${
                      selected ? 'bg-primary-500' : 'bg-surface-50'
                    }`}
                  >
                    <Text
                      className={`font-semibold ${
                        selected ? 'text-white' : 'text-surface-800'
                      }`}
                    >
                      {formatPeriodLabel(p, locale)}
                    </Text>
                    <Text className={`text-xs ${selected ? 'text-white/80' : 'text-surface-400'}`}>
                      {p}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
