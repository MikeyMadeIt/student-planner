/* ============================================================
   DASHBOARD.JS
   ============================================================ */

function initDashboard(){
  renderTodaySchedule();
  renderNextClassCountdown();
  renderTodayTasks();
  renderUpcomingDeadlines();
  renderAssignmentProgress();
  renderAttendanceStat();
  renderGpaStat();
  renderWeekPreview();
  renderSemesterProgress();
  renderProductivityChart();
  Pomo.init();
  setupQuickAddHandlers();

  setInterval(renderNextClassCountdown, 30000);
  setInterval(renderTodaySchedule, 60000);
}

/* ---------- TODAY'S SCHEDULE ---------- */
function todaysSubjects(){
  const dayName = DAY_NAMES[new Date().getDay()];
  const semId = DB.getActiveSemesterId();
  return DB.getSubjects().filter(s=>s.semesterId===semId && !s.archived && s.days.includes(dayName))
    .sort((a,b)=> a.start.localeCompare(b.start));
}
function renderTodaySchedule(){
  const wrap = document.getElementById('todaySchedule');
  const list = todaysSubjects();
  if(!list.length){ wrap.innerHTML = emptyState('bi-calendar-x','No classes today','Enjoy the free day!'); return; }
  wrap.innerHTML = list.map(s=>{
    const nowMin = new Date().getHours()*60+new Date().getMinutes();
    const [sh,sm]=s.start.split(':').map(Number), [eh,em]=s.end.split(':').map(Number);
    const startMin=sh*60+sm, endMin=eh*60+em;
    const status = nowMin>=startMin && nowMin<=endMin ? 'now' : (nowMin>endMin ? 'done' : 'upcoming');
    return `<div class="list-row">
      <span class="dot-color" style="background:${s.color}"></span>
      <div class="flex-grow-1">
        <div style="font-weight:700;font-size:.86rem">${s.code} <span class="text-faint fw-normal">· ${s.room}, ${s.building}</span></div>
        <div class="text-faint" style="font-size:.75rem">${fmtTime(s.start)} – ${fmtTime(s.end)} · ${s.professor}</div>
      </div>
      ${status==='now' ? '<span class="chip">Now</span>' : status==='done' ? '<span class="chip low" style="opacity:.6">Done</span>' : ''}
    </div>`;
  }).join('');
}

/* ---------- NEXT CLASS COUNTDOWN ---------- */
function renderNextClassCountdown(){
  const now = new Date();
  let best = null, bestMin = Infinity;
  for(let d=0; d<7; d++){
    const day = new Date(now); day.setDate(now.getDate()+d);
    const dayName = DAY_NAMES[day.getDay()];
    const _semId = DB.getActiveSemesterId();
    DB.getSubjects().filter(s=>s.semesterId===_semId && !s.archived && s.days.includes(dayName)).forEach(s=>{
      const dateStr = ymdLocal(day);
      const mins = minutesUntil(dateStr, s.start);
      if(mins >= -5 && mins < bestMin){ bestMin = mins; best = s; }
    });
  }
  const ring = document.getElementById('ringFg');
  const circumference = 364;
  if(!best){
    document.getElementById('cdNum').textContent='--';
    document.getElementById('cdLbl').textContent='no class';
    document.getElementById('nextClassInfo').innerHTML = `<span class="text-faint" style="font-size:.82rem">Nothing scheduled soon</span>`;
    ring.style.strokeDashoffset = circumference;
    return;
  }
  const hrs = Math.floor(bestMin/60), mins = bestMin%60;
  document.getElementById('cdNum').textContent = bestMin<=0 ? 'NOW' : (hrs>0? `${hrs}h ${mins}m` : `${mins}m`);
  document.getElementById('cdLbl').textContent = best.code;
  document.getElementById('nextClassInfo').innerHTML = `
    <div style="font-weight:700">${best.desc}</div>
    <div class="text-faint" style="font-size:.78rem">${fmtTime(best.start)} · ${best.room}, ${best.building}</div>`;
  const pct = Math.max(0, Math.min(1, 1 - bestMin/180));
  ring.style.strokeDashoffset = circumference - (circumference*pct);
}

