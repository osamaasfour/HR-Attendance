/**
 * Employee HR files live in users/{uid}/employeeDocuments/{id}
 * so the main user profile stays under Firestore's 1MB limit.
 */

import {
  db,
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
  deleteField,
  query,
  orderBy,
  Timestamp,
} from '../services/firebase';
import type { UserDocument } from '../types';
import { decodeMojibakeFileName } from './decodeFileName';

const INLINE_URL_MAX_CHARS = 900_000;

function employeeDocumentsCol(userId: string) {
  return collection(db, 'users', userId, 'employeeDocuments');
}

export async function listEmployeeDocuments(userId: string): Promise<UserDocument[]> {
  const snap = await getDocs(
    query(employeeDocumentsCol(userId), orderBy('uploadedAt', 'desc')),
  );
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name: decodeMojibakeFileName(String(data.name || 'document')),
      url: String(data.url || ''),
      path: String(data.path || ''),
      mimeType: data.mimeType ? String(data.mimeType) : undefined,
      uploadedAt: String(data.uploadedAt || ''),
      uploadedBy: data.uploadedBy ? String(data.uploadedBy) : undefined,
    };
  });
}

export async function saveEmployeeDocument(userId: string, item: UserDocument): Promise<void> {
  if (item.url.startsWith('data:') && item.url.length > INLINE_URL_MAX_CHARS) {
    throw new Error(
      'Document is too large to store without Firebase Storage. Enable Storage in Firebase Console or use a smaller file.',
    );
  }
  await setDoc(doc(db, 'users', userId, 'employeeDocuments', item.id), {
    name: item.name,
    url: item.url,
    path: item.path,
    mimeType: item.mimeType || null,
    uploadedAt: item.uploadedAt,
    uploadedBy: item.uploadedBy || null,
  });
}

export async function deleteEmployeeDocument(userId: string, docId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', userId, 'employeeDocuments', docId));
}

/** Move legacy `users.documents[]` (often huge data URLs) off the user profile. */
export async function migrateLegacyUserDocuments(
  userId: string,
  legacy: UserDocument[] | undefined,
): Promise<void> {
  const items = Array.isArray(legacy) ? legacy : [];
  if (items.length === 0) {
    await updateDoc(doc(db, 'users', userId), {
      documents: deleteField(),
      updatedAt: Timestamp.now(),
    });
    return;
  }

  for (const item of items) {
    if (!item?.id || !item.url) continue;
    if (item.url.startsWith('data:') && item.url.length > INLINE_URL_MAX_CHARS) {
      continue;
    }
    await setDoc(
      doc(db, 'users', userId, 'employeeDocuments', item.id),
      {
        name: item.name || 'document',
        url: item.url,
        path: item.path || `legacy/${item.id}`,
        mimeType: item.mimeType || null,
        uploadedAt: item.uploadedAt || new Date().toISOString(),
        uploadedBy: item.uploadedBy || null,
      },
      { merge: true },
    );
  }

  await updateDoc(doc(db, 'users', userId), {
    documents: deleteField(),
    updatedAt: Timestamp.now(),
  });
}

export async function loadEmployeeDocumentsForUser(
  userId: string,
  legacyOnUser?: UserDocument[],
): Promise<UserDocument[]> {
  const fromSub = await listEmployeeDocuments(userId);
  if (fromSub.length > 0) {
    if (Array.isArray(legacyOnUser) && legacyOnUser.length > 0) {
      void migrateLegacyUserDocuments(userId, legacyOnUser).catch(() => {});
    }
    return fromSub;
  }
  if (Array.isArray(legacyOnUser) && legacyOnUser.length > 0) {
    await migrateLegacyUserDocuments(userId, legacyOnUser);
    return listEmployeeDocuments(userId);
  }
  return [];
}
