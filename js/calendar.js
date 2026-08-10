/* ============================================================
   CALENDAR.JS
   ============================================================ */

let calMode = 'month';
let calDate = new Date();

const CATEGORY_COLORS = { Homework:'#FBBF24', Project:'#4F8CFF', Quiz:'#22D3EE', Exam:'#FB7185', Personal:'#34D399', Organization:'#A78BFA' };

function initCalendar(){ renderCalendar(); renderTaskCalendar(); renderUnivCalendar(); }

/* ---------- SCHEDULE CALENDAR (classes only) ---------- */
function setCalMode(m){
  calMode = m;
  document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active', b.dataset.mode===m));
  renderCalendar();
}
function navCal(dir){
  if(calMode==='month') calDate.setMonth(calDate.getMonth()+dir);
  else if(calMode==='week') calDate.setDate(calDate.getDate()+dir*7);
  else calDate.setDate(calDate.getDate()+dir);
  renderCalendar();
}

function eventsForDate(dateStr){
  const events = [];
  const dayName = DAY_NAMES[new Date(dateStr+'T00:00').getDay()];
  const _calSemId = DB.getActiveSemesterId();
  DB.getSubjects().filter(s=>s.semesterId===_calSemId && !s.archived && s.days.includes(dayName)).forEach(s=>{
    events.push({ title:`${s.code}`, color:s.color, type:'class', time:s.start, subject:s });
  });
  return events.sort((a,b)=> (a.time||'').localeCompare(b.time||''));
}

function renderCalendar(){
  document.getElementById('calBody').innerHTML = calMode==='month' ? monthHtml() : calMode==='week' ? weekHtml() : dayHtml();
}

