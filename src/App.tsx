/**
 * App.tsx — Application Entry Point
 */

import React, { useEffect } from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import '../global.css';
import { AuthProvider } from './context/AuthContext';
import { AlertProvider } from './context/AlertContext';
import { AttendanceProvider } from './context/AttendanceContext';
import { LanguageProvider } from './context/LanguageContext';
import { CompanyProvider } from './context/CompanyContext';
import { RootNavigator } from './navigation/RootNavigator';
import { LicenseExpiryWatcher } from './components/LicenseExpiryWatcher';
import { colors } from './constants/colors';

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
  }, []);
}

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
    <SafeAreaProvider>
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
    </SafeAreaProvider>
  );
}
