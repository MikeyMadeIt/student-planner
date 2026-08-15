/* ============================================================
   SCHEDULE.JS — Daily Command Center Edition
   ============================================================ */

/* ── State ── */
let schedView = 'day';
let showArchived = false;
let ttHourHeight = 52;
let _selectedDate = new Date();        // currently viewed date
let _weekOffset = 0;                   // weeks from the "real today"
let _tickTimer = null;

/* ── Helpers re-used from app.js ── */
function esc(s){ return escHtml(s); }
function toMins(t){ if(!t) return 0; const [h,m]=t.split(':').map(Number); return h*60+m; }
function fromMins(m){ const h=Math.floor(m/60),mm=m%60; return String(h).padStart(2,'0')+':'+String(mm).padStart(2,'0'); }
function minsDiff(a,b){ return toMins(b)-toMins(a); }
function nowMins(){ const n=new Date(); return n.getHours()*60+n.getMinutes(); }
function isoDate(d){ return ymdLocal(d); }
function dateAddDays(d,n){ const r=new Date(d); r.setDate(r.getDate()+n); return r; }
function weekStart(d){ const r=new Date(d); r.setDate(r.getDate()-(r.getDay()===0?6:r.getDay()-1)); return r; }  // Monday-based
function sameDay(a,b){ return isoDate(a)===isoDate(b); }

const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAY_LONG  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/* ── Init ── */
function initSchedule(){
  const params = new URLSearchParams(location.search);
  if(params.get('new')==='1') openSubjectModal();

  renderNav();
  renderAllViews();
  startTick();

  document.addEventListener('visibilitychange', ()=>{
    if(!document.hidden){ renderNextCard(); renderDaySummary(); }
  });
}

/* ── Tick (live updates every 30s) ── */
function startTick(){
  clearInterval(_tickTimer);
  _tickTimer = setInterval(()=>{ renderNextCard(); renderDaySummary(); }, 30000);
}

/* ── View switching ── */
function setSchedView(v){
  schedView = v;
  document.querySelectorAll('.sched-toggle-btn[data-view]').forEach(b=>b.classList.toggle('active', b.dataset.view===v));
  document.getElementById('schDayView').classList.toggle('d-none', v!=='day');
  document.getElementById('schTimetableView').classList.toggle('d-none', v!=='timetable');
  document.getElementById('schListView').classList.toggle('d-none', v!=='list');
  document.getElementById('schTasksPanel').classList.toggle('d-none', v!=='day');
  renderAllViews();
}

/* ── Week / day navigation ── */
function shiftWeek(dir){
  _weekOffset += dir;
  _selectedDate = dateAddDays(new Date(), _weekOffset * 7);
  // Snap to Monday of the target week if going forward/back
  const ws = weekStart(_selectedDate);
  _selectedDate = ws;
  renderNav();
  renderAllViews();
}
function shiftDay(dir){
  _selectedDate = dateAddDays(_selectedDate, dir);
  renderNav();
  renderAllViews();
}
function goToday(){
  _weekOffset = 0;
  _selectedDate = new Date();
  renderNav();
  renderAllViews();
}
function selectDay(d){
  _selectedDate = d;
  renderNav();
  renderAllViews();
}

/* ── Navigation bar render ── */
function renderNav(){
  const ws = weekStart(_selectedDate);
  const we = dateAddDays(ws, 6); // Mon-Sun
  const label = `${MONTH_NAMES[ws.getMonth()]} ${ws.getDate()} – ${we.getDate()}, ${ws.getFullYear()}`;
  document.getElementById('schWeekLabel').textContent = label;

  const strip = document.getElementById('schDayStrip');
  const today = new Date();
  // Show Mon-Sun of the selected week
  strip.innerHTML = [0,1,2,3,4,5,6].map(i=>{
    const d = dateAddDays(ws, i);
    const isToday = sameDay(d, today);
    const isSel = sameDay(d, _selectedDate);
    const dayName = DAY_SHORT[d.getDay()];
    return `<button class="sch-day-btn ${isSel?'selected':''} ${isToday?'today':''}" onclick="selectDay(new Date('${isoDate(d)}T00:00:00'))">
      <span class="sch-day-name">${dayName.toUpperCase()}</span>
      <span class="sch-day-num">${d.getDate()}</span>
      ${isToday?'<span class="sch-today-dot"></span>':''}
    </button>`;
  }).join('');
}

