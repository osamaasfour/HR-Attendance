import type { AppNotification } from '../types';
import { db, collection, addDoc, Timestamp } from '../services/firebase';

/** Client write for in-app notifications — rules enforce recipient + tenant. */
export async function createAppNotification(params: {
  userId: string;
  title: string;
  body: string;
  type: AppNotification['type'];
  tenantId?: string;
}): Promise<void> {
  const userId = params.userId.trim();
  const title = params.title.trim().slice(0, 200);
  const body = params.body.trim().slice(0, 2000);
  if (!userId || !title || !body) return;
  await addDoc(collection(db, 'notifications'), {
    userId,
    title,
    body,
    read: false,
    type: params.type,
    ...(params.tenantId ? { tenantId: params.tenantId } : {}),
    createdAt: Timestamp.now(),
  });
}
