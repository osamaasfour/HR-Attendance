/**
 * Employee payslips list
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { db, collection, query, where, getDocs } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import type { Payslip } from '../../types';

export default function EmployeePayslipsScreen() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigation = useNavigation<any>();
  const [slips, setSlips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'payslips'),
        where('userId', '==', user.uid),
        where('published', '==', true),
      );
      const snap = await getDocs(q);
      const rows = snap.docs.map((d) => ({ ...(d.data() as Payslip), id: d.id }));
      rows.sort((a, b) => (b.period || '').localeCompare(a.period || ''));
      setSlips(rows);
    } catch (e) {
      console.error('[Payslips]', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View className="flex-1 bg-surface-50">
      <View className="px-6 pt-12 pb-4 bg-white border-b border-surface-100">
        <Text className="text-2xl font-bold text-surface-800">{t('payslips')}</Text>
        <Text className="text-surface-400 text-sm mt-1">{t('navPay')}</Text>
      </View>
      <FlatList
        data={slips}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <Text className="text-center text-surface-400 mt-10">{t('noPayslips')}</Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => navigation.navigate('PayslipDetail', { payslip: item })}
            className="bg-white rounded-xl p-4 mb-3 border border-surface-100"
          >
            <View className="flex-row justify-between">
              <Text className="font-semibold text-surface-800">{item.period}</Text>
              <Text className="text-primary-500 font-bold">{item.netPay.toFixed(2)}</Text>
            </View>
            <Text className="text-surface-400 text-sm mt-1">
              {t('gross')} {item.grossPay.toFixed(2)} · {t('deductions')}{' '}
              {item.totalDeductions.toFixed(2)}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
