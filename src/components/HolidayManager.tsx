/**
 * Admin CRUD for company public holidays (used inside Settings).
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  db,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp,
} from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { useAppAlert } from '../context/AlertContext';
import { useLanguage } from '../context/LanguageContext';
import DateField from './DateField';
import { fetchHolidays, holidayEnd, holidayStart } from '../utils/holidays';
import { colors } from '../constants/colors';
import type { Holiday } from '../types';

export default function HolidayManager() {
  const { user } = useAuth();
  const { showAlert } = useAppAlert();
  const { t, language } = useLanguage();
  const tenantId = user?.tenantId || 'default';

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [recurring, setRecurring] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setHolidays(await fetchHolidays(tenantId));
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
    setStartDate('');
    setEndDate('');
    setRecurring(false);
    setEditing(null);
    setFormOpen(false);
  };

  const openCreate = () => {
    setName('');
    setStartDate('');
    setEndDate('');
    setRecurring(false);
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (item: Holiday) => {
    const start = holidayStart(item);
    setEditing(item);
    setName(item.name);
    setStartDate(start);
    setEndDate(holidayEnd(item));
    setRecurring(Boolean(item.recurring));
    setFormOpen(true);
  };

  const onChangeStart = (ymd: string) => {
    setStartDate(ymd);
    setEndDate((prev) => (!prev || prev < ymd ? ymd : prev));
  };

  const save = async () => {
    if (!name.trim()) {
      showAlert(t('missing'), t('holidayName'));
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      showAlert(t('missing'), t('holidayStartDate'));
      return;
    }
    const last = /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? endDate : startDate;
    if (last < startDate) {
      showAlert(t('error'), t('invalidRange'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        startDate,
        endDate: last,
        date: startDate,
        recurring,
        tenantId,
        updatedAt: Timestamp.now(),
      };
      if (editing) {
        await updateDoc(doc(db, 'holidays', editing.id), payload);
      } else {
        await addDoc(collection(db, 'holidays'), {
          ...payload,
          createdAt: Timestamp.now(),
          createdBy: user?.uid || null,
        });
      }
      resetForm();
      await load();
      showAlert(t('success'), t('holidaySaved'));
    } catch (e: any) {
      showAlert(t('error'), e?.message || t('actionFailed'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (item: Holiday) => {
    showAlert(t('deleteHolidayTitle'), t('deleteHolidayConfirm', { name: item.name }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await deleteDoc(doc(db, 'holidays', item.id));
              if (editing?.id === item.id) resetForm();
              await load();
              showAlert(t('success'), t('holidayDeleted'));
            } catch (e: any) {
              showAlert(t('error'), e?.message || t('actionFailed'));
            }
          })();
        },
      },
    ]);
  };

  const locale = language === 'ar' ? 'ar-EG' : 'en-US';
  const formatYmd = (ymd: string) => {
    const d = new Date(`${ymd}T12:00:00`);
    if (Number.isNaN(d.getTime())) return ymd;
    return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <View className="bg-white rounded-2xl p-4 border border-surface-100 mb-4">
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center flex-1 pr-2">
          <MaterialCommunityIcons name="calendar-star" size={22} color={colors.primary} />
          <Text className="text-lg font-bold text-surface-800 ml-2">{t('holidaysTitle')}</Text>
        </View>
        <TouchableOpacity onPress={openCreate} className="bg-primary-50 px-3 py-2 rounded-lg">
          <Text className="text-primary-600 text-xs font-bold">{t('addHoliday')}</Text>
        </TouchableOpacity>
      </View>
      <Text className="text-surface-400 text-xs mb-3 leading-4">{t('holidaysHint')}</Text>

      {loading ? (
        <ActivityIndicator color={colors.primary} className="mb-2" />
      ) : holidays.length === 0 && !formOpen ? (
        <Text className="text-surface-400 text-sm mb-2">{t('noHolidaysYet')}</Text>
      ) : (
        holidays.map((item) => (
          <View
            key={item.id}
            className="flex-row items-center border border-surface-100 rounded-xl px-3 py-3 mb-2"
          >
            <View className="flex-1 pr-2">
              <Text className="font-semibold text-surface-800">{item.name}</Text>
              <Text className="text-xs text-surface-500 mt-0.5">
                {holidayStart(item) && holidayEnd(item) && holidayEnd(item) !== holidayStart(item)
                  ? `${formatYmd(holidayStart(item))} – ${formatYmd(holidayEnd(item))}`
                  : formatYmd(holidayStart(item) || item.date || '')}
                {item.recurring ? ` · ${t('holidayEveryYear')}` : ''}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => openEdit(item)}
              className="bg-surface-100 px-3 py-2 rounded-lg mr-2"
            >
              <Text className="text-surface-600 text-xs font-semibold">{t('edit')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => confirmDelete(item)}
              className="bg-danger-50 px-3 py-2 rounded-lg"
            >
              <Text className="text-danger-600 text-xs font-semibold">{t('delete')}</Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      {formOpen ? (
        <View className="mt-1 pt-3 border-t border-surface-100">
          <Text className="text-xs text-surface-400 mb-1">{t('holidayName')}</Text>
          <TextInput
            className="border border-surface-200 rounded-xl px-3 h-11 mb-2"
            value={name}
            onChangeText={setName}
            placeholder={t('holidayName')}
          />
          <DateField label={t('holidayStartDate')} value={startDate} onChange={onChangeStart} />
          <DateField
            label={t('holidayEndDate')}
            value={endDate}
            onChange={setEndDate}
            minimumDate={startDate || undefined}
          />
          <View className="flex-row items-center justify-between mt-3 mb-3">
            <View className="flex-1 pr-3">
              <Text className="text-sm font-semibold text-surface-700">{t('holidayRecurring')}</Text>
              <Text className="text-[11px] text-surface-400 mt-0.5">{t('holidayRecurringHint')}</Text>
            </View>
            <Switch value={recurring} onValueChange={setRecurring} />
          </View>
          <View className="flex-row">
            <TouchableOpacity
              onPress={resetForm}
              className="flex-1 border border-surface-200 rounded-xl h-11 items-center justify-center mr-2"
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
      ) : null}
    </View>
  );
}
