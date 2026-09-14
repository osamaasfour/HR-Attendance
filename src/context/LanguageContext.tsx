/**
 * App language (EN / AR) with RTL support.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { I18nManager, Platform, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  type AppLanguage,
  type TranslationKey,
  translate,
} from '../i18n/translations';

const STORAGE_KEY = '@hr_app_language';

type LanguageContextValue = {
  language: AppLanguage;
  isRTL: boolean;
  setLanguage: (lang: AppLanguage) => Promise<void>;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

async function applyRtl(isRTL: boolean) {
  if (I18nManager.isRTL === isRTL) return;
  I18nManager.allowRTL(isRTL);
  I18nManager.forceRTL(isRTL);
  // Web can flip immediately; native often needs a reload for full layout flip.
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    document.documentElement.lang = isRTL ? 'ar' : 'en';
  }
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>('en');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved === 'ar' || saved === 'en') {
          setLanguageState(saved);
          await applyRtl(saved === 'ar');
        } else if (Platform.OS === 'web' && typeof document !== 'undefined') {
          document.documentElement.dir = 'ltr';
          document.documentElement.lang = 'en';
        }
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const setLanguage = useCallback(async (lang: AppLanguage) => {
    setLanguageState(lang);
    await AsyncStorage.setItem(STORAGE_KEY, lang);
    await applyRtl(lang === 'ar');
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) =>
      translate(language, key, vars),
    [language],
  );

  const value = useMemo(
    () => ({
      language,
      isRTL: language === 'ar',
      setLanguage,
      t,
    }),
    [language, setLanguage, t],
  );

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />
    );
  }

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
