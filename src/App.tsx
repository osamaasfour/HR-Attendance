/**
 * App.tsx — Application Entry Point
 */

import React, { useEffect } from 'react';
import { View, ActivityIndicator, Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { enableScreens } from 'react-native-screens';
import '../global.css';
import { AuthProvider } from './context/AuthContext';
import { AlertProvider } from './context/AlertContext';
import { AttendanceProvider } from './context/AttendanceContext';
import { LanguageProvider } from './context/LanguageContext';
import { CompanyProvider } from './context/CompanyContext';
import { RootNavigator } from './navigation/RootNavigator';
import { LicenseExpiryWatcher } from './components/LicenseExpiryWatcher';
import { ErrorBoundary } from './components/ErrorBoundary';
import { colors } from './constants/colors';

if (Platform.OS === 'web') {
  enableScreens(false);
}

const WEB_ROOT_CSS = `
html, body, #root {
  height: 100% !important;
  min-height: 100% !important;
  width: 100%;
  margin: 0;
  padding: 0;
}
body { overflow: hidden; }
#root {
  display: flex;
  flex-direction: column;
}
`;

function useWebViewportFitCover() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'viewport');
      document.head.appendChild(meta);
    }
    meta.setAttribute(
      'content',
      'width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover',
    );
    if (!document.getElementById('hr-web-root-css')) {
      const style = document.createElement('style');
      style.id = 'hr-web-root-css';
      style.textContent = WEB_ROOT_CSS;
      document.head.appendChild(style);
    }
  }, []);
}

const fill = StyleSheet.create({
  root: {
    flex: 1,
    ...(Platform.OS === 'web' ? { height: '100%', minHeight: '100%' } : null),
  },
}).root;

export default function App() {
  useWebViewportFitCover();
  const [fontsLoaded] = useFonts({
    'material-community': require('../assets/fonts/MaterialCommunityIcons.ttf'),
    materialcommunityicons: require('../assets/fonts/MaterialCommunityIcons.ttf'),
  });

  if (!fontsLoaded) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#FFFFFF',
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={fill}>
      <SafeAreaProvider style={fill}>
        <ErrorBoundary>
          <StatusBar style="dark" backgroundColor="#FFFFFF" />
          <LanguageProvider>
            <AlertProvider>
              <AuthProvider>
                <CompanyProvider>
                  <AttendanceProvider>
                    <LicenseExpiryWatcher />
                    <RootNavigator />
                  </AttendanceProvider>
                </CompanyProvider>
              </AuthProvider>
            </AlertProvider>
          </LanguageProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </View>
  );
}
