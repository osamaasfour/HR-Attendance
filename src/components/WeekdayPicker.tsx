import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useLanguage } from '../context/LanguageContext';
import type { TranslationKey } from '../i18n/translations';
import type { WeekdayNumber } from '../types';
import { WEEKDAY_KEYS } from '../utils/workScheduleForm';

type Props = {
  offDays: WeekdayNumber[];
  onToggle: (day: WeekdayNumber) => void;
};

/** Selected = working day; unselected = weekly off. */
export function WeekdayPicker({ offDays, onToggle }: Props) {
  const { t } = useLanguage();

  return (
    <View className="flex-row flex-wrap mb-4">
      {WEEKDAY_KEYS.map(({ day, labelKey }) => {
        const isWorking = !offDays.includes(day);
        return (
          <TouchableOpacity
            key={day}
            onPress={() => onToggle(day)}
            className={`mr-2 mb-2 px-3 py-2.5 rounded-xl min-w-[52px] items-center ${
              isWorking ? 'bg-primary-500' : 'bg-surface-100'
            }`}
          >
            <Text
              className={`text-xs font-bold ${isWorking ? 'text-white' : 'text-surface-500'}`}
            >
              {t(labelKey as TranslationKey)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
