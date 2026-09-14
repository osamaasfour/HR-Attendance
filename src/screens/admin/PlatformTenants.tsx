/**
 * Platform console — list / provision / license tenants (vendor only).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useAppAlert } from '../../context/AlertContext';
import { useLanguage } from '../../context/LanguageContext';
import { adminCreateEmployee } from '../../utils/adminCreateEmployee';
import { adminUpdateUserAuthCredentials } from '../../utils/adminUpdateAuth';
import {
  createTenant,
  deleteTenant,
  getTenantSeatAndAdmin,
  listTenants,
  normalizeSlug,
  updateTenant,
  type TenantAdminAccount,
} from '../../utils/tenants';
import { cloneTenantSettings } from '../../utils/provisionTenant';
import {
  calculateLicenseExpiry,
  checkTenantLicense,
  formatLicenseExpiry,
  type LicenseTerm,
} from '../../utils/tenantLicense';
import { DEFAULT_TENANT_ID, type Tenant } from '../../types';

const LICENSE_TERMS: LicenseTerm[] = ['monthly', 'quarterly', 'annual', 'trial'];

export default function PlatformTenantsScreen() {
  const { user, resetPassword } = useAuth();
  const { showAlert } = useAppAlert();
  const { t } = useLanguage();

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [seatCounts, setSeatCounts] = useState<Record<string, number>>({});
  const [adminByTenant, setAdminByTenant] = useState<Record<string, TenantAdminAccount>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState('');
  const [plan, setPlan] = useState<'free' | 'pro' | 'enterprise'>('pro');
  const [maxUsers, setMaxUsers] = useState('50');
  const [licenseTerm, setLicenseTerm] = useState<LicenseTerm>('annual');
  const [trialDays, setTrialDays] = useState('14');
  const [licenseNotes, setLicenseNotes] = useState('');
  const [contractRef, setContractRef] = useState('');
  const [adminFullName, setAdminFullName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [cloneFromTemplate, setCloneFromTemplate] = useState(true);
  const [templateTenantId, setTemplateTenantId] = useState(DEFAULT_TENANT_ID);
  const [includeEmailSettings, setIncludeEmailSettings] = useState(false);

  const [editMaxUsers, setEditMaxUsers] = useState('');
  const [editPlan, setEditPlan] = useState<'free' | 'pro' | 'enterprise'>('free');
  const [editTerm, setEditTerm] = useState<LicenseTerm>('annual');
  const [editTrialDays, setEditTrialDays] = useState('14');
  const [editNotes, setEditNotes] = useState('');
  const [editContractRef, setEditContractRef] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [editNewPassword, setEditNewPassword] = useState('');
  const [editConfirmPassword, setEditConfirmPassword] = useState('');

  const isPlatform = user?.platformAdmin === true;

  const computedExpiry = useMemo(
    () => calculateLicenseExpiry(licenseTerm, Number(trialDays) || 14),
    [licenseTerm, trialDays],
  );

  const editComputedExpiry = useMemo(
    () => calculateLicenseExpiry(editTerm, Number(editTrialDays) || 14),
    [editTerm, editTrialDays],
  );

  const autoSlugPreview = useMemo(
    () => normalizeSlug(companyName) || '—',
    [companyName],
  );

  const load = useCallback(async () => {
    if (!isPlatform) return;
    setLoading(true);
    try {
      const rows = await listTenants();
      setTenants(rows);
      const counts: Record<string, number> = {};
      const admins: Record<string, TenantAdminAccount> = {};
      await Promise.all(
        rows.map(async (tn) => {
          try {
            const summary = await getTenantSeatAndAdmin(tn.id, tn.adminEmail);
            counts[tn.id] = summary.seats;
            const admin =
              summary.admin ||
              (tn.adminEmail
                ? { uid: tn.adminUid || '', email: tn.adminEmail.trim().toLowerCase() }
                : null);
            if (admin?.email) {
              admins[tn.id] = admin;
              if ((!tn.adminEmail || !tn.adminUid) && summary.admin) {
                await updateTenant(tn.id, {
                  adminEmail: summary.admin.email,
                  adminUid: summary.admin.uid,
                }).catch(() => undefined);
              }
            }
          } catch {
            counts[tn.id] = 0;
            if (tn.adminEmail) {
              admins[tn.id] = {
                uid: tn.adminUid || '',
                email: tn.adminEmail.trim().toLowerCase(),
              };
            }
          }
        }),
      );
      setSeatCounts(counts);
      setAdminByTenant(admins);
    } catch (e: any) {
      showAlert(t('error'), e?.message || t('actionFailed'));
    } finally {
      setLoading(false);
    }
  }, [isPlatform, showAlert, t]);

  useEffect(() => {
    load();
  }, [load]);

  const resetCreate = () => {
    setCompanyName('');
    setPlan('pro');
    setMaxUsers('50');
    setLicenseTerm('annual');
    setTrialDays('14');
    setLicenseNotes('');
    setContractRef('');
    setAdminFullName('');
    setAdminEmail('');
    setAdminPassword('');
    setCloneFromTemplate(true);
    setTemplateTenantId(DEFAULT_TENANT_ID);
    setIncludeEmailSettings(false);
  };

  const termLabel = (term: LicenseTerm) => {
    const map: Record<LicenseTerm, string> = {
      monthly: t('licenseTermMonthly'),
      quarterly: t('licenseTermQuarterly'),
      annual: t('licenseTermAnnual'),
      trial: t('licenseTermTrial'),
    };
    return map[term];
  };

  const openEdit = (tn: Tenant) => {
    setCreating(false);
    setEditing(tn);
    setEditMaxUsers(tn.maxUsers ? String(tn.maxUsers) : '');
    setEditPlan(tn.plan || 'free');
    setEditTerm(tn.licenseTerm || 'annual');
    setEditTrialDays(tn.trialDays ? String(tn.trialDays) : '14');
    setEditNotes(tn.licenseNotes || '');
    setEditContractRef(tn.licenseKey || '');
    setEditActive(tn.active !== false);
    setEditNewPassword('');
    setEditConfirmPassword('');
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const max = Number(editMaxUsers);
      const expires = editComputedExpiry;
      await updateTenant(editing.id, {
        plan: editPlan,
        active: editActive,
        licenseTerm: editTerm,
        trialDays: editTerm === 'trial' ? Math.max(1, Math.floor(Number(editTrialDays) || 14)) : (null as any),
        licenseExpiresAt: expires,
        maxUsers: Number.isFinite(max) && max > 0 ? Math.floor(max) : (null as any),
        licenseKey: editContractRef.trim() || (null as any),
        licenseNotes: editNotes.trim() || (null as any),
      });
      setEditing(null);
      await load();
      showAlert(t('success'), t('tenantLicenseSaved'));
    } catch (e: any) {
      showAlert(t('error'), e?.message || t('actionFailed'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    if (!editing) return;
    if (editing.id === DEFAULT_TENANT_ID) {
      showAlert(t('notAllowed'), t('cannotDeleteDefaultTenant'));
      return;
    }
    showAlert(t('deleteTenantTitle'), t('deleteTenantConfirm', { name: editing.name }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setSaving(true);
            try {
              await deleteTenant(editing.id);
              setEditing(null);
              await load();
              showAlert(t('success'), t('tenantDeleted'));
            } catch (e: any) {
              showAlert(t('error'), e?.message || t('actionFailed'));
            } finally {
              setSaving(false);
            }
          })();
        },
      },
    ]);
  };

  const sendTenantReset = (tn: Tenant, email?: string) => {
    const target = (email || adminByTenant[tn.id]?.email || tn.adminEmail || '').trim().toLowerCase();
    if (!target) {
      showAlert(t('missing'), t('noTenantAdminFound'));
      return;
    }
    showAlert(t('resetPasswordTitle'), t('confirmResetTenantPassword', { email: target }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('sendTenantPasswordReset'),
        onPress: () => {
          void (async () => {
            setResettingId(tn.id);
            try {
              await resetPassword(target);
              showAlert(t('resetPasswordTitle'), t('resetSent'));
            } catch (e: any) {
              showAlert(t('error'), e?.message || t('actionFailed'));
            } finally {
              setResettingId(null);
            }
          })();
        },
      },
    ]);
  };

  const applyTenantPassword = async () => {
    if (!editing) return;
    const admin = adminByTenant[editing.id];
    const email = (admin?.email || editing.adminEmail || '').trim().toLowerCase();
    const uid = admin?.uid || editing.adminUid || '';
    if (!email) {
      showAlert(t('missing'), t('noTenantAdminFound'));
      return;
    }
    if (editNewPassword.length < 6) {
      showAlert(t('weakPassword'), t('passwordTooShort'));
      return;
    }
    if (editNewPassword !== editConfirmPassword) {
      showAlert(t('passwordMismatchTitle'), t('passwordsMismatch'));
      return;
    }
    setSaving(true);
    try {
      if (uid) {
        const result = await adminUpdateUserAuthCredentials({
          targetUid: uid,
          currentEmail: email,
          nextEmail: email,
          nextPassword: editNewPassword,
        });
        setEditNewPassword('');
        setEditConfirmPassword('');
        if (result.authUpdated) {
          showAlert(t('success'), t('tenantPasswordUpdated'));
        } else {
          showAlert(
            t('resetPasswordTitle'),
            t('tenantPasswordSetPartial', { email }),
          );
        }
      } else {
        await resetPassword(email);
        setEditNewPassword('');
        setEditConfirmPassword('');
        showAlert(t('resetPasswordTitle'), t('resetSent'));
      }
    } catch (e: any) {
      showAlert(t('error'), e?.message || t('actionFailed'));
    } finally {
      setSaving(false);
    }
  };

  const provision = async () => {
    if (!user) return;
    if (!companyName.trim()) {
      showAlert(t('missing'), t('companyNameRequired'));
      return;
    }
    if (!adminFullName.trim() || !adminEmail.trim() || adminPassword.length < 6) {
      showAlert(t('missing'), t('platformAdminRequired'));
      return;
    }
    setSaving(true);
    let createdTenantId: string | null = null;
    try {
      const expires = computedExpiry;
      const tenant = await createTenant({
        name: companyName.trim(),
        createdBy: user.uid,
        plan,
        maxUsers: Number(maxUsers) > 0 ? Math.floor(Number(maxUsers)) : undefined,
        licenseTerm,
        trialDays:
          licenseTerm === 'trial' ? Math.max(1, Math.floor(Number(trialDays) || 14)) : undefined,
        licenseExpiresAt: expires,
        licenseKey: contractRef.trim() || undefined,
        licenseNotes: licenseNotes.trim() || undefined,
        active: true,
        adminEmail: adminEmail.trim().toLowerCase(),
      });
      createdTenantId = tenant.id;

      let cloneMsg = '';
      if (cloneFromTemplate) {
        const summary = await cloneTenantSettings({
          sourceTenantId: templateTenantId || DEFAULT_TENANT_ID,
          targetTenantId: tenant.id,
          includeEmailSettings,
        });
        cloneMsg = t('goldenCloneSummary', {
          shifts: summary.workShifts,
          locations: summary.workLocations,
          branches: summary.branches,
          departments: summary.departments,
          payroll: summary.payrollFormula ? t('yes') : t('no'),
        });
      }

      const createdAdmin = await adminCreateEmployee({
        email: adminEmail.trim().toLowerCase(),
        password: adminPassword,
        fullName: adminFullName.trim(),
        employeeId: '00001',
        role: 'admin',
        tenantId: tenant.id,
      });
      await updateTenant(tenant.id, {
        adminEmail: createdAdmin.email,
        adminUid: createdAdmin.uid,
      });
      createdTenantId = null;
      setCreating(false);
      resetCreate();
      await load();
      showAlert(
        t('success'),
        `${t('tenantProvisioned', { name: tenant.name, code: tenant.slug })}${
          cloneMsg ? `\n${cloneMsg}` : ''
        }`,
      );
    } catch (e: any) {
      if (createdTenantId && createdTenantId !== DEFAULT_TENANT_ID) {
        await deleteTenant(createdTenantId).catch(() => undefined);
      }
      const code = String(e?.code || '');
      const raw = String(e?.message || '');
      let message = raw || t('actionFailed');
      if (code.includes('email-already-in-use') || /email-already-in-use/i.test(raw)) {
        message = t('tenantAdminEmailInUse');
      } else if (code.includes('weak-password') || /weak-password/i.test(raw)) {
        message = t('passwordTooShort');
      }
      showAlert(t('error'), message);
      await load();
    } finally {
      setSaving(false);
    }
  };

  if (!isPlatform) {
    return (
      <View className="flex-1 bg-surface-50 items-center justify-center px-6">
        <MaterialCommunityIcons name="shield-lock" size={48} color="#94A3B8" />
        <Text className="text-surface-600 font-semibold mt-3 text-center">
          {t('platformAdminOnly')}
        </Text>
      </View>
    );
  }

  const renderTermPicker = (
    value: LicenseTerm,
    onChange: (term: LicenseTerm) => void,
  ) => (
    <View className="flex-row flex-wrap mb-2">
      {LICENSE_TERMS.map((term) => {
        const selected = value === term;
        return (
          <TouchableOpacity
            key={term}
            onPress={() => onChange(term)}
            className={`px-3 py-2 rounded-lg mr-2 mb-2 ${
              selected ? 'bg-primary-500' : 'bg-surface-100'
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                selected ? 'text-white' : 'text-surface-600'
              }`}
            >
              {termLabel(term)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <ScrollView
      className="flex-1 bg-surface-50"
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 48 }}
    >
      <View className="px-6 pt-12 pb-4 bg-white border-b border-surface-100">
        <Text className="text-2xl font-bold text-surface-800">{t('platformTenantsTitle')}</Text>
        <Text className="text-surface-400 text-sm mt-1">{t('platformTenantsSubtitle')}</Text>
        <TouchableOpacity
          onPress={() => {
            setEditing(null);
            resetCreate();
            setCreating(true);
          }}
          className="mt-3 bg-primary-500 rounded-xl h-11 items-center justify-center"
        >
          <Text className="text-white font-semibold">{t('provisionTenant')}</Text>
        </TouchableOpacity>
      </View>

      {creating && (
        <View className="mx-4 mt-4 bg-white rounded-2xl p-4 border border-surface-100">
          <Text className="font-semibold text-surface-800 mb-3">{t('provisionTenant')}</Text>
          <Text className="text-xs text-surface-400 mb-1">{t('companyName')}</Text>
          <TextInput
            className="border border-surface-200 rounded-xl px-3 h-11 mb-2"
            value={companyName}
            onChangeText={setCompanyName}
            placeholder={t('companyName')}
          />
          <Text className="text-xs text-surface-400 mb-1">{t('tenantSlug')}</Text>
          <View className="border border-surface-100 bg-surface-50 rounded-xl px-3 h-11 mb-1 justify-center">
            <Text className="text-surface-700 font-semibold">{autoSlugPreview}</Text>
          </View>
          <Text className="text-[11px] text-surface-400 mb-3">{t('companyCodeAutoHint')}</Text>

          <View className="flex-row items-center justify-between mb-2 bg-primary-50 rounded-xl px-3 py-2">
            <View className="flex-1 pr-2">
              <Text className="text-sm font-semibold text-primary-700">
                {t('cloneGoldenImage')}
              </Text>
              <Text className="text-[11px] text-surface-500">{t('cloneGoldenImageHint')}</Text>
            </View>
            <Switch value={cloneFromTemplate} onValueChange={setCloneFromTemplate} />
          </View>

          {cloneFromTemplate && (
            <View className="mb-3">
              <Text className="text-xs text-surface-400 mb-1">{t('goldenTemplateSource')}</Text>
              <View className="flex-row flex-wrap mb-2">
                {(tenants.length
                  ? tenants
                  : [{ id: DEFAULT_TENANT_ID, name: 'ECF / default' } as Tenant]
                ).map((tn) => {
                  const selected = templateTenantId === tn.id;
                  return (
                    <TouchableOpacity
                      key={tn.id}
                      onPress={() => setTemplateTenantId(tn.id)}
                      className={`px-3 py-2 rounded-lg mr-2 mb-2 ${
                        selected ? 'bg-primary-500' : 'bg-surface-100'
                      }`}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          selected ? 'text-white' : 'text-surface-600'
                        }`}
                      >
                        {tn.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-xs text-surface-600 flex-1 pr-2">
                  {t('cloneEmailSettings')}
                </Text>
                <Switch
                  value={includeEmailSettings}
                  onValueChange={setIncludeEmailSettings}
                />
              </View>
              <Text className="text-[10px] text-surface-400 mb-1">
                {t('cloneEmailSettingsHint')}
              </Text>
            </View>
          )}

          <Text className="text-xs text-surface-400 mb-1">{t('tenantPlan')}</Text>
          <View className="flex-row flex-wrap mb-2">
            {(['free', 'pro', 'enterprise'] as const).map((p) => (
              <TouchableOpacity
                key={p}
                onPress={() => setPlan(p)}
                className={`px-3 py-2 rounded-lg mr-2 mb-2 ${
                  plan === p ? 'bg-primary-500' : 'bg-surface-100'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    plan === p ? 'text-white' : 'text-surface-600'
                  }`}
                >
                  {p}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text className="text-xs text-surface-400 mb-1">{t('maxUsers')}</Text>
          <TextInput
            className="border border-surface-200 rounded-xl px-3 h-11 mb-2"
            keyboardType="numeric"
            value={maxUsers}
            onChangeText={setMaxUsers}
            placeholder="50"
          />

          <Text className="text-xs text-surface-400 mb-1">{t('licenseTerm')}</Text>
          {renderTermPicker(licenseTerm, setLicenseTerm)}
          {licenseTerm === 'trial' && (
            <>
              <Text className="text-xs text-surface-400 mb-1">{t('trialDays')}</Text>
              <TextInput
                className="border border-surface-200 rounded-xl px-3 h-11 mb-2"
                keyboardType="numeric"
                value={trialDays}
                onChangeText={setTrialDays}
                placeholder="14"
              />
            </>
          )}
          <Text className="text-xs text-surface-400 mb-1">{t('licenseExpiresAt')}</Text>
          <View className="border border-surface-100 bg-surface-50 rounded-xl px-3 h-11 mb-1 justify-center">
            <Text className="text-surface-800 font-semibold">{computedExpiry}</Text>
          </View>
          <Text className="text-[11px] text-surface-400 mb-3">{t('licenseExpiryAutoHint')}</Text>

          <Text className="text-xs text-surface-400 mb-1">{t('licenseKeyOptional')}</Text>
          <TextInput
            className="border border-surface-200 rounded-xl px-3 h-11 mb-1"
            value={contractRef}
            onChangeText={setContractRef}
            placeholder={t('licenseKeyPlaceholder')}
          />
          <Text className="text-[11px] text-surface-400 mb-2">{t('licenseKeyHint')}</Text>
          <Text className="text-xs text-surface-400 mb-1">{t('licenseNotes')}</Text>
          <TextInput
            className="border border-surface-200 rounded-xl px-3 h-11 mb-3"
            value={licenseNotes}
            onChangeText={setLicenseNotes}
          />

          <Text className="text-sm font-semibold text-surface-800 mb-2">
            {t('firstAdminAccount')}
          </Text>
          <TextInput
            className="border border-surface-200 rounded-xl px-3 h-11 mb-2"
            placeholder={t('fullName')}
            value={adminFullName}
            onChangeText={setAdminFullName}
          />
          <TextInput
            className="border border-surface-200 rounded-xl px-3 h-11 mb-2"
            placeholder={t('email')}
            autoCapitalize="none"
            keyboardType="email-address"
            value={adminEmail}
            onChangeText={setAdminEmail}
          />
          <TextInput
            className="border border-surface-200 rounded-xl px-3 h-11 mb-3"
            placeholder={t('temporaryPassword')}
            secureTextEntry
            value={adminPassword}
            onChangeText={setAdminPassword}
          />

          <View className="flex-row">
            <TouchableOpacity
              onPress={() => {
                setCreating(false);
                resetCreate();
              }}
              className="flex-1 bg-surface-100 rounded-xl h-11 items-center justify-center mr-2"
            >
              <Text className="text-surface-600 font-semibold">{t('cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={provision}
              disabled={saving}
              className="flex-1 bg-primary-500 rounded-xl h-11 items-center justify-center"
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-semibold">{t('provisionTenant')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {editing && (
        <View className="mx-4 mt-4 bg-white rounded-2xl p-4 border border-surface-100">
          <Text className="font-semibold text-surface-800 mb-1">{editing.name}</Text>
          <Text className="text-xs text-surface-400 mb-3">
            {editing.slug} · {editing.id}
          </Text>

          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-sm text-surface-700">{t('tenantActive')}</Text>
            <Switch value={editActive} onValueChange={setEditActive} />
          </View>

          <Text className="text-xs text-surface-400 mb-1">{t('tenantPlan')}</Text>
          <View className="flex-row flex-wrap mb-2">
            {(['free', 'pro', 'enterprise'] as const).map((p) => (
              <TouchableOpacity
                key={p}
                onPress={() => setEditPlan(p)}
                className={`px-3 py-2 rounded-lg mr-2 mb-2 ${
                  editPlan === p ? 'bg-primary-500' : 'bg-surface-100'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    editPlan === p ? 'text-white' : 'text-surface-600'
                  }`}
                >
                  {p}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text className="text-xs text-surface-400 mb-1">{t('licenseTerm')}</Text>
          {renderTermPicker(editTerm, setEditTerm)}
          {editTerm === 'trial' && (
            <>
              <Text className="text-xs text-surface-400 mb-1">{t('trialDays')}</Text>
              <TextInput
                className="border border-surface-200 rounded-xl px-3 h-11 mb-2"
                keyboardType="numeric"
                value={editTrialDays}
                onChangeText={setEditTrialDays}
                placeholder="14"
              />
            </>
          )}
          <Text className="text-xs text-surface-400 mb-1">{t('licenseExpiresAt')}</Text>
          <View className="border border-surface-100 bg-surface-50 rounded-xl px-3 h-11 mb-1 justify-center">
            <Text className="text-surface-800 font-semibold">{editComputedExpiry}</Text>
          </View>
          <Text className="text-[11px] text-surface-400 mb-2">
            {t('licenseRenewFromToday')} · {t('currentExpiry')}: {formatLicenseExpiry(editing)}
          </Text>

          <Text className="text-xs text-surface-400 mb-1">{t('maxUsers')}</Text>
          <TextInput
            className="border border-surface-200 rounded-xl px-3 h-11 mb-2"
            keyboardType="numeric"
            value={editMaxUsers}
            onChangeText={setEditMaxUsers}
            placeholder={t('unlimited')}
          />
          <Text className="text-xs text-surface-400 mb-1">{t('licenseKeyOptional')}</Text>
          <TextInput
            className="border border-surface-200 rounded-xl px-3 h-11 mb-1"
            value={editContractRef}
            onChangeText={setEditContractRef}
            placeholder={t('licenseKeyPlaceholder')}
          />
          <Text className="text-[11px] text-surface-400 mb-2">{t('licenseKeyHint')}</Text>
          <Text className="text-xs text-surface-400 mb-1">{t('licenseNotes')}</Text>
          <TextInput
            className="border border-surface-200 rounded-xl px-3 h-11 mb-3"
            value={editNotes}
            onChangeText={setEditNotes}
          />

          <View className="border border-surface-100 bg-surface-50 rounded-xl p-3 mb-3">
            <Text className="text-xs font-semibold text-surface-700 mb-1">
              {t('tenantAdminEmail')}
            </Text>
            <Text className="text-sm text-surface-800 mb-2">
              {adminByTenant[editing.id]?.email || editing.adminEmail || t('noTenantAdminFound')}
            </Text>
            <TouchableOpacity
              onPress={() => sendTenantReset(editing)}
              disabled={saving || resettingId === editing.id}
              className="bg-white border border-primary-200 rounded-xl h-10 items-center justify-center mb-3"
            >
              {resettingId === editing.id ? (
                <ActivityIndicator color="#0F766E" />
              ) : (
                <Text className="text-primary-700 text-xs font-semibold">
                  {t('sendTenantPasswordReset')}
                </Text>
              )}
            </TouchableOpacity>
            <Text className="text-xs text-surface-400 mb-1">{t('setTenantAdminPassword')}</Text>
            <TextInput
              className="border border-surface-200 bg-white rounded-xl px-3 h-11 mb-2"
              value={editNewPassword}
              onChangeText={setEditNewPassword}
              placeholder={t('newPasswordOptional')}
              secureTextEntry
            />
            <TextInput
              className="border border-surface-200 bg-white rounded-xl px-3 h-11 mb-1"
              value={editConfirmPassword}
              onChangeText={setEditConfirmPassword}
              placeholder={t('confirmNewPassword')}
              secureTextEntry
            />
            <Text className="text-[11px] text-surface-500 mb-2">{t('tenantAdminPasswordHint')}</Text>
            <TouchableOpacity
              onPress={applyTenantPassword}
              disabled={saving}
              className="bg-primary-500 rounded-xl h-10 items-center justify-center"
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white text-xs font-semibold">
                  {t('applyTenantAdminPassword')}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <View className="flex-row mb-2">
            <TouchableOpacity
              onPress={() => setEditing(null)}
              className="flex-1 bg-surface-100 rounded-xl h-11 items-center justify-center mr-2"
            >
              <Text className="text-surface-600 font-semibold">{t('cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={saveEdit}
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

          {editing.id !== DEFAULT_TENANT_ID && (
            <TouchableOpacity
              onPress={confirmDelete}
              disabled={saving}
              className="bg-danger-50 border border-danger-200 rounded-xl h-11 items-center justify-center"
            >
              <Text className="text-danger-600 font-semibold">{t('deleteTenant')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <View className="px-4 mt-4">
        <Text className="font-semibold text-surface-800 mb-2">
          {t('reportRowsCount', { count: tenants.length })}
        </Text>
        {tenants.map((tn) => {
          const lic = checkTenantLicense(tn);
          const seats = seatCounts[tn.id] ?? 0;
          const admin = adminByTenant[tn.id];
          const adminEmailLabel =
            admin?.email || tn.adminEmail || t('noTenantAdminFound');
          const max = tn.maxUsers && tn.maxUsers > 0 ? tn.maxUsers : null;
          const badge =
            lic.state === 'ok'
              ? tn.active === false
                ? t('suspended')
                : lic.expiringSoon
                  ? t('licenseExpiringSoonBadge')
                  : t('licenseOk')
              : lic.state === 'expired'
                ? t('licenseExpired')
                : t('suspended');
          const badgeBg =
            lic.state === 'ok' && tn.active !== false
              ? lic.expiringSoon
                ? 'bg-warning-50'
                : 'bg-accent-50'
              : 'bg-danger-50';
          const badgeText =
            lic.state === 'ok' && tn.active !== false
              ? lic.expiringSoon
                ? 'text-warning-600'
                : 'text-accent-700'
              : 'text-danger-600';
          return (
            <View
              key={tn.id}
              className="bg-white rounded-xl p-4 mb-2 border border-surface-100"
            >
              <TouchableOpacity onPress={() => openEdit(tn)}>
                <View className="flex-row justify-between items-start">
                  <View className="flex-1 pr-2">
                    <Text className="font-semibold text-surface-800">{tn.name}</Text>
                    <Text className="text-surface-500 text-xs mt-0.5">
                      {t('tenantSlug')}: {tn.slug}
                    </Text>
                    <View className="flex-row items-center mt-1">
                      <MaterialCommunityIcons name="email-outline" size={14} color="#475569" />
                      <Text className="text-surface-600 text-xs ml-1 flex-1">
                        {t('tenantAdminEmail')}: {adminEmailLabel}
                      </Text>
                    </View>
                    <Text className="text-surface-500 text-[11px] mt-1">
                      {t('tenantPlan')}: {tn.plan || 'free'}
                      {tn.licenseTerm ? ` · ${termLabel(tn.licenseTerm)}` : ''} ·{' '}
                      {t('seatsUsed', {
                        used: seats,
                        max: max ?? t('unlimited'),
                      })}
                    </Text>
                    <Text className="text-surface-500 text-[11px]">
                      {t('licenseExpiresAt')}: {formatLicenseExpiry(tn)}
                      {lic.daysLeft != null ? ` · ${t('daysLeft', { days: lic.daysLeft })}` : ''}
                    </Text>
                  </View>
                  <View className={`px-2 py-1 rounded-lg ${badgeBg}`}>
                    <Text className={`text-[10px] font-bold ${badgeText}`}>{badge}</Text>
                  </View>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => sendTenantReset(tn)}
                disabled={(!admin?.email && !tn.adminEmail) || resettingId === tn.id}
                className="mt-3 bg-primary-50 border border-primary-100 rounded-lg h-9 items-center justify-center"
              >
                {resettingId === tn.id ? (
                  <ActivityIndicator color="#0F766E" />
                ) : (
                  <Text className="text-primary-700 text-xs font-semibold">
                    {t('sendTenantPasswordReset')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}
