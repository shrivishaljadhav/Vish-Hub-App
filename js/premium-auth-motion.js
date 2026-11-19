(() => {
  const page = document.getElementById('studentProfilePage');
  const app = document.getElementById('appContent');
  const body = document.body;
  const card = page?.querySelector('.auth-portal, .uploaded-auth-frame');
  const onboardingFrame = page?.querySelector('.uploaded-auth-frame');
  const authView = document.getElementById('profileAuthView');

  const signOutMenu = document.querySelector('#headerMenu .auth-signout-menu');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gsap = window.gsap;
  if (!page || !app || !card || !authView) return;

  const enterGate = () => {
    body.classList.remove('auth-gate-pending');
    body.classList.add('auth-gate-active');
    app.setAttribute('inert', '');
    authView.hidden = false;

    page.classList.add('open', 'auth-gate');
    page.setAttribute('aria-modal', 'true');
    if (!gsap || reduced) return;
    const logo = card.matches('.auth-portal') ? card.querySelector('.auth-gate-logo') : null;
    const brand = card.matches('.auth-portal') ? card.querySelector('.auth-brand-zone') : null;
    const panel = card.matches('.auth-portal') ? card.querySelector('.auth-form-panel') : null;
    gsap.fromTo(card, { autoAlpha: 0, y: 22, scale: .975 }, { autoAlpha: 1, y: 0, scale: 1, duration: .68, ease: 'power3.out', clearProps: 'transform' });
    if (brand) gsap.fromTo(brand, { autoAlpha: 0, y: -8 }, { autoAlpha: 1, y: 0, duration: .48, delay: .15, ease: 'power2.out' });
    if (panel) gsap.fromTo(panel, { autoAlpha: 0, y: 13 }, { autoAlpha: 1, y: 0, duration: .52, delay: .24, ease: 'power2.out' });
    const sun = page.querySelector('.auth-sun');
    const stars = page.querySelectorAll('.auth-stars circle');
    if (sun) gsap.to(sun, { scale: 1.08, duration: 5.5, repeat: -1, yoyo: true, transformOrigin: '50% 50%', ease: 'sine.inOut' });
    if (stars.length) gsap.to(stars, { autoAlpha: .24, duration: 2.1, stagger: .32, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    if (logo) gsap.to(logo, { y: -2, duration: 3.2, repeat: -1, yoyo: true, ease: 'sine.inOut' });
  };

  const exitGate = () => {
    if (!body.classList.contains('auth-gate-active')) return;
    const finish = () => {
      body.classList.remove('auth-gate-active', 'auth-gate-pending');
      page.classList.remove('open', 'auth-gate');
      page.setAttribute('aria-modal', 'false');
      app.removeAttribute('inert');
      if (gsap) gsap.set(card, { clearProps: 'all' });
    };
    if (gsap && !reduced) {
      gsap.killTweensOf(card);
      gsap.to(card, { autoAlpha: 0, y: 10, scale: .99, duration: .25, ease: 'power2.in', onComplete: finish });
    } else finish();
  };

  window.addEventListener('message', async event => {
    const message = event.data;
    if (!onboardingFrame || event.source !== onboardingFrame.contentWindow || event.origin !== window.location.origin ||
        message?.source !== 'vish-hub-onboarding' || message?.type !== 'handoff-to-app-home') return;

    const user = window.vishHubAuth?.getCurrentUser?.();
    if (!user || !user.emailVerified) return;
    try {
      const token = await user.getIdTokenResult(true);
      const profile = window.vishHubAuth?.getCurrentProfile?.();
      if (token.claims.email_verified !== true || !profile?.profileSetupComplete) return;
      hadSession = true;
      finishAuthGate();
    } catch (_) {
      // Keep the dashboard covered if the fresh Firebase session cannot be confirmed.
    }

  });
  let hadSession = false;


  function finishAuthGate() {
    exitGate();
    document.getElementById('closeProfilePage')?.click();
    window.setTimeout(() => {
      document.querySelector('.navitem[data-nav="home"]')?.click();
      window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    }, reduced ? 0 : 280);
  }

  enterGate();
  window.addEventListener('vishhub-auth-state', event => {
    const signedIn = Boolean(event.detail?.user && event.detail?.emailVerified);
    const profileComplete = Boolean(event.detail?.profileSetupComplete || event.detail?.profile?.profileSetupComplete);
    if (signOutMenu) signOutMenu.hidden = !(signedIn && profileComplete);
    if (event.detail?.initial) {
      hadSession = signedIn;
      if (signedIn && profileComplete) finishAuthGate();
      return;
    }
    if (signedIn) {
      hadSession = true;
      return;
    }
    if (hadSession) {
      hadSession = false;
      enterGate();
    }
  });

  const stage = page.querySelector('.auth-stage-art');
  page.addEventListener('pointermove', event => {
    if (!gsap || reduced || event.pointerType === 'touch') return;
    const x = (event.clientX / window.innerWidth - .5) * 10;
    const y = (event.clientY / window.innerHeight - .5) * 8;
    gsap.to(stage, { x, y, duration: .7, overwrite: 'auto', ease: 'power2.out' });
  });
  page.addEventListener('pointerleave', () => {
    if (gsap && !reduced) gsap.to(stage, { x: 0, y: 0, duration: .7, overwrite: 'auto', ease: 'power2.out' });
  });

  const eye = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.6"/></svg>';
  const eyeOff = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18M10.6 6.2A10.8 10.8 0 0 1 12 6c6.1 0 9.5 6 9.5 6a17 17 0 0 1-3.1 3.8M6.2 6.3C3.8 7.8 2.5 12 2.5 12s3.4 6 9.5 6c1 0 1.9-.2 2.7-.4"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  const form = document.getElementById('profileAuthForm');
  const password = document.getElementById('authPassword');
  const confirmation = document.getElementById('authPasswordConfirm');
  if (!form || !password || !confirmation) return;

  [password, confirmation].forEach((input, index) => {
    const toggle = document.createElement('button');
    toggle.className = 'auth-password-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-label', 'Show ' + (index ? 'confirmation ' : '') + 'password');
    toggle.setAttribute('aria-pressed', 'false');
    toggle.innerHTML = eye;
    input.parentElement.append(toggle);
    toggle.addEventListener('click', event => {
      event.preventDefault();
      const visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      toggle.innerHTML = visible ? eyeOff : eye;
      toggle.setAttribute('aria-pressed', String(visible));
      toggle.setAttribute('aria-label', (visible ? 'Hide ' : 'Show ') + (index ? 'confirmation ' : '') + 'password');
      input.focus({ preventScroll: true });
    });
  });
  const meter = document.createElement('div');
  meter.className = 'auth-password-meter';
  meter.dataset.level = '0';
  meter.setAttribute('aria-live', 'polite');
  meter.innerHTML = '<i></i><i></i><i></i><span>Use 8+ chars</span>';
  password.parentElement.after(meter);
  const matchHint = document.createElement('span');
  matchHint.className = 'auth-confirm-hint';
  matchHint.setAttribute('aria-live', 'polite');
  confirmation.parentElement.append(matchHint);
  const updatePasswordHints = () => {
    const value = password.value;
    let score = 0;
    if (value.length >= 8) score++;
    if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
    if (/[0-9\W]/.test(value)) score++;
    meter.dataset.level = value ? String(score || 1) : '0';
    meter.querySelector('span').textContent = !value ? 'Use 8+ chars' : score < 2 ? 'Add length or variety' : score < 3 ? 'Good password' : 'Strong password';
    matchHint.textContent = confirmation.value && confirmation.value !== value ? 'Passwords do not match yet.' : confirmation.value ? 'Passwords match.' : '';
    matchHint.style.color = confirmation.value && confirmation.value === value ? '#55765a' : '';
    confirmation.setCustomValidity(confirmation.value && confirmation.value !== value ? 'The passwords do not match.' : '');
  };
  password.addEventListener('input', updatePasswordHints);
  confirmation.addEventListener('input', updatePasswordHints);
  form.addEventListener('reset', () => window.setTimeout(updatePasswordHints));
  page.querySelectorAll('[data-auth-mode]').forEach(tab => tab.addEventListener('click', () => {
    page.querySelectorAll('[data-auth-mode]').forEach(item => item.setAttribute('aria-selected', String(item === tab)));
    updatePasswordHints();
    const fields = [...form.querySelectorAll('.profile-field:not([hidden])')];
    if (gsap && !reduced) gsap.fromTo(fields, { autoAlpha: 0, y: 7 }, { autoAlpha: 1, y: 0, duration: .24, stagger: .035, delay: .02, clearProps: 'all', ease: 'power2.out' });
  }));
})();
