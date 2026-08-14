/* ============================================================
   SYLLABUS.JS  —  Compact Academic Planner Edition
   ============================================================ */

const sylQs = new URLSearchParams(location.search);
function currentCourseId(){ return sylQs.get('id'); }
function escapeHtml(s){ const d=document.createElement('div'); d.textContent=s==null?'':String(s); return d.innerHTML; }
function timeAgo(ts){
  if(!ts) return 'Never';
  const s=Math.floor((Date.now()-ts)/1000);
  if(s<60) return 'Just now';
  if(s<3600) return Math.floor(s/60)+'m ago';
  if(s<86400) return Math.floor(s/3600)+'h ago';
  if(s<86400*30) return Math.floor(s/86400)+'d ago';
  return new Date(ts).toLocaleDateString([],{month:'short',day:'numeric'});
}
function fmtTime(t){
  if(!t) return '';
  const [h,m]=t.split(':'); const hr=parseInt(h,10);
  return `${hr%12||12}:${m} ${hr>=12?'PM':'AM'}`;
}
function fmtDays(days){
  if(!days||!days.length) return '';
  const map={Mon:'M',Tue:'T',Wed:'W',Thu:'Th',Fri:'F',Sat:'Sa',Sun:'Su'};
  return days.map(d=>map[d]||d).join('');
}

/* ── Progress ── */
function computeProgress(c){
  const w=c.weeks||[];
  if(!w.length) return {pct:0,completed:0,total:0};
  const completed=w.filter(x=>x.completed).length;
  const total=w.length;
  return {pct:Math.round(completed/total*100),completed,total};
}

/* ============================================================
   SYLLABUS LIST PAGE
   ============================================================ */
function initSyllabusList(){ renderSyllabusGrid(); }

function renderSyllabusGrid(){
  const grid=document.getElementById('syllabusGrid'); if(!grid) return;
  const semId=DB.getActiveSemesterId();
  const sem=DB.getActiveSemester();
  const allCourses=DB.getSyllabusCourses();
  const courses=allCourses.filter(c=>c.semesterId===semId);
  const q=(document.getElementById('syllabusSearch').value||'').toLowerCase().trim();
  const sortBy=document.getElementById('syllabusSort').value;

  let list=courses.filter(c=>!q||c.courseTitle.toLowerCase().includes(q)||c.courseCode.toLowerCase().includes(q));
  if(sortBy==='az') list.sort((a,b)=>a.courseTitle.localeCompare(b.courseTitle));
  else if(sortBy==='recent') list.sort((a,b)=>b.createdAt-a.createdAt);
  else list.sort((a,b)=>b.updatedAt-a.updatedAt);

  if(!list.length){
    grid.innerHTML=`<div class="glass card-pad text-center py-5 text-faint fade-in" style="grid-column:1/-1">
      <i class="bi bi-journal-bookmark" style="font-size:1.6rem;opacity:.4"></i>
      <div class="mt-2 fw-bold" style="color:var(--text)">${courses.length?'No subjects match your search':'No syllabi yet'}</div>
      <div style="font-size:.82rem">${courses.length?'Try a different title or code.':(sem?`Add your first syllabus for ${sem.schoolYear} · ${sem.name}.`:'Add your first course syllabus.')}</div>
    </div>`;
    return;
  }

  grid.innerHTML=list.map(c=>{
    const {pct,completed,total}=computeProgress(c);
    const yearSem=[c.academicYear,c.semester].filter(Boolean).join(' · ');
    return `<div class="syl-list-card glass fade-in">
      <div class="syl-lc-top">
        <div class="syl-lc-code"><i class="bi bi-hash"></i>${escapeHtml(c.courseCode)}</div>
        <div class="dropdown">
          <button class="btn-icon syl-lc-menu" data-bs-toggle="dropdown"><i class="bi bi-three-dots-vertical"></i></button>
          <ul class="dropdown-menu dropdown-menu-end">
            <li><a class="dropdown-item" href="syllabus-view.html?id=${c.id}"><i class="bi bi-eye me-2"></i>View</a></li>
            <li><a class="dropdown-item" href="#" onclick="openCourseModal('${c.id}');return false"><i class="bi bi-pencil me-2"></i>Edit</a></li>
            <li><a class="dropdown-item" href="#" onclick="exportSyllabus('${c.id}');return false"><i class="bi bi-download me-2"></i>Export</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item text-danger" href="#" onclick="deleteCourse('${c.id}');return false"><i class="bi bi-trash3 me-2"></i>Delete</a></li>
          </ul>
        </div>
      </div>
      <div class="syl-lc-title">${escapeHtml(c.courseTitle)}</div>
      <div class="syl-lc-meta">
        ${c.creditUnits?`<div class="syl-lc-meta-row"><i class="bi bi-layers"></i>${c.creditUnits} unit${c.creditUnits===1?'':'s'}</div>`:''}
        ${c.instructor?`<div class="syl-lc-meta-row"><i class="bi bi-person"></i>${escapeHtml(c.instructor)}</div>`:''}
        ${yearSem?`<div class="syl-lc-meta-row"><i class="bi bi-calendar3"></i>${escapeHtml(yearSem)}</div>`:''}
      </div>
      ${total>0?`<div class="syl-lc-prog">
        <div class="syl-lc-prog-header">
          <span><i class="bi bi-bar-chart-line"></i> Progress</span>
          <span>${completed}/${total} · ${pct}%</span>
        </div>
        <div class="syl-lc-track"><div class="syl-lc-bar" style="width:${pct}%"></div></div>
      </div>`:`<div class="syl-lc-prog-empty">No weeks added yet</div>`}
      <div class="syl-lc-actions">
        <a href="syllabus-view.html?id=${c.id}" class="btn btn-accent btn-sm sv-btn">
          <i class="bi bi-journal-text me-1"></i>View Syllabus
        </a>
      </div>
    </div>`;
  }).join('');
}

/* ============================================================
   ADD / EDIT COURSE MODAL  (list + view pages share this)
   ============================================================ */
