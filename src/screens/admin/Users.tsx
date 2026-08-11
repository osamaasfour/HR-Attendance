import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  db,
  collection,
  getDocs,
  updateDoc,
  doc,
  Timestamp,
} from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import { useAppAlert } from '../../context/AlertContext';
import { useLanguage } from '../../context/LanguageContext';
import { uploadProfilePhoto } from '../../utils/uploadProfilePhoto';
import { adminUpdateUserAuthCredentials } from '../../utils/adminUpdateAuth';
import { adminCreateEmployee } from '../../utils/adminCreateEmployee';
import { nextEmployeeId } from '../../utils/employeeId';
import { migrateTenantEmployeeIds } from '../../utils/migrateEmployeeIds';
import { formatTime12h } from '../../components/TimeField';
import { ANNUAL_LEAVE_ALLOWANCE } from '../../constants/theme';
import {
  computeRemainingVacation,
  resolveAnnualLeaveAllowance,
  resolveLeaveBalanceAdjustment,
} from '../../utils/leaveBalance';
import { vacationUsedInYear } from '../../utils/reports';
import { countTenantUsers, getTenantById } from '../../utils/tenants';
import type { Branch, Department, HrRequest, UserData, UserRole, WorkLocation, WorkShift } from '../../types';
import type { TranslationKey } from '../../i18n/translations';

const ROLES: UserRole[] = ['employee', 'manager', 'admin'];

