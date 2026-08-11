import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, RefreshControl, TextInput, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { db, collection, getDocs } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import type { UserData } from '../../types';

export default function DirectoryScreen({ editable = false }: { editable?: boolean }) {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [users, setUsers] = useState<UserData[]>([]);
  const [queryText, setQueryText] = useState('');
  const [loading, setLoading] = useState(false);
  const tenantId = user?.tenantId || 'default';

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'users'));
      const rows = snap.docs.map((d) => ({ ...(d.data() as UserData), uid: d.id }));
      setUsers(
        rows.filter(
          (u) => u.active !== false && (u.tenantId || 'default') === tenantId,
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [tenantId]);

  const filtered = users.filter((u) => {
    const q = queryText.trim().toLowerCase();
    if (!q) return true;
    return (
      u.fullName?.toLowerCase().includes(q) ||
      u.employeeId?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.department?.toLowerCase().includes(q) ||
      u.branchName?.toLowerCase().includes(q)
    );
  });

  return (
    <View className="flex-1 bg-surface-50">
      <View className="px-6 pt-12 pb-4 bg-white border-b border-surface-100">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-2xl font-bold text-surface-800">{t('directory')}</Text>
            <Text className="text-surface-400 text-sm mt-1">
              {t('peopleCount', { count: filtered.length })}
              {editable ? ` · ${t('roleAdmin')}` : ''}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('OrgChart')}
            className="bg-primary-50 px-3 py-2 rounded-xl"
          >
            <Text className="text-primary-500 text-xs font-semibold">{t('orgChartLink')}</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          className="mt-3 border border-surface-200 rounded-xl px-3 h-11 text-surface-800"
          placeholder={t('searchPeople')}
          placeholderTextColor="#CBD5E1"
          value={queryText}
          onChangeText={setQueryText}
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.uid}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <View className="bg-white rounded-xl p-4 mb-3 border border-surface-100">
            <Text className="font-semibold text-surface-800">{item.fullName}</Text>
            <Text className="text-surface-500 text-sm mt-1">
              {item.employeeId} · {item.role}
              {item.jobTitle ? ` · ${item.jobTitle}` : ''}
            </Text>
            {!!item.department && (
              <Text className="text-surface-400 text-sm">{item.department}</Text>
            )}
            <Text className="text-surface-400 text-sm">{item.email}</Text>
            {!!item.phone && <Text className="text-surface-400 text-sm">{item.phone}</Text>}
          </View>
        )}
      />
    </View>
  );
}
