import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
}

/** Download (web) or share (native) a CSV file. */
export async function downloadCsv(filename: string, csv: string): Promise<void> {
  const safeName = filename.replace(/[^\w.\-]+/g, '_');
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  const base = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!base) {
    throw new Error('File system is not available on this device.');
  }
  const path = `${base}${safeName}`;
  await FileSystem.writeAsStringAsync(path, csv, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(path, {
    mimeType: 'text/csv',
    dialogTitle: safeName,
    UTI: 'public.comma-separated-values-text',
  });
}

/** Download (web) or share (native) an XLSX file from a base64 payload. */
export async function downloadXlsx(filename: string, base64: string): Promise<void> {
  const safeName = filename.replace(/[^\w.\-]+/g, '_');
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  const base = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!base) {
    throw new Error('File system is not available on this device.');
  }
  const path = `${base}${safeName}`;
  await FileSystem.writeAsStringAsync(path, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(path, {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dialogTitle: safeName,
    UTI: 'org.openxmlformats.spreadsheetml.sheet',
  });
}