export default function AdminUsersScreen() {
  const { user } = useAuth();
  const { showAlert } = useAppAlert();
  const { t } = useLanguage();
  const [users, setUsers] = useState<UserData[]>([]);
  const [hrRequests, setHrRequests] = useState<HrRequest[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [workLocations, setWorkLocations] = useState<WorkLocation[]>([]);
  const [workShifts, setWorkShifts] = useState<WorkShift[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createRole, setCreateRole] = useState<UserRole>('employee');
  const [editing, setEditing] = useState<UserData | null>(null);
  const [fullName, setFullName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [targetCurrentPassword, setTargetCurrentPassword] = useState('');
  const [managerId, setManagerId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [workLocationIds, setWorkLocationIds] = useState<string[]>([]);
  const [workShiftId, setWorkShiftId] = useState('');
  const [annualLeaveAllowance, setAnnualLeaveAllowance] = useState(
    String(ANNUAL_LEAVE_ALLOWANCE),
  );
  const [leaveBalanceAdjustment, setLeaveBalanceAdjustment] = useState('0');
  const [editUsedVacation, setEditUsedVacation] = useState(0);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const roleLabel = (role?: UserRole | string) => {
    const map: Record<string, TranslationKey> = {
      employee: 'roleEmployee',
      manager: 'roleManager',
      admin: 'roleAdmin',
    };
    return t(map[role || 'employee'] || 'roleEmployee');
  };

  const managers = useMemo(
    () => users.filter((u) => u.role === 'manager' || u.role === 'admin'),
    [users],
  );

  const deptsForBranch = useMemo(
    () => departments.filter((d) => d.branchId === branchId),
    [departments, branchId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const tid = user?.tenantId || 'default';
      const [userSnap, branchSnap, deptSnap, locSnap, shiftSnap, reqSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'branches')),
        getDocs(collection(db, 'departments')),
        getDocs(collection(db, 'workLocations')),
        getDocs(collection(db, 'workShifts')),
        getDocs(collection(db, 'hrRequests')),
      ]);
      let tenantUsers = userSnap.docs
        .map((d) => ({ ...(d.data() as UserData), uid: d.id }))
        .filter((u) => (u.tenantId || 'default') === tid);

      try {
        const { migrated } = await migrateTenantEmployeeIds(tenantUsers);
        if (migrated > 0) {
          const refreshed = await getDocs(collection(db, 'users'));
          tenantUsers = refreshed.docs
            .map((d) => ({ ...(d.data() as UserData), uid: d.id }))
            .filter((u) => (u.tenantId || 'default') === tid);
        }
      } catch (e) {
        console.warn('[Users] employee ID migration skipped', e);
      }

      setUsers(tenantUsers);
      setHrRequests(reqSnap.docs.map((d) => ({ ...(d.data() as HrRequest), id: d.id })));
      setBranches(
        branchSnap.docs
          .map((d) => ({ ...(d.data() as Branch), id: d.id }))
          .filter((b) => b.active !== false && (b.tenantId || 'default') === tid)
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setDepartments(
        deptSnap.docs
          .map((d) => ({ ...(d.data() as Department), id: d.id }))
          .filter((d) => d.active !== false && (d.tenantId || 'default') === tid)
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setWorkLocations(
        locSnap.docs
          .map((d) => ({ ...(d.data() as WorkLocation), id: d.id }))
          .filter((loc) => loc.active !== false && (loc.tenantId || 'default') === tid)
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setWorkShifts(
        shiftSnap.docs
          .map((d) => ({ ...(d.data() as WorkShift), id: d.id }))
          .filter((s) => s.active !== false && (s.tenantId || 'default') === tid)
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    } finally {
      setLoading(false);
    }
  }, [user?.tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleWorkLocation = (id: string) => {
    setWorkLocationIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const resetForm = () => {
    setFullName('');
    setJobTitle('');
    setPhone('');
    setEmail('');
    setNewPassword('');
    setConfirmPassword('');
    setCurrentPassword('');
    setTargetCurrentPassword('');
    setManagerId('');
    setBranchId('');
    setDepartmentId('');
    setWorkLocationIds([]);
    setWorkShiftId('');
    setAnnualLeaveAllowance(String(ANNUAL_LEAVE_ALLOWANCE));
    setLeaveBalanceAdjustment('0');
    setEditUsedVacation(0);
    setCreateRole('employee');
  };

  const openCreate = () => {
    setEditing(null);
    resetForm();
    setCreating(true);
  };

  const autoEmployeeId = useMemo(
    () => nextEmployeeId(users.map((u) => u.employeeId)),
    [users],
  );

  const createEmployee = async () => {
    if (!fullName.trim()) {
      showAlert(t('missing'), t('fullName'));
      return;
    }
    const nextEmail = email.trim().toLowerCase();
    if (!nextEmail) {
      showAlert(t('missingEmail'), t('emailRequired'));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      showAlert(t('error'), t('invalidEmailFormat'));
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      showAlert(t('weakPassword'), t('passwordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      showAlert(t('passwordMismatchTitle'), t('passwordsMismatch'));
      return;
    }
    let empId: string;
    try {
      empId = nextEmployeeId(users.map((u) => u.employeeId));
    } catch (e: any) {
      showAlert(t('error'), e?.message || t('actionFailed'));
      return;
    }
    setSaving(true);
    try {
      const tid = user?.tenantId || 'default';
      const tenantDoc = await getTenantById(tid);
      const max = tenantDoc?.maxUsers;
      if (max && max > 0) {
        const used = await countTenantUsers(tid);
        if (used >= max) {
          showAlert(t('error'), t('seatLimitReached'));
          setSaving(false);
          return;
        }
      }
      const branch = branches.find((b) => b.id === branchId);
      const dept = departments.find((d) => d.id === departmentId);
      await adminCreateEmployee({
        email: nextEmail,
        password: newPassword,
        fullName,
        employeeId: empId,
        role: createRole,
        tenantId: tid,
        phone,
        jobTitle,
        branchId: branchId || null,
        branchName: branch?.name || null,
        departmentId: departmentId || null,
        department: dept?.name || null,
        managerId: managerId || null,
        workLocationIds,
        workShiftId: workShiftId || null,
        annualLeaveAllowance: (() => {
          const n = Number(annualLeaveAllowance);
          return Number.isFinite(n) && n >= 0 ? Math.floor(n) : ANNUAL_LEAVE_ALLOWANCE;
        })(),
        leaveBalanceAdjustment: (() => {
          const n = Number(leaveBalanceAdjustment);
          return Number.isFinite(n) ? Math.trunc(n) : 0;
        })(),
      });
      setCreating(false);
      resetForm();
      await load();
      showAlert(t('success'), t('userCreated'));
    } catch (e: any) {
      const code = String(e?.code || '');
      let msg = e?.message || t('couldNotCreateUser');
      if (code === 'auth/email-already-in-use') {
        msg = t('emailAlreadyInUse');
      } else if (code === 'auth/invalid-email') {
        msg = t('invalidEmailFormat');
      } else if (code === 'auth/weak-password') {
        msg = t('passwordTooShort');
      } else if (code === 'permission-denied' || /permission/i.test(msg)) {
        msg = t('couldNotCreateUser');
      }
      showAlert(t('error'), msg);
    } finally {
      setSaving(false);
    }
  };

  const setRole = async (uid: string, role: UserRole) => {
    if (uid === user?.uid) {
      showAlert(t('notAllowed'), t('cannotChangeOwnRole'));
      return;
    }
    await updateDoc(doc(db, 'users', uid), { role, updatedAt: Timestamp.now() });
    await load();
  };

  const setActive = async (uid: string, active: boolean) => {
    if (uid === user?.uid) {
      showAlert(t('notAllowed'), t('cannotDeactivateSelf'));
      return;
    }
    await updateDoc(doc(db, 'users', uid), { active, updatedAt: Timestamp.now() });
    await load();
  };

  const saveProfileFields = async () => {
    if (!editing) return;
    const nextEmail = email.trim().toLowerCase();
    if (!nextEmail) {
      showAlert(t('missingEmail'), t('emailRequired'));
      return;
    }
    if (newPassword && newPassword !== confirmPassword) {
      showAlert(t('passwordMismatchTitle'), t('passwordsMismatch'));
      return;
    }
    if (newPassword && newPassword.length < 6) {
      showAlert(t('weakPassword'), t('passwordTooShort'));
      return;
    }

    setSaving(true);
    try {
      const branch = branches.find((b) => b.id === branchId);
      const dept = departments.find((d) => d.id === departmentId);

      const credResult = await adminUpdateUserAuthCredentials({
        targetUid: editing.uid,
        currentEmail: editing.email || '',
        nextEmail,
        nextPassword: newPassword || undefined,
        currentPassword: currentPassword || undefined,
        targetCurrentPassword: targetCurrentPassword || undefined,
      });

      const allowanceNum = Number(annualLeaveAllowance);
      const adjNum = Number(leaveBalanceAdjustment);
      await updateDoc(doc(db, 'users', editing.uid), {
        fullName: fullName.trim() || editing.fullName,
        jobTitle: jobTitle.trim() || null,
        phone: phone.trim() || null,
        email: nextEmail,
        managerId: managerId || null,
        branchId: branchId || null,
        branchName: branch?.name || null,
        departmentId: departmentId || null,
        department: dept?.name || null,
        workLocationIds,
        workShiftId: workShiftId || null,
        annualLeaveAllowance:
          Number.isFinite(allowanceNum) && allowanceNum >= 0
            ? Math.floor(allowanceNum)
            : ANNUAL_LEAVE_ALLOWANCE,
        leaveBalanceAdjustment: Number.isFinite(adjNum) ? Math.trunc(adjNum) : 0,
        updatedAt: Timestamp.now(),
      });

      setEditing(null);
      setNewPassword('');
      setConfirmPassword('');
      setCurrentPassword('');
      setTargetCurrentPassword('');
      await load();
      if (credResult.warning) {
        showAlert(t('savedWithWarning'), credResult.warning);
      } else {
        showAlert(t('success'), t('profileCredentialsUpdated'));
      }
    } catch (e: any) {
      showAlert(t('error'), e?.message || t('couldNotSaveProfile'));
    } finally {
      setSaving(false);
    }
  };

  const changeUserPhoto = async () => {
    if (!editing) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        showAlert(t('permissionNeeded'), t('allowPhotoLibrary'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setPhotoBusy(true);
      const asset = result.assets[0];
      const photoURL = await uploadProfilePhoto(editing.uid, asset.uri, asset.mimeType);
      await updateDoc(doc(db, 'users', editing.uid), {
        photoURL,
        updatedAt: Timestamp.now(),
      });
      setEditing({ ...editing, photoURL });
      await load();
      showAlert(t('success'), t('employeePhotoSaved'));
    } catch (e: any) {
      showAlert(t('error'), e?.message || t('photoUploadFailed'));
    } finally {
      setPhotoBusy(false);
    }
  };

  const resetDevice = async (u: UserData) => {
    if (u.role === 'admin') {
      showAlert(t('warning'), t('deviceLockAdminExempt'));
      return;
    }
    try {
      await updateDoc(doc(db, 'users', u.uid), {
        allowedDeviceId: null,
        deviceBoundAt: null,
        deviceLabel: null,
        updatedAt: Timestamp.now(),
      });
      setEditing((prev) =>
        prev && prev.uid === u.uid
          ? { ...prev, allowedDeviceId: undefined, deviceBoundAt: undefined, deviceLabel: undefined }
          : prev,
      );
      await load();
      showAlert(t('success'), t('deviceResetDone'));
    } catch (e: any) {
      showAlert(t('error'), e?.message || t('actionFailed'));
    }
  };

  const cycleRole = (current: UserRole): UserRole => {
    const idx = ROLES.indexOf(current);
    return ROLES[(idx + 1) % ROLES.length];
  };

  return (
    <View className="flex-1 bg-surface-50">
      <View className="px-6 pt-12 pb-4 bg-white border-b border-surface-100">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-2xl font-bold text-surface-800">{t('usersTitle')}</Text>
            <Text className="text-surface-400 text-sm mt-1">{t('usersSubtitle')}</Text>
          </View>
          <TouchableOpacity
            onPress={openCreate}
            className="bg-primary-500 px-3 h-10 rounded-xl items-center justify-center"
          >
            <Text className="text-white font-semibold text-sm">{t('addUser')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {creating && (
        <ScrollView className="mx-4 mt-4 max-h-[560px]">
          <View className="bg-white rounded-2xl p-4 border border-surface-100">
            <Text className="font-semibold text-surface-800 mb-3">{t('addUserTitle')}</Text>
            <TextInput
              className="border border-surface-200 rounded-xl px-3 h-11 mb-2"
              placeholder={t('fullName')}
              value={fullName}
              onChangeText={setFullName}
            />
            <Text className="text-xs text-surface-400 mb-1">{t('employeeId')}</Text>
            <View className="border border-surface-200 bg-surface-50 rounded-xl px-3 h-11 mb-1 justify-center">
              <Text className="text-surface-800 font-semibold tracking-wider">{autoEmployeeId}</Text>
            </View>
            <Text className="text-[10px] text-surface-400 mb-2">{t('employeeIdAutoHint')}</Text>
            <TextInput
              className="border border-surface-200 rounded-xl px-3 h-11 mb-2"
              placeholder={t('emailLogin')}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              className="border border-surface-200 rounded-xl px-3 h-11 mb-2"
              placeholder={t('temporaryPassword')}
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
            />
            <TextInput
              className="border border-surface-200 rounded-xl px-3 h-11 mb-2"
              placeholder={t('confirmNewPassword')}
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
            <TextInput
              className="border border-surface-200 rounded-xl px-3 h-11 mb-2"
              placeholder={t('jobTitle')}
              value={jobTitle}
              onChangeText={setJobTitle}
            />
            <TextInput
              className="border border-surface-200 rounded-xl px-3 h-11 mb-2"
              placeholder={t('phone')}
              value={phone}
              onChangeText={setPhone}
            />

            <Text className="text-xs text-surface-400 mb-1">{t('role')}</Text>
            <View className="flex-row flex-wrap mb-2">
              {(['employee', 'manager'] as UserRole[]).map((r) => (
                <TouchableOpacity
                  key={r}
                  onPress={() => setCreateRole(r)}
                  className={`px-3 py-2 rounded-lg mr-2 mb-2 ${
                    createRole === r ? 'bg-primary-500' : 'bg-surface-100'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      createRole === r ? 'text-white' : 'text-surface-600'
                    }`}
                  >
                    {roleLabel(r)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text className="text-xs text-surface-400 mb-1">{t('branch')}</Text>
            <View className="flex-row flex-wrap mb-2">
              <TouchableOpacity
                onPress={() => {
                  setBranchId('');
                  setDepartmentId('');
                }}
                className={`px-3 py-2 rounded-lg mr-2 mb-2 ${
                  !branchId ? 'bg-primary-500' : 'bg-surface-100'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${!branchId ? 'text-white' : 'text-surface-600'}`}
                >
                  {t('none')}
                </Text>
              </TouchableOpacity>
              {branches.map((b) => (
                <TouchableOpacity
                  key={b.id}
                  onPress={() => {
                    setBranchId(b.id);
                    setDepartmentId('');
                  }}
                  className={`px-3 py-2 rounded-lg mr-2 mb-2 ${
                    branchId === b.id ? 'bg-primary-500' : 'bg-surface-100'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      branchId === b.id ? 'text-white' : 'text-surface-600'
                    }`}
                  >
                    {b.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text className="text-xs text-surface-400 mb-1">{t('department')}</Text>
            <View className="flex-row flex-wrap mb-2">
              <TouchableOpacity
                onPress={() => setDepartmentId('')}
                className={`px-3 py-2 rounded-lg mr-2 mb-2 ${
                  !departmentId ? 'bg-primary-500' : 'bg-surface-100'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    !departmentId ? 'text-white' : 'text-surface-600'
                  }`}
                >
                  {t('none')}
                </Text>
              </TouchableOpacity>
              {deptsForBranch.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  onPress={() => setDepartmentId(d.id)}
                  className={`px-3 py-2 rounded-lg mr-2 mb-2 ${
                    departmentId === d.id ? 'bg-primary-500' : 'bg-surface-100'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      departmentId === d.id ? 'text-white' : 'text-surface-600'
                    }`}
                  >
                    {d.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text className="text-xs text-surface-400 mb-1">{t('manager')}</Text>
            <View className="flex-row flex-wrap mb-3">
              <TouchableOpacity
                onPress={() => setManagerId('')}
                className={`px-3 py-2 rounded-lg mr-2 mb-2 ${
                  !managerId ? 'bg-primary-500' : 'bg-surface-100'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    !managerId ? 'text-white' : 'text-surface-600'
                  }`}
                >
                  {t('none')}
                </Text>
              </TouchableOpacity>
              {managers.map((m) => (
                <TouchableOpacity
                  key={m.uid}
                  onPress={() => setManagerId(m.uid)}
                  className={`px-3 py-2 rounded-lg mr-2 mb-2 ${
                    managerId === m.uid ? 'bg-primary-500' : 'bg-surface-100'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      managerId === m.uid ? 'text-white' : 'text-surface-600'
                    }`}
                  >
                    {m.fullName}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text className="text-xs text-surface-400 mb-1">{t('workLocations')}</Text>
            <Text className="text-xs text-surface-400 mb-2">{t('workLocationsHint')}</Text>
            <View className="flex-row flex-wrap mb-3">
              {workLocations.length === 0 ? (
                <Text className="text-xs text-surface-400 mb-2">{t('noLocationsYet')}</Text>
              ) : (
                workLocations.map((loc) => {
                  const selected = workLocationIds.includes(loc.id);
                  return (
                    <TouchableOpacity
                      key={loc.id}
                      onPress={() => toggleWorkLocation(loc.id)}
                      className={`px-3 py-2 rounded-lg mr-2 mb-2 ${
                        selected ? 'bg-primary-500' : 'bg-surface-100'
                      }`}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          selected ? 'text-white' : 'text-surface-600'
                        }`}
                      >
                        {loc.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>

            <Text className="text-xs text-surface-400 mb-1">{t('assignedShift')}</Text>
            <Text className="text-xs text-surface-400 mb-2">{t('assignedShiftHint')}</Text>
            <View className="flex-row flex-wrap mb-3">
              <TouchableOpacity
                onPress={() => setWorkShiftId('')}
                className={`px-3 py-2 rounded-lg mr-2 mb-2 ${
                  !workShiftId ? 'bg-primary-500' : 'bg-surface-100'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    !workShiftId ? 'text-white' : 'text-surface-600'
                  }`}
                >
                  {t('companyDefaultShift')}
                </Text>
              </TouchableOpacity>
              {workShifts.length === 0 ? (
                <Text className="text-xs text-surface-400 mb-2">{t('noShiftsYet')}</Text>
              ) : (
                workShifts.map((shift) => {
                  const selected = workShiftId === shift.id;
                  return (
                    <TouchableOpacity
                      key={shift.id}
                      onPress={() => setWorkShiftId(shift.id)}
                      className={`px-3 py-2 rounded-lg mr-2 mb-2 ${
                        selected ? 'bg-primary-500' : 'bg-surface-100'
                      }`}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          selected ? 'text-white' : 'text-surface-600'
                        }`}
                      >
                        {shift.name} ({formatTime12h(shift.workStart)}–{formatTime12h(shift.workEnd)})
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>

            <Text className="text-xs text-surface-400 mb-1">{t('annualLeaveDays')}</Text>
            <TextInput
              className="border border-surface-200 rounded-xl px-3 h-11 mb-2"
              keyboardType="numeric"
              value={annualLeaveAllowance}
              onChangeText={setAnnualLeaveAllowance}
              placeholder={String(ANNUAL_LEAVE_ALLOWANCE)}
            />
            <Text className="text-xs text-surface-400 mb-1">{t('leaveBalanceAdjustment')}</Text>
            <TextInput
              className="border border-surface-200 rounded-xl px-3 h-11 mb-3"
              keyboardType="numeric"
              value={leaveBalanceAdjustment}
              onChangeText={setLeaveBalanceAdjustment}
              placeholder="0"
            />

            <View className="flex-row">
              <TouchableOpacity
                onPress={() => {
                  setCreating(false);
                  resetForm();
                }}
                className="flex-1 bg-surface-100 rounded-xl h-11 items-center justify-center mr-2"
              >
                <Text className="text-surface-600 font-semibold">{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={createEmployee}
                disabled={saving}
                className="flex-1 bg-primary-500 rounded-xl h-11 items-center justify-center"
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-semibold">{t('createUser')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      )}

      {editing && (
        <ScrollView className="mx-4 mt-4 max-h-[520px]">
          <View className="bg-white rounded-2xl p-4 border border-surface-100">
            <Text className="font-semibold text-surface-800 mb-3">
              {t('editUserTitle', { name: editing.fullName })}
            </Text>

            <TouchableOpacity
              onPress={changeUserPhoto}
              className="items-center mb-3"
              disabled={photoBusy}
            >
              {editing.photoURL ? (
                <Image
                  source={{ uri: editing.photoURL }}
                  style={{ width: 72, height: 72, borderRadius: 36 }}
                />
              ) : (
                <View className="w-[72px] h-[72px] rounded-full bg-primary-500 items-center justify-center">
                  <Text className="text-white text-xl font-bold">
                    {editing.fullName.charAt(0)}
                  </Text>
                </View>
              )}
              <Text className="text-primary-500 text-xs font-semibold mt-2">
                {photoBusy ? t('uploading') : t('changePhoto')}
              </Text>
              {photoBusy && <ActivityIndicator className="mt-1" color="#1E3A5F" />}
            </TouchableOpacity>

            <TextInput
              className="border border-surface-200 rounded-xl px-3 h-11 mb-2"
              placeholder={t('fullName')}
              value={fullName}
              onChangeText={setFullName}
            />
            <TextInput
              className="border border-surface-200 rounded-xl px-3 h-11 mb-2"
              placeholder={t('jobTitle')}
              value={jobTitle}
              onChangeText={setJobTitle}
            />
            <TextInput
              className="border border-surface-200 rounded-xl px-3 h-11 mb-2"
              placeholder={t('phone')}
              value={phone}
              onChangeText={setPhone}
            />
            <TextInput
              className="border border-surface-200 rounded-xl px-3 h-11 mb-2"
              placeholder={t('emailLogin')}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              className="border border-surface-200 rounded-xl px-3 h-11 mb-2"
              placeholder={t('newPasswordOptional')}
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
            />
            <TextInput
              className="border border-surface-200 rounded-xl px-3 h-11 mb-2"
              placeholder={t('confirmNewPassword')}
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
            {editing.uid === user?.uid &&
              (newPassword.length > 0 ||
                email.trim().toLowerCase() !== (editing.email || '').toLowerCase()) && (
                <TextInput
                  className="border border-warning-200 rounded-xl px-3 h-11 mb-2 bg-warning-50"
                  placeholder={t('yourCurrentPasswordRequired')}
                  secureTextEntry
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                />
              )}
            {editing.uid !== user?.uid &&
              (newPassword.length > 0 ||
                email.trim().toLowerCase() !== (editing.email || '').toLowerCase()) && (
                <TextInput
                  className="border border-surface-200 rounded-xl px-3 h-11 mb-2"
                  placeholder={t('employeeCurrentPasswordHint')}
                  secureTextEntry
                  value={targetCurrentPassword}
                  onChangeText={setTargetCurrentPassword}
                />
              )}
            <Text className="text-xs text-surface-400 mb-2">{t('passwordLeaveBlankHint')}</Text>
            <Text className="text-xs text-surface-400 mb-1">{t('branch')}</Text>
            <View className="flex-row flex-wrap mb-2">
              <TouchableOpacity
                onPress={() => {
                  setBranchId('');
                  setDepartmentId('');
                }}
                className={`px-3 py-2 rounded-lg mr-2 mb-2 ${
                  !branchId ? 'bg-primary-500' : 'bg-surface-100'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${!branchId ? 'text-white' : 'text-surface-600'}`}
                >
                  {t('none')}
                </Text>
              </TouchableOpacity>
              {branches.map((b) => (
                <TouchableOpacity
                  key={b.id}
                  onPress={() => {
                    setBranchId(b.id);
                    setDepartmentId('');
                  }}
                  className={`px-3 py-2 rounded-lg mr-2 mb-2 ${
                    branchId === b.id ? 'bg-primary-500' : 'bg-surface-100'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      branchId === b.id ? 'text-white' : 'text-surface-600'
                    }`}
                  >
                    {b.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text className="text-xs text-surface-400 mb-1">{t('department')}</Text>
            <View className="flex-row flex-wrap mb-2">
              <TouchableOpacity
                onPress={() => setDepartmentId('')}
                className={`px-3 py-2 rounded-lg mr-2 mb-2 ${
                  !departmentId ? 'bg-primary-500' : 'bg-surface-100'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    !departmentId ? 'text-white' : 'text-surface-600'
                  }`}
                >
                  {t('none')}
                </Text>
              </TouchableOpacity>
              {deptsForBranch.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  onPress={() => setDepartmentId(d.id)}
                  className={`px-3 py-2 rounded-lg mr-2 mb-2 ${
                    departmentId === d.id ? 'bg-primary-500' : 'bg-surface-100'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      departmentId === d.id ? 'text-white' : 'text-surface-600'
                    }`}
                  >
                    {d.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text className="text-xs text-surface-400 mb-1">{t('manager')}</Text>
            <View className="flex-row flex-wrap mb-3">
              <TouchableOpacity
                onPress={() => setManagerId('')}
                className={`px-3 py-2 rounded-lg mr-2 mb-2 ${
                  !managerId ? 'bg-primary-500' : 'bg-surface-100'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    !managerId ? 'text-white' : 'text-surface-600'
                  }`}
                >
                  {t('none')}
                </Text>
              </TouchableOpacity>
              {managers
                .filter((m) => m.uid !== editing.uid)
                .map((m) => (
                  <TouchableOpacity
                    key={m.uid}
                    onPress={() => setManagerId(m.uid)}
                    className={`px-3 py-2 rounded-lg mr-2 mb-2 ${
                      managerId === m.uid ? 'bg-primary-500' : 'bg-surface-100'
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        managerId === m.uid ? 'text-white' : 'text-surface-600'
                      }`}
                    >
                      {m.fullName}
                    </Text>
                  </TouchableOpacity>
                ))}
            </View>

            <Text className="text-xs text-surface-400 mb-1">{t('workLocations')}</Text>
            <Text className="text-xs text-surface-400 mb-2">{t('workLocationsHint')}</Text>
            <View className="flex-row flex-wrap mb-3">
              {workLocations.length === 0 ? (
                <Text className="text-xs text-surface-400 mb-2">{t('noLocationsYet')}</Text>
              ) : (
                workLocations.map((loc) => {
                  const selected = workLocationIds.includes(loc.id);
                  return (
                    <TouchableOpacity
                      key={loc.id}
                      onPress={() => toggleWorkLocation(loc.id)}
                      className={`px-3 py-2 rounded-lg mr-2 mb-2 ${
                        selected ? 'bg-primary-500' : 'bg-surface-100'
                      }`}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          selected ? 'text-white' : 'text-surface-600'
                        }`}
                      >
                        {loc.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>

            <Text className="text-xs text-surface-400 mb-1">{t('assignedShift')}</Text>
            <Text className="text-xs text-surface-400 mb-2">{t('assignedShiftHint')}</Text>
            <View className="flex-row flex-wrap mb-3">
              <TouchableOpacity
                onPress={() => setWorkShiftId('')}
                className={`px-3 py-2 rounded-lg mr-2 mb-2 ${
                  !workShiftId ? 'bg-primary-500' : 'bg-surface-100'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    !workShiftId ? 'text-white' : 'text-surface-600'
                  }`}
                >
                  {t('companyDefaultShift')}
                </Text>
              </TouchableOpacity>
              {workShifts.length === 0 ? (
                <Text className="text-xs text-surface-400 mb-2">{t('noShiftsYet')}</Text>
              ) : (
                workShifts.map((shift) => {
                  const selected = workShiftId === shift.id;
                  return (
                    <TouchableOpacity
                      key={shift.id}
                      onPress={() => setWorkShiftId(shift.id)}
                      className={`px-3 py-2 rounded-lg mr-2 mb-2 ${
                        selected ? 'bg-primary-500' : 'bg-surface-100'
                      }`}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          selected ? 'text-white' : 'text-surface-600'
                        }`}
                      >
                        {shift.name} ({formatTime12h(shift.workStart)}–{formatTime12h(shift.workEnd)})
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>

            <View className="bg-primary-50 rounded-xl p-3 mb-3 border border-primary-100">
              <Text className="text-xs font-semibold text-primary-700 mb-2">
                {t('vacationLeaveAdminTitle')}
              </Text>
              <Text className="text-xs text-surface-500 mb-2">{t('vacationLeaveAdminHint')}</Text>
              <Text className="text-xs text-surface-400 mb-1">{t('annualLeaveDays')}</Text>
              <TextInput
                className="border border-surface-200 rounded-xl px-3 h-11 mb-2 bg-white"
                keyboardType="numeric"
                value={annualLeaveAllowance}
                onChangeText={setAnnualLeaveAllowance}
                placeholder={String(ANNUAL_LEAVE_ALLOWANCE)}
              />
              <Text className="text-xs text-surface-400 mb-1">{t('leaveBalanceAdjustment')}</Text>
              <TextInput
                className="border border-surface-200 rounded-xl px-3 h-11 mb-2 bg-white"
                keyboardType="numeric"
                value={leaveBalanceAdjustment}
                onChangeText={setLeaveBalanceAdjustment}
                placeholder="0"
              />
              <Text className="text-xs text-surface-500 mb-1">
                {t('vacationUsedThisYear', { days: editUsedVacation })}
              </Text>
              <Text className="text-sm font-semibold text-primary-700">
                {t('vacationRemainingPreview', {
                  days: computeRemainingVacation(
                    Number.isFinite(Number(annualLeaveAllowance))
                      ? Math.max(0, Math.floor(Number(annualLeaveAllowance)))
                      : ANNUAL_LEAVE_ALLOWANCE,
                    editUsedVacation,
                    Number.isFinite(Number(leaveBalanceAdjustment))
                      ? Math.trunc(Number(leaveBalanceAdjustment))
                      : 0,
                  ),
                })}
              </Text>
            </View>

            {editing.role !== 'admin' && (
              <View className="bg-surface-50 rounded-xl p-3 mb-3">
                <Text className="text-xs font-semibold text-surface-500 mb-1">
                  {t('boundDevice')}
                </Text>
                <Text className="text-sm text-surface-700 mb-2">
                  {editing.allowedDeviceId
                    ? editing.deviceLabel || t('deviceBoundAnonymous')
                    : t('deviceNotBound')}
                </Text>
                {!!editing.allowedDeviceId && (
                  <TouchableOpacity
                    onPress={() => resetDevice(editing)}
                    className="bg-warning-50 border border-warning-200 rounded-xl h-11 items-center justify-center"
                  >
                    <Text className="text-warning-700 font-semibold">{t('resetDevice')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <View className="flex-row">
              <TouchableOpacity
                onPress={() => setEditing(null)}
                className="flex-1 bg-surface-100 rounded-xl h-11 items-center justify-center mr-2"
              >
                <Text className="text-surface-600 font-semibold">{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={saveProfileFields}
                disabled={saving}
                className="flex-1 bg-primary-500 rounded-xl h-11 items-center justify-center"
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-semibold">{t('save')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      )}

      <FlatList
        data={users}
        keyExtractor={(item) => item.uid}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => {
          const mgr = users.find((u) => u.uid === item.managerId);
          const shift = workShifts.find((s) => s.id === item.workShiftId);
          return (
            <View className="bg-white rounded-xl p-4 mb-3 border border-surface-100">
              <View className="flex-row items-center">
                {item.photoURL ? (
                  <Image
                    source={{ uri: item.photoURL }}
                    style={{ width: 40, height: 40, borderRadius: 20, marginRight: 10 }}
                  />
                ) : (
                  <View className="w-10 h-10 rounded-full bg-primary-100 items-center justify-center mr-2.5">
                    <Text className="text-primary-500 font-bold">{item.fullName.charAt(0)}</Text>
                  </View>
                )}
                <View className="flex-1">
                  <Text className="font-semibold text-surface-800">{item.fullName}</Text>
                  <Text className="text-surface-500 text-sm">
                    {item.employeeId} · {item.email}
                  </Text>
                </View>
              </View>
              <Text className="text-surface-400 text-sm mt-2">
                {roleLabel(item.role)} ·{' '}
                {item.active === false ? t('inactiveStatus') : t('activeStatus')}
                {item.branchName ? ` · ${item.branchName}` : ''}
                {item.department ? ` · ${item.department}` : ''}
              </Text>
              {!!shift && (
                <Text className="text-surface-400 text-xs mt-1">
                  {t('shiftNamed', {
                    name: shift.name,
                    hours: `${formatTime12h(shift.workStart)}–${formatTime12h(shift.workEnd)}`,
                  })}
                </Text>
              )}
              {!!mgr && (
                <Text className="text-surface-400 text-xs mt-1">
                  {t('managerNamed', { name: mgr.fullName })}
                </Text>
              )}
              <View className="flex-row flex-wrap mt-3">
                <TouchableOpacity
                  onPress={() => setRole(item.uid, cycleRole(item.role || 'employee'))}
                  className="bg-primary-50 px-3 py-2 rounded-lg mr-2 mb-2"
                >
                  <Text className="text-primary-500 text-xs font-semibold">
                    {t('roleCycle', { role: roleLabel(cycleRole(item.role || 'employee')) })}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setActive(item.uid, item.active === false)}
                  className="bg-warning-50 px-3 py-2 rounded-lg mr-2 mb-2"
                >
                  <Text className="text-warning-600 text-xs font-semibold">
                    {item.active === false ? t('activate') : t('deactivate')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setCreating(false);
                    setEditing(item);
                    setFullName(item.fullName || '');
                    setJobTitle(item.jobTitle || '');
                    setPhone(item.phone || '');
                    setEmail(item.email || '');
                    setNewPassword('');
                    setConfirmPassword('');
                    setCurrentPassword('');
                    setTargetCurrentPassword('');
                    setManagerId(item.managerId || '');
                    setBranchId(item.branchId || '');
                    setDepartmentId(item.departmentId || '');
                    setWorkLocationIds(
                      Array.isArray(item.workLocationIds) ? item.workLocationIds : [],
                    );
                    setWorkShiftId(item.workShiftId || '');
                    setAnnualLeaveAllowance(
                      String(resolveAnnualLeaveAllowance(item)),
                    );
                    setLeaveBalanceAdjustment(
                      String(resolveLeaveBalanceAdjustment(item)),
                    );
                    setEditUsedVacation(
                      vacationUsedInYear(hrRequests, item.uid, new Date().getFullYear()),
                    );
                  }}
                  className="bg-surface-100 px-3 py-2 rounded-lg mb-2"
                >
                  <Text className="text-surface-600 text-xs font-semibold">{t('editProfile')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}
