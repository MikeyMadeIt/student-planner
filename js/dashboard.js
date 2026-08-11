/* ============================================================
   DASHBOARD.JS — Redesigned Command Center
   ============================================================ */

function initDashboard(){
  renderSemesterOverview();
  renderStatCards();
  renderGradePerformance();
  renderAttendanceDonut();
  renderAcademicProgress();
  renderTodaySchedule();
  renderUpcomingTasks();

  // Refresh schedule every minute
  setInterval(renderTodaySchedule, 60000);
}

/* ============================================================
   1. SEMESTER OVERVIEW
   ============================================================ */
function renderSemesterOverview(){
  const sem = DB.getActiveSemester();
  if(!sem) return;

  const labelEl = document.getElementById('dashSemLabel');
  if(labelEl) labelEl.textContent = sem.schoolYear + ' \u00B7 ' + sem.name;

  const start = new Date(sem.startDate + 'T00:00:00');
  const end   = new Date(sem.endDate   + 'T00:00:00');
  const now   = new Date();

  const totalMs   = end - start;
  const elapsedMs = Math.min(Math.max(now - start, 0), totalMs);
  const pct       = totalMs > 0 ? Math.round(elapsedMs / totalMs * 100) : 0;

  const totalWeeks = sem.totalWeeks || 15;
  const weekNum    = Math.min(totalWeeks, Math.max(1, Math.ceil((now - start) / (1000*60*60*24*7))));
  const weeksLeft  = Math.max(0, totalWeeks - weekNum);

  var wiEl = document.getElementById('dashWeekInfo');
  if(wiEl) wiEl.innerHTML = '<i class="bi bi-calendar3-week me-1"></i>Week ' + weekNum + ' of ' + totalWeeks;
  var wlEl = document.getElementById('dashWeeksLeft');
  if(wlEl) wlEl.textContent = weeksLeft + ' week' + (weeksLeft !== 1 ? 's' : '') + ' remaining';
  var spEl = document.getElementById('dashSemPct');
  if(spEl) spEl.textContent = pct + '%';

  const daysLeft = Math.max(0, Math.ceil((end - now) / (1000*60*60*24)));
  const startStr = start.toLocaleDateString([], {month:'short', day:'numeric'});
  const endStr   = end.toLocaleDateString([], {month:'short', day:'numeric', year:'numeric'});
  var sdEl = document.getElementById('dashSemDates');
  if(sdEl) sdEl.textContent = startStr + ' \u2013 ' + endStr + ' \u00B7 ' + daysLeft + ' day' + (daysLeft !== 1 ? 's' : '') + ' to end';

  setTimeout(function(){
    var bar = document.getElementById('dashSemBar');
    if(bar) bar.style.width = pct + '%';
  }, 120);
}

/* ============================================================
   2. STAT CARDS
   ============================================================ */
function renderStatCards(){
  const semId    = DB.getActiveSemesterId();
  const subjects = DB.getSubjects().filter(function(s){ return s.semesterId === semId && !s.archived; });
  const tasks    = DB.getTasks().filter(function(t){ return t.semesterId === semId; });
  const done     = tasks.filter(function(t){ return t.status === 'completed'; }).length;

  animateCountUp('statSubjects', 0, subjects.length, 700, function(v){ return String(Math.round(v)); });

  const gwa = computeDashGWA(semId, subjects);
  if(gwa !== null){
    animateCountUp('statGwa', 0, gwa, 900, function(v){ return v.toFixed(2); });
  } else {
    var el = document.getElementById('statGwa');
    if(el) el.textContent = '\u2013';
  }

  const attRate = computeAttendanceRate(semId);
  if(attRate !== null){
    animateCountUp('statAtt', 0, attRate, 900, function(v){ return Math.round(v) + '%'; });
  } else {
    var el2 = document.getElementById('statAtt');
    if(el2) el2.textContent = '\u2013';
  }

  var tel = document.getElementById('statTasks');
  if(tel) tel.textContent = done + '/' + tasks.length;
}

