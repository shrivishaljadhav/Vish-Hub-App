(() => {
  const subjectPattern = /^(psychology|philosophy|economics|english|history|politics|common-aec|common-vec|common-iks|sec-(psychology|economics|english|politics)|oe-(zoology|botany|electronics|geography|geology))$/;
  document.addEventListener('click', async event => {
    const card = event.target.closest('#grid .home-category-tile');
    const user = window.vishHubAuth?.getCurrentUser?.();
    const subject = card?.dataset.subjectId;
    if (!card || !subjectPattern.test(subject || '') || !user || user.emailVerified !== true) return;
    try {
      const token = await user.getIdToken();
      await fetch('/api/activity/subject', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject }),
        keepalive: true
      });
    } catch { /* Activity reporting must not interrupt opening a subject. */ }
  }, true);
})();
