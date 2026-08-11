import React from 'react';
import { View, Text, TouchableOpacity, FlatList, RefreshControl } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNotifications } from '../../hooks/useNotifications';
import { useLanguage } from '../../context/LanguageContext';

export function NotificationBell({ onPress }: { onPress: () => void }) {
  const { unreadCount } = useNotifications();
  return (
    <TouchableOpacity onPress={onPress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      <MaterialCommunityIcons name="bell-outline" size={24} color="#1E3A5F" />
      {unreadCount > 0 && (
        <View className="absolute -top-1 -right-1 bg-danger-500 rounded-full min-w-[16px] h-4 items-center justify-center px-1">
          <Text className="text-white text-[10px] font-bold">{unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function NotificationsScreen() {
  const { t } = useLanguage();
  const { items, isLoading, refresh, markRead, markAllRead, unreadCount } = useNotifications();

  return (
    <View className="flex-1 bg-surface-50">
      <View className="px-6 pt-12 pb-4 bg-white border-b border-surface-100 flex-row items-center justify-between">
        <View>
          <Text className="text-2xl font-bold text-surface-800">{t('notifications')}</Text>
          <Text className="text-surface-400 text-sm mt-1">
            {unreadCount} {t('unread')}
          </Text>
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllRead}>
            <Text className="text-primary-500 font-semibold text-sm">{t('markAllRead')}</Text>
          </TouchableOpacity>
        )}
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        ListEmptyComponent={
          <Text className="text-center text-surface-400 mt-10">{t('noNotifications')}</Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => !item.read && markRead(item.id)}
            className={`bg-white rounded-xl p-4 mb-3 border ${
              item.read ? 'border-surface-100' : 'border-primary-200'
            }`}
          >
            <Text className="font-semibold text-surface-800">{item.title}</Text>
            <Text className="text-surface-500 text-sm mt-1">{item.body}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
