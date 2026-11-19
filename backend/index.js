import { createHash } from 'node:crypto';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldPath, FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
  DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { aggregateResourceEvents, COLLECTION_FIELDS, R2_FILE_COLLECTIONS, SCHEDULED_COLLECTIONS, SUBJECT_ACTIVITY_IDS, gradeStudentAssessment, studentMatchesAudience, toStudentAcademicRecord, toStudentAssessment, toStudentAssessmentQuestion, toStudentCommunityComment, toStudentCommunityPost, toStudentResource, toStudentTimetableEntry, validateContent } from './validation.js';

if (!getApps().length) initializeApp();
const db = getFirestore();
const auth = getAuth();

const r2AccountId = defineSecret('R2_ACCOUNT_ID');
const r2AccessKeyId = defineSecret('R2_ACCESS_KEY_ID');
const r2SecretAccessKey = defineSecret('R2_SECRET_ACCESS_KEY');
const r2BucketName = defineSecret('R2_BUCKET_NAME');
function allowedOrigins() {
  const configured = (process.env.ADMIN_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  return new Set([
    'https://vish-hub.pages.dev', 'http://localhost:8000',
    'http://localhost:8080', 'http://127.0.0.1:5500', ...configured
  ]);
}

const CONTENT_COLLECTIONS = new Set(Object.keys(COLLECTION_FIELDS));
function getR2Client() {
  const accountId = r2AccountId.value();
  return new S3Client({
    region: 'auto', endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: r2AccessKeyId.value(), secretAccessKey: r2SecretAccessKey.value() }
  });
}

async function getStudentPage(pageToken, pageSize) {
  const cursor = pageToken ? decodeStudentCursor(pageToken) : { pageToken: null, index: 0 };
  if (!cursor) throw Object.assign(new Error('The student directory page cursor is invalid.'), { status: 400 });
  const items = [];
  let authPageToken = cursor.pageToken;
  let startIndex = cursor.index;
  let nextPageToken = null;
  let pages = 0;
  while (items.length <= pageSize && pages < 100) {
    const page = await auth.listUsers(1000, authPageToken || undefined);
    const candidates = page.users.map((user, index) => ({ user, index }))
      .filter(({ user, index }) => index >= startIndex
        && user.customClaims?.admin !== true && user.customClaims?.superAdmin !== true);
    const profiles = candidates.length
      ? await db.getAll(...candidates.map(({ user }) => db.collection('users').doc(user.uid)))
      : [];
    for (let i = 0; i < candidates.length; i += 1) {
      const { user, index } = candidates[i];
      const profile = profiles[i].exists ? profiles[i].data() : {};
      if (profile.role && profile.role !== 'Student') continue;
      if (items.length === pageSize) {
        nextPageToken = encodeStudentCursor(authPageToken, index);
        break;
      }
      items.push({
        uid: user.uid, email: user.email || '', name: profile.name || user.displayName || '',
        rollNo: profile.rollNo || '', division: profile.division || '', createdAt: user.metadata.creationTime,
        profileCreatedAt: profile.createdAt?.toDate?.().toISOString?.() || null,
        emailVerified: user.emailVerified === true, disabled: user.disabled === true,
        profileSetupComplete: profile.profileSetupComplete === true,
        profileStatus: typeof profile.profileSetupComplete === 'boolean' ? (profile.profileSetupComplete ? 'complete' : 'incomplete') : 'unknown',
        profile: {
          uid: user.uid, email: user.email || profile.email || '', name: profile.name || user.displayName || '',
          role: profile.role || 'Student', course: profile.course || '', studentClass: profile.studentClass || '',
          division: profile.division || '', rollNo: profile.rollNo || '', prn: profile.prn || '',
          whatsapp: profile.whatsapp || '', telegram: profile.telegram || '', bio: profile.bio || '',
          avatar: profile.avatar || '', electives: Array.isArray(profile.electives) ? profile.electives : [],
          profileSetupComplete: profile.profileSetupComplete === true,
          createdAt: profile.createdAt?.toDate?.().toISOString?.() || null,
          updatedAt: profile.updatedAt?.toDate?.().toISOString?.() || null
        }
      });
    }
    if (nextPageToken || !page.pageToken) break;
    authPageToken = page.pageToken;
    startIndex = 0;
    pages += 1;
  }
  if (!nextPageToken && items.length <= pageSize && pages >= 100) {
    throw Object.assign(new Error('The directory reached its safe scan limit. Refine the directory or export from Firebase Console.'), { status: 503 });
  }
  return { items, nextPageToken };
}

async function countCollection(name) {
  try { const snap = await db.collection(name).count().get(); return snap.data().count; }
  catch { return null; }
}

async function countResourceEvents(action) {
  try { const snap = await db.collection('resourceEvents').where('action', '==', action).count().get(); return snap.data().count; }
  catch { return null; }
}

async function dashboardMetrics() {
  const now = new Date();
  const puneToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
  const start = new Date(`${puneToday}T00:00:00+05:30`);
  const [authCounts, profileCount, resourceCount, questionCount, paperCount, noticeCount, announcementCount, submissionCount, assessmentAttemptCount, communityPostCount, communityCommentCount, communityReportCount, logsToday, resourceViews, resourceDownloads] = await Promise.all([
    (async () => {
      let token; let pages = 0; let active = 0; let disabled = 0; let total = 0;
      do {
        const page = await auth.listUsers(1000, token);
        for (const user of page.users) {
          if (user.customClaims?.admin || user.customClaims?.superAdmin) continue;
          total += 1;
          if (user.disabled) disabled += 1; else active += 1;
        }
        token = page.pageToken; pages += 1;
      } while (token && pages < 10);
      return { total, active, disabled, truncated: Boolean(token) };
    })(),
    db.collection('users').where('role', '==', 'Student').count().get().then(s => s.data().count).catch(() => null),
    countCollection('studyMaterials'), countCollection('questions'), countCollection('questionPapers'), countCollection('notices'), countCollection('announcements'), countCollection('submissions'), countCollection('assessmentAttempts'), countCollection('communityPosts'), countCollection('communityComments'), countCollection('communityReports'),
    db.collection('adminActivity').where('createdAt', '>=', Timestamp.fromDate(start)).count().get().then(s => s.data().count).catch(() => null),
    countResourceEvents('view'), countResourceEvents('download')
  ]);
  return { totalStudents: authCounts.truncated ? null : authCounts.total,
    activeStudents: authCounts.truncated ? null : authCounts.active,
    disabledStudents: authCounts.truncated ? null : authCounts.disabled,
    studentProfiles: profileCount, studentAccountsTruncated: authCounts.truncated,
    resourceCount, questionCount, paperCount, noticeCount, announcementCount, submissionCount, assessmentAttemptCount, communityPostCount, communityCommentCount, communityReportCount, resourceViews, resourceDownloads, actionsToday: logsToday,
    updatedAt: now.toISOString() };
}

async function studentSummary() {
  let token; let pages = 0; let total = 0; let verified = 0; let disabled = 0; let registeredThisMonth = 0; let completeProfiles = 0; let scanned = 0;
  const current = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'numeric' }).formatToParts(new Date()).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
  do {
    const page = await auth.listUsers(1000, token);
    const students = page.users.filter(user => !user.customClaims?.admin && !user.customClaims?.superAdmin);
    total += students.length; verified += students.filter(user => user.emailVerified).length; disabled += students.filter(user => user.disabled).length;
    registeredThisMonth += students.filter(user => { const created = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'numeric' }).formatToParts(new Date(user.metadata.creationTime)).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)])); return created.month === current.month && created.year === current.year; }).length;
    const docs = students.length ? await db.getAll(...students.map(user => db.collection('users').doc(user.uid))) : [];
    completeProfiles += docs.filter(profile => profile.exists && profile.data().profileSetupComplete === true).length;
    token = page.pageToken; pages += 1; scanned += page.users.length;
  } while (token && pages < 10);
  return { total: token ? null : total, verified: token ? null : verified, disabled: token ? null : disabled,
    registeredThisMonth: token ? null : registeredThisMonth, completeProfiles: token ? null : completeProfiles,
    truncated: Boolean(token), scanned };
}

