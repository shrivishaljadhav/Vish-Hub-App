(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let threeLibraryPromise = null;
  let pdfLibraryPromise = null;
  let vecPdfDataPromise = null;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const thumbnailObserver = 'IntersectionObserver' in window
    ? new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      thumbnailObserver.unobserve(entry.target);
      void renderBookThumbnail(entry.target);
    }), { rootMargin: '260px 0px' })
    : null;

  function waitForCoverImage(image) {
    if (image.complete && image.naturalWidth) return Promise.resolve(image);
    if (image.complete && !image.naturalWidth) return Promise.reject(new Error('Book cover image unavailable'));
    return new Promise((resolve, reject) => {
      const done = () => image.naturalWidth ? resolve(image) : reject(new Error('Book cover image unavailable'));
      image.addEventListener('load', done, { once: true });
      image.addEventListener('error', () => reject(new Error('Book cover image unavailable')), { once: true });
    });
  }

  function loadOptionalTextureImage(src) {
    if (!src) return Promise.resolve(null);
    return new Promise(resolve => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = src;
    });
  }

  function ensurePdfLibrary() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (pdfLibraryPromise) return pdfLibraryPromise;
    pdfLibraryPromise = new Promise((resolve, reject) => {
      let script = document.querySelector('script[data-book-pdf-library],script[src*="pdf.min.js"]');
      const finish = () => window.pdfjsLib ? resolve(window.pdfjsLib) : reject(new Error('PDF.js did not initialize'));
      if (script?.dataset.state === 'failed') { script.remove(); script = null; }
      if (script) {
        if (window.pdfjsLib) { resolve(window.pdfjsLib); return; }
        script.addEventListener('load', finish, { once: true });
        script.addEventListener('error', () => reject(new Error('PDF.js could not load')), { once: true });
        return;
      }
      script = document.createElement('script');
      script.src = 'js/vendor/pdf.min.js';
      script.async = true;
      script.dataset.bookPdfLibrary = 'true';
      script.dataset.state = 'loading';
      script.onload = () => { script.dataset.state = 'loaded'; finish(); };
      script.onerror = () => { script.dataset.state = 'failed'; reject(new Error('PDF.js could not load')); };
      document.head.append(script);
    }).catch(error => { pdfLibraryPromise = null; throw error; });
    return pdfLibraryPromise;
  }

  function loadEmbeddedVecPdf(scriptUrl) {
    if (window.VISH_VEC_ENVIRONMENT_PDF_BASE64) return Promise.resolve(window.VISH_VEC_ENVIRONMENT_PDF_BASE64);
    if (vecPdfDataPromise) return vecPdfDataPromise;
    vecPdfDataPromise = new Promise((resolve, reject) => {
      let script = document.querySelector('script[data-vec-pdf-data]');
      const finish = () => window.VISH_VEC_ENVIRONMENT_PDF_BASE64
        ? resolve(window.VISH_VEC_ENVIRONMENT_PDF_BASE64)
        : reject(new Error('Embedded VEC PDF data is unavailable'));
      if (script?.dataset.state === 'failed') { script.remove(); script = null; }
      if (script) {
        if (window.VISH_VEC_ENVIRONMENT_PDF_BASE64) { resolve(window.VISH_VEC_ENVIRONMENT_PDF_BASE64); return; }
        script.addEventListener('load', finish, { once: true });
        script.addEventListener('error', () => reject(new Error('Embedded VEC PDF could not load')), { once: true });
        return;
      }
      script = document.createElement('script');
      script.src = scriptUrl;
      script.async = true;
      script.dataset.vecPdfData = 'true';
      script.dataset.state = 'loading';
      script.onload = () => { script.dataset.state = 'loaded'; finish(); };
      script.onerror = () => { script.dataset.state = 'failed'; reject(new Error('Embedded VEC PDF could not load')); };
      document.head.append(script);
    }).catch(error => { vecPdfDataPromise = null; throw error; });
    return vecPdfDataPromise;
  }

  function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let offset = 0; offset < binary.length; offset += 32768) {
      const end = Math.min(binary.length, offset + 32768);
      for (let index = offset; index < end; index++) bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  async function renderPdfFrontPageFallback(frame, image) {
    if (frame.dataset.pdfFallbackRendered === 'true' || frame.dataset.pdfFallbackLoading === 'true') return;
    const scriptUrl = frame.dataset.pdfDataScript;
    const pdfUrl = frame.dataset.pdfUrl;
    if (!scriptUrl && !pdfUrl) return;
    frame.dataset.pdfFallbackLoading = 'true';
    frame.classList.add('pdf-front-page-loading');
    image.hidden = true;
    let pdfDocument;
    try {
      const pdfjs = await ensurePdfLibrary();
      if (pdfjs.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = 'js/vendor/pdf.worker.min.js';
      const source = scriptUrl ? { data: base64ToBytes(await loadEmbeddedVecPdf(scriptUrl)) } : { url: pdfUrl };
      pdfDocument = await pdfjs.getDocument({ ...source, isEvalSupported: false }).promise;
      const page = await pdfDocument.getPage(1);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(1.25, 480 / baseViewport.width, 680 / baseViewport.height);
      const viewport = page.getViewport({ scale });
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = Math.max(1, Math.ceil(viewport.width));
      pageCanvas.height = Math.max(1, Math.ceil(viewport.height));
      const context = pageCanvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Could not create PDF thumbnail canvas');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      await page.render({ canvasContext: context, viewport }).promise;
      if (!frame.isConnected) return;
      image.src = pageCanvas.toDataURL('image/jpeg', .92);
      image.alt = 'First page of ' + image.alt.replace(/^(Cover|Preview) of /, '');
      if (typeof image.decode === 'function') await image.decode();
      image.hidden = false;
      image.dataset.fallback = 'pdf-page-1';
      const unavailable = frame.querySelector('.cover-unavailable');
      if (unavailable) unavailable.hidden = true;
      frame.dataset.pdfFallbackRendered = 'true';
      pageCanvas.width = 1;
      pageCanvas.height = 1;
    } finally {
      await pdfDocument?.destroy?.();
      if (scriptUrl) vecPdfDataPromise = null;
      frame.classList.remove('pdf-front-page-loading');
      delete frame.dataset.pdfFallbackLoading;
    }
  }

  function ensureThreeLibrary() {
    if (window.THREE) return Promise.resolve(window.THREE);
    if (threeLibraryPromise) return threeLibraryPromise;
    const src = 'js/vendor/three-0.152.2.min.js';
    threeLibraryPromise = new Promise((resolve, reject) => {
      let script = document.querySelector('script[data-book-motion="' + src + '"]');
      const finish = () => window.THREE ? resolve(window.THREE) : reject(new Error('Three.js did not initialize'));
      if (script?.dataset.state === 'failed') { script.remove(); script = null; }
      if (script) {
        if (window.THREE) { resolve(window.THREE); return; }
        script.addEventListener('load', finish, { once: true });
        script.addEventListener('error', () => reject(new Error('Three.js could not load')), { once: true });
        return;
      }
      script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.bookMotion = src;
      script.dataset.state = 'loading';
      script.onload = () => { script.dataset.state = 'loaded'; finish(); };
      script.onerror = () => { script.dataset.state = 'failed'; reject(new Error('Three.js could not load')); };
      document.head.append(script);
    }).catch(error => { threeLibraryPromise = null; throw error; });
    return threeLibraryPromise;
  }

  function makeSpineTexture(THREE) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    const leather = ctx.createLinearGradient(0, 0, canvas.width, 0);
    leather.addColorStop(0, '#022c20');
    leather.addColorStop(.2, '#07553a');
    leather.addColorStop(.48, '#0b6745');
    leather.addColorStop(.8, '#06452f');
    leather.addColorStop(1, '#01291e');
    ctx.fillStyle = leather;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = .13;
    for (let y = 0; y < canvas.height; y += 4) {
      ctx.fillStyle = y % 8 ? '#d8c27b' : '#001b13';
      ctx.fillRect(0, y, canvas.width, 1);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#d2aa45';
    ctx.lineWidth = 7;
    [45, 75, 930, 960].forEach(y => { ctx.beginPath(); ctx.moveTo(18, y); ctx.lineTo(238, y); ctx.stroke(); });
    ctx.save();
    ctx.translate(128, 500);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f6e7b3';
    ctx.shadowColor = 'rgba(0,0,0,.7)';
    ctx.shadowBlur = 5;
    ctx.font = 'bold 49px Georgia, serif';
    ctx.fillText('ENVIRONMENT STUDIES', 0, 10);
    ctx.restore();
    ctx.fillStyle = '#f4e6b7';
    ctx.textAlign = 'center';
    ctx.font = 'bold 24px Georgia, serif';
    ctx.fillText('SEMESTER III · IV', 128, 142);
    ctx.font = 'bold 18px Georgia, serif';
    ctx.fillText('4 CREDITS', 128, 888);
    ctx.font = 'bold 19px Georgia, serif';
    ctx.fillText('NIRALI PRAKASHAN', 128, 990);
    return new THREE.CanvasTexture(canvas);
  }

  function makePageEdgeTexture(THREE) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const paper = ctx.createLinearGradient(0, 0, canvas.width, 0);
    paper.addColorStop(0, '#cbb889');
    paper.addColorStop(.12, '#fff9e9');
    paper.addColorStop(.88, '#f5edda');
    paper.addColorStop(1, '#c2ae7c');
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(118,91,44,.22)';
    for (let y = 3; y < canvas.height; y += 5) ctx.fillRect(0, y, canvas.width, 1);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    return texture;
  }

  async function renderBookThumbnail(frame) {
    if (frame.dataset.threeBookReady === 'true' || frame.dataset.threeBookLoading === 'true') return;
    const image = frame.querySelector('img');
    if (!image) return;
    // Library cards use the supplied cover artwork as their thumbnail. The
    // old Three.js placeholder board could hide that image or paint a blank
    // face, so cover depth is now reserved for the GSAP image transition.
    if (frame.dataset.hasExplicitCover === 'true') {
      image.hidden = false;
      return;
    }
    // For books without uploaded art, keep the requested PDF-page thumbnail
    // fallback. Never create a colored or blank Three.js cover in its place.
    if (!frame.dataset.pdfUrl && !frame.dataset.pdfDataScript) {
      image.hidden = false;
      return;
    }
    frame.dataset.threeBookLoading = 'true';
    let renderer = null;
    let canvas = null;
    let resizeObserver = null;
    try {
      // A renderer can succeed while still showing its placeholder material when
      // a resource has no real cover artwork. Use the source PDF page itself for
      // those titles instead of exposing a blank green 3D face.
      if (frame.dataset.pdfUrl && frame.dataset.hasExplicitCover !== 'true') {
        frame.classList.add('book-three-failed');
        frame.dataset.threeBookFailed = 'true';
        try {
          await renderPdfFrontPageFallback(frame, image);
        } catch (fallbackError) {
          console.warn('PDF front-page thumbnail fallback:', fallbackError);
        }
        if (frame.dataset.pdfFallbackRendered !== 'true' && frame.dataset.pdfPreviewUrl) {
          try {
            image.src = frame.dataset.pdfPreviewUrl;
            await waitForCoverImage(image);
            image.hidden = false;
            image.dataset.fallback = 'drive-pdf-preview';
            const unavailable = frame.querySelector('.cover-unavailable');
            if (unavailable) unavailable.hidden = true;
          } catch (previewError) {
            console.warn('Drive PDF preview fallback:', previewError);
          }
        }
        image.hidden = false;
        return;
      }
      await ensureThreeLibrary();
      await waitForCoverImage(image);
      if (typeof image.decode === 'function') await image.decode();
      const THREE = window.THREE;
      const gsap = reduceMotion.matches ? null : window.gsap;
      if (!THREE || !frame.isConnected) throw new Error('Three.js book renderer unavailable');
      const bookResource = frame.closest('.book-cover-open')?._vishBookRecord?.resource;
      const frontCoverUrl = frame.dataset.coverFront || bookResource?.coverFrontUrl || '';
      const [frontImage, backImage, spineImage] = await Promise.all([
        loadOptionalTextureImage(frontCoverUrl),
        loadOptionalTextureImage(frame.dataset.coverBack),
        loadOptionalTextureImage(frame.dataset.coverSpine)
      ]);

      canvas = document.createElement('canvas');
      canvas.className = 'book-three-thumbnail';
      canvas.setAttribute('aria-hidden', 'true');
      canvas.setAttribute('role', 'presentation');
      frame.append(canvas);
      const mobile = matchMedia('(max-width: 680px)').matches;
      renderer = new THREE.WebGLRenderer({
        canvas, alpha: true, antialias: !mobile, powerPreference: 'low-power',
        depth: true, stencil: false, preserveDrawingBuffer: false
      });
      const pixelRatio = Math.min(window.devicePixelRatio || 1, mobile ? 1 : 1.4);
      renderer.setPixelRatio(pixelRatio);
      renderer.setClearColor(0x000000, 0);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(29, 1, .1, 100);
      camera.position.set(-1.8, .55, 3);
      camera.lookAt(0, 0, 0);
      scene.add(new THREE.HemisphereLight(0xfff7e6, 0x254632, 2.15));
      const keyLight = new THREE.DirectionalLight(0xfff4d3, 3.0);
      keyLight.position.set(-2.8, 3.6, 4.8);
      scene.add(keyLight);
      const rimLight = new THREE.DirectionalLight(0xd5b66a, 1.45);
      rimLight.position.set(3.4, 1.4, -2.8);
      scene.add(rimLight);

      const book = new THREE.Group();
      scene.add(book);
      const width = 1.055;
      const height = 1.56;
      const thickness = .205;
      const spineWidth = .15;
      const frontWidth = width - spineWidth;
      const spineTexture = spineImage ? new THREE.Texture(spineImage) : makeSpineTexture(THREE);
      spineTexture.needsUpdate = true;
      if ('colorSpace' in spineTexture && THREE.SRGBColorSpace) spineTexture.colorSpace = THREE.SRGBColorSpace;
      else if ('encoding' in spineTexture && THREE.sRGBEncoding) spineTexture.encoding = THREE.sRGBEncoding;
      const pageTexture = makePageEdgeTexture(THREE);
      const pageMat = new THREE.MeshStandardMaterial({ color: 0xf4eddb, roughness: .94 });
      const pageEdgeMat = new THREE.MeshStandardMaterial({ map: pageTexture, color: 0xffffff, roughness: .88 });
      const leatherMat = new THREE.MeshStandardMaterial({ map: spineTexture, color: 0xffffff, roughness: .62, metalness: .025 });
      const backTexture = backImage ? new THREE.Texture(backImage) : spineTexture;
      backTexture.needsUpdate = true;
      if ('colorSpace' in backTexture && THREE.SRGBColorSpace) backTexture.colorSpace = THREE.SRGBColorSpace;
      else if ('encoding' in backTexture && THREE.sRGBEncoding) backTexture.encoding = THREE.sRGBEncoding;
      const backCoverMat = new THREE.MeshStandardMaterial({ map: backTexture, color: 0xffffff, roughness: .7, metalness: .02 });
      const goldMat = new THREE.MeshStandardMaterial({ color: 0xd9b85f, roughness: .32, metalness: .58 });
      const pages = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, thickness),
        [pageEdgeMat, pageEdgeMat, pageMat, pageMat, pageMat, pageMat]
      );
      pages.position.set(spineWidth / 2, 0, -.005);
      book.add(pages);
      const backBoardWidth = frontWidth + .025;
      const backCover = new THREE.Mesh(
        new THREE.BoxGeometry(backBoardWidth, height + .03, .065),
        [goldMat, goldMat, goldMat, goldMat, leatherMat, backCoverMat]
      );
      backCover.position.set(-width / 2 + spineWidth + backBoardWidth / 2, 0, -.132);
      book.add(backCover);
      const spine = new THREE.Mesh(
        new THREE.BoxGeometry(spineWidth, height + .045, .25),
        [goldMat, goldMat, goldMat, goldMat, leatherMat, leatherMat]
      );
      spine.position.set(-width / 2 + spineWidth / 2, 0, -.005);
      book.add(spine);

      // Snapshot the decoded cover into a canvas before WebGL upload. This avoids
      // Chromium rendering a black map when a lazy local-file image is used.
      const artworkImage = frontImage || image;
      const coverCanvas = document.createElement('canvas');
      coverCanvas.width = artworkImage.naturalWidth;
      coverCanvas.height = artworkImage.naturalHeight;
      const coverContext = coverCanvas.getContext('2d', { alpha: true });
      if (!coverContext) throw new Error('Could not prepare the VEC cover artwork');
      coverContext.drawImage(artworkImage, 0, 0, coverCanvas.width, coverCanvas.height);
      const texture = new THREE.CanvasTexture(coverCanvas);
      if ('colorSpace' in texture && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
      else if ('encoding' in texture && THREE.sRGBEncoding) texture.encoding = THREE.sRGBEncoding;
      texture.anisotropy = 2;
      texture.needsUpdate = true;
      // Use an unlit mapped face so lighting can add depth to the book sides
      // without tinting or obscuring the supplied cover artwork.
      const coverFront = new THREE.MeshBasicMaterial({
        map: texture,
        color: 0xffffff,
        transparent: true,
        alphaTest: .025,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false
      });
      const coverSides = new THREE.MeshStandardMaterial({ color: 0xb48b3b, roughness: .43, metalness: .38 });
      const hinge = new THREE.Group();
      hinge.position.set(-width / 2 + spineWidth, 0, .105);
      book.add(hinge);
      const cover = new THREE.Mesh(
        // Keep the front board independent from the spine. When a flat front
        // cover is available, map it only onto this board instead of stretching
        // a complete perspective mockup across the whole book face.
        new THREE.BoxGeometry(frontWidth, height, .06),
        // Reuse the artwork on both broad faces so the blank ivory back face
        // cannot swing over and read as a white slab during the 3D motion.
        [coverSides, coverSides, coverSides, coverSides, coverFront, coverFront]
      );
      cover.position.set(frontWidth / 2, 0, 0);
      hinge.add(cover);
      // The supplied PNG has a transparent silhouette. Draw its artwork over
      // the book block so the paper and back board cannot bleed through the
      // printed front as a blank white/brown slab.
      cover.renderOrder = 20;

      const shadowCanvas = document.createElement('canvas');
      shadowCanvas.width = shadowCanvas.height = 128;
      const shadowContext = shadowCanvas.getContext('2d');
      const shadowGradient = shadowContext.createRadialGradient(64, 64, 12, 64, 64, 63);
      shadowGradient.addColorStop(0, 'rgba(3,13,25,.30)');
      shadowGradient.addColorStop(.62, 'rgba(3,13,25,.12)');
      shadowGradient.addColorStop(1, 'rgba(3,13,25,0)');
      shadowContext.fillStyle = shadowGradient;
      shadowContext.fillRect(0, 0, 128, 128);
      const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
      const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(1.65, 1.8),
        new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, opacity: .78 })
      );
      shadow.position.set(.06, -.05, -.2);
      shadow.rotation.x = -.16;
      book.add(shadow);
      book.rotation.set(-.045, -.19, -.035);

      const render = () => renderer.render(scene, camera);
      const resize = () => {
        const rect = frame.getBoundingClientRect();
        const w = Math.max(1, Math.round(rect.width * pixelRatio));
        const h = Math.max(1, Math.round(rect.height * pixelRatio));
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        render();
      };
      resizeObserver = 'ResizeObserver' in window ? new ResizeObserver(resize) : null;
      resizeObserver?.observe(frame);
      resize();
      frame.classList.add('book-three-ready');
      frame.classList.remove('book-three-failed');
      frame.dataset.threeBookReady = 'true';
      frame._threeBook = { renderer, scene, book, hinge, shadow, observer: resizeObserver, texture, coverCanvas, shadowTexture, spineTexture, backTexture, pageTexture, resize, render };
      if (gsap && !reduceMotion.matches) gsap.fromTo(canvas, { autoAlpha: 0, y: 10, scale: .92 }, {
        autoAlpha: 1, y: 0, scale: 1, duration: .58, ease: 'power3.out', clearProps: 'transform'
      });
    } catch (error) {
      resizeObserver?.disconnect();
      renderer?.dispose();
      renderer?.forceContextLoss?.();
      canvas?.remove();
      frame.classList.remove('book-three-ready');
      frame.classList.add('book-three-failed');
      frame.dataset.threeBookFailed = 'true';
      console.warn('3D book thumbnail fallback:', error);
      try {
        await renderPdfFrontPageFallback(frame, image);
      } catch (fallbackError) {
        console.warn('PDF front-page thumbnail fallback:', fallbackError);
        const previewUrl = frame.dataset.pdfPreviewUrl;
        if (previewUrl) {
          image.hidden = true;
          try {
            image.src = previewUrl;
            await waitForCoverImage(image);
            image.hidden = false;
            image.dataset.fallback = 'drive-pdf-preview';
            const unavailable = frame.querySelector('.cover-unavailable');
            if (unavailable) unavailable.hidden = true;
          } catch (previewError) {
            console.warn('Drive PDF preview fallback:', previewError);
          }
        }
        image.hidden = false;
        frame.classList.remove('pdf-front-page-loading');
      }
    } finally {
      delete frame.dataset.threeBookLoading;
    }
  }

  function getOrCreateThumbnail(frame) {
    if (thumbnailObserver) thumbnailObserver.observe(frame);
    else void renderBookThumbnail(frame);
  }

  function disposeBookThumbnail(frame) {
    thumbnailObserver?.unobserve(frame);
    const model = frame?._threeBook;
    if (!model) return;
    model.observer?.disconnect();
    const released = new Set();
    model.scene.traverse(object => {
      if (object.geometry && !released.has(object.geometry)) {
        released.add(object.geometry);
        object.geometry.dispose();
      }
      const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      materials.forEach(material => {
        if (!released.has(material)) { released.add(material); material.dispose(); }
        if (material.map && !released.has(material.map)) {
          released.add(material.map);
          material.map.dispose();
        }
      });
    });
    model.renderer.dispose();
    model.renderer.forceContextLoss?.();
    model.renderer.domElement.remove();
    delete frame._threeBook;
  }

  function enhanceBooksGrid(grid) {
    if (grid.classList.contains('book-carousel-track')) return;

    const section = grid.closest('.book-collection-section');
    const collectionName = section?.querySelector('.book-collection-title h3')?.textContent.trim() || 'Books';
    const cards = Array.from(grid.querySelectorAll('.book-cover-card'));
    if (cards.length === 0) return;

    const shell = document.createElement('div');
    shell.className = 'book-carousel-shell';

    const toolbar = document.createElement('div');
    toolbar.className = 'book-carousel-toolbar';
    const status = document.createElement('span');
    status.className = 'book-carousel-status';
    status.setAttribute('aria-live', 'polite');
    const progress = document.createElement('span');
    progress.className = 'book-carousel-progress';
    progress.setAttribute('role', 'progressbar');
    progress.setAttribute('aria-label', 'Book carousel position');
    progress.setAttribute('aria-valuemin', '1');
    progress.setAttribute('aria-valuemax', String(cards.length));
    const progressFill = document.createElement('span');
    progressFill.className = 'book-carousel-progress-fill';
    progress.append(progressFill);

    const controls = document.createElement('div');
    controls.className = 'book-carousel-controls';
    const previous = document.createElement('button');
    previous.type = 'button';
    previous.className = 'book-carousel-control';
    previous.setAttribute('aria-label', 'Previous books');
    previous.textContent = '‹';
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'book-carousel-control';
    next.setAttribute('aria-label', 'Next books');
    next.textContent = '›';
    controls.append(previous, next);
    toolbar.append(status, progress, controls);

    const viewport = document.createElement('div');
    viewport.className = 'book-carousel-viewport';
    viewport.tabIndex = 0;
    viewport.setAttribute('role', 'region');
    viewport.setAttribute('aria-label', collectionName + ' book carousel');
    viewport.setAttribute('aria-roledescription', 'carousel');
    grid.classList.add('book-carousel-track');
    cards.forEach((card, index) => {
      card.classList.add('book-carousel-slide');
      const frame = card.querySelector('.book-cover-frame');
      if (frame) getOrCreateThumbnail(frame);
      card.setAttribute('aria-roledescription', 'slide');
      card.setAttribute('aria-label', (index + 1) + ' of ' + cards.length + ': ' + (card.querySelector('.book-cover-details strong')?.textContent.trim() || 'Book'));
      const gsap = window.gsap;
      const motion = gsap ? {
        tiltX: gsap.quickTo(card, '--book-tilt-x', { duration: .14, ease: 'power2.out' }),
        tiltY: gsap.quickTo(card, '--book-tilt-y', { duration: .14, ease: 'power2.out' }),
        angle: gsap.quickTo(card, '--book-carousel-angle', { duration: .16, ease: 'power2.out' }),
        depth: gsap.quickTo(card, '--book-carousel-depth', { duration: .16, ease: 'power2.out' }),
        scale: gsap.quickTo(card, '--book-carousel-scale', { duration: .16, ease: 'power2.out' }),
        opacity: gsap.quickTo(card, '--book-carousel-opacity', { duration: .16, ease: 'power2.out' })
      } : null;
      card._bookCarouselGsap = motion;
      card.addEventListener('pointermove', event => {
        if (reduceMotion.matches || event.pointerType === 'touch') return;
        const bounds = card.getBoundingClientRect();
        const x = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
        const y = clamp((event.clientY - bounds.top) / bounds.height, 0, 1);
        if (motion) {
          motion.tiltX(((.5 - y) * 7).toFixed(2) + 'deg');
          motion.tiltY(((x - .5) * 9).toFixed(2) + 'deg');
        } else {
          card.style.setProperty('--book-tilt-x', ((.5 - y) * 7).toFixed(2) + 'deg');
          card.style.setProperty('--book-tilt-y', ((x - .5) * 9).toFixed(2) + 'deg');
        }
        card.style.setProperty('--book-glare-x', (x * 100).toFixed(1) + '%');
        card.style.setProperty('--book-glare-y', (y * 100).toFixed(1) + '%');
      });
      card.addEventListener('pointerleave', () => {
        if (motion) {
          motion.tiltX('0deg');
          motion.tiltY('0deg');
        } else {
          card.style.setProperty('--book-tilt-x', '0deg');
          card.style.setProperty('--book-tilt-y', '0deg');
        }
        const model = frame?._threeBook;
        if (model && !reduceMotion.matches) {
          window.gsap.to(model.book.rotation, { x: -.045, y: -.19, z: -.035, duration: .45, ease: 'power3.out', onUpdate: model.render });
          window.gsap.to(model.hinge.rotation, { y: -.015, duration: .5, ease: 'power3.out', onUpdate: model.render });
          window.gsap.to(model.shadow.material, { opacity: .78, duration: .5, ease: 'power2.out', onUpdate: model.render });
        }
      });
      card.addEventListener('pointerenter', event => {
        if (reduceMotion.matches || event.pointerType === 'touch') return;
        const model = frame?._threeBook;
        if (!model) return;
        window.gsap.to(model.book.rotation, { x: -.075, y: -.27, z: -.045, duration: .52, ease: 'power3.out', onUpdate: model.render });
        window.gsap.to(model.hinge.rotation, { y: -.055, duration: .55, ease: 'power3.out', onUpdate: model.render });
        window.gsap.to(model.shadow.material, { opacity: .96, duration: .48, ease: 'power2.out', onUpdate: model.render });
        model.resize();
      });
    });

    const originalParent = grid.parentElement;
    originalParent.insertBefore(shell, grid);
    shell.append(toolbar, viewport);
    viewport.append(grid);

    const gsap = reduceMotion.matches ? null : window.gsap;
    const progressMotion = gsap ? gsap.quickTo(progressFill, 'scaleX', { duration: .22, ease: 'power2.out' }) : null;
    let frame = 0;
    function updateCarousel() {
      frame = 0;
      const view = viewport.getBoundingClientRect();
      const center = view.left + view.width / 2;
      let nearestIndex = 0;
      let nearestDistance = Infinity;
      cards.forEach((card, index) => {
        const rect = card.getBoundingClientRect();
        const distance = rect.left + rect.width / 2 - center;
        const normalized = clamp(distance / Math.max(1, view.width * .54), -1.35, 1.35);
        const proximity = Math.min(1, Math.abs(normalized));
        const motion = card._bookCarouselGsap;
        const angle = (-normalized * 24).toFixed(2) + 'deg';
        const depth = (34 * (1 - proximity) - Math.max(0, Math.abs(normalized) - 1) * 12).toFixed(1) + 'px';
        const scale = (1 - proximity * .075).toFixed(3);
        const opacity = (1 - proximity * .2).toFixed(3);
        if (motion) {
          motion.angle(angle);
          motion.depth(depth);
          motion.scale(scale);
          motion.opacity(opacity);
        } else {
          card.style.setProperty('--book-carousel-angle', angle);
          card.style.setProperty('--book-carousel-depth', depth);
          card.style.setProperty('--book-carousel-scale', scale);
          card.style.setProperty('--book-carousel-opacity', opacity);
        }
        if (Math.abs(distance) < nearestDistance) {
          nearestDistance = Math.abs(distance);
          nearestIndex = index;
        }
      });
      cards.forEach((card, index) => {
        const active = index === nearestIndex;
        card.classList.toggle('is-carousel-active', active);
        if (active) card.setAttribute('aria-current', 'true');
        else card.removeAttribute('aria-current');
      });
      status.textContent = String(nearestIndex + 1).padStart(2, '0') + ' / ' + String(cards.length).padStart(2, '0');
      progress.setAttribute('aria-valuenow', String(nearestIndex + 1));
      if (progressMotion) progressMotion((nearestIndex + 1) / cards.length);
      else progressFill.style.transform = 'scaleX(' + ((nearestIndex + 1) / cards.length) + ')';
      previous.disabled = viewport.scrollLeft <= 2;
      next.disabled = viewport.scrollLeft + viewport.clientWidth >= viewport.scrollWidth - 2;
    }
    function scheduleUpdate() {
      if (!frame) frame = requestAnimationFrame(updateCarousel);
    }
    function move(direction) {
      const center = viewport.getBoundingClientRect().left + viewport.clientWidth / 2;
      const currentIndex = cards.reduce((closest, card, index) => {
        const distance = Math.abs(card.getBoundingClientRect().left + card.getBoundingClientRect().width / 2 - center);
        return distance < closest.distance ? { index, distance } : closest;
      }, { index: 0, distance: Infinity }).index;
      const target = cards[clamp(currentIndex + direction, 0, cards.length - 1)];
      if (!target) return;
      const bounds = target.getBoundingClientRect();
      const delta = bounds.left + bounds.width / 2 - center;
      viewport.scrollBy({ left: delta, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    }

    previous.addEventListener('click', () => move(-1));
    next.addEventListener('click', () => move(1));
    viewport.addEventListener('scroll', scheduleUpdate, { passive: true });
    viewport.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        move(event.key === 'ArrowLeft' ? -1 : 1);
      }
    });
    window.addEventListener('resize', scheduleUpdate, { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(scheduleUpdate).observe(viewport);
    scheduleUpdate();
  }

  function scan(root = document) {
    if (root.matches?.('#booksPage .book-cover-grid')) enhanceBooksGrid(root);
    root.querySelectorAll?.('#booksPage .book-cover-grid').forEach(enhanceBooksGrid);
  }

  scan();
  const observer = new MutationObserver(records => {
    for (const record of records) {
      record.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) scan(node);
      });
      record.removedNodes.forEach(node => {
        if (node.nodeType !== Node.ELEMENT_NODE || node.isConnected) return;
        if (node.matches?.('.book-cover-frame')) disposeBookThumbnail(node);
        node.querySelectorAll?.('.book-cover-frame').forEach(disposeBookThumbnail);
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
