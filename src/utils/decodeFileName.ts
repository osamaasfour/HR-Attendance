/**
 * Fix UTF-8 filenames that were mis-decoded as Latin-1 (Arabic shows as Ø²ÙØ±Ø©…).
 */
export function decodeMojibakeFileName(name: string): string {
  const raw = String(name || '').trim();
  if (!raw) return raw;
  // Already has Arabic / CJK → leave alone
  if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(raw)) return raw;
  // Classic mojibake markers from UTF-8 read as Windows-1252/Latin-1
  if (!/[ÃØÙðñ]/.test(raw)) return raw;
  try {
    const bytes = Uint8Array.from(raw, (ch) => ch.charCodeAt(0) & 0xff);
    const fixed = new TextDecoder('utf-8').decode(bytes);
    if (fixed && !fixed.includes('\uFFFD') && fixed !== raw) return fixed;
  } catch {
    /* ignore */
  }
  return raw;
}
