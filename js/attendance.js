/* ============================================================
   ATTENDANCE.JS — Enhanced v3
   Fixes:
   1. Online pill redesign (matches other controls)
   2. Notes button → opens modal, independent from delete
   3. Absence limits → dedicated modal (compact summary on page)
   4. Log card layout: breathing room, stacked on mobile
   ============================================================ */

const DEFAULT_ABSENCE_LIMIT = 3;

/* ---- Helpers ---- */
function escapeAttHtml(s){
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

function todayKey(){
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth()+1).padStart(2,'0') + '-' +
    String(d.getDate()).padStart(2,'0');
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

/* ---- Init ---- */
function initAttendance(){
  const semId = DB.getActiveSemesterId();
  const subs = DB.getSubjects().filter(s => s.semesterId === semId && !s.archived);
  const subSel = document.getElementById('attSubject');
  subSel.innerHTML = subs.length
    ? subs.map(s => `<option value="${s.id}">${escapeAttHtml(s.code)}</option>`).join('')
    : '<option value="">No subjects</option>';
  document.getElementById('attDate').value = todayKey();
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
  Toast.show('Attendance logged');
  renderAttendanceAll();
}

/* ---- Render all ---- */
function renderAttendanceAll(){
  renderOverallRate();
  renderStatistics();
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
  document.getElementById('aRateBar').style.width = (rate || 0) + '%';
}

/* ---- Statistics ---- */
function renderStatistics(){
  const semId = DB.getActiveSemesterId();
  const records = DB.getAttendance().filter(r => r.semesterId === semId);
  const wrap = document.getElementById('attendanceStats');

  if(!records.length){
    wrap.innerHTML = `<div class="text-faint text-center py-3" style="font-size:.82rem;grid-column:1/-1">Log attendance to see statistics</div>`;
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
    const pct = limit > 0 ? Math.min(Math.round(absences / limit * 100), 100) : 0;
    const barColor = reached ? '#fb7185' : nearLimit ? '#fbbf24' : 'rgb(var(--accent))';
    return { s, absences, limit, reached, nearLimit, pct, barColor };
  });

  wrap.innerHTML = rows.map(({ s, absences, limit, reached, nearLimit, pct, barColor }) => `
    <div class="att-limit-summary-row ${reached ? 'att-absence-reached' : nearLimit ? 'att-absence-near' : ''}">
      <div class="att-limit-summary-left">
        <div class="att-limit-dot" style="background:${s.color}"></div>
        <span class="att-limit-code">${escapeAttHtml(s.code)}</span>
        ${reached ? `<span class="att-limit-badge danger"><i class="bi bi-exclamation-triangle-fill"></i> Reached</span>` :
          nearLimit ? `<span class="att-limit-badge warn"><i class="bi bi-exclamation-circle"></i> Near</span>` : ''}
      </div>
      <div class="att-limit-summary-right">
        <div class="att-limit-bar-wrap">
          <div class="progress att-limit-bar"><div class="progress-bar" style="width:${pct}%;background:${barColor}"></div></div>
        </div>
        <span class="att-limit-count" style="color:${barColor}">${absences} / ${limit}</span>
      </div>
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
    const pct = limit > 0 ? Math.min(Math.round(absences / limit * 100), 100) : 0;
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
        <div class="progress mb-2" style="height:6px"><div class="progress-bar" style="width:${pct}%;background:${barColor}"></div></div>
        <div class="d-flex align-items-center gap-2 mt-1">
          <label class="al-stat-lbl al-limit-label">Max absences:</label>
          <input type="number" min="0" max="99" step="1"
            class="form-control form-control-sm al-limit-input"
            value="${limit}"
            data-subject-id="${s.id}"
            oninput="previewAbsenceLimit(this)">
          <button class="btn btn-accent btn-sm al-save-btn" onclick="saveAbsenceLimitFromInput(this, '${s.id}', '${escapeAttHtml(s.code)}')">Save</button>
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
  // re-render the modal body to reflect new values
  const modal = bootstrap.Modal.getInstance(document.getElementById('absenceLimitModal'));
  if(modal) modal.hide();
  renderAbsenceWarnings();
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
    return { s, present, presentOnline, late, excused, absent, noClass, relevant, rate };
  }).filter(d => d.relevant > 0 || d.noClass > 0);

  if(!subData.length){
    wrap.innerHTML = `<div class="text-faint text-center py-3" style="font-size:.82rem">Log attendance to see subject breakdown.</div>`;
    return;
  }

  wrap.innerHTML = subData.map(({ s, present, presentOnline, late, excused, absent, noClass, rate }) => `
    <div class="att-subject-breakdown-card">
      <div class="att-breakdown-header">
        <div class="d-flex align-items-center gap-2 min-w-0">
          <div style="width:8px;height:8px;border-radius:50%;background:${s.color};flex-shrink:0"></div>
          <span class="att-breakdown-code">${escapeAttHtml(s.code)}</span>
          ${s.desc ? `<span class="text-faint" style="font-size:.7rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeAttHtml(s.desc)}</span>` : ''}
        </div>
        <span class="att-breakdown-rate" style="color:${rate === null ? 'var(--text-faint)' : rate >= 75 ? '#34d399' : '#fb7185'}">${rate === null ? '—' : rate + '%'}</span>
      </div>
      ${rate !== null ? `<div class="progress mb-2" style="height:4px"><div class="progress-bar" style="width:${rate}%;background:${rate >= 75 ? '#34d399' : '#fb7185'}"></div></div>` : ''}
      <div class="att-breakdown-stats">
        <div class="att-bd-stat present">
          <div class="att-bd-val">${present}</div>
          <div class="att-bd-lbl">Present${presentOnline > 0 ? `<span class="att-online-sub">(${presentOnline} online)</span>` : ''}</div>
        </div>
        <div class="att-bd-stat late"><div class="att-bd-val">${late}</div><div class="att-bd-lbl">Late</div></div>
        <div class="att-bd-stat excused"><div class="att-bd-val">${excused}</div><div class="att-bd-lbl">Excused</div></div>
        <div class="att-bd-stat absent"><div class="att-bd-val">${absent}</div><div class="att-bd-lbl">Absent</div></div>
        <div class="att-bd-stat noclasses"><div class="att-bd-val">${noClass}</div><div class="att-bd-lbl">No Class</div></div>
      </div>
    </div>`).join('');
}

/* ---- Attendance Log — single horizontal row per record ---- */
function renderLog(){
  const semId = DB.getActiveSemesterId();
  const subs = DB.getSubjects();
  const records = [...DB.getAttendance().filter(r => r.semesterId === semId)]
    .sort((a, b) => b.date.localeCompare(a.date));
  const wrap = document.getElementById('attendanceLog');

  if(!records.length){
    wrap.innerHTML = `<div class="text-faint text-center py-5 att-log-empty"><i class="bi bi-calendar3"></i><div>No attendance logged yet</div></div>`;
    return;
  }

  // header row
  const header = `<div class="att-log-row att-log-header-row">
    <span class="att-log-col-dot"></span>
    <span class="att-log-col-date">Date</span>
    <span class="att-log-col-subject">Subject</span>
    <span class="att-log-col-status">Status</span>
    <span class="att-log-col-actions"></span>
  </div>`;

  const rows = records.map(r => {
    const s = subs.find(x => x.id === r.subjectId);
    const dotColor = s ? s.color : '#888';
    const statusClass = r.status === 'No Classes' ? 'noclasses' : r.status.toLowerCase().replace(/\s+/g, '');
    const statusDisplay = r.status === 'No Classes' ? 'No Class' : r.status;
    const onlinePill = r.online ? `<span class="att-online-chip">Online</span>` : '';
    const hasNotes = r.notes && r.notes.trim().length > 0;

    return `<div class="att-log-row">
      <span class="att-log-col-dot"><span class="att-log-dot-circle" style="background:${dotColor}"></span></span>
      <span class="att-log-col-date">${r.date}</span>
      <span class="att-log-col-subject" title="${s ? escapeAttHtml(s.code) : 'Unknown'}">${s ? escapeAttHtml(s.code) : '—'}</span>
      <span class="att-log-col-status">
        <span class="att-status-badge ${statusClass}">${statusDisplay}${onlinePill}</span>
      </span>
      <span class="att-log-col-actions">
        ${hasNotes
          ? `<button class="att-action-btn att-notes-btn" onclick="showAttNote(event,'${escapeAttJs(r.notes)}','${r.date}','${s ? escapeAttJs(s.code) : 'Unknown'}')" title="View note"><i class="bi bi-chat-left-text-fill"></i></button>`
          : `<span class="att-action-placeholder"></span>`}
        <button class="att-action-btn att-delete-btn" onclick="deleteAttendance('${r.id}')" title="Delete"><i class="bi bi-trash3"></i></button>
      </span>
    </div>`;
  }).join('');

  wrap.innerHTML = header + rows;
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

/* ---- Compat alias ---- */
function renderRanking(){ renderSubjectBreakdown(); }
