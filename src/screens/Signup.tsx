/**
 * Signup — join company by invite code only (tenants provisioned by platform).
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useAppAlert } from '../context/AlertContext';
import { useLanguage } from '../context/LanguageContext';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { isValidEmployeeId, normalizeEmployeeId } from '../utils/employeeId';

export default function SignupScreen({ navigation }: { navigation: any }) {
  const { signup } = useAuth();
  const { showAlert } = useAppAlert();
  const { t } = useLanguage();

  const [fullName, setFullName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [tenantCode, setTenantCode] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const isValidForm = (): boolean => {
    if (!fullName.trim() || fullName.trim().length < 2) {
      showAlert(t('missing'), t('fullName'));
      return false;
    }
    const normalizedId = normalizeEmployeeId(employeeId.trim());
    if (!normalizedId || !isValidEmployeeId(normalizedId)) {
      showAlert(t('error'), t('employeeIdFormat'));
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showAlert(t('error'), t('invalidEmail'));
      return false;
    }
    if (password.length < 6) {
      showAlert(t('error'), t('passwordTooShort'));
      return false;
    }
    if (password !== confirmPassword) {
      showAlert(t('error'), t('passwordsMismatch'));
      return false;
    }
    if (!tenantCode.trim()) {
      showAlert(t('missing'), t('tenantCodeHint'));
      return false;
    }
    return true;
  };

  const handleSignup = async () => {
    if (!isValidForm()) return;
    setIsLoading(true);
    try {
      const empId = normalizeEmployeeId(employeeId.trim())!;
      await signup(email.trim().toLowerCase(), password, fullName.trim(), empId, {
        mode: 'join',
        tenantCode: tenantCode.trim(),
      });
    } catch (error: any) {
      console.error('[Signup] Error:', error);
      let message = error?.message || 'An unexpected error occurred.';
      const code = error?.code || '';
      if (code === 'auth/email-already-in-use') {
        message = 'This email is already registered.';
      } else if (code === 'auth/license-expired') {
        message = t('licenseExpiredLogin');
      } else if (code === 'auth/tenant-suspended') {
        message = t('tenantSuspendedLogin');
      } else if (code === 'auth/seat-limit') {
        message = t('seatLimitReached');
      } else if (message.includes('Invalid company')) {
        message = t('invalidTenantCode');
      }
      showAlert(t('error'), message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-3xl font-bold text-primary-500 mb-1">{t('createAccount')}</Text>
        <Text className="text-surface-400 mb-4">{t('joinCompanyHint')}</Text>

        <View className="mb-4">
          <Text className="text-sm font-medium text-surface-500 mb-2">{t('language')}</Text>
          <LanguageSwitcher compact />
        </View>

        <Text className="text-xs text-surface-400 mb-1">{t('tenantCode')}</Text>
        <TextInput
          className="border border-surface-200 rounded-xl px-3 h-12 mb-1"
          value={tenantCode}
          onChangeText={setTenantCode}
          autoCapitalize="none"
          placeholder="ecf-hr"
          placeholderTextColor="#CBD5E1"
        />
        <Text className="text-surface-400 text-[11px] mb-3">{t('tenantCodeHint')}</Text>

        <Text className="text-xs text-surface-400 mb-1">{t('fullName')}</Text>
        <TextInput
          className="border border-surface-200 rounded-xl px-3 h-12 mb-3"
          value={fullName}
          onChangeText={setFullName}
          placeholderTextColor="#CBD5E1"
        />

        <Text className="text-xs text-surface-400 mb-1">{t('employeeId')}</Text>
        <TextInput
          className="border border-surface-200 rounded-xl px-3 h-12 mb-3"
          value={employeeId}
          onChangeText={setEmployeeId}
          keyboardType="number-pad"
          maxLength={5}
          placeholder="00001"
          placeholderTextColor="#CBD5E1"
        />
        <Text className="text-[10px] text-surface-400 mb-3">{t('employeeIdFormat')}</Text>

        <Text className="text-xs text-surface-400 mb-1">{t('email')}</Text>
        <TextInput
          className="border border-surface-200 rounded-xl px-3 h-12 mb-3"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholderTextColor="#CBD5E1"
        />

        <Text className="text-xs text-surface-400 mb-1">{t('password')}</Text>
        <View className="flex-row items-center border border-surface-200 rounded-xl px-3 h-12 mb-3">
          <TextInput
            className="flex-1"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!isPasswordVisible}
            placeholderTextColor="#CBD5E1"
          />
          <TouchableOpacity onPress={() => setIsPasswordVisible((v) => !v)}>
            <MaterialCommunityIcons
              name={isPasswordVisible ? 'eye-off' : 'eye'}
              size={22}
              color="#94A3B8"
            />
          </TouchableOpacity>
        </View>

        <Text className="text-xs text-surface-400 mb-1">{t('confirmPassword')}</Text>
        <TextInput
          className="border border-surface-200 rounded-xl px-3 h-12 mb-4"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          placeholderTextColor="#CBD5E1"
        />

        <TouchableOpacity
          onPress={handleSignup}
          disabled={isLoading}
          className="bg-primary-500 rounded-xl h-12 items-center justify-center mb-3"
        >
          <Text className="text-white font-bold">{isLoading ? t('loading') : t('createAccount')}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Login')} className="items-center">
          <Text className="text-primary-500 font-semibold">{t('haveAccount')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
