/**
 * EN / AR language toggle — works before and after login.
 */

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useLanguage } from '../context/LanguageContext';
import type { AppLanguage } from '../i18n/translations';

type Props = {
  /** Show section title + hint (Profile). Compact = pill row only (Login). */
  compact?: boolean;
  onChanged?: (lang: AppLanguage) => void;
};

export default function LanguageSwitcher({ compact = false, onChanged }: Props) {
  const { language, setLanguage, t } = useLanguage();

  const select = async (lang: AppLanguage) => {
    if (lang === language) return;
    await setLanguage(lang);
    onChanged?.(lang);
  };

  return (
    <View className={compact ? '' : 'bg-white rounded-2xl p-4 border border-surface-100'}>
      {!compact && (
        <>
          <Text className="font-semibold text-surface-800 mb-1">{t('chooseLanguage')}</Text>
          <Text className="text-surface-400 text-xs mb-3">{t('languageHint')}</Text>
        </>
      )}
      <View className="flex-row">
        <TouchableOpacity
          onPress={() => select('en')}
          accessibilityRole="button"
          accessibilityState={{ selected: language === 'en' }}
          className={`flex-1 h-11 rounded-xl items-center justify-center mr-2 border ${
            language === 'en'
              ? 'bg-primary-500 border-primary-500'
              : 'bg-white border-surface-200'
          }`}
        >
          <Text
            className={`font-semibold ${
              language === 'en' ? 'text-white' : 'text-surface-600'
            }`}
          >
            {t('english')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => select('ar')}
          accessibilityRole="button"
          accessibilityState={{ selected: language === 'ar' }}
          className={`flex-1 h-11 rounded-xl items-center justify-center border ${
            language === 'ar'
              ? 'bg-primary-500 border-primary-500'
              : 'bg-white border-surface-200'
          }`}
        >
          <Text
            className={`font-semibold ${
              language === 'ar' ? 'text-white' : 'text-surface-600'
            }`}
          >
            {t('arabic')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
