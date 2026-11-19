(() => {
  const page = document.getElementById('communityPage');
  const opener = document.getElementById('openCommunityPage');
  if (!page || !opener) return;
  if (page.parentElement !== document.body) document.body.append(page);

  const list = document.getElementById('communityPostList');
  const feedStatus = document.getElementById('communityFeedStatus');
  const composer = document.getElementById('communityComposer');
  const composerStatus = document.getElementById('communityComposerStatus');
  const reportDialog = document.getElementById('communityReportDialog');
  let reportPostId = '';
  let feedRequest = 0;

  const make = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  const currentUser = () => window.vishHubAuth?.getCurrentUser?.() || null;
  const showStatus = (node, message, state = '') => { node.textContent = message; node.dataset.state = state; };
  const dateLabel = value => { const date = value ? new Date(value) : null; return date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }).format(date) : ''; };

  async function callApi(method, body, query = '') {
    const user = currentUser();
    if (!user || user.emailVerified !== true) throw new Error('Sign in with a verified student account to use the community.');
    const token = await user.getIdToken();
    const response = await fetch('/api/community' + query, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store' });
    let data; try { data = await response.json(); } catch { data = {}; }
    if (!response.ok) throw new Error(data.error || 'The community is temporarily unavailable.');
    return data;
  }

  function openPage() {
    page.hidden = false;
    page.classList.add('open');
    document.body.style.overflow = 'hidden';
    history.pushState({ communityOpen: true }, '', location.pathname + location.search + '#/community');
    void loadFeed();
  }
  function closePage(fromHistory = false) {
    if (page.hidden) return;
    page.hidden = true;
    page.classList.remove('open');
    document.body.style.overflow = '';
    if (!fromHistory && history.state?.communityOpen) history.back();
  }

  function renderComment(comment) {
    const article = make('article', 'community-comment' + (comment.ownPending ? ' is-pending' : ''));
    article.append(make('strong', '', comment.authorName || 'VISH HUB Student'));
    if (comment.ownPending) article.append(make('small', '', 'Awaiting Admin review'));
    if (comment.ownRejected) article.append(make('small', '', 'Not approved by Admin'));
    article.append(make('p', '', comment.body));
    return article;
  }

  async function toggleComments(post, host, button) {
    let panel = host.querySelector('.community-comments');
    if (panel) { panel.remove(); button.setAttribute('aria-expanded', 'false'); return; }
    button.setAttribute('aria-expanded', 'true');
    panel = make('section', 'community-comments');
    panel.append(make('p', 'community-status', 'Loading comments…'));
    host.append(panel);
    try {
      const data = await callApi('GET', null, `?postId=${encodeURIComponent(post.id)}`);
      panel.replaceChildren();
      const comments = Array.isArray(data.comments) ? data.comments : [];
      if (!comments.length) panel.append(make('p', 'community-status', 'No comments yet.'));
      for (const comment of comments) panel.append(renderComment(comment));
      const form = document.createElement('form'); form.className = 'community-comment-form';
      const input = document.createElement('textarea'); input.required = true; input.maxLength = 4000; input.placeholder = 'Write a thoughtful comment…'; input.setAttribute('aria-label', 'Write a comment');
      const status = make('p', 'community-status'); status.setAttribute('role', 'status');
      const submit = make('button', '', 'Submit comment for review'); submit.type = 'submit';
      form.append(input, status, submit);
      form.addEventListener('submit', async event => {
        event.preventDefault(); if (!input.value.trim()) return;
        submit.disabled = true; showStatus(status, 'Submitting comment…');
        try { await callApi('POST', { action: 'comment', postId: post.id, body: input.value }); input.value = ''; panel.remove(); button.setAttribute('aria-expanded', 'false'); await toggleComments(post, host, button); showStatus(composerStatus, 'Comment submitted for Admin review.'); }
        catch (error) { showStatus(status, error.message, 'error'); submit.disabled = false; }
      });
      panel.append(form);
    } catch (error) { panel.replaceChildren(make('p', 'community-status', error.message)); }
  }

  function renderPost(post) {
    const card = make('article', 'community-post-card' + (post.ownPending ? ' is-pending' : ''));
    const meta = make('div', 'community-post-meta');
    meta.append(make('span', '', post.authorName || 'VISH HUB Student'));
    meta.append(make('span', '', post.ownPending ? 'Awaiting Admin review' : post.ownRejected ? 'Not approved by Admin' : dateLabel(post.createdAt)));
    card.append(meta, make('h3', '', post.title), make('p', '', post.body));
    if (!post.ownPending) {
      const actions = make('div', 'community-post-actions');
      const comments = make('button', '', 'Comments'); comments.type = 'button'; comments.setAttribute('aria-expanded', 'false');
      comments.addEventListener('click', () => void toggleComments(post, card, comments));
      const report = make('button', '', 'Report'); report.type = 'button'; report.addEventListener('click', () => { reportPostId = post.id; reportDialog.showModal(); });
      actions.append(comments, report); card.append(actions);
    }
    return card;
  }

  async function loadFeed() {
    const requestId = ++feedRequest;
    list.replaceChildren();
    composer.hidden = !currentUser() || currentUser()?.emailVerified !== true;
    showStatus(feedStatus, 'Loading community posts…', 'loading');
    try {
      const data = await callApi('GET');
      if (requestId !== feedRequest) return;
      const posts = Array.isArray(data.posts) ? data.posts : [];
      if (!posts.length) { showStatus(feedStatus, 'No posts yet. Start a discussion and it will appear after Admin review.', 'empty'); return; }
      showStatus(feedStatus, `${posts.length} ${posts.length === 1 ? 'post' : 'posts'}`, 'ready');
      for (const post of posts) list.append(renderPost(post));
    } catch (error) {
      if (requestId === feedRequest) showStatus(feedStatus, error.message, 'error');
    }
  }

  opener.addEventListener('click', openPage);
  document.getElementById('closeCommunityPage').addEventListener('click', () => closePage());
  document.getElementById('refreshCommunityFeed').addEventListener('click', () => void loadFeed());
  composer.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = composer.querySelector('[type=submit]'); submit.disabled = true;
    showStatus(composerStatus, 'Submitting your post…');
    try {
      await callApi('POST', { action: 'post', title: document.getElementById('communityPostTitle').value, body: document.getElementById('communityPostBody').value });
      composer.reset(); showStatus(composerStatus, 'Post submitted. It will appear after Admin review.'); await loadFeed();
    } catch (error) { showStatus(composerStatus, error.message, 'error'); }
    finally { submit.disabled = false; }
  });
  document.getElementById('cancelCommunityReport').addEventListener('click', () => reportDialog.close());
  reportDialog.addEventListener('click', event => { if (event.target === reportDialog) reportDialog.close(); });
  document.getElementById('communityReportForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget; const submit = form.querySelector('[type=submit]'); const status = document.getElementById('communityReportStatus'); submit.disabled = true;
    try {
      await callApi('POST', { action: 'report', postId: reportPostId, reason: form.elements.reason.value, details: form.elements.details.value });
      reportDialog.close(); form.reset(); showStatus(composerStatus, 'Report sent to the Admin moderation queue.');
    } catch (error) { showStatus(status, error.message, 'error'); }
    finally { submit.disabled = false; }
  });
  window.addEventListener('popstate', () => closePage(true));
  window.addEventListener('vishhub-auth-state', () => { if (!page.hidden) void loadFeed(); });
})();
