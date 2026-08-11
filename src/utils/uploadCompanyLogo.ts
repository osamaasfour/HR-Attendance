/**
 * Upload company logo — prefer Firebase Storage with a short timeout;
 * fall back to a small data URL only when Storage is unavailable.
 */

import { storage, ref, uploadBytes, getDownloadURL } from '../services/firebase';
import { Platform } from 'react-native';

const STORAGE_TIMEOUT_MS = 8000;

async function uriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(
      Platform.OS === 'android'
        ? 'Could not read the logo file. Try picking the image again.'
        : 'Could not read the selected file.',
    );
  }
  return await response.blob();
}

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

async function fileToDataUrl(uri: string): Promise<string> {
  const blob = await uriToBlob(uri);
  if (blob.size > 700_000) {
    throw new Error(
      'Logo is too large for offline fallback (max ~700KB). Enable Firebase Storage or choose a smaller image.',
    );
  }
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not encode the logo.'));
    reader.readAsDataURL(blob);
  });
}

export async function uploadCompanyLogo(
  localUri: string,
  mimeType?: string | null,
): Promise<string> {
  const ext = mimeType?.includes('png')
    ? 'png'
    : mimeType?.includes('webp')
      ? 'webp'
      : 'jpg';
  const path = `company/logo.${ext}`;

  let storageError = '';
  try {
    const blob = await withTimeout(uriToBlob(localUri), 5000, 'Reading logo');
    if (blob.size > 5_000_000) {
      throw new Error('Logo must be under 5MB.');
    }
    const contentType =
      mimeType && mimeType.startsWith('image/')
        ? mimeType
        : blob.type && blob.type.startsWith('image/')
          ? blob.type
          : 'image/jpeg';
    const storageRef = ref(storage, path);
    await withTimeout(
      uploadBytes(storageRef, blob, { contentType }),
      STORAGE_TIMEOUT_MS,
      'Firebase Storage upload',
    );
    return await withTimeout(getDownloadURL(storageRef), 5000, 'Getting logo URL');
  } catch (e: any) {
    storageError = String(e?.message || e || '');
    if (/under 5MB|too large/i.test(storageError)) {
      throw e instanceof Error ? e : new Error(storageError);
    }
    // Storage not set up / slow / unauthorized → small data-URL fallback
    try {
      return await withTimeout(fileToDataUrl(localUri), 8000, 'Logo fallback encode');
    } catch (fallbackErr: any) {
      throw new Error(
        storageError ||
          fallbackErr?.message ||
          'Logo upload failed. Enable Firebase Storage or use a smaller image (under 700KB).',
      );
    }
  }
}
