/* ============================================================
   ATTENDANCE.JS — Enhanced v4
   Features: Heatmap, Mark All Present, Consecutive Absence
   Warnings, Export CSV/PDF, Skeleton states, Mode toggle,
   Absence limit progress bars, Mobile-first layout.
   ============================================================ */

const DEFAULT_ABSENCE_LIMIT = 3;

/* ---- Helpers ---- */
function escapeAttHtml(s){ return escHtml(s); }

function todayKey(){
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth()+1).padStart(2,'0') + '-' +
    String(d.getDate()).padStart(2,'0');
}

function formatDisplayDate(ymd){
  if(!ymd) return '';
  const [y,m,d] = ymd.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[+m-1]} ${+d}, ${y}`;
}

function formatShortDate(ymd){
  if(!ymd) return '';
  return ymd.replace(/^\d{4}-/, '').replace('-', '/');
}

/* ---- Absence limit storage ---- */
function getAbsenceLimitForSubject(subjectId){
  const settings = DB.getSettings();
  if(settings.absenceLimits && settings.absenceLimits[subjectId] != null){
    return +settings.absenceLimits[subjectId];
  }
  return settings.defaultAbsenceLimit != null ? +settings.defaultAbsenceLimit : DEFAULT_ABSENCE_LIMIT;
}
function setAbsenceLimitForSubject(subjectId, limit){
  const settings = DB.getSettings();
  if(!settings.absenceLimits) settings.absenceLimits = {};
  settings.absenceLimits[subjectId] = limit;
  DB.saveSettings(settings);
}
function setDefaultAbsenceLimit(limit){
  const settings = DB.getSettings();
  settings.defaultAbsenceLimit = limit;
  DB.saveSettings(settings);
}

/* ---- Mode Toggle ---- */
function toggleAttMode(){
  const cb = document.getElementById('attOnline');
  const btn = document.getElementById('attModeToggle');
  const label = document.getElementById('attModeLabel');
  if(!cb || !btn) return;
  cb.checked = !cb.checked;
  const online = cb.checked;
  btn.setAttribute('aria-checked', online ? 'true' : 'false');
  btn.classList.toggle('is-online', online);
  if(label) label.textContent = online ? 'Online' : 'Offline';
}

/* ---- Init ---- */
function initAttendance(){
  const semId = DB.getActiveSemesterId();
  const subs = DB.getSubjects().filter(s => s.semesterId === semId && !s.archived);
  const subSel = document.getElementById('attSubject');
  subSel.innerHTML = subs.length
    ? subs.map(s => `<option value="${s.id}">${escapeAttHtml(s.code)}</option>`).join('')
    : '<option value="">No subjects</option>';
  document.getElementById('attDate').value = todayKey();

  // Populate heatmap subject filter
  const heatmapFilter = document.getElementById('heatmapSubjectFilter');
  if(heatmapFilter){
    heatmapFilter.innerHTML = `<option value="">All Subjects</option>` +
      subs.map(s => `<option value="${s.id}">${escapeAttHtml(s.code)}</option>`).join('');
  }

  renderAttendanceAll();
}

/* ---- Log Attendance ---- */
function logAttendance(){
  const subjectId = document.getElementById('attSubject').value;
  const date = document.getElementById('attDate').value;
  const status = document.getElementById('attStatus').value;
  const online = document.getElementById('attOnline').checked;
  const notes = (document.getElementById('attNotes')?.value || '').trim();
  if(!subjectId || !date){
    Toast.show('Select a subject and date', 'high', 'bi-exclamation-triangle');
    return;
  }
  const semId = DB.getActiveSemesterId();
  const records = DB.getAttendance();
  const existing = records.find(r => r.subjectId === subjectId && r.date === date);
  if(existing){
    existing.status = status;
    existing.online = online;
    existing.notes = notes;
  } else {
    records.push({ id: DB.uid(), subjectId, date, status, online, notes, semesterId: semId });
  }
  DB.saveAttendance(records);
  // Reset mode toggle
  const cb = document.getElementById('attOnline');
  const btn = document.getElementById('attModeToggle');
  const label = document.getElementById('attModeLabel');
  if(cb){ cb.checked = false; }
  if(btn){ btn.classList.remove('is-online'); btn.setAttribute('aria-checked','false'); }
  if(label){ label.textContent = 'Offline'; }
  Toast.show('Attendance logged');
  renderAttendanceAll();
}

/* ---- Render all ---- */
function renderAttendanceAll(){
  renderOverallRate();
  renderStatistics();
  renderConsecutiveAbsenceAlerts();
  renderHeatmap();
  renderAbsenceWarnings();
  renderSubjectBreakdown();
  renderLog();
}

/* ---- Overall Rate ---- */
function renderOverallRate(){
  const semId = DB.getActiveSemesterId();
  const records = DB.getAttendance().filter(r => r.semesterId === semId);
  const relevant = records.filter(r => r.status !== 'No Classes');
  const present = relevant.filter(r => r.status === 'Present' || r.status === 'Late' || r.status === 'Excused').length;
  const rate = relevant.length ? Math.round(present / relevant.length * 100) : null;
  document.getElementById('aRate').textContent = rate === null ? '--%' : rate + '%';
  const bar = document.getElementById('aRateBar');
  if(bar){
    bar.style.width = (rate || 0) + '%';
    bar.style.background = rate === null ? '' : rate >= 75 ? '#34d399' : rate >= 50 ? '#fbbf24' : '#fb7185';
  }
}

/* ---- Statistics ---- */
function renderStatistics(){
  const semId = DB.getActiveSemesterId();
  const records = DB.getAttendance().filter(r => r.semesterId === semId);
  const wrap = document.getElementById('attendanceStats');

  if(!records.length){
    wrap.innerHTML = `
      <div class="att-stat-card present"><div class="stat-label">Present</div><div class="stat-value att-skel-val">--</div><div class="stat-percent">—</div></div>
      <div class="att-stat-card present-online"><div class="stat-label">Online</div><div class="stat-value att-skel-val">--</div><div class="stat-percent">—</div></div>
      <div class="att-stat-card late"><div class="stat-label">Late</div><div class="stat-value att-skel-val">--</div><div class="stat-percent">—</div></div>
      <div class="att-stat-card excused"><div class="stat-label">Excused</div><div class="stat-value att-skel-val">--</div><div class="stat-percent">—</div></div>
      <div class="att-stat-card absent"><div class="stat-label">Absent</div><div class="stat-value att-skel-val">--</div><div class="stat-percent">—</div></div>
      <div class="att-stat-card noclasses"><div class="stat-label">No Class</div><div class="stat-value att-skel-val">--</div><div class="stat-percent">—</div></div>`;
    return;
  }

  const presentCount   = records.filter(r => r.status === 'Present').length;
  const presentOnline  = records.filter(r => r.status === 'Present' && r.online).length;
  const lateCount      = records.filter(r => r.status === 'Late').length;
  const excusedCount   = records.filter(r => r.status === 'Excused').length;
  const absentCount    = records.filter(r => r.status === 'Absent').length;
  const noClassCount   = records.filter(r => r.status === 'No Classes').length;
  const total = records.filter(r => r.status !== 'No Classes').length;

  const pct = n => total > 0 ? `<div class="stat-percent">${Math.round(n / total * 100)}%</div>` : '<div class="stat-percent">—</div>';

  wrap.innerHTML = `
    <div class="att-stat-card present">
      <div class="stat-label">Present</div>
      <div class="stat-value">${presentCount}</div>
      ${pct(presentCount)}
    </div>
    <div class="att-stat-card present-online">
      <div class="stat-label">Online</div>
      <div class="stat-value">${presentOnline}</div>
      <div class="stat-percent">${presentCount > 0 ? Math.round(presentOnline / presentCount * 100) + '%' : '—'}</div>
    </div>
    <div class="att-stat-card late">
      <div class="stat-label">Late</div>
      <div class="stat-value">${lateCount}</div>
      ${pct(lateCount)}
    </div>
    <div class="att-stat-card excused">
      <div class="stat-label">Excused</div>
      <div class="stat-value">${excusedCount}</div>
      ${pct(excusedCount)}
    </div>
    <div class="att-stat-card absent">
      <div class="stat-label">Absent</div>
      <div class="stat-value">${absentCount}</div>
      ${pct(absentCount)}
    </div>
    <div class="att-stat-card noclasses">
      <div class="stat-label">No Class</div>
      <div class="stat-value">${noClassCount}</div>
      <div class="stat-percent">—</div>
    </div>`;
}

/* ---- Consecutive Absence Detection ---- */
function getConsecutiveAbsences(subjectId, records){
  // Get all absence/attendance records for this subject, sorted ascending
  const subRecs = records
    .filter(r => r.subjectId === subjectId && r.status !== 'No Classes')
    .sort((a,b) => a.date.localeCompare(b.date));
  if(!subRecs.length) return 0;

  let maxStreak = 0, curStreak = 0;
  for(const r of subRecs){
    if(r.status === 'Absent'){
      curStreak++;
      maxStreak = Math.max(maxStreak, curStreak);
    } else {
      curStreak = 0;
    }
  }
  return maxStreak;
}

function getCurrentConsecutiveAbsences(subjectId, records){
  // Current trailing streak (most recent consecutive absences)
  const subRecs = records
    .filter(r => r.subjectId === subjectId && r.status !== 'No Classes')
    .sort((a,b) => b.date.localeCompare(a.date)); // descending
  let streak = 0;
  for(const r of subRecs){
    if(r.status === 'Absent') streak++;
    else break;
  }
  return streak;
}

/* ---- Consecutive Absence Alerts ---- */
function renderConsecutiveAbsenceAlerts(){
  const wrap = document.getElementById('consecutiveAbsenceAlerts');
  if(!wrap) return;
  const semId = DB.getActiveSemesterId();
  const subs = DB.getSubjects().filter(s => s.semesterId === semId && !s.archived);
  const records = DB.getAttendance().filter(r => r.semesterId === semId);

  const warnings = [];
  for(const s of subs){
    const streak = getCurrentConsecutiveAbsences(s.id, records);
    if(streak >= 3){
      warnings.push({ s, streak });
    }
  }

  if(!warnings.length){ wrap.innerHTML = ''; return; }

  wrap.innerHTML = `<div class="att-consec-alerts mb-3">` +
    warnings.map(({s, streak}) => `
      <div class="att-consec-alert fade-in" role="alert">
        <div class="att-consec-icon"><i class="bi bi-exclamation-triangle-fill"></i></div>
        <div class="att-consec-body">
          <div class="att-consec-title">Consecutive Absences</div>
          <div class="att-consec-msg">
            <span class="att-consec-dot" style="background:${s.color}"></span>
            <strong>${escapeAttHtml(s.code)}</strong> — ${streak} consecutive absence${streak !== 1 ? 's' : ''}.
            Review your attendance before reaching the limit.
          </div>
        </div>
      </div>`).join('') + `</div>`;
}

/* ---- Heatmap ---- */
function renderHeatmap(){
  const semId = DB.getActiveSemesterId();
  const sem = DB.getActiveSemester();
  const wrap = document.getElementById('attendanceHeatmap');
  const legend = document.getElementById('heatmapLegend');
  if(!wrap) return;

  const records = DB.getAttendance().filter(r => r.semesterId === semId);
  const filterSubId = document.getElementById('heatmapSubjectFilter')?.value || '';
  const filteredRecords = filterSubId ? records.filter(r => r.subjectId === filterSubId) : records;

  // Build date range from semester
  let startDate = sem && sem.startDate ? new Date(sem.startDate + 'T00:00:00') : null;
  let endDate   = sem && sem.endDate   ? new Date(sem.endDate + 'T00:00:00')   : null;

  // If no semester dates, derive from records
  if(filteredRecords.length){
    const sortedDates = [...filteredRecords].sort((a,b)=>a.date.localeCompare(b.date));
    if(!startDate) startDate = new Date(sortedDates[0].date + 'T00:00:00');
    if(!endDate)   endDate   = new Date(sortedDates[sortedDates.length-1].date + 'T00:00:00');
  }

  if(!startDate || !endDate || !filteredRecords.length){
    wrap.innerHTML = `<div class="att-heatmap-empty">
      <i class="bi bi-grid-3x3-gap"></i>
      <div>No attendance history yet</div>
      <div class="att-heatmap-empty-sub">Your attendance activity will appear here once you start logging.</div>
    </div>`;
    if(legend) legend.innerHTML = '';
    return;
  }

  // Clamp end to today if in future
  const today = new Date(); today.setHours(0,0,0,0);
  if(endDate > today) endDate = today;

  // Build a lookup: date -> best status (first non-NoClasses wins, else NoClasses)
  const subs = DB.getSubjects();
  const dateMap = {}; // date -> { status, subjects: [...], online }
  for(const r of filteredRecords){
    if(!dateMap[r.date]){
      dateMap[r.date] = { statuses: [], subjects: [], notes: [] };
    }
    const sub = subs.find(s => s.id === r.subjectId);
    dateMap[r.date].statuses.push(r.status);
    dateMap[r.date].subjects.push(sub ? sub.code : 'Unknown');
    dateMap[r.date].notes.push(r.notes || '');
    dateMap[r.date].online = dateMap[r.date].online || r.online;
  }

  // Determine primary status for a date (worst-case: Absent > Late > Excused > NoClasses > Present)
  function primaryStatus(statuses){
    if(statuses.includes('Absent'))     return 'Absent';
    if(statuses.includes('Late'))       return 'Late';
    if(statuses.includes('Excused'))    return 'Excused';
    if(statuses.includes('No Classes')) return 'No Classes';
    if(statuses.includes('Present'))    return 'Present';
    return 'Present';
  }

  // Local date formatter — avoids UTC offset shifting the date (toISOString is UTC)
  function toLocalYMD(d){
    return d.getFullYear() + '-' +
      String(d.getMonth()+1).padStart(2,'0') + '-' +
      String(d.getDate()).padStart(2,'0');
  }

  // Build week grid starting from Monday of startDate's week
  const gridStart = new Date(startDate);
  const dow = gridStart.getDay(); // 0=Sun
  gridStart.setDate(gridStart.getDate() - (dow === 0 ? 6 : dow - 1)); // go to Monday

  const weeks = [];
  let cur = new Date(gridStart);
  while(cur <= endDate){
    const week = [];
    for(let i=0; i<7; i++){
      const ymd = toLocalYMD(cur);
      const inRange = cur >= startDate && cur <= endDate;
      const data = dateMap[ymd];
      week.push({
        ymd,
        inRange,
        status: data ? primaryStatus(data.statuses) : null,
        subjects: data ? data.subjects : [],
        notes: data ? data.notes.filter(Boolean) : [],
        online: data ? data.online : false,
        isWeekend: cur.getDay() === 0 || cur.getDay() === 6
      });
      cur.setDate(cur.getDate()+1);
    }
    weeks.push(week);
  }

  // Render
  const dayLabels = ['M','T','W','T','F','S','S'];
  let html = `<div class="att-heatmap-grid-wrap">
    <div class="att-heatmap-day-labels">`;
  for(const l of dayLabels){
    html += `<div class="att-heatmap-day-lbl">${l}</div>`;
  }
  html += `</div><div class="att-heatmap-weeks">`;

  for(const week of weeks){
    html += `<div class="att-heatmap-col">`;
    for(const cell of week){
      let cls = 'att-hm-cell';
      let ariaLabel = '';
      if(!cell.inRange || cell.isWeekend && !cell.status){
        cls += ' att-hm-empty';
        ariaLabel = cell.ymd;
      } else if(!cell.status){
        cls += ' att-hm-none';
        ariaLabel = `${cell.ymd}: No record`;
      } else {
        const sc = {
          'Present':'att-hm-present',
          'Late':'att-hm-late',
          'Excused':'att-hm-excused',
          'Absent':'att-hm-absent',
          'No Classes':'att-hm-noclasses'
        }[cell.status] || 'att-hm-none';
        cls += ' ' + sc;
        ariaLabel = `${cell.ymd}: ${cell.status}${cell.subjects.length ? ' — ' + cell.subjects.join(', ') : ''}`;
      }

      // Tooltip data attributes
      const subjectsStr = cell.subjects.join(', ') || '—';
      const notesStr = cell.notes.join(' / ') || '';
      const modeStr = cell.online ? 'Online' : cell.subjects.length ? 'Offline' : '';
      html += `<div class="${cls}"
        role="gridcell"
        tabindex="0"
        aria-label="${escapeAttHtml(ariaLabel)}"
        data-hm-date="${cell.ymd}"
        data-hm-status="${escapeAttHtml(cell.status || '')}"
        data-hm-subjects="${escapeAttHtml(subjectsStr)}"
        data-hm-notes="${escapeAttHtml(notesStr)}"
        data-hm-mode="${escapeAttHtml(modeStr)}"
        onmouseenter="showHmTooltip(event,this)"
        onmouseleave="hideHmTooltip()"
        onfocus="showHmTooltip(event,this)"
        onblur="hideHmTooltip()"
        onclick="showHmTooltipMobile(event,this)"
      ></div>`;
    }
    html += `</div>`;
  }
  html += `</div></div>`;

  wrap.innerHTML = html;

  // Legend
  if(legend){
    legend.innerHTML = `<div class="att-hm-legend-wrap">
      <span class="att-hm-legend-label">Less</span>
      <div class="att-hm-legend-cells">
        <div class="att-hm-cell att-hm-none att-hm-legend-cell" title="No record"></div>
        <div class="att-hm-cell att-hm-present att-hm-legend-cell" title="Present"></div>
        <div class="att-hm-cell att-hm-late att-hm-legend-cell" title="Late"></div>
        <div class="att-hm-cell att-hm-excused att-hm-legend-cell" title="Excused"></div>
        <div class="att-hm-cell att-hm-absent att-hm-legend-cell" title="Absent"></div>
        <div class="att-hm-cell att-hm-noclasses att-hm-legend-cell" title="No Classes"></div>
      </div>
      <span class="att-hm-legend-label">More</span>
      <div class="att-hm-legend-items">
        <span class="att-hm-li"><span class="att-hm-li-dot att-hm-present"></span>Present</span>
        <span class="att-hm-li"><span class="att-hm-li-dot att-hm-late"></span>Late</span>
        <span class="att-hm-li"><span class="att-hm-li-dot att-hm-excused"></span>Excused</span>
        <span class="att-hm-li"><span class="att-hm-li-dot att-hm-absent"></span>Absent</span>
        <span class="att-hm-li"><span class="att-hm-li-dot att-hm-noclasses"></span>No Class</span>
      </div>
    </div>`;
  }
}

/* ---- Heatmap Tooltip ---- */
let _hmTooltipEl = null;
let _hmTooltipTimer = null;

function showHmTooltip(evt, cell){
  clearTimeout(_hmTooltipTimer);
  hideHmTooltip();
  const date = cell.dataset.hmDate;
  const status = cell.dataset.hmStatus;
  const subjects = cell.dataset.hmSubjects;
  const notes = cell.dataset.hmNotes;
  const mode = cell.dataset.hmMode;
  if(!date || date === 'undefined') return;
  if(!status && !subjects) return;

  const tip = document.createElement('div');
  tip.className = 'att-hm-tooltip';
  tip.innerHTML = `<div class="att-hm-tt-date">${formatDisplayDate(date)}</div>` +
    (subjects && subjects !== '—' ? `<div class="att-hm-tt-subject">${escapeAttHtml(subjects)}</div>` : '') +
    (status ? `<div class="att-hm-tt-status att-hm-tt-${(status||'').toLowerCase().replace(/\s/g,'')}">${escapeAttHtml(status)}</div>` : '') +
    (mode ? `<div class="att-hm-tt-mode">${escapeAttHtml(mode)}</div>` : '') +
    (notes ? `<div class="att-hm-tt-notes"><i class="bi bi-chat-left-text-fill"></i> ${escapeAttHtml(notes)}</div>` : '');

  document.body.appendChild(tip);
  _hmTooltipEl = tip;
  positionHmTooltip(evt, tip);
}

function positionHmTooltip(evt, tip){
  const rect = evt.target.getBoundingClientRect();
  const tRect = tip.getBoundingClientRect();
  let top = rect.top + window.scrollY - tRect.height - 8;
  let left = rect.left + window.scrollX + rect.width/2 - tRect.width/2;
  if(top < 8) top = rect.bottom + window.scrollY + 8;
  if(left < 8) left = 8;
  if(left + tRect.width > window.innerWidth - 8) left = window.innerWidth - tRect.width - 8;
  tip.style.top = top + 'px';
  tip.style.left = left + 'px';
  tip.style.opacity = '1';
}

function hideHmTooltip(){
  if(_hmTooltipEl){ _hmTooltipEl.remove(); _hmTooltipEl = null; }
}

function showHmTooltipMobile(evt, cell){
  // On touch, toggle tooltip
  if(window.matchMedia('(hover:none)').matches){
    if(_hmTooltipEl){ hideHmTooltip(); return; }
    showHmTooltip(evt, cell);
    _hmTooltipTimer = setTimeout(hideHmTooltip, 3000);
  }
}

/* ---- Absence Warnings (compact summary on page) ---- */
function renderAbsenceWarnings(){
  const semId = DB.getActiveSemesterId();
  const subs = DB.getSubjects().filter(s => s.semesterId === semId && !s.archived);
  const records = DB.getAttendance().filter(r => r.semesterId === semId);
  const wrap = document.getElementById('absenceWarnings');
  if(!wrap) return;

  if(!subs.length){
    wrap.innerHTML = `<div class="text-faint" style="font-size:.8rem">No subjects yet.</div>`;
    return;
  }

  const rows = subs.map(s => {
    const absences = records.filter(r => r.subjectId === s.id && r.status === 'Absent').length;
    const limit = getAbsenceLimitForSubject(s.id);
    const reached = absences >= limit;
    const nearLimit = !reached && absences >= limit - 1 && limit > 1;
    const pct = limit > 0 ? Math.min(Math.round(absences / limit * 100), 100) : (absences > 0 ? 100 : 0);
    const barColor = reached ? '#fb7185' : nearLimit ? '#fbbf24' : '#34d399';
    const consec = getCurrentConsecutiveAbsences(s.id, records);
    return { s, absences, limit, reached, nearLimit, pct, barColor, consec };
  });

  const remaining = n => Math.max(n.limit - n.absences, 0);

  wrap.innerHTML = rows.map(row => `
    <div class="att-limit-row ${row.reached ? 'att-absence-reached' : row.nearLimit ? 'att-absence-near' : ''}">
      <div class="att-limit-dot" style="background:${row.s.color}"></div>
      <span class="att-limit-code">${escapeAttHtml(row.s.code)}</span>
      <div class="att-limit-bar-track"><div class="att-limit-bar-fill" style="width:${row.pct}%;background:${row.barColor}"></div></div>
      <span class="att-limit-count" style="color:${row.barColor}">${row.absences}&thinsp;/&thinsp;${row.limit}</span>
      <span class="att-limit-remain">${remaining(row) > 0 ? remaining(row) + ' left' : row.absences > row.limit ? 'exceeded' : 'at limit'}</span>
    </div>`).join('');
}

/* ---- Absence Limit Modal ---- */
function openAbsenceLimitModal(){
  const semId = DB.getActiveSemesterId();
  const subs = DB.getSubjects().filter(s => s.semesterId === semId && !s.archived);
  const records = DB.getAttendance().filter(r => r.semesterId === semId);
  const body = document.getElementById('absenceLimitModalBody');

  if(!subs.length){
    body.innerHTML = `<div class="text-faint text-center py-4">No subjects for this semester.</div>`;
    new bootstrap.Modal(document.getElementById('absenceLimitModal')).show();
    return;
  }

  const rows = subs.map(s => {
    const absences = records.filter(r => r.subjectId === s.id && r.status === 'Absent').length;
    const limit = getAbsenceLimitForSubject(s.id);
    const remaining = Math.max(limit - absences, 0);
    const reached = absences >= limit;
    const nearLimit = !reached && absences >= limit - 1 && limit > 1;
    const pct = limit > 0 ? Math.min(Math.round(absences / limit * 100), 100) : (absences > 0 ? 100 : 0);
    const barColor = reached ? '#fb7185' : nearLimit ? '#fbbf24' : '#34d399';
    return { s, absences, limit, remaining, reached, nearLimit, pct, barColor };
  });

  body.innerHTML = `
    <div class="al-modal-intro">Set the maximum number of absences allowed per subject. A warning appears when you approach or reach the limit.</div>
    ${rows.map(({ s, absences, limit, remaining, reached, nearLimit, pct, barColor }) => `
      <div class="al-modal-row ${reached ? 'al-reached' : nearLimit ? 'al-near' : ''}">
        <div class="al-row-header">
          <div class="d-flex align-items-center gap-2 min-w-0">
            <div class="att-limit-dot" style="background:${s.color}"></div>
            <span class="al-code">${escapeAttHtml(s.code)}</span>
          </div>
          <div class="al-status-badge ${reached ? 'danger' : nearLimit ? 'warn' : 'ok'}">
            ${reached ? '<i class="bi bi-exclamation-triangle-fill"></i> Limit reached' :
              nearLimit ? `<i class="bi bi-exclamation-circle"></i> ${remaining} remaining` :
              `<i class="bi bi-check-circle"></i> ${remaining} remaining`}
          </div>
        </div>
        <div class="al-stats-row">
          <div class="al-stat"><div class="al-stat-val">${absences}</div><div class="al-stat-lbl">Absences</div></div>
          <div class="al-stat"><div class="al-stat-val">${limit}</div><div class="al-stat-lbl">Limit</div></div>
          <div class="al-stat"><div class="al-stat-val" style="color:${barColor}">${remaining}</div><div class="al-stat-lbl">Remaining</div></div>
        </div>
        <div class="progress mb-2" style="height:6px"><div class="progress-bar" style="width:${pct}%;background:${barColor};transition:width .4s ease"></div></div>
        <div class="d-flex align-items-center gap-2 mt-1">
          <label class="al-stat-lbl al-limit-label">Max absences:</label>
          <input type="number" min="0" max="99" step="1"
            class="form-control form-control-sm al-limit-input"
            value="${limit}"
            data-subject-id="${s.id}"
            oninput="previewAbsenceLimit(this)">
          <button class="btn btn-accent btn-sm al-save-btn" onclick="saveAbsenceLimitFromInput(this, '${s.id}', '${escapeAttJs(s.code)}')">Save</button>
        </div>
      </div>`).join('')}`;

  new bootstrap.Modal(document.getElementById('absenceLimitModal')).show();
}

function previewAbsenceLimit(input){
  // live feedback — nothing needed, save on button click
}

function saveAbsenceLimitFromInput(btn, subjectId, subjectCode){
  const row = btn.closest('.al-modal-row');
  const input = row.querySelector('.al-limit-input');
  const val = parseInt(input.value);
  if(isNaN(val) || val < 0){
    Toast.show('Enter a valid number (0 or more)', 'high', 'bi-exclamation-triangle');
    return;
  }
  setAbsenceLimitForSubject(subjectId, val);
  Toast.show(`Limit set to ${val} for ${subjectCode}`);
  const modal = bootstrap.Modal.getInstance(document.getElementById('absenceLimitModal'));
  if(modal) modal.hide();
  renderAbsenceWarnings();
  renderSubjectBreakdown();
}

/* ---- Per-subject Breakdown ---- */
function renderSubjectBreakdown(){
  const semId = DB.getActiveSemesterId();
  const subs = DB.getSubjects().filter(s => s.semesterId === semId && !s.archived);
  const records = DB.getAttendance().filter(r => r.semesterId === semId);
  const wrap = document.getElementById('subjectBreakdown');
  if(!wrap) return;

  if(!subs.length){
    wrap.innerHTML = `<div class="text-faint text-center py-3" style="font-size:.82rem">No subjects yet.</div>`;
    return;
  }

  const subData = subs.map(s => {
    const recs = records.filter(r => r.subjectId === s.id);
    const present   = recs.filter(r => r.status === 'Present').length;
    const presentOnline = recs.filter(r => r.status === 'Present' && r.online).length;
    const late      = recs.filter(r => r.status === 'Late').length;
    const excused   = recs.filter(r => r.status === 'Excused').length;
    const absent    = recs.filter(r => r.status === 'Absent').length;
    const noClass   = recs.filter(r => r.status === 'No Classes').length;
    const relevant  = present + late + excused + absent;
    const rate = relevant > 0 ? Math.round((present + late + excused) / relevant * 100) : null;
    const limit = getAbsenceLimitForSubject(s.id);
    const limitPct = limit > 0 ? Math.min(Math.round(absent / limit * 100), 100) : (absent > 0 ? 100 : 0);
    const limitColor = absent >= limit ? '#fb7185' : absent >= limit - 1 && limit > 1 ? '#fbbf24' : '#34d399';
    const consec = getCurrentConsecutiveAbsences(s.id, records);
    const rateLabel = rate === null ? '' : rate >= 90 ? 'Excellent' : rate >= 80 ? 'Good' : rate >= 75 ? 'Fair' : 'At Risk';
    return { s, present, presentOnline, late, excused, absent, noClass, relevant, rate, limit, limitPct, limitColor, consec, rateLabel };
  }).filter(d => d.relevant > 0 || d.noClass > 0);

  if(!subData.length){
    wrap.innerHTML = `<div class="text-faint text-center py-3" style="font-size:.82rem">Log attendance to see subject breakdown.</div>`;
    return;
  }

  wrap.innerHTML = subData.map(({ s, present, presentOnline, late, excused, absent, noClass, rate, limit, limitPct, limitColor, consec, rateLabel }) => {
    const rateColor = rate === null ? 'var(--text-faint)' : rate >= 80 ? '#34d399' : rate >= 75 ? '#fbbf24' : '#fb7185';
    const remaining = Math.max(limit - absent, 0);
    return `
    <div class="att-subject-breakdown-card">
      <div class="att-breakdown-header">
        <div class="d-flex align-items-center gap-2 min-w-0">
          <div style="width:8px;height:8px;border-radius:50%;background:${s.color};flex-shrink:0"></div>
          <span class="att-breakdown-code">${escapeAttHtml(s.code)}</span>
          ${s.desc ? `<span class="text-faint att-breakdown-desc">${escapeAttHtml(s.desc)}</span>` : ''}
        </div>
        <div class="d-flex align-items-center gap-2 flex-shrink-0">
          ${rateLabel ? `<span class="att-rate-label" style="color:${rateColor}">${rateLabel}</span>` : ''}
          <span class="att-breakdown-rate" style="color:${rateColor}">${rate === null ? '—' : rate + '%'}</span>
        </div>
      </div>
      ${rate !== null ? `<div class="progress mb-2" style="height:4px"><div class="progress-bar" style="width:${rate}%;background:${rateColor};transition:width .4s ease"></div></div>` : ''}
      <div class="att-breakdown-stats">
        <div class="att-bd-stat present">
          <div class="att-bd-val">${present}</div>
          <div class="att-bd-lbl">Present${presentOnline > 0 ? `<span class="att-online-sub">(${presentOnline}↑)</span>` : ''}</div>
        </div>
        <div class="att-bd-stat late"><div class="att-bd-val">${late}</div><div class="att-bd-lbl">Late</div></div>
        <div class="att-bd-stat excused"><div class="att-bd-val">${excused}</div><div class="att-bd-lbl">Excused</div></div>
        <div class="att-bd-stat absent"><div class="att-bd-val">${absent}</div><div class="att-bd-lbl">Absent</div></div>
        <div class="att-bd-stat noclasses"><div class="att-bd-val">${noClass}</div><div class="att-bd-lbl">No Class</div></div>
      </div>
      <div class="att-bd-limit-row">
        <div class="att-bd-limit-info">
          <span class="att-bd-limit-label">Absences:</span>
          <span class="att-bd-limit-val" style="color:${limitColor}">${absent} / ${limit}</span>
          <span class="att-bd-limit-remain text-faint">${remaining > 0 ? remaining + ' remaining' : absent > limit ? 'exceeded' : 'at limit'}</span>
        </div>
        <div class="progress att-bd-limit-bar"><div class="progress-bar" style="width:${limitPct}%;background:${limitColor};transition:width .4s ease"></div></div>
      </div>
      ${consec >= 3 ? `<div class="att-bd-consec-warn"><i class="bi bi-exclamation-triangle-fill"></i> ${consec} consecutive absences</div>` : ''}
    </div>`;
  }).join('');
}

/* ---- Attendance Log — table layout, paginated ---- */
const ATT_LOG_PAGE_SIZE = 10;

function renderLog(showAll){
  const semId = DB.getActiveSemesterId();
  const subs = DB.getSubjects();
  const records = [...DB.getAttendance().filter(r => r.semesterId === semId)]
    .sort((a, b) => b.date.localeCompare(a.date));
  const wrap = document.getElementById('attendanceLog');

  if(!records.length){
    wrap.innerHTML = `<div class="text-faint text-center py-5 att-log-empty"><i class="bi bi-calendar3"></i><div>No attendance logged yet</div></div>`;
    const cl = document.getElementById('attLogCountLabel');
    if(cl) cl.textContent = '';
    return;
  }

  const total = records.length;
  const displayCount = showAll ? total : Math.min(ATT_LOG_PAGE_SIZE, total);
  const displayRecords = records.slice(0, displayCount);
  const hasMore = total > ATT_LOG_PAGE_SIZE && !showAll;

  const countLabelEl = document.getElementById('attLogCountLabel');
  if(countLabelEl){
    countLabelEl.textContent = total > ATT_LOG_PAGE_SIZE ? `Showing ${displayCount} of ${total}` : '';
  }

  function buildRow(r) {
    const s = subs.find(x => x.id === r.subjectId);
    const dotColor = s ? s.color : '#888';
    const statusClass = r.status === 'No Classes' ? 'noclasses' : r.status.toLowerCase().replace(/\s+/g, '');
    const statusDisplay = r.status === 'No Classes' ? 'No Class' : r.status;
    const onlinePill = r.online ? `<span class="att-online-chip">Online</span>` : '';
    const hasNotes = r.notes && r.notes.trim().length > 0;
    const dateFormatted = formatShortDate(r.date);

    return `<tr class="att-tbl-row">
      <td class="att-tbl-dot"><span class="att-log-dot-circle" style="background:${dotColor}"></span></td>
      <td class="att-tbl-date">${dateFormatted}</td>
      <td class="att-tbl-course" title="${s ? escapeAttHtml(s.code) : 'Unknown'}">${s ? escapeAttHtml(s.code) : '—'}</td>
      <td class="att-tbl-status"><span class="att-status-badge ${statusClass}">${statusDisplay}${onlinePill}</span></td>
      <td class="att-tbl-actions">
        ${hasNotes
          ? `<button class="att-action-btn att-notes-btn" onclick="showAttNote(event,'${escapeAttJs(r.notes)}','${r.date}','${s ? escapeAttJs(s.code) : 'Unknown'}')" title="View note" aria-label="View note"><i class="bi bi-chat-left-text-fill"></i></button>`
          : ''}
        <button class="att-action-btn att-delete-btn" onclick="deleteAttendance('${r.id}')" title="Delete record" aria-label="Delete attendance record"><i class="bi bi-trash3"></i></button>
      </td>
    </tr>`;
  }

  const showMoreHtml = hasMore
    ? `<div class="att-log-show-more"><button class="btn btn-ghost btn-sm att-log-show-more-btn" onclick="renderLog(true)"><i class="bi bi-chevron-down me-1"></i>Show More <span class="att-log-more-count">(${total - displayCount} more)</span></button></div>`
    : '';

  wrap.innerHTML = `<table class="att-log-table" role="grid">
    <thead>
      <tr class="att-tbl-head">
        <th class="att-tbl-dot" scope="col"></th>
        <th class="att-tbl-date" scope="col">Date</th>
        <th class="att-tbl-course" scope="col">Course</th>
        <th class="att-tbl-status" scope="col">Status</th>
        <th class="att-tbl-actions" scope="col">Actions</th>
      </tr>
    </thead>
    <tbody>
      ${displayRecords.map(buildRow).join('')}
    </tbody>
  </table>` + showMoreHtml;
}

function escapeAttJs(s){
  return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '\\n');
}

/* ---- Notes Modal ---- */
function showAttNote(event, notes, date, subjectCode){
  event.stopPropagation();
  document.getElementById('attNoteContent').textContent = notes;
  document.getElementById('attNoteMeta').textContent = `${date} · ${subjectCode}`;
  new bootstrap.Modal(document.getElementById('attNotesModal')).show();
}

/* ---- Delete ---- */
function deleteAttendance(id){
  confirmAction({
    title: 'Remove attendance record?',
    message: 'This log entry will be permanently removed.',
    confirmLabel: 'Remove',
    danger: true,
    icon: 'bi-trash-fill',
    onConfirm(){
      DB.saveAttendance(DB.getAttendance().filter(r => r.id !== id));
      Toast.show('Record removed');
      renderAttendanceAll();
    }
  });
}

/* ---- Mark All Present Today ---- */
let _markAllPendingSubjects = [];

function markAllPresentToday(){
  const semId = DB.getActiveSemesterId();
  const today = todayKey();
  const todayDate = new Date(today + 'T00:00:00');
  const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][todayDate.getDay()];

  const subs = DB.getSubjects().filter(s => s.semesterId === semId && !s.archived);
  const records = DB.getAttendance().filter(r => r.semesterId === semId);

  // Filter: subjects with class today (based on their days array)
  const todaySubjects = subs.filter(s => {
    if(!s.days || !s.days.length) return false;
    return s.days.some(d => d === dow || d.startsWith(dow.slice(0,3)));
  });

  // If no schedule info, include all subjects (fallback)
  const scheduledSubs = todaySubjects.length > 0 ? todaySubjects : subs;

  const body = document.getElementById('markAllPresentBody');
  const confirmBtn = document.getElementById('markAllConfirmBtn');

  if(!scheduledSubs.length){
    if(body) body.innerHTML = `<div class="text-faint text-center py-3"><i class="bi bi-calendar-x me-2"></i>No classes scheduled today.</div>`;
    if(confirmBtn) confirmBtn.style.display = 'none';
    new bootstrap.Modal(document.getElementById('markAllPresentModal')).show();
    return;
  }

  // Check which ones already have records
  const toCreate = [];
  const alreadyPresent = [];
  const existingOther = [];

  for(const s of scheduledSubs){
    const existing = records.find(r => r.subjectId === s.id && r.date === today);
    if(!existing){
      toCreate.push(s);
    } else if(existing.status === 'Present'){
      alreadyPresent.push(s);
    } else {
      existingOther.push({ s, existing });
    }
  }

  _markAllPendingSubjects = toCreate;

  let html = '';
  if(toCreate.length){
    html += `<div class="att-map-section"><div class="att-map-section-title">${toCreate.length} class${toCreate.length!==1?'es':''} will be marked Present:</div>`;
    html += toCreate.map(s => `<div class="att-map-sub-row"><span class="att-map-dot" style="background:${s.color}"></span>${escapeAttHtml(s.code)}</div>`).join('');
    html += `</div>`;
  }
  if(alreadyPresent.length){
    html += `<div class="att-map-section att-map-skip"><div class="att-map-section-title text-faint">Already marked Present (skipped):</div>`;
    html += alreadyPresent.map(s => `<div class="att-map-sub-row text-faint"><span class="att-map-dot" style="background:${s.color}"></span>${escapeAttHtml(s.code)}</div>`).join('');
    html += `</div>`;
  }
  if(existingOther.length){
    html += `<div class="att-map-section att-map-warn"><div class="att-map-section-title"><i class="bi bi-exclamation-circle me-1"></i>Existing records kept unchanged:</div>`;
    html += existingOther.map(({s, existing}) => `<div class="att-map-sub-row"><span class="att-map-dot" style="background:${s.color}"></span>${escapeAttHtml(s.code)} <span class="text-faint">(${existing.status})</span></div>`).join('');
    html += `</div>`;
  }

  if(!toCreate.length){
    html = `<div class="text-faint text-center py-2"><i class="bi bi-check2-all me-2"></i>All scheduled subjects already have records today.</div>` + html;
    if(confirmBtn) confirmBtn.style.display = 'none';
  } else {
    if(confirmBtn) confirmBtn.style.display = '';
  }

  if(body) body.innerHTML = html;
  new bootstrap.Modal(document.getElementById('markAllPresentModal')).show();
}

function confirmMarkAllPresent(){
  if(!_markAllPendingSubjects.length) return;
  const semId = DB.getActiveSemesterId();
  const today = todayKey();
  const records = DB.getAttendance();
  let added = 0;
  for(const s of _markAllPendingSubjects){
    const already = records.find(r => r.subjectId === s.id && r.date === today);
    if(!already){
      records.push({ id: DB.uid(), subjectId: s.id, date: today, status: 'Present', online: false, notes: '', semesterId: semId });
      added++;
    }
  }
  DB.saveAttendance(records);
  _markAllPendingSubjects = [];
  const modal = bootstrap.Modal.getInstance(document.getElementById('markAllPresentModal'));
  if(modal) modal.hide();
  Toast.show(`Marked ${added} class${added!==1?'es':''} as Present`);
  renderAttendanceAll();
}

/* ---- Export CSV ---- */
function exportAttendanceCSV(){
  const semId = DB.getActiveSemesterId();
  const sem = DB.getActiveSemester();
  const records = DB.getAttendance().filter(r => r.semesterId === semId)
    .sort((a,b) => a.date.localeCompare(b.date));
  const subs = DB.getSubjects();

  if(!records.length){
    Toast.show('No attendance records to export.', 'high', 'bi-exclamation-circle');
    return;
  }

  const esc = v => {
    const s = String(v == null ? '' : v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? '"' + s.replace(/"/g, '""') + '"'
      : s;
  };

  const rows = [['Date','Subject','Status','Mode','Notes']];
  for(const r of records){
    const s = subs.find(x => x.id === r.subjectId);
    rows.push([r.date, s ? s.code : 'Unknown', r.status, r.online ? 'Online' : 'Offline', r.notes || '']);
  }

  const csv = rows.map(row => row.map(esc).join(',')).join('\r\n');
  const semName = sem ? `${sem.schoolYear}-${sem.name.replace(/\s+/g,'-')}` : 'Attendance';
  const filename = `Student-Planner-Attendance-${semName}.csv`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  Toast.show('CSV exported');
}

/* ---- Export PDF ---- */
function exportAttendancePDF(){
  const semId = DB.getActiveSemesterId();
  const sem = DB.getActiveSemester();
  const records = DB.getAttendance().filter(r => r.semesterId === semId)
    .sort((a,b) => a.date.localeCompare(b.date));
  const subs = DB.getSubjects().filter(s => s.semesterId === semId && !s.archived);

  if(!records.length){
    Toast.show('No attendance records to export.', 'high', 'bi-exclamation-circle');
    return;
  }

  // Calculate overall stats
  const relevant = records.filter(r => r.status !== 'No Classes');
  const presentAll = relevant.filter(r => r.status === 'Present' || r.status === 'Late' || r.status === 'Excused').length;
  const overallRate = relevant.length ? Math.round(presentAll / relevant.length * 100) : 0;

  const semLabel = sem ? `${sem.name} · ${sem.schoolYear}` : 'Current Semester';
  const settings = DB.getSettings();
  const studentName = settings.name || '';

  // Build per-subject summary
  const subRows = subs.map(s => {
    const recs = records.filter(r => r.subjectId === s.id);
    const p = recs.filter(r => r.status === 'Present').length;
    const l = recs.filter(r => r.status === 'Late').length;
    const e = recs.filter(r => r.status === 'Excused').length;
    const a = recs.filter(r => r.status === 'Absent').length;
    const nc = recs.filter(r => r.status === 'No Classes').length;
    const rel = p + l + e + a;
    const rate = rel > 0 ? Math.round((p+l+e)/rel*100) : null;
    return { code: s.code, p, l, e, a, nc, rate };
  }).filter(x => (x.p+x.l+x.e+x.a+x.nc) > 0);

  const statusColor = s => ({
    'Present':'#22c55e','Late':'#f59e0b','Excused':'#60a5fa','Absent':'#f43f5e','No Classes':'#8b5cf6'
  }[s] || '#888');

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Attendance Report</title>
<style>
  body{font-family:Arial,sans-serif;font-size:11pt;color:#111;margin:0;padding:20mm}
  h1{font-size:16pt;margin-bottom:2pt}
  h2{font-size:12pt;margin:14pt 0 6pt;border-bottom:1px solid #ddd;padding-bottom:4pt}
  .sub{font-size:10pt;color:#555}
  .stat-row{display:flex;gap:20pt;margin:8pt 0}
  .stat-box{text-align:center;border:1px solid #ddd;border-radius:6pt;padding:8pt 14pt}
  .stat-box .val{font-size:18pt;font-weight:bold}
  .stat-box .lbl{font-size:8pt;color:#666;text-transform:uppercase}
  table{width:100%;border-collapse:collapse;font-size:9pt}
  th{background:#f4f4f4;padding:5pt 7pt;text-align:left;border:1px solid #ddd;font-weight:600}
  td{padding:4pt 7pt;border:1px solid #ddd}
  .rate{font-weight:bold}
  .badge{display:inline-block;padding:1pt 5pt;border-radius:3pt;font-size:8pt;font-weight:bold;color:#fff}
  .pg{page-break-before:always}
  @media print{body{padding:10mm}}
</style></head><body>
<h1>Student Planner — Attendance Report</h1>
<div class="sub">${semLabel}${studentName ? ' · ' + studentName : ''}</div>
<h2>Overall Attendance</h2>
<div class="stat-row">
  <div class="stat-box"><div class="val">${overallRate}%</div><div class="lbl">Overall Rate</div></div>
  <div class="stat-box"><div class="val">${relevant.filter(r=>r.status==='Present').length}</div><div class="lbl">Present</div></div>
  <div class="stat-box"><div class="val">${relevant.filter(r=>r.status==='Late').length}</div><div class="lbl">Late</div></div>
  <div class="stat-box"><div class="val">${relevant.filter(r=>r.status==='Excused').length}</div><div class="lbl">Excused</div></div>
  <div class="stat-box"><div class="val">${relevant.filter(r=>r.status==='Absent').length}</div><div class="lbl">Absent</div></div>
  <div class="stat-box"><div class="val">${records.filter(r=>r.status==='No Classes').length}</div><div class="lbl">No Class</div></div>
</div>
${subRows.length ? `<h2>Subject Summary</h2>
<table><thead><tr><th>Subject</th><th>Present</th><th>Late</th><th>Excused</th><th>Absent</th><th>No Class</th><th>Rate</th></tr></thead>
<tbody>${subRows.map(x=>`<tr>
  <td>${x.code}</td>
  <td>${x.p}</td><td>${x.l}</td><td>${x.e}</td><td>${x.a}</td><td>${x.nc}</td>
  <td class="rate">${x.rate!==null?x.rate+'%':'—'}</td>
</tr>`).join('')}</tbody></table>` : ''}
<h2 class="${subRows.length?'pg':''}">Detailed Log</h2>
<table><thead><tr><th>Date</th><th>Subject</th><th>Status</th><th>Mode</th><th>Notes</th></tr></thead>
<tbody>${records.map(r=>{
  const s = subs.find(x=>x.id===r.subjectId);
  return `<tr>
    <td>${r.date}</td>
    <td>${s?s.code:'?'}</td>
    <td><span class="badge" style="background:${statusColor(r.status)}">${r.status}</span></td>
    <td>${r.online?'Online':'Offline'}</td>
    <td>${r.notes||''}</td>
  </tr>`;
}).join('')}</tbody></table>
<div style="margin-top:16pt;font-size:8pt;color:#999">Generated ${new Date().toLocaleString()} · Student Planner</div>
</body></html>`;

  const win = window.open('', '_blank');
  if(!win){ Toast.show('Allow popups to export PDF'); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
  Toast.show('PDF report opened for printing');
}

/* ---- Compat alias ---- */
function renderRanking(){ renderSubjectBreakdown(); }
