import {
  GoogleAuthProvider,
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';
import { auth, db } from '../firebase-client.js';

const $ = selector => document.querySelector(selector);
const authGate = $('#authGate');
const deniedGate = $('#deniedGate');
const adminLayout = $('#adminLayout');
const authMessage = $('#authMessage');
const loginButton = $('#loginButton');
const googleButton = $('#googleButton');
let activeAdmin = null;
let authCheckSequence = 0;

function setMessage(message, kind = '') {
  authMessage.textContent = message;
  authMessage.className = `status-message${kind ? ` is-${kind}` : ''}`;
}

function friendlyAuthError(error) {
  const messages = {
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/user-disabled': 'This account is disabled.',
    'auth/too-many-requests': 'Too many attempts. Wait a little and try again.',
    'auth/network-request-failed': 'Connection problem. Check your network and try again.',
    'auth/popup-closed-by-user': 'Google sign-in was closed before it finished.',
    'auth/popup-blocked': 'The Google sign-in popup was blocked. Allow popups and try again.',
    'auth/unauthorized-domain': 'This domain is not authorized in Firebase Authentication.',
    'auth/account-exists-with-different-credential': 'This email already uses another sign-in method. Sign in with that method before using Google.'
  };
  return messages[error?.code] || 'Sign-in could not be completed. Check your account and try again.';
}

function displayName(user) {
  return user?.displayName?.trim() || user?.email?.split('@')[0] || 'Administrator';
}

function updateAccountControls(user) {
  const name = displayName(user);
  const initial = name.slice(0, 1).toUpperCase() || 'A';
  $('#sidebarName').textContent = name;
  $('#sidebarEmail').textContent = user.email || 'Verified Admin account';
  $('#topName').textContent = name;
  $('#menuName').textContent = name;
  $('#menuEmail').textContent = user.email || 'Email not available';
  $('#menuUid').textContent = `UID · ${user.uid}`;
  $('#welcomeName').textContent = name.split(/[\s@._-]/)[0] || 'Administrator';
  $('#sidebarAvatar').textContent = initial;
  $('#topAvatar').textContent = initial;
}

function setGate(view) {
  authGate.hidden = view !== 'auth';
  deniedGate.hidden = view !== 'denied';
  adminLayout.hidden = view !== 'admin';
}

async function assertTrustedAdmin(user) {
  if (!user) return false;
  await user.reload();
  if (!user.emailVerified) return false;
  const token = await user.getIdTokenResult(true);
  return token.claims.admin === true;
}

function renderStats(data) {
  const metrics = ['totalStudents', 'resourceCount', 'storageObjects', 'actionsToday'];
  let available = false;
  for (const key of metrics) {
    const value = data?.[key];
    const target = document.querySelector(`[data-stat="${key}"]`);
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      target.textContent = new Intl.NumberFormat().format(value);
      available = true;
    } else {
      target.textContent = '—';
    }
  }
  document.querySelectorAll('[data-stat-source]').forEach(node => {
    node.textContent = available ? 'Trusted server summary' : 'Awaiting trusted summary';
  });
  $('#statsNotice').hidden = available;
}

function formatEventTime(value) {
  if (!value || typeof value.toDate !== 'function') return 'Time unavailable';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata'
  }).format(value.toDate());
}

function createActivityItem(data) {
  const item = document.createElement('li');
  item.className = 'activity-item';
  const icon = document.createElement('span');
  icon.className = 'activity-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = typeof data.action === 'string' ? data.action.slice(0, 1).toUpperCase() : '•';
  const copy = document.createElement('div');
  copy.className = 'activity-copy';
  const title = document.createElement('strong');
  title.textContent = typeof data.description === 'string' ? data.description : 'Administrative event';
  const actor = document.createElement('span');
  actor.textContent = typeof data.actorEmail === 'string' ? data.actorEmail : 'Trusted server event';
  copy.append(title, actor);
  const time = document.createElement('time');
  time.className = 'activity-time';
  time.textContent = formatEventTime(data.createdAt);
  if (data.createdAt && typeof data.createdAt.toDate === 'function') {
    time.dateTime = data.createdAt.toDate().toISOString();
  }
  item.append(icon, copy, time);
  return item;
}

function renderActivity(snapshots) {
  const list = $('#activityList');
  list.replaceChildren();
  $('#activityLoading').hidden = true;
  $('#activityError').hidden = true;
  $('#activityEmpty').hidden = snapshots.length !== 0;
  for (const snapshot of snapshots) list.append(createActivityItem(snapshot.data()));
}

async function refreshDashboard() {
  const user = auth.currentUser;
  if (!user) return;
  $('#refreshStatus').textContent = 'Refreshing trusted dashboard data…';
  $('#activityLoading').hidden = false;
  $('#activityEmpty').hidden = true;
  $('#activityError').hidden = true;
  try {
    if (!await assertTrustedAdmin(user)) {
      await showDenied(user, 'Admin access has expired or is no longer assigned.');
      return;
    }
    const [summaryResult, activityResult] = await Promise.allSettled([
      getDoc(doc(db, 'admin', 'overview')),
      getDocs(query(collection(db, 'adminActivity'), orderBy('createdAt', 'desc'), limit(6)))
    ]);

    if (summaryResult.status === 'fulfilled') {
      renderStats(summaryResult.value.exists() ? summaryResult.value.data() : null);
    } else {
      renderStats(null);
      $('#statsNotice').hidden = false;
      $('#statsNotice').lastChild.textContent = ' Trusted summary is not available under the current Firestore rules.';
    }

    if (activityResult.status === 'fulfilled') {
      renderActivity(activityResult.value.docs);
    } else {
      $('#activityLoading').hidden = true;
      $('#activityEmpty').hidden = true;
      $('#activityError').hidden = false;
      $('#activityError').textContent = activityResult.reason?.code === 'permission-denied'
        ? 'Activity access is not enabled in the deployed Firestore rules.'
        : 'Activity records could not be loaded.';
      $('#activityList').replaceChildren();
    }
    activeAdmin = user;
    $('#refreshStatus').textContent = 'Dashboard refreshed just now.';
  } catch (error) {
    $('#refreshStatus').textContent = error?.code === 'permission-denied'
      ? 'Admin read access is not enabled in the deployed Firestore rules.'
      : 'Dashboard data could not be refreshed.';
    $('#activityLoading').hidden = true;
  }
}

