/**
 * nativewind-env.d.ts — TypeScript declarations for NativeWind
 *
 * Extends React Native's StyleProp to support TailwindCSS className props.
 * Without this, TypeScript will complain about className on View, Text, etc.
 */

import 'react-native';
import { StyledComponent } from 'nativewind';

declare module 'react-native' {
  interface ViewProps {
    className?: string;
  }
  interface TextProps {
    className?: string;
  }
  interface TextInputProps {
    className?: string;
  }
  interface TouchableOpacityProps {
    className?: string;
  }
  interface ScrollViewProps {
    className?: string;
  }
  interface ImageProps {
    className?: string;
  }
  interface FlatListProps<ItemT> {
    className?: string;
  }
  interface SafeAreaViewProps {
    className?: string;
  }
}