/* ---------- TODAY'S TASKS ---------- */
function renderTodayTasks(){
  const wrap = document.getElementById('todayTasks');
  const _semId2 = DB.getActiveSemesterId();
  const tasks = DB.getTasks().filter(t=>t.semesterId===_semId2 && t.dueDate===todayKey() && t.status!=='completed').sort((a,b)=>a.dueTime.localeCompare(b.dueTime));
  if(!tasks.length){ wrap.innerHTML = emptyState('bi-check2-circle','All clear for today',''); return; }
  wrap.innerHTML = tasks.slice(0,5).map(t=>`
    <div class="list-row">
      <div class="task-check" onclick="quickCompleteTask('${t.id}', this)"><i class="bi bi-check2" style="opacity:0"></i></div>
      <div class="flex-grow-1">
        <div style="font-weight:700;font-size:.85rem">${escapeHtml(t.title)}</div>
        <div class="text-faint" style="font-size:.73rem">${fmtTime(t.dueTime)} · ${t.category}</div>
      </div>
      <span class="chip ${t.priority}">${t.priority}</span>
    </div>`).join('');
}
function quickCompleteTask(id, el){
  const tasks = DB.getTasks();
  const t = tasks.find(x=>x.id===id); if(!t) return;
  t.status='completed'; t.progress=100;
  DB.saveTasks(tasks);
  el.classList.add('checked'); el.querySelector('i').style.opacity=1;
  fireConfetti(); Toast.show('Task completed — nice work!');
  setTimeout(()=>{ renderTodayTasks(); renderAssignmentProgress(); renderUpcomingDeadlines(); }, 400);
}

/* ---------- UPCOMING DEADLINES ---------- */
function renderUpcomingDeadlines(){
  const wrap = document.getElementById('upcomingDeadlines');
  const _semId3 = DB.getActiveSemesterId();
  const subs = DB.getSubjects().filter(s=>s.semesterId===_semId3);
  const tasks = DB.getTasks().filter(t=>t.semesterId===_semId3 && t.status!=='completed' && t.dueDate>=todayKey())
    .sort((a,b)=> (a.dueDate+a.dueTime).localeCompare(b.dueDate+b.dueTime)).slice(0,5);
  if(!tasks.length){ wrap.innerHTML = emptyState('bi-emoji-smile','No upcoming deadlines',''); return; }
  wrap.innerHTML = tasks.map(t=>{
    const sub = subs.find(s=>s.id===t.subjectId);
    const mins = minutesUntil(t.dueDate, t.dueTime);
    return `<div class="list-row">
      <span class="dot-color" style="background:${sub?sub.color:'#8a90a6'}"></span>
      <div class="flex-grow-1">
        <div style="font-weight:700;font-size:.85rem">${escapeHtml(t.title)}</div>
        <div class="text-faint" style="font-size:.73rem">${sub?sub.code+' · ':''}${t.dueDate} ${fmtTime(t.dueTime)}</div>
      </div>
      <span class="chip ${mins<1440?'high':'medium'}">${fmtDuration(mins)}</span>
    </div>`;
  }).join('');
}

/* ---------- ASSIGNMENT PROGRESS ---------- */
function renderAssignmentProgress(){
  const _semId4 = DB.getActiveSemesterId();
  const tasks = DB.getTasks().filter(t=>t.semesterId===_semId4 && ['Homework','Project','Quiz','Exam'].includes(t.category));
  const done = tasks.filter(t=>t.status==='completed').length;
  const pct = tasks.length ? Math.round(done/tasks.length*100) : 0;
  document.getElementById('assignProg').textContent = pct+'%';
  document.getElementById('assignProgBar').style.width = pct+'%';
  document.getElementById('assignSub').textContent = `${done} of ${tasks.length} completed`;
}

/* ---------- ATTENDANCE STAT ---------- */
function computeAttendanceRate(){
  const semId = DB.getActiveSemesterId();
  const allRecs = DB.getAttendance().filter(r=>r.semesterId===semId);
  const records = allRecs.filter(r=>r.status!=='No Classes');
  if(!records.length) return null;
  const present = records.filter(r=>r.status==='Present' || r.status==='Excused').length;
  return Math.round((present/records.length)*100);
}
function renderAttendanceStat(){
  const rate = computeAttendanceRate();
  document.getElementById('attRate').textContent = rate===null ? '--%' : rate+'%';
  document.getElementById('attBar').style.width = (rate||0)+'%';
}

