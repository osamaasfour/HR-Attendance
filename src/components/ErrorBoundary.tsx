/**
 * Catches render crashes so web users see an error instead of a blank page.
 */
import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { colors } from '../constants/colors';

type Props = { children: ReactNode; compact?: boolean };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[App] render crash', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View
        style={{
          flex: 1,
          minHeight: this.props.compact ? 240 : Platform.OS === 'web' ? ('100%' as any) : undefined,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          backgroundColor: '#FFFFFF',
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.foreground, marginBottom: 8 }}>
          Something went wrong
        </Text>
        <Text style={{ color: '#64748B', textAlign: 'center', marginBottom: 16 }}>
          {this.state.error.message || 'The screen failed to load. Reload the page.'}
        </Text>
        <TouchableOpacity
          onPress={() => {
            this.setState({ error: null });
            if (!this.props.compact && Platform.OS === 'web' && typeof window !== 'undefined') {
              window.location.reload();
            }
          }}
          style={{
            backgroundColor: colors.primary,
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderRadius: 12,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Reload</Text>
        </TouchableOpacity>
      </View>
    );
  }
}
