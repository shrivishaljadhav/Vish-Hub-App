import { adminApi } from './api.js';

const $ = selector => document.querySelector(selector);
const R2_FILE_COLLECTIONS = new Set(['studyMaterials', 'questionPapers', 'assignments', 'scholarships']);
const PAGE_CONFIG = {
  resources: { title: 'Study resources', description: 'Upload, publish, search and maintain study materials in the shared library.', eyebrow: 'R2 RESOURCE LIBRARY', collections: [['studyMaterials', 'Study materials']], createLabel: 'Add resource' },
  academics: { title: 'Academic structure', description: 'Maintain academic years, semesters, courses, subjects, syllabus and the examination calendar.', eyebrow: 'ACADEMIC MANAGEMENT', collections: [['academicYears', 'Academic years'], ['semesters', 'Semesters'], ['courses', 'Courses'], ['subjects', 'Subjects'], ['syllabus', 'Syllabus units'], ['timetable', 'Timetable'], ['calendar', 'Calendar']], createLabel: 'Add academic record' },
  assessments: { title: 'Questions & assessments', description: 'Manage questions, papers, mock tests, assignments and student submissions.', eyebrow: 'ASSESSMENT MANAGEMENT', collections: [['questions', 'Question bank'], ['questionPapers', 'Question papers'], ['mockTests', 'Mock tests'], ['assignments', 'Assignments'], ['submissions', 'Student submissions']], createLabel: 'Add assessment' },
  communications: { title: 'Notices & announcements', description: 'Draft, publish, schedule and archive student-facing communications.', eyebrow: 'STUDENT COMMUNICATIONS', collections: [['notices', 'Notices'], ['announcements', 'Announcements'], ['communityUpdates', 'Community updates'], ['notifications', 'Notification records']], createLabel: 'Create announcement' },
  community: { title: 'Community moderation', description: 'Review posts, comments and reports. Every moderation decision is recorded.', eyebrow: 'COMMUNITY SAFETY', collections: [['communityPosts', 'Posts'], ['communityComments', 'Comments'], ['communityReports', 'Reports']], createLabel: 'Create admin post' },
  analytics: { title: 'Analytics & reports', description: 'View counts and activity derived from current Firebase records. Missing sources remain unavailable.', eyebrow: 'LIVE PLATFORM ANALYTICS', collections: [], createLabel: '' },
  settings: { title: 'Platform settings', description: 'Store configuration reserved for Super Admins. Registration and maintenance flags take effect only after the student app reads them.', eyebrow: 'SYSTEM CONTROLS', collections: [], createLabel: '' },
  administrators: { title: 'Administrator access', description: 'Manage trusted Admin and Super Admin claims for existing verified Firebase accounts.', eyebrow: 'PRIVILEGED ACCOUNT MANAGEMENT', collections: [], createLabel: '' }
};

const FIELD_DEFINITIONS = {
  title: ['Title', 'text'], name: ['Name', 'text'], description: ['Description', 'textarea'], body: ['Body', 'textarea'],
  status: ['Status', 'status'], subject: ['Subject', 'text'], category: ['Category', 'text'], url: ['External URL', 'url'],
  fileUrl: ['File URL', 'url'], storageKey: ['Storage key', 'text'], type: ['Type', 'text'], target: ['Audience: students, all, division:A, elective:Psychology', 'text'],
  startAt: ['Start date and time', 'datetime-local'], endAt: ['End date and time', 'datetime-local'], publishedAt: ['Publish date and time', 'datetime-local'],
  examDate: ['Exam date', 'date'], deadline: ['Deadline', 'date'], location: ['Location', 'text'], semester: ['Semester', 'text'],
  course: ['Course', 'text'], unit: ['Unit', 'text'], chapter: ['Chapter', 'text'], difficulty: ['Difficulty', 'text'],
  options: ['Answer options (JSON list)', 'json'], answer: ['Correct option (exact text, A/B/C… or zero-based number)', 'text'], explanation: ['Explanation', 'textarea'],
  questions: ['Question IDs (JSON list)', 'json'], documents: ['Documents (JSON list)', 'json'], tags: ['Tags (JSON list)', 'json'],
  pinned: ['Pinned', 'boolean'], priority: ['Priority', 'number'], order: ['Order', 'number'], durationMinutes: ['Duration (minutes)', 'number'],
  visibility: ['Visibility', 'text'], eligibility: ['Eligibility', 'textarea']
};
const FIELD_SETS = {
  notices: ['title', 'status', 'description', 'body', 'url', 'type', 'target', 'pinned', 'priority', 'startAt', 'endAt'],
  announcements: ['title', 'status', 'description', 'body', 'url', 'type', 'target', 'pinned', 'priority', 'startAt', 'endAt'],
  communityUpdates: ['title', 'status', 'description', 'body', 'url', 'type', 'target', 'pinned', 'priority', 'startAt', 'endAt'],
  studyMaterials: ['title', 'status', 'description', 'subject', 'category', 'type', 'url', 'fileUrl', 'storageKey', 'unit', 'chapter', 'tags'],
  timetable: ['title', 'status', 'subject', 'semester', 'type', 'examDate', 'startAt', 'endAt', 'location', 'description'],
  scholarships: ['title', 'status', 'description', 'body', 'url', 'fileUrl', 'storageKey', 'eligibility', 'documents', 'deadline', 'startAt', 'endAt'],
  academicYears: ['title', 'status', 'startAt', 'endAt'], semesters: ['title', 'status', 'description', 'startAt', 'endAt'],
  courses: ['title', 'status', 'description', 'category'], subjects: ['title', 'status', 'description', 'category', 'course', 'semester', 'order'],
  syllabus: ['title', 'status', 'subject', 'unit', 'chapter', 'description', 'order'], calendar: ['title', 'status', 'description', 'type', 'startAt', 'endAt'],
  questions: ['title', 'status', 'subject', 'unit', 'chapter', 'difficulty', 'type', 'options', 'answer', 'explanation', 'tags'],
  questionPapers: ['title', 'status', 'description', 'subject', 'semester', 'type', 'url', 'fileUrl', 'storageKey'],
  mockTests: ['title', 'status', 'description', 'subject', 'questions', 'startAt', 'endAt', 'durationMinutes'],
  assignments: ['title', 'status', 'description', 'subject', 'startAt', 'endAt', 'fileUrl', 'storageKey'],
  notifications: ['title', 'status', 'body', 'target', 'startAt', 'endAt', 'type', 'url'],
  communityPosts: ['title', 'body', 'status', 'visibility', 'pinned'],
  communityComments: ['body', 'status', 'visibility'],
  communityReports: ['title', 'description', 'status', 'adminFeedback']
};

