/* ============================================================
   SYLLABUS.JS
   Course Syllabus module — subject list, syllabus detail (weeks
   accordion with learning outcomes + topics/subtopics), export/import.
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
    <div class="row g-2">
      <div class="col-md-8"><label>Course Title *</label><input class="form-control" id="cTitle" placeholder="Data Structures" value="${c?escapeHtml(c.courseTitle):''}"></div>
      <div class="col-md-4"><label>Course Code *</label><input class="form-control" id="cCode" placeholder="CS211" value="${c?escapeHtml(c.courseCode):''}"></div>
      <div class="col-md-4"><label>Credit Units *</label><input type="number" min="0" step="0.5" class="form-control" id="cUnits" placeholder="3" value="${c?c.creditUnits:''}"></div>
      <div class="col-md-8"><label>Instructor</label><input class="form-control" id="cInstructor" placeholder="Optional" value="${c?escapeHtml(c.instructor||''):''}"></div>
      <div class="col-12"><label>Course Description *</label><textarea class="form-control" id="cDesc" rows="3" placeholder="Introduction to linear and non-linear data structures…">${c?escapeHtml(c.courseDescription):''}</textarea></div>
      <div class="col-md-6"><label>Semester</label><input class="form-control" id="cSemester" placeholder="1st Semester" value="${c?escapeHtml(c.semester||''):defaultSemName}"></div>
      <div class="col-md-6"><label>Academic Year</label><input class="form-control" id="cYear" placeholder="2026-2027" value="${c?escapeHtml(c.academicYear||''):defaultYear}"></div>
    </div>
    <div class="d-flex gap-2 mt-3">
      <button class="btn btn-accent flex-grow-1" onclick="saveCourse()"><i class="bi bi-check2 me-1"></i>${c?'Update':'Save'} Subject</button>
      ${c?`<button class="btn btn-ghost" onclick="deleteCourse('${c.id}')"><i class="bi bi-trash3"></i></button>`:''}
    </div>`;
  new bootstrap.Modal(document.getElementById('courseModal')).show();
  new bootstrap.Modal(document.getElementById('courseModal')).show();
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
    semester: document.getElementById('cSemester').value.trim(),
    academicYear: document.getElementById('cYear').value.trim(),
    semesterId: semId,
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
   SYLLABUS-VIEW.HTML — course header + weeks accordion
   ============================================================ */
function initSyllabusView(){
  if(!currentCourseId()){ location.href='syllabus.html'; return; }
  renderCourseHeader();
  renderWeeksAccordion();
}

function renderCourseHeader(){
  const host = document.getElementById('courseHeader');
  if(!host) return;
  const c = DB.getSyllabusCourse(currentCourseId());
  if(!c){
    host.innerHTML = `<div class="glass card-pad text-center py-5"><i class="bi bi-emoji-frown" style="font-size:1.6rem"></i><div class="mt-2 fw-bold">Subject not found</div><a href="syllabus.html" class="btn btn-ghost btn-sm mt-2">Back to Subjects</a></div>`;
    document.getElementById('addWeekFab')?.remove();
    return;
  }
  host.innerHTML = `
    <div class="glass card-pad mb-3 fade-in">
      <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
        <div>
          <span class="chip code-chip mb-2 d-inline-block">${escapeHtml(c.courseCode)}</span>
          <h1 class="page-title mb-1">${escapeHtml(c.courseTitle)}</h1>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-ghost btn-sm" onclick="exportSyllabus('${c.id}')"><i class="bi bi-download me-1"></i>Export</button>
          <button class="btn btn-ghost btn-sm" onclick="openCourseModal('${c.id}')"><i class="bi bi-pencil me-1"></i>Edit</button>
        </div>
      </div>
      <p class="text-soft mb-3" style="font-size:.9rem">${escapeHtml(c.courseDescription)}</p>
      <div class="row g-2">
        <div class="col-6 col-md-3"><div class="list-row" style="background:var(--surface-2);border-radius:12px"><i class="bi bi-award text-soft"></i><div><div class="fw-bold" style="font-size:.85rem">${c.creditUnits}</div><div class="text-faint" style="font-size:.68rem">Credit Units</div></div></div></div>
        <div class="col-6 col-md-3"><div class="list-row" style="background:var(--surface-2);border-radius:12px"><i class="bi bi-calendar3-week text-soft"></i><div><div class="fw-bold" style="font-size:.85rem">${(c.weeks||[]).length}</div><div class="text-faint" style="font-size:.68rem">Total Weeks</div></div></div></div>
        <div class="col-6 col-md-3"><div class="list-row" style="background:var(--surface-2);border-radius:12px"><i class="bi bi-mortarboard text-soft"></i><div><div class="fw-bold" style="font-size:.85rem">${escapeHtml(c.semester||'—')}</div><div class="text-faint" style="font-size:.68rem">Semester</div></div></div></div>
        <div class="col-6 col-md-3"><div class="list-row" style="background:var(--surface-2);border-radius:12px"><i class="bi bi-clock-history text-soft"></i><div><div class="fw-bold" style="font-size:.85rem">${timeAgo(c.updatedAt)}</div><div class="text-faint" style="font-size:.68rem">Last Updated</div></div></div></div>
      </div>
      ${(c.instructor||c.academicYear) ? `<div class="text-faint mt-3" style="font-size:.78rem">
        ${c.instructor?`<i class="bi bi-person me-1"></i>${escapeHtml(c.instructor)}`:''}
        ${c.instructor&&c.academicYear?' · ':''}
        ${c.academicYear?`<i class="bi bi-calendar3 me-1"></i>${escapeHtml(c.academicYear)}`:''}
      </div>`:''}
    </div>`;
  document.title = `${c.courseCode} · Syllabus · Student Planner`;
}