/* ── Get subjects for a day ── */
function getSubjectsForDay(date){
  const semId = DB.getActiveSemesterId();
  const dayName = DAY_SHORT[date.getDay()];
  return DB.getSubjects()
    .filter(s=> s.semesterId===semId && !s.archived && s.days && s.days.includes(dayName))
    .sort((a,b)=> toMins(a.start)-toMins(b.start));
}

/* ── All semester subjects (not archived) ── */
function getSemesterSubjects(){
  const semId = DB.getActiveSemesterId();
  return DB.getSubjects().filter(s=> s.semesterId===semId && !s.archived);
}

/* ── Tasks due today for a subject ── */
function getTasksDueToday(subjectId){
  const today = isoDate(new Date());
  const semId = DB.getActiveSemesterId();
  return DB.getTasks().filter(t=>
    t.semesterId===semId && t.subjectId===subjectId && t.dueDate===today
  );
}

function getAllTasksDueToday(){
  const today = isoDate(new Date());
  const semId = DB.getActiveSemesterId();
  return DB.getTasks().filter(t=> t.semesterId===semId && t.dueDate===today);
}

/* ── Next/current class logic ── */
function getNextOrCurrentClass(date){
  const classes = getSubjectsForDay(date);
  if(!classes.length) return null;
  const nm = nowMins();
  // Currently happening?
  const current = classes.find(s=> toMins(s.start)<=nm && toMins(s.end)>nm);
  if(current) return { type:'now', subject:current };
  // Next class today
  const next = classes.find(s=> toMins(s.start)>nm);
  if(next) return { type:'next', subject:next };
  return null;
}

/* ── Detect schedule conflicts ── */
function detectConflicts(classes){
  const conflicts = [];
  for(let i=0;i<classes.length;i++){
    for(let j=i+1;j<classes.length;j++){
      const a=classes[i], b=classes[j];
      const aStart=toMins(a.start), aEnd=toMins(a.end);
      const bStart=toMins(b.start), bEnd=toMins(b.end);
      if(aStart<bEnd && aEnd>bStart){
        const overlapMins = Math.min(aEnd,bEnd)-Math.max(aStart,bStart);
        conflicts.push({ a, b, overlapMins });
      }
    }
  }
  return conflicts;
}

/* ── Free time blocks ── */
function buildTimeline(classes){
  const MIN_FREE = 15; // minutes — smaller gaps are ignored
  const items = [];
  let prev = null;
  classes.forEach(s=>{
    if(prev){
      const gap = toMins(s.start)-toMins(prev.end);
      if(gap >= MIN_FREE){
        items.push({ type:'free', start:prev.end, end:s.start, mins:gap });
      }
    }
    items.push({ type:'class', subject:s });
    prev = s;
  });
  return items;
}

/* ── Render all views ── */
function renderAllViews(){
  renderNextCard();
  if(schedView==='day'){ renderDaySummary(); renderTasksPanel(); }
  else if(schedView==='timetable') renderTimetable();
  else renderListView();
}