let activePage = '';
let activeCollection = '';
let records = [];
let editingRecord = null;
let superAdmin = false;
let workspacePageTokens = [null];
let workspacePageIndex = 0;
let workspaceNextPageToken = null;

function setWorkspaceStatus(text) { $('#workspaceStatusLine').textContent = text; }
function safe(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function recordTitle(record) { return record.title || record.name || record.question || record.body || record.fileName || 'Untitled record'; }
function formatDate(value) { if (!value) return '—'; const date = new Date(value?.toDate ? value.toDate() : value); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(date) : '—'; }

function fillCollectionOptions(config) {
  const select = $('#workspaceCollection');
  select.replaceChildren(...config.collections.map(([value, label]) => { const option = new Option(label, value); return option; }));
  $('#workspaceCollectionLabel').hidden = config.collections.length < 2;
  activeCollection = config.collections[0]?.[0] || '';
  workspacePageTokens = [null]; workspacePageIndex = 0; workspaceNextPageToken = null;
  $('#workspaceCreate').hidden = !config.createLabel || activeCollection === 'submissions';
  $('#workspaceCreate').textContent = config.createLabel || 'Create new';
  select.value = activeCollection;
}

function renderAnalytics(data, trend) {
  const host = $('#workspaceStats'); host.replaceChildren();
  const stats = [
    ['Student accounts', data.totalStudents], ['Active accounts', data.activeStudents], ['Disabled accounts', data.disabledStudents],
    ['Student profiles', data.studentProfiles], ['Study resources', data.resourceCount], ['Resource views', data.resourceViews],
    ['Resource downloads', data.resourceDownloads], ['Question bank', data.questionCount],
    ['Notices', data.noticeCount], ['Submissions', data.submissionCount], ['Quiz attempts', data.assessmentAttemptCount],
    ['Community posts', data.communityPostCount], ['Community comments', data.communityCommentCount], ['Community reports', data.communityReportCount], ['Admin actions today', data.actionsToday]
  ];
  for (const [label, value] of stats) {
    const card = document.createElement('article'); card.className = 'stat-card';
    const caption = document.createElement('span'); caption.className = 'stat-label'; caption.textContent = label;
    const number = document.createElement('div'); number.className = 'stat-value'; number.textContent = Number.isFinite(value) ? new Intl.NumberFormat('en-IN').format(value) : '—';
    const foot = document.createElement('div'); foot.className = 'stat-foot'; foot.textContent = ['Resource views', 'Resource downloads'].includes(label) ? 'Unique student and resource per day' : 'Current Firebase record count';
    card.append(caption, number, foot); host.append(card);
  }
  const panel = $('#analyticsTrendPanel'); panel.hidden = false;
  $('#analyticsRangeNote').textContent = `${trend.from} — ${trend.to}${trend.truncated ? ' · LIMITED SCAN' : ''}`;
    const activityNote = trend.activitySource === 'firebase_latest_sign_in_estimate'
      ? ' No daily session records yet; the activity line uses Firebase latest-sign-in estimates.'
      : ` ${trend.trackedActiveSessions} once-daily verified sessions recorded; dates without session records use Firebase latest-sign-in estimates.`;
    const subjectOpenSummary = trend.subjectEvents == null ? 'subject activity unavailable (scan limit reached)' : `${trend.subjectEvents} unique subject opens`;
    $('#analyticsStatus').textContent = `${trend.registered} registrations · ${trend.activeAccounts} active student days · ${trend.resourceViews} resource views · ${trend.resourceDownloads} downloads · ${trend.quizAttempts || 0} quiz attempts · ${trend.communityPosts || 0} posts · ${trend.communityComments || 0} comments · ${trend.communityReports || 0} reports · ${subjectOpenSummary} · ${trend.scannedStudentAccounts} accounts scanned${activityNote}${trend.truncated ? ' (Auth results are partial at the 10,000-account scan limit)' : ''}${trend.activityEventsTruncated ? ' (activity records are partial at the 10,000-event scan limit)' : ''}${trend.resourceEngagementTruncated ? ' (resource events are partial at the 10,000-event scan limit)' : ''}${trend.participationEventsTruncated ? ' (quiz/community/subject activity is partial at the 10,000-event scan limit)' : ''}.`;
  const popularity = $('#analyticsPopularResources'); popularity.replaceChildren();
  const popularRows = Array.isArray(trend.mostAccessed) ? trend.mostAccessed : [];
  $('#analyticsPopularityEmpty').hidden = popularRows.length !== 0;
  for (const item of popularRows) {
    const row = document.createElement('li'); row.className = 'activity-item';
    const icon = document.createElement('span'); icon.className = 'activity-icon'; icon.textContent = 'R';
    const copy = document.createElement('div'); copy.className = 'activity-copy';
    const title = document.createElement('strong'); title.textContent = item.title || 'Study material';
    const detail = document.createElement('span'); detail.textContent = `${item.views} views · ${item.downloads} downloads`;
    copy.append(title, detail); row.append(icon, copy); popularity.append(row);
  }
  const subjectPopularity = $('#analyticsPopularSubjects'); subjectPopularity.replaceChildren();
  const subjectRows = Array.isArray(trend.popularSubjects) ? trend.popularSubjects : [];
  $('#analyticsSubjectsEmpty').hidden = subjectRows.length !== 0;
  const subjectLabels = { psychology: 'Psychology', philosophy: 'Philosophy', economics: 'Economics', english: 'English', history: 'History', politics: 'Politics', 'common-aec': 'AEC', 'common-vec': 'VEC', 'common-iks': 'IKS', 'sec-psychology': 'SEC Psychology', 'sec-economics': 'SEC Economics', 'sec-english': 'SEC English', 'sec-politics': 'SEC Politics', 'oe-zoology': 'OE Zoology', 'oe-botany': 'OE Botany', 'oe-electronics': 'OE Electronics', 'oe-geography': 'OE Geography', 'oe-geology': 'OE Geology' };
  for (const item of subjectRows) {
    const row = document.createElement('li'); row.className = 'activity-item';
    const icon = document.createElement('span'); icon.className = 'activity-icon'; icon.textContent = 'S';
    const copy = document.createElement('div'); copy.className = 'activity-copy';
    const title = document.createElement('strong'); title.textContent = subjectLabels[item.subjectId] || 'Subject';
    const detail = document.createElement('span'); detail.textContent = `${item.uniqueStudentDays} unique student-days`;
    copy.append(title, detail); row.append(icon, copy); subjectPopularity.append(row);
  }
  const list = $('#analyticsTrend'); list.replaceChildren();
  const trendKeys = [['Registrations', 'registrations', false], ['Active student days', 'activeAccounts', true], ['Quiz attempts', 'quizAttempts', false], ['Community posts', 'communityPosts', false], ['Subject opens', 'subjectOpens', false]];
  const max = Math.max(1, ...trend.days.flatMap(day => trendKeys.map(([, key]) => day[key] || 0)));
  for (const day of trend.days) {
    const row = document.createElement('div'); row.className = 'analytics-day'; row.setAttribute('role', 'listitem');
    for (const key of ['resourceViews', 'resourceDownloads', 'communityComments', 'communityReports', 'subjectOpens']) row.dataset[key] = String(day[key] || 0);
    const date = document.createElement('time'); date.dateTime = day.date; date.textContent = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(`${day.date}T12:00:00+05:30`)); row.append(date);
    for (const [label, key, active] of trendKeys) {
      const value = day[key] || 0;
      const meter = document.createElement('div'); meter.className = `analytics-meter${active ? ' is-active' : ` is-${key}`}`;
      meter.title = label;
      meter.setAttribute('role', 'img'); meter.setAttribute('aria-label', `${label}: ${value}`);
      const fill = document.createElement('span'); fill.style.width = `${Math.max(value ? 2 : 0, value / max * 100)}%`; meter.append(fill); row.append(meter);
      const count = document.createElement('strong'); count.className = 'analytics-day-count'; count.textContent = String(value); count.title = label; row.append(count);
    }
    list.append(row);
  }
}