async function showDenied(user, message = '') {
  activeAdmin = null;
  $('#deniedMessage').textContent = message || (!user.emailVerified
    ? 'A verified email address is required for Admin access.'
    : 'This account does not have the trusted Firebase Admin claim.');
  $('#deniedEmail').textContent = user.email || '';
  setGate('denied');
}

async function acceptUser(user, sequence) {
  if (!user) {
    activeAdmin = null;
    setGate('auth');
    return;
  }
  setGate('auth');
  setMessage('Verifying trusted Admin access…');
  try {
    const allowed = await assertTrustedAdmin(user);
    if (sequence !== authCheckSequence) return;
    if (!allowed) {
      await showDenied(user);
      return;
    }
    activeAdmin = user;
    updateAccountControls(user);
    setGate('admin');
    await refreshDashboard();
  } catch (error) {
    if (sequence !== authCheckSequence) return;
    if (error?.code === 'auth/network-request-failed') {
      setGate('auth');
      setMessage('Could not verify Admin access. Check your connection and retry.');
      return;
    }
    await showDenied(user, 'Admin authorization could not be verified.');
  }
}

$('#loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  loginButton.disabled = true;
  googleButton.disabled = true;
  setMessage('Signing in…');
  try {
    await setPersistence(auth, browserLocalPersistence);
    await signInWithEmailAndPassword(auth, $('#adminEmail').value.trim(), $('#adminPassword').value);
  } catch (error) {
    setMessage(friendlyAuthError(error));
  } finally {
    loginButton.disabled = false;
    googleButton.disabled = false;
  }
});

$('#googleButton').addEventListener('click', async () => {
  googleButton.disabled = true;
  loginButton.disabled = true;
  setMessage('Opening secure Google sign-in…');
  try {
    await setPersistence(auth, browserLocalPersistence);
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (error) {
    setMessage(friendlyAuthError(error));
  } finally {
    googleButton.disabled = false;
    loginButton.disabled = false;
  }
});

async function signOutAdmin() {
  $('#profileMenu').hidden = true;
  $('#profileButton').setAttribute('aria-expanded', 'false');
  try { await signOut(auth); } catch (_) { setMessage('Could not sign out. Try again.'); }
}
$('#sidebarSignOut').addEventListener('click', signOutAdmin);
$('#menuSignOut').addEventListener('click', signOutAdmin);
$('#deniedSignOut').addEventListener('click', signOutAdmin);
$('#refreshOverview').addEventListener('click', refreshDashboard);
$('#refreshActivity').addEventListener('click', refreshDashboard);

$('#profileButton').addEventListener('click', () => {
  const menu = $('#profileMenu');
  menu.hidden = !menu.hidden;
  $('#profileButton').setAttribute('aria-expanded', String(!menu.hidden));
});
document.addEventListener('click', event => {
  if (!event.target.closest('.topbar-right')) {
    $('#profileMenu').hidden = true;
    $('#profileButton').setAttribute('aria-expanded', 'false');
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    $('#profileMenu').hidden = true;
    $('#profileButton').setAttribute('aria-expanded', 'false');
    closeSidebar();
  }
});

const sidebar = $('#adminSidebar');
const sidebarScrim = $('#sidebarScrim');
function closeSidebar() {
  sidebar.classList.remove('is-open');
  sidebarScrim.hidden = true;
  $('#menuToggle').setAttribute('aria-expanded', 'false');
  $('#menuToggle').setAttribute('aria-label', 'Open navigation');
}
$('#menuToggle').addEventListener('click', () => {
  const open = !sidebar.classList.contains('is-open');
  sidebar.classList.toggle('is-open', open);
  sidebarScrim.hidden = !open;
  $('#menuToggle').setAttribute('aria-expanded', String(open));
  $('#menuToggle').setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
});
sidebarScrim.addEventListener('click', closeSidebar);
document.querySelectorAll('.side-link[href^="#"]').forEach(link => link.addEventListener('click', () => {
  document.querySelectorAll('.side-link[data-page]').forEach(item => {
    const selected = item === link;
    item.classList.toggle('active', selected);
    if (selected) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
  closeSidebar();
}));
document.querySelectorAll('[data-scroll-to]').forEach(button => button.addEventListener('click', () => {
  document.getElementById(button.dataset.scrollTo)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}));

$('#todayLabel').textContent = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'full', timeZone: 'Asia/Kolkata'
}).format(new Date());

setPersistence(auth, browserLocalPersistence).then(() => {
  onAuthStateChanged(auth, user => {
    const sequence = ++authCheckSequence;
    void acceptUser(user, sequence);
  });
}).catch(() => {
  setGate('auth');
  setMessage('Firebase session persistence could not be prepared. Reload and try again.');
});
