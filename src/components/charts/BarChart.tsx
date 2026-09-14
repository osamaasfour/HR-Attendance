import React from 'react';
import { View, Text, ScrollView } from 'react-native';

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
        <View className="flex-row items-end pt-1" style={{ height: height + 18 }}>
          {items.map((it, i) => (
            <View key={`b-${i}`} className="items-center mr-1.5">
              <View
                style={{
                  width: barWidth,
                  height,
                  justifyContent: 'flex-end',
                }}
              >
                {[...it.parts].reverse().map((p, pi) => {
                  const h = (Math.max(0, p.value) / max) * height;
                  if (h <= 0) return null;
                  return (
                    <View
                      key={`p-${i}-${pi}`}
                      style={{
                        width: barWidth,
                        height: Math.max(2, h),
                        backgroundColor: p.color,
                      }}
                    />
                  );
                })}
              </View>
              <Text
                className="text-[9px] text-surface-400 text-center mt-1"
                style={{ width: Math.max(barWidth, 18) }}
                numberOfLines={1}
              >
                {it.label}
              </Text>
            </View>
          ))}
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
