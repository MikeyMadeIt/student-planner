/* ============================================================
   CALENDAR.JS — Unified Calendar v2
   ============================================================ */

let calMode = 'month';
let calDate = new Date();

// Filter state — all on by default
let calFilters = { classes: true, tasks: true, events: true, univ: true };

const CATEGORY_COLORS = {
  Homework:'#FBBF24', Project:'#4F8CFF', Quiz:'#22D3EE',
  Exam:'#FB7185', Personal:'#34D399', Organization:'#A78BFA'
};
const UNIV_COLORS = ['#F59E0B','#7C6CF6','#4F8CFF','#FB7185','#34D399','#22D3EE','#F472B6','#A78BFA'];
const EVENT_CATEGORIES = ['Study Session','Organization Meeting','Personal Appointment','Project Meeting','Exam Review','Event','Other'];
const EVENT_CAT_COLORS = {
  'Study Session':'#34D399','Organization Meeting':'#A78BFA','Personal Appointment':'#4F8CFF',
  'Project Meeting':'#7C6CF6','Exam Review':'#FB7185','Event':'#FBBF24','Other':'#8a90a6'
};

let univModalMode = 'range';
let univModalColor = UNIV_COLORS[0];
let univEditingId = null;
let eventEditingId = null;
let taskEditingId = null;

function initCalendar(){
  renderCalendar();
  renderEventList();
}

/* ============================================================
   UNIFIED EVENT COLLECTION
   ============================================================ */
function allEventsForDate(dateStr){
  const semId = DB.getActiveSemesterId();
  const events = [];
  const dayName = DAY_NAMES[new Date(dateStr+'T00:00').getDay()];

  // Classes
  if(calFilters.classes){
    DB.getSubjects().filter(s=>s.semesterId===semId && !s.archived && s.days && s.days.includes(dayName)).forEach(s=>{
      events.push({ type:'class', id:s.id, title:s.code, color:s.color||'#7C6CF6', time:s.start, endTime:s.end, sub:s.desc||'', room:s.room||'', _obj:s });
    });
  }

  // Tasks with due dates
  if(calFilters.tasks){
    DB.getTasks().filter(t=>t.semesterId===semId && t.dueDate===dateStr).forEach(t=>{
      events.push({ type:'task', id:t.id, title:t.title, color:CATEGORY_COLORS[t.category]||'#8a90a6', time:t.dueTime||'', sub:t.category||'', _obj:t });
    });
  }

  // One-off calendar events (semester-aware)
  if(calFilters.events){
    DB.getCalendarEvents().filter(e=>e.semesterId===semId && e.date===dateStr).forEach(e=>{
      events.push({ type:'event', id:e.id, title:e.title, color:EVENT_CAT_COLORS[e.category]||'#34D399', time:e.startTime||'', endTime:e.endTime||'', sub:e.category||'', _obj:e });
    });
  }

  // University events
  if(calFilters.univ){
    DB.getUniversityEvents().filter(u=>u.dates && u.dates.includes(dateStr)).forEach(u=>{
      events.push({ type:'univ', id:u.id, title:u.title, color:u.color||'#4F8CFF', time:'', sub:'University', _obj:u });
    });
  }

  return events.sort((a,b)=>(a.time||'').localeCompare(b.time||''));
}

/* ============================================================
   VIEW SWITCHING
   ============================================================ */
function setCalMode(m){
  calMode = m;
  document.querySelectorAll('.cal-view-btn').forEach(b=>b.classList.toggle('active', b.dataset.mode===m));
  renderCalendar();
}
function navCal(dir){
  if(calMode==='month') calDate.setMonth(calDate.getMonth()+dir);
  else if(calMode==='week') calDate.setDate(calDate.getDate()+dir*7);
  else calDate.setDate(calDate.getDate()+dir);
  renderCalendar();
  renderEventList();
}
function goToToday(){
  calDate = new Date();
  renderCalendar();
  renderEventList();
}

/* ============================================================
   FILTER TOGGLES
   ============================================================ */
function toggleFilter(f){
  calFilters[f] = !calFilters[f];
  const btn = document.getElementById('filter-' + f);
  if(btn) btn.classList.toggle('active', calFilters[f]);
  renderCalendar();
  renderEventList();
}

/* ============================================================
   RENDER CALENDAR
   ============================================================ */
function renderCalendar(){
  const body = document.getElementById('calBody');
  if(!body) return;
  if(calMode==='month') body.innerHTML = monthHtml();
  else if(calMode==='week') body.innerHTML = weekHtml();
  else body.innerHTML = dayHtml();
}

