/**
 * SaaS-friendly money formatting using company currency settings.
 */

export type MoneyFormatOptions = {
  currencyCode?: string;
  currencySymbol?: string;
  locale?: string;
  maximumFractionDigits?: number;
};

export function formatMoney(
  amount: number,
  opts: MoneyFormatOptions = {},
): string {
  const currency = (opts.currencyCode || 'EGP').toUpperCase();
  const locale = opts.locale || (currency === 'EGP' ? 'en-EG' : 'en-US');
  const digits = opts.maximumFractionDigits ?? 2;

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: digits,
    }).format(amount || 0);
  } catch {
    const symbol = opts.currencySymbol || currency;
    return `${symbol} ${(amount || 0).toFixed(digits)}`;
  }
}

/** Common SaaS currencies for admin picker */
export const CURRENCY_OPTIONS = [
  { code: 'EGP', symbol: 'E£', label: 'Egyptian Pound (EGP)', country: 'EG' },
  { code: 'SAR', symbol: '﷼', label: 'Saudi Riyal (SAR)', country: 'SA' },
  { code: 'AED', symbol: 'د.إ', label: 'UAE Dirham (AED)', country: 'AE' },
  { code: 'USD', symbol: '$', label: 'US Dollar (USD)', country: 'US' },
  { code: 'EUR', symbol: '€', label: 'Euro (EUR)', country: 'EU' },
  { code: 'GBP', symbol: '£', label: 'British Pound (GBP)', country: 'GB' },
  { code: 'JOD', symbol: 'JD', label: 'Jordanian Dinar (JOD)', country: 'JO' },
  { code: 'KWD', symbol: 'KD', label: 'Kuwaiti Dinar (KWD)', country: 'KW' },
  { code: 'QAR', symbol: 'QR', label: 'Qatari Riyal (QAR)', country: 'QA' },
  { code: 'BHD', symbol: 'BD', label: 'Bahraini Dinar (BHD)', country: 'BH' },
] as const;

export const COUNTRY_OPTIONS = [
  { code: 'EG', label: 'Egypt', labelAr: 'مصر' },
  { code: 'SA', label: 'Saudi Arabia', labelAr: 'السعودية' },
  { code: 'AE', label: 'United Arab Emirates', labelAr: 'الإمارات' },
  { code: 'JO', label: 'Jordan', labelAr: 'الأردن' },
  { code: 'KW', label: 'Kuwait', labelAr: 'الكويت' },
  { code: 'QA', label: 'Qatar', labelAr: 'قطر' },
  { code: 'BH', label: 'Bahrain', labelAr: 'البحرين' },
  { code: 'US', label: 'United States', labelAr: 'الولايات المتحدة' },
  { code: 'GB', label: 'United Kingdom', labelAr: 'المملكة المتحدة' },
  { code: 'OTHER', label: 'Other', labelAr: 'أخرى' },
] as const;