/* ── Next / Current class card ── */
function renderNextCard(){
  const host = document.getElementById('schNextCard');
  const today = new Date();
  const isToday = sameDay(_selectedDate, today);
  if(!isToday){ host.innerHTML=''; return; }

  const info = getNextOrCurrentClass(today);

  if(!info){
    const classes = getSubjectsForDay(today);
    const hadClasses = classes.length>0;
    host.innerHTML = `<div class="glass card-pad sch-next-card sch-done fade-in">
      <div class="sch-next-badge done"><i class="bi bi-check2-circle"></i></div>
      <div class="sch-next-body">
        <div class="sch-next-label">${hadClasses?'NO MORE CLASSES TODAY':'NO CLASSES TODAY'}</div>
        <div class="sch-next-subject">${hadClasses?'You\'re done with your schedule for today.':'You have no scheduled classes for today.'}</div>
      </div>
    </div>`;
    return;
  }

  const s = info.subject;
  const nm = nowMins();
  const location = [s.room, s.building].filter(Boolean).join(' · ');
  const timeStr = `${fmtTime(s.start)} – ${fmtTime(s.end)}`;

  if(info.type==='now'){
    const elapsed = nm - toMins(s.start);
    const total = toMins(s.end) - toMins(s.start);
    const pct = Math.min(100, Math.round((elapsed/total)*100));
    const remaining = toMins(s.end) - nm;
    host.innerHTML = `<div class="glass card-pad sch-next-card sch-now fade-in" style="--sc-color:${s.color}">
      <div class="sch-next-badge now"><i class="bi bi-broadcast"></i></div>
      <div class="sch-next-body">
        <div class="sch-next-label">NOW IN SESSION</div>
        <div class="sch-next-subject">${esc(s.desc)}</div>
        <div class="sch-next-meta"><span class="text-faint">${esc(s.code)}</span><span class="sch-dot-sep">·</span><span class="text-faint">${timeStr}</span></div>
        ${location?`<div class="sch-next-loc"><i class="bi bi-geo-alt"></i>${esc(location)}</div>`:''}
        <div class="sch-now-progress-wrap mt-2">
          <div class="d-flex justify-content-between mb-1" style="font-size:.7rem;color:var(--text-faint)">
            <span>${pct}% through</span><span>${remaining}m remaining</span>
          </div>
          <div class="sch-now-track"><div class="sch-now-fill" style="width:${pct}%;background:${s.color}"></div></div>
        </div>
      </div>
      <button class="btn btn-ghost btn-sm sch-next-edit" onclick="openSubjectModal('${s.id}')" title="Edit"><i class="bi bi-pencil"></i></button>
    </div>`;
  } else {
    const minsAway = toMins(s.start) - nm;
    const awayStr = minsAway < 60 ? `Starts in ${minsAway}m` : `Starts in ${Math.floor(minsAway/60)}h ${minsAway%60}m`;
    host.innerHTML = `<div class="glass card-pad sch-next-card sch-upcoming fade-in" style="--sc-color:${s.color}">
      <div class="sch-next-badge next"><i class="bi bi-arrow-right-circle"></i></div>
      <div class="sch-next-body">
        <div class="sch-next-label">NEXT CLASS</div>
        <div class="sch-next-subject">${esc(s.desc)}</div>
        <div class="sch-next-meta"><span class="text-faint">${esc(s.code)}</span><span class="sch-dot-sep">·</span><span class="text-faint">${timeStr}</span></div>
        ${location?`<div class="sch-next-loc"><i class="bi bi-geo-alt"></i>${esc(location)}</div>`:''}
        <div class="sch-next-away">${awayStr}</div>
      </div>
      <button class="btn btn-ghost btn-sm sch-next-edit" onclick="openSubjectModal('${s.id}')" title="Edit"><i class="bi bi-pencil"></i></button>
    </div>`;
  }
}

