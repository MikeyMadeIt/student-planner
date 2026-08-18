/* ============================================================
   CALENDAR.JS — Advanced Calendar v3
   ============================================================ */

/* ── State ─────────────────────────────────────────────────── */
let calMode = 'month';
let calDate = new Date();
let calSelectedDate = null; // currently selected date string (YYYY-MM-DD)

// Filter state
let calFilters = { classes: true, tasks: true, events: true, univ: true };

// Drag state
let dragState = null;

/* ── Constants ─────────────────────────────────────────────── */
const CATEGORY_COLORS = {
  Homework: '#FBBF24', Project: '#4F8CFF', Quiz: '#22D3EE',
  Exam: '#FB7185', Personal: '#34D399', Organization: '#A78BFA'
};
const UNIV_COLORS = ['#F59E0B','#7C6CF6','#4F8CFF','#FB7185','#34D399','#22D3EE','#F472B6','#A78BFA'];
const EVENT_CATEGORIES = ['Study Session','Organization Meeting','Personal Appointment','Project Meeting','Exam Review','Event','Other'];
const EVENT_CAT_COLORS = {
  'Study Session':         '#34D399',
  'Organization Meeting':  '#A78BFA',
  'Personal Appointment':  '#4F8CFF',
  'Project Meeting':       '#7C6CF6',
  'Exam Review':           '#FB7185',
  'Event':                 '#FBBF24',
  'Other':                 '#8a90a6'
};

// Stable subject color cache (persisted per session)
const _subjectColorCache = {};

let univModalMode = 'range';
let univModalColor = UNIV_COLORS[0];
let univEditingId = null;
let eventEditingId = null;
let taskEditingId = null;

/* ── Init ──────────────────────────────────────────────────── */
function initCalendar() {
  // Mobile: default to week view
  if (window.innerWidth < 768) {
    calMode = 'week';
    _updateViewBtns();
  }
  calSelectedDate = todayKey();
  renderCalendar();
  renderAgenda(calSelectedDate);
  updateFilterUI();
  updateFilterCount();
  // Set jump-to-date input to today
  const ji = document.getElementById('jumpDateInput');
  if (ji) ji.value = todayKey();
}

/* ── Subject Colors (stable) ───────────────────────────────── */
function getSubjectColor(subjectObj) {
  if (!subjectObj) return '#7C6CF6';
  if (subjectObj.color) return subjectObj.color;
  if (_subjectColorCache[subjectObj.id]) return _subjectColorCache[subjectObj.id];
  // Assign from palette deterministically
  const palette = DB.colors || ['#7C6CF6','#4F8CFF','#34D399','#FB7185','#FBBF24'];
  const idx = Object.keys(_subjectColorCache).length % palette.length;
  _subjectColorCache[subjectObj.id] = palette[idx];
  return _subjectColorCache[subjectObj.id];
}

/* ── Unified Event Collection ──────────────────────────────── */
function allEventsForDate(dateStr) {
  const semId = DB.getActiveSemesterId();
  const events = [];
  const dayName = DAY_NAMES[new Date(dateStr + 'T00:00').getDay()];

  if (calFilters.classes) {
    DB.getSubjects().filter(s => s.semesterId === semId && !s.archived && s.days && s.days.includes(dayName)).forEach(s => {
      events.push({
        type: 'class', id: s.id, title: s.code,
        color: getSubjectColor(s),
        time: s.start, endTime: s.end,
        sub: s.desc || '', room: s.room || '',
        draggable: false, // recurring class — not safe to drag
        _obj: s
      });
    });
  }

  if (calFilters.tasks) {
    DB.getTasks().filter(t => t.semesterId === semId && t.dueDate === dateStr).forEach(t => {
      events.push({
        type: 'task', id: t.id, title: t.title,
        color: CATEGORY_COLORS[t.category] || '#8a90a6',
        time: t.dueTime || '', endTime: '',
        sub: t.category || '', room: '',
        draggable: true,
        _obj: t
      });
    });
  }

  if (calFilters.events) {
    DB.getCalendarEvents().filter(e => e.semesterId === semId && e.date === dateStr).forEach(e => {
      events.push({
        type: 'event', id: e.id, title: e.title,
        color: EVENT_CAT_COLORS[e.category] || '#34D399',
        time: e.startTime || '', endTime: e.endTime || '',
        sub: e.category || '', room: '',
        draggable: true,
        _obj: e
      });
    });
  }

  if (calFilters.univ) {
    DB.getUniversityEvents().filter(u => u.dates && u.dates.includes(dateStr)).forEach(u => {
      events.push({
        type: 'univ', id: u.id, title: u.title,
        color: u.color || '#4F8CFF',
        time: '', endTime: '',
        sub: 'University', room: '',
        draggable: false,
        _obj: u
      });
    });
  }

  return events.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
}

/* ── View Switching ────────────────────────────────────────── */
function setCalMode(m) {
  calMode = m;
  _updateViewBtns();
  renderCalendar();
  if (calSelectedDate) renderAgenda(calSelectedDate);
  else renderAgenda(todayKey());
}