function weekMatchesSearch(course, week, q){
  if(!q) return true;
  const weekNum = (course.weeks.indexOf(week)+1);
  if(String(weekNum).includes(q) || `week ${weekNum}`.includes(q)) return true;
  if(course.courseTitle.toLowerCase().includes(q) || course.courseCode.toLowerCase().includes(q)) return true;
  if((week.learningOutcomes||[]).some(o=>o.toLowerCase().includes(q))) return true;
  for(const t of (week.topics||[])){
    if(t.title.toLowerCase().includes(q)) return true;
    if((t.subtopics||[]).some(s=>s.toLowerCase().includes(q))) return true;
  }
  return false;
}

function renderWeeksAccordion(){
  const host = document.getElementById('weeksAccordion');
  if(!host) return;
  const c = DB.getSyllabusCourse(currentCourseId());
  if(!c) return;
  const q = (document.getElementById('weekSearch').value||'').toLowerCase().trim();
  const weeks = c.weeks||[];

  if(!weeks.length){
    host.innerHTML = `<div class="glass card-pad text-center py-5 text-faint fade-in">
      <i class="bi bi-calendar3-week" style="font-size:1.8rem;opacity:.5"></i>
      <div class="mt-2 fw-bold" style="color:var(--text)">No weeks added yet</div>
      <div style="font-size:.85rem">Tap "Add Week" to start building this syllabus.</div>
    </div>`;
    return;
  }

  const matches = weeks.map(w=> weekMatchesSearch(c, w, q));
  const anyMatch = matches.some(Boolean);

  if(q && !anyMatch){
    host.innerHTML = `<div class="glass card-pad text-center py-5 text-faint fade-in"><i class="bi bi-search" style="font-size:1.6rem;opacity:.5"></i><div class="mt-2 fw-bold" style="color:var(--text)">No matches in this syllabus</div></div>`;
    return;
  }

  host.innerHTML = weeks.map((w,i)=>{
    if(q && !matches[i]) return '';
    const weekNum = i+1;
    const accId = `wk-${w.id}`;
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

    return `
    <div class="accordion-item">
      <h2 class="accordion-header">
        <button class="accordion-button ${q?'':'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#${accId}">
          Week ${weekNum}
          <span class="text-faint ms-2" style="font-size:.72rem;font-weight:600">${(w.learningOutcomes||[]).length} outcome${(w.learningOutcomes||[]).length===1?'':'s'} · ${(w.topics||[]).length} topic${(w.topics||[]).length===1?'':'s'}</span>
        </button>
        <div class="syl-week-tools">
          <button class="btn-icon" onclick="openWeekModal(currentCourseId(),'${w.id}')" title="Edit week"><i class="bi bi-pencil"></i></button>
          <button class="btn-icon btn-icon-danger" onclick="deleteWeek('${w.id}')" title="Delete week"><i class="bi bi-trash3"></i></button>
        </div>
      </h2>
      <div id="${accId}" class="accordion-collapse collapse ${q?'show':''}">
        <div class="accordion-body">
          <div class="section-title" style="font-size:.85rem"><i class="bi bi-check2-square"></i>Learning Outcomes</div>
          ${outcomesHtml}
          <hr class="divider">
          <div class="section-title" style="font-size:.85rem"><i class="bi bi-diagram-3"></i>Topics</div>
          ${topicsHtml}
        </div>
      </div>
    </div>`;
  }).join('');
}

