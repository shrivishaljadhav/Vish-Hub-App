import { Timestamp } from 'firebase-admin/firestore';

export const SUBJECT_ACTIVITY_IDS = Object.freeze([
  'psychology', 'philosophy', 'economics', 'english', 'history', 'politics',
  'common-aec', 'common-vec', 'common-iks',
  'sec-psychology', 'sec-economics', 'sec-english', 'sec-politics',
  'oe-zoology', 'oe-botany', 'oe-electronics', 'oe-geography', 'oe-geology'
]);

const VALUE_LIMITS = {
  title: 180, name: 160, description: 4000, body: 30000, content: 30000,
  subject: 100, category: 100, type: 80, status: 40, url: 2048, fileUrl: 2048,
  storageKey: 512, fileName: 180, contentType: 120, difficulty: 32, explanation: 8000, answer: 4000, eligibility: 4000,
  unit: 160, chapter: 160, authorUid: 128, authorName: 80, postId: 160, target: 80, visibility: 32,
  feedback: 2000, adminFeedback: 2000, ownerUid: 128, division: 40,
  rollNo: 40, prn: 40, email: 254, role: 32, uid: 128, bio: 1000
};

const ALLOWED_STATUSES = new Set([
  'draft', 'published', 'scheduled', 'archived', 'pending', 'approved', 'rejected',
  'active', 'inactive', 'hidden', 'resolved', 'dismissed'
]);

export const COLLECTION_FIELDS = Object.freeze({
  notices: ['title', 'status', 'description', 'body', 'url', 'startAt', 'endAt', 'type', 'target', 'pinned', 'priority'],
  announcements: ['title', 'status', 'description', 'body', 'url', 'startAt', 'endAt', 'type', 'target', 'pinned', 'priority'],
  communityUpdates: ['title', 'status', 'description', 'body', 'url', 'startAt', 'endAt', 'type', 'target', 'pinned', 'priority'],
  studyMaterials: ['title', 'status', 'description', 'subject', 'category', 'url', 'fileUrl', 'storageKey', 'type', 'tags', 'unit', 'chapter', 'authorUid', 'fileName', 'fileSize', 'contentType'],
  timetable: ['title', 'status', 'description', 'subject', 'type', 'startAt', 'endAt', 'examDate', 'location', 'semester'],
  scholarships: ['title', 'status', 'description', 'body', 'url', 'fileUrl', 'storageKey', 'startAt', 'endAt', 'eligibility', 'documents', 'deadline'],
  academicYears: ['title', 'name', 'status', 'startAt', 'endAt'],
  semesters: ['title', 'name', 'status', 'description', 'startAt', 'endAt'],
  courses: ['title', 'name', 'status', 'description', 'category'],
  subjects: ['title', 'name', 'status', 'description', 'category', 'course', 'semester', 'order'],
  syllabus: ['title', 'name', 'status', 'description', 'subject', 'unit', 'chapter', 'order'],
  calendar: ['title', 'status', 'description', 'type', 'startAt', 'endAt'],
  questions: ['title', 'status', 'subject', 'unit', 'chapter', 'difficulty', 'type', 'options', 'answer', 'explanation', 'tags'],
  questionPapers: ['title', 'status', 'description', 'subject', 'semester', 'url', 'fileUrl', 'storageKey', 'type'],
  mockTests: ['title', 'status', 'description', 'subject', 'questions', 'startAt', 'endAt', 'durationMinutes'],
  assignments: ['title', 'status', 'description', 'subject', 'startAt', 'endAt', 'fileUrl', 'storageKey'],
  notifications: ['title', 'status', 'body', 'target', 'startAt', 'endAt', 'type', 'url'],
  communityPosts: ['title', 'body', 'status', 'authorUid', 'authorName', 'visibility', 'pinned'],
  communityComments: ['body', 'status', 'authorUid', 'ownerUid', 'authorName', 'postId', 'visibility'],
  communityReports: ['title', 'description', 'status', 'ownerUid', 'postId', 'adminFeedback', 'reviewedAt', 'reviewedBy']
});