function setAnalyticsRangeDefault() {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const start = new Date(`${today}T00:00:00Z`); start.setUTCDate(start.getUTCDate() - 29);
  $('#analyticsTo').value = today;
  $('#analyticsFrom').value = start.toISOString().slice(0, 10);
}

async function loadAnalytics() {
  $('#workspaceLoading').hidden = false; $('#workspaceError').hidden = true; $('#analyticsTrendPanel').hidden = true;
  try {
    const query = new URLSearchParams({ from: $('#analyticsFrom').value, to: $('#analyticsTo').value });
    const [summary, trend] = await Promise.all([adminApi('dashboard'), adminApi(`analytics?${query}`)]);
    $('#workspaceLoading').hidden = true; renderAnalytics(summary, trend);
    setWorkspaceStatus('Registration dates use Firebase Authentication; activity is recorded once per student per Pune calendar day, with latest sign-in estimates for dates without records.');
  } catch (error) {
    $('#workspaceLoading').hidden = true; $('#workspaceError').hidden = false;
    $('#workspaceErrorText').textContent = error.message || 'Analytics could not be loaded.';
  }
}

function renderSettings(settings) {
  const host = $('#workspaceStats'); host.replaceChildren();
  const entries = [['Maintenance mode', settings.maintenanceMode], ['Student registration', settings.studentRegistrationEnabled], ['Default academic year', settings.defaultAcademicYear]];
  for (const [label, value] of entries) {
    const card = document.createElement('article'); card.className = 'stat-card';
    const caption = document.createElement('span'); caption.className = 'stat-label'; caption.textContent = label;
    const shown = document.createElement('div'); shown.className = 'stat-value'; shown.textContent = value === undefined ? 'Not configured' : typeof value === 'boolean' ? (value ? 'On' : 'Off') : String(value);
    const foot = document.createElement('div'); foot.className = 'stat-foot'; foot.textContent = 'Stored in admin/settings';
    card.append(caption, shown, foot); host.append(card);
  }
  const editor = document.createElement('div'); editor.className = 'panel settings-editor';
  const heading = document.createElement('h2'); heading.textContent = 'Platform controls'; editor.append(heading);
  for (const [key, label] of [['maintenanceMode', 'Maintenance mode'], ['studentRegistrationEnabled', 'Allow student registration']]) {
    const row = document.createElement('label'); row.className = 'settings-toggle';
    const text = document.createElement('span'); text.textContent = label;
    const input = document.createElement('input'); input.type = 'checkbox'; input.dataset.setting = key; input.checked = settings[key] === true; input.disabled = !superAdmin;
    row.append(text, input); editor.append(row);
  }
  const inAppRow = document.createElement('label'); inAppRow.className = 'settings-toggle';
  const inAppText = document.createElement('span'); inAppText.textContent = 'Show in-app student notifications';
  const inAppInput = document.createElement('input'); inAppInput.type = 'checkbox'; inAppInput.dataset.notificationSetting = 'inAppEnabled'; inAppInput.checked = settings.notificationSettings?.inAppEnabled !== false; inAppInput.disabled = !superAdmin;
  inAppRow.append(inAppText, inAppInput); editor.append(inAppRow);
  const note = document.createElement('p'); note.className = 'data-note'; note.textContent = 'Email and push delivery are not configured. This control only enables or disables the student in-app notification feed.'; editor.append(note);
  const academicRow = document.createElement('label'); academicRow.className = 'filter-label'; academicRow.textContent = 'Default academic year';
  const academicInput = document.createElement('input'); academicInput.id = 'defaultAcademicYear'; academicInput.value = settings.defaultAcademicYear || ''; academicInput.disabled = !superAdmin; academicInput.maxLength = 40; academicRow.append(academicInput); editor.append(academicRow);
  const save = document.createElement('button'); save.className = 'button button-gold'; save.type = 'button'; save.textContent = superAdmin ? 'Save settings' : 'Super Admin claim required'; save.disabled = !superAdmin;
  save.addEventListener('click', async () => {
    save.disabled = true; save.textContent = 'Saving…';
    try {
      const body = Object.fromEntries([...editor.querySelectorAll('[data-setting]')].map(input => [input.dataset.setting, input.checked]));
      body.defaultAcademicYear = academicInput.value.trim();
      body.notificationSettings = Object.fromEntries([...editor.querySelectorAll('[data-notification-setting]')].map(input => [input.dataset.notificationSetting, input.checked]));
      await adminApi('settings', { method: 'PUT', body });
      setWorkspaceStatus('Settings saved and recorded in the admin activity log.');
      void loadWorkspace('settings');
    } catch (error) { setWorkspaceStatus(error.message || 'Settings could not be saved.'); save.disabled = false; save.textContent = 'Save settings'; }
  });
  editor.append(save); host.after(editor);
}

