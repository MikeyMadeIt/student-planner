/* ============================================================
   SCHEDULE.JS — Advanced Academic Command Center
   ============================================================ */

/* ── State ── */
let schedView = 'day';
let showArchived = false;
let ttHourHeight = 52;
let _selectedDate = new Date();
let _weekOffset = 0;
let _tickTimer = null;
let _pinchStartDist = 0;
let _pinchStartZoom = 52;

/* ── Helpers ── */
function esc(s){ return escHtml(s); }
function toMins(t){ if(!t) return 0; const [h,m]=t.split(':').map(Number); return h*60+m; }
function fromMins(m){ const h=Math.floor(m/60),mm=m%60; return String(h).padStart(2,'0')+':'+String(mm).padStart(2,'0'); }
function minsDiff(a,b){ return toMins(b)-toMins(a); }
function nowMins(){ const n=new Date(); return n.getHours()*60+n.getMinutes(); }
function isoDate(d){ return ymdLocal(d); }
function dateAddDays(d,n){ const r=new Date(d); r.setDate(r.getDate()+n); return r; }
function weekStart(d){ const r=new Date(d); r.setDate(r.getDate()-(r.getDay()===0?6:r.getDay()-1)); return r; }
function sameDay(a,b){ return isoDate(a)===isoDate(b); }

const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAY_LONG  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/* ── Cancellation helpers ── */
function getCancelledOccurrences(){
  try{ return JSON.parse(localStorage.getItem('sp_cancelled_occurrences')||'[]'); }catch(e){ return []; }
}
function saveCancelledOccurrences(arr){
  localStorage.setItem('sp_cancelled_occurrences', JSON.stringify(arr));
}
function isOccurrenceCancelled(subjectId, dateStr){
  return getCancelledOccurrences().some(c=>c.subjectId===subjectId && c.date===dateStr);
}
function getCancellationInfo(subjectId, dateStr){
  return getCancelledOccurrences().find(c=>c.subjectId===subjectId && c.date===dateStr)||null;
}
function cancelOccurrence(subjectId, dateStr, reason=''){
  const arr = getCancelledOccurrences();
  const existing = arr.find(c=>c.subjectId===subjectId && c.date===dateStr);
  if(existing){ existing.reason=reason; }
  else arr.push({ subjectId, date:dateStr, reason, cancelledAt:Date.now() });
  saveCancelledOccurrences(arr);
}
function restoreOccurrence(subjectId, dateStr){
  const arr = getCancelledOccurrences().filter(c=>!(c.subjectId===subjectId && c.date===dateStr));
  saveCancelledOccurrences(arr);
}

/* ── Attendance helpers ── */
function getAttendanceRecord(subjectId, dateStr){
  const semId = DB.getActiveSemesterId();
  return DB.getAttendance().find(r=>r.subjectId===subjectId && r.date===dateStr && r.semesterId===semId)||null;
}
function logQuickAttendance(subjectId, dateStr, status){
  const semId = DB.getActiveSemesterId();
  const records = DB.getAttendance();
  const existing = records.find(r=>r.subjectId===subjectId && r.date===dateStr && r.semesterId===semId);
  if(existing){
    existing.status = status;
  } else {
    records.push({ id:DB.uid(), subjectId, date:dateStr, status, online:false, notes:'', semesterId:semId });
  }
  DB.saveAttendance(records);
}

/* ── Grade helpers ── */
function getSubjectGradeAvg(subjectId){
  const grades = DB.getGrades();
  const g = grades.find(x=>x.subjectId===subjectId);
  if(!g || !g.components || !g.components.length) return null;
  let totalWeight=0, weightedSum=0;
  g.components.forEach(c=>{
    const w = parseFloat(c.weight)||0;
    let score = null;
    if(Array.isArray(c.assessments) && c.assessments.length){
      const scored = c.assessments.filter(a=>a.score!=null);
      if(scored.length){
        const avg = scored.reduce((s,a)=>{
          const maxItems = a.totalItems||100;
          return s + (a.score/maxItems*100);
        },0)/scored.length;
        score = avg;
      }
    } else if(c.score!=null && c.score!==''){
      score = parseFloat(c.score);
    }
    if(score!=null && w>0){ weightedSum+=score*(w/100); totalWeight+=w; }
  });
  if(totalWeight===0) return null;
  return Math.round((weightedSum/totalWeight)*100)/100;
}
function getSubjectAttendanceRate(subjectId){
  const semId = DB.getActiveSemesterId();
  const records = DB.getAttendance().filter(r=>r.subjectId===subjectId && r.semesterId===semId && r.status!=='No Classes');
  if(!records.length) return null;
  const present = records.filter(r=>r.status==='Present'||r.status==='Late'||r.status==='Excused').length;
  return Math.round(present/records.length*100);
}

/* ── Init ── */
function initSchedule(){
  const params = new URLSearchParams(location.search);
  if(params.get('new')==='1') openSubjectModal();
  setSchedView('day'); // sets initial view and syncs buttons
  renderNav();
  renderAllViews();
  startTick();
  setupPinchZoom();
  document.addEventListener('visibilitychange', ()=>{
    if(!document.hidden){ renderNextCard(); renderDaySummary(); }
  });
}

/* ── Tick ── */
function startTick(){
  clearInterval(_tickTimer);
  _tickTimer = setInterval(()=>{ renderNextCard(); renderDaySummary(); }, 30000);
}

