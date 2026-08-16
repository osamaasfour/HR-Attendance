/**
 * Root Navigation — auth gate + role tabs + shared Notifications screen
 */

import React from 'react';
import { ActivityIndicator, View, Text } from 'react-native';
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
    <View className="flex-1 bg-white items-center justify-center">
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

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return (
      <NavigationContainer theme={AppTheme}>
        <Stack.Navigator
          initialRouteName="Login"
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#FFFFFF' },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Signup" component={SignupScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    );
  }

  return (
    <NavigationContainer theme={AppTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#F8FAFC' },
        }}
      >
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