function deleteWeek(weekId){
  confirmAction({
    title:'Delete this week?', danger:true, icon:'bi-trash3', confirmLabel:'Delete Week',
    message:'This removes the week along with its learning outcomes and topics. Remaining weeks will renumber automatically.',
    onConfirm(){
      const c = DB.getSyllabusCourse(currentCourseId()); if(!c) return;
      c.weeks = c.weeks.filter(w=>w.id!==weekId);
      c.updatedAt = Date.now();
      const courses = DB.getSyllabusCourses();
      DB.saveSyllabusCourses(courses.map(x=> x.id===c.id ? c : x));
      Toast.show('Week deleted');
      renderWeeksAccordion();
      renderCourseHeader();
    }
  });
}

/* ============================================================
   ADD / EDIT WEEK MODAL
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
    : { learningType:'unordered', learningOutcomes:[''], topics:[{ id:DB.uid(), title:'', subtopics:[''] }] };

  const weekNum = existing ? c.weeks.indexOf(existing)+1 : c.weeks.length+1;
  renderWeekModalBody(weekNum, !!existing);
  new bootstrap.Modal(document.getElementById('weekModal')).show();
}

function renderWeekModalBody(weekNum, isEdit){
  const body = document.getElementById('weekModalBody');
  body.innerHTML = `
    <h5 class="mb-3"><i class="bi bi-calendar3-week me-2"></i>${isEdit?'Edit':'Add'} Week <span class="chip ms-1">Week ${weekNum}</span></h5>

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

    <div class="d-flex gap-2 mt-3">
      <button class="btn btn-ghost flex-grow-1" data-bs-dismiss="modal">Cancel</button>
      <button class="btn btn-accent flex-grow-1" onclick="saveWeek()"><i class="bi bi-check2 me-1"></i>Save</button>
    </div>`;
}

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
  const cleanOutcomes = weekDraft.learningOutcomes.map(o=>o.trim()).filter(Boolean);
  const cleanTopics = weekDraft.topics
    .map(t=>({ id:t.id||DB.uid(), title:(t.title||'').trim(), subtopics:(t.subtopics||[]).map(s=>s.trim()).filter(Boolean) }))
    .filter(t=>t.title);

  const week = { id: weekEditingId || DB.uid(), learningType: weekDraft.learningType, learningOutcomes: cleanOutcomes, topics: cleanTopics };

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
  Toast.show(weekEditingId?'Week updated':'Week added');
  weekDraft = null; weekEditingId = null;
  renderWeeksAccordion();
  renderCourseHeader();
}

/* ============================================================
   EXPORT / IMPORT
   ============================================================ */
function exportSyllabus(courseId){
  const c = DB.getSyllabusCourse(courseId);
  if(!c){ Toast.show('Subject not found','high'); return; }
  const data = {
    courseTitle:c.courseTitle, courseCode:c.courseCode, creditUnits:c.creditUnits,
    courseDescription:c.courseDescription, instructor:c.instructor||'', semester:c.semester||'', academicYear:c.academicYear||'',
    weeks:(c.weeks||[]).map((w,i)=>({
      week:i+1, learningType:w.learningType, learningOutcomes:w.learningOutcomes||[],
      topics:(w.topics||[]).map(t=>({ title:t.title, subtopics:t.subtopics||[] })),
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
    id: DB.uid(), learningType: w.learningType==='numbered'?'numbered':'unordered',
    learningOutcomes: w.learningOutcomes||[],
    topics: (w.topics||[]).map(t=>({ id:DB.uid(), title:t.title||'', subtopics:t.subtopics||[] })),
  }));

  if(mode==='merge' && existing){
    existing.weeks = [...(existing.weeks||[]), ...makeWeeks()];
    existing.updatedAt = Date.now();
    DB.saveSyllabusCourses(courses);
  } else if(mode==='replace' && existing){
    existing.courseTitle = data.courseTitle; existing.courseDescription = data.courseDescription||existing.courseDescription;
    existing.creditUnits = data.creditUnits ?? existing.creditUnits;
    existing.instructor = data.instructor||existing.instructor; existing.semester = data.semester||existing.semester; existing.academicYear = data.academicYear||existing.academicYear;
    existing.weeks = makeWeeks();
    existing.updatedAt = Date.now();
    DB.saveSyllabusCourses(courses);
  } else {
    courses.push({
      id:DB.uid(), courseTitle: mode==='duplicate' ? `${data.courseTitle} (Imported)` : data.courseTitle,
      courseCode: data.courseCode, creditUnits: data.creditUnits||0, courseDescription: data.courseDescription||'',
      instructor: data.instructor||'', semester: data.semester||'', academicYear: data.academicYear||'',
      weeks: makeWeeks(), createdAt:Date.now(), updatedAt:Date.now(),
    });
    DB.saveSyllabusCourses(courses);
  }

  const inst = bootstrap.Modal.getInstance(document.getElementById('syllabusImportModal')); if(inst) inst.hide();
  Toast.show('Syllabus imported successfully');
  pendingSyllabusImport = null;
  if(document.getElementById('syllabusGrid')) renderSyllabusGrid();
}
