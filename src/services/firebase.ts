/**
 * Firebase Configuration Module
 *
 * Uses Firebase Modular SDK v10+ (tree-shakeable imports).
 * All sensitive keys are loaded from the .env file via react-native-dotenv.
 * Never hardcode API keys in production.
 */

import { Platform } from 'react-native';
import { initializeApp, getApp, getApps } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  getReactNativePersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  updateEmail,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  type User,
  type UserCredential,
  type Auth,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  addDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
  GeoPoint,
  enableIndexedDbPersistence,
  deleteField,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';

/* ------------------------------------------------------------------ */
/*  Environment Variables (injected by react-native-dotenv babel plugin) */
/* ------------------------------------------------------------------ */
import {
  FIREBASE_API_KEY,
  FIREBASE_AUTH_DOMAIN,
  FIREBASE_PROJECT_ID,
  FIREBASE_STORAGE_BUCKET,
  FIREBASE_MESSAGING_SENDER_ID,
  FIREBASE_APP_ID,
} from '@env';

/* ------------------------------------------------------------------ */
/*  Firebase App Initialization                                        */
/* ------------------------------------------------------------------ */

const firebaseConfig = {
  apiKey: FIREBASE_API_KEY,
  authDomain: FIREBASE_AUTH_DOMAIN,
  projectId: FIREBASE_PROJECT_ID,
  storageBucket: FIREBASE_STORAGE_BUCKET,
  messagingSenderId: FIREBASE_MESSAGING_SENDER_ID,
  appId: FIREBASE_APP_ID,
};

/**
 * Initialize the Firebase app. Uses `getApps()` to prevent
 * re-initialization in React Fast Refresh during development.
 */
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export { app };

/* ------------------------------------------------------------------ */
/*  Auth Instance                                                       */
/* ------------------------------------------------------------------ */

function createAuth(): Auth {
  if (Platform.OS === 'web') {
    return getAuth(app);
  }

  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    // Fast Refresh / hot reload — auth already initialized
    return getAuth(app);
  }
}

export const auth = createAuth();

/* ------------------------------------------------------------------ */
/*  Storage Instance                                                    */
/* ------------------------------------------------------------------ */

export const storage = getStorage(app);

/* ------------------------------------------------------------------ */
/*  Firestore Instance (with Offline Persistence)                       */
/* ------------------------------------------------------------------ */

export const db = getFirestore(app);

/**
 * Enable offline data persistence (web IndexedDB only).
 * React Native uses memory/default cache; IndexedDB APIs are unavailable.
 */
if (Platform.OS === 'web') {
  enableIndexedDbPersistence(db).catch((error: unknown) => {
    const msg = error instanceof Error ? error.message : String(error);

    if (msg.includes('already-in-use')) {
      console.log('[Firebase] Offline persistence already active');
    } else if (msg.includes('multiple-tabs')) {
      console.log('[Firebase] Multi-tab persistence not supported');
    } else {
      console.warn('[Firebase] Persistence error:', msg);
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Firestore References                                                */
/* ------------------------------------------------------------------ */

/** Users collection reference */
export const usersCollection = collection(db, 'users');

/** Attendance collection reference */
export const attendanceCollection = collection(db, 'attendance');

/* ------------------------------------------------------------------ */
/*  Exported Firebase Services                                          */
/* ------------------------------------------------------------------ */

export {
  initializeApp,
  getApp,
  getApps,
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  updateEmail,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  addDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
  GeoPoint,
  deleteField,
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  getFunctions,
  httpsCallable,
};

export type { User, UserCredential, DocumentData, QueryDocumentSnapshot };
