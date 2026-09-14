/**
 * Admin Settings — Company branding (SaaS) + work schedule + shifts + EmailJS
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Image,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  db,
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  updateDoc,
  Timestamp,
} from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import { useAppAlert } from '../../context/AlertContext';
import { useCompany } from '../../context/CompanyContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  DEFAULT_EMAIL_SETTINGS,
  DEFAULT_WORK_SCHEDULE,
  resolveWorkSchedule,
  type EmailSettings,
  type WeekdayNumber,
  type WorkSchedule,
  type WorkShift,
} from '../../types';
import {
  emailSettingsDocId,
  loadAdminEmailSettings,
  publishEmailPublic,
  sendTestEmail,
} from '../../utils/sendEmail';
import { isValidEmail, normalizeEmail } from '../../utils/email';
import { parseWorkScheduleInput, toggleOffDay } from '../../utils/workScheduleForm';
import { loadTenantDocs, resolveTenantId } from '../../utils/tenantScope';
import { uploadCompanyLogo } from '../../utils/uploadCompanyLogo';
import { COUNTRY_OPTIONS, CURRENCY_OPTIONS } from '../../utils/formatMoney';
import TimeField, { formatTime12h } from '../../components/TimeField';
import { WeekdayPicker } from '../../components/WeekdayPicker';
import HolidayManager from '../../components/HolidayManager';
import { checkTenantLicense, formatLicenseExpiry } from '../../utils/tenantLicense';
import { LicenseExpiryBanner } from '../../components/LicenseExpiryBanner';
import { colors } from '../../constants/colors';

export default function AdminSettingsScreen() {
  const { user } = useAuth();
  const { showAlert } = useAppAlert();
  const { company, tenant, saveCompany, refresh: refreshCompany, money } = useCompany();
  const { t, language } = useLanguage();
  const licenseCheck = checkTenantLicense(tenant);

  const isAdmin = user?.role === 'admin' || user?.platformAdmin === true;
  const tenantId = resolveTenantId(user?.tenantId, tenant.id);
  const emailDocRef = useMemo(
    () => doc(db, 'payrollSettings', emailSettingsDocId(tenantId)),
    [tenantId],
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingCompany, setSavingCompany] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [savingShift, setSavingShift] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [testing, setTesting] = useState(false);

  const [companyName, setCompanyName] = useState(company.name);
  const [countryCode, setCountryCode] = useState(company.countryCode || 'EG');
  const [currencyCode, setCurrencyCode] = useState(company.currencyCode || 'EGP');
  const [taxRegistrationNumber, setTaxRegistrationNumber] = useState(
    tenant.taxRegistrationNumber || '',
  );
  const [socialInsuranceNumber, setSocialInsuranceNumber] = useState(
    tenant.socialInsuranceNumber || '',
  );

  const [workStart, setWorkStart] = useState(DEFAULT_WORK_SCHEDULE.workStart);
  const [workEnd, setWorkEnd] = useState(DEFAULT_WORK_SCHEDULE.workEnd);
  const [fullDayHours, setFullDayHours] = useState(String(DEFAULT_WORK_SCHEDULE.fullDayHours));
  const [lateGrace, setLateGrace] = useState(String(DEFAULT_WORK_SCHEDULE.lateGraceMinutes));
  const [weeklyOffDays, setWeeklyOffDays] = useState<WeekdayNumber[]>([
    ...DEFAULT_WORK_SCHEDULE.weeklyOffDays,
  ]);

  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [editingShift, setEditingShift] = useState<WorkShift | null>(null);
  const [shiftFormOpen, setShiftFormOpen] = useState(false);
  const [shiftName, setShiftName] = useState('');
  const [shiftStart, setShiftStart] = useState(DEFAULT_WORK_SCHEDULE.workStart);
  const [shiftEnd, setShiftEnd] = useState(DEFAULT_WORK_SCHEDULE.workEnd);
  const [shiftFullDay, setShiftFullDay] = useState(String(DEFAULT_WORK_SCHEDULE.fullDayHours));
  const [shiftGrace, setShiftGrace] = useState(String(DEFAULT_WORK_SCHEDULE.lateGraceMinutes));
  const [shiftOffDays, setShiftOffDays] = useState<WeekdayNumber[]>([
    ...DEFAULT_WORK_SCHEDULE.weeklyOffDays,
  ]);

  const [enabled, setEnabled] = useState(DEFAULT_EMAIL_SETTINGS.enabled);
  const [publicKey, setPublicKey] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [hasPrivateKey, setHasPrivateKey] = useState(false);
  const [fromEmail, setFromEmail] = useState(DEFAULT_EMAIL_SETTINGS.fromEmail);
  const [fromName, setFromName] = useState(DEFAULT_EMAIL_SETTINGS.fromName || '');
  const [testTo, setTestTo] = useState('');

  const loadGen = useRef(0);

  const applySchedule = useCallback((schedule?: WorkSchedule | null) => {
    const s = resolveWorkSchedule(schedule);
    setWorkStart(s.workStart);
    setWorkEnd(s.workEnd);
    setFullDayHours(String(s.fullDayHours));
    setLateGrace(String(s.lateGraceMinutes));
    setWeeklyOffDays([...s.weeklyOffDays]);
  }, []);

  useEffect(() => {
    setCompanyName(company.name);
    setCountryCode(company.countryCode || 'EG');
    setCurrencyCode(company.currencyCode || 'EGP');
    setTaxRegistrationNumber(tenant.taxRegistrationNumber || '');
    setSocialInsuranceNumber(tenant.socialInsuranceNumber || '');
  }, [company, tenant.taxRegistrationNumber, tenant.socialInsuranceNumber]);

  useEffect(() => {
    applySchedule(tenant.workSchedule);
  }, [tenant.workSchedule, applySchedule]);

  const loadShifts = useCallback(async () => {
    const rows = await loadTenantDocs('workShifts', tenantId);
    const list = rows
      .map((row) => ({ ...(row.data as unknown as WorkShift), id: row.id }))
      .filter((s) => s.active !== false)
      .sort((a, b) => a.name.localeCompare(b.name));
    setShifts(list);
  }, [tenantId]);

  const load = useCallback(async () => {
    const gen = ++loadGen.current;
    setLoading(true);
    try {
      await refreshCompany();
      await loadShifts();
      const data = await loadAdminEmailSettings(tenantId);
      if (gen !== loadGen.current) return;
      setEnabled(!!data.enabled);
      setPublicKey(data.publicKey || '');
      setServiceId(data.serviceId || '');
      setTemplateId(data.templateId || '');
      setHasPrivateKey(!!data.privateKey);
      setPrivateKey('');
      setFromEmail(data.fromEmail || DEFAULT_EMAIL_SETTINGS.fromEmail);
      setFromName(data.fromName || '');
      setTestTo(user?.email || '');
      if (data.publicKey || data.serviceId || data.templateId || data.enabled) {
        await publishEmailPublic(tenantId, data).catch(() => undefined);
      }
    } catch (e: unknown) {
      if (gen !== loadGen.current) return;
      const message = e instanceof Error ? e.message : t('actionFailed');
      showAlert(t('error'), message);
    } finally {
      if (gen === loadGen.current) setLoading(false);
    }
  }, [refreshCompany, loadShifts, tenantId, showAlert, t, user?.email]);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  const buildPayload = (existingPrivate?: string): EmailSettings => {
    const savedPrivateKey = privateKey.trim() || existingPrivate;
    const savedFromName = fromName.trim();
    return {
      enabled,
      provider: 'emailjs',
      tenantId,
      publicKey: publicKey.trim(),
      serviceId: serviceId.trim(),
      templateId: templateId.trim(),
      ...(savedPrivateKey ? { privateKey: savedPrivateKey } : {}),
      fromEmail: normalizeEmail(fromEmail),
      ...(savedFromName ? { fromName: savedFromName } : {}),
      updatedAt: Timestamp.now(),
      ...(user?.uid ? { updatedBy: user.uid } : {}),
    };
  };

  const saveCompanySettings = async () => {
    const name = companyName.trim();
    if (!name) {
      showAlert(t('error'), t('companyNameRequired'));
      return;
    }
    const currency = CURRENCY_OPTIONS.find((c) => c.code === currencyCode);
    setSavingCompany(true);
    try {
      await saveCompany({
        name,
        countryCode,
        currencyCode,
        currencySymbol: currency?.symbol || currencyCode,
        locale:
          countryCode === 'EG'
            ? 'en-EG'
            : `en-${countryCode === 'OTHER' ? 'US' : countryCode}`,
        taxRegistrationNumber: taxRegistrationNumber.trim(),
        socialInsuranceNumber: socialInsuranceNumber.trim(),
        updatedBy: user?.uid,
      });
      showAlert(t('success'), t('companySaved'));
    } catch (e: unknown) {
      showAlert(t('error'), e instanceof Error ? e.message : t('actionFailed'));
    } finally {
      setSavingCompany(false);
    }
  };

  const resetShiftForm = () => {
    setEditingShift(null);
    setShiftFormOpen(false);
    setShiftName('');
    setShiftStart(DEFAULT_WORK_SCHEDULE.workStart);
    setShiftEnd(DEFAULT_WORK_SCHEDULE.workEnd);
    setShiftFullDay(String(DEFAULT_WORK_SCHEDULE.fullDayHours));
    setShiftGrace(String(DEFAULT_WORK_SCHEDULE.lateGraceMinutes));
    setShiftOffDays([...DEFAULT_WORK_SCHEDULE.weeklyOffDays]);
  };

  const openCreateShift = () => {
    setEditingShift(null);
    setShiftName('');
    setShiftStart(workStart || DEFAULT_WORK_SCHEDULE.workStart);
    setShiftEnd(workEnd || DEFAULT_WORK_SCHEDULE.workEnd);
    setShiftFullDay(fullDayHours || String(DEFAULT_WORK_SCHEDULE.fullDayHours));
    setShiftGrace(lateGrace || String(DEFAULT_WORK_SCHEDULE.lateGraceMinutes));
    setShiftOffDays([...weeklyOffDays]);
    setShiftFormOpen(true);
  };

  const openEditShift = (shift: WorkShift) => {
    const s = resolveWorkSchedule(shift);
    setEditingShift(shift);
    setShiftName(shift.name);
    setShiftStart(s.workStart);
    setShiftEnd(s.workEnd);
    setShiftFullDay(String(s.fullDayHours));
    setShiftGrace(String(s.lateGraceMinutes));
    setShiftOffDays([...s.weeklyOffDays]);
    setShiftFormOpen(true);
  };

  const saveShift = async () => {
    const name = shiftName.trim();
    if (!name) {
      showAlert(t('missing'), t('shiftName'));
      return;
    }
    const parsed = parseWorkScheduleInput({
      workStart: shiftStart,
      workEnd: shiftEnd,
      fullDayHours: shiftFullDay,
      lateGraceMinutes: shiftGrace,
      weeklyOffDays: shiftOffDays,
    });
    if (!parsed.ok) {
      showAlert(t('error'), t(parsed.error));
      return;
    }
    const payload = {
      name,
      ...parsed.schedule,
      updatedAt: Timestamp.now(),
    };
    setSavingShift(true);
    try {
      if (editingShift) {
        await updateDoc(doc(db, 'workShifts', editingShift.id), payload);
        showAlert(t('success'), t('shiftUpdated'));
      } else {
        await addDoc(collection(db, 'workShifts'), {
          ...payload,
          tenantId,
          active: true,
          createdAt: Timestamp.now(),
        });
        showAlert(t('success'), t('shiftCreated'));
      }
      resetShiftForm();
      await loadShifts();
    } catch (e: unknown) {
      showAlert(t('error'), e instanceof Error ? e.message : t('actionFailed'));
    } finally {
      setSavingShift(false);
    }
  };

  const performDeactivateShift = async (shift: WorkShift) => {
    try {
      await updateDoc(doc(db, 'workShifts', shift.id), {
        active: false,
        updatedAt: Timestamp.now(),
      });
      if (editingShift?.id === shift.id) resetShiftForm();
      await loadShifts();
      showAlert(t('success'), t('shiftDeactivated'));
    } catch (e: unknown) {
      showAlert(t('error'), e instanceof Error ? e.message : t('actionFailed'));
    }
  };

  const deactivateShift = (shift: WorkShift) => {
    showAlert(t('deactivateShiftTitle'), t('deactivateShiftConfirm', { name: shift.name }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('deactivate'),
        style: 'destructive',
        onPress: () => {
          void performDeactivateShift(shift);
        },
      },
    ]);
  };

  const saveWorkSchedule = async () => {
    const parsed = parseWorkScheduleInput({
      workStart,
      workEnd,
      fullDayHours,
      lateGraceMinutes: lateGrace,
      weeklyOffDays,
    });
    if (!parsed.ok) {
      showAlert(t('error'), t(parsed.error));
      return;
    }
    setSavingSchedule(true);
    try {
      await saveCompany({ workSchedule: parsed.schedule, updatedBy: user?.uid });
      showAlert(t('success'), t('workScheduleSaved'));
    } catch (e: unknown) {
      showAlert(t('error'), e instanceof Error ? e.message : t('actionFailed'));
    } finally {
      setSavingSchedule(false);
    }
  };

  const pickLogo = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        showAlert(t('permissionNeeded'), t('logoPermission'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setUploadingLogo(true);
      const logoUrl = await uploadCompanyLogo(asset.uri, asset.mimeType);
      await saveCompany({ logoUrl, updatedBy: user?.uid });
      showAlert(t('success'), t('logoUpdated'));
    } catch (e: unknown) {
      showAlert(t('error'), e instanceof Error ? e.message : t('actionFailed'));
    } finally {
      setUploadingLogo(false);
    }
  };

  const save = async () => {
    if (enabled) {
      if (!publicKey.trim() || !serviceId.trim() || !templateId.trim()) {
        showAlert(t('missing'), t('emailjsTitle'));
        return;
      }
      if (!isValidEmail(fromEmail)) {
        showAlert(t('error'), t('invalidEmail'));
        return;
      }
    }

    setSaving(true);
    try {
      const existing = await getDoc(emailDocRef);
      const prev = existing.exists() ? (existing.data() as EmailSettings) : null;
      const payload = buildPayload(prev?.privateKey);
      await setDoc(emailDocRef, payload, { merge: true });
      await publishEmailPublic(tenantId, payload);
      setHasPrivateKey(!!payload.privateKey);
      setPrivateKey('');
      showAlert(t('success'), t('emailSettingsSaved'));
    } catch (e: unknown) {
      showAlert(t('error'), e instanceof Error ? e.message : t('actionFailed'));
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    const to = normalizeEmail(testTo || user?.email || '');
    if (!isValidEmail(to)) {
      showAlert(t('missing'), t('recipient'));
      return;
    }
    setTesting(true);
    try {
      const existing = await getDoc(emailDocRef);
      const prev = existing.exists() ? (existing.data() as EmailSettings) : null;
      const settings = buildPayload(prev?.privateKey);
      if (!settings.enabled) {
        showAlert(t('error'), t('emailDisabled'));
        return;
      }
      await sendTestEmail(to, settings, tenantId);
      showAlert(t('success'), t('testEmailSent', { to }));
    } catch (e: unknown) {
      showAlert(t('error'), e instanceof Error ? e.message : t('actionFailed'));
    } finally {
      setTesting(false);
    }
  };

  if (!isAdmin) {
    return (
      <View className="flex-1 bg-surface-50 items-center justify-center px-6">
        <MaterialCommunityIcons name="shield-lock" size={48} color={colors.inactive} />
        <Text className="text-surface-600 text-center mt-3">{t('adminOnlySettings')}</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View className="flex-1 bg-surface-50 items-center justify-center">
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface-50">
      <View className="px-6 pt-12 pb-4 bg-white border-b border-surface-100">
        <Text className="text-2xl font-bold text-surface-800">{t('navSettings')}</Text>
        <Text className="text-surface-400 text-sm mt-1">{t('settingsSubtitle')}</Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        keyboardShouldPersistTaps="handled"
      >
        <View className="bg-white rounded-2xl p-4 border border-surface-100 mb-4">
          <View className="flex-row items-center mb-3">
            <MaterialCommunityIcons name="office-building-outline" size={22} color={colors.primary} />
            <Text className="text-lg font-bold text-surface-800 ml-2">{t('tenantSection')}</Text>
          </View>
          <Text className="text-surface-400 text-xs mb-2">{t('yourTenant')}</Text>
          <Text className="text-surface-800 font-semibold mb-1">{company.name}</Text>
          <Text className="text-surface-500 text-sm mb-1">
            {t('tenantSlug')}: {tenant.slug}
          </Text>
          <Text className="text-surface-400 text-xs mb-3">
            {t('tenantPlan')}: {tenant.plan || 'free'} · ID: {tenant.id}
          </Text>
          <Text className="text-surface-500 text-sm mb-1">
            {t('licenseExpiresAt')}: {formatLicenseExpiry(tenant)}
            {licenseCheck.daysLeft != null
              ? ` · ${t('daysLeft', { days: licenseCheck.daysLeft })}`
              : ` · ${t('licenseNoExpiry')}`}
          </Text>
          <Text
            className={`text-xs font-semibold mb-2 ${
              licenseCheck.state !== 'ok'
                ? 'text-danger-600'
                : licenseCheck.expiringSoon
                  ? 'text-warning-600'
                  : 'text-accent-600'
            }`}
          >
            {licenseCheck.state === 'ok'
              ? licenseCheck.expiringSoon
                ? t('licenseExpiringSoonBadge')
                : t('licenseOk')
              : licenseCheck.state === 'expired'
                ? t('licenseExpired')
                : t('suspended')}
          </Text>
          <LicenseExpiryBanner className="mb-2" />
          <Text className="text-surface-400 text-[11px] leading-4">{t('tenantCodeHint')}</Text>
        </View>

        <View className="bg-white rounded-2xl p-4 border border-surface-100 mb-4">
          <View className="flex-row items-center mb-3">
            <MaterialCommunityIcons name="domain" size={22} color={colors.primary} />
            <Text className="text-lg font-bold text-surface-800 ml-2">{t('companySettings')}</Text>
          </View>
          <Text className="text-surface-400 text-xs mb-3">
            {t('companySettings')} · {money(1000)}
          </Text>

          <View className="items-center mb-4">
            <TouchableOpacity onPress={pickLogo} disabled={uploadingLogo} activeOpacity={0.85}>
              {company.logoUrl ? (
                <Image
                  source={{ uri: company.logoUrl }}
                  style={{ width: 88, height: 88, borderRadius: 16 }}
                  resizeMode="contain"
                />
              ) : (
                <View
                  className="rounded-2xl bg-surface-100 items-center justify-center border border-dashed border-surface-300"
                  style={{ width: 88, height: 88 }}
                >
                  <MaterialCommunityIcons name="image-plus" size={28} color={colors.inactive} />
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={pickLogo} disabled={uploadingLogo} className="mt-2">
              {uploadingLogo ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text className="text-primary-500 text-sm font-semibold">{t('uploadLogo')}</Text>
              )}
            </TouchableOpacity>
          </View>

          <Text className="text-xs text-surface-400 mb-1">{t('companyName')}</Text>
          <TextInput
            className="border border-surface-200 rounded-xl px-3 h-11 mb-3"
            value={companyName}
            onChangeText={setCompanyName}
          />

          <Text className="text-xs text-surface-400 mb-1">{t('taxRegistrationNumber')}</Text>
          <TextInput
            className="border border-surface-200 rounded-xl px-3 h-11 mb-3"
            value={taxRegistrationNumber}
            onChangeText={setTaxRegistrationNumber}
            placeholder={t('taxRegistrationNumber')}
          />
          <Text className="text-xs text-surface-400 mb-1">{t('socialInsuranceNumber')}</Text>
          <TextInput
            className="border border-surface-200 rounded-xl px-3 h-11 mb-3"
            value={socialInsuranceNumber}
            onChangeText={setSocialInsuranceNumber}
            placeholder={t('socialInsuranceNumber')}
          />

          <Text className="text-xs text-surface-400 mb-1">{t('country')}</Text>
          <View className="flex-row flex-wrap mb-3">
            {COUNTRY_OPTIONS.map((c) => (
              <TouchableOpacity
                key={c.code}
                onPress={() => {
                  setCountryCode(c.code);
                  const match = CURRENCY_OPTIONS.find((cur) => cur.country === c.code);
                  if (match) setCurrencyCode(match.code);
                }}
                className={`mr-2 mb-2 px-3 py-2 rounded-full ${
                  countryCode === c.code ? 'bg-primary-500' : 'bg-surface-100'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    countryCode === c.code ? 'text-white' : 'text-surface-600'
                  }`}
                >
                  {language === 'ar' ? c.labelAr : c.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text className="text-xs text-surface-400 mb-1">{t('currency')}</Text>
          <View className="flex-row flex-wrap mb-4">
            {CURRENCY_OPTIONS.map((c) => (
              <TouchableOpacity
                key={c.code}
                onPress={() => setCurrencyCode(c.code)}
                className={`mr-2 mb-2 px-3 py-2 rounded-full ${
                  currencyCode === c.code ? 'bg-primary-500' : 'bg-surface-100'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    currencyCode === c.code ? 'text-white' : 'text-surface-600'
                  }`}
                >
                  {c.code} ({c.symbol})
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            onPress={saveCompanySettings}
            disabled={savingCompany}
            className="bg-primary-500 rounded-xl h-12 items-center justify-center"
          >
            {savingCompany ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-semibold">{t('saveCompanySettings')}</Text>
            )}
          </TouchableOpacity>
        </View>

        <View className="bg-white rounded-2xl p-4 border border-surface-100 mb-4">
          <View className="flex-row items-center mb-2">
            <MaterialCommunityIcons name="calendar-clock" size={22} color={colors.primary} />
            <Text className="text-lg font-bold text-surface-800 ml-2">
              {t('workScheduleTitle')}
            </Text>
          </View>
          <Text className="text-surface-400 text-xs mb-4 leading-4">
            {t('workScheduleHint')}
          </Text>

          <View className="flex-row mb-1">
            <View className="flex-1 mr-2">
              <TimeField
                label={t('workStartTime')}
                value={workStart}
                onChange={setWorkStart}
              />
            </View>
            <View className="flex-1 ml-2">
              <TimeField
                label={t('workEndTime')}
                value={workEnd}
                onChange={setWorkEnd}
              />
            </View>
          </View>

          <View className="flex-row mb-4">
            <View className="flex-1 mr-2">
              <Text className="text-xs text-surface-400 mb-1">{t('fullDayHours')}</Text>
              <TextInput
                className="border border-surface-200 rounded-xl px-3 h-11"
                value={fullDayHours}
                onChangeText={setFullDayHours}
                keyboardType="decimal-pad"
                placeholder="8"
              />
            </View>
            <View className="flex-1 ml-2">
              <Text className="text-xs text-surface-400 mb-1">{t('lateGraceMinutes')}</Text>
              <TextInput
                className="border border-surface-200 rounded-xl px-3 h-11"
                value={lateGrace}
                onChangeText={setLateGrace}
                keyboardType="number-pad"
                placeholder="10"
              />
            </View>
          </View>

          <Text className="text-xs text-surface-400 mb-1">{t('workingDaysLabel')}</Text>
          <Text className="text-[11px] text-surface-400 mb-2">{t('workingDaysHint')}</Text>
          <WeekdayPicker
            offDays={weeklyOffDays}
            onToggle={(day) => setWeeklyOffDays((prev) => toggleOffDay(prev, day))}
          />

          <TouchableOpacity
            onPress={saveWorkSchedule}
            disabled={savingSchedule}
            className="bg-primary-500 rounded-xl h-12 items-center justify-center"
          >
            {savingSchedule ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-semibold">{t('saveWorkSchedule')}</Text>
            )}
          </TouchableOpacity>
        </View>

        <View className="bg-white rounded-2xl p-4 border border-surface-100 mb-4">
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center flex-1">
              <MaterialCommunityIcons name="clock-outline" size={22} color={colors.primary} />
              <Text className="text-lg font-bold text-surface-800 ml-2">{t('shiftsTitle')}</Text>
            </View>
            <TouchableOpacity
              onPress={openCreateShift}
              className="bg-primary-50 px-3 py-2 rounded-lg"
            >
              <Text className="text-primary-600 text-xs font-bold">{t('addShift')}</Text>
            </TouchableOpacity>
          </View>
          <Text className="text-surface-400 text-xs mb-3 leading-4">{t('shiftsHint')}</Text>

          {shifts.length === 0 && !shiftFormOpen ? (
            <Text className="text-surface-400 text-sm mb-2">{t('noShiftsYet')}</Text>
          ) : (
            shifts.map((shift) => (
              <View
                key={shift.id}
                className="flex-row items-center border border-surface-100 rounded-xl px-3 py-3 mb-2"
              >
                <View className="flex-1">
                  <Text className="font-semibold text-surface-800">{shift.name}</Text>
                  <Text className="text-xs text-surface-500 mt-0.5">
                    {formatTime12h(shift.workStart)} – {formatTime12h(shift.workEnd)} ·{' '}
                    {shift.fullDayHours}h ·{' '}
                    {t('lateGraceShort', { min: shift.lateGraceMinutes ?? 10 })}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => openEditShift(shift)}
                  className="bg-surface-100 px-3 py-2 rounded-lg mr-2"
                >
                  <Text className="text-surface-600 text-xs font-semibold">{t('edit')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => deactivateShift(shift)}
                  className="bg-warning-50 px-3 py-2 rounded-lg"
                >
                  <Text className="text-warning-600 text-xs font-semibold">{t('deactivate')}</Text>
                </TouchableOpacity>
              </View>
            ))
          )}

          {shiftFormOpen && (
            <View className="mt-3 border-t border-surface-100 pt-3">
              <Text className="font-semibold text-surface-800 mb-3">
                {editingShift ? t('editShift') : t('addShift')}
              </Text>
              <Text className="text-xs text-surface-400 mb-1">{t('shiftName')}</Text>
              <TextInput
                className="border border-surface-200 rounded-xl px-3 h-11 mb-3"
                value={shiftName}
                onChangeText={setShiftName}
                placeholder={t('shiftNamePlaceholder')}
              />
              <View className="flex-row mb-1">
                <View className="flex-1 mr-2">
                  <TimeField
                    label={t('workStartTime')}
                    value={shiftStart}
                    onChange={setShiftStart}
                  />
                </View>
                <View className="flex-1 ml-2">
                  <TimeField
                    label={t('workEndTime')}
                    value={shiftEnd}
                    onChange={setShiftEnd}
                  />
                </View>
              </View>
              <View className="flex-row mb-3">
                <View className="flex-1 mr-2">
                  <Text className="text-xs text-surface-400 mb-1">{t('fullDayHours')}</Text>
                  <TextInput
                    className="border border-surface-200 rounded-xl px-3 h-11"
                    value={shiftFullDay}
                    onChangeText={setShiftFullDay}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View className="flex-1 ml-2">
                  <Text className="text-xs text-surface-400 mb-1">{t('lateGraceMinutes')}</Text>
                  <TextInput
                    className="border border-surface-200 rounded-xl px-3 h-11"
                    value={shiftGrace}
                    onChangeText={setShiftGrace}
                    keyboardType="number-pad"
                  />
                </View>
              </View>
              <Text className="text-xs text-surface-400 mb-1">{t('workingDaysLabel')}</Text>
              <WeekdayPicker
                offDays={shiftOffDays}
                onToggle={(day) => setShiftOffDays((prev) => toggleOffDay(prev, day))}
              />
              <View className="flex-row">
                <TouchableOpacity
                  onPress={resetShiftForm}
                  className="flex-1 bg-surface-100 rounded-xl h-11 items-center justify-center mr-2"
                >
                  <Text className="text-surface-600 font-semibold">{t('cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={saveShift}
                  disabled={savingShift}
                  className="flex-1 bg-primary-500 rounded-xl h-11 items-center justify-center"
                >
                  {savingShift ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-white font-semibold">{t('saveShift')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <HolidayManager />

        <View className="bg-white rounded-2xl p-4 border border-surface-100 mb-4">
          <View className="flex-row items-center mb-3">
            <MaterialCommunityIcons name="email-fast-outline" size={22} color={colors.primary} />
            <Text className="text-lg font-bold text-surface-800 ml-2">{t('emailjsTitle')}</Text>
          </View>
          <Text className="text-surface-400 text-xs mb-2">{t('managerEmailHint')}</Text>
          <TouchableOpacity
            onPress={() => Linking.openURL('https://dashboard.emailjs.com/admin')}
            className="mb-4"
          >
            <Text className="text-primary-500 text-sm font-semibold">{t('openEmailjs')}</Text>
          </TouchableOpacity>

          <View className="flex-row items-center justify-between mb-4 py-1">
            <Text className="text-surface-700 font-semibold">{t('enableOutboundEmail')}</Text>
            <Switch
              value={enabled}
              onValueChange={setEnabled}
              trackColor={{ false: '#E2E8F0', true: colors.primary300 }}
              thumbColor={enabled ? colors.primary : colors.switchTrack}
            />
          </View>

          <Text className="text-xs text-surface-400 mb-1">{t('publicKey')}</Text>
          <TextInput
            className="border border-surface-200 rounded-xl px-3 h-11 mb-3"
            placeholder={t('publicKey')}
            autoCapitalize="none"
            autoCorrect={false}
            value={publicKey}
            onChangeText={setPublicKey}
          />

          <Text className="text-xs text-surface-400 mb-1">{t('serviceId')}</Text>
          <TextInput
            className="border border-surface-200 rounded-xl px-3 h-11 mb-3"
            placeholder="service_xxxxx"
            autoCapitalize="none"
            autoCorrect={false}
            value={serviceId}
            onChangeText={setServiceId}
          />

          <Text className="text-xs text-surface-400 mb-1">{t('templateId')}</Text>
          <TextInput
            className="border border-surface-200 rounded-xl px-3 h-11 mb-3"
            placeholder="template_xxxxx"
            autoCapitalize="none"
            autoCorrect={false}
            value={templateId}
            onChangeText={setTemplateId}
          />

          <Text className="text-xs text-surface-400 mb-1">
            {t('privateKey')} ({t('optional')})
          </Text>
          <Text className="text-surface-400 text-xs mb-2">{t('privateKeyHint')}</Text>
          <TextInput
            className="border border-surface-200 rounded-xl px-3 h-11 mb-3"
            placeholder={hasPrivateKey ? '••••••••' : t('privateKey')}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            value={privateKey}
            onChangeText={setPrivateKey}
          />

          <Text className="text-xs text-surface-400 mb-1">{t('fromEmail')}</Text>
          <TextInput
            className="border border-surface-200 rounded-xl px-3 h-11 mb-3"
            placeholder="noreply@company.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={fromEmail}
            onChangeText={setFromEmail}
          />

          <Text className="text-xs text-surface-400 mb-1">{t('fromName')}</Text>
          <TextInput
            className="border border-surface-200 rounded-xl px-3 h-11 mb-4"
            placeholder="HR Attendance"
            value={fromName}
            onChangeText={setFromName}
          />

          <TouchableOpacity
            onPress={save}
            disabled={saving}
            className="bg-primary-500 rounded-xl h-12 items-center justify-center"
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-semibold">{t('saveEmailSettings')}</Text>
            )}
          </TouchableOpacity>
        </View>

        <View className="bg-white rounded-2xl p-4 border border-surface-100 mb-4">
          <Text className="text-lg font-bold text-surface-800 mb-1">{t('sendTestEmail')}</Text>
          <Text className="text-surface-400 text-xs mb-3">{t('managerEmailHint')}</Text>
          <Text className="text-xs text-surface-400 mb-1">{t('recipient')}</Text>
          <TextInput
            className="border border-surface-200 rounded-xl px-3 h-11 mb-3"
            placeholder="you@company.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={testTo}
            onChangeText={setTestTo}
          />
          <TouchableOpacity
            onPress={sendTest}
            disabled={testing || !enabled}
            className={`rounded-xl h-12 items-center justify-center ${
              enabled ? 'bg-primary-500' : 'bg-surface-200'
            }`}
          >
            {testing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className={`font-semibold ${enabled ? 'text-white' : 'text-surface-400'}`}>
                {t('sendTestEmail')}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
