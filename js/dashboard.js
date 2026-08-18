/* ============================================================
   DASHBOARD.JS — Enhanced Command Center
   ============================================================ */

function initDashboard(){
  renderSemesterOverview();
  renderStatCards();
  renderGradePerformance();
  renderAttendanceDonut();
  renderAcademicProgress();
  renderTodaySchedule();
  renderDueTodayBanner();
  renderUpcomingTasks();
  renderContextSummary();
  renderStreakWidget();
  renderWeatherWidget();
  renderTipWidget();

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

function gwaToPerformancePct(gwaPoint){
  if(gwaPoint === null) return null;
  return Math.max(0, Math.round(((5 - gwaPoint) / 4) * 100));
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
  var withGrades  = rows.filter(function(r){ return r.pct !== null; });

  if(!withGrades.length){
    wrap.innerHTML = dashEmpty('bi-bar-chart','No grades yet','Enter grades on the Grades page.');
    return;
  }

  var display = withGrades.slice(0, 7);
  var html = display.map(function(r, i){
    var perfPct = gwaToPerformancePct(r.point);
    var barColor = perfPct >= 90 ? 'linear-gradient(90deg,#34d399,#22d3ee)'
                 : perfPct >= 80 ? 'linear-gradient(90deg,rgb(var(--accent)),rgb(var(--accent-2)))'
                 : perfPct >= 75 ? 'linear-gradient(90deg,#fbbf24,#f472b6)'
                 : 'linear-gradient(90deg,#fb7185,#f59e0b)';
    var tooltip = escHtml(r.subject.desc || r.subject.code) + ' — ' + (r.pct !== null ? r.pct.toFixed(1) + '% raw · GWA ' + (r.point !== null ? r.point.toFixed(2) : '–') : '–');
    return '<div class="grade-bar-row" title="' + tooltip + '">' +
      '<div class="grade-bar-label" title="' + escHtml(r.subject.desc) + '">' + escHtml(r.subject.code) + '</div>' +
      '<div class="grade-bar-track"><div class="grade-bar-fill" id="gbar' + i + '" style="width:0%;background:' + barColor + '"></div></div>' +
      '<div class="grade-bar-val-wrap">' +
        '<span class="grade-bar-pct" id="gbarpct' + i + '">0%</span>' +
        '<span class="grade-bar-gwa" title="GWA point">(' + (r.point !== null ? r.point.toFixed(2) : '\u2013') + ')</span>' +
      '</div>' +
    '</div>';
  }).join('');
  wrap.innerHTML = html;

  setTimeout(function(){
    display.forEach(function(r, i){
      var perfPct = gwaToPerformancePct(r.point);
      var el = document.getElementById('gbar' + i);
      var pctEl = document.getElementById('gbarpct' + i);
      if(el) el.style.width = perfPct + '%';
      if(pctEl) pctEl.textContent = perfPct + '%';
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

  // Update legend with counts and percentages
  function pctStr(n){ return total ? ' (' + Math.round(n/total*100) + '%)' : ''; }
  var presEl = document.getElementById('attPresent');
  if(presEl) presEl.textContent = counts.Present + pctStr(counts.Present);
  var lateEl = document.getElementById('attLate');
  if(lateEl) lateEl.textContent = counts.Late + pctStr(counts.Late);
  var excEl = document.getElementById('attExcused');
  if(excEl) excEl.textContent = counts.Excused + pctStr(counts.Excused);
  var absEl = document.getElementById('attAbsent');
  if(absEl) absEl.textContent = counts.Absent + pctStr(counts.Absent);

  var circ = 314.16; // 2 * PI * 50
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

  var cumAngle = 0;
  order.forEach(function(seg){
    var el = document.getElementById(seg.id);
    if(!el) return;
    var slice  = (seg.count / total) * circ;
    var gap    = circ - slice;
    el.setAttribute('stroke-dasharray', slice + ' ' + gap);
    el.setAttribute('stroke-dashoffset', circ - cumAngle + '');
    cumAngle += slice;
  });
}

/* ============================================================
   5. ACADEMIC PROGRESS
   ============================================================ */
function computeSyllabusCoverage(semId){
  var courses = DB.getSyllabusCourses().filter(function(c){ return c.semesterId === semId; });
  if(!courses.length) return null;

  var sem = DB.getActiveSemester();
  var totalWks = sem ? (sem.totalWeeks || 15) : 15;

  var totalTopics = 0;
  var coveredTopics = 0;
  var hasTopicData = false;

  courses.forEach(function(c){
    if(Array.isArray(c.topics) && c.topics.length){
      hasTopicData = true;
      c.topics.forEach(function(t){
        totalTopics++;
        if(t.completed) coveredTopics++;
      });
    }
  });

  if(hasTopicData && totalTopics > 0){
    return Math.round(coveredTopics / totalTopics * 100);
  }

  var covered = courses.reduce(function(s,c){ return s + ((c.weeks||[]).length); }, 0);
  var expected = courses.length * totalWks;
  return expected > 0 ? Math.min(100, Math.round(covered / expected * 100)) : 0;
}

function renderAcademicProgress(){
  var semId    = DB.getActiveSemesterId();
  var tasks    = DB.getTasks().filter(function(t){ return t.semesterId === semId; });

  var sylPct = computeSyllabusCoverage(semId);
  if(sylPct === null) sylPct = 0;

  var done    = tasks.filter(function(t){ return t.status === 'completed'; }).length;
  var taskPct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
  var attPct  = computeAttendanceRate(semId) || 0;

  var subjects = DB.getSubjects().filter(function(s){ return s.semesterId === semId && !s.archived; });
  var gradeRows = computeDashSubjectGrades(semId, subjects).filter(function(r){ return r.pct !== null; });
  var gradePct = gradeRows.length
    ? Math.round(gradeRows.reduce(function(s,r){ return s + r.pct; }, 0) / gradeRows.length)
    : null;

  setAcadBar('acadSylBar',   'acadSylPct',  sylPct);
  setAcadBar('acadTaskBar',  'acadTaskPct', taskPct);
  setAcadBar('acadAttBar',   'acadAttPct',  attPct);

  var gradePctEl = document.getElementById('acadGradePct');
  var gradeBarEl = document.getElementById('acadGradeBar');
  if(gradePct !== null){
    if(gradePctEl) gradePctEl.textContent = gradePct + '%';
    setTimeout(function(){ if(gradeBarEl) gradeBarEl.style.width = Math.min(100, gradePct) + '%'; }, 200);
  } else {
    if(gradePctEl) gradePctEl.textContent = '\u2013';
  }
}

function setAcadBar(barId, pctId, val){
  var pctEl = document.getElementById(pctId);
  var barEl = document.getElementById(barId);
  if(pctEl) pctEl.textContent = val + '%';
  setTimeout(function(){ if(barEl) barEl.style.width = val + '%'; }, 200);
}

/* ============================================================
   6. CONTEXTUAL SUMMARY — "What Needs Your Attention"
   ============================================================ */
function renderContextSummary(){
  var wrap = document.getElementById('dashContextSummary');
  if(!wrap) return;

  var semId  = DB.getActiveSemesterId();
  var sem    = DB.getActiveSemester();
  var today  = todayKey();
  var now    = new Date();
  var msgs   = [];

  // Overdue tasks
  var tasks = DB.getTasks().filter(function(t){ return t.semesterId === semId && t.status !== 'completed'; });
  var overdue = tasks.filter(function(t){ return t.dueDate < today; });
  if(overdue.length > 0){
    msgs.push({ priority:1, html:'<i class="bi bi-exclamation-triangle-fill me-1" style="color:#fb7185"></i>' +
      overdue.length + ' task' + (overdue.length !== 1 ? 's are' : ' is') + ' overdue.' });
  }

  // Tasks due today
  var dueToday = tasks.filter(function(t){ return t.dueDate === today; });
  if(dueToday.length > 0){
    msgs.push({ priority:2, html:'<i class="bi bi-clock-fill me-1" style="color:#fbbf24"></i>' +
      dueToday.length + ' task' + (dueToday.length !== 1 ? 's are' : ' is') + ' due today.' });
  }

  // Days until finals
  if(sem && sem.finalsDate){
    var finals = new Date(sem.finalsDate + 'T00:00:00');
    var daysToFinals = Math.ceil((finals - now) / (1000*60*60*24));
    if(daysToFinals > 0 && daysToFinals <= 14){
      msgs.push({ priority:3, html:'<i class="bi bi-calendar-event me-1" style="color:#fbbf24"></i>' +
        daysToFinals + ' day' + (daysToFinals !== 1 ? 's' : '') + ' until finals.' });
    } else if(daysToFinals > 14 && daysToFinals <= 30){
      msgs.push({ priority:5, html:'<i class="bi bi-calendar-event me-1" style="color:rgb(var(--accent))"></i>' +
        daysToFinals + ' days until finals.' });
    }
  }

  // Low attendance subjects
  var subjects = DB.getSubjects().filter(function(s){ return s.semesterId === semId && !s.archived; });
  var settings = DB.getSettings();
  var absLimit = (settings && settings.absenceLimit) ? settings.absenceLimit : null;
  if(absLimit){
    var attAll = DB.getAttendance().filter(function(r){ return r.semesterId === semId; });
    subjects.forEach(function(s){
      var sRecs = attAll.filter(function(r){ return r.subjectId === s.id && r.status !== 'No Classes'; });
      var absCount = sRecs.filter(function(r){ return r.status === 'Absent'; }).length;
      if(absCount >= absLimit - 1 && sRecs.length > 0){
        msgs.push({ priority:2, html:'<i class="bi bi-person-x-fill me-1" style="color:#fb7185"></i>' +
          escHtml(s.code) + ' is approaching the absence limit (' + absCount + '/' + absLimit + ').' });
      }
    });
  }

  // Subjects with no grades
  var gradeRows = computeDashSubjectGrades(semId, subjects);
  var noGrade = gradeRows.filter(function(r){ return r.pct === null; });
  if(subjects.length > 0 && noGrade.length === subjects.length){
    msgs.push({ priority:6, html:'<i class="bi bi-mortarboard me-1" style="color:var(--text-faint)"></i>' +
      'No grades recorded yet this semester.' });
  } else if(noGrade.length > 0 && noGrade.length < subjects.length){
    msgs.push({ priority:7, html:'<i class="bi bi-mortarboard me-1" style="color:var(--text-faint)"></i>' +
      noGrade.length + ' subject' + (noGrade.length !== 1 ? 's have' : ' has') + ' no grades yet.' });
  }

  // Upcoming tasks this week
  var weekEnd = new Date(now); weekEnd.setDate(now.getDate() + 7);
  var weekEndStr = ymdLocal(weekEnd);
  var dueThisWeek = tasks.filter(function(t){ return t.dueDate > today && t.dueDate <= weekEndStr; });
  if(dueThisWeek.length > 0 && overdue.length === 0 && dueToday.length === 0){
    msgs.push({ priority:8, html:'<i class="bi bi-calendar-week me-1" style="color:rgb(var(--accent))"></i>' +
      dueThisWeek.length + ' task' + (dueThisWeek.length !== 1 ? 's' : '') + ' due this week.' });
  }

  // Sort by priority
  msgs.sort(function(a,b){ return a.priority - b.priority; });

  if(msgs.length === 0){
    wrap.innerHTML = '<span class="ctx-neutral"><i class="bi bi-check-circle me-1"></i>You\'re on track. Nothing needs your attention right now.</span>';
  } else {
    wrap.innerHTML = msgs.map(function(m){ return '<span class="ctx-item">' + m.html + '</span>'; }).join('');
  }
}

/* ============================================================
   7. TODAY'S SCHEDULE
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
   8. DUE TODAY BANNER
   ============================================================ */
function renderDueTodayBanner(){
  var wrap = document.getElementById('dueTodayBanner');
  if(!wrap) return;
  var semId = DB.getActiveSemesterId();
  var today = todayKey();
  var dueToday = DB.getTasks().filter(function(t){
    return t.semesterId === semId && t.status !== 'completed' && t.dueDate === today;
  });

  if(!dueToday.length){
    wrap.style.display = 'none';
    return;
  }

  wrap.style.display = '';
  var n = dueToday.length;
  var msg = n === 1 ? '1 task is due today' : n + ' tasks are due today';
  wrap.innerHTML =
    '<div class="due-today-inner">' +
      '<div class="due-today-left">' +
        '<i class="bi bi-alarm-fill due-today-icon"></i>' +
        '<div>' +
          '<div class="due-today-title">DUE TODAY</div>' +
          '<div class="due-today-msg">' + escHtml(msg) + '</div>' +
        '</div>' +
      '</div>' +
      '<a href="tasks.html" class="due-today-btn">View Tasks</a>' +
    '</div>';
}

/* ============================================================
   9. UPCOMING TASKS
   ============================================================ */
function renderUpcomingTasks(){
  var wrap  = document.getElementById('dashUpcomingTasks');
  if(!wrap) return;
  var semId = DB.getActiveSemesterId();
  var subs  = DB.getSubjects().filter(function(s){ return s.semesterId === semId; });
  var today = todayKey();

  // Overdue tasks (show up to 2)
  var overdueTasks = DB.getTasks()
    .filter(function(t){ return t.semesterId === semId && t.status !== 'completed' && t.dueDate < today; })
    .sort(function(a,b){ return b.dueDate.localeCompare(a.dueDate); })
    .slice(0, 2);

  // Upcoming tasks (after today)
  var upcomingTasks = DB.getTasks()
    .filter(function(t){ return t.semesterId === semId && t.status !== 'completed' && t.dueDate > today; })
    .sort(function(a,b){ return (a.dueDate+(a.dueTime||'')).localeCompare(b.dueDate+(b.dueTime||'')); })
    .slice(0, 3);

  if(!overdueTasks.length && !upcomingTasks.length){
    wrap.innerHTML = dashEmpty('bi-emoji-smile','No upcoming tasks','You\'re all caught up!');
    return;
  }

  var html = '';

  if(overdueTasks.length){
    html += '<div class="upcoming-section-label upcoming-overdue-label"><i class="bi bi-exclamation-triangle-fill me-1"></i>Overdue</div>';
    html += overdueTasks.map(function(t){
      var sub = subs.find(function(s){ return s.id === t.subjectId; });
      var dateStr = new Date(t.dueDate+'T00:00:00').toLocaleDateString([], {month:'short', day:'numeric'});
      var catIcon = taskCatIcon(t.category);
      return '<div class="task-row-dash task-row-overdue">' +
        '<div class="task-row-icon task-row-icon-overdue"><i class="bi ' + catIcon + '"></i></div>' +
        '<div class="flex-grow-1">' +
          '<div class="task-title-dash">' + escHtml(t.title) + '</div>' +
          '<div class="task-meta-dash">' + (sub ? escHtml(sub.code) + ' \u00B7 ' : '') + dateStr + '</div>' +
        '</div>' +
        '<div class="task-days-left days-urgent">Overdue</div>' +
      '</div>';
    }).join('');
  }

  if(upcomingTasks.length){
    if(overdueTasks.length) html += '<div class="upcoming-section-label mt-2"><i class="bi bi-clock me-1"></i>Upcoming</div>';
    html += upcomingTasks.map(function(t){
      var sub      = subs.find(function(s){ return s.id === t.subjectId; });
      var daysLeft = Math.ceil((new Date(t.dueDate+'T00:00:00') - new Date(today+'T00:00:00')) / 86400000);
      var dayClass = daysLeft <= 1 ? 'days-urgent' : daysLeft <= 3 ? 'days-soon' : 'days-ok';
      var dayLabel = daysLeft === 1 ? '1 day left' : daysLeft + ' days left';
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

  wrap.innerHTML = html;
}

function taskCatIcon(cat){
  var map = {
    Homework:'bi-pencil-square', Project:'bi-kanban', Quiz:'bi-patch-question',
    Exam:'bi-journal-text', Personal:'bi-person', Organization:'bi-folder',
    Academic:'bi-book', Assignment:'bi-pencil', Other:'bi-check2-square'
  };
  return map[cat] || 'bi-check2-square';
}

/* ============================================================
   10. STREAK WIDGET
   ============================================================ */
function computeTaskStreak(){
  var allTasks = DB.getTasks();
  // Find tasks with completedAt date; fall back to dueDate for completed tasks
  var completedDates = {};
  allTasks.forEach(function(t){
    if(t.status !== 'completed') return;
    var d = t.completedAt ? ymdLocal(new Date(t.completedAt)) : t.dueDate;
    if(d) completedDates[d] = true;
  });

  var today = todayKey();
  var streak = 0;
  var d = new Date();
  // Don't count today if no tasks completed today
  if(!completedDates[today]){
    d.setDate(d.getDate() - 1);
  }
  while(true){
    var key = ymdLocal(d);
    if(!completedDates[key]) break;
    streak++;
    d.setDate(d.getDate() - 1);
    if(streak > 365) break;
  }
  return streak;
}

function renderStreakWidget(){
  var numEl  = document.getElementById('streakNumVal');
  var subEl  = document.querySelector('#dashStreakWidget .streak-sub-txt');
  var streak = computeTaskStreak();
  var emoji  = streak >= 30 ? ' 🔥' : streak >= 14 ? ' ⚡' : streak >= 7 ? ' ✨' : '';
  if(!numEl) return;
  if(streak === 0){
    numEl.textContent = '–';
    if(subEl) subEl.textContent = 'No activity yet';
  } else {
    animateCountUp('streakNumVal', 0, streak, 800, function(v){ return String(Math.round(v)); });
    if(subEl) subEl.textContent = 'Tasks completed' + emoji;
  }
}

/* ============================================================
   11. WEATHER WIDGET
   ============================================================ */
var WEATHER_ICONS = {
  0:'bi-sun-fill', 1:'bi-sun-fill', 2:'bi-cloud-sun-fill', 3:'bi-cloud-fill',
  45:'bi-cloud-haze2-fill', 48:'bi-cloud-haze2-fill',
  51:'bi-cloud-drizzle-fill', 53:'bi-cloud-drizzle-fill', 55:'bi-cloud-drizzle-fill',
  61:'bi-cloud-rain-fill', 63:'bi-cloud-rain-fill', 65:'bi-cloud-rain-heavy-fill',
  71:'bi-cloud-snow-fill', 73:'bi-cloud-snow-fill', 75:'bi-cloud-snow-fill',
  80:'bi-cloud-rain-fill', 81:'bi-cloud-rain-fill', 82:'bi-cloud-rain-heavy-fill',
  95:'bi-cloud-lightning-rain-fill', 96:'bi-cloud-lightning-rain-fill', 99:'bi-cloud-lightning-rain-fill',
};
var WEATHER_DESC = {
  0:'Clear sky', 1:'Mainly clear', 2:'Partly cloudy', 3:'Overcast',
  45:'Fog', 48:'Icy fog',
  51:'Light drizzle', 53:'Drizzle', 55:'Heavy drizzle',
  61:'Light rain', 63:'Moderate rain', 65:'Heavy rain',
  71:'Light snow', 73:'Snow', 75:'Heavy snow',
  80:'Showers', 81:'Rain showers', 82:'Heavy showers',
  95:'Thunderstorm', 96:'Thunderstorm w/ hail', 99:'Heavy thunderstorm',
};

function renderWeatherWidget(){
  var wrap = document.getElementById('dashWeatherWidget');
  if(!wrap) return;

  function showUnavail(msg){
    wrap.innerHTML =
      '<div class="weather-unavail-state">' +
        '<i class="bi bi-cloud-slash"></i>' +
        '<span>' + (msg || 'Weather<br>unavailable') + '</span>' +
      '</div>';
  }

  function fetchWeather(lat, lon, city){
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat +
      '&longitude=' + lon +
      '&current_weather=true&temperature_unit=celsius&timezone=auto&forecast_days=1';
    fetch(url)
      .then(function(r){ return r.json(); })
      .then(function(data){
        var cw   = data.current_weather;
        var code = cw.weathercode;
        var temp = Math.round(cw.temperature);
        var icon = WEATHER_ICONS[code] || 'bi-cloud-fill';
        var desc = WEATHER_DESC[code] || 'Partly cloudy';
        if(code === 0 && cw.is_day === 0) icon = 'bi-moon-stars-fill';
        if(code === 1 && cw.is_day === 0) icon = 'bi-cloud-moon-fill';
        wrap.innerHTML =
          '<div class="weather-icon-box"><i class="bi ' + icon + ' weather-wi"></i></div>' +
          '<div class="weather-num">' + temp + '°<span class="weather-unit">C</span></div>' +
          '<div class="weather-text-stack">' +
            '<div class="weather-cond">' + escHtml(desc) + '</div>' +
            (city ? '<div class="weather-city"><i class="bi bi-geo-alt-fill"></i>' + escHtml(city) + '</div>' : '<div class="weather-city">Your location</div>') +
          '</div>';
      })
      .catch(function(){ showUnavail(); });
  }

  function extractCity(addr){
    // For Metro Manila: Nominatim at zoom=10 returns city (e.g. "Quezon City")
    // Fallback chain covers other regions too
    return addr.city || addr.municipality || addr.county ||
           addr.city_district || addr.town || addr.village || addr.suburb || '';
  }

  if(!navigator.geolocation){
    showUnavail('Allow location<br>for weather');
    return;
  }

  navigator.geolocation.getCurrentPosition(function(pos){
    var lat = pos.coords.latitude.toFixed(6);
    var lon = pos.coords.longitude.toFixed(6);
    // zoom=10 → city/municipality level, avoids street/district noise
    var geoUrl = 'https://nominatim.openstreetmap.org/reverse?lat=' + lat +
      '&lon=' + lon + '&format=json&zoom=10&accept-language=en';
    fetch(geoUrl, { headers:{ 'Accept-Language':'en' } })
      .then(function(r){ return r.json(); })
      .then(function(geo){
        var city = geo && geo.address ? extractCity(geo.address) : '';
        fetchWeather(lat, lon, city);
      })
      .catch(function(){
        fetchWeather(lat, lon, '');
      });
  }, function(){
    showUnavail('Allow location<br>for weather');
  }, { timeout: 10000, maximumAge: 300000 });
}

/* ============================================================
   12. STUDENT TIP WIDGET
   ============================================================ */
var STUDENT_TIPS = [
  'Review difficult topics while they\'re still fresh — within 24 hours of class.',
  'Break large tasks into smaller steps to avoid feeling overwhelmed.',
  'Use the Pomodoro method: 25 min focus, 5 min break.',
  'Prioritize sleep — memory consolidation happens while you rest.',
  'Active recall beats re-reading: quiz yourself instead.',
  'Start assignments early to leave time for revision.',
  'Group study works best for discussion, not first-time learning.',
  'Write summaries in your own words to deepen understanding.',
  'Minimize distractions during study: phone away, one tab at a time.',
  'Set specific, measurable goals for each study session.',
  'Take short walks between study sessions to reset focus.',
  'Review your notes within 24 hours to strengthen retention.',
  'Eat a balanced meal before exams — your brain needs fuel.',
  'Practice past papers under exam conditions for better results.',
  'Reach out to your professor early if you\'re struggling with material.',
  'Keep a consistent daily schedule to build productive habits.',
  'Spaced repetition is more effective than cramming.',
  'Teach a concept to someone else to reveal gaps in your knowledge.',
  'Use diagrams and mind maps for complex or interconnected topics.',
  'Celebrate small wins — completing a task is still progress.',
];

function renderTipWidget(){
  var tipTextEl = document.querySelector('#dashTipWidget .tip-text');
  if(!tipTextEl) return;
  var now = new Date();
  var dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  var tip = STUDENT_TIPS[dayOfYear % STUDENT_TIPS.length];
  tipTextEl.textContent = tip;
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
  } else if(type === 'grade'){
    var subs2 = DB.getSubjects().filter(function(s){ return s.semesterId === semId && !s.archived; });
    if(!subs2.length){
      body.innerHTML =
        '<div class="modal-header" style="border:none;padding:0 0 12px 0"><h5 class="modal-title"><i class="bi bi-mortarboard me-2"></i>Add Grade</h5><button class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>' +
        '<p class="text-soft" style="font-size:.85rem">No subjects found for this semester. Add subjects first.</p>' +
        '<a class="btn btn-accent w-100" href="schedule.html">Go to Schedule</a>';
    } else {
      body.innerHTML =
        '<div class="modal-header" style="border:none;padding:0 0 12px 0"><h5 class="modal-title"><i class="bi bi-mortarboard me-2"></i>Add Grade</h5><button class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>' +
        '<p class="text-soft mb-2" style="font-size:.82rem">Select a subject to enter grades:</p>' +
        '<div class="d-flex flex-column gap-2">' +
        subs2.map(function(s){
          return '<a class="btn btn-ghost text-start" href="grades.html" onclick="localStorage.setItem(\'sp_quick_grade_subject\',\'' + s.id + '\');return true;">' +
            '<i class="bi bi-journal-text me-2" style="color:' + (s.color||'rgb(var(--accent))') + '"></i>' +
            escHtml(s.code) + ' <span class="text-faint" style="font-size:.78rem">' + escHtml(s.desc||'') + '</span>' +
            '</a>';
        }).join('') +
        '</div>';
    }
  } else if(type === 'subject'){
    body.innerHTML =
      '<div class="modal-header" style="border:none;padding:0 0 12px 0"><h5 class="modal-title"><i class="bi bi-journal-plus me-2"></i>Add Subject</h5><button class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>' +
      '<p class="text-soft" style="font-size:.85rem">Full subject setup (days, room, professor, color) lives on the Schedule page.</p>' +
      '<button class="btn btn-accent w-100" onclick="location.href=\'schedule.html?new=1\'">Go to Schedule</button>';
  } else if(type === 'attendance'){
    body.innerHTML =
      '<div class="modal-header" style="border:none;padding:0 0 12px 0"><h5 class="modal-title"><i class="bi bi-person-check me-2"></i>Log Attendance</h5><button class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>' +
      '<p class="text-soft" style="font-size:.85rem">Log your attendance records on the Attendance page.</p>' +
      '<a class="btn btn-accent w-100" href="attendance.html">Go to Attendance</a>';
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
  renderDueTodayBanner();
  renderUpcomingTasks();
  renderStatCards();
  renderAcademicProgress();
  renderContextSummary();
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

/* ============================================================
   QUICK ACTIONS MORE — BOTTOM SHEET
   ============================================================ */
function openQASheet(){
  document.getElementById('qaSheet').classList.add('qa-sheet-open');
  document.getElementById('qaSheetOverlay').classList.add('qa-sheet-overlay-open');
  document.body.style.overflow = 'hidden';
}
function closeQASheet(){
  document.getElementById('qaSheet').classList.remove('qa-sheet-open');
  document.getElementById('qaSheetOverlay').classList.remove('qa-sheet-overlay-open');
  document.body.style.overflow = '';
}
/* keep old names in case referenced elsewhere */
function toggleQAMore(){ openQASheet(); }
function closeQAMoreHandler(){}
