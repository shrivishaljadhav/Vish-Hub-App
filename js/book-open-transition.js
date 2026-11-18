(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const vendor = {
    gsap: 'js/vendor/gsap-3.15.1.min.js',
    three: 'js/vendor/three-0.152.2.min.js'
  };
  let librariesPromise = null;
  let activeMotion = null;
  let completedDetailsMotion = null;
  let nativeCloseAllowed = false;
  let transitionStarting = false;
  const readerMotionState = new WeakMap();
  const readerStartupWatchdogs = new WeakMap();

  function clearReaderStartupWatchdog(viewer) {
    if (!viewer) return;
    clearTimeout(readerStartupWatchdogs.get(viewer));
    readerStartupWatchdogs.delete(viewer);
  }

  function beginGsapReaderState(viewer, scrim) {
    if (!viewer) return;
    let state = readerMotionState.get(viewer);
    if (!state) {
      const elements = [viewer, scrim].filter(Boolean);
      state = elements.map(element => ({
        element,
        properties: ['opacity', 'visibility', 'pointer-events', 'transition', 'animation'].map(property => ({
          property,
          value: element.style.getPropertyValue(property),
          priority: element.style.getPropertyPriority(property)
        }))
      }));
      readerMotionState.set(viewer, state);
    }
    viewer.dataset.bookTransitionPending = 'true';
    state.forEach(({ element }) => {
      element.style.setProperty('transition', 'none', 'important');
      element.style.setProperty('animation', 'none', 'important');
      if (window.gsap) window.gsap.set(element, { opacity: 0, visibility: 'visible', pointerEvents: 'none' });
      else {
        element.style.setProperty('opacity', '0');
        element.style.setProperty('visibility', 'visible');
        element.style.setProperty('pointer-events', 'none');
      }
    });
  }

  function clearGsapReaderState(viewer) {
    if (!viewer) return;
    const state = readerMotionState.get(viewer);
    if (state) {
      state.forEach(({ element, properties }) => properties.forEach(({ property, value, priority }) => {
        if (value) element.style.setProperty(property, value, priority);
        else element.style.removeProperty(property);
      }));
      readerMotionState.delete(viewer);
    }
    delete viewer.dataset.bookTransitionPending;
  }

  function loadScript(url, ready) {
    if (ready()) return Promise.resolve();
    let existing = document.querySelector(`script[data-book-motion="${url}"]`);
    if (existing?.dataset.state === 'failed') { existing.remove(); existing = null; }
    if (existing?.dataset.state === 'loaded' && !ready()) {
      existing.remove();
      existing = null;
    }
    const script = existing || document.createElement('script');
    if (!existing) {
      script.src = url;
      script.async = true;
      script.dataset.bookMotion = url;
      script.dataset.state = 'loading';
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        clearTimeout(timer);
        script.removeEventListener('load', onLoad);
        script.removeEventListener('error', onError);
      };
      const finish = (error = null) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve();
      };
      const onLoad = () => {
        script.dataset.state = 'loaded';
        ready() ? finish() : finish(new Error(`Could not initialize ${url}`));
      };
      const onError = () => {
        script.dataset.state = 'failed';
        finish(new Error(`Could not load ${url}`));
      };
      const timer = setTimeout(() => finish(new Error(`Timed out loading ${url}`)), 3500);
      script.addEventListener('load', onLoad, { once: true });
      script.addEventListener('error', onError, { once: true });
      if (!existing) document.head.append(script);
      else if (script.dataset.state === 'loaded' && ready()) finish();
    });
  }

  function loadMotionLibraries() {
    if (window.gsap && window.THREE) return Promise.resolve();
    if (!librariesPromise) {
      librariesPromise = Promise.all([
        loadScript(vendor.gsap, () => Boolean(window.gsap)),
        loadScript(vendor.three, () => Boolean(window.THREE))
      ]).catch(error => { librariesPromise = null; throw error; });
    }
    return librariesPromise;
  }
  window.vishHubLoadGsap = () => loadScript(vendor.gsap, () => Boolean(window.gsap));
  window.vishHubLoadBookMotion = loadMotionLibraries;

  function warmLibraries(event) {
    const card = event.target.closest?.('#booksPage .book-cover-open');
    if (card) void loadMotionLibraries().catch(() => {});
  }

  document.addEventListener('pointerover', warmLibraries, { passive: true });
  document.addEventListener('focusin', warmLibraries);
  document.addEventListener('pointerdown', warmLibraries, { passive: true, capture: true });
  // Warm the local animation libraries before the first tap, especially on touch devices.
  if ('requestIdleCallback' in window) window.requestIdleCallback(() => void loadMotionLibraries().catch(() => {}), { timeout: 1800 });
  else window.setTimeout(() => void loadMotionLibraries().catch(() => {}), 350);

  function makePageTexture(THREE, image) {
    if (!image || !image.complete || !image.naturalWidth) return null;
    const texture = new THREE.Texture(image);
    texture.needsUpdate = true;
    if ('colorSpace' in texture && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
    else if ('encoding' in texture && THREE.sRGBEncoding) texture.encoding = THREE.sRGBEncoding;
    texture.anisotropy = 2;
    return texture;
  }

  function makeCoverTexture(THREE, image) {
    if (!image || !image.complete || !image.naturalWidth) return null;
    // Snapshot decoded cover artwork before WebGL upload. Chromium can leave a
    // DOM-image texture black during local-file reader handoffs.
    const textureCanvas = document.createElement('canvas');
    textureCanvas.width = image.naturalWidth;
    textureCanvas.height = image.naturalHeight;
    const context = textureCanvas.getContext('2d', { alpha: true });
    if (!context) return null;
    try { context.drawImage(image, 0, 0, textureCanvas.width, textureCanvas.height); }
    catch { return null; }
    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.needsUpdate = true;
    if ('colorSpace' in texture && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
    else if ('encoding' in texture && THREE.sRGBEncoding) texture.encoding = THREE.sRGBEncoding;
    texture.anisotropy = 2;
    return texture;
  }

  const coverArtworkCache = new Map();
  function loadCoverArtwork(url) {
    if (!url) return Promise.resolve(null);
    const absoluteUrl = new URL(url, document.baseURI).href;
    if (coverArtworkCache.has(absoluteUrl)) return coverArtworkCache.get(absoluteUrl);
    const pending = new Promise(resolve => {
      const image = new Image();
      image.onload = async () => {
        try { await image.decode?.(); } catch { /* onload still gives us a usable image */ }
        resolve(image);
      };
      image.onerror = () => resolve(null);
      image.src = absoluteUrl;
      if (image.complete && image.naturalWidth) resolve(image);
    });
    coverArtworkCache.set(absoluteUrl, pending);
    return pending;
  }

  function createBookScene(card, viewer, suppliedAssets = {}) {
    const THREE = window.THREE;
    const gsap = window.gsap;
    const fromDetails = Boolean(card?.matches?.('.book-details-cover-wrap'));
    // The handoff frame is the cover that actually travelled in from the
    // library. Prefer it over the static product-page artwork underneath it;
    // moving the latter leaves the visible cover behind and looks like a copy.
    const source = fromDetails
      ? (card.querySelector('.book-details-arrived-frame img') || card.querySelector('.book-details-cover-image'))
      : card?.querySelector('.book-3d-cover-front img, .book-cover-frame img');
    const thumbnail = fromDetails ? source : (card?.querySelector('.book-three-thumbnail') || source);
    const stage = viewer.querySelector('.pdf-book-stage');
    if (!THREE || !gsap || !source?.complete || !source.naturalWidth || !stage) return null;
    const pdfLayout = window.vishHubPdfTransitionPages?.();
    const coverPage = pdfLayout?.pages?.find(page => page.pageIndex === 0);
    // The raster is the visible printed face of the real StPageFlip sheet.
    // Measuring it gives the traveling cover the exact same bounds.
    const coverPageRect = coverPage?.image?.getBoundingClientRect?.() || coverPage?.element?.getBoundingClientRect?.();
    const hasCoverPageRect = Boolean(coverPageRect?.width > 30 && coverPageRect?.height > 30);

    const mobile = matchMedia('(max-width: 680px)').matches;
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const from = thumbnail.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    // Details begins with a single closed cover even on desktop. Its model
    // must match the standalone StPageFlip cover; the real reader supplies
    // the interior spread once the cover starts opening.
    const singlePage = fromDetails || viewer.querySelector('.pdf-book-single-page');
    const flipParent = viewer.querySelector('.pdf-book-pageflip-host .stf__parent');
    const flipRect = flipParent?.getBoundingClientRect();
    const hasFlipSize = flipRect && flipRect.width > 30 && flipRect.height > 30;
    const aspect = pdfLayout?.pageAspectRatio ||
      (coverPage?.image?.naturalWidth && coverPage?.image?.naturalHeight
        ? coverPage.image.naturalWidth / coverPage.image.naturalHeight
        : source.naturalWidth / source.naturalHeight || .7);
    let pageWidth;
    let pageHeight;
    if (hasCoverPageRect) {
      pageWidth = coverPageRect.width;
      pageHeight = coverPageRect.height;
    } else if (hasFlipSize) {
      pageHeight = flipRect.height;
      pageWidth = singlePage ? flipRect.width : flipRect.width / 2;
    } else {
      const spreadFit = stageRect.width * (singlePage ? .78 : .88) / (aspect * (singlePage ? 1 : 2));
      pageHeight = Math.min(stageRect.height * .82, spreadFit);
      pageWidth = pageHeight * aspect;
    }
    if (!hasCoverPageRect && singlePage) pageWidth = Math.min(pageWidth, stageRect.width * .78);
    if (!hasCoverPageRect) pageHeight = pageWidth / aspect;
    if (!hasCoverPageRect && pageHeight > stageRect.height * .88) {
      pageHeight = stageRect.height * .88;
      pageWidth = pageHeight * aspect;
    }
    if (!(pageWidth > 30 && pageHeight > 30 && from.width > 2 && from.height > 2)) return null;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: !mobile,
        powerPreference: 'low-power',
        depth: true,
        stencil: false,
        preserveDrawingBuffer: false
      });
    } catch { return null; }

    const canvas = renderer.domElement;
    canvas.className = 'book-transition-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1 : 1.45));
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x000000, 0);
    document.body.append(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, .1, 5000);
    camera.position.set(0, 0, 2400);
    const ambient = new THREE.AmbientLight(0xfff8e7, 1.28);
    scene.add(ambient);
    const keyLight = new THREE.DirectionalLight(0xfff3d7, 2.2);
    keyLight.position.set(-width * .32, height * .38, 700);
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(0xd4b267, .7, Math.max(width, height) * 1.4);
    rimLight.position.set(width * .34, -height * .23, 480);
    scene.add(rimLight);

    const root = new THREE.Group();
    scene.add(root);
    const bookBody = new THREE.Group();
    root.add(bookBody);

    const edgeCanvas = document.createElement('canvas');
    edgeCanvas.width = 128;
    edgeCanvas.height = 256;
    const edgeContext = edgeCanvas.getContext('2d');
    edgeContext.fillStyle = '#f8f5ea';
    edgeContext.fillRect(0, 0, edgeCanvas.width, edgeCanvas.height);
    for (let y = 2; y < edgeCanvas.height; y += 5) {
      edgeContext.fillStyle = 'rgba(137,117,77,.25)';
      edgeContext.fillRect(0, y, edgeCanvas.width, 1);
      edgeContext.fillStyle = 'rgba(255,255,255,.78)';
      edgeContext.fillRect(0, y + 1, edgeCanvas.width, 1);
    }
    const edgeTexture = new THREE.CanvasTexture(edgeCanvas);
    const paper = new THREE.MeshStandardMaterial({ color: 0xfffdf5, roughness: .92 });
    const edge = new THREE.MeshStandardMaterial({ map: edgeTexture, roughness: .88 });
    const navy = new THREE.MeshStandardMaterial({ color: 0x06442f, roughness: .57, metalness: .12 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xd6b45c, roughness: .35, metalness: .52 });
    const pageMaterialLeft = new THREE.MeshStandardMaterial({ color: 0xfffdf5, side: THREE.DoubleSide, roughness: .92 });
    const pageMaterialRight = new THREE.MeshStandardMaterial({ color: 0xfffdf5, side: THREE.DoubleSide, roughness: .92 });

    const depth = Math.max(12, Math.min(22, pageHeight * .024));
    const coverDepth = Math.max(6, Math.min(11, pageHeight * .013));
    const pageGeometry = new THREE.BoxGeometry(pageWidth, pageHeight, depth);
    const makePageBlock = x => {
      const block = new THREE.Mesh(pageGeometry, [edge, edge, edge, edge, paper, paper]);
      block.position.set(x, 0, 0);
      bookBody.add(block);
      return block;
    };
    const leftBlock = makePageBlock(-pageWidth / 2);
    const rightBlock = makePageBlock(pageWidth / 2);
    if (singlePage) {
      leftBlock.scale.x = .001;
      leftBlock.visible = false;
    }

    const spreadWidth = pageWidth * (singlePage ? 1 : 2);
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(spreadWidth + 8, pageHeight + 8, coverDepth),
      // The book's interior boards are ivory. Dark cloth is reserved for the
      // outside spine and edge surfaces so it cannot read as a black page
      // covering the artwork during the opening move.
      [navy, navy, gold, gold, paper, paper]
    );
    board.position.set(singlePage ? pageWidth / 2 : 0, 0, -depth / 2 - coverDepth / 2);
    bookBody.add(board);

    const pagePlane = new THREE.PlaneGeometry(pageWidth, pageHeight);
    const leftFace = new THREE.Mesh(pagePlane, pageMaterialLeft);
    leftFace.position.set(-pageWidth / 2, 0, depth / 2 + .12);
    bookBody.add(leftFace);
    if (singlePage) leftFace.visible = false;
    const rightFace = new THREE.Mesh(pagePlane, pageMaterialRight);
    rightFace.position.set(pageWidth / 2, 0, depth / 2 + .12);
    bookBody.add(rightFace);

    // The hinged hardcover uses the supplied cover artwork. PDF page 1 is
    // reader content and must never be substituted for the physical cover.
    const coverTexture = makeCoverTexture(THREE, suppliedAssets.front || source);
    if (!coverTexture) {
      // Never cover the page with an empty WebGL canvas. Keep the existing
      // product cover visible if either image could not become a GPU texture.
      renderer.dispose();
      canvas.remove();
      return null;
    }
    const coverFront = new THREE.MeshBasicMaterial({
      map: coverTexture,
      color: 0xffffff,
      // The supplied VEC cover is a fully printed opaque scan. Treating the
      // default RGBA texture format as proof of image alpha made the board
      // blend with its brown inner material and created a muddy overlay.
      transparent: false,
      alphaTest: 0,
      depthTest: true,
      depthWrite: true,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    const coverSide = new THREE.MeshStandardMaterial({ color: 0xb08c42, roughness: .45, metalness: .35 });
    const coverInside = new THREE.MeshStandardMaterial({ color: 0xf4efdf, roughness: .88, metalness: 0 });
    const coverGeometry = new THREE.BoxGeometry(pageWidth, pageHeight, coverDepth);
    // BoxGeometry material order: right, left, top, bottom, front, back.
    // The front board carries the real printed cover; the reverse is the
    // unprinted inside of the hardcover, with the board thickness visible.
    const coverMesh = new THREE.Mesh(coverGeometry, [coverSide, coverSide, coverSide, coverSide, coverFront, coverInside]);
    const coverHinge = new THREE.Group();
    coverHinge.position.set(0, 0, depth / 2 + coverDepth / 2);
    coverHinge.add(coverMesh);
    coverMesh.position.set(pageWidth / 2, 0, 0);
    coverMesh.renderOrder = 20;
    root.add(coverHinge);

    // A fixed spine joins the moving front board to the page block. It stays
    // at the hinge as the cover swings open, as a real hardcover spine does.
    const spineWidth = Math.max(10, Math.min(pageWidth * .095, pageHeight * .065));
    let spineMaterial = navy;
    if (suppliedAssets.spine) {
      const spineTexture = makeCoverTexture(THREE, suppliedAssets.spine);
      if (spineTexture) {
        spineMaterial = new THREE.MeshBasicMaterial({
          map: spineTexture, transparent: true, alphaTest: .025, depthWrite: false,
          side: THREE.DoubleSide, toneMapped: false
        });
      }
    }
    const spine = new THREE.Mesh(
      new THREE.BoxGeometry(spineWidth, pageHeight + 8, depth + coverDepth),
      [coverSide, coverSide, coverSide, coverSide, spineMaterial, spineMaterial]
    );
    spine.position.set(-spineWidth / 2, 0, 0);
    spine.renderOrder = 8;
    bookBody.add(spine);

    // A restrained moving specular band adds a physical gloss highlight to
    // the real Three.js cover surface; no separate flat cover is layered on it.
    const glossCanvas = document.createElement('canvas');
    glossCanvas.width = 256;
    glossCanvas.height = 8;
    const glossContext = glossCanvas.getContext('2d');
    const glossGradient = glossContext.createLinearGradient(0, 0, 256, 0);
    glossGradient.addColorStop(0, 'rgba(255,255,255,0)');
    glossGradient.addColorStop(.40, 'rgba(255,255,255,0)');
    glossGradient.addColorStop(.50, 'rgba(255,246,212,.72)');
    glossGradient.addColorStop(.60, 'rgba(255,255,255,0)');
    glossGradient.addColorStop(1, 'rgba(255,255,255,0)');
    glossContext.fillStyle = glossGradient;
    glossContext.fillRect(0, 0, glossCanvas.width, glossCanvas.height);
    const glossTexture = new THREE.CanvasTexture(glossCanvas);
    const glossMaterial = new THREE.MeshBasicMaterial({
      map: glossTexture, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    });
    const gloss = new THREE.Mesh(new THREE.PlaneGeometry(pageWidth, pageHeight), glossMaterial);
    gloss.position.set(pageWidth / 2, 0, coverDepth / 2 + .08);
    coverHinge.add(gloss);

    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const shadowContext = shadowCanvas.getContext('2d');
    const gradient = shadowContext.createRadialGradient(64, 64, 8, 64, 64, 62);
    gradient.addColorStop(0, 'rgba(3,13,25,.30)');
    gradient.addColorStop(.64, 'rgba(3,13,25,.13)');
    gradient.addColorStop(1, 'rgba(3,13,25,0)');
    shadowContext.fillStyle = gradient;
    shadowContext.fillRect(0, 0, 128, 128);
    const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(spreadWidth * 1.28, pageHeight * 1.24), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity: .7, depthWrite: false }));
    shadow.position.set(singlePage ? pageWidth / 2 : 0, -3, -depth / 2 - coverDepth - 1);
    shadow.scale.set(.82, .9, 1);
    bookBody.add(shadow);
    // A thin, compressed page block reads as the closed book's page stack.
    // Expand it with the cover hinge during the reveal.
    bookBody.scale.set(.015, 1, 1);
    bookBody.visible = true;

    const targetHingeX = singlePage ? stageRect.left + stageRect.width / 2 - pageWidth / 2 : stageRect.left + stageRect.width / 2;
    const targetCenterY = stageRect.top + stageRect.height / 2;
    let restoreDetailsCover = () => {};
    if (fromDetails) {
      // Move the one traveling hardcover above the Details page and fade its
      // source out with GSAP. No CSS visibility layer participates in handoff.
      const sourceNode = card.querySelector('.book-details-arrived-frame') || source;
      gsap.set(sourceNode, { autoAlpha: 0, overwrite: true });
      restoreDetailsCover = () => gsap.set(sourceNode, { clearProps: 'opacity,visibility' });
      canvas.style.zIndex = '1505';
    }
    const transitionSurface = canvas;
    const startScaleX = from.width / pageWidth;
    const startScaleY = from.height / pageHeight;

    root.position.set(from.left - width / 2, height / 2 - (from.top + from.height / 2), 0);
    root.scale.set(startScaleX, startScaleY, Math.min(startScaleX, startScaleY));
    root.rotation.set(-.035, -.18, -.045);

    const resources = [pageGeometry, pagePlane, coverGeometry, edgeTexture, shadowTexture, glossTexture, coverTexture, pageMaterialLeft, pageMaterialRight, coverFront, coverSide, coverInside, edge, paper, navy, gold, shadow.material, glossMaterial];
    const render = () => renderer.render(scene, camera);
    const updatePages = () => {
      const state = window.vishHubPdfTransitionPages?.();
      if (!state?.pages?.length) return;
      const pageFor = index => state.pages.find(page => page.pageIndex === index)?.image;
      const index = Math.max(0, state.currentPage - 1);
      const leftImage = index === 0 ? null : pageFor(index - 1);
      const rightImage = pageFor(fromDetails ? 1 : index);
      [[pageMaterialLeft, singlePage ? null : leftImage], [pageMaterialRight, rightImage]].forEach(([material, image]) => {
        const texture = makePageTexture(THREE, image);
        if (!texture) return;
        material.map?.dispose?.();
        material.map = texture;
        material.color.set(0xffffff);
        material.needsUpdate = true;
        resources.push(texture);
      });
      render();
    };
    const resize = () => {
      const nextWidth = Math.max(1, window.innerWidth);
      const nextHeight = Math.max(1, window.innerHeight);
      renderer.setSize(nextWidth, nextHeight, false);
      camera.left = -nextWidth / 2;
      camera.right = nextWidth / 2;
      camera.top = nextHeight / 2;
      camera.bottom = -nextHeight / 2;
      camera.updateProjectionMatrix();
      render();
    };
    window.addEventListener('resize', resize, { passive: true });

    function dispose() {
      window.removeEventListener('resize', resize);
      gsap.ticker.remove(render);
      const disposed = new Set();
      scene.traverse(object => {
        if (object.geometry && !disposed.has(object.geometry)) { disposed.add(object.geometry); object.geometry.dispose(); }
        const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
        materials.forEach(material => {
          if (!disposed.has(material)) { disposed.add(material); material.dispose(); }
          if (material.map && !disposed.has(material.map)) { disposed.add(material.map); material.map.dispose(); }
        });
      });
      resources.forEach(resource => resource?.dispose?.());
      renderer.dispose();
      canvas.remove();
      restoreDetailsCover();
    }

    function timeline() {
      const finalX = targetHingeX - width / 2;
      const finalY = height / 2 - targetCenterY;
      const tl = gsap.timeline({ paused: true });
      if (fromDetails) {
        // A single continuous move keeps the physical hardcover legible.
        // The old overlapping lift/zoom/tilt tweens made it wobble and drift
        // before it ever reached the reader.
        tl.to(root.position, {
          x: finalX, y: finalY, z: 0,
          duration: 1.12, ease: 'power3.inOut'
        }, 0)
          .to(root.scale, {
            x: 1, y: 1, z: 1,
            duration: 1.12, ease: 'power3.inOut'
          }, 0)
          .to(root.rotation, {
            x: 0, y: 0, z: 0,
            duration: 1.02, ease: 'power2.inOut'
          }, .04)
          .to(shadow.material, { opacity: .88, duration: .86, ease: 'sine.inOut' }, .12);
        tl.eventCallback('onUpdate', render);
        return { timeline: tl, canvas: transitionSurface, render, dispose, updatePages, gsap };
      }
      // Animate the actual book model from the thumbnail bounds into the
      // reader. Position, perspective tilt and depth are all on the same rig.
      tl.to(root.position, { y: '+=10', z: 24, duration: .28, ease: 'power3.out' }, 0)
        .to(root.scale, { x: startScaleX * 1.045, y: startScaleY * 1.045, z: Math.min(startScaleX, startScaleY) * 1.045, duration: .28, ease: 'power3.out' }, 0)
        .to(root.position, { x: finalX, duration: 1.3, ease: 'power3.inOut' }, .28)
        .to(root.position, { y: finalY + 24, duration: .95, ease: 'power3.inOut' }, .28)
        .to(root.position, { y: finalY, duration: .35, ease: 'power2.out' }, 1.23)
        .to(root.position, { z: 54, duration: .68, ease: 'power2.out' }, .28)
        .to(root.position, { z: 0, duration: .42, ease: 'power2.inOut' }, .96)
        .to(root.scale, { x: 1.035, y: 1.035, z: 1.035, duration: .78, ease: 'power3.inOut' }, .28)
        .to(root.scale, { x: 1, y: 1, z: 1, duration: .32, ease: 'power2.out' }, 1.06)
        .to(root.rotation, { x: -.055, y: .10, z: .035, duration: .78, ease: 'power3.inOut' }, .28)
        .to(root.rotation, { x: 0, y: 0, z: 0, duration: .32, ease: 'power2.out' }, 1.06)
        .to(keyLight.position, { x: width * .2, y: height * .48, duration: 1.48, ease: 'sine.inOut' }, 0)
        .to(shadow.material, { opacity: .94, duration: 1.2, ease: 'sine.inOut' }, .08)
        .to(shadow.scale, { x: 1, y: 1, duration: 1.25, ease: 'power2.out' }, .12)
        .to(glossMaterial, { opacity: .36, duration: .48, ease: 'sine.out' }, .35)
        .to(gloss.position, { x: -pageWidth / 2, duration: .9, ease: 'sine.inOut' }, .35)
        .to(glossMaterial, { opacity: 0, duration: .42, ease: 'sine.in' }, 1.14);
      tl.eventCallback('onUpdate', render);
      const appendBookReveal = () => {
        const revealAt = tl.duration();
        tl.to(coverHinge.rotation, { y: -Math.PI * .94, duration: 1.12, ease: 'power3.inOut' }, revealAt)
          .to(bookBody.scale, { x: 1, duration: 1.02, ease: 'power2.inOut' }, revealAt + .04);
        tl
          .to(glossMaterial, { opacity: .24, duration: .38, ease: 'sine.out' }, revealAt + .12)
          .to(glossMaterial, { opacity: 0, duration: .64, ease: 'sine.in' }, revealAt + .5)
          .to(keyLight.position, { x: width * .23, y: height * .18, duration: 1.18, ease: 'sine.inOut' }, revealAt)
          .to(shadow.material, { opacity: 1, duration: .9, ease: 'sine.out' }, revealAt + .08)
          .to(root.rotation, { y: -.035, z: -.008, duration: .54, ease: 'power2.out' }, revealAt + .3);
      };
      return { timeline: tl, canvas: transitionSurface, render, dispose, updatePages, appendBookReveal, gsap };
    }

    function openCover() {
      const opening = gsap.timeline();
      opening.to(coverHinge.rotation, { y: -Math.PI * .92, duration: 1.02, ease: 'power2.inOut' }, 0)
        .to(bookBody.scale, { x: 1, duration: .96, ease: 'power2.inOut' }, .04)
        .to(glossMaterial, { opacity: .14, duration: .3, ease: 'sine.out' }, .12)
        .to(glossMaterial, { opacity: 0, duration: .54, ease: 'sine.in' }, .42);
      opening.eventCallback('onUpdate', render);
      return opening;
    }

    function closeCover() {
      const closing = gsap.timeline();
      closing.to(coverHinge.rotation, { y: 0, duration: .52, ease: 'power2.inOut' }, 0)
        .to(bookBody.scale, { x: .015, duration: .48, ease: 'power2.inOut' }, .04);
      closing.eventCallback('onUpdate', render);
      return closing;
    }

    render();
    const syncCoverToReaderPage = () => {
      const readerCover = coverPage?.image;
      return Boolean(readerCover?.complete && readerCover.naturalWidth);
    };
    return { opening: timeline(), canvas: transitionSurface, render, dispose, updatePages, openCover, closeCover, syncCoverToReaderPage, gsap, viewer };
  }

  function waitForPageFlip(viewer, motion, timeout = 12000) {
    if (viewer.classList.contains('pdf-book-pageflip-active')) return Promise.resolve(true);
    return new Promise(resolve => {
      let finished = false;
      const finish = ready => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        viewer.removeEventListener('vish-book-pageflip-ready', onReady);
        resolve(ready);
      };
      const onReady = () => finish(true);
      const timer = setTimeout(() => finish(false), timeout);
      viewer.addEventListener('vish-book-pageflip-ready', onReady, { once: true });
      motion.cancelWait = () => finish(false);
    });
  }

  function fadeIntoReader(motion) {
    if (motion.mode !== 'openingBook') return;
    motion.updatePages();
    const viewer = motion.viewer;
    const scrim = document.getElementById('pdfViewerScrim');
    beginGsapReaderState(viewer, scrim);
    motion.gsap.set(viewer, { opacity: 0, visibility: 'visible' });
    if (scrim) motion.gsap.set(scrim, { opacity: 0, visibility: 'visible' });
    motion.mode = 'handoff';
    motion.handoffTimeline = motion.gsap.timeline({ onComplete: async () => {
      if (motion.mode !== 'handoff') return;
      if (motion.fromDetails) window.vishHubFinishBookDetailsReaderTransition?.();
      motion.mode = 'idle';
      clearGsapReaderState(viewer);
      motion.handoffTimeline = null;
    }});
    // Kick the real StPageFlip cover curl at the same frame as the visible
    // GSAP swing. The PDF cover and next page are already decoded behind it.
    if (motion.fromDetails) window.vishHubFlipCoverForTransition?.();
    motion.handoffTimeline.to(viewer, { opacity: 1, pointerEvents: 'auto', duration: 1.02, ease: 'power2.inOut' }, 0);
    if (scrim) motion.handoffTimeline.to(scrim, { opacity: 1, duration: 1.02, ease: 'power2.inOut' }, 0);
    if (motion.fromDetails) {
      // Swing the real cover artwork away from the spine while the already
      // prepared second PDF page is revealed behind it.
      motion.handoffTimeline.to(motion.canvas, {
        rotationY: -176, rotationX: -1.5, z: 8,
        transformPerspective: 1500, duration: 1.02, ease: 'power2.inOut'
      }, 0)
        .to(motion.canvas, { autoAlpha: 0, duration: .10, ease: 'power1.in' }, .92);
    }
  }

  async function waitForStableCoverPage(viewer, timeout = 5000, pageIndex = 0) {
    const startedAt = performance.now();
    let previous = null;
    let stableFrames = 0;
    while (performance.now() - startedAt < timeout) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const state = window.vishHubPdfTransitionPages?.();
      const cover = state?.pages?.find(page => page.pageIndex === pageIndex);
      const image = cover?.image;
      const rect = image?.getBoundingClientRect?.();
      if (!image?.complete || !image.naturalWidth || !rect || rect.width < 30 || rect.height < 30) {
        previous = null;
        stableFrames = 0;
        continue;
      }
      const current = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      const stable = previous && Object.keys(current).every(key => Math.abs(current[key] - previous[key]) < .35);
      stableFrames = stable ? stableFrames + 1 : 0;
      if (stableFrames >= 3) return { image, rect: current };
      previous = current;
    }
    return null;
  }

  function mountGsapCoverFlight(image, gsap) {
    const parent = image.parentNode;
    if (!parent) return null;
    // This is the Details page's real cover image. Remove inline flight state
    // left by any interrupted/older handoff before measuring its Details slot;
    // CSS owns its resting position and front-face appearance.
    gsap.killTweensOf(image);
    image.removeAttribute('style');
    gsap.set(image, { clearProps: 'all' });
    const nextSibling = image.nextSibling;
    const originalStyle = image.getAttribute('style');
    const rect = image.getBoundingClientRect();
    const placeholder = document.createElement('span');
    placeholder.setAttribute('aria-hidden', 'true');
    // Keep the cover's layout slot without adding a new grid/flex item. A
    // normal-flow placeholder can become a second grid cell in the Details
    // cover and shift the cover when the real image is moved to <body>.
    placeholder.style.cssText = 'position:absolute;inset:0;display:block;width:100%;height:100%;box-sizing:border-box;visibility:hidden;pointer-events:none';
    parent.insertBefore(placeholder, image);
    document.body.append(image);
    // Keep these as normal inline declarations: GSAP must be able to update
    // left/top/width/height during the flight instead of losing to !important.
    image.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;max-width:none;max-height:none;margin:0;padding:0;z-index:1700;object-fit:fill;object-position:center;pointer-events:none;transform-style:preserve-3d;backface-visibility:hidden;will-change:transform,filter;`;
    gsap.set(image, {
      x: 0, y: 0, rotationY: 0, rotationX: 0, rotationZ: 0,
      transformPerspective: 1500, transformOrigin: 'left center',
      force3D: true, filter: 'drop-shadow(10px 16px 13px rgba(13,27,42,.28))'
    });
    let restored = false;
    return {
      image, parent, nextSibling, placeholder, originalStyle,
      fromRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      pageRect: null,
      restore() {
        if (restored) return;
        restored = true;
        gsap.killTweensOf(image);
        gsap.set(image, { clearProps: 'transform,transformOrigin,willChange,filter' });
        if (placeholder.isConnected && parent.isConnected) parent.insertBefore(image, placeholder);
        else if (parent.isConnected) parent.insertBefore(image, nextSibling?.parentNode === parent ? nextSibling : null);
        placeholder.remove();
        if (originalStyle == null) image.removeAttribute('style');
        else image.setAttribute('style', originalStyle);
      }
    };
  }

  function settleFlightBackInDetails(flight, gsap) {
    if (!flight?.image || !flight?.placeholder?.isConnected || !gsap) {
      flight?.restore?.();
      return Promise.resolve();
    }
    // The Details page may have changed its layout while the reader was open.
    // Land on the live placeholder left in the image's original slot, then
    // restore the same image node there so it cannot snap to an old rectangle.
    const slot = flight.placeholder.getBoundingClientRect();
    if (slot.width < 20 || slot.height < 20) {
      flight.restore();
      return Promise.resolve();
    }
    const image = flight.image;
    const current = image.getBoundingClientRect();
    const drift = Math.max(
      Math.abs(current.left - slot.left), Math.abs(current.top - slot.top),
      Math.abs(current.width - slot.width), Math.abs(current.height - slot.height)
    );
    if (drift < .75) {
      flight.restore();
      return Promise.resolve();
    }
    return new Promise(resolve => {
      gsap.to(image, {
        left: slot.left, top: slot.top, width: slot.width, height: slot.height,
        x: 0, y: 0, rotationY: 0, rotationX: 0, rotationZ: 0,
        duration: .28, ease: 'power2.out', overwrite: 'auto',
        onComplete() { flight.restore(); resolve(); }
      });
    });
  }

  async function revealDetailsReader(motion) {
    if (motion.mode !== 'openingBook' || !motion.flight) return;
    const { viewer, gsap, flight } = motion;
    const scrim = document.getElementById('pdfViewerScrim');
    const readerPageSurface = viewer.querySelector('.pdf-book-pageflip-host');
    const singlePageReader = viewer.querySelector('.pdf-book-single-page');
    // The PDF pages are prepared under the uploaded cover, but remain hidden
    // until the cover has visibly started opening.
    if (readerPageSurface) gsap.set(readerPageSurface, { autoAlpha: 0 });
    // Put the reader on its first interior view underneath the uploaded cover.
    // The uploaded cover is the only moving sheet in this handoff; asking the
    // PDF flipbook to curl too creates a second, misaligned curl on desktop's
    // right-hand page.
    if (!window.vishHubShowInteriorAfterCover?.()) {
      flight.restore();
      finishDetailsReaderWithoutCover(viewer, gsap);
      activeMotion = null;
      return;
    }
    // Once the desktop spread is centered, land the uploaded cover on PDF page
    // 2 at the right. The mobile single-page reader keeps its original cover
    // target and timing.
    const destinationPageIndex = singlePageReader ? 0 : 1;
    let readerCoverRect = singlePageReader
      ? (motion.readerCoverRect || (await waitForStableCoverPage(viewer, 5000, destinationPageIndex))?.rect)
      : (await waitForStableCoverPage(viewer, 5000, destinationPageIndex))?.rect;
    if (motion.mode !== 'openingBook') return;
    if (!readerCoverRect) {
      flight.restore();
      finishDetailsReaderWithoutCover(viewer, gsap);
      activeMotion = null;
      return;
    }
    flight.pageRect = readerCoverRect;
    motion.mode = 'handoff';
    beginGsapReaderState(viewer, scrim);
    gsap.set(viewer, { opacity: 0, visibility: 'visible', pointerEvents: 'none' });
    if (scrim) gsap.set(scrim, { opacity: 0, visibility: 'visible' });
    window.vishHubBeginBookDetailsReaderTransition?.();

    const rect = flight.fromRect;
    let target = readerCoverRect;
    const timeline = gsap.timeline({ onComplete: () => {
      if (motion.mode !== 'handoff') return;
      gsap.set(flight.image, { autoAlpha: 0 });
      if (readerPageSurface) gsap.set(readerPageSurface, { clearProps: 'opacity,visibility' });
      clearReaderStartupWatchdog(viewer);
      window.vishHubFinishBookDetailsReaderTransition?.();
      motion.mode = 'idle';
      clearTimeout(motion.readerWatchdog);
      if (activeMotion === motion) activeMotion = null;
      // Keep the same uploaded cover flight alive for the reader → Details
      // reverse. Discarding it here made Close/Escape fall through to the
      // normal modal close, which returned to the Library instead.
      completedDetailsMotion = motion;
      clearGsapReaderState(viewer);
    }});
    motion.handoffTimeline = timeline;
    gsap.set(flight.image, {
      left: target.left, top: target.top, width: target.width, height: target.height,
      x: 0, y: 0, rotationY: 0, transformOrigin: 'left center', autoAlpha: 1
    });
    // Align and open the same uploaded cover directly over the first visible
    // interior page, which is PDF page 2 on the right in the desktop spread.
    timeline.fromTo(flight.image,
      { left: rect.left, top: rect.top, width: rect.width, height: rect.height, rotationY: 0, scale: 1 },
      { left: target.left, top: target.top, width: target.width, height: target.height, rotationY: 0, scale: 1, duration: singlePageReader ? 1.1 : 1.25, ease: 'power3.inOut' }, 0)
      .to(viewer, {
        opacity: 1, pointerEvents: 'auto',
        duration: singlePageReader ? .85 : 1.15, ease: 'power2.out'
      }, singlePageReader ? .5 : .85)
      .call(() => {
        // GSAP call callbacks can run while a timeline is reversed. The
        // desktop layout correction is only for the forward handoff; running
        // it on the way back snaps the cover toward page 2 instead of its
        // original Details slot.
        if (singlePageReader || motion.mode !== 'handoff') return;
        // Re-read PDF page 2 after the spread centering pass. This avoids
        // opening over the old centered cover position if PageFlip applied its
        // desktop spread offset after the initial measurement.
        const pageTwo = window.vishHubPdfTransitionPages?.()?.pages
          ?.find(page => page.pageIndex === 1);
        const pageRect = pageTwo?.image?.getBoundingClientRect?.();
        if (!pageRect || pageRect.width < 30 || pageRect.height < 30) return;
        readerCoverRect = {
          left: pageRect.left, top: pageRect.top,
          width: pageRect.width, height: pageRect.height
        };
        target = readerCoverRect;
        flight.pageRect = target;
        gsap.set(flight.image, {
          left: target.left, top: target.top,
          width: target.width, height: target.height
        });
      }, null, singlePageReader ? .75 : .85)
      .to(flight.image, {
        rotationY: -176,
        duration: singlePageReader ? 1.2 : 1.35,
        ease: singlePageReader ? 'power2.inOut' : 'power3.inOut'
      }, singlePageReader ? .75 : .85)
      .to(flight.image, {
        autoAlpha: 0,
        duration: singlePageReader ? .08 : .1,
        ease: singlePageReader ? 'none' : 'power1.out'
      }, singlePageReader ? 1.88 : 2.1);
    if (readerPageSurface) timeline.to(readerPageSurface, {
      autoAlpha: 1,
      duration: singlePageReader ? .42 : .48,
      ease: 'power2.out'
    }, singlePageReader ? 1.05 : 1.35);
    if (scrim) timeline.to(scrim, {
      opacity: 1, duration: singlePageReader ? .85 : 1.15, ease: 'power2.out'
    }, singlePageReader ? .5 : .85);
    await timeline.then();
  }

  async function openDetailsReader(detailsCover, viewer) {
    const gsap = window.gsap;
    const sourceImage = detailsCover.querySelector('.book-details-cover-image');
    if (!detailsCover.isConnected || !viewer.classList.contains('open')) {
      transitionStarting = false;
      forceDetailsReader(viewer);
      return;
    }
    // Cover loading or animation failure must not block access to the PDF.
    const flight = gsap && sourceImage?.complete && sourceImage.naturalWidth
      ? mountGsapCoverFlight(sourceImage, gsap)
      : null;
    const motion = {
      gsap, flight, mode: 'openingBook',
      fromDetails: true,
      viewer,
      cancelWait: null,
      handoffTimeline: null
    };
    activeMotion = motion;
    transitionStarting = false;
    // Never let a cover-flight promise keep the product page above the real
    // reader indefinitely. The book reader already has its own loading state.
    motion.readerWatchdog = setTimeout(() => {
      if (motion.mode === 'idle') return;
      motion.mode = 'idle';
      flight?.restore();
      if (activeMotion === motion) activeMotion = null;
      forceDetailsReader(viewer);
    }, 9000);

    const readiness = (async () => {
      // Reveal the normal reader promptly if PageFlip is still preparing. A
      // cover animation is optional and must not leave the reader hidden for
      // the full generic PageFlip timeout.
      const ready = await waitForPageFlip(viewer, motion, 4500);
      if (!ready || !viewer.classList.contains('pdf-book-pageflip-active')) return null;
      if (!await window.vishHubResetCoverForTransition?.()) return null;
      if (!await window.vishHubPrepareInteriorPageForCover?.()) return null;
      const page = await waitForStableCoverPage(viewer);
      return page;
    })().catch(error => {
      console.error('Reader pages could not be prepared for the cover transition:', error);
      return null;
    });

    void readiness.then(async readyPage => {
      if (motion.mode !== 'openingBook') return;
      if (!readyPage || !flight || !gsap) {
        // Keep the normal reader usable if page rendering fails, and restore
        // the image to Details instead of leaving a blank flight layer.
        flight?.restore();
        activeMotion = null;
        clearTimeout(motion.readerWatchdog);
        finishDetailsReaderWithoutCover(viewer, gsap);
        return;
      }
      motion.readerCoverRect = readyPage.rect;
      await revealDetailsReader(motion);
    }).catch(error => {
      console.error('Details-to-reader handoff failed; revealing the reader directly:', error);
      flight?.restore();
      clearTimeout(motion.readerWatchdog);
      if (activeMotion === motion) activeMotion = null;
      forceDetailsReader(viewer);
    });
  }

  function finishDetailsReaderWithoutCover(viewer, gsap = window.gsap) {
    clearReaderStartupWatchdog(viewer);
    const scrim = document.getElementById('pdfViewerScrim');
    window.vishHubBeginBookDetailsReaderTransition?.();
    beginGsapReaderState(viewer, scrim);
    let finished = false;
    let safetyTimer = null;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(safetyTimer);
      window.vishHubFinishBookDetailsReaderTransition?.();
      clearGsapReaderState(viewer);
    };
    if (!gsap) {
      viewer?.style.setProperty('opacity', '1', 'important');
      viewer?.style.setProperty('visibility', 'visible', 'important');
      viewer?.style.setProperty('pointer-events', 'auto', 'important');
      if (scrim) scrim.style.setProperty('opacity', '1', 'important');
      finish();
      return;
    }
    gsap.killTweensOf([viewer, scrim].filter(Boolean));
    gsap.set(viewer, { opacity: 0, visibility: 'visible', pointerEvents: 'auto' });
    if (scrim) gsap.set(scrim, { opacity: 0, visibility: 'visible' });
    const timeline = gsap.timeline({ onComplete: finish });
    timeline.to(viewer, { opacity: 1, duration: .42, ease: 'power2.out' }, 0);
    if (scrim) timeline.to(scrim, { opacity: 1, duration: .42, ease: 'power2.out' }, 0);
    safetyTimer = setTimeout(() => {
      gsap.set(viewer, { opacity: 1, visibility: 'visible', pointerEvents: 'auto' });
      if (scrim) gsap.set(scrim, { opacity: 1, visibility: 'visible' });
      finish();
    }, 900);
  }

  function forceDetailsReader(viewer = document.getElementById('pdfViewer')) {
    if (!viewer) return false;
    clearReaderStartupWatchdog(viewer);
    transitionStarting = false;
    if (activeMotion) {
      activeMotion.cancelWait?.();
      activeMotion.handoffTimeline?.kill?.();
      activeMotion.openingTimeline?.kill?.();
      activeMotion.flight?.restore?.();
      activeMotion.scene?.dispose?.();
      activeMotion.mode = 'idle';
      activeMotion = null;
    }
    const scrim = document.getElementById('pdfViewerScrim');
    window.gsap?.killTweensOf([viewer, scrim].filter(Boolean));
    clearGsapReaderState(viewer);
    ['opacity', 'visibility', 'pointer-events', 'transition', 'animation'].forEach(property => viewer.style.removeProperty(property));
    if (scrim) ['opacity', 'visibility', 'pointer-events', 'transition', 'animation'].forEach(property => scrim.style.removeProperty(property));
    delete viewer.dataset.bookTransitionPending;
    viewer.classList.add('open');
    if (scrim) {
      scrim.classList.add('open');
    }
    window.vishHubFinishBookDetailsReaderTransition?.();
    return true;
  }
  window.vishHubForceDetailsReader = forceDetailsReader;

  function clearPendingReader(viewer = document.getElementById('pdfViewer')) {
    clearGsapReaderState(viewer);
  }

  function abortDetailsReader(viewer) {
    clearPendingReader(viewer);
    window.vishHubCancelBookDetailsReaderTransition?.();
    if (viewer?.classList.contains('open')) {
      nativeCloseAllowed = true;
      document.getElementById('closePdfViewer')?.click();
      queueMicrotask(() => { nativeCloseAllowed = false; });
    }
  }

  async function openFromCard(card, viewer, fromDetails = false) {
    if (fromDetails && (!card || activeMotion || transitionStarting)) {
      forceDetailsReader(viewer);
      return;
    }
    if ((!fromDetails && reducedMotion.matches) || activeMotion || transitionStarting || !card) { clearPendingReader(viewer); return; }
    transitionStarting = true;
    try {
      // Details → Reader animates the uploaded cover image with GSAP 3D
      // transforms. Three.js is intentionally excluded from this handoff.
      if (fromDetails) await loadScript(vendor.gsap, () => Boolean(window.gsap));
      else await loadMotionLibraries();
    } catch {
      transitionStarting = false;
      if (fromDetails && viewer?.classList.contains('open')) finishDetailsReaderWithoutCover(viewer, window.gsap);
      else if (fromDetails) window.vishHubCancelBookDetailsReaderTransition?.();
      else clearPendingReader(viewer);
      return;
    }
    if (!viewer.classList.contains('open')) {
      transitionStarting = false;
      if (fromDetails) forceDetailsReader(viewer);
      else clearPendingReader(viewer);
      return;
    }
    if (fromDetails && !viewer.classList.contains('pdf-book-mode')) {
      transitionStarting = false;
      finishDetailsReaderWithoutCover(viewer, window.gsap);
      return;
    }
    if (fromDetails) {
      await openDetailsReader(card, viewer);
      return;
    }
    // Listen for the reader while its real cover starts moving immediately.
    // A PDF can take a moment to decode, so the cover should not wait in place.
    const readiness = { mode: 'opening', cancelWait: null };
    const pageFlipReadyPromise = waitForPageFlip(viewer, readiness);
    const book = createBookScene(card, viewer);
    if (!book) {
      clearPendingReader(viewer);
      transitionStarting = false;
      if (fromDetails) window.vishHubFinishBookDetailsReaderTransition?.();
      return;
    }
    const motion = {
      ...book.opening,
      scene: book,
      mode: 'opening',
      sourceCard: card,
      fromDetails,
      viewer: book.viewer,
      cancelWait: readiness.cancelWait
    };
    activeMotion = motion;
    transitionStarting = false;
    // The cover flight is the clock for this handoff. Reader setup proceeds
    // alongside it, then the real second PDF page is prepared behind the cover.
    let hasArrived = false;
    let interiorReady = false;
    let openingStarted = false;
    const beginNaturalOpening = () => {
      if (openingStarted || !hasArrived || !interiorReady || motion.mode !== 'openingBook') return;
      openingStarted = true;
      motion.updatePages();
      fadeIntoReader(motion);
    };
    motion.timeline.eventCallback('onComplete', () => {
      if (motion.mode !== 'opening') return;
      // The cover reaches the reader first. It remains closed while the real
      // next PDF page is prepared behind it, then one GSAP swing reveals both.
      motion.mode = 'openingBook';
      hasArrived = true;
      beginNaturalOpening();
    });
    motion.timeline.play(0);

    // Keep loading and painting the reader in parallel with the cover flight.
    // Once the first sheet is ready, put the flipbook on page one, then prepare
    // page two behind the moving cover before allowing its opening swing.
    const pageFlipReady = await pageFlipReadyPromise;
    if (!pageFlipReady || !viewer.classList.contains('pdf-book-pageflip-active')) {
      closeWithReverse('reader-not-ready');
      return;
    }
    if (fromDetails) {
      const coverReady = await window.vishHubResetCoverForTransition?.();
      if (!coverReady) {
        closeWithReverse('cover-not-ready');
        return;
      }
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      book.syncCoverToReaderPage?.();
      motion.updatePages();
    }
    void window.vishHubPrepareInteriorPageForCover?.().then(ready => {
      if (motion.mode === 'closing') return;
      interiorReady = Boolean(ready);
      motion.updatePages();
      beginNaturalOpening();
    });
  }

  // Explicit entry point for the Details page. Opening the reader through the
  // resource API first avoids relying on a synthetic click to bubble through
  // the library card's unrelated click handlers.
  window.vishHubStartDetailsReaderTransition = (detailsCover, viewer) => {
    if (!detailsCover || !viewer || activeMotion || transitionStarting) return false;
    clearReaderStartupWatchdog(viewer);
    readerStartupWatchdogs.set(viewer, setTimeout(() => {
      if (!viewer.classList.contains('open')) return;
      // If PDF.js/PageFlip never finishes booting, expose the real PDF iframe
      // before revealing the reader. Previously this watchdog only removed the
      // transition lock, leaving the iframe hidden and an empty book stage.
      if (!viewer.classList.contains('pdf-book-pageflip-active')) {
        const frame = document.getElementById('resourceFrame');
        const reader = viewer.querySelector('.pdf-book-reader');
        const toolbar = viewer.querySelector('.pdf-book-toolbar');
        if (frame) frame.hidden = false;
        if (reader) reader.hidden = true;
        if (toolbar) toolbar.hidden = true;
        viewer.classList.remove('pdf-book-mode', 'pdf-book-pageflip-active');
      }
      forceDetailsReader(viewer);
    }, 5000));
    const scrim = document.getElementById('pdfViewerScrim');
    beginGsapReaderState(viewer, scrim);
    requestAnimationFrame(() => {
      if (viewer.classList.contains('open')) void openFromCard(detailsCover, viewer, true);
      else {
        clearPendingReader(viewer);
        window.vishHubCancelBookDetailsReaderTransition?.();
      }
    });
    return true;
  };

  function closeWithReverse(trigger) {
    const viewer = document.getElementById('pdfViewer');
    const savedMotion = completedDetailsMotion?.viewer === viewer ? completedDetailsMotion : null;
    const motion = activeMotion || savedMotion;
    if (!motion || motion.mode === 'closing') return false;
    const reverseCompletedHandoff = Boolean(motion.fromDetails && motion.handoffTimeline && motion.flight);
    if (motion === completedDetailsMotion) completedDetailsMotion = null;
    activeMotion = motion;
    motion.cancelWait?.();
    if (!reverseCompletedHandoff) motion.handoffTimeline?.kill();
    motion.openingTimeline?.kill();
    if (!reverseCompletedHandoff) motion.handoffTimeline = null;
    motion.mode = 'closing';
    if (motion.fromDetails && motion.flight) {
      const { gsap, flight, viewer } = motion;
      const scrim = document.getElementById('pdfViewerScrim');
      window.vishHubRestoreBookDetailsAfterReader?.();
      beginGsapReaderState(viewer, scrim);
      gsap.set(viewer, { opacity: 1, visibility: 'visible', pointerEvents: 'none' });
      if (scrim) gsap.set(scrim, { opacity: 1, visibility: 'visible' });
      if (reverseCompletedHandoff) {
        const opening = motion.handoffTimeline;
        const singlePageReader = viewer.querySelector('.pdf-book-single-page');
        if (!singlePageReader) {
          // On desktop, return every open spread to the real PDF cover before
          // closing the travelling cover. This keeps the two-page reader from
          // remaining open behind a shut cover.
          opening.kill();
          const slot = flight.placeholder?.getBoundingClientRect?.();
          const target = slot?.width > 20 && slot?.height > 20
            ? { left: slot.left, top: slot.top, width: slot.width, height: slot.height }
            : flight.fromRect;
          const readerPage = flight.pageRect || flight.fromRect;
          gsap.set(flight.image, {
            left: readerPage.left, top: readerPage.top,
            width: readerPage.width, height: readerPage.height,
            x: 0, y: 0, rotationY: -176, rotationX: 0, rotationZ: 0,
            autoAlpha: 1, transformPerspective: 1500,
            transformOrigin: 'left center', force3D: true
          });
          gsap.set(viewer, { opacity: 1, visibility: 'visible', pointerEvents: 'none' });
          if (scrim) gsap.set(scrim, { opacity: 1, visibility: 'visible' });
          // Close the interior spread to the stationary PDF cover as the
          // same GSAP timeline swings the uploaded 3D cover shut.
          const pagesClose = window.vishHubClosePagesForTransition?.();
          if (motion.mode !== 'closing') {
            pagesClose?.restore?.();
            window.vishHubReleasePageFlipCentering?.();
            return true;
          }
          const reverse = gsap.timeline({
            paused: true,
            onStart: () => pagesClose?.start?.(),
            onComplete: async () => {
              await pagesClose?.done;
              pagesClose?.restore?.();
              window.vishHubFinishPagesCloseTransition?.();
              window.vishHubReleasePageFlipCentering?.();
              await settleFlightBackInDetails(flight, gsap);
              motion.handoffTimeline = null;
              activeMotion = null;
              clearGsapReaderState(viewer);
              nativeCloseAllowed = true;
              if (trigger === 'scrim') document.getElementById('pdfViewerScrim')?.click();
              else document.getElementById('closePdfViewer')?.click();
              queueMicrotask(() => { nativeCloseAllowed = false; });
            }
          });
          motion.handoffTimeline = reverse;
          reverse.to(flight.image, {
            rotationY: 0, duration: 1.05, ease: 'power3.inOut'
          }, 0)
            .to(viewer, { opacity: 0, duration: .3, ease: 'power2.out' }, .94)
            .to(flight.image, {
              left: target.left, top: target.top,
              width: target.width, height: target.height,
              duration: .92, ease: 'power3.inOut'
            }, 1.24);
          if (scrim) reverse.to(scrim, { opacity: 0, duration: .3, ease: 'power2.out' }, .94);
          reverse.play(0);
          return true;
        }
        // Play the exact opening timeline backward. This reuses the same
        // cover, page alignment, hinge, fade and easing curves in reverse.
        opening.eventCallback('onReverseComplete', async () => {
          await window.vishHubResetCoverForTransition?.();
          await settleFlightBackInDetails(flight, gsap);
          motion.handoffTimeline = null;
          activeMotion = null;
          clearGsapReaderState(viewer);
          nativeCloseAllowed = true;
          if (trigger === 'scrim') document.getElementById('pdfViewerScrim')?.click();
          else document.getElementById('closePdfViewer')?.click();
          queueMicrotask(() => { nativeCloseAllowed = false; });
        });
        opening.reverse();
        return true;
      }
      const target = flight.fromRect;
      const readerPage = flight.pageRect || target;
      gsap.set(flight.image, {
        left: readerPage.left, top: readerPage.top, width: readerPage.width, height: readerPage.height,
        x: 0, y: 0, rotationY: -176, rotationX: 0, rotationZ: 0, autoAlpha: 1,
        transformPerspective: 1500, transformOrigin: 'left center', force3D: true
      });
      const reverse = gsap.timeline({ onComplete: () => {
        void settleFlightBackInDetails(flight, gsap).then(() => {
          activeMotion = null;
          if (completedDetailsMotion === motion) completedDetailsMotion = null;
          clearGsapReaderState(viewer);
          nativeCloseAllowed = true;
          if (trigger === 'scrim') document.getElementById('pdfViewerScrim')?.click();
          else document.getElementById('closePdfViewer')?.click();
          queueMicrotask(() => { nativeCloseAllowed = false; });
        });
      }});
      motion.handoffTimeline = reverse;
      reverse.to(flight.image, {
        rotationY: 0,
        left: target.left, top: target.top, width: target.width, height: target.height,
        duration: 2.2, ease: 'power2.inOut'
      }, 0)
        .to(viewer, { opacity: 0, duration: .9, ease: 'power2.inOut' }, 1.15);
      if (scrim) reverse.to(scrim, { opacity: 0, duration: .9, ease: 'power2.inOut' }, 1.15);
      return true;
    }
    // Reveal the product page underneath the returning cover before hiding
    // the reader. This keeps the reverse path anchored to Details, never the
    // Resource Library behind both overlays.
    if (motion.fromDetails) window.vishHubRestoreBookDetailsAfterReader?.();
    clearPendingReader(motion.viewer);
    beginGsapReaderState(motion.viewer, document.getElementById('pdfViewerScrim'));
    motion.gsap.killTweensOf(motion.canvas);
    motion.gsap.set(motion.canvas, { autoAlpha: 1 });
    if (motion.scene) motion.scene.updatePages();
    const finishClose = () => {
      motion.scene?.dispose();
      activeMotion = null;
      clearPendingReader(motion.viewer);
      if (motion.fromDetails) window.vishHubRestoreBookDetailsAfterReader?.();
      nativeCloseAllowed = true;
      if (trigger === 'scrim') document.getElementById('pdfViewerScrim')?.click();
      else document.getElementById('closePdfViewer')?.click();
      queueMicrotask(() => { nativeCloseAllowed = false; });
    };
    const returnCoverToDetails = () => {
      motion.timeline.eventCallback('onReverseComplete', finishClose);
      motion.timeline.reverse();
    };
    if (motion.fromDetails) {
      // Close the cover before flying the same image back into the Details
      // page, so the reverse motion reads as one continuous book movement.
      motion.returnTimeline = motion.closeCover?.();
      if (motion.returnTimeline) motion.returnTimeline.eventCallback('onComplete', () => {
        motion.returnTimeline = null;
        returnCoverToDetails();
      });
      else returnCoverToDetails();
    } else returnCoverToDetails();
    return true;
  }

  document.addEventListener('click', event => {
    const button = event.target.closest?.('.book-cover-open');
    const fromDetails = button?.dataset.bookDetailsReader === 'true';
    if (!button || !fromDetails || button.dataset.bookPdf !== 'true' || activeMotion || transitionStarting) return;
    const card = document.querySelector('#bookDetailsPage .book-details-cover-wrap');
    if (!card) return;
    const viewer = document.getElementById('pdfViewer');
    const scrim = document.getElementById('pdfViewerScrim');
    beginGsapReaderState(viewer, scrim);
    requestAnimationFrame(() => {
      if (viewer?.classList.contains('open') && viewer.classList.contains('pdf-book-mode')) {
        void openFromCard(card, viewer, true);
      } else {
        clearPendingReader(viewer);
      }
    });
  }, true);

  document.addEventListener('click', event => {
    if (nativeCloseAllowed) { nativeCloseAllowed = false; return; }
    const isCloseButton = event.target.closest?.('#closePdfViewer');
    const isScrim = event.target.id === 'pdfViewerScrim';
    const hasCompletedDetailsMotion = completedDetailsMotion?.viewer === document.getElementById('pdfViewer');
    if ((!isCloseButton && !isScrim) || (!activeMotion && !hasCompletedDetailsMotion)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closeWithReverse(isScrim ? 'scrim' : 'button');
  }, true);

  document.addEventListener('keydown', event => {
    const hasCompletedDetailsMotion = completedDetailsMotion?.viewer === document.getElementById('pdfViewer');
    if (event.key !== 'Escape' || (!activeMotion && !hasCompletedDetailsMotion) || nativeCloseAllowed) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closeWithReverse('button');
  }, true);
})();