export const SCHEDULED_COLLECTIONS = Object.freeze([
  'notices', 'announcements', 'communityUpdates', 'studyMaterials', 'notifications',
  'scholarships', 'timetable', 'calendar', 'questions', 'questionPapers', 'mockTests', 'assignments'
]);
export const R2_FILE_COLLECTIONS = Object.freeze(['studyMaterials', 'questionPapers', 'assignments', 'scholarships']);

// Return only fields intended for the authenticated student resource library.
// Admin metadata (storageKey, review notes, audit fields and ownership) is never
// included in the browser response.
export function toStudentResource(id, collection, data, url) {
  if (!R2_FILE_COLLECTIONS.includes(collection) || typeof id !== 'string' || !id || id.length > 160) return null;
  const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
  let safeUrl = '';
  try { if (typeof url === 'string' && new URL(url).protocol === 'https:') safeUrl = url.slice(0, 2048); } catch { /* Omit invalid legacy links. */ }
  const resource = {
    id,
    collection,
    title: text(data?.title, 180),
    description: text(data?.description, 4000),
    subject: text(data?.subject, 100),
    category: text(data?.category, 100),
    type: text(data?.type, 80),
    url: safeUrl
  };
  if (collection === 'scholarships') {
    const deadlineDate = data?.deadline?.toDate instanceof Function ? data.deadline.toDate() : data?.deadline instanceof Date ? data.deadline : typeof data?.deadline === 'string' ? new Date(data.deadline) : null;
    resource.body = text(data?.body, 30000);
    resource.eligibility = text(data?.eligibility, 4000);
    resource.deadline = deadlineDate && Number.isFinite(deadlineDate.getTime())
      ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }).format(deadlineDate)
      : text(data?.deadline, 80);
    resource.documents = Array.isArray(data?.documents) ? data.documents.filter(item => typeof item === 'string').slice(0, 40).map(item => text(item, 240)) : [];
  }
  return resource;
}

export function aggregateResourceEvents(events) {
  const totals = new Map();
  for (const event of events || []) {
    if (typeof event?.resourceId !== 'string' || !event.resourceId || event.resourceId.length > 160 || !['view', 'download'].includes(event.action)) continue;
    if (event.collection !== undefined && !R2_FILE_COLLECTIONS.includes(event.collection)) continue;
    const collection = R2_FILE_COLLECTIONS.includes(event.collection) ? event.collection : 'studyMaterials';
    const key = `${collection}:${event.resourceId}`;
    const item = totals.get(key) || { collection, resourceId: event.resourceId, views: 0, downloads: 0 };
    item[event.action === 'view' ? 'views' : 'downloads'] += 1;
    totals.set(key, item);
  }
  return [...totals.values()];
}

export function toStudentTimetableEntry(id, data) {
  if (typeof id !== 'string' || !id || id.length > 160 || data?.status !== 'published') return null;
  const asDate = value => {
    const date = value?.toDate instanceof Function ? value.toDate() : value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
    return date && Number.isFinite(date.getTime()) ? date : null;
  };
  const start = asDate(data.startAt) || asDate(data.examDate);
  if (!start) return null;
  const end = asDate(data.endAt);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(start);
  const timeOptions = { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true };
  const startTime = new Intl.DateTimeFormat('en-IN', timeOptions).format(start);
  const endTime = end ? new Intl.DateTimeFormat('en-IN', timeOptions).format(end) : '';
  const source = `${data.subject || ''} ${data.type || ''}`.toLowerCase();
  const category = /\bsec\b/.test(source) ? 'SEC' : /\boe\b/.test(source) ? 'OE' : /\b(aec|vec|iks)\b|common/.test(source) ? 'Common' : 'Major';
  const bounded = (value, size) => typeof value === 'string' ? value.slice(0, size) : '';
  return {
    category,
    subject: bounded(data.subject, 100) || (category === 'Common' ? 'Common Subject' : category === 'Major' ? 'Major Subject' : `${category} Subject`),
    paper: bounded(data.title, 180) || bounded(data.name, 180) || 'Examination',
    code: id,
    date,
    time: startTime + (endTime ? ` – ${endTime}` : ''),
    location: bounded(data.location, 160),
    semester: bounded(data.semester, 80)
  };
}

