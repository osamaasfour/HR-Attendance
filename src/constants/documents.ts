/** Employee documents API (VPS self-hosted). Defaults to same host as ZKTeco ADMS. */
export const DOCUMENTS_API_URL = (
  process.env.EXPO_PUBLIC_DOCUMENTS_API_URL ||
  process.env.EXPO_PUBLIC_ZKTECO_ADMS_URL ||
  'https://hr.ecfshipment.com'
).replace(/\/$/, '');
