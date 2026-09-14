/**
 * Formal printable HTML document for admin reports (A4 portrait).
 */

import { openPrintHtml } from './openPrintHtml';

export type PrintTable = {
  title?: string;
  headers: string[];
  rows: (string | number)[][];
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function printReportDocument(opts: {
  companyName: string;
  title: string;
  subtitle?: string;
  generatedAt: string;
  filterSummary?: string;
  dir?: 'ltr' | 'rtl';
  tables: PrintTable[];
  signatureLeft?: string;
  signatureRight?: string;
  printLabel?: string;
}): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  const tablesHtml = opts.tables
    .map((table) => {
      const head = table.headers
        .map((h) => `<th>${escapeHtml(h)}</th>`)
        .join('');
      const body = table.rows.length
        ? table.rows
            .map(
              (row) =>
                `<tr>${row
                  .map((cell) => `<td>${escapeHtml(cell == null ? '' : String(cell))}</td>`)
                  .join('')}</tr>`,
            )
            .join('')
        : `<tr><td colspan="${Math.max(1, table.headers.length)}" class="empty">—</td></tr>`;
      return `<section class="block">
        ${table.title ? `<h2>${escapeHtml(table.title)}</h2>` : ''}
        <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
      </section>`;
    })
    .join('');

  const html = `<!doctype html>
<html dir="${opts.dir || 'ltr'}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(opts.title)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    body { font-family: Inter, Segoe UI, Tahoma, sans-serif; color: #134E4A; margin: 0; }
    .header { border-bottom: 3px solid #0D9488; padding-bottom: 10px; margin-bottom: 14px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .sub { color: #475569; font-size: 12px; margin: 0; }
    .meta { font-size: 11px; color: #64748B; margin: 6px 0 0; }
    .filters { background: #F0FDFA; border: 1px solid #CCFBF1; border-radius: 8px; padding: 8px 10px; font-size: 11px; margin: 0 0 14px; }
    h2 { font-size: 13px; margin: 0 0 8px; color: #0F766E; }
    .block { margin-bottom: 18px; break-inside: avoid; }
    table { border-collapse: collapse; width: 100%; font-size: 10px; }
    th, td { border: 1px solid #CCFBF1; padding: 5px 6px; text-align: start; vertical-align: top; }
    th { background: #0D9488; color: #fff; font-weight: 700; }
    tbody tr:nth-child(even) td { background: #FAFFFE; }
    .empty { text-align: center; color: #94A3B8; }
    .sign { display: flex; justify-content: space-between; margin-top: 32px; font-size: 12px; }
    .sign div { width: 38%; border-top: 1px solid #94A3B8; padding-top: 6px; text-align: center; }
    @media print { .no-print { display: none !important; } }
  </style>
</head>
<body>
  <button class="no-print" onclick="window.print()" style="margin-bottom:8px">${escapeHtml(opts.printLabel || 'Print')}</button>
  <div class="header">
    <h1>${escapeHtml(opts.companyName)}</h1>
    <p class="sub">${escapeHtml(opts.title)}${opts.subtitle ? ` · ${escapeHtml(opts.subtitle)}` : ''}</p>
    <p class="meta">${escapeHtml(opts.generatedAt)}</p>
  </div>
  ${opts.filterSummary ? `<div class="filters">${escapeHtml(opts.filterSummary)}</div>` : ''}
  ${tablesHtml}
  <div class="sign">
    <div>${escapeHtml(opts.signatureLeft || 'HR')}</div>
    <div>${escapeHtml(opts.signatureRight || 'Manager')}</div>
  </div>
  <script>
    window.onload = function () {
      try { window.focus(); window.print(); } catch (e) {}
    };
  </script>
</body>
</html>`;

  openPrintHtml(html);
}
