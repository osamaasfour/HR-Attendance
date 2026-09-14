/**
 * Download an employee document (web: browser download; native: share sheet).
 */

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { decodeMojibakeFileName } from './decodeFileName';

function isImageMime(mime?: string, name?: string): boolean {
  if (mime?.startsWith('image/')) return true;
  return /\.(png|jpe?g|webp|gif)$/i.test(name || '');
}

function isPdfMime(mime?: string, name?: string): boolean {
  if (mime === 'application/pdf') return true;
  return /\.pdf$/i.test(name || '');
}

export function isPreviewableDocument(mime?: string, name?: string): boolean {
  return isImageMime(mime, name) || isPdfMime(mime, name);
}

export function isImageDocument(mime?: string, name?: string): boolean {
  return isImageMime(mime, name);
}

export function isPdfDocument(mime?: string, name?: string): boolean {
  return isPdfMime(mime, name);
}

export async function downloadUserDocumentFile(opts: {
  url: string;
  name: string;
  mimeType?: string;
}): Promise<void> {
  const displayName = decodeMojibakeFileName(opts.name || 'document');
  const safeName = displayName.replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '_').slice(0, 180) || 'document';

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const res = await fetch(opts.url);
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
    return;
  }

  const base = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!base) throw new Error('File system is not available on this device.');
  const dest = `${base}${Date.now()}_${safeName.replace(/[^\w.\-]+/g, '_')}`;
  const result = await FileSystem.downloadAsync(opts.url, dest);
  if (result.status !== 200) {
    throw new Error(`Download failed (${result.status})`);
  }
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(result.uri, {
    mimeType: opts.mimeType || undefined,
    dialogTitle: displayName,
  });
}