function openCourseModal(id){
  const c=id?DB.getSyllabusCourse(id):null;
  const sem=DB.getActiveSemester();
  const defSem=sem?sem.name:'1st Semester';
  const defYear=sem?sem.schoolYear:'2026-2027';
  document.getElementById('courseModalBody').innerHTML=`
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h5 class="modal-title mb-0"><i class="bi bi-journal-bookmark-fill me-2"></i>${c?'Edit':'Add'} Subject</h5>
      <button class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
    </div>
    <input type="hidden" id="cId" value="${c?c.id:''}">

    <div class="syl-modal-section-label">Course Information</div>
    <div class="row g-2">
      <div class="col-8"><label class="syl-field-label">Course Title *</label>
        <input class="form-control" id="cTitle" placeholder="Data Structures" value="${c?escapeHtml(c.courseTitle):''}"></div>
      <div class="col-4"><label class="syl-field-label">Code *</label>
        <input class="form-control" id="cCode" placeholder="CS211" value="${c?escapeHtml(c.courseCode):''}"></div>
      <div class="col-4"><label class="syl-field-label">Units *</label>
        <input type="number" min="0" step="0.5" class="form-control" id="cUnits" value="${c?c.creditUnits:''}"></div>
      <div class="col-8"><label class="syl-field-label">Instructor</label>
        <input class="form-control" id="cInstructor" value="${c?escapeHtml(c.instructor||''):''}"></div>
      <div class="col-6"><label class="syl-field-label">Schedule</label>
        <input class="form-control" id="cSchedule" placeholder="MWF 9:00–10:30 AM" value="${c?escapeHtml(c.schedule||''):''}"></div>
      <div class="col-6"><label class="syl-field-label">Room</label>
        <input class="form-control" id="cRoom" placeholder="Room 304" value="${c?escapeHtml(c.room||''):''}"></div>
      <div class="col-6"><label class="syl-field-label">Semester</label>
        <input class="form-control" id="cSemester" value="${c?escapeHtml(c.semester||''):defSem}"></div>
      <div class="col-6"><label class="syl-field-label">Academic Year</label>
        <input class="form-control" id="cYear" value="${c?escapeHtml(c.academicYear||''):defYear}"></div>
      <div class="col-12"><label class="syl-field-label">Course Description</label>
        <textarea class="form-control" id="cDesc" rows="3">${c?escapeHtml(c.courseDescription||''):''}</textarea></div>
    </div>

    <div class="syl-modal-section-label mt-3">Course Learning Outcomes</div>
    <div id="cOutcomesWrap">
      ${(c&&c.courseOutcomes&&c.courseOutcomes.length?c.courseOutcomes:[''])
        .map((o,i)=>cloRowHtml(o,i)).join('')}
    </div>
    <button type="button" class="btn btn-ghost btn-sm mb-3" onclick="addCourseOutcome()">
      <i class="bi bi-plus-lg me-1"></i>Add Outcome</button>

    <div class="syl-modal-section-label">Grading System</div>
    <div id="cGradingWrap">
      ${(c&&c.gradingComponents&&c.gradingComponents.length?c.gradingComponents:[{name:'',weight:''}])
        .map((g,i)=>cgRowHtml(g,i)).join('')}
    </div>
    <button type="button" class="btn btn-ghost btn-sm mb-3" onclick="addCourseGrading()">
      <i class="bi bi-plus-lg me-1"></i>Add Component</button>

    <div class="syl-modal-section-label">Course Requirements</div>
    <textarea class="form-control mb-3" id="cRequirements" rows="3"
      placeholder="• Regular attendance&#10;• Completion of activities">${c?escapeHtml(c.requirements||''):''}</textarea>

    <div class="syl-modal-section-label">Course Policies</div>
    <textarea class="form-control mb-3" id="cPolicies" rows="3"
      placeholder="Attendance: Regular attendance required.">${c?escapeHtml(c.policies||''):''}</textarea>

    <div class="syl-modal-section-label">References</div>
    <textarea class="form-control mb-3" id="cReferences" rows="3"
      placeholder="Author. Title. Publisher.">${c?escapeHtml(c.references||''):''}</textarea>

    <div class="d-flex gap-2 mt-2">
      <button class="btn btn-accent flex-grow-1" onclick="saveCourse()">
        <i class="bi bi-check2 me-1"></i>${c?'Update':'Save'}</button>
      ${c?`<button class="btn btn-ghost" onclick="deleteCourse('${c.id}')"><i class="bi bi-trash3"></i></button>`:''}
    </div>`;
  new bootstrap.Modal(document.getElementById('courseModal')).show();
}

function cloRowHtml(v,i){
  return `<div class="syl-edit-row" id="cOutcomeRow${i}">
    <span class="syl-row-num">${i+1}.</span>
    <input class="form-control" id="cOutcome${i}" value="${escapeHtml(v)}" placeholder="Learning outcome">
    <button type="button" class="btn-icon" onclick="removeCourseOutcome(${i})"><i class="bi bi-x-lg"></i></button>
  </div>`;
}
function cgRowHtml(g,i){
  return `<div class="syl-edit-row" id="cGradingRow${i}">
    <input class="form-control" id="cGradingName${i}" placeholder="Component" value="${escapeHtml(g.name||'')}">
    <input class="form-control" type="number" min="0" max="100" id="cGradingWt${i}"
      placeholder="%" value="${g.weight||''}" style="width:72px;flex:0 0 72px">
    <span class="text-faint" style="font-size:.78rem">%</span>
    <button type="button" class="btn-icon" onclick="removeCourseGrading(${i})"><i class="bi bi-x-lg"></i></button>
  </div>`;
}
function _getCourseOutcomeCount(){ let i=0; while(document.getElementById('cOutcomeRow'+i)) i++; return i; }
function addCourseOutcome(){
  const i=_getCourseOutcomeCount();
  const div=document.createElement('div'); div.className='syl-edit-row'; div.id='cOutcomeRow'+i;
  div.innerHTML=cloRowHtml('',i);
  document.getElementById('cOutcomesWrap').appendChild(div);
}
function removeCourseOutcome(i){
  document.getElementById('cOutcomeRow'+i)?.remove();
  let idx=0;
  document.querySelectorAll('#cOutcomesWrap .syl-edit-row').forEach(r=>{
    const s=r.querySelector('.syl-row-num'); if(s) s.textContent=(++idx)+'.';
  });
}
function _readCourseOutcomes(){
  const out=[];
  document.querySelectorAll('#cOutcomesWrap .syl-edit-row input.form-control').forEach(el=>{
    if(el.value.trim()) out.push(el.value.trim());
  });
  return out;
}
function _getGradingCount(){ let i=0; while(document.getElementById('cGradingRow'+i)) i++; return i; }
function addCourseGrading(){
  const i=_getGradingCount();
  const div=document.createElement('div'); div.className='syl-edit-row'; div.id='cGradingRow'+i;
  div.innerHTML=cgRowHtml({name:'',weight:''},i);
  document.getElementById('cGradingWrap').appendChild(div);
}
function removeCourseGrading(i){ document.getElementById('cGradingRow'+i)?.remove(); }
function _readGradingComponents(){
  const out=[];
  document.querySelectorAll('#cGradingWrap .syl-edit-row').forEach(r=>{
    const n=r.querySelector('input[id^="cGradingName"]');
    const w=r.querySelector('input[type="number"]');
    if(n&&n.value.trim()) out.push({name:n.value.trim(),weight:parseFloat(w?.value)||0});
  });
  return out;
}