function toApiValue(value) {
  if (value && typeof value.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(toApiValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, toApiValue(child)]));
  return value;
}

export const publishScheduledRecords = onSchedule({
  schedule: 'every 15 minutes', timeZone: 'Asia/Kolkata', region: 'us-central1', maxInstances: 1
}, async () => {
  const names = SCHEDULED_COLLECTIONS;
  const now = Timestamp.now();
  let updated = 0;
  for (const name of names) {
    const due = await db.collection(name).where('status', '==', 'scheduled').where('startAt', '<=', now).limit(200).get();
    for (const document of due.docs) {
      await document.ref.update({ status: 'published', publishedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      await db.collection('adminActivity').add({ actorUid: 'system', actorEmail: 'VISH HUB scheduler', action: `${name}.auto_published`, target: document.id, description: `Automatically published scheduled ${name} record`, createdAt: FieldValue.serverTimestamp() });
      updated += 1;
    }
  }
  console.info('Scheduled records published', { count: updated });
});

async function route(req, res, actor) {
  const path = req.path.replace(/^\/api\/admin\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [resource, id, action] = path;
  if (req.method === 'GET' && resource === 'dashboard') return send(res, 200, await dashboardMetrics());
  if (req.method === 'GET' && resource === 'analytics') {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const now = new Date();
    const defaultEnd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
    const defaultStartDate = new Date(now.getTime() - 29 * 86400000);
    const defaultStart = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(defaultStartDate);
    const from = typeof req.query.from === 'string' ? req.query.from : defaultStart;
    const to = typeof req.query.to === 'string' ? req.query.to : defaultEnd;
    if (!datePattern.test(from) || !datePattern.test(to)) return send(res, 400, { error: 'Choose valid start and end dates.' });
    const start = new Date(`${from}T00:00:00+05:30`);
    const endExclusive = new Date(new Date(`${to}T00:00:00+05:30`).getTime() + 86400000);
    const rangeDays = Math.round((endExclusive.getTime() - start.getTime()) / 86400000);
    if (!Number.isFinite(rangeDays) || rangeDays < 1 || rangeDays > 180) return send(res, 400, { error: 'Choose a date range from 1 to 180 days.' });
    const daily = new Map();
    for (let index = 0; index < rangeDays; index += 1) {
      const stamp = new Date(start.getTime() + index * 86400000);
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(stamp);
      daily.set(day, { date: day, registrations: 0, activeAccounts: 0, resourceViews: 0, resourceDownloads: 0, quizAttempts: 0, communityPosts: 0, communityComments: 0, communityReports: 0, subjectOpens: 0 });
    }
    const sessionSnapshot = await db.collection('studentActivity').where('day', '>=', from).where('day', '<=', to).orderBy('day', 'asc').limit(10001).get();
    const trackedSessionDays = new Set();
    for (const document of sessionSnapshot.docs.slice(0, 10000)) {
      const session = document.data(); const row = daily.get(session.day);
      if (row && typeof session.uid === 'string') {
        row.activeAccounts += 1;
        trackedSessionDays.add(session.day);
      }
    }
    let trackedActiveSessions = sessionSnapshot.docs.length > 10000 ? 10000 : sessionSnapshot.docs.length;
    let pageToken; let pages = 0; let students = 0; let registered = 0; let active = 0;
    do {
      const page = await auth.listUsers(1000, pageToken);
      for (const user of page.users) {
        if (user.customClaims?.admin === true || user.customClaims?.superAdmin === true) continue;
        students += 1;
        const created = new Date(user.metadata.creationTime);
        if (created >= start && created < endExclusive) {
          const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(created);
          const row = daily.get(day); if (row) { row.registrations += 1; registered += 1; }
        }
        const lastLogin = user.metadata.lastSignInTime ? new Date(user.metadata.lastSignInTime) : null;
        if (lastLogin && lastLogin >= start && lastLogin < endExclusive) {
          const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(lastLogin);
          const row = daily.get(day);
          if (row && !trackedSessionDays.has(day)) { row.activeAccounts += 1; active += 1; }
        }
      }
      pageToken = page.pageToken; pages += 1;
    } while (pageToken && pages < 10);
    const engagementSnapshot = await db.collection('resourceEvents').where('day', '>=', from).where('day', '<=', to).orderBy('day', 'asc').limit(10001).get();
    const eventRecords = []; let resourceViews = 0; let resourceDownloads = 0;
    for (const document of engagementSnapshot.docs.slice(0, 10000)) {
      const event = document.data(); const row = daily.get(event.day);
      if (event.action === 'view') { resourceViews += 1; if (row) row.resourceViews += 1; }
      if (event.action === 'download') { resourceDownloads += 1; if (row) row.resourceDownloads += 1; }
      eventRecords.push(event);
    }
    const mostAccessed = aggregateResourceEvents(eventRecords).sort((a, b) => (b.views + b.downloads) - (a.views + a.downloads)).slice(0, 10);
    const resourceDocs = mostAccessed.length ? await db.getAll(...mostAccessed.map(item => db.collection(item.collection).doc(item.resourceId))) : [];
    mostAccessed.forEach((item, index) => { item.title = resourceDocs[index]?.exists ? resourceDocs[index].data().title || 'Untitled resource' : 'Deleted resource'; });
    const startTimestamp = Timestamp.fromDate(start);
    const endTimestamp = Timestamp.fromDate(endExclusive);
    const [attempts, posts, comments, reports, subjectEvents] = await Promise.all([
      db.collection('assessmentAttempts').where('submittedAt', '>=', startTimestamp).where('submittedAt', '<', endTimestamp).limit(10001).get(),
      db.collection('communityPosts').where('createdAt', '>=', startTimestamp).where('createdAt', '<', endTimestamp).limit(10001).get(),
      db.collection('communityComments').where('createdAt', '>=', startTimestamp).where('createdAt', '<', endTimestamp).limit(10001).get(),
      db.collection('communityReports').where('createdAt', '>=', startTimestamp).where('createdAt', '<', endTimestamp).limit(10001).get(),
      db.collection('subjectEvents').where('day', '>=', from).where('day', '<=', to).limit(10001).get()
    ]);
    const activityCounts = { quizAttempts: 0, communityPosts: 0, communityComments: 0, communityReports: 0 };
    const addDailyRecords = (snapshot, key) => {
      for (const document of snapshot.docs.slice(0, 10000)) {
        const date = document.data().submittedAt?.toDate?.() || document.data().createdAt?.toDate?.();
        if (!date) continue;
        const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
        if (daily.has(day)) daily.get(day)[key] += 1;
        activityCounts[key] += 1;
      }
    };
    addDailyRecords(attempts, 'quizAttempts'); addDailyRecords(posts, 'communityPosts');
    addDailyRecords(comments, 'communityComments'); addDailyRecords(reports, 'communityReports');
    const subjectPopularity = new Map();
    for (const document of subjectEvents.docs.slice(0, 10000)) {
      const data = document.data();
      if (!/^(psychology|philosophy|economics|english|history|politics|common-aec|common-vec|common-iks|sec-(psychology|economics|english|politics)|oe-(zoology|botany|electronics|geography|geology))$/.test(data.subject || '')) continue;
      const day = daily.get(data.day);
      if (day) day.subjectOpens += 1;
      const item = subjectPopularity.get(data.subject) || { subjectId: data.subject, uniqueStudentDays: 0 };
      item.uniqueStudentDays += 1;
      subjectPopularity.set(data.subject, item);
    }
    const popularSubjects = [...subjectPopularity.values()].sort((a, b) => b.uniqueStudentDays - a.uniqueStudentDays).slice(0, 20);
    const participationEventsTruncated = [attempts, posts, comments, reports, subjectEvents].some(snapshot => snapshot.docs.length > 10000);
    return send(res, 200, { from, to, days: [...daily.values()], registered, activeAccounts: active + trackedActiveSessions,
      scannedStudentAccounts: students, truncated: Boolean(pageToken), resourceViews, resourceDownloads, ...activityCounts,
      trackedActiveSessions,
      activitySource: trackedActiveSessions ? 'recorded_sessions_with_legacy_sign_in_fallback' : 'firebase_latest_sign_in_estimate',
      activityEventsTruncated: sessionSnapshot.docs.length > 10000,
      resourceEngagementTruncated: engagementSnapshot.docs.length > 10000, participationEventsTruncated, popularSubjects, subjectEvents: subjectEvents.docs.length > 10000 ? null : subjectEvents.docs.length, mostAccessed, updatedAt: now.toISOString() });
  }
  if (req.method === 'GET' && resource === 'students' && id === 'summary') return send(res, 200, await studentSummary());
  if (req.method === 'GET' && resource === 'activity') {
    const size = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const snap = await db.collection('adminActivity').orderBy('createdAt', 'desc').limit(size).get();
    return send(res, 200, { items: snap.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: doc.data().createdAt?.toDate?.().toISOString?.() || null })) });
  }
  if (resource === 'administrators') {
    requireSuperAdmin(actor);
    if (req.method === 'GET' && !id) {
      let token; let pages = 0; const admins = [];
      do {
        const page = await auth.listUsers(1000, token);
        for (const user of page.users) {
          if (user.customClaims?.admin === true || user.customClaims?.superAdmin === true) admins.push({
            uid: user.uid, email: user.email || '', name: user.displayName || '', emailVerified: user.emailVerified === true,
            disabled: user.disabled === true, role: user.customClaims?.superAdmin === true ? 'superAdmin' : 'admin',
            createdAt: user.metadata.creationTime, lastSignInAt: user.metadata.lastSignInTime || null
          });
        }
        token = page.pageToken; pages += 1;
      } while (token && pages < 100);
      return send(res, 200, { items: admins, truncated: Boolean(token) });
    }
    if (req.method === 'PATCH' && id) {
      const role = req.body?.role;
      if (!['student', 'admin', 'superAdmin'].includes(role)) return send(res, 400, { error: 'Choose Student, Admin, or Super Admin.' });
      if (id === actor.uid && role !== 'superAdmin') return send(res, 400, { error: 'You cannot remove your own Super Admin access here.' });
      return await withAdminRosterLock(actor.uid, async () => {
        const target = await auth.getUser(id);
        if (role !== 'student' && (!target.emailVerified || target.disabled)) return send(res, 400, { error: 'Only enabled accounts with verified email can receive an Admin claim.' });
        if (target.customClaims?.superAdmin && role !== 'superAdmin') await requireAnotherEnabledSuperAdmin(id);
        const claims = { ...(target.customClaims || {}) };
        if (role === 'student') { delete claims.admin; delete claims.superAdmin; }
        if (role === 'admin') { claims.admin = true; delete claims.superAdmin; }
        if (role === 'superAdmin') { claims.admin = true; claims.superAdmin = true; }
        await auth.setCustomUserClaims(id, claims);
        await auth.revokeRefreshTokens(id);
        await audit(actor, `administrator.role_${role}`, id, { description: `Changed a user's trusted Admin claims to ${role}` });
        return send(res, 200, { uid: id, role, refreshRequired: true });
      });
    }
  }
  if (resource === 'students' && req.method === 'GET' && !id) {
    const pageSize = Math.min(1000, Math.max(1, Number(req.query.limit) || 100));
    return send(res, 200, await getStudentPage(typeof req.query.pageToken === 'string' ? req.query.pageToken : undefined, pageSize));
  }
  if (resource === 'students' && id && action === 'status' && req.method === 'PATCH') {
    const body = req.body || {};
    if (typeof body.disabled !== 'boolean') return send(res, 400, { error: 'disabled must be true or false.' });
    if (id === actor.uid) return send(res, 400, { error: 'You cannot disable your own Admin account here.' });
    const updateStatus = async () => {
      const target = await auth.getUser(id);
      if ((target.customClaims?.admin || target.customClaims?.superAdmin) && !actor.isSuperAdmin) {
        return send(res, 403, { error: 'Only a Super Admin can change another Admin account.' });
      }
      if (target.customClaims?.superAdmin === true && body.disabled && !target.disabled) await requireAnotherEnabledSuperAdmin(id);
      await auth.updateUser(id, { disabled: body.disabled });
      await audit(actor, body.disabled ? 'student.disabled' : 'student.enabled', id, { description: `${body.disabled ? 'Disabled' : 'Enabled'} a student account` });
      return send(res, 200, { uid: id, disabled: body.disabled });
    };
    return await withAdminRosterLock(actor.uid, updateStatus);
  }
  if (resource === 'students' && id && req.method === 'GET') {
    const [user, profileSnap] = await Promise.all([auth.getUser(id), db.collection('users').doc(id).get()]);
    if ((user.customClaims?.admin || user.customClaims?.superAdmin) && !actor.isSuperAdmin) return send(res, 404, { error: 'Student record was not found.' });
    return send(res, 200, { uid: user.uid, email: user.email || '', emailVerified: user.emailVerified, disabled: user.disabled,
      createdAt: user.metadata.creationTime, lastSignInAt: user.metadata.lastSignInTime || null,
      profile: profileSnap.exists ? profileSnap.data() : null });
  }
  if (resource === 'submissions' && id && action === 'review' && req.method === 'PATCH') {
    const { status, feedback = '' } = req.body || {};
    if (!['approved', 'rejected'].includes(status) || !asText(feedback, 2000)) return send(res, 400, { error: 'Choose approved or rejected and provide valid feedback.' });
    const ref = db.collection('submissions').doc(id); const snap = await ref.get();
    if (!snap.exists) return send(res, 404, { error: 'Submission not found.' });
    await ref.update({ status, adminFeedback: feedback, reviewedAt: FieldValue.serverTimestamp(), reviewedBy: actor.uid, updatedAt: FieldValue.serverTimestamp() });
    await audit(actor, `submission.${status}`, id, { description: `${status === 'approved' ? 'Approved' : 'Rejected'} a student submission` });
    return send(res, 200, { id, status });
  }
  if (resource === 'r2' && id === 'stats' && req.method === 'GET') {
    const client = getR2Client(); let token; let count = 0; let bytes = 0; let pages = 0;
    do {
      const result = await client.send(new ListObjectsV2Command({ Bucket: r2BucketName.value(), MaxKeys: 1000, ContinuationToken: token }));
      count += result.KeyCount || 0;
      bytes += (result.Contents || []).reduce((sum, object) => sum + (object.Size || 0), 0);
      token = result.IsTruncated ? result.NextContinuationToken : undefined;
      pages += 1;
    } while (token && pages < 100);
    return send(res, 200, { objects: token ? null : count, bytes: token ? null : bytes, scanned: count, truncated: Boolean(token) });
  }
  if (resource === 'r2' && id === 'upload-ticket' && req.method === 'POST') {
    const { fileName, contentType, size } = req.body || {};
    if (!asText(fileName, 180) || !asText(contentType, 120) || !Number.isInteger(size) || size < 1 || size > 100 * 1024 * 1024) return send(res, 400, { error: 'File name, type, or size is invalid (maximum 100 MB).' });
    const extension = fileName.split('.').pop().toLowerCase();
    const safeMimeTypes = {
      pdf: 'application/pdf', doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', mp4: 'video/mp4'
    };
    const expectedContentType = safeMimeTypes[extension];
    if (!expectedContentType || ![expectedContentType, 'application/octet-stream'].includes(contentType)) {
      return send(res, 400, { error: 'Upload a supported PDF, Office document, JPEG, PNG, or MP4 file with a matching file type.' });
    }
    const ext = fileName.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
    const key = `admin-uploads/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}${ext ? `.${ext}` : ''}`;
    const client = getR2Client(); const bucket = r2BucketName.value();
    const uploadUrl = await getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: expectedContentType, ContentLength: size }), { expiresIn: 300 });
    return send(res, 200, { key, uploadUrl, contentType: expectedContentType, expiresIn: 300 });
  }
  if (resource === 'r2' && id === 'confirm-upload' && req.method === 'POST') {
    const { key, collection = 'studyMaterials', ...input } = req.body || {};
    if (!asText(key, 512) || !key.startsWith('admin-uploads/') || !R2_FILE_COLLECTIONS.includes(collection)) return send(res, 400, { error: 'The upload key or file collection is invalid.' });
    const data = validateContent(collection, input, { creating: true });
    const object = await getR2Client().send(new HeadObjectCommand({ Bucket: r2BucketName.value(), Key: key }));
    if (!Number.isFinite(object.ContentLength) || object.ContentLength > 100 * 1024 * 1024) return send(res, 400, { error: 'The uploaded object is missing or exceeds the file limit.' });
    const ref = db.collection(collection).doc();
    await ref.set({ ...data, storageKey: key,
      fileName: key.split('/').pop(), fileSize: object.ContentLength, contentType: object.ContentType || '',
      ...(data.status === 'published' ? { publishedAt: FieldValue.serverTimestamp() } : {}),
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), createdBy: actor.uid, updatedBy: actor.uid });
    await audit(actor, `${collection}.file_uploaded`, ref.id, { description: `Uploaded and registered a ${collection} file` });
    return send(res, 201, { id: ref.id, key, size: object.ContentLength });
  }
  if (resource === 'r2' && id === 'confirm-replacement' && req.method === 'POST') {
    const { key, resourceId, collection = 'studyMaterials', ...input } = req.body || {};
    if (!asText(key, 512) || !key.startsWith('admin-uploads/') || !asText(resourceId, 160) || !R2_FILE_COLLECTIONS.includes(collection)) return send(res, 400, { error: 'The replacement resource details are invalid.' });
    const data = validateContent(collection, input);
    const client = getR2Client(); const bucket = r2BucketName.value();
    const object = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    if (!Number.isFinite(object.ContentLength) || object.ContentLength > 100 * 1024 * 1024) return send(res, 400, { error: 'The uploaded replacement is missing or exceeds the file limit.' });
    const ref = db.collection(collection).doc(resourceId); const previous = await ref.get();
    if (!previous.exists) return send(res, 404, { error: 'Resource record not found.' });
    const previousKey = previous.data().storageKey;
    await ref.set({ ...data, storageKey: key,
      fileName: key.split('/').pop(), fileSize: object.ContentLength, contentType: object.ContentType || '',
      ...(data.status === 'published' ? { publishedAt: FieldValue.serverTimestamp() } : {}), updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid }, { merge: true });
    if (previousKey && previousKey !== key && previousKey.startsWith('admin-uploads/')) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: previousKey }));
    }
    await audit(actor, `${collection}.file_replaced`, resourceId, { description: `Replaced a ${collection} file` });
    return send(res, 200, { id: resourceId, key, size: object.ContentLength });
  }
  if (resource === 'r2' && id === 'download-ticket' && req.method === 'POST') {
    const key = req.body?.key;
    if (!asText(key, 512) || !key.startsWith('admin-uploads/')) return send(res, 400, { error: 'This object key is outside the managed upload area.' });
    const client = getR2Client(); const bucket = r2BucketName.value();
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    const downloadUrl = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 300 });
    return send(res, 200, { downloadUrl, expiresIn: 300 });
  }
  if (resource === 'r2' && id === 'object' && req.method === 'DELETE') {
    const key = req.body?.key;
    if (!asText(key, 512) || !key.startsWith('admin-uploads/')) return send(res, 400, { error: 'This object key is outside the managed upload area.' });
    await getR2Client().send(new DeleteObjectCommand({ Bucket: r2BucketName.value(), Key: key }));
    await audit(actor, 'resource.file.deleted', key, { description: 'Deleted a managed resource file' });
    return send(res, 200, { deleted: true });
  }
  if (resource === 'content' && id && CONTENT_COLLECTIONS.has(id)) {
    const name = id; const documentId = action;
    if (req.method === 'GET') {
      if (documentId) { const snap = await db.collection(name).doc(documentId).get(); return snap.exists ? send(res, 200, { id: snap.id, ...toApiValue(snap.data()) }) : send(res, 404, { error: 'Record not found.' }); }
      const size = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const cursorId = req.query.pageToken ? decodeCursor(req.query.pageToken) : '';
      if (req.query.pageToken && !cursorId) return send(res, 400, { error: 'The record page cursor is invalid.' });
      const collection = db.collection(name);
      let query = collection.orderBy(FieldPath.documentId(), 'desc');
      if (cursorId) query = query.startAfter(cursorId);
      if (typeof req.query.status === 'string' && req.query.status !== 'all') {
        if (!ALLOWED_STATUSES.has(req.query.status)) return send(res, 400, { error: 'The status filter is invalid.' });
        query = query.where('status', '==', req.query.status);
        // Keep the pagination order deterministic for filtered result sets.
        query = query.orderBy(FieldPath.documentId(), 'desc');
        if (cursorId) query = query.startAfter(cursorId);
      }
      const snap = await query.limit(size + 1).get();
      const docs = snap.docs.slice(0, size);
      const nextPageToken = snap.docs.length > size && docs.length ? encodeCursor(docs.at(-1).id) : null;
      return send(res, 200, { items: docs.map(item => ({ id: item.id, ...toApiValue(item.data()) })), nextPageToken });
    }
    if (req.method === 'POST' && !documentId) {
      const data = validateContent(name, req.body, { creating: true });
      const now = FieldValue.serverTimestamp();
      const ref = db.collection(name).doc();
      await ref.set({ ...data, ...(data.status === 'published' ? { publishedAt: now } : {}), createdAt: now, updatedAt: now, createdBy: actor.uid, updatedBy: actor.uid });
      await audit(actor, `${name}.created`, ref.id, { description: `Created ${name} record` });
      return send(res, 201, { id: ref.id });
    }
    if (req.method === 'PUT' && documentId) {
      const data = validateContent(name, req.body);
      const ref = db.collection(name).doc(documentId);
      if (!(await ref.get()).exists) return send(res, 404, { error: 'Record not found.' });
      await ref.set({ ...data, ...(data.status === 'published' ? { publishedAt: FieldValue.serverTimestamp() } : {}), updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid }, { merge: true });
      await audit(actor, `${name}.updated`, documentId, { description: `Updated ${name} record` });
      return send(res, 200, { id: documentId });
    }
    if (req.method === 'DELETE' && documentId) {
      const ref = db.collection(name).doc(documentId); const snap = await ref.get();
      if (!snap.exists) return send(res, 404, { error: 'Record not found.' });
      const storageKey = snap.data().storageKey;
      // Only delete objects this Admin API created. Legacy or externally managed keys
      // remain untouched so this migration cannot remove unrelated bucket data.
      if (typeof storageKey === 'string' && storageKey.startsWith('admin-uploads/')) {
        await getR2Client().send(new DeleteObjectCommand({ Bucket: r2BucketName.value(), Key: storageKey }));
      }
      await ref.delete();
      await audit(actor, `${name}.deleted`, documentId, { description: `Deleted ${name} record` });
      return send(res, 200, { deleted: true });
    }
  }
  if (resource === 'submissions' && !id && req.method === 'GET') {
    const status = typeof req.query.status === 'string' && ['pending', 'approved', 'rejected', 'all'].includes(req.query.status) ? req.query.status : 'pending';
    const size = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const cursorId = req.query.pageToken ? decodeCursor(req.query.pageToken) : '';
    if (req.query.pageToken && !cursorId) return send(res, 400, { error: 'The submission page cursor is invalid.' });
    let query = db.collection('submissions');
    if (status !== 'all') query = query.where('status', '==', status);
    query = query.orderBy(FieldPath.documentId(), 'desc');
    if (cursorId) query = query.startAfter(cursorId);
    const snap = await query.limit(size + 1).get();
    const docs = snap.docs.slice(0, size);
    const nextPageToken = snap.docs.length > size && docs.length ? encodeCursor(docs.at(-1).id) : null;
    return send(res, 200, { items: docs.map(document => ({ id: document.id, ...toApiValue(document.data()) })), nextPageToken });
  }
  if (resource === 'settings' && req.method === 'GET') {
    const snap = await db.collection('admin').doc('settings').get();
    return send(res, 200, snap.exists ? snap.data() : {});
  }
  if (resource === 'settings' && req.method === 'PUT') {
    requireSuperAdmin(actor);
    const body = req.body || {};
    const allowed = ['maintenanceMode', 'studentRegistrationEnabled', 'defaultAcademicYear', 'notificationSettings'];
    if (Object.keys(body).some(key => !allowed.includes(key))) return send(res, 400, { error: 'Unsupported settings field.' });
    if ('maintenanceMode' in body && typeof body.maintenanceMode !== 'boolean') return send(res, 400, { error: 'maintenanceMode must be true or false.' });
    if ('studentRegistrationEnabled' in body && typeof body.studentRegistrationEnabled !== 'boolean') return send(res, 400, { error: 'studentRegistrationEnabled must be true or false.' });
    if ('defaultAcademicYear' in body && (typeof body.defaultAcademicYear !== 'string' || body.defaultAcademicYear.trim().length > 40)) return send(res, 400, { error: 'defaultAcademicYear must be text no longer than 40 characters.' });
    if ('notificationSettings' in body) {
      const settings = body.notificationSettings;
      const notificationKeys = ['emailEnabled', 'pushEnabled', 'inAppEnabled'];
      if (!settings || typeof settings !== 'object' || Array.isArray(settings)
        || Object.keys(settings).some(key => !notificationKeys.includes(key))
        || Object.values(settings).some(value => typeof value !== 'boolean')) {
        return send(res, 400, { error: 'notificationSettings must contain only boolean emailEnabled, pushEnabled, or inAppEnabled values.' });
      }
    }
    await db.collection('admin').doc('settings').set({ ...body, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid }, { merge: true });
    await audit(actor, 'settings.updated', 'admin/settings', { description: 'Updated platform settings' });
    return send(res, 200, { saved: true });
  }
  return send(res, 404, { error: 'Admin endpoint not found.' });
}

