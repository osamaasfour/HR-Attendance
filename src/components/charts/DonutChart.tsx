import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../../constants/colors';

export type DonutSlice = { label: string; value: number; color: string };

type Props = {
  slices: DonutSlice[];
  size?: number;
  emptyLabel?: string;
  centerLabel?: string;
};

export default function DonutChart({
  slices,
  size = 112,
  emptyLabel,
  centerLabel,
}: Props) {
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const cx = size / 2;
  const cy = size / 2;

  if (total <= 0) {
    return (
      <View className="bg-surface-50 rounded-xl px-3 py-6 items-center">
        <Text className="text-surface-400 text-sm">{emptyLabel || '—'}</Text>
      </View>
    );
  }

  let offset = 0;
  const visible = slices.filter((s) => s.value > 0);

  return (
    <View className="flex-row items-center">
      <View className="items-center justify-center" style={{ width: size, height: size }}>
        <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
          <Circle
            cx={cx}
            cy={cy}
            r={radius}
            stroke={colors.muted}
            strokeWidth={stroke}
            fill="none"
          />
          {visible.map((s, i) => {
            const len = (s.value / total) * circumference;
            const dashoffset = -offset;
            offset += len;
            return (
              <Circle
                key={`${s.label}-${i}`}
                cx={cx}
                cy={cy}
                r={radius}
                stroke={s.color}
                strokeWidth={stroke}
                fill="none"
                strokeDasharray={`${len} ${circumference - len}`}
                strokeDashoffset={dashoffset}
                strokeLinecap="butt"
              />
            );
          })}
        </Svg>
        {!!centerLabel && (
          <View className="absolute items-center">
            <Text className="text-sm font-bold text-surface-800">{centerLabel}</Text>
          </View>
        )}
      </View>
      <View className="flex-1 ml-4">
        {visible.map((s) => (
          <View key={s.label} className="flex-row items-center mb-1.5">
            <View className="w-2.5 h-2.5 rounded-sm mr-2" style={{ backgroundColor: s.color }} />
            <Text className="text-xs text-surface-600 flex-1" numberOfLines={1}>
              {s.label}
            </Text>
            <Text className="text-xs font-semibold text-surface-700 ml-2">
              {typeof s.value === 'number' && s.value % 1 !== 0
                ? s.value.toFixed(0)
                : s.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
