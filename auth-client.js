import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  getRedirectResult,
  linkWithCredential,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js';
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  updateDoc
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';
import { auth, db } from './firebase-client.js';
const persistenceReady = setPersistence(auth, browserLocalPersistence);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

const PROFILE_EDIT_FIELDS = [
  'name', 'division', 'rollNo', 'prn',
  'whatsapp', 'telegram', 'bio', 'avatar', 'electives', 'profileSetupComplete'
];
const profileSeeds = new Map();
const profileFlights = new Map();
let currentProfile = null;
let currentUser = null;
let currentProfileError = '';
let iframeReady = false;
let pendingGoogleOutcome = null;
let pendingGoogleCredential = null;
let pendingGoogleEmail = '';
let authStatePromiseResolve;
const authStateReady = new Promise(resolve => { authStatePromiseResolve = resolve; });

function plainProfile(profile) {
  if (!profile) return null;
  const result = {};
  for (const key of [
    'uid', 'email', 'name', 'course', 'studentClass', 'division', 'rollNo',
    'prn', 'whatsapp', 'telegram', 'bio', 'avatar', 'electives', 'role',
    'emailVerified', 'profileSetupComplete'
  ]) if (profile[key] !== undefined) result[key] = profile[key];
  return result;
}

function publicUser(user) {
  return user ? {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || '',
    photoURL: user.photoURL || '',
    emailVerified: Boolean(user.emailVerified)
  } : null;
}

function progressFor(uid) {
  try {
    return { focus: JSON.parse(localStorage.getItem('vishHubFocusV1:' + uid) || '{"goal":3,"days":{}}') };
  } catch (_) {
    return { focus: { goal: 3, days: {} } };
  }
}

function sendToOnboarding(message) {
  const frame = document.querySelector('#studentProfilePage .uploaded-auth-frame');
  if (!frame?.contentWindow) return;
  // file:// pages have an opaque origin. Only use '*' for that local preview;
  // the receiver still verifies the exact iframe window and message source.
  const targetOrigin = window.location.origin === 'null' ? '*' : window.location.origin;
  frame.contentWindow.postMessage({ source: 'vish-hub-firebase', ...message }, targetOrigin);
}

function emitAuthState(user, profile, initial = false, error = null) {
  currentUser = user || null;
  currentProfile = profile || null;
  currentProfileError = error ? (error.message || 'Could not load your student profile.') : '';
  const detail = {
    user: user || null,
    profile: plainProfile(profile),
    progress: user ? progressFor(user.uid) : { focus: { goal: 3, days: {} } },
    initial,
    emailVerified: Boolean(user?.emailVerified),
    profileSetupComplete: Boolean(profile?.profileSetupComplete),
    profileError: currentProfileError
  };
  window.dispatchEvent(new CustomEvent('vishhub-auth-state', { detail }));
  sendToOnboarding({
    type: 'auth-session',
    user: publicUser(user),
    profile: plainProfile(profile),
    initial,
    profileError: currentProfileError
  });
}

function firebaseMessage(error) {
  const messages = {
    'auth/email-already-in-use': 'An account already exists for this email. Try logging in.',
    'auth/account-exists-with-different-credential': 'An account already uses this email. Sign in with that method first, then connect Google.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/user-disabled': 'This account is disabled. Contact support.',
    'auth/weak-password': 'Choose a stronger password with at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Wait a little and try again.',
    'auth/network-request-failed': 'Connection problem. Check your internet and try again.',
    'auth/popup-closed-by-user': 'Google sign-in was closed before it finished.',
    'auth/popup-blocked': 'The Google sign-in popup was blocked. Allow popups and try again.',
    'auth/unauthorized-domain': 'This site is not authorized in Firebase Authentication. Add its domain in Firebase Console.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled in Firebase Console.',
    'permission-denied': 'Your profile was blocked by Firestore. The deployed rules may be outdated; ask the project owner to publish the reviewed rules.',
    'verification-required': 'Verify your email before continuing. Check your inbox, then refresh verification status.'
  };
  if (error?.code === 'auth/user-not-found') return 'If this email is registered, a reset link has been sent.';
  return messages[error?.code] || error?.message || 'Authentication could not be completed. Please try again.';
}

