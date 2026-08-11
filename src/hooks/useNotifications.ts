import { useCallback, useEffect, useState } from 'react';
import {
  db,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  updateDoc,
  doc,
  limit,
} from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import type { AppNotification } from '../types';

export function useNotifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const q = query(
        collection(db, 'notifications'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc'),
        limit(50),
      );
      const snap = await getDocs(q);
      setItems(snap.docs.map((d) => ({ ...(d.data() as AppNotification), id: d.id })));
    } catch (error) {
      console.error('[Notifications] fetch failed', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const markRead = useCallback(
    async (id: string) => {
      await updateDoc(doc(db, 'notifications', id), { read: true });
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    },
    [],
  );

  const markAllRead = useCallback(async () => {
    const unread = items.filter((n) => !n.read);
    await Promise.all(unread.map((n) => updateDoc(doc(db, 'notifications', n.id), { read: true })));
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  }, [items]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    items,
    unreadCount: items.filter((n) => !n.read).length,
    isLoading,
    refresh,
    markRead,
    markAllRead,
  };
}
