/**
 * Combined monthly timesheet — vertical employee day lists (extra report).
 */

import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLanguage } from '../context/LanguageContext';
import {
  DAY_CODE_COLORS,
  type AttendanceRegister,
  type DayCell,
  type DayCode,
} from '../utils/attendanceRegister';
import { colors } from '../constants/colors';

type Props = {
  register: AttendanceRegister;
  loading?: boolean;
  companyName: string;
  periodLabel: string;
  exporting?: boolean;
  onExport: () => void;
  onPrint?: () => void;
};

function weekdayName(date: string, locale: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString(locale, { weekday: 'short' });
}

function cellNote(
  cell: DayCell,
  t: (key: 'lateMinutesLabel' | 'earlyLeaveMinutesLabel', vars?: Record<string, string | number>) => string,
): string {
  const parts: string[] = [];
  if (cell.holidayName) parts.push(cell.holidayName);
  if (cell.lateMinutes) parts.push(t('lateMinutesLabel', { min: cell.lateMinutes }));
  if (cell.earlyLeaveMinutes) parts.push(t('earlyLeaveMinutesLabel', { min: cell.earlyLeaveMinutes }));
  return parts.join(' · ');
}

export default function AttendanceRegisterCard({
  register,
  loading,
  companyName,
  periodLabel,
  exporting,
  onExport,
  onPrint,
}: Props) {
  const { t, language } = useLanguage();
  const locale = language === 'ar' ? 'ar-EG' : 'en-US';
  const [expandAll, setExpandAll] = useState(false);
  const [openId, setOpenId] = useState<string | null>(register.rows[0]?.userId ?? null);

  const legend = useMemo(
    () =>
      (
        [
          ['P', t('codePresent')],
          ['L', t('codeLate')],
          ['E', t('codeEarly')],
          ['LE', t('codeLateEarly')],
          ['V', t('typeVacation')],
          ['S', t('typeSick')],
          ['U', t('typeUnpaid')],
          ['T', t('typeBusinessTrip')],
          ['H', t('codeHoliday')],
          ['W', t('codeWeekend')],
          ['A', t('codeAbsent')],
        ] as Array<[DayCode, string]>
      ),
    [t],
  );

  const statusLabel = useMemo(() => new Map(legend), [legend]);

  const isOpen = (id: string) => expandAll || openId === id;

  return (
    <View className="bg-white rounded-2xl p-4 mb-4 border border-surface-100">
      <View className="flex-row items-start justify-between mb-1">
        <View className="flex-1 pr-2">
          <Text className="font-bold text-surface-800 text-base">{t('reportTabTimesheet')}</Text>
          <Text className="text-surface-500 text-xs mt-0.5">
            {companyName} · {periodLabel}
          </Text>
        </View>
        <MaterialCommunityIcons name="calendar-text" size={22} color={colors.primary} />
      </View>
      <Text className="text-surface-500 text-[11px] mb-3 leading-4">{t('timesheetHint')}</Text>

      <View className="flex-row flex-wrap mb-3">
        {legend.map(([code, label]) => {
          const tone = DAY_CODE_COLORS[code];
          return (
            <View key={code} className="flex-row items-center mr-3 mb-2">
              <View
                style={{
                  backgroundColor: tone.bg,
                  minWidth: 24,
                  height: 20,
                  borderRadius: 4,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 3,
                }}
              >
                <Text style={{ color: tone.fg, fontSize: 9, fontWeight: '800' }}>{code}</Text>
              </View>
              <Text className="text-[10px] text-surface-600 ml-1">{label}</Text>
            </View>
          );
        })}
      </View>

      <View className="flex-row flex-wrap mb-3">
        <KpiMini label={t('present')} value={register.grand.present} color={colors.primary} />
        <KpiMini label={t('late')} value={register.grand.late} color={colors.warning} />
        <KpiMini label={t('codeEarly')} value={register.grand.early} color="#C2410C" />
        <KpiMini label={t('absent')} value={register.grand.absent} color={colors.danger} />
        <KpiMini label={t('typeVacation')} value={register.grand.vacation} color="#2563EB" />
        <KpiMini label={t('codeHoliday')} value={register.grand.holiday} color="#047857" />
      </View>

      {register.rows.length > 0 ? (
        <TouchableOpacity
          onPress={() => setExpandAll((v) => !v)}
          className="self-start bg-surface-50 border border-surface-100 rounded-lg px-3 h-9 items-center justify-center mb-3"
        >
          <Text className="text-xs font-semibold text-primary-700">
            {expandAll ? t('timesheetCollapseAll') : t('timesheetExpandAll')}
          </Text>
        </TouchableOpacity>
      ) : null}

      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : register.rows.length === 0 ? (
        <Text className="text-surface-400 text-sm text-center py-6">{t('chartEmpty')}</Text>
      ) : (
        register.rows.map((row) => {
          const open = isOpen(row.userId);
          return (
            <View
              key={row.userId}
              className="mb-3 rounded-xl border border-surface-100 overflow-hidden"
            >
              <TouchableOpacity
                onPress={() => {
                  setExpandAll(false);
                  setOpenId(open && openId === row.userId ? null : row.userId);
                }}
                className="bg-surface-50 px-3 py-3"
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 pr-2">
                    <Text className="font-semibold text-surface-800">{row.fullName}</Text>
                    <Text className="text-[11px] text-surface-500 mt-0.5">
                      {row.employeeId}
                      {row.department ? ` · ${row.department}` : ''}
                      {row.branchName ? ` · ${row.branchName}` : ''}
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name={open ? 'chevron-up' : 'chevron-down'}
                    size={22}
                    color={colors.surface400}
                  />
                </View>
                <View className="flex-row flex-wrap mt-2">
                  <TinyStat label="P" value={row.totals.present} />
                  <TinyStat label="L" value={row.totals.late} />
                  <TinyStat label="E" value={row.totals.early} />
                  <TinyStat label="V" value={row.totals.vacation} />
                  <TinyStat label="A" value={row.totals.absent} />
                  <TinyStat label="H" value={row.totals.holiday} />
                </View>
              </TouchableOpacity>

              {open ? (
                <View className="bg-white px-2 pb-2">
                  <View className="flex-row px-2 py-2 border-b border-surface-100">
                    <Text className="w-[92px] text-[10px] font-bold text-surface-500">{t('date')}</Text>
                    <Text className="w-[44px] text-[10px] font-bold text-surface-500">{t('timesheetWeekday')}</Text>
                    <Text className="w-[52px] text-[10px] font-bold text-surface-500">{t('timesheetStatus')}</Text>
                    <Text className="flex-1 text-[10px] font-bold text-surface-500">{t('clockIn')}</Text>
                    <Text className="flex-1 text-[10px] font-bold text-surface-500">{t('clockOut')}</Text>
                  </View>
                  {row.cells.map((cell, idx) => {
                    const tone = DAY_CODE_COLORS[cell.code];
                    const note = cellNote(cell, t);
                    return (
                      <View
                        key={cell.date}
                        className="px-2 py-2 border-b border-surface-50"
                        style={{ backgroundColor: idx % 2 ? '#FAFFFE' : '#FFFFFF' }}
                      >
                        <View className="flex-row items-center">
                          <Text className="w-[92px] text-[11px] text-surface-700">{cell.date}</Text>
                          <Text className="w-[44px] text-[11px] text-surface-500">
                            {weekdayName(cell.date, locale)}
                          </Text>
                          <View style={{ width: 52 }}>
                            <View
                              style={{
                                backgroundColor: tone.bg,
                                alignSelf: 'flex-start',
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                                borderRadius: 6,
                              }}
                            >
                              <Text style={{ color: tone.fg, fontSize: 10, fontWeight: '800' }}>
                                {cell.code === '-' ? '—' : cell.code}
                              </Text>
                            </View>
                          </View>
                          <Text className="flex-1 text-[11px] text-surface-700">{cell.clockIn || '—'}</Text>
                          <Text className="flex-1 text-[11px] text-surface-700">{cell.clockOut || '—'}</Text>
                        </View>
                        {note ? (
                          <Text className="text-[10px] text-surface-500 mt-1 ml-[136px]">
                            {statusLabel.get(cell.code)} · {note}
                          </Text>
                        ) : cell.code !== 'P' && cell.code !== '-' ? (
                          <Text className="text-[10px] text-surface-500 mt-1 ml-[136px]">
                            {statusLabel.get(cell.code)}
                          </Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })
      )}

      {!loading && register.rows.length > 0 && !expandAll ? (
        <Text className="text-[11px] text-surface-400 mb-2">{t('timesheetTapHint')}</Text>
      ) : null}

      <View className="flex-row mt-1">
        {onPrint && Platform.OS === 'web' ? (
          <TouchableOpacity
            onPress={onPrint}
            className="flex-1 bg-white border border-primary-200 rounded-xl h-11 items-center justify-center mr-2"
          >
            <Text className="text-primary-700 font-semibold text-sm">{t('printTimesheet')}</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={onExport}
          disabled={exporting}
          className="flex-1 bg-primary-500 rounded-xl h-11 items-center justify-center"
        >
          {exporting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-semibold text-sm">{t('exportTimesheetXlsx')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function KpiMini({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View className="bg-surface-50 border border-surface-100 rounded-xl px-3 py-2 mr-2 mb-2 min-w-[72px]">
      <Text style={{ color, fontSize: 16, fontWeight: '800' }}>{value}</Text>
      <Text className="text-[10px] text-surface-500 mt-0.5">{label}</Text>
    </View>
  );
}

function TinyStat({ label, value }: { label: string; value: number }) {
  return (
    <Text className="text-[10px] text-surface-600 mr-3">
      {label} {value}
    </Text>
  );
}