export function toStudentAcademicRecord(id, collection, data) {
  const publicCollections = new Set(['academicYears', 'semesters', 'courses', 'subjects', 'syllabus', 'calendar']);
  if (!publicCollections.has(collection) || typeof id !== 'string' || !id || id.length > 160 || data?.status !== 'published') return null;
  const text = (value, max = 4000) => typeof value === 'string' ? value.slice(0, max) : '';
  const isoDate = value => {
    const date = value?.toDate instanceof Function ? value.toDate() : value instanceof Date ? value : null;
    return date && Number.isFinite(date.getTime()) ? date.toISOString() : '';
  };
  const record = { id, collection, title: text(data.title || data.name, 180), description: text(data.description) };
  for (const key of ['subject', 'category', 'course', 'semester', 'unit', 'chapter', 'type', 'location']) {
    if (typeof data[key] === 'string') record[key] = text(data[key], key === 'description' ? 4000 : 160);
  }
  if (Number.isInteger(data.order) && data.order >= 0) record.order = data.order;
  for (const key of ['startAt', 'endAt']) { const date = isoDate(data[key]); if (date) record[key] = date; }
  return record;
}

const normalizedAnswer = value => String(value ?? '').trim().toLocaleLowerCase('en');

function correctOptionIndex(question) {
  if (!Array.isArray(question?.options) || question.options.length < 2 || question.options.length > 20) return -1;
  const answer = normalizedAnswer(question.answer);
  if (!answer) return -1;
  if (/^\d{1,2}$/.test(answer)) {
    const index = Number(answer);
    if (index >= 0 && index < question.options.length) return index;
  }
  if (/^[a-t]$/.test(answer)) {
    const index = answer.charCodeAt(0) - 97;
    if (index < question.options.length) return index;
  }
  return question.options.findIndex(option => normalizedAnswer(option) === answer);
}

export function toStudentAssessment(id, data) {
  const dateValue = value => {
    const date = value?.toDate instanceof Function ? value.toDate() : value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
    return date && Number.isFinite(date.getTime()) ? date : null;
  };
  if (typeof id !== 'string' || !id || id.length > 160 || data?.status !== 'published'
    || typeof data.title !== 'string' || !data.title.trim()
    || !Array.isArray(data.questions) || data.questions.length < 1 || data.questions.length > 100
    || new Set(data.questions).size !== data.questions.length
    || !data.questions.every(questionId => typeof questionId === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(questionId))
    || ['startAt', 'endAt'].some(field => data[field] != null && !dateValue(data[field]))) return null;
  const dateIso = value => dateValue(value)?.toISOString() || '';
  return {
    id,
    title: data.title.slice(0, 180),
    description: typeof data.description === 'string' ? data.description.slice(0, 4000) : '',
    subject: typeof data.subject === 'string' ? data.subject.slice(0, 100) : '',
    durationMinutes: Number.isInteger(data.durationMinutes) && data.durationMinutes >= 1 && data.durationMinutes <= 300 ? data.durationMinutes : null,
    startAt: dateIso(data.startAt),
    endAt: dateIso(data.endAt),
    questionCount: data.questions.length
  };
}