async function assertVerified(user) {
  if (!user) throw new Error('Sign in to continue.');
  await reload(user);
  if (!user.emailVerified) {
    const error = new Error('verification-required');
    error.code = 'verification-required';
    throw error;
  }
  await user.getIdToken(true);
}

async function ensureStudentProfile(user, seed = {}) {
  await assertVerified(user);
  if (profileFlights.has(user.uid)) return profileFlights.get(user.uid);
  const task = (async () => {
    const ref = doc(db, 'users', user.uid);
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) {
      const defaults = profileSeeds.get(user.uid) || {};
      const profile = {
        uid: user.uid,
        email: user.email || '',
        name: user.displayName || defaults.name || seed.name || 'Student',
        role: 'Student',
        emailVerified: true,
        profileSetupComplete: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      const contactNumber = defaults.whatsapp || seed.whatsapp;
      if (typeof contactNumber === 'string' && contactNumber.trim()) {
        profile.whatsapp = contactNumber.trim();
      }
      await runTransaction(db, async transaction => {
        const fresh = await transaction.get(ref);
        if (!fresh.exists()) transaction.set(ref, profile);
      });
      profileSeeds.delete(user.uid);
      return (await getDoc(ref)).data();
    }

    const profile = snapshot.data();
    const patch = {};
    // Repair legacy student documents into the minimal rule-enforced identity shape.
    // UID and role are mandatory for ownership/authorization, but are never inferred
    // from client input; this path derives both from the verified Firebase session.
    if (!Object.prototype.hasOwnProperty.call(profile, 'uid')) patch.uid = user.uid;
    if (!Object.prototype.hasOwnProperty.call(profile, 'role')) patch.role = 'Student';
    if (profile.email !== (user.email || '')) patch.email = user.email || '';
    if (profile.emailVerified !== true) patch.emailVerified = true;
    if ((!profile.name || profile.name === 'Student') && (user.displayName || seed.name)) {
      patch.name = user.displayName || seed.name;
    }
    if (Object.keys(patch).length) {
      patch.updatedAt = serverTimestamp();
      await updateDoc(ref, patch);
      return { ...profile, ...patch, updatedAt: new Date() };
    }
    return profile;
  })();
  profileFlights.set(user.uid, task);
  try { return await task; } finally { profileFlights.delete(user.uid); }
}

function authResult(user, profile, flow, extra = {}) {
  return { user: publicUser(user), profile: plainProfile(profile), flow, ...extra };
}

async function createAccount({ email, password, name, whatsapp }) {
  await persistenceReady;
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const user = credential.user;
  profileSeeds.set(user.uid, { name, whatsapp });
  if (name) await updateProfile(user, { displayName: name });
  let emailVerificationSent = false;
  let verificationNotice = '';
  try {
    await sendEmailVerification(user);
    emailVerificationSent = true;
  } catch (error) {
    verificationNotice = firebaseMessage(error);
  }
  emitAuthState(user, null, false);
  return authResult(user, null, 'signup', { verificationRequired: true, emailVerificationSent, verificationNotice });
}

async function finishVerifiedSignIn(user, { isNewUser = false, seed = {} } = {}) {
  await assertVerified(user);
  const profile = await ensureStudentProfile(user, seed);
  const flow = isNewUser ? 'signup' : (!profile.profileSetupComplete ? 'setup' : 'login');
  emitAuthState(user, profile, false);
  return authResult(user, profile, flow, { verificationRequired: false });
}

async function signInWithEmail({ email, password }) {
  await persistenceReady;
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const user = credential.user;
  await reload(user);
  if (!user.emailVerified) {
    emitAuthState(user, null, false);
    return authResult(user, null, 'verification', { verificationRequired: true });
  }

  // A pending Google credential is kept in memory only and linked after proof of the existing password.
  if (pendingGoogleCredential) {
    const expectedEmail = (pendingGoogleEmail || pendingGoogleCredential.email || '').toLowerCase();
    if (!expectedEmail || expectedEmail !== (user.email || '').toLowerCase()) {
      pendingGoogleCredential = null;
      pendingGoogleEmail = '';
      throw new Error('Google could not be linked safely. Sign in to your account and try Google linking again.');
    }
    if (!user.providerData.some(provider => provider.providerId === 'password')) {
      pendingGoogleCredential = null;
      pendingGoogleEmail = '';
      throw new Error('This account does not have an email password to verify ownership.');
    }
    await linkWithCredential(user, pendingGoogleCredential);
    pendingGoogleCredential = null;
    pendingGoogleEmail = '';
    await reload(user);
  }
  return finishVerifiedSignIn(user);
}

