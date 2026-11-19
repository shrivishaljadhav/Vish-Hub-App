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
let studentRecords = [];
let studentsLoaded = false;
let studentsLoadSequence = 0;

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

function clearStudentDirectory() {
  studentsLoadSequence += 1;
  studentsLoaded = false;
  studentRecords = [];
  $('#studentsTableBody').replaceChildren();
  $('#studentTotal').textContent = '—';
  $('#studentComplete').textContent = '—';
  $('#studentVerified').textContent = '—';
  $('#studentThisMonth').textContent = '—';
  $('#studentsTableWrap').hidden = true;
  $('#exportStudents').disabled = true;
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
  clearStudentDirectory();
  activeAdmin = null;
  $('#deniedMessage').textContent = message || (!user.emailVerified
    ? 'A verified email address is required for Admin access.'
    : 'This account does not have the trusted Firebase Admin claim.');
  $('#deniedEmail').textContent = user.email || '';
  setGate('denied');
}

async function acceptUser(user, sequence) {
  if (!user) {
    clearStudentDirectory();
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
    if (window.location.hash === '#students') await loadStudents();
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
function showAdminPage(page, { scroll = false } = {}) {
  const isStudents = page === 'students';
  $('#overviewPage').hidden = isStudents;
  $('#studentsPage').hidden = !isStudents;
  document.querySelectorAll('.side-link[data-page]').forEach(item => {
    const selected = item.dataset.page === (page === 'activity' ? 'activity' : isStudents ? 'students' : 'overview');
    item.classList.toggle('active', selected);
    if (selected) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
  $('.topbar-title').textContent = isStudents ? 'Student management' : page === 'activity' ? 'Activity log' : 'Management overview';
  if (isStudents) void loadStudents();
  closeSidebar();
  if (scroll && page === 'activity') $('#activity').scrollIntoView({ behavior: 'smooth', block: 'start' });
  else if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('.side-link[data-page], [data-scroll-to="students"]').forEach(link => link.addEventListener('click', event => {
  const page = link.dataset.page || link.dataset.scrollTo;
  if (!page) return;
  event.preventDefault();
  const hash = page === 'activity' ? '#activity' : page === 'students' ? '#students' : '#overview';
  if (window.location.hash !== hash) history.replaceState(null, '', hash);
  showAdminPage(page, { scroll: true });
}));
window.addEventListener('hashchange', () => {
  const hash = window.location.hash.slice(1);
  showAdminPage(hash === 'students' ? 'students' : hash === 'activity' ? 'activity' : 'overview');
});
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

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const dateValue = value => {
  if (value && typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) return date;
  }
  return null;
};
const studentName = profile => typeof profile.name === 'string' && profile.name.trim()
  ? profile.name.trim()
  : (typeof profile.email === 'string' && profile.email.includes('@') ? profile.email.split('@')[0] : 'Student');
const dateFormatter = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' });

function setStudentLoading() {
  $('#studentsLoading').hidden = false;
  $('#studentsError').hidden = true;
  $('#studentsEmpty').hidden = true;
  $('#studentsNoResults').hidden = true;
  $('#studentsTableWrap').hidden = true;
  $('#exportStudents').disabled = true;
}

function profileState(profile) {
  if (typeof profile.profileSetupComplete !== 'boolean') return 'unknown';
  return profile.profileSetupComplete ? 'complete' : 'incomplete';
}

function refreshStudentStats(records) {
  const now = new Date();
  const monthCount = records.filter(record => {
    const date = dateValue(record.createdAt);
    return date && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }).length;
  $('#studentTotal').textContent = new Intl.NumberFormat('en-IN').format(records.length);
  $('#studentComplete').textContent = new Intl.NumberFormat('en-IN').format(records.filter(record => record.profileSetupComplete === true).length);
  $('#studentVerified').textContent = new Intl.NumberFormat('en-IN').format(records.filter(record => record.emailVerified === true).length);
  $('#studentThisMonth').textContent = new Intl.NumberFormat('en-IN').format(monthCount);
  $('#studentMonthLabel').textContent = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(now);
}

function filteredStudentRecords() {
  const search = $('#studentSearch').value.trim().toLocaleLowerCase('en');
  const completion = $('#studentCompletionFilter').value;
  const emailState = $('#studentEmailFilter').value;
  const [sortKey, sortDirection] = $('#studentSort').value.split('-');
  const direction = sortDirection === 'desc' ? -1 : 1;
  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  return studentRecords.filter(record => {
    const p = record.profile;
    const haystack = [studentName(p), p.email, record.uid, p.rollNo, p.division].filter(Boolean).join(' ').toLocaleLowerCase('en');
    if (search && !haystack.includes(search)) return false;
    if (completion !== 'all' && profileState(p) !== completion) return false;
    if (emailState === 'verified' && p.emailVerified !== true) return false;
    if (emailState === 'unverified' && p.emailVerified !== false) return false;
    if (emailState === 'unknown' && typeof p.emailVerified === 'boolean') return false;
    return true;
  }).sort((a, b) => {
    if (sortKey === 'createdAt') {
      const aDate = dateValue(a.createdAt)?.getTime() ?? (sortDirection === 'asc' ? Number.MAX_SAFE_INTEGER : -1);
      const bDate = dateValue(b.createdAt)?.getTime() ?? (sortDirection === 'asc' ? Number.MAX_SAFE_INTEGER : -1);
      return (aDate - bDate) * direction;
    }
    return collator.compare(String(a.profile[sortKey] || ''), String(b.profile[sortKey] || '')) * direction;
  });
}

function showStudentDetail(record) {
  const p = record.profile;
  const fields = [
    ['Full name', studentName(p)], ['Email', p.email || 'Not recorded'], ['Firebase UID', record.uid],
    ['Role', p.role || 'Not recorded'], ['Roll number', p.rollNo || 'Not recorded'],
    ['Division', p.division || 'Not recorded'], ['Registered', dateValue(record.createdAt) ? dateFormatter.format(dateValue(record.createdAt)) : 'Not recorded'],
    ['Email verification', p.emailVerified === true ? 'Verified (profile record)' : p.emailVerified === false ? 'Unverified (profile record)' : 'Not recorded'],
    ['Profile completion', profileState(p) === 'complete' ? 'Complete' : profileState(p) === 'incomplete' ? 'Incomplete' : 'Not recorded'],
    ['Course', p.course || 'Shared FYBA academic information'], ['Class', p.studentClass || 'Shared FYBA academic information'],
    ['WhatsApp', p.whatsapp || 'Not recorded'], ['Telegram', p.telegram || 'Not recorded'],
    ['Bio', p.bio || 'Not recorded'], ['Avatar', p.avatar || 'Default'],
    ['Electives', Array.isArray(p.electives) ? p.electives.join(', ') || 'None recorded' : 'Not recorded']
  ];
  const content = $('#studentDetailContent');
  content.replaceChildren();
  for (const [label, value] of fields) {
    const row = document.createElement('div');
    row.className = 'student-detail-row';
    const key = document.createElement('span');
    key.textContent = label;
    const text = document.createElement('strong');
    text.textContent = value;
    row.append(key, text);
    content.append(row);
  }
  $('#studentAuthConsoleLink').href = 'https://console.firebase.google.com/project/vish-hub/authentication/users';
  const dialog = $('#studentDetailDialog');
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function renderStudents() {
  const records = filteredStudentRecords();
  const body = $('#studentsTableBody');
  body.replaceChildren();
  $('#studentResultCount').textContent = `${records.length} ${records.length === 1 ? 'STUDENT' : 'STUDENTS'}`;
  $('#studentsNoResults').hidden = records.length !== 0 || studentRecords.length === 0;
  $('#studentsEmpty').hidden = studentRecords.length !== 0;
  $('#studentsTableWrap').hidden = records.length === 0;
  $('#exportStudents').disabled = records.length === 0;
  $('#studentDirectoryStatus').textContent = `${studentRecords.length} student profiles loaded from Firestore.`;
  for (const record of records) {
    const p = record.profile;
    const tr = document.createElement('tr');
    const nameCell = document.createElement('td');
    nameCell.className = 'student-name-cell';
    const name = document.createElement('strong'); name.textContent = studentName(p);
    const email = document.createElement('span'); email.textContent = p.email || 'Email not recorded';
    nameCell.append(name, email);
    const uid = document.createElement('td'); uid.className = 'student-uid'; uid.textContent = record.uid;
    const roll = document.createElement('td'); roll.textContent = p.rollNo || '—';
    const division = document.createElement('td'); division.textContent = p.division || '—';
    const registered = document.createElement('td'); registered.textContent = dateValue(record.createdAt) ? dateFormatter.format(dateValue(record.createdAt)) : '—';
    const completion = document.createElement('td'); completion.innerHTML = `<span class="student-badge ${escapeHtml(profileState(p))}">${profileState(p) === 'complete' ? 'Complete' : profileState(p) === 'incomplete' ? 'Incomplete' : 'Not recorded'}</span>`;
    const emailState = p.emailVerified === true ? 'verified' : p.emailVerified === false ? 'unverified' : 'unknown';
    const verified = document.createElement('td'); verified.innerHTML = `<span class="student-badge ${emailState}">${emailState === 'verified' ? 'Verified' : emailState === 'unverified' ? 'Unverified' : 'Not recorded'}</span>`;
    const action = document.createElement('td');
    const button = document.createElement('button'); button.type = 'button'; button.className = 'student-detail-button'; button.textContent = 'View'; button.setAttribute('aria-label', `View ${studentName(p)} profile`); button.addEventListener('click', () => showStudentDetail(record));
    action.append(button);
    tr.append(nameCell, uid, roll, division, registered, completion, verified, action);
    body.append(tr);
  }
}

async function loadStudents(force = false) {
  if (studentsLoaded && !force) { renderStudents(); return; }
  const sequence = ++studentsLoadSequence;
  setStudentLoading();
  try {
    const user = auth.currentUser;
    if (!user || !await assertTrustedAdmin(user)) {
      if (user) await showDenied(user, 'Admin access has expired or is no longer assigned.');
      return;
    }
    const result = await getDocs(collection(db, 'users'));
    if (sequence !== studentsLoadSequence) return;
    studentRecords = result.docs.map(snapshot => ({ uid: snapshot.id, profile: snapshot.data(), createdAt: snapshot.data().createdAt }))
      .filter(record => record.profile.role === 'Student');
    studentsLoaded = true;
    refreshStudentStats(studentRecords);
    $('#studentsLoading').hidden = true;
    $('#studentsError').hidden = true;
    renderStudents();
  } catch (error) {
    if (sequence !== studentsLoadSequence) return;
    $('#studentsLoading').hidden = true;
    $('#studentsError').hidden = false;
    $('#studentsEmpty').hidden = true;
    $('#studentsNoResults').hidden = true;
    $('#studentsTableWrap').hidden = true;
    $('#exportStudents').disabled = true;
    $('#studentsErrorText').textContent = error?.code === 'permission-denied'
      ? 'Firestore denied the student list. Confirm the deployed rules allow verified Admin claims to list /users.'
      : 'Could not load student profiles. Check the connection and retry.';
    $('#studentDirectoryStatus').textContent = 'Directory request failed.';
  }
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function exportStudentsCsv() {
  if (!auth.currentUser || !activeAdmin || !studentsLoaded) return;
  const expectedUid = auth.currentUser.uid;
  void assertTrustedAdmin(auth.currentUser).then(allowed => {
    if (!allowed || auth.currentUser?.uid !== expectedUid) {
      if (auth.currentUser) return showDenied(auth.currentUser, 'Admin access has expired or is no longer assigned.');
      clearStudentDirectory();
      return;
    }
    const records = filteredStudentRecords();
    if (!records.length) return;
    const rows = [['Name', 'Email', 'UID', 'Roll number', 'Division', 'Registration date', 'Profile completion', 'Email verification']];
    for (const record of records) rows.push([
      studentName(record.profile), record.profile.email || '', record.uid, record.profile.rollNo || '', record.profile.division || '',
      dateValue(record.createdAt)?.toISOString() || '', profileState(record.profile), record.profile.emailVerified === true ? 'verified' : record.profile.emailVerified === false ? 'unverified' : 'not recorded'
    ]);
    const blob = new Blob(['\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `vish-hub-students-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    $('#studentDirectoryStatus').textContent = `Exported ${records.length} filtered student profiles.`;
  }).catch(() => { $('#studentDirectoryStatus').textContent = 'Admin authorization could not be refreshed. Sign in again.'; });
}

$('#studentSearch').addEventListener('input', renderStudents);
$('#studentCompletionFilter').addEventListener('change', renderStudents);
$('#studentEmailFilter').addEventListener('change', renderStudents);
$('#studentSort').addEventListener('change', renderStudents);
$('#exportStudents').addEventListener('click', exportStudentsCsv);
$('#refreshStudents').addEventListener('click', () => void loadStudents(true));
$('#retryStudents').addEventListener('click', () => void loadStudents(true));
$('#closeStudentDetail').addEventListener('click', () => $('#studentDetailDialog').close());
$('#closeStudentDetailFooter').addEventListener('click', () => $('#studentDetailDialog').close());
$('#studentDetailDialog').addEventListener('click', event => { if (event.target === event.currentTarget) event.currentTarget.close(); });
showAdminPage(window.location.hash.slice(1) === 'students' ? 'students' : window.location.hash.slice(1) === 'activity' ? 'activity' : 'overview');