/* ── Day view: summary + timeline ── */
function renderDaySummary(){
  const host = document.getElementById('schDayView');
  const classes = getSubjectsForDay(_selectedDate);
  const today = new Date();
  const isToday = sameDay(_selectedDate, today);
  const nm = nowMins();

  // Summary stats
  const totalClassMins = classes.reduce((acc,s)=> acc + (toMins(s.end)-toMins(s.start)), 0);
  const conflicts = detectConflicts(classes);

  let summaryHtml = '';
  if(classes.length){
    const firstStart = classes[0].start, lastEnd = classes[classes.length-1].end;
    const spanMins = toMins(lastEnd) - toMins(firstStart);
    const freeMins = spanMins - totalClassMins;
    summaryHtml = `<div class="sch-day-summary glass card-pad mb-3 fade-in">
      <div class="sch-summary-label">${isToday?'TODAY':'DAY SUMMARY'} · ${DAY_LONG[_selectedDate.getDay()].toUpperCase()}</div>
      <div class="sch-summary-stats">
        <div class="sch-stat"><span class="sch-stat-val">${classes.length}</span><span class="sch-stat-lbl">Class${classes.length===1?'':'es'}</span></div>
        <div class="sch-stat-div"></div>
        <div class="sch-stat"><span class="sch-stat-val">${fmtDuration(totalClassMins)}</span><span class="sch-stat-lbl">Class Time</span></div>
        ${freeMins>=15?`<div class="sch-stat-div"></div><div class="sch-stat"><span class="sch-stat-val">${fmtDuration(freeMins)}</span><span class="sch-stat-lbl">Free Time</span></div>`:''}
      </div>
    </div>`;
  }

  // Conflict warnings
  let conflictHtml = '';
  if(conflicts.length){
    conflictHtml = conflicts.map(c=>`
      <div class="sch-conflict-banner glass card-pad mb-2 fade-in">
        <i class="bi bi-exclamation-triangle-fill sch-conflict-icon"></i>
        <div>
          <div class="sch-conflict-title">Schedule Conflict</div>
          <div class="sch-conflict-body">${esc(c.a.code)} and ${esc(c.b.code)} overlap by ${c.overlapMins} minute${c.overlapMins===1?'':'s'}.</div>
        </div>
      </div>`).join('');
  }

  // Timeline
  let timelineHtml = '';
  if(!classes.length){
    timelineHtml = `<div class="glass card-pad sch-empty-day fade-in">
      <i class="bi bi-calendar-x" style="font-size:1.6rem;opacity:.4"></i>
      <div class="mt-2 fw-bold" style="color:var(--text)">No Classes ${isToday?'Today':'This Day'}</div>
      <div class="text-faint" style="font-size:.85rem">You have no scheduled classes for ${DAY_LONG[_selectedDate.getDay()]}.</div>
    </div>`;
  } else {
    const timeline = buildTimeline(classes);
    timelineHtml = `<div class="sch-timeline fade-in">` + timeline.map((item, idx)=>{
      if(item.type==='free'){
        return `<div class="sch-timeline-free">
          <div class="sch-tl-connector free"></div>
          <div class="sch-free-block">
            <i class="bi bi-cup-hot-fill sch-free-icon"></i>
            FREE TIME · ${fmtDuration(item.mins)}
          </div>
        </div>`;
      }
      const s = item.subject;
      const isNow = isToday && toMins(s.start)<=nm && toMins(s.end)>nm;
      const isPast = isToday && toMins(s.end)<=nm;
      const location = [s.room, s.building].filter(Boolean).join(' · ');
      const tasks = getTasksDueToday(s.id);
      const isLast = idx === timeline.length-1;
      const elapsed = isNow ? nm - toMins(s.start) : 0;
      const total = toMins(s.end) - toMins(s.start);
      const pct = isNow ? Math.min(100, Math.round((elapsed/total)*100)) : 0;

      return `<div class="sch-tl-item ${isNow?'is-now':''} ${isPast?'is-past':''}" id="schTl-${s.id}">
        <div class="sch-tl-left">
          <div class="sch-tl-time">${fmtTime(s.start)}</div>
          ${!isLast?'<div class="sch-tl-line"></div>':''}
        </div>
        <div class="sch-tl-card glass" style="--sc-color:${s.color}">
          ${isNow?'<div class="sch-now-badge"><i class="bi bi-broadcast"></i> NOW</div>':''}
          <div class="sch-tl-header">
            <div class="sch-tl-dot" style="background:${s.color}"></div>
            <div class="sch-tl-info">
              <div class="sch-tl-title">${esc(s.desc)}</div>
              <div class="sch-tl-code">${esc(s.code)}</div>
            </div>
            <div class="d-flex gap-1 ms-auto flex-shrink-0">
              <button class="btn-icon sched-icon-btn" onclick="showSubjectDetail('${s.id}')" title="Details"><i class="bi bi-info-circle"></i></button>
              <button class="btn-icon sched-icon-btn" onclick="openSubjectModal('${s.id}')" title="Edit"><i class="bi bi-pencil"></i></button>
            </div>
          </div>
          <div class="sch-tl-meta">
            <span><i class="bi bi-clock"></i>${fmtTime(s.start)} – ${fmtTime(s.end)}</span>
            ${location?`<span><i class="bi bi-geo-alt"></i>${esc(location)}</span>`:''}
            ${s.professor?`<span><i class="bi bi-person"></i>${esc(s.professor)}</span>`:''}
          </div>
          ${isNow?`<div class="sch-tl-now-bar mt-2"><div class="sch-tl-now-fill" style="width:${pct}%;background:${s.color}"></div></div>`:''}
          ${tasks.length?`<div class="sch-tl-tasks" onclick="location.href='tasks.html'">
            <i class="bi bi-check2-square"></i>
            <span>${tasks.length} task${tasks.length===1?'':'s'} due today</span>
            <i class="bi bi-arrow-right ms-auto sch-task-arrow"></i>
          </div>`:''}
        </div>
      </div>`;
    }).join('') + `</div>`;
  }

  host.innerHTML = summaryHtml + conflictHtml + timelineHtml;
}

