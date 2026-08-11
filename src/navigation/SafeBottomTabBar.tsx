/**
 * Bottom tab bar that clears Android edge-to-edge system navigation.
 */

import React from 'react';
import { Platform, View } from 'react-native';
import { BottomTabBar, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TAB_INNER_HEIGHT = 56;

/** Extra space when insets are missing (common with 3-button nav + edge-to-edge). */
const ANDROID_NAV_FALLBACK = 48;

export function resolveTabBarBottomInset(insetBottom: number): number {
  if (Platform.OS === 'android') {
    // Prefer real inset; if 0 (not reported), keep clear of system nav buttons
    return Math.max(insetBottom > 0 ? insetBottom : ANDROID_NAV_FALLBACK, 16);
  }
  if (Platform.OS === 'web') {
    if (insetBottom > 0) return insetBottom;
    if (typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      return ANDROID_NAV_FALLBACK;
    }
    return 8;
  }
  return Math.max(insetBottom, 8);
}

export function SafeBottomTabBar(props: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottom = resolveTabBarBottomInset(insets.bottom);

  return (
    <View
      style={{
        backgroundColor: '#FFFFFF',
        borderTopWidth: 1,
        borderTopColor: '#E2E8F0',
        paddingBottom: bottom,
      }}
    >
      <BottomTabBar
        {...props}
        style={[
          {
            backgroundColor: 'transparent',
            borderTopWidth: 0,
            elevation: 0,
            shadowOpacity: 0,
            height: TAB_INNER_HEIGHT,
            paddingTop: 4,
            paddingBottom: 4,
          },
        ]}
      />
    </View>
  );
}