function saveCourse(){
  const courseTitle=document.getElementById('cTitle').value.trim();
  const courseCode=document.getElementById('cCode').value.trim();
  const unitsRaw=document.getElementById('cUnits').value.trim();
  if(!courseTitle||!courseCode){ Toast.show('Course Title and Code are required','high','bi-exclamation-triangle'); return; }
  if(unitsRaw===''||isNaN(Number(unitsRaw))){ Toast.show('Units must be a number','high','bi-exclamation-triangle'); return; }
  const semId=DB.getActiveSemesterId();
  const data={
    courseTitle, courseCode, creditUnits:Number(unitsRaw),
    courseDescription:document.getElementById('cDesc').value.trim(),
    instructor:document.getElementById('cInstructor').value.trim(),
    schedule:document.getElementById('cSchedule').value.trim(),
    room:document.getElementById('cRoom').value.trim(),
    semester:document.getElementById('cSemester').value.trim(),
    academicYear:document.getElementById('cYear').value.trim(),
    semesterId:semId,
    courseOutcomes:_readCourseOutcomes(),
    gradingComponents:_readGradingComponents(),
    requirements:document.getElementById('cRequirements').value.trim(),
    policies:document.getElementById('cPolicies').value.trim(),
    references:document.getElementById('cReferences').value.trim(),
  };
  const id=document.getElementById('cId').value;
  const courses=DB.getSyllabusCourses();
  if(id){ const idx=courses.findIndex(c=>c.id===id); if(idx!==-1) courses[idx]={...courses[idx],...data,updatedAt:Date.now()}; }
  else courses.push({id:DB.uid(),...data,weeks:[],createdAt:Date.now(),updatedAt:Date.now()});
  DB.saveSyllabusCourses(courses);
  bootstrap.Modal.getInstance(document.getElementById('courseModal'))?.hide();
  Toast.show(id?'Subject updated':'Subject added');
  if(document.getElementById('syllabusGrid')) renderSyllabusGrid();
  if(document.getElementById('svInfoCard')) renderViewPage();
}

function deleteCourse(id){
  confirmAction({
    title:'Delete this subject?', danger:true, icon:'bi-trash3', confirmLabel:'Delete Subject',
    message:'This permanently removes the subject and all its weeks, outcomes, and topics.',
    onConfirm(){
      DB.saveSyllabusCourses(DB.getSyllabusCourses().filter(c=>c.id!==id));
      Toast.show('Subject deleted');
      bootstrap.Modal.getInstance(document.getElementById('courseModal'))?.hide();
      if(document.getElementById('syllabusGrid')) renderSyllabusGrid();
      else location.href='syllabus.html';
    }
  });
}

/* ============================================================
   SYLLABUS VIEW PAGE
   ============================================================ */
function initSyllabusView(){
  if(!currentCourseId()){ location.href='syllabus.html'; return; }
  renderViewPage();
}

function renderViewPage(){
  renderInfoCard();
  renderDescriptionCard();
  renderOutcomesCard();
  renderWeeksAccordion();
  renderGradingCard();
  renderRequirementsCard();
  renderPoliciesCard();
  renderReferencesCard();
  renderTopActions();
}

/* ── Top action buttons ── */
function renderTopActions(){
  const host=document.getElementById('svTopActions'); if(!host) return;
  const c=DB.getSyllabusCourse(currentCourseId()); if(!c) return;
  host.innerHTML=`
    <button class="btn btn-ghost btn-sm sv-btn" onclick="exportSyllabus('${c.id}')">
      <i class="bi bi-download me-1"></i>Export</button>
    <button class="btn btn-ghost btn-sm sv-btn" onclick="openCourseModal('${c.id}')">
      <i class="bi bi-pencil me-1"></i>Edit</button>`;
}

/* ── Course Info card ── */
function renderInfoCard(){
  const host=document.getElementById('svInfoCard'); if(!host) return;
  const c=DB.getSyllabusCourse(currentCourseId());
  if(!c){
    host.innerHTML=`<div class="glass card-pad text-center py-5">
      <i class="bi bi-emoji-frown" style="font-size:1.6rem"></i>
      <div class="mt-2 fw-bold">Subject not found</div>
      <a href="syllabus.html" class="btn btn-ghost btn-sm mt-2">Back to Subjects</a></div>`;
    return;
  }
  const {pct,completed,total}=computeProgress(c);
  const subjects=DB.getSubjects();
  const linked=subjects.find(s=>s.code===c.courseCode&&s.semesterId===c.semesterId);
  const schedule=c.schedule||(linked?buildScheduleStr(linked):'');
  const room=c.room||(linked?linked.room||'':'');

  document.title=`${c.courseCode} · Syllabus · Student Planner`;

  host.innerHTML=`<div class="glass card-pad mb-0 fade-in sv-info-card">
    <div class="sv-info-header">
      <div class="min-width-0">
        <div class="sv-info-code">${escapeHtml(c.courseCode)}</div>
        <div class="sv-info-title">${escapeHtml(c.courseTitle)}</div>
      </div>
    </div>
    <div class="sv-info-grid">
      ${c.creditUnits?`<div class="sv-info-item"><span class="sv-info-lbl">Units</span><span class="sv-info-val">${c.creditUnits}</span></div>`:''}
      ${c.instructor?`<div class="sv-info-item"><span class="sv-info-lbl">Instructor</span><span class="sv-info-val">${escapeHtml(c.instructor)}</span></div>`:''}
      ${schedule?`<div class="sv-info-item"><span class="sv-info-lbl">Schedule</span><span class="sv-info-val">${escapeHtml(schedule)}</span></div>`:''}
      ${room?`<div class="sv-info-item"><span class="sv-info-lbl">Room</span><span class="sv-info-val">${escapeHtml(room)}</span></div>`:''}
      ${c.semester?`<div class="sv-info-item"><span class="sv-info-lbl">Semester</span><span class="sv-info-val">${escapeHtml(c.semester)}</span></div>`:''}
      ${c.academicYear?`<div class="sv-info-item"><span class="sv-info-lbl">Academic Year</span><span class="sv-info-val">${escapeHtml(c.academicYear)}</span></div>`:''}
    </div>
    ${total>0?`<div class="sv-progress-wrap">
      <div class="d-flex justify-content-between align-items-baseline mb-1">
        <span class="sv-prog-label">Course Progress</span>
        <span class="sv-prog-pct">${completed}/${total} weeks · ${pct}%</span>
      </div>
      <div class="sv-prog-track"><div class="sv-prog-fill" style="width:${pct}%"></div></div>
    </div>`:''}
  </div>`;
}

function buildScheduleStr(s){
  const days=fmtDays(s.days||[]);
  const start=fmtTime(s.start), end=fmtTime(s.end);
  return start&&end?`${days} ${start}–${end}`.trim():days;
}

/* ── Description card ── */
let _descExpanded=false;
function renderDescriptionCard(){
  const host=document.getElementById('svDescCard'); if(!host) return;
  const c=DB.getSyllabusCourse(currentCourseId()); if(!c) return;
  const desc=(c.courseDescription||'').trim();
  if(!desc){ host.innerHTML=''; return; }
  const TRUNC=220;
  const long=desc.length>TRUNC;
  const shown=_descExpanded||!long?desc:desc.slice(0,TRUNC)+'…';
  host.innerHTML=`<div class="glass card-pad fade-in">
    <div class="sv-section-title"><i class="bi bi-file-text"></i>Course Description</div>
    <p class="sv-body-text mb-0">${escapeHtml(shown).replace(/\n/g,'<br>')}</p>
    ${long?`<button class="btn btn-ghost btn-sm sv-btn mt-2" onclick="_descExpanded=!_descExpanded;renderDescriptionCard()">
      ${_descExpanded?'<i class="bi bi-chevron-up me-1"></i>Show less':'<i class="bi bi-chevron-down me-1"></i>Show more'}
    </button>`:''}
  </div>`;
}

