/**
 * Root Navigation — auth gate + role tabs + shared Notifications screen
 */

import React from 'react';
import { ActivityIndicator, Platform, View, Text } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { EmployeeTabs } from './EmployeeTabs';
import { AdminTabs } from './AdminTabs';
import { ManagerTabs } from './ManagerTabs';
import LoginScreen from '../screens/Login';
import SignupScreen from '../screens/Signup';
import NotificationsScreen from '../screens/shared/Notifications';
import OrgChartScreen from '../screens/shared/OrgChart';
import PayslipDetailScreen from '../screens/shared/PayslipDetail';
import { colors } from '../constants/colors';

const Stack = createNativeStackNavigator();

const fillStyle = {
  flex: 1,
  ...(Platform.OS === 'web' ? { height: '100%', minHeight: '100%' } : null),
} as const;

const AppTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.white,
    text: colors.foreground,
    border: colors.border,
    notification: colors.danger,
  },
};

function LoadingScreen() {
  const { t } = useLanguage();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFFFFF',
      }}
    >
      <View className="w-20 h-20 rounded-full bg-primary-500 items-center justify-center mb-4">
        <ActivityIndicator size="large" color="white" />
      </View>
      <Text className="text-surface-400 text-sm">{t('loading')}</Text>
    </View>
  );
}

export function RootNavigator() {
  const { user, isLoading } = useAuth();
  const { t } = useLanguage();

  return (
    <View style={fillStyle}>
      <NavigationContainer theme={AppTheme}>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            animation: Platform.OS === 'web' ? 'none' : 'slide_from_right',
            contentStyle: {
              backgroundColor: user ? '#F8FAFC' : '#FFFFFF',
              flex: 1,
            },
          }}
        >
          {isLoading ? (
            <Stack.Screen name="Boot" component={LoadingScreen} />
          ) : !user ? (
            <>
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="Signup" component={SignupScreen} />
            </>
          ) : (
            <>
              {user.role === 'admin' ? (
                <Stack.Screen name="AdminTabs" component={AdminTabs} />
              ) : user.role === 'manager' ? (
                <Stack.Screen name="ManagerTabs" component={ManagerTabs} />
              ) : (
                <Stack.Screen name="EmployeeTabs" component={EmployeeTabs} />
              )}
              <Stack.Screen
                name="Notifications"
                component={NotificationsScreen}
                options={{ headerShown: true, title: t('notifications') }}
              />
              <Stack.Screen
                name="OrgChart"
                component={OrgChartScreen}
                options={{ headerShown: true, title: t('organization') }}
              />
              <Stack.Screen
                name="PayslipDetail"
                component={PayslipDetailScreen}
                options={{ headerShown: true, title: t('payslipDetail') }}
              />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </View>
  );
}