export function toStudentAssessmentQuestion(id, data) {
  if (typeof id !== 'string' || !id || id.length > 160 || data?.status !== 'published'
    || typeof data.title !== 'string' || !data.title.trim()
    || !Array.isArray(data.options) || data.options.length < 2 || data.options.length > 20
    || !data.options.every(option => typeof option === 'string' && option.trim() && option.length <= 1000)
    || correctOptionIndex(data) < 0) return null;
  return {
    id,
    prompt: data.title.slice(0, 1000),
    options: data.options.map(option => option.slice(0, 1000)),
    unit: typeof data.unit === 'string' ? data.unit.slice(0, 120) : ''
  };
}

export function gradeStudentAssessment(questions, answers) {
  if (!Array.isArray(questions) || !questions.length || questions.length > 100 || !answers || typeof answers !== 'object' || Array.isArray(answers)) {
    fail('Assessment answers are invalid.');
  }
  const expectedIds = new Set(questions.map(question => question.id));
  const answerIds = Object.keys(answers);
  if (answerIds.length > 100 || answerIds.length !== expectedIds.size || answerIds.some(id => !expectedIds.has(id))) fail('Submit one answer for each question.');
  let score = 0;
  const results = questions.map(question => {
    const answer = answers[question.id];
    const selectedIndex = typeof answer === 'number' ? answer : Number(answer);
    if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= question.options.length) fail('One or more selected answers are invalid.');
    const correctIndex = correctOptionIndex(question);
    const correct = correctIndex === selectedIndex;
    if (correct) score += 1;
    return { id: question.id, prompt: question.title.slice(0, 1000), selectedIndex, correctIndex, correct };
  });
  return { score, total: questions.length, results };
}

export function toStudentCommunityPost(id, data, { ownPending = false } = {}) {
  if (typeof id !== 'string' || !id || id.length > 160 || !data || typeof data.title !== 'string' || typeof data.body !== 'string') return null;
  const publicPost = ['published', 'approved'].includes(data.status) && data.visibility !== 'private' && data.visibility !== 'admin';
  if (!publicPost && !(ownPending && ['pending', 'rejected'].includes(data.status))) return null;
  const createdAt = data.createdAt?.toDate instanceof Function ? data.createdAt.toDate() : data.createdAt instanceof Date ? data.createdAt : typeof data.createdAt === 'string' ? new Date(data.createdAt) : null;
  return {
    id,
    title: data.title.slice(0, 180),
    body: data.body.slice(0, 12000),
    status: data.status,
    authorName: typeof data.authorName === 'string' && data.authorName.trim() ? data.authorName.trim().slice(0, 80) : 'VISH HUB Student',
    createdAt: createdAt && Number.isFinite(createdAt.getTime()) ? createdAt.toISOString() : '',
    pinned: data.pinned === true,
    ownPending: data.status === 'pending',
    ownRejected: data.status === 'rejected'
  };
}

export function toStudentCommunityComment(id, data, { ownPending = false } = {}) {
  if (typeof id !== 'string' || !id || id.length > 160 || typeof data?.body !== 'string') return null;
  const publicComment = ['published', 'approved'].includes(data.status) && data.visibility !== 'private' && data.visibility !== 'admin';
  if (!publicComment && !(ownPending && ['pending', 'rejected'].includes(data.status))) return null;
  const createdAt = data.createdAt?.toDate instanceof Function ? data.createdAt.toDate() : data.createdAt instanceof Date ? data.createdAt : typeof data.createdAt === 'string' ? new Date(data.createdAt) : null;
  return {
    id,
    body: data.body.slice(0, 4000),
    status: data.status,
    authorName: typeof data.authorName === 'string' && data.authorName.trim() ? data.authorName.trim().slice(0, 80) : 'VISH HUB Student',
    createdAt: createdAt && Number.isFinite(createdAt.getTime()) ? createdAt.toISOString() : '',
    ownPending: data.status === 'pending',
    ownRejected: data.status === 'rejected'
  };
}

function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

const asText = (value, max = 4000) => typeof value === 'string' && value.length <= max;

