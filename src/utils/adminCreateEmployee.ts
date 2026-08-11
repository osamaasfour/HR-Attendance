/**
 * Admin creates Auth + Firestore user via a secondary Firebase app
 * so the current admin session stays signed in.
 */
import {
  initializeApp,
  deleteApp,
  getApps,
} from 'firebase/app';
import {
  getAuth as getFirebaseAuth,
  createUserWithEmailAndPassword,
  signOut as secondarySignOut,
} from 'firebase/auth';
import {
  app,
  db,
  doc,
  setDoc,
  Timestamp,
} from '../services/firebase';
import type { UserData, UserRole } from '../types';
import { DEFAULT_TENANT_ID } from '../types';
import { isValidEmployeeId, normalizeEmployeeId } from './employeeId';

export type CreateEmployeeInput = {
  email: string;
  password: string;
  fullName: string;
  employeeId: string;
  role?: UserRole;
  tenantId?: string;
  phone?: string;
  jobTitle?: string;
  branchId?: string | null;
  branchName?: string | null;
  departmentId?: string | null;
  department?: string | null;
  managerId?: string | null;
  workLocationIds?: string[];
  workShiftId?: string | null;
  annualLeaveAllowance?: number;
  leaveBalanceAdjustment?: number;
};

export async function adminCreateEmployee(input: CreateEmployeeInput): Promise<UserData> {
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const fullName = input.fullName.trim();
  const employeeId = normalizeEmployeeId(input.employeeId) || '';
  const role: UserRole = input.role || 'employee';
  const tenantId = input.tenantId || DEFAULT_TENANT_ID;

  if (!email || !password || !fullName || !employeeId) {
    throw new Error('Full name, employee ID, email and password are required.');
  }
  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }
  if (!isValidEmployeeId(employeeId)) {
    throw new Error('Employee ID must be 00001 to 99999.');
  }

  const name = `admin-create-${Date.now()}`;
  const secondary = initializeApp({ ...app.options }, name);
  const secondaryAuth = getFirebaseAuth(secondary);

  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const uid = cred.user.uid;
    const userData: UserData = {
      uid,
      email,
      fullName,
      role,
      employeeId,
      tenantId,
      active: true,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    const phone = input.phone?.trim();
    const jobTitle = input.jobTitle?.trim();
    if (phone) userData.phone = phone;
    if (jobTitle) userData.jobTitle = jobTitle;
    if (input.branchId) {
      userData.branchId = input.branchId;
      if (input.branchName) userData.branchName = input.branchName;
    }
    if (input.departmentId) {
      userData.departmentId = input.departmentId;
      if (input.department) userData.department = input.department;
    }
    if (input.managerId) userData.managerId = input.managerId;
    if (input.workLocationIds && input.workLocationIds.length > 0) {
      userData.workLocationIds = input.workLocationIds;
    }
    if (input.workShiftId) {
      userData.workShiftId = input.workShiftId;
    }
    if (typeof input.annualLeaveAllowance === 'number' && input.annualLeaveAllowance >= 0) {
      userData.annualLeaveAllowance = Math.floor(input.annualLeaveAllowance);
    }
    if (typeof input.leaveBalanceAdjustment === 'number') {
      userData.leaveBalanceAdjustment = Math.trunc(input.leaveBalanceAdjustment);
    }

    await setDoc(doc(db, 'users', uid), userData);
    await secondarySignOut(secondaryAuth);
    return userData;
  } finally {
    try {
      await deleteApp(secondary);
    } catch {
      /* ignore */
    }
    getApps();
  }
}
