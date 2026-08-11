/**
 * Stable device id for single-device login binding (native only).
 */

import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Device from 'expo-device';

export async function getStableDeviceId(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    if (Platform.OS === 'android') {
      const androidId = Application.getAndroidId();
      if (androidId) return `android:${androidId}`;
    }
    if (Platform.OS === 'ios') {
      const iosId = await Application.getIosIdForVendorAsync();
      if (iosId) return `ios:${iosId}`;
    }
    const name = Device.modelName || Device.deviceName || 'device';
    const os = Device.osInternalBuildId || Device.osBuildId || Device.osVersion || '';
    return `fallback:${Platform.OS}:${name}:${os}`.slice(0, 120);
  } catch {
    return null;
  }
}

export function getDeviceLabel(): string {
  const parts = [
    Device.manufacturer,
    Device.modelName || Device.deviceName,
    Device.osName,
    Device.osVersion,
  ].filter(Boolean);
  return parts.join(' ') || Platform.OS;
}
