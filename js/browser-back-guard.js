
/* Let the phone back button dismiss in-app panels before leaving the page. */
(function () {
  try { history.pushState({ vishHubBackGuard: true }, ''); } catch (error) { return; }
  window.addEventListener('popstate', function () {
    if(window.__vishHubRoutePopHandled){window.__vishHubRoutePopHandled=false;return}
    const dismiss = [
      ['#pdfViewer.open', '#closePdfViewer'],
      ['#notificationPage.open', '#closeNotifications'],
      ['#studentProfilePage.open', '#closeProfilePage'],
      ['#sheet.open', '#closeSheet'],
      ['#modePickerScrim:not([hidden])', '#closeModePicker'],
      ['#headerMenu:not([hidden])', '#menuToggle']
    ];
    const openPanel = dismiss.find(function (entry) { return document.querySelector(entry[0]); });
    if (openPanel) {
      const closeButton = document.querySelector(openPanel[1]);
      if (closeButton) closeButton.click();
      history.pushState({ vishHubBackGuard: true }, '');
      return;
    }
    if (window.scrollY > 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      history.pushState({ vishHubBackGuard: true }, '');
    }
  });
})();
