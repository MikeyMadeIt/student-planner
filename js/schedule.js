/* ============================================================
   SCHEDULE.JS — Multi-Semester Edition
   ============================================================ */

let currentView = 'card';
let showArchived = false;
let ttHourHeight = 52;

function initSchedule(){
  renderAllViews();
  document.getElementById('searchInput').addEventListener('input', debounce(renderAllViews, 200));
  document.getElementById('filterDay').addEventListener('change', renderAllViews);
  document.getElementById('sortBy').addEventListener('change', renderAllViews);

  const params = new URLSearchParams(location.search);
  if(params.get('new')==='1') openSubjectModal();
}

function toggleArchivedView(){
  showArchived = !showArchived;
  document.getElementById('archiveToggleBtn').classList.toggle('active', showArchived);
  renderAllViews();
}

function getFilteredSubjects(){
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  const day = document.getElementById('filterDay').value;
  const sortBy = document.getElementById('sortBy').value;
  const semId = DB.getActiveSemesterId();

  let list = DB.getSubjects().filter(s => {
    if(s.semesterId !== semId) return false;
    if(!showArchived && s.archived) return false;
    return true;
  });

  if(day) list = list.filter(s=>s.days.includes(day));
  if(q) list = list.filter(s=>
    s.code.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q) ||
    s.professor.toLowerCase().includes(q) || s.room.toLowerCase().includes(q) || s.building.toLowerCase().includes(q));

  if(sortBy==='time') list.sort((a,b)=>a.start.localeCompare(b.start));
  else if(sortBy==='code') list.sort((a,b)=>a.code.localeCompare(b.code));
  else if(sortBy==='professor') list.sort((a,b)=>a.professor.localeCompare(b.professor));
  return list;
}

function switchView(v){
  currentView = v;
  document.querySelectorAll('.sched-toggle-btn[data-view]').forEach(b=>b.classList.toggle('active', b.dataset.view===v));
  document.getElementById('cardView').classList.toggle('d-none', v!=='card');
  document.getElementById('timetableView').classList.toggle('d-none', v!=='timetable');
  document.getElementById('timelineView').classList.toggle('d-none', v!=='timeline');
  renderAllViews();
}

function renderAllViews(){
  if(currentView==='card') renderCardView();
  else if(currentView==='timetable') renderTimetable();
  else renderTimelineView();
}