/* ── Course Outcomes card ── */
function renderOutcomesCard(){
  const host=document.getElementById('svOutcomesCard'); if(!host) return;
  const c=DB.getSyllabusCourse(currentCourseId()); if(!c) return;
  const outcomes=c.courseOutcomes||[];
  if(!outcomes.length){ host.innerHTML=''; return; }
  host.innerHTML=`<div class="glass card-pad fade-in">
    <div class="sv-section-title"><i class="bi bi-bullseye"></i>Course Outcomes</div>
    <ul class="sv-outcome-list">
      ${outcomes.map(o=>`<li>
        <span class="sv-outcome-icon"><i class="bi bi-check-lg"></i></span>
        <span>${escapeHtml(o)}</span>
      </li>`).join('')}
    </ul>
  </div>`;
}

/* ── Weeks accordion (Course Outline) ── */
function weekMatchesSearch(c,w,q){
  if(!q) return true;
  const i=c.weeks.indexOf(w)+1;
  if(String(i).includes(q)||`week ${i}`.includes(q)) return true;
  if((w.title||'').toLowerCase().includes(q)) return true;
  if((w.dateRange||'').toLowerCase().includes(q)) return true;
  for(const t of(w.topics||[])){
    if(t.title.toLowerCase().includes(q)) return true;
    if((t.subtopics||[]).some(s=>s.toLowerCase().includes(q))) return true;
  }
  if((w.learningOutcomes||[]).some(o=>o.toLowerCase().includes(q))) return true;
  if((w.resources||[]).some(r=>r.toLowerCase().includes(q))) return true;
  if((w.assessments||[]).some(a=>a.toLowerCase().includes(q))) return true;
  return false;
}

let _openWeeks=[];
function renderWeeksAccordion(){
  const host=document.getElementById('weeksAccordion'); if(!host) return;
  const c=DB.getSyllabusCourse(currentCourseId()); if(!c) return;
  const q=((document.getElementById('weekSearch')||{}).value||'').toLowerCase().trim();
  const weeks=c.weeks||[];

  if(!weeks.length){
    host.innerHTML=`<div class="syl-empty-state fade-in">
      <i class="bi bi-calendar3-week" style="font-size:1.5rem;opacity:.4"></i>
      <div class="mt-2 fw-bold" style="color:var(--text)">No weeks added yet</div>
      <div class="text-faint" style="font-size:.82rem">Click "Add Week" to build this course outline.</div>
    </div>`;
    return;
  }

  const matches=weeks.map(w=>weekMatchesSearch(c,w,q));
  if(q&&!matches.some(Boolean)){
    host.innerHTML=`<div class="syl-empty-state fade-in">
      <i class="bi bi-search" style="font-size:1.4rem;opacity:.4"></i>
      <div class="mt-2 text-faint">No matches found.</div>
    </div>`;
    return;
  }

  const semId=c.semesterId;
  const allTasks=DB.getTasks().filter(t=>t.semesterId===semId);

  host.innerHTML=weeks.map((w,i)=>{
    if(q&&!matches[i]) return '';
    const num=i+1;
    const numStr=String(num).padStart(2,'0');
    const isDone=!!w.completed;
    const relTasks=allTasks.filter(t=>t.syllabusWeekId===w.id);

    /* ── Expanded body sections ── */
    // Topics
    const topicsHtml=(w.topics||[]).filter(t=>t.title).map(t=>`
      <div class="sv-topic-row">
        <div class="sv-topic-main"><i class="bi bi-chevron-right sv-topic-icon"></i>${escapeHtml(t.title)}</div>
        ${(t.subtopics||[]).filter(Boolean).map(s=>`
          <div class="sv-subtopic-row"><i class="bi bi-dot sv-subtopic-icon"></i>${escapeHtml(s)}</div>`).join('')}
      </div>`).join('');

    // Learning outcomes
    const outcomesHtml=(w.learningOutcomes||[]).filter(Boolean).map((o,oi)=>
      `<div class="sv-compact-item"><span class="sv-item-num">${oi+1}.</span>${escapeHtml(o)}</div>`).join('');

    // Activities / methodology
    const activitiesHtml=(w.activities||[]).filter(Boolean).map(a=>
      `<div class="sv-compact-item"><i class="bi bi-circle-fill sv-bullet"></i>${escapeHtml(a)}</div>`).join('');

    // Resources
    const resourcesHtml=(w.resources||[]).filter(Boolean).map(r=>
      `<div class="sv-compact-item"><i class="bi bi-circle-fill sv-bullet"></i>${escapeHtml(r)}</div>`).join('');

    // Assessments
    const assessmentsHtml=(w.assessments||[]).filter(Boolean).map(a=>
      `<div class="sv-compact-item"><i class="bi bi-circle-fill sv-bullet"></i>${escapeHtml(a)}</div>`).join('');

    // Related tasks
    const tasksHtml=relTasks.map(t=>`
      <div class="sv-task-row ${t.status==='completed'?'done':''}">
        <i class="bi ${t.status==='completed'?'bi-check-circle-fill':'bi-circle'} sv-task-icon"></i>
        <span>${escapeHtml(t.title)}</span>
        ${t.dueDate?`<span class="sv-task-due">${t.dueDate}</span>`:''}
      </div>`).join('');

    const hasBody=topicsHtml||outcomesHtml||activitiesHtml||resourcesHtml||assessmentsHtml||relTasks.length||w.description;
    const isOpen=_openWeeks.includes(w.id);
    // Embed date range directly in the week label
    const weekLabel = w.dateRange
      ? `WEEK ${numStr} · ${w.dateRange}`
      : `WEEK ${numStr}`;

    return `<div class="sv-week-row ${isDone?'done':''}" id="svWeek-${w.id}">
      <div class="sv-week-head">
        <div class="sv-week-badge ${isDone?'done':''}">
          ${isDone?'<i class="bi bi-check-lg"></i>':numStr}
        </div>
        <div class="sv-week-info">
          <div class="sv-week-label">${escapeHtml(weekLabel)}</div>
          <div class="sv-week-title">${escapeHtml(w.title||'(Untitled)')}</div>
        </div>
        <div class="sv-week-controls">
          <button class="btn btn-ghost btn-sm sv-btn sv-week-edit-btn"
            onclick="openWeekModal(currentCourseId(),'${w.id}')" title="Edit week">
            <i class="bi bi-pencil me-1"></i>Edit
          </button>
          <button class="btn-icon sv-week-tool"
            onclick="deleteWeek('${w.id}')" title="Delete">
            <i class="bi bi-trash3"></i>
          </button>
          ${hasBody?`<button class="btn-icon sv-week-chevron-btn ${isOpen?'open':''}" id="chevron-${w.id}"
            onclick="toggleWeek('${w.id}')" title="Expand / Collapse">
            <i class="bi bi-chevron-right"></i>
          </button>`:'<span style="width:26px"></span>'}
        </div>
      </div>
      ${hasBody?`<div class="sv-week-body" id="wkBody-${w.id}" style="display:${isOpen?'block':'none'}">
        <div class="sv-week-body-inner">
          ${w.description?`<p class="sv-body-text mb-3">${escapeHtml(w.description)}</p>`:''}

          ${topicsHtml?`<div class="sv-body-block">
            <div class="sv-body-block-title"><i class="bi bi-diagram-3"></i>Topics</div>
            <div class="sv-topics-list">${topicsHtml}</div>
          </div>`:''}

          ${outcomesHtml?`<div class="sv-body-block">
            <div class="sv-body-block-title"><i class="bi bi-check2-all"></i>Learning Outcomes</div>
            ${outcomesHtml}
          </div>`:''}

          ${activitiesHtml?`<div class="sv-body-block">
            <div class="sv-body-block-title"><i class="bi bi-lightning-charge"></i>Learning Activities / Methodology</div>
            ${activitiesHtml}
          </div>`:''}

          ${resourcesHtml?`<div class="sv-body-block">
            <div class="sv-body-block-title"><i class="bi bi-book"></i>Learning and Teaching Resources</div>
            ${resourcesHtml}
          </div>`:''}

          ${assessmentsHtml?`<div class="sv-body-block">
            <div class="sv-body-block-title"><i class="bi bi-clipboard-check"></i>Assessment and Tasks</div>
            ${assessmentsHtml}
          </div>`:''}

          ${relTasks.length||true?`<div class="sv-body-block sv-tasks-block">
            <div class="sv-body-block-title">
              <i class="bi bi-check2-square"></i>Related Tasks
              ${relTasks.length?`<span class="sv-task-count">${relTasks.length}</span>`:''}
            </div>
            ${tasksHtml||'<div class="text-faint" style="font-size:.78rem">No tasks linked yet.</div>'}
            <button class="btn btn-ghost btn-sm sv-btn mt-2"
              onclick="createTaskForWeek('${c.id}','${w.id}')">
              <i class="bi bi-plus-lg me-1"></i>Create Task
            </button>
          </div>`:''}

          <div class="sv-complete-row">
            <button class="btn ${isDone?'btn-ghost':'btn-accent'} btn-sm sv-btn"
              onclick="toggleWeekComplete('${w.id}')">
              ${isDone
                ?'<i class="bi bi-arrow-counterclockwise me-1"></i>Mark Incomplete'
                :'<i class="bi bi-check-lg me-1"></i>Mark Completed'}
            </button>
          </div>
        </div>
      </div>`:''}
    </div>`;
  }).join('');

  // Re-apply open states
  _openWeeks.forEach(wid=>{
    const body=document.getElementById('wkBody-'+wid);
    if(body) body.style.display='block';
    const btn=document.getElementById('chevron-'+wid);
    if(btn) btn.classList.add('open');
  });
}

