/**
 * Employee tabs: Home, Leave, History, Pay, Profile (Directory removed)
 */

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import EmployeeHomeScreen from '../screens/employee/Home';
import HistoryScreen from '../screens/employee/History';
import ProfileScreen from '../screens/employee/Profile';
import LeaveScreen from '../screens/employee/Leave';
import EmployeePayslipsScreen from '../screens/employee/Payslips';
import { useLanguage } from '../context/LanguageContext';
import { SafeBottomTabBar } from './SafeBottomTabBar';

const Tab = createBottomTabNavigator();

export function EmployeeTabs() {
  const { t, language } = useLanguage();
  return (
    <Tab.Navigator
      key={language}
      tabBar={(props) => <SafeBottomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: '#1E3A5F',
        tabBarInactiveTintColor: '#94A3B8',
        tabBarActiveBackgroundColor: '#F1F5F9',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="EmployeeHome"
        component={EmployeeHomeScreen}
        options={{
          tabBarLabel: t('navHome'),
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'home' : 'home-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Leave"
        component={LeaveScreen}
        options={{
          tabBarLabel: t('navRequests'),
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'calendar-clock' : 'calendar-clock-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Payslips"
        component={EmployeePayslipsScreen}
        options={{
          tabBarLabel: t('navPay'),
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons name="cash" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          tabBarLabel: t('navHistory'),
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'clipboard-text-clock' : 'clipboard-text-clock-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: t('navProfile'),
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'account' : 'account-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
