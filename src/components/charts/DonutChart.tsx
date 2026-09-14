import React from 'react';
import { View, Text } from 'react-native';

export type DonutSlice = { label: string; value: number; color: string };

type Props = {
  slices: DonutSlice[];
  size?: number;
  emptyLabel?: string;
  centerLabel?: string;
};

export default function DonutChart({ slices, emptyLabel, centerLabel }: Props) {
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  const visible = slices.filter((s) => s.value > 0);

  if (total <= 0) {
    return (
      <View className="bg-surface-50 rounded-xl px-3 py-6 items-center">
        <Text className="text-surface-400 text-sm">{emptyLabel || '—'}</Text>
      </View>
    );
  }

  return (
    <View>
      {!!centerLabel && (
        <Text className="text-sm font-bold text-surface-800 mb-2">{centerLabel}</Text>
      )}
      <View className="h-3 rounded-full overflow-hidden flex-row bg-surface-100 mb-3">
        {visible.map((s, i) => (
          <View
            key={`${s.label}-${i}`}
            style={{ flex: Math.max(0, s.value), backgroundColor: s.color }}
          />
        ))}
      </View>
      {visible.map((s, i) => (
        <View key={`lg-${s.label}-${i}`} className="flex-row items-center mb-1.5">
          <View className="w-2.5 h-2.5 rounded-sm mr-2" style={{ backgroundColor: s.color }} />
          <Text className="text-xs text-surface-600 flex-1" numberOfLines={1}>
            {s.label}
          </Text>
          <Text className="text-xs font-semibold text-surface-700 ml-2">
            {typeof s.value === 'number' && s.value % 1 !== 0 ? s.value.toFixed(0) : s.value}
          </Text>
        </View>
      ))}
    </View>
  );
}
