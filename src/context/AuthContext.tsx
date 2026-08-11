/**
 * AuthContext — Global Authentication State Provider (multi-tenant aware)
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { AppUser, UserData } from '../types';
import { DEFAULT_TENANT_ID } from '../types';
import { normalizeEmployeeId } from '../utils/employeeId';
import { getDeviceLabel, getStableDeviceId } from '../utils/deviceId';
import { isPlatformAdminEmail } from '../constants/platform';
import { assertTenantLicenseOk } from '../utils/tenantLicense';
import {
  ensureDefaultTenant,
  getTenantById,
  getTenantBySlug,
  countTenantUsers,
} from '../utils/tenants';
import {
  auth,
  db,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  Timestamp,
} from '../services/firebase';

const STORAGE_KEY_USER = '@hr_attendance_user';

export type SignupMode = 'join' | 'create';

export type SignupOptions = {
  mode: SignupMode;
  /** Join existing tenant by invite slug */
  tenantCode?: string;
  /** Create new tenant */
  companyName?: string;
  countryCode?: string;
  currencyCode?: string;
};

interface AuthContextType {
  user: AppUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (
    email: string,
    password: string,
    fullName: string,
    employeeId: string,
    options?: SignupOptions,
  ) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function toAppUser(uid: string, data: UserData): AppUser {
  return {
    uid,
    email: data.email,
    fullName: data.fullName,
    role: data.role || 'employee',
    employeeId: data.employeeId,
    tenantId: data.tenantId || DEFAULT_TENANT_ID,
    department: data.department,
    departmentId: data.departmentId,
    branchId: data.branchId,
    branchName: data.branchName,
    workLocationIds: Array.isArray(data.workLocationIds) ? data.workLocationIds : [],
    workShiftId: data.workShiftId || undefined,
    allowedDeviceId: data.allowedDeviceId || undefined,
    deviceLabel: data.deviceLabel || undefined,
    annualLeaveAllowance:
      typeof data.annualLeaveAllowance === 'number' ? data.annualLeaveAllowance : undefined,
    leaveBalanceAdjustment:
      typeof data.leaveBalanceAdjustment === 'number' ? data.leaveBalanceAdjustment : undefined,
    managerId: data.managerId,
    jobTitle: data.jobTitle,
    phone: data.phone,
    photoURL: data.photoURL,
    active: data.active !== false,
    platformAdmin: data.platformAdmin === true,
  };
}

/** Bind or verify device for non-admin roles on native. */
async function enforceDeviceBinding(uid: string, data: UserData): Promise<UserData> {
  if (data.role === 'admin' || Platform.OS === 'web') return data;
  const deviceId = await getStableDeviceId();
  if (!deviceId) return data;

  if (!data.allowedDeviceId) {
    const label = getDeviceLabel();
    await updateDoc(doc(db, 'users', uid), {
      allowedDeviceId: deviceId,
      deviceBoundAt: Timestamp.now(),
      deviceLabel: label,
      updatedAt: Timestamp.now(),
    });
    return { ...data, allowedDeviceId: deviceId, deviceLabel: label };
  }

  if (data.allowedDeviceId !== deviceId) {
    await signOut(auth);
    const err: any = new Error(
      'This account is registered to another device. Ask an admin to reset your device.',
    );
    err.code = 'auth/device-mismatch';
    throw err;
  }
  return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserProfile = useCallback(async (uid: string): Promise<AppUser | null> => {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (!userDoc.exists()) {
        console.warn(`[Auth] No Firestore document found for uid=${uid}`);
        return null;
      }
      const data = userDoc.data() as UserData;
      if (data.active === false) {
        await signOut(auth);
        const err: any = new Error('Account deactivated');
        err.code = 'auth/account-inactive';
        throw err;
      }
      if (!data.tenantId) {
        data.tenantId = DEFAULT_TENANT_ID;
        try {
          await ensureDefaultTenant();
          await setDoc(
            doc(db, 'users', uid),
            { tenantId: DEFAULT_TENANT_ID, updatedAt: Timestamp.now() },
            { merge: true },
          );
        } catch (backfillErr) {
          console.warn('[Auth] tenantId backfill skipped', backfillErr);
        }
      }

      // Bootstrap platform admin flag for allowlisted vendor emails
      if (isPlatformAdminEmail(data.email) && data.platformAdmin !== true) {
        try {
          await updateDoc(doc(db, 'users', uid), {
            platformAdmin: true,
            updatedAt: Timestamp.now(),
          });
          data.platformAdmin = true;
        } catch (e) {
          console.warn('[Auth] platformAdmin bootstrap skipped', e);
        }
      }

      // License gate — platform admins always allowed
      if (!data.platformAdmin) {
        const tenant = await getTenantById(data.tenantId || DEFAULT_TENANT_ID);
        try {
          assertTenantLicenseOk(tenant);
        } catch (licErr: any) {
          await signOut(auth);
          throw licErr;
        }
      }

      const bound = await enforceDeviceBinding(uid, data);
      const appUser = toAppUser(uid, bound);
      await AsyncStorage.setItem(STORAGE_KEY_USER, JSON.stringify(appUser));
      return appUser;
    } catch (error: any) {
      if (
        error?.code === 'auth/account-inactive' ||
        error?.code === 'auth/device-mismatch' ||
        error?.code === 'auth/license-expired' ||
        error?.code === 'auth/tenant-suspended'
      ) {
        throw error;
      }
      console.error('[Auth] Failed to fetch user profile:', error);
      return null;
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          const profile = await fetchUserProfile(firebaseUser.uid);
          setUser(profile);
        } else {
          setUser(null);
          await AsyncStorage.removeItem(STORAGE_KEY_USER);
        }
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    });
    return () => unsubscribe();
  }, [fetchUserProfile]);

  const login = useCallback(
    async (email: string, password: string) => {
      setIsLoading(true);
      try {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        const profile = await fetchUserProfile(credential.user.uid);
        if (!profile) {
          await signOut(auth);
          const err: any = new Error(
            'Signed in, but no user profile was found in Firestore. Ask an admin to recreate your users/{uid} document.',
          );
          err.code = 'auth/profile-missing';
          throw err;
        }
        setUser(profile);
      } finally {
        setIsLoading(false);
      }
    },
    [fetchUserProfile],
  );

  const signup = useCallback(
    async (
      email: string,
      password: string,
      fullName: string,
      employeeId: string,
      options?: SignupOptions,
    ) => {
      setIsLoading(true);
      try {
        const mode = options?.mode || 'join';
        let tenantId = DEFAULT_TENANT_ID;

        if (mode === 'create') {
          throw new Error(
            'Public company creation is disabled. Ask the vendor to provision your workspace.',
          );
        }

        // Join existing tenant
        const code = options?.tenantCode?.trim();
        if (code) {
          const tenant = await getTenantBySlug(code);
          if (!tenant) {
            throw new Error('Invalid company code.');
          }
          assertTenantLicenseOk(tenant);
          const seats = tenant.maxUsers;
          if (seats && seats > 0) {
            const used = await countTenantUsers(tenant.id);
            if (used >= seats) {
              const err: any = new Error('This company has reached its user seat limit.');
              err.code = 'auth/seat-limit';
              throw err;
            }
          }
          tenantId = tenant.id;
        } else {
          await ensureDefaultTenant();
          const tenant = await getTenantById(DEFAULT_TENANT_ID);
          assertTenantLicenseOk(tenant);
          tenantId = DEFAULT_TENANT_ID;
        }

        const credential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = credential.user.uid;
        const userData: UserData = {
          uid,
          email,
          fullName,
          role: 'employee',
          employeeId: normalizeEmployeeId(employeeId) || '00001',
          tenantId,
          active: true,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        };
        await setDoc(doc(db, 'users', uid), userData);
        const appUser = toAppUser(uid, userData);
        await AsyncStorage.setItem(STORAGE_KEY_USER, JSON.stringify(appUser));
        setUser(appUser);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    await signOut(auth);
    setUser(null);
    await AsyncStorage.removeItem(STORAGE_KEY_USER);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!auth.currentUser) return;
    const profile = await fetchUserProfile(auth.currentUser.uid);
    if (profile) setUser(profile);
  }, [fetchUserProfile]);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      isLoading,
      login,
      signup,
      logout,
      resetPassword,
      refreshProfile,
    }),
    [user, isLoading, login, signup, logout, resetPassword, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