/* ---------- GPA STAT ---------- */
function computeGPA(){
  const semId = DB.getActiveSemesterId();
  const grades = DB.getGrades().filter(g=>g.semesterId===semId);
  const subs = DB.getSubjects().filter(s=>s.semesterId===semId);
  let totalPoints=0, totalUnits=0;
  grades.forEach(g=>{
    const sub = subs.find(s=>s.id===g.subjectId); if(!sub) return;
    const avg = computeSubjectAverage(g);
    if(avg===null) return;
    const gp = percentTo4pt(avg);
    totalPoints += gp*sub.units; totalUnits += sub.units;
  });
  return totalUnits ? (totalPoints/totalUnits) : null;
}
function computeSubjectAverage(g){
  const parts = [];
  const avgArr = (arr)=> arr && arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;
  const q=avgArr(g.quiz), a=avgArr(g.activity), l=avgArr(g.lab), p=avgArr(g.project);
  [q,a,l,p,g.midterm,g.finals].forEach(v=>{ if(v!==null && v!==undefined && !isNaN(v)) parts.push(v); });
  if(!parts.length) return null;
  return parts.reduce((x,y)=>x+y,0)/parts.length;
}
function percentTo4pt(pct){
  if(pct>=97) return 4.0; if(pct>=93) return 3.7; if(pct>=90) return 3.3;
  if(pct>=87) return 3.0; if(pct>=83) return 2.7; if(pct>=80) return 2.3;
  if(pct>=77) return 2.0; if(pct>=73) return 1.7; if(pct>=70) return 1.3;
  if(pct>=60) return 1.0; return 0;
}
function renderGpaStat(){
  const gpa = computeGPA();
  document.getElementById('gpaNum').textContent = gpa===null ? '--' : gpa.toFixed(2);
  document.getElementById('gpaBar').style.width = gpa===null ? '0%' : (gpa/4*100)+'%';
}

/* ---------- WEEK PREVIEW ---------- */
function renderWeekPreview(){
  const wrap = document.getElementById('weekPreview');
  const tasks = DB.getTasks();
  const now = new Date();
  const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate()-now.getDay());
  let html='';
  for(let i=0;i<7;i++){
    const d = new Date(startOfWeek); d.setDate(startOfWeek.getDate()+i);
    const dateStr = ymdLocal(d);
    const isToday = dateStr===todayKey();
    const semId2 = DB.getActiveSemesterId();
    const dayTasks = DB.getTasks().filter(t=>t.semesterId===semId2 && t.dueDate===dateStr).length;
    const daySubs = todaysSubjectsFor(d).length;
    html += `<div class="col">
      <div class="cal-cell ${isToday?'today':''}" style="min-height:70px;cursor:pointer" onclick="location.href='calendar.html'">
        <div class="cal-daynum">${d.getDate()}</div>
        <div class="text-faint" style="font-size:.62rem">${DAY_NAMES[d.getDay()]}</div>
        ${daySubs?`<div class="text-faint" style="font-size:.6rem;margin-top:4px"><i class="bi bi-calendar2"></i> ${daySubs}</div>`:''}
        ${dayTasks?`<div class="text-faint" style="font-size:.6rem"><i class="bi bi-check2-square"></i> ${dayTasks}</div>`:''}
      </div></div>`;
  }
  wrap.innerHTML = html;
}
function todaysSubjectsFor(date){
  const dayName = DAY_NAMES[date.getDay()];
  const semId = DB.getActiveSemesterId();
  return DB.getSubjects().filter(s=>s.semesterId===semId && !s.archived && s.days.includes(dayName));
}

/* ---------- SEMESTER PROGRESS ---------- */
function renderSemesterProgress(){
  const sem = DB.getSemester();
  const start = new Date(sem.startDate), end = new Date(sem.endDate), finals = new Date(sem.finalsDate);
  const now = new Date();
  const totalMs = end-start;
  const elapsedMs = Math.min(Math.max(now-start,0), totalMs);
  const pct = totalMs>0 ? Math.round(elapsedMs/totalMs*100) : 0;
  const week = Math.min(sem.totalWeeks, Math.max(1, Math.ceil((now-start)/(1000*60*60*24*7))));
  const daysToFinals = Math.max(0, Math.ceil((finals-now)/(1000*60*60*24)));
  document.getElementById('semWeek').textContent = week;
  document.getElementById('semTotal').textContent = sem.totalWeeks;
  document.getElementById('semDays').textContent = daysToFinals;
  document.getElementById('semBar').style.width = pct+'%';
  document.getElementById('semPct').textContent = pct+'% of semester complete';
}

