/**
 * Profile / attachment helpers — prefer Firebase Storage; surface errors clearly.
 */

import { Platform } from 'react-native';
import { storage, ref, uploadBytes, getDownloadURL } from '../services/firebase';

export type PickedDocument = {
  uri: string;
  name: string;
  mimeType?: string | null;
};

async function uriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(
      Platform.OS === 'android'
        ? 'Could not read the image file. Try picking the photo again.'
        : 'Could not read the selected file.',
    );
  }
  return await response.blob();
}

async function fileToDataUrl(uri: string, maxBytes = 700_000): Promise<string> {
  const blob = await uriToBlob(uri);
  if (blob.size > maxBytes) {
    throw new Error(
      'Image is too large for offline fallback (max ~700KB). Enable Firebase Storage or choose a smaller image.',
    );
  }
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not encode the file.'));
    reader.readAsDataURL(blob);
  });
}

async function uploadImageToStorage(
  path: string,
  localUri: string,
  mimeType?: string | null,
): Promise<string> {
  const blob = await uriToBlob(localUri);
  if (blob.size > 5_000_000) {
    throw new Error('Image must be under 5MB.');
  }
  const contentType =
    mimeType && mimeType.startsWith('image/')
      ? mimeType
      : blob.type && blob.type.startsWith('image/')
        ? blob.type
        : 'image/jpeg';
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType });
  return await getDownloadURL(storageRef);
}

/** Upload profile photo — Storage first; small data URL only if Storage unavailable. */
export async function uploadProfilePhoto(
  userId: string,
  localUri: string,
  mimeType?: string | null,
): Promise<string> {
  const ext = mimeType?.includes('png') ? 'png' : mimeType?.includes('webp') ? 'webp' : 'jpg';
  const path = `profilePhotos/${userId}/avatar.${ext}`;
  try {
    return await uploadImageToStorage(path, localUri, mimeType);
  } catch (e: any) {
    const msg = String(e?.message || e || '');
    // Rules / size errors should surface — not silently fallback
    if (/under 5MB|too large|permission|unauthorized|storage\/unauthorized/i.test(msg)) {
      throw e instanceof Error ? e : new Error(msg);
    }
    try {
      return await fileToDataUrl(localUri);
    } catch (fallbackErr: any) {
      throw new Error(
        msg ||
          fallbackErr?.message ||
          'Photo upload failed. Check Firebase Storage rules and try a smaller image.',
      );
    }
  }
}

export async function uploadHrAttachment(
  userId: string,
  file: PickedDocument,
): Promise<{ url: string; path: string; name: string }> {
  const safeName = (file.name || 'document').replace(/[^\w.\-]+/g, '_');
  const path = `hrAttachments/${userId}/${Date.now()}_${safeName}`;
  try {
    const blob = await uriToBlob(file.uri);
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob, {
      contentType: file.mimeType || blob.type || 'application/octet-stream',
    });
    const url = await getDownloadURL(storageRef);
    return { url, path, name: file.name || safeName };
  } catch {
    const url = await fileToDataUrl(file.uri, 900_000);
    return { url, path: `inline/${safeName}`, name: file.name || safeName };
  }
}
