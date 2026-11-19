import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Timestamp } from 'firebase-admin/firestore';
import { aggregateResourceEvents, COLLECTION_FIELDS, gradeStudentAssessment, R2_FILE_COLLECTIONS, SCHEDULED_COLLECTIONS, SUBJECT_ACTIVITY_IDS, studentMatchesAudience, toStudentAcademicRecord, toStudentAssessment, toStudentAssessmentQuestion, toStudentCommunityComment, toStudentCommunityPost, toStudentResource, toStudentTimetableEntry, validateContent } from './validation.js';

test('every Admin-managed collection has an explicit writable field schema', () => {
  assert.equal(Object.keys(COLLECTION_FIELDS).length, 20);
  for (const [name, fields] of Object.entries(COLLECTION_FIELDS)) {
    assert.ok(Array.isArray(fields) && fields.length > 0, `${name} schema is missing`);
  }
});

test('subject activity accepts only known FYBA home subject IDs', () => {
  assert.equal(SUBJECT_ACTIVITY_IDS.length, 18);
  assert.equal(new Set(SUBJECT_ACTIVITY_IDS).size, SUBJECT_ACTIVITY_IDS.length);
  assert.ok(SUBJECT_ACTIVITY_IDS.includes('common-vec'));
  assert.ok(SUBJECT_ACTIVITY_IDS.includes('oe-geology'));
  assert.equal(SUBJECT_ACTIVITY_IDS.includes('admin'), false);
});