/* ---------- PRODUCTIVITY CHART ---------- */
function renderProductivityChart(){
  const ctx = document.getElementById('prodChart');
  if(!ctx || !window.Chart) return;
  const semId = DB.getActiveSemesterId();
  const tasks = DB.getTasks().filter(t=>t.semesterId===semId);
  const labels=[], data=[];
  for(let i=6;i>=0;i--){
    const d = new Date(); d.setDate(d.getDate()-i);
    const k = ymdLocal(d);
    labels.push(DAY_NAMES[d.getDay()]);
    data.push(tasks.filter(t=>t.status==='completed' && t.dueDate===k).length);
  }
  const style = getComputedStyle(document.documentElement);
  new Chart(ctx, {
    type:'bar',
    data:{ labels, datasets:[{ label:'Tasks completed', data, borderRadius:8, backgroundColor:'rgba(124,108,246,.55)', hoverBackgroundColor:'rgb(124,108,246)' }]},
    options:{ plugins:{legend:{display:false}}, scales:{
      x:{ grid:{display:false}, ticks:{color:style.getPropertyValue('--text-faint')} },
      y:{ beginAtZero:true, ticks:{stepSize:1, color:style.getPropertyValue('--text-faint')}, grid:{color:'rgba(128,128,128,.12)'} }
    }}
  });
}

/* ---------- QUICK NOTE ---------- */
function saveQuickNote(){
  const box = document.getElementById('quickNoteBox');
  if(!box.value.trim()) return;
  const semId = DB.getActiveSemesterId();
  const notes = DB.getNotes();
  notes.unshift({ id:DB.uid(), title:'Quick Note', content:box.value.trim(), category:'Organization', pinned:false, favorite:false, checklist:[], semesterId:semId, createdAt:Date.now(), updatedAt:Date.now() });
  DB.saveNotes(notes);
  box.value='';
  Toast.show('Note saved');
}

