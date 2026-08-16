/**
 * Manager tabs: Approvals, Directory, Org Chart, Profile
 */

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import ApprovalsScreen from '../screens/shared/Approvals';
import DirectoryScreen from '../screens/employee/Directory';
import OrgChartScreen from '../screens/shared/OrgChart';
import ProfileScreen from '../screens/employee/Profile';
import { useLanguage } from '../context/LanguageContext';
import { SafeBottomTabBar } from './SafeBottomTabBar';
import { colors } from '../constants/colors';

const Tab = createBottomTabNavigator();

export function ManagerTabs() {
  const { t, language } = useLanguage();
  return (
    <Tab.Navigator
      key={language}
      tabBar={(props) => <SafeBottomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.inactive,
        tabBarActiveBackgroundColor: colors.surfaceInactive,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="ManagerApprovals"
        component={ApprovalsScreen}
        options={{
          tabBarLabel: t('navApprovals'),
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'clipboard-check' : 'clipboard-check-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="ManagerDirectory"
        component={DirectoryScreen}
        options={{
          tabBarLabel: t('navDirectory'),
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'account-group' : 'account-group-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="ManagerOrgChart"
        component={OrgChartScreen}
        options={{
          tabBarLabel: t('navOrg'),
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'sitemap' : 'sitemap-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="ManagerProfile"
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
