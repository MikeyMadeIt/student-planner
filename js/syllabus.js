/* ============================================================
   SYLLABUS.JS
   Course Syllabus module — subject list, interactive course roadmap
   (weeks accordion with completion, task integration, grading,
   learning outcomes, requirements, policies, references),
   export/import.
   ============================================================ */

const sylQs = new URLSearchParams(location.search);
function currentCourseId(){ return sylQs.get('id'); }
function escapeHtml(s){ const d=document.createElement('div'); d.textContent=s==null?'':String(s); return d.innerHTML; }
function timeAgo(ts){
  if(!ts) return 'Never';
  const s = Math.floor((Date.now()-ts)/1000);
  if(s<60) return 'Just now';
  if(s<3600) return Math.floor(s/60)+'m ago';
  if(s<86400) return Math.floor(s/3600)+'h ago';
  if(s<86400*30) return Math.floor(s/86400)+'d ago';
  return new Date(ts).toLocaleDateString([], {month:'short', day:'numeric'});
}
function fmtDate(ts){
  if(!ts) return '—';
  return new Date(ts).toLocaleDateString([], {month:'short', day:'numeric', year:'numeric'});
}
function fmtTime(t){
  if(!t) return '';
  const [h,m] = t.split(':');
  const hr = parseInt(h,10);
  const suffix = hr>=12?'PM':'AM';
  const hr12 = hr%12||12;
  return `${hr12}:${m} ${suffix}`;
}
function fmtDays(days){
  if(!days||!days.length) return '';
  const map={Mon:'M',Tue:'T',Wed:'W',Thu:'Th',Fri:'F',Sat:'Sa',Sun:'Su'};
  return days.map(d=>map[d]||d).join('');
}

/* ============================================================
   PROGRESS HELPERS
   ============================================================ */
function computeProgress(course){
  const weeks = course.weeks||[];
  if(!weeks.length) return { pct:0, completed:0, total:0 };
  const completed = weeks.filter(w=>w.completed).length;
  const total = weeks.length;
  const pct = Math.round((completed/total)*100);
  return { pct, completed, total };
}

/* ============================================================
   SYLLABUS.HTML — Subject List
   ============================================================ */
function initSyllabusList(){
  renderSyllabusGrid();
}

