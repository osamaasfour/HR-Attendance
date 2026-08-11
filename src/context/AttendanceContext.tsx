/**
 * AttendanceContext — shared attendance state for Home + History
 */

import React, { createContext, useContext, type ReactNode } from 'react';
import { useAttendance } from '../hooks/useAttendance';

type AttendanceContextType = ReturnType<typeof useAttendance>;

const AttendanceContext = createContext<AttendanceContextType | undefined>(undefined);

export function AttendanceProvider({ children }: { children: ReactNode }) {
  const value = useAttendance();
  return (
    <AttendanceContext.Provider value={value}>{children}</AttendanceContext.Provider>
  );
}

export function useAttendanceContext(): AttendanceContextType {
  const ctx = useContext(AttendanceContext);
  if (!ctx) {
    throw new Error('useAttendanceContext must be used within AttendanceProvider');
  }
  return ctx;
}
