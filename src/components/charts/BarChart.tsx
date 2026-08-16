import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { colors } from '../../constants/colors';

export type ChartBarPart = { value: number; color: string };
export type ChartBarItem = { label: string; parts: ChartBarPart[] };
export type ChartLegendItem = { label: string; color: string };

type Props = {
  items: ChartBarItem[];
  height?: number;
  legend?: ChartLegendItem[];
  emptyLabel?: string;
  barWidth?: number;
};

export default function BarChart({
  items,
  height = 140,
  legend,
  emptyLabel,
  barWidth = 14,
}: Props) {
  const max = Math.max(
    1,
    ...items.map((it) => it.parts.reduce((s, p) => s + Math.max(0, p.value), 0)),
  );
  const gap = 6;
  const chartW = Math.max(items.length * (barWidth + gap) + 8, 120);

  if (items.length === 0 || items.every((it) => it.parts.every((p) => p.value <= 0))) {
    return (
      <View className="bg-surface-50 rounded-xl px-3 py-6 items-center">
        <Text className="text-surface-400 text-sm">{emptyLabel || '—'}</Text>
      </View>
    );
  }

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          <Svg width={chartW} height={height}>
            {items.map((it, i) => {
              const x = 4 + i * (barWidth + gap);
              let y = height;
              return it.parts.map((p, pi) => {
                const h = (Math.max(0, p.value) / max) * (height - 4);
                y -= h;
                return (
                  <Rect
                    key={`${i}-${pi}`}
                    x={x}
                    y={y}
                    width={barWidth}
                    height={Math.max(h, p.value > 0 ? 1 : 0)}
                    rx={2}
                    fill={p.color || colors.primary}
                  />
                );
              });
            })}
          </Svg>
          <View className="flex-row mt-1" style={{ width: chartW }}>
            {items.map((it, i) => (
              <Text
                key={`l-${i}`}
                className="text-[9px] text-surface-400 text-center"
                style={{ width: barWidth + gap }}
                numberOfLines={1}
              >
                {it.label}
              </Text>
            ))}
          </View>
        </View>
      </ScrollView>
      {legend && legend.length > 0 && (
        <View className="flex-row flex-wrap mt-2">
          {legend.map((l) => (
            <View key={l.label} className="flex-row items-center mr-3 mb-1">
              <View className="w-2.5 h-2.5 rounded-sm mr-1" style={{ backgroundColor: l.color }} />
              <Text className="text-[10px] text-surface-500">{l.label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