function visibleRecords(source = records) {
  const query = $('#workspaceSearch').value.trim().toLocaleLowerCase('en');
  const status = $('#workspaceStatus').value;
  return source.filter(record => {
    if (status !== 'all' && record.status !== status) return false;
    return !query || Object.values(record).flatMap(value => typeof value === 'object' && value ? Object.values(value) : [value]).join(' ').toLocaleLowerCase('en').includes(query);
  });
}

function makeButton(label, className, handler) {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.className = className || ''; button.addEventListener('click', handler); return button;
}

function renderRows() {
  const filtered = visibleRecords();
  const head = $('#workspaceHead'); head.replaceChildren();
  const header = document.createElement('tr');
  const isSubmission = activeCollection === 'submissions';
  const columns = isSubmission ? ['Submission', 'Student UID', 'Type', 'Status', 'Updated', 'Review'] : ['Record', 'Subject / category', 'Status', 'Updated', 'Actions'];
  for (const text of columns) { const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = text; header.append(cell); }
  head.append(header);
  const body = $('#workspaceBody'); body.replaceChildren();
  $('#workspaceTableWrap').hidden = filtered.length === 0;
  $('#workspaceEmpty').hidden = filtered.length !== 0;
  $('#workspaceCount').textContent = `${filtered.length} ${filtered.length === 1 ? 'record' : 'records'}`;
  $('#workspacePageLabel').textContent = `Page ${workspacePageIndex + 1}`;
  $('#workspacePrevPage').disabled = workspacePageIndex === 0;
  $('#workspaceNextPage').disabled = !workspaceNextPageToken;
  for (const item of filtered) {
    const row = document.createElement('tr');
    const title = document.createElement('td'); const strong = document.createElement('strong'); strong.textContent = recordTitle(item); title.append(strong);
    if (item.description) { const small = document.createElement('span'); small.textContent = item.description; title.append(small); }
    row.append(title);
    if (isSubmission) {
      const uid = document.createElement('td'); uid.textContent = item.ownerUid || '—'; row.append(uid);
      const type = document.createElement('td'); type.textContent = item.submissionType || item.subject || '—'; row.append(type);
      const status = document.createElement('td'); status.textContent = item.status || '—'; row.append(status);
      const date = document.createElement('td'); date.textContent = formatDate(item.updatedAt || item.createdAt); row.append(date);
      const actions = document.createElement('td'); actions.className = 'workspace-table-actions';
      if (item.status === 'pending') {
        actions.append(makeButton('Approve', '', () => reviewSubmission(item, 'approved')));
        actions.append(makeButton('Reject', 'danger', () => reviewSubmission(item, 'rejected')));
      }
      row.append(actions);
    } else {
      const category = document.createElement('td'); category.textContent = [item.subject, item.category, item.course].filter(Boolean).join(' · ') || '—'; row.append(category);
      const status = document.createElement('td'); status.textContent = item.status || '—'; row.append(status);
      const date = document.createElement('td'); date.textContent = formatDate(item.updatedAt || item.createdAt); row.append(date);
      const actions = document.createElement('td'); actions.className = 'workspace-table-actions';
      if (item.storageKey) actions.append(makeButton('Download', '', () => downloadObject(item.storageKey)));
      actions.append(makeButton('Edit', '', () => openEditor(item)));
      actions.append(makeButton('Delete', 'danger', () => deleteRecord(item)));
      row.append(actions);
    }
    body.append(row);
  }
}