export const adminApi = onRequest({
  region: 'us-central1', maxInstances: 10, timeoutSeconds: 120,
  secrets: [r2AccountId, r2AccessKeyId, r2SecretAccessKey, r2BucketName]
}, async (req, res) => {
  try {
    if (!allowedOrigin(req)) return send(res, 403, { error: 'This origin is not allowed.' });
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return send(res, 405, { error: 'Method not allowed.' });
    const actor = await requireAdmin(req);
    return await route(req, res, actor);
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    if (status >= 500) console.error('Admin API failure', { code: error?.code || 'unknown', path: req.path });
    return send(res, status, { error: status >= 500 ? 'The requested operation could not be completed.' : error.message });
  }
});

export const studentResourcesApi = onRequest({
  region: 'us-central1', maxInstances: 20, timeoutSeconds: 120,
  secrets: [r2AccountId, r2AccessKeyId, r2SecretAccessKey, r2BucketName]
}, async (req, res) => {
  try {
    res.set('Cache-Control', 'private, no-store');
    const isEngagement = req.method === 'POST' && req.path === '/api/resources/engagement';
    if (!isEngagement && (req.method !== 'GET' || req.path !== '/api/resources')) return send(res, 404, { error: 'Resource endpoint not found.' });
    const header = req.get('authorization') || '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) return send(res, 401, { error: 'A verified VISH HUB account is required.' });
    let user;
    try { user = await auth.verifyIdToken(match[1], true); }
    catch { return send(res, 401, { error: 'Your session is invalid or expired.' }); }
    const isTrustedAdmin = user.admin === true || user.superAdmin === true;
    if (user.email_verified !== true) return send(res, 403, { error: 'Verify your email to access published resources.' });
    if (!isTrustedAdmin) {
      const profile = await db.collection('users').doc(user.uid).get();
      if (!profile.exists || profile.data().uid !== user.uid || profile.data().role !== 'Student') return send(res, 403, { error: 'A VISH HUB student profile is required.' });
    }
    if (isEngagement) {
      const { id, action } = req.body || {};
      const collection = req.body?.collection || 'studyMaterials';
      if (!asText(id, 160) || !R2_FILE_COLLECTIONS.includes(collection) || !['view', 'download'].includes(action)) return send(res, 400, { error: 'A published resource and valid activity type are required.' });
      const materialRef = db.collection(collection).doc(id);
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      const eventId = Buffer.from(`${user.uid}|${collection}|${id}|${action}|${day}`, 'utf8').toString('base64url');
      const eventRef = db.collection('resourceEvents').doc(eventId);
      const engagement = await db.runTransaction(async transaction => {
        const [seen, currentMaterial] = await Promise.all([transaction.get(eventRef), transaction.get(materialRef)]);
        if (!currentMaterial.exists || currentMaterial.data().status !== 'published') throw Object.assign(new Error('Published resource not found.'), { status: 404 });
        const storageKey = currentMaterial.data().storageKey || '';
        if (seen.exists) return { recorded: false, storageKey };
        transaction.create(eventRef, { uid: user.uid, collection, resourceId: id, action, day, createdAt: FieldValue.serverTimestamp() });
        transaction.update(materialRef, { [action === 'view' ? 'views' : 'downloads']: FieldValue.increment(1) });
        return { recorded: true, storageKey };
      });
      const result = { recorded: engagement.recorded };
      if (action === 'download' && engagement.storageKey.startsWith('admin-uploads/')) {
        const safeName = `${id.slice(0, 24)}.${engagement.storageKey.split('.').pop().replace(/[^a-z0-9]/gi, '').slice(0, 8)}`;
        result.downloadUrl = await getSignedUrl(getR2Client(), new GetObjectCommand({
          Bucket: r2BucketName.value(), Key: engagement.storageKey,
          ResponseContentDisposition: `attachment; filename="${safeName}"`
        }), { expiresIn: 300 });
      }
      return send(res, 200, result);
    }
    const requestedCollection = typeof req.query.collection === 'string' ? req.query.collection : '';
    if (requestedCollection && !R2_FILE_COLLECTIONS.includes(requestedCollection)) return send(res, 400, { error: 'This resource collection is not available.' });
    const resourceCollections = requestedCollection ? [requestedCollection] : R2_FILE_COLLECTIONS;
    const snapshots = await Promise.all(resourceCollections.map(name => db.collection(name).where('status', '==', 'published').limit(100).get()));
    const resources = await Promise.all(snapshots.flatMap((snapshot, index) => snapshot.docs.map(doc => ({ doc, collection: resourceCollections[index] }))).map(async ({ doc, collection }) => {
      const data = doc.data(); let url = typeof data.url === 'string' ? data.url : typeof data.fileUrl === 'string' ? data.fileUrl : '';
      if (data.storageKey) {
        try {
          url = await getSignedUrl(getR2Client(), new GetObjectCommand({ Bucket: r2BucketName.value(), Key: data.storageKey }), { expiresIn: 3600 });
        } catch (error) {
          console.error('Resource link generation failed', { code: error?.name || 'unknown' });
          url = '';
        }
      }
      return toStudentResource(doc.id, collection, data, url);
    }));
    return send(res, 200, { resources });
  } catch (error) {
    console.error('Student resources request failed', { code: error?.code || 'unknown' });
    const status = Number.isInteger(error?.status) && error.status < 500 ? error.status : 500;
    return send(res, status, { error: status < 500 ? error.message : 'Published resources are temporarily unavailable.' });
  }
});