/* ── Today's tasks panel ── */
function renderTasksPanel(){
  const host = document.getElementById('schTasksPanel');
  if(!sameDay(_selectedDate, new Date())){ host.innerHTML=''; return; }
  const tasks = getAllTasksDueToday();
  host.innerHTML = `<div class="glass card-pad mb-3 fade-in">
    <div class="d-flex justify-content-between align-items-center mb-2">
      <div class="section-title mb-0"><i class="bi bi-check2-square"></i>Today's Tasks</div>
      <a href="tasks.html" class="btn btn-ghost btn-sm">View All</a>
    </div>
    ${tasks.length
      ? `<div class="sch-task-list">${tasks.map(t=>`
          <div class="sch-task-row ${t.status==='completed'?'done':''}">
            <i class="bi ${t.status==='completed'?'bi-check-circle-fill':'bi-circle'} sch-task-icon"></i>
            <span class="sch-task-title">${esc(t.title)}</span>
            ${t.priority==='high'?'<span class="chip high" style="font-size:.6rem">!</span>':''}
          </div>`).join('')}
        </div>`
      : `<div class="text-faint" style="font-size:.84rem">No tasks due today.</div>`}
  </div>`;
}

/* ── Weekly timetable ── */
function ttZoom(dir){ ttHourHeight = Math.max(36, Math.min(90, ttHourHeight + dir*8)); renderTimetable(); }

