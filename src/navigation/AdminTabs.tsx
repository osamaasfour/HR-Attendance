/**
 * Admin tabs: Overview, Records, Approvals, Users, Payroll, Org, Settings, Profile
 */

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import AdminOverviewScreen from '../screens/admin/Overview';
import AdminAllRecordsScreen from '../screens/admin/AllRecords';
import ApprovalsScreen from '../screens/shared/Approvals';
import AdminUsersScreen from '../screens/admin/Users';
import AdminPayrollScreen from '../screens/admin/Payroll';
import OrgChartScreen from '../screens/shared/OrgChart';
import AdminWorkLocationsScreen from '../screens/admin/WorkLocations';
import FingerprintDevicesScreen from '../screens/admin/FingerprintDevices';
import AdminSettingsScreen from '../screens/admin/Settings';
import AdminReportsScreen from '../screens/admin/Reports';
import PlatformTenantsScreen from '../screens/admin/PlatformTenants';
import ProfileScreen from '../screens/employee/Profile';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { SafeBottomTabBar } from './SafeBottomTabBar';
import { colors } from '../constants/colors';

const Tab = createBottomTabNavigator();

export function AdminTabs() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const isPlatform = user?.platformAdmin === true;
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
          fontSize: 9,
          fontWeight: '600',
        },
      }}
    >
      {isPlatform && (
        <Tab.Screen
          name="PlatformTenants"
          component={PlatformTenantsScreen}
          options={{
            tabBarLabel: t('navTenants'),
            tabBarIcon: ({ color, size, focused }) => (
              <MaterialCommunityIcons
                name={focused ? 'office-building' : 'office-building-outline'}
                size={size}
                color={color}
              />
            ),
          }}
        />
      )}
      <Tab.Screen
        name="AdminOverview"
        component={AdminOverviewScreen}
        options={{
          tabBarLabel: t('navOverview'),
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'view-dashboard' : 'view-dashboard-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="AdminAllRecords"
        component={AdminAllRecordsScreen}
        options={{
          tabBarLabel: t('navRecords'),
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'format-list-bulleted' : 'format-list-bulleted-type'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="AdminApprovals"
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
        name="AdminUsers"
        component={AdminUsersScreen}
        options={{
          tabBarLabel: t('navUsers'),
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'account-cog' : 'account-cog-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="AdminPayroll"
        component={AdminPayrollScreen}
        options={{
          tabBarLabel: t('navPayroll'),
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'cash-multiple' : 'cash'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="AdminReports"
        component={AdminReportsScreen}
        options={{
          tabBarLabel: t('navReports'),
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'chart-box' : 'chart-box-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="AdminOrg"
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
        name="AdminLocations"
        component={AdminWorkLocationsScreen}
        options={{
          tabBarLabel: t('navLocations'),
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'map-marker-radius' : 'map-marker-radius-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="AdminFingerprintDevices"
        component={FingerprintDevicesScreen}
        options={{
          tabBarLabel: t('navFingerprintDevices'),
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'fingerprint' : 'fingerprint'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="AdminSettings"
        component={AdminSettingsScreen}
        options={{
          tabBarLabel: t('navSettings'),
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'cog' : 'cog-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="AdminProfile"
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