/* ---------- CARD VIEW ---------- */
function renderCardView(){
  const wrap = document.getElementById('cardView');
  const list = getFilteredSubjects();
  const sem = DB.getActiveSemester();
  const emptyMsg = sem ? `No subjects yet for ${sem.schoolYear} • ${sem.name}.` : 'No subjects found.';
  if(!list.length){ wrap.innerHTML = `<div class="col-12"><div class="glass card-pad text-center py-4"><i class="bi bi-journal-x" style="font-size:1.6rem;color:var(--text-faint)"></i><p class="text-soft mt-2 mb-0" style="font-size:.85rem">${emptyMsg}</p></div></div>`; return; }
  wrap.innerHTML = list.map(s=>{
    const remain = nextOccurrenceMinutes(s);
    return `<div class="col-md-6 col-xl-4">
      <div class="glass subject-card hover-lift" style="--sc-color:${s.color}">
        <div class="d-flex align-items-center gap-2 mb-1">
          <span class="sched-dot" style="background:${s.color}"></span>
          <span class="fw-bold" style="font-size:.88rem">${s.code}</span>
          ${s.archived?'<span class="chip" style="font-size:.6rem">archived</span>':''}
          <div class="d-flex gap-1 ms-auto">
            <button class="btn-icon sched-icon-btn" onclick="openSubjectModal('${s.id}')"><i class="bi bi-pencil"></i></button>
            <button class="btn-icon sched-icon-btn" onclick="deleteSubject('${s.id}')"><i class="bi bi-trash"></i></button>
          </div>
        </div>
        <div class="sched-desc">${escapeHtml(s.desc)}</div>
        <div class="sched-meta">
          <span><i class="bi bi-clock"></i>${s.days.join(', ')} · ${fmtTime(s.start)}–${fmtTime(s.end)}</span>
          <span><i class="bi bi-geo-alt"></i>${s.room}${s.building?' · '+s.building:''}</span>
          <span><i class="bi bi-person"></i>${s.professor}</span>
        </div>
        <div class="d-flex justify-content-between align-items-center mt-2 pt-2" style="border-top:1px solid var(--border)">
          <span class="chip" style="font-size:.68rem">${remain}</span>
          <div class="d-flex gap-1">
            <button class="btn-ghost btn btn-sm sched-action-btn" onclick="duplicateSubject('${s.id}')" title="Duplicate"><i class="bi bi-copy"></i></button>
            <button class="btn-ghost btn btn-sm sched-action-btn" onclick="archiveSubject('${s.id}')" title="Archive"><i class="bi bi-archive"></i></button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}
function nextOccurrenceMinutes(s){
  const now = new Date();
  for(let d=0; d<7; d++){
    const day = new Date(now); day.setDate(now.getDate()+d);
    const dayName = DAY_NAMES[day.getDay()];
    if(s.days.includes(dayName)){
      const mins = minutesUntil(ymdLocal(day), s.start);
      if(mins >= -5) return fmtDuration(mins) + ' away';
    }
  }
  return 'Not scheduled';
}

/* ---------- WEEKLY TIMETABLE ---------- */
function ttZoom(dir){ ttHourHeight = Math.max(32, Math.min(90, ttHourHeight + dir*8)); renderTimetable(); }
function renderTimetable(){
  const wrap = document.getElementById('ttGrid');
  const list = getFilteredSubjects();
  const startHour = 6, endHour = 21;

  let html = `<div class="timetable">`;
  html += `<div class="tt-head"></div>`;
  DAY_NAMES.slice(1).concat(DAY_NAMES[0]).forEach(d=> html += `<div class="tt-head">${d}</div>`);
  html += `</div>`;

  html += `<div style="display:grid;grid-template-columns:60px repeat(7,1fr);position:relative">`;
  html += `<div>`;
  for(let h=startHour; h<=endHour; h++){
    html += `<div class="tt-cell tt-hour" style="height:${ttHourHeight}px">${fmtTime(String(h).padStart(2,'0')+':00')}</div>`;
  }
  html += `</div>`;

  const order = DAY_NAMES.slice(1).concat(DAY_NAMES[0]);
  order.forEach(dayName=>{
    html += `<div class="tt-col" style="position:relative">`;
    for(let h=startHour; h<=endHour; h++){ html += `<div class="tt-cell" style="height:${ttHourHeight}px"></div>`; }
    const dayClasses = list.filter(s=>s.days.includes(dayName));
    const overlapMap = computeOverlaps(dayClasses);
    dayClasses.forEach(s=>{
      const [sh,sm] = s.start.split(':').map(Number);
      const [eh,em] = s.end.split(':').map(Number);
      const top = ((sh-startHour)+sm/60) * ttHourHeight;
      const height = Math.max(24, ((eh+em/60)-(sh+sm/60)) * ttHourHeight);
      const {col, cols} = overlapMap.get(s.id);
      const widthPct = 100/cols;
      html += `<div class="tt-block" style="top:${top}px;height:${height}px;left:calc(${col*widthPct}% + 2px);width:calc(${widthPct}% - 4px);background:${s.color}"
        onclick="showSubjectDetail('${s.id}')">${s.code}<br><span style="font-weight:400;opacity:.9">${fmtTime(s.start)}</span></div>`;
    });
    if(dayName === DAY_NAMES[new Date().getDay()]){
      const now = new Date();
      const nowMin = now.getHours()+now.getMinutes()/60;
      if(nowMin>=startHour && nowMin<=endHour){
        const top = (nowMin-startHour)*ttHourHeight;
        html += `<div class="tt-now-line" style="top:${top}px"></div>`;
      }
    }
    html += `</div>`;
  });
  html += `</div>`;
  wrap.innerHTML = html;
}
function computeOverlaps(classes){
  const map = new Map();
  const sorted = [...classes].sort((a,b)=>a.start.localeCompare(b.start));
  const active = [];
  sorted.forEach(s=>{
    for(let i=active.length-1;i>=0;i--){ if(active[i].end <= s.start) active.splice(i,1); }
    let col = 0;
    const usedCols = active.map(a=>map.get(a.id).col);
    while(usedCols.includes(col)) col++;
    active.push(s);
    map.set(s.id, {col});
  });
  sorted.forEach(s=>{
    const overlapping = sorted.filter(o=> o.start < s.end && o.end > s.start);
    const cols = Math.max(...overlapping.map(o=>map.get(o.id).col))+1;
    map.set(s.id, {col:map.get(s.id).col, cols});
  });
  return map;
}
function showSubjectDetail(id){
  const s = DB.getSubject(id); if(!s) return;
  const body = document.getElementById('detailModalBody');
  body.innerHTML = `
    <div class="modal-header" style="border:none;padding-bottom:8px">
      <div class="d-flex align-items-center gap-2">
        <span class="subject-badge" style="--sc-color:${s.color};background:${s.color}"></span>
        <h5 class="modal-title mb-0">${s.code}</h5>
      </div>
      <button class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
    </div>
    <p class="text-soft mb-3" style="font-size:.88rem">${escapeHtml(s.desc)}</p>
    <div class="d-flex flex-column gap-2 mb-3" style="font-size:.83rem">
      <div class="d-flex align-items-center gap-2"><i class="bi bi-clock text-faint"></i><span>${s.days.join(', ')} · ${fmtTime(s.start)}–${fmtTime(s.end)}</span></div>
      <div class="d-flex align-items-center gap-2"><i class="bi bi-geo-alt text-faint"></i><span>${s.room}, ${s.building}</span></div>
      <div class="d-flex align-items-center gap-2"><i class="bi bi-person text-faint"></i><span>${s.professor} ${s.email?'· '+s.email:''}</span></div>
      <div class="d-flex align-items-center gap-2"><i class="bi bi-mortarboard text-faint"></i><span>${s.units} units · ${s.type} · ${s.section}</span></div>
      ${s.notes?`<div class="d-flex align-items-center gap-2"><i class="bi bi-sticky text-faint"></i><span>${escapeHtml(s.notes)}</span></div>`:''}
    </div>
    <button class="btn btn-accent w-100" onclick="bootstrap.Modal.getInstance(document.getElementById('detailModal')).hide(); openSubjectModal('${s.id}')"><i class="bi bi-pencil me-1"></i>Edit Subject</button>`;
  new bootstrap.Modal(document.getElementById('detailModal')).show();
}

/* ---------- TIMELINE VIEW ---------- */
function renderTimelineView(){
  const wrap = document.getElementById('timelineView');
  const list = getFilteredSubjects().sort((a,b)=>a.start.localeCompare(b.start));
  const byDay = {};
  DAY_NAMES.slice(1).concat(DAY_NAMES[0]).forEach(d=>byDay[d]=[]);
  list.forEach(s=> s.days.forEach(d=>{ if(byDay[d]) byDay[d].push(s); }));
  wrap.innerHTML = Object.entries(byDay).map(([day, subs])=>{
    if(!subs.length) return '';
    return `<div class="mb-3">
      <div class="fw-bold text-soft mb-2" style="font-size:.85rem">${day}</div>
      ${subs.sort((a,b)=>a.start.localeCompare(b.start)).map(s=>`
        <div class="list-row" style="border-left:3px solid ${s.color};margin-left:4px">
          <div class="flex-grow-1">
            <b>${s.code}</b> <span class="text-faint">${escapeHtml(s.desc)}</span>
            <div class="text-faint" style="font-size:.75rem">${fmtTime(s.start)}–${fmtTime(s.end)} · ${s.room}, ${s.building} · ${s.professor}</div>
          </div>
        </div>`).join('')}
    </div>`;
  }).join('') || `<div class="text-center py-5 text-faint">No subjects to show</div>`;
}

/* ---------- CRUD ---------- */
function openSubjectModal(id){
  const s = id ? DB.getSubject(id) : null;
  document.getElementById('subjectModalTitle').textContent = s ? 'Edit Subject' : 'Add Subject';
  const sem = DB.getActiveSemester();
  const body = document.getElementById('subjectModalBody');
  const days = s ? s.days : [];
  body.innerHTML = `
    <input type="hidden" id="subId" value="${s?s.id:''}">
    <div class="row g-2">
      <div class="col-md-4"><label>Subject Code</label><input class="form-control" id="subCode" value="${s?s.code:''}" placeholder="CS101"></div>
      <div class="col-md-8"><label>Subject Description</label><input class="form-control" id="subDesc" value="${s?s.desc:''}" placeholder="Introduction to Computing"></div>
      <div class="col-md-4"><label>Subject Type</label>
        <select class="form-select" id="subType">${['Lecture','Laboratory','Seminar','Hybrid'].map(t=>`<option ${s&&s.type===t?'selected':''}>${t}</option>`).join('')}</select>
      </div>
      <div class="col-md-4"><label>Units</label><input type="number" step="0.5" class="form-control" id="subUnits" value="${s?s.units:3}"></div>
      <div class="col-md-4"><label>Section</label><input class="form-control" id="subSection" value="${s?s.section:''}" placeholder="BSCS-1A"></div>

      <div class="col-12"><label>Days</label>
        <div class="d-flex gap-2 flex-wrap">
          ${DAY_NAMES.slice(1).concat(DAY_NAMES[0]).map(d=>`
            <div class="form-check form-check-inline">
              <input class="form-check-input day-check" type="checkbox" value="${d}" id="day_${d}" ${days.includes(d)?'checked':''}>
              <label class="form-check-label" for="day_${d}">${d}</label>
            </div>`).join('')}
        </div>
      </div>

      <div class="col-md-6"><label>Start Time</label><input type="time" class="form-control" id="subStart" value="${s?s.start:'08:00'}"></div>
      <div class="col-md-6"><label>End Time</label><input type="time" class="form-control" id="subEnd" value="${s?s.end:'09:00'}"></div>

      <div class="col-md-4"><label>Room Number</label><input class="form-control" id="subRoom" value="${s?s.room:''}"></div>
      <div class="col-md-8"><label>Building</label><input class="form-control" id="subBuilding" value="${s?s.building:''}"></div>

      <div class="col-md-6"><label>Professor</label><input class="form-control" id="subProf" value="${s?s.professor:''}"></div>
      <div class="col-md-6"><label>Email</label><input type="email" class="form-control" id="subEmail" value="${s?s.email:''}"></div>

      <div class="col-12"><label>Color Label</label>
        <div class="d-flex gap-2 flex-wrap" id="colorPicker">
          ${DB.colors.map(c=>`<div onclick="selectColor('${c}')" data-color="${c}" style="width:28px;height:28px;border-radius:8px;background:${c};cursor:pointer;box-shadow:${(s?s.color:DB.colors[0])===c?'0 0 0 3px rgba(255,255,255,.5)':'none'}"></div>`).join('')}
        </div>
        <input type="hidden" id="subColor" value="${s?s.color:DB.colors[0]}">
      </div>

      <div class="col-12"><label>Notes</label><textarea class="form-control" id="subNotes" rows="2">${s?s.notes:''}</textarea></div>
    </div>
    <button class="btn btn-accent w-100 mt-3" onclick="saveSubject()"><i class="bi bi-check2 me-1"></i>${s?'Update':'Save'} Subject</button>`;
  new bootstrap.Modal(document.getElementById('subjectModal')).show();
}
function selectColor(c){
  document.getElementById('subColor').value = c;
  document.querySelectorAll('#colorPicker div').forEach(d=> d.style.boxShadow = d.dataset.color===c ? '0 0 0 3px rgba(255,255,255,.5)' : 'none');
}
function saveSubject(){
  const id = document.getElementById('subId').value;
  const code = document.getElementById('subCode').value.trim();
  if(!code){ Toast.show('Subject code is required','high','bi-exclamation-triangle'); return; }
  const days = [...document.querySelectorAll('.day-check:checked')].map(c=>c.value);
  const sem = DB.getActiveSemester();
  const data = {
    code, desc: document.getElementById('subDesc').value.trim(),
    type: document.getElementById('subType').value,
    units: parseFloat(document.getElementById('subUnits').value)||0,
    section: document.getElementById('subSection').value.trim(),
    days, start: document.getElementById('subStart').value, end: document.getElementById('subEnd').value,
    room: document.getElementById('subRoom').value.trim(), building: document.getElementById('subBuilding').value.trim(),
    professor: document.getElementById('subProf').value.trim(), email: document.getElementById('subEmail').value.trim(),
    color: document.getElementById('subColor').value, notes: document.getElementById('subNotes').value.trim(),
    semester: sem ? sem.name : '1st Semester',
    schoolYear: sem ? sem.schoolYear : '2026-2027',
    semesterId: sem ? sem.id : DB.getActiveSemesterId(),
    archived:false,
  };
  const subjects = DB.getSubjects();
  if(id){
    const idx = subjects.findIndex(s=>s.id===id);
    if(idx !== -1) subjects[idx] = { ...subjects[idx], ...data };
  } else {
    subjects.push({ id: DB.uid(), ...data });
  }
  DB.saveSubjects(subjects);
  bootstrap.Modal.getInstance(document.getElementById('subjectModal')).hide();
  Toast.show(id?'Subject updated':'Subject added');
  renderAllViews();
}
function deleteSubject(id){
  const s = DB.getSubject(id); if(!s) return;
  confirmAction({
    title:'Delete subject?',
    message:`"${s.code} — ${s.desc}" will be permanently removed, along with its grade and attendance records staying orphaned.`,
    confirmLabel:'Delete Subject', danger:true, icon:'bi-trash-fill',
    onConfirm(){
      DB.saveSubjects(DB.getSubjects().filter(x=>x.id!==id));
      Toast.show('Subject deleted');
      renderAllViews();
    }
  });
}
function duplicateSubject(id){
  const subjects = DB.getSubjects();
  const s = subjects.find(x=>x.id===id); if(!s) return;
  subjects.push({ ...s, id: DB.uid(), code: s.code+' (copy)' });
  DB.saveSubjects(subjects);
  Toast.show('Subject duplicated');
  renderAllViews();
}
function archiveSubject(id){
  const subjects = DB.getSubjects();
  const s = subjects.find(x=>x.id===id); if(!s) return;
  s.archived = !s.archived;
  DB.saveSubjects(subjects);
  Toast.show(s.archived ? 'Subject archived' : 'Subject restored');
  renderAllViews();
}
function escapeHtml(s){ const d=document.createElement('div'); d.textContent=s||''; return d.innerHTML; }