export const studentActivityApi = onRequest({ region: 'us-central1', maxInstances: 20 }, async (req, res) => {
  try {
    res.set('Cache-Control', 'private, no-store');
    if (req.method !== 'POST' || req.path.replace(/\/$/, '') !== '/api/activity/login') {
      return send(res, 404, { error: 'Activity endpoint not found.' });
    }
    const match = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
    if (!match) return send(res, 401, { error: 'A verified VISH HUB account is required.' });
    let user;
    try { user = await auth.verifyIdToken(match[1], true); }
    catch { return send(res, 401, { error: 'Your session is invalid or expired.' }); }
    if (user.email_verified !== true) return send(res, 403, { error: 'Verify your email before recording activity.' });
    if (user.admin === true || user.superAdmin === true) return send(res, 403, { error: 'This endpoint is for student accounts.' });
    const profile = await db.collection('users').doc(user.uid).get();
    if (!profile.exists || profile.data().uid !== user.uid || profile.data().role !== 'Student') {
      return send(res, 403, { error: 'A VISH HUB student profile is required.' });
    }
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    const ref = db.collection('studentActivity').doc(`${user.uid}_${day}`);
    const expireAt = Timestamp.fromMillis(Date.now() + 180 * 86400000);
    await db.runTransaction(async transaction => {
      const existing = await transaction.get(ref);
      if (!existing.exists) transaction.create(ref, {
        uid: user.uid, day, event: 'verified_session', createdAt: FieldValue.serverTimestamp(), expireAt
      });
    });
    return send(res, 200, { recorded: true, day });
  } catch (error) {
    console.error('Student activity request failed', { code: error?.code || 'unknown' });
    return send(res, 500, { error: 'Activity could not be recorded.' });
  }
});

