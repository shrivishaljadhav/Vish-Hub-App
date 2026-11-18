
(function(){
  const exams=[
    {category:'Common',subject:'IKS',paper:'Indian Knowledge System',code:'IKS-T',date:'2026-11-20',time:'10:30 a.m. – 1:00 p.m.'},
    {category:'Common',subject:'VEC · Environmental Education',paper:'Environmental Education (VEC)',code:'VEC-I-T',date:'2026-11-21',time:'10:30 a.m. – 1:00 p.m.'},
    {category:'Common',subject:'AEC · English Communication',paper:'Communication Skills in English – I (AEC)',code:'AEC-I-T',date:'2026-11-23',time:'10:30 a.m. – 1:00 p.m.'},
    {category:'Major',subject:'Psychology · Major 1',paper:'Fundamentals of Psychology',code:'NPSYMJ111-T',date:'2026-11-25',time:'10:30 a.m. – 12:00 p.m.'},
    {category:'Major',subject:'History · Major 1',paper:'Contemporary World History – Part I',code:'NHISMJ111-T',date:'2026-11-26',time:'10:30 a.m. – 12:00 p.m.'},
    {category:'Major',subject:'Philosophy · Major 1',paper:'Introduction to Philosophy – I',code:'NPHLMJ111-T',date:'2026-11-27',time:'10:30 a.m. – 12:00 p.m.'},
    {category:'Major',subject:'Mathematics · Major 1',paper:'Algebra',code:'NMTAMJ111-T',date:'2026-11-27',time:'10:30 a.m. – 12:00 p.m.'},
    {category:'Major',subject:'French · Major 1',paper:'Basic Course in French – I',code:'NFRNMJ111-T',date:'2026-11-27',time:'10:30 a.m. – 12:00 p.m.'},
    {category:'Major',subject:'Defence Studies · Major 1',paper:'Defence Organisation of India',code:'NDEFMJ111-T',date:'2026-11-27',time:'10:30 a.m. – 12:00 p.m.'},
    {category:'Major',subject:'Hindi · Major 1',paper:'Samnye Hindi – I',code:'NHINMJ111-T',date:'2026-11-27',time:'10:30 a.m. – 12:00 p.m.'},
    {category:'Major',subject:'Logic · Major 1',paper:'Traditional Logic',code:'NLOGMJ111-T',date:'2026-11-27',time:'10:30 a.m. – 12:00 p.m.'},
    {category:'Major',subject:'Economics · Major 1',paper:'Indian Economy: Agriculture and Industry',code:'NECOMJ111-T',date:'2026-11-28',time:'10:30 a.m. – 12:00 p.m.'},
    {category:'Major',subject:'Geography · Major 1',paper:'Introduction to Physical Geography',code:'NGEOMJ111-T',date:'2026-11-30',time:'10:30 a.m. – 12:00 p.m.'},
    {category:'Major',subject:'Political Science · Major 1',paper:'Introduction to Indian Constitution – I',code:'NPOLMJ111-T',date:'2026-12-01',time:'10:30 a.m. – 12:00 p.m.'},
    {category:'Major',subject:'English · Major 1',paper:'Introduction to English Literature',code:'NENGMJ111-T',date:'2026-12-02',time:'10:30 a.m. – 12:00 p.m.'},
    {category:'Major',subject:'Marathi · Major 1',paper:'Sahityache Swarup (Nivedanatmak Sahityaprakaar)',code:'NMARMJ111-T',date:'2026-12-03',time:'10:30 a.m. – 12:00 p.m.'},
    {category:'Major',subject:'Economics · Major 2',paper:'Public Finance – I',code:'NECOMJ112-T',date:'2026-12-05',time:'10:30 a.m. – 12:00 p.m.'},
    {category:'Major',subject:'Psychology · Major 2',paper:'Foundations of Psychology',code:'NPSYMJ112-T',date:'2026-12-07',time:'10:30 a.m. – 12:00 p.m.'},
    {category:'Major',subject:'Political Science · Major 2',paper:'Introduction to Indian Constitution – II',code:'NPOLMJ112-T',date:'2026-12-08',time:'10:30 a.m. – 12:00 p.m.'},
    {category:'Major',subject:'History · Major 2',paper:'Cultural History of India',code:'NHISMJ112-T',date:'2026-12-09',time:'10:30 a.m. – 12:00 p.m.'},
    {category:'Major',subject:'English · Major 2',paper:'Appreciating Short Story',code:'NENGMJ112-T',date:'2026-12-10',time:'10:30 a.m. – 12:00 p.m.'},
    {category:'SEC',subject:'Psychology · SEC',paper:'Health Promoting Behaviours',code:'NPSYSEC113-T',date:'2026-12-11',time:'10:30 a.m. – 12:00 p.m.'},
    {category:'SEC',subject:'History · SEC',paper:'Heritage Management – I',code:'NHISSEC113-T',date:'2026-12-11',time:'10:30 a.m. – 12:00 p.m.'},
    {category:'SEC',subject:'Political Science · SEC',paper:'Citizenship and Governance',code:'NPOLSEC113-T',date:'2026-12-11',time:'10:30 a.m. – 12:00 p.m.'},
    {category:'SEC',subject:'English · SEC',paper:'Soft Skills – I',code:'NENGSEC113-T',date:'2026-12-11',time:'10:30 a.m. – 12:00 p.m.'},
    {category:'SEC',subject:'Defence Studies · SEC',paper:'Defence Journalism',code:'NDEFSEC113-T',date:'2026-12-11',time:'10:30 a.m. – 12:00 p.m.'},
    {category:'OE',subject:'Zoology · Open Elective',paper:'Food Nutrition and Health',code:'NZOOE114-T',date:'2026-12-12',time:'10:30 a.m. – 12:00 p.m.'},
    {category:'OE',subject:'Geology · Open Elective',paper:'Industrial Minerals',code:'NGLOE114-T',date:'2026-12-12',time:'10:30 a.m. – 12:00 p.m.'},
    {category:'OE',subject:'Physics · Open Elective',paper:'Physics in Daily Life',code:'NPHOE114-T',date:'2026-12-12',time:'10:30 a.m. – 12:00 p.m.'},
    {category:'OE',subject:'Botany · Open Elective',paper:'Landscaping and Gardening',code:'NBOOE114-T',date:'2026-12-12',time:'10:30 a.m. – 12:00 p.m.'},
    {category:'OE',subject:'Chemistry · Open Elective',paper:'Kitchen and Daily Life Chemistry',code:'NCHOE114-T',date:'2026-12-12',time:'10:30 a.m. – 12:00 p.m.'},
    {category:'OE',subject:'Mathematics · Open Elective',paper:'Analytical Ability I',code:'NMTOE114-T',date:'2026-12-12',time:'10:30 a.m. – 12:00 p.m.'},
    {category:'OE',subject:'Electronics · Open Elective',paper:'Domestic Equipment Maintenance',code:'NEOE114-T',date:'2026-12-12',time:'10:30 a.m. – 12:00 p.m.'},
    {category:'OE',subject:'Geography · Open Elective',paper:'Basic Concepts in Geography – I',code:'NGGOE114-T',date:'2026-12-12',time:'10:30 a.m. – 12:00 p.m.'},
    {category:'OE',subject:'Computer Science · Open Elective',paper:'Computer Literacy',code:'NCSOE114-T',date:'2026-12-12',time:'10:30 a.m. – 12:00 p.m.'}
  ];
  const byDate=(a,b)=>a.date.localeCompare(b.date)||a.subject.localeCompare(b.subject);
  exams.sort(byDate);
  const loungeCategoryLabels={Major:{id:'major',label:'Major Subjects'},Common:{id:'common',label:'Common Subjects'},SEC:{id:'sec',label:'SEC Subjects'},OE:{id:'oe',label:'OE Subjects'}};
  const loungeGroups=new Map();
  exams.forEach(exam=>{const category=loungeCategoryLabels[exam.category];if(!category)return;const parts=String(exam.subject||'').split(' · ');const name=exam.category==='Common'&&parts.length>1?parts.slice(1).join(' · '):parts[0];const code=exam.category==='Common'&&parts.length>1?parts[0]:'';const key=category.id+':'+name.toLowerCase();if(!loungeGroups.has(category.id))loungeGroups.set(category.id,{...category,subjects:new Map()});const subjects=loungeGroups.get(category.id).subjects;if(!subjects.has(key))subjects.set(key,{id:category.id+'-'+name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''),name,code,category:category.id,courses:[]});subjects.get(key).courses.push({title:exam.paper,code:exam.code,date:exam.date,time:exam.time})});
  window.VishHubTimetableData={semesters:[{id:'fyba-semester-1',name:'FYBA Semester 1',categories:[...loungeGroups.values()].map(category=>({...category,subjects:[...category.subjects.values()]}))}]};
  const card=document.getElementById('premiumExamCountdown');
  const dialog=document.getElementById('examTimetableDialog');
  const backdrop=document.getElementById('examTimetableBackdrop');
  if(backdrop.parentElement!==document.body)document.body.append(backdrop);
  const list=document.getElementById('examTimetableList');
  const categoryTabs=Array.from(document.querySelectorAll('[data-exam-category]'));
  const subjectTabs=document.getElementById('examSubjectFilters');
  const searchInput=document.getElementById('examTimetableSearch');
  const resultsCount=document.getElementById('examResultsCount');
  const resultsTitle=document.getElementById('examResultsTitle');
  const resultsSubtitle=document.getElementById('examResultsSubtitle');
  const numberFields={days:document.getElementById('examDays'),hours:document.getElementById('examHours'),minutes:document.getElementById('examMinutes'),seconds:document.getElementById('examSeconds')};
  const displayDate=date=>new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Kolkata'}).format(new Date(date+'T00:00:00+05:30'));
  const displayWeekday=date=>new Intl.DateTimeFormat('en-IN',{weekday:'long',timeZone:'Asia/Kolkata'}).format(new Date(date+'T00:00:00+05:30'));
  const targetTime=exam=>new Date(exam.date+'T10:30:00+05:30');
  let nextExam=null,countdownExams=[],countdownIndex=0,selectedExamCode=null,lastRenderedFilter='Major',lastRenderedSubject='Psychology',returnFocus=null,countdownTurnActive=false;
  const countdownCubeRotor=card.querySelector('.exam-countdown-cube-rotor');
  const countdownCubeFace=card.querySelector('.exam-countdown-cube-face');
  let countdownCubeQuarter=0;
  const normalizeCubeQuarter=quarter=>((quarter%4)+4)%4;
  const cubeFaceTransform=quarter=>`rotateY(${quarter*90}deg)`;
  function syncCountdownCubeFace(quarter=countdownCubeQuarter){
    const width=countdownCubeFace?.offsetWidth||0;
    if(width<1)return 0;
    countdownCubeFace.style.transform=cubeFaceTransform(normalizeCubeQuarter(quarter));
    return 1;
  }
  function createCountdownCubeFace(exam,index,total,quarter){
    const face=countdownCubeFace.cloneNode(true);
    face.classList.add('exam-countdown-cube-incoming');
    face.setAttribute('aria-hidden','true');
    face.removeAttribute('aria-labelledby');
    face.inert=true;
    const write=(id,value)=>{const node=face.querySelector('#'+id);if(node)node.textContent=value};
    if(!exam){
      write('examCountdownSubject','FYBA · Semester 1');
      write('examCountdownTitle','No upcoming papers');
      write('examCountdownDateValue','Complete');
      write('examCountdownWeekday','');
      write('examCountdownTimeValue','—');
      ['examDays','examHours','examMinutes','examSeconds'].forEach(id=>write(id,'00'));
    }else{
      const totalSeconds=Math.max(0,Math.floor((targetTime(exam).getTime()-Date.now())/1000));
      write('examCountdownSubject',exam.subject.replace(/\s*·\s*/g,' '));
      write('examCountdownTitle',exam.paper);
      write('examCountdownDateValue',new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Kolkata'}).format(new Date(exam.date+'T00:00:00+05:30')));
      write('examCountdownWeekday',displayWeekday(exam.date));
      write('examCountdownTimeValue',exam.time);
      write('examDays',String(Math.floor(totalSeconds/86400)).padStart(2,'0'));
      write('examHours',String(Math.floor(totalSeconds%86400/3600)).padStart(2,'0'));
      write('examMinutes',String(Math.floor(totalSeconds%3600/60)).padStart(2,'0'));
      write('examSeconds',String(totalSeconds%60).padStart(2,'0'));
    }
    write('examCountdownPosition',String(index+1).padStart(2,'0')+' / '+String(total).padStart(2,'0'));
    face.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));
    face.querySelectorAll('[aria-live]').forEach(node=>node.removeAttribute('aria-live'));
    face.style.width=countdownCubeFace.offsetWidth+'px';
    face.style.height=countdownCubeFace.offsetHeight+'px';
    face.style.transform=cubeFaceTransform(normalizeCubeQuarter(quarter));
    return face;
  }
  function refreshCountdownExams(now=Date.now()){
    countdownExams=exams.filter(exam=>targetTime(exam).getTime()>now).sort((a,b)=>targetTime(a).getTime()-targetTime(b).getTime());
    const selectedIndex=countdownExams.findIndex(exam=>exam.code===selectedExamCode);
    if(selectedIndex>=0)countdownIndex=selectedIndex;
    else{countdownIndex=Math.min(countdownIndex,Math.max(0,countdownExams.length-1));selectedExamCode=countdownExams[countdownIndex]?.code||null;}
  }
  function moveCountdown(step){
    if(countdownTurnActive)return;
    refreshCountdownExams();
    if(countdownExams.length<2)return;
    countdownTurnActive=true;
    const targetIndex=(countdownIndex+step+countdownExams.length)%countdownExams.length;
    const targetQuarter=step>0?1:-1;
    const previousButton=document.getElementById('examCountdownPrev');
    const nextButton=document.getElementById('examCountdownNext');
    const setControls=()=>{const disabled=countdownTurnActive||countdownExams.length<2;previousButton.disabled=nextButton.disabled=disabled};
    const commitPaper=()=>{countdownIndex=targetIndex;selectedExamCode=countdownExams[countdownIndex]?.code||null;setCountdown();setControls()};
    const finish=()=>{countdownTurnActive=false;card.removeAttribute('aria-busy');setControls()};
    setControls();
    card.setAttribute('aria-busy','true');
    const targetExam=countdownExams[targetIndex];
    const playTurn=engine=>{
      if(!engine||window.matchMedia('(prefers-reduced-motion: reduce)').matches){commitPaper();finish();return}
      const faceReady=syncCountdownCubeFace();
      if(!faceReady){commitPaper();finish();return}
      const incoming=createCountdownCubeFace(targetExam,targetIndex,countdownExams.length,targetQuarter);
      countdownCubeRotor.append(incoming);
      engine.killTweensOf(countdownCubeRotor);
      engine.set(countdownCubeRotor,{transformStyle:'preserve-3d',transformOrigin:'50% 50%',rotationY:0});
      const timeline=engine.timeline({onComplete:()=>{
        commitPaper();
        countdownCubeQuarter=0;
        syncCountdownCubeFace(0);
        engine.set(countdownCubeRotor,{rotationY:0});
        incoming.remove();
        finish();
      }});
      timeline.to(countdownCubeRotor,{rotationY:-90*targetQuarter,duration:.92,ease:'power2.inOut'});
    };
    if(window.gsap){playTurn(window.gsap);return}
    Promise.resolve(window.vishHubLoadGsap?.()).then(()=>playTurn(window.gsap)).catch(()=>playTurn(null));
  }
  function setCountdown(){
    const now=Date.now();
    refreshCountdownExams(now);
    nextExam=countdownExams[countdownIndex]||null;
    const position=document.getElementById('examCountdownPosition');
    const previousButton=document.getElementById('examCountdownPrev');
    const nextButton=document.getElementById('examCountdownNext');
    position.textContent=countdownExams.length?String(countdownIndex+1).padStart(2,'0')+' / '+String(countdownExams.length).padStart(2,'0'):'00 / 00';
    previousButton.disabled=nextButton.disabled=countdownTurnActive||countdownExams.length<2;
    if(!nextExam){
      document.getElementById('examCountdownSubject').textContent='FYBA · Semester 1';
      document.getElementById('examCountdownTitle').textContent='No upcoming papers';
      document.getElementById('examCountdownDateValue').textContent='Complete';
      document.getElementById('examCountdownWeekday').textContent='';
      document.getElementById('examCountdownTimeValue').textContent='—';
      Object.values(numberFields).forEach(field=>field.textContent='00');
      return;
    }
    const ms=targetTime(nextExam).getTime()-now,total=Math.floor(ms/1000);
    numberFields.days.textContent=String(Math.floor(total/86400)).padStart(2,'0');
    numberFields.hours.textContent=String(Math.floor(total%86400/3600)).padStart(2,'0');
    numberFields.minutes.textContent=String(Math.floor(total%3600/60)).padStart(2,'0');
    numberFields.seconds.textContent=String(total%60).padStart(2,'0');
    document.getElementById('examCountdownSubject').textContent=nextExam.subject.replace(/\s*·\s*/g,' ');
    document.getElementById('examCountdownTitle').textContent=nextExam.paper;
    document.getElementById('examCountdownDateValue').textContent=new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Kolkata'}).format(new Date(nextExam.date+'T00:00:00+05:30'));
    document.getElementById('examCountdownWeekday').textContent=displayWeekday(nextExam.date);
    document.getElementById('examCountdownTimeValue').textContent=nextExam.time;
  }
  document.getElementById('examCountdownPrev').addEventListener('click',()=>moveCountdown(-1));
  document.getElementById('examCountdownNext').addEventListener('click',()=>moveCountdown(1));
  let countdownGesture=null;
  card.addEventListener('pointerdown',event=>{
    if(!event.isPrimary||event.button!==0||event.target.closest('button,a,input,select,textarea,[role="button"]'))return;
    countdownGesture={id:event.pointerId,x:event.clientX,y:event.clientY};
  },{passive:true});
  window.addEventListener('pointerup',event=>{
    if(!countdownGesture||event.pointerId!==countdownGesture.id)return;
    const dx=event.clientX-countdownGesture.x;
    const dy=event.clientY-countdownGesture.y;
    countdownGesture=null;
    if(Math.abs(dx)>44&&Math.abs(dx)>Math.abs(dy)*1.2)moveCountdown(dx<0?1:-1);
  },{passive:true});
  window.addEventListener('pointercancel',()=>{countdownGesture=null},{passive:true});  function subjectName(exam){const parts=String(exam.subject||'').split(' · ');if(exam.category==='Common'){if(parts[0]==='IKS')return 'IKS';return parts.slice(1).join(' · ')}return parts[0]||exam.subject}
  function subjectLabel(name){return name==='Political Science'?'Politics':name}
  function updateSubjectButtons(category,selected=''){
    const available=[...new Set(exams.filter(exam=>exam.category===category).map(subjectName))];
    const preferred={Major:['Psychology','Philosophy','Economics','English','History','Political Science'],Common:['English Communication','Environmental Education','IKS'],SEC:['Psychology','Economics','English','History','Political Science'],OE:['Zoology','Botany','Electronics','Geology']}[category]||[];
    available.sort((a,b)=>{const ai=preferred.indexOf(a),bi=preferred.indexOf(b);return (ai<0?999:ai)-(bi<0?999:bi)||a.localeCompare(b,undefined,{sensitivity:'base'})});
    subjectTabs.replaceChildren();
    available.forEach(name=>{const button=document.createElement('button');button.type='button';button.className='library-subject-tab';button.dataset.examSubject=name;button.textContent=subjectLabel(name);button.setAttribute('aria-pressed',String(name===selected));button.classList.toggle('active',name===selected);subjectTabs.append(button)});
    subjectTabs.querySelectorAll('[data-exam-subject]').forEach(button=>button.addEventListener('click',()=>{lastRenderedSubject=button.dataset.examSubject;subjectTabs.querySelectorAll('[data-exam-subject]').forEach(item=>{const active=item===button;item.classList.toggle('active',active);item.setAttribute('aria-pressed',String(active))});renderSchedule(lastRenderedFilter,lastRenderedSubject)}));
  }
  function renderSchedule(filter,selectedSubject='All'){
    lastRenderedFilter=filter;lastRenderedSubject=selectedSubject;list.replaceChildren();
    const query=(searchInput?.value||'').trim().toLocaleLowerCase();
    const shown=exams.filter(exam=>(filter==='All'||exam.category===filter)&&(!selectedSubject||subjectName(exam)===selectedSubject)&&(!query||[exam.paper,exam.code,exam.subject,exam.category,exam.date].join(' ').toLocaleLowerCase().includes(query)));
    const categoryNames={Common:'Common Subjects',Major:'Major Subjects',SEC:'SEC Subjects',OE:'OE Subjects'};
    resultsCount.textContent=shown.length+' EXAM '+(shown.length===1?'PAPER':'PAPERS');
    resultsTitle.textContent=(categoryNames[filter]||'All Examination Papers')+(selectedSubject?' · '+subjectLabel(selectedSubject):'');
    resultsSubtitle.textContent=query?'Search results for “'+searchInput.value.trim()+'”.':'Browse official examination papers by subject and date.';
    if(!shown.length){const empty=document.createElement('div');empty.className='book-catalog-empty';empty.textContent=query?'No examination papers match your search.':'No examination papers are available for this subject.';list.append(empty);return}
    shown.forEach(exam=>{
      const paper=document.createElement('details');paper.className='book-cover-card exam-book-card exam-paper-dropdown';if(nextExam&&exam.code===nextExam.code)paper.classList.add('is-next');
      const summary=document.createElement('summary');summary.className='book-cover-open exam-paper-summary';
      const cover=document.createElement('span');cover.className='book-cover-frame exam-paper-date-cover';cover.setAttribute('aria-label','Exam date: '+displayDate(exam.date)+', '+displayWeekday(exam.date));
      const coverKicker=document.createElement('small');coverKicker.textContent='EXAM DATE';
      const dateParts=new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',timeZone:'Asia/Calcutta'}).formatToParts(new Date(exam.date+'T00:00:00+05:30'));
      const day=document.createElement('strong');day.textContent=dateParts.find(part=>part.type==='day')?.value||'—';const month=document.createElement('span');month.textContent=(dateParts.find(part=>part.type==='month')?.value||'').toUpperCase();const weekday=document.createElement('i');weekday.textContent=displayWeekday(exam.date).toUpperCase();cover.append(coverKicker,day,month,weekday);
      const copy=document.createElement('span');copy.className='book-cover-details exam-paper-book-details';const title=document.createElement('strong');title.textContent=exam.paper;const subject=document.createElement('small');subject.textContent=exam.subject.replace(/\s*·\s*/g,' · ');const code=document.createElement('span');code.className='exam-paper-code';code.textContent=exam.code;copy.append(title,subject,code);
      if(nextExam&&exam.code===nextExam.code){const next=document.createElement('span');next.className='exam-category-next';next.textContent='NEXT PAPER';copy.append(next)}
      const chevron=document.createElement('span');chevron.className='exam-paper-dropdown-chevron';chevron.setAttribute('aria-hidden','true');summary.append(cover,copy,chevron);paper.append(summary);
      const details=document.createElement('div');details.className='exam-paper-details';const meta=document.createElement('div');meta.className='exam-category-paper-meta';
      const dateItem=document.createElement('div');dateItem.className='exam-category-meta-item';const dateLabel=document.createElement('span');dateLabel.textContent='DATE';const dateValue=document.createElement('strong');dateValue.textContent=displayDate(exam.date);const weekdayValue=document.createElement('small');weekdayValue.textContent=displayWeekday(exam.date);dateItem.append(dateLabel,dateValue,weekdayValue);
      const timeItem=document.createElement('div');timeItem.className='exam-category-meta-item';const timeLabel=document.createElement('span');timeLabel.textContent='TIME';const timeValue=document.createElement('strong');timeValue.textContent=exam.time;timeItem.append(timeLabel,timeValue);meta.append(dateItem,timeItem);details.append(meta);paper.append(details);list.append(paper);
    });
  }
  function hideTimetable(){backdrop.hidden=true;document.body.classList.remove('app-page-open');document.body.style.overflow='';if(returnFocus&&returnFocus.focus&&returnFocus.isConnected)returnFocus.focus()}
  function openTimetable(){if(!backdrop.hidden)returnFocus=returnFocus||document.activeElement;else returnFocus=document.activeElement;updateSubjectButtons(lastRenderedFilter,lastRenderedSubject);renderSchedule(lastRenderedFilter,lastRenderedSubject);backdrop.hidden=false;document.body.classList.add('app-page-open');document.body.style.overflow='hidden';if(!window.__vishHubSilentRoute){try{history.pushState({appPage:'timetable'},'',location.pathname+location.search+'#/timetable')}catch{}}dialog.focus()}window.openVishTimetable=openTimetable;
  function closeTimetable(){if(history.state?.appPage==='timetable'){history.back();return}if(location.hash==='#/timetable'){try{history.replaceState(null,'',location.pathname+location.search)}catch{}}hideTimetable()}window.vishHubHideTimetableForRoute=()=>{if(!backdrop.hidden)hideTimetable()};window.addEventListener('popstate',()=>{if(location.hash!=='#/timetable')window.vishHubHideTimetableForRoute()});
  document.addEventListener('click',event=>{const control=event.target.closest('#openExamTimetable,.navitem[data-nav="timetable"]');if(!control)return;event.preventDefault();event.stopImmediatePropagation();if(control.matches('.navitem[data-nav="timetable"]'))document.querySelector('.navitem[data-nav="home"]')?.click();document.querySelectorAll('.navitem[data-nav]').forEach(item=>{const active=item.dataset.nav==='timetable';item.classList.toggle('active',active);if(active)item.setAttribute('aria-current','page');else item.removeAttribute('aria-current')});openTimetable()},true);
  document.getElementById('closeExamTimetable').addEventListener('click',closeTimetable);

  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!backdrop.hidden)closeTimetable()});
  const categorySubjectDefaults={Major:'Psychology',Common:'English Communication',SEC:'Psychology',OE:'Zoology'};
  searchInput.addEventListener('input',()=>renderSchedule(lastRenderedFilter,lastRenderedSubject));
  categoryTabs.forEach(button=>button.addEventListener('click',()=>{lastRenderedFilter=button.dataset.examCategory;lastRenderedSubject=categorySubjectDefaults[lastRenderedFilter]||'';categoryTabs.forEach(item=>{const active=item===button;item.classList.toggle('active',active);item.setAttribute('aria-pressed',String(active))});updateSubjectButtons(lastRenderedFilter,lastRenderedSubject);renderSchedule(lastRenderedFilter,lastRenderedSubject)}));
  document.getElementById('examTimetableSummary').textContent='FYBA Semester 1 · Academic Year 2026–27';
  categoryTabs.forEach(button=>{const active=button.dataset.examCategory===lastRenderedFilter;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active))});
  updateSubjectButtons(lastRenderedFilter,lastRenderedSubject);
  setCountdown();syncCountdownCubeFace();
  if(window.ResizeObserver&&countdownCubeFace){const cubeResizeObserver=new ResizeObserver(()=>{if(!countdownTurnActive)syncCountdownCubeFace()});cubeResizeObserver.observe(countdownCubeFace)}
  window.setInterval(setCountdown,1000);
})();