function monthHtml(){
  const y = calDate.getFullYear(), m = calDate.getMonth();
  document.getElementById('calTitle').textContent = calDate.toLocaleDateString([], {month:'long', year:'numeric'});
  const first = new Date(y,m,1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(y,m+1,0).getDate();
  const daysInPrevMonth = new Date(y,m,0).getDate();

  let html = `<div class="uc-grid mb-1">${DAY_NAMES.map(d=>`<div class="text-center text-faint" style="font-size:.68rem;font-weight:700">${d}</div>`).join('')}</div><div class="uc-grid">`;
  const totalCells = Math.ceil((startOffset+daysInMonth)/7)*7;
  for(let i=0;i<totalCells;i++){
    let dayNum, monthOffset=0, other=false;
    if(i < startOffset){ dayNum = daysInPrevMonth-startOffset+i+1; monthOffset=-1; other=true; }
    else if(i >= startOffset+daysInMonth){ dayNum = i-startOffset-daysInMonth+1; monthOffset=1; other=true; }
    else dayNum = i-startOffset+1;
    const d = new Date(y, m+monthOffset, dayNum);
    const dateStr = ymdLocal(d);
    const isToday = dateStr === todayKey();
    const evts = allEventsForDate(dateStr);
    // Show up to 2 chips on desktop, dots otherwise
    const chips = evts.slice(0,2).map(e=>`<div class="uc-event-chip" onclick="event.stopPropagation();openDayModal('${dateStr}')" style="background:${hexWithAlpha(e.color,0.2)};color:${e.color}"><span class="chip-dot" style="background:${e.color}"></span>${escapeHtml(e.title)}</div>`).join('');
    const dots = evts.slice(0,4).map(e=>`<span class="uc-dot" style="background:${e.color}"></span>`).join('');
    const moreCount = evts.length > 2 ? `<div style="font-size:.55rem;color:var(--text-faint);padding:0 2px">+${evts.length-2} more</div>` : '';
    html += `<div class="uc-cell ${isToday?'today':''} ${other?'other-month':''}" onclick="openDayModal('${dateStr}')" title="${evts.map(e=>e.title).join(', ')}">
      <div class="uc-daynum">${dayNum}</div>
      <div class="uc-cell-events d-none d-sm-flex">${chips}${moreCount}</div>
      <div class="uc-dots d-flex d-sm-none">${dots}</div>
    </div>`;
  }
  html += `</div>`;
  return html;
}

function weekHtml(){
  const start = new Date(calDate); start.setDate(calDate.getDate()-calDate.getDay());
  const end = new Date(start); end.setDate(start.getDate()+6);
  document.getElementById('calTitle').textContent = `${start.toLocaleDateString([], {month:'short', day:'numeric'})} – ${end.toLocaleDateString([], {month:'short', day:'numeric', year:'numeric'})}`;
  let html = `<div class="uc-week-row">`;
  for(let i=0;i<7;i++){
    const d = new Date(start); d.setDate(start.getDate()+i);
    const dateStr = ymdLocal(d);
    const isToday = dateStr===todayKey();
    const evts = allEventsForDate(dateStr);
    const chips = evts.slice(0,3).map(e=>`<div class="uc-event-chip" style="background:${hexWithAlpha(e.color,0.2)};color:${e.color}"><span class="chip-dot" style="background:${e.color}"></span>${escapeHtml(e.title)}</div>`).join('');
    const dots = evts.slice(0,4).map(e=>`<span class="uc-dot" style="background:${e.color}"></span>`).join('');
    html += `<div class="uc-week-cell ${isToday?'today':''}" onclick="openDayModal('${dateStr}')">
      <div class="text-faint" style="font-size:.64rem">${DAY_NAMES[d.getDay()]}</div>
      <div class="fw-bold mono" style="font-size:.85rem">${d.getDate()}</div>
      <div class="uc-cell-events d-none d-sm-flex" style="margin-top:4px">${chips}</div>
      <div class="uc-dots justify-content-center d-flex d-sm-none">${dots}</div>
    </div>`;
  }
  html += `</div>`;
  return html;
}

function dayHtml(){
  const dateStr = ymdLocal(calDate);
  document.getElementById('calTitle').textContent = calDate.toLocaleDateString([], {weekday:'long', month:'long', day:'numeric', year:'numeric'});
  const evts = allEventsForDate(dateStr);
  if(!evts.length){
    return `<div class="text-center py-5 text-faint">
      <i class="bi bi-calendar-x" style="font-size:1.6rem;display:block;margin-bottom:8px"></i>
      Nothing scheduled for this day.<br>
      <span style="font-size:.8rem">Tap "Add Event" to add something.</span>
    </div>`;
  }
  return evts.map(e=>renderDayEventRow(e)).join('');
}

function renderDayEventRow(e){
  const typeBadge = `<span class="day-detail-type-badge badge-${e.type}">${e.type}</span>`;
  const timeStr = e.time ? fmtTime(e.time) + (e.endTime ? ' – ' + fmtTime(e.endTime) : '') : '';
  return `<div class="day-detail-item" onclick="handleDayEventClick('${e.type}','${e.id}','${e._obj && e._obj.date ? e._obj.date : (e._obj && e._obj.dueDate ? e._obj.dueDate : '')}')">
    <div class="day-detail-color" style="background:${e.color}"></div>
    <div class="flex-grow-1">
      <div style="font-weight:700;font-size:.85rem">${escapeHtml(e.title)}</div>
      <div class="text-faint" style="font-size:.73rem">${timeStr}${timeStr && e.sub ? ' · ' : ''}${escapeHtml(e.sub||'')}</div>
    </div>
    ${typeBadge}
  </div>`;
}

/* ============================================================
   DAY MODAL
   ============================================================ */
function openDayModal(dateStr){
  const evts = allEventsForDate(dateStr);
  const body = document.getElementById('dayModalBody');
  const d = new Date(dateStr+'T00:00');
  const dateLabel = d.toLocaleDateString([], {weekday:'long', month:'long', day:'numeric'});

  const groups = { class:[], task:[], event:[], univ:[] };
  evts.forEach(e=>{ if(groups[e.type]) groups[e.type].push(e); });

  let sectionsHtml = '';
  if(groups.class.length){
    sectionsHtml += `<div class="day-modal-section-title"><i class="bi bi-calendar2-week"></i>Classes</div>` +
      groups.class.map(e=>renderDayEventRow(e)).join('');
  }
  if(groups.task.length){
    sectionsHtml += `<div class="day-modal-section-title"><i class="bi bi-check2-square"></i>Tasks</div>` +
      groups.task.map(e=>renderDayEventRow(e)).join('');
  }
  if(groups.event.length){
    sectionsHtml += `<div class="day-modal-section-title"><i class="bi bi-calendar-event"></i>Events</div>` +
      groups.event.map(e=>renderDayEventRow(e)).join('');
  }
  if(groups.univ.length){
    sectionsHtml += `<div class="day-modal-section-title"><i class="bi bi-bank2"></i>University</div>` +
      groups.univ.map(e=>renderDayEventRow(e)).join('');
  }

  if(!sectionsHtml){
    sectionsHtml = `<div class="text-faint text-center py-3">Nothing scheduled — add something below.</div>`;
  }

  body.innerHTML = `
    <div class="d-flex justify-content-between align-items-start mb-3">
      <h5 class="mb-0">${dateLabel}</h5>
      <button class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
    </div>
    ${sectionsHtml}
    <div class="d-flex gap-2 mt-3 flex-wrap">
      <button class="btn btn-ghost btn-sm flex-grow-1" onclick="openCalEventModal(null,'${dateStr}');bootstrap.Modal.getInstance(document.getElementById('dayModal')).hide()"><i class="bi bi-plus-lg me-1"></i>Add Event</button>
      <button class="btn btn-ghost btn-sm flex-grow-1" onclick="openTaskModal(null,'${dateStr}');bootstrap.Modal.getInstance(document.getElementById('dayModal')).hide()"><i class="bi bi-check2-square me-1"></i>Add Task</button>
    </div>`;
  new bootstrap.Modal(document.getElementById('dayModal')).show();
}

function handleDayEventClick(type, id, date){
  const modal = bootstrap.Modal.getInstance(document.getElementById('dayModal'));
  if(modal) modal.hide();
  setTimeout(()=>{
    if(type==='class') openScheduleModal(id);
    else if(type==='task') openTaskModal(id);
    else if(type==='event') openCalEventModal(id);
    else if(type==='univ') openUnivEventModal(id);
  }, 300);
}

/* ============================================================
   EVENT LIST (below calendar)
   ============================================================ */
function renderEventList(){
  const wrap = document.getElementById('calEventList');
  const titleEl = document.getElementById('calEventListTitle');
  if(!wrap) return;

  const semId = DB.getActiveSemesterId();
  let periodDates = [];
  let label = '';

  if(calMode==='month'){
    const y=calDate.getFullYear(), m=calDate.getMonth();
    const dim=new Date(y,m+1,0).getDate();
    for(let d=1;d<=dim;d++) periodDates.push(ymdLocal(new Date(y,m,d)));
    label='This Month';
  } else if(calMode==='week'){
    const s=new Date(calDate); s.setDate(calDate.getDate()-calDate.getDay());
    for(let i=0;i<7;i++){ const d=new Date(s); d.setDate(s.getDate()+i); periodDates.push(ymdLocal(d)); }
    label='This Week';
  } else {
    periodDates=[ymdLocal(calDate)];
    label='Today';
  }

  if(titleEl) titleEl.textContent = 'All Events — ' + label;

  const allItems = [];
  periodDates.forEach(dateStr=>{
    allEventsForDate(dateStr).forEach(e=>allItems.push({...e, dateStr}));
  });

  // Dedupe (univ events may span multiple dates)
  const seen = new Set();
  const unique = allItems.filter(e=>{ const k=e.type+e.id+e.dateStr; if(seen.has(k)) return false; seen.add(k); return true; });
  unique.sort((a,b)=>(a.dateStr+a.time).localeCompare(b.dateStr+b.time));

  if(!unique.length){
    wrap.innerHTML = `<div class="text-center py-4"><i class="bi bi-calendar3" style="font-size:1.5rem;color:var(--text-faint);display:block;margin-bottom:8px"></i><div class="text-soft" style="font-size:.85rem;font-weight:600">No events in this period</div></div>`;
    return;
  }

  let html = '';
  let lastDate = '';
  unique.forEach(e=>{
    if(e.dateStr !== lastDate){
      lastDate = e.dateStr;
      const dl = new Date(e.dateStr+'T00:00').toLocaleDateString([], {weekday:'short', month:'short', day:'numeric'});
      html += `<div style="font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--text-faint);padding:8px 0 4px;border-top:1px solid var(--border);margin-top:4px">${dl}</div>`;
    }
    const timeStr = e.time ? fmtTime(e.time) : '';
    html += `<div class="list-row" style="cursor:pointer" onclick="handleDayEventClick('${e.type}','${e.id}','${e.dateStr}')">
      <span class="dot-color" style="background:${e.color}"></span>
      <div class="flex-grow-1">
        <div style="font-weight:700;font-size:.85rem;${e.type==='task'&&e._obj&&e._obj.status==='completed'?'text-decoration:line-through;opacity:.6':''}">${escapeHtml(e.title)}</div>
        <div class="text-faint" style="font-size:.73rem">${timeStr}${timeStr?'  ·  ':''}${escapeHtml(e.sub||'')} <span class="day-detail-type-badge badge-${e.type}" style="vertical-align:middle">${e.type}</span></div>
      </div>
    </div>`;
  });
  wrap.innerHTML = html;
}

/* ============================================================
   HELPER
   ============================================================ */
function hexWithAlpha(hex, alpha){
  // convert #RRGGBB to rgba
  try {
    const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${alpha})`;
  } catch(e){ return hex; }
}
// escapeHtml provided by app.js (escHtml)

/* ============================================================
   SCHEDULE MODAL (add/edit class)
   ============================================================ */
function openScheduleModal(id, presetDay){
  const s = id ? DB.getSubject(id) : null;
  const sem = DB.getSemester();
  const days = s ? s.days : (presetDay ? [presetDay] : []);
  const color = s ? s.color : DB.colors[0];
  const body = document.getElementById('calSubjectModalBody');
  body.innerHTML = `
    <h5 class="mb-3"><i class="bi bi-calendar3 me-2"></i>${s?'Edit':'Add'} Schedule</h5>
    <input type="hidden" id="csId" value="${s?s.id:''}">
    <div class="row g-2">
      <div class="col-md-4"><label>Subject Code</label><input class="form-control" id="csCode" value="${s?escapeHtml(s.code):''}" placeholder="CS101"></div>
      <div class="col-md-8"><label>Subject Description</label><input class="form-control" id="csDesc" value="${s?escapeHtml(s.desc):''}" placeholder="Introduction to Computing"></div>
      <div class="col-md-4"><label>Subject Type</label>
        <select class="form-select" id="csType">${['Lecture','Laboratory','Seminar','Hybrid'].map(t=>`<option ${s&&s.type===t?'selected':''}>${t}</option>`).join('')}</select>
      </div>
      <div class="col-md-4"><label>Units</label><input type="number" step="0.5" class="form-control" id="csUnits" value="${s?s.units:3}"></div>
      <div class="col-md-4"><label>Section</label><input class="form-control" id="csSection" value="${s?escapeHtml(s.section):''}" placeholder="BSCS-1A"></div>
      <div class="col-12"><label>Days</label>
        <div class="d-flex gap-2 flex-wrap">
          ${DAY_NAMES.slice(1).concat(DAY_NAMES[0]).map(d=>`
            <div class="form-check form-check-inline">
              <input class="form-check-input cs-day-check" type="checkbox" value="${d}" id="csday_${d}" ${days.includes(d)?'checked':''}>
              <label class="form-check-label" for="csday_${d}">${d}</label>
            </div>`).join('')}
        </div>
      </div>
      <div class="col-md-6"><label>Start Time</label><input type="time" class="form-control" id="csStart" value="${s?s.start:'08:00'}"></div>
      <div class="col-md-6"><label>End Time</label><input type="time" class="form-control" id="csEnd" value="${s?s.end:'09:00'}"></div>
      <div class="col-md-4"><label>Room Number</label><input class="form-control" id="csRoom" value="${s?escapeHtml(s.room):''}"></div>
      <div class="col-md-8"><label>Building</label><input class="form-control" id="csBuilding" value="${s?escapeHtml(s.building):''}"></div>
      <div class="col-md-6"><label>Professor</label><input class="form-control" id="csProf" value="${s?escapeHtml(s.professor):''}"></div>
      <div class="col-md-6"><label>Email</label><input type="email" class="form-control" id="csEmail" value="${s?escapeHtml(s.email):''}"></div>
      <div class="col-md-6"><label>Semester</label><input class="form-control" id="csSemester" value="${s?escapeHtml(s.semester):sem.name}"></div>
      <div class="col-md-6"><label>School Year</label><input class="form-control" id="csYear" value="${s?escapeHtml(s.schoolYear):sem.schoolYear}"></div>
      <div class="col-12"><label>Color Label</label>
        <div class="d-flex gap-2 flex-wrap" id="csColorPicker">
          ${DB.colors.map(c=>`<div onclick="selectScheduleColor('${c}')" data-cs-color="${c}" style="width:28px;height:28px;border-radius:8px;background:${c};cursor:pointer;box-shadow:${color===c?'0 0 0 3px rgba(255,255,255,.5)':'none'}"></div>`).join('')}
        </div>
        <input type="hidden" id="csColor" value="${color}">
      </div>
      <div class="col-12"><label>Notes</label><textarea class="form-control" id="csNotes" rows="2">${s?escapeHtml(s.notes||''):''}</textarea></div>
    </div>
    <div class="d-flex gap-2 mt-3">
      <button class="btn btn-accent flex-grow-1" onclick="saveScheduleEntry()"><i class="bi bi-check2 me-1"></i>${s?'Update':'Save'} Schedule</button>
      ${s?`<button class="btn btn-ghost" onclick="deleteScheduleEntry('${s.id}')"><i class="bi bi-trash3"></i></button>`:''}
    </div>`;
  new bootstrap.Modal(document.getElementById('calSubjectModal')).show();
}
function selectScheduleColor(c){
  document.getElementById('csColor').value = c;
  document.querySelectorAll('#csColorPicker div').forEach(d=> d.style.boxShadow = d.dataset.csColor===c ? '0 0 0 3px rgba(255,255,255,.5)' : 'none');
}
function saveScheduleEntry(){
  const id = document.getElementById('csId').value;
  const code = document.getElementById('csCode').value.trim();
  if(!code){ Toast.show('Subject code is required','high','bi-exclamation-triangle'); return; }
  const days = [...document.querySelectorAll('.cs-day-check:checked')].map(c=>c.value);
  const semId = DB.getActiveSemesterId();
  const data = {
    code, desc: document.getElementById('csDesc').value.trim(),
    type: document.getElementById('csType').value,
    units: parseFloat(document.getElementById('csUnits').value)||0,
    section: document.getElementById('csSection').value.trim(),
    days, start: document.getElementById('csStart').value, end: document.getElementById('csEnd').value,
    room: document.getElementById('csRoom').value.trim(), building: document.getElementById('csBuilding').value.trim(),
    professor: document.getElementById('csProf').value.trim(), email: document.getElementById('csEmail').value.trim(),
    color: document.getElementById('csColor').value, notes: document.getElementById('csNotes').value.trim(),
    semester: document.getElementById('csSemester').value.trim(), schoolYear: document.getElementById('csYear').value.trim(),
  };
  const subjects = DB.getSubjects();
  if(id){
    const idx = subjects.findIndex(s=>s.id===id);
    subjects[idx] = { ...subjects[idx], ...data };
  } else {
    subjects.push({ id: DB.uid(), archived:false, semesterId: semId, ...data });
  }
  DB.saveSubjects(subjects);
  bootstrap.Modal.getInstance(document.getElementById('calSubjectModal')).hide();
  Toast.show(id?'Schedule updated':'Schedule added');
  renderCalendar();
  renderEventList();
}
function deleteScheduleEntry(id){
  DB.saveSubjects(DB.getSubjects().filter(x=>x.id!==id));
  const inst = bootstrap.Modal.getInstance(document.getElementById('calSubjectModal'));
  if(inst) inst.hide();
  Toast.show('Schedule deleted');
  renderCalendar();
  renderEventList();
}

/* ============================================================
   TASK MODAL
   ============================================================ */
function openTaskModal(id, presetDate){
  taskEditingId = id || null;
  const t = id ? DB.getTasks().find(x=>x.id===id) : null;
  const semId = DB.getActiveSemesterId();
  const subs = DB.getSubjects().filter(s=>s.semesterId===semId);
  const body = document.getElementById('calTaskModalBody');
  body.innerHTML = `
    <h5 class="mb-3"><i class="bi bi-check2-square me-2"></i>${t?'Edit':'Add'} Task</h5>
    <input type="hidden" id="ctId" value="${t?t.id:''}">
    <div class="row g-2">
      <div class="col-12"><label>Title</label><input class="form-control" id="ctTitle" value="${t?escapeHtml(t.title):''}"></div>
      <div class="col-12"><label>Description</label><textarea class="form-control" id="ctDesc" rows="2">${t?escapeHtml(t.description||''):''}</textarea></div>
      <div class="col-md-4"><label>Subject</label><select class="form-select" id="ctSubject"><option value="">None</option>${subs.map(s=>`<option value="${s.id}" ${t&&t.subjectId===s.id?'selected':''}>${escapeHtml(s.code)}</option>`).join('')}</select></div>
      <div class="col-md-4"><label>Category</label><select class="form-select" id="ctCategory">${['Homework','Project','Quiz','Exam','Personal','Organization'].map(c=>`<option ${t&&t.category===c?'selected':''}>${c}</option>`).join('')}</select></div>
      <div class="col-md-4"><label>Priority</label><select class="form-select" id="ctPriority">${['low','medium','high'].map(p=>`<option value="${p}" ${t&&t.priority===p?'selected':(!t&&p==='medium'?'selected':'')}>${p[0].toUpperCase()+p.slice(1)}</option>`).join('')}</select></div>
      <div class="col-md-4"><label>Due Date</label><input type="date" class="form-control" id="ctDueDate" value="${t?t.dueDate:(presetDate||todayKey())}"></div>
      <div class="col-md-4"><label>Due Time</label><input type="time" class="form-control" id="ctDueTime" value="${t?t.dueTime:'23:59'}"></div>
      <div class="col-md-4"><label>Status</label><select class="form-select" id="ctStatus">${['not-started','in-progress','completed'].map(s=>`<option value="${s}" ${t&&t.status===s?'selected':''}>${s.replace('-',' ')}</option>`).join('')}</select></div>
    </div>
    <div class="d-flex gap-2 mt-3">
      <button class="btn btn-accent flex-grow-1" onclick="saveCalTask()"><i class="bi bi-check2 me-1"></i>${t?'Update':'Save'} Task</button>
      ${t?`<button class="btn btn-ghost" onclick="deleteCalTask('${t.id}')"><i class="bi bi-trash3"></i></button>`:''}
    </div>`;
  new bootstrap.Modal(document.getElementById('calTaskModal')).show();
}
function saveCalTask(){
  const title = document.getElementById('ctTitle').value.trim();
  if(!title){ Toast.show('Please enter a title','high','bi-exclamation-triangle'); return; }
  const data = {
    title, description: document.getElementById('ctDesc').value.trim(),
    subjectId: document.getElementById('ctSubject').value || null,
    category: document.getElementById('ctCategory').value,
    priority: document.getElementById('ctPriority').value,
    dueDate: document.getElementById('ctDueDate').value,
    dueTime: document.getElementById('ctDueTime').value,
    status: document.getElementById('ctStatus').value,
  };
  if(data.status==='completed') data.progress = 100;
  const id = document.getElementById('ctId').value;
  const tasks = DB.getTasks();
  if(id){
    const idx = tasks.findIndex(t=>t.id===id);
    tasks[idx] = { ...tasks[idx], ...data };
  } else {
    const semId = DB.getActiveSemesterId();
    tasks.push({ id: DB.uid(), progress:0, repeat:'none', score:null, remarks:'', reminder:true, checklist:[], createdAt:Date.now(), semesterId:semId, ...data });
  }
  DB.saveTasks(tasks);
  bootstrap.Modal.getInstance(document.getElementById('calTaskModal')).hide();
  Toast.show(id?'Task updated':'Task added');
  renderCalendar();
  renderEventList();
}
function deleteCalTask(id){
  DB.saveTasks(DB.getTasks().filter(x=>x.id!==id));
  const inst = bootstrap.Modal.getInstance(document.getElementById('calTaskModal'));
  if(inst) inst.hide();
  Toast.show('Task deleted');
  renderCalendar();
  renderEventList();
}

/* ============================================================
   ONE-OFF CALENDAR EVENT MODAL
   ============================================================ */
let calEventModalColor = EVENT_CAT_COLORS['Event'];

function openCalEventModal(id, presetDate){
  eventEditingId = id || null;
  const existing = id ? DB.getCalendarEvents().find(e=>e.id===id) : null;
  calEventModalColor = existing ? (existing.color||EVENT_CAT_COLORS['Event']) : EVENT_CAT_COLORS['Event'];
  const semId = DB.getActiveSemesterId();
  const body = document.getElementById('calEventModalBody');
  body.innerHTML = `
    <h5 class="mb-3"><i class="bi bi-calendar-event me-2"></i>${existing?'Edit':'Add'} Event</h5>
    <div class="row g-2">
      <div class="col-12"><label>Event Title</label><input class="form-control" id="ceTitle" placeholder="e.g. Study Session, Project Meeting" value="${existing?escapeHtml(existing.title):''}"></div>
      <div class="col-md-6"><label>Category</label>
        <select class="form-select" id="ceCategory" onchange="updateCalEventColor(this.value)">
          ${EVENT_CATEGORIES.map(c=>`<option value="${c}" ${existing&&existing.category===c?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="col-md-6"><label>Date</label><input type="date" class="form-control" id="ceDate" value="${existing?existing.date:(presetDate||todayKey())}"></div>
      <div class="col-md-6"><label>Start Time</label><input type="time" class="form-control" id="ceStart" value="${existing?existing.startTime:'08:00'}"></div>
      <div class="col-md-6"><label>End Time</label><input type="time" class="form-control" id="ceEnd" value="${existing?existing.endTime:'09:00'}"></div>
      <div class="col-12"><label>Description (optional)</label><textarea class="form-control" id="ceDesc" rows="2" placeholder="Additional details…">${existing?escapeHtml(existing.description||''):''}</textarea></div>
    </div>
    <div class="d-flex gap-2 mt-3">
      <button class="btn btn-accent flex-grow-1" onclick="saveCalEvent()"><i class="bi bi-check2 me-1"></i>${existing?'Update':'Save'} Event</button>
      ${existing?`<button class="btn btn-ghost" onclick="deleteCalEvent('${existing.id}')"><i class="bi bi-trash3"></i></button>`:''}
    </div>`;
  new bootstrap.Modal(document.getElementById('calEventModal')).show();
}
function updateCalEventColor(cat){
  calEventModalColor = EVENT_CAT_COLORS[cat] || EVENT_CAT_COLORS['Event'];
}
function saveCalEvent(){
  const title = document.getElementById('ceTitle').value.trim();
  if(!title){ Toast.show('Please enter a title','high','bi-exclamation-triangle'); return; }
  const date = document.getElementById('ceDate').value;
  if(!date){ Toast.show('Please select a date','high','bi-exclamation-triangle'); return; }
  const cat = document.getElementById('ceCategory').value;
  const data = {
    title, date, category: cat, color: EVENT_CAT_COLORS[cat]||calEventModalColor,
    startTime: document.getElementById('ceStart').value,
    endTime: document.getElementById('ceEnd').value,
    description: document.getElementById('ceDesc').value.trim(),
    semesterId: DB.getActiveSemesterId(),
  };
  const events = DB.getCalendarEvents();
  if(eventEditingId){
    const idx = events.findIndex(e=>e.id===eventEditingId);
    if(idx>-1) events[idx] = { ...events[idx], ...data };
  } else {
    events.push({ id:DB.uid(), createdAt:Date.now(), ...data });
  }
  DB.saveCalendarEvents(events);
  bootstrap.Modal.getInstance(document.getElementById('calEventModal')).hide();
  Toast.show(eventEditingId?'Event updated':'Event added');
  renderCalendar();
  renderEventList();
}
function deleteCalEvent(id){
  DB.saveCalendarEvents(DB.getCalendarEvents().filter(e=>e.id!==id));
  const inst = bootstrap.Modal.getInstance(document.getElementById('calEventModal'));
  if(inst) inst.hide();
  Toast.show('Event deleted');
  renderCalendar();
  renderEventList();
}

/* ============================================================
   UNIVERSITY EVENT MODAL
   ============================================================ */
function openUnivEventModal(id, presetDate){
  univEditingId = id || null;
  const existing = id ? DB.getUniversityEvents().find(e=>e.id===id) : null;
  univModalColor = existing ? (existing.color||UNIV_COLORS[0]) : UNIV_COLORS[0];
  univModalMode = existing && existing.dates && existing.dates.length>2 && isContiguousRange(existing.dates) ? 'range' : (existing ? 'multiple' : 'range');

  const initialDates = existing ? existing.dates.slice().sort() : (presetDate ? [presetDate] : [todayKey()]);
  const rangeStart = initialDates[0];
  const rangeEnd = initialDates[initialDates.length-1];

  const body = document.getElementById('univEventModalBody');
  body.innerHTML = `
    <h5 class="mb-3"><i class="bi bi-bank2 me-2"></i>${existing?'Edit':'Add'} University Event</h5>
    <div class="mb-2"><label>Event Title</label><input class="form-control" id="ueTitle" placeholder="e.g. Semestral Break, Enrollment, Foundation Day" value="${existing?escapeHtml(existing.title):''}"></div>
    <div class="mb-3"><label>Note (optional)</label><textarea class="form-control" id="ueNote" rows="2" placeholder="Additional details…">${existing?escapeHtml(existing.note||''):''}</textarea></div>
    <div class="mb-2"><label>Color</label>
      <div class="d-flex gap-2 flex-wrap" id="ueColorPicker">
        ${UNIV_COLORS.map(c=>`<div onclick="selectUnivColor('${c}')" data-color-swatch="${c}" style="width:26px;height:26px;border-radius:50%;cursor:pointer;background:${c};border:2px solid ${c===univModalColor?'#fff':'transparent'};box-shadow:0 0 0 1px rgba(0,0,0,.15)"></div>`).join('')}
      </div>
    </div>
    <div class="mb-3">
      <div class="btn-group w-100" role="group">
        <button type="button" class="btn btn-ghost btn-sm ${univModalMode==='range'?'active':''}" id="ueModeRangeBtn" onclick="setUnivMode('range')"><i class="bi bi-calendar-range me-1"></i>Date Range</button>
        <button type="button" class="btn btn-ghost btn-sm ${univModalMode==='multiple'?'active':''}" id="ueModeMultiBtn" onclick="setUnivMode('multiple')"><i class="bi bi-calendar-plus me-1"></i>Specific Dates</button>
      </div>
    </div>
    <div id="ueRangeFields" class="${univModalMode==='range'?'':'d-none'}">
      <div class="row g-2 mb-2">
        <div class="col-6"><label>From</label><input type="date" class="form-control" id="ueRangeStart" value="${rangeStart}"></div>
        <div class="col-6"><label>To</label><input type="date" class="form-control" id="ueRangeEnd" value="${rangeEnd}"></div>
      </div>
      <div class="text-faint" style="font-size:.75rem">Every day in this range (inclusive) will show the event.</div>
    </div>
    <div id="ueMultiFields" class="${univModalMode==='multiple'?'':'d-none'}">
      <label>Dates</label>
      <div id="ueDateRows">
        ${(existing ? existing.dates.slice().sort() : (presetDate?[presetDate]:[todayKey()])).map(d=>univDateRowHtml(d)).join('')}
      </div>
      <button type="button" class="btn btn-ghost btn-sm mt-1" onclick="addUnivDateRow()"><i class="bi bi-plus-lg me-1"></i>Add Another Date</button>
    </div>
    <div class="d-flex gap-2 mt-3">
      <button class="btn btn-accent flex-grow-1" onclick="saveUnivEvent()"><i class="bi bi-check2 me-1"></i>Save Event</button>
      ${existing?`<button class="btn btn-ghost" onclick="deleteUnivEvent('${existing.id}')"><i class="bi bi-trash3"></i></button>`:''}
    </div>`;
  new bootstrap.Modal(document.getElementById('univEventModal')).show();
}
function univDateRowHtml(value){
  return `<div class="d-flex gap-2 mb-2 uev-date-row">
    <input type="date" class="form-control" value="${value||''}">
    <button type="button" class="btn-icon" onclick="this.parentElement.remove()"><i class="bi bi-x-lg"></i></button>
  </div>`;
}
function addUnivDateRow(){
  document.getElementById('ueDateRows').insertAdjacentHTML('beforeend', univDateRowHtml(''));
}
function setUnivMode(mode){
  univModalMode = mode;
  document.getElementById('ueModeRangeBtn').classList.toggle('active', mode==='range');
  document.getElementById('ueModeMultiBtn').classList.toggle('active', mode==='multiple');
  document.getElementById('ueRangeFields').classList.toggle('d-none', mode!=='range');
  document.getElementById('ueMultiFields').classList.toggle('d-none', mode!=='multiple');
}
function selectUnivColor(c){
  univModalColor = c;
  document.querySelectorAll('[data-color-swatch]').forEach(el=>{
    el.style.border = `2px solid ${el.dataset.colorSwatch===c?'#fff':'transparent'}`;
  });
}
function collectUnivDates(){
  if(univModalMode==='range'){
    const start = document.getElementById('ueRangeStart').value;
    const end = document.getElementById('ueRangeEnd').value;
    if(!start || !end) return [];
    const dates = [];
    let d = new Date(start+'T00:00');
    const endD = new Date(end+'T00:00');
    if(d > endD) return [];
    while(d <= endD){ dates.push(ymdLocal(d)); d.setDate(d.getDate()+1); }
    return dates;
  } else {
    const inputs = document.querySelectorAll('#ueDateRows input[type="date"]');
    const dates = [];
    inputs.forEach(i=>{ if(i.value) dates.push(i.value); });
    return [...new Set(dates)].sort();
  }
}
function saveUnivEvent(){
  const title = document.getElementById('ueTitle').value.trim();
  if(!title){ Toast.show('Please enter a title','high','bi-exclamation-triangle'); return; }
  const dates = collectUnivDates();
  if(!dates.length){ Toast.show('Please add at least one valid date','high','bi-exclamation-triangle'); return; }
  const note = document.getElementById('ueNote').value.trim();
  const events = DB.getUniversityEvents();
  if(univEditingId){
    const ev = events.find(e=>e.id===univEditingId);
    if(ev){ ev.title=title; ev.note=note; ev.dates=dates; ev.color=univModalColor; }
  } else {
    events.push({ id:DB.uid(), title, note, dates, color:univModalColor, createdAt:Date.now() });
  }
  DB.saveUniversityEvents(events);
  bootstrap.Modal.getInstance(document.getElementById('univEventModal')).hide();
  Toast.show('University event saved');
  renderCalendar();
  renderEventList();
}
function deleteUnivEvent(id){
  DB.saveUniversityEvents(DB.getUniversityEvents().filter(e=>e.id!==id));
  const modalEl = document.getElementById('univEventModal');
  const inst = bootstrap.Modal.getInstance(modalEl);
  if(inst) inst.hide();
  Toast.show('University event deleted');
  renderCalendar();
  renderEventList();
}
function isContiguousRange(dates){
  const sorted = dates.slice().sort();
  for(let i=1;i<sorted.length;i++){
    const prev = new Date(sorted[i-1]+'T00:00');
    const cur  = new Date(sorted[i]+'T00:00');
    if((cur-prev)/86400000 !== 1) return false;
  }
  return true;
}
