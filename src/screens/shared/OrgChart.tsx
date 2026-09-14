/**
 * Organization chart — Company → Branches → Departments → Employees
 * Tenant admins can add / edit / delete branches & departments for their company.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Image,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  db,
  collection,
  addDoc,
  doc,
  updateDoc,
  Timestamp,
} from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import { useAppAlert } from '../../context/AlertContext';
import { useCompany } from '../../context/CompanyContext';
import { useLanguage } from '../../context/LanguageContext';
import type { Branch, Department, UserData } from '../../types';
import { loadTenantRecords } from '../../utils/tenantScope';
import { colors } from '../../constants/colors';

type EmpNode = UserData;
type DeptNode = Department & { employees: EmpNode[] };
type BranchNode = Branch & { departments: DeptNode[] };

const COMPANY_DOC = 'main';

export default function OrgChartScreen() {
  const { user } = useAuth();
  const { showAlert } = useAppAlert();
  const { t } = useLanguage();
  const { company, saveCompany: persistCompany, refresh: refreshCompany } = useCompany();
  const isAdmin = user?.role === 'admin';
  const tenantId = user?.tenantId || 'default';

  const [companyName, setCompanyName] = useState(company.name);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['company']));

  const [newBranch, setNewBranch] = useState('');
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptBranchId, setNewDeptBranchId] = useState('');
  const [editCompany, setEditCompany] = useState(company.name);

  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [editBranchName, setEditBranchName] = useState('');
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [editDeptName, setEditDeptName] = useState('');
  const [editDeptBranchId, setEditDeptBranchId] = useState('');

  useEffect(() => {
    setCompanyName(company.name);
    setEditCompany(company.name);
  }, [company.name]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await refreshCompany();
      const [branchListRaw, deptListRaw, userListRaw] = await Promise.all([
        loadTenantRecords<Branch>('branches', tenantId),
        loadTenantRecords<Department>('departments', tenantId),
        loadTenantRecords<UserData>('users', tenantId, 'uid'),
      ]);

      const branchList = branchListRaw
        .filter((b) => b.active !== false)
        .sort((a, b) => a.name.localeCompare(b.name));
      setBranches(branchList);

      const deptList = deptListRaw
        .filter((d) => d.active !== false)
        .sort((a, b) => a.name.localeCompare(b.name));
      setDepartments(deptList);

      const userList = userListRaw
        .filter((u) => u.active !== false)
        .sort((a, b) => a.fullName.localeCompare(b.fullName));
      setUsers(userList);

      setExpanded(
        new Set(['company', ...branchList.map((b) => `b-${b.id}`), ...deptList.map((d) => `d-${d.id}`)]),
      );
    } finally {
      setLoading(false);
    }
  }, [refreshCompany, tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const tree: BranchNode[] = useMemo(() => {
    return branches.map((branch) => {
      const depts = departments
        .filter((d) => d.branchId === branch.id)
        .map((dept) => ({
          ...dept,
          employees: users.filter((u) => u.departmentId === dept.id),
        }));
      return { ...branch, departments: depts };
    });
  }, [branches, departments, users]);

  const unassigned = useMemo(
    () =>
      users.filter(
        (u) => !u.departmentId || !departments.some((d) => d.id === u.departmentId),
      ),
    [users, departments],
  );

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onSaveCompanyName = async () => {
    const name = editCompany.trim();
    if (!name) return;
    await persistCompany({ name });
    setCompanyName(name);
    showAlert(t('success'), t('companyNameSaved'));
  };

  const addBranch = async () => {
    const name = newBranch.trim();
    if (!name) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'branches'), {
        name,
        companyId: COMPANY_DOC,
        tenantId,
        active: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      setNewBranch('');
      await load();
    } catch (e: any) {
      showAlert(t('error'), e?.message || t('actionFailed'));
    } finally {
      setSaving(false);
    }
  };

  const addDepartment = async () => {
    const name = newDeptName.trim();
    if (!name || !newDeptBranchId) {
      showAlert(t('missing'), t('selectBranch'));
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, 'departments'), {
        name,
        branchId: newDeptBranchId,
        tenantId,
        active: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      setNewDeptName('');
      await load();
    } catch (e: any) {
      showAlert(t('error'), e?.message || t('actionFailed'));
    } finally {
      setSaving(false);
    }
  };

  const openEditBranch = (branch: Branch) => {
    setEditingDept(null);
    setEditingBranch(branch);
    setEditBranchName(branch.name);
  };

  const openEditDept = (dept: Department) => {
    setEditingBranch(null);
    setEditingDept(dept);
    setEditDeptName(dept.name);
    setEditDeptBranchId(dept.branchId);
  };

  const saveBranchEdit = async () => {
    if (!editingBranch) return;
    const name = editBranchName.trim();
    if (!name) {
      showAlert(t('missing'), t('branchName'));
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'branches', editingBranch.id), {
        name,
        updatedAt: Timestamp.now(),
      });
      setEditingBranch(null);
      setEditBranchName('');
      await load();
      showAlert(t('success'), t('branchSaved'));
    } catch (e: any) {
      showAlert(t('error'), e?.message || t('actionFailed'));
    } finally {
      setSaving(false);
    }
  };

  const saveDeptEdit = async () => {
    if (!editingDept) return;
    const name = editDeptName.trim();
    if (!name || !editDeptBranchId) {
      showAlert(t('missing'), t('selectBranch'));
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'departments', editingDept.id), {
        name,
        branchId: editDeptBranchId,
        updatedAt: Timestamp.now(),
      });
      setEditingDept(null);
      setEditDeptName('');
      setEditDeptBranchId('');
      await load();
      showAlert(t('success'), t('departmentSaved'));
    } catch (e: any) {
      showAlert(t('error'), e?.message || t('actionFailed'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteBranch = (branch: Branch) => {
    showAlert(t('deleteBranchTitle'), t('deleteBranchConfirm', { name: branch.name }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setSaving(true);
            try {
              const childDepts = departments.filter((d) => d.branchId === branch.id);
              await Promise.all([
                updateDoc(doc(db, 'branches', branch.id), {
                  active: false,
                  updatedAt: Timestamp.now(),
                }),
                ...childDepts.map((d) =>
                  updateDoc(doc(db, 'departments', d.id), {
                    active: false,
                    updatedAt: Timestamp.now(),
                  }),
                ),
              ]);
              if (editingBranch?.id === branch.id) setEditingBranch(null);
              if (editingDept && childDepts.some((d) => d.id === editingDept.id)) {
                setEditingDept(null);
              }
              await load();
              showAlert(t('success'), t('branchDeleted'));
            } catch (e: any) {
              showAlert(t('error'), e?.message || t('actionFailed'));
            } finally {
              setSaving(false);
            }
          })();
        },
      },
    ]);
  };

  const confirmDeleteDept = (dept: Department) => {
    showAlert(t('deleteDepartmentTitle'), t('deleteDepartmentConfirm', { name: dept.name }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setSaving(true);
            try {
              await updateDoc(doc(db, 'departments', dept.id), {
                active: false,
                updatedAt: Timestamp.now(),
              });
              if (editingDept?.id === dept.id) setEditingDept(null);
              await load();
              showAlert(t('success'), t('departmentDeleted'));
            } catch (e: any) {
              showAlert(t('error'), e?.message || t('actionFailed'));
            } finally {
              setSaving(false);
            }
          })();
        },
      },
    ]);
  };

  const q = search.trim().toLowerCase();
  const matchesUser = (u: UserData) =>
    !q ||
    u.fullName.toLowerCase().includes(q) ||
    u.employeeId?.toLowerCase().includes(q) ||
    u.department?.toLowerCase().includes(q) ||
    u.branchName?.toLowerCase().includes(q);

  return (
    <View className="flex-1 bg-surface-50">
      <View className="px-6 pt-12 pb-4 bg-white border-b border-surface-100">
        <Text className="text-2xl font-bold text-surface-800">{t('organization')}</Text>
        <Text className="text-surface-400 text-sm mt-1">
          {t('orgSubtitle')} · {t('peopleCount', { count: users.length })}
        </Text>
        <TextInput
          className="mt-3 border border-surface-200 rounded-xl px-3 h-11 bg-surface-50"
          placeholder={t('searchPeople')}
          value={search}
          onChangeText={setSearch}
          placeholderTextColor="#CBD5E1"
        />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        {isAdmin && (
          <View className="bg-white rounded-2xl p-4 mb-4 border border-surface-100">
            <Text className="font-semibold text-surface-800 mb-2">{t('manageStructure')}</Text>
            <Text className="text-xs text-surface-400 mb-1">{t('companyName')}</Text>
            <View className="flex-row mb-3">
              <TextInput
                className="flex-1 border border-surface-200 rounded-xl px-3 h-11 mr-2"
                value={editCompany}
                onChangeText={setEditCompany}
              />
              <TouchableOpacity
                onPress={onSaveCompanyName}
                className="bg-primary-500 px-4 rounded-xl justify-center"
              >
                <Text className="text-white font-semibold text-sm">{t('save')}</Text>
              </TouchableOpacity>
            </View>

            <Text className="text-xs text-surface-400 mb-1">{t('addBranch')}</Text>
            <View className="flex-row mb-3">
              <TextInput
                className="flex-1 border border-surface-200 rounded-xl px-3 h-11 mr-2"
                placeholder={t('branchName')}
                value={newBranch}
                onChangeText={setNewBranch}
              />
              <TouchableOpacity
                onPress={addBranch}
                disabled={saving}
                className="bg-primary-500 px-4 rounded-xl justify-center"
              >
                <Text className="text-white font-semibold text-sm">{t('add')}</Text>
              </TouchableOpacity>
            </View>

            <Text className="text-xs text-surface-400 mb-1">{t('addDepartment')}</Text>
            <View className="flex-row flex-wrap mb-2">
              {branches.map((b) => (
                <TouchableOpacity
                  key={b.id}
                  onPress={() => setNewDeptBranchId(b.id)}
                  className={`px-3 py-2 rounded-lg mr-2 mb-2 ${
                    newDeptBranchId === b.id ? 'bg-primary-500' : 'bg-surface-100'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      newDeptBranchId === b.id ? 'text-white' : 'text-surface-600'
                    }`}
                  >
                    {b.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View className="flex-row">
              <TextInput
                className="flex-1 border border-surface-200 rounded-xl px-3 h-11 mr-2"
                placeholder={t('departmentName')}
                value={newDeptName}
                onChangeText={setNewDeptName}
              />
              <TouchableOpacity
                onPress={addDepartment}
                disabled={saving}
                className="bg-primary-500 px-4 rounded-xl justify-center"
              >
                <Text className="text-white font-semibold text-sm">{t('add')}</Text>
              </TouchableOpacity>
            </View>

            {editingBranch && (
              <View className="mt-4 pt-3 border-t border-surface-100">
                <Text className="font-semibold text-surface-800 mb-2">{t('editBranch')}</Text>
                <TextInput
                  className="border border-surface-200 rounded-xl px-3 h-11 mb-2"
                  value={editBranchName}
                  onChangeText={setEditBranchName}
                  placeholder={t('branchName')}
                />
                <View className="flex-row">
                  <TouchableOpacity
                    onPress={() => setEditingBranch(null)}
                    className="flex-1 bg-surface-100 rounded-xl h-11 items-center justify-center mr-2"
                  >
                    <Text className="text-surface-600 font-semibold">{t('cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={saveBranchEdit}
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
            )}

            {editingDept && (
              <View className="mt-4 pt-3 border-t border-surface-100">
                <Text className="font-semibold text-surface-800 mb-2">{t('editDepartment')}</Text>
                <View className="flex-row flex-wrap mb-2">
                  {branches.map((b) => (
                    <TouchableOpacity
                      key={b.id}
                      onPress={() => setEditDeptBranchId(b.id)}
                      className={`px-3 py-2 rounded-lg mr-2 mb-2 ${
                        editDeptBranchId === b.id ? 'bg-primary-500' : 'bg-surface-100'
                      }`}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          editDeptBranchId === b.id ? 'text-white' : 'text-surface-600'
                        }`}
                      >
                        {b.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  className="border border-surface-200 rounded-xl px-3 h-11 mb-2"
                  value={editDeptName}
                  onChangeText={setEditDeptName}
                  placeholder={t('departmentName')}
                />
                <View className="flex-row">
                  <TouchableOpacity
                    onPress={() => setEditingDept(null)}
                    className="flex-1 bg-surface-100 rounded-xl h-11 items-center justify-center mr-2"
                  >
                    <Text className="text-surface-600 font-semibold">{t('cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={saveDeptEdit}
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
            )}
          </View>
        )}

        <TouchableOpacity
          onPress={() => toggle('company')}
          className="flex-row items-center bg-primary-500 rounded-xl mb-2 py-3 px-3"
        >
          <Text className="text-white w-5 text-center">
            {expanded.has('company') ? '▾' : '▸'}
          </Text>
          {!!company.logoUrl && (
            <Image
              source={{ uri: company.logoUrl }}
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                marginLeft: 4,
                backgroundColor: '#fff',
              }}
              resizeMode="contain"
            />
          )}
          <View className="flex-1 ml-2">
            <Text className="font-bold text-white">{companyName}</Text>
            <Text className="text-primary-100 text-xs">
              {t('companySettings')}
              {company.currencyCode ? ` · ${company.currencyCode}` : ''}
              {company.countryCode ? ` · ${company.countryCode}` : ''}
            </Text>
          </View>
        </TouchableOpacity>

        {expanded.has('company') &&
          (tree.length === 0 ? (
            <Text className="text-surface-400 text-sm ml-4 mb-3">
              {isAdmin ? t('noBranches') : t('askAdminBranches')}
            </Text>
          ) : (
            tree.map((branch) => {
              const bKey = `b-${branch.id}`;
              const branchMatch =
                !q ||
                branch.name.toLowerCase().includes(q) ||
                branch.departments.some(
                  (d) =>
                    d.name.toLowerCase().includes(q) || d.employees.some(matchesUser),
                );
              if (!branchMatch) return null;
              return (
                <View key={branch.id}>
                  <View
                    className="flex-row items-center bg-white border border-surface-100 rounded-xl mb-2 py-3 px-3"
                    style={{ marginLeft: 16 }}
                  >
                    <TouchableOpacity
                      onPress={() => toggle(bKey)}
                      className="flex-row items-center flex-1"
                    >
                      <Text className="text-surface-400 w-5 text-center">
                        {expanded.has(bKey) ? '▾' : '▸'}
                      </Text>
                      <View className="flex-1 ml-2">
                        <Text className="font-semibold text-surface-800">{branch.name}</Text>
                        <Text className="text-surface-400 text-xs">{t('branch')}</Text>
                      </View>
                    </TouchableOpacity>
                    {isAdmin && (
                      <View className="flex-row items-center ml-1">
                        <TouchableOpacity
                          onPress={() => openEditBranch(branch)}
                          className="p-2"
                          accessibilityLabel={t('editBranch')}
                        >
                          <MaterialCommunityIcons name="pencil" size={18} color={colors.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => confirmDeleteBranch(branch)}
                          className="p-2"
                          accessibilityLabel={t('delete')}
                        >
                          <MaterialCommunityIcons name="delete-outline" size={18} color={colors.danger} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  {expanded.has(bKey) &&
                    branch.departments.map((dept) => {
                      const dKey = `d-${dept.id}`;
                      const deptMatch =
                        !q ||
                        dept.name.toLowerCase().includes(q) ||
                        dept.employees.some(matchesUser);
                      if (!deptMatch) return null;
                      return (
                        <View key={dept.id}>
                          <View
                            className="flex-row items-center bg-white border border-surface-100 rounded-xl mb-2 py-3 px-3"
                            style={{ marginLeft: 32 }}
                          >
                            <TouchableOpacity
                              onPress={() => toggle(dKey)}
                              className="flex-row items-center flex-1"
                            >
                              <Text className="text-surface-400 w-5 text-center">
                                {expanded.has(dKey) ? '▾' : '▸'}
                              </Text>
                              <View className="flex-1 ml-2">
                                <Text className="font-semibold text-surface-800">{dept.name}</Text>
                                <Text className="text-surface-400 text-xs">
                                  {t('department')} · {t('peopleCount', { count: dept.employees.length })}
                                </Text>
                              </View>
                            </TouchableOpacity>
                            {isAdmin && (
                              <View className="flex-row items-center ml-1">
                                <TouchableOpacity
                                  onPress={() => openEditDept(dept)}
                                  className="p-2"
                                  accessibilityLabel={t('editDepartment')}
                                >
                                  <MaterialCommunityIcons name="pencil" size={18} color={colors.primary} />
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onPress={() => confirmDeleteDept(dept)}
                                  className="p-2"
                                  accessibilityLabel={t('delete')}
                                >
                                  <MaterialCommunityIcons
                                    name="delete-outline"
                                    size={18}
                                    color={colors.danger}
                                  />
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>

                          {expanded.has(dKey) &&
                            dept.employees.filter(matchesUser).map((emp) => (
                              <View
                                key={emp.uid}
                                className="flex-row items-center bg-white border border-surface-100 rounded-xl mb-2 py-3 px-3"
                                style={{ marginLeft: 48 }}
                              >
                                {emp.photoURL ? (
                                  <Image
                                    source={{ uri: emp.photoURL }}
                                    style={{ width: 32, height: 32, borderRadius: 16 }}
                                  />
                                ) : (
                                  <View className="w-8 h-8 rounded-full bg-primary-100 items-center justify-center">
                                    <Text className="text-primary-500 text-xs font-bold">
                                      {emp.fullName.charAt(0)}
                                    </Text>
                                  </View>
                                )}
                                <View className="flex-1 ml-2">
                                  <Text className="font-semibold text-surface-800">
                                    {emp.fullName}
                                  </Text>
                                  <Text className="text-surface-400 text-xs capitalize">
                                    {emp.employeeId} · {emp.role}
                                    {emp.jobTitle ? ` · ${emp.jobTitle}` : ''}
                                  </Text>
                                </View>
                              </View>
                            ))}
                        </View>
                      );
                    })}
                </View>
              );
            })
          ))}

        {unassigned.filter(matchesUser).length > 0 && (
          <View className="mt-4">
            <Text className="font-semibold text-surface-800 mb-2">{t('unassignedEmployees')}</Text>
            {unassigned.filter(matchesUser).map((emp) => (
              <View
                key={emp.uid}
                className="flex-row items-center bg-white border border-dashed border-surface-200 rounded-xl mb-2 py-3 px-3"
              >
                <View className="flex-1">
                  <Text className="font-semibold text-surface-800">{emp.fullName}</Text>
                  <Text className="text-surface-400 text-xs">{t('assignOnUsers')}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
