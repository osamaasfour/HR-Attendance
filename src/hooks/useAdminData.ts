/**
 * useAdminData — live admin dashboard data + date-filtered records
 */

import { useState, useEffect, useCallback } from 'react';
import {
  db,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
} from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { toDateString } from '../utils/time';
import { lastNDateKeys } from '../utils/reportAnalytics';
import type { EmployeeStatus, DailyStats, AttendanceRecord, UserData } from '../types';

export function useAdminData(selectedDate?: string) {
  const { user } = useAuth();
  const tenantId = user?.tenantId || 'default';
  const dateKey = selectedDate || toDateString();
  const [employees, setEmployees] = useState<EmployeeStatus[]>([]);
  const [stats, setStats] = useState<DailyStats>({
    totalEmployees: 0,
    checkedInCount: 0,
    absentCount: 0,
    halfDayCount: 0,
  });
  const [todayRecords, setTodayRecords] = useState<AttendanceRecord[]>([]);
  const [weekRecords, setWeekRecords] = useState<AttendanceRecord[]>([]);
  const [allUsers, setAllUsers] = useState<UserData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const mergeData = useCallback(
    (users: UserData[], records: AttendanceRecord[]) => {
      const workforce = users.filter(
        (u) =>
          (u.role === 'employee' || u.role === 'manager') &&
          u.active !== false &&
          (u.tenantId || 'default') === tenantId,
      );
      const statuses: EmployeeStatus[] = workforce.map((u) => ({
        uid: u.uid,
        fullName: u.fullName || 'Unknown',
        employeeId: u.employeeId || '—',
        isCheckedIn: false,
        clockInTime: undefined,
      }));

      const clockedInUids = new Set<string>();
      records.forEach((record) => {
        const emp = statuses.find((e) => e.uid === record.userId);
        if (emp && record.clockIn && !record.clockOut) {
          emp.isCheckedIn = true;
          emp.clockInTime = record.clockIn?.toDate?.();
          clockedInUids.add(record.userId);
        }
      });

      setEmployees(statuses);
      setTodayRecords(records);
      setStats({
        totalEmployees: workforce.length,
        checkedInCount: clockedInUids.size,
        absentCount: Math.max(0, workforce.length - records.filter((r) => r.clockIn).length),
        halfDayCount: records.filter((r) => r.status === 'half-day').length,
      });
    },
    [tenantId],
  );

  const fetchUsers = useCallback(async () => {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const users = usersSnapshot.docs
      .map((d) => ({ ...(d.data() as UserData), uid: d.id }))
      .filter((u) => (u.tenantId || 'default') === tenantId);
    setAllUsers(users);
    return users;
  }, [tenantId]);

  const fetchWeekRecords = useCallback(async () => {
    const start = lastNDateKeys(7)[0];
    const weekQuery = query(
      collection(db, 'attendance'),
      where('date', '>=', start),
      where('date', '<=', dateKey),
    );
    const snap = await getDocs(weekQuery);
    const records = snap.docs
      .map((docSnap) => ({
        ...(docSnap.data() as AttendanceRecord),
        id: docSnap.id,
      }))
      .filter((a) => (a.tenantId || 'default') === tenantId || !a.tenantId);
    setWeekRecords(records);
  }, [dateKey, tenantId]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const users = await fetchUsers();
      const attendanceQuery = query(
        collection(db, 'attendance'),
        where('date', '==', dateKey),
      );
      const attendanceSnapshot = await getDocs(attendanceQuery);
      const records = attendanceSnapshot.docs.map((docSnap) => ({
        ...(docSnap.data() as AttendanceRecord),
        id: docSnap.id,
      }));
      mergeData(users, records);
      await fetchWeekRecords();
    } catch (error) {
      console.error('[Admin] Failed to fetch data:', error);
    } finally {
      setIsRefreshing(false);
      setIsLoading(false);
    }
  }, [dateKey, fetchUsers, mergeData, fetchWeekRecords]);

  useEffect(() => {
    let unsub = () => {};
    let cancelled = false;

    (async () => {
      try {
        const users = await fetchUsers();
        if (cancelled) return;
        const attendanceQuery = query(
          collection(db, 'attendance'),
          where('date', '==', dateKey),
        );
        unsub = onSnapshot(
          attendanceQuery,
          (snapshot) => {
            const records = snapshot.docs.map((docSnap) => ({
              ...(docSnap.data() as AttendanceRecord),
              id: docSnap.id,
            }));
            mergeData(users, records);
            setIsLoading(false);
            fetchWeekRecords().catch(() => {});
          },
          (error) => {
            console.error('[Admin] Snapshot error:', error);
            setIsLoading(false);
          },
        );
      } catch (error) {
        console.error('[Admin] Init error:', error);
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      unsub();
    };
  }, [dateKey, fetchUsers, mergeData, fetchWeekRecords]);

  return {
    employees,
    stats,
    todayRecords,
    weekRecords,
    allUsers,
    isLoading,
    isRefreshing,
    refresh,
    selectedDate: dateKey,
  };
}