function toggleWeek(wid){
  const body=document.getElementById('wkBody-'+wid);
  const btn=document.getElementById('chevron-'+wid);
  if(!body) return;
  const open=body.style.display==='block';
  body.style.display=open?'none':'block';
  btn&&btn.classList.toggle('open',!open);
  _openWeeks=open?_openWeeks.filter(id=>id!==wid):[..._openWeeks,wid];
}

function toggleWeekComplete(weekId){
  const c=DB.getSyllabusCourse(currentCourseId()); if(!c) return;
  const wIdx=c.weeks.findIndex(w=>w.id===weekId); if(wIdx===-1) return;
  c.weeks[wIdx].completed=!c.weeks[wIdx].completed;
  c.updatedAt=Date.now();
  DB.saveSyllabusCourses(DB.getSyllabusCourses().map(x=>x.id===c.id?c:x));
  renderInfoCard();
  renderWeeksAccordion();
}

function deleteWeek(weekId){
  confirmAction({
    title:'Delete this week?', danger:true, icon:'bi-trash3', confirmLabel:'Delete Week',
    message:'This removes the week and all its topics and outcomes.',
    onConfirm(){
      const c=DB.getSyllabusCourse(currentCourseId()); if(!c) return;
      c.weeks=c.weeks.filter(w=>w.id!==weekId);
      c.updatedAt=Date.now();
      DB.saveSyllabusCourses(DB.getSyllabusCourses().map(x=>x.id===c.id?c:x));
      Toast.show('Week deleted');
      renderInfoCard();
      renderWeeksAccordion();
    }
  });
}

function createTaskForWeek(courseId,weekId){
  const c=DB.getSyllabusCourse(courseId); if(!c) return;
  const w=(c.weeks||[]).find(x=>x.id===weekId);
  location.href=`tasks.html?new=1&syllabusWeekId=${weekId}&semesterId=${c.semesterId}&title=${encodeURIComponent(w?w.title:'')}`;
}

/* ── Grading card ── */
function renderGradingCard(){
  const host=document.getElementById('svGradingCard'); if(!host) return;
  const c=DB.getSyllabusCourse(currentCourseId()); if(!c) return;
  const comps=c.gradingComponents||[];
  if(!comps.length){ host.innerHTML=''; return; }
  const total=comps.reduce((a,g)=>a+(g.weight||0),0);
  host.innerHTML=`<div class="glass card-pad fade-in">
    <div class="sv-section-title"><i class="bi bi-bar-chart-line"></i>Grading System</div>
    <div class="d-flex flex-column" style="gap:4px">
      ${comps.map(g=>`<div class="sv-grade-row">
        <div class="sv-grade-name">${escapeHtml(g.name)}</div>
        <div class="sv-grade-bar-cell">
          <div class="sv-grade-bar-track">
            <div class="sv-grade-bar-fill" style="width:${Math.min(100,g.weight||0)}%"></div>
          </div>
        </div>
        <div class="sv-grade-pct">${g.weight||0}%</div>
      </div>`).join('')}
    </div>
    ${Math.abs(total-100)>0.1?`<hr class="sv-grade-divider">
      <div class="sv-grade-total ${total===100?'ok':'warn'}">
        <span>Total</span><span>${total}%${total!==100?' — should equal 100%':''}</span>
      </div>`:''}
  </div>`;
}

/* ── Requirements card ── */
function renderRequirementsCard(){
  const host=document.getElementById('svReqCard'); if(!host) return;
  const c=DB.getSyllabusCourse(currentCourseId()); if(!c) return;
  const t=(c.requirements||'').trim();
  if(!t){ host.innerHTML=''; return; }
  // Split on newlines; lines starting with • or - become separate items
  const lines=t.split('\n').map(l=>l.replace(/^[\u2022\-]\s*/,'')).filter(Boolean);
  host.innerHTML=`<div class="glass card-pad fade-in">
    <div class="sv-section-title"><i class="bi bi-clipboard-check"></i>Course Requirements</div>
    <ul class="sv-req-list">
      ${lines.map(l=>`<li>
        <span class="sv-req-icon"><i class="bi bi-check2"></i></span>
        <span>${escapeHtml(l)}</span>
      </li>`).join('')}
    </ul>
  </div>`;
}

