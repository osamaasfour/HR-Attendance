/**
 * Login Screen — email/password + forgot password
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

export default function LoginScreen({ navigation }: { navigation: any }) {
  const { login, resetPassword } = useAuth();
  const { showAlert } = useAppAlert();
  const { t } = useLanguage();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const isValidForm = (): boolean => {
    if (!email.trim()) {
      showAlert(t('missing'), t('email'));
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showAlert(t('error'), t('invalidEmail'));
      return false;
    }
    if (!password) {
      showAlert(t('missing'), t('password'));
      return false;
    }
    if (password.length < 6) {
      showAlert(t('error'), t('passwordTooShort'));
      return false;
    }
    return true;
  };

  const handleLogin = async () => {
    if (!isValidForm()) return;
    setIsLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (error: any) {
      console.error('[Login] Error:', error);
      let message = t('loginFailed');
      const code = error?.code || '';
      if (code === 'auth/profile-missing') {
        message = String(error?.message || message);
      } else if (code === 'auth/device-mismatch') {
        message = t('deviceMismatch');
      } else if (code === 'auth/license-expired') {
        message = t('licenseExpiredLogin');
      } else if (code === 'auth/tenant-suspended') {
        message = t('tenantSuspendedLogin');
      } else if (
        code === 'auth/user-not-found' ||
        code === 'auth/wrong-password' ||
        code === 'auth/invalid-credential'
      ) {
        message = t('loginFailed');
      } else if (code === 'auth/invalid-email') {
        message = t('invalidEmail');
      } else if (code === 'auth/user-disabled' || code === 'auth/account-inactive') {
        message = t('accountInactive');
      } else if (error?.message) {
        message = String(error.message);
      }
      showAlert(t('loginFailed'), message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      showAlert(t('email'), t('resetPasswordBody'));
      return;
    }
    try {
      await resetPassword(email.trim().toLowerCase());
      showAlert(t('resetPasswordTitle'), t('resetSent'));
    } catch (error: any) {
      showAlert(t('error'), error?.message || t('actionFailed'));
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-1 px-6 pt-16 pb-8">
          <View className="mb-6">
            <Text className="text-sm font-medium text-surface-500 mb-2">{t('language')}</Text>
            <LanguageSwitcher compact />
          </View>

          <View className="items-center mb-10">
            <View className="w-20 h-20 rounded-full bg-primary-500 items-center justify-center mb-4">
              <MaterialCommunityIcons name="clock-check-outline" size={40} color="white" />
            </View>
            <Text className="text-2xl font-bold text-primary-500">{t('appName')}</Text>
            <Text className="text-surface-400 mt-1">{t('signInSubtitle')}</Text>
          </View>

          <View className="mb-4">
            <Text className="text-sm font-medium text-surface-500 mb-1.5">{t('email')}</Text>
            <View className="flex-row items-center border border-surface-200 rounded-xl px-4 h-12">
              <MaterialCommunityIcons name="email-outline" size={20} color="#94A3B8" />
              <TextInput
                className="flex-1 ml-3 text-surface-800 text-base"
                placeholder="you@company.com"
                placeholderTextColor="#CBD5E1"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={setEmail}
                editable={!isLoading}
              />
            </View>
          </View>

          <View className="mb-2">
            <Text className="text-sm font-medium text-surface-500 mb-1.5">{t('password')}</Text>
            <View className="flex-row items-center border border-surface-200 rounded-xl px-4 h-12">
              <MaterialCommunityIcons name="lock-outline" size={20} color="#94A3B8" />
              <TextInput
                className="flex-1 ml-3 text-surface-800 text-base"
                placeholder={t('password')}
                placeholderTextColor="#CBD5E1"
                secureTextEntry={!isPasswordVisible}
                value={password}
                onChangeText={setPassword}
                editable={!isLoading}
              />
              <TouchableOpacity
                onPress={() => setIsPasswordVisible(!isPasswordVisible)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialCommunityIcons
                  name={isPasswordVisible ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color="#94A3B8"
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity onPress={handleForgotPassword} className="mb-6 self-end">
            <Text className="text-primary-500 text-sm font-semibold">{t('forgotPassword')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleLogin}
            disabled={isLoading}
            activeOpacity={0.8}
            className={`h-14 rounded-xl items-center justify-center mb-6 ${
              isLoading ? 'bg-surface-300' : 'bg-primary-500'
            }`}
          >
            {isLoading ? (
              <Text className="text-white font-semibold text-base">{t('loading')}</Text>
            ) : (
              <Text className="text-white font-semibold text-base">{t('signIn')}</Text>
            )}
          </TouchableOpacity>

          <View className="flex-row items-center justify-center">
            <Text className="text-surface-400 text-sm">{t('noAccount')} </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Signup')}
              hitSlop={{ top: 10, bottom: 10 }}
            >
              <Text className="text-primary-500 font-semibold text-sm">{t('signUp')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
