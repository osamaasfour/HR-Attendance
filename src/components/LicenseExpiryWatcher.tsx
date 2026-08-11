/**
 * Shows a once-per-day alert when the company license is about to expire.
 * Targets company admins / managers (and platform admins).
 */

import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { useCompany } from '../context/CompanyContext';
import { useAppAlert } from '../context/AlertContext';
import { useLanguage } from '../context/LanguageContext';
import { checkTenantLicense, todayYmd } from '../utils/tenantLicense';

function storageKey(tenantId: string, expiresOn: string, day: string) {
  return `@hr_license_warn:${tenantId}:${expiresOn}:${day}`;
}

export function LicenseExpiryWatcher() {
  const { user } = useAuth();
  const { tenant, loading } = useCompany();
  const { showAlert } = useAppAlert();
  const { t } = useLanguage();
  const shownRef = useRef<string | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    const role = user.role;
    const canSee =
      user.platformAdmin === true || role === 'admin' || role === 'manager';
    if (!canSee) return;

    const check = checkTenantLicense(tenant);
    if (!check.expiringSoon || check.daysLeft == null || !check.expiresOn) return;

    const day = todayYmd();
    const key = storageKey(tenant.id, check.expiresOn, day);
    if (shownRef.current === key) return;

    let cancelled = false;

    void (async () => {
      try {
        const seen = await AsyncStorage.getItem(key);
        if (cancelled || seen) {
          shownRef.current = key;
          return;
        }
        shownRef.current = key;
        await AsyncStorage.setItem(key, '1');
        showAlert(
          t('licenseExpiringSoonTitle'),
          t('licenseExpiringSoonMessage', {
            days: check.daysLeft!,
            date: check.expiresOn!,
          }),
        );
      } catch {
        /* ignore storage errors */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, user, tenant, showAlert, t]);

  return null;
}