export const studentSubjectActivityApi = onRequest({ region: 'us-central1', maxInstances: 20 }, async (req, res) => {
  try {
    res.set('Cache-Control', 'private, no-store');
    if (req.method !== 'POST' || req.path.replace(/\/$/, '') !== '/api/activity/subject') return send(res, 404, { error: 'Subject activity endpoint not found.' });
    const bearer = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
    if (!bearer) return send(res, 401, { error: 'A verified VISH HUB student account is required.' });
    let user;
    try { user = await auth.verifyIdToken(bearer[1], true); }
    catch { return send(res, 401, { error: 'Your session is invalid or expired.' }); }
    if (user.email_verified !== true || user.admin === true || user.superAdmin === true) return send(res, 403, { error: 'A verified student account is required.' });
    const profile = await db.collection('users').doc(user.uid).get();
    if (!profile.exists || profile.data().uid !== user.uid || profile.data().role !== 'Student') return send(res, 403, { error: 'A VISH HUB student profile is required.' });
    const subject = req.body?.subject;
    if (typeof subject !== 'string' || !SUBJECT_ACTIVITY_IDS.includes(subject)) return send(res, 400, { error: 'Choose a valid FYBA subject.' });
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    const digest = createHash('sha256').update(`${user.uid}:${subject}:${day}`).digest('hex');
    const ref = db.collection('subjectEvents').doc(digest);
    const expireAt = Timestamp.fromMillis(Date.now() + 180 * 86400000);
    const recorded = await db.runTransaction(async transaction => {
      const existing = await transaction.get(ref);
      if (existing.exists) return false;
      transaction.create(ref, { subject, day, createdAt: FieldValue.serverTimestamp(), expireAt });
      return true;
    });
    return send(res, 200, { recorded, day });
  } catch (error) {
    console.error('Student subject activity request failed', { code: error?.code || 'unknown' });
    return send(res, 500, { error: 'Subject activity could not be recorded.' });
  }
});