async function signInWithGoogle() {
  await persistenceReady;
  try {
    const credential = await signInWithPopup(auth, googleProvider);
    const user = credential.user;
    await reload(user);
    if (!user.emailVerified) {
      emitAuthState(user, null, false);
      return authResult(user, null, 'verification', { verificationRequired: true });
    }
    return finishVerifiedSignIn(user, { isNewUser: Boolean(getAdditionalUserInfo(credential)?.isNewUser) });
  } catch (error) {
    if (error?.code === 'auth/account-exists-with-different-credential') {
      pendingGoogleCredential = GoogleAuthProvider.credentialFromError(error);
      const email = error.customData?.email || pendingGoogleCredential?.email || '';
      pendingGoogleEmail = email;
      const conflict = new Error(email
        ? `An account already uses ${email}. Sign in with its email and password to connect Google.`
        : 'An account already uses this email. Sign in with its email and password to connect Google.');
      conflict.code = error.code;
      throw conflict;
    }
    if (error?.code !== 'auth/popup-blocked') throw error;
    sessionStorage.setItem('vishHubGoogleRedirectPending', '1');
    await signInWithRedirect(auth, googleProvider);
    return { redirecting: true };
  }
}

async function refreshVerification() {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in again before checking email verification.');
  await reload(user);
  if (!user.emailVerified) throw Object.assign(new Error('Your email is not verified yet. Open the verification email, then try again.'), { code: 'verification-required' });
  await user.getIdToken(true);
  if (pendingGoogleCredential) {
    if (!pendingGoogleEmail || pendingGoogleEmail.toLowerCase() !== (user.email || '').toLowerCase()) {
      pendingGoogleCredential = null;
      pendingGoogleEmail = '';
      throw new Error('Google could not be linked safely. Sign in to your account and try Google linking again.');
    }
    if (!user.providerData.some(provider => provider.providerId === 'password')) {
      throw new Error('This account does not have an email password to verify ownership.');
    }
    await linkWithCredential(user, pendingGoogleCredential);
    pendingGoogleCredential = null;
    pendingGoogleEmail = '';
    await reload(user);
  }
  const profile = await ensureStudentProfile(user);
  const flow = profile.profileSetupComplete ? 'login' : 'setup';
  emitAuthState(user, profile, false);
  return authResult(user, profile, flow, { verificationRequired: false });
}

async function saveStudentProfile(profile) {
  const user = auth.currentUser;
  await assertVerified(user);
  const ref = doc(db, 'users', user.uid);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) throw new Error('Student profile is missing. Sign in again.');
  const updates = {};
  for (const key of PROFILE_EDIT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(profile, key)) updates[key] = profile[key];
  }
  const existingProfile = snapshot.data();
  // Legacy documents may predate the canonical UID and Student role fields.
  // Only fill missing values; never replace a stored identity or role.
  if (!Object.prototype.hasOwnProperty.call(existingProfile, 'uid')) updates.uid = user.uid;
  if (!Object.prototype.hasOwnProperty.call(existingProfile, 'role')) updates.role = 'Student';
  // Keep account-owned identity fields in sync when saving an older profile
  // that predates email verification metadata or has a stale email address.
  updates.email = user.email || '';
  updates.emailVerified = true;
  if (!Object.prototype.hasOwnProperty.call(updates, 'profileSetupComplete')) {
    updates.profileSetupComplete = Boolean(existingProfile.profileSetupComplete);
  }
  updates.updatedAt = serverTimestamp();
  await updateDoc(ref, updates);
  const saved = await getDoc(ref);
  currentProfile = saved.data();
  emitAuthState(user, currentProfile, false);
  return plainProfile(currentProfile);
}

async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    if (error?.code === 'auth/user-not-found' || error?.code === 'auth/invalid-email') return { sent: true };
    throw error;
  }
  return { sent: true };
}

async function resendVerification() {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in first to resend the verification email.');
  await reload(user);
  if (user.emailVerified) return { sent: false, alreadyVerified: true };
  await sendEmailVerification(user);
  return { sent: true };
}

