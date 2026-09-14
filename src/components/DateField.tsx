import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { formatDate, toDateString } from '../utils/time';
import { useLanguage } from '../context/LanguageContext';
import { colors } from '../constants/colors';

type Props = {
  label: string;
  value: string;
  onChange: (ymd: string) => void;
  minimumDate?: string;
  placeholder?: string;
  compact?: boolean;
};

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function parseYmd(ymd: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const d = new Date(`${ymd}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, delta: number) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

function monthTitle(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function buildCells(viewMonth: Date): Array<{ key: string; ymd: string | null; day: number | null }> {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ key: string; ymd: string | null; day: number | null }> = [];

  for (let i = 0; i < firstDow; i++) {
    cells.push({ key: `pad-${i}`, ymd: null, day: null });
  }
  for (let day = 1; day <= days; day++) {
    const ymd = toDateString(new Date(year, month, day, 12));
    cells.push({ key: ymd, ymd, day });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ key: `trail-${cells.length}`, ymd: null, day: null });
  }
  return cells;
}

export default function DateField({
  label,
  value,
  onChange,
  minimumDate,
  placeholder,
  compact,
}: Props) {
  const { t } = useLanguage();
  const resolvedPlaceholder = placeholder || t('selectDate');
  const selected = parseYmd(value);
  const min = parseYmd(minimumDate || '');
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(selected || new Date()));

  const cells = useMemo(() => buildCells(viewMonth), [viewMonth]);

  const openPicker = () => {
    setViewMonth(startOfMonth(selected || min || new Date()));
    setOpen(true);
  };

  const pick = (ymd: string) => {
    onChange(ymd);
    setOpen(false);
  };

  const display = selected ? formatDate(selected) : resolvedPlaceholder;

  return (
    <View className={compact ? '' : 'mb-3'}>
      <Text className="text-xs text-surface-400 mb-1">{label}</Text>
      <TouchableOpacity
        onPress={openPicker}
        activeOpacity={0.85}
        className="border border-surface-200 rounded-xl px-3 h-11 flex-row items-center justify-between bg-white"
      >
        <Text className={`text-base ${selected ? 'text-surface-800' : 'text-surface-500'}`}>
          {display}
        </Text>
        <MaterialCommunityIcons name="calendar-month-outline" size={22} color="#64748B" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setOpen(false)} />
          <View className="bg-white rounded-2xl p-4 mx-5" style={styles.sheet}>
            <View className="flex-row items-center justify-between mb-3">
              <TouchableOpacity
                onPress={() => setViewMonth((m) => addMonths(m, -1))}
                className="w-10 h-10 items-center justify-center rounded-full bg-surface-100"
              >
                <MaterialCommunityIcons name="chevron-left" size={24} color={colors.primary} />
              </TouchableOpacity>
              <Text className="text-base font-semibold text-surface-800">{monthTitle(viewMonth)}</Text>
              <TouchableOpacity
                onPress={() => setViewMonth((m) => addMonths(m, 1))}
                className="w-10 h-10 items-center justify-center rounded-full bg-surface-100"
              >
                <MaterialCommunityIcons name="chevron-right" size={24} color={colors.primary} />
              </TouchableOpacity>
            </View>

            <View className="flex-row mb-1">
              {WEEKDAYS.map((d) => (
                <View key={d} style={styles.cell}>
                  <Text className="text-[11px] font-semibold text-surface-400 text-center">{d}</Text>
                </View>
              ))}
            </View>

            <View className="flex-row flex-wrap">
              {cells.map((cell) => {
                if (!cell.ymd || cell.day == null) {
                  return <View key={cell.key} style={styles.cell} />;
                }
                const disabled = !!(minimumDate && cell.ymd < minimumDate);
                const isSelected = cell.ymd === value;
                const isToday = cell.ymd === toDateString();
                return (
                  <View key={cell.key} style={styles.cell}>
                    <TouchableOpacity
                      disabled={disabled}
                      onPress={() => pick(cell.ymd!)}
                      style={[
                        styles.dayBtn,
                        isSelected && styles.daySelected,
                        !isSelected && isToday && styles.dayToday,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          disabled && styles.dayDisabled,
                          isSelected && styles.dayTextSelected,
                        ]}
                      >
                        {cell.day}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>

            <TouchableOpacity
              onPress={() => setOpen(false)}
              className="mt-3 h-11 rounded-xl bg-surface-100 items-center justify-center"
            >
              <Text className="text-surface-600 font-semibold">{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
  },
  sheet: {
    zIndex: 1,
  },
  cell: {
    width: '14.28%',
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daySelected: {
    backgroundColor: colors.primary,
  },
  dayToday: {
    backgroundColor: colors.primary50,
  },
  dayText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1E293B',
  },
  dayDisabled: {
    color: '#E2E8F0',
  },
  dayTextSelected: {
    color: '#FFFFFF',
  },
});