export const studentTimetableApi = onRequest({ region: 'us-central1', maxInstances: 20 }, async (req, res) => {
  try {
    res.set('Cache-Control', 'private, no-store');
    if (req.method !== 'GET' || req.path.replace(/\/$/, '') !== '/api/timetable') return send(res, 404, { error: 'Timetable endpoint not found.' });
    const match = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
    if (!match) return send(res, 401, { error: 'Sign in to view the examination timetable.' });
    let user;
    try { user = await auth.verifyIdToken(match[1], true); }
    catch { return send(res, 401, { error: 'Your session is invalid or expired.' }); }
    if (user.email_verified !== true) return send(res, 403, { error: 'Verify your email to view the examination timetable.' });
    if (user.admin !== true && user.superAdmin !== true) {
      const profile = await db.collection('users').doc(user.uid).get();
      if (!profile.exists || profile.data().uid !== user.uid || profile.data().role !== 'Student') return send(res, 403, { error: 'A VISH HUB student profile is required.' });
    }
    const snapshot = await db.collection('timetable').where('status', '==', 'published').limit(300).get();
    const exams = snapshot.docs.map(document => toStudentTimetableEntry(document.id, document.data())).filter(Boolean);
    return send(res, 200, { exams });
  } catch (error) {
    console.error('Student timetable request failed', { code: error?.code || 'unknown' });
    return send(res, 500, { error: 'The examination timetable is temporarily unavailable.' });
  }
});

export const studentAcademicsApi = onRequest({ region: 'us-central1', maxInstances: 20 }, async (req, res) => {
  try {
    res.set('Cache-Control', 'private, no-store');
    if (req.method !== 'GET' || req.path.replace(/\/$/, '') !== '/api/academics') return send(res, 404, { error: 'Academic content endpoint not found.' });
    const match = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
    if (!match) return send(res, 401, { error: 'Sign in to view academic content.' });
    let user;
    try { user = await auth.verifyIdToken(match[1], true); }
    catch { return send(res, 401, { error: 'Your session is invalid or expired.' }); }
    if (user.email_verified !== true) return send(res, 403, { error: 'Verify your email to view academic content.' });
    if (user.admin !== true && user.superAdmin !== true) {
      const profile = await db.collection('users').doc(user.uid).get();
      if (!profile.exists || profile.data().uid !== user.uid || profile.data().role !== 'Student') return send(res, 403, { error: 'A VISH HUB student profile is required.' });
    }
    const collections = ['academicYears', 'semesters', 'courses', 'subjects', 'syllabus', 'calendar'];
    const snapshots = await Promise.all(collections.map(name => db.collection(name).where('status', '==', 'published').limit(200).get()));
    const records = Object.fromEntries(collections.map((name, index) => [name,
      snapshots[index].docs.map(document => toStudentAcademicRecord(document.id, name, document.data())).filter(Boolean)
    ]));
    return send(res, 200, { records });
  } catch (error) {
    console.error('Student academic content request failed', { code: error?.code || 'unknown' });
    return send(res, 500, { error: 'Academic content is temporarily unavailable.' });
  }
});

