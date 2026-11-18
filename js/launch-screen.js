(function () {
  const screen = document.getElementById('launchScreen');
  const app = document.querySelector('main.app');
  if (!screen) return;

  const gsap = window.gsap;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const q = (selector) => screen.querySelector(selector);
  const logo = q('[data-launch-gold]');
  const caption = q('[data-launch-caption]');
  const rule = q('[data-launch-rule]');
  const status = q('[data-launch-status]');
  const progress = q('[data-launch-progress]');
  const texture = q('.launch-texture');
  const spotlight = q('.launch-spotlight');
  const sweep = q('.launch-light-sweep');
  const tweenTargets = [screen, logo, caption, rule, status, progress, texture, spotlight, sweep];
  let initialized = document.readyState === 'complete';
  let introComplete = false;
  let exiting = false;
  let removed = false;

  if (app) app.setAttribute('inert', '');

  function cleanup() {
    if (removed) return;
    removed = true;
    if (gsap) gsap.killTweensOf(tweenTargets);
    if (app) app.removeAttribute('inert');
    document.body.classList.remove('splash-active');
    screen.hidden = true;
    screen.remove();
  }

  function finishExit() {
    if (exiting || removed) return;
    exiting = true;
    screen.classList.add('is-leaving');
    if (gsap && !reduceMotion) {
      gsap.timeline({ onComplete: cleanup, defaults: { ease: 'power2.inOut' } })
        .to([status, caption, rule, texture, spotlight, sweep], { autoAlpha: 0, duration: .3, stagger: .025 }, 0)
        .to(screen, { autoAlpha: 0, duration: .22, ease: 'sine.in' }, '>-0.02');
    } else if (gsap) {
      gsap.to(screen, { autoAlpha: 0, duration: .14, onComplete: cleanup });
    } else {
      screen.style.setProperty('transition', 'opacity .3s ease, visibility .3s ease', 'important');
      screen.style.opacity = '0';
      screen.style.visibility = 'hidden';
      window.setTimeout(cleanup, 320);
    }
  }

  function markReady() {
    initialized = true;
    if (introComplete) finishExit();
  }
  if (!initialized) window.addEventListener('load', markReady, { once: true });

  if (gsap && !reduceMotion) {
    gsap.set([texture, spotlight], { autoAlpha: 0 });
    gsap.set(sweep, { autoAlpha: 0, xPercent: -200 });
    gsap.set(logo, {
      autoAlpha: 0,
      y: 20,
      z: -60,
      scale: .9,
      rotationY: -28,
      rotationX: 4,
      rotationZ: -1,
      transformOrigin: '50% 50%',
      force3D: true
    });
    gsap.set([caption, rule, status], { autoAlpha: 0 });
    gsap.set(rule, { scaleX: 0, transformOrigin: 'center' });
    const intro = gsap.timeline({ defaults: { ease: 'power2.out' } });
    intro.to([texture, spotlight], { autoAlpha: 1, duration: .8, ease: 'sine.out' }, .3);
    intro.to(logo, {
      autoAlpha: 1,
      y: 0,
      z: 0,
      scale: 1,
      rotationY: 0,
      rotationX: 0,
      rotationZ: 0,
      duration: 1.85,
      ease: 'power3.out',
      force3D: true,
      overwrite: 'auto'
    }, .3);
    intro.to(sweep, { autoAlpha: .92, xPercent: 480, duration: 1.25, ease: 'power2.inOut' }, .98);
    intro.to(spotlight, { scale: 1.08, duration: 1.1, ease: 'sine.inOut' }, 1.15);
    intro.to(rule, { autoAlpha: 1, scaleX: 1, duration: .52, ease: 'power2.inOut' }, 2.25);
    intro.fromTo(caption,
      { autoAlpha: 0, y: 12, letterSpacing: '.3em' },
      { autoAlpha: 1, y: 0, letterSpacing: '.2em', duration: .68, ease: 'power3.out' },
      2.25
    );
    intro.call(() => {
      introComplete = true;
      if (initialized) finishExit();
      else gsap.to(status, { autoAlpha: 1, y: 0, duration: .32, ease: 'power2.out' });
    }, null, 2.93);

    if (progress) gsap.to(progress, { scaleX: 1, duration: 1.35, repeat: -1, yoyo: true, ease: 'sine.inOut', transformOrigin: 'left center' });
  } else if (gsap) {
    introComplete = true;
    gsap.set([screen, logo, caption, rule, status, texture, spotlight, sweep], { clearProps: 'all' });
    gsap.set(logo, { autoAlpha: 1 });
    gsap.set(caption, { autoAlpha: 1 });
    gsap.set(rule, { autoAlpha: 1, scaleX: 1 });
    gsap.set(status, { autoAlpha: initialized ? 0 : 1 });
    if (initialized) window.setTimeout(finishExit, 350);
    else window.setTimeout(() => { if (!initialized) gsap.set(status, { autoAlpha: 1 }); }, 2930);
  } else {
    introComplete = true;
    logo.style.opacity = '1';
    caption.style.opacity = '1';
    rule.style.opacity = '1';
    rule.style.transform = 'scaleX(1)';
    if (initialized) window.setTimeout(finishExit, 2930);
    else window.setTimeout(() => { if (!initialized) status.style.opacity = '1'; }, 2930);
  }

  window.setTimeout(() => { if (!initialized) finishExit(); }, 12000);
})();
