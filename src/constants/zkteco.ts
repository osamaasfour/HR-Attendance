/** ZKTeco ADMS push endpoint (VPS self-hosted service). */
export const ZKTECO_ADMS_URL =
  process.env.EXPO_PUBLIC_ZKTECO_ADMS_URL ?? 'https://hr.ecfshipment.com';

export function generateDeviceSecret(length = 16): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < length; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}