export const studentAssessmentsApi = onRequest({ region: 'us-central1', maxInstances: 20 }, async (req, res) => {
  try {
    res.set('Cache-Control', 'private, no-store');
    const path = req.path.replace(/\/$/, '');
    const submission = req.method === 'POST' && path === '/api/assessments/submit';
    const list = req.method === 'GET' && path === '/api/assessments';
    const detailMatch = req.method === 'GET' && /^\/api\/assessments\/([A-Za-z0-9_-]{1,160})$/.exec(path);
    if (!submission && !list && !detailMatch) return send(res, 404, { error: 'Assessment endpoint not found.' });

    const bearer = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
    if (!bearer) return send(res, 401, { error: 'Sign in with a verified student account to take assessments.' });
    let user;
    try { user = await auth.verifyIdToken(bearer[1], true); }
    catch { return send(res, 401, { error: 'Your session is invalid or expired.' }); }
    if (user.email_verified !== true) return send(res, 403, { error: 'Verify your email before taking assessments.' });
    if (user.admin === true || user.superAdmin === true) return send(res, 403, { error: 'This endpoint is for student accounts.' });
    const profile = await db.collection('users').doc(user.uid).get();
    if (!profile.exists || profile.data().uid !== user.uid || profile.data().role !== 'Student') {
      return send(res, 403, { error: 'A VISH HUB student profile is required.' });
    }

    if (list) {
      const snapshot = await db.collection('mockTests').where('status', '==', 'published').limit(100).get();
      const assessments = snapshot.docs.map(document => toStudentAssessment(document.id, document.data())).filter(Boolean);
      return send(res, 200, { assessments });
    }

    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const assessmentId = submission ? body.assessmentId : detailMatch[1];
    if (typeof assessmentId !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(assessmentId)) return send(res, 400, { error: 'Choose a valid assessment.' });
    const assessmentRef = db.collection('mockTests').doc(assessmentId);
    const assessmentSnapshot = await assessmentRef.get();
    if (!assessmentSnapshot.exists) return send(res, 404, { error: 'This assessment is unavailable.' });
    const assessmentData = assessmentSnapshot.data();
    const assessment = toStudentAssessment(assessmentSnapshot.id, assessmentData);
    if (!assessment) return send(res, 404, { error: 'This assessment is unavailable.' });
    const asDate = value => value?.toDate instanceof Function ? value.toDate() : value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
    const now = Date.now();
    const starts = asDate(assessmentData.startAt)?.getTime();
    const ends = asDate(assessmentData.endAt)?.getTime();
    if ((starts && now < starts) || (ends && now > ends)) return send(res, 403, { error: 'This assessment is not currently available.' });

    const questionIds = assessmentData.questions;
    const questionRefs = questionIds.map(id => db.collection('questions').doc(id));
    const questionSnapshots = await db.getAll(...questionRefs);
    const questions = questionSnapshots.map((snapshot, index) => snapshot.exists
      ? toStudentAssessmentQuestion(questionIds[index], snapshot.data())
      : null);
    if (questions.some(question => !question)) return send(res, 409, { error: 'This assessment is being updated. Please try again later.' });

    if (!submission) {
      return send(res, 200, { assessment: { ...assessment, questions } });
    }
    const result = gradeStudentAssessment(questionSnapshots.map(snapshot => ({ id: snapshot.id, ...snapshot.data() })), body.answers);
    const attemptRef = db.collection('assessmentAttempts').doc();
    await attemptRef.create({
      uid: user.uid,
      assessmentId,
      assessmentTitle: assessment.title,
      subject: assessment.subject,
      score: result.score,
      total: result.total,
      submittedAt: FieldValue.serverTimestamp()
    });
    return send(res, 200, {
      attemptId: attemptRef.id,
      assessment: { id: assessment.id, title: assessment.title, subject: assessment.subject },
      score: result.score,
      total: result.total,
      results: result.results.map(item => ({ ...item, correctOption: questions.find(question => question.id === item.id)?.options[item.correctIndex] || '' }))
    });
  } catch (error) {
    const status = Number.isInteger(error?.status) && error.status < 500 ? error.status : 500;
    if (status === 500) console.error('Student assessments request failed', { code: error?.code || 'unknown' });
    return send(res, status, { error: status < 500 ? error.message : 'Assessments are temporarily unavailable.' });
  }
});

export const studentCommunityApi = onRequest({ region: 'us-central1', maxInstances: 20 }, async (req, res) => {
  try {
    res.set('Cache-Control', 'private, no-store');
    const path = req.path.replace(/\/$/, '');
    const isRead = req.method === 'GET' && path === '/api/community';
    const isWrite = req.method === 'POST' && path === '/api/community';
    if (!isRead && !isWrite) return send(res, 404, { error: 'Community endpoint not found.' });
    const bearer = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
    if (!bearer) return send(res, 401, { error: 'Sign in with a verified student account to use the community.' });
    let user;
    try { user = await auth.verifyIdToken(bearer[1], true); }
    catch { return send(res, 401, { error: 'Your session is invalid or expired.' }); }
    if (user.email_verified !== true) return send(res, 403, { error: 'Verify your email before using the community.' });
    if (user.admin === true || user.superAdmin === true) return send(res, 403, { error: 'This endpoint is for student accounts.' });
    const profileSnapshot = await db.collection('users').doc(user.uid).get();
    if (!profileSnapshot.exists || profileSnapshot.data().uid !== user.uid || profileSnapshot.data().role !== 'Student') {
      return send(res, 403, { error: 'A VISH HUB student profile is required.' });
    }
    const profile = profileSnapshot.data();
    const authorName = String(profile.fullName || profile.name || 'VISH HUB Student').trim().slice(0, 80) || 'VISH HUB Student';
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};

    if (isRead) {
      const postId = typeof req.query.postId === 'string' ? req.query.postId : '';
      if (postId) {
        if (!/^[A-Za-z0-9_-]{1,160}$/.test(postId)) return send(res, 400, { error: 'Choose a valid community post.' });
        const post = await db.collection('communityPosts').doc(postId).get();
        if (!post.exists || !isStudentVisibleCommunityPost(post.data())) return send(res, 404, { error: 'Community post not found.' });
        const snapshot = await db.collection('communityComments').where('postId', '==', postId).limit(100).get();
        const comments = snapshot.docs.map(document => toStudentCommunityComment(document.id, document.data(), { ownPending: document.data().authorUid === user.uid })).filter(Boolean);
        comments.sort((a, b) => Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0));
        return send(res, 200, { comments });
      }
      const [published, ownPending] = await Promise.all([
        db.collection('communityPosts').where('status', 'in', ['published', 'approved']).limit(100).get(),
        db.collection('communityPosts').where('authorUid', '==', user.uid).limit(50).get()
      ]);
      const unique = new Map();
      for (const document of published.docs) {
        const item = toStudentCommunityPost(document.id, document.data());
        if (item) unique.set(item.id, item);
      }
      for (const document of ownPending.docs) {
        const item = toStudentCommunityPost(document.id, document.data(), { ownPending: document.data().authorUid === user.uid });
        if (item) unique.set(item.id, item);
      }
      const posts = [...unique.values()].sort((a, b) => Number(b.pinned) - Number(a.pinned) || Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0)).slice(0, 100);
      return send(res, 200, { posts });
    }

    const action = body.action;
    if (action === 'post') {
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const content = typeof body.body === 'string' ? body.body.trim() : '';
      if (!title || title.length > 180 || !content || content.length > 12000) return send(res, 400, { error: 'Add a title (up to 180 characters) and a post (up to 12,000 characters).' });
      await applyCommunityRateLimit(user.uid, 'post');
      const ref = db.collection('communityPosts').doc();
      await ref.create({ title, body: content, status: 'pending', visibility: 'community', authorUid: user.uid, authorName, pinned: false, createdAt: FieldValue.serverTimestamp() });
      return send(res, 201, { id: ref.id, status: 'pending' });
    }
    if (action === 'comment') {
      const postId = body.postId;
      const content = typeof body.body === 'string' ? body.body.trim() : '';
      if (typeof postId !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(postId) || !content || content.length > 4000) return send(res, 400, { error: 'Choose a post and enter a comment up to 4,000 characters.' });
      const parent = await db.collection('communityPosts').doc(postId).get();
      if (!parent.exists || !isStudentVisibleCommunityPost(parent.data())) return send(res, 404, { error: 'Community post not found.' });
      await applyCommunityRateLimit(user.uid, 'comment');
      const ref = db.collection('communityComments').doc();
      await ref.create({ postId, body: content, status: 'pending', visibility: 'community', authorUid: user.uid, ownerUid: user.uid, authorName, createdAt: FieldValue.serverTimestamp() });
      return send(res, 201, { id: ref.id, status: 'pending' });
    }
    if (action === 'report') {
      const postId = body.postId;
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (typeof postId !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(postId) || !['spam', 'inappropriate', 'misinformation', 'other'].includes(reason)) return send(res, 400, { error: 'Choose a valid post and report reason.' });
      const parent = await db.collection('communityPosts').doc(postId).get();
      if (!parent.exists || !isStudentVisibleCommunityPost(parent.data())) return send(res, 404, { error: 'Community post not found.' });
      const ref = db.collection('communityReports').doc(`${user.uid}_${postId}`);
      try {
        await ref.create({ postId, title: reason, description: typeof body.details === 'string' ? body.details.trim().slice(0, 1000) : '', ownerUid: user.uid, status: 'pending', createdAt: FieldValue.serverTimestamp() });
      } catch (error) {
        if (error?.code === 6 || error?.code === 'already-exists') return send(res, 409, { error: 'You have already reported this post.' });
        throw error;
      }
      return send(res, 201, { status: 'pending' });
    }
    return send(res, 400, { error: 'Choose a valid community action.' });
  } catch (error) {
    const status = Number.isInteger(error?.status) && error.status < 500 ? error.status : 500;
    if (status === 500) console.error('Student community request failed', { code: error?.code || 'unknown' });
    return send(res, status, { error: status < 500 ? error.message : 'The student community is temporarily unavailable.' });
  }
});

