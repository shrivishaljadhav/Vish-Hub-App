
(() => {
  const root=document.getElementById('noticeCarousel');
  if(!root) return;
  const notices=[
    {category:'EXAM FORM',title:'Fill out your exam form',message:'Open the examination portal to complete your exam form.',action:'Fill exam form',url:'https://mywadia.edupluscampus.com/Examination'},
    {category:'FYBA ACADEMIC HUB',title:'Join FYBA Academic Hub on WhatsApp',message:'Connect with the FYBA Academic Hub community on WhatsApp.',action:'Join WhatsApp',url:'https://chat.whatsapp.com/FDjoKfz1Y39IO1Dl9lybEe'},
    {category:'FYBA ACADEMIC HUB',title:'Join FYBA Academic Hub on Telegram',message:'Join the FYBA Academic Hub community on Telegram.',action:'Join Telegram',url:'https://t.me/+vthsjCLayyhkYjE1'},
    {category:'SCHOLARSHIP FORM',title:'Apply For MahaDBT Scholarship',message:'Check Eligible Schemes And Submit Your Scholarship Application On The MahaDBT 2.0 Portal.',action:'View Details',target:'scholarshipDetails'},
  ];
  let active=0,timer;
  const category=document.getElementById('noticeCategory'),title=document.getElementById('noticeTitle'),message=document.getElementById('noticeMessage'),position=document.getElementById('noticePosition'),action=document.getElementById('noticeAction');
  let swapTimer,turnTimer;function renderNotice(){const n=notices[active];category.textContent=n.category;title.textContent=n.title;message.textContent=n.message;action.firstChild.textContent=n.action;action.dataset.noticeTarget=n.target||'';position.textContent=String(active+1).padStart(2,'0')+' / '+String(notices.length).padStart(2,'0');position.setAttribute('aria-label','Notice '+(active+1)+' of '+notices.length)}function showNotice(index,turn=true){active=(index+notices.length)%notices.length;clearTimeout(swapTimer);clearTimeout(turnTimer);if(!turn){renderNotice();return}action.disabled=true;root.classList.remove('notice-turn-in','notice-turn-out');void root.offsetWidth;root.classList.add('notice-turn-out');swapTimer=setTimeout(()=>{renderNotice();root.classList.remove('notice-turn-out');root.classList.add('notice-turn-in')},180);turnTimer=setTimeout(()=>{root.classList.remove('notice-turn-in');action.disabled=false},420)}
  function stop(){clearInterval(timer);timer=undefined}
  function start(force=false){stop();if(!document.hidden&&!root.classList.contains('notice-expanded')&&(force||!root.matches(':focus-within')))timer=setInterval(()=>showNotice(active+1),8000)}
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('#noticeAction');
    if(!button||notices[active].target!=='scholarshipDetails')return;
    event.preventDefault();
    event.stopImmediatePropagation();
    stop();
    if(window.openScholarshipDetails)window.openScholarshipDetails();
    else location.hash='#/scholarship';
  },true);
  document.getElementById('noticePrev').addEventListener('click',()=>{showNotice(active-1);start(true)});
  document.getElementById('noticeNext').addEventListener('click',()=>{showNotice(active+1);start(true)});
   function toggleFullNotice(){const expanded=!root.classList.contains('notice-expanded');root.classList.toggle('notice-expanded',expanded);root.setAttribute('aria-expanded',String(expanded));root.querySelector('.notice-auto').textContent=expanded?'Tap to Minimize':'Tap to View';if(expanded)stop();else start(true)}
   root.addEventListener('click',event=>{if(event.target.closest('button'))return;toggleFullNotice()});
   root.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&event.target===root){event.preventDefault();toggleFullNotice()}});
  action.addEventListener('click',()=>{const notice=notices[active];if(action.dataset.noticeTarget==='scholarshipDetails'&&window.openScholarshipDetails){stop();window.openScholarshipDetails();return}if(notice.url){window.open(notice.url,'_blank','noopener,noreferrer');return}const target=notice.target;const node=document.getElementById(target==='subjects'?'grid':'studyToolsTitle');if(node)node.scrollIntoView({behavior:'smooth',block:'center'})});
  root.addEventListener('focusin',stop);
  root.addEventListener('focusout',event=>{if(!root.contains(event.relatedTarget))start()});
  document.addEventListener('visibilitychange',()=>document.hidden?stop():start());
  document.addEventListener('vishhub-scholarship-closed',()=>start(true));showNotice(0,false);start();
})();
