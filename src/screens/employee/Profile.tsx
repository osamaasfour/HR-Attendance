/**
 * Editable profile (self) + photo
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import {
  db,
  doc,
  updateDoc,
  Timestamp,
} from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import { useAppAlert } from '../../context/AlertContext';
import { useLanguage } from '../../context/LanguageContext';
import { useCompany } from '../../context/CompanyContext';
import { NotificationBell } from '../shared/Notifications';
import { uploadProfilePhoto } from '../../utils/uploadProfilePhoto';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import type { AppLanguage } from '../../i18n/translations';

export default function ProfileScreen() {
  const { user, logout, refreshProfile } = useAuth();
  const { showAlert } = useAppAlert();
  const { t } = useLanguage();
  const { company } = useCompany();
  const navigation = useNavigation<any>();

  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [jobTitle, setJobTitle] = useState(user?.jobTitle || '');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const handleLogout = useCallback(() => {
    showAlert(t('signOut'), t('signOutConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('signOut'),
        style: 'destructive',
        onPress: async () => {
          try {
            await logout();
          } catch {
            showAlert(t('error'), t('signOutFailed'));
          }
        },
      },
    ]);
  }, [logout, showAlert, t]);

  const onLanguageChanged = (lang: AppLanguage) => {
    showAlert(
      t('language'),
      lang === 'ar' ? t('languageSwitchedAr') : t('languageSwitchedEn'),
    );
  };

  const startEdit = () => {
    setFullName(user?.fullName || '');
    setPhone(user?.phone || '');
    setJobTitle(user?.jobTitle || '');
    setEditing(true);
  };

  const saveProfile = async () => {
    if (!user) return;
    if (!fullName.trim()) {
      showAlert(t('missing'), t('fullName'));
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        fullName: fullName.trim(),
        phone: phone.trim() || null,
        jobTitle: jobTitle.trim() || null,
        updatedAt: Timestamp.now(),
      });
      await refreshProfile();
      setEditing(false);
      showAlert(t('success'), t('profileSaved'));
    } catch (e: any) {
      showAlert(t('error'), e?.message || t('actionFailed'));
    } finally {
      setSaving(false);
    }
  };

  const changePhoto = async () => {
    if (!user) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        showAlert(t('permissionNeeded'), t('photoPermission'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setUploadingPhoto(true);
      const photoURL = await uploadProfilePhoto(user.uid, asset.uri, asset.mimeType);
      await updateDoc(doc(db, 'users', user.uid), {
        photoURL,
        updatedAt: Timestamp.now(),
      });
      await refreshProfile();
      showAlert(t('success'), t('photoUpdated'));
    } catch (e: any) {
      showAlert(t('error'), e?.message || t('actionFailed'));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const getInitials = (name: string): string =>
    name
      .split(' ')
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);

  return (
    <ScrollView className="flex-1 bg-surface-50">
      <View className="px-6 pt-12 pb-6 bg-white border-b border-surface-100 flex-row items-center justify-between">
        <View className="flex-row items-center flex-1 mr-3">
          {!!company.logoUrl && (
            <Image
              source={{ uri: company.logoUrl }}
              style={{ width: 36, height: 36, borderRadius: 8, marginRight: 10 }}
              resizeMode="contain"
            />
          )}
          <Text className="text-2xl font-bold text-surface-800">{t('myProfile')}</Text>
        </View>
        <NotificationBell onPress={() => navigation.navigate('Notifications')} />
      </View>

      <View className="px-6 py-6">
        <View className="bg-white rounded-2xl p-6">
          <View className="items-center mb-6">
            <TouchableOpacity onPress={changePhoto} disabled={uploadingPhoto} activeOpacity={0.85}>
              {user?.photoURL ? (
                <Image
                  source={{ uri: user.photoURL }}
                  className="w-24 h-24 rounded-full"
                  style={{ width: 96, height: 96, borderRadius: 48 }}
                />
              ) : (
                <View className="w-24 h-24 rounded-full bg-primary-500 items-center justify-center">
                  <Text className="text-white text-3xl font-bold">
                    {user?.fullName ? getInitials(user.fullName) : '??'}
                  </Text>
                </View>
              )}
              <View className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary-500 items-center justify-center border-2 border-white">
                {uploadingPhoto ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <MaterialCommunityIcons name="camera" size={16} color="#fff" />
                )}
              </View>
            </TouchableOpacity>
            <Text className="text-xl font-bold text-surface-800 mt-3">
              {user?.fullName || t('unknownUser')}
            </Text>
            <View className="mt-1 bg-primary-50 px-3 py-1 rounded-full">
              <Text className="text-primary-500 text-xs font-semibold uppercase">
                {user?.role || t('roleEmployee')}
              </Text>
            </View>
            <Text className="text-surface-400 text-xs mt-2">{t('tapPhoto')}</Text>
          </View>

          {editing ? (
            <View className="border-t border-surface-100 pt-4">
              <Text className="text-xs text-surface-400 mb-1">{t('fullName')}</Text>
              <TextInput
                className="border border-surface-200 rounded-xl px-3 h-11 mb-3 text-surface-800"
                value={fullName}
                onChangeText={setFullName}
              />
              <Text className="text-xs text-surface-400 mb-1">{t('phone')}</Text>
              <TextInput
                className="border border-surface-200 rounded-xl px-3 h-11 mb-3 text-surface-800"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
              <Text className="text-xs text-surface-400 mb-1">{t('jobTitle')}</Text>
              <TextInput
                className="border border-surface-200 rounded-xl px-3 h-11 mb-3 text-surface-800"
                value={jobTitle}
                onChangeText={setJobTitle}
              />
              <View className="flex-row">
                <TouchableOpacity
                  onPress={() => setEditing(false)}
                  className="flex-1 bg-surface-100 rounded-xl h-11 items-center justify-center mr-2"
                >
                  <Text className="text-surface-600 font-semibold">{t('cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={saveProfile}
                  disabled={saving}
                  className="flex-1 bg-primary-500 rounded-xl h-11 items-center justify-center"
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-white font-semibold">{t('save')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View className="border-t border-surface-100 pt-4">
              <InfoRow icon="badge-account-horizontal" label={t('employeeId')} value={user?.employeeId} />
              <InfoRow icon="email-outline" label={t('email')} value={user?.email || undefined} />
              <InfoRow icon="phone-outline" label={t('phone')} value={user?.phone} />
              <InfoRow icon="briefcase-outline" label={t('jobTitle')} value={user?.jobTitle} />
              <InfoRow
                icon="office-building-outline"
                label={t('branch')}
                value={user?.branchName}
              />
              <InfoRow
                icon="sitemap"
                label={t('department')}
                value={user?.department}
              />
              <InfoRow icon="shield-account-outline" label={t('role')} value={user?.role} />
            </View>
          )}
        </View>

        <View className="mt-4">
          <LanguageSwitcher onChanged={onLanguageChanged} />
        </View>

        {!editing && (
          <TouchableOpacity
            onPress={startEdit}
            className="bg-white border border-surface-200 rounded-xl h-14 items-center justify-center mt-4"
          >
            <View className="flex-row items-center">
              <MaterialCommunityIcons name="account-edit-outline" size={22} color="#1E3A5F" />
              <Text className="text-primary-500 font-semibold text-base ml-2">
                {t('editProfile')}
              </Text>
            </View>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() => navigation.navigate('Notifications')}
          className="bg-white border border-surface-200 rounded-xl h-14 items-center justify-center mt-4"
        >
          <View className="flex-row items-center">
            <MaterialCommunityIcons name="bell-outline" size={22} color="#1E3A5F" />
            <Text className="text-primary-500 font-semibold text-base ml-2">
              {t('notifications')}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleLogout}
          className="bg-red-500 rounded-xl h-14 items-center justify-center mt-4"
        >
          <View className="flex-row items-center">
            <MaterialCommunityIcons name="logout-variant" size={22} color="white" />
            <Text className="text-white font-semibold text-base ml-2">{t('signOut')}</Text>
          </View>
        </TouchableOpacity>

        <Text className="text-surface-300 text-xs text-center mt-6">{t('appName')} v1.1.0</Text>
      </View>
    </ScrollView>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  value?: string | null;
}) {
  return (
    <View className="flex-row items-center py-3">
      <View className="w-10 h-10 rounded-lg bg-surface-50 items-center justify-center mr-4">
        <MaterialCommunityIcons name={icon} size={22} color="#64748B" />
      </View>
      <View className="flex-1">
        <Text className="text-surface-400 text-xs uppercase font-medium">{label}</Text>
        <Text className="text-surface-800 font-semibold text-base capitalize">{value || '—'}</Text>
      </View>
    </View>
  );
}