/* ── Policies card ── */
let _polExpanded=false;
function renderPoliciesCard(){
  const host=document.getElementById('svPoliciesCard'); if(!host) return;
  const c=DB.getSyllabusCourse(currentCourseId()); if(!c) return;
  const t=(c.policies||'').trim();
  if(!t){ host.innerHTML=''; return; }
  const lines=t.split('\n').map(l=>l.trim()).filter(Boolean);
  const SHOW=4;
  const shown=_polExpanded?lines:lines.slice(0,SHOW);
  host.innerHTML=`<div class="glass card-pad fade-in">
    <div class="sv-section-title"><i class="bi bi-shield-check"></i>Course Policies</div>
    <div class="sv-body-text">${shown.map(l=>escapeHtml(l)).join('<br>')}</div>
    ${lines.length>SHOW?`<button class="btn btn-ghost btn-sm sv-btn mt-2"
      onclick="_polExpanded=!_polExpanded;renderPoliciesCard()">
      ${_polExpanded?'<i class="bi bi-chevron-up me-1"></i>Show less':'<i class="bi bi-chevron-down me-1"></i>Show all'}
    </button>`:''}
  </div>`;
}

/* ── References card ── */
let _refsExpanded=false;
function renderReferencesCard(){
  const host=document.getElementById('svRefsCard'); if(!host) return;
  const c=DB.getSyllabusCourse(currentCourseId()); if(!c) return;
  const t=(c.references||'').trim();
  if(!t){ host.innerHTML=''; return; }
  const lines=t.split('\n').map(l=>l.trim()).filter(Boolean);
  const SHOW=4;
  const shown=_refsExpanded?lines:lines.slice(0,SHOW);
  host.innerHTML=`<div class="glass card-pad fade-in">
    <div class="sv-section-title"><i class="bi bi-book"></i>References</div>
    <ul class="sv-refs-list">${shown.map(l=>`<li>${escapeHtml(l)}</li>`).join('')}</ul>
    ${lines.length>SHOW?`<button class="btn btn-ghost btn-sm sv-btn mt-2"
      onclick="_refsExpanded=!_refsExpanded;renderReferencesCard()">
      ${_refsExpanded?'<i class="bi bi-chevron-up me-1"></i>Show less':'<i class="bi bi-chevron-down me-1"></i>Show all '+lines.length}
    </button>`:''}
  </div>`;
}

/* ============================================================
   WEEK MODAL  — full edit with resources + assessments
   ============================================================ */
let weekDraft=null, weekEditingId=null, weekEditingCourseId=null;

function openWeekModal(courseId,weekId){
  weekEditingCourseId=courseId;
  weekEditingId=weekId||null;
  const c=DB.getSyllabusCourse(courseId);
  const ex=weekId?c.weeks.find(w=>w.id===weekId):null;
  weekDraft=ex?JSON.parse(JSON.stringify(ex)):{
    title:'',dateRange:'',description:'',
    learningType:'unordered',learningOutcomes:[''],
    topics:[{id:DB.uid(),title:'',subtopics:['']}],
    activities:[''],resources:[''],assessments:['']
  };
  if(!weekDraft.activities) weekDraft.activities=[''];
  if(!weekDraft.resources) weekDraft.resources=[''];
  if(!weekDraft.assessments) weekDraft.assessments=[''];

  const weekNum=ex?c.weeks.indexOf(ex)+1:c.weeks.length+1;
  renderWeekModalBody(weekNum,!!ex);
  new bootstrap.Modal(document.getElementById('weekModal')).show();
}

function renderWeekModalBody(weekNum,isEdit){
  document.getElementById('weekModalBody').innerHTML=`
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h5 class="modal-title mb-0">
        <i class="bi bi-calendar3-week me-2"></i>${isEdit?'Edit':'Add'} Week
        <span class="chip ms-2">Week ${weekNum}</span>
      </h5>
      <button class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
    </div>

    <div class="row g-2 mb-3">
      <div class="col-12"><label class="syl-field-label">Week Title</label>
        <input class="form-control" id="wkTitle" placeholder="Course Orientation"
          value="${escapeHtml(weekDraft.title||'')}"></div>
      <div class="col-md-6"><label class="syl-field-label">Date Range</label>
        <input class="form-control" id="wkDateRange" placeholder="Aug 17 – Aug 21"
          value="${escapeHtml(weekDraft.dateRange||'')}"></div>
      <div class="col-md-6"><label class="syl-field-label">Description</label>
        <input class="form-control" id="wkDesc" placeholder="Brief overview"
          value="${escapeHtml(weekDraft.description||'')}"></div>
    </div>

    <div class="syl-modal-section-label">Learning Outcomes</div>
    <div class="d-flex gap-2 mb-2">
      <button type="button" class="btn btn-ghost btn-sm ${weekDraft.learningType==='unordered'?'active':''}"
        id="ltBulletBtn" onclick="setLearningType('unordered')"><i class="bi bi-list-ul me-1"></i>Bulleted</button>
      <button type="button" class="btn btn-ghost btn-sm ${weekDraft.learningType==='numbered'?'active':''}"
        id="ltNumberBtn" onclick="setLearningType('numbered')"><i class="bi bi-list-ol me-1"></i>Numbered</button>
    </div>
    <div id="outcomeRows">${weekDraft.learningOutcomes.map((o,i)=>outcomeRowHtml(o,i)).join('')}</div>
    <button type="button" class="btn btn-ghost btn-sm mb-3" onclick="addOutcome()">
      <i class="bi bi-plus-lg me-1"></i>Add Outcome</button>

    <div class="syl-modal-section-label">Topics</div>
    <div id="topicBlocks">${weekDraft.topics.map((t,ti)=>topicBlockHtml(t,ti)).join('')}</div>
    <button type="button" class="btn btn-ghost btn-sm mb-3" onclick="addMainTopic()">
      <i class="bi bi-plus-lg me-1"></i>Add Main Topic</button>

    <div class="syl-modal-section-label">Learning Activities / Methodology</div>
    <div id="activityRows">${weekDraft.activities.map((a,i)=>activityRowHtml(a,i)).join('')}</div>
    <button type="button" class="btn btn-ghost btn-sm mb-3" onclick="addActivity()">
      <i class="bi bi-plus-lg me-1"></i>Add Activity</button>

    <div class="syl-modal-section-label">Learning and Teaching Resources</div>
    <div id="resourceRows">${weekDraft.resources.map((r,i)=>resourceRowHtml(r,i)).join('')}</div>
    <button type="button" class="btn btn-ghost btn-sm mb-3" onclick="addResource()">
      <i class="bi bi-plus-lg me-1"></i>Add Resource</button>

    <div class="syl-modal-section-label">Assessment and Tasks</div>
    <div id="assessmentRows">${weekDraft.assessments.map((a,i)=>assessmentRowHtml(a,i)).join('')}</div>
    <button type="button" class="btn btn-ghost btn-sm mb-3" onclick="addAssessment()">
      <i class="bi bi-plus-lg me-1"></i>Add Assessment</button>

    <div class="d-flex gap-2 mt-2">
      <button class="btn btn-ghost flex-grow-1" data-bs-dismiss="modal">Cancel</button>
      <button class="btn btn-accent flex-grow-1" onclick="saveWeek()">
        <i class="bi bi-check2 me-1"></i>${isEdit?'Update':'Save'}</button>
    </div>`;
}