window.vishHubAuth = Object.freeze({
  saveProfile: saveStudentProfile,
  signOut: () => firebaseSignOut(auth),
  getCurrentUser: () => auth.currentUser,
  getCurrentProfile: () => plainProfile(currentProfile),
  ready: authStateReady
});

async function handleAuthRequest(message) {
  await persistenceReady;
  switch (message.action) {
    case 'email-signup': return createAccount(message.payload || {});
    case 'email-login': return signInWithEmail(message.payload || {});
    case 'google-sign-in': return signInWithGoogle();
    case 'password-reset': return resetPassword(message.payload?.email || '');
    case 'resend-verification': return resendVerification();
    case 'refresh-verification': return refreshVerification();
    case 'save-student-profile': return { profile: await saveStudentProfile(message.payload || {}) };
    default: throw new Error('Unknown authentication request.');
  }
}

window.addEventListener('message', async event => {
  const frame = document.querySelector('#studentProfilePage .uploaded-auth-frame');
  if (!frame || event.source !== frame.contentWindow || event.origin !== window.location.origin) return;
  const message = event.data;
  if (message?.source !== 'vish-hub-onboarding') return;

  if (message.type === 'ready') {
    iframeReady = true;
    await authStateReady;
    sendToOnboarding({ type: 'auth-session', user: publicUser(currentUser), profile: plainProfile(currentProfile), initial: true, profileError: currentProfileError });
    if (pendingGoogleOutcome) {
      sendToOnboarding({ type: 'google-outcome', ...pendingGoogleOutcome });
      pendingGoogleOutcome = null;
    }
    return;
  }

  if (message.type !== 'auth-request' || !message.requestId) return;
  try {
    const result = await handleAuthRequest(message);
    sendToOnboarding({ type: 'auth-result', requestId: message.requestId, ok: true, result });
  } catch (error) {
    sendToOnboarding({ type: 'auth-result', requestId: message.requestId, ok: false, error: firebaseMessage(error) });
  }
});

let initialAuthCheck = true;
let authStateSequence = 0;
onAuthStateChanged(auth, async user => {
  const sequence = ++authStateSequence;
  const initial = initialAuthCheck;
  initialAuthCheck = false;
  let profile = null;
  let failure = null;
  try {
    await persistenceReady;
    if (sequence !== authStateSequence) return;
    if (user) {
      await reload(user);
      if (sequence !== authStateSequence || auth.currentUser?.uid !== user.uid) return;
      if (user.emailVerified) profile = await ensureStudentProfile(user);
    }
  } catch (error) {
    failure = error;
  }
  if (sequence !== authStateSequence || (user && auth.currentUser?.uid !== user.uid)) return;
  authStatePromiseResolve?.();
  authStatePromiseResolve = null;
  emitAuthState(user, profile, initial, failure);
});

(async () => {
  try { await persistenceReady; } catch (_) { return; }
  if (sessionStorage.getItem('vishHubGoogleRedirectPending') !== '1') return;
  try {
    const credential = await getRedirectResult(auth);
    if (credential) {
      const user = credential.user;
      await reload(user);
      if (!user.emailVerified) {
        emitAuthState(user, null, false);
        pendingGoogleOutcome = { ok: true, user: publicUser(user), profile: null, flow: 'verification', verificationRequired: true };
      } else {
        const result = await finishVerifiedSignIn(user, { isNewUser: Boolean(getAdditionalUserInfo(credential)?.isNewUser) });
        pendingGoogleOutcome = { ok: true, ...result };
      }
    }
  } catch (error) {
    if (error?.code === 'auth/account-exists-with-different-credential') {
      pendingGoogleCredential = GoogleAuthProvider.credentialFromError(error);
      pendingGoogleEmail = error.customData?.email || pendingGoogleCredential?.email || '';
    }
    pendingGoogleOutcome = { ok: false, error: firebaseMessage(error) };
  } finally {
    sessionStorage.removeItem('vishHubGoogleRedirectPending');
    if (iframeReady && pendingGoogleOutcome) {
      sendToOnboarding({ type: 'google-outcome', ...pendingGoogleOutcome });
      pendingGoogleOutcome = null;
    }
  }
})();