function renderSyllabusGrid(){
  const grid = document.getElementById('syllabusGrid');
  if(!grid) return;
  const semId = DB.getActiveSemesterId();
  const sem = DB.getActiveSemester();
  const allCourses = DB.getSyllabusCourses();
  const courses = allCourses.filter(c=>c.semesterId===semId);
  const q = (document.getElementById('syllabusSearch').value||'').toLowerCase().trim();
  const sortBy = document.getElementById('syllabusSort').value;

  let list = courses.filter(c=> !q || c.courseTitle.toLowerCase().includes(q) || c.courseCode.toLowerCase().includes(q));
  if(sortBy==='az') list.sort((a,b)=> a.courseTitle.localeCompare(b.courseTitle));
  else if(sortBy==='recent') list.sort((a,b)=> b.createdAt-a.createdAt);
  else list.sort((a,b)=> b.updatedAt-a.updatedAt);

  if(!list.length){
    grid.innerHTML = `<div class="col-12"><div class="glass card-pad text-center py-5 text-faint fade-in">
      <i class="bi bi-journal-bookmark" style="font-size:1.8rem;opacity:.5"></i>
      <div class="mt-2 fw-bold" style="color:var(--text)">${courses.length? 'No subjects match your search' : 'No syllabi yet'}</div>
      <div style="font-size:.85rem">${courses.length? 'Try a different course title or code.' : (sem ? `Tap "Add Subject" to add your first syllabus for ${sem.schoolYear} • ${sem.name}.` : 'Tap "Add Subject" to encode your first course syllabus.')}</div>
    </div></div>`;
    return;
  }

  grid.innerHTML = list.map(c=>{
    const weeks = c.weeks||[];
    const { pct, completed, total } = computeProgress(c);
    return `
    <div class="col-sm-6 col-lg-4">
      <div class="glass syllabus-card fade-in">
        <div class="d-flex justify-content-between align-items-start mb-2">
          <span class="chip code-chip">${escapeHtml(c.courseCode)}</span>
          <div class="dropdown">
            <button class="btn-icon" data-bs-toggle="dropdown"><i class="bi bi-three-dots"></i></button>
            <ul class="dropdown-menu dropdown-menu-end">
              <li><a class="dropdown-item" href="syllabus-view.html?id=${c.id}"><i class="bi bi-eye me-2"></i>View Syllabus</a></li>
              <li><a class="dropdown-item" href="#" onclick="openCourseModal('${c.id}');return false;"><i class="bi bi-pencil me-2"></i>Edit</a></li>
              <li><a class="dropdown-item" href="#" onclick="exportSyllabus('${c.id}');return false;"><i class="bi bi-download me-2"></i>Export JSON</a></li>
              <li><hr class="dropdown-divider"></li>
              <li><a class="dropdown-item text-danger" href="#" onclick="deleteCourse('${c.id}');return false;"><i class="bi bi-trash3 me-2"></i>Delete</a></li>
            </ul>
          </div>
        </div>
        <div class="fw-bold mb-1" style="font-size:1.02rem">${escapeHtml(c.courseTitle)}</div>
        <div class="text-faint mb-3" style="font-size:.78rem">${escapeHtml(c.instructor||'No instructor set')}</div>
        ${total>0?`
        <div class="mb-3">
          <div class="d-flex justify-content-between mb-1" style="font-size:.72rem;color:var(--text-faint)">
            <span>${completed}/${total} topics</span><span>${pct}%</span>
          </div>
          <div class="progress"><div class="progress-bar" style="width:${pct}%"></div></div>
        </div>`:''}
        <div class="d-flex gap-3 mb-3" style="font-size:.78rem">
          <span class="text-soft"><i class="bi bi-award me-1"></i>${c.creditUnits} unit${c.creditUnits==1?'':'s'}</span>
          <span class="text-soft"><i class="bi bi-calendar3-week me-1"></i>${weeks.length} week${weeks.length===1?'':'s'}</span>
        </div>
        <div class="text-faint mb-3" style="font-size:.72rem"><i class="bi bi-clock-history me-1"></i>Updated ${timeAgo(c.updatedAt)}</div>
        <div class="d-flex gap-2">
          <a href="syllabus-view.html?id=${c.id}" class="btn btn-accent btn-sm flex-grow-1"><i class="bi bi-journal-text me-1"></i>View Syllabus</a>
          <button class="btn-icon" onclick="openCourseModal('${c.id}')" title="Edit"><i class="bi bi-pencil"></i></button>
          <button class="btn-icon" onclick="deleteCourse('${c.id}')" title="Delete"><i class="bi bi-trash3"></i></button>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ============================================================
   ADD / EDIT SUBJECT MODAL (shared by list + detail pages)
   ============================================================ */
function openCourseModal(id){
  const c = id ? DB.getSyllabusCourse(id) : null;
  const activeSem = DB.getActiveSemester();
  const defaultSemName = activeSem ? activeSem.name : '1st Semester';
  const defaultYear = activeSem ? activeSem.schoolYear : '2026-2027';
  const body = document.getElementById('courseModalBody');
  body.innerHTML = `
    <div class="modal-header" style="border:none;padding:0 0 12px 0">
      <h5 class="modal-title"><i class="bi bi-journal-bookmark-fill me-2"></i>${c?'Edit':'Add'} Subject</h5>
      <button class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
    </div>
    <input type="hidden" id="cId" value="${c?c.id:''}">

    <div class="syl-modal-section-label">Course Information</div>
    <div class="row g-2">
      <div class="col-md-8"><label>Course Title *</label><input class="form-control" id="cTitle" placeholder="Data Structures" value="${c?escapeHtml(c.courseTitle):''}"></div>
      <div class="col-md-4"><label>Course Code *</label><input class="form-control" id="cCode" placeholder="CS211" value="${c?escapeHtml(c.courseCode):''}"></div>
      <div class="col-md-4"><label>Credit Units *</label><input type="number" min="0" step="0.5" class="form-control" id="cUnits" placeholder="3" value="${c?c.creditUnits:''}"></div>
      <div class="col-md-8"><label>Instructor</label><input class="form-control" id="cInstructor" placeholder="Optional" value="${c?escapeHtml(c.instructor||''):''}"></div>
      <div class="col-md-6"><label>Schedule</label><input class="form-control" id="cSchedule" placeholder="MWF 9:00 AM – 10:30 AM" value="${c?escapeHtml(c.schedule||''):''}"></div>
      <div class="col-md-6"><label>Room</label><input class="form-control" id="cRoom" placeholder="Room 304" value="${c?escapeHtml(c.room||''):''}"></div>
      <div class="col-12"><label>Course Description *</label><textarea class="form-control" id="cDesc" rows="3" placeholder="Introduction to fundamental concepts…">${c?escapeHtml(c.courseDescription):''}</textarea></div>
      <div class="col-md-6"><label>Semester</label><input class="form-control" id="cSemester" placeholder="1st Semester" value="${c?escapeHtml(c.semester||''):defaultSemName}"></div>
      <div class="col-md-6"><label>Academic Year</label><input class="form-control" id="cYear" placeholder="2026-2027" value="${c?escapeHtml(c.academicYear||''):defaultYear}"></div>
    </div>

    <div class="syl-modal-section-label mt-3">Learning Outcomes <span class="text-faint fw-normal" style="font-size:.75rem">(course-level)</span></div>
    <div id="cOutcomesWrap">
      ${(c&&c.courseOutcomes&&c.courseOutcomes.length?c.courseOutcomes:[''])
        .map((o,i)=>`<div class="syl-edit-row" id="cOutcomeRow${i}">
          <span class="text-faint mono" style="width:22px;flex-shrink:0;font-size:.78rem">${i+1}.</span>
          <input class="form-control" id="cOutcome${i}" value="${escapeHtml(o)}" placeholder="Understand fundamental concepts">
          <button type="button" class="btn-icon" onclick="removeCourseOutcome(${i})"><i class="bi bi-x-lg"></i></button>
        </div>`).join('')}
    </div>
    <button type="button" class="btn btn-ghost btn-sm mb-3" onclick="addCourseOutcome()"><i class="bi bi-plus-lg me-1"></i>Add Learning Outcome</button>

    <div class="syl-modal-section-label">Grading Components</div>
    <div id="cGradingWrap">
      ${(c&&c.gradingComponents&&c.gradingComponents.length?c.gradingComponents:[{name:'',weight:''}])
        .map((g,i)=>`<div class="syl-edit-row" id="cGradingRow${i}">
          <input class="form-control" id="cGradingName${i}" placeholder="Quizzes" value="${escapeHtml(g.name||'')}">
          <input class="form-control" type="number" min="0" max="100" step="1" id="cGradingWt${i}" placeholder="%" value="${g.weight||''}" style="width:80px;flex:0 0 80px">
          <span class="text-faint" style="font-size:.82rem">%</span>
          <button type="button" class="btn-icon" onclick="removeCourseGrading(${i})"><i class="bi bi-x-lg"></i></button>
        </div>`).join('')}
    </div>
    <button type="button" class="btn btn-ghost btn-sm mb-3" onclick="addCourseGrading()"><i class="bi bi-plus-lg me-1"></i>Add Component</button>

    <div class="syl-modal-section-label">Requirements</div>
    <textarea class="form-control mb-3" id="cRequirements" rows="3" placeholder="• Regular attendance&#10;• Completion of activities&#10;• Submission of requirements">${c?escapeHtml(c.requirements||''):''}</textarea>

    <div class="syl-modal-section-label">Important Policies</div>
    <textarea class="form-control mb-3" id="cPolicies" rows="3" placeholder="Attendance: Regular attendance required.&#10;Late Submission: Deductions may apply.">${c?escapeHtml(c.policies||''):''}</textarea>

    <div class="syl-modal-section-label">References</div>
    <textarea class="form-control mb-3" id="cReferences" rows="3" placeholder="Introduction to Algorithms, Cormen et al.&#10;Data Structures, Robert Lafore">${c?escapeHtml(c.references||''):''}</textarea>

    <div class="d-flex gap-2 mt-3">
      <button class="btn btn-accent flex-grow-1" onclick="saveCourse()"><i class="bi bi-check2 me-1"></i>${c?'Update':'Save'} Subject</button>
      ${c?`<button class="btn btn-ghost" onclick="deleteCourse('${c.id}')"><i class="bi bi-trash3"></i></button>`:''}
    </div>`;
  new bootstrap.Modal(document.getElementById('courseModal')).show();
}

/* Course-level outcomes helpers */
let _cOutcomeCount = 0;
function _getCourseOutcomeCount(){
  let i=0; while(document.getElementById('cOutcomeRow'+i)) i++;
  return i;
}
function addCourseOutcome(){
  const wrap = document.getElementById('cOutcomesWrap');
  const i = _getCourseOutcomeCount();
  const div = document.createElement('div');
  div.className = 'syl-edit-row';
  div.id = 'cOutcomeRow'+i;
  div.innerHTML = `<span class="text-faint mono" style="width:22px;flex-shrink:0;font-size:.78rem">${i+1}.</span>
    <input class="form-control" id="cOutcome${i}" placeholder="Learning outcome">
    <button type="button" class="btn-icon" onclick="removeCourseOutcome(${i})"><i class="bi bi-x-lg"></i></button>`;
  wrap.appendChild(div);
}
function removeCourseOutcome(i){
  const el = document.getElementById('cOutcomeRow'+i);
  if(el) el.remove();
  // Renumber
  let idx=0;
  document.querySelectorAll('#cOutcomesWrap .syl-edit-row').forEach(row=>{
    const span = row.querySelector('span.mono');
    if(span) span.textContent=(idx+1)+'.';
    idx++;
  });
}
function _readCourseOutcomes(){
  const outcomes=[];
  document.querySelectorAll('#cOutcomesWrap .syl-edit-row').forEach(row=>{
    const inp = row.querySelector('input.form-control');
    if(inp&&inp.value.trim()) outcomes.push(inp.value.trim());
  });
  return outcomes;
}

/* Grading helpers */
function _getGradingCount(){
  let i=0; while(document.getElementById('cGradingRow'+i)) i++;
  return i;
}
function addCourseGrading(){
  const wrap = document.getElementById('cGradingWrap');
  const i = _getGradingCount();
  const div = document.createElement('div');
  div.className = 'syl-edit-row';
  div.id = 'cGradingRow'+i;
  div.innerHTML = `<input class="form-control" id="cGradingName${i}" placeholder="Component">
    <input class="form-control" type="number" min="0" max="100" step="1" id="cGradingWt${i}" placeholder="%" style="width:80px;flex:0 0 80px">
    <span class="text-faint" style="font-size:.82rem">%</span>
    <button type="button" class="btn-icon" onclick="removeCourseGrading(${i})"><i class="bi bi-x-lg"></i></button>`;
  wrap.appendChild(div);
}
function removeCourseGrading(i){
  const el = document.getElementById('cGradingRow'+i);
  if(el) el.remove();
}
function _readGradingComponents(){
  const comps=[];
  document.querySelectorAll('#cGradingWrap .syl-edit-row').forEach(row=>{
    const nameEl = row.querySelector('input[id^="cGradingName"]');
    const wtEl = row.querySelector('input[type="number"]');
    const name = nameEl?nameEl.value.trim():'';
    const weight = wtEl?parseFloat(wtEl.value):0;
    if(name) comps.push({ name, weight: isNaN(weight)?0:weight });
  });
  return comps;
}

function saveCourse(){
  const courseTitle = document.getElementById('cTitle').value.trim();
  const courseCode = document.getElementById('cCode').value.trim();
  const unitsRaw = document.getElementById('cUnits').value.trim();
  const courseDescription = document.getElementById('cDesc').value.trim();

  if(!courseTitle || !courseCode || !courseDescription){
    Toast.show('Course Title, Code, and Description are required','high','bi-exclamation-triangle'); return;
  }
  if(unitsRaw==='' || isNaN(Number(unitsRaw))){
    Toast.show('Credit Units must be numeric','high','bi-exclamation-triangle'); return;
  }

  const semId = DB.getActiveSemesterId();
  const data = {
    courseTitle, courseCode, creditUnits:Number(unitsRaw), courseDescription,
    instructor: document.getElementById('cInstructor').value.trim(),
    schedule: document.getElementById('cSchedule').value.trim(),
    room: document.getElementById('cRoom').value.trim(),
    semester: document.getElementById('cSemester').value.trim(),
    academicYear: document.getElementById('cYear').value.trim(),
    semesterId: semId,
    courseOutcomes: _readCourseOutcomes(),
    gradingComponents: _readGradingComponents(),
    requirements: document.getElementById('cRequirements').value.trim(),
    policies: document.getElementById('cPolicies').value.trim(),
    references: document.getElementById('cReferences').value.trim(),
  };
  const id = document.getElementById('cId').value;
  const courses = DB.getSyllabusCourses();
  if(id){
    const idx = courses.findIndex(c=>c.id===id);
    courses[idx] = { ...courses[idx], ...data, updatedAt:Date.now() };
  } else {
    courses.push({ id:DB.uid(), ...data, weeks:[], createdAt:Date.now(), updatedAt:Date.now() });
  }
  DB.saveSyllabusCourses(courses);
  const inst = bootstrap.Modal.getInstance(document.getElementById('courseModal')); if(inst) inst.hide();
  Toast.show(id?'Subject updated':'Subject added');
  if(document.getElementById('syllabusGrid')) renderSyllabusGrid();
  if(document.getElementById('courseHeader')) renderCourseHeader();
  if(document.getElementById('svDescCard')) renderDescriptionCard();
  if(document.getElementById('svOutcomesCard')) renderOutcomesCard();
  if(document.getElementById('svGradingCard')) renderGradingCard();
  if(document.getElementById('svReqCard')) renderRequirementsCard();
  if(document.getElementById('svPoliciesCard')) renderPoliciesCard();
  if(document.getElementById('svRefsCard')) renderReferencesCard();
}

function deleteCourse(id){
  confirmAction({
    title:'Delete this subject?', danger:true, icon:'bi-trash3', confirmLabel:'Delete Subject',
    message:'This permanently removes the subject and its entire syllabus (all weeks, outcomes, and topics). This cannot be undone.',
    onConfirm(){
      DB.saveSyllabusCourses(DB.getSyllabusCourses().filter(c=>c.id!==id));
      Toast.show('Subject deleted');
      const inst = bootstrap.Modal.getInstance(document.getElementById('courseModal')); if(inst) inst.hide();
      if(document.getElementById('syllabusGrid')) renderSyllabusGrid();
      else location.href='syllabus.html';
    }
  });
}

/* ============================================================
   SYLLABUS-VIEW.HTML — interactive course roadmap
   ============================================================ */
function initSyllabusView(){
  if(!currentCourseId()){ location.href='syllabus.html'; return; }
  renderCourseHeader();
  renderDescriptionCard();
  renderWeeksAccordion();
  renderOutcomesCard();
  renderGradingCard();
  renderRequirementsCard();
  renderPoliciesCard();
  renderReferencesCard();
}

/* ---- Course Header with progress ---- */
function renderCourseHeader(){
  const host = document.getElementById('courseHeader');
  if(!host) return;
  const c = DB.getSyllabusCourse(currentCourseId());
  if(!c){
    host.innerHTML = `<div class="glass card-pad text-center py-5"><i class="bi bi-emoji-frown" style="font-size:1.6rem"></i><div class="mt-2 fw-bold">Subject not found</div><a href="syllabus.html" class="btn btn-ghost btn-sm mt-2">Back to Subjects</a></div>`;
    document.getElementById('addWeekFab')?.remove();
    return;
  }

  const { pct, completed, total } = computeProgress(c);

  // Try to find linked subject for schedule/room
  const subjects = DB.getSubjects();
  const linkedSubject = subjects.find(s=>s.code===c.courseCode && s.semesterId===c.semesterId);
  const schedule = c.schedule || (linkedSubject ? buildScheduleStr(linkedSubject) : '');
  const room = c.room || (linkedSubject ? (linkedSubject.room||'') : '');

  let schedRoomHtml = '';
  if(schedule || room){
    schedRoomHtml = `<div class="syl-header-meta-row"><i class="bi bi-clock text-soft"></i><span class="text-soft">${escapeHtml(schedule)}${schedule&&room?' · ':''}${escapeHtml(room)}</span></div>`;
  }

  host.innerHTML = `
    <div class="glass card-pad mb-3 fade-in syl-course-header-card">
      <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-1">
        <div class="min-width-0">
          <div class="d-flex align-items-center gap-2 mb-1 flex-wrap">
            <span class="chip code-chip">${escapeHtml(c.courseCode)}</span>
            <span class="text-faint" style="font-size:.78rem">${c.creditUnits} Unit${c.creditUnits===1?'':'s'}</span>
          </div>
          <h1 class="page-title mb-0">${escapeHtml(c.courseTitle)}</h1>
        </div>
        <div class="d-flex gap-2 flex-shrink-0">
          <button class="btn btn-ghost btn-sm" onclick="exportSyllabus('${c.id}')"><i class="bi bi-download me-1"></i>Export</button>
          <button class="btn btn-ghost btn-sm" onclick="openCourseModal('${c.id}')"><i class="bi bi-pencil me-1"></i>Edit</button>
        </div>
      </div>

      <div class="syl-header-meta">
        ${c.instructor?`<div class="syl-header-meta-row"><i class="bi bi-person text-soft"></i><span class="text-soft">${escapeHtml(c.instructor)}</span></div>`:''}
        ${schedRoomHtml}
        <div class="syl-header-meta-row"><i class="bi bi-calendar3 text-soft"></i><span class="text-soft">${escapeHtml(c.academicYear||'—')} · ${escapeHtml(c.semester||'—')}</span></div>
      </div>

      <div class="syl-progress-block mt-3">
        <div class="d-flex justify-content-between align-items-baseline mb-1">
          <span class="syl-progress-label">Course Progress</span>
          <span class="syl-progress-pct">${pct}%</span>
        </div>
        <div class="syl-progress-track">
          <div class="syl-progress-fill" style="width:${pct}%" id="sylProgressFill"></div>
        </div>
        <div class="syl-progress-sub">${completed} / ${total} topic${total===1?'':'s'} completed</div>
      </div>
    </div>`;

  document.title = `${c.courseCode} · Syllabus · Student Planner`;
}

function buildScheduleStr(s){
  if(!s) return '';
  const days = fmtDays(s.days||[]);
  const start = fmtTime(s.start);
  const end = fmtTime(s.end);
  if(start&&end) return `${days} ${start} – ${end}`.trim();
  return days;
}

/* ---- Description card ---- */
function renderDescriptionCard(){
  const host = document.getElementById('svDescCard');
  if(!host) return;
  const c = DB.getSyllabusCourse(currentCourseId());
  if(!c) return;
  const desc = c.courseDescription||'';
  host.innerHTML = `
    <div class="glass card-pad mb-3 fade-in">
      <div class="section-title"><i class="bi bi-file-text"></i>Course Description</div>
      ${desc
        ? `<p class="syl-desc-text">${escapeHtml(desc)}</p>`
        : `<p class="text-faint" style="font-size:.88rem;margin:0">No course description available.</p>`}
    </div>`;
}

/* ---- Search filter helper ---- */
function weekMatchesSearch(course, week, q){
  if(!q) return true;
  const weekNum = (course.weeks.indexOf(week)+1);
  if(String(weekNum).includes(q) || `week ${weekNum}`.includes(q)) return true;
  if(course.courseTitle.toLowerCase().includes(q) || course.courseCode.toLowerCase().includes(q)) return true;
  if((week.learningOutcomes||[]).some(o=>o.toLowerCase().includes(q))) return true;
  if((week.title||'').toLowerCase().includes(q)) return true;
  if((week.dateRange||'').toLowerCase().includes(q)) return true;
  for(const t of (week.topics||[])){
    if(t.title.toLowerCase().includes(q)) return true;
    if((t.subtopics||[]).some(s=>s.toLowerCase().includes(q))) return true;
  }
  return false;
}

/* ---- Course Outline (Weeks) ---- */
function renderWeeksAccordion(){
  const host = document.getElementById('weeksAccordion');
  if(!host) return;
  const c = DB.getSyllabusCourse(currentCourseId());
  if(!c) return;
  const q = ((document.getElementById('weekSearch')||{}).value||'').toLowerCase().trim();
  const weeks = c.weeks||[];

  if(!weeks.length){
    host.innerHTML = `<div class="syl-empty-state fade-in">
      <i class="bi bi-calendar3-week" style="font-size:1.8rem;opacity:.5"></i>
      <div class="mt-2 fw-bold" style="color:var(--text)">No topics added yet</div>
      <div style="font-size:.85rem">Tap "Add Week" to start building this course outline.</div>
    </div>`;
    return;
  }

  const matches = weeks.map(w=> weekMatchesSearch(c, w, q));
  const anyMatch = matches.some(Boolean);

  if(q && !anyMatch){
    host.innerHTML = `<div class="syl-empty-state fade-in"><i class="bi bi-search" style="font-size:1.6rem;opacity:.5"></i><div class="mt-2 fw-bold" style="color:var(--text)">No matches in this syllabus</div></div>`;
    return;
  }

  const semId = c.semesterId;
  const allTasks = DB.getTasks().filter(t=>t.semesterId===semId);

  host.innerHTML = weeks.map((w,i)=>{
    if(q && !matches[i]) return '';
    const weekNum = String(i+1).padStart(2,'0');
    const accId = `wk-${w.id}`;
    const isCompleted = !!w.completed;
    const topicCount = (w.topics||[]).length;
    const outcomeCount = (w.learningOutcomes||[]).length;

    // Related tasks: tasks linked to this week via syllabusWeekId or matching by subject
    const relatedTasks = allTasks.filter(t=> t.syllabusWeekId===w.id);

    const outcomeTag = w.learningType==='numbered' ? 'ol' : 'ul';
    const outcomesHtml = (w.learningOutcomes||[]).length
      ? `<${outcomeTag} class="syl-outcome-list">${w.learningOutcomes.map(o=>`<li>${escapeHtml(o)}</li>`).join('')}</${outcomeTag}>`
      : `<div class="text-faint" style="font-size:.82rem">No learning outcomes added.</div>`;

    const topicsHtml = (w.topics||[]).length
      ? w.topics.map(t=>`
        <div class="syl-main-topic">
          <div class="syl-main-topic-title"><i class="bi bi-bookmark-fill"></i>${escapeHtml(t.title)}</div>
          ${(t.subtopics||[]).length ? `<ul class="syl-subtopic-list">${t.subtopics.map(s=>`<li>${escapeHtml(s)}</li>`).join('')}</ul>` : ''}
        </div>`).join('')
      : `<div class="text-faint" style="font-size:.82rem">No topics added.</div>`;

    const activitiesHtml = (w.activities||[]).length
      ? `<div class="syl-body-section">
          <div class="syl-body-section-title"><i class="bi bi-lightning-charge"></i>Activities</div>
          <ul class="syl-outcome-list">${w.activities.map(a=>`<li>${escapeHtml(a)}</li>`).join('')}</ul>
        </div>` : '';

    const tasksHtml = `<div class="syl-body-section">
      <div class="syl-body-section-title"><i class="bi bi-check2-square"></i>Related Tasks
        <span class="text-faint fw-normal" style="font-size:.75rem">${relatedTasks.length} task${relatedTasks.length===1?'':'s'}</span>
      </div>
      ${relatedTasks.length
        ? `<div class="syl-task-list">${relatedTasks.map(t=>`
            <div class="syl-task-item ${t.status==='completed'?'completed':''}">
              <i class="bi ${t.status==='completed'?'bi-check-circle-fill':'bi-circle'} syl-task-icon"></i>
              <span class="syl-task-title">${escapeHtml(t.title)}</span>
              ${t.dueDate?`<span class="text-faint" style="font-size:.72rem;flex-shrink:0">${t.dueDate}</span>`:''}
            </div>`).join('')}
          </div>`
        : `<div class="text-faint" style="font-size:.82rem">No tasks linked to this topic.</div>`}
      <button class="btn btn-ghost btn-sm mt-2 syl-create-task-btn" onclick="createTaskForWeek('${c.id}','${w.id}')">
        <i class="bi bi-plus-lg me-1"></i>Create Task
      </button>
    </div>`;

    return `
    <div class="syl-week-item ${isCompleted?'completed':''}" id="weekItem-${w.id}">
      <div class="syl-week-header" onclick="toggleWeek('${w.id}')">
        <div class="syl-week-left">
          <div class="syl-week-badge ${isCompleted?'done':''}">
            ${isCompleted?'<i class="bi bi-check-lg"></i>':'<span>'+weekNum+'</span>'}
          </div>
          <div class="syl-week-info">
            <div class="syl-week-label">WEEK ${weekNum}</div>
            <div class="syl-week-title">${escapeHtml(w.title||'(Untitled)')}</div>
            ${w.dateRange?`<div class="syl-week-date">${escapeHtml(w.dateRange)}</div>`:''}
            <div class="syl-week-meta">
              ${outcomeCount?`<span>${outcomeCount} outcome${outcomeCount===1?'':'s'}</span>`:''}
              ${topicCount?`<span>${topicCount} topic${topicCount===1?'':'s'}</span>`:''}
              ${relatedTasks.length?`<span>${relatedTasks.length} task${relatedTasks.length===1?'':'s'}</span>`:''}
            </div>
          </div>
        </div>
        <div class="syl-week-actions" onclick="event.stopPropagation()">
          <button class="btn-icon syl-week-tool-btn" onclick="openWeekModal(currentCourseId(),'${w.id}')" title="Edit"><i class="bi bi-pencil"></i></button>
          <button class="btn-icon syl-week-tool-btn btn-icon-danger" onclick="deleteWeek('${w.id}')" title="Delete"><i class="bi bi-trash3"></i></button>
          <i class="bi bi-chevron-right syl-week-chevron" id="chevron-${w.id}"></i>
        </div>
      </div>
      <div class="syl-week-body" id="wkBody-${w.id}" style="display:none">
        <div class="syl-week-body-inner">
          ${w.title?`<div class="syl-body-section-title" style="font-size:1rem;font-weight:700;margin-bottom:12px">${escapeHtml(w.title)}</div>`:''}
          ${w.description?`<p class="syl-desc-text" style="margin-bottom:12px">${escapeHtml(w.description)}</p>`:''}

          <div class="syl-body-section">
            <div class="syl-body-section-title"><i class="bi bi-diagram-3"></i>Topics</div>
            ${topicsHtml}
          </div>

          <div class="syl-body-section">
            <div class="syl-body-section-title"><i class="bi bi-check2-square"></i>Learning Outcomes</div>
            ${outcomesHtml}
          </div>

          ${activitiesHtml}
          ${tasksHtml}

          <div class="syl-week-complete-row">
            <button class="btn ${isCompleted?'btn-ghost syl-btn-undo':'btn-accent'} btn-sm" onclick="toggleWeekComplete('${w.id}')">
              ${isCompleted
                ? '<i class="bi bi-arrow-counterclockwise me-1"></i>Mark as Incomplete'
                : '<i class="bi bi-check-lg me-1"></i>Mark as Completed'}
            </button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  // Restore open states
  (_openWeeks||[]).forEach(wid=>{
    const body = document.getElementById('wkBody-'+wid);
    const chev = document.getElementById('chevron-'+wid);
    if(body){ body.style.display='block'; }
    if(chev){ chev.classList.add('open'); }
  });
}

let _openWeeks = [];
function toggleWeek(wid){
  const body = document.getElementById('wkBody-'+wid);
  const chev = document.getElementById('chevron-'+wid);
  if(!body) return;
  const isOpen = body.style.display==='block';
  if(isOpen){
    body.style.display='none';
    chev && chev.classList.remove('open');
    _openWeeks = _openWeeks.filter(id=>id!==wid);
  } else {
    body.style.display='block';
    chev && chev.classList.add('open');
    if(!_openWeeks.includes(wid)) _openWeeks.push(wid);
  }
}

function toggleWeekComplete(weekId){
  const c = DB.getSyllabusCourse(currentCourseId()); if(!c) return;
  const wIdx = c.weeks.findIndex(w=>w.id===weekId); if(wIdx===-1) return;
  c.weeks[wIdx].completed = !c.weeks[wIdx].completed;
  c.updatedAt = Date.now();
  DB.saveSyllabusCourses(DB.getSyllabusCourses().map(x=>x.id===c.id?c:x));
  renderCourseHeader();
  renderWeeksAccordion();
}

function deleteWeek(weekId){
  confirmAction({
    title:'Delete this topic?', danger:true, icon:'bi-trash3', confirmLabel:'Delete Topic',
    message:'This removes the topic along with its learning outcomes and subtopics. Remaining topics will renumber automatically.',
    onConfirm(){
      const c = DB.getSyllabusCourse(currentCourseId()); if(!c) return;
      c.weeks = c.weeks.filter(w=>w.id!==weekId);
      c.updatedAt = Date.now();
      DB.saveSyllabusCourses(DB.getSyllabusCourses().map(x=>x.id===c.id?c:x));
      Toast.show('Topic deleted');
      renderCourseHeader();
      renderWeeksAccordion();
    }
  });
}

/* ---- Task creation from syllabus topic ---- */
function createTaskForWeek(courseId, weekId){
  const c = DB.getSyllabusCourse(courseId); if(!c) return;
  const w = (c.weeks||[]).find(x=>x.id===weekId);
  // Navigate to tasks page with pre-fill context
  const semId = c.semesterId;
  const params = new URLSearchParams({new:1, syllabusWeekId:weekId, semesterId:semId, title: w?w.title:''});
  location.href = `tasks.html?${params}`;
}

/* ---- Learning Outcomes card ---- */
function renderOutcomesCard(){
  const host = document.getElementById('svOutcomesCard');
  if(!host) return;
  const c = DB.getSyllabusCourse(currentCourseId());
  if(!c) return;
  const outcomes = c.courseOutcomes||[];
  host.innerHTML = `
    <div class="glass card-pad mb-3 fade-in">
      <div class="section-title"><i class="bi bi-bullseye"></i>Learning Outcomes</div>
      ${outcomes.length
        ? `<ul class="syl-course-outcomes">${outcomes.map(o=>`<li><i class="bi bi-check2-circle syl-outcome-icon"></i><span>${escapeHtml(o)}</span></li>`).join('')}</ul>`
        : `<p class="text-faint" style="font-size:.88rem;margin:0">No course learning outcomes added yet.</p>`}
    </div>`;
}

/* ---- Grading card ---- */
function renderGradingCard(){
  const host = document.getElementById('svGradingCard');
  if(!host) return;
  const c = DB.getSyllabusCourse(currentCourseId());
  if(!c) return;
  const comps = c.gradingComponents||[];
  if(!comps.length){ host.innerHTML=''; return; }

  const totalWeight = comps.reduce((acc,g)=>acc+(g.weight||0),0);
  host.innerHTML = `
    <div class="glass card-pad mb-3 fade-in">
      <div class="section-title"><i class="bi bi-bar-chart-line"></i>Grading</div>
      <div class="syl-grading-list">
        ${comps.map(g=>`
        <div class="syl-grading-row">
          <span class="syl-grading-name">${escapeHtml(g.name)}</span>
          <div class="syl-grading-bar-wrap">
            <div class="syl-grading-bar" style="width:${Math.min(100,g.weight||0)}%"></div>
          </div>
          <span class="syl-grading-pct">${g.weight||0}%</span>
        </div>`).join('')}
      </div>
      ${Math.abs(totalWeight-100)>0.1
        ? `<div class="syl-grading-total ${totalWeight===100?'ok':'warn'}">Total: ${totalWeight}%${totalWeight!==100?' (should equal 100%)':''}</div>`
        : ''}
    </div>`;
}

/* ---- Requirements card ---- */
function renderRequirementsCard(){
  const host = document.getElementById('svReqCard');
  if(!host) return;
  const c = DB.getSyllabusCourse(currentCourseId());
  if(!c) return;
  const reqs = (c.requirements||'').trim();
  if(!reqs){ host.innerHTML=''; return; }
  host.innerHTML = `
    <div class="glass card-pad mb-3 fade-in">
      <div class="section-title"><i class="bi bi-clipboard-check"></i>Requirements</div>
      <div class="syl-policy-text">${escapeHtml(reqs).replace(/\n/g,'<br>')}</div>
    </div>`;
}

/* ---- Policies card ---- */
function renderPoliciesCard(){
  const host = document.getElementById('svPoliciesCard');
  if(!host) return;
  const c = DB.getSyllabusCourse(currentCourseId());
  if(!c) return;
  const pol = (c.policies||'').trim();
  if(!pol){ host.innerHTML=''; return; }
  host.innerHTML = `
    <div class="glass card-pad mb-3 fade-in">
      <div class="section-title"><i class="bi bi-shield-check"></i>Important Policies</div>
      <div class="syl-policy-text">${escapeHtml(pol).replace(/\n/g,'<br>')}</div>
    </div>`;
}

/* ---- References card ---- */
let _refsExpanded = false;
function renderReferencesCard(){
  const host = document.getElementById('svRefsCard');
  if(!host) return;
  const c = DB.getSyllabusCourse(currentCourseId());
  if(!c) return;
  const refs = (c.references||'').trim();
  if(!refs){ host.innerHTML=''; return; }
  const lines = refs.split('\n').map(l=>l.trim()).filter(Boolean);
  const SHOW = 4;
  const hasMore = lines.length>SHOW;
  const visible = _refsExpanded ? lines : lines.slice(0,SHOW);
  host.innerHTML = `
    <div class="glass card-pad mb-3 fade-in">
      <div class="section-title"><i class="bi bi-book"></i>References</div>
      <ul class="syl-refs-list">${visible.map(l=>`<li>${escapeHtml(l)}</li>`).join('')}</ul>
      ${hasMore?`<button class="btn btn-ghost btn-sm mt-1" onclick="_refsExpanded=!_refsExpanded;renderReferencesCard()">
        ${_refsExpanded?'<i class="bi bi-chevron-up me-1"></i>Show less':'<i class="bi bi-chevron-down me-1"></i>Show all '+lines.length+' references'}
      </button>`:''}
    </div>`;
}

/* ============================================================
   ADD / EDIT WEEK MODAL (enhanced with title, dateRange, activities)
   ============================================================ */
let weekDraft = null;
let weekEditingId = null;
let weekEditingCourseId = null;

function openWeekModal(courseId, weekId){
  weekEditingCourseId = courseId;
  weekEditingId = weekId || null;
  const c = DB.getSyllabusCourse(courseId);
  const existing = weekId ? c.weeks.find(w=>w.id===weekId) : null;
  weekDraft = existing
    ? JSON.parse(JSON.stringify(existing))
    : { title:'', dateRange:'', description:'', learningType:'unordered', learningOutcomes:[''],
        topics:[{ id:DB.uid(), title:'', subtopics:[''] }], activities:[''] };
  if(!weekDraft.activities) weekDraft.activities=[''];
  if(!weekDraft.title) weekDraft.title='';
  if(!weekDraft.dateRange) weekDraft.dateRange='';
  if(!weekDraft.description) weekDraft.description='';

  const weekNum = existing ? c.weeks.indexOf(existing)+1 : c.weeks.length+1;
  renderWeekModalBody(weekNum, !!existing);
  new bootstrap.Modal(document.getElementById('weekModal')).show();
}

function renderWeekModalBody(weekNum, isEdit){
  const body = document.getElementById('weekModalBody');
  body.innerHTML = `
    <h5 class="mb-3"><i class="bi bi-calendar3-week me-2"></i>${isEdit?'Edit':'Add'} Topic <span class="chip ms-1">Week ${weekNum}</span></h5>

    <div class="row g-2 mb-3">
      <div class="col-12"><label>Topic Title</label><input class="form-control" id="wkTitle" placeholder="Arrays and Linked Lists" value="${escapeHtml(weekDraft.title||'')}"></div>
      <div class="col-md-6"><label>Date Range</label><input class="form-control" id="wkDateRange" placeholder="Aug 17 – Aug 21" value="${escapeHtml(weekDraft.dateRange||'')}"></div>
      <div class="col-md-6"><label>Description <span class="text-faint fw-normal">(optional)</span></label><input class="form-control" id="wkDesc" placeholder="Brief description" value="${escapeHtml(weekDraft.description||'')}"></div>
    </div>

    <div class="mb-3">
      <label>Learning Outcome List Type</label>
      <div class="d-flex gap-2">
        <button type="button" class="btn btn-ghost btn-sm ${weekDraft.learningType==='unordered'?'active':''}" id="ltBulletBtn" onclick="setLearningType('unordered')"><i class="bi bi-list-ul me-1"></i>Bulleted</button>
        <button type="button" class="btn btn-ghost btn-sm ${weekDraft.learningType==='numbered'?'active':''}" id="ltNumberBtn" onclick="setLearningType('numbered')"><i class="bi bi-list-ol me-1"></i>Numbered</button>
      </div>
    </div>

    <div class="mb-3">
      <label>Learning Outcomes</label>
      <div id="outcomeRows">${weekDraft.learningOutcomes.map((o,i)=>outcomeRowHtml(o,i)).join('')}</div>
      <button type="button" class="btn btn-ghost btn-sm mt-1" onclick="addOutcome()"><i class="bi bi-plus-lg me-1"></i>Add Learning Outcome</button>
    </div>

    <div class="mb-2">
      <label>Topics</label>
      <div id="topicBlocks">${weekDraft.topics.map((t,ti)=>topicBlockHtml(t,ti)).join('')}</div>
      <button type="button" class="btn btn-ghost btn-sm mt-1" onclick="addMainTopic()"><i class="bi bi-plus-lg me-1"></i>Add Main Topic</button>
    </div>

    <div class="mb-3 mt-3">
      <label>Activities <span class="text-faint fw-normal">(optional)</span></label>
      <div id="activityRows">${weekDraft.activities.map((a,i)=>activityRowHtml(a,i)).join('')}</div>
      <button type="button" class="btn btn-ghost btn-sm mt-1" onclick="addActivity()"><i class="bi bi-plus-lg me-1"></i>Add Activity</button>
    </div>

    <div class="d-flex gap-2 mt-3">
      <button class="btn btn-ghost flex-grow-1" data-bs-dismiss="modal">Cancel</button>
      <button class="btn btn-accent flex-grow-1" onclick="saveWeek()"><i class="bi bi-check2 me-1"></i>Save</button>
    </div>`;
}

function activityRowHtml(value, i){
  return `<div class="syl-edit-row">
    <i class="bi bi-lightning-charge text-faint"></i>
    <input class="form-control" value="${escapeHtml(value)}" placeholder="Lecture / Laboratory / Quiz" oninput="weekDraft.activities[${i}]=this.value">
    <button type="button" class="btn-icon" onclick="removeActivity(${i})"><i class="bi bi-x-lg"></i></button>
  </div>`;
}
function addActivity(){ weekDraft.activities.push(''); rerenderActivities(); }
function removeActivity(i){ weekDraft.activities.splice(i,1); if(!weekDraft.activities.length) weekDraft.activities.push(''); rerenderActivities(); }
function rerenderActivities(){ document.getElementById('activityRows').innerHTML = weekDraft.activities.map((a,i)=>activityRowHtml(a,i)).join(''); }

function outcomeRowHtml(value, i){
  return `<div class="syl-edit-row">
    <span class="text-faint mono" style="width:22px;flex-shrink:0;font-size:.78rem">${i+1}.</span>
    <input class="form-control" value="${escapeHtml(value)}" oninput="weekDraft.learningOutcomes[${i}]=this.value">
    <button type="button" class="btn-icon" onclick="removeOutcome(${i})"><i class="bi bi-x-lg"></i></button>
  </div>`;
}
function addOutcome(){ weekDraft.learningOutcomes.push(''); rerenderOutcomes(); }
function removeOutcome(i){ weekDraft.learningOutcomes.splice(i,1); if(!weekDraft.learningOutcomes.length) weekDraft.learningOutcomes.push(''); rerenderOutcomes(); }
function rerenderOutcomes(){ document.getElementById('outcomeRows').innerHTML = weekDraft.learningOutcomes.map((o,i)=>outcomeRowHtml(o,i)).join(''); }

function setLearningType(type){
  weekDraft.learningType = type;
  document.getElementById('ltBulletBtn').classList.toggle('active', type==='unordered');
  document.getElementById('ltNumberBtn').classList.toggle('active', type==='numbered');
}

function topicBlockHtml(topic, ti){
  return `<div class="syl-topic-block">
    <div class="syl-edit-row mb-0">
      <input class="form-control" placeholder="Main Topic" value="${escapeHtml(topic.title)}" oninput="weekDraft.topics[${ti}].title=this.value">
      <button type="button" class="btn-icon" onclick="removeMainTopic(${ti})" title="Delete main topic"><i class="bi bi-trash3"></i></button>
    </div>
    <div class="syl-subtopics">
      ${(topic.subtopics||[]).map((s,si)=>`
        <div class="syl-edit-row">
          <i class="bi bi-dash text-faint"></i>
          <input class="form-control form-control-sm" placeholder="Subtopic" value="${escapeHtml(s)}" oninput="weekDraft.topics[${ti}].subtopics[${si}]=this.value">
          <button type="button" class="btn-icon" onclick="removeSubtopic(${ti},${si})"><i class="bi bi-x-lg"></i></button>
        </div>`).join('')}
      <button type="button" class="btn btn-ghost btn-sm mt-1" onclick="addSubtopic(${ti})"><i class="bi bi-plus-lg me-1"></i>Add Subtopic</button>
    </div>
  </div>`;
}
function addMainTopic(){ weekDraft.topics.push({ id:DB.uid(), title:'', subtopics:[''] }); rerenderTopics(); }
function removeMainTopic(ti){
  weekDraft.topics.splice(ti,1);
  if(!weekDraft.topics.length) weekDraft.topics.push({ id:DB.uid(), title:'', subtopics:[''] });
  rerenderTopics();
}
function addSubtopic(ti){ weekDraft.topics[ti].subtopics.push(''); rerenderTopics(); }
function removeSubtopic(ti,si){
  weekDraft.topics[ti].subtopics.splice(si,1);
  if(!weekDraft.topics[ti].subtopics.length) weekDraft.topics[ti].subtopics.push('');
  rerenderTopics();
}
function rerenderTopics(){ document.getElementById('topicBlocks').innerHTML = weekDraft.topics.map((t,ti)=>topicBlockHtml(t,ti)).join(''); }

function saveWeek(){
  const title = (document.getElementById('wkTitle').value||'').trim();
  const dateRange = (document.getElementById('wkDateRange').value||'').trim();
  const description = (document.getElementById('wkDesc').value||'').trim();
  const cleanOutcomes = weekDraft.learningOutcomes.map(o=>o.trim()).filter(Boolean);
  const cleanTopics = weekDraft.topics
    .map(t=>({ id:t.id||DB.uid(), title:(t.title||'').trim(), subtopics:(t.subtopics||[]).map(s=>s.trim()).filter(Boolean) }))
    .filter(t=>t.title);
  const cleanActivities = weekDraft.activities.map(a=>a.trim()).filter(Boolean);

  const week = {
    id: weekEditingId || DB.uid(),
    title, dateRange, description,
    learningType: weekDraft.learningType,
    learningOutcomes: cleanOutcomes,
    topics: cleanTopics,
    activities: cleanActivities,
    completed: weekDraft.completed || false,
  };

  const courses = DB.getSyllabusCourses();
  const cIdx = courses.findIndex(c=>c.id===weekEditingCourseId);
  if(cIdx===-1) return;
  const c = courses[cIdx];
  c.weeks = c.weeks || [];
  if(weekEditingId){
    const wIdx = c.weeks.findIndex(w=>w.id===weekEditingId);
    if(wIdx!==-1) c.weeks[wIdx] = week;
  } else {
    c.weeks.push(week);
  }
  c.updatedAt = Date.now();
  DB.saveSyllabusCourses(courses);

  const inst = bootstrap.Modal.getInstance(document.getElementById('weekModal')); if(inst) inst.hide();
  Toast.show(weekEditingId?'Topic updated':'Topic added');
  weekDraft = null; weekEditingId = null;
  renderCourseHeader();
  renderWeeksAccordion();
}

/* ============================================================
   EXPORT / IMPORT
   ============================================================ */
function exportSyllabus(courseId){
  const c = DB.getSyllabusCourse(courseId);
  if(!c){ Toast.show('Subject not found','high'); return; }
  const data = {
    courseTitle:c.courseTitle, courseCode:c.courseCode, creditUnits:c.creditUnits,
    courseDescription:c.courseDescription, instructor:c.instructor||'',
    schedule:c.schedule||'', room:c.room||'',
    semester:c.semester||'', academicYear:c.academicYear||'',
    courseOutcomes:c.courseOutcomes||[],
    gradingComponents:c.gradingComponents||[],
    requirements:c.requirements||'',
    policies:c.policies||'',
    references:c.references||'',
    weeks:(c.weeks||[]).map((w,i)=>({
      week:i+1, title:w.title||'', dateRange:w.dateRange||'', description:w.description||'',
      learningType:w.learningType, learningOutcomes:w.learningOutcomes||[],
      topics:(w.topics||[]).map(t=>({ title:t.title, subtopics:t.subtopics||[] })),
      activities:w.activities||[],
    })),
  };
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${slugifySyllabus(c.courseCode)}-${slugifySyllabus(c.courseTitle)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  Toast.show(`Exported "${c.courseTitle}"`);
}
function slugifySyllabus(s){ return (s||'untitled').trim().replace(/\s+/g,'-').replace(/[^a-zA-Z0-9\-]/g,''); }

let pendingSyllabusImport = null;
function handleSyllabusImportFile(input){
  const file = input.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = (e)=>{
    let data;
    try{ data = JSON.parse(e.target.result); }
    catch(err){ Toast.show('That file is not valid JSON','high','bi-exclamation-triangle'); return; }
    if(!data || !data.courseTitle || !data.courseCode || !Array.isArray(data.weeks)){
      Toast.show('This doesn\'t look like a syllabus export','high','bi-exclamation-triangle'); return;
    }
    showSyllabusImportPreview(data);
  };
  reader.readAsText(file);
  input.value = '';
}
function showSyllabusImportPreview(data){
  pendingSyllabusImport = data;
  const existing = DB.getSyllabusCourses().find(c=> c.courseCode.trim().toLowerCase()===data.courseCode.trim().toLowerCase());
  const body = document.getElementById('syllabusImportModalBody');
  body.innerHTML = `
    <div class="modal-header" style="border:none;padding:0 0 12px 0">
      <h5 class="modal-title"><i class="bi bi-upload me-2"></i>Import Syllabus</h5>
      <button class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
    </div>
    <div class="list-row"><i class="bi bi-journal-bookmark text-soft"></i><div class="flex-grow-1"><b>${escapeHtml(data.courseTitle)}</b><div class="text-faint" style="font-size:.76rem">Course Title</div></div></div>
    <div class="list-row"><i class="bi bi-hash text-soft"></i><div class="flex-grow-1">${escapeHtml(data.courseCode)}<div class="text-faint" style="font-size:.76rem">Course Code</div></div></div>
    <div class="list-row"><i class="bi bi-calendar3-week text-soft"></i><div class="flex-grow-1">${data.weeks.length} weeks<div class="text-faint" style="font-size:.76rem">Weeks Included</div></div></div>

    ${existing ? `
      <div class="mt-3 p-3" style="background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.3);border-radius:var(--radius-md)">
        <div class="fw-bold mb-2" style="font-size:.85rem"><i class="bi bi-exclamation-triangle me-1" style="color:#fbbf24"></i>A subject with code "${escapeHtml(data.courseCode)}" already exists</div>
        <div class="d-grid gap-2">
          <button class="btn btn-ghost btn-sm" onclick="doSyllabusImport('merge')">Merge Weeks into Existing Syllabus</button>
          <button class="btn btn-ghost btn-sm" onclick="doSyllabusImport('replace')">Replace Existing Syllabus</button>
          <button class="btn btn-ghost btn-sm" onclick="doSyllabusImport('duplicate')">Create as Duplicate Subject</button>
        </div>
      </div>
      <button class="btn btn-ghost w-100 mt-2" data-bs-dismiss="modal">Cancel</button>
    ` : `
      <div class="d-flex gap-2 mt-3">
        <button class="btn btn-ghost flex-grow-1" data-bs-dismiss="modal">Cancel</button>
        <button class="btn btn-accent flex-grow-1" onclick="doSyllabusImport('new')"><i class="bi bi-check2 me-1"></i>Import</button>
      </div>
    `}`;
  new bootstrap.Modal(document.getElementById('syllabusImportModal')).show();
}
function doSyllabusImport(mode){
  const data = pendingSyllabusImport; if(!data) return;
  const courses = DB.getSyllabusCourses();
  const existing = courses.find(c=> c.courseCode.trim().toLowerCase()===data.courseCode.trim().toLowerCase());

  const makeWeeks = ()=> data.weeks.map(w=>({
    id: DB.uid(), title:w.title||'', dateRange:w.dateRange||'', description:w.description||'',
    learningType: w.learningType==='numbered'?'numbered':'unordered',
    learningOutcomes: w.learningOutcomes||[],
    topics: (w.topics||[]).map(t=>({ id:DB.uid(), title:t.title||'', subtopics:t.subtopics||[] })),
    activities: w.activities||[],
    completed: false,
  }));

  if(mode==='merge' && existing){
    existing.weeks = [...(existing.weeks||[]), ...makeWeeks()];
    existing.updatedAt = Date.now();
    DB.saveSyllabusCourses(courses);
  } else if(mode==='replace' && existing){
    existing.courseTitle = data.courseTitle; existing.courseDescription = data.courseDescription||existing.courseDescription;
    existing.creditUnits = data.creditUnits ?? existing.creditUnits;
    existing.instructor = data.instructor||existing.instructor;
    existing.schedule = data.schedule||existing.schedule||'';
    existing.room = data.room||existing.room||'';
    existing.semester = data.semester||existing.semester; existing.academicYear = data.academicYear||existing.academicYear;
    existing.courseOutcomes = data.courseOutcomes||existing.courseOutcomes||[];
    existing.gradingComponents = data.gradingComponents||existing.gradingComponents||[];
    existing.requirements = data.requirements||existing.requirements||'';
    existing.policies = data.policies||existing.policies||'';
    existing.references = data.references||existing.references||'';
    existing.weeks = makeWeeks();
    existing.updatedAt = Date.now();
    DB.saveSyllabusCourses(courses);
  } else {
    courses.push({
      id:DB.uid(), courseTitle: mode==='duplicate' ? `${data.courseTitle} (Imported)` : data.courseTitle,
      courseCode: data.courseCode, creditUnits: data.creditUnits||0, courseDescription: data.courseDescription||'',
      instructor: data.instructor||'', schedule: data.schedule||'', room: data.room||'',
      semester: data.semester||'', academicYear: data.academicYear||'',
      courseOutcomes: data.courseOutcomes||[], gradingComponents: data.gradingComponents||[],
      requirements: data.requirements||'', policies: data.policies||'', references: data.references||'',
      weeks: makeWeeks(), createdAt:Date.now(), updatedAt:Date.now(),
      semesterId: DB.getActiveSemesterId(),
    });
    DB.saveSyllabusCourses(courses);
  }

  const inst = bootstrap.Modal.getInstance(document.getElementById('syllabusImportModal')); if(inst) inst.hide();
  Toast.show('Syllabus imported successfully');
  pendingSyllabusImport = null;
  if(document.getElementById('syllabusGrid')) renderSyllabusGrid();
}
