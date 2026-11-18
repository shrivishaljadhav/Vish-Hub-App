(function(){
  const toggle=document.getElementById('headerSearchToggle');
  const popup=document.getElementById('headerSearchPopup');
  const field=document.getElementById('search');
  const submit=document.getElementById('searchSubmit');
  const quickMenu=document.getElementById('headerMenu');
  const notificationPopup=document.getElementById('notificationPopup');
  const bell=document.getElementById('bell');
  if(!toggle||!popup||!field)return;
  function closeSearch(restoreFocus=false){
    popup.hidden=true;
    toggle.setAttribute('aria-expanded','false');
    toggle.setAttribute('aria-label','Open search');
    if(restoreFocus)toggle.focus();
  }
  function openSearch(){
    if(quickMenu)quickMenu.hidden=true;
    if(notificationPopup)notificationPopup.hidden=true;
    bell?.setAttribute('aria-expanded','false');
    popup.hidden=false;
    toggle.setAttribute('aria-expanded','true');
    toggle.setAttribute('aria-label','Close search');
    requestAnimationFrame(()=>field.focus());
  }
  toggle.addEventListener('click',()=>popup.hidden?openSearch():closeSearch());
  document.addEventListener('click',event=>{
    if(!popup.hidden&&!popup.contains(event.target)&&!toggle.contains(event.target))closeSearch();
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!popup.hidden)closeSearch(true);
    if(event.key==='Enter'&&event.target===field)closeSearch();
  });
  submit?.addEventListener('click',()=>closeSearch());
})();