function renderTimetable(){
  const wrap = document.getElementById('ttGrid');
  const semId = DB.getActiveSemesterId();
  const allSubs = DB.getSubjects().filter(s=>s.semesterId===semId && !s.archived);
  const startHour = 6, endHour = 21;
  const today = new Date();
  const todayName = DAY_SHORT[today.getDay()];
  const nm = nowMins();

  // Build Mon-Sun columns
  const ws = weekStart(_selectedDate);
  const weekDays = [0,1,2,3,4,5,6].map(i=>dateAddDays(ws,i));

  let html = `<div style="display:grid;grid-template-columns:52px repeat(7,minmax(0,1fr));position:relative">`;
  // Header row
  html += `<div></div>`;
  weekDays.forEach(d=>{
    const isToday = sameDay(d,today);
    const dayN = DAY_SHORT[d.getDay()];
    html += `<div class="tt-head ${isToday?'tt-head-today':''}">${dayN}<span class="tt-head-date ${isToday?'tt-head-date-today':''}">${d.getDate()}</span></div>`;
  });

  // Hour column + day columns
  html += `<div>`;
  for(let h=startHour;h<=endHour;h++){
    html += `<div class="tt-cell tt-hour" style="height:${ttHourHeight}px">${fmtTime(String(h).padStart(2,'0')+':00')}</div>`;
  }
  html += `</div>`;

  weekDays.forEach(d=>{
    const dayName = DAY_SHORT[d.getDay()];
    const isToday = sameDay(d,today);
    const dayClasses = allSubs.filter(s=>s.days && s.days.includes(dayName));
    const overlapMap = computeOverlaps(dayClasses);

    html += `<div class="tt-col ${isToday?'tt-col-today':''}" style="position:relative">`;
    for(let h=startHour;h<=endHour;h++){ html += `<div class="tt-cell" style="height:${ttHourHeight}px"></div>`; }

    dayClasses.forEach(s=>{
      const sh=toMins(s.start)/60, eh=toMins(s.end)/60;
      const top = (sh-startHour)*ttHourHeight;
      const height = Math.max(20,(eh-sh)*ttHourHeight);
      const {col,cols}=overlapMap.get(s.id)||{col:0,cols:1};
      const wpct=100/cols;
      const isNowClass = isToday && toMins(s.start)<=nm && toMins(s.end)>nm;
      html += `<div class="tt-block ${isNowClass?'tt-block-now':''}" title="${s.code}: ${s.desc}"
        style="top:${top}px;height:${height}px;left:calc(${col*wpct}% + 2px);width:calc(${wpct}% - 4px);background:${s.color};opacity:${isNowClass?1:.88}"
        onclick="showSubjectDetail('${s.id}')">
        <div class="tt-block-code">${esc(s.code)}</div>
        <div class="tt-block-time">${fmtTime(s.start)}</div>
        ${height>42?`<div class="tt-block-room">${esc(s.room)}</div>`:''}
      </div>`;
    });

    if(isToday){
      const nowH = nowMins()/60;
      if(nowH>=startHour && nowH<=endHour){
        html += `<div class="tt-now-line" style="top:${(nowH-startHour)*ttHourHeight}px"></div>`;
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
    for(let i=active.length-1;i>=0;i--){ if(active[i].end<=s.start) active.splice(i,1); }
    let col=0;
    const usedCols=active.map(a=>map.get(a.id).col);
    while(usedCols.includes(col)) col++;
    active.push(s);
    map.set(s.id,{col});
  });
  sorted.forEach(s=>{
    const overlapping=sorted.filter(o=>o.start<s.end && o.end>s.start);
    const cols=Math.max(...overlapping.map(o=>map.get(o.id).col))+1;
    map.set(s.id,{col:map.get(s.id).col,cols});
  });
  return map;
}

/* ── Subject list view ── */
function renderListView(){
  const wrap = document.getElementById('schSubjectList');
  const q = (document.getElementById('schSearchInput')?.value||'').toLowerCase().trim();
  const semId = DB.getActiveSemesterId();
  let list = DB.getSubjects().filter(s=>{
    if(s.semesterId!==semId) return false;
    if(!showArchived && s.archived) return false;
    return true;
  }).sort((a,b)=>a.start.localeCompare(b.start));
  if(q) list = list.filter(s=>
    s.code.toLowerCase().includes(q)||s.desc.toLowerCase().includes(q)||
    s.professor.toLowerCase().includes(q)||s.room.toLowerCase().includes(q));

  const sem = DB.getActiveSemester();
  if(!list.length){
    wrap.innerHTML = `<div class="col-12"><div class="glass card-pad text-center py-4 text-faint"><i class="bi bi-journal-x" style="font-size:1.5rem;opacity:.5"></i><div class="mt-2">${sem?`No subjects for ${sem.schoolYear} · ${sem.name}`:'No subjects found'}</div></div></div>`;
    return;
  }
  wrap.innerHTML = list.map(s=>`
    <div class="col-md-6 col-xl-4">
      <div class="glass subject-card hover-lift" style="--sc-color:${s.color}">
        <div class="d-flex align-items-center gap-2 mb-1">
          <span class="sched-dot" style="background:${s.color}"></span>
          <span class="fw-bold" style="font-size:.88rem">${esc(s.code)}</span>
          ${s.archived?'<span class="chip" style="font-size:.6rem">archived</span>':''}
          <div class="d-flex gap-1 ms-auto">
            <button class="btn-icon sched-icon-btn" onclick="openSubjectModal('${s.id}')"><i class="bi bi-pencil"></i></button>
            <button class="btn-icon sched-icon-btn" onclick="deleteSubject('${s.id}')"><i class="bi bi-trash"></i></button>
          </div>
        </div>
        <div class="sched-desc">${esc(s.desc)}</div>
        <div class="sched-meta">
          <span><i class="bi bi-clock"></i>${s.days.join(', ')} · ${fmtTime(s.start)}–${fmtTime(s.end)}</span>
          <span><i class="bi bi-geo-alt"></i>${esc(s.room)}${s.building?' · '+esc(s.building):''}</span>
          ${s.professor?`<span><i class="bi bi-person"></i>${esc(s.professor)}</span>`:''}
        </div>
        <div class="d-flex gap-1 mt-2 pt-2" style="border-top:1px solid var(--border)">
          <button class="btn btn-ghost btn-sm sched-action-btn flex-grow-1" onclick="duplicateSubject('${s.id}')"><i class="bi bi-copy me-1"></i>Duplicate</button>
          <button class="btn btn-ghost btn-sm sched-action-btn flex-grow-1" onclick="archiveSubject('${s.id}')"><i class="bi bi-archive me-1"></i>${s.archived?'Restore':'Archive'}</button>
        </div>
      </div>
    </div>`).join('');
}

function toggleArchivedView(){
  showArchived=!showArchived;
  document.getElementById('schArchiveBtn')?.classList.toggle('active',showArchived);
  renderListView();
}

/* ── Subject detail modal ── */
function showSubjectDetail(id){
  const s=DB.getSubject(id); if(!s) return;
  const location=[s.room,s.building].filter(Boolean).join(', ');
  const body=document.getElementById('detailModalBody');
  body.innerHTML=`
    <div class="modal-header" style="border:none;padding-bottom:8px">
      <div class="d-flex align-items-center gap-2">
        <span style="width:10px;height:10px;border-radius:50%;background:${s.color};display:inline-block;flex-shrink:0"></span>
        <h5 class="modal-title mb-0">${esc(s.code)}</h5>
      </div>
      <button class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
    </div>
    <p class="text-soft mb-3" style="font-size:.88rem">${esc(s.desc)}</p>
    <div class="d-flex flex-column gap-2 mb-3" style="font-size:.83rem">
      <div class="d-flex gap-2"><i class="bi bi-clock text-faint"></i><span>${s.days.join(', ')} · ${fmtTime(s.start)}–${fmtTime(s.end)}</span></div>
      ${location?`<div class="d-flex gap-2"><i class="bi bi-geo-alt text-faint"></i><span>${esc(location)}</span></div>`:''}
      ${s.professor?`<div class="d-flex gap-2"><i class="bi bi-person text-faint"></i><span>${esc(s.professor)}${s.email?' · '+esc(s.email):''}</span></div>`:''}
      <div class="d-flex gap-2"><i class="bi bi-mortarboard text-faint"></i><span>${s.units} units · ${s.type} · ${s.section}</span></div>
      ${s.notes?`<div class="d-flex gap-2"><i class="bi bi-sticky text-faint"></i><span>${esc(s.notes)}</span></div>`:''}
    </div>
    <button class="btn btn-accent w-100 btn-sm" onclick="bootstrap.Modal.getInstance(document.getElementById('detailModal')).hide();openSubjectModal('${s.id}')"><i class="bi bi-pencil me-1"></i>Edit Subject</button>`;
  new bootstrap.Modal(document.getElementById('detailModal')).show();
}

/* ── CRUD (unchanged from original, kept compatible) ── */
function openSubjectModal(id){
  const s=id?DB.getSubject(id):null;
  document.getElementById('subjectModalTitle').textContent=s?'Edit Subject':'Add Subject';
  const sem=DB.getActiveSemester();
  const body=document.getElementById('subjectModalBody');
  const days=s?s.days:[];
  body.innerHTML=`
    <input type="hidden" id="subId" value="${s?s.id:''}">
    <div class="row g-2">
      <div class="col-md-4"><label>Subject Code</label><input class="form-control" id="subCode" value="${s?esc(s.code):''}" placeholder="CS101"></div>
      <div class="col-md-8"><label>Subject Description</label><input class="form-control" id="subDesc" value="${s?esc(s.desc):''}" placeholder="Introduction to Computing"></div>
      <div class="col-md-4"><label>Subject Type</label>
        <select class="form-select" id="subType">${['Lecture','Laboratory','Seminar','Hybrid'].map(t=>`<option ${s&&s.type===t?'selected':''}>${t}</option>`).join('')}</select></div>
      <div class="col-md-4"><label>Units</label><input type="number" step="0.5" class="form-control" id="subUnits" value="${s?s.units:3}"></div>
      <div class="col-md-4"><label>Section</label><input class="form-control" id="subSection" value="${s?esc(s.section):''}" placeholder="BSCS-1A"></div>
      <div class="col-12"><label>Days</label>
        <div class="d-flex gap-2 flex-wrap">
          ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`
            <div class="form-check form-check-inline">
              <input class="form-check-input day-check" type="checkbox" value="${d}" id="day_${d}" ${days.includes(d)?'checked':''}>
              <label class="form-check-label" for="day_${d}">${d}</label>
            </div>`).join('')}
        </div>
      </div>
      <div class="col-md-6"><label>Start Time</label><input type="time" class="form-control" id="subStart" value="${s?s.start:'08:00'}"></div>
      <div class="col-md-6"><label>End Time</label><input type="time" class="form-control" id="subEnd" value="${s?s.end:'09:00'}"></div>
      <div class="col-md-4"><label>Room</label><input class="form-control" id="subRoom" value="${s?esc(s.room):''}"></div>
      <div class="col-md-8"><label>Building</label><input class="form-control" id="subBuilding" value="${s?esc(s.building):''}"></div>
      <div class="col-md-6"><label>Professor</label><input class="form-control" id="subProf" value="${s?esc(s.professor):''}"></div>
      <div class="col-md-6"><label>Email</label><input type="email" class="form-control" id="subEmail" value="${s?esc(s.email):''}"></div>
      <div class="col-12"><label>Color Label</label>
        <div class="d-flex gap-2 flex-wrap" id="colorPicker">
          ${DB.colors.map(c=>`<div onclick="selectColor('${c}')" data-color="${c}" style="width:26px;height:26px;border-radius:7px;background:${c};cursor:pointer;box-shadow:${(s?s.color:DB.colors[0])===c?'0 0 0 3px rgba(255,255,255,.5)':'none'}"></div>`).join('')}
        </div>
        <input type="hidden" id="subColor" value="${s?s.color:DB.colors[0]}">
      </div>
      <div class="col-12"><label>Notes</label><textarea class="form-control" id="subNotes" rows="2">${s?esc(s.notes):''}</textarea></div>
    </div>
    <div class="d-flex gap-2 mt-3">
      <button class="btn btn-accent flex-grow-1" onclick="saveSubject()"><i class="bi bi-check2 me-1"></i>${s?'Update':'Save'} Subject</button>
      ${s?`<button class="btn btn-ghost" onclick="deleteSubject('${s.id}')"><i class="bi bi-trash3"></i></button>`:''}
    </div>`;
  new bootstrap.Modal(document.getElementById('subjectModal')).show();
}

function selectColor(c){
  document.getElementById('subColor').value=c;
  document.querySelectorAll('#colorPicker div').forEach(d=>d.style.boxShadow=d.dataset.color===c?'0 0 0 3px rgba(255,255,255,.5)':'none');
}

function saveSubject(){
  const id=document.getElementById('subId').value;
  const code=document.getElementById('subCode').value.trim();
  if(!code){ Toast.show('Subject code is required','high','bi-exclamation-triangle'); return; }
  const days=[...document.querySelectorAll('.day-check:checked')].map(c=>c.value);
  const sem=DB.getActiveSemester();
  const data={
    code, desc:document.getElementById('subDesc').value.trim(),
    type:document.getElementById('subType').value,
    units:parseFloat(document.getElementById('subUnits').value)||0,
    section:document.getElementById('subSection').value.trim(),
    days, start:document.getElementById('subStart').value, end:document.getElementById('subEnd').value,
    room:document.getElementById('subRoom').value.trim(), building:document.getElementById('subBuilding').value.trim(),
    professor:document.getElementById('subProf').value.trim(), email:document.getElementById('subEmail').value.trim(),
    color:document.getElementById('subColor').value, notes:document.getElementById('subNotes').value.trim(),
    semester:sem?sem.name:'1st Semester', schoolYear:sem?sem.schoolYear:'2026-2027',
    semesterId:sem?sem.id:DB.getActiveSemesterId(), archived:false,
  };
  const subjects=DB.getSubjects();
  if(id){ const idx=subjects.findIndex(s=>s.id===id); if(idx!==-1) subjects[idx]={...subjects[idx],...data}; }
  else subjects.push({id:DB.uid(),...data});
  DB.saveSubjects(subjects);
  bootstrap.Modal.getInstance(document.getElementById('subjectModal')).hide();
  Toast.show(id?'Subject updated':'Subject added');
  renderAllViews();
}

function deleteSubject(id){
  const s=DB.getSubject(id); if(!s) return;
  confirmAction({
    title:'Delete subject?',
    message:`"${s.code} — ${s.desc}" will be permanently removed.`,
    confirmLabel:'Delete', danger:true, icon:'bi-trash-fill',
    onConfirm(){ DB.saveSubjects(DB.getSubjects().filter(x=>x.id!==id)); Toast.show('Subject deleted'); renderAllViews(); }
  });
}

function duplicateSubject(id){
  const subjects=DB.getSubjects();
  const s=subjects.find(x=>x.id===id); if(!s) return;
  subjects.push({...s,id:DB.uid(),code:s.code+' (copy)'});
  DB.saveSubjects(subjects);
  Toast.show('Subject duplicated');
  renderAllViews();
}

function archiveSubject(id){
  const subjects=DB.getSubjects();
  const s=subjects.find(x=>x.id===id); if(!s) return;
  s.archived=!s.archived;
  DB.saveSubjects(subjects);
  Toast.show(s.archived?'Subject archived':'Subject restored');
  renderAllViews();
}

function escapeHtml(s){ return escHtml(s); }
