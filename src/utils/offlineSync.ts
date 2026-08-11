/**
 * Offline Storage Utility for Pending Attendance Punches
 *
 * When the device is offline (no network connectivity), attendance punches
 * are stored locally in AsyncStorage. When the network returns, these pending
 * punches are synced to Firestore.
 *
 * This ensures employees can clock in/out even in areas with poor signal.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PendingPunch } from '../types';

const PENDING_PUNCHES_KEY = '@hr_attendance_pending_punches';

/* ------------------------------------------------------------------ */
/*  Store a Pending Punch                                              */
/* ------------------------------------------------------------------ */

/**
 * Saves a punch to local storage when offline.
 * Each punch gets a unique ID based on timestamp + userId.
 */
export async function storePendingPunch(punch: PendingPunch): Promise<void> {
  try {
    const existing = await getPendingPunches();
    const newPunch = {
      ...punch,
      id: `${Date.now()}_${punch.userId}`,
    };
    existing.push(newPunch);
    await AsyncStorage.setItem(PENDING_PUNCHES_KEY, JSON.stringify(existing));
    console.log('[Offline] Pending punch stored:', newPunch.id);
  } catch (error) {
    console.error('[Offline] Failed to store pending punch:', error);
  }
}

/* ------------------------------------------------------------------ */
/*  Retrieve All Pending Punches                                       */
/* ------------------------------------------------------------------ */

export async function getPendingPunches(): Promise<(PendingPunch & { id: string })[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_PUNCHES_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (error) {
    console.error('[Offline] Failed to retrieve pending punches:', error);
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Remove a Synced Punch                                              */
/* ------------------------------------------------------------------ */

/**
 * Removes a specific pending punch after it has been successfully synced to Firestore.
 */
export async function removePendingPunch(id: string): Promise<void> {
  try {
    const existing = await getPendingPunches();
    const filtered = existing.filter((p) => p.id !== id);
    await AsyncStorage.setItem(PENDING_PUNCHES_KEY, JSON.stringify(filtered));
    console.log('[Offline] Pending punch removed after sync:', id);
  } catch (error) {
    console.error('[Offline] Failed to remove pending punch:', error);
  }
}

/* ------------------------------------------------------------------ */
/*  Clear All Pending Punches                                          */
/* ------------------------------------------------------------------ */

export async function clearPendingPunches(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_PUNCHES_KEY);
    console.log('[Offline] All pending punches cleared');
  } catch (error) {
    console.error('[Offline] Failed to clear pending punches:', error);
  }
}

/* ------------------------------------------------------------------ */
/*  Get Pending Punch Count                                            */
/* ------------------------------------------------------------------ */

export async function getPendingPunchCount(): Promise<number> {
  const punches = await getPendingPunches();
  return punches.length;
}