async function loadRecords() {
  $('#workspaceLoading').hidden = false; $('#workspaceError').hidden = true; $('#workspaceEmpty').hidden = true; $('#workspaceTableWrap').hidden = true;
  try {
    const query = new URLSearchParams({ limit: '100', status: $('#workspaceStatus').value });
    const pageToken = workspacePageTokens[workspacePageIndex];
    if (pageToken) query.set('pageToken', pageToken);
    if (activeCollection === 'submissions') {
      const result = await adminApi(`submissions?${query}`);
      records = result.items || []; workspaceNextPageToken = result.nextPageToken || null;
    } else {
      const result = await adminApi(`content/${encodeURIComponent(activeCollection)}?${query}`);
      records = result.items || []; workspaceNextPageToken = result.nextPageToken || null;
    }
    if (records.length === 0 && workspacePageIndex > 0) {
      workspacePageIndex -= 1; workspacePageTokens.length = workspacePageIndex + 1;
      $('#workspaceLoading').hidden = true;
      await loadRecords();
      return;
    }
    $('#workspaceLoading').hidden = true;
    renderRows();
    setWorkspaceStatus(`${records.length} records loaded from Firebase.`);
  } catch (error) {
    $('#workspaceLoading').hidden = true; $('#workspaceError').hidden = false;
    $('#workspaceErrorText').textContent = error.message || 'The trusted Admin API could not load these records.';
    setWorkspaceStatus('Request failed.');
  }
}

function formValue(key, value) {
  if (value == null) return '';
  if (value?.toDate) value = value.toDate();
  if (['startAt', 'endAt', 'publishedAt', 'examDate', 'deadline'].includes(key)) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return ['examDate', 'deadline'].includes(key) ? date.toISOString().slice(0, 10) : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
}

