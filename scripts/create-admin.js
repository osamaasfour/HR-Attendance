/**
 * One-off: create admin user oasfour77@gmail.com
 * Run: node scripts/create-admin.js
 */
const { initializeApp } = require('firebase/app');
const {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} = require('firebase/auth');
const {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  Timestamp,
} = require('firebase/firestore');

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

const EMAIL = 'oasfour77@gmail.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'AdminHr2026!';
const FULL_NAME = 'Omar Asfour';
const EMPLOYEE_ID = 'EMP001';

async function main() {
  for (const key of Object.keys(firebaseConfig)) {
    if (!firebaseConfig[key]) {
      throw new Error(`Missing env: ${key}`);
    }
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  let uid;
  try {
    const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
    uid = cred.user.uid;
    console.log('Created Auth user:', uid);
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      console.log('Auth user already exists — signing in…');
      const cred = await signInWithEmailAndPassword(auth, EMAIL, PASSWORD);
      uid = cred.user.uid;
    } else {
      throw err;
    }
  }

  const userRef = doc(db, 'users', uid);
  const existing = await getDoc(userRef);

  if (!existing.exists()) {
    await setDoc(userRef, {
      uid,
      email: EMAIL,
      fullName: FULL_NAME,
      role: 'admin',
      employeeId: EMPLOYEE_ID,
      createdAt: Timestamp.now(),
    });
    console.log('Created Firestore profile with role=admin');
  } else {
    await updateDoc(userRef, { role: 'admin', fullName: FULL_NAME, employeeId: EMPLOYEE_ID });
    console.log('Updated existing profile to role=admin');
  }

  const verified = await getDoc(userRef);
  console.log('Profile:', JSON.stringify(verified.data(), null, 2));
  console.log('DONE');
  console.log('EMAIL=' + EMAIL);
  console.log('PASSWORD=' + PASSWORD);
  process.exit(0);
}

main().catch((err) => {
  console.error('FAILED:', err.code || '', err.message);
  process.exit(1);
});
