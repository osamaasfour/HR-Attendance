/**
 * Update Firebase Auth email/password for a user.
 * - Self: client Auth SDK (reauthenticate)
 * - Other users: Cloud Function (Admin SDK), else secondary Auth session
 *   using the employee's current password, else password-reset email fallback
 */
import {
  initializeApp,
  deleteApp,
  getApps,
} from 'firebase/app';
import {
  getAuth as getFirebaseAuth,
  signInWithEmailAndPassword as secondarySignIn,
  signOut as secondarySignOut,
  updateEmail as secondaryUpdateEmail,
  updatePassword as secondaryUpdatePassword,
} from 'firebase/auth';
import {
  app,
  auth,
  updateEmail,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  getFunctions,
  httpsCallable,
} from '../services/firebase';

export type CredentialUpdateResult = {
  authUpdated: boolean;
  warning?: string;
};

async function updateOtherUserViaSecondary(params: {
  currentEmail: string;
  targetCurrentPassword: string;
  nextEmail: string;
  nextPassword?: string;
}): Promise<void> {
  const name = `admin-cred-${Date.now()}`;
  // Reuse primary app options so we don't re-export @env (breaks react-native-dotenv)
  const secondary = initializeApp({ ...app.options }, name);
  const secondaryAuth = getFirebaseAuth(secondary);
  try {
    const cred = await secondarySignIn(
      secondaryAuth,
      params.currentEmail.trim(),
      params.targetCurrentPassword,
    );
    const user = cred.user;
    const emailChanged =
      params.nextEmail.trim().toLowerCase() !== params.currentEmail.trim().toLowerCase();
    if (emailChanged) {
      await secondaryUpdateEmail(user, params.nextEmail.trim().toLowerCase());
    }
    if (params.nextPassword) {
      await secondaryUpdatePassword(user, params.nextPassword);
    }
    await secondarySignOut(secondaryAuth);
  } finally {
    try {
      await deleteApp(secondary);
    } catch {
      /* ignore */
    }
    getApps();
  }
}

export async function adminUpdateUserAuthCredentials(params: {
  targetUid: string;
  currentEmail: string;
  nextEmail: string;
  nextPassword?: string;
  /** Current password of the signed-in admin (when editing self) */
  currentPassword?: string;
  /** Current password of the employee (secondary Auth path for other users) */
  targetCurrentPassword?: string;
}): Promise<CredentialUpdateResult> {
  const email = params.nextEmail.trim().toLowerCase();
  const password = params.nextPassword?.trim() || '';
  const emailChanged = email !== params.currentEmail.trim().toLowerCase();
  const passwordSet = password.length > 0;

  if (!emailChanged && !passwordSet) {
    return { authUpdated: false };
  }

  if (passwordSet && password.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Enter a valid email address.');
  }

  const isSelf = auth.currentUser?.uid === params.targetUid;

  if (isSelf && auth.currentUser) {
    if (!params.currentPassword) {
      throw new Error('Enter your current password to change login email or password.');
    }
    const cred = EmailAuthProvider.credential(
      auth.currentUser.email || params.currentEmail,
      params.currentPassword,
    );
    await reauthenticateWithCredential(auth.currentUser, cred);
    if (emailChanged) {
      await updateEmail(auth.currentUser, email);
    }
    if (passwordSet) {
      await updatePassword(auth.currentUser, password);
    }
    return { authUpdated: true };
  }

  // Prefer Cloud Function (force update without knowing old password)
  try {
    const fn = httpsCallable(getFunctions(app, 'us-central1'), 'adminUpdateUserAuth');
    await fn({
      uid: params.targetUid,
      email: emailChanged ? email : undefined,
      password: passwordSet ? password : undefined,
    });
    return { authUpdated: true };
  } catch (e: any) {
    const code = String(e?.code || '');
    const msg = String(e?.message || e);
    const functionMissing =
      code.includes('not-found') ||
      code.includes('functions/not-found') ||
      code.includes('unavailable') ||
      msg.toLowerCase().includes('not found') ||
      msg.toLowerCase().includes('cors') ||
      msg.toLowerCase().includes('internal');

    if (!functionMissing) {
      throw new Error(msg.replace(/^Firebase:\s*/i, '') || 'Could not update login credentials.');
    }
  }

  // Secondary session: admin must know the employee's current password
  if (params.targetCurrentPassword) {
    await updateOtherUserViaSecondary({
      currentEmail: params.currentEmail,
      targetCurrentPassword: params.targetCurrentPassword,
      nextEmail: email,
      nextPassword: passwordSet ? password : undefined,
    });
    return { authUpdated: true };
  }

  // Password-only fallback: send reset email (cannot force-set without Admin SDK)
  if (passwordSet && !emailChanged) {
    await sendPasswordResetEmail(auth, params.currentEmail.trim());
    return {
      authUpdated: false,
      warning:
        'Profile saved. A password reset email was sent to the employee (force-set requires Cloud Function or their current password).',
    };
  }

  if (emailChanged) {
    return {
      authUpdated: false,
      warning:
        'Profile email saved in Firestore, but Auth login email was not changed. Enter the employee’s current password below and save again, or deploy the Cloud Function.',
    };
  }

  return { authUpdated: false };
}