function openEditor(record = null) {
  editingRecord = record;
  const fields = $('#contentEditorFields'); fields.replaceChildren();
  const keys = FIELD_SETS[activeCollection] || [];
  for (const key of keys) {
    const definition = FIELD_DEFINITIONS[key]; if (!definition) continue;
    const [label, type] = definition;
    const wrap = document.createElement('label'); wrap.append(document.createTextNode(label));
    let input;
    if (type === 'textarea' || type === 'json') {
      input = document.createElement('textarea'); input.rows = type === 'json' ? 4 : 3;
      if (type === 'json') input.placeholder = '[]';
    } else if (type === 'status') {
      input = document.createElement('select');
      for (const optionText of ['draft', 'published', 'scheduled', 'archived', 'pending', 'approved', 'rejected', 'active', 'inactive', 'hidden', 'resolved', 'dismissed']) input.add(new Option(optionText, optionText));
    } else if (type === 'boolean') { input = document.createElement('input'); input.type = 'checkbox'; }
    else { input = document.createElement('input'); input.type = type; }
    input.name = key; input.dataset.fieldType = type;
    if (type === 'boolean') input.checked = record?.[key] === true;
    else input.value = formValue(key, record?.[key]);
    if (['title', 'name'].includes(key) && !record) input.required = true;
    if (type === 'textarea' || type === 'json') input.dataset.wide = 'true';
    wrap.append(input); fields.append(wrap);
  }
  if (R2_FILE_COLLECTIONS.has(activeCollection)) {
    const fileWrap = document.createElement('label'); fileWrap.append(document.createTextNode(record ? 'Replace managed file (optional)' : 'Upload file to Cloudflare R2 (optional)'));
    const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.id = 'resourceFileInput'; fileInput.accept = '.pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.mp4';
    fileWrap.append(fileInput); fields.append(fileWrap);
  }
  $('#contentEditorTitle').textContent = record ? 'Edit record' : (PAGE_CONFIG[activePage].createLabel || 'Create record');
  $('#contentEditorMessage').hidden = true;
  $('#saveContentEditor').disabled = false;
  $('#saveContentEditor').textContent = record ? 'Save changes' : 'Create record';
  $('#contentEditorDialog').showModal();
}

function readEditorValues() {
  const body = {};
  for (const input of $('#contentEditorFields').querySelectorAll('[name]')) {
    const type = input.dataset.fieldType;
    let value = type === 'boolean' ? input.checked : input.value.trim();
    if (value === '' && !input.required && !editingRecord) continue;
    if (type === 'json') { try { value = JSON.parse(value || '[]'); } catch { throw new Error(`${FIELD_DEFINITIONS[input.name][0]} must be valid JSON.`); } }
    if (value === '' && type === 'datetime-local' || value === '' && type === 'date') value = null;
    if (type === 'number' && value !== '') value = Number(value);
    body[input.name] = value;
  }
  return body;
}

async function saveRecord(event) {
  event.preventDefault();
  const button = $('#saveContentEditor'); button.disabled = true; button.textContent = 'Saving…';
  const message = $('#contentEditorMessage'); message.hidden = true;
  try {
    const body = readEditorValues();
    const file = $('#resourceFileInput')?.files?.[0];
    if (file) {
      const ticket = await adminApi('r2/upload-ticket', { method: 'POST', body: { fileName: file.name, contentType: file.type || 'application/octet-stream', size: file.size } });
      const upload = await fetch(ticket.uploadUrl, { method: 'PUT', headers: { 'Content-Type': ticket.contentType }, body: file });
      if (!upload.ok) throw new Error('The file upload did not complete. Check the R2 bucket CORS settings and retry.');
      const result = await adminApi(editingRecord ? 'r2/confirm-replacement' : 'r2/confirm-upload', { method: 'POST', body: { ...body, key: ticket.key, collection: activeCollection, ...(editingRecord ? { resourceId: editingRecord.id } : {}) } });
      setWorkspaceStatus(editingRecord ? `File replaced for resource ${result.id}.` : `File uploaded and resource ${result.id} registered.`);
    } else if (editingRecord) {
      await adminApi(`content/${encodeURIComponent(activeCollection)}/${encodeURIComponent(editingRecord.id)}`, { method: 'PUT', body });
    } else {
      await adminApi(`content/${encodeURIComponent(activeCollection)}`, { method: 'POST', body });
    }
    $('#contentEditorDialog').close();
    await loadRecords();
  } catch (error) {
    message.textContent = error.message || 'The record could not be saved.'; message.hidden = false;
    button.disabled = false; button.textContent = editingRecord ? 'Save changes' : 'Create record';
  }
}

async function deleteRecord(record) {
  if (!window.confirm(`Delete “${recordTitle(record)}”? This cannot be undone.`)) return;
  try { await adminApi(`content/${encodeURIComponent(activeCollection)}/${encodeURIComponent(record.id)}`, { method: 'DELETE' }); await loadRecords(); }
  catch (error) { setWorkspaceStatus(error.message || 'Could not delete this record.'); }
}

async function downloadObject(key) {
  const tab = window.open('about:blank', '_blank');
  if (!tab) { setWorkspaceStatus('Allow the new tab so the protected download can open.'); return; }
  tab.opener = null;
  try { const result = await adminApi('r2/download-ticket', { method: 'POST', body: { key } }); tab.location.href = result.downloadUrl; }
  catch (error) { tab.close(); setWorkspaceStatus(error.message || 'Download could not be prepared.'); }
}