test('subject activity endpoint requires verified student ownership and stores no raw UID', () => {
  const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  const endpoint = source.match(/export const studentSubjectActivityApi = onRequest\([\s\S]*?(?=\nexport const studentTimetableApi)/)?.[0] || '';
  assert.match(endpoint, /auth\.verifyIdToken\(bearer\[1\], true\)/);
  assert.match(endpoint, /user\.email_verified !== true/);
  assert.match(endpoint, /profile\.data\(\)\.role !== 'Student'/);
  assert.match(endpoint, /SUBJECT_ACTIVITY_IDS\.includes\(subject\)/);
  assert.match(endpoint, /createHash\('sha256'\)/);
  assert.match(endpoint, /transaction\.create\(ref, \{ subject, day, createdAt: FieldValue\.serverTimestamp\(\), expireAt \}\)/);
  assert.doesNotMatch(endpoint, /transaction\.create\(ref, \{[^}]*\buid\s*:/s);
});

test('every Admin R2 file collection supports managed object replacement and deletion', () => {
  for (const collection of R2_FILE_COLLECTIONS) {
    assert.ok(COLLECTION_FIELDS[collection]?.includes('storageKey'), `${collection} has no managed storage key field`);
  }
});

test('student resource payloads include only safe published library fields', () => {
  const item = toStudentResource('paper-1', 'questionPapers', {
    title: 'Semester paper', description: 'Paper description', subject: 'psychology',
    category: 'Question paper', type: 'pdf', storageKey: 'admin-uploads/private.pdf',
    ownerUid: 'private-uid', adminFeedback: 'internal review', status: 'published'
  }, 'https://signed.example/file');
  assert.deepEqual(Object.keys(item), ['id', 'collection', 'title', 'description', 'subject', 'category', 'type', 'url']);
  assert.equal(item.url, 'https://signed.example/file');
  assert.equal(item.storageKey, undefined);
  assert.equal(item.ownerUid, undefined);
  assert.equal(item.adminFeedback, undefined);
  assert.equal(toStudentResource('paper-2', 'studyMaterials', { title: 'Bad legacy link' }, 'javascript:alert(1)').url, '');
  const scholarship = toStudentResource('scheme-1', 'scholarships', {
    title: 'Scheme', eligibility: 'FYBA students', deadline: new Date('2026-12-01T00:00:00Z'), documents: ['ID proof'], adminFeedback: 'private'
  }, 'https://signed.example/scheme');
  assert.equal(scholarship.eligibility, 'FYBA students');
  assert.equal(scholarship.deadline, '1 Dec 2026');
  assert.deepEqual(scholarship.documents, ['ID proof']);
  assert.equal(scholarship.adminFeedback, undefined);
  assert.equal(toStudentResource('x', 'questions', { title: 'secret' }, ''), null);
  assert.equal(toStudentResource('x'.repeat(161), 'studyMaterials', {}, ''), null);
});

test('student timetable payloads require published records and expose only display fields', () => {
  const item = toStudentTimetableEntry('paper-1', {
    status: 'published', title: 'Indian Knowledge System', subject: 'IKS', type: 'exam',
    examDate: '2026-12-01', location: 'College Hall', ownerUid: 'private-uid', adminNotes: 'internal'
  });
  assert.equal(item.category, 'Common');
  assert.equal(item.date, '2026-12-01');
  assert.equal(item.paper, 'Indian Knowledge System');
  assert.equal(item.ownerUid, undefined);
  assert.equal(item.adminNotes, undefined);
  assert.equal(toStudentTimetableEntry('draft', { status: 'draft', examDate: '2026-12-01' }), null);
  assert.equal(toStudentTimetableEntry('no-date', { status: 'published', title: 'No date' }), null);
});

test('published student assessment payloads never expose answer keys or explanations', () => {
  const assessment = toStudentAssessment('test-1', {
    status: 'published', title: 'IKS review', subject: 'IKS', durationMinutes: 20,
    questions: ['q-1'], answer: 'private', ownerUid: 'admin-uid'
  });
  assert.equal(assessment.questionCount, 1);
  assert.equal(assessment.ownerUid, undefined);
  assert.equal(toStudentAssessment('duplicate', { status: 'published', title: 'Repeated', questions: ['q-1', 'q-1'] }), null);
  assert.equal(toStudentAssessment('bad-id', { status: 'published', title: 'Bad ID', questions: ['../users'] }), null);
  const question = toStudentAssessmentQuestion('q-1', {
    status: 'published', title: 'Which is correct?', options: ['Option A', 'Option B'], answer: 'B', explanation: 'private rationale'
  });
  assert.deepEqual(question, { id: 'q-1', prompt: 'Which is correct?', options: ['Option A', 'Option B'], unit: '' });
  assert.equal(toStudentAssessmentQuestion('q-2', { status: 'published', title: 'Missing key', options: ['A', 'B'], answer: 'Other' }), null);
  assert.equal(toStudentAssessment('draft', { status: 'draft', title: 'Draft', questions: ['q-1'] }), null);
});

test('assessment grading validates complete answers and returns scores only after submission', () => {
  const questions = [
    { id: 'q1', title: 'Pick B', options: ['A', 'B'], answer: 'B' },
    { id: 'q2', title: 'Pick first', options: ['First', 'Second'], answer: '0' }
  ];
  assert.deepEqual(gradeStudentAssessment(questions, { q1: 1, q2: 0 }), {
    score: 2, total: 2, results: [
      { id: 'q1', prompt: 'Pick B', selectedIndex: 1, correctIndex: 1, correct: true },
      { id: 'q2', prompt: 'Pick first', selectedIndex: 0, correctIndex: 0, correct: true }
    ]
  });
  assert.throws(() => gradeStudentAssessment(questions, { q1: 1 }), /one answer for each/);
  assert.throws(() => gradeStudentAssessment(questions, { q1: 1, q2: 0, other: 1 }), /one answer for each/);
  assert.throws(() => gradeStudentAssessment(questions, { q1: 9, q2: 0 }), /selected answers are invalid/);
});

test('community responses expose only approved content and a safe display name', () => {
  const post = toStudentCommunityPost('post-1', {
    title: 'Study group', body: 'Let us revise IKS.', status: 'approved', visibility: 'community', authorUid: 'private-uid', email: 'private@example.com', authorName: 'FYBA learner', createdAt: new Date('2026-11-19T10:00:00Z')
  });
  assert.deepEqual(Object.keys(post), ['id', 'title', 'body', 'status', 'authorName', 'createdAt', 'pinned', 'ownPending', 'ownRejected']);
  assert.equal(post.authorName, 'FYBA learner');
  assert.equal(post.authorUid, undefined);
  assert.equal(toStudentCommunityPost('pending', { title: 'Draft', body: 'Hidden', status: 'pending' }), null);
  const ownPending = toStudentCommunityPost('mine', { title: 'Draft', body: 'Mine', status: 'pending', authorUid: 'my-uid' }, { ownPending: true });
  assert.equal(ownPending.ownPending, true);
  assert.equal(toStudentCommunityPost('rejected', { title: 'Mine', body: 'Mine', status: 'rejected', authorUid: 'my-uid' }, { ownPending: true }).ownRejected, true);
  const comment = toStudentCommunityComment('comment-1', { body: 'Thanks!', status: 'approved', authorUid: 'private-uid', ownerUid: 'private-uid', authorName: 'Learner' });
  assert.equal(comment.body, 'Thanks!');
  assert.equal(comment.ownerUid, undefined);
  assert.equal(toStudentCommunityComment('private', { body: 'Hidden', status: 'pending' }), null);
});

test('student academic payloads expose only published, allowlisted fields', () => {
  const record = toStudentAcademicRecord('unit-1', 'syllabus', {
    status: 'published', title: 'Introduction', subject: 'Psychology', unit: 'Unit 1',
    description: 'Foundational concepts', order: 1, startAt: new Date('2026-06-01T00:00:00Z'),
    answer: 'secret', ownerUid: 'private-uid', adminNotes: 'internal'
  });
  assert.equal(record.title, 'Introduction');
  assert.equal(record.subject, 'Psychology');
  assert.equal(record.startAt, '2026-06-01T00:00:00.000Z');
  assert.equal(record.answer, undefined);
  assert.equal(record.ownerUid, undefined);
  assert.equal(record.adminNotes, undefined);
  assert.equal(toStudentAcademicRecord('draft', 'syllabus', { status: 'draft', title: 'Hidden' }), null);
  assert.equal(toStudentAcademicRecord('wrong', 'questions', { status: 'published', title: 'Question' }), null);
});

test('resource analytics separates matching IDs across collections and supports legacy events', () => {
  const totals = aggregateResourceEvents([
    { collection: 'studyMaterials', resourceId: 'same-id', action: 'view' },
    { collection: 'questionPapers', resourceId: 'same-id', action: 'download' },
    { resourceId: 'legacy-id', action: 'view' },
    { collection: 'adminActivity', resourceId: 'private-id', action: 'view' },
    { collection: 'assignments', resourceId: 'invalid', action: 'delete' }
  ]);
  assert.equal(totals.length, 3);
  assert.ok(totals.some(item => item.collection === 'studyMaterials' && item.resourceId === 'same-id' && item.views === 1));
  assert.ok(totals.some(item => item.collection === 'questionPapers' && item.resourceId === 'same-id' && item.downloads === 1));
  assert.ok(totals.some(item => item.collection === 'studyMaterials' && item.resourceId === 'legacy-id'));
});

test('content requires a title/name/body and defaults new records to draft', () => {
  assert.deepEqual(validateContent('notices', { title: 'Exam update' }, { creating: true }), { title: 'Exam update', status: 'draft' });
  assert.throws(() => validateContent('notices', { title: '  ' }, { creating: true }), /title or body is required/);
  assert.throws(() => validateContent('notices', { title: 'Update', role: 'admin' }), /Unsupported field/);
});

test('record status, links, text sizes and structured values are validated', () => {
  assert.throws(() => validateContent('announcements', { title: 'Update', status: 'superuser' }), /Unsupported status/);
  assert.throws(() => validateContent('announcements', { title: 'Update', status: 'published', url: 'javascript:alert(1)' }), /safe HTTPS/);
  assert.throws(() => validateContent('notices', { title: 'Update', status: 'published', pinned: 'yes' }), /true or false/);
  assert.throws(() => validateContent('questions', { title: 'Q', status: 'published', options: Array(21).fill('A') }), /at most 20/);
  assert.throws(() => validateContent('questions', { title: 'Q', status: 'published', difficulty: 'expert' }), /Difficulty/);
});

test('scheduled content needs a valid start date and end must follow start', () => {
  assert.throws(() => validateContent('notices', { title: 'Update', status: 'scheduled' }), /Set a start date/);
  assert.throws(() => validateContent('notices', { title: 'Update', status: 'scheduled', startAt: 'not a date' }), /valid date/);
  assert.throws(() => validateContent('notices', { title: 'Update', status: 'scheduled', startAt: '2026-01-02T00:00:00Z', endAt: '2026-01-01T00:00:00Z' }), /End date must be after/);
  const valid = validateContent('notices', { title: 'Update', status: 'scheduled', startAt: '2026-01-02T00:00:00Z' });
  assert.ok(valid.startAt instanceof Timestamp);
});

test('notification audience is restricted to supported student audiences', () => {
  const created = validateContent('notifications', { title: 'Notice', status: 'published' }, { creating: true });
  assert.equal(created.target, 'students');
  const group = validateContent('notifications', { title: 'Notice', status: 'published', target: 'division:A' });
  assert.equal(group.target, 'division:A');
  assert.throws(() => validateContent('notifications', { title: 'Notice', status: 'published', target: 'uid:someone' }), /Audience/);
  assert.throws(() => validateContent('notifications', { title: 'Notice', status: 'published', target: 'division:A/../../users' }), /Audience/);
  assert.equal(studentMatchesAudience('division:A', { division: 'a' }), true);
  assert.equal(studentMatchesAudience('division:A', { division: 'B' }), false);
  assert.equal(studentMatchesAudience('elective:Psychology', { electives: ['psychology'] }), true);
  assert.equal(studentMatchesAudience('elective:Psychology', {}), false);
});

test('content collection allowlist rejects unsupported collection names', () => {
  assert.throws(() => validateContent('users', { title: 'No' }), /not supported/);
});

test('Firestore keeps Admin authority claim-based and managed content client-write protected', () => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  assert.match(rules, /request\.auth\.token\.admin\s*==\s*true\s*\|\|\s*request\.auth\.token\.superAdmin\s*==\s*true/);
  assert.match(rules, /allow list:\s*if trustedAdmin\(\)/);
  assert.match(rules, /match \/users\/\{uid\}[\s\S]*?allow get: if isOwner\(uid\) \|\| trustedAdmin\(\)/);
  for (const collection of ['notices', 'announcements', 'studyMaterials', 'notifications', 'communityPosts', 'studentActivity']) {
    assert.ok(rules.includes(`match /${collection}/`), `${collection} Firestore match is missing`);
  }
  assert.match(rules, /match \/studyMaterials\/\{materialId\}[\s\S]*?allow create, update, delete: if false/);
  assert.match(rules, /match \/communityPosts\/\{recordId\}[\s\S]*?allow create, update, delete: if false/);
  assert.match(rules, /match \/questions\/\{recordId\} \{ allow get, list: if trustedAdmin\(\)/);
  assert.match(rules, /match \/communityComments\/\{recordId\} \{ allow get, list: if trustedAdmin\(\)/);
  assert.match(rules, /match \/studentActivity\/\{eventId\}[\s\S]*?allow get, list: if trustedAdmin\(\)[\s\S]*?allow create, update, delete: if false/);
  assert.match(rules, /match \/subjectEvents\/\{eventId\}[\s\S]*?allow get, list: if trustedAdmin\(\)[\s\S]*?allow create, update, delete: if false/);
  assert.match(rules, /match \/assessmentAttempts\/\{attemptId\}[\s\S]*?allow get, list: if trustedAdmin\(\)[\s\S]*?allow create, update, delete: if false/);
  assert.match(rules, /match \/communityRateLimits\/\{uid\}[\s\S]*?allow get, list: if trustedAdmin\(\)[\s\S]*?allow create, update, delete: if false/);
  assert.match(rules, /match \/resourceEvents\/\{eventId\}[\s\S]*?allow read, write: if false/);
  assert.match(rules, /function studentMatchesAudience\(data\)/);
  assert.match(rules, /match \/notifications\/\{notificationId\}[\s\S]*?canReadTargetedPublishedRecord\(\)/);
  const indexes = JSON.parse(readFileSync(new URL('../firestore.indexes.json', import.meta.url), 'utf8'));
  assert.ok(indexes.fieldOverrides.some(item => item.collectionGroup === 'studentActivity' && item.fieldPath === 'expireAt' && item.ttl === true), 'student activity TTL policy is missing');
  assert.ok(indexes.fieldOverrides.some(item => item.collectionGroup === 'subjectEvents' && item.fieldPath === 'expireAt' && item.ttl === true), 'subject analytics TTL policy is missing');
  for (const collection of SCHEDULED_COLLECTIONS) {
    assert.ok(indexes.indexes.some(index => index.collectionGroup === collection
      && index.fields.some(field => field.fieldPath === 'status' && field.order === 'ASCENDING')
      && index.fields.some(field => field.fieldPath === 'startAt' && field.order === 'ASCENDING')),
    `${collection} scheduler composite index is missing`);
  }
});