function animateCountUp(id, from, to, duration, fmt){
  var el = document.getElementById(id);
  if(!el) return;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    el.textContent = fmt(to); return;
  }
  var start = performance.now();
  function step(now){
    var t = Math.min(1, (now - start) / duration);
    var eased = 1 - Math.pow(1 - t, 3);
    el.textContent = fmt(from + (to - from) * eased);
    if(t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ============================================================
   3. GRADE PERFORMANCE
   ============================================================ */
var GRADE_TABLE_DASH = [
  { point:1.00, min:99 }, { point:1.25, min:96 }, { point:1.50, min:93 },
  { point:1.75, min:90 }, { point:2.00, min:87 }, { point:2.25, min:84 },
  { point:2.50, min:81 }, { point:2.75, min:78 }, { point:3.00, min:75 },
  { point:5.00, min:0  },
];

function pctToGWAPoint(pct){
  if(pct === null || isNaN(pct)) return null;
  for(var i=0;i<GRADE_TABLE_DASH.length;i++){
    if(pct >= GRADE_TABLE_DASH[i].min) return GRADE_TABLE_DASH[i].point;
  }
  return 5.00;
}

function compAvgDash(c){
  if(Array.isArray(c.assessments) && c.assessments.length){
    var valid = c.assessments.filter(function(a){ return a.score !== null && a.score !== undefined && a.totalItems; });
    if(!valid.length) return null;
    return valid.reduce(function(s,a){ return s + (a.score / a.totalItems * 100); }, 0) / valid.length;
  }
  // legacy
  if(c.score !== null && c.score !== undefined && c.score !== '') return +c.score;
  return null;
}

function computeDashSubjectGrades(semId, subjects){
  var allGrades = DB.getGrades();
  return subjects.map(function(s){
    var g = allGrades.find(function(x){ return x.subjectId === s.id; });
    if(!g || !Array.isArray(g.components) || !g.components.length) return { subject:s, pct:null, point:null };
    var scored = g.components.filter(function(c){ return compAvgDash(c) !== null && c.weight; });
    if(!scored.length) return { subject:s, pct:null, point:null };
    var pct = scored.reduce(function(sum,c){ return sum + (compAvgDash(c) * (+c.weight||0) / 100); }, 0);
    return { subject:s, pct:pct, point:pctToGWAPoint(pct) };
  });
}

function computeDashGWA(semId, subjects){
  var rows = computeDashSubjectGrades(semId, subjects).filter(function(r){ return r.point !== null; });
  if(!rows.length) return null;
  var tu = rows.reduce(function(s,r){ return s + (+r.subject.units||0); }, 0);
  if(!tu) return null;
  return rows.reduce(function(s,r){ return s + r.point * (+r.subject.units||0); }, 0) / tu;
}

function renderGradePerformance(){
  var semId    = DB.getActiveSemesterId();
  var subjects = DB.getSubjects().filter(function(s){ return s.semesterId === semId && !s.archived; });
  var wrap     = document.getElementById('dashGradeChart');
  if(!wrap) return;

  if(!subjects.length){
    wrap.innerHTML = dashEmpty('bi-mortarboard','No subjects yet','Add subjects in Schedule.');
    return;
  }

  var rows        = computeDashSubjectGrades(semId, subjects);
  var withGrades  = rows.filter(function(r){ return r.point !== null; });

  if(!withGrades.length){
    wrap.innerHTML = dashEmpty('bi-bar-chart','No grades yet','Enter grades on the Grades page.');
    return;
  }

  var display = withGrades.slice(0, 7);
  var html = display.map(function(r, i){
    return '<div class="grade-bar-row">' +
      '<div class="grade-bar-label" title="' + escHtml(r.subject.desc) + '">' + escHtml(r.subject.code) + '</div>' +
      '<div class="grade-bar-track"><div class="grade-bar-fill" id="gbar' + i + '" style="width:0%"></div></div>' +
      '<div class="grade-bar-val">' + (r.point !== null ? r.point.toFixed(2) : '\u2013') + '</div>' +
    '</div>';
  }).join('');
  wrap.innerHTML = html;

  setTimeout(function(){
    display.forEach(function(r, i){
      // 1.00 = 100%, 3.00 = 50%, 5.00 = 0% (lower grade = wider bar)
      var pct = Math.round(((5 - r.point) / 4) * 100);
      var el = document.getElementById('gbar' + i);
      if(el) el.style.width = pct + '%';
    });
  }, 180);
}

/* ============================================================
   4. ATTENDANCE DONUT
   ============================================================ */
function computeAttendanceRate(semId){
  var records = DB.getAttendance().filter(function(r){ return r.semesterId === semId && r.status !== 'No Classes'; });
  if(!records.length) return null;
  var present = records.filter(function(r){ return r.status === 'Present' || r.status === 'Excused'; }).length;
  return Math.round(present / records.length * 100);
}

function renderAttendanceDonut(){
  var semId = DB.getActiveSemesterId();
  var all   = DB.getAttendance().filter(function(r){ return r.semesterId === semId; });
  var recs  = all.filter(function(r){ return r.status !== 'No Classes'; });

  var counts = {
    Present: all.filter(function(r){ return r.status === 'Present'; }).length,
    Late:    all.filter(function(r){ return r.status === 'Late'; }).length,
    Excused: all.filter(function(r){ return r.status === 'Excused'; }).length,
    Absent:  all.filter(function(r){ return r.status === 'Absent'; }).length,
  };
  var total  = recs.length;
  var pctNum = total ? Math.round((counts.Present + counts.Excused) / total * 100) : null;

  var pctEl = document.getElementById('donutPct');
  if(pctEl) pctEl.textContent = pctNum !== null ? pctNum + '%' : '\u2013';

  document.getElementById('attPresent').textContent = counts.Present;
  document.getElementById('attLate').textContent    = counts.Late;
  document.getElementById('attExcused').textContent = counts.Excused;
  document.getElementById('attAbsent').textContent  = counts.Absent;

  // SVG donut — stacked arcs technique
  var circ = 276.46; // 2 * Math.PI * 44
  var order = [
    { id:'donutPresent', count:counts.Present },
    { id:'donutLate',    count:counts.Late    },
    { id:'donutExcused', count:counts.Excused },
    { id:'donutAbsent',  count:counts.Absent  },
  ];

  if(!total){
    order.forEach(function(seg){
      var el = document.getElementById(seg.id);
      if(el){ el.setAttribute('stroke-dasharray','0 ' + circ); el.setAttribute('stroke-dashoffset', circ); }
    });
    return;
  }

  // Build stacked donut: each circle has dasharray=slice gap, offset=start position
  var cumAngle = 0;
  order.forEach(function(seg){
    var el = document.getElementById(seg.id);
    if(!el) return;
    var slice  = (seg.count / total) * circ;
    var gap    = circ - slice;
    el.setAttribute('stroke-dasharray', slice + ' ' + gap);
    // stroke-dashoffset starts the arc. circ/4 rotates to top. Then subtract cumAngle.
    el.setAttribute('stroke-dashoffset', circ - cumAngle + '');
    cumAngle += slice;
  });
}

/* ============================================================
   5. ACADEMIC PROGRESS BARS
   ============================================================ */
function renderAcademicProgress(){
  var semId    = DB.getActiveSemesterId();
  var subjects = DB.getSubjects().filter(function(s){ return s.semesterId === semId && !s.archived; });
  var tasks    = DB.getTasks().filter(function(t){ return t.semesterId === semId; });

  var subPct = subjects.length > 0 ? 100 : 0;

  // Syllabus coverage
  var courses  = DB.getSyllabusCourses().filter(function(c){ return c.semesterId === semId; });
  var sylPct   = 0;
  if(courses.length){
    var sem       = DB.getActiveSemester();
    var totalWks  = sem ? (sem.totalWeeks || 15) : 15;
    var covered   = courses.reduce(function(s,c){ return s + ((c.weeks||[]).length); }, 0);
    var expected  = courses.length * totalWks;
    sylPct = expected > 0 ? Math.min(100, Math.round(covered / expected * 100)) : 0;
  }

  var done    = tasks.filter(function(t){ return t.status === 'completed'; }).length;
  var taskPct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
  var attPct  = computeAttendanceRate(semId) || 0;

  setAcadBar('acadSubBar',  'acadSubPct',  subPct);
  setAcadBar('acadSylBar',  'acadSylPct',  sylPct);
  setAcadBar('acadTaskBar', 'acadTaskPct', taskPct);
  setAcadBar('acadAttBar',  'acadAttPct',  attPct);
}

function setAcadBar(barId, pctId, val){
  var pctEl = document.getElementById(pctId);
  var barEl = document.getElementById(barId);
  if(pctEl) pctEl.textContent = val + '%';
  setTimeout(function(){ if(barEl) barEl.style.width = val + '%'; }, 200);
}

/* ============================================================
   6. TODAY'S SCHEDULE
   ============================================================ */
function renderTodaySchedule(){
  var wrap    = document.getElementById('dashTodaySchedule');
  if(!wrap) return;
  var semId   = DB.getActiveSemesterId();
  var dayName = DAY_NAMES[new Date().getDay()];
  var list    = DB.getSubjects()
    .filter(function(s){ return s.semesterId === semId && !s.archived && s.days && s.days.includes(dayName); })
    .sort(function(a,b){ return a.start.localeCompare(b.start); });

  if(!list.length){
    wrap.innerHTML = dashEmpty('bi-calendar-x','No classes today','Enjoy the free day!');
    return;
  }

  var nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  wrap.innerHTML = list.map(function(s){
    var parts   = s.start.split(':').map(Number);
    var eParts  = s.end.split(':').map(Number);
    var startM  = parts[0]*60+parts[1];
    var endM    = eParts[0]*60+eParts[1];
    var isNow   = nowMin >= startM && nowMin <= endM;
    var isDone  = nowMin > endM;
    var badge   = isNow
      ? '<span class="now-badge">Now</span>'
      : isDone
        ? '<span class="done-badge">Done</span>'
        : '';
    var room = (s.room || '') + (s.building ? ' \u00B7 ' + s.building : '');
    return '<div class="sched-row">' +
      '<div class="sched-dot" style="background:' + (s.color||'rgb(var(--accent))') + '"></div>' +
      '<div class="flex-grow-1">' +
        '<div class="sched-code">' + escHtml(s.code) + '</div>' +
        '<div class="sched-room">' + escHtml(room) + '</div>' +
      '</div>' +
      '<div class="text-end">' +
        '<div class="sched-time">' + fmtTime(s.start) + '</div>' +
        badge +
      '</div>' +
    '</div>';
  }).join('');
}

/* ============================================================
   7. UPCOMING TASKS (next 3)
   ============================================================ */
function renderUpcomingTasks(){
  var wrap  = document.getElementById('dashUpcomingTasks');
  if(!wrap) return;
  var semId = DB.getActiveSemesterId();
  var subs  = DB.getSubjects().filter(function(s){ return s.semesterId === semId; });
  var today = todayKey();
  var tasks = DB.getTasks()
    .filter(function(t){ return t.semesterId === semId && t.status !== 'completed' && t.dueDate >= today; })
    .sort(function(a,b){ return (a.dueDate+(a.dueTime||'')).localeCompare(b.dueDate+(b.dueTime||'')); })
    .slice(0, 3);

  if(!tasks.length){
    wrap.innerHTML = dashEmpty('bi-emoji-smile','No upcoming tasks','You\'re all caught up!');
    return;
  }

  wrap.innerHTML = tasks.map(function(t){
    var sub      = subs.find(function(s){ return s.id === t.subjectId; });
    var daysLeft = Math.ceil((new Date(t.dueDate+'T00:00:00') - new Date(today+'T00:00:00')) / 86400000);
    var dayClass = daysLeft <= 1 ? 'days-urgent' : daysLeft <= 3 ? 'days-soon' : 'days-ok';
    var dayLabel = daysLeft === 0 ? 'Today' : daysLeft === 1 ? '1 day left' : daysLeft + ' days left';
    var dateStr  = new Date(t.dueDate+'T00:00:00').toLocaleDateString([], {month:'short', day:'numeric'});
    var catIcon  = taskCatIcon(t.category);
    return '<div class="task-row-dash">' +
      '<div class="task-row-icon"><i class="bi ' + catIcon + '"></i></div>' +
      '<div class="flex-grow-1">' +
        '<div class="task-title-dash">' + escHtml(t.title) + '</div>' +
        '<div class="task-meta-dash">' + (sub ? escHtml(sub.code) + ' \u00B7 ' : '') + dateStr + '</div>' +
      '</div>' +
      '<div class="task-days-left ' + dayClass + '">' + dayLabel + '</div>' +
    '</div>';
  }).join('');
}

function taskCatIcon(cat){
  var map = {
    Homework:'bi-pencil-square', Project:'bi-kanban', Quiz:'bi-patch-question',
    Exam:'bi-journal-text', Personal:'bi-person', Organization:'bi-folder'
  };
  return map[cat] || 'bi-check2-square';
}

/* ============================================================
   HELPERS
   ============================================================ */
function dashEmpty(icon, title, sub){
  return '<div class="dash-empty">' +
    '<i class="bi ' + icon + '"></i>' +
    '<div class="dash-empty-title">' + title + '</div>' +
    (sub ? '<div class="dash-empty-sub">' + sub + '</div>' : '') +
    '</div>';
}

function escHtml(s){
  var d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

/* ============================================================
   QUICK ADD MODALS
   ============================================================ */
function quickAddModal(type){
  var body  = document.getElementById('quickModalBody');
  var modal = new bootstrap.Modal(document.getElementById('quickModal'));
  var semId = DB.getActiveSemesterId();
  if(type === 'task'){
    var subs = DB.getSubjects().filter(function(s){ return s.semesterId === semId; });
    body.innerHTML =
      '<div class="modal-header" style="border:none;padding:0 0 12px 0"><h5 class="modal-title"><i class="bi bi-plus-square me-2"></i>Add Task</h5><button class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>' +
      '<div class="mb-2"><label>Title</label><input class="form-control" id="qaTitle" placeholder="e.g. Finish lab report"></div>' +
      '<div class="row g-2 mb-2">' +
        '<div class="col-6"><label>Category</label><select class="form-select" id="qaCat"><option>Homework</option><option>Project</option><option>Quiz</option><option>Exam</option><option>Personal</option><option>Organization</option></select></div>' +
        '<div class="col-6"><label>Priority</label><select class="form-select" id="qaPri"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option></select></div>' +
      '</div>' +
      '<div class="row g-2 mb-2">' +
        '<div class="col-6"><label>Due Date</label><input type="date" class="form-control" id="qaDate" value="' + todayKey() + '"></div>' +
        '<div class="col-6"><label>Due Time</label><input type="time" class="form-control" id="qaTime" value="23:59"></div>' +
      '</div>' +
      '<div class="mb-3"><label>Subject (optional)</label><select class="form-select" id="qaSub"><option value="">None</option>' +
      subs.map(function(s){ return '<option value="' + s.id + '">' + escHtml(s.code) + '</option>'; }).join('') +
      '</select></div>' +
      '<button class="btn btn-accent w-100" onclick="saveQuickTask()">Save Task</button>';
  } else if(type === 'note'){
    body.innerHTML =
      '<div class="modal-header" style="border:none;padding:0 0 12px 0"><h5 class="modal-title"><i class="bi bi-sticky me-2"></i>Add Note</h5><button class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>' +
      '<div class="mb-2"><label>Title</label><input class="form-control" id="qaNTitle" placeholder="Note title"></div>' +
      '<div class="mb-3"><label>Content</label><textarea class="form-control" id="qaNContent" rows="4" placeholder="Write your note\u2026"></textarea></div>' +
      '<button class="btn btn-accent w-100" onclick="saveQuickNoteModal()">Save Note</button>';
  } else if(type === 'subject'){
    body.innerHTML =
      '<div class="modal-header" style="border:none;padding:0 0 12px 0"><h5 class="modal-title"><i class="bi bi-journal-plus me-2"></i>Add Subject</h5><button class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>' +
      '<p class="text-soft" style="font-size:.85rem">Full subject setup (days, room, professor, color) lives on the Schedule page.</p>' +
      '<button class="btn btn-accent w-100" onclick="location.href=\'schedule.html?new=1\'">Go to Schedule</button>';
  }
  modal.show();
}

function saveQuickTask(){
  var title = document.getElementById('qaTitle').value.trim();
  if(!title){ Toast.show('Please enter a title','high','bi-exclamation-triangle'); return; }
  var semId = DB.getActiveSemesterId();
  var tasks = DB.getTasks();
  tasks.push({
    id: DB.uid(), title: title, description: '',
    subjectId: document.getElementById('qaSub').value || null,
    priority: document.getElementById('qaPri').value,
    category: document.getElementById('qaCat').value,
    dueDate: document.getElementById('qaDate').value,
    dueTime: document.getElementById('qaTime').value,
    status: 'not-started', progress: 0, reminder: true, checklist: [],
    repeat: 'none', score: null, remarks: '',
    semesterId: semId, createdAt: Date.now()
  });
  DB.saveTasks(tasks);
  bootstrap.Modal.getInstance(document.getElementById('quickModal')).hide();
  Toast.show('Task added');
  renderUpcomingTasks();
  renderStatCards();
  renderAcademicProgress();
}

function saveQuickNoteModal(){
  var title   = document.getElementById('qaNTitle').value.trim() || 'Untitled';
  var content = document.getElementById('qaNContent').value.trim();
  var semId   = DB.getActiveSemesterId();
  var notes   = DB.getNotes();
  notes.unshift({ id:DB.uid(), title:title, content:content, category:'Organization', pinned:false, favorite:false, checklist:[], semesterId:semId, createdAt:Date.now(), updatedAt:Date.now() });
  DB.saveNotes(notes);
  bootstrap.Modal.getInstance(document.getElementById('quickModal')).hide();
  Toast.show('Note added');
}