async function reviewSubmission(item, status) {
  const feedback = window.prompt(`${status === 'approved' ? 'Approval' : 'Rejection'} feedback for the student (optional):`, '');
  if (feedback === null) return;
  try { await adminApi(`submissions/${encodeURIComponent(item.id)}/review`, { method: 'PATCH', body: { status, feedback } }); await loadRecords(); }
  catch (error) { setWorkspaceStatus(error.message || 'Could not save the review.'); }
}

async function exportRows() {
  const button = $('#workspaceExport'); button.disabled = true; button.textContent = 'Preparing…';
  try {
  const rows = [];
  let cursor = null; let pages = 0;
  do {
    const query = new URLSearchParams({ limit: '100', status: $('#workspaceStatus').value });
    if (cursor) query.set('pageToken', cursor);
    const page = activeCollection === 'submissions'
      ? await adminApi(`submissions?${query}`)
      : await adminApi(`content/${encodeURIComponent(activeCollection)}?${query}`);
    rows.push(...(page.items || [])); cursor = page.nextPageToken || null; pages += 1;
    if (pages >= 100 && cursor) throw new Error('CSV export is limited to 10,000 records. Refine the status filter or export a smaller collection.');
  } while (cursor);
  const selectedRows = visibleRecords(rows);
  if (!selectedRows.length) { setWorkspaceStatus('There are no matching records to export.'); return; }
  const headers = [...new Set(selectedRows.flatMap(row => Object.keys(row)))].filter(key => !['profile'].includes(key));
  const cell = value => { let text = value && typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''); if (/^[\s]*[=+@\-\t\r]/.test(text)) text = `'${text}`; return `"${text.replace(/"/g, '""')}"`; };
  const csv = '\uFEFF' + [headers, ...selectedRows.map(row => headers.map(key => row[key]))].map(row => row.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `vish-hub-${activeCollection || activePage}-${new Date().toISOString().slice(0, 10)}.csv`; document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  setWorkspaceStatus(`Exported ${selectedRows.length} matching records.`);
  } catch (error) { setWorkspaceStatus(error.message || 'Could not export the records.'); }
  finally { button.disabled = false; button.textContent = 'Export CSV'; }
}

async function loadWorkspace(page) {
  const config = PAGE_CONFIG[page]; if (!config) return;
  activePage = page; $('#overviewPage').hidden = true; $('#studentsPage').hidden = true; $('#workspacePage').hidden = false;
  $('#workspaceError').hidden = true; $('#administratorManager').hidden = page !== 'administrators';
  $('#analyticsTrendPanel').hidden = page !== 'analytics';
  $('#workspaceEyebrow').textContent = config.eyebrow; $('#workspaceTitle').textContent = config.title; $('#workspaceDescription').textContent = config.description;
  fillCollectionOptions(config); $('#workspaceStats').replaceChildren();
  document.querySelector('.settings-editor')?.remove();
  $('#workspaceCreate').hidden = !config.createLabel;
  $('#workspaceStatus').value = 'all'; $('#workspaceSearch').value = '';
  if (page === 'analytics') {
    $('#workspaceCollectionLabel').hidden = true; $('#workspaceTools').hidden = true; $('#workspaceTableWrap').hidden = true; $('#workspaceEmpty').hidden = true;
    if (!$('#analyticsFrom').value || !$('#analyticsTo').value) setAnalyticsRangeDefault();
    await loadAnalytics();
    return;
  }
  if (page === 'settings') {
    $('#workspaceCollectionLabel').hidden = true; $('#workspaceTools').hidden = true; $('#workspaceTableWrap').hidden = true; $('#workspaceEmpty').hidden = true; $('#workspaceLoading').hidden = false;
    try { const settings = await adminApi('settings'); $('#workspaceLoading').hidden = true; renderSettings(settings); setWorkspaceStatus('Loaded protected platform settings.'); }
    catch (error) { $('#workspaceLoading').hidden = true; $('#workspaceError').hidden = false; $('#workspaceErrorText').textContent = error.message; }
    return;
  }
  if (page === 'administrators') {
    $('#workspaceCollectionLabel').hidden = true; $('#workspaceTools').hidden = true; $('#workspaceTableWrap').hidden = true; $('#workspaceEmpty').hidden = true; $('#workspaceLoading').hidden = false;
    $('#administratorGrantForm').hidden = !superAdmin;
    try {
      const result = await adminApi('administrators');
      const body = $('#administratorTableBody'); body.replaceChildren();
      for (const item of result.items || []) {
        const row = document.createElement('tr');
        const account = document.createElement('td'); const name = document.createElement('strong'); name.textContent = item.name || item.email || 'Admin'; const email = document.createElement('span'); email.textContent = item.email; account.append(name, email);
        const uid = document.createElement('td'); uid.className = 'student-uid'; uid.textContent = item.uid;
        const role = document.createElement('td'); role.textContent = item.role === 'superAdmin' ? 'Super Admin' : 'Admin';
        const verified = document.createElement('td'); verified.textContent = item.emailVerified ? 'Verified' : 'Unverified';
        const status = document.createElement('td'); status.textContent = item.disabled ? 'Disabled' : 'Active';
        row.append(account, uid, role, verified, status); body.append(row);
      }
      $('#administratorEmpty').hidden = (result.items || []).length !== 0;
      $('#workspaceLoading').hidden = true;
      setWorkspaceStatus(result.truncated ? 'Showing first 100,000 trusted Admin accounts.' : `${(result.items || []).length} trusted Admin accounts loaded.`);
    } catch (error) {
      $('#workspaceLoading').hidden = true; $('#workspaceError').hidden = false; $('#workspaceErrorText').textContent = error.message || 'Super Admin access is required to view this list.';
    }
    return;
  }
  $('#workspaceTools').hidden = false; $('#workspaceCollectionLabel').hidden = config.collections.length < 2;
  if (activeCollection === 'submissions') $('#workspaceCreate').hidden = true;
  await loadRecords();
}

