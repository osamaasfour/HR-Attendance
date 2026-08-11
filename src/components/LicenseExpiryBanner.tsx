/**
 * Inline warning banner when company license is nearing expiry.
 */

import React from 'react';
import { View, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCompany } from '../context/CompanyContext';
import { useLanguage } from '../context/LanguageContext';
import { checkTenantLicense } from '../utils/tenantLicense';

export function LicenseExpiryBanner({ className = '' }: { className?: string }) {
  const { tenant } = useCompany();
  const { t } = useLanguage();
  const check = checkTenantLicense(tenant);

  if (!check.expiringSoon || check.daysLeft == null || !check.expiresOn) {
    return null;
  }

  const urgent = check.daysLeft <= 3;

  return (
    <View
      className={`rounded-xl px-3 py-3 flex-row items-start border ${
        urgent
          ? 'bg-danger-50 border-danger-200'
          : 'bg-warning-50 border-warning-100'
      } ${className}`}
    >
      <MaterialCommunityIcons
        name="alert-circle-outline"
        size={22}
        color={urgent ? '#DC2626' : '#D97706'}
      />
      <View className="flex-1 ml-2">
        <Text
          className={`text-sm font-semibold ${
            urgent ? 'text-danger-700' : 'text-warning-600'
          }`}
        >
          {t('licenseExpiringSoonTitle')}
        </Text>
        <Text
          className={`text-xs mt-0.5 leading-4 ${
            urgent ? 'text-danger-600' : 'text-warning-600'
          }`}
        >
          {t('licenseExpiringSoonMessage', {
            days: check.daysLeft,
            date: check.expiresOn,
          })}
        </Text>
      </View>
    </View>
  );
}
