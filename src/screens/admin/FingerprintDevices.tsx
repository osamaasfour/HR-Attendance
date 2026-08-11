/**
 * Admin — ZKTeco fingerprint terminals per work location
 * Supports ADMS cloud push and IP:4370 TCP pull.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  Switch,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  db,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import { useAppAlert } from '../../context/AlertContext';
import { useLanguage } from '../../context/LanguageContext';
import { ZKTECO_ADMS_URL, generateDeviceSecret } from '../../constants/zkteco';
import type {
  FingerprintConnectionType,
  FingerprintDevice,
  FingerprintPunchLog,
  UserData,
  WorkLocation,
} from '../../types';

const DEFAULT_IP_PORT = 4370;

function formatTs(ts?: { toDate?: () => Date } | null): string {
  if (!ts?.toDate) return '—';
  try {
    return ts.toDate().toLocaleString();
  } catch {
    return '—';
  }
}

function deviceConnectionType(dev: FingerprintDevice): FingerprintConnectionType {
  return dev.connectionType === 'ip' ? 'ip' : 'adms';
}

export default function FingerprintDevicesScreen() {
  const { user } = useAuth();
  const { showAlert } = useAppAlert();
  const { t } = useLanguage();
  const tenantId = user?.tenantId || 'default';

  const [devices, setDevices] = useState<FingerprintDevice[]>([]);
  const [locations, setLocations] = useState<WorkLocation[]>([]);
  const [employees, setEmployees] = useState<Array<UserData & { uid: string }>>([]);
  const [punchLogs, setPunchLogs] = useState<FingerprintPunchLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<FingerprintDevice | null>(null);
  const [setupDevice, setSetupDevice] = useState<FingerprintDevice | null>(null);

  const [name, setName] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [workLocationId, setWorkLocationId] = useState('');
  const [deviceSecret, setDeviceSecret] = useState('');
  const [connectionType, setConnectionType] = useState<FingerprintConnectionType>('adms');
  const [host, setHost] = useState('');
  const [port, setPort] = useState(String(DEFAULT_IP_PORT));
  const [clearDeviceLogAfterSync, setClearDeviceLogAfterSync] = useState(false);
  const [active, setActive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [devSnap, locSnap, userSnap, logSnap] = await Promise.all([
        getDocs(collection(db, 'fingerprintDevices')),
        getDocs(collection(db, 'workLocations')),
        getDocs(collection(db, 'users')),
        getDocs(
          query(
            collection(db, 'fingerprintPunchLog'),
            where('tenantId', '==', tenantId),
            orderBy('createdAt', 'desc'),
            limit(20),
          ),
        ),
      ]);

      setDevices(
        devSnap.docs
          .map((d) => ({ ...(d.data() as FingerprintDevice), id: d.id }))
          .filter((d) => (d.tenantId || 'default') === tenantId)
          .sort((a, b) => a.name.localeCompare(b.name)),
      );

      setLocations(
        locSnap.docs
          .map((d) => ({ ...(d.data() as WorkLocation), id: d.id }))
          .filter((l) => (l.tenantId || 'default') === tenantId && l.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name)),
      );

      setEmployees(
        userSnap.docs
          .map((d) => ({ uid: d.id, ...(d.data() as UserData) }))
          .filter(
            (u) =>
              (u.tenantId || 'default') === tenantId &&
              u.active !== false &&
              u.role !== 'admin',
          )
          .sort((a, b) => (a.employeeId || '').localeCompare(b.employeeId || '')),
      );

      setPunchLogs(
        logSnap.docs.map((d) => ({ ...(d.data() as FingerprintPunchLog), id: d.id })),
      );
    } catch (e: any) {
      showAlert(t('error'), e?.message || t('actionFailed'));
    } finally {
      setLoading(false);
    }
  }, [showAlert, t, tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setName('');
    setSerialNumber('');
    setWorkLocationId(locations[0]?.id || '');
    setDeviceSecret('');
    setConnectionType('adms');
    setHost('');
    setPort(String(DEFAULT_IP_PORT));
    setClearDeviceLogAfterSync(false);
    setActive(true);
    setCreating(false);
    setEditing(null);
  };

  const openCreate = () => {
    resetForm();
    setDeviceSecret(generateDeviceSecret());
    setWorkLocationId(locations[0]?.id || '');
    setCreating(true);
  };

  const openEdit = (dev: FingerprintDevice) => {
    setCreating(false);
    setEditing(dev);
    setName(dev.name);
    setSerialNumber(dev.serialNumber);
    setWorkLocationId(dev.workLocationId);
    setDeviceSecret(dev.deviceSecret || '');
    setConnectionType(deviceConnectionType(dev));
    setHost(dev.host || '');
    setPort(String(dev.port || DEFAULT_IP_PORT));
    setClearDeviceLogAfterSync(dev.clearDeviceLogAfterSync === true);
    setActive(dev.active !== false);
  };

  const selectedLocation = useMemo(
    () => locations.find((l) => l.id === workLocationId),
    [locations, workLocationId],
  );

  const save = async () => {
    const trimmedName = name.trim();
    const sn = serialNumber.trim().toUpperCase();
    if (!trimmedName || !sn || !workLocationId) {
      showAlert(t('missing'), t('fingerprintDeviceFieldsRequired'));
      return;
    }
    if (connectionType === 'adms' && !deviceSecret.trim()) {
      showAlert(t('missing'), t('fingerprintSecretRequired'));
      return;
    }
    const trimmedHost = host.trim();
    if (connectionType === 'ip' && !trimmedHost) {
      showAlert(t('missing'), t('fingerprintHostRequired'));
      return;
    }
    const portNum = Number(port) || DEFAULT_IP_PORT;
    if (connectionType === 'ip' && (portNum < 1 || portNum > 65535)) {
      showAlert(t('missing'), t('fingerprintHostRequired'));
      return;
    }

    setSaving(true);
    try {
      const dupSnap = await getDocs(
        query(collection(db, 'fingerprintDevices'), where('serialNumber', '==', sn)),
      );
      const duplicate = dupSnap.docs.find((d) => d.id !== editing?.id);
      if (duplicate) {
        showAlert(t('error'), t('fingerprintSerialTaken'));
        return;
      }

      const loc = locations.find((l) => l.id === workLocationId);
      const payload = {
        name: trimmedName,
        serialNumber: sn,
        workLocationId,
        workLocationName: loc?.name || '',
        connectionType,
        host: connectionType === 'ip' ? trimmedHost : null,
        port: connectionType === 'ip' ? portNum : null,
        clearDeviceLogAfterSync:
          connectionType === 'ip' ? clearDeviceLogAfterSync : false,
        deviceSecret:
          connectionType === 'adms'
            ? deviceSecret.trim()
            : deviceSecret.trim() || '',
        active,
        tenantId,
        updatedAt: Timestamp.now(),
      };

      if (editing) {
        await updateDoc(doc(db, 'fingerprintDevices', editing.id), payload);
        showAlert(t('success'), t('fingerprintDeviceUpdated'));
      } else {
        const ref = await addDoc(collection(db, 'fingerprintDevices'), {
          ...payload,
          createdAt: Timestamp.now(),
        });
        const created: FingerprintDevice = {
          id: ref.id,
          ...payload,
        };
        setSetupDevice(created);
        showAlert(t('success'), t('fingerprintDeviceCreated'));
      }
      resetForm();
      await load();
    } catch (e: any) {
      showAlert(t('error'), e?.message || t('actionFailed'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (dev: FingerprintDevice) => {
    showAlert(t('deleteFingerprintDeviceTitle'), t('deleteFingerprintDeviceConfirm', { name: dev.name }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await deleteDoc(doc(db, 'fingerprintDevices', dev.id));
              if (setupDevice?.id === dev.id) setSetupDevice(null);
              await load();
              showAlert(t('success'), t('fingerprintDeviceDeleted'));
            } catch (e: any) {
              showAlert(t('error'), e?.message || t('actionFailed'));
            }
          })();
        },
      },
    ]);
  };

  const formOpen = creating || !!editing;
  const setupIsIp = setupDevice ? deviceConnectionType(setupDevice) === 'ip' : false;

  return (
    <ScrollView
      className="flex-1 bg-surface-50"
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      contentContainerStyle={{ paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="px-4 pt-4 pb-2 flex-row items-center justify-between">
        <View className="flex-1 mr-2">
          <Text className="text-xl font-bold text-surface-900">{t('fingerprintDevicesTitle')}</Text>
          <Text className="text-sm text-surface-500 mt-1">{t('fingerprintDevicesSubtitle')}</Text>
        </View>
        {!formOpen && (
          <TouchableOpacity onPress={openCreate} className="bg-primary-500 px-4 py-2.5 rounded-xl">
            <Text className="text-white font-semibold text-sm">{t('addFingerprintDevice')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {setupDevice && (
        <View className="mx-4 mb-3 bg-primary-50 border border-primary-100 rounded-2xl p-4">
          <Text className="font-semibold text-primary-800 mb-2">{t('zktecoSetupTitle')}</Text>
          {setupIsIp ? (
            <>
              <Text className="text-xs text-surface-600 mb-1">{t('fingerprintDeviceHost')}</Text>
              <Text className="text-sm font-mono text-surface-800 mb-2">
                {setupDevice.host}:{setupDevice.port || DEFAULT_IP_PORT}
              </Text>
              <Text className="text-xs text-surface-600 mb-1">{t('fingerprintDeviceCommKey')}</Text>
              <Text className="text-sm font-mono text-surface-800 mb-2">
                {setupDevice.deviceSecret || '0'}
              </Text>
              <Text className="text-xs text-surface-600 mb-1">{t('zktecoSerialNumber')}</Text>
              <Text className="text-sm font-semibold text-surface-800 mb-2">
                {setupDevice.serialNumber}
              </Text>
              <Text className="text-[11px] text-surface-500 leading-4 mb-3">
                {t('zktecoIpSetupSteps')}
              </Text>
            </>
          ) : (
            <>
              <Text className="text-xs text-surface-600 mb-1">{t('zktecoServerUrl')}</Text>
              <Text className="text-sm font-mono text-surface-800 mb-2">{ZKTECO_ADMS_URL}</Text>
              <Text className="text-xs text-surface-600 mb-1">{t('zktecoSerialNumber')}</Text>
              <Text className="text-sm font-semibold text-surface-800 mb-2">
                {setupDevice.serialNumber}
              </Text>
              <Text className="text-xs text-surface-600 mb-1">{t('zktecoCommKey')}</Text>
              <Text className="text-sm font-mono text-surface-800 mb-2">
                {setupDevice.deviceSecret}
              </Text>
              <Text className="text-[11px] text-surface-500 leading-4 mb-3">
                {t('zktecoSetupSteps')}
              </Text>
            </>
          )}
          <TouchableOpacity
            onPress={() => setSetupDevice(null)}
            className="bg-white border border-primary-200 rounded-xl h-10 items-center justify-center"
          >
            <Text className="text-primary-700 font-semibold text-sm">{t('done')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {formOpen && (
        <View className="mx-4 mb-3 bg-white rounded-2xl p-4 border border-surface-100">
          <Text className="text-base font-semibold text-surface-800 mb-3">
            {editing ? t('editFingerprintDevice') : t('addFingerprintDevice')}
          </Text>

          <Text className="text-xs text-surface-400 mb-1">{t('connectionTypeLabel')}</Text>
          <View className="flex-row mb-3">
            {([
              { id: 'adms' as const, label: t('connectionTypeAdms') },
              { id: 'ip' as const, label: t('connectionTypeIp') },
            ]).map((opt) => {
              const selected = connectionType === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  onPress={() => {
                    setConnectionType(opt.id);
                    if (opt.id === 'adms') {
                      if (!deviceSecret || /^\d+$/.test(deviceSecret)) {
                        setDeviceSecret(generateDeviceSecret());
                      }
                    } else if (opt.id === 'ip') {
                      // Comm Key is numeric; don't keep ADMS alphanumeric secret
                      if (!/^\d*$/.test(deviceSecret)) {
                        setDeviceSecret('0');
                      }
                    }
                  }}
                  className={`flex-1 px-3 py-2.5 rounded-xl mr-2 ${
                    selected ? 'bg-primary-500' : 'bg-surface-100'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold text-center ${
                      selected ? 'text-white' : 'text-surface-600'
                    }`}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text className="text-xs text-surface-400 mb-1">{t('fingerprintDeviceName')}</Text>
          <TextInput
            className="border border-surface-200 rounded-xl px-3 h-11 mb-2"
            value={name}
            onChangeText={setName}
            placeholder={t('fingerprintDeviceNamePlaceholder')}
          />
          <Text className="text-xs text-surface-400 mb-1">{t('zktecoSerialNumber')}</Text>
          <TextInput
            className="border border-surface-200 rounded-xl px-3 h-11 mb-2"
            value={serialNumber}
            onChangeText={setSerialNumber}
            autoCapitalize="characters"
            placeholder="CQ1234567890"
          />
          <Text className="text-xs text-surface-400 mb-1">{t('assignedWorkLocation')}</Text>
          <View className="flex-row flex-wrap mb-2">
            {locations.length === 0 ? (
              <Text className="text-surface-400 text-xs">{t('noLocationsYet')}</Text>
            ) : (
              locations.map((loc) => {
                const selected = workLocationId === loc.id;
                return (
                  <TouchableOpacity
                    key={loc.id}
                    onPress={() => setWorkLocationId(loc.id)}
                    className={`px-3 py-2 rounded-lg mr-2 mb-2 ${
                      selected ? 'bg-primary-500' : 'bg-surface-100'
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        selected ? 'text-white' : 'text-surface-600'
                      }`}
                    >
                      {loc.name}
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
          {selectedLocation && (
            <Text className="text-[11px] text-surface-400 mb-2">
              {selectedLocation.latitude.toFixed(5)}, {selectedLocation.longitude.toFixed(5)}
            </Text>
          )}

          {connectionType === 'adms' ? (
            <>
              <Text className="text-xs text-surface-400 mb-1">{t('zktecoCommKey')}</Text>
              <TextInput
                className="border border-surface-200 rounded-xl px-3 h-11 mb-2 font-mono"
                value={deviceSecret}
                onChangeText={setDeviceSecret}
              />
            </>
          ) : (
            <>
              <Text className="text-xs text-surface-400 mb-1">{t('fingerprintDeviceHost')}</Text>
              <TextInput
                className="border border-surface-200 rounded-xl px-3 h-11 mb-2 font-mono"
                value={host}
                onChangeText={setHost}
                placeholder={t('fingerprintDeviceHostPlaceholder')}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text className="text-xs text-surface-400 mb-1">{t('fingerprintDevicePort')}</Text>
              <TextInput
                className="border border-surface-200 rounded-xl px-3 h-11 mb-2 font-mono"
                value={port}
                onChangeText={setPort}
                keyboardType="number-pad"
                placeholder={String(DEFAULT_IP_PORT)}
              />
              <Text className="text-xs text-surface-400 mb-1">{t('fingerprintDeviceCommKey')}</Text>
              <TextInput
                className="border border-surface-200 rounded-xl px-3 h-11 mb-1 font-mono"
                value={deviceSecret}
                onChangeText={setDeviceSecret}
                keyboardType="number-pad"
                placeholder={t('fingerprintDeviceCommKeyPlaceholder')}
              />
              <Text className="text-[11px] text-surface-500 leading-4 mb-2">
                {t('fingerprintDeviceCommKeyHint')}
              </Text>
              <Text className="text-[11px] text-surface-500 leading-4 mb-2">
                {t('fingerprintIpHint')}
              </Text>
              <View className="flex-row items-start justify-between mb-3">
                <View className="flex-1 pr-3">
                  <Text className="text-sm text-surface-700">
                    {t('fingerprintClearLogAfterSync')}
                  </Text>
                  <Text className="text-[11px] text-surface-500 mt-0.5 leading-4">
                    {t('fingerprintClearLogAfterSyncHint')}
                  </Text>
                </View>
                <Switch
                  value={clearDeviceLogAfterSync}
                  onValueChange={setClearDeviceLogAfterSync}
                />
              </View>
            </>
          )}

          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-sm text-surface-700">{t('activeStatus')}</Text>
            <Switch value={active} onValueChange={setActive} />
          </View>
          <View className="flex-row">
            <TouchableOpacity
              onPress={resetForm}
              className="flex-1 bg-surface-100 rounded-xl h-11 items-center justify-center mr-2"
            >
              <Text className="text-surface-600 font-semibold">{t('cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={save}
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
      )}

      <View className="px-4">
        <Text className="font-semibold text-surface-800 mb-2">
          {t('reportRowsCount', { count: devices.length })}
        </Text>
        {devices.map((dev) => {
          const ctype = deviceConnectionType(dev);
          return (
            <View
              key={dev.id}
              className="bg-white rounded-2xl p-4 border border-surface-100 mb-3"
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-2">
                  <Text className="font-semibold text-surface-800">{dev.name}</Text>
                  <Text className="text-surface-500 text-xs mt-0.5">SN: {dev.serialNumber}</Text>
                  <View className="flex-row flex-wrap mt-1.5">
                    <View className="bg-surface-100 px-2 py-0.5 rounded-md mr-2 mb-1">
                      <Text className="text-[10px] font-bold text-surface-600">
                        {ctype === 'ip'
                          ? `IP ${dev.host || '—'}:${dev.port || DEFAULT_IP_PORT}`
                          : 'ADMS'}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-surface-400 text-xs mt-1">
                    {t('assignedWorkLocation')}: {dev.workLocationName || dev.workLocationId}
                  </Text>
                  <Text className="text-surface-400 text-[11px] mt-1">
                    {t('lastSeen')}: {formatTs(dev.lastSeenAt)}
                  </Text>
                  <Text className="text-surface-400 text-[11px]">
                    {t('lastPunch')}: {formatTs(dev.lastPunchAt)}
                  </Text>
                  {ctype === 'ip' && (
                    <>
                      <Text className="text-surface-400 text-[11px]">
                        {t('lastPoll')}: {formatTs(dev.lastPollAt)}
                      </Text>
                      {!!dev.lastPollError && (
                        <Text className="text-danger-600 text-[11px] mt-0.5">
                          {t('fingerprintPollError')}: {dev.lastPollError}
                        </Text>
                      )}
                    </>
                  )}
                </View>
                <View
                  className={`px-2 py-1 rounded-lg ${
                    dev.active !== false ? 'bg-accent-50' : 'bg-danger-50'
                  }`}
                >
                  <Text
                    className={`text-[10px] font-bold ${
                      dev.active !== false ? 'text-accent-700' : 'text-danger-600'
                    }`}
                  >
                    {dev.active !== false ? t('activeStatus') : t('inactiveStatus')}
                  </Text>
                </View>
              </View>
              <View className="flex-row flex-wrap mt-3">
                <TouchableOpacity
                  onPress={() => openEdit(dev)}
                  className="bg-surface-100 px-3 py-2 rounded-lg mr-2 mb-2"
                >
                  <Text className="text-surface-600 text-xs font-semibold">{t('edit')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setSetupDevice(dev)}
                  className="bg-primary-50 px-3 py-2 rounded-lg mr-2 mb-2"
                >
                  <Text className="text-primary-700 text-xs font-semibold">
                    {t('zktecoSetupTitle')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => confirmDelete(dev)}
                  className="bg-danger-50 px-3 py-2 rounded-lg mb-2"
                >
                  <Text className="text-danger-600 text-xs font-semibold">{t('delete')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </View>

      <View className="mx-4 mt-4 bg-white rounded-2xl p-4 border border-surface-100">
        <View className="flex-row items-center mb-2">
          <MaterialCommunityIcons name="account-key" size={20} color="#1E3A5F" />
          <Text className="text-base font-semibold text-surface-800 ml-2">
            {t('fingerprintEnrollmentTitle')}
          </Text>
        </View>
        <Text className="text-[11px] text-surface-500 mb-3 leading-4">
          {t('fingerprintEnrollmentHint')}
        </Text>
        {employees.length === 0 ? (
          <Text className="text-surface-400 text-sm">{t('noData')}</Text>
        ) : (
          employees.slice(0, 50).map((emp) => (
            <View
              key={emp.uid}
              className="flex-row items-center justify-between py-2 border-b border-surface-50"
            >
              <View className="flex-1">
                <Text className="text-surface-800 text-sm font-medium">{emp.fullName}</Text>
                <Text className="text-surface-400 text-xs">
                  {emp.department || emp.branchName || '—'}
                </Text>
              </View>
              <View className="bg-primary-50 px-3 py-1 rounded-lg">
                <Text className="text-primary-700 font-bold text-sm">{emp.employeeId}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View className="mx-4 mt-4 bg-white rounded-2xl p-4 border border-surface-100">
        <Text className="text-base font-semibold text-surface-800 mb-2">
          {t('fingerprintPunchLogTitle')}
        </Text>
        {punchLogs.length === 0 ? (
          <Text className="text-surface-400 text-sm">{t('noData')}</Text>
        ) : (
          punchLogs.map((log) => (
            <View key={log.id} className="py-2 border-b border-surface-50">
              <Text className="text-surface-800 text-xs font-medium">
                {log.employeePin || '—'} · {log.status}
              </Text>
              <Text className="text-surface-400 text-[10px] mt-0.5">
                {log.reason || log.rawLine.slice(0, 60)}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}