/* Row generators */
function outcomeRowHtml(v,i){
  return `<div class="syl-edit-row">
    <span class="syl-row-num">${i+1}.</span>
    <input class="form-control" value="${escapeHtml(v)}" oninput="weekDraft.learningOutcomes[${i}]=this.value">
    <button type="button" class="btn-icon" onclick="removeOutcome(${i})"><i class="bi bi-x-lg"></i></button>
  </div>`;
}
function activityRowHtml(v,i){
  return `<div class="syl-edit-row">
    <i class="bi bi-lightning-charge text-faint"></i>
    <input class="form-control" value="${escapeHtml(v)}"
      placeholder="Lecture / Lab / Discussion" oninput="weekDraft.activities[${i}]=this.value">
    <button type="button" class="btn-icon" onclick="removeActivity(${i})"><i class="bi bi-x-lg"></i></button>
  </div>`;
}
function resourceRowHtml(v,i){
  return `<div class="syl-edit-row">
    <i class="bi bi-book text-faint"></i>
    <input class="form-control" value="${escapeHtml(v)}"
      placeholder="Textbook / URL / Material" oninput="weekDraft.resources[${i}]=this.value">
    <button type="button" class="btn-icon" onclick="removeResource(${i})"><i class="bi bi-x-lg"></i></button>
  </div>`;
}
function assessmentRowHtml(v,i){
  return `<div class="syl-edit-row">
    <i class="bi bi-clipboard-check text-faint"></i>
    <input class="form-control" value="${escapeHtml(v)}"
      placeholder="Quiz / Assignment / Output" oninput="weekDraft.assessments[${i}]=this.value">
    <button type="button" class="btn-icon" onclick="removeAssessment(${i})"><i class="bi bi-x-lg"></i></button>
  </div>`;
}
function topicBlockHtml(t,ti){
  return `<div class="syl-topic-block">
    <div class="syl-edit-row mb-0">
      <input class="form-control" placeholder="Main Topic" value="${escapeHtml(t.title)}"
        oninput="weekDraft.topics[${ti}].title=this.value">
      <button type="button" class="btn-icon" onclick="removeMainTopic(${ti})"><i class="bi bi-trash3"></i></button>
    </div>
    <div class="syl-subtopics">
      ${(t.subtopics||[]).map((s,si)=>`<div class="syl-edit-row">
        <i class="bi bi-dash text-faint"></i>
        <input class="form-control form-control-sm" placeholder="Subtopic" value="${escapeHtml(s)}"
          oninput="weekDraft.topics[${ti}].subtopics[${si}]=this.value">
        <button type="button" class="btn-icon" onclick="removeSubtopic(${ti},${si})"><i class="bi bi-x-lg"></i></button>
      </div>`).join('')}
      <button type="button" class="btn btn-ghost btn-sm" onclick="addSubtopic(${ti})">
        <i class="bi bi-plus-lg me-1"></i>Add Subtopic</button>
    </div>
  </div>`;
}

/* Rerender helpers */
function addOutcome(){ weekDraft.learningOutcomes.push(''); rerenderOutcomes(); }
function removeOutcome(i){ weekDraft.learningOutcomes.splice(i,1); if(!weekDraft.learningOutcomes.length) weekDraft.learningOutcomes.push(''); rerenderOutcomes(); }
function rerenderOutcomes(){ document.getElementById('outcomeRows').innerHTML=weekDraft.learningOutcomes.map((o,i)=>outcomeRowHtml(o,i)).join(''); }

function addActivity(){ weekDraft.activities.push(''); rerenderActivities(); }
function removeActivity(i){ weekDraft.activities.splice(i,1); if(!weekDraft.activities.length) weekDraft.activities.push(''); rerenderActivities(); }
function rerenderActivities(){ document.getElementById('activityRows').innerHTML=weekDraft.activities.map((a,i)=>activityRowHtml(a,i)).join(''); }

function addResource(){ weekDraft.resources.push(''); rerenderResources(); }
function removeResource(i){ weekDraft.resources.splice(i,1); if(!weekDraft.resources.length) weekDraft.resources.push(''); rerenderResources(); }
function rerenderResources(){ document.getElementById('resourceRows').innerHTML=weekDraft.resources.map((r,i)=>resourceRowHtml(r,i)).join(''); }

function addAssessment(){ weekDraft.assessments.push(''); rerenderAssessments(); }
function removeAssessment(i){ weekDraft.assessments.splice(i,1); if(!weekDraft.assessments.length) weekDraft.assessments.push(''); rerenderAssessments(); }
function rerenderAssessments(){ document.getElementById('assessmentRows').innerHTML=weekDraft.assessments.map((a,i)=>assessmentRowHtml(a,i)).join(''); }

function addMainTopic(){ weekDraft.topics.push({id:DB.uid(),title:'',subtopics:['']}); rerenderTopics(); }
function removeMainTopic(ti){ weekDraft.topics.splice(ti,1); if(!weekDraft.topics.length) weekDraft.topics.push({id:DB.uid(),title:'',subtopics:['']}); rerenderTopics(); }
function addSubtopic(ti){ weekDraft.topics[ti].subtopics.push(''); rerenderTopics(); }
function removeSubtopic(ti,si){ weekDraft.topics[ti].subtopics.splice(si,1); if(!weekDraft.topics[ti].subtopics.length) weekDraft.topics[ti].subtopics.push(''); rerenderTopics(); }
function rerenderTopics(){ document.getElementById('topicBlocks').innerHTML=weekDraft.topics.map((t,ti)=>topicBlockHtml(t,ti)).join(''); }

function setLearningType(type){
  weekDraft.learningType=type;
  document.getElementById('ltBulletBtn').classList.toggle('active',type==='unordered');
  document.getElementById('ltNumberBtn').classList.toggle('active',type==='numbered');
}

function saveWeek(){
  const week={
    id:weekEditingId||DB.uid(),
    title:(document.getElementById('wkTitle').value||'').trim(),
    dateRange:(document.getElementById('wkDateRange').value||'').trim(),
    description:(document.getElementById('wkDesc').value||'').trim(),
    learningType:weekDraft.learningType,
    learningOutcomes:weekDraft.learningOutcomes.map(o=>o.trim()).filter(Boolean),
    topics:weekDraft.topics.map(t=>({id:t.id||DB.uid(),title:(t.title||'').trim(),subtopics:(t.subtopics||[]).map(s=>s.trim()).filter(Boolean)})).filter(t=>t.title),
    activities:weekDraft.activities.map(a=>a.trim()).filter(Boolean),
    resources:weekDraft.resources.map(r=>r.trim()).filter(Boolean),
    assessments:weekDraft.assessments.map(a=>a.trim()).filter(Boolean),
    completed:weekDraft.completed||false,
  };
  const courses=DB.getSyllabusCourses();
  const cIdx=courses.findIndex(c=>c.id===weekEditingCourseId); if(cIdx===-1) return;
  const c=courses[cIdx]; c.weeks=c.weeks||[];
  if(weekEditingId){ const wi=c.weeks.findIndex(w=>w.id===weekEditingId); if(wi!==-1) c.weeks[wi]=week; }
  else c.weeks.push(week);
  c.updatedAt=Date.now();
  DB.saveSyllabusCourses(courses);
  bootstrap.Modal.getInstance(document.getElementById('weekModal'))?.hide();
  Toast.show(weekEditingId?'Week updated':'Week added');
  weekDraft=null; weekEditingId=null;
  renderInfoCard();
  renderWeeksAccordion();
}

