/**
 * Upload employee file documents (PDF / image) for admin HR files.
 * Prefer VPS (hr.ecfshipment.com) → Firebase Storage → small inline data URL.
 */

import { Platform } from 'react-native';
import { auth, storage, ref, uploadBytes, getDownloadURL } from '../services/firebase';
import { DOCUMENTS_API_URL } from '../constants/documents';
import type { UserDocument } from '../types';

const STORAGE_TIMEOUT_MS = 8000;
const INLINE_MAX_BYTES = 700_000;
/** Max upload size (must match VPS MAX_FILE_BYTES / nginx client_max_body_size). */
export const MAX_USER_DOCUMENT_BYTES = 50 * 1024 * 1024;

export type PickedUserFile = {
  uri: string;
  name: string;
  mimeType?: string | null;
  blob?: Blob;
};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

async function uriToBlob(uri: string): Promise<Blob> {
  const response = await withTimeout(fetch(uri), 8000, 'Reading file');
  if (!response.ok) {
    throw new Error(
      Platform.OS === 'android'
        ? 'Could not read the file. Try picking it again.'
        : 'Could not read the selected file.',
    );
  }
  return await response.blob();
}

async function resolveBlob(file: PickedUserFile): Promise<Blob> {
  if (file.blob) return file.blob;
  return uriToBlob(file.uri);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not encode the file.'));
    reader.readAsDataURL(blob);
  });
}

async function inlineDataUrl(blob: Blob): Promise<string> {
  if (blob.size > INLINE_MAX_BYTES) {
    throw new Error(
      'File is too large for offline fallback (max ~700KB). Deploy the VPS documents service or choose a smaller file.',
    );
  }
  return withTimeout(blobToDataUrl(blob), 12000, 'Encoding document');
}

function revokeBlobUri(uri: string) {
  if (typeof URL !== 'undefined' && uri.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(uri);
    } catch {
      /* ignore */
    }
  }
}

async function uploadToVps(
  employeeUserId: string,
  file: PickedUserFile,
  mimeType: string,
  uploadedBy?: string,
): Promise<UserDocument> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('You must be signed in to upload documents.');
  }
  const idToken = await withTimeout(user.getIdToken(), 8000, 'Auth token');

  const body = new FormData();
  body.append('employeeUserId', employeeUserId);
  // Explicit UTF-8 field — multipart filename headers often corrupt Arabic names
  body.append('fileName', file.name || 'document');
  if (Platform.OS === 'web' && file.blob) {
    body.append('file', file.blob, file.name || 'document');
  } else if (Platform.OS === 'web') {
    const blob = await resolveBlob(file);
    body.append('file', blob, file.name || 'document');
  } else {
    body.append('file', {
      uri: file.uri,
      name: file.name || 'document.pdf',
      type: mimeType,
    } as any);
  }

  const res = await withTimeout(
    fetch(`${DOCUMENTS_API_URL}/api/documents/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      body,
    }),
    180000,
    'VPS document upload',
  );

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error || `VPS upload failed (${res.status})`);
  }

  return {
    id: String(json.id || `${Date.now()}`),
    // Prefer client-sent name (UTF-8) when server echoed it
    name: String(json.name || file.name || 'document'),
    url: String(json.url),
    path: String(json.path || ''),
    mimeType: String(json.mimeType || mimeType),
    uploadedAt: String(json.uploadedAt || new Date().toISOString()),
    uploadedBy: uploadedBy || String(json.uploadedBy || user.uid),
  };
}

export async function uploadUserDocument(
  userId: string,
  file: PickedUserFile,
  uploadedBy?: string,
): Promise<UserDocument> {
  const safeName = (file.name || 'document').replace(/[^\w.\-]+/g, '_');

  try {
    let mimeType =
      file.mimeType ||
      (safeName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');

    if (file.blob?.type) {
      mimeType = file.mimeType || file.blob.type || mimeType;
    }

    if (!mimeType.startsWith('image/') && mimeType !== 'application/pdf') {
      if (!/\.(pdf|png|jpe?g|webp|gif)$/i.test(safeName)) {
        throw new Error('Only PDF or image files are allowed.');
      }
      if (/\.pdf$/i.test(safeName)) mimeType = 'application/pdf';
      else mimeType = 'image/jpeg';
    }

    // 1) VPS (preferred)
    try {
      if (file.blob && file.blob.size > MAX_USER_DOCUMENT_BYTES) {
        throw new Error('Document must be under 50MB.');
      }
      return await uploadToVps(userId, file, mimeType, uploadedBy);
    } catch (vpsErr: any) {
      const vpsMsg = String(vpsErr?.message || vpsErr || '');
      if (/Only PDF|must be signed in|Admin role|Employee not found|another tenant/i.test(vpsMsg)) {
        throw vpsErr instanceof Error ? vpsErr : new Error(vpsMsg);
      }
      console.warn('[uploadUserDocument] VPS unavailable, trying fallbacks:', vpsMsg);
    }

    // 2) Firebase Storage
    const blob = await withTimeout(resolveBlob(file), 8000, 'Reading file');
    if (blob.size > MAX_USER_DOCUMENT_BYTES) {
      throw new Error('Document must be under 50MB.');
    }
    const path = `userDocuments/${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;
    try {
      const storageRef = ref(storage, path);
      await withTimeout(
        uploadBytes(storageRef, blob, { contentType: mimeType }),
        STORAGE_TIMEOUT_MS,
        'Firebase Storage upload',
      );
      const url = await withTimeout(getDownloadURL(storageRef), 5000, 'Getting download URL');
      return {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: file.name || safeName,
        url,
        path,
        mimeType,
        uploadedAt: new Date().toISOString(),
        uploadedBy,
      };
    } catch (storageErr: any) {
      const msg = String(storageErr?.message || storageErr || '');
      if (/under 50MB|under 10MB|Only PDF|permission|unauthorized|storage\/unauthorized/i.test(msg)) {
        throw storageErr instanceof Error ? storageErr : new Error(msg);
      }
      // 3) Tiny inline fallback (subcollection docs only)
      const url = await inlineDataUrl(blob);
      return {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: file.name || safeName,
        url,
        path: `inline/${safeName}`,
        mimeType,
        uploadedAt: new Date().toISOString(),
        uploadedBy,
      };
    }
  } finally {
    revokeBlobUri(file.uri);
  }
}

/** Best-effort delete of a VPS-hosted file (ignores missing / offline). */
export async function deleteVpsDocumentFile(docItem: {
  url?: string;
  path?: string;
}): Promise<void> {
  const url = String(docItem.url || '');
  const match = url.match(/\/api\/documents\/file\/([^/]+)\/([^/?#]+)/);
  if (!match) return;
  const user = auth.currentUser;
  if (!user) return;
  try {
    const idToken = await user.getIdToken();
    await withTimeout(
      fetch(`${DOCUMENTS_API_URL}/api/documents/file/${match[1]}/${match[2]}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${idToken}` },
      }),
      15000,
      'VPS document delete',
    );
  } catch {
    /* ignore — Firestore metadata is the source of truth for the list */
  }
}
