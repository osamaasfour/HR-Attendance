/**
 * Admin — manage punch geofence working locations
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  db,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  Timestamp,
} from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import { useAppAlert } from '../../context/AlertContext';
import { useLanguage } from '../../context/LanguageContext';
import { useCompany } from '../../context/CompanyContext';
import { LOCATION_TIMEZONE_OPTIONS, DEFAULT_PUNCH_TIMEZONE } from '../../constants/timezones';
import type { WorkLocation } from '../../types';

const DEFAULT_RADIUS = 100;

export default function AdminWorkLocationsScreen() {
  const { user } = useAuth();
  const { showAlert } = useAppAlert();
  const { t } = useLanguage();
  const { company } = useCompany();
  const tenantId = user?.tenantId || 'default';
  const defaultTimezone = company.timezone || DEFAULT_PUNCH_TIMEZONE;

  const [locations, setLocations] = useState<WorkLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<WorkLocation | null>(null);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [radiusMeters, setRadiusMeters] = useState(String(DEFAULT_RADIUS));
  const [timezone, setTimezone] = useState(defaultTimezone);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'workLocations'));
      const list = snap.docs
        .map((d) => ({ ...(d.data() as WorkLocation), id: d.id }))
        .filter((loc) => (loc.tenantId || 'default') === tenantId)
        .sort((a, b) => a.name.localeCompare(b.name));
      setLocations(list);
    } catch (e: any) {
      showAlert(t('error'), e?.message || t('actionFailed'));
    } finally {
      setLoading(false);
    }
  }, [showAlert, t, tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setName('');
    setLatitude('');
    setLongitude('');
    setRadiusMeters(String(DEFAULT_RADIUS));
    setTimezone(defaultTimezone);
    setEditing(null);
    setCreating(false);
  };

  const openCreate = () => {
    resetForm();
    setTimezone(defaultTimezone);
    setCreating(true);
  };

  const openEdit = (loc: WorkLocation) => {
    setCreating(false);
    setEditing(loc);
    setName(loc.name);
    setLatitude(String(loc.latitude));
    setLongitude(String(loc.longitude));
    setRadiusMeters(String(loc.radiusMeters ?? DEFAULT_RADIUS));
    setTimezone(loc.timezone || defaultTimezone);
  };

  const parseCoords = () => {
    const lat = Number(latitude.trim());
    const lng = Number(longitude.trim());
    const radius = Number(radiusMeters.trim());
    if (!name.trim()) {
      showAlert(t('missing'), t('locationName'));
      return null;
    }
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      showAlert(t('error'), t('invalidLatitude'));
      return null;
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      showAlert(t('error'), t('invalidLongitude'));
      return null;
    }
    if (!Number.isFinite(radius) || radius < 20 || radius > 5000) {
      showAlert(t('error'), t('invalidRadius'));
      return null;
    }
    return { lat, lng, radius };
  };

  const save = async () => {
    const parsed = parseCoords();
    if (!parsed) return;
    setSaving(true);
    try {
      if (editing) {
        await updateDoc(doc(db, 'workLocations', editing.id), {
          name: name.trim(),
          latitude: parsed.lat,
          longitude: parsed.lng,
          radiusMeters: parsed.radius,
          timezone,
          updatedAt: Timestamp.now(),
        });
        showAlert(t('success'), t('locationUpdated'));
      } else {
        await addDoc(collection(db, 'workLocations'), {
          name: name.trim(),
          latitude: parsed.lat,
          longitude: parsed.lng,
          radiusMeters: parsed.radius,
          timezone,
          tenantId,
          active: true,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
        showAlert(t('success'), t('locationCreated'));
      }
      resetForm();
      await load();
    } catch (e: any) {
      showAlert(t('error'), e?.message || t('actionFailed'));
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (loc: WorkLocation, active: boolean) => {
    try {
      await updateDoc(doc(db, 'workLocations', loc.id), {
        active,
        updatedAt: Timestamp.now(),
      });
      await load();
    } catch (e: any) {
      showAlert(t('error'), e?.message || t('actionFailed'));
    }
  };

  const formOpen = creating || !!editing;

  if (formOpen) {
    return (
      <View className="flex-1 bg-surface-50">
        <View className="px-4 pt-4 pb-3 flex-row items-center border-b border-surface-100 bg-white">
          <TouchableOpacity
            onPress={resetForm}
            className="w-10 h-10 rounded-full bg-surface-100 items-center justify-center mr-3"
            accessibilityRole="button"
            accessibilityLabel={t('cancel')}
          >
            <MaterialCommunityIcons name="arrow-left" size={22} color="#475569" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-xl font-bold text-surface-900">
              {editing ? t('editLocation') : t('addLocation')}
            </Text>
          </View>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="bg-white rounded-2xl p-4 border border-surface-100">
            <Text className="text-xs text-surface-400 mb-1">{t('locationName')}</Text>
            <TextInput
              className="border border-surface-200 rounded-xl px-3 h-11 mb-2"
              placeholder={t('locationNamePlaceholder')}
              value={name}
              onChangeText={setName}
            />
            <Text className="text-xs text-surface-400 mb-1">{t('latitude')}</Text>
            <TextInput
              className="border border-surface-200 rounded-xl px-3 h-11 mb-2"
              placeholder="30.0444"
              keyboardType="decimal-pad"
              value={latitude}
              onChangeText={setLatitude}
            />
            <Text className="text-xs text-surface-400 mb-1">{t('longitude')}</Text>
            <TextInput
              className="border border-surface-200 rounded-xl px-3 h-11 mb-2"
              placeholder="31.2357"
              keyboardType="decimal-pad"
              value={longitude}
              onChangeText={setLongitude}
            />
            <Text className="text-xs text-surface-400 mb-1">{t('radiusMeters')}</Text>
            <TextInput
              className="border border-surface-200 rounded-xl px-3 h-11 mb-3"
              placeholder={String(DEFAULT_RADIUS)}
              keyboardType="number-pad"
              value={radiusMeters}
              onChangeText={setRadiusMeters}
            />
            <Text className="text-xs text-surface-400 mb-3">{t('locationCoordsHint')}</Text>
            <Text className="text-xs text-surface-400 mb-1">{t('locationTimezone')}</Text>
            <View className="flex-row flex-wrap mb-2">
              {LOCATION_TIMEZONE_OPTIONS.map((opt) => {
                const selected = timezone === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => setTimezone(opt.value)}
                    className={`px-3 py-2 rounded-lg mr-2 mb-2 border ${
                      selected ? 'bg-primary-50 border-primary-300' : 'bg-surface-50 border-surface-200'
                    }`}
                  >
                    <Text
                      className={`text-xs font-medium ${
                        selected ? 'text-primary-700' : 'text-surface-600'
                      }`}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text className="text-xs text-surface-400 mb-6">{t('locationTimezoneHint')}</Text>
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
                  <Text className="text-white font-semibold">
                    {editing ? t('save') : t('createLocation')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface-50">
      <View className="px-4 pt-4 pb-2 flex-row items-center justify-between">
        <View className="flex-1 mr-2">
          <Text className="text-xl font-bold text-surface-900">{t('navLocations')}</Text>
          <Text className="text-sm text-surface-500 mt-1">{t('locationsSubtitle')}</Text>
        </View>
        <TouchableOpacity
          onPress={openCreate}
          className="bg-primary-500 px-4 py-2.5 rounded-xl"
        >
          <Text className="text-white font-semibold text-sm">{t('addLocation')}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={locations}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={
          !loading ? (
            <Text className="text-center text-surface-400 mt-8">{t('noLocationsYet')}</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <View className="bg-white rounded-2xl p-4 border border-surface-100 mb-3">
            <Text className="font-semibold text-surface-800 text-base">{item.name}</Text>
            <Text className="text-surface-500 text-sm mt-1">
              {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)} · {item.radiusMeters}m
            </Text>
            <Text className="text-surface-400 text-xs mt-1">
              {item.timezone || defaultTimezone}
            </Text>
            <Text className="text-surface-400 text-xs mt-1">
              {item.active === false ? t('inactiveStatus') : t('activeStatus')}
            </Text>
            <View className="flex-row flex-wrap mt-3">
              <TouchableOpacity
                onPress={() => openEdit(item)}
                className="bg-surface-100 px-3 py-2 rounded-lg mr-2 mb-2"
              >
                <Text className="text-surface-600 text-xs font-semibold">{t('edit')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setActive(item, item.active === false)}
                className="bg-warning-50 px-3 py-2 rounded-lg mb-2"
              >
                <Text className="text-warning-600 text-xs font-semibold">
                  {item.active === false ? t('activate') : t('deactivate')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );
}