function monthHtml(){
  const y = calDate.getFullYear(), m = calDate.getMonth();
  document.getElementById('calTitle').textContent = calDate.toLocaleDateString([], {month:'long', year:'numeric'});
  const first = new Date(y,m,1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(y,m+1,0).getDate();
  const daysInPrevMonth = new Date(y,m,0).getDate();

  let html = `<div class="uc-grid mb-1">${DAY_NAMES.map(d=>`<div class="text-center text-faint" style="font-size:.72rem;font-weight:700">${d}</div>`).join('')}</div><div class="uc-grid">`;
  const totalCells = Math.ceil((startOffset+daysInMonth)/7)*7;
  for(let i=0;i<totalCells;i++){
    let dayNum, monthOffset=0, other=false;
    if(i < startOffset){ dayNum = daysInPrevMonth-startOffset+i+1; monthOffset=-1; other=true; }
    else if(i >= startOffset+daysInMonth){ dayNum = i-startOffset-daysInMonth+1; monthOffset=1; other=true; }
    else dayNum = i-startOffset+1;
    const d = new Date(y, m+monthOffset, dayNum);
    const dateStr = ymdLocal(d);
    const isToday = dateStr === todayKey();
    const evts = eventsForDate(dateStr);
    html += `<div class="uc-cell ${isToday?'today':''} ${other?'other-month':''}" onclick="openDayModal('${dateStr}')" title="${evts.map(e=>e.title).join(', ')}">
      <div class="uc-daynum">${dayNum}</div>
      <div class="uc-dots">${evts.slice(0,4).map(e=>`<span class="uc-dot" style="background:${e.color}"></span>`).join('')}</div>
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
    const evts = eventsForDate(dateStr);
    html += `<div class="uc-week-cell ${isToday?'today':''}" onclick="openDayModal('${dateStr}')" title="${evts.map(e=>e.title).join(', ')}">
        <div class="text-faint" style="font-size:.64rem">${DAY_NAMES[d.getDay()]}</div>
        <div class="fw-bold mono" style="font-size:.85rem">${d.getDate()}</div>
        <div class="uc-dots justify-content-center">${evts.slice(0,4).map(e=>`<span class="uc-dot" style="background:${e.color}"></span>`).join('')}</div>
      </div>`;
  }
  html += `</div>`;
  return html;
}

function dayHtml(){
  const dateStr = ymdLocal(calDate);
  document.getElementById('calTitle').textContent = calDate.toLocaleDateString([], {weekday:'long', month:'long', day:'numeric', year:'numeric'});
  const evts = eventsForDate(dateStr);
  if(!evts.length) return `<div class="text-center py-5 text-faint">No classes scheduled for this day</div>`;
  return evts.map(e=>`
    <div class="list-row">
      <span class="dot-color" style="background:${e.color}"></span>
      <div class="flex-grow-1"><b>${escapeHtml(e.title)}</b><div class="text-faint" style="font-size:.78rem">${fmtTime(e.time)} · ${escapeHtml(e.subject.room||'')}</div></div>
    </div>`).join('');
}

function openDayModal(dateStr){
  const evts = eventsForDate(dateStr);
  const body = document.getElementById('dayModalBody');
  const d = new Date(dateStr+'T00:00');
  body.innerHTML = `<h5 class="mb-3">${d.toLocaleDateString([], {weekday:'long', month:'long', day:'numeric'})}</h5>
  ${evts.length? evts.map(e=>`
    <div class="list-row"><span class="dot-color" style="background:${e.color}"></span>
      <div class="flex-grow-1"><b>${escapeHtml(e.title)}</b><div class="text-faint" style="font-size:.78rem">${fmtTime(e.time)} · ${escapeHtml(e.subject.room||'')}</div></div>
    </div>`).join('') : `<div class="text-faint text-center py-3">No classes scheduled</div>`}
  <button class="btn btn-ghost w-100 mt-3" onclick="location.href='schedule.html'">Manage Schedule</button>`;
  new bootstrap.Modal(document.getElementById('dayModal')).show();
}
function escapeHtml(s){ const d=document.createElement('div'); d.textContent=s||''; return d.innerHTML; }

/* ---------- Add/Edit Schedule modal (writes to the same subjects store as Schedule Manager) ---------- */
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
    subjects.push({ id: DB.uid(), archived:false, ...data });
  }
  DB.saveSubjects(subjects);
  bootstrap.Modal.getInstance(document.getElementById('calSubjectModal')).hide();
  Toast.show(id?'Schedule updated':'Schedule added — it now appears in Schedule Manager too');
  renderCalendar();
}
function deleteScheduleEntry(id){
  DB.saveSubjects(DB.getSubjects().filter(x=>x.id!==id));
  const inst = bootstrap.Modal.getInstance(document.getElementById('calSubjectModal'));
  if(inst) inst.hide();
  Toast.show('Schedule deleted');
  renderCalendar();
}


/* ============================================================
   TASK CALENDAR (its own month/week/day view)
   ============================================================ */
let taskCalMode = 'month';
let taskCalDate = new Date();
let taskEditingId = null;

function taskEventsForDate(dateStr){
  const _calSemId2 = DB.getActiveSemesterId();
  return DB.getTasks().filter(t=>t.semesterId===_calSemId2 && t.dueDate===dateStr).map(t=>({ ...t, color: CATEGORY_COLORS[t.category]||'#8a90a6' }));
}

function setTaskCalMode(m){
  taskCalMode = m;
  document.querySelectorAll('[data-tcmode]').forEach(b=>b.classList.toggle('active', b.dataset.tcmode===m));
  renderTaskCalendar();
}
function navTaskCal(dir){
  if(taskCalMode==='month') taskCalDate.setMonth(taskCalDate.getMonth()+dir);
  else if(taskCalMode==='week') taskCalDate.setDate(taskCalDate.getDate()+dir*7);
  else taskCalDate.setDate(taskCalDate.getDate()+dir);
  renderTaskCalendar();
}

function renderTaskCalendar(){
  const body = document.getElementById('taskCalBody');
  if(!body) return;
  body.innerHTML = taskCalMode==='month' ? taskMonthHtml() : taskCalMode==='week' ? taskWeekHtml() : taskDayHtml();
  renderTaskCalListForPeriod();
}

function taskMonthHtml(){
  const y = taskCalDate.getFullYear(), m = taskCalDate.getMonth();
  document.getElementById('taskCalTitle').textContent = taskCalDate.toLocaleDateString([], {month:'long', year:'numeric'});
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
    const evts = taskEventsForDate(dateStr);
    html += `<div class="uc-cell ${isToday?'today':''} ${other?'other-month':''}" onclick="openTaskModal(null,'${dateStr}')" title="${evts.map(e=>e.title).join(', ')}">
      <div class="uc-daynum">${dayNum}</div>
      <div class="uc-dots">${evts.slice(0,4).map(e=>`<span class="uc-dot" style="background:${e.color}"></span>`).join('')}</div>
    </div>`;
  }
  html += `</div>`;
  return html;
}

function taskWeekHtml(){
  const start = new Date(taskCalDate); start.setDate(taskCalDate.getDate()-taskCalDate.getDay());
  const end = new Date(start); end.setDate(start.getDate()+6);
  document.getElementById('taskCalTitle').textContent = `${start.toLocaleDateString([], {month:'short', day:'numeric'})} – ${end.toLocaleDateString([], {month:'short', day:'numeric', year:'numeric'})}`;
  let html = `<div class="uc-week-row">`;
  for(let i=0;i<7;i++){
    const d = new Date(start); d.setDate(start.getDate()+i);
    const dateStr = ymdLocal(d);
    const isToday = dateStr===todayKey();
    const evts = taskEventsForDate(dateStr);
    html += `<div class="uc-week-cell ${isToday?'today':''}" onclick="openTaskModal(null,'${dateStr}')" title="${evts.map(e=>e.title).join(', ')}">
        <div class="text-faint" style="font-size:.64rem">${DAY_NAMES[d.getDay()]}</div>
        <div class="fw-bold mono" style="font-size:.85rem">${d.getDate()}</div>
        <div class="uc-dots justify-content-center">${evts.slice(0,4).map(e=>`<span class="uc-dot" style="background:${e.color}"></span>`).join('')}</div>
      </div>`;
  }
  html += `</div>`;
  return html;
}

function taskDayHtml(){
  const dateStr = ymdLocal(taskCalDate);
  document.getElementById('taskCalTitle').textContent = taskCalDate.toLocaleDateString([], {weekday:'long', month:'long', day:'numeric', year:'numeric'});
  const evts = taskEventsForDate(dateStr);
  if(!evts.length) return `<div class="text-center py-3 text-faint" style="cursor:pointer" onclick="openTaskModal(null,'${dateStr}')"><i class="bi bi-plus-circle me-1"></i>No tasks — tap to add one for this day</div>`;
  return `<div class="text-center text-faint" style="font-size:.78rem;cursor:pointer" onclick="openTaskModal(null,'${dateStr}')"><i class="bi bi-plus-circle me-1"></i>Tap to add another task for this day</div>`;
}

function getTaskPeriodDates(){
  const dates = [];
  if(taskCalMode==='month'){
    const y = taskCalDate.getFullYear(), m = taskCalDate.getMonth();
    const daysInMonth = new Date(y,m+1,0).getDate();
    for(let d=1; d<=daysInMonth; d++) dates.push(ymdLocal(new Date(y,m,d)));
  } else if(taskCalMode==='week'){
    const start = new Date(taskCalDate); start.setDate(taskCalDate.getDate()-taskCalDate.getDay());
    for(let i=0;i<7;i++){ const d=new Date(start); d.setDate(start.getDate()+i); dates.push(ymdLocal(d)); }
  } else {
    dates.push(ymdLocal(taskCalDate));
  }
  return dates;
}
function taskPeriodLabel(){
  if(taskCalMode==='month') return 'Tasks This Month';
  if(taskCalMode==='week') return 'Tasks This Week';
  return 'Tasks Today';
}
function renderTaskCalListForPeriod(){
  const titleEl = document.getElementById('taskListTitle');
  if(titleEl) titleEl.innerHTML = `<i class="bi bi-list-task"></i>${taskPeriodLabel()}`;
  const wrap = document.getElementById('taskCalList');
  if(!wrap) return;
  const periodDates = getTaskPeriodDates();
  const _calSemId4 = DB.getActiveSemesterId();
  const tasks = DB.getTasks().filter(t=>t.semesterId===_calSemId4)
    .filter(t=>periodDates.includes(t.dueDate))
    .sort((a,b)=> (a.dueDate+a.dueTime).localeCompare(b.dueDate+b.dueTime));
  if(!tasks.length){
    wrap.innerHTML = `<div class="text-center py-4"><i class="bi bi-check2-square" style="font-size:1.6rem;color:var(--text-faint)"></i><div class="text-soft mt-2" style="font-size:.85rem;font-weight:600">No tasks in this period</div><div class="text-faint" style="font-size:.75rem">Tap "Add Task" or any date above to add one.</div></div>`;
    return;
  }
  wrap.innerHTML = tasks.map(t=>`
    <div class="list-row">
      <span class="dot-color" style="background:${CATEGORY_COLORS[t.category]||'#8a90a6'}"></span>
      <div class="flex-grow-1">
        <div style="font-weight:700;font-size:.85rem;${t.status==='completed'?'text-decoration:line-through':''}">${escapeHtml(t.title)}</div>
        <div class="text-faint" style="font-size:.75rem"><i class="bi bi-calendar3 me-1"></i>${new Date(t.dueDate+'T00:00').toLocaleDateString([], {month:'short', day:'numeric', year:'numeric'})} · ${fmtTime(t.dueTime)} · ${t.category}</div>
      </div>
      <button class="btn-icon" onclick="openTaskModal('${t.id}')"><i class="bi bi-pencil"></i></button>
      <button class="btn-icon" onclick="deleteCalTask('${t.id}')"><i class="bi bi-trash3"></i></button>
    </div>`).join('');
}

/* ---------- Add/Edit Task modal (writes to the same tasks store as Task Manager) ---------- */
function openTaskModal(id, presetDate){
  taskEditingId = id || null;
  const t = id ? DB.getTasks().find(x=>x.id===id) : null;
  const _calSemId3 = DB.getActiveSemesterId();
  const subs = DB.getSubjects().filter(s=>s.semesterId===_calSemId3);
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
    const _calNewSemId = DB.getActiveSemesterId();
    tasks.push({ id: DB.uid(), progress:0, repeat:'none', score:null, remarks:'', reminder:true, checklist:[], createdAt:Date.now(), semesterId:_calNewSemId, ...data });
  }
  DB.saveTasks(tasks);
  bootstrap.Modal.getInstance(document.getElementById('calTaskModal')).hide();
  Toast.show(id?'Task updated':'Task added — it now appears in Tasks too');
  renderTaskCalendar();
}
function deleteCalTask(id){
  DB.saveTasks(DB.getTasks().filter(x=>x.id!==id));
  const inst = bootstrap.Modal.getInstance(document.getElementById('calTaskModal'));
  if(inst) inst.hide();
  Toast.show('Task deleted');
  renderTaskCalendar();
}


/* ============================================================
   SEPARATE UNIVERSITY CALENDAR (its own month/week/day view)
   ============================================================ */
const UNIV_COLORS = ['#F59E0B','#7C6CF6','#4F8CFF','#FB7185','#34D399','#22D3EE','#F472B6','#A78BFA'];
let univCalMode = 'month';
let univCalDate = new Date();
let univModalMode = 'range';
let univModalColor = UNIV_COLORS[0];
let univEditingId = null;

function univEventsForDate(dateStr){
  return DB.getUniversityEvents().filter(u=>u.dates.includes(dateStr));
}

function setUnivCalMode(m){
  univCalMode = m;
  document.querySelectorAll('[data-ucmode]').forEach(b=>b.classList.toggle('active', b.dataset.ucmode===m));
  renderUnivCalendar();
}
function navUnivCal(dir){
  if(univCalMode==='month') univCalDate.setMonth(univCalDate.getMonth()+dir);
  else if(univCalMode==='week') univCalDate.setDate(univCalDate.getDate()+dir*7);
  else univCalDate.setDate(univCalDate.getDate()+dir);
  renderUnivCalendar();
}

function renderUnivCalendar(){
  const body = document.getElementById('univCalBody');
  if(!body) return;
  body.innerHTML = univCalMode==='month' ? univMonthHtml() : univCalMode==='week' ? univWeekHtml() : univDayHtml();
  renderUnivEventListForPeriod();
}

function univMonthHtml(){
  const y = univCalDate.getFullYear(), m = univCalDate.getMonth();
  document.getElementById('univCalTitle').textContent = univCalDate.toLocaleDateString([], {month:'long', year:'numeric'});
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
    const evts = univEventsForDate(dateStr);
    html += `<div class="uc-cell ${isToday?'today':''} ${other?'other-month':''}" onclick="openUnivEventModal(null,'${dateStr}')" title="${evts.map(e=>e.title).join(', ')}">
      <div class="uc-daynum">${dayNum}</div>
      <div class="uc-dots">${evts.slice(0,4).map(e=>`<span class="uc-dot" style="background:${e.color}"></span>`).join('')}</div>
    </div>`;
  }
  html += `</div>`;
  return html;
}

function univWeekHtml(){
  const start = new Date(univCalDate); start.setDate(univCalDate.getDate()-univCalDate.getDay());
  const end = new Date(start); end.setDate(start.getDate()+6);
  document.getElementById('univCalTitle').textContent = `${start.toLocaleDateString([], {month:'short', day:'numeric'})} – ${end.toLocaleDateString([], {month:'short', day:'numeric', year:'numeric'})}`;
  let html = `<div class="uc-week-row">`;
  for(let i=0;i<7;i++){
    const d = new Date(start); d.setDate(start.getDate()+i);
    const dateStr = ymdLocal(d);
    const isToday = dateStr===todayKey();
    const evts = univEventsForDate(dateStr);
    html += `<div class="uc-week-cell ${isToday?'today':''}" onclick="openUnivEventModal(null,'${dateStr}')" title="${evts.map(e=>e.title).join(', ')}">
        <div class="text-faint" style="font-size:.64rem">${DAY_NAMES[d.getDay()]}</div>
        <div class="fw-bold mono" style="font-size:.85rem">${d.getDate()}</div>
        <div class="uc-dots justify-content-center">${evts.slice(0,4).map(e=>`<span class="uc-dot" style="background:${e.color}"></span>`).join('')}</div>
      </div>`;
  }
  html += `</div>`;
  return html;
}

function univDayHtml(){
  const dateStr = ymdLocal(univCalDate);
  document.getElementById('univCalTitle').textContent = univCalDate.toLocaleDateString([], {weekday:'long', month:'long', day:'numeric', year:'numeric'});
  const evts = univEventsForDate(dateStr);
  if(!evts.length) return `<div class="text-center py-3 text-faint" style="cursor:pointer" onclick="openUnivEventModal(null,'${dateStr}')"><i class="bi bi-plus-circle me-1"></i>No events — tap to add one for this day</div>`;
  return `<div class="text-center text-faint" style="font-size:.78rem;cursor:pointer" onclick="openUnivEventModal(null,'${dateStr}')"><i class="bi bi-plus-circle me-1"></i>Tap to add another event for this day</div>`;
}

function getUnivPeriodDates(){
  const dates = [];
  if(univCalMode==='month'){
    const y = univCalDate.getFullYear(), m = univCalDate.getMonth();
    const daysInMonth = new Date(y,m+1,0).getDate();
    for(let d=1; d<=daysInMonth; d++) dates.push(ymdLocal(new Date(y,m,d)));
  } else if(univCalMode==='week'){
    const start = new Date(univCalDate); start.setDate(univCalDate.getDate()-univCalDate.getDay());
    for(let i=0;i<7;i++){ const d=new Date(start); d.setDate(start.getDate()+i); dates.push(ymdLocal(d)); }
  } else {
    dates.push(ymdLocal(univCalDate));
  }
  return dates;
}
function univPeriodLabel(){
  if(univCalMode==='month') return 'Events This Month';
  if(univCalMode==='week') return 'Events This Week';
  return 'Events Today';
}

function renderUnivEventListForPeriod(){
  const titleEl = document.getElementById('univListTitle');
  if(titleEl) titleEl.innerHTML = `<i class="bi bi-calendar-event"></i>${univPeriodLabel()}`;
  const wrap = document.getElementById('univEventList');
  if(!wrap) return;
  const periodDates = getUnivPeriodDates();
  const events = DB.getUniversityEvents()
    .filter(e=> e.dates.some(d=>periodDates.includes(d)))
    .sort((a,b)=> (a.dates[0]||'').localeCompare(b.dates[0]||''));
  if(!events.length){
    wrap.innerHTML = `<div class="text-center py-4"><i class="bi bi-calendar-plus" style="font-size:1.6rem;color:var(--text-faint)"></i><div class="text-soft mt-2" style="font-size:.85rem;font-weight:600">No university events in this period</div><div class="text-faint" style="font-size:.75rem">Tap "Add Event" or any date above to add one.</div></div>`;
    return;
  }
  wrap.innerHTML = events.map(e=>`
    <div class="list-row">
      <span class="dot-color" style="background:${e.color}"></span>
      <div class="flex-grow-1">
        <div style="font-weight:700;font-size:.85rem">${escapeHtml(e.title)}</div>
        <div class="text-faint" style="font-size:.75rem"><i class="bi bi-calendar3 me-1"></i>${formatUnivDates(e.dates)}</div>
        ${e.note?`<div class="text-faint" style="font-size:.72rem">${escapeHtml(e.note)}</div>`:''}
      </div>
      <button class="btn-icon" onclick="openUnivEventModal('${e.id}')"><i class="bi bi-pencil"></i></button>
      <button class="btn-icon" onclick="deleteUnivEvent('${e.id}')"><i class="bi bi-trash3"></i></button>
    </div>`).join('');
}

/* ---------- University event modal (add/edit) ---------- */
function openUnivEventModal(id, presetDate){
  univEditingId = id || null;
  const existing = id ? DB.getUniversityEvents().find(e=>e.id===id) : null;
  univModalColor = existing ? (existing.color||UNIV_COLORS[0]) : UNIV_COLORS[0];
  univModalMode = existing && existing.dates.length>2 && isContiguousRange(existing.dates) ? 'range' : (existing ? 'multiple' : 'range');

  const initialDates = existing ? existing.dates.slice().sort() : (presetDate ? [presetDate] : [todayKey()]);
  const rangeStart = initialDates[0];
  const rangeEnd = initialDates[initialDates.length-1];

  const body = document.getElementById('univEventModalBody');
  body.innerHTML = `
    <h5 class="mb-3"><i class="bi bi-bank2 me-2"></i>${existing?'Edit':'Add'} University Event</h5>
    <div class="mb-2"><label>Event Title</label><input class="form-control" id="ueTitle" placeholder="e.g. Semestral Break, Enrollment, Foundation Day" value="${existing?escapeHtml(existing.title):''}"></div>
    <div class="mb-3"><label>Note (optional)</label><textarea class="form-control" id="ueNote" rows="2" placeholder="Additional details…">${existing?escapeHtml(existing.note||''):''}</textarea></div>

    <div class="mb-2">
      <label>Color</label>
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
    while(d <= endD){
      dates.push(ymdLocal(d));
      d.setDate(d.getDate()+1);
    }
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
  renderUnivCalendar();
}
function deleteUnivEvent(id){
  const events = DB.getUniversityEvents().filter(e=>e.id!==id);
  DB.saveUniversityEvents(events);
  const modalEl = document.getElementById('univEventModal');
  const inst = bootstrap.Modal.getInstance(modalEl);
  if(inst) inst.hide();
  Toast.show('University event deleted');
  renderUnivCalendar();
}
function isContiguousRange(dates){
  const sorted = dates.slice().sort();
  for(let i=1;i<sorted.length;i++){
    const prev = new Date(sorted[i-1]+'T00:00');
    const cur = new Date(sorted[i]+'T00:00');
    if((cur-prev)/86400000 !== 1) return false;
  }
  return true;
}
function formatUnivDates(dates){
  const sorted = dates.slice().sort();
  const ranges = [];
  let rangeStart = sorted[0], prev = sorted[0];
  for(let i=1;i<=sorted.length;i++){
    const cur = sorted[i];
    const prevD = new Date(prev+'T00:00');
    const curD = cur ? new Date(cur+'T00:00') : null;
    if(curD && (curD-prevD)/86400000===1){ prev = cur; continue; }
    ranges.push([rangeStart, prev]);
    if(cur){ rangeStart = cur; prev = cur; }
  }
  return ranges.map(([s,e])=>{
    const sd = new Date(s+'T00:00'), ed = new Date(e+'T00:00');
    if(s===e) return sd.toLocaleDateString([], {month:'short', day:'numeric', year:'numeric'});
    if(sd.getMonth()===ed.getMonth() && sd.getFullYear()===ed.getFullYear()){
      return `${sd.toLocaleDateString([], {month:'short'})} ${sd.getDate()}–${ed.getDate()}, ${ed.getFullYear()}`;
    }
    return `${sd.toLocaleDateString([], {month:'short', day:'numeric'})} – ${ed.toLocaleDateString([], {month:'short', day:'numeric', year:'numeric'})}`;
  }).join(', ');
}