$('#workspaceCreate').addEventListener('click', () => openEditor());
$('#contentEditorForm').addEventListener('submit', saveRecord);
$('#closeContentEditor').addEventListener('click', () => $('#contentEditorDialog').close());
$('#cancelContentEditor').addEventListener('click', () => $('#contentEditorDialog').close());
$('#workspaceRefresh').addEventListener('click', () => { workspacePageTokens = [null]; workspacePageIndex = 0; void loadRecords(); });
$('#workspaceRetry').addEventListener('click', () => void loadRecords());
$('#workspaceExport').addEventListener('click', exportRows);
$('#workspaceSearch').addEventListener('input', renderRows);
$('#workspaceStatus').addEventListener('change', () => { workspacePageTokens = [null]; workspacePageIndex = 0; void loadRecords(); });
$('#workspaceCollection').addEventListener('change', event => {
  activeCollection = event.target.value; workspacePageTokens = [null]; workspacePageIndex = 0; $('#workspaceCreate').hidden = activeCollection === 'submissions' || !PAGE_CONFIG[activePage].createLabel;
  void loadRecords();
});
$('#workspacePrevPage').addEventListener('click', () => {
  if (workspacePageIndex <= 0) return;
  workspacePageIndex -= 1; void loadRecords();
});
$('#workspaceNextPage').addEventListener('click', () => {
  if (!workspaceNextPageToken) return;
  workspacePageTokens[workspacePageIndex + 1] = workspaceNextPageToken;
  workspacePageIndex += 1; void loadRecords();
});
$('#analyticsApply').addEventListener('click', () => {
  if (!$('#analyticsFrom').value || !$('#analyticsTo').value || $('#analyticsFrom').value > $('#analyticsTo').value) {
    $('#analyticsStatus').textContent = 'Choose a valid date range; the start date must not be after the end date.'; return;
  }
  void loadAnalytics();
});
$('#analyticsExport').addEventListener('click', () => {
  const rows = [['Date', 'Registrations', 'Active student days', 'Quiz attempts', 'Community posts', 'Subject opens', 'Resource views', 'Resource downloads', 'Community comments', 'Community reports']];
  for (const item of $('#analyticsTrend').querySelectorAll('.analytics-day')) {
    const cells = item.querySelectorAll('time, .analytics-day-count');
    rows.push([cells[0]?.dateTime || '', ...Array.from(cells).slice(1).map(cell => cell.textContent || '0'), item.dataset.resourceViews || '0', item.dataset.resourceDownloads || '0', item.dataset.communityComments || '0', item.dataset.communityReports || '0']);
  }
  if (rows.length === 1) { $('#analyticsStatus').textContent = 'Load a date range before exporting.'; return; }
  const escape = value => `"${String(value).replace(/"/g, '""')}"`;
  const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `vish-hub-analytics-${$('#analyticsFrom').value}-to-${$('#analyticsTo').value}.csv`; link.click(); URL.revokeObjectURL(url);
});
$('#administratorGrantForm').addEventListener('submit', async event => {
  event.preventDefault();
  const uid = $('#administratorUid').value.trim(); const role = $('#administratorRole').value;
  const message = $('#administratorMessage'); message.textContent = 'Updating trusted claims…';
  const submit = event.currentTarget.querySelector('button[type="submit"]'); submit.disabled = true;
  try {
    await adminApi(`administrators/${encodeURIComponent(uid)}`, { method: 'PATCH', body: { role } });
    message.textContent = `Account claim updated to ${role}. The account must sign in again.`;
    $('#administratorUid').value = '';
    await loadWorkspace('administrators');
  } catch (error) { message.textContent = error.message || 'Trusted role update failed.'; }
  finally { submit.disabled = false; }
});

export function routeWorkspace(page) {
  const user = window.__vishAdminUser;
  void (async () => {
    try { superAdmin = (await user?.getIdTokenResult()).claims.superAdmin === true; }
    catch { superAdmin = false; }
    await loadWorkspace(page);
  })();
}