function isStudentVisibleCommunityPost(data) {
  return ['published', 'approved'].includes(data?.status) && data?.visibility !== 'private' && data?.visibility !== 'admin';
}

async function applyCommunityRateLimit(uid, action) {
  const ref = db.collection('communityRateLimits').doc(uid);
  const now = Date.now();
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.exists ? snapshot.data() : {};
    const lastPost = data.lastPostAt?.toMillis?.() || 0;
    if (action === 'post' && now - lastPost < 60_000) throw Object.assign(new Error('Please wait a minute before submitting another post.'), { status: 429 });
    const windowStart = data.commentWindowAt?.toMillis?.() || 0;
    const count = now - windowStart < 60_000 ? Number(data.commentCount || 0) : 0;
    if (action === 'comment' && count >= 5) throw Object.assign(new Error('You have reached the comment limit. Please try again in a minute.'), { status: 429 });
    const patch = action === 'post'
      ? { lastPostAt: Timestamp.fromMillis(now) }
      : { commentWindowAt: Timestamp.fromMillis(now - windowStart < 60_000 ? windowStart : now), commentCount: count + 1 };
    transaction.set(ref, { ...data, ...patch }, { merge: true });
  });
}

export const studentNotificationsApi = onRequest({ region: 'us-central1', maxInstances: 20 }, async (req, res) => {
  try {
    res.set('Cache-Control', 'private, no-store');
    const path = req.path.replace(/\/$/, '');
    const isReadAction = req.method === 'POST' && path === '/api/notifications/read';
    if (!isReadAction && (req.method !== 'GET' || path !== '/api/notifications')) {
      return send(res, 404, { error: 'Notification endpoint not found.' });
    }
    const match = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
    if (!match) return send(res, 401, { error: 'A verified VISH HUB account is required.' });
    let user;
    try { user = await auth.verifyIdToken(match[1], true); }
    catch { return send(res, 401, { error: 'Your session is invalid or expired.' }); }
    if (user.email_verified !== true) return send(res, 403, { error: 'Verify your email to access student notifications.' });
    const isTrustedAdmin = user.admin === true || user.superAdmin === true;
    let studentProfile = null;
    if (!isTrustedAdmin) {
      const profile = await db.collection('users').doc(user.uid).get();
      if (!profile.exists || profile.data().uid !== user.uid || profile.data().role !== 'Student') {
        return send(res, 403, { error: 'A VISH HUB student profile is required.' });
      }
      studentProfile = profile.data();
    }
    const userReads = db.collection('notificationReads').doc(user.uid).collection('items');
    if (isReadAction) {
      const ids = req.body?.ids;
      if (!Array.isArray(ids) || ids.length > 100 || !ids.every(id => typeof id === 'string' && /^(notifications|announcements|notices|communityUpdates):[^/]{1,160}$/.test(id))) {
        return send(res, 400, { error: 'Choose up to 100 valid notification IDs.' });
      }
      const uniqueIds = [...new Set(ids)];
      const refs = uniqueIds.map(receiptId => {
        const separator = receiptId.indexOf(':');
        return { receiptId, ref: db.collection(receiptId.slice(0, separator)).doc(receiptId.slice(separator + 1)) };
      });
      const notices = refs.length ? await db.getAll(...refs.map(item => item.ref)) : [];
      const batch = db.batch(); let saved = 0;
      notices.forEach((notice, index) => {
        if (!notice.exists || notice.data().status !== 'published'
          || (!isTrustedAdmin && !studentMatchesAudience(notice.data().target, studentProfile))) return;
        batch.set(userReads.doc(refs[index].receiptId), { notificationId: notice.id, collection: refs[index].receiptId.split(':')[0], readAt: FieldValue.serverTimestamp() }, { merge: true });
        saved += 1;
      });
      if (saved) await batch.commit();
      return send(res, 200, { markedRead: saved });
    }
    const settings = await db.collection('admin').doc('settings').get();
    if (settings.exists && settings.data().notificationSettings?.inAppEnabled === false) return send(res, 200, { items: [] });
    const now = Date.now();
    const namedCollections = ['notifications', 'announcements', 'notices', 'communityUpdates'];
    const snapshots = await Promise.all(namedCollections.map(name => db.collection(name).where('status', '==', 'published').limit(100).get()));
    const visible = snapshots.flatMap((snapshot, index) => snapshot.docs.map(document => ({ collection: namedCollections[index], document }))).filter(({ collection, document }) => {
      const item = document.data();
      const startAt = item.startAt?.toMillis?.() ?? 0;
      const endAt = item.endAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
      return startAt <= now && endAt >= now && (isTrustedAdmin || studentMatchesAudience(item.target, studentProfile))
        && (!item.visibility || item.visibility === 'public' || collection !== 'announcements');
    }).sort((a, b) => (b.document.data().publishedAt?.toMillis?.() || 0) - (a.document.data().publishedAt?.toMillis?.() || 0));
    const limited = visible.slice(0, 100);
    const receiptIds = limited.map(({ collection, document }) => `${collection}:${document.id}`);
    const reads = receiptIds.length ? await db.getAll(...receiptIds.map(id => userReads.doc(id))) : [];
    const items = limited.map(({ collection, document }, index) => {
      const item = document.data();
      return { id: document.id, receiptId: receiptIds[index], collection, title: item.title || '', body: item.body || item.description || '', type: item.type || collection.toUpperCase(), url: item.url || '',
        createdAt: item.publishedAt?.toDate?.().toISOString?.() || item.updatedAt?.toDate?.().toISOString?.() || null,
        read: reads[index]?.exists === true };
    });
    const carouselNotices = limited.filter(item => item.collection === 'notices').slice(0, 4).map(item => ({
      category: item.type || 'VISH HUB UPDATE', title: item.title, message: item.body, action: 'Read update', url: item.url
    }));
    return send(res, 200, { items, notices: carouselNotices });
  } catch (error) {
    console.error('Student notifications request failed', { code: error?.code || 'unknown' });
    return send(res, 500, { error: 'Notifications are temporarily unavailable.' });
  }
});
