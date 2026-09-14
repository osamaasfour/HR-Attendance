/**
 * Printable HTML + Excel for the combined attendance register (portrait / vertical).
 */

import * as XLSX from 'xlsx';
import type { Holiday } from '../types';
import { downloadXlsx } from './csv';
import { holidayEnd, holidayStart } from './holidays';
import {
  DAY_CODE_COLORS,
  type AttendanceRegister,
  type DayCell,
  type DayCode,
} from './attendanceRegister';
import { openPrintHtml } from './openPrintHtml';
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type RegisterLegendItem = { code: DayCode; label: string };

function weekdayName(date: string, locale: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString(locale, { weekday: 'short' });
}

function cellNote(cell: DayCell): string {
  const parts: string[] = [];
  if (cell.holidayName) parts.push(cell.holidayName);
  if (cell.lateMinutes) parts.push(`+${cell.lateMinutes}L`);
  if (cell.earlyLeaveMinutes) parts.push(`+${cell.earlyLeaveMinutes}E`);
  return parts.join(' · ');
}

export function printAttendanceRegister(opts: {
  companyName: string;
  periodLabel: string;
  generatedAt: string;
  title: string;
  employeeCol: string;
  idCol: string;
  dateCol: string;
  weekdayCol: string;
  statusCol: string;
  inCol: string;
  outCol: string;
  notesCol: string;
  locale: string;
  dir: 'ltr' | 'rtl';
  legend: RegisterLegendItem[];
  register: AttendanceRegister;
  holidays: Holiday[];
  holidaysTitle: string;
  signatureHr: string;
  signatureManager: string;
}): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  const { register } = opts;
  const statusName = new Map(opts.legend.map((item) => [item.code, item.label]));
  const legendHtml = opts.legend
    .map((item) => {
      const colors = DAY_CODE_COLORS[item.code];
      return `<span class="lg"><i style="background:${colors.bg};color:${colors.fg}">${item.code}</i> ${escapeHtml(item.label)}</span>`;
    })
    .join('');

  const holidayHtml = opts.holidays.length
    ? `<p class="hol"><strong>${escapeHtml(opts.holidaysTitle)}:</strong> ${opts.holidays
        .map((h) => {
          const start = holidayStart(h);
          const end = holidayEnd(h);
          const range = end && end !== start ? `${start} – ${end}` : start;
          return `${escapeHtml(h.name || '')} (${escapeHtml(range)})`;
        })
        .join(' · ')}</p>`
    : '';

  const sections = register.rows
    .map((row) => {
      const days = row.cells
        .map((cell) => {
          const colors = DAY_CODE_COLORS[cell.code];
          const label = statusName.get(cell.code) || cell.code;
          const note = [label, cellNote(cell)].filter(Boolean).join(' · ');
          return `<tr>
            <td>${escapeHtml(cell.date)}</td>
            <td>${escapeHtml(weekdayName(cell.date, opts.locale))}</td>
            <td style="background:${colors.bg};color:${colors.fg};font-weight:700">${cell.code === '-' ? '' : cell.code}</td>
            <td>${escapeHtml(cell.clockIn || '')}</td>
            <td>${escapeHtml(cell.clockOut || '')}</td>
            <td class="note">${escapeHtml(note)}</td>
          </tr>`;
        })
        .join('');
      return `<section class="emp">
        <h2>${escapeHtml(row.fullName)} <span>${escapeHtml(row.employeeId)}</span></h2>
        <p class="tot">P ${row.totals.present} · L ${row.totals.late} · E ${row.totals.early} · V ${row.totals.vacation} · A ${row.totals.absent} · H ${row.totals.holiday}</p>
        <table>
          <thead>
            <tr>
              <th>${escapeHtml(opts.dateCol)}</th>
              <th>${escapeHtml(opts.weekdayCol)}</th>
              <th>${escapeHtml(opts.statusCol)}</th>
              <th>${escapeHtml(opts.inCol)}</th>
              <th>${escapeHtml(opts.outCol)}</th>
              <th>${escapeHtml(opts.notesCol)}</th>
            </tr>
          </thead>
          <tbody>${days}</tbody>
        </table>
      </section>`;
    })
    .join('');

  const html = `<!doctype html>
<html dir="${opts.dir}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(opts.title)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    body { font-family: Inter, Segoe UI, Tahoma, sans-serif; color: #134E4A; margin: 0; }
    h1 { font-size: 18px; margin: 0 0 2px; }
    .sub { color: #475569; font-size: 12px; margin: 0 0 10px; }
    .legend { margin: 0 0 10px; font-size: 11px; }
    .lg { display: inline-block; margin: 0 10px 4px 0; }
    .lg i { display: inline-block; min-width: 22px; text-align: center; border-radius: 4px; font-style: normal; font-weight: 700; margin-inline-end: 4px; }
    .hol { font-size: 11px; color: #334155; }
    .emp { break-inside: avoid; page-break-inside: avoid; margin: 0 0 22px; }
    h2 { font-size: 14px; margin: 0 0 4px; }
    h2 span { color: #64748B; font-weight: 500; font-size: 12px; }
    .tot { font-size: 11px; color: #0F766E; margin: 0 0 8px; }
    table { border-collapse: collapse; width: 100%; font-size: 11px; }
    th, td { border: 1px solid #CCFBF1; padding: 5px 6px; text-align: start; }
    th { background: #0D9488; color: #fff; font-weight: 700; }
    .note { color: #475569; }
    .sign { display: flex; justify-content: space-between; margin-top: 28px; font-size: 12px; }
    .sign div { width: 38%; border-top: 1px solid #94A3B8; padding-top: 6px; text-align: center; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
  <button class="no-print" onclick="window.print()" style="margin-bottom:8px">Print</button>
  <h1>${escapeHtml(opts.companyName)}</h1>
  <p class="sub">${escapeHtml(opts.title)} · ${escapeHtml(opts.periodLabel)} · ${escapeHtml(opts.generatedAt)}</p>
  <div class="legend">${legendHtml}</div>
  ${holidayHtml}
  ${sections}
  <div class="sign">
    <div>${escapeHtml(opts.signatureHr)}</div>
    <div>${escapeHtml(opts.signatureManager)}</div>
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

export async function exportAttendanceRegisterXlsx(
  filename: string,
  register: AttendanceRegister,
  labels: {
    companyName: string;
    periodLabel: string;
    employee: string;
    employeeId: string;
    date: string;
    weekday: string;
    status: string;
    clockIn: string;
    clockOut: string;
    notes: string;
    present: string;
    late: string;
    early: string;
    vacation: string;
    sick: string;
    unpaid: string;
    trip: string;
    absent: string;
    holiday: string;
    weekend: string;
  },
  locale: string,
): Promise<void> {
  const summary: (string | number)[][] = [
    [labels.companyName, labels.periodLabel],
    [
      labels.employeeId,
      labels.employee,
      labels.present,
      labels.late,
      labels.early,
      labels.vacation,
      labels.sick,
      labels.unpaid,
      labels.trip,
      labels.absent,
      labels.holiday,
      labels.weekend,
    ],
    ...register.rows.map((row) => [
      row.employeeId,
      row.fullName,
      row.totals.present,
      row.totals.late,
      row.totals.early,
      row.totals.vacation,
      row.totals.sick,
      row.totals.unpaid,
      row.totals.trip,
      row.totals.absent,
      row.totals.holiday,
      row.totals.weekend,
    ]),
  ];

  const daily: (string | number)[][] = [
    [
      labels.employeeId,
      labels.employee,
      labels.date,
      labels.weekday,
      labels.status,
      labels.clockIn,
      labels.clockOut,
      labels.notes,
    ],
  ];
  register.rows.forEach((row) => {
    row.cells.forEach((cell) => {
      daily.push([
        row.employeeId,
        row.fullName,
        cell.date,
        weekdayName(cell.date, locale),
        cell.code === '-' ? '' : cell.code,
        cell.clockIn || '',
        cell.clockOut || '',
        cellNote(cell),
      ]);
    });
  });

  const summaryWs = XLSX.utils.aoa_to_sheet(summary);
  const dailyWs = XLSX.utils.aoa_to_sheet(daily);
  summaryWs['!cols'] = Array.from({ length: 12 }, () => ({ wch: 14 }));
  dailyWs['!cols'] = [
    { wch: 12 },
    { wch: 22 },
    { wch: 12 },
    { wch: 10 },
    { wch: 8 },
    { wch: 12 },
    { wch: 12 },
    { wch: 28 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, dailyWs, 'Daily');
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');
  const base64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' }) as string;
  await downloadXlsx(filename, base64);
}
