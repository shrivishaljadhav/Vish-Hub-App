(()=>{
  const page=document.getElementById('scholarshipDetailsPage');
  if(!page)return;
  const panel=page.querySelector('.scholarship-detail-panel');
  const close=document.getElementById('scholarshipDetailsClose');
  const noticeAction=document.getElementById('noticeAction');
  const noticeCategory=document.getElementById('noticeCategory');
  let priorFocus=null,hideTimer=0;

  page.querySelectorAll('.scholarship-guide-section').forEach(section=>{
    const number=section.querySelector(':scope > .scholarship-guide-number');
    const heading=section.querySelector(':scope > h3');
    const details=document.createElement('details');
    details.className=section.className+' scholarship-guide-dropdown';
    details.id=section.id;
    const summary=document.createElement('summary');
    const label=document.createElement('span');
    const title=document.createElement('strong');
    const chevron=document.createElement('span');
    const body=document.createElement('div');
    label.className='scholarship-guide-number';
    label.textContent=number?.textContent.trim()||'GUIDE SECTION';
    title.textContent=heading?.textContent.trim()||label.textContent.replace(/^\d+\s*[·:-]\s*/,'').trim();
    const headingWrap=document.createElement('span');
    headingWrap.className='scholarship-dropdown-heading';
    headingWrap.append(label,title);
    chevron.className='scholarship-dropdown-chevron';
    chevron.setAttribute('aria-hidden','true');
    summary.append(headingWrap,chevron);
    body.className='scholarship-guide-dropdown-content';
    Array.from(section.childNodes).forEach(node=>{if(node!==number&&node!==heading)body.append(node)});
    details.append(summary,body);
    section.replaceWith(details);
  });

  // Build a clean page frame with a short application roadmap and one focused
  // chapter list. Keep the original section IDs so quick navigation still works.
  const guideMain=document.createElement('main');
  guideMain.className='scholarship-guide-main';
  guideMain.id='scholarshipGuideMain';
  const guideHero=page.querySelector('.scholarship-detail-hero');
  const guideNav=page.querySelector('.scholarship-guide-toc');
  const guideSections=[...page.querySelectorAll('.scholarship-guide-dropdown')];
  if(guideHero)guideMain.append(guideHero);
  const roadmap=document.createElement('ol');
  roadmap.className='scholarship-roadmap';
  roadmap.setAttribute('aria-label','Scholarship application roadmap');
  [['01','Explore','Check schemes and eligibility'],['02','Prepare','Gather documents'],['03','Apply','Complete and submit'],['04','Track','Follow status and payment']].forEach(([number,title,description])=>{
    const item=document.createElement('li');
    item.innerHTML=`<span>${number}</span><div><strong>${title}</strong><small>${description}</small></div>`;
    roadmap.append(item);
  });
  guideMain.append(roadmap);
  if(guideNav)guideMain.append(guideNav);
  const chapterList=document.createElement('section');
  chapterList.className='scholarship-chapter-list';
  chapterList.setAttribute('aria-label','Scholarship application guide chapters');
  const chapterHeading=document.createElement('header');
  chapterHeading.className='scholarship-chapters-heading';
  chapterHeading.innerHTML=`<div><span>YOUR APPLICATION GUIDE</span><h3>Scholarship steps</h3></div><small>${guideSections.length} chapters</small>`;
  chapterList.append(chapterHeading);
  guideSections.forEach((details,index)=>{
    details.open=index===0;
    chapterList.append(details);
  });
  guideMain.append(chapterList);
  panel.append(guideMain);

  function showPage(pushRoute=true){
    clearTimeout(hideTimer);
    if(!page.hidden&&page.classList.contains('open'))return;
    priorFocus=document.activeElement;
    if(pushRoute&&!window.__vishHubSilentRoute&&location.hash!=='#/scholarship'){
      try{history.pushState({appPage:'scholarship'},'',location.pathname+location.search+'#/scholarship')}catch{}
    }
    const library=document.getElementById('booksPage');
    if(library){library.hidden=true;library.classList.remove('open')}
    document.body.classList.remove('book-library-active');
    page.hidden=false;
    page.classList.add('open');
    document.body.classList.add('scholarship-details-open','app-page-open');
    document.body.style.overflow='hidden';
    const guideScroll=page.querySelector('#scholarshipGuideMain');
    if(guideScroll)guideScroll.scrollTop=0;
    const chapters=[...page.querySelectorAll('.scholarship-guide-dropdown')];
    chapters.forEach((chapter,index)=>{chapter.open=index===0;chapter.querySelectorAll('details').forEach(nested=>{nested.open=false})});
    requestAnimationFrame(()=>panel.focus({preventScroll:true}));
  }
  function hidePage(){
    if(page.hidden)return;
    page.classList.remove('open');
    document.body.classList.remove('scholarship-details-open','app-page-open');
    document.body.style.overflow='';
    hideTimer=setTimeout(()=>{
      page.hidden=true;
      (priorFocus||noticeAction)?.focus?.({preventScroll:true});
      document.dispatchEvent(new Event('vishhub-scholarship-closed'));
    },230);
  }
  function closePage(){
    if(page.hidden)return;
    if(location.hash==='#/scholarship'&&history.state?.appPage==='scholarship'){
      history.back();
      return;
    }
    if(location.hash==='#/scholarship'){
      try{history.replaceState(null,'',location.pathname+location.search)}catch{}
    }
    hidePage();
  }
  window.openScholarshipDetails=()=>showPage(true);
  document.addEventListener('click',event=>{
    const card=event.target.closest?.('#openScholarshipHome');
    if(!card)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.openScholarshipDetails();
  },true);
  // The notice CTA shares the homepage with cards that open the Resource Library.
  // Claim the Scholarship CTA during capture so delegated/card click handlers
  // cannot redirect it to the library.
  document.addEventListener('click',event=>{
    const action=event.target.closest?.('#noticeAction');
    if(!action||action.dataset.noticeTarget!=='scholarshipDetails'||noticeCategory?.textContent.trim()!=='SCHOLARSHIP FORM')return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.openScholarshipDetails();
  },true);
  close.addEventListener('click',closePage);
  window.addEventListener('popstate',()=>{
    if(location.hash==='#/scholarship')showPage(false);
    else hidePage();
  });
  const openInitialRoute=()=>{if(location.hash==='#/scholarship')showPage(false)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',openInitialRoute,{once:true});
  else openInitialRoute();

  const guideLinks=[...page.querySelectorAll('[data-guide-target]')];
  function setGuideActive(id){
    guideLinks.forEach(link=>{
      const active=link.dataset.guideTarget===id;
      link.classList.toggle('active',active);
      if(active)link.setAttribute('aria-current','location');
      else link.removeAttribute('aria-current');
    });
  }
  page.addEventListener('click',event=>{
    const link=event.target.closest('[data-guide-target]');
    if(link){
      event.preventDefault();
      const target=document.getElementById(link.dataset.guideTarget);
      if(target){
        setGuideActive(target.id);
        if(target.tagName==='DETAILS')target.open=true;
        target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
      }
    }
    if(event.target===page)closePage();
  });
  if('IntersectionObserver'in window){
    const sectionObserver=new IntersectionObserver(entries=>{
      const visible=entries.filter(entry=>entry.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
      if(visible&&guideLinks.some(link=>link.dataset.guideTarget===visible.target.id))setGuideActive(visible.target.id);
    },{root:guideMain,rootMargin:'-18% 0px -68% 0px',threshold:[0,.15,.35]});
    page.querySelectorAll('.scholarship-guide-dropdown').forEach(section=>sectionObserver.observe(section));
  }
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!page.hidden)closePage()});
})();

