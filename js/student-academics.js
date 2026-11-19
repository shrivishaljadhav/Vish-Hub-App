(() => {
  const root = document.getElementById('publishedAcademicContent');
  if (!root) return;

  let records = null;
  let loadedUid = '';
  let requestSequence = 0;
  const search = document.getElementById('syllabusPageSearch');

  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function render() {
    if (!records) return;
    const query = (search?.value || '').trim().toLocaleLowerCase('en');
    root.replaceChildren();
    const sections = [
      ['Academic years & semesters', [...records.academicYears, ...records.semesters]],
      ['Courses & subjects', [...records.courses, ...records.subjects]],
      ['Published syllabus', records.syllabus],
      ['Academic calendar', records.calendar]
    ];
    let shown = 0;
    sections.forEach(([label, items]) => {
      const filtered = items.filter(item => !query || [item.title, item.description, item.subject, item.category, item.course, item.semester, item.unit, item.chapter, item.type, item.location].filter(Boolean).join(' ').toLocaleLowerCase('en').includes(query));
      if (!filtered.length) return;
      filtered.sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
        || String(a.startAt || '').localeCompare(String(b.startAt || ''))
        || String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' }));
      shown += filtered.length;
      const section = make('section', 'published-academic-section');
      section.append(make('h3', 'published-academic-heading', label));
      const grid = make('div', 'published-academic-grid');
      filtered.forEach(item => {
        const card = make('article', 'published-academic-card');
        const title = [item.subject, item.unit, item.chapter].filter(Boolean).join(' · ') || item.title || 'Academic record';
        card.append(make('h4', '', title));
        if (item.title && item.title !== title) card.append(make('p', 'published-academic-title', item.title));
        if (item.description) card.append(make('p', 'published-academic-description', item.description));
        const metadata = [item.category, item.course, item.semester, item.type, item.location].filter(Boolean);
        const dateFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' });
        if (item.startAt) metadata.push(dateFormat.format(new Date(item.startAt)));
        if (item.endAt) metadata.push(`Through ${dateFormat.format(new Date(item.endAt))}`);
        if (item.order !== undefined) metadata.push(`Unit ${item.order}`);
        if (metadata.length) card.append(make('small', 'published-academic-meta', metadata.join(' · ')));
        grid.append(card);
      });
      section.append(grid);
      root.append(section);
    });
    if (!shown) root.append(make('p', 'published-academic-empty', query ? 'No published academic records match this search.' : 'No published academic records are available yet.'));
    root.hidden = false;
  }

  async function load() {
    const sequence = ++requestSequence;
    const user = window.vishHubAuth?.getCurrentUser?.();
    if (!user || user.emailVerified !== true) {
      records = null;
      loadedUid = '';
      root.hidden = true;
      root.replaceChildren();
      return;
    }
    if (loadedUid === user.uid) { render(); return; }
    records = null;
    loadedUid = '';
    root.hidden = false;
    root.replaceChildren(make('p', 'published-academic-status', 'Loading published academic content…'));
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/academics', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (!response.ok) throw new Error('Academic content could not be loaded.');
      const payload = await response.json();
      if (sequence !== requestSequence) return;
      const source = payload.records || {};
      records = Object.fromEntries(['academicYears', 'semesters', 'courses', 'subjects', 'syllabus', 'calendar'].map(key => [key, Array.isArray(source[key]) ? source[key] : []]));
      loadedUid = user.uid;
      render();
    } catch {
      if (sequence !== requestSequence) return;
      root.replaceChildren(make('p', 'published-academic-status', 'Published academic content is temporarily unavailable. Refresh the app to try again.'));
      root.hidden = false;
    }
  }

  search?.addEventListener('input', render);
  window.addEventListener('vishhub-auth-state', () => void load());
  void load();
})();