export function validateContent(collectionName, input, { creating = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('A content object is required.');
  const fields = COLLECTION_FIELDS[collectionName];
  if (!fields) fail('This content type is not supported.', 404);
  const unknown = Object.keys(input).filter(key => !fields.includes(key));
  if (unknown.length) fail(`Unsupported field: ${unknown[0]}`);
  const data = { ...input };
  if (creating && !data.status) data.status = 'draft';
  const listFields = new Set(['tags', 'options', 'questions', 'documents']);
  const booleanFields = new Set(['pinned']);
  const numericFields = new Set(['fileSize', 'order', 'downloads', 'views', 'priority', 'durationMinutes']);
  const dateFields = new Set(['examDate', 'deadline']);
  for (const [key, value] of Object.entries(data)) {
    if (key.endsWith('At') || dateFields.has(key)) {
      if (value !== null && (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))) fail(`${key} must be a valid date.`);
      if (value !== null) data[key] = Timestamp.fromDate(new Date(value));
    } else if (listFields.has(key)) {
      if (!Array.isArray(value) || value.length > 300) fail(`${key} must be a short list.`);
    } else if (booleanFields.has(key)) {
      if (typeof value !== 'boolean') fail(`${key} must be true or false.`);
    } else if (numericFields.has(key)) {
      const maximum = key === 'fileSize' ? 100 * 1024 * 1024 : 1000000;
      if (!Number.isInteger(value) || value < 0 || value > maximum) fail(`${key} must be a non-negative whole number within the allowed range.`);
    } else {
      if (typeof value !== 'string') fail(`${key} must be text.`);
      const limit = VALUE_LIMITS[key] || 4000;
      if (!asText(value, limit)) fail(`${key} is too long.`);
      if (['url', 'fileUrl'].includes(key) && value) {
        let parsed; try { parsed = new URL(value); } catch { fail(`${key} is invalid.`); }
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password) fail(`${key} must use a safe HTTPS link.`);
      }
      if (key === 'status' && !ALLOWED_STATUSES.has(value)) fail('Unsupported status value.');
      if (key === 'difficulty' && !['easy', 'medium', 'hard'].includes(value.toLowerCase())) fail('Difficulty must be Easy, Medium, or Hard.');
    }
  }
  for (const key of ['tags', 'questions', 'documents']) {
    if (data[key] && (!data[key].every(item => typeof item === 'string' && item.length <= 512))) fail(`${key} must contain only short text values.`);
  }
  if (data.options && (data.options.length > 20 || !data.options.every(item => typeof item === 'string' && item.length <= 1000))) fail('Options must be a list of at most 20 text choices.');
  if (data.startAt && data.endAt && data.endAt.toDate() < data.startAt.toDate()) fail('End date must be after the start date.');
  if (!String(data.title || data.name || data.body || '').trim()) fail('A title or body is required.');
  if (data.publishedAt && !data.status) fail('A publication status is required.');
  if (data.status === 'scheduled' && !data.startAt) fail('Set a start date before scheduling this record.');
  if (collectionName === 'notifications') {
    if (creating && !data.target) data.target = 'students';
  }
  if (data.target && !['students', 'all'].includes(data.target)
    && !/^(division|elective):[A-Za-z0-9 _.-]{1,40}$/.test(data.target)) {
    fail('Audience must be Students, All, division:<value>, or elective:<value>.');
  }
  return data;
}

export function studentMatchesAudience(target, profile = {}) {
  if (!target || target === 'students' || target === 'all') return true;
  const match = /^(division|elective):([A-Za-z0-9 _.-]{1,40})$/.exec(target);
  if (!match) return false;
  const [, kind, value] = match;
  if (kind === 'division') return typeof profile.division === 'string' && profile.division.trim().toLowerCase() === value.trim().toLowerCase();
  return Array.isArray(profile.electives) && profile.electives.some(item => typeof item === 'string' && item.trim().toLowerCase() === value.trim().toLowerCase());
}