/* ── View switching ── */
function setSchedView(v){
  schedView = v;
  // Sync ALL toggle buttons — by data-view attribute
  document.querySelectorAll('.sch-toggle-btn[data-view]').forEach(b=>{
    const isActive = b.dataset.view === v;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
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
  const we = dateAddDays(ws, 6);
  const label = `${MONTH_NAMES[ws.getMonth()]} ${ws.getDate()} – ${we.getDate()}, ${ws.getFullYear()}`;
  document.getElementById('schWeekLabel').textContent = label;

  const strip = document.getElementById('schDayStrip');
  const today = new Date();
  strip.innerHTML = [0,1,2,3,4,5,6].map(i=>{
    const d = dateAddDays(ws, i);
    const isToday = sameDay(d, today);
    const isSel = sameDay(d, _selectedDate);
    const dayName = DAY_SHORT[d.getDay()];
    const dateStr = isoDate(d);
    // No has-classes dots — removed per requirement #5
    return `<button class="sch-day-btn ${isSel?'selected':''} ${isToday?'today':''}" onclick="selectDay(new Date('${dateStr}T00:00:00'))" aria-label="${DAY_LONG[d.getDay()]} ${d.getDate()}" aria-pressed="${isSel?'true':'false'}">
      <span class="sch-day-name">${dayName.toUpperCase()}</span>
      <span class="sch-day-num">${d.getDate()}</span>
    </button>`;
  }).join('');
}

/* ── Get subjects for a day ── */
function getSubjectsForDay(date){
  const semId = DB.getActiveSemesterId();
  const dayName = DAY_SHORT[date.getDay()];
  return DB.getSubjects()
    .filter(s=>s.semesterId===semId && !s.archived && s.days && s.days.includes(dayName))
    .sort((a,b)=>toMins(a.start)-toMins(b.start));
}

/* ── All semester subjects ── */
function getSemesterSubjects(){
  const semId = DB.getActiveSemesterId();
  return DB.getSubjects().filter(s=>s.semesterId===semId && !s.archived);
}

/* ── Tasks helpers ── */
function getTasksDueToday(subjectId){
  const today = isoDate(new Date());
  const semId = DB.getActiveSemesterId();
  return DB.getTasks().filter(t=>t.semesterId===semId && t.subjectId===subjectId && t.dueDate===today);
}
function getAllTasksDueToday(){
  const today = isoDate(new Date());
  const semId = DB.getActiveSemesterId();
  return DB.getTasks().filter(t=>t.semesterId===semId && t.dueDate===today);
}

/* ── Next/current class logic (skips cancelled) ── */
function getNextOrCurrentClass(date){
  const dateStr = isoDate(date);
  const classes = getSubjectsForDay(date).filter(s=>!isOccurrenceCancelled(s.id, dateStr));
  if(!classes.length) return null;
  const nm = nowMins();
  const current = classes.find(s=>toMins(s.start)<=nm && toMins(s.end)>nm);
  if(current) return { type:'now', subject:current };
  const next = classes.find(s=>toMins(s.start)>nm);
  if(next) return { type:'next', subject:next };
  return null;
}

/* ── Conflict detection ── */
function detectConflicts(classes){
  const conflicts = [];
  const seen = new Set();
  for(let i=0;i<classes.length;i++){
    for(let j=i+1;j<classes.length;j++){
      const a=classes[i], b=classes[j];
      const aStart=toMins(a.start), aEnd=toMins(a.end);
      const bStart=toMins(b.start), bEnd=toMins(b.end);
      if(aStart<bEnd && aEnd>bStart){
        const key = [a.id,b.id].sort().join('|');
        if(!seen.has(key)){
          seen.add(key);
          const overlapMins = Math.min(aEnd,bEnd)-Math.max(aStart,bStart);
          conflicts.push({ a, b, overlapMins });
        }
      }
    }
  }
  return conflicts;
}

/* ── Detect conflicts for all days (for week view) ── */
function detectAllWeekConflicts(){
  const semId = DB.getActiveSemesterId();
  const allSubs = DB.getSubjects().filter(s=>s.semesterId===semId && !s.archived);
  const conflictSubjectIds = new Set();
  DAY_SHORT.forEach(dayName=>{
    const daySubs = allSubs.filter(s=>s.days && s.days.includes(dayName));
    const conflicts = detectConflicts(daySubs);
    conflicts.forEach(c=>{ conflictSubjectIds.add(c.a.id); conflictSubjectIds.add(c.b.id); });
  });
  return conflictSubjectIds;
}

/* ── Check conflict for save (returns array of conflicting subjects) ── */
function checkSaveConflict(data, excludeId){
  const semId = DB.getActiveSemesterId();
  const allSubs = DB.getSubjects().filter(s=>s.semesterId===semId && !s.archived && s.id!==excludeId);
  const conflicts = [];
  const newStart = toMins(data.start), newEnd = toMins(data.end);
  allSubs.forEach(s=>{
    if(!s.days || !data.days) return;
    const sharedDays = s.days.filter(d=>data.days.includes(d));
    if(!sharedDays.length) return;
    const sStart = toMins(s.start), sEnd = toMins(s.end);
    if(newStart<sEnd && newEnd>sStart){
      conflicts.push(s);
    }
  });
  return conflicts;
}

/* ── Free time blocks ── */
function buildTimeline(classes){
  const MIN_FREE = 15;
  const items = [];
  let prev = null;
  classes.forEach(s=>{
    if(prev){
      const gap = toMins(s.start)-toMins(prev.end);
      if(gap >= MIN_FREE) items.push({ type:'free', start:prev.end, end:s.start, mins:gap });
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

/* ── Next / Current class card (improved) ── */
function renderNextCard(){
  const host = document.getElementById('schNextCard');
  const today = new Date();
  const isToday = sameDay(_selectedDate, today);
  if(!isToday){ host.innerHTML=''; return; }

  const todayStr = isoDate(today);
  const info = getNextOrCurrentClass(today);

  if(!info){
    const classes = getSubjectsForDay(today);
    const hadClasses = classes.length>0;
    host.innerHTML = `<div class="glass card-pad sch-next-card sch-done fade-in">
      <div class="sch-next-badge done" aria-hidden="true"><i class="bi bi-check2-circle"></i></div>
      <div class="sch-next-body">
        <div class="sch-next-label">${hadClasses?'NO MORE CLASSES TODAY':'NO CLASSES TODAY'}</div>
        <div class="sch-next-subject">${hadClasses?'All done for today!':'No scheduled classes.'}</div>
      </div>
    </div>`;
    return;
  }

  const s = info.subject;
  const nm = nowMins();
  const location = buildLocation(s);
  const timeStr = `${fmtTime(s.start)} – ${fmtTime(s.end)}`;
  const attRecord = getAttendanceRecord(s.id, todayStr);
  const attStatus = attRecord ? attRecord.status : null;
  const onlineChip = s.online ? `<span class="sch-online-chip" aria-label="Online class"><i class="bi bi-wifi"></i> ONLINE</span>` : '';

  const attBtn = buildAttendanceBtn(s.id, todayStr, attStatus, 'small');

  if(info.type==='now'){
    const elapsed = nm - toMins(s.start);
    const total = toMins(s.end) - toMins(s.start);
    const pct = Math.min(100, Math.round((elapsed/total)*100));
    const remaining = toMins(s.end) - nm;
    host.innerHTML = `<div class="glass card-pad sch-next-card sch-now fade-in" style="--sc-color:${s.color}">
      <div class="sch-next-badge now" aria-hidden="true"><i class="bi bi-broadcast"></i></div>
      <div class="sch-next-body">
        <div class="sch-next-label">NOW IN SESSION</div>
        <div class="sch-next-subject">${esc(s.desc)}</div>
        <div class="sch-next-meta"><span class="text-faint">${esc(s.code)}</span><span class="sch-dot-sep" aria-hidden="true">·</span><span class="text-faint">${timeStr}</span>${onlineChip}</div>
        ${location?`<div class="sch-next-loc"><i class="bi bi-geo-alt" aria-hidden="true"></i>${esc(location)}</div>`:''}
        <div class="sch-now-progress-wrap mt-2">
          <div class="d-flex justify-content-between mb-1" style="font-size:.7rem;color:var(--text-faint)">
            <span>${pct}% through</span><span>${remaining}m remaining</span>
          </div>
          <div class="sch-now-track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div class="sch-now-fill" style="width:${pct}%;background:${s.color}"></div></div>
        </div>
      </div>
      <div class="sch-next-actions">
        ${buildAttendanceIconBtn(s.id, todayStr, attStatus)}
        <button class="btn btn-ghost btn-sm sch-next-edit" onclick="openSubjectModal('${s.id}')" title="Edit subject" aria-label="Edit ${esc(s.code)}"><i class="bi bi-pencil" aria-hidden="true"></i></button>
      </div>
    </div>`;
  } else {
    const minsAway = toMins(s.start) - nm;
    const awayStr = minsAway < 60 ? `In ${minsAway}m` : `In ${Math.floor(minsAway/60)}h ${minsAway%60}m`;
    host.innerHTML = `<div class="glass card-pad sch-next-card sch-upcoming fade-in" style="--sc-color:${s.color}">
      <div class="sch-next-badge next" aria-hidden="true"><i class="bi bi-arrow-right-circle"></i></div>
      <div class="sch-next-body">
        <div class="sch-next-label">NEXT CLASS</div>
        <div class="sch-next-subject">${esc(s.desc)}</div>
        <div class="sch-next-meta"><span class="text-faint">${esc(s.code)}</span><span class="sch-dot-sep" aria-hidden="true">·</span><span class="text-faint">${timeStr}</span>${onlineChip}</div>
        ${location?`<div class="sch-next-loc"><i class="bi bi-geo-alt" aria-hidden="true"></i>${esc(location)}</div>`:''}
        <div class="sch-next-away">${awayStr}</div>
      </div>
      <div class="sch-next-actions">
        ${buildAttendanceIconBtn(s.id, todayStr, attStatus)}
        <button class="btn btn-ghost btn-sm sch-next-edit" onclick="openSubjectModal('${s.id}')" title="Edit subject" aria-label="Edit ${esc(s.code)}"><i class="bi bi-pencil" aria-hidden="true"></i></button>
      </div>
    </div>`;
  }
}

/* ── Build location string ── */
function buildLocation(s){
  if(s.online) return null;
  const parts = [];
  if(s.building) parts.push(s.building);
  if(s.room) parts.push('Room '+s.room);
  return parts.join(' · ') || (s.room||s.building||'');
}

/* ── Attendance button builder ── */
function buildAttendanceBtn(subjectId, dateStr, existingStatus, size='normal'){
  const isSmall = size==='small';
  if(existingStatus && existingStatus!=='No Classes'){
    const icons = { Present:'bi-check-circle-fill', Late:'bi-clock-fill', Absent:'bi-x-circle-fill', Excused:'bi-shield-check' };
    const colors = { Present:'#34d399', Late:'#fbbf24', Absent:'#fb7185', Excused:'#60a5fa' };
    const ic = icons[existingStatus]||'bi-check-circle-fill';
    const col = colors[existingStatus]||'var(--text-faint)';
    return `<div class="sch-att-logged" style="color:${col}"><i class="bi ${ic}" aria-hidden="true"></i> ${existingStatus}</div>`;
  }
  const btnClass = isSmall ? 'btn btn-ghost btn-sm sch-att-btn' : 'btn btn-ghost btn-sm sch-att-btn';
  return `<button class="${btnClass}" onclick="openQuickAttModal('${subjectId}','${dateStr}')" aria-label="Log attendance for this class"><i class="bi bi-person-check" aria-hidden="true"></i> Attendance</button>`;
}

/* ── Attendance icon button (compact, for card header) ── */
function buildAttendanceIconBtn(subjectId, dateStr, existingStatus){
  if(existingStatus && existingStatus!=='No Classes'){
    const icons = { Present:'bi-check-circle-fill', Late:'bi-clock-fill', Absent:'bi-x-circle-fill', Excused:'bi-shield-check' };
    const colors = { Present:'#34d399', Late:'#fbbf24', Absent:'#fb7185', Excused:'#60a5fa' };
    const ic = icons[existingStatus]||'bi-check-circle-fill';
    const col = colors[existingStatus]||'var(--text-faint)';
    return `<button class="btn-icon sched-icon-btn sch-att-icon-logged" style="color:${col}" onclick="openQuickAttModal('${subjectId}','${dateStr}')" title="Attendance: ${existingStatus}" aria-label="Attendance logged: ${existingStatus}"><i class="bi ${ic}" aria-hidden="true"></i></button>`;
  }
  return `<button class="btn-icon sched-icon-btn" onclick="openQuickAttModal('${subjectId}','${dateStr}')" title="Log attendance" aria-label="Log attendance"><i class="bi bi-person-check" aria-hidden="true"></i></button>`;
}

/* ── Quick Attendance Modal ── */
function openQuickAttModal(subjectId, dateStr){
  const s = DB.getSubject(subjectId); if(!s) return;
  // Check if this occurrence is cancelled — don't allow logging for cancelled classes
  if(isOccurrenceCancelled(subjectId, dateStr)){
    Toast.show('This class was cancelled — attendance not applicable', 'high', 'bi-ban');
    return;
  }
  const existing = getAttendanceRecord(subjectId, dateStr);
  const [y,m,d] = dateStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const displayDate = `${months[+m-1]} ${+d}, ${y}`;

  ensureQuickAttModal();
  const body = document.getElementById('quickAttModalBody');
  const statuses = ['Present','Late','Excused','Absent'];
  const currentStatus = existing ? existing.status : '';

  body.innerHTML = `
    <div class="d-flex align-items-center gap-2 mb-3">
      <span style="width:10px;height:10px;border-radius:50%;background:${s.color};flex-shrink:0"></span>
      <div>
        <div class="fw-bold" style="font-size:.9rem">${esc(s.code)}</div>
        <div class="text-faint" style="font-size:.78rem">${esc(s.desc)}</div>
      </div>
    </div>
    <div class="sch-att-date-info mb-3">
      <i class="bi bi-calendar3" aria-hidden="true"></i>
      <span>${displayDate} · ${fmtTime(s.start)} – ${fmtTime(s.end)}</span>
    </div>
    <div class="sch-att-status-grid mb-3" role="group" aria-label="Attendance status">
      ${statuses.map(st=>{
        const icons = { Present:'bi-check-circle', Late:'bi-clock', Absent:'bi-x-circle', Excused:'bi-shield-check' };
        const colors = { Present:'34d399', Late:'fbbf24', Absent:'fb7185', Excused:'60a5fa' };
        const isActive = currentStatus===st;
        return `<button class="sch-att-status-btn ${isActive?'active':''}" data-status="${st}" style="--att-color:#${colors[st]}" onclick="selectQuickAtt('${st}')" aria-pressed="${isActive?'true':'false'}">
          <i class="bi ${icons[st]}" aria-hidden="true"></i>
          <span>${st}</span>
        </button>`;
      }).join('')}
    </div>
    <input type="hidden" id="quickAttSubjectId" value="${subjectId}">
    <input type="hidden" id="quickAttDate" value="${dateStr}">
    <div class="d-flex gap-2">
      <button class="btn btn-accent flex-grow-1" onclick="saveQuickAtt()" aria-label="Save attendance"><i class="bi bi-check2 me-1" aria-hidden="true"></i>Save</button>
      ${existing?`<button class="btn btn-ghost" onclick="clearQuickAtt('${subjectId}','${dateStr}')" aria-label="Clear attendance record"><i class="bi bi-trash3" aria-hidden="true"></i></button>`:''}
    </div>`;

  new bootstrap.Modal(document.getElementById('quickAttModal')).show();
}

function ensureQuickAttModal(){
  if(document.getElementById('quickAttModal')) return;
  const el = document.createElement('div');
  el.innerHTML = `<div class="modal fade" id="quickAttModal" tabindex="-1" aria-modal="true" role="dialog" aria-labelledby="quickAttModalLabel">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content card-pad">
        <div class="modal-header" style="border:none;padding-bottom:8px">
          <h5 class="modal-title" id="quickAttModalLabel"><i class="bi bi-person-check me-2" aria-hidden="true"></i>Log Attendance</h5>
          <button class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div id="quickAttModalBody"></div>
      </div>
    </div>
  </div>`;
  document.body.appendChild(el.firstElementChild);
}

function selectQuickAtt(status){
  document.querySelectorAll('.sch-att-status-btn').forEach(b=>{
    const isActive = b.dataset.status===status;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-pressed', isActive?'true':'false');
  });
}

function saveQuickAtt(){
  const subjectId = document.getElementById('quickAttSubjectId').value;
  const dateStr = document.getElementById('quickAttDate').value;
  const statusBtn = document.querySelector('.sch-att-status-btn.active');
  if(!statusBtn){ Toast.show('Select an attendance status','high','bi-exclamation-triangle'); return; }
  const status = statusBtn.dataset.status;
  logQuickAttendance(subjectId, dateStr, status);
  const modal = bootstrap.Modal.getInstance(document.getElementById('quickAttModal'));
  if(modal) modal.hide();
  Toast.show('Attendance saved');
  renderAllViews();
}

function clearQuickAtt(subjectId, dateStr){
  const semId = DB.getActiveSemesterId();
  const records = DB.getAttendance().filter(r=>!(r.subjectId===subjectId && r.date===dateStr && r.semesterId===semId));
  DB.saveAttendance(records);
  const modal = bootstrap.Modal.getInstance(document.getElementById('quickAttModal'));
  if(modal) modal.hide();
  Toast.show('Attendance cleared');
  renderAllViews();
}

/* ── Cancel Occurrence Modal ── */
function openCancelModal(subjectId, dateStr){
  const s = DB.getSubject(subjectId); if(!s) return;
  const [y,m,d] = dateStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const displayDate = `${months[+m-1]} ${+d}, ${y}`;
  const isCancelled = isOccurrenceCancelled(subjectId, dateStr);

  ensureCancelModal();
  const body = document.getElementById('cancelModalBody');

  if(isCancelled){
    const info = getCancellationInfo(subjectId, dateStr);
    body.innerHTML = `
      <div class="sch-cancel-info">
        <i class="bi bi-ban" aria-hidden="true"></i>
        <div>
          <div class="fw-bold">${displayDate} — ${esc(s.code)} is cancelled</div>
          ${info&&info.reason?`<div class="text-faint" style="font-size:.8rem">${esc(info.reason)}</div>`:''}
        </div>
      </div>
      <div class="d-flex gap-2 mt-3">
        <button class="btn btn-accent flex-grow-1" onclick="doRestoreOccurrence('${subjectId}','${dateStr}')"><i class="bi bi-arrow-counterclockwise me-1" aria-hidden="true"></i>Restore Class</button>
        <button class="btn btn-ghost" data-bs-dismiss="modal">Close</button>
      </div>`;
  } else {
    body.innerHTML = `
      <div class="d-flex align-items-center gap-2 mb-3">
        <span style="width:10px;height:10px;border-radius:50%;background:${s.color};flex-shrink:0"></span>
        <div>
          <div class="fw-bold" style="font-size:.9rem">${esc(s.code)}</div>
          <div class="text-faint" style="font-size:.78rem">${esc(s.desc)}</div>
        </div>
      </div>
      <div class="sch-att-date-info mb-3">
        <i class="bi bi-calendar3" aria-hidden="true"></i>
        <span>${displayDate}</span>
      </div>
      <div class="mb-3">
        <label class="form-label" style="font-size:.82rem">Reason (optional)</label>
        <input class="form-control" id="cancelReason" placeholder="e.g. Faculty meeting" style="font-size:.84rem">
      </div>
      <input type="hidden" id="cancelSubjectId" value="${subjectId}">
      <input type="hidden" id="cancelDate" value="${dateStr}">
      <div class="d-flex gap-2">
        <button class="btn btn-ghost flex-grow-1" data-bs-dismiss="modal">Keep Class</button>
        <button class="btn sch-cancel-btn flex-grow-1" onclick="doCancel()"><i class="bi bi-ban me-1" aria-hidden="true"></i>Cancel Class</button>
      </div>`;
  }

  new bootstrap.Modal(document.getElementById('cancelModal')).show();
}

function ensureCancelModal(){
  if(document.getElementById('cancelModal')) return;
  const el = document.createElement('div');
  el.innerHTML = `<div class="modal fade" id="cancelModal" tabindex="-1" aria-modal="true" role="dialog" aria-labelledby="cancelModalLabel">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content card-pad">
        <div class="modal-header" style="border:none;padding-bottom:8px">
          <h5 class="modal-title" id="cancelModalLabel"><i class="bi bi-calendar-x me-2" aria-hidden="true"></i>Cancel Class</h5>
          <button class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div id="cancelModalBody"></div>
      </div>
    </div>
  </div>`;
  document.body.appendChild(el.firstElementChild);
}

function doCancel(){
  const subjectId = document.getElementById('cancelSubjectId').value;
  const dateStr = document.getElementById('cancelDate').value;
  const reason = (document.getElementById('cancelReason')?.value||'').trim();

  // Mark attendance as No Classes
  const semId = DB.getActiveSemesterId();
  const records = DB.getAttendance();
  const existing = records.find(r=>r.subjectId===subjectId && r.date===dateStr && r.semesterId===semId);
  if(existing){ existing.status='No Classes'; }
  else records.push({ id:DB.uid(), subjectId, date:dateStr, status:'No Classes', online:false, notes:reason||'Class cancelled', semesterId:semId });
  DB.saveAttendance(records);

  cancelOccurrence(subjectId, dateStr, reason);
  const modal = bootstrap.Modal.getInstance(document.getElementById('cancelModal'));
  if(modal) modal.hide();
  Toast.show('Class cancelled for this date');
  renderAllViews();
}

function doRestoreOccurrence(subjectId, dateStr){
  // Remove No Classes attendance record
  const semId = DB.getActiveSemesterId();
  const records = DB.getAttendance().filter(r=>!(r.subjectId===subjectId && r.date===dateStr && r.semesterId===semId && r.status==='No Classes'));
  DB.saveAttendance(records);

  restoreOccurrence(subjectId, dateStr);
  const modal = bootstrap.Modal.getInstance(document.getElementById('cancelModal'));
  if(modal) modal.hide();
  Toast.show('Class restored');
  renderAllViews();
}

/* ── Day view: summary + timeline ── */
function renderDaySummary(){
  const host = document.getElementById('schDayView');
  const allClasses = getSubjectsForDay(_selectedDate);
  const dateStr = isoDate(_selectedDate);
  const today = new Date();
  const isToday = sameDay(_selectedDate, today);
  const nm = nowMins();

  const classes = allClasses;
  const activeClasses = classes.filter(s=>!isOccurrenceCancelled(s.id, dateStr));
  const totalClassMins = activeClasses.reduce((acc,s)=>acc+(toMins(s.end)-toMins(s.start)),0);
  const conflicts = detectConflicts(activeClasses);

  let summaryHtml = '';
  if(classes.length){
    const firstStart = activeClasses.length ? activeClasses[0].start : classes[0].start;
    const lastEnd = activeClasses.length ? activeClasses[activeClasses.length-1].end : classes[classes.length-1].end;
    const spanMins = activeClasses.length ? toMins(lastEnd)-toMins(firstStart) : 0;
    const freeMins = spanMins - totalClassMins;
    const cancelledCount = classes.length - activeClasses.length;
    summaryHtml = `<div class="sch-day-summary glass card-pad mb-3 fade-in">
      <div class="sch-summary-label">${isToday?'TODAY':'DAY SUMMARY'} · ${DAY_LONG[_selectedDate.getDay()].toUpperCase()}</div>
      <div class="sch-summary-stats">
        <div class="sch-stat"><span class="sch-stat-val">${activeClasses.length}</span><span class="sch-stat-lbl">Class${activeClasses.length===1?'':'es'}</span></div>
        <div class="sch-stat-div" aria-hidden="true"></div>
        <div class="sch-stat"><span class="sch-stat-val">${fmtDuration(totalClassMins)}</span><span class="sch-stat-lbl">Class Time</span></div>
        ${freeMins>=15?`<div class="sch-stat-div" aria-hidden="true"></div><div class="sch-stat"><span class="sch-stat-val">${fmtDuration(freeMins)}</span><span class="sch-stat-lbl">Free Time</span></div>`:''}
        ${cancelledCount?`<div class="sch-stat-div" aria-hidden="true"></div><div class="sch-stat"><span class="sch-stat-val" style="color:#fb7185">${cancelledCount}</span><span class="sch-stat-lbl">Cancelled</span></div>`:''}
      </div>
    </div>`;
  }

  let conflictHtml = '';
  if(conflicts.length){
    conflictHtml = `<div class="sch-conflict-banner glass card-pad mb-2 fade-in" role="alert" aria-live="polite">
      <i class="bi bi-exclamation-triangle-fill sch-conflict-icon" aria-hidden="true"></i>
      <div>
        <div class="sch-conflict-title">Schedule Conflict${conflicts.length>1?'s':''}</div>
        ${conflicts.map(c=>`<div class="sch-conflict-body">${esc(c.a.code)} (${fmtTime(c.a.start)}–${fmtTime(c.a.end)}) overlaps ${esc(c.b.code)} (${fmtTime(c.b.start)}–${fmtTime(c.b.end)}) by ${c.overlapMins}m</div>`).join('')}
      </div>
    </div>`;
  }

  let timelineHtml = '';
  if(!classes.length){
    timelineHtml = `<div class="glass card-pad sch-empty-day fade-in">
      <i class="bi bi-calendar-x" style="font-size:1.6rem;opacity:.4" aria-hidden="true"></i>
      <div class="mt-2 fw-bold" style="color:var(--text)">No Classes ${isToday?'Today':'This Day'}</div>
      <div class="text-faint" style="font-size:.85rem">You have no scheduled classes for ${DAY_LONG[_selectedDate.getDay()]}.</div>
      <button class="btn btn-accent btn-sm mt-3" onclick="openSubjectModal()"><i class="bi bi-plus-lg me-1" aria-hidden="true"></i>Add Subject</button>
    </div>`;
  } else {
    const timeline = buildTimeline(classes);
    timelineHtml = `<div class="sch-timeline fade-in" role="list">` + timeline.map((item, idx)=>{
      if(item.type==='free'){
        return `<div class="sch-timeline-free" role="listitem">
          <div class="sch-tl-connector free" aria-hidden="true"></div>
          <div class="sch-free-block">
            <i class="bi bi-cup-hot-fill sch-free-icon" aria-hidden="true"></i>
            FREE TIME · ${fmtDuration(item.mins)}
          </div>
        </div>`;
      }
      const s = item.subject;
      const cancelled = isOccurrenceCancelled(s.id, dateStr);
      const cancelInfo = cancelled ? getCancellationInfo(s.id, dateStr) : null;
      const isNow = !cancelled && isToday && toMins(s.start)<=nm && toMins(s.end)>nm;
      const isPast = isToday && toMins(s.end)<=nm;
      const location = buildLocation(s);
      const tasks = getTasksDueToday(s.id);
      const isLast = idx===timeline.length-1;
      const elapsed = isNow ? nm-toMins(s.start) : 0;
      const total = toMins(s.end)-toMins(s.start);
      const pct = isNow ? Math.min(100,Math.round((elapsed/total)*100)) : 0;
      const attRecord = isToday ? getAttendanceRecord(s.id, dateStr) : null;
      const attStatus = attRecord ? attRecord.status : null;
      const isConflict = activeClasses.length && conflicts.some(c=>c.a.id===s.id||c.b.id===s.id);

      // Day view: only Edit and Cancel buttons (Info removed — #10)
      return `<div class="sch-tl-item ${isNow?'is-now':''} ${isPast?'is-past':''} ${cancelled?'is-cancelled':''}" id="schTl-${s.id}" role="listitem">
        <div class="sch-tl-left" aria-hidden="true">
          <div class="sch-tl-time">${fmtTime(s.start)}</div>
          ${!isLast?'<div class="sch-tl-line"></div>':''}
        </div>
        <div class="sch-tl-card glass ${isConflict&&!cancelled?'sch-conflict-card':''}" style="--sc-color:${s.color}">
          ${isNow?'<div class="sch-now-badge" aria-label="In session now"><i class="bi bi-broadcast" aria-hidden="true"></i> NOW</div>':''}
          ${cancelled?`<div class="sch-cancelled-badge" aria-label="Cancelled"><i class="bi bi-ban" aria-hidden="true"></i> CANCELLED${cancelInfo&&cancelInfo.reason?' · '+esc(cancelInfo.reason):''}</div>`:''}
          <div class="sch-tl-header">
            <div class="sch-tl-dot" style="background:${s.color}" aria-hidden="true"></div>
            <div class="sch-tl-info">
              <div class="sch-tl-title ${cancelled?'sch-cancelled-text':''}">${esc(s.desc)}</div>
              <div class="sch-tl-code">${esc(s.code)}${s.online?'<span class="sch-online-chip ms-1"><i class="bi bi-wifi" aria-hidden="true"></i> ONLINE</span>':''}</div>
            </div>
            <div class="d-flex gap-1 ms-auto flex-shrink-0">
              ${!cancelled && isToday ? buildAttendanceIconBtn(s.id, dateStr, attStatus) : ''}
              <button class="btn-icon sched-icon-btn" onclick="openCancelModal('${s.id}','${dateStr}')" title="${cancelled?'Restore':'Cancel'} this class" aria-label="${cancelled?'Restore':'Cancel'} ${esc(s.code)} on this date"><i class="bi bi-${cancelled?'arrow-counterclockwise':'calendar-x'}" aria-hidden="true"></i></button>
              <button class="btn-icon sched-icon-btn" onclick="openSubjectModal('${s.id}')" title="Edit" aria-label="Edit ${esc(s.code)}"><i class="bi bi-pencil" aria-hidden="true"></i></button>
            </div>
          </div>
          ${!cancelled?`<div class="sch-tl-meta">
            <span><i class="bi bi-clock" aria-hidden="true"></i>${fmtTime(s.start)} – ${fmtTime(s.end)}</span>
            ${location?`<span><i class="bi bi-geo-alt" aria-hidden="true"></i>${esc(location)}</span>`:''}
            ${s.online?`<span><i class="bi bi-wifi" aria-hidden="true"></i>Online class</span>`:''}
            ${s.professor?`<span><i class="bi bi-person" aria-hidden="true"></i>${esc(s.professor)}</span>`:''}
          </div>`:''}
          ${isNow?`<div class="sch-tl-now-bar mt-2" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div class="sch-tl-now-fill" style="width:${pct}%;background:${s.color}"></div></div>`:''}
          ${tasks.length&&!cancelled?`<div class="sch-tl-tasks" onclick="location.href='tasks.html'" role="button" tabindex="0" aria-label="${tasks.length} task${tasks.length===1?'':'s'} due today">
            <i class="bi bi-check2-square" aria-hidden="true"></i>
            <span>${tasks.length} task${tasks.length===1?'':'s'} due today</span>
            <i class="bi bi-arrow-right ms-auto sch-task-arrow" aria-hidden="true"></i>
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
      <div class="section-title mb-0"><i class="bi bi-check2-square" aria-hidden="true"></i>Today's Tasks</div>
      <a href="tasks.html" class="btn btn-ghost btn-sm" aria-label="View all tasks">View All</a>
    </div>
    ${tasks.length
      ? `<div class="sch-task-list" role="list">${tasks.map(t=>`
          <div class="sch-task-row ${t.status==='completed'?'done':''}" role="listitem">
            <i class="bi ${t.status==='completed'?'bi-check-circle-fill':'bi-circle'} sch-task-icon" aria-hidden="true"></i>
            <span class="sch-task-title">${esc(t.title)}</span>
            ${t.priority==='high'?'<span class="chip high" style="font-size:.6rem" aria-label="High priority">!</span>':''}
          </div>`).join('')}
        </div>`
      : `<div class="text-faint" style="font-size:.84rem">No tasks due today.</div>`}
  </div>`;
}

/* ── Weekly timetable ── */
function ttZoom(dir){
  ttHourHeight = Math.max(36, Math.min(96, ttHourHeight + dir*12));
  renderTimetable();
  // Show zoom level badge
  const badge = document.getElementById('ttZoomBadge');
  if(badge){
    const pct = Math.round((ttHourHeight/52)*100);
    badge.textContent = pct+'%';
    badge.style.opacity='1';
    clearTimeout(badge._t);
    badge._t = setTimeout(()=>badge.style.opacity='1', 1200);
  }
}

function renderTimetable(){
  const wrap = document.getElementById('ttGrid');
  const semId = DB.getActiveSemesterId();
  const allSubs = DB.getSubjects().filter(s=>s.semesterId===semId && !s.archived);
  const startHour = 6, endHour = 21;
  const today = new Date();
  const nm = nowMins();
  const ws = weekStart(_selectedDate);
  const weekDays = [0,1,2,3,4,5,6].map(i=>dateAddDays(ws,i));
  const conflictIds = detectAllWeekConflicts();
  const selectedDayName = DAY_SHORT[_selectedDate.getDay()];

  if(!allSubs.length){
    wrap.innerHTML = `<div class="sch-empty-day" style="min-height:200px">
      <i class="bi bi-calendar2-week" style="font-size:1.6rem;opacity:.4" aria-hidden="true"></i>
      <div class="mt-2 fw-bold" style="color:var(--text)">No Classes Scheduled</div>
      <div class="text-faint" style="font-size:.85rem">Add subjects to see your weekly timetable.</div>
    </div>`;
    return;
  }

  let html = `<div class="tt-grid-inner" style="display:grid;grid-template-columns:48px repeat(7,minmax(0,1fr));position:relative">`;
  html += `<div class="tt-corner"></div>`;
  weekDays.forEach(d=>{
    const isToday = sameDay(d,today);
    const isSel = sameDay(d, _selectedDate);
    const dayN = DAY_SHORT[d.getDay()];
    html += `<div class="tt-head ${isToday?'tt-head-today':''} ${isSel?'tt-head-selected':''}" aria-label="${DAY_LONG[d.getDay()]} ${d.getDate()}">${dayN}<span class="tt-head-date ${isToday?'tt-head-date-today':''} ${isSel?'tt-head-date-selected':''}">${d.getDate()}</span></div>`;
  });

  html += `<div class="tt-hour-col">`;
  for(let h=startHour;h<=endHour;h++){
    html += `<div class="tt-cell tt-hour" style="height:${ttHourHeight}px">${fmtTime(String(h).padStart(2,'0')+':00')}</div>`;
  }
  html += `</div>`;

  weekDays.forEach(d=>{
    const dateStr = isoDate(d);
    const dayName = DAY_SHORT[d.getDay()];
    const isToday = sameDay(d,today);
    const isSel = sameDay(d, _selectedDate);
    const dayClasses = allSubs.filter(s=>s.days && s.days.includes(dayName));
    const overlapMap = computeOverlaps(dayClasses);

    html += `<div class="tt-col ${isToday?'tt-col-today':''} ${isSel?'tt-col-selected':''}" style="position:relative" aria-label="${dayName} classes">`;
    for(let h=startHour;h<=endHour;h++){ html += `<div class="tt-cell" style="height:${ttHourHeight}px"></div>`; }

    dayClasses.forEach(s=>{
      const cancelled = isOccurrenceCancelled(s.id, dateStr);
      const sh=toMins(s.start)/60, eh=toMins(s.end)/60;
      const top = (sh-startHour)*ttHourHeight;
      const height = Math.max(20,(eh-sh)*ttHourHeight);
      const {col,cols}=overlapMap.get(s.id)||{col:0,cols:1};
      const wpct=100/cols;
      const isNowClass = isToday && !cancelled && toMins(s.start)<=nm && toMins(s.end)>nm;
      const hasConflict = conflictIds.has(s.id);
      const locationShort = s.room ? `R${s.room}` : (s.online ? '🌐' : '');

      html += `<div class="tt-block ${isNowClass?'tt-block-now':''} ${cancelled?'tt-block-cancelled':''} ${hasConflict&&!cancelled?'tt-block-conflict':''}"
        title="${esc(s.code)}: ${esc(s.desc)}${locationShort?' · '+locationShort:''}"
        style="top:${top}px;height:${height}px;left:calc(${col*wpct}% + 2px);width:calc(${wpct}% - 4px);background:${cancelled?'var(--surface-alt)':s.color};opacity:${cancelled?0.5:isNowClass?1:.88}"
        onclick="showTimetablePopup('${s.id}','${dateStr}')"
        role="button" tabindex="0" aria-label="${esc(s.code)} ${fmtTime(s.start)}${cancelled?' Cancelled':''}">
        <div class="tt-block-code" style="text-decoration:${cancelled?'line-through':'none'}">${esc(s.code)}</div>
        ${height>28?`<div class="tt-block-time">${fmtTime(s.start)}</div>`:''}
        ${height>48 && s.room?`<div class="tt-block-room">${esc(s.room)}</div>`:''}
        ${cancelled&&height>20?'<div class="tt-block-cancelled-label">CANCELLED</div>':''}
        ${hasConflict&&!cancelled?'<div class="tt-conflict-dot" aria-label="Has conflict" title="Schedule conflict"></div>':''}
      </div>`;
    });

    if(isToday){
      const nowH = nowMins()/60;
      if(nowH>=startHour && nowH<=endHour){
        html += `<div class="tt-now-line" style="top:${(nowH-startHour)*ttHourHeight}px" aria-label="Current time indicator"></div>`;
      }
    }
    html += `</div>`;
  });
  html += `</div>`;
  wrap.innerHTML = html;
}

/* ── Timetable popup (info only, no action buttons) ── */
function showTimetablePopup(subjectId, dateStr){
  const s = DB.getSubject(subjectId); if(!s) return;
  const location = buildLocation(s);
  const cancelled = isOccurrenceCancelled(subjectId, dateStr);
  const [y,m,d] = dateStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const displayDate = `${months[+m-1]} ${+d}, ${y}`;

  ensureTimetablePopupModal();
  const body = document.getElementById('ttPopupBody');
  body.innerHTML = `
    <div class="modal-header" style="border:none;padding-bottom:6px;padding-top:14px">
      <div class="d-flex align-items-center gap-2 flex-wrap" style="flex:1;min-width:0">
        <span style="width:9px;height:9px;border-radius:50%;background:${s.color};display:inline-block;flex-shrink:0" aria-hidden="true"></span>
        <span class="fw-bold" style="font-size:.82rem;font-family:var(--font-mono);color:var(--text-faint)">${esc(s.code)}</span>
        ${s.online?'<span class="sch-online-chip"><i class="bi bi-wifi" aria-hidden="true"></i> ONLINE</span>':''}
        ${cancelled?'<span class="sch-cancelled-chip"><i class="bi bi-ban" aria-hidden="true"></i> CANCELLED</span>':''}
      </div>
      <button class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
    </div>
    <div style="padding:0 1rem 1rem">
      <div class="sch-tt-popup-name">${esc(s.desc)}</div>
      <div class="sch-tt-popup-rows">
        <div class="sch-tt-popup-row">
          <i class="bi bi-clock" aria-hidden="true"></i>
          <span>${fmtTime(s.start)} – ${fmtTime(s.end)}</span>
        </div>
        ${location?`<div class="sch-tt-popup-row">
          <i class="bi bi-geo-alt" aria-hidden="true"></i>
          <span>${esc(location)}</span>
        </div>`:''}
        ${s.online?`<div class="sch-tt-popup-row">
          <i class="bi bi-wifi" aria-hidden="true"></i>
          <span>Online class</span>
        </div>`:''}
        ${s.professor?`<div class="sch-tt-popup-row">
          <i class="bi bi-person" aria-hidden="true"></i>
          <span>${esc(s.professor)}${s.email?' · '+esc(s.email):''}</span>
        </div>`:''}
        ${s.section?`<div class="sch-tt-popup-row">
          <i class="bi bi-people" aria-hidden="true"></i>
          <span>${esc(s.section)} · ${s.units} units · ${s.type}</span>
        </div>`:''}
        ${s.notes?`<div class="sch-tt-popup-row">
          <i class="bi bi-sticky" aria-hidden="true"></i>
          <span>${esc(s.notes)}</span>
        </div>`:''}
      </div>
    </div>`;

  new bootstrap.Modal(document.getElementById('ttPopupModal')).show();
}

function ensureTimetablePopupModal(){
  if(document.getElementById('ttPopupModal')) return;
  const el = document.createElement('div');
  el.innerHTML = `<div class="modal fade" id="ttPopupModal" tabindex="-1" aria-modal="true" role="dialog">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content card-pad sch-tt-popup-modal" id="ttPopupBody"></div>
    </div>
  </div>`;
  document.body.appendChild(el.firstElementChild);
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

/* ── Subject list view (improved) ── */
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
    wrap.innerHTML = `<div class="col-12"><div class="glass card-pad text-center py-4">
      <i class="bi bi-journal-x" style="font-size:1.5rem;opacity:.4" aria-hidden="true"></i>
      <div class="mt-2 text-faint">${sem?`No subjects for ${sem.schoolYear} · ${sem.name}`:'No subjects found'}</div>
      ${!showArchived?`<button class="btn btn-accent btn-sm mt-3" onclick="openSubjectModal()"><i class="bi bi-plus-lg me-1" aria-hidden="true"></i>Add Subject</button>`:''}
    </div></div>`;
    return;
  }

  wrap.innerHTML = list.map(s=>{
    const gradeAvg = getSubjectGradeAvg(s.id);
    const attRate = getSubjectAttendanceRate(s.id);
    const location = buildLocation(s);
    const locationLine = s.online
      ? `<span class="sch-online-chip"><i class="bi bi-wifi" aria-hidden="true"></i> ONLINE</span>`
      : (location ? `<span><i class="bi bi-geo-alt" aria-hidden="true"></i>${esc(location)}</span>` : '');

    return `<div class="col-md-6 col-xl-4">
      <div class="glass subject-card hover-lift ${s.archived?'subject-card-archived':''}" style="--sc-color:${s.color}">
        <div class="d-flex align-items-center gap-2 mb-2">
          <span class="sched-dot" style="background:${s.color}" aria-hidden="true"></span>
          <div class="flex-grow-1 min-w-0">
            <div class="d-flex align-items-center gap-1 flex-wrap">
              <span class="fw-bold" style="font-size:.85rem">${esc(s.code)}</span>
              ${s.type==='Laboratory'?'<span class="chip" style="font-size:.58rem;padding:1px 5px">LAB</span>':''}
              ${s.archived?'<span class="chip" style="font-size:.58rem">Archived</span>':''}
            </div>
            <div class="text-soft" style="font-size:.78rem;line-height:1.3;overflow-wrap:anywhere">${esc(s.desc)}</div>
          </div>
          <div class="d-flex gap-1 flex-shrink-0">
            <button class="btn-icon sched-icon-btn" onclick="openSubjectModal('${s.id}')" title="Edit" aria-label="Edit ${esc(s.code)}"><i class="bi bi-pencil" aria-hidden="true"></i></button>
            <button class="btn-icon sched-icon-btn" onclick="deleteSubject('${s.id}')" title="Delete" aria-label="Delete ${esc(s.code)}"><i class="bi bi-trash" aria-hidden="true"></i></button>
          </div>
        </div>

        <div class="sched-meta mb-2">
          <span><i class="bi bi-clock" aria-hidden="true"></i>${s.days.join(', ')} · ${fmtTime(s.start)}–${fmtTime(s.end)}</span>
          ${locationLine}
          ${s.professor?`<span><i class="bi bi-person" aria-hidden="true"></i>${esc(s.professor)}</span>`:''}
        </div>

        <div class="sch-subject-stats">
          <div class="sch-subject-stat">
            <span class="sch-subject-stat-lbl">Grade</span>
            <span class="sch-subject-stat-val ${gradeAvg!==null&&gradeAvg>=75?'stat-good':gradeAvg!==null&&gradeAvg<75?'stat-bad':''}">${gradeAvg!==null?gradeAvg.toFixed(1)+'%':'—'}</span>
          </div>
          <div class="sch-subject-stat-div" aria-hidden="true"></div>
          <div class="sch-subject-stat">
            <span class="sch-subject-stat-lbl">Attendance</span>
            <span class="sch-subject-stat-val ${attRate!==null&&attRate>=75?'stat-good':attRate!==null&&attRate<75?'stat-bad':''}">${attRate!==null?attRate+'%':'—'}</span>
          </div>
          <div class="sch-subject-stat-div" aria-hidden="true"></div>
          <div class="sch-subject-stat">
            <span class="sch-subject-stat-lbl">Units</span>
            <span class="sch-subject-stat-val">${s.units}</span>
          </div>
        </div>

        <div class="d-flex gap-1 mt-2 pt-2" style="border-top:1px solid var(--border)">
          <button class="btn btn-ghost btn-sm sched-action-btn flex-grow-1" onclick="openAttendanceForSubject('${s.id}')" aria-label="Log attendance for ${esc(s.code)}"><i class="bi bi-person-check me-1" aria-hidden="true"></i>Attendance</button>
          <button class="btn btn-ghost btn-sm sched-action-btn flex-grow-1" onclick="archiveSubject('${s.id}')" aria-label="${s.archived?'Restore':'Archive'} ${esc(s.code)}"><i class="bi bi-archive me-1" aria-hidden="true"></i>${s.archived?'Restore':'Archive'}</button>
          <button class="btn btn-ghost btn-sm sched-action-btn" onclick="duplicateSubject('${s.id}')" aria-label="Duplicate ${esc(s.code)}" title="Duplicate"><i class="bi bi-copy" aria-hidden="true"></i></button>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ── Attendance from Subject list view ── */
function openAttendanceForSubject(subjectId){
  const s = DB.getSubject(subjectId); if(!s) return;
  const today = isoDate(new Date());
  // Check if today is a class day for this subject
  const todayDayName = DAY_SHORT[new Date().getDay()];
  const isClassDay = s.days && s.days.includes(todayDayName);
  // Check if cancelled
  if(isClassDay && isOccurrenceCancelled(subjectId, today)){
    Toast.show("Today's class was cancelled — attendance not applicable", 'high', 'bi-ban');
    return;
  }
  // Use today's date for attendance
  openQuickAttModal(subjectId, today);
}

function toggleArchivedView(){
  showArchived=!showArchived;
  document.getElementById('schArchiveBtn')?.classList.toggle('active',showArchived);
  renderListView();
}

/* ── Subject detail modal (timetable card popup replacement kept separate) ── */
function showSubjectDetail(id){
  const s=DB.getSubject(id); if(!s) return;
  const location = buildLocation(s);
  const gradeAvg = getSubjectGradeAvg(s.id);
  const attRate = getSubjectAttendanceRate(s.id);
  const body=document.getElementById('detailModalBody');
  body.innerHTML=`
    <div class="modal-header" style="border:none;padding-bottom:8px">
      <div class="d-flex align-items-center gap-2">
        <span style="width:10px;height:10px;border-radius:50%;background:${s.color};display:inline-block;flex-shrink:0" aria-hidden="true"></span>
        <h5 class="modal-title mb-0">${esc(s.code)}</h5>
        ${s.online?'<span class="sch-online-chip"><i class="bi bi-wifi" aria-hidden="true"></i> ONLINE</span>':''}
      </div>
      <button class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
    </div>
    <p class="text-soft mb-3" style="font-size:.88rem">${esc(s.desc)}</p>
    <div class="d-flex flex-column gap-2 mb-3" style="font-size:.83rem">
      <div class="d-flex gap-2"><i class="bi bi-clock text-faint" aria-hidden="true"></i><span>${s.days.join(', ')} · ${fmtTime(s.start)}–${fmtTime(s.end)}</span></div>
      ${location?`<div class="d-flex gap-2"><i class="bi bi-geo-alt text-faint" aria-hidden="true"></i><span>${esc(location)}</span></div>`:''}
      ${s.online?`<div class="d-flex gap-2"><i class="bi bi-wifi text-faint" aria-hidden="true"></i><span>Online class</span></div>`:''}
      ${s.professor?`<div class="d-flex gap-2"><i class="bi bi-person text-faint" aria-hidden="true"></i><span>${esc(s.professor)}${s.email?' · '+esc(s.email):''}</span></div>`:''}
      <div class="d-flex gap-2"><i class="bi bi-mortarboard text-faint" aria-hidden="true"></i><span>${s.units} units · ${s.type} · ${s.section}</span></div>
      ${s.notes?`<div class="d-flex gap-2"><i class="bi bi-sticky text-faint" aria-hidden="true"></i><span>${esc(s.notes)}</span></div>`:''}
    </div>
    <div class="sch-subject-stats mb-3">
      <div class="sch-subject-stat">
        <span class="sch-subject-stat-lbl">Grade</span>
        <span class="sch-subject-stat-val ${gradeAvg!==null&&gradeAvg>=75?'stat-good':gradeAvg!==null&&gradeAvg<75?'stat-bad':''}">${gradeAvg!==null?gradeAvg.toFixed(1)+'%':'Not available'}</span>
      </div>
      <div class="sch-subject-stat-div" aria-hidden="true"></div>
      <div class="sch-subject-stat">
        <span class="sch-subject-stat-lbl">Attendance</span>
        <span class="sch-subject-stat-val ${attRate!==null&&attRate>=75?'stat-good':attRate!==null&&attRate<75?'stat-bad':''}">${attRate!==null?attRate+'%':'No records'}</span>
      </div>
    </div>
    <div class="d-flex gap-2">
      <button class="btn btn-accent flex-grow-1 btn-sm" onclick="bootstrap.Modal.getInstance(document.getElementById('detailModal')).hide();openSubjectModal('${s.id}')"><i class="bi bi-pencil me-1" aria-hidden="true"></i>Edit</button>
      <button class="btn btn-ghost btn-sm" onclick="bootstrap.Modal.getInstance(document.getElementById('detailModal')).hide();openCancelModal('${s.id}','${isoDate(new Date())}')" aria-label="Cancel today's occurrence"><i class="bi bi-calendar-x me-1" aria-hidden="true"></i>Cancel Today</button>
    </div>`;
  new bootstrap.Modal(document.getElementById('detailModal')).show();
}

/* ── CRUD ── */
function openSubjectModal(id){
  const s=id?DB.getSubject(id):null;
  document.getElementById('subjectModalTitle').textContent=s?'Edit Subject':'Add Subject';
  const sem=DB.getActiveSemester();
  const body=document.getElementById('subjectModalBody');
  const days=s?s.days:[];
  const isOnline = s ? !!s.online : false;
  body.innerHTML=`
    <input type="hidden" id="subId" value="${s?s.id:''}">
    <div class="row g-2">
      <div class="col-5"><label class="form-label" style="font-size:.82rem">Subject Code</label><input class="form-control" id="subCode" value="${s?esc(s.code):''}" placeholder="CS101" aria-label="Subject Code"></div>
      <div class="col-7"><label class="form-label" style="font-size:.82rem">Description</label><input class="form-control" id="subDesc" value="${s?esc(s.desc):''}" placeholder="Introduction to Computing" aria-label="Subject Description"></div>
      <div class="col-4"><label class="form-label" style="font-size:.82rem">Type</label>
        <select class="form-select" id="subType" aria-label="Subject Type">${['Lecture','Laboratory','Seminar','Hybrid'].map(t=>`<option ${s&&s.type===t?'selected':''}>${t}</option>`).join('')}</select></div>
      <div class="col-4"><label class="form-label" style="font-size:.82rem">Units</label><input type="number" step="0.5" class="form-control" id="subUnits" value="${s?s.units:3}" aria-label="Units"></div>
      <div class="col-4"><label class="form-label" style="font-size:.82rem">Section</label><input class="form-control" id="subSection" value="${s?esc(s.section):''}" placeholder="BSCS-1A" aria-label="Section"></div>
      <div class="col-12"><label class="form-label" style="font-size:.82rem">Days</label>
        <div class="d-flex gap-2 flex-wrap" role="group" aria-label="Select class days">
          ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`
            <div class="form-check form-check-inline">
              <input class="form-check-input day-check" type="checkbox" value="${d}" id="day_${d}" ${days.includes(d)?'checked':''}>
              <label class="form-check-label" for="day_${d}" style="font-size:.82rem">${d}</label>
            </div>`).join('')}
        </div>
      </div>
      <div class="col-6"><label class="form-label" style="font-size:.82rem">Start Time</label><input type="time" class="form-control" id="subStart" value="${s?s.start:'08:00'}" aria-label="Start Time"></div>
      <div class="col-6"><label class="form-label" style="font-size:.82rem">End Time</label><input type="time" class="form-control" id="subEnd" value="${s?s.end:'09:00'}" aria-label="End Time"></div>
      <div class="col-12">
        <div class="form-check form-switch mb-1">
          <input class="form-check-input" type="checkbox" id="subOnline" ${isOnline?'checked':''} aria-label="Online class">
          <label class="form-check-label" for="subOnline" style="font-size:.82rem"><i class="bi bi-wifi me-1" aria-hidden="true"></i>Online Class</label>
        </div>
      </div>
      <div class="col-4 sub-physical-field"><label class="form-label" style="font-size:.82rem">Room</label><input class="form-control" id="subRoom" value="${s&&!s.online?esc(s.room):''}" placeholder="302" aria-label="Room number"></div>
      <div class="col-8 sub-physical-field"><label class="form-label" style="font-size:.82rem">Building</label><input class="form-control" id="subBuilding" value="${s&&!s.online?esc(s.building):''}" placeholder="Engineering Building" aria-label="Building name"></div>
      <div class="col-6"><label class="form-label" style="font-size:.82rem">Professor</label><input class="form-control" id="subProf" value="${s?esc(s.professor):''}" aria-label="Professor"></div>
      <div class="col-6"><label class="form-label" style="font-size:.82rem">Email</label><input type="email" class="form-control" id="subEmail" value="${s?esc(s.email):''}" aria-label="Professor email"></div>
      <div class="col-12"><label class="form-label" style="font-size:.82rem">Color Label</label>
        <div class="d-flex gap-2 flex-wrap" id="colorPicker" role="radiogroup" aria-label="Select subject color">
          ${DB.colors.map(c=>`<div onclick="selectColor('${c}')" data-color="${c}" tabindex="0" role="radio" aria-label="Color ${c}" aria-checked="${(s?s.color:DB.colors[0])===c}" style="width:26px;height:26px;border-radius:7px;background:${c};cursor:pointer;box-shadow:${(s?s.color:DB.colors[0])===c?'0 0 0 3px rgba(255,255,255,.5)':'none'}"></div>`).join('')}
        </div>
        <input type="hidden" id="subColor" value="${s?s.color:DB.colors[0]}">
      </div>
      <div class="col-12"><label class="form-label" style="font-size:.82rem">Notes</label><textarea class="form-control" id="subNotes" rows="2" aria-label="Notes">${s?esc(s.notes):''}</textarea></div>
    </div>
    <div id="subConflictWarning" class="sch-conflict-warning d-none" role="alert"></div>
    <div class="d-flex gap-2 mt-3">
      <button class="btn btn-accent flex-grow-1" onclick="saveSubject()"><i class="bi bi-check2 me-1" aria-hidden="true"></i>${s?'Update':'Save'} Subject</button>
      ${s?`<button class="btn btn-ghost" onclick="deleteSubject('${s.id}')" aria-label="Delete subject"><i class="bi bi-trash3" aria-hidden="true"></i></button>`:''}
    </div>`;

  // Toggle physical fields based on online checkbox
  const onlineCheck = body.querySelector('#subOnline');
  function togglePhysical(){
    const isOn = onlineCheck.checked;
    body.querySelectorAll('.sub-physical-field').forEach(el=>el.classList.toggle('d-none', isOn));
  }
  togglePhysical();
  onlineCheck.addEventListener('change', togglePhysical);

  new bootstrap.Modal(document.getElementById('subjectModal')).show();
}

function selectColor(c){
  document.getElementById('subColor').value=c;
  document.querySelectorAll('#colorPicker div').forEach(d=>{
    const isSelected = d.dataset.color===c;
    d.style.boxShadow=isSelected?'0 0 0 3px rgba(255,255,255,.5)':'none';
    d.setAttribute('aria-checked', isSelected?'true':'false');
  });
}

function saveSubject(){
  const id=document.getElementById('subId').value;
  const code=document.getElementById('subCode').value.trim();
  if(!code){ Toast.show('Subject code is required','high','bi-exclamation-triangle'); return; }
  const days=[...document.querySelectorAll('.day-check:checked')].map(c=>c.value);
  const start=document.getElementById('subStart').value;
  const end=document.getElementById('subEnd').value;
  const isOnline = document.getElementById('subOnline').checked;
  const sem=DB.getActiveSemester();
  const data={
    code, desc:document.getElementById('subDesc').value.trim(),
    type:document.getElementById('subType').value,
    units:parseFloat(document.getElementById('subUnits').value)||0,
    section:document.getElementById('subSection').value.trim(),
    days, start, end,
    online: isOnline,
    room: isOnline ? '' : document.getElementById('subRoom').value.trim(),
    building: isOnline ? '' : document.getElementById('subBuilding').value.trim(),
    professor:document.getElementById('subProf').value.trim(),
    email:document.getElementById('subEmail').value.trim(),
    color:document.getElementById('subColor').value,
    notes:document.getElementById('subNotes').value.trim(),
    semester:sem?sem.name:'1st Semester',
    schoolYear:sem?sem.schoolYear:'2026-2027',
    semesterId:sem?sem.id:DB.getActiveSemesterId(),
    archived:false,
  };

  // Conflict check
  const conflicts = checkSaveConflict(data, id||null);
  const warnEl = document.getElementById('subConflictWarning');
  if(conflicts.length){
    const conflictNames = conflicts.map(c=>`${c.code} (${fmtTime(c.start)}–${fmtTime(c.end)})`).join(', ');
    warnEl.innerHTML = `<i class="bi bi-exclamation-triangle-fill me-1" aria-hidden="true"></i>Schedule conflict with: ${escHtml(conflictNames)}. You can still save.`;
    warnEl.classList.remove('d-none');
  } else {
    warnEl.classList.add('d-none');
  }

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

/* ── Export Timetable as Image ── */
function exportTimetableImage(){
  const semId = DB.getActiveSemesterId();
  const sem = DB.getActiveSemester();
  const allSubs = DB.getSubjects().filter(s=>s.semesterId===semId && !s.archived);

  if(!allSubs.length){
    Toast.show('No subjects to export', 'high', 'bi-exclamation-triangle');
    return;
  }

  // Canvas dimensions — portrait mobile wallpaper 1080x1920
  const W = 1080, H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0a0d16');
  grad.addColorStop(1, '#0f1225');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Accent overlay top
  const accentGrad = ctx.createRadialGradient(W/2, 0, 0, W/2, 0, W*0.8);
  accentGrad.addColorStop(0, 'rgba(124,58,237,0.15)');
  accentGrad.addColorStop(1, 'rgba(124,58,237,0)');
  ctx.fillStyle = accentGrad;
  ctx.fillRect(0, 0, W, H);

  let y = 80;

  // App title
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = 'bold 52px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('STUDENT PLANNER', W/2, y);
  y += 40;

  // Decorative line
  ctx.strokeStyle = 'rgba(124,58,237,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W/2 - 120, y); ctx.lineTo(W/2 + 120, y);
  ctx.stroke();
  y += 36;

  // Semester info
  if(sem){
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '36px system-ui, -apple-system, sans-serif';
    ctx.fillText(sem.schoolYear || '', W/2, y);
    y += 44;
    ctx.fillStyle = 'rgba(124,58,237,0.9)';
    ctx.font = 'bold 34px system-ui, -apple-system, sans-serif';
    ctx.fillText(sem.name || '', W/2, y);
    y += 48;
  }

  y += 16;

  // Group subjects by day
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const dayFull = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const subsByDay = {};
  days.forEach(d=>{ subsByDay[d] = allSubs.filter(s=>s.days && s.days.includes(d)).sort((a,b)=>toMins(a.start)-toMins(b.start)); });
  const activeDays = days.filter(d=>subsByDay[d].length > 0);

  const padX = 60;
  const contentW = W - padX * 2;
  const lineH = 28;

  activeDays.forEach(d=>{
    const subs = subsByDay[d];
    if(!subs.length) return;

    const dayIdx = days.indexOf(d);
    const blockH = 44 + subs.length * (lineH * 3 + 16) + 20;

    // Day card background
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    roundRect(ctx, padX, y, contentW, blockH, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    roundRect(ctx, padX, y, contentW, blockH, 16);
    ctx.stroke();

    // Day label
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 38px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(dayFull[dayIdx].toUpperCase(), padX + 24, y + 40);

    let sy = y + 60;

    subs.forEach((s, si)=>{
      if(si > 0){
        // Divider
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padX + 24, sy); ctx.lineTo(padX + contentW - 24, sy);
        ctx.stroke();
        sy += 12;
      }

      // Color dot
      ctx.fillStyle = s.color || '#7c3aed';
      ctx.beginPath();
      ctx.arc(padX + 36, sy + lineH * 0.5, 6, 0, Math.PI * 2);
      ctx.fill();

      // Time
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = '26px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${fmtTime(s.start)} – ${fmtTime(s.end)}`, padX + 56, sy + lineH * 0.7);
      sy += lineH;

      // Subject code + name
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.font = 'bold 30px system-ui, -apple-system, sans-serif';
      ctx.fillText(s.code, padX + 56, sy + lineH * 0.7);
      sy += lineH;

      // Room/location
      const loc = s.online ? 'Online' : (s.room ? `Room ${s.room}${s.building?' · '+s.building:''}` : '');
      if(loc){
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '24px system-ui, -apple-system, sans-serif';
        ctx.fillText(loc, padX + 56, sy + lineH * 0.7);
      }
      sy += lineH + 4;
    });

    y += blockH + 20;

    // Safety — don't draw beyond canvas
    if(y > H - 100) return;
  });

  // Footer
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.font = '26px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Generated by Student Planner', W/2, H - 60);

  // Download
  const link = document.createElement('a');
  link.download = 'timetable-wallpaper.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
  Toast.show('Timetable exported as image');
}

function roundRect(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/* ── Pinch-to-zoom for timetable ── */
function setupPinchZoom(){
  const el = document.getElementById('schTimetableView');
  if(!el) return;
  el.addEventListener('touchstart', e=>{
    if(e.touches.length===2){
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      _pinchStartDist = Math.sqrt(dx*dx+dy*dy);
      _pinchStartZoom = ttHourHeight;
    }
  }, { passive:true });
  el.addEventListener('touchmove', e=>{
    if(e.touches.length===2){
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx*dx+dy*dy);
      const scale = dist / (_pinchStartDist||1);
      const newH = Math.max(36, Math.min(96, Math.round(_pinchStartZoom * scale)));
      if(newH !== ttHourHeight){
        ttHourHeight = newH;
        renderTimetable();
      }
    }
  }, { passive:true });
}

function escapeHtml(s){ return escHtml(s); }
