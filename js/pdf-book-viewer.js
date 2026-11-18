(() => {
  try {
    CSS.registerProperty({ name: '--page-curl', syntax: '<number>', inherits: true, initialValue: '0' });
    CSS.registerProperty({ name: '--curl-edge-position', syntax: '<percentage>', inherits: true, initialValue: '50%' });
    CSS.registerProperty({ name: '--curl-fold-y', syntax: '<percentage>', inherits: true, initialValue: '50%' });
  } catch {}
  const pdfViewer = document.getElementById('pdfViewer');
  const frame = document.getElementById('resourceFrame');
  if (!pdfViewer || !frame) return;

  const create = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  const toolbar = create('div', 'pdf-book-toolbar');
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Book page controls');
  const previous = create('button', 'pdf-book-tool', '‹');
  previous.type = 'button';
  previous.setAttribute('aria-label', 'Previous page');
  const pageInput = create('input', 'pdf-book-page-input');
  pageInput.type = 'number';
  pageInput.min = '1';
  pageInput.value = '1';
  pageInput.setAttribute('aria-label', 'Current PDF page');
  const pageTotal = create('span', 'pdf-book-page-total', 'of —');
  const next = create('button', 'pdf-book-tool', '›');
  next.type = 'button';
  next.setAttribute('aria-label', 'Next page');
  const pageGroup = create('div', 'pdf-book-page-controls');
  pageGroup.append(previous, pageInput, pageTotal, next);

  const zoomGroup = create('div', 'pdf-book-zoom-controls');
  const zoomOut = create('button', 'pdf-book-tool', '−');
  zoomOut.type = 'button';
  zoomOut.setAttribute('aria-label', 'Zoom out');
  const zoomValue = create('span', 'pdf-book-zoom-value', '100%');
  const zoomIn = create('button', 'pdf-book-tool', '+');
  zoomIn.type = 'button';
  zoomIn.setAttribute('aria-label', 'Zoom in');
  const fit = create('button', 'pdf-book-tool pdf-book-fit', 'Fit');
  fit.type = 'button';
  fit.setAttribute('aria-label', 'Fit page to reader');
  zoomGroup.append(zoomOut, zoomValue, zoomIn, fit);
  toolbar.append(pageGroup, zoomGroup);

  const reader = create('div', 'pdf-book-reader');
  reader.setAttribute('role', 'region');
  reader.setAttribute('aria-label', 'Interactive 3D PDF book');
  reader.setAttribute('aria-description', 'A two-page open book. Swipe or drag a page to turn the spread. Use the page buttons or keyboard arrows to navigate.');
  reader.tabIndex = 0;
  const stage = create('div', 'pdf-book-stage');
  const pageFlipHost = create('div', 'pdf-book-pageflip-host');
  pageFlipHost.setAttribute('aria-label', 'PDF pages. Drag a page corner to turn.');
  const object = create('div', 'pdf-book-object');
  const stack = create('div', 'pdf-book-page-stack');
  const base = create('div', 'pdf-book-page-base');
  let leftCanvas = create('canvas', 'pdf-book-canvas pdf-book-left-page');
  leftCanvas.setAttribute('aria-label', 'Left page');
  let rightCanvas = create('canvas', 'pdf-book-canvas pdf-book-right-page');
  rightCanvas.setAttribute('aria-label', 'Right page');
  base.append(leftCanvas, rightCanvas);

  const turn = create('div', 'pdf-book-turn-sheet');
  turn.setAttribute('aria-hidden', 'true');
  const turnFront = create('div', 'pdf-book-turn-face pdf-book-turn-front');
  const frontCanvas = create('canvas', 'pdf-book-canvas');
  turnFront.append(frontCanvas);
  const turnBack = create('div', 'pdf-book-turn-face pdf-book-turn-back');
  const backCanvas = create('canvas', 'pdf-book-canvas');
  turnBack.append(backCanvas);
  const BEND_STRIP_COUNT = 48;
  const bendLayer = create('div', 'pdf-book-bend-layer');
  const bendStrips = Array.from({ length: BEND_STRIP_COUNT }, (_, index) => {
    const strip = create('div', 'pdf-book-bend-strip');
    strip.style.left = `${index * 100 / BEND_STRIP_COUNT}%`;
    strip.style.width = `calc(${100 / BEND_STRIP_COUNT}% + 1px)`;
    const frontFace = create('div', 'pdf-book-bend-face pdf-book-bend-front');
    const frontSlice = create('canvas', 'pdf-book-bend-canvas');
    frontFace.append(frontSlice);
    const backFace = create('div', 'pdf-book-bend-face pdf-book-bend-back');
    const backSlice = create('canvas', 'pdf-book-bend-canvas');
    backFace.append(backSlice);
    strip.append(frontFace, backFace);
    bendLayer.append(strip);
    return { strip, frontSlice, backSlice, index };
  });
  turn.append(turnFront, turnBack, bendLayer);
  object.append(stack, base, turn);
  stage.append(pageFlipHost, object);
  let stagingLeft = document.createElement('canvas');
  let stagingRight = document.createElement('canvas');
  let movingCanvas = null;
  const loading = create('div', 'pdf-book-loading', 'Preparing your book…');
  loading.setAttribute('role', 'status');
  const touchHint = create('div', 'pdf-book-touch-hint', 'Swipe to turn · tap a page edge');
  reader.append(stage, loading, touchHint);

  const message = create('div', 'pdf-book-fallback-message');
  message.setAttribute('role', 'status');
  const messageText = create('span', '', 'This PDF could not be loaded for page-turn mode. Use the standard reader below.');
  message.append(messageText);

  pdfViewer.insertBefore(toolbar, frame);
  pdfViewer.insertBefore(reader, frame);
  pdfViewer.insertBefore(message, frame);
  toolbar.hidden = true;
  reader.hidden = true;
  message.hidden = true;
  frame.hidden = false;

  let pdfLibraryPromise = null;
  let pageFlipLibraryPromise = null;
  let pageFlip = null;
  let pageFlipNodes = [];
  let pageImageUrls = [];
  let desktopInsideCoverBlank = false;
  let pageImagePromises = new Map();
  let pageFlipPageWidth = 0;
  let pageFlipPageHeight = 0;
  let pageFlipBuildSequence = 0;
  let pagePrefetchSequence = 0;
  let pageFlipPreparing = false;
  let pdfDocument = null;
  let currentResource = null;
  let currentPage = 1;
  let pageAspectRatio = 0.707;
  let zoom = 1;
  let isTurning = false;
  let renderSequence = 0;
  let openSequence = 0;
  let embeddedPdfPromise = null;
  let embeddedPdfBytes = null;
  let pageGesture = null;
  let suppressPageTapUntil = 0;
  let prefetchedSpreadStart = null;
  let prefetchedSpreadSequence = 0;
  let prefetchedSpreadPromise = null;
  let prefetchInProgress = false;
  let pageFlipCenteringLocked = false;
  // Leave a wider one-page range so compact desktop windows and phone browsers
  // just above 620px do not show a lone cover on half of a landscape spread.
  const mobileBookQuery = window.matchMedia('(max-width: 700px)');
  let mobileSinglePage = mobileBookQuery.matches;
  reader.classList.toggle('pdf-book-single-page', mobileSinglePage);

  function isNarrowReader() {
    return mobileBookQuery.matches || (stage.clientWidth > 0 && stage.clientWidth <= 700);
  }

  function pagesPerView() { return mobileSinglePage ? 1 : 2; }

  function loadPdfLibrary() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (pdfLibraryPromise) return pdfLibraryPromise;
    const script = document.createElement('script');
    script.src = 'js/vendor/pdf.min.js';
    script.async = true;
    const pending = new Promise((resolve, reject) => {
      script.onload = () => window.pdfjsLib ? resolve(window.pdfjsLib) : reject(new Error('PDF engine did not initialize'));
      script.onerror = () => reject(new Error('Could not load the PDF engine'));
      document.head.append(script);
    }).catch(error => {
      script.remove();
      pdfLibraryPromise = null;
      throw error;
    });
    pdfLibraryPromise = pending;
    return pending;
  }

  function loadPageFlipLibrary() {
    if (window.St?.PageFlip) return Promise.resolve(window.St.PageFlip);
    if (pageFlipLibraryPromise) return pageFlipLibraryPromise;
    const script = document.createElement('script');
    script.src = 'js/vendor/page-flip.browser.js';
    script.async = true;
    const pending = new Promise((resolve, reject) => {
      script.onload = () => window.St?.PageFlip ? resolve(window.St.PageFlip) : reject(new Error('StPageFlip did not initialize'));
      script.onerror = () => reject(new Error('Could not load StPageFlip'));
      document.head.append(script);
    }).catch(error => {
      script.remove();
      pageFlipLibraryPromise = null;
      throw error;
    });
    pageFlipLibraryPromise = pending;
    return pending;
  }

  function pdfSource(resource) {
    const id = (resource?.driveUrl || '').match(/\/d\/([^/]+)/)?.[1];
    if (id) return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
    return resource?.pdfUrl || resource?.downloadUrl || resource?.url || resource?.driveUrl || '';
  }

  function loadEmbeddedPdf(scriptUrl) {
    if (window.VISH_VEC_ENVIRONMENT_PDF_BASE64) return Promise.resolve(window.VISH_VEC_ENVIRONMENT_PDF_BASE64);
    if (embeddedPdfPromise) return embeddedPdfPromise;
    const script = document.createElement('script');
    script.src = scriptUrl;
    script.async = true;
    const pending = new Promise((resolve, reject) => {
      script.onload = () => window.VISH_VEC_ENVIRONMENT_PDF_BASE64
        ? resolve(window.VISH_VEC_ENVIRONMENT_PDF_BASE64)
        : reject(new Error('Embedded book data was not available'));
      script.onerror = () => reject(new Error('Could not load embedded book data'));
      document.head.append(script);
    }).catch(error => {
      script.remove();
      embeddedPdfPromise = null;
      throw error;
    });
    embeddedPdfPromise = pending;
    return pending;
  }

  function decodePdfData(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let offset = 0; offset < binary.length; offset += 32768) {
      const end = Math.min(offset + 32768, binary.length);
      for (let index = offset; index < end; index++) bytes[index] = binary.charCodeAt(index);
    }
    if (window.VISH_VEC_ENVIRONMENT_PDF_BASE64 === base64) window.VISH_VEC_ENVIRONMENT_PDF_BASE64 = null;
    return bytes;
  }

  function pageFlipTargetIndex(index, direction) {
    if (!pageFlip) return index + direction;
    index = Math.floor(Number(index) || 0);
    const lastIndex = pageFlipSheetCount() - 1;
    if (direction > 0 && index === 0) return lastIndex >= 1 ? 1 : index;
    if (pageFlip.getOrientation() === 'portrait') return index + direction;
    if (direction > 0) return index + 2 <= lastIndex ? index + 2 : index;
    return index <= 1 ? 0 : index - 2;
  }

  function pageFlipSheetCount() {
    return (pdfDocument?.numPages || 0) + (desktopInsideCoverBlank ? 1 : 0);
  }

  function sheetPdfIndex(sheetIndex) {
    if (!desktopInsideCoverBlank) return sheetIndex;
    if (sheetIndex === 1) return -1;
    return sheetIndex > 1 ? sheetIndex - 1 : sheetIndex;
  }

  function pdfPageToSheetIndex(pageNumber) {
    const page = Math.max(1, Math.floor(Number(pageNumber) || 1));
    if (!desktopInsideCoverBlank || page === 1) return page - 1;
    if (page === 2) return 1;
    // Desktop spreads settle on their left-hand page. Page 2 is placed on the
    // right after the blank inside cover; subsequent PDF pages pair normally.
    return page % 2 === 0 ? page - 1 : page;
  }

  function pdfPageContentSheetIndex(pageNumber) {
    const page = Math.max(1, Math.floor(Number(pageNumber) || 1));
    return desktopInsideCoverBlank && page > 1 ? page : page - 1;
  }

  function sheetFirstPdfPage(sheetIndex) {
    if (!desktopInsideCoverBlank) return sheetIndex + 1;
    if (sheetIndex <= 1) return sheetIndex === 0 ? 1 : 2;
    return sheetIndex;
  }

  function setPageControls() {
    const pageIndex = pageFlip && pdfDocument ? pageFlip.getCurrentPageIndex() : null;
    if (pageIndex !== null) currentPage = Math.max(1, sheetFirstPdfPage(pageIndex));
    pageInput.value = String(currentPage);
    pageInput.max = String(pdfDocument?.numPages || 1);
    const isCoverAlone = Boolean(pageFlip?.getSettings?.().showCover && pageIndex === 0);
    const insideCoverSpread = desktopInsideCoverBlank && pageIndex === 1;
    const visiblePages = isCoverAlone || insideCoverSpread || pageFlip?.getOrientation?.() === 'portrait' ? 1 : pagesPerView();
    const lastVisible = pdfDocument ? Math.min(currentPage + visiblePages - 1, pdfDocument.numPages) : '—';
    pageTotal.textContent = pdfDocument ? `– ${lastVisible} of ${pdfDocument.numPages}` : 'of —';
    const previousDisabled = pageFlip
      ? pageFlipTargetIndex(pageIndex, -1) < 0 || pageFlipTargetIndex(pageIndex, -1) >= pageFlipSheetCount() || pageFlipTargetIndex(pageIndex, -1) === pageIndex
      : currentPage <= 1;
    const nextDisabled = pageFlip
      ? pageFlipTargetIndex(pageIndex, 1) < 0 || pageFlipTargetIndex(pageIndex, 1) >= pageFlipSheetCount() || pageFlipTargetIndex(pageIndex, 1) === pageIndex
      : currentPage + pagesPerView() > (pdfDocument?.numPages || 0);
    previous.disabled = !pdfDocument || previousDisabled || isTurning || pageFlipPreparing;
    next.disabled = !pdfDocument || nextDisabled || isTurning || pageFlipPreparing;
    pageInput.disabled = !pdfDocument || isTurning;
  }

  function spreadTarget(direction) {
    const step = pagesPerView();
    return direction > 0 ? currentPage + step : Math.max(1, currentPage - step);
  }

  function releasePageFlip() {
    pagePrefetchSequence++;
    pageFlip?.destroy?.();
    pageFlip = null;
    pageFlipNodes = [];
    pageFlipHost.replaceChildren();
    pageImageUrls.forEach(url => { if (url) URL.revokeObjectURL(url); });
    pageImageUrls = [];
    pageImagePromises.clear();
  }

  function pageFlipViewIndexes(pageIndex) {
    const last = Math.max(0, pageFlipSheetCount() - 1);
    const index = Math.max(0, Math.min(last, Math.floor(Number(pageIndex) || 0)));
    if (mobileSinglePage || index === 0) return [index];
    const first = index % 2 === 1 ? index : index - 1;
    return [first, first + 1].filter(value => value >= 0 && value <= last);
  }

  function centerDesktopPageFlip() {
    if (pageFlipCenteringLocked) return;
    if (!pageFlip || isNarrowReader() || pageFlip.getOrientation?.() === 'portrait') {
      pageFlipHost.style.removeProperty('--pageflip-center-offset');
      return;
    }

    // Measure only the pages in the current spread, not PageFlip's full-width
    // internal wrapper, which can be wider than the visible book.
    pageFlipHost.style.setProperty('--pageflip-center-offset', '0px');
    const stageRect = stage.getBoundingClientRect();
    const visibleIndexes = pageFlipViewIndexes(pageFlip.getCurrentPageIndex());
    const rects = visibleIndexes
      .map(index => pageFlipNodes[index]?.getBoundingClientRect())
      .filter(rect => rect && rect.width > 0 && rect.height > 0);
    if (!rects.length || stageRect.width <= 0) return;

    const left = Math.min(...rects.map(rect => rect.left));
    const right = Math.max(...rects.map(rect => rect.right));
    const spreadCenter = (left + right) / 2;
    const stageCenter = (stageRect.left + stageRect.right) / 2;
    pageFlipHost.style.setProperty('--pageflip-center-offset', `${stageCenter - spreadCenter}px`);
  }

  function schedulePageFlipCentering() {
    requestAnimationFrame(() => requestAnimationFrame(centerDesktopPageFlip));
  }

  function ensurePageFlipImage(pageIndex, sequence = pageFlipBuildSequence) {
    const pdfIndex = sheetPdfIndex(pageIndex);
    if (!pdfDocument || sequence !== pageFlipBuildSequence || pageIndex < 0 || pageIndex >= pageFlipSheetCount()) {
      return Promise.resolve(null);
    }
    if (pdfIndex < 0) return Promise.resolve(null);
    if (pageImageUrls[pageIndex]) return Promise.resolve(pageImageUrls[pageIndex]);
    if (pageImagePromises.has(pageIndex)) return pageImagePromises.get(pageIndex);

    const task = renderPdfPageImage(pdfIndex + 1, pageFlipPageWidth, pageFlipPageHeight, sequence)
      .then(async url => {
        if (sequence !== pageFlipBuildSequence || !pdfDocument) {
          URL.revokeObjectURL(url);
          return null;
        }
        const image = pageFlipNodes[pageIndex]?.querySelector('img');
        if (!image) {
          URL.revokeObjectURL(url);
          throw new Error('PDF page sheet is missing its image element');
        }
        try {
          image.src = url;
          await image.decode();
          if (!image.naturalWidth || !image.naturalHeight) throw new Error('Rendered PDF page image is empty');
        } catch (error) {
          image.removeAttribute('src');
          URL.revokeObjectURL(url);
          throw error;
        }
        if (sequence !== pageFlipBuildSequence || !pdfDocument) {
          URL.revokeObjectURL(url);
          return null;
        }
        pageImageUrls[pageIndex] = url;
        return url;
      })
      .finally(() => {
        if (pageImagePromises.get(pageIndex) === task) pageImagePromises.delete(pageIndex);
      });
    pageImagePromises.set(pageIndex, task);
    return task;
  }

  async function prefetchPageFlipWindow(pageIndex, sequence = pageFlipBuildSequence) {
    const request = ++pagePrefetchSequence;
    const visible = pageFlipViewIndexes(pageIndex);
    const last = Math.max(0, (pdfDocument?.numPages || 1) - 1);
    const ordered = [...visible];
    const add = index => {
      if (index >= 0 && index <= last && !ordered.includes(index)) ordered.push(index);
    };

    // Warm the next few pages first so the next turn is ready, then keep a
    // small window behind the reader for quick back turns.
    const forwardStart = pageIndex === 0 ? 1 : Math.max(...visible) + 1;
    for (let offset = 0; offset < 4; offset++) add(forwardStart + offset);
    const backwardStart = Math.min(...visible) - 1;
    for (let offset = 0; offset < 2; offset++) add(backwardStart - offset);

    for (let offset = 0; offset < ordered.length; offset += 2) {
      if (request !== pagePrefetchSequence || sequence !== pageFlipBuildSequence) return;
      await Promise.all(ordered.slice(offset, offset + 2).map(index => ensurePageFlipImage(index, sequence)));
    }
  }

  async function preparePageFlipView(pageIndex) {
    const sequence = pageFlipBuildSequence;
    const wanted = pageFlipViewIndexes(pageIndex);
    if (wanted.every(index => pageImageUrls[index])) return sequence === pageFlipBuildSequence;
    pageFlipPreparing = true;
    loading.hidden = false;
    loading.textContent = 'Preparing next page…';
    setPageControls();
    try {
      await Promise.all(wanted.map(index => ensurePageFlipImage(index, sequence)));
      return sequence === pageFlipBuildSequence && Boolean(pageFlip);
    } finally {
      if (sequence === pageFlipBuildSequence) {
        pageFlipPreparing = false;
        loading.hidden = true;
        setPageControls();
      }
    }
  }

  function updatePageFlipLayout() {
    if (!pageFlip) return;
    const stageWidth = stage.clientWidth || stage.getBoundingClientRect().width;
    const stageHeight = stage.clientHeight || stage.getBoundingClientRect().height;
    const narrow = isNarrowReader();
    const availableWidth = Math.max(180, (stageWidth - 12) / (narrow ? 1 : 2));
    const availableHeight = Math.max(240, stageHeight - 12);
    const pageWidth = Math.max(180, Math.round(Math.min(availableWidth, availableHeight * pageAspectRatio)));
    const pageHeight = Math.max(240, Math.round(pageWidth / pageAspectRatio));
    const settings = pageFlip.getSettings();
    settings.size = narrow ? 'fixed' : 'stretch';
    settings.width = pageWidth;
    settings.height = pageHeight;
    settings.minWidth = narrow ? pageWidth : Math.min(180, pageWidth);
    settings.maxWidth = pageWidth;
    settings.maxHeight = pageHeight;
    settings.minHeight = Math.min(240, pageHeight);
    pageFlip.update();
    mobileSinglePage = narrow || pageFlip.getOrientation?.() === 'portrait';
    reader.classList.toggle('pdf-book-single-page', mobileSinglePage);
    schedulePageFlipCentering();
  }

  async function renderPdfPageImage(pageNumber, cssWidth, cssHeight, sequence) {
    const page = await pdfDocument.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.max(.2, Math.min(cssWidth / baseViewport.width, cssHeight / baseViewport.height) * zoom);
    const viewport = page.getViewport({ scale });
    const pixelBudgetScale = Math.sqrt(1000000 / Math.max(1, viewport.width * viewport.height));
    const ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, 1.35, pixelBudgetScale));
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width * ratio);
    canvas.height = Math.ceil(viewport.height * ratio);
    const context = canvas.getContext('2d', { alpha: false });
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    try {
      await page.render({ canvasContext: context, viewport }).promise;
      if (sequence !== pageFlipBuildSequence) throw new Error('Page rendering was superseded');
      const blob = await new Promise((resolve, reject) => canvas.toBlob(file => file ? resolve(file) : reject(new Error('Could not encode PDF page')), 'image/jpeg', .9));
      return URL.createObjectURL(blob);
    } finally {
      canvas.width = canvas.height = 0;
      page.cleanup?.();
    }
  }

  async function buildPageFlip(startPage = 1) {
    if (!pdfDocument) return;
    const sequence = ++pageFlipBuildSequence;
    pageFlipPreparing = true;
    isTurning = true;
    loading.hidden = false;
    loading.textContent = 'Preparing the page…';
    releasePageFlip();
    if (!pageFlipHost.isConnected) stage.append(pageFlipHost);

    try {
      const FlipClass = await loadPageFlipLibrary();
      if (sequence !== pageFlipBuildSequence || !pdfDocument) return;
      const firstPage = await pdfDocument.getPage(1);
      const firstSize = firstPage.getViewport({ scale: 1 });
      pageAspectRatio = firstSize.width / firstSize.height;
      const stageRect = stage.getBoundingClientRect();
      const stageWidth = stage.clientWidth || stageRect.width;
      const stageHeight = stage.clientHeight || stageRect.height;
      mobileSinglePage = isNarrowReader();
      reader.classList.toggle('pdf-book-single-page', mobileSinglePage);
      const availableHeight = Math.max(240, stageHeight - 12);
      const availableWidth = Math.max(180, (stageWidth - 12) / (mobileSinglePage ? 1 : 2));
      const fitScale = Math.min(availableWidth / firstSize.width, availableHeight / firstSize.height);
      const pageWidth = Math.max(180, Math.round(firstSize.width * fitScale));
      const pageHeight = Math.max(240, Math.round(firstSize.height * fitScale));
      pageFlipPageWidth = pageWidth;
      pageFlipPageHeight = pageHeight;
      firstPage.cleanup?.();

      // On a desktop spread, reserve the inside-front-cover verso as a blank
      // sheet. This places PDF page 2 on the right side when the cover opens.
      desktopInsideCoverBlank = !mobileSinglePage && pdfDocument.numPages > 1;
      const pdfPageIndexes = Array.from({ length: pdfDocument.numPages }, (_, index) => index);
      const sheetPdfIndexes = desktopInsideCoverBlank && pdfPageIndexes.length > 1
        ? [pdfPageIndexes[0], -1, ...pdfPageIndexes.slice(1)]
        : pdfPageIndexes;
      pageFlipNodes = sheetPdfIndexes.map((pdfIndex, sheetIndex) => {
        const sheet = create('div', 'pdf-reader-page');
        sheet.dataset.pageIndex = String(pdfIndex);
        sheet.dataset.sheetIndex = String(sheetIndex);
        // Keep the cover as a solo opening page via showCover, but use the
        // same soft sheet physics as interior PDF pages for a consistent turn.
        sheet.dataset.density = 'soft';
        if (pdfIndex < 0) {
          sheet.classList.add('pdf-reader-page--inside-cover');
          sheet.setAttribute('aria-hidden', 'true');
        } else {
          sheet.setAttribute('role', 'img');
          sheet.setAttribute('aria-label', `PDF page ${pdfIndex + 1}`);
          const image = create('img', 'pdf-reader-page-image');
          image.alt = `Page ${pdfIndex + 1}`;
          image.decoding = 'async';
          sheet.append(image);
        }
        return sheet;
      });
      pageImageUrls = Array(pageFlipNodes.length).fill(null);
      pageImagePromises = new Map();

      const pageIndex = Math.max(0, Math.min(pageFlipNodes.length - 1, pdfPageToSheetIndex(startPage)));
      loading.textContent = `Preparing page ${sheetFirstPdfPage(pageIndex)}…`;
      // Decode the opening cover and the first interior page together. The
      // details-to-reader handoff can then turn straight to page two without
      // starting a second render after the cover has already arrived.
      const openingIndexes = new Set(pageFlipViewIndexes(pageIndex));
      if (pageIndex === 0 && pdfDocument.numPages > 1) openingIndexes.add(pdfPageContentSheetIndex(2));
      await Promise.all([...openingIndexes].map(index => ensurePageFlipImage(index, sequence)));
      if (sequence !== pageFlipBuildSequence || !pdfDocument) return;

      pageFlip = new FlipClass(pageFlipHost, {
        width: pageWidth,
        height: pageHeight,
        size: isNarrowReader() ? 'fixed' : 'stretch',
        minWidth: isNarrowReader() ? pageWidth : Math.min(180, pageWidth),
        maxWidth: pageWidth,
        minHeight: Math.min(240, pageHeight),
        maxHeight: pageHeight,
        startPage: pageIndex,
        drawShadow: true,
        maxShadowOpacity: .82,
        flippingTime: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 180 : 1000,
        usePortrait: true,
        autoSize: true,
        showCover: true,
        showPageCorners: true,
        mobileScrollSupport: true,
        useMouseEvents: true,
        swipeDistance: 34,
        disableFlipByClick: true
      });
      pageFlip.on('flip', event => {
        currentPage = Math.max(1, Math.min(pdfDocument?.numPages || 1, sheetFirstPdfPage(Number(event.data))));
        setPageControls();
        void prefetchPageFlipWindow(Number(event.data), sequence);
      });
      pageFlip.on('changeState', event => {
        isTurning = event.data === 'user_fold' || event.data === 'fold_corner' || event.data === 'flipping';
        setPageControls();
        if (!isTurning) schedulePageFlipCentering();
      });
      pageFlip.on('changeOrientation', event => {
        mobileSinglePage = isNarrowReader() || event.data === 'portrait';
        reader.classList.toggle('pdf-book-single-page', mobileSinglePage);
        setPageControls();
        schedulePageFlipCentering();
      });
      pageFlip.on('init', () => {
        currentPage = sheetFirstPdfPage(pageIndex);
        setPageControls();
      });
      pageFlip.loadFromHTML(pageFlipNodes);
      pageFlip.turnToPage(pageIndex);
      if (isNarrowReader()) updatePageFlipLayout();
      currentPage = sheetFirstPdfPage(pageIndex);
      mobileSinglePage = isNarrowReader() || pageFlip.getOrientation?.() === 'portrait';
      reader.classList.toggle('pdf-book-single-page', mobileSinglePage);
      pdfViewer.classList.add('pdf-book-pageflip-active');
      loading.hidden = true;
      setPageControls();
      schedulePageFlipCentering();
      void prefetchPageFlipWindow(pageIndex, sequence);
      pdfViewer.dispatchEvent(new CustomEvent('vish-book-pageflip-ready', { detail: { currentPage, pageCount: pdfDocument.numPages } }));
    } catch (error) {
      if (sequence === pageFlipBuildSequence) {
        releasePageFlip();
        pdfViewer.classList.remove('pdf-book-pageflip-active');
        loading.hidden = false;
        loading.textContent = 'Could not prepare this page. Try again or reopen the book.';
      }
      throw error;
    } finally {
      if (sequence === pageFlipBuildSequence) {
        pageFlipPreparing = false;
        isTurning = false;
        if (!pageFlip) loading.hidden = false;
        setPageControls();
      }
    }
  }

  function slicePage(source, target, index) {
    if (!source.width || !source.height) return;
    const left = Math.floor(source.width * index / BEND_STRIP_COUNT);
    const right = Math.ceil(source.width * (index + 1) / BEND_STRIP_COUNT);
    target.width = Math.max(1, right - left);
    target.height = source.height;
    const context = target.getContext('2d', { alpha: false });
    context.drawImage(source, left, 0, right - left, source.height, 0, 0, target.width, target.height);
  }

  function prepareBendMesh(frontSource) {
    bendStrips.forEach(({ frontSlice, backSlice, index }) => {
      slicePage(frontSource, frontSlice, index);
      backSlice.width = frontSlice.width || 1;
      backSlice.height = frontSlice.height || 1;
      const context = backSlice.getContext('2d', { alpha: false });
      context.fillStyle = '#fffdf7';
      context.fillRect(0, 0, backSlice.width, backSlice.height);
    });
    turn.classList.add('has-page-mesh');
  }

  function prepareBendBack(source) {
    bendStrips.forEach(({ backSlice, index }) => slicePage(source, backSlice, index));
  }

  function updateBendMesh(direction, progress, edgePosition, foldY) {
    const amount = Math.max(0, Math.min(1, progress));
    const edge = Math.max(0, Math.min(100, edgePosition)) / 100;
    const normalizedY = Math.max(0, Math.min(100, foldY)) / 100;
    bendStrips.forEach(({ strip, index }) => {
      const x = (index + .5) / BEND_STRIP_COUNT;
      const leading = direction > 0 ? x : 1 - x;
      const localProgress = Math.max(0, Math.min(1, (amount - (1 - leading) * .34) / .66));
      const angle = (direction > 0 ? -1 : 1) * 180 * localProgress;
      const curl = Math.sin(Math.PI * localProgress);
      const fingerPressure = Math.max(0, 1 - Math.abs(x - edge) * 2.7);
      const cornerBias = Math.abs(normalizedY - .5) * 1.25 + .3;
      const lift = curl * (8 + fingerPressure * 13) * cornerBias;
      const twist = (normalizedY - .5) * fingerPressure * curl * 17;
      const compression = 1 - curl * (.018 + fingerPressure * .022);
      strip.style.transform = `rotateY(${angle}deg) rotateX(${twist}deg) translateZ(${lift}px) scaleX(${compression})`;
      strip.style.filter = `brightness(${1 - curl * (.12 + fingerPressure * .08)})`;
      strip.style.setProperty('--strip-curl', String(curl));
      strip.style.setProperty('--strip-pressure', String(fingerPressure * curl));
    });
  }

  function updatePageTurn(direction, progress, edgePosition = 50, foldY = 50) {
    const amount = Math.max(0, Math.min(1, progress));
    const edge = Math.max(0, Math.min(100, edgePosition));
    const foldYPercent = Math.max(0, Math.min(100, foldY));
    const curl = Math.sin(Math.PI * amount);
    turn.style.transform = 'none';
    updateBendMesh(direction, amount, edge, foldYPercent);
    turn.style.setProperty('--page-curl', String(.1 + curl * .9));
    turn.style.setProperty('--turn-shadow', `rgba(16,34,50,${(.12 + curl * .23).toFixed(3)})`);
    turn.style.setProperty('--curl-edge-position', `${edge}%`);
    turn.style.setProperty('--curl-fold-y', `${foldYPercent}%`);
  }

  function resetPageTurn(restoreCurrentPage = false) {
    if (restoreCurrentPage && movingCanvas) base.replaceChildren(leftCanvas, rightCanvas);
    turnFront.replaceChildren(frontCanvas);
    movingCanvas = null;
    turn.classList.remove('turn-next', 'turn-previous', 'is-dragging');
    turn.style.transform = '';
    turn.style.removeProperty('--page-curl');
    turn.style.removeProperty('--turn-shadow');
    turn.style.removeProperty('--curl-edge-position');
    turn.style.removeProperty('--curl-fold-y');
    bendStrips.forEach(({ strip }) => {
      strip.style.transform = '';
      strip.style.filter = '';
      strip.style.removeProperty('--strip-curl');
      strip.style.removeProperty('--strip-pressure');
    });
    turn.classList.remove('has-page-mesh');
  }

  function swapStagedSpread() {
    const oldLeft = leftCanvas;
    const oldRight = rightCanvas;
    leftCanvas = stagingLeft;
    rightCanvas = stagingRight;
    stagingLeft = oldLeft;
    stagingRight = oldRight;
    leftCanvas.className = 'pdf-book-canvas pdf-book-left-page';
    rightCanvas.className = 'pdf-book-canvas pdf-book-right-page';
    base.replaceChildren(leftCanvas, rightCanvas);
  }

  async function renderPage(pageNumber, canvas, sequence = renderSequence) {
    if (!pdfDocument) return;
    const page = await pdfDocument.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const stageRect = stage.getBoundingClientRect();
    const availableWidth = Math.max(112, (stageRect.width - 52) / pagesPerView());
    const availableHeight = Math.max(220, stageRect.height - 32);
    const fitScale = Math.min(availableWidth / baseViewport.width, availableHeight / baseViewport.height);
    const scale = Math.max(.2, fitScale * zoom);
    const viewport = page.getViewport({ scale });
    const pixelBudgetScale = Math.sqrt(8500000 / Math.max(1, viewport.width * viewport.height));
    const ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2.5, pixelBudgetScale));
    canvas.width = Math.ceil(viewport.width * ratio);
    canvas.height = Math.ceil(viewport.height * ratio);
    canvas.style.width = viewport.width + 'px';
    canvas.style.height = viewport.height + 'px';
    object.style.setProperty('--pdf-page-width', viewport.width + 'px');
    object.style.setProperty('--pdf-page-height', viewport.height + 'px');
    object.style.setProperty('--pdf-spread-width', viewport.width * pagesPerView() + 'px');
    turn.style.setProperty('--pdf-turn-page-width', viewport.width + 'px');
    const context = canvas.getContext('2d', { alpha: false });
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    await page.render({ canvasContext: context, viewport }).promise;
    if (sequence !== renderSequence) return;
  }

  async function renderSpread(startPage, sequence, leftTarget = leftCanvas, rightTarget = rightCanvas) {
    if (!pdfDocument) return;
    const leftPage = Math.max(1, Math.min(pdfDocument.numPages, Number(startPage) || 1));
    const rightPage = !mobileSinglePage && leftPage < pdfDocument.numPages ? leftPage + 1 : null;
    const draws = [renderPage(leftPage, leftTarget, sequence)];
    if (rightPage) draws.push(renderPage(rightPage, rightTarget, sequence));
    else {
      rightTarget.width = rightTarget.height = 0;
      rightTarget.style.width = rightTarget.style.height = '0px';
    }
    await Promise.all(draws);
    return { leftPage, rightPage };
  }

  async function displaySpread(pageNumber) {
    if (!pdfDocument) return;
    if (pageFlip) {
      const pageIndex = Math.max(0, Math.min(pageFlipSheetCount() - 1, pdfPageToSheetIndex(pageNumber)));
      const ready = await preparePageFlipView(pageIndex);
      if (!ready || !pageFlip) return;
      pageFlip.turnToPage(pageIndex);
      currentPage = sheetFirstPdfPage(pageIndex);
      setPageControls();
      schedulePageFlipCentering();
      void prefetchPageFlipWindow(pageIndex);
      return;
    }
    await buildPageFlip(pageNumber);
    return;
    /* Previous PDF canvas renderer retained below as the graceful fallback
       foundation if a future version needs it again. */
    renderSequence++;
    const sequence = renderSequence;
    currentPage = Math.max(1, Math.min(pdfDocument.numPages, Math.floor(Number(pageNumber) || 1)));
    await renderSpread(currentPage, sequence);
    if (sequence !== renderSequence) return;
    loading.hidden = true;
    setPageControls();
    prefetchNextSpread();
  }

  function prepareSpreadForTurn(startPage, sequence) {
    const backPage = startPage;
    return Promise.all([
      renderSpread(startPage, sequence, stagingLeft, stagingRight),
      renderPage(backPage, backCanvas, sequence)
    ]);
  }

  function prefetchNextSpread() {
    if (!pdfDocument || isTurning || prefetchInProgress) return;
    const target = spreadTarget(1);
    if (target <= currentPage || target > pdfDocument.numPages) return;
    const sequence = renderSequence;
    if (prefetchedSpreadStart === target && prefetchedSpreadSequence === sequence && prefetchedSpreadPromise) return;
    prefetchInProgress = true;
    prefetchedSpreadStart = target;
    prefetchedSpreadSequence = sequence;
    prefetchedSpreadPromise = prepareSpreadForTurn(target, sequence);
    prefetchedSpreadPromise.then(() => {
      if (sequence !== renderSequence && prefetchedSpreadSequence === sequence) prefetchedSpreadStart = null;
    }, () => {
      if (prefetchedSpreadSequence === sequence) prefetchedSpreadStart = null;
    }).finally(() => {
      prefetchInProgress = false;
      if (sequence !== renderSequence && !isTurning) prefetchNextSpread();
    });
  }

  async function animateSheet(direction, fromAngle, toAngle, onHalfway) {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reducedMotion ? 1 : 760;
    const start = Math.abs(fromAngle) / 180;
    const finish = Math.abs(toAngle) / 180;
    let startedAt = 0;
    let halfwayDone = !onHalfway || start >= .5 || finish < .5;
    let halfwayPromise = null;

    if (onHalfway && start >= .5) {
      halfwayDone = true;
      halfwayPromise = Promise.resolve().then(onHalfway);
      halfwayPromise.catch(() => {});
    }
    await new Promise((resolve, reject) => {
      const frame = timestamp => {
        if (!startedAt) startedAt = timestamp;
        const linear = Math.min(1, (timestamp - startedAt) / duration);
        const eased = linear < .5 ? 4 * linear ** 3 : 1 - ((-2 * linear + 2) ** 3) / 2;
        const progress = start + (finish - start) * eased;
        const edge = direction > 0 ? 100 * (1 - progress) : 100 * progress;
        updatePageTurn(direction, progress, edge, 50);
        if (!halfwayDone && progress >= .5) {
          halfwayDone = true;
          halfwayPromise = Promise.resolve().then(onHalfway);
          halfwayPromise.catch(reject);
        }
        if (linear >= 1) resolve();
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    if (halfwayPromise) await halfwayPromise;
  }

  function triggerNativePageFlip(direction) {
    if (!pageFlip) return false;
    const controller = pageFlip.getFlipController?.();
    const render = pageFlip.getRender?.();
    if (!controller?.flip || !render) return false;
    const bounds = render.getRect();
    const settings = pageFlip.getSettings();
    const clickGuard = settings.disableFlipByClick;
    // StPageFlip's public flipNext/flipPrev hard-code y=1. When the rendered
    // book is vertically centered, that point can sit above the page. Supply a
    // real visible corner and let the native controller run its normal curl.
    settings.disableFlipByClick = false;
    try {
      controller.flip({
        x: direction > 0 ? bounds.left + bounds.width - 10 : bounds.left + 10,
        y: bounds.top + 1
      });
    } finally {
      settings.disableFlipByClick = clickGuard;
    }
    return true;
  }
  async function turnPage(direction) {
    if (!pdfDocument || isTurning) return;
    if (pageFlip) {
      const index = pageFlip.getCurrentPageIndex();
      const targetIndex = pageFlipTargetIndex(index, direction);
      if (targetIndex < 0 || targetIndex >= pageFlipSheetCount() || targetIndex === index) return;
      const ready = await preparePageFlipView(targetIndex);
      if (!ready || !pageFlip || isTurning) return;
      triggerNativePageFlip(direction);
      return;
    }
    const targetPage = spreadTarget(direction);
    if (targetPage === currentPage || targetPage < 1 || targetPage > pdfDocument.numPages) return;
    isTurning = true;
    setPageControls();
    const oldPage = currentPage;
    const forward = direction > 0;
    const hasPrefetchedSpread = forward && prefetchedSpreadStart === targetPage && prefetchedSpreadSequence === renderSequence && prefetchedSpreadPromise;
    const sequence = hasPrefetchedSpread ? renderSequence : ++renderSequence;
    const turningCanvas = mobileSinglePage ? leftCanvas : (forward ? rightCanvas : leftCanvas);
    let swapped = false;
    const swapSpread = () => {
      if (swapped || sequence !== renderSequence) return;
      swapStagedSpread();
      swapped = true;
    };
    try {
      movingCanvas = turningCanvas;
      turnFront.replaceChildren(turningCanvas);
      prepareBendMesh(turningCanvas);
      const backPage = mobileSinglePage ? targetPage : (forward ? targetPage : Math.min(targetPage + 1, pdfDocument.numPages));
      const preparing = hasPrefetchedSpread ? prefetchedSpreadPromise : Promise.all([
        renderSpread(targetPage, sequence, stagingLeft, stagingRight),
        renderPage(backPage, backCanvas, sequence)
      ]);
      if (hasPrefetchedSpread) { prefetchedSpreadStart = null; prefetchedSpreadPromise = null; }
      turn.classList.remove('turn-next', 'turn-previous', 'is-dragging');
      void turn.offsetWidth;
      turn.classList.add(forward ? 'turn-next' : 'turn-previous');
      updatePageTurn(direction, 0, forward ? 100 : 0, 50);
      await animateSheet(direction, 0, forward ? -180 : 180, async () => {
        await preparing;
        prepareBendBack(backCanvas);
        swapSpread();
      });
      await preparing;
      prepareBendBack(backCanvas);
      swapSpread();
      if (sequence === renderSequence) currentPage = targetPage;
    } catch (error) {
      currentPage = oldPage;
      await displaySpread(oldPage);
    } finally {
      resetPageTurn(!swapped);
      isTurning = false;
      if (sequence === renderSequence) renderSequence++;
      setPageControls();
      prefetchNextSpread();
    }
  }

  function prepareGestureTurn(gesture) {
    if (gesture.prepare || !gesture.direction) return;
    const targetPage = spreadTarget(gesture.direction);
    if (targetPage < 1 || targetPage > pdfDocument.numPages) return;
    isTurning = true;
    setPageControls();
    gesture.targetPage = targetPage;
    gesture.hasPrefetchedSpread = gesture.direction > 0 && prefetchedSpreadStart === targetPage && prefetchedSpreadSequence === renderSequence && prefetchedSpreadPromise;
    const priorPrefetch = prefetchInProgress && prefetchedSpreadPromise ? prefetchedSpreadPromise.catch(() => {}) : Promise.resolve();
    gesture.sequence = gesture.hasPrefetchedSpread ? renderSequence : ++renderSequence;
    const turningCanvas = mobileSinglePage ? leftCanvas : (gesture.direction > 0 ? rightCanvas : leftCanvas);
    const backPage = mobileSinglePage ? targetPage : (gesture.direction > 0 ? targetPage : Math.min(targetPage + 1, pdfDocument.numPages));
    movingCanvas = turningCanvas;
    turnFront.replaceChildren(turningCanvas);
    prepareBendMesh(turningCanvas);
    gesture.ready = true;
    turn.classList.remove('turn-next', 'turn-previous');
    turn.classList.add(gesture.direction > 0 ? 'turn-next' : 'turn-previous', 'is-dragging');
    // Build the curved turn surface from the current PDF canvas before motion starts.
    updateGestureSheet(gesture);
    const preparePages = gesture.hasPrefetchedSpread
      ? prefetchedSpreadPromise
      : priorPrefetch.then(() => Promise.all([
        renderSpread(targetPage, gesture.sequence, stagingLeft, stagingRight),
        renderPage(backPage, backCanvas, gesture.sequence)
      ]));
    gesture.prepare = preparePages.then(() => {
      if (gesture.sequence !== renderSequence) return;
      prepareBendBack(backCanvas);
      updateGestureSheet(gesture);
    }).catch(() => { gesture.failed = true; });
  }

  function updateGestureSheet(gesture) {
    if (!gesture.ready) return;
    const curlEdge = gesture.curlEdgePosition ?? (gesture.direction > 0 ? 100 - gesture.progress * 100 : gesture.progress * 100);
    gesture.angle = (gesture.direction > 0 ? -1 : 1) * 180 * gesture.progress;
    updatePageTurn(gesture.direction, gesture.progress, curlEdge, gesture.curlFoldY ?? 50);
  }

  async function finishGestureTurn(gesture, commit) {
    if (!gesture.ready || gesture.failed) {
      resetPageTurn(true);
      isTurning = false;
      setPageControls();
      prefetchNextSpread();
      return;
    }
    let swapped = false;
    try {
      if (commit) {
        const swapSpread = async () => {
          if (swapped || gesture.sequence !== renderSequence) return;
          if (gesture.prepare) await gesture.prepare;
          if (gesture.failed) throw new Error('The next page could not be prepared');
          swapStagedSpread();
          swapped = true;
        };
        await animateSheet(gesture.direction, gesture.angle || 0, gesture.direction > 0 ? -180 : 180, swapSpread);
        swapSpread();
        if (gesture.sequence === renderSequence) currentPage = gesture.targetPage;
      } else {
        await animateSheet(gesture.direction, gesture.angle || 0, 0);
      }
    } catch (error) {
      if (commit) await displaySpread(currentPage);
    } finally {
      resetPageTurn(!swapped);
      isTurning = false;
      if (gesture.sequence === renderSequence && (commit || !gesture.hasPrefetchedSpread)) renderSequence++;
      if (commit) { prefetchedSpreadStart = null; prefetchedSpreadPromise = null; }
      setPageControls();
      prefetchNextSpread();
    }
  }

  async function openBook(resource) {
    const request = ++openSequence;
    renderSequence++;
    pageFlipBuildSequence++;
    releasePageFlip();
    pdfViewer.classList.remove('pdf-book-pageflip-active');
    pageGesture = null;
    isTurning = false;
    resetPageTurn(true);
    object.style.removeProperty('--book-tilt-y');
    object.style.removeProperty('--book-tilt-x');
    stage.style.removeProperty('--book-light-x');
    stage.style.removeProperty('--book-light-y');
    currentResource = resource;
    pdfDocument?.destroy?.();
    pdfViewer.classList.add('pdf-book-mode');
    toolbar.hidden = false;
    reader.hidden = false;
    message.hidden = true;
    frame.hidden = true;
    loading.hidden = false;
    loading.textContent = 'Preparing your book…';
    pdfDocument = null;
    currentPage = 1;
    zoom = 1;
    zoomValue.textContent = '100%';
    setPageControls();
    try {
      const pdfjs = await loadPdfLibrary();
      if (request !== openSequence) return;
      pdfjs.GlobalWorkerOptions.workerSrc = `js/vendor/pdf.worker.min.js`;
      if (resource?.pdfDataScript) {
        loading.textContent = 'Loading book pages…';
        if (!embeddedPdfBytes) {
          const encodedPdf = await loadEmbeddedPdf(resource.pdfDataScript);
          if (request !== openSequence) return;
          embeddedPdfBytes = decodePdfData(encodedPdf);
          embeddedPdfPromise = null;
        }
        const loadedDocument = await pdfjs.getDocument({ data: embeddedPdfBytes.slice() }).promise;
        if (request !== openSequence) { loadedDocument.destroy?.(); return; }
        pdfDocument = loadedDocument;
      } else {
        const source = pdfSource(resource);
        if (!source) throw new Error('No PDF source is available');
        const loadedDocument = await pdfjs.getDocument({ url: source, withCredentials: false }).promise;
        if (request !== openSequence) { loadedDocument.destroy?.(); return; }
        pdfDocument = loadedDocument;
      }
      loading.textContent = 'Preparing your book…';
      await displaySpread(1);
    } catch (error) {
      if (request !== openSequence) return;
      console.error('PDF reader startup failed; switching to the built-in PDF view:', error);
      pdfDocument?.destroy?.();
      pdfDocument = null;
      toolbar.hidden = true;
      reader.hidden = true;
      releasePageFlip();
      frame.hidden = false;
      frame.src = resource?.driveUrl || resource?.pdfUrl || 'about:blank';
      message.hidden = false;
      pdfViewer.classList.remove('pdf-book-mode');
      pdfViewer.classList.remove('pdf-book-pageflip-active');
      setPageControls();
    }
  }

  previous.addEventListener('click', () => turnPage(-1));
  next.addEventListener('click', () => turnPage(1));
  reader.addEventListener('pointerdown', event => {
    if (pageFlip) return;
    if (!pdfDocument || isTurning || event.button > 0 || !event.target.closest('.pdf-book-stage')) return;
    pageGesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      startTime: event.timeStamp,
      direction: 0,
      progress: 0,
      width: Math.max(1, object.getBoundingClientRect().width / pagesPerView()),
      active: false,
      ready: false
    };
    try { reader.setPointerCapture(event.pointerId); } catch {}
  });
  reader.addEventListener('pointermove', event => {
    if (pageFlip) return;
    const gesture = pageGesture;
    if (!gesture || event.pointerId !== gesture.pointerId || !pdfDocument) return;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (!gesture.direction) {
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 8) return;
      if (Math.abs(deltaX) < Math.abs(deltaY) * 1.12) return;
      gesture.direction = deltaX < 0 ? 1 : -1;
      const targetPage = spreadTarget(gesture.direction);
      if (targetPage === currentPage || targetPage > pdfDocument.numPages) {
        pageGesture = null;
        try { reader.releasePointerCapture(event.pointerId); } catch {}
        return;
      }
      gesture.active = true;
      prepareGestureTurn(gesture);
    }
    if (gesture.active) {
      event.preventDefault();
      gesture.lastX = event.clientX;
      gesture.progress = Math.min(1, Math.abs(deltaX) / Math.max(120, gesture.width * .86));
      const bounds = object.getBoundingClientRect();
      const pageLeft = mobileSinglePage || gesture.direction < 0 ? bounds.left : bounds.left + bounds.width / 2;
      const pageWidth = Math.max(1, bounds.width / pagesPerView());
      gesture.curlEdgePosition = Math.max(0, Math.min(100, (event.clientX - pageLeft) / pageWidth * 100));
      gesture.curlFoldY = Math.max(0, Math.min(100, (event.clientY - bounds.top) / Math.max(1, bounds.height) * 100));
      updateGestureSheet(gesture);
    }
  });
  reader.addEventListener('pointerup', event => {
    const gesture = pageGesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    pageGesture = null;
    try { reader.releasePointerCapture(event.pointerId); } catch {}
    if (!gesture.active) return;
    suppressPageTapUntil = Date.now() + 500;
    const elapsed = Math.max(1, event.timeStamp - gesture.startTime);
    const distance = Math.abs(event.clientX - gesture.startX);
    const fastFlick = distance / elapsed > .55 && distance > 34;
    finishGestureTurn(gesture, gesture.progress >= .27 || fastFlick);
  });
  reader.addEventListener('pointercancel', event => {
    const gesture = pageGesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    pageGesture = null;
    if (gesture.active) finishGestureTurn(gesture, false);
  });
  reader.addEventListener('click', event => {
    if (pageFlip) return;
    if (!pdfDocument || isTurning || Date.now() < suppressPageTapUntil || event.detail === 0) return;
    if (event.target.closest('.pdf-book-toolbar')) return;
    const bounds = object.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    if (x < 0 || x > bounds.width || y < 0 || y > bounds.height) return;
    const edge = bounds.width * .2;
    if (x <= edge) turnPage(-1);
    else if (x >= bounds.width - edge) turnPage(1);
  });
  pageInput.addEventListener('change', () => {
    const target = Math.max(1, Math.min(pdfDocument?.numPages || 1, Math.floor(Number(pageInput.value) || 1)));
    pageInput.value = String(target);
    void displaySpread(target).catch(() => {});
  });
  pageInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      const target = Math.max(1, Math.min(pdfDocument?.numPages || 1, Math.floor(Number(pageInput.value) || 1)));
      pageInput.value = String(target);
      void displaySpread(target).catch(() => {});
      reader.focus({ preventScroll: true });
    }
  });
  zoomIn.addEventListener('click', async () => {
    if (!pdfDocument) return;
    zoom = Math.min(2.5, +(zoom + .15).toFixed(2));
    zoomValue.textContent = Math.round(zoom * 100) + '%';
    await buildPageFlip(currentPage).catch(() => {});
  });
  zoomOut.addEventListener('click', async () => {
    if (!pdfDocument) return;
    zoom = Math.max(.6, +(zoom - .15).toFixed(2));
    zoomValue.textContent = Math.round(zoom * 100) + '%';
    await buildPageFlip(currentPage).catch(() => {});
  });
  fit.addEventListener('click', async () => {
    if (!pdfDocument) return;
    zoom = 1;
    zoomValue.textContent = '100%';
    await buildPageFlip(currentPage).catch(() => {});
  });

  document.addEventListener('keydown', event => {
    if (!pdfViewer.classList.contains('open') || !pdfDocument || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target.closest('input,textarea,select,button,[contenteditable="true"]')) return;
    if (event.key === 'ArrowRight' || event.key === 'PageDown') {
      event.preventDefault();
      turnPage(1);
    } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      turnPage(-1);
    }
  });

  const resizeObserver = new ResizeObserver(() => {
    if (pageFlip && !isTurning) updatePageFlipLayout();
    else if (pdfDocument && !isTurning) void displaySpread(currentPage).catch(() => {});
  });
  resizeObserver.observe(stage);
  mobileBookQuery.addEventListener('change', () => {
    mobileSinglePage = isNarrowReader();
    reader.classList.toggle('pdf-book-single-page', mobileSinglePage);
    if (pageFlip && !isTurning) updatePageFlipLayout();
    else if (pdfDocument && !isTurning) void displaySpread(currentPage).catch(() => {});
  });

  window.openVishPdfBook = openBook;
  window.vishHubPdfTransitionPages = () => ({
    currentPage,
    pageWidth: pageFlipPageWidth,
    pageHeight: pageFlipPageHeight,
    pageAspectRatio,
    pages: pageFlipNodes.map(node => ({ pageIndex: Number(node.dataset.pageIndex), image: node.querySelector('img'), element: node }))
  });
  window.vishHubClosePagesForTransition = () => {
    if (!pdfDocument || !pageFlip) return null;
    pageFlipCenteringLocked = true;
    // Collapse deeper interior spreads to the first inside spread. Keep the
    // PDF cover sheet out of the visible reverse motion; it is restored only
    // after the Reader has faded away.
    let finish;
    const done = new Promise(resolve => { finish = resolve; });
    const start = () => {
      if (pageFlip && pageFlip.getCurrentPageIndex() > 1) pageFlip.turnToPage(1);
      requestAnimationFrame(() => requestAnimationFrame(() => finish(Boolean(pageFlip))));
    };
    return {
      done,
      start,
      restore() {}
    };
  };
  window.vishHubFinishPagesCloseTransition = () => {
    if (!pdfDocument || !pageFlip) return false;
    if (pageFlip.getCurrentPageIndex() !== 0) pageFlip.turnToPage(0);
    currentPage = 1;
    setPageControls();
    return pageFlip.getCurrentPageIndex() === 0;
  };
  window.vishHubReleasePageFlipCentering = () => { pageFlipCenteringLocked = false; };
  window.vishHubResetCoverForTransition = async () => {
    if (!pdfDocument || !pageFlip) return false;
    if (!await preparePageFlipView(0) || !pageFlip || !pdfDocument) return false;
    if (pageFlip.getCurrentPageIndex() !== 0) pageFlip.turnToPage(0);
    currentPage = 1;
    setPageControls();
    schedulePageFlipCentering();
    return true;
  };
  window.vishHubPrepareInteriorPageForCover = async () => {
    if (!pdfDocument || !pageFlip) return false;
    if (pdfDocument.numPages < 2) return true;
    const nextIndex = 1;
    const ready = await preparePageFlipView(nextIndex);
    if (!ready || !pageFlip || !pdfDocument) return false;
    // Decode the next sheet before the handoff, but leave the real cover on
    // top. The transition explicitly triggers StPageFlip's native curl.
    if (pageFlip.getCurrentPageIndex() !== 0) pageFlip.turnToPage(0);
    currentPage = 1;
    setPageControls();
    return true;
  };
  window.vishHubFlipCoverForTransition = () => {
    if (!pageFlip || !pdfDocument || pdfDocument.numPages < 2 || pageFlip.getCurrentPageIndex() !== 0) return false;
    return new Promise(resolve => {
      const startedAt = performance.now();
      let sawTurnStart = false;
      const inspectTurn = () => {
        if (!pageFlip || !pdfDocument || performance.now() - startedAt > 1800) {
          resolve(false);
          return;
        }
        sawTurnStart ||= isTurning;
        if (sawTurnStart && !isTurning && pageFlip.getCurrentPageIndex() >= 1) {
          resolve(true);
          return;
        }
        requestAnimationFrame(inspectTurn);
      };
      if (!triggerNativePageFlip(1)) { resolve(false); return; }
      requestAnimationFrame(inspectTurn);
    });
  };
  window.vishHubShowInteriorAfterCover = () => {
    if (!pageFlip || !pdfDocument || pdfDocument.numPages < 2) return false;
    if (pageFlip.getCurrentPageIndex() === 0) pageFlip.turnToPage(1);
    currentPage = 2;
    setPageControls();
    schedulePageFlipCentering();
    return true;
  };
  window.closeVishPdfBook = () => {
    openSequence++;
    renderSequence++;
    pageFlipBuildSequence++;
    releasePageFlip();
    pdfDocument?.destroy?.();
    pdfDocument = null;
    currentResource = null;
    isTurning = false;
    pageGesture = null;
    resetPageTurn(true);
    object.style.removeProperty('--book-tilt-y');
    object.style.removeProperty('--book-tilt-x');
    stage.style.removeProperty('--book-light-x');
    stage.style.removeProperty('--book-light-y');
    toolbar.hidden = true;
    reader.hidden = true;
    message.hidden = true;
    frame.hidden = false;
    pdfViewer.classList.remove('pdf-book-mode');
    pdfViewer.classList.remove('pdf-book-pageflip-active');
  };
})();