function _updateViewBtns() {
  document.querySelectorAll('.cal-view-btn').forEach(b => {
    const active = b.dataset.mode === calMode;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function navCal(dir) {
  if (calMode === 'month') calDate.setMonth(calDate.getMonth() + dir);
  else if (calMode === 'week') calDate.setDate(calDate.getDate() + dir * 7);
  else calDate.setDate(calDate.getDate() + dir);
  renderCalendar();
}

function goToToday() {
  calDate = new Date();
  calSelectedDate = todayKey();
  renderCalendar();
  renderAgenda(calSelectedDate);
}

/* ── Jump to Date ──────────────────────────────────────────── */
function doJumpDate() {
  const inp = document.getElementById('jumpDateInput');
  if (!inp || !inp.value) return;
  const d = new Date(inp.value + 'T00:00');
  if (isNaN(d.getTime())) {
    Toast.show('Invalid date', 'high', 'bi-exclamation-triangle');
    return;
  }
  calDate = d;
  calSelectedDate = inp.value;
  renderCalendar();
  renderAgenda(calSelectedDate);
  // Close dropdown
  const dd = document.getElementById('jumpDateBtn');
  if (dd) {
    const bsdd = bootstrap.Dropdown.getInstance(dd);
    if (bsdd) bsdd.hide();
  }
}

/* ── Filter Toggles ────────────────────────────────────────── */
function toggleFilter(f) {
  calFilters[f] = !calFilters[f];
  updateFilterUI();
  updateFilterCount();
  renderCalendar();
  if (calSelectedDate) renderAgenda(calSelectedDate);
}

function updateFilterUI() {
  ['classes','tasks','events','univ'].forEach(f => {
    const el = document.getElementById('filter-' + f);
    if (el) el.classList.toggle('active', calFilters[f]);
  });
}

function updateFilterCount() {
  const active = Object.values(calFilters).filter(Boolean).length;
  const el = document.getElementById('filterActiveCount');
  if (!el) return;
  if (active < 4) {
    el.textContent = active;
    el.style.display = 'flex'; // position:absolute badge above button
  } else {
    el.style.display = 'none';
  }
}

/* ── Render Calendar ───────────────────────────────────────── */
function renderCalendar() {
  const body = document.getElementById('calBody');
  if (!body) return;
  if (calMode === 'month') body.innerHTML = monthHtml();
  else if (calMode === 'week') body.innerHTML = weekTimetableHtml();
  else body.innerHTML = dayHtml();
  // Re-attach drag events after render
  attachDragListeners();
}

/* ════════════════════════════════════════════════════════════
   MONTH VIEW
   ════════════════════════════════════════════════════════════ */
function monthHtml() {
  const y = calDate.getFullYear(), m = calDate.getMonth();
  document.getElementById('calTitle').textContent = calDate.toLocaleDateString([], { month: 'long', year: 'numeric' });
  const first = new Date(y, m, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const daysInPrevMonth = new Date(y, m, 0).getDate();

  let html = `<div class="uc-grid mb-1">${DAY_NAMES.map(d => `<div class="text-center text-faint cal-dow-label" aria-hidden="true">${d}</div>`).join('')}</div><div class="uc-grid">`;
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  for (let i = 0; i < totalCells; i++) {
    let dayNum, monthOffset = 0, other = false;
    if (i < startOffset) { dayNum = daysInPrevMonth - startOffset + i + 1; monthOffset = -1; other = true; }
    else if (i >= startOffset + daysInMonth) { dayNum = i - startOffset - daysInMonth + 1; monthOffset = 1; other = true; }
    else dayNum = i - startOffset + 1;
    const d = new Date(y, m + monthOffset, dayNum);
    const dateStr = ymdLocal(d);
    const isToday = dateStr === todayKey();
    const isSelected = dateStr === calSelectedDate;
    const evts = allEventsForDate(dateStr);

    // Always dots — clean and compact on all screen sizes
    const dots = evts.slice(0, 7).map(e => `<span class="uc-dot" style="background:${e.color}" aria-hidden="true"></span>`).join('');

    html += `<div class="uc-cell ${isToday ? 'today' : ''} ${other ? 'other-month' : ''} ${isSelected ? 'selected' : ''}"
      onclick="selectCalDate('${dateStr}')"
      data-date="${dateStr}"
      data-drop-target="true"
      role="button"
      tabindex="0"
      aria-label="${d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}${evts.length ? ', ' + evts.length + ' event' + (evts.length > 1 ? 's' : '') : ''}"
      onkeydown="if(event.key==='Enter')selectCalDate('${dateStr}')">
      <div class="uc-daynum">${dayNum}</div>
      <div class="uc-dots">${dots}</div>
    </div>`;
  }
  html += `</div>`;
  return html;
}

/* ════════════════════════════════════════════════════════════
   WEEK VIEW — Timetable Layout
   ════════════════════════════════════════════════════════════ */
const TIMETABLE_START = 7;  // 7 AM
const TIMETABLE_END = 24;   // 12 AM (midnight)
const HOUR_HEIGHT = 60;     // px per hour

function weekTimetableHtml() {
  const start = new Date(calDate);
  start.setDate(calDate.getDate() - calDate.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  document.getElementById('calTitle').textContent =
    `${start.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`;

  // Collect all days
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }

  // Build events per day, then calculate layout
  const dayEventLayouts = days.map(d => {
    const dateStr = ymdLocal(d);
    const evts = allEventsForDate(dateStr).filter(e => e.time); // only timed events
    const allDay = allEventsForDate(dateStr).filter(e => !e.time);
    return { dateStr, d, evts, allDay, layout: computeOverlapLayout(evts) };
  });

  const totalHours = TIMETABLE_END - TIMETABLE_START;
  const totalHeight = totalHours * HOUR_HEIGHT;

  // Day headers
  let html = `<div class="tt-wrap" aria-label="Week timetable view">`;

  // All-day row
  const hasAllDay = dayEventLayouts.some(dl => dl.allDay.length > 0);
  if (hasAllDay) {
    html += `<div class="tt-allday-row">
      <div class="tt-time-gutter tt-allday-label">All day</div>`;
    dayEventLayouts.forEach(dl => {
      const isToday = dl.dateStr === todayKey();
      const isSelected = dl.dateStr === calSelectedDate;
      html += `<div class="tt-day-col tt-allday-col ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}">`;
      dl.allDay.forEach(e => {
        html += `<div class="tt-allday-chip"
          style="background:${hexWithAlpha(e.color, 0.82)};color:#fff"
          onclick="handleDayEventClick('${e.type}','${e.id}','${dl.dateStr}')"
          title="${escapeHtml(e.title)}"
          role="button" tabindex="0"
          aria-label="${escapeHtml(e.title)}">
          <span class="tt-block-title">${escapeHtml(e.title)}</span>
        </div>`;
      });
      html += `</div>`;
    });
    html += `</div>`;
  }

  // Header row
  html += `<div class="tt-header-row">
    <div class="tt-time-gutter"></div>`;
  dayEventLayouts.forEach(dl => {
    const isToday = dl.dateStr === todayKey();
    const isSelected = dl.dateStr === calSelectedDate;
    html += `<div class="tt-day-header ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}"
      data-date="${dl.dateStr}"
      onclick="selectCalDate('${dl.dateStr}')"
      role="button" tabindex="0"
      aria-label="${dl.d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}"
      onkeydown="if(event.key==='Enter')selectCalDate('${dl.dateStr}')">
      <span class="tt-dow">${DAY_NAMES[dl.d.getDay()]}</span>
      <span class="tt-daynum ${isToday ? 'today-circle' : ''}">${dl.d.getDate()}</span>
    </div>`;
  });
  html += `</div>`;

  // Scrollable timetable body
  html += `<div class="tt-scroll-area">
    <div class="tt-body" style="height:${totalHeight}px;position:relative;">
      <!-- Time gutter + hour lines -->
      <div class="tt-time-gutter-col">`;
  for (let h = TIMETABLE_START; h < TIMETABLE_END; h++) {
    const top = (h - TIMETABLE_START) * HOUR_HEIGHT;
    const label = h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`;
    html += `<div class="tt-hour-label" style="top:${top}px" aria-hidden="true">${label}</div>`;
  }
  html += `</div>`;

  // Hour grid lines
  html += `<div class="tt-grid-lines" aria-hidden="true">`;
  for (let h = TIMETABLE_START; h < TIMETABLE_END; h++) {
    html += `<div class="tt-grid-line" style="top:${(h - TIMETABLE_START) * HOUR_HEIGHT}px"></div>`;
    html += `<div class="tt-grid-line tt-grid-half" style="top:${(h - TIMETABLE_START) * HOUR_HEIGHT + 30}px"></div>`;
  }
  html += `</div>`;

  // Day columns
  dayEventLayouts.forEach(dl => {
    const isToday = dl.dateStr === todayKey();
    const isSelected = dl.dateStr === calSelectedDate;
    html += `<div class="tt-day-body-col ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}"
      data-date="${dl.dateStr}"
      data-drop-target="true"
      onclick="selectCalDate('${dl.dateStr}')">`;

    // Current time indicator
    if (isToday) {
      const now = new Date();
      const nowMins = now.getHours() * 60 + now.getMinutes();
      const startMins = TIMETABLE_START * 60;
      const endMins = TIMETABLE_END * 60;
      if (nowMins >= startMins && nowMins <= endMins) {
        const topPx = ((nowMins - startMins) / 60) * HOUR_HEIGHT;
        html += `<div class="tt-now-line" style="top:${topPx}px" aria-label="Current time"></div>`;
      }
    }

    // Render events with overlap layout
    dl.layout.forEach(item => {
      const e = item.event;
      const totalMins = (TIMETABLE_END - TIMETABLE_START) * 60;
      let topMins = timeToMinutes(e.time) - TIMETABLE_START * 60;
      let endMins = e.endTime ? timeToMinutes(e.endTime) - TIMETABLE_START * 60 : topMins + 60;
      // Skip events fully outside the visible range
      if (topMins >= totalMins || endMins <= 0) return;
      // Clamp to visible range
      topMins = Math.max(0, topMins);
      endMins = Math.min(totalMins, endMins);
      let heightMins = Math.max(endMins - topMins, 22); // min 22 min so block is visible
      // If enforcing min-height would push past the bottom, nudge top up instead
      if (topMins + heightMins > totalMins) {
        topMins = Math.max(0, totalMins - heightMins);
      }
      const top = (topMins / 60) * HOUR_HEIGHT;
      const height = (heightMins / 60) * HOUR_HEIGHT;

      // Overlap: width and left based on column count
      const colCount = item.totalCols;
      const colIdx = item.col;
      const widthPct = 100 / colCount;
      const leftPct = colIdx * widthPct;

      const timeStart = fmtTime(e.time);
      const timeEnd = e.endTime ? fmtTime(e.endTime) : '';
      const timeLabel = timeStart + (timeEnd ? '\n' + timeEnd : '');
      const timeLabelHtml = timeStart + (timeEnd ? '<br>' + timeEnd : '');
      const isShort = height < 45;
      const typeIcon = { class: 'bi-calendar2-week', task: 'bi-check2-square', event: 'bi-calendar-event', univ: 'bi-bank2' }[e.type] || 'bi-circle';

      // Stagger overlapping cols so bottom ones remain clickable
      const zIdx = 5 + colIdx;
      html += `<div class="tt-event-block ${e.draggable ? 'tt-draggable' : ''} tt-type-${e.type}"
        style="top:${top}px;height:${height}px;left:calc(${leftPct}% + 2px);width:calc(${widthPct}% - 4px);background:${hexWithAlpha(e.color, 0.82)};color:#fff;z-index:${zIdx}"
        onclick="event.stopPropagation();handleDayEventClick('${e.type}','${e.id}','${dl.dateStr}')"
        ${e.draggable ? `draggable="true" data-drag-type="${e.type}" data-drag-id="${e.id}" data-drag-date="${dl.dateStr}"` : ''}
        role="button" tabindex="0"
        aria-label="${escapeHtml(e.title)}, ${timeLabel}"
        title="${escapeHtml(e.title)} — ${timeLabel}${e.room ? ' · ' + e.room : ''}">
        <div class="tt-block-inner ${isShort ? 'tt-block-short' : ''}">
          <div class="tt-block-title">${escapeHtml(e.title)}</div>
          ${!isShort ? `<div class="tt-block-meta">${timeLabelHtml}${e.room ? '<br>' + escapeHtml(e.room) : ''}</div>` : ''}
        </div>
      </div>`;
    });

    html += `</div>`;
  });

  html += `</div></div></div>`; // tt-body, tt-scroll-area, tt-wrap
  return html;
}

/* Converts "HH:MM" to minutes since midnight */
function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

/* Compute overlap layout for timed events */
function computeOverlapLayout(events) {
  if (!events.length) return [];
  // Sort by start time
  const sorted = events.map((e, i) => ({ event: e, idx: i }))
    .sort((a, b) => timeToMinutes(a.event.time) - timeToMinutes(b.event.time));

  const result = [];
  // Group overlapping events into clusters
  const clusters = [];
  let currentCluster = [];

  sorted.forEach(item => {
    const startMin = timeToMinutes(item.event.time);
    const endMin = item.event.endTime ? timeToMinutes(item.event.endTime) : startMin + 60;

    if (currentCluster.length === 0) {
      currentCluster.push({ ...item, startMin, endMin });
    } else {
      const clusterEnd = Math.max(...currentCluster.map(c => c.endMin));
      if (startMin < clusterEnd) {
        currentCluster.push({ ...item, startMin, endMin });
      } else {
        clusters.push([...currentCluster]);
        currentCluster = [{ ...item, startMin, endMin }];
      }
    }
  });
  if (currentCluster.length) clusters.push(currentCluster);

  // Assign columns within each cluster
  clusters.forEach(cluster => {
    const cols = [];
    cluster.forEach(item => {
      let placed = false;
      for (let c = 0; c < cols.length; c++) {
        const lastInCol = cols[c][cols[c].length - 1];
        if (item.startMin >= lastInCol.endMin) {
          cols[c].push(item);
          result.push({ event: item.event, col: c, totalCols: 0 });
          placed = true;
          break;
        }
      }
      if (!placed) {
        cols.push([item]);
        result.push({ event: item.event, col: cols.length - 1, totalCols: 0 });
      }
    });
    // Set totalCols for all in this cluster
    const totalCols = cols.length;
    result.filter(r => cluster.some(c => c.event === r.event)).forEach(r => r.totalCols = totalCols);
  });

  return result;
}

/* ════════════════════════════════════════════════════════════
   DAY VIEW
   ════════════════════════════════════════════════════════════ */
function dayHtml() {
  const dateStr = ymdLocal(calDate);
  document.getElementById('calTitle').textContent = calDate.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const evts = allEventsForDate(dateStr);
  calSelectedDate = dateStr;
  renderAgenda(dateStr);

  if (!evts.length) {
    return `<div class="cal-empty-state">
      <i class="bi bi-calendar-x" aria-hidden="true"></i>
      <div>Nothing scheduled for this day.</div>
      <button class="btn btn-ghost btn-sm mt-2" onclick="openCalEventModal(null,'${dateStr}')"><i class="bi bi-plus-lg me-1"></i>Add Event</button>
    </div>`;
  }
  return `<div class="day-view-list">${evts.map(e => renderDayEventRow(e, dateStr)).join('')}</div>`;
}

/* ── Day Event Row ─────────────────────────────────────────── */
function renderDayEventRow(e, dateStr) {
  const typeBadge = `<span class="day-detail-type-badge badge-${e.type}">${e.type}</span>`;
  const timeStart = e.time ? fmtTime(e.time) : '';
  const timeEnd = e.endTime ? fmtTime(e.endTime) : '';
  const timeStr = timeStart;
  const dragAttr = e.draggable ? `draggable="true" data-drag-type="${e.type}" data-drag-id="${e.id}" data-drag-date="${dateStr || ''}"` : '';
  return `<div class="day-detail-item ${e.draggable ? 'is-draggable' : ''}"
    onclick="handleDayEventClick('${e.type}','${e.id}','${dateStr || ''}')"
    ${dragAttr}
    role="button" tabindex="0"
    aria-label="${escapeHtml(e.title)}${timeStart ? ', ' + timeStart : ''}"
    onkeydown="if(event.key==='Enter')handleDayEventClick('${e.type}','${e.id}','${dateStr || ''}')">
    <div class="day-detail-color" style="background:${e.color}" aria-hidden="true"></div>
    <div class="flex-grow-1">
      <div style="font-weight:700;font-size:.85rem;${e.type === 'task' && e._obj && e._obj.status === 'completed' ? 'text-decoration:line-through;opacity:.6' : ''}">${escapeHtml(e.title)}</div>
      <div class="text-faint" style="font-size:.73rem">
        ${timeStart ? `<span>${timeStart}</span>` : ''}
        ${timeEnd ? `<span style="display:block">${timeEnd}</span>` : ''}
        ${(timeStart || timeEnd) && (e.sub || e.room) ? `<span style="display:block">${escapeHtml(e.room || e.sub || '')}</span>` : (!timeStart && !timeEnd ? escapeHtml(e.room || e.sub || '') : '')}
      </div>
    </div>
    ${typeBadge}

  </div>`;
}

/* ── Select Date ───────────────────────────────────────────── */
function selectCalDate(dateStr) {
  calSelectedDate = dateStr;
  calDate = new Date(dateStr + 'T00:00');

  // Update selected state visually — works for both month cells and week timetable headers/cols
  document.querySelectorAll('[data-date]').forEach(el => {
    el.classList.toggle('selected', el.dataset.date === dateStr);
  });

  renderAgenda(dateStr);
}

/* ════════════════════════════════════════════════════════════
   AGENDA PANEL
   ════════════════════════════════════════════════════════════ */
function renderAgenda(dateStr) {
  const header = document.getElementById('calAgendaHeader');
  const body = document.getElementById('calAgendaBody');
  const titleEl = document.getElementById('calAgendaTitle');
  if (!body) return;

  const d = new Date(dateStr + 'T00:00');
  const dateLabel = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  if (titleEl) titleEl.textContent = dateLabel;

  const evts = allEventsForDate(dateStr);
  const groups = { class: [], task: [], event: [], univ: [] };
  evts.forEach(e => { if (groups[e.type]) groups[e.type].push(e); });

  let html = '';

  const groupDefs = [
    { key: 'class', label: 'Classes', icon: 'bi-calendar2-week' },
    { key: 'task',  label: 'Tasks',   icon: 'bi-check2-square' },
    { key: 'event', label: 'Events',  icon: 'bi-calendar-event' },
    { key: 'univ',  label: 'University', icon: 'bi-bank2' }
  ];

  groupDefs.forEach(g => {
    if (!groups[g.key].length) return;
    html += `<div class="agenda-group-label"><i class="bi ${g.icon}" aria-hidden="true"></i>${g.label}</div>`;
    groups[g.key].forEach(e => {
      html += renderAgendaItem(e, dateStr);
    });
  });

  if (!html) {
    html = `<div class="cal-empty-state cal-empty-small">
      <i class="bi bi-calendar3" aria-hidden="true"></i>
      <div>Nothing scheduled</div>
    </div>
    <div class="d-flex gap-2 flex-wrap mt-2">
      <button class="btn btn-ghost btn-sm flex-grow-1" onclick="openCalEventModal(null,'${dateStr}')"><i class="bi bi-plus-lg me-1"></i>Add Event</button>
      <button class="btn btn-ghost btn-sm flex-grow-1" onclick="openTaskModal(null,'${dateStr}')"><i class="bi bi-check2-square me-1"></i>Add Task</button>
    </div>`;
  } else {
    html += `<div class="d-flex gap-2 flex-wrap mt-3">
      <button class="btn btn-ghost btn-sm flex-grow-1" onclick="openCalEventModal(null,'${dateStr}')"><i class="bi bi-plus-lg me-1"></i>Add Event</button>
      <button class="btn btn-ghost btn-sm flex-grow-1" onclick="openTaskModal(null,'${dateStr}')"><i class="bi bi-check2-square me-1"></i>Add Task</button>
    </div>`;
  }

  body.innerHTML = html;
  // Re-attach drag listeners so agenda items are draggable
  attachDragListeners();
}

function renderAgendaItem(e, dateStr) {
  const _aTimeStart = e.time ? fmtTime(e.time) : '';
  const _aTimeEnd = e.endTime ? fmtTime(e.endTime) : '';
  const timeStr = _aTimeStart + (_aTimeEnd ? '\n' + _aTimeEnd : '');
  const dragAttr = e.draggable ? `draggable="true" data-drag-type="${e.type}" data-drag-id="${e.id}" data-drag-date="${dateStr}"` : '';
  return `<div class="agenda-item ${e.draggable ? 'is-draggable' : ''}"
    style="border-left:3px solid ${e.color}"
    onclick="handleDayEventClick('${e.type}','${e.id}','${dateStr}')"
    ${dragAttr}
    role="button" tabindex="0"
    aria-label="${escapeHtml(e.title)}${_aTimeStart ? ', ' + _aTimeStart : ''}"
    onkeydown="if(event.key==='Enter')handleDayEventClick('${e.type}','${e.id}','${dateStr}')">
    <div class="agenda-item-time">${_aTimeStart ? _aTimeStart + (_aTimeEnd ? '<br>' + _aTimeEnd : '') : 'All day'}</div>
    <div class="agenda-item-body">
      <div class="agenda-item-title ${e.type === 'task' && e._obj && e._obj.status === 'completed' ? 'completed-item' : ''}">${escapeHtml(e.title)}</div>
      ${e.room ? `<div class="agenda-item-meta">${escapeHtml(e.room)}</div>` : (e.sub ? `<div class="agenda-item-meta">${escapeHtml(e.sub)}</div>` : '')}
    </div>

  </div>`;
}

/* ── Day Event Click ───────────────────────────────────────── */
function handleDayEventClick(type, id, date) {
  if (type === 'class') openScheduleModal(id);
  else if (type === 'task') openTaskModal(id);
  else if (type === 'event') openCalEventModal(id);
  else if (type === 'univ') openUnivEventModal(id);
}

/* ── Legacy Day Modal (kept for mobile fallback) ───────────── */
function openDayModal(dateStr) {
  // On mobile, show the agenda as a modal
  if (window.innerWidth < 768) {
    const evts = allEventsForDate(dateStr);
    const body = document.getElementById('dayModalBody');
    const d = new Date(dateStr + 'T00:00');
    const dateLabel = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

    const groups = { class: [], task: [], event: [], univ: [] };
    evts.forEach(e => { if (groups[e.type]) groups[e.type].push(e); });

    let sectionsHtml = '';
    const groupDefs = [
      { key: 'class', label: 'Classes', icon: 'bi-calendar2-week' },
      { key: 'task',  label: 'Tasks',   icon: 'bi-check2-square' },
      { key: 'event', label: 'Events',  icon: 'bi-calendar-event' },
      { key: 'univ',  label: 'University', icon: 'bi-bank2' }
    ];
    groupDefs.forEach(g => {
      if (!groups[g.key].length) return;
      sectionsHtml += `<div class="day-modal-section-title"><i class="bi ${g.icon}"></i>${g.label}</div>` +
        groups[g.key].map(e => renderDayEventRow(e, dateStr)).join('');
    });

    if (!sectionsHtml) {
      sectionsHtml = `<div class="text-faint text-center py-3">Nothing scheduled — add something below.</div>`;
    }

    body.innerHTML = `
      <div class="d-flex justify-content-between align-items-start mb-3">
        <h5 class="mb-0">${dateLabel}</h5>
        <button class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      ${sectionsHtml}
      <div class="d-flex gap-2 mt-3 flex-wrap">
        <button class="btn btn-ghost btn-sm flex-grow-1" onclick="openCalEventModal(null,'${dateStr}');bootstrap.Modal.getInstance(document.getElementById('dayModal')).hide()"><i class="bi bi-plus-lg me-1"></i>Add Event</button>
        <button class="btn btn-ghost btn-sm flex-grow-1" onclick="openTaskModal(null,'${dateStr}');bootstrap.Modal.getInstance(document.getElementById('dayModal')).hide()"><i class="bi bi-check2-square me-1"></i>Add Task</button>
      </div>`;
    new bootstrap.Modal(document.getElementById('dayModal')).show();
  } else {
    selectCalDate(dateStr);
  }
}

/* ════════════════════════════════════════════════════════════
   DRAG AND DROP
   ════════════════════════════════════════════════════════════ */
// Ghost element for touch drag
let _touchGhost = null;

function attachDragListeners() {
  // Desktop drag sources
  document.querySelectorAll('[draggable="true"][data-drag-type]').forEach(el => {
    el.addEventListener('dragstart', onDragStart);
    el.addEventListener('dragend', onDragEnd);
  });

  // Desktop drop targets
  document.querySelectorAll('[data-drop-target="true"]').forEach(el => {
    el.addEventListener('dragover', onDragOver);
    el.addEventListener('dragleave', onDragLeave);
    el.addEventListener('drop', onDrop);
  });

  // Touch drag — long-press on draggable item, move anywhere on document
  document.querySelectorAll('[draggable="true"][data-drag-type]').forEach(el => {
    let touchTimer = null;
    let _ghostWidth = 0;

    function _touchCleanup() {
      if (_touchGhost) { _touchGhost.remove(); _touchGhost = null; }
      document.querySelectorAll('.drag-over').forEach(x => x.classList.remove('drag-over'));
      document.removeEventListener('touchmove', _onTouchMove, { passive: false });
      document.removeEventListener('touchend',  _onTouchEnd);
      document.removeEventListener('touchcancel', _onTouchCancel);
      if (dragState?.el) dragState.el.classList.remove('drag-active');
      dragState = null;
    }

    function _onTouchMove(e) {
      if (!dragState) return;
      e.preventDefault(); // must be non-passive to block scroll
      const t = e.touches[0];
      if (_touchGhost) {
        _touchGhost.style.left = (t.clientX - _ghostWidth / 2) + 'px';
        _touchGhost.style.top  = (t.clientY - 24) + 'px';
      }
      document.querySelectorAll('.drag-over').forEach(x => x.classList.remove('drag-over'));
      // elementFromPoint is blocked by the ghost (pointer-events:none so it passes through)
      const under = document.elementFromPoint(t.clientX, t.clientY);
      if (under) {
        const dt = under.closest('[data-drop-target="true"]');
        if (dt) dt.classList.add('drag-over');
      }
    }

    function _onTouchEnd(e) {
      clearTimeout(touchTimer);
      if (!dragState) { _touchCleanup(); return; }
      const saved = { ...dragState };
      const t = e.changedTouches[0];
      _touchCleanup();
      const under = document.elementFromPoint(t.clientX, t.clientY);
      if (under) {
        const dt = under.closest('[data-drop-target="true"]');
        if (dt) {
          const toDate = dt.dataset.date;
          if (toDate && toDate !== saved.fromDate) {
            applyDrop(saved.type, saved.id, saved.fromDate, toDate);
          }
        }
      }
    }

    function _onTouchCancel() {
      clearTimeout(touchTimer);
      _touchCleanup();
    }

    el.addEventListener('touchstart', e => {
      // Cancel any previous timer
      clearTimeout(touchTimer);
      touchTimer = setTimeout(() => {
        dragState = {
          type: el.dataset.dragType,
          id: el.dataset.dragId,
          fromDate: el.dataset.dragDate,
          el
        };
        el.classList.add('drag-active');

        _ghostWidth = el.offsetWidth;
        _touchGhost = el.cloneNode(true);
        _touchGhost.style.cssText = [
          'position:fixed', 'z-index:9999', 'pointer-events:none', 'opacity:0.8',
          `width:${_ghostWidth}px`, 'border-radius:8px', 'transform:scale(1.04)',
          'transition:none', 'box-shadow:0 8px 28px rgba(0,0,0,.55)'
        ].join(';');
        document.body.appendChild(_touchGhost);

        const t = e.touches[0];
        _touchGhost.style.left = (t.clientX - _ghostWidth / 2) + 'px';
        _touchGhost.style.top  = (t.clientY - 24) + 'px';

        if (navigator.vibrate) navigator.vibrate(40);

        // Attach move/end to document so they fire even when touch moves off el
        document.addEventListener('touchmove',   _onTouchMove,   { passive: false });
        document.addEventListener('touchend',    _onTouchEnd,    { passive: true });
        document.addEventListener('touchcancel', _onTouchCancel, { passive: true });
      }, 450);
    }, { passive: true });

    // Cancel timer if finger lifts before long-press fires
    el.addEventListener('touchend', () => clearTimeout(touchTimer), { passive: true });
    el.addEventListener('touchmove', () => {
      // If drag hasn't started yet and finger moved, cancel long-press
      if (!dragState) clearTimeout(touchTimer);
    }, { passive: true });
    el.addEventListener('touchcancel', () => clearTimeout(touchTimer), { passive: true });
  });
}

function onDragStart(e) {
  const el = e.currentTarget;
  dragState = {
    type: el.dataset.dragType,
    id: el.dataset.dragId,
    fromDate: el.dataset.dragDate,
    el
  };
  el.classList.add('drag-active');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', JSON.stringify({ type: el.dataset.dragType, id: el.dataset.dragId, fromDate: el.dataset.dragDate }));
}

function onDragEnd(e) {
  e.currentTarget.classList.remove('drag-active');
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  dragState = null;
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

function onDragLeave(e) {
  // Only remove if we're truly leaving (not entering a child)
  if (!e.currentTarget.contains(e.relatedTarget)) {
    e.currentTarget.classList.remove('drag-over');
  }
}

function onDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  const target = e.currentTarget;
  target.classList.remove('drag-over');

  let state = dragState;
  if (!state) {
    try { state = JSON.parse(e.dataTransfer.getData('text/plain')); } catch (ex) { return; }
  }
  if (!state) return;

  const toDate = target.dataset.date;
  if (!toDate || toDate === state.fromDate) return;

  applyDrop(state.type, state.id, state.fromDate, toDate);
}

function applyDrop(type, id, fromDate, toDate) {
  if (type === 'task') {
    const tasks = DB.getTasks();
    const idx = tasks.findIndex(t => t.id === id);
    if (idx === -1) return;
    tasks[idx].dueDate = toDate;
    DB.saveTasks(tasks);
    Toast.show('Task moved to ' + new Date(toDate + 'T00:00').toLocaleDateString([], { month: 'short', day: 'numeric' }));
  } else if (type === 'event') {
    const events = DB.getCalendarEvents();
    const idx = events.findIndex(ev => ev.id === id);
    if (idx === -1) return;
    events[idx].date = toDate;
    DB.saveCalendarEvents(events);
    Toast.show('Event moved to ' + new Date(toDate + 'T00:00').toLocaleDateString([], { month: 'short', day: 'numeric' }));
  } else {
    // class / univ — not draggable, ignore
    return;
  }
  renderCalendar();
  if (calSelectedDate) renderAgenda(calSelectedDate);
}

/* ════════════════════════════════════════════════════════════
   EXPORT: .ICS
   ════════════════════════════════════════════════════════════ */
function exportICS() {
  const semId = DB.getActiveSemesterId();
  const sem = DB.getActiveSemester();
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Student Planner//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];

  // Add calendar events
  const calEvents = DB.getCalendarEventsForSemester(semId);
  calEvents.forEach(ev => {
    if (!ev.date) return;
    const dtstart = icsDate(ev.date, ev.startTime);
    const dtend = icsDate(ev.date, ev.endTime || ev.startTime);
    lines.push('BEGIN:VEVENT');
    lines.push('UID:' + ev.id + '@studentplanner');
    lines.push('DTSTAMP:' + icsNow());
    lines.push('DTSTART:' + dtstart);
    lines.push('DTEND:' + dtend);
    lines.push('SUMMARY:' + icsEscape(ev.title));
    if (ev.description) lines.push('DESCRIPTION:' + icsEscape(ev.description));
    lines.push('END:VEVENT');
  });

  // Add tasks with due dates
  const tasks = DB.getTasksForSemester(semId).filter(t => t.dueDate);
  tasks.forEach(t => {
    const dtstart = icsDate(t.dueDate, t.dueTime || '00:00');
    lines.push('BEGIN:VEVENT');
    lines.push('UID:task-' + t.id + '@studentplanner');
    lines.push('DTSTAMP:' + icsNow());
    lines.push('DTSTART:' + dtstart);
    lines.push('DTEND:' + dtstart);
    lines.push('SUMMARY:[Task] ' + icsEscape(t.title));
    if (t.description) lines.push('DESCRIPTION:' + icsEscape(t.description));
    lines.push('END:VEVENT');
  });

  // Add university events
  const univEvents = DB.getUniversityEvents();
  univEvents.forEach(u => {
    if (!u.dates || !u.dates.length) return;
    u.dates.forEach(dateStr => {
      lines.push('BEGIN:VEVENT');
      lines.push('UID:univ-' + u.id + '-' + dateStr + '@studentplanner');
      lines.push('DTSTAMP:' + icsNow());
      lines.push('DTSTART;VALUE=DATE:' + dateStr.replace(/-/g, ''));
      lines.push('DTEND;VALUE=DATE:' + dateStr.replace(/-/g, ''));
      lines.push('SUMMARY:' + icsEscape(u.title));
      if (u.note) lines.push('DESCRIPTION:' + icsEscape(u.note));
      lines.push('END:VEVENT');
    });
  });

  lines.push('END:VCALENDAR');
  const total = calEvents.length + tasks.length + univEvents.length;
  if (total === 0) {
    Toast.show('No events to export', 'high', 'bi-exclamation-triangle');
    return;
  }
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const semName = sem ? `${sem.schoolYear}-${sem.name.replace(/\s+/g, '-')}` : 'Calendar';
  a.download = `Student-Planner-${semName}.ics`;
  a.click();
  URL.revokeObjectURL(url);
  Toast.show('Calendar exported as .ics');
}

function icsDate(dateStr, timeStr) {
  if (!dateStr) return '';
  const d = dateStr.replace(/-/g, '');
  if (!timeStr) return d;
  const t = timeStr.replace(':', '') + '00';
  return d + 'T' + t;
}

function icsNow() {
  return new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function icsEscape(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}

/* ════════════════════════════════════════════════════════════
   EXPORT: GOOGLE CALENDAR
   ════════════════════════════════════════════════════════════ */
function exportGoogleCalendar() {
  const semId = DB.getActiveSemesterId();
  const calEvents = DB.getCalendarEventsForSemester(semId);

  if (!calEvents.length) {
    Toast.show('No exportable events. Use .ics for tasks & university events.', 'medium', 'bi-info-circle');
    return;
  }

  // Open Google Calendar for the first event as a demonstration
  const first = calEvents[0];
  const start = googleCalDate(first.date, first.startTime);
  const end   = googleCalDate(first.date, first.endTime || first.startTime);
  const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(first.title)}&dates=${start}/${end}&details=${encodeURIComponent(first.description || '')}`;

  if (calEvents.length === 1) {
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    // Multiple events: guide user to use .ics for bulk, or open one by one
    const choice = confirm(`You have ${calEvents.length} events.\n\nClick OK to open the first event in Google Calendar,\nor Cancel to download the .ics file for bulk import.`);
    if (choice) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      exportICS();
    }
  }
}

function googleCalDate(dateStr, timeStr) {
  if (!dateStr) return '';
  const d = dateStr.replace(/-/g, '');
  if (!timeStr) return d;
  const t = timeStr.replace(':', '') + '00';
  return d + 'T' + t + 'Z';
}

/* ════════════════════════════════════════════════════════════
   HELPER
   ════════════════════════════════════════════════════════════ */
function hexWithAlpha(hex, alpha) {
  try {
    const r = parseInt(hex.slice(1, 3), 16),
          g = parseInt(hex.slice(3, 5), 16),
          b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  } catch (e) { return hex; }
}

/* ════════════════════════════════════════════════════════════
   SCHEDULE MODAL (add/edit class)
   ════════════════════════════════════════════════════════════ */
function openScheduleModal(id, presetDay) {
  const s = id ? DB.getSubject(id) : null;
  const sem = DB.getSemester();
  const days = s ? s.days : (presetDay ? [presetDay] : []);
  const color = s ? s.color : DB.colors[0];
  const body = document.getElementById('calSubjectModalBody');
  body.innerHTML = `
    <h5 class="mb-3"><i class="bi bi-calendar3 me-2"></i>${s ? 'Edit' : 'Add'} Schedule</h5>
    <input type="hidden" id="csId" value="${s ? s.id : ''}">
    <div class="row g-2">
      <div class="col-md-4"><label>Subject Code</label><input class="form-control" id="csCode" value="${s ? escapeHtml(s.code) : ''}" placeholder="CS101"></div>
      <div class="col-md-8"><label>Subject Description</label><input class="form-control" id="csDesc" value="${s ? escapeHtml(s.desc) : ''}" placeholder="Introduction to Computing"></div>
      <div class="col-md-4"><label>Subject Type</label>
        <select class="form-select" id="csType">${['Lecture','Laboratory','Seminar','Hybrid'].map(t => `<option ${s && s.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
      </div>
      <div class="col-md-4"><label>Units</label><input type="number" step="0.5" class="form-control" id="csUnits" value="${s ? s.units : 3}"></div>
      <div class="col-md-4"><label>Section</label><input class="form-control" id="csSection" value="${s ? escapeHtml(s.section) : ''}" placeholder="BSCS-1A"></div>
      <div class="col-12"><label>Days</label>
        <div class="d-flex gap-2 flex-wrap">
          ${DAY_NAMES.slice(1).concat(DAY_NAMES[0]).map(d => `
            <div class="form-check form-check-inline">
              <input class="form-check-input cs-day-check" type="checkbox" value="${d}" id="csday_${d}" ${days.includes(d) ? 'checked' : ''}>
              <label class="form-check-label" for="csday_${d}">${d}</label>
            </div>`).join('')}
        </div>
      </div>
      <div class="col-md-6"><label>Start Time</label><input type="time" class="form-control" id="csStart" value="${s ? s.start : '08:00'}"></div>
      <div class="col-md-6"><label>End Time</label><input type="time" class="form-control" id="csEnd" value="${s ? s.end : '09:00'}"></div>
      <div class="col-md-4"><label>Room Number</label><input class="form-control" id="csRoom" value="${s ? escapeHtml(s.room) : ''}"></div>
      <div class="col-md-8"><label>Building</label><input class="form-control" id="csBuilding" value="${s ? escapeHtml(s.building) : ''}"></div>
      <div class="col-md-6"><label>Professor</label><input class="form-control" id="csProf" value="${s ? escapeHtml(s.professor) : ''}"></div>
      <div class="col-md-6"><label>Email</label><input type="email" class="form-control" id="csEmail" value="${s ? escapeHtml(s.email) : ''}"></div>
      <div class="col-md-6"><label>Semester</label><input class="form-control" id="csSemester" value="${s ? escapeHtml(s.semester) : sem.name}"></div>
      <div class="col-md-6"><label>School Year</label><input class="form-control" id="csYear" value="${s ? escapeHtml(s.schoolYear) : sem.schoolYear}"></div>
      <div class="col-12"><label>Color Label</label>
        <div class="d-flex gap-2 flex-wrap" id="csColorPicker">
          ${DB.colors.map(c => `<div onclick="selectScheduleColor('${c}')" data-cs-color="${c}" style="width:28px;height:28px;border-radius:8px;background:${c};cursor:pointer;box-shadow:${color === c ? '0 0 0 3px rgba(255,255,255,.5)' : 'none'}" aria-label="Color ${c}"></div>`).join('')}
        </div>
        <input type="hidden" id="csColor" value="${color}">
      </div>
      <div class="col-12"><label>Notes</label><textarea class="form-control" id="csNotes" rows="2">${s ? escapeHtml(s.notes || '') : ''}</textarea></div>
    </div>
    <div class="d-flex gap-2 mt-3">
      <button class="btn btn-accent flex-grow-1" onclick="saveScheduleEntry()"><i class="bi bi-check2 me-1"></i>${s ? 'Update' : 'Save'} Schedule</button>
      ${s ? `<button class="btn btn-ghost" onclick="deleteScheduleEntry('${s.id}')" aria-label="Delete schedule"><i class="bi bi-trash3"></i></button>` : ''}
    </div>`;
  new bootstrap.Modal(document.getElementById('calSubjectModal')).show();
}

function selectScheduleColor(c) {
  document.getElementById('csColor').value = c;
  document.querySelectorAll('#csColorPicker div').forEach(d => d.style.boxShadow = d.dataset.csColor === c ? '0 0 0 3px rgba(255,255,255,.5)' : 'none');
}

function saveScheduleEntry() {
  const id = document.getElementById('csId').value;
  const code = document.getElementById('csCode').value.trim();
  if (!code) { Toast.show('Subject code is required', 'high', 'bi-exclamation-triangle'); return; }
  const days = [...document.querySelectorAll('.cs-day-check:checked')].map(c => c.value);
  const semId = DB.getActiveSemesterId();
  const data = {
    code, desc: document.getElementById('csDesc').value.trim(),
    type: document.getElementById('csType').value,
    units: parseFloat(document.getElementById('csUnits').value) || 0,
    section: document.getElementById('csSection').value.trim(),
    days, start: document.getElementById('csStart').value, end: document.getElementById('csEnd').value,
    room: document.getElementById('csRoom').value.trim(), building: document.getElementById('csBuilding').value.trim(),
    professor: document.getElementById('csProf').value.trim(), email: document.getElementById('csEmail').value.trim(),
    color: document.getElementById('csColor').value, notes: document.getElementById('csNotes').value.trim(),
    semester: document.getElementById('csSemester').value.trim(), schoolYear: document.getElementById('csYear').value.trim(),
  };
  const subjects = DB.getSubjects();
  if (id) {
    const idx = subjects.findIndex(s => s.id === id);
    subjects[idx] = { ...subjects[idx], ...data };
  } else {
    subjects.push({ id: DB.uid(), archived: false, semesterId: semId, ...data });
  }
  DB.saveSubjects(subjects);
  bootstrap.Modal.getInstance(document.getElementById('calSubjectModal')).hide();
  Toast.show(id ? 'Schedule updated' : 'Schedule added');
  renderCalendar();
  if (calSelectedDate) renderAgenda(calSelectedDate);
}

function deleteScheduleEntry(id) {
  DB.saveSubjects(DB.getSubjects().filter(x => x.id !== id));
  const inst = bootstrap.Modal.getInstance(document.getElementById('calSubjectModal'));
  if (inst) inst.hide();
  Toast.show('Schedule deleted');
  renderCalendar();
  if (calSelectedDate) renderAgenda(calSelectedDate);
}

/* ════════════════════════════════════════════════════════════
   TASK MODAL
   ════════════════════════════════════════════════════════════ */
function openTaskModal(id, presetDate) {
  taskEditingId = id || null;
  const t = id ? DB.getTasks().find(x => x.id === id) : null;
  const semId = DB.getActiveSemesterId();
  const subs = DB.getSubjects().filter(s => s.semesterId === semId);
  const body = document.getElementById('calTaskModalBody');
  body.innerHTML = `
    <h5 class="mb-3"><i class="bi bi-check2-square me-2"></i>${t ? 'Edit' : 'Add'} Task</h5>
    <input type="hidden" id="ctId" value="${t ? t.id : ''}">
    <div class="row g-2">
      <div class="col-12"><label>Title</label><input class="form-control" id="ctTitle" value="${t ? escapeHtml(t.title) : ''}"></div>
      <div class="col-12"><label>Description</label><textarea class="form-control" id="ctDesc" rows="2">${t ? escapeHtml(t.description || '') : ''}</textarea></div>
      <div class="col-md-4"><label>Subject</label><select class="form-select" id="ctSubject"><option value="">None</option>${subs.map(s => `<option value="${s.id}" ${t && t.subjectId === s.id ? 'selected' : ''}>${escapeHtml(s.code)}</option>`).join('')}</select></div>
      <div class="col-md-4"><label>Category</label><select class="form-select" id="ctCategory">${['Homework','Project','Quiz','Exam','Personal','Organization'].map(c => `<option ${t && t.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div class="col-md-4"><label>Priority</label><select class="form-select" id="ctPriority">${['low','medium','high'].map(p => `<option value="${p}" ${t && t.priority === p ? 'selected' : (!t && p === 'medium' ? 'selected' : '')}>${p[0].toUpperCase() + p.slice(1)}</option>`).join('')}</select></div>
      <div class="col-md-4"><label>Due Date</label><input type="date" class="form-control" id="ctDueDate" value="${t ? t.dueDate : (presetDate || todayKey())}"></div>
      <div class="col-md-4"><label>Due Time</label><input type="time" class="form-control" id="ctDueTime" value="${t ? t.dueTime : '23:59'}"></div>
      <div class="col-md-4"><label>Status</label><select class="form-select" id="ctStatus">${['not-started','in-progress','completed'].map(s => `<option value="${s}" ${t && t.status === s ? 'selected' : ''}>${s.replace('-', ' ')}</option>`).join('')}</select></div>
    </div>
    <div class="d-flex gap-2 mt-3">
      <button class="btn btn-accent flex-grow-1" onclick="saveCalTask()"><i class="bi bi-check2 me-1"></i>${t ? 'Update' : 'Save'} Task</button>
      ${t ? `<button class="btn btn-ghost" onclick="deleteCalTask('${t.id}')" aria-label="Delete task"><i class="bi bi-trash3"></i></button>` : ''}
    </div>`;
  new bootstrap.Modal(document.getElementById('calTaskModal')).show();
}

function saveCalTask() {
  const title = document.getElementById('ctTitle').value.trim();
  if (!title) { Toast.show('Please enter a title', 'high', 'bi-exclamation-triangle'); return; }
  const data = {
    title, description: document.getElementById('ctDesc').value.trim(),
    subjectId: document.getElementById('ctSubject').value || null,
    category: document.getElementById('ctCategory').value,
    priority: document.getElementById('ctPriority').value,
    dueDate: document.getElementById('ctDueDate').value,
    dueTime: document.getElementById('ctDueTime').value,
    status: document.getElementById('ctStatus').value,
  };
  if (data.status === 'completed') data.progress = 100;
  const id = document.getElementById('ctId').value;
  const tasks = DB.getTasks();
  if (id) {
    const idx = tasks.findIndex(t => t.id === id);
    tasks[idx] = { ...tasks[idx], ...data };
  } else {
    const semId = DB.getActiveSemesterId();
    tasks.push({ id: DB.uid(), progress: 0, repeat: 'none', score: null, remarks: '', reminder: true, checklist: [], createdAt: Date.now(), semesterId: semId, ...data });
  }
  DB.saveTasks(tasks);
  bootstrap.Modal.getInstance(document.getElementById('calTaskModal')).hide();
  Toast.show(id ? 'Task updated' : 'Task added');
  renderCalendar();
  if (calSelectedDate) renderAgenda(calSelectedDate);
}

function deleteCalTask(id) {
  DB.saveTasks(DB.getTasks().filter(x => x.id !== id));
  const inst = bootstrap.Modal.getInstance(document.getElementById('calTaskModal'));
  if (inst) inst.hide();
  Toast.show('Task deleted');
  renderCalendar();
  if (calSelectedDate) renderAgenda(calSelectedDate);
}

/* ════════════════════════════════════════════════════════════
   ONE-OFF CALENDAR EVENT MODAL
   ════════════════════════════════════════════════════════════ */
let calEventModalColor = EVENT_CAT_COLORS['Event'];

function openCalEventModal(id, presetDate) {
  eventEditingId = id || null;
  const existing = id ? DB.getCalendarEvents().find(e => e.id === id) : null;
  calEventModalColor = existing ? (existing.color || EVENT_CAT_COLORS['Event']) : EVENT_CAT_COLORS['Event'];
  const body = document.getElementById('calEventModalBody');
  body.innerHTML = `
    <h5 class="mb-3"><i class="bi bi-calendar-event me-2"></i>${existing ? 'Edit' : 'Add'} Event</h5>
    <div class="row g-2">
      <div class="col-12"><label>Event Title</label><input class="form-control" id="ceTitle" placeholder="e.g. Study Session, Project Meeting" value="${existing ? escapeHtml(existing.title) : ''}"></div>
      <div class="col-md-6"><label>Category</label>
        <select class="form-select" id="ceCategory" onchange="updateCalEventColor(this.value)">
          ${EVENT_CATEGORIES.map(c => `<option value="${c}" ${existing && existing.category === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="col-md-6"><label>Date</label><input type="date" class="form-control" id="ceDate" value="${existing ? existing.date : (presetDate || todayKey())}"></div>
      <div class="col-md-6"><label>Start Time</label><input type="time" class="form-control" id="ceStart" value="${existing ? existing.startTime : '08:00'}"></div>
      <div class="col-md-6"><label>End Time</label><input type="time" class="form-control" id="ceEnd" value="${existing ? existing.endTime : '09:00'}"></div>
      <div class="col-12"><label>Description (optional)</label><textarea class="form-control" id="ceDesc" rows="2" placeholder="Additional details…">${existing ? escapeHtml(existing.description || '') : ''}</textarea></div>
    </div>
    <div class="d-flex gap-2 mt-3">
      <button class="btn btn-accent flex-grow-1" onclick="saveCalEvent()"><i class="bi bi-check2 me-1"></i>${existing ? 'Update' : 'Save'} Event</button>
      ${existing ? `<button class="btn btn-ghost" onclick="deleteCalEvent('${existing.id}')" aria-label="Delete event"><i class="bi bi-trash3"></i></button>` : ''}
    </div>`;
  new bootstrap.Modal(document.getElementById('calEventModal')).show();
}

function updateCalEventColor(cat) {
  calEventModalColor = EVENT_CAT_COLORS[cat] || EVENT_CAT_COLORS['Event'];
}

function saveCalEvent() {
  const title = document.getElementById('ceTitle').value.trim();
  if (!title) { Toast.show('Please enter a title', 'high', 'bi-exclamation-triangle'); return; }
  const date = document.getElementById('ceDate').value;
  if (!date) { Toast.show('Please select a date', 'high', 'bi-exclamation-triangle'); return; }
  const cat = document.getElementById('ceCategory').value;
  const data = {
    title, date, category: cat, color: EVENT_CAT_COLORS[cat] || calEventModalColor,
    startTime: document.getElementById('ceStart').value,
    endTime: document.getElementById('ceEnd').value,
    description: document.getElementById('ceDesc').value.trim(),
    semesterId: DB.getActiveSemesterId(),
  };
  const events = DB.getCalendarEvents();
  if (eventEditingId) {
    const idx = events.findIndex(e => e.id === eventEditingId);
    if (idx > -1) events[idx] = { ...events[idx], ...data };
  } else {
    events.push({ id: DB.uid(), createdAt: Date.now(), ...data });
  }
  DB.saveCalendarEvents(events);
  bootstrap.Modal.getInstance(document.getElementById('calEventModal')).hide();
  Toast.show(eventEditingId ? 'Event updated' : 'Event added');
  renderCalendar();
  if (calSelectedDate) renderAgenda(calSelectedDate);
}

function deleteCalEvent(id) {
  DB.saveCalendarEvents(DB.getCalendarEvents().filter(e => e.id !== id));
  const inst = bootstrap.Modal.getInstance(document.getElementById('calEventModal'));
  if (inst) inst.hide();
  Toast.show('Event deleted');
  renderCalendar();
  if (calSelectedDate) renderAgenda(calSelectedDate);
}

/* ════════════════════════════════════════════════════════════
   UNIVERSITY EVENT MODAL
   ════════════════════════════════════════════════════════════ */
function openUnivEventModal(id, presetDate) {
  univEditingId = id || null;
  const existing = id ? DB.getUniversityEvents().find(e => e.id === id) : null;
  univModalColor = existing ? (existing.color || UNIV_COLORS[0]) : UNIV_COLORS[0];
  univModalMode = existing && existing.dates && existing.dates.length > 2 && isContiguousRange(existing.dates) ? 'range' : (existing ? 'multiple' : 'range');

  const initialDates = existing ? existing.dates.slice().sort() : (presetDate ? [presetDate] : [todayKey()]);
  const rangeStart = initialDates[0];
  const rangeEnd = initialDates[initialDates.length - 1];

  const body = document.getElementById('univEventModalBody');
  body.innerHTML = `
    <h5 class="mb-3"><i class="bi bi-bank2 me-2"></i>${existing ? 'Edit' : 'Add'} University Event</h5>
    <div class="mb-2"><label>Event Title</label><input class="form-control" id="ueTitle" placeholder="e.g. Semestral Break, Enrollment, Foundation Day" value="${existing ? escapeHtml(existing.title) : ''}"></div>
    <div class="mb-3"><label>Note (optional)</label><textarea class="form-control" id="ueNote" rows="2" placeholder="Additional details…">${existing ? escapeHtml(existing.note || '') : ''}</textarea></div>
    <div class="mb-2"><label>Color</label>
      <div class="d-flex gap-2 flex-wrap" id="ueColorPicker">
        ${UNIV_COLORS.map(c => `<div onclick="selectUnivColor('${c}')" data-color-swatch="${c}" style="width:26px;height:26px;border-radius:50%;cursor:pointer;background:${c};border:2px solid ${c === univModalColor ? '#fff' : 'transparent'};box-shadow:0 0 0 1px rgba(0,0,0,.15)" aria-label="Color ${c}"></div>`).join('')}
      </div>
    </div>
    <div class="mb-3">
      <div class="btn-group w-100" role="group">
        <button type="button" class="btn btn-ghost btn-sm ${univModalMode === 'range' ? 'active' : ''}" id="ueModeRangeBtn" onclick="setUnivMode('range')"><i class="bi bi-calendar-range me-1"></i>Date Range</button>
        <button type="button" class="btn btn-ghost btn-sm ${univModalMode === 'multiple' ? 'active' : ''}" id="ueModeMultiBtn" onclick="setUnivMode('multiple')"><i class="bi bi-calendar-plus me-1"></i>Specific Dates</button>
      </div>
    </div>
    <div id="ueRangeFields" class="${univModalMode === 'range' ? '' : 'd-none'}">
      <div class="row g-2 mb-2">
        <div class="col-6"><label>From</label><input type="date" class="form-control" id="ueRangeStart" value="${rangeStart}"></div>
        <div class="col-6"><label>To</label><input type="date" class="form-control" id="ueRangeEnd" value="${rangeEnd}"></div>
      </div>
      <div class="text-faint" style="font-size:.75rem">Every day in this range (inclusive) will show the event.</div>
    </div>
    <div id="ueMultiFields" class="${univModalMode === 'multiple' ? '' : 'd-none'}">
      <label>Dates</label>
      <div id="ueDateRows">
        ${(existing ? existing.dates.slice().sort() : (presetDate ? [presetDate] : [todayKey()])).map(d => univDateRowHtml(d)).join('')}
      </div>
      <button type="button" class="btn btn-ghost btn-sm mt-1" onclick="addUnivDateRow()"><i class="bi bi-plus-lg me-1"></i>Add Another Date</button>
    </div>
    <div class="d-flex gap-2 mt-3">
      <button class="btn btn-accent flex-grow-1" onclick="saveUnivEvent()"><i class="bi bi-check2 me-1"></i>Save Event</button>
      ${existing ? `<button class="btn btn-ghost" onclick="deleteUnivEvent('${existing.id}')" aria-label="Delete event"><i class="bi bi-trash3"></i></button>` : ''}
    </div>`;
  new bootstrap.Modal(document.getElementById('univEventModal')).show();
}

function univDateRowHtml(value) {
  return `<div class="d-flex gap-2 mb-2 uev-date-row">
    <input type="date" class="form-control" value="${value || ''}">
    <button type="button" class="btn-icon" onclick="this.parentElement.remove()" aria-label="Remove date"><i class="bi bi-x-lg"></i></button>
  </div>`;
}

function addUnivDateRow() {
  document.getElementById('ueDateRows').insertAdjacentHTML('beforeend', univDateRowHtml(''));
}

function setUnivMode(mode) {
  univModalMode = mode;
  document.getElementById('ueModeRangeBtn').classList.toggle('active', mode === 'range');
  document.getElementById('ueModeMultiBtn').classList.toggle('active', mode === 'multiple');
  document.getElementById('ueRangeFields').classList.toggle('d-none', mode !== 'range');
  document.getElementById('ueMultiFields').classList.toggle('d-none', mode !== 'multiple');
}

function selectUnivColor(c) {
  univModalColor = c;
  document.querySelectorAll('[data-color-swatch]').forEach(el => {
    el.style.border = `2px solid ${el.dataset.colorSwatch === c ? '#fff' : 'transparent'}`;
  });
}

function collectUnivDates() {
  if (univModalMode === 'range') {
    const start = document.getElementById('ueRangeStart').value;
    const end = document.getElementById('ueRangeEnd').value;
    if (!start || !end) return [];
    const dates = [];
    let d = new Date(start + 'T00:00');
    const endD = new Date(end + 'T00:00');
    if (d > endD) return [];
    while (d <= endD) { dates.push(ymdLocal(d)); d.setDate(d.getDate() + 1); }
    return dates;
  } else {
    const inputs = document.querySelectorAll('#ueDateRows input[type="date"]');
    const dates = [];
    inputs.forEach(i => { if (i.value) dates.push(i.value); });
    return [...new Set(dates)].sort();
  }
}

function saveUnivEvent() {
  const title = document.getElementById('ueTitle').value.trim();
  if (!title) { Toast.show('Please enter a title', 'high', 'bi-exclamation-triangle'); return; }
  const dates = collectUnivDates();
  if (!dates.length) { Toast.show('Please add at least one valid date', 'high', 'bi-exclamation-triangle'); return; }
  const note = document.getElementById('ueNote').value.trim();
  const events = DB.getUniversityEvents();
  if (univEditingId) {
    const ev = events.find(e => e.id === univEditingId);
    if (ev) { ev.title = title; ev.note = note; ev.dates = dates; ev.color = univModalColor; }
  } else {
    events.push({ id: DB.uid(), title, note, dates, color: univModalColor, createdAt: Date.now() });
  }
  DB.saveUniversityEvents(events);
  bootstrap.Modal.getInstance(document.getElementById('univEventModal')).hide();
  Toast.show('University event saved');
  renderCalendar();
  if (calSelectedDate) renderAgenda(calSelectedDate);
}

function deleteUnivEvent(id) {
  DB.saveUniversityEvents(DB.getUniversityEvents().filter(e => e.id !== id));
  const inst = bootstrap.Modal.getInstance(document.getElementById('univEventModal'));
  if (inst) inst.hide();
  Toast.show('University event deleted');
  renderCalendar();
  if (calSelectedDate) renderAgenda(calSelectedDate);
}

function isContiguousRange(dates) {
  const sorted = dates.slice().sort();
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + 'T00:00');
    const cur  = new Date(sorted[i] + 'T00:00');
    if ((cur - prev) / 86400000 !== 1) return false;
  }
  return true;
}
