(() => {
  const page = document.getElementById('studyModePage');
  const picker = document.getElementById('studyModeSubjectPicker');
  if (!page || !picker) return;

  const library = document.createElement('section');
  library.className = 'published-assessments';
  library.setAttribute('aria-labelledby', 'publishedAssessmentsTitle');
  const title = document.createElement('h2');
  title.id = 'publishedAssessmentsTitle';
  title.textContent = 'Published quizzes';
  const intro = document.createElement('p');
  intro.textContent = 'Quizzes prepared by your VISH HUB academic team.';
  const status = document.createElement('p');
  status.className = 'published-assessments-status';
  status.setAttribute('role', 'status');
  const list = document.createElement('div');
  list.className = 'published-assessments-list';
  library.append(title, intro, status, list);
  picker.insertBefore(library, picker.querySelector('.study-mode-subject-grid'));

  const runner = document.createElement('section');
  runner.className = 'published-assessment-runner';
  runner.hidden = true;
  runner.setAttribute('aria-live', 'polite');
  page.querySelector('.study-mode-page-main')?.append(runner);

  let loadedUid = '';
  let assessments = [];
  let selectedId = '';
  let listRequest = 0;

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function setStatus(message, kind = '') {
    status.textContent = message;
    status.dataset.state = kind;
  }

  function showPicker() {
    runner.hidden = true;
    picker.hidden = false;
    selectedId = '';
  }

  function renderAssessmentList() {
    list.replaceChildren();
    if (!assessments.length) {
      setStatus('No published quizzes are available yet.', 'empty');
      return;
    }
    setStatus(`${assessments.length} published ${assessments.length === 1 ? 'quiz' : 'quizzes'}`, 'ready');
    for (const assessment of assessments) {
      const card = make('article', 'published-assessment-card');
      const copy = make('div', 'published-assessment-copy');
      copy.append(make('strong', '', assessment.title));
      copy.append(make('span', '', [assessment.subject, `${assessment.questionCount} questions`, assessment.durationMinutes ? `${assessment.durationMinutes} min` : ''].filter(Boolean).join(' · ')));
      if (assessment.description) copy.append(make('small', '', assessment.description));
      const button = make('button', 'study-secondary', 'Start quiz');
      button.type = 'button';
      button.addEventListener('click', () => void openAssessment(assessment.id));
      card.append(copy, button);
      list.append(card);
    }
  }

  async function request(path, options = {}) {
    const user = window.vishHubAuth?.getCurrentUser?.();
    if (!user || user.emailVerified !== true) throw new Error('Sign in with a verified student account to access published quizzes.');
    const token = await user.getIdToken();
    const response = await fetch(path, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }, cache: 'no-store' });
    let data;
    try { data = await response.json(); } catch { data = {}; }
    if (!response.ok) throw new Error(data.error || 'Published quizzes are temporarily unavailable.');
    return data;
  }

  async function loadAssessments(force = false) {
    const user = window.vishHubAuth?.getCurrentUser?.();
    const uid = user?.uid || '';
    if (!uid || user.emailVerified !== true) {
      loadedUid = '';
      assessments = [];
      list.replaceChildren();
      setStatus('Sign in with a verified student account to access published quizzes.', 'auth');
      return;
    }
    if (!force && loadedUid === uid) return renderAssessmentList();
    const requestId = ++listRequest;
    setStatus('Loading published quizzes…', 'loading');
    list.replaceChildren();
    try {
      const data = await request('/api/assessments');
      if (requestId !== listRequest) return;
      assessments = Array.isArray(data.assessments) ? data.assessments : [];
      loadedUid = uid;
      renderAssessmentList();
    } catch (error) {
      if (requestId !== listRequest) return;
      setStatus(error.message, 'error');
    }
  }

  function createQuestion(question, index) {
    const fieldset = make('fieldset', 'published-assessment-question');
    const legend = make('legend', '', `${index + 1}. ${question.prompt}`);
    fieldset.append(legend);
    if (question.unit) fieldset.append(make('small', 'published-assessment-unit', question.unit));
    const options = make('div', 'published-assessment-options');
    question.options.forEach((option, optionIndex) => {
      const label = make('label', 'published-assessment-option');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = question.id;
      input.value = String(optionIndex);
      input.required = true;
      label.append(input, make('span', '', option));
      options.append(label);
    });
    fieldset.append(options);
    return fieldset;
  }

  function renderResult(result) {
    runner.replaceChildren();
    const title = make('h2', '', result.assessment?.title || 'Quiz result');
    const score = make('p', 'published-assessment-score', `Your score: ${result.score} / ${result.total}`);
    runner.append(make('span', 'study-mode-eyebrow', 'QUIZ COMPLETE'), title, score);
    const review = make('ol', 'published-assessment-review');
    for (const answer of result.results || []) {
      const row = make('li', answer.correct ? 'answer-correct' : 'answer-incorrect');
      row.append(make('strong', '', answer.prompt), make('span', '', answer.correct ? 'Correct' : `Correct answer: ${answer.correctOption}`));
      review.append(row);
    }
    runner.append(review);
    const done = make('button', 'study-secondary', 'Back to quizzes');
    done.type = 'button';
    done.addEventListener('click', showPicker);
    runner.append(done);
  }

  async function openAssessment(id) {
    selectedId = id;
    picker.hidden = true;
    runner.hidden = false;
    runner.replaceChildren(make('p', 'published-assessments-status', 'Loading quiz…'));
    try {
      const data = await request(`/api/assessments/${encodeURIComponent(id)}`);
      if (selectedId !== id) return;
      const assessment = data.assessment;
      if (!assessment || !Array.isArray(assessment.questions) || !assessment.questions.length) throw new Error('This quiz is not ready yet.');
      runner.replaceChildren();
      const form = document.createElement('form');
      form.className = 'published-assessment-form';
      form.append(make('span', 'study-mode-eyebrow', `${assessment.subject || 'VISH HUB'} · ${assessment.questions.length} QUESTIONS`));
      form.append(make('h2', '', assessment.title));
      if (assessment.description) form.append(make('p', '', assessment.description));
      for (const [index, question] of assessment.questions.entries()) form.append(createQuestion(question, index));
      const message = make('p', 'published-assessment-status');
      message.setAttribute('role', 'status');
      const submit = make('button', 'primary', 'Submit quiz');
      submit.type = 'submit';
      const back = make('button', 'study-secondary', 'Back to quizzes');
      back.type = 'button';
      back.addEventListener('click', showPicker);
      form.append(message, submit, back);
      form.addEventListener('submit', async event => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        submit.disabled = true;
        message.textContent = 'Checking your answers…';
        const answers = Object.fromEntries(assessment.questions.map(question => [question.id, Number(new FormData(form).get(question.id))]));
        try {
          const result = await request('/api/assessments/submit', { method: 'POST', body: JSON.stringify({ assessmentId: id, answers }) });
          if (selectedId === id) renderResult(result);
        } catch (error) {
          message.textContent = error.message;
          submit.disabled = false;
        }
      });
      runner.append(form);
    } catch (error) {
      runner.replaceChildren(make('p', 'published-assessments-status', error.message));
      const back = make('button', 'study-secondary', 'Back to quizzes');
      back.type = 'button';
      back.addEventListener('click', showPicker);
      runner.append(back);
    }
  }

  function syncMode() {
    const isQuiz = !page.hidden && page.dataset.mode === 'quiz';
    library.hidden = !isQuiz;
    if (isQuiz) void loadAssessments();
    else showPicker();
  }

  new MutationObserver(syncMode).observe(page, { attributes: true, attributeFilter: ['hidden', 'data-mode'] });
  window.addEventListener('vishhub-auth-state', () => {
    loadedUid = '';
    void loadAssessments(true);
  });
  syncMode();
})();