/* ============================================================
   EXPORT / IMPORT
   ============================================================ */
function exportSyllabus(courseId){
  const c=DB.getSyllabusCourse(courseId);
  if(!c){ Toast.show('Subject not found','high'); return; }
  const data={
    courseTitle:c.courseTitle, courseCode:c.courseCode, creditUnits:c.creditUnits,
    courseDescription:c.courseDescription||'', instructor:c.instructor||'',
    schedule:c.schedule||'', room:c.room||'',
    semester:c.semester||'', academicYear:c.academicYear||'',
    courseOutcomes:c.courseOutcomes||[], gradingComponents:c.gradingComponents||[],
    requirements:c.requirements||'', policies:c.policies||'', references:c.references||'',
    weeks:(c.weeks||[]).map((w,i)=>({
      week:i+1, title:w.title||'', dateRange:w.dateRange||'', description:w.description||'',
      learningType:w.learningType, learningOutcomes:w.learningOutcomes||[],
      topics:(w.topics||[]).map(t=>({title:t.title,subtopics:t.subtopics||[]})),
      activities:w.activities||[], resources:w.resources||[], assessments:w.assessments||[],
    })),
  };
  const slug=s=>(s||'').trim().replace(/\s+/g,'-').replace(/[^a-zA-Z0-9-]/g,'');
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=`${slug(c.courseCode)}-${slug(c.courseTitle)}.json`;
  a.click(); URL.revokeObjectURL(url);
  Toast.show(`Exported "${c.courseTitle}"`);
}

let pendingSyllabusImport=null;
function handleSyllabusImportFile(input){
  const file=input.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=e=>{
    let data;
    try{ data=JSON.parse(e.target.result); }
    catch{ Toast.show('Invalid JSON file','high','bi-exclamation-triangle'); return; }
    if(!data||!data.courseTitle||!data.courseCode||!Array.isArray(data.weeks)){
      Toast.show('Not a valid syllabus export','high','bi-exclamation-triangle'); return;
    }
    showSyllabusImportPreview(data);
  };
  reader.readAsText(file); input.value='';
}

function showSyllabusImportPreview(data){
  pendingSyllabusImport=data;
  const existing=DB.getSyllabusCourses().find(c=>c.courseCode.trim().toLowerCase()===data.courseCode.trim().toLowerCase());
  document.getElementById('syllabusImportModalBody').innerHTML=`
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h5 class="modal-title mb-0"><i class="bi bi-upload me-2"></i>Import Syllabus</h5>
      <button class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
    </div>
    <div class="list-row mb-1"><i class="bi bi-journal-bookmark text-soft"></i>
      <div><div class="fw-bold">${escapeHtml(data.courseTitle)}</div>
      <div class="text-faint" style="font-size:.74rem">${escapeHtml(data.courseCode)} · ${data.weeks.length} weeks</div></div>
    </div>
    ${existing?`<div class="mt-3 p-3 rounded" style="background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.3)">
      <div class="fw-bold mb-2" style="font-size:.84rem;color:#fbbf24">
        <i class="bi bi-exclamation-triangle me-1"></i>"${escapeHtml(data.courseCode)}" already exists
      </div>
      <div class="d-grid gap-2">
        <button class="btn btn-ghost btn-sm" onclick="doSyllabusImport('merge')">Merge weeks into existing</button>
        <button class="btn btn-ghost btn-sm" onclick="doSyllabusImport('replace')">Replace existing</button>
        <button class="btn btn-ghost btn-sm" onclick="doSyllabusImport('duplicate')">Create as duplicate</button>
      </div>
    </div>
    <button class="btn btn-ghost w-100 mt-2" data-bs-dismiss="modal">Cancel</button>`
    :`<div class="d-flex gap-2 mt-3">
      <button class="btn btn-ghost flex-grow-1" data-bs-dismiss="modal">Cancel</button>
      <button class="btn btn-accent flex-grow-1" onclick="doSyllabusImport('new')">
        <i class="bi bi-check2 me-1"></i>Import</button>
    </div>`}`;
  new bootstrap.Modal(document.getElementById('syllabusImportModal')).show();
}

function doSyllabusImport(mode){
  const data=pendingSyllabusImport; if(!data) return;
  const courses=DB.getSyllabusCourses();
  const existing=courses.find(c=>c.courseCode.trim().toLowerCase()===data.courseCode.trim().toLowerCase());
  const makeWeeks=()=>data.weeks.map(w=>({
    id:DB.uid(), title:w.title||'', dateRange:w.dateRange||'', description:w.description||'',
    learningType:w.learningType==='numbered'?'numbered':'unordered',
    learningOutcomes:w.learningOutcomes||[],
    topics:(w.topics||[]).map(t=>({id:DB.uid(),title:t.title||'',subtopics:t.subtopics||[]})),
    activities:w.activities||[], resources:w.resources||[], assessments:w.assessments||[],
    completed:false,
  }));
  if(mode==='merge'&&existing){
    existing.weeks=[...(existing.weeks||[]),...makeWeeks()]; existing.updatedAt=Date.now();
    DB.saveSyllabusCourses(courses);
  } else if(mode==='replace'&&existing){
    Object.assign(existing,{
      courseTitle:data.courseTitle, courseDescription:data.courseDescription||existing.courseDescription,
      creditUnits:data.creditUnits??existing.creditUnits, instructor:data.instructor||existing.instructor,
      schedule:data.schedule||existing.schedule||'', room:data.room||existing.room||'',
      semester:data.semester||existing.semester, academicYear:data.academicYear||existing.academicYear,
      courseOutcomes:data.courseOutcomes||existing.courseOutcomes||[],
      gradingComponents:data.gradingComponents||existing.gradingComponents||[],
      requirements:data.requirements||existing.requirements||'',
      policies:data.policies||existing.policies||'',
      references:data.references||existing.references||'',
      weeks:makeWeeks(), updatedAt:Date.now(),
    });
    DB.saveSyllabusCourses(courses);
  } else {
    courses.push({
      id:DB.uid(),
      courseTitle:mode==='duplicate'?`${data.courseTitle} (Imported)`:data.courseTitle,
      courseCode:data.courseCode, creditUnits:data.creditUnits||0,
      courseDescription:data.courseDescription||'', instructor:data.instructor||'',
      schedule:data.schedule||'', room:data.room||'',
      semester:data.semester||'', academicYear:data.academicYear||'',
      courseOutcomes:data.courseOutcomes||[], gradingComponents:data.gradingComponents||[],
      requirements:data.requirements||'', policies:data.policies||'', references:data.references||'',
      weeks:makeWeeks(), createdAt:Date.now(), updatedAt:Date.now(),
      semesterId:DB.getActiveSemesterId(),
    });
    DB.saveSyllabusCourses(courses);
  }
  bootstrap.Modal.getInstance(document.getElementById('syllabusImportModal'))?.hide();
  Toast.show('Syllabus imported');
  pendingSyllabusImport=null;
  if(document.getElementById('syllabusGrid')) renderSyllabusGrid();
}
