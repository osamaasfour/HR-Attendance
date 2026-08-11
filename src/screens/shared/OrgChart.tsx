/**
 * Organization chart — Company → Branches → Departments → Employees
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
} from 'react-native';
import {
  db,
  collection,
  getDocs,
  addDoc,
  Timestamp,
} from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import { useAppAlert } from '../../context/AlertContext';
import { useCompany } from '../../context/CompanyContext';
import { useLanguage } from '../../context/LanguageContext';
import type { Branch, Department, UserData } from '../../types';

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
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['company']));

  const [newBranch, setNewBranch] = useState('');
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptBranchId, setNewDeptBranchId] = useState('');
  const [editCompany, setEditCompany] = useState(company.name);

  useEffect(() => {
    setCompanyName(company.name);
    setEditCompany(company.name);
  }, [company.name]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await refreshCompany();
      const [branchSnap, deptSnap, userSnap] = await Promise.all([
        getDocs(collection(db, 'branches')),
        getDocs(collection(db, 'departments')),
        getDocs(collection(db, 'users')),
      ]);

      const branchList = branchSnap.docs
        .map((d) => ({ ...(d.data() as Branch), id: d.id }))
        .filter(
          (b) =>
            b.active !== false &&
            ((b as any).tenantId || 'default') === tenantId,
        )
        .sort((a, b) => a.name.localeCompare(b.name));
      setBranches(branchList);

      const deptList = deptSnap.docs
        .map((d) => ({ ...(d.data() as Department), id: d.id }))
        .filter(
          (d) =>
            d.active !== false &&
            ((d as any).tenantId || 'default') === tenantId,
        )
        .sort((a, b) => a.name.localeCompare(b.name));
      setDepartments(deptList);

      const userList = userSnap.docs
        .map((d) => ({ ...(d.data() as UserData), uid: d.id }))
        .filter(
          (u) => u.active !== false && (u.tenantId || 'default') === tenantId,
        )
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
    await addDoc(collection(db, 'branches'), {
      name,
      companyId: COMPANY_DOC,
      tenantId: user?.tenantId || 'default',
      active: true,
      createdAt: Timestamp.now(),
    });
    setNewBranch('');
    await load();
  };

  const addDepartment = async () => {
    const name = newDeptName.trim();
    if (!name || !newDeptBranchId) {
      showAlert(t('missing'), t('selectBranch'));
      return;
    }
    await addDoc(collection(db, 'departments'), {
      name,
      branchId: newDeptBranchId,
      tenantId: user?.tenantId || 'default',
      active: true,
      createdAt: Timestamp.now(),
    });
    setNewDeptName('');
    await load();
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
                className="bg-primary-500 px-4 rounded-xl justify-center"
              >
                <Text className="text-white font-semibold text-sm">{t('add')}</Text>
              </TouchableOpacity>
            </View>
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
                  <TouchableOpacity
                    onPress={() => toggle(bKey)}
                    className="flex-row items-center bg-white border border-surface-100 rounded-xl mb-2 py-3 px-3"
                    style={{ marginLeft: 16 }}
                  >
                    <Text className="text-surface-400 w-5 text-center">
                      {expanded.has(bKey) ? '▾' : '▸'}
                    </Text>
                    <View className="flex-1 ml-2">
                      <Text className="font-semibold text-surface-800">{branch.name}</Text>
                      <Text className="text-surface-400 text-xs">{t('branch')}</Text>
                    </View>
                  </TouchableOpacity>

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
                          <TouchableOpacity
                            onPress={() => toggle(dKey)}
                            className="flex-row items-center bg-white border border-surface-100 rounded-xl mb-2 py-3 px-3"
                            style={{ marginLeft: 32 }}
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