/* ---------- HELPERS ---------- */
function emptyState(icon, title, sub){
  return `<div class="text-center py-4">
    <i class="bi ${icon}" style="font-size:1.6rem;color:var(--text-faint)"></i>
    <div class="text-soft mt-2" style="font-size:.85rem;font-weight:600">${title}</div>
    ${sub?`<div class="text-faint" style="font-size:.75rem">${sub}</div>`:''}
  </div>`;
}
function escapeHtml(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

/* ---------- POMODORO ---------- */
const Pomo = {
  focusMin:25, breakMin:5, remaining:25*60, running:false, onBreak:false, interval:null,
  init(){
    const saved = JSON.parse(localStorage.getItem('sp_pomo_live')||'null');
    if(saved){ this.focusMin=saved.focusMin; this.breakMin=saved.breakMin; this.remaining=saved.remaining; this.onBreak=saved.onBreak; }
    this.render();
    this.updateStatsLabel();
    this.updatePresetHighlight();
  },
  set(f,b){ this.focusMin=f; this.breakMin=b; this.onBreak=false; this.remaining=f*60; this.running=false; clearInterval(this.interval); this.render(); this.persist(); this.updatePresetHighlight(); document.getElementById('pomoToggle').innerHTML='<i class="bi bi-play-fill"></i> Start'; },
  updatePresetHighlight(){
    const b25 = document.getElementById('pomoPreset2525'), b50 = document.getElementById('pomoPreset5010'), bc = document.getElementById('pomoPresetCustom');
    if(!b25) return;
    b25.classList.toggle('btn-accent', this.focusMin===25 && this.breakMin===5);
    b50.classList.toggle('btn-accent', this.focusMin===50 && this.breakMin===10);
    const isCustom = !(this.focusMin===25 && this.breakMin===5) && !(this.focusMin===50 && this.breakMin===10);
    bc.classList.toggle('btn-accent', isCustom);
    bc.textContent = isCustom ? `Custom (${this.focusMin}/${this.breakMin})` : 'Custom';
  },
  custom(){
    const body = document.getElementById('quickModalBody');
    body.innerHTML = `
      <div class="modal-header" style="border:none;padding:0 0 12px 0"><h5 class="modal-title"><i class="bi bi-sliders me-2"></i>Custom Timer</h5><button class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>
      <div class="row g-3">
        <div class="col-6">
          <label>Focus minutes</label>
          <input type="number" min="1" max="180" class="form-control" id="pcFocus" value="${this.focusMin}">
        </div>
        <div class="col-6">
          <label>Break minutes</label>
          <input type="number" min="1" max="60" class="form-control" id="pcBreak" value="${this.breakMin}">
        </div>
      </div>
      <button class="btn btn-accent w-100 mt-3" onclick="Pomo.applyCustom()"><i class="bi bi-check2 me-1"></i>Apply Timer</button>`;
    new bootstrap.Modal(document.getElementById('quickModal')).show();
  },
  applyCustom(){
    const f = Math.max(1, Math.min(180, parseInt(document.getElementById('pcFocus').value)||25));
    const b = Math.max(1, Math.min(60, parseInt(document.getElementById('pcBreak').value)||5));
    this.set(f,b);
    const modalEl = document.getElementById('quickModal');
    const inst = bootstrap.Modal.getInstance(modalEl);
    if(inst) inst.hide();
    Toast.show(`Timer set to ${f}/${b}`);
  },
  toggle(){
    this.running = !this.running;
    const btn = document.getElementById('pomoToggle');
    if(this.running){
      btn.innerHTML = '<i class="bi bi-pause-fill"></i> Pause';
      this.interval = setInterval(()=>this.tick(), 1000);
    } else {
      btn.innerHTML = '<i class="bi bi-play-fill"></i> Start';
      clearInterval(this.interval);
    }
  },
  reset(){ this.running=false; clearInterval(this.interval); this.onBreak=false; this.remaining=this.focusMin*60; this.render(); this.persist(); document.getElementById('pomoToggle').innerHTML='<i class="bi bi-play-fill"></i> Start'; },
  tick(){
    this.remaining--;
    if(this.remaining <= 0){
      if(!this.onBreak){
        this.logSession();
        Toast.show('Focus session complete — take a break!','accent','bi-cup-hot-fill');
        notifyUser('Pomodoro finished','Time for a short break.');
        this.onBreak=true; this.remaining=this.breakMin*60;
      } else {
        Toast.show('Break over — back to focus!');
        this.onBreak=false; this.remaining=this.focusMin*60;
      }
    }
    this.render(); this.persist();
  },
  logSession(){
    const p = DB.getPomo();
    const today = new Date().toDateString();
    if(p.lastDate !== today){ p.sessionsToday=0; p.lastDate=today; }
    p.sessionsToday++; p.totalFocusMinutes += this.focusMin;
    DB.savePomo(p);
    this.updateStatsLabel();
  },
  updateStatsLabel(){
    const p = DB.getPomo();
    const el = document.getElementById('pomoStats');
    if(el) el.textContent = `${p.sessionsToday} sessions · ${p.totalFocusMinutes}m focused today`;
  },
  persist(){ localStorage.setItem('sp_pomo_live', JSON.stringify({focusMin:this.focusMin, breakMin:this.breakMin, remaining:this.remaining, onBreak:this.onBreak})); },
  render(){
    const m = Math.floor(this.remaining/60), s = this.remaining%60;
    const timeEl = document.getElementById('pomoTime'); if(timeEl) timeEl.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    const modeEl = document.getElementById('pomoMode'); if(modeEl) modeEl.textContent = this.onBreak ? 'BREAK' : 'FOCUS';
    const total = (this.onBreak?this.breakMin:this.focusMin)*60;
    const ring = document.getElementById('pomoRing');
    if(ring){ const c=502.4; ring.style.strokeDashoffset = c - c*(1-this.remaining/total); }
  }
};
function notifyUser(title, body){
  const s = DB.getSettings();
  if(s.notifications && s.notifications.pomodoroFinished && 'Notification' in window && Notification.permission==='granted'){
    new Notification(title, { body, icon:'icons/icon-192.png' });
  }
}

/* ---------- QUICK ADD MODALS ---------- */
function setupQuickAddHandlers(){
  window.quickAddHandlers = {
    subject: ()=>quickAddModal('subject'),
    task: ()=>quickAddModal('task'),
    note: ()=>quickAddModal('note'),
  };
}
function quickAddModal(type){
  const body = document.getElementById('quickModalBody');
  const modal = new bootstrap.Modal(document.getElementById('quickModal'));
  const semId = DB.getActiveSemesterId();
  if(type==='task'){
    const subs = DB.getSubjects().filter(s=>s.semesterId===semId);
    body.innerHTML = `
      <div class="modal-header" style="border:none;padding:0 0 12px 0"><h5 class="modal-title"><i class="bi bi-plus-square me-2"></i>Add Task</h5><button class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>
      <div class="mb-2"><label>Title</label><input class="form-control" id="qaTitle" placeholder="e.g. Finish lab report"></div>
      <div class="row g-2 mb-2">
        <div class="col-6"><label>Category</label><select class="form-select" id="qaCat"><option>Homework</option><option>Project</option><option>Quiz</option><option>Exam</option><option>Personal</option><option>Organization</option></select></div>
        <div class="col-6"><label>Priority</label><select class="form-select" id="qaPri"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option></select></div>
      </div>
      <div class="row g-2 mb-2">
        <div class="col-6"><label>Due Date</label><input type="date" class="form-control" id="qaDate" value="${todayKey()}"></div>
        <div class="col-6"><label>Due Time</label><input type="time" class="form-control" id="qaTime" value="23:59"></div>
      </div>
      <div class="mb-3"><label>Subject (optional)</label><select class="form-select" id="qaSub"><option value="">None</option>${subs.map(s=>`<option value="${s.id}">${s.code}</option>`).join('')}</select></div>
      <button class="btn btn-accent w-100" onclick="saveQuickTask()">Save Task</button>`;
  } else if(type==='note'){
    body.innerHTML = `
      <div class="modal-header" style="border:none;padding:0 0 12px 0"><h5 class="modal-title"><i class="bi bi-sticky me-2"></i>Add Note</h5><button class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>
      <div class="mb-2"><label>Title</label><input class="form-control" id="qaNTitle" placeholder="Note title"></div>
      <div class="mb-3"><label>Content</label><textarea class="form-control" id="qaNContent" rows="4" placeholder="Write your note…"></textarea></div>
      <button class="btn btn-accent w-100" onclick="saveQuickNoteModal()">Save Note</button>`;
  } else if(type==='subject'){
    body.innerHTML = `
      <div class="modal-header" style="border:none;padding:0 0 12px 0"><h5 class="modal-title"><i class="bi bi-journal-plus me-2"></i>Add Subject</h5><button class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>
      <p class="text-soft" style="font-size:.85rem">Full subject setup (days, room, professor, color) lives on the Schedule page for a smoother flow.</p>
      <button class="btn btn-accent w-100" onclick="location.href='schedule.html?new=1'">Go to Schedule</button>`;
  }
  modal.show();
}
function saveQuickTask(){
  const title = document.getElementById('qaTitle').value.trim();
  if(!title){ Toast.show('Please enter a title','high','bi-exclamation-triangle'); return; }
  const semId = DB.getActiveSemesterId();
  const tasks = DB.getTasks();
  tasks.push({
    id:DB.uid(), title, description:'', subjectId: document.getElementById('qaSub').value || null,
    priority: document.getElementById('qaPri').value, category: document.getElementById('qaCat').value,
    dueDate: document.getElementById('qaDate').value, dueTime: document.getElementById('qaTime').value,
    status:'not-started', progress:0, reminder:true, checklist:[], repeat:'none', score:null, remarks:'',
    semesterId: semId, createdAt:Date.now()
  });
  DB.saveTasks(tasks);
  bootstrap.Modal.getInstance(document.getElementById('quickModal')).hide();
  Toast.show('Task added');
  renderTodayTasks(); renderUpcomingDeadlines(); renderAssignmentProgress();
}
function saveQuickNoteModal(){
  const title = document.getElementById('qaNTitle').value.trim() || 'Untitled';
  const content = document.getElementById('qaNContent').value.trim();
  const semId = DB.getActiveSemesterId();
  const notes = DB.getNotes();
  notes.unshift({ id:DB.uid(), title, content, category:'Organization', pinned:false, favorite:false, checklist:[], semesterId:semId, createdAt:Date.now(), updatedAt:Date.now() });
  DB.saveNotes(notes);
  bootstrap.Modal.getInstance(document.getElementById('quickModal')).hide();
  Toast.show('Note added');
}
