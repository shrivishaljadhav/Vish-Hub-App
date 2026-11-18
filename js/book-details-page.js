(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let page;
  let activeBook = null;
  let sourceButton = null;
  let transitionNode = null;
  let motionToken = 0;
  let previousOverflow = '';
  let flowState = 'closed';
  let openingPromise = null;

  async function ensureGsap() {
    if (window.gsap) return window.gsap;
    try { await window.vishHubLoadGsap?.(); } catch (error) { console.warn('GSAP could not be loaded for the book transition:', error); }
    return window.gsap || null;
  }

  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  function buildPage() {
    if (page) return page;
    page = make('section', 'book-details-page');
    page.id = 'bookDetailsPage';
    page.hidden = true;
    page.setAttribute('role', 'dialog');
    page.setAttribute('aria-modal', 'true');
    page.setAttribute('aria-labelledby', 'bookDetailsTitle');
    page.innerHTML = `
      <div class="book-details-backdrop" data-details-close></div>
      <main class="book-details-panel" tabindex="-1">
        <header class="book-details-topbar">
          <button class="book-details-back" type="button" data-details-close aria-label="Back to books">← <span>Library</span></button>
          <span class="book-details-brand">VISH HUB <i>·</i> STUDY RESOURCE</span>
          <button class="book-details-close" type="button" data-details-close aria-label="Close book details">×</button>
        </header>
        <div class="book-details-content">
          <section class="book-details-product" aria-label="Book information">
            <div class="book-details-media-column">
              <div class="book-details-cover-wrap"><div class="book-details-cover"><img class="book-details-cover-image" alt=""></div></div>
              <button class="book-details-read" type="button"><span>Read this book</span><b aria-hidden="true">→</b></button>
              <p class="book-details-media-caption">DIGITAL EDITION <span>·</span> PDF</p>
            </div>
            <div class="book-details-copy">
              <div class="book-details-kicker"></div>
              <h1 id="bookDetailsTitle"></h1>
              <div class="book-details-rating"><span class="book-details-stars">PDF EDITION</span><span>FYBA study resource</span></div>
              <p class="book-details-description"></p>
              <div class="book-details-facts"></div>
              <div class="book-details-actions">
                <button class="book-details-save" type="button"><span>Save to library</span></button>
              </div>
              <div class="book-details-assurance"><span>◉</span><span>Opens in the VISH HUB reader<br><small>Your place and page controls stay available.</small></span></div>
            </div>
          </section>
          <section class="book-details-more"><span class="book-details-section-kicker">RESOURCE INFORMATION</span><h2>About this book</h2><p class="book-details-about"></p><div class="book-details-file"></div></section>
        </div>
      </main>`;
    document.body.append(page);
    page.addEventListener('click', event => {
      if (event.target.closest('[data-details-close]')) closeBookDetailsPage();
      if (event.target.closest('.book-details-read')) openBookFromDetails();
      if (event.target.closest('.book-details-save')) toggleSaved();
    });
    page.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); closeBookDetailsPage(); }
      if (event.key === 'Tab') trapFocus(event);
    });
    const coverWrap = page.querySelector('.book-details-cover-wrap');
    const coverImage = page.querySelector('.book-details-cover-image');
    coverWrap.addEventListener('pointermove', event => {
      if (event.pointerType !== 'mouse' || reducedMotion.matches || !window.gsap || page.classList.contains('is-reader-transition')) return;
      const rect = coverWrap.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - .5;
      const y = (event.clientY - rect.top) / rect.height - .5;
      const threeBook = coverWrap.querySelector('.book-details-arrived-frame')?._threeBook;
      if (threeBook?.book && threeBook.render) {
        window.gsap.to(threeBook.book.rotation, {
          x: -.045 - y * .13, y: -.19 + x * .22, z: -.035 - x * .035,
          duration: .36, ease: 'power2.out', overwrite: 'auto', onUpdate: threeBook.render
        });
        if (threeBook.hinge) window.gsap.to(threeBook.hinge.rotation, {
          y: x * -.1, duration: .36, ease: 'power2.out', overwrite: 'auto', onUpdate: threeBook.render
        });
        return;
      }
      window.gsap.to(coverImage, { rotateY: x * 8, rotateX: -y * 5, rotateZ: x * -.7, duration: .32, ease: 'power2.out', overwrite: 'auto' });
    });
    coverWrap.addEventListener('pointerleave', () => {
      if (!window.gsap || reducedMotion.matches || page.classList.contains('is-reader-transition')) return;
      const threeBook = coverWrap.querySelector('.book-details-arrived-frame')?._threeBook;
      if (threeBook?.book && threeBook.render) {
        window.gsap.to(threeBook.book.rotation, {
          x: -.045, y: -.19, z: -.035,
          duration: .48, ease: 'power3.out', overwrite: 'auto', onUpdate: threeBook.render
        });
        if (threeBook.hinge) window.gsap.to(threeBook.hinge.rotation, {
          y: 0, duration: .48, ease: 'power3.out', overwrite: 'auto', onUpdate: threeBook.render
        });
        return;
      }
      window.gsap.to(coverImage, { rotateY: 0, rotateX: 0, rotateZ: 0, scale: 1, duration: .42, ease: 'power3.out', overwrite: 'auto' });
    });
    page.querySelectorAll('.book-details-read,.book-details-save').forEach(button => {
      button.addEventListener('pointerenter', () => {
        if (window.gsap && !reducedMotion.matches && !button.disabled) {
          window.gsap.to(button, { y: -2, scale: 1.015, duration: .24, ease: 'power2.out', overwrite: 'auto' });
        }
      });
      button.addEventListener('pointerleave', () => {
        if (window.gsap && !reducedMotion.matches) {
          window.gsap.to(button, { y: 0, scale: 1, duration: .3, ease: 'power2.out', overwrite: 'auto' });
        }
      });
    });
    return page;
  }

  function coverSource(book, button) {
    const image = button?.querySelector('.book-cover-frame img');
    if (image?.currentSrc || image?.src) return image.currentSrc || image.src;
    return book.resource?.coverUrl || '';
  }

  function containedArtworkRect(image, box) {
    if (!image || !box?.width || !box?.height) return box;
    const naturalWidth = image.naturalWidth || 0;
    const naturalHeight = image.naturalHeight || 0;
    if (!naturalWidth || !naturalHeight) return box;
    const imageRatio = naturalWidth / naturalHeight;
    const boxRatio = box.width / box.height;
    if (imageRatio > boxRatio) {
      const height = box.width / imageRatio;
      return { left: box.left, top: box.top + (box.height - height) / 2, width: box.width, height };
    }
    const width = box.height * imageRatio;
    return { left: box.left + (box.width - width) / 2, top: box.top, width, height: box.height };
  }

  function snapshotRect(rect) {
    if (!rect) return null;
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }

  function setText(selector, value, fallback = '') {
    const node = page.querySelector(selector);
    node.textContent = value || fallback;
    return node;
  }

  function populate(book, button) {
    activeBook = book;
    sourceButton = button;
    const resource = book.resource || {};
    const title = book.title || resource.title || 'Study book';
    const subject = book.subject?.name || resource.subject || 'FYBA';
    const category = resource.type || 'Books';
    const author = resource.author || resource.extracted?.author || '';
    const description = resource.description || resource.extracted?.course || resource.summary || '';
    const img = page.querySelector('.book-details-cover-image');
    const coverWrap = page.querySelector('.book-details-cover-wrap');
    window.gsap?.killTweensOf(img);
    window.gsap?.set(img, { clearProps: 'transform,transformOrigin' });
    img.src = resource.coverFrontUrl || coverSource(book, button);
    img.alt = 'Cover of ' + title;
    // Keep the hardcover artwork separate from the PDF raster. The 3D reader
    // hinges this supplied front cover; PDF page 1 remains reader content only.
    coverWrap.dataset.coverFrontUrl = resource.coverFrontUrl || '';
    coverWrap.dataset.coverSpineUrl = resource.coverSpineUrl || '';
    coverWrap.dataset.coverBackUrl = resource.coverBackUrl || '';
    page.querySelector('.book-details-cover').classList.toggle('has-image', Boolean(img.src));
    setText('#bookDetailsTitle', title);
    setText('.book-details-kicker', [subject, category].filter(Boolean).join('  /  ').toUpperCase());
    setText('.book-details-description', description, 'A digital course book for your FYBA study collection. Open it in the VISH HUB reader to browse the original pages.');
    setText('.book-details-about', description, 'This resource is part of the VISH HUB FYBA study library. The original PDF is preserved and opens in the interactive book reader.');
    page.querySelector('.book-details-rating').lastElementChild.textContent = author ? 'By ' + author : 'FYBA study resource';
    const facts = page.querySelector('.book-details-facts');
    facts.replaceChildren();
    [["SUBJECT", subject], ["RESOURCE", category], ["FORMAT", "PDF"], ["ACCESS", "Digital"]].forEach(([label, value]) => {
      const item = make('div', 'book-details-fact');
      item.append(make('span', '', label), make('strong', '', value));
      facts.append(item);
    });
    const file = make('div', 'book-details-file');
    file.append(make('span', 'book-details-file-icon', 'PDF'), make('span', 'book-details-file-name', resource.fileName || title + '.pdf'), make('span', 'book-details-file-check', '✓'));
    page.querySelector('.book-details-file').replaceWith(file);
    const saveSource = button?.closest('.book-cover-card')?.querySelector('.book-save');
    const isSaved = saveSource?.getAttribute('aria-pressed') === 'true';
    const save = page.querySelector('.book-details-save');
    save.classList.toggle('is-saved', isSaved);
    save.querySelector('span').textContent = isSaved ? 'Saved to library' : 'Save to library';
    page.querySelector('.book-details-read').disabled = !(resource.pdfUrl || resource.driveUrl);
  }

  function transitionThumbnail(frame, fromRect, toRect, gsap, reverse = false, holdAtDestination = false) {
    if (!frame || !fromRect || !toRect || !gsap || reducedMotion.matches) return Promise.resolve(null);
    if (transitionNode?.restore) {
      transitionNode.timeline?.kill();
      transitionNode.restore();
    }
    const token = ++motionToken;
    const parent = frame.parentNode;
    if (!parent) return Promise.resolve(null);
    const nextSibling = frame.nextSibling;
    const originalStyle = frame.getAttribute('style');
    const coverImage = frame.querySelector('img');
    const sourceCard = frame.closest('.book-cover-card');
    // Keep a ready 3D book canvas visible through card-to-Details. Only use the
    // flat source image when WebGL did not produce a book model.
    // The cover image itself is the flying object. Never move the old WebGL
    // canvas or its placeholder material as a substitute for uploaded art.
    const useCoverImageDuringFlight = Boolean(coverImage);
    // A WebGL canvas can leave its last composited frame visible at the old
    // card location after reparenting. Hide the source card until the cover
    // has returned, so only the traveling cover is visible in either flow.
    sourceCard?.classList.add('book-thumbnail-source-hidden');
    const placeholder = document.createElement('span');
    placeholder.className = 'book-thumbnail-transition-placeholder';
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.style.width = fromRect.width + 'px';
    placeholder.style.height = fromRect.height + 'px';
    placeholder.style.flex = '0 0 ' + fromRect.width + 'px';
    placeholder.style.boxSizing = 'border-box';
    parent.insertBefore(placeholder, frame);
    document.body.append(frame);
    frame.classList.add('book-details-flight-frame');
    if (useCoverImageDuringFlight) frame.classList.add('book-details-flight-use-image');
    frame.style.left = fromRect.left + 'px';
    frame.style.top = fromRect.top + 'px';
    frame.style.width = fromRect.width + 'px';
    frame.style.height = fromRect.height + 'px';
    // Preserve the source frame's measured box. The title label is a separate
    // grid row and must never participate in the cover's return dimensions.
    const state = { frame, placeholder, sourceCard, fromRect: snapshotRect(fromRect), toRect: snapshotRect(toRect), timeline: null, restore: null };
    let restored = false;
    const restore = ({ keepSourceHidden = false } = {}) => {
      if (restored) return;
      restored = true;
      frame.classList.remove('book-details-flight-frame');
      frame.classList.remove('book-details-flight-use-image');
      frame.classList.remove('book-details-arrived-frame');
      if (originalStyle == null) frame.removeAttribute('style');
      else frame.setAttribute('style', originalStyle);
      if (placeholder.isConnected && parent.isConnected) parent.insertBefore(frame, placeholder);
      else if (parent.isConnected) parent.insertBefore(frame, nextSibling?.parentNode === parent ? nextSibling : null);
      placeholder.remove();
      if (!keepSourceHidden) sourceCard?.classList.remove('book-thumbnail-source-hidden');
      if (transitionNode === state) transitionNode = null;
    };
    state.restore = restore;
    transitionNode = state;
    const duration = 1.45;
    const scaleX = toRect.width / fromRect.width;
    const scaleY = toRect.height / fromRect.height;
    // Both ends use the measured frame size exactly. A 3% undershoot here was
    // visible as a final resize when the frame returned to normal document flow.
    const startScale = 1;
    const endScale = 1;
    gsap.set(frame, {
      left: fromRect.left, top: fromRect.top, width: fromRect.width, height: fromRect.height,
      x: 0, y: 0, scaleX: startScale, scaleY: startScale,
      rotateY: -7, rotateZ: reverse ? 0 : -.8,
      transformPerspective: 1400, transformOrigin: '50% 50%'
    });
    return new Promise(resolve => {
      const timeline = gsap.timeline({ onComplete() {
        if (token !== motionToken) { resolve(null); return; }
        if (holdAtDestination) resolve(state);
        else { restore(); resolve(null); }
      } });
      state.timeline = timeline;
      timeline.to(frame, {
        x: toRect.left - fromRect.left + (toRect.width - fromRect.width) / 2,
        y: toRect.top - fromRect.top + (toRect.height - fromRect.height) / 2,
        scaleX: scaleX * endScale, scaleY: scaleY * endScale,
        rotateY: 0, rotateZ: 0,
        duration, ease: 'power3.inOut'
      }, 0);
    });
  }

  function detailsMotionTargets() {
    return [
      page.querySelector('.book-details-topbar'),
      page.querySelector('.book-details-cover-wrap'),
      page.querySelector('.book-details-read'),
      page.querySelector('.book-details-media-caption'),
      page.querySelector('.book-details-kicker'),
      page.querySelector('#bookDetailsTitle'),
      page.querySelector('.book-details-rating'),
      page.querySelector('.book-details-description'),
      page.querySelector('.book-details-facts'),
      page.querySelector('.book-details-actions'),
      page.querySelector('.book-details-assurance'),
      page.querySelector('.book-details-more')
    ].filter(Boolean);
  }

  function revealDetailsWithGsap(gsap, backdropAlreadyVisible = false, keepCoverForFlight = false) {
    page.classList.add('is-open');
    page.style.visibility = 'visible';
    page.style.pointerEvents = 'none';
    if (!gsap || reducedMotion.matches) {
      page.style.removeProperty('opacity');
      return Promise.resolve();
    }
    const targets = detailsMotionTargets();
    const coverWrap = page.querySelector('.book-details-cover-wrap');
    const coverImage = page.querySelector('.book-details-cover-image');
    gsap.set(targets, { autoAlpha: 0, y: 22 });
    if (keepCoverForFlight) gsap.set(coverWrap, { y: 0 });
    const contentTargets = keepCoverForFlight ? targets.filter(target => target !== coverWrap) : targets;
    return new Promise(resolve => {
      const timeline = gsap.timeline({ onComplete: resolve });
      if (!backdropAlreadyVisible) {
        gsap.set(page, { opacity: 0 });
        timeline.to(page, { opacity: 1, duration: .9, ease: 'power2.out' }, 0);
      }
      timeline.to(contentTargets, { autoAlpha: 1, y: 0, duration: .78, stagger: .085, ease: 'power3.out' }, backdropAlreadyVisible ? 0 : .18);
      if (coverImage && !keepCoverForFlight) timeline.fromTo(coverImage,
        { rotateY: 0, rotateX: 0, rotateZ: 0, scale: .98 },
        { rotateY: 0, rotateX: 0, rotateZ: 0, scale: 1, duration: .72, ease: 'power3.out' }, backdropAlreadyVisible ? .08 : .22);
    });
  }

  function dockFlightCoverInDetails(flightState) {
    if (!flightState?.frame) return;
    const coverWrap = page.querySelector('.book-details-cover-wrap');
    page.classList.remove('is-book-handoff');
    if (flightState.frame.parentNode !== coverWrap) {
      flightState.frame.classList.remove('book-details-flight-frame');
      flightState.frame.classList.add('book-details-arrived-frame');
      flightState.frame.style.cssText = '';
      coverWrap.append(flightState.frame);
    }
    // Keep the exact same DOM node that flew from the card. It occupies the
    // same cover viewport, but hide its Three.js model. The uploaded cover
    // image in Details is now the only visible cover and the GSAP flight node.
    coverWrap.style.opacity = '1';
    coverWrap.style.visibility = 'visible';
    flightState.frame.style.setProperty('visibility', 'hidden', 'important');
    flightState.frame.style.setProperty('opacity', '0', 'important');
    const coverImage = page.querySelector('.book-details-cover-image');
    coverImage?.style.setProperty('visibility', 'visible', 'important');
    coverImage?.style.setProperty('opacity', '1', 'important');
  }

  function reverseVisibleCoverToLibrary(gsap, flightState) {
    const image = page.querySelector('.book-details-cover-image');
    if (!image || !flightState?.restore) {
      flightState?.sourceCard?.classList.remove('book-thumbnail-source-hidden');
      return Promise.resolve();
    }

    // Return the original frame to its library slot while the Details cover
    // travels back to the exact coordinates captured at entry.
    flightState.timeline?.kill();
    flightState.restore({ keepSourceHidden: true });
    // Use the exact library coordinates captured before that frame was moved.
    // Measuring the reinserted carousel item here can return a shifted position
    // because restoring the frame changes its layout while the Details overlay
    // is still open.
    const sourceRect = snapshotRect(flightState.fromRect);
    if (!sourceRect || sourceRect.width < 20 || sourceRect.height < 20) {
      flightState.sourceCard?.classList.remove('book-thumbnail-source-hidden');
      return Promise.resolve();
    }

    gsap.killTweensOf(image);
    gsap.set(image, { clearProps: 'transform,transformOrigin' });
    const fromRect = image.getBoundingClientRect();
    const toRect = sourceRect;
    const parent = image.parentNode;
    if (!parent || !fromRect.width || !fromRect.height) {
      flightState.sourceCard?.classList.remove('book-thumbnail-source-hidden');
      return Promise.resolve();
    }
    const nextSibling = image.nextSibling;
    const originalStyle = image.getAttribute('style');
    const placeholder = document.createElement('span');
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.style.cssText = `display:block;width:${fromRect.width}px;height:${fromRect.height}px;min-width:0;min-height:0;pointer-events:none`;
    parent.insertBefore(placeholder, image);
    document.body.append(image);
    image.style.cssText = `position:fixed;left:${fromRect.left}px;top:${fromRect.top}px;width:${fromRect.width}px;height:${fromRect.height}px;max-width:none;max-height:none;margin:0;padding:0;z-index:1700;object-fit:contain;object-position:center;background:transparent;pointer-events:none;transform-style:preserve-3d;backface-visibility:hidden;will-change:left,top,width,height,transform;filter:drop-shadow(12px 18px 16px rgba(16,41,75,.25))`;
    gsap.set(image, {
      x: 0, y: 0, rotateY: 0, rotateX: 0, rotateZ: 0, scaleX: 1, scaleY: 1,
      transformPerspective: 1400, transformOrigin: '50% 50%', force3D: true
    });

    return new Promise(resolve => {
      const timeline = gsap.timeline({ onComplete() {
        gsap.killTweensOf(image);
        gsap.set(image, { clearProps: 'transform,transformOrigin,willChange,filter' });
        if (placeholder.isConnected && parent.isConnected) parent.insertBefore(image, placeholder);
        else if (parent.isConnected) parent.insertBefore(image, nextSibling?.parentNode === parent ? nextSibling : null);
        placeholder.remove();
        if (originalStyle == null) image.removeAttribute('style');
        else image.setAttribute('style', originalStyle);
        page.classList.remove('is-book-handoff');
        flightState.sourceCard?.classList.remove('book-thumbnail-source-hidden');
        resolve();
      } });
      timeline.to(image, {
        left: toRect.left, top: toRect.top, width: toRect.width, height: toRect.height,
        rotateY: 0, rotateX: 0, rotateZ: 0, scaleX: 1, scaleY: 1,
        duration: 1.45, ease: 'power3.inOut'
      }, 0);
    });
  }

  function hideDetailsWithGsap(gsap) {
    if (!gsap || reducedMotion.matches) return Promise.resolve();
    const targets = detailsMotionTargets().reverse();
    return new Promise(resolve => {
      const timeline = gsap.timeline({ onComplete: resolve });
      timeline.to(targets, { autoAlpha: 0, y: -8, duration: .5, stagger: .045, ease: 'power2.in' }, 0)
        .to(page, { opacity: 0, duration: .62, ease: 'power2.inOut' }, 0);
    });
  }

  async function openBookDetailsPage(book, button) {
    if (!book || !button) return false;
    const resource = book.resource || {};
    if (!(resource.pdfUrl || resource.driveUrl)) return false;
    if (flowState !== 'closed') return false;
    flowState = 'opening';
    let finishOpening;
    openingPromise = new Promise(resolve => { finishOpening = resolve; });
    try {
      const gsap = reducedMotion.matches ? null : await ensureGsap();
      buildPage();
      populate(book, button);
      // Pointer tilt changes the transformed bounding box of the source card.
      // Ease it back to its carousel pose before measuring the flight origin so
      // the returning cover lands on the same geometry after pointerleave.
      const sourceCard = button.closest('.book-cover-card');
      if (gsap && sourceCard) {
        gsap.to(sourceCard, {
          '--book-tilt-x': '0deg',
          '--book-tilt-y': '0deg',
          duration: .18,
          ease: 'power2.out',
          overwrite: 'auto'
        });
        await new Promise(resolve => window.setTimeout(resolve, 190));
      }
      const frame = button.querySelector('.book-cover-frame');
      const fromRect = frame?.getBoundingClientRect();
      page.hidden = false;
      page.classList.remove('is-open', 'is-closing', 'is-book-handoff');
      page.classList.add('is-opening');
      page.style.opacity = '0';
      page.style.visibility = 'visible';
      page.style.pointerEvents = 'none';
      page.setAttribute('aria-hidden', 'false');
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const target = page.querySelector('.book-details-cover-wrap');
      const detailsCover = page.querySelector('.book-details-cover-image');
      try { await detailsCover?.decode?.(); } catch {}
      const toRect = containedArtworkRect(detailsCover, target?.getBoundingClientRect());
      if (gsap && !reducedMotion.matches) {
        const detailsReveal = revealDetailsWithGsap(gsap, false, true);
        const flightState = await transitionThumbnail(frame, fromRect, toRect, gsap, false, true);
        if (flightState) dockFlightCoverInDetails(flightState);
        await detailsReveal;
        if (!flightState) {
          await new Promise(resolve => gsap.to(page.querySelector('.book-details-cover-wrap'), {
            autoAlpha: 1, y: 0, duration: .58, ease: 'power3.out', onComplete: resolve
          }));
        }
      } else if (!reducedMotion.matches) {
        await transitionThumbnail(frame, fromRect, toRect, gsap, false);
      }
      if (!gsap || reducedMotion.matches) await revealDetailsWithGsap(gsap);
      page.classList.remove('is-opening');
      page.style.pointerEvents = 'auto';
      page.querySelector('.book-details-panel').focus({ preventScroll: true });
      return true;
    } catch (error) {
      console.error('Book details could not finish opening:', error);
      transitionNode?.restore?.();
      if (page) {
        page.hidden = true;
        page.classList.remove('is-open', 'is-opening', 'is-closing', 'is-book-handoff');
        page.setAttribute('aria-hidden', 'true');
      }
      document.body.style.overflow = previousOverflow;
      return false;
    } finally {
      flowState = page && !page.hidden ? 'open' : 'closed';
      finishOpening?.();
      openingPromise = null;
    }
  }

  async function closeBookDetailsPage() {
    if (flowState === 'opening' && openingPromise) await openingPromise;
    if (!page || page.hidden || flowState !== 'open') return;
    flowState = 'closing';
    const gsap = reducedMotion.matches ? null : await ensureGsap();
    const targetRect = page.querySelector('.book-details-cover-wrap')?.getBoundingClientRect();
    const sourceRect = sourceButton?.querySelector('.book-cover-frame')?.getBoundingClientRect();
    const heldFlight = transitionNode?.frame?.classList.contains('book-details-arrived-frame') ? transitionNode : null;
    page.classList.add('is-closing');
    page.style.pointerEvents = 'none';
    if (gsap && !reducedMotion.matches) {
      await Promise.all([
        heldFlight ? reverseVisibleCoverToLibrary(gsap, heldFlight) : transitionThumbnail(sourceButton?.querySelector('.book-cover-frame'), targetRect, sourceRect, gsap, true),
        hideDetailsWithGsap(gsap)
      ]);
    } else {
      page.classList.remove('is-open');
      if (heldFlight) heldFlight.restore();
      else if (!reducedMotion.matches) await transitionThumbnail(sourceButton?.querySelector('.book-cover-frame'), targetRect, sourceRect, gsap, true);
    }
    page.hidden = true;
    page.classList.remove('is-open', 'is-closing', 'is-opening', 'is-book-handoff');
    page.setAttribute('aria-hidden', 'true');
    page.style.removeProperty('opacity');
    page.style.removeProperty('visibility');
    page.style.removeProperty('pointer-events');
    document.body.style.overflow = previousOverflow;
    sourceButton?.focus?.({ preventScroll: true });
    flowState = 'closed';
  }

  function openBookFromDetails() {
    if (!sourceButton || !page || flowState !== 'open') return;
    const viewer = document.getElementById('pdfViewer');
    const detailsCover = page.querySelector('.book-details-cover-wrap');
    if (!viewer || !detailsCover || !activeBook?.resource) return;
    // Open the actual resource directly. A synthetic click on the hidden
    // library card could be intercepted by other page handlers and leave the
    // reader closed while the Details animation proceeds.
    const opened = window.vishHubOpenResource?.(activeBook.resource);
    if (!opened) {
      // Keep the primary action usable if app-core's bridge was not attached
      // for some reason: initialize the same reader surface directly.
      viewer.classList.add('open');
      document.getElementById('pdfViewerScrim')?.classList.add('open');
      window.openVishPdfBook?.(activeBook.resource);
    }
    if (!viewer.classList.contains('open')) return;
    if (!window.vishHubStartDetailsReaderTransition?.(detailsCover, viewer)) {
      // A stale or interrupted motion must never leave the reader hidden
      // behind the product page. Keep the Read action functional even when
      // the decorative transition cannot be started.
      if (window.vishHubForceDetailsReader) window.vishHubForceDetailsReader(viewer);
      else {
        viewer.classList.add('open');
        viewer.style.setProperty('opacity', '1', 'important');
        viewer.style.setProperty('visibility', 'visible', 'important');
        viewer.style.setProperty('pointer-events', 'auto', 'important');
        finishBookDetailsReaderTransition();
      }
    }
  }

  function beginBookDetailsReaderTransition() {
    if (!page || page.hidden || flowState !== 'open') return false;
    page.classList.add('is-reader-transition');
    page.style.pointerEvents = 'none';
    // Clear the product-page controls as soon as the cover starts travelling,
    // while retaining its opaque backdrop until the reader is fully revealed.
    // This prevents the Details UI lingering behind the opening book without
    // exposing the Resource Library underneath it.
    if (window.gsap) {
      page._readerExitTimeline?.kill();
      page._readerExitTimeline = window.gsap.timeline({ defaults: { ease: 'power2.inOut', overwrite: 'auto' } })
        .to(page.querySelector('.book-details-content'), { autoAlpha: 0, y: -9, duration: .72 }, .12)
        .to(page.querySelector('.book-details-topbar'), { autoAlpha: 0, y: -7, duration: .58 }, .26);
    }
    return true;
  }

  function finishBookDetailsReaderTransition() {
    if (!page || page.hidden) return;
    page.hidden = true;
    page.classList.remove('is-reader-transition', 'is-opening', 'is-closing');
    page.setAttribute('aria-hidden', 'true');
    page.style.pointerEvents = 'none';
    flowState = 'reader';
    document.querySelector('#pdfViewer .pdf-book-reader')?.focus?.({ preventScroll: true });
  }

  function cancelBookDetailsReaderTransition() {
    if (!page || page.hidden) return;
    page._readerExitTimeline?.kill();
    page._readerExitTimeline = null;
    page.classList.remove('is-reader-transition');
    page.classList.add('is-open');
    page.style.pointerEvents = 'auto';
    if (window.gsap) {
      window.gsap.set([
        page.querySelector('.book-details-topbar'),
        page.querySelector('.book-details-content')
      ].filter(Boolean), { autoAlpha: 1, y: 0, clearProps: 'opacity,visibility,transform' });
    }
    flowState = 'open';
  }

  function restoreBookDetailsAfterReader() {
    if (!page || flowState !== 'reader') return;
    page._readerExitTimeline?.kill();
    page._readerExitTimeline = null;
    if (window.gsap) {
      window.gsap.set([
        page.querySelector('.book-details-topbar'),
        page.querySelector('.book-details-content')
      ].filter(Boolean), { autoAlpha: 1, y: 0, clearProps: 'opacity,visibility,transform' });
    }
    page.hidden = false;
    page.classList.remove('is-reader-transition', 'is-closing', 'is-opening');
    page.classList.add('is-open');
    page.style.opacity = '1';
    page.style.visibility = 'visible';
    page.style.pointerEvents = 'auto';
    page.setAttribute('aria-hidden', 'false');
    flowState = 'open';
    page.querySelector('.book-details-read')?.focus?.({ preventScroll: true });
  }

  function toggleSaved() {
    const saveSource = sourceButton?.closest('.book-cover-card')?.querySelector('.book-save');
    if (!saveSource) return;
    saveSource.click();
    const saved = saveSource.getAttribute('aria-pressed') === 'true';
    const save = page.querySelector('.book-details-save');
    save.classList.toggle('is-saved', saved);
    save.querySelector('span').textContent = saved ? 'Saved to library' : 'Save to library';
  }

  function trapFocus(event) {
    const items = Array.from(page.querySelectorAll('button:not(:disabled)'));
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  document.addEventListener('click', event => {
    if (flowState === 'reader' && (event.target.closest?.('#closePdfViewer') || event.target.id === 'pdfViewerScrim')) {
      restoreBookDetailsAfterReader();
    }
    const button = event.target.closest?.('#booksPage .book-cover-open');
    if (!button || button.dataset.bookDetailsReader === 'true') return;
    const card = button.closest('.book-cover-card');
    if (!card) return;
    // The library card owns its resource object; ask app-core to populate the
    // product view through a one-shot hook attached on the clicked button.
    const request = button._vishBookRecord;
    if (!request) return;
    if (request.resource?.pdfUrl || request.resource?.driveUrl) {
      void openBookDetailsPage(request, button);
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && flowState === 'reader') restoreBookDetailsAfterReader();
  }, true);

  window.openBookDetailsPage = openBookDetailsPage;
  window.closeBookDetailsPage = closeBookDetailsPage;
  window.vishHubBeginBookDetailsReaderTransition = beginBookDetailsReaderTransition;
  window.vishHubCancelBookDetailsReaderTransition = cancelBookDetailsReaderTransition;
  window.vishHubFinishBookDetailsReaderTransition = finishBookDetailsReaderTransition;
  window.vishHubRestoreBookDetailsAfterReader = restoreBookDetailsAfterReader;
})();
