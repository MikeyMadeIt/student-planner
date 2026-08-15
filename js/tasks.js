/* ============================================================
   TASKS.JS  — v2 with recurring tasks, bulk actions, grouping,
               score/remarks, and subject grouping
   ============================================================ */

let tkFilter      = 'all';
let tkExpandedId  = null;
let tkGroupBy     = 'none';     // 'none' | 'subject'
let tkSelected    = new Set();  // ids selected for bulk action

/* ── Init ── */
function initTasks() {
  populateSubjectOptions();
  renderTasks();

  document.getElementById('tkSearch').addEventListener('input', debounce(renderTasks, 180));

  document.getElementById('filterBtn').addEventListener('click', function () {
    var fp = document.getElementById('filterPanel');
    var sp = document.getElementById('sortPanel');
    var opening = fp.style.display === 'none';
    sp.style.display = 'none';
    fp.style.display = opening ? 'block' : 'none';
  });

  document.getElementById('sortBtn').addEventListener('click', function () {
    var fp = document.getElementById('filterPanel');
    var sp = document.getElementById('sortPanel');
    var opening = sp.style.display === 'none';
    fp.style.display = 'none';
    sp.style.display = opening ? 'block' : 'none';
  });

  document.querySelectorAll('#filterPanel .tk-panel-opt[data-filter]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      tkFilter = this.dataset.filter;
      document.querySelectorAll('#filterPanel .tk-panel-opt').forEach(function (b) { b.classList.remove('active'); });
      this.classList.add('active');
      document.getElementById('filterDot').style.display = tkFilter !== 'all' ? 'block' : 'none';
      document.getElementById('filterPanel').style.display = 'none';
      tkSelected.clear();
      renderTasks();
    });
  });

  document.querySelectorAll('#sortPanel .tk-panel-opt[data-sort]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.getElementById('tkSort').value = this.dataset.sort;
      document.querySelectorAll('#sortPanel .tk-panel-opt[data-sort]').forEach(function (b) { b.classList.remove('active'); });
      this.classList.add('active');
      updateSortDot();
      renderTasks();
    });
  });

  document.querySelectorAll('#sortPanel .tk-panel-opt[data-cat]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.getElementById('tkCatFilter').value = this.dataset.cat;
      document.querySelectorAll('#sortPanel .tk-panel-opt[data-cat]').forEach(function (b) { b.classList.remove('active'); });
      this.classList.add('active');
      updateSortDot();
      renderTasks();
    });
  });

  // Group-by controls
  document.querySelectorAll('#sortPanel .tk-panel-opt[data-groupby]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      tkGroupBy = this.dataset.groupby;
      document.querySelectorAll('#sortPanel .tk-panel-opt[data-groupby]').forEach(function (b) { b.classList.remove('active'); });
      this.classList.add('active');
      updateSortDot();
      renderTasks();
    });
  });

  var params = new URLSearchParams(location.search);
  if (params.get('new') === '1') openTaskModal(null, params.get('syllabusWeekId'), params.get('title'));
  window.quickAddHandlers = window.quickAddHandlers || {};
  window.quickAddHandlers['task'] = function () { openTaskModal(); };
}

function updateSortDot() {
  var nonDefault = document.getElementById('tkSort').value !== 'due'
    || document.getElementById('tkCatFilter').value !== ''
    || document.getElementById('tkSubFilter').value !== ''
    || tkGroupBy !== 'none';
  document.getElementById('sortDot').style.display = nonDefault ? 'block' : 'none';
}

function populateSubjectOptions() {
  var semId = DB.getActiveSemesterId();
  var subs  = DB.getSubjects().filter(function (s) { return s.semesterId === semId; });
  var curSub = document.getElementById('tkSubFilter').value;
  var wrap   = document.getElementById('tkSubOptions');
  if (!wrap) return;
  wrap.innerHTML = '<button class="tk-panel-opt ' + (curSub === '' ? 'active' : '') + '" data-sub="">All</button>' +
    subs.map(function (s) {
      return '<button class="tk-panel-opt ' + (curSub === s.id ? 'active' : '') + '" data-sub="' + s.id + '">' + escHtml(s.code) + '</button>';
    }).join('');
  wrap.querySelectorAll('.tk-panel-opt').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.getElementById('tkSubFilter').value = this.dataset.sub;
      wrap.querySelectorAll('.tk-panel-opt').forEach(function (b) { b.classList.remove('active'); });
      this.classList.add('active');
      updateSortDot();
      renderTasks();
    });
  });
}

/* ── Recurring helpers ── */
function addDays(dateStr, n) {
  var d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return ymdLocal(d);
}
function addMonths(dateStr, n) {
  var d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return ymdLocal(d);
}
function nextOccurrenceDate(dueDate, repeatType) {
  if (!dueDate || !repeatType || repeatType === 'none') return null;
  if (repeatType === 'daily')   return addDays(dueDate, 1);
  if (repeatType === 'weekly')  return addDays(dueDate, 7);
  if (repeatType === 'monthly') return addMonths(dueDate, 1);
  return null;
}

function generateNextOccurrence(completedTask) {
  var repeat = completedTask.repeat || 'none';
  if (repeat === 'none') return;
  if (!completedTask.dueDate) return;
  // Prevent duplicate: check if a child already exists
  var tasks = DB.getTasks();
  var already = tasks.find(function (t) {
    return t.parentTaskId === completedTask.id && t.status !== 'completed';
  });
  if (already) return;

  var nextDate = nextOccurrenceDate(completedTask.dueDate, repeat);
  if (!nextDate) return;

  var child = {
    id: DB.uid(),
    createdAt: Date.now(),
    semesterId: completedTask.semesterId,
    title: completedTask.title,
    description: completedTask.description || '',
    subjectId: completedTask.subjectId || null,
    category: completedTask.category || 'Other',
    priority: completedTask.priority || 'low',
    dueDate: nextDate,
    dueTime: completedTask.dueTime || '23:59',
    checklist: (completedTask.checklist || []).map(function (c) { return { text: c.text, done: false }; }),
    repeat: repeat,
    parentTaskId: completedTask.id,
    status: 'not-started',
    progress: 0,
    score: null,
    remarks: '',
    syllabusWeekId: completedTask.syllabusWeekId || null,
    updatedAt: Date.now(),
  };
  tasks.push(child);
  DB.saveTasks(tasks);
  Toast.show('Next occurrence scheduled for ' + nextDate + ' (' + repeat + ')');
}

/* ── Compute task status ── */
function computeStatus(t) {
  if (t.status === 'completed') return 'completed';
  // Respect explicit not-started (reopened) even if checklist is 100%
  var prog = computeProgress(t);
  var now  = new Date();
  var due  = t.dueDate ? new Date(t.dueDate + 'T' + (t.dueTime || '23:59') + ':00') : null;
  var isOverdue = due && due < now;
  if (t.status === 'not-started') {
    if (isOverdue) return 'overdue';
    return 'not-started';
  }
  if (isOverdue && prog < 100) return 'overdue';
  if (prog === 100) return 'completed';
  if (prog > 0) return 'in-progress';
  return 'not-started';
}

function computeProgress(t) {
  if (!t.checklist || t.checklist.length === 0) return t.progress || 0;
  var done = t.checklist.filter(function (c) { return c.done; }).length;
  return Math.round((done / t.checklist.length) * 100);
}

function getDueBucket(t) {
  var status = computeStatus(t);
  if (status === 'completed') return 'completed';
  if (status === 'overdue')   return 'overdue';
  if (!t.dueDate) return 'upcoming';
  var today    = todayKey();
  var tomorrow = ymdLocal(new Date(Date.now() + 86400000));
  if (t.dueDate === today)    return 'today';
  if (t.dueDate === tomorrow) return 'tomorrow';
  if (t.dueDate > today)      return 'upcoming';
  return 'overdue';
}

/* ── Labels ── */
function dueLabelHtml(t, status) {
  if (!t.dueDate) return '';
  var due     = new Date(t.dueDate + 'T' + (t.dueTime || '23:59') + ':00');
  var now     = new Date();
  var diffMs  = due - now;
  var diffMins= Math.round(diffMs / 60000);
  var diffDays= Math.floor(diffMs / 86400000);
  var timeStr = fmtTime(t.dueTime || '23:59');
  var relLabel= '', relClass = '';

  if (status === 'completed') {
    var d = new Date(t.dueDate + 'T00:00:00');
    relLabel = 'Due ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' + timeStr;
    relClass = 'tk-due-done';
  } else if (diffMins < 0) {
    var overDays = Math.abs(Math.ceil(diffMs / 86400000));
    relLabel = overDays === 0 ? 'Overdue today' : 'Overdue by ' + overDays + ' day' + (overDays !== 1 ? 's' : '');
    relClass = 'tk-due-overdue';
  } else if (t.dueDate === todayKey()) {
    relLabel = 'Due today · ' + timeStr;
    relClass = 'tk-due-today';
  } else if (diffDays === 1) {
    relLabel = 'Due tomorrow · ' + timeStr;
    relClass = 'tk-due-soon';
  } else if (diffDays <= 7) {
    var d = new Date(t.dueDate + 'T00:00:00');
    relLabel = d.toLocaleDateString('en-US', { weekday: 'short' }) + ', ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' + timeStr;
    relClass = 'tk-due-week';
  } else {
    var d = new Date(t.dueDate + 'T00:00:00');
    relLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' + timeStr;
    relClass = 'tk-due-normal';
  }
  return '<span class="tk-due-label ' + relClass + '">' + relLabel + '</span>';
}

function timeLeftLabel(t, status) {
  if (status === 'completed' || status === 'overdue' || !t.dueDate) return '';
  var due    = new Date(t.dueDate + 'T' + (t.dueTime || '23:59') + ':00');
  var diffMs = due - new Date();
  if (diffMs < 0) return '';
  var diffDays = Math.floor(diffMs / 86400000);
  var diffHrs  = Math.floor(diffMs / 3600000);
  var label = '';
  if (diffDays === 0 && diffHrs < 1) {
    var diffMins = Math.round(diffMs / 60000);
    label = diffMins + 'm left';
  } else if (diffDays === 0) {
    label = diffHrs + 'h left';
  } else {
    label = diffDays + ' day' + (diffDays !== 1 ? 's' : '') + ' left';
  }
  return '<span class="tk-time-left">' + label + '</span>';
}

function priDot(p) {
  var map = { high: 'tk-pri-high', medium: 'tk-pri-med', low: 'tk-pri-low' };
  return '<span class="tk-pri-dot ' + (map[p] || '') + '"></span>';
}

function catLabel(c) {
  return '<span class="tk-cat-lbl">' + escHtml(c || 'Other') + '</span>';
}

function repeatBadgeHtml(t) {
  var r = t.repeat || 'none';
  if (r === 'none') return '';
  var labels = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
  return '<span class="tk-repeat-badge" title="Repeats ' + r + '"><i class="bi bi-arrow-repeat"></i> ' + (labels[r] || r) + '</span>';
}

function progressHtml(prog, checklist) {
  var done  = checklist ? checklist.filter(function (c) { return c.done; }).length : 0;
  var total = checklist ? checklist.length : 0;
  var hasChecklist = total > 0;
  var countLabel   = hasChecklist ? (done + ' / ' + total + ' item' + (total !== 1 ? 's' : '')) : (prog > 0 ? prog + '%' : '');
  return '<div class="tk-progress-wrap">' +
    '<div class="tk-progress-bar-track"><div class="tk-progress-bar-fill" style="width:' + prog + '%"></div></div>' +
    '<div class="tk-progress-meta"><span class="tk-prog-pct">' + prog + '%</span>' +
    (countLabel ? '<span class="tk-prog-count">' + countLabel + '</span>' : '') + '</div></div>';
}

function checklistHtml(t) {
  if (!t.checklist || !t.checklist.length) return '<div class="tk-cl-empty"><span class="text-faint" style="font-size:.78rem">No checklist items. Use Edit to add items.</span></div>';
  return '<div class="tk-cl-list" id="clList_' + t.id + '">' +
    t.checklist.map(function (c, i) {
      return '<div class="tk-cl-item" data-taskid="' + t.id + '" data-i="' + i + '">' +
        '<button class="tk-cl-check ' + (c.done ? 'done' : '') + '" onclick="toggleChecklistItem(\'' + t.id + '\', ' + i + ')" title="' + (c.done ? 'Uncheck' : 'Check') + '">' +
        (c.done ? '<i class="bi bi-check-lg"></i>' : '') + '</button>' +
        '<span class="tk-cl-text ' + (c.done ? 'done' : '') + '">' + escHtml(c.text) + '</span></div>';
    }).join('') + '</div>';
}

function scoreRemarksHtml(t) {
  if ((t.score === null || t.score === undefined || t.score === '') && !t.remarks) return '';
  var html = '<div class="tk-score-section">';
  if (t.score !== null && t.score !== undefined && t.score !== '') {
    html += '<div class="tk-score-row"><span class="tk-score-k">Score</span><span class="tk-score-v">' + escHtml(String(t.score)) + '%</span></div>';
  }
  if (t.remarks) {
    html += '<div class="tk-score-row"><span class="tk-score-k">Remarks</span><span class="tk-score-v tk-remarks-v">' + escHtml(t.remarks) + '</span></div>';
  }
  html += '</div>';
  return html;
}

function metaGridHtml(t) {
  var subs = DB.getSubjects();
  var sub  = subs.find(function (s) { return s.id === t.subjectId; });
  var created = t.createdAt ? new Date(t.createdAt) : null;
  var createdStr = created ? (created.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' + created.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })) : '—';
  var dueD = t.dueDate ? new Date(t.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  var dueT = t.dueTime ? fmtTime(t.dueTime) : '';
  var repeatLabel = t.repeat && t.repeat !== 'none' ? (t.repeat.charAt(0).toUpperCase() + t.repeat.slice(1)) : 'None';
  return '<div class="tk-meta-grid">' +
    '<div class="tk-meta-row"><span class="tk-meta-k">Created</span><span class="tk-meta-v">' + createdStr + '</span></div>' +
    '<div class="tk-meta-row"><span class="tk-meta-k">Due</span><span class="tk-meta-v">' + dueD + (dueT ? ' · ' + dueT : '') + '</span></div>' +
    '<div class="tk-meta-row"><span class="tk-meta-k">Category</span><span class="tk-meta-v">' + escHtml(t.category || '—') + '</span></div>' +
    '<div class="tk-meta-row"><span class="tk-meta-k">Priority</span><span class="tk-meta-v tk-meta-pri-' + (t.priority || 'low') + '">' + ((t.priority || 'low').charAt(0).toUpperCase() + (t.priority || 'low').slice(1)) + '</span></div>' +
    '<div class="tk-meta-row"><span class="tk-meta-k">Subject</span><span class="tk-meta-v">' + (sub ? escHtml(sub.name || sub.code) : '—') + '</span></div>' +
    '<div class="tk-meta-row"><span class="tk-meta-k">Repeat</span><span class="tk-meta-v">' + repeatLabel + '</span></div>' +
    '</div>';
}

/* ── Build a single task card ── */
function buildTaskCard(t, inSubjectGroup) {
  var status      = computeStatus(t);
  var prog        = computeProgress(t);
  var isExpanded  = tkExpandedId === t.id;
  var isCompleted = status === 'completed';
  var isOverdue   = status === 'overdue';
  var isSelected  = tkSelected.has(t.id);
  var subs        = DB.getSubjects();
  var sub         = subs.find(function (s) { return s.id === t.subjectId; });

  var metaLine = catLabel(t.category || 'Other');
  if (t.priority) metaLine += priDot(t.priority) + '<span class="tk-pri-lbl tk-pri-' + t.priority + '">' + t.priority.charAt(0).toUpperCase() + t.priority.slice(1) + '</span>';
  if (sub && !inSubjectGroup) metaLine += '<span class="tk-sep">·</span><span class="tk-sub-name">' + escHtml(sub.code || sub.name) + '</span>';

  var dueHtml    = dueLabelHtml(t, status);
  var tlHtml     = timeLeftLabel(t, status);
  var repeatBadge= repeatBadgeHtml(t);

  var statusBadge = '';
  if (isOverdue)   statusBadge = '<span class="tk-status-badge overdue"><i class="bi bi-exclamation-circle"></i>Overdue</span>';
  else if (isCompleted) statusBadge = '<span class="tk-status-badge completed"><i class="bi bi-check-circle"></i>Done</span>';

  var collapsed = !isExpanded ? '<div class="tk-card-body-collapsed">' +
    '<div class="tk-inline-meta">' + metaLine + (repeatBadge ? '<span class="tk-sep">·</span>' + repeatBadge : '') + '</div>' +
    progressHtml(prog, t.checklist) +
    '<div class="tk-due-row">' + dueHtml + tlHtml + '</div></div>' : '';

  var expanded = isExpanded ? '<div class="tk-card-body-expanded">' +
    (t.description ? '<p class="tk-description">' + escHtml(t.description) + '</p>' : '') +
    progressHtml(prog, t.checklist) +
    '<div class="tk-cl-section"><div class="tk-cl-heading">Checklist</div>' + checklistHtml(t) + '</div>' +
    '<hr class="tk-divider">' +
    metaGridHtml(t) +
    scoreRemarksHtml(t) +
    '<div class="tk-card-actions">' +
    '<button class="btn btn-ghost btn-sm" onclick="openTaskModal(\'' + t.id + '\')"><i class="bi bi-pencil me-1"></i>Edit</button>' +
    '<button class="btn tk-btn-danger btn-sm" onclick="deleteTask(\'' + t.id + '\')"><i class="bi bi-trash me-1"></i>Delete</button>' +
    '</div></div>' : '';

  var completeBtn = isCompleted
    ? '<button class="tk-complete-btn tk-complete-btn-done" onclick="event.stopPropagation();toggleTaskComplete(\'' + t.id + '\')" title="Mark as Active"><i class="bi bi-arrow-counterclockwise"></i><span>Reopen</span></button>'
    : '<button class="tk-complete-btn" onclick="event.stopPropagation();toggleTaskComplete(\'' + t.id + '\')" title="Mark as Complete"><i class="bi bi-check-lg"></i><span>Complete</span></button>';

  return '<div class="tk-card ' + (isCompleted ? 'completed' : '') + ' ' + (isOverdue ? 'overdue' : '') + ' ' + (isExpanded ? 'expanded' : '') + ' ' + (isSelected ? 'tk-selected' : '') + '" id="tkCard_' + t.id + '" data-taskid="' + t.id + '">' +
    '<div class="tk-card-header" onclick="toggleCard(\'' + t.id + '\', event)">' +
    '<button class="tk-bulk-check ' + (isSelected ? 'selected' : '') + '" onclick="event.stopPropagation();toggleSelect(\'' + t.id + '\')" title="' + (isSelected ? 'Deselect' : 'Select for bulk action') + '" aria-label="' + (isSelected ? 'Deselect task' : 'Select task') + '">' +
    (isSelected ? '<i class="bi bi-check-lg"></i>' : '') + '</button>' +
    '<div class="tk-card-title-wrap">' +
    '<span class="tk-task-title ' + (isCompleted ? 'done' : '') + '">' + escHtml(t.title) + '</span>' +
    statusBadge + '</div>' +
    completeBtn +
    '<button class="tk-expand-btn" title="' + (isExpanded ? 'Collapse' : 'Expand') + '" onclick="event.stopPropagation();toggleCard(\'' + t.id + '\')">' +
    '<i class="bi bi-chevron-' + (isExpanded ? 'up' : 'down') + '"></i></button></div>' +
    collapsed + expanded + '</div>';
}

/* ── Group builder (by due date) ── */
function buildDueBucketGroup(label, icon, tasks, groupClass) {
  if (!tasks.length) return '';
  var cards = tasks.map(function (t) { return buildTaskCard(t, false); }).join('');
  return '<div class="tk-group ' + groupClass + '">' +
    '<div class="tk-group-heading"><i class="bi ' + icon + '"></i>' + label + '<span class="tk-group-count">' + tasks.length + '</span>' + buildSelectAllGroupBtn(tasks) + '</div>' +
    '<div class="tk-group-cards">' + cards + '</div></div>';
}

function buildSelectAllGroupBtn(tasks) {
  var ids = tasks.map(function (t) { return t.id; });
  return '<button class="tk-group-select-all" onclick="event.stopPropagation();toggleSelectGroup(' + JSON.stringify(ids) + ')" title="Select all in group"><i class="bi bi-check2-square"></i></button>';
}

/* ── Bulk toolbar ── */
function renderBulkToolbar(visibleIds) {
  var existing = document.getElementById('tkBulkToolbar');
  if (existing) existing.remove();

  if (tkSelected.size === 0) return;

  var count = tkSelected.size;
  var label = count + ' selected';

  var toolbar = document.createElement('div');
  toolbar.id  = 'tkBulkToolbar';
  toolbar.className = 'tk-bulk-toolbar';
  toolbar.innerHTML =
    '<span class="tk-bulk-count"><i class="bi bi-check2-square"></i>' + label + '</span>' +
    '<div class="tk-bulk-actions">' +
    '<button class="tk-bulk-btn tk-bulk-complete" onclick="bulkComplete()" title="Mark selected tasks as completed"><i class="bi bi-check-lg"></i><span>Done</span></button>' +
    '<button class="tk-bulk-btn tk-bulk-reopen"   onclick="bulkActive()"   title="Reopen selected tasks as active"><i class="bi bi-arrow-counterclockwise"></i><span>Reopen</span></button>' +
    '<button class="tk-bulk-btn tk-bulk-delete"   onclick="bulkDelete()"   title="Delete selected tasks"><i class="bi bi-trash"></i></button>' +
    '<button class="tk-bulk-btn tk-bulk-clear"    onclick="clearSelection()" title="Clear selection"><i class="bi bi-x"></i></button>' +
    '</div>';

  var wrap = document.getElementById('tkGroups');
  if (wrap) wrap.parentNode.insertBefore(toolbar, wrap);
}

/* ── Select All (page-level) — rendered in controls bar ── */
function renderSelectAllBtn(visibleIds) {
  var btn = document.getElementById('selectAllBtn');
  if (!btn) return;
  var allSelected = visibleIds.length > 0 && visibleIds.every(function (id) { return tkSelected.has(id); });
  var someSelected = tkSelected.size > 0;
  var count = tkSelected.size;

  if (allSelected) {
    btn.classList.add('tk-select-all-active');
    btn.innerHTML = '<i class="bi bi-check2-square"></i><span>' + count + ' Selected</span>';
  } else if (someSelected) {
    btn.classList.remove('tk-select-all-active');
    btn.innerHTML = '<i class="bi bi-dash-square"></i><span>' + count + ' Selected</span>';
  } else {
    btn.classList.remove('tk-select-all-active');
    btn.innerHTML = '<i class="bi bi-square"></i><span>Select</span>';
  }

  btn.onclick = function () {
    toggleSelectAll(visibleIds, !allSelected);
  };
}

/* ── Toggle select ── */
function toggleSelect(id) {
  if (tkSelected.has(id)) tkSelected.delete(id);
  else tkSelected.add(id);
  renderTasks();
}

function toggleSelectGroup(ids) {
  var allSelected = ids.every(function (id) { return tkSelected.has(id); });
  ids.forEach(function (id) { if (allSelected) tkSelected.delete(id); else tkSelected.add(id); });
  renderTasks();
}

function toggleSelectAll(ids, checked) {
  ids.forEach(function (id) { if (checked) tkSelected.add(id); else tkSelected.delete(id); });
  renderTasks();
}

function clearSelection() { tkSelected.clear(); renderTasks(); }

/* ── Bulk actions ── */
function bulkComplete() {
  var tasks = DB.getTasks();
  var ids   = Array.from(tkSelected);
  var changed = 0;
  ids.forEach(function (id) {
    var t = tasks.find(function (x) { return x.id === id; });
    if (!t) return;
    var wasCompleted = t.status === 'completed';
    t.status      = 'completed';
    t.progress    = 100;
    t.completedAt = Date.now();
    t.updatedAt   = Date.now();
    if (t.checklist) t.checklist.forEach(function (c) { c.done = true; });
    if (!wasCompleted) { generateNextOccurrence(t); }
    changed++;
  });
  DB.saveTasks(tasks);
  tkSelected.clear();
  Toast.show(changed + ' task' + (changed !== 1 ? 's' : '') + ' completed!');
  renderTasks();
}

function bulkActive() {
  var tasks = DB.getTasks();
  var ids   = Array.from(tkSelected);
  var changed = 0;
  ids.forEach(function (id) {
    var t = tasks.find(function (x) { return x.id === id; });
    if (!t) return;
    t.status    = 'not-started';
    t.progress  = computeProgress(t);
    t.updatedAt = Date.now();
    delete t.completedAt;
    changed++;
  });
  DB.saveTasks(tasks);
  tkSelected.clear();
  Toast.show(changed + ' task' + (changed !== 1 ? 's' : '') + ' reopened');
  renderTasks();
}

function bulkDelete() {
  var count = tkSelected.size;
  confirmAction({
    title: 'Delete ' + count + ' task' + (count !== 1 ? 's' : '') + '?',
    message: 'This will permanently remove the selected tasks.',
    confirmLabel: 'Delete', danger: true, icon: 'bi-trash-fill',
    onConfirm: function () {
      var ids  = Array.from(tkSelected);
      var tasks = DB.getTasks().filter(function (t) { return !ids.includes(t.id); });
      DB.saveTasks(tasks);
      if (tkExpandedId && ids.includes(tkExpandedId)) tkExpandedId = null;
      tkSelected.clear();
      Toast.show(count + ' task' + (count !== 1 ? 's' : '') + ' deleted');
      renderTasks();
    }
  });
}

/* ── Main render ── */
function renderTasks() {
  var semId    = DB.getActiveSemesterId();
  var allTasks = DB.getTasks().filter(function (t) { return t.semesterId === semId; });

  // Auto-fix: sync completed status for tasks with 100% checklist progress
  // BUT only if the task hasn't been explicitly set to not-started (reopened)
  var changed = false;
  allTasks.forEach(function (t) {
    if (t.status === 'not-started') return; // respect explicit reopen
    var prog = computeProgress(t);
    if (prog === 100 && t.status !== 'completed') {
      t.status = 'completed';
      if (!t.completedAt) t.completedAt = Date.now();
      changed = true;
    }
  });
  if (changed) DB.saveTasks(DB.getTasks());

  // Stats
  var doneStat    = allTasks.filter(function (t) { return computeStatus(t) === 'completed'; }).length;
  var overdueStat = allTasks.filter(function (t) { return computeStatus(t) === 'overdue'; }).length;
  document.getElementById('statTotal').textContent   = allTasks.length;
  document.getElementById('statActive').textContent  = allTasks.length - doneStat;
  document.getElementById('statDone').textContent    = doneStat;
  document.getElementById('statOverdue').textContent = overdueStat;

  populateSubjectOptions();

  var q      = document.getElementById('tkSearch').value.toLowerCase().trim();
  var cat    = document.getElementById('tkCatFilter').value;
  var subId  = document.getElementById('tkSubFilter').value;
  var sort   = document.getElementById('tkSort').value;

  var filtered = allTasks.filter(function (t) {
    if (q && !t.title.toLowerCase().includes(q) && !(t.description || '').toLowerCase().includes(q)) return false;
    if (cat && t.category !== cat) return false;
    if (subId && t.subjectId !== subId) return false;
    if (tkFilter === 'active')    return computeStatus(t) !== 'completed';
    if (tkFilter === 'completed') return computeStatus(t) === 'completed';
    if (tkFilter === 'overdue')   return computeStatus(t) === 'overdue';
    return true;
  });

  // Sort
  var priRank = { high: 0, medium: 1, low: 2 };
  if (sort === 'due') {
    filtered.sort(function (a, b) {
      return ((a.dueDate || '9999') + (a.dueTime || '23:59')).localeCompare((b.dueDate || '9999') + (b.dueTime || '23:59'));
    });
  } else if (sort === 'priority') {
    filtered.sort(function (a, b) { return (priRank[a.priority] || 2) - (priRank[b.priority] || 2); });
  } else if (sort === 'created') {
    filtered.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  } else if (sort === 'updated') {
    filtered.sort(function (a, b) { return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0); });
  } else if (sort === 'alpha') {
    filtered.sort(function (a, b) { return a.title.localeCompare(b.title); });
  }

  // Clean selection — remove ids no longer visible
  var visibleIds = filtered.map(function (t) { return t.id; });
  Array.from(tkSelected).forEach(function (id) { if (!visibleIds.includes(id)) tkSelected.delete(id); });

  var wrap = document.getElementById('tkGroups');
  // Remove old bulk toolbar
  var old = document.getElementById('tkBulkToolbar');
  if (old) old.remove();

  if (!filtered.length) {
    renderSelectAllBtn([]);
    wrap.innerHTML = '<div class="tk-empty-state glass card-pad fade-in">' +
      '<i class="bi bi-inbox"></i>' +
      '<p class="tk-empty-title">' + (tkFilter === 'completed' ? 'No completed tasks yet.' : tkFilter === 'overdue' ? 'No overdue tasks.' : 'No tasks yet') + '</p>' +
      '<p class="tk-empty-sub">' + (tkFilter === 'all' ? 'Start organizing your work for this semester.' : 'Nothing here right now.') + '</p></div>';
    return;
  }

  var html = '';

  if (tkGroupBy === 'subject') {
    html = renderSubjectGroups(filtered);
  } else {
    var today     = filtered.filter(function (t) { return getDueBucket(t) === 'today'; });
    var tomorrow  = filtered.filter(function (t) { return getDueBucket(t) === 'tomorrow'; });
    var upcoming  = filtered.filter(function (t) { return getDueBucket(t) === 'upcoming'; });
    var overdue   = filtered.filter(function (t) { return getDueBucket(t) === 'overdue'; });
    var completed = filtered.filter(function (t) { return getDueBucket(t) === 'completed'; });

    if (overdue.length)   html += buildDueBucketGroup('Overdue',  'bi-exclamation-triangle-fill', overdue,   'group-overdue');
    if (today.length)     html += buildDueBucketGroup('Today',    'bi-sun-fill',                  today,     'group-today');
    if (tomorrow.length)  html += buildDueBucketGroup('Tomorrow', 'bi-calendar2-day',             tomorrow,  'group-tomorrow');
    if (upcoming.length)  html += buildDueBucketGroup('Upcoming', 'bi-arrow-right-circle',        upcoming,  'group-upcoming');
    if (completed.length) html += buildDueBucketGroup('Completed','bi-check-circle-fill',         completed, 'group-completed');
  }

  wrap.innerHTML = '<div class="tk-groups-wrap fade-in">' + html + '</div>';

  // Update the Select All button state
  renderSelectAllBtn(visibleIds);

  // Inject bulk toolbar above wrap if needed
  if (tkSelected.size > 0) renderBulkToolbar(visibleIds);
}

/* ── Subject grouping ── */
function renderSubjectGroups(tasks) {
  var subs   = DB.getSubjects();
  var semId  = DB.getActiveSemesterId();
  var semSubs= subs.filter(function (s) { return s.semesterId === semId; });

  var groups  = {};
  var noSubject = [];

  tasks.forEach(function (t) {
    if (t.subjectId) {
      if (!groups[t.subjectId]) groups[t.subjectId] = [];
      groups[t.subjectId].push(t);
    } else {
      noSubject.push(t);
    }
  });

  var html = '';
  semSubs.forEach(function (sub) {
    var list = groups[sub.id] || [];
    if (!list.length) return;
    var cards = list.map(function (t) { return buildTaskCard(t, true); }).join('');
    var ids   = list.map(function (t) { return t.id; });
    html += '<div class="tk-group tk-group-subject">' +
      '<div class="tk-group-heading tk-group-heading-sub">' +
      '<span class="tk-sub-color-dot" style="background:' + (sub.color || 'rgb(var(--accent))') + '"></span>' +
      '<span class="tk-group-sub-name">' + escHtml((sub.code ? sub.code + ' — ' : '') + (sub.name || sub.desc || '')) + '</span>' +
      '<span class="tk-group-count">' + list.length + '</span>' +
      buildSelectAllGroupBtn(list) + '</div>' +
      '<div class="tk-group-cards">' + cards + '</div></div>';
  });

  if (noSubject.length) {
    var cards = noSubject.map(function (t) { return buildTaskCard(t, true); }).join('');
    html += '<div class="tk-group tk-group-subject">' +
      '<div class="tk-group-heading">' +
      '<i class="bi bi-tag"></i>Unassigned<span class="tk-group-count">' + noSubject.length + '</span>' +
      buildSelectAllGroupBtn(noSubject) + '</div>' +
      '<div class="tk-group-cards">' + cards + '</div></div>';
  }

  return html || '<div class="tk-group-empty">No tasks match the current filters.</div>';
}

/* ── Toggle card expand/collapse ── */
function toggleCard(id, evt) {
  // If called from the header div directly, check we didn't click a button
  if (evt && evt.target && (evt.target.closest('.tk-bulk-check') || evt.target.closest('.tk-complete-btn') || evt.target.closest('.tk-expand-btn'))) return;
  tkExpandedId = tkExpandedId === id ? null : id;
  renderTasks();
  if (tkExpandedId) {
    setTimeout(function () {
      var el = document.getElementById('tkCard_' + id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);
  }
}

/* ── Complete / uncomplete task ── */
function toggleTaskComplete(id) {
  var tasks = DB.getTasks();
  var t     = tasks.find(function (x) { return x.id === id; });
  if (!t) return;
  if (t.status === 'completed') {
    t.status   = 'not-started';
    t.progress = computeProgress(t);
    delete t.completedAt;
  } else {
    t.status     = 'completed';
    t.progress   = 100;
    t.completedAt= Date.now();
    if (t.checklist) t.checklist.forEach(function (c) { c.done = true; });
    DB.saveTasks(tasks);
    generateNextOccurrence(t);
    fireConfetti();
    Toast.show('Task completed! 🎉');
    renderTasks();
    return;
  }
  DB.saveTasks(tasks);
  renderTasks();
}

/* ── Checklist live interactions ── */
function toggleChecklistItem(taskId, idx) {
  var tasks = DB.getTasks();
  var t     = tasks.find(function (x) { return x.id === taskId; });
  if (!t || !t.checklist) return;
  t.checklist[idx].done = !t.checklist[idx].done;
  var prog = computeProgress(t);
  t.progress  = prog;
  t.updatedAt = Date.now();
  if (prog === 100 && t.status !== 'completed') {
    t.status     = 'completed';
    t.completedAt= Date.now();
    DB.saveTasks(tasks);
    generateNextOccurrence(t);
    fireConfetti();
    Toast.show('All items done — task completed! 🎉');
    renderTasks();
    return;
  }
  if (prog < 100 && t.status === 'completed') {
    t.status = 'in-progress';
    delete t.completedAt;
  }
  DB.saveTasks(tasks);
  renderTasks();
}

function addChecklistItemLive(taskId) {
  var tasks = DB.getTasks();
  var t     = tasks.find(function (x) { return x.id === taskId; });
  if (!t) return;
  var text = prompt('New checklist item:');
  if (!text || !text.trim()) return;
  if (!t.checklist) t.checklist = [];
  t.checklist.push({ text: text.trim(), done: false });
  t.progress  = computeProgress(t);
  t.updatedAt = Date.now();
  DB.saveTasks(tasks);
  tkExpandedId = taskId;
  renderTasks();
}

function deleteChecklistItem(taskId, idx) {
  var tasks = DB.getTasks();
  var t     = tasks.find(function (x) { return x.id === taskId; });
  if (!t || !t.checklist) return;
  t.checklist.splice(idx, 1);
  t.progress  = computeProgress(t);
  t.updatedAt = Date.now();
  DB.saveTasks(tasks);
  tkExpandedId = taskId;
  renderTasks();
}

/* ── Delete task ── */
function deleteTask(id) {
  var t = DB.getTasks().find(function (x) { return x.id === id; });
  if (!t) return;
  confirmAction({
    title: 'Delete this task?',
    message: 'This will permanently remove the task and its checklist items.',
    confirmLabel: 'Delete', danger: true, icon: 'bi-trash-fill',
    onConfirm: function () {
      if (tkExpandedId === id) tkExpandedId = null;
      tkSelected.delete(id);
      DB.saveTasks(DB.getTasks().filter(function (x) { return x.id !== id; }));
      Toast.show('Task deleted');
      renderTasks();
    }
  });
}

/* ── Add/Edit Modal ── */
function openTaskModal(id, prefillSyllabusWeekId, prefillTitle) {
  var t        = id ? DB.getTasks().find(function (x) { return x.id === id; }) : null;
  var isEdit   = !!t;
  document.getElementById('taskModalTitle').textContent = t ? 'Edit Task' : 'Add Task';
  var semId    = DB.getActiveSemesterId();
  var subs     = DB.getSubjects().filter(function (s) { return s.semesterId === semId; });
  var checklist= t && t.checklist ? t.checklist : [];

  var CATEGORIES = ['Academic', 'Assignment', 'Project', 'Exam', 'Quiz', 'Homework', 'Personal', 'Organization', 'Other'];
  var PRIORITIES = ['low', 'medium', 'high'];
  var REPEATS    = [
    { value: 'none',    label: 'None',    desc: '' },
    { value: 'daily',   label: 'Daily',   desc: 'Repeat this task every day.' },
    { value: 'weekly',  label: 'Weekly',  desc: 'Repeat this task every week.' },
    { value: 'monthly', label: 'Monthly', desc: 'Repeat this task every month.' },
  ];
  var curRepeat = t ? (t.repeat || 'none') : 'none';

  var repeatOptions = REPEATS.map(function (r) {
    return '<option value="' + r.value + '" ' + (curRepeat === r.value ? 'selected' : '') + ' data-desc="' + r.desc + '">' + r.label + '</option>';
  }).join('');

  var repeatDesc = REPEATS.find(function (r) { return r.value === curRepeat; });
  var repeatDescHtml = (repeatDesc && repeatDesc.desc) ? '<div class="tk-repeat-hint" id="tRepeatHint">' + repeatDesc.desc + '</div>' : '<div class="tk-repeat-hint" id="tRepeatHint" style="display:none"></div>';

  var scoreVal   = (t && t.score !== null && t.score !== undefined) ? t.score : '';
  var remarksVal = t ? (t.remarks || '') : '';

  var createdNote = t ? '<div class="col-12"><div class="tk-modal-created-note"><i class="bi bi-clock"></i> Created ' +
    new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' +
    new Date(t.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + '</div></div>' : '';

  var parentNote = t && t.parentTaskId ? '<div class="col-12"><div class="tk-repeat-hint"><i class="bi bi-arrow-repeat me-1"></i>This is a recurring instance of another task.</div></div>' : '';

  document.getElementById('taskModalBody').innerHTML =
    '<div class="row g-2">' +
    '<input type="hidden" id="tId" value="' + (t ? t.id : '') + '">' +
    '<input type="hidden" id="tSyllabusWeekId" value="' + (t ? (t.syllabusWeekId || '') : (prefillSyllabusWeekId || '')) + '">' +
    '<div class="col-12"><label>Task Title *</label>' +
    '<input class="form-control" id="tTitle" value="' + (t ? escHtml(t.title) : (prefillTitle ? escHtml(prefillTitle) : '')) + '" placeholder="What needs to be done?" autocomplete="off"></div>' +
    '<div class="col-12"><label>Description</label>' +
    '<textarea class="form-control" id="tDesc" rows="2" placeholder="Optional details…">' + (t ? escHtml(t.description || '') : '') + '</textarea></div>' +
    '<div class="col-6 col-md-4"><label>Category</label><select class="form-select" id="tCategory">' +
    CATEGORIES.map(function (c) { return '<option ' + (t && t.category === c ? 'selected' : '') + '>' + c + '</option>'; }).join('') + '</select></div>' +
    '<div class="col-6 col-md-4"><label>Subject</label><select class="form-select" id="tSubject">' +
    '<option value="">None</option>' +
    subs.map(function (s) { return '<option value="' + s.id + '" ' + (t && t.subjectId === s.id ? 'selected' : '') + '>' + escHtml(s.code) + '</option>'; }).join('') +
    '</select></div>' +
    '<div class="col-6 col-md-4"><label>Priority</label><select class="form-select" id="tPriority">' +
    PRIORITIES.map(function (p) { return '<option value="' + p + '" ' + (t && t.priority === p ? 'selected' : '') + '>' + p.charAt(0).toUpperCase() + p.slice(1) + '</option>'; }).join('') +
    '</select></div>' +
    '<div class="col-6 col-md-4"><label>Due Date</label><input type="date" class="form-control" id="tDueDate" value="' + (t ? t.dueDate : todayKey()) + '"></div>' +
    '<div class="col-6 col-md-4"><label>Due Time</label><input type="time" class="form-control" id="tDueTime" value="' + (t ? (t.dueTime || '23:59') : '23:59') + '"></div>' +
    '<div class="col-6 col-md-4"><label>Repeat</label><select class="form-select" id="tRepeat" onchange="updateRepeatHint(this)">' + repeatOptions + '</select>' + repeatDescHtml + '</div>' +
    (isEdit ? '<div class="col-6 col-md-4"><label>Score (%)</label><input type="number" class="form-control" id="tScore" min="0" max="100" step="0.01" placeholder="Optional" value="' + escHtml(String(scoreVal)) + '"></div>' : '') +
    (isEdit ? '<div class="col-12 col-md-8"><label>Remarks</label><input type="text" class="form-control" id="tRemarks" placeholder="Optional feedback or remarks…" value="' + escHtml(remarksVal) + '"></div>' : '') +
    '<div class="col-12 mt-1"><label>Checklist</label>' +
    '<div id="modalChecklistWrap" class="tk-modal-cl-wrap">' +
    checklist.map(function (c, i) { return modalClItemHtml(c, i); }).join('') +
    '</div><button type="button" class="tk-cl-add-btn mt-1" onclick="modalAddClItem()"><i class="bi bi-plus"></i> Add item</button></div>' +
    createdNote + parentNote +
    '</div>' +
    '<button class="btn btn-accent w-100 mt-3" onclick="saveTask()">' +
    '<i class="bi bi-check2 me-1"></i>' + (t ? 'Update Task' : 'Save Task') + '</button>';

  new bootstrap.Modal(document.getElementById('taskModal')).show();
}

function updateRepeatHint(sel) {
  var hint = document.getElementById('tRepeatHint');
  if (!hint) return;
  var desc = sel.options[sel.selectedIndex].dataset.desc || '';
  hint.textContent = desc;
  hint.style.display = desc ? '' : 'none';
}

function modalClItemHtml(c, i) {
  return '<div class="tk-modal-cl-row" data-i="' + i + '">' +
    '<input type="checkbox" class="form-check-input" ' + (c.done ? 'checked' : '') + '>' +
    '<input type="text" class="form-control form-control-sm" value="' + escHtml(c.text) + '" placeholder="Item…">' +
    '<button type="button" class="btn-icon" style="width:28px;height:28px;flex-shrink:0" onclick="this.closest(\'.tk-modal-cl-row\').remove()"><i class="bi bi-x" style="font-size:.8rem"></i></button>' +
    '</div>';
}

function modalAddClItem() {
  var wrap = document.getElementById('modalChecklistWrap');
  var i    = wrap.children.length;
  wrap.insertAdjacentHTML('beforeend', modalClItemHtml({ text: '', done: false }, i));
  wrap.lastElementChild.querySelector('input[type=text]').focus();
}

function saveTask() {
  var title = document.getElementById('tTitle').value.trim();
  if (!title) { Toast.show('Please enter a title', 'high', 'bi-exclamation-triangle'); return; }

  var checklist = Array.from(document.querySelectorAll('.tk-modal-cl-row')).map(function (row) {
    return { done: row.querySelector('input[type=checkbox]').checked, text: row.querySelector('input[type=text]').value.trim() };
  }).filter(function (c) { return c.text; });

  var id    = document.getElementById('tId').value;
  var tasks = DB.getTasks();

  var syllabusWeekIdEl = document.getElementById('tSyllabusWeekId');
  var repeatEl  = document.getElementById('tRepeat');
  var scoreEl   = document.getElementById('tScore');
  var remarksEl = document.getElementById('tRemarks');

  var data = {
    title: title,
    description: document.getElementById('tDesc').value.trim(),
    subjectId: document.getElementById('tSubject').value || null,
    category: document.getElementById('tCategory').value,
    priority: document.getElementById('tPriority').value,
    dueDate: document.getElementById('tDueDate').value,
    dueTime: document.getElementById('tDueTime').value,
    checklist: checklist,
    repeat: repeatEl ? repeatEl.value : 'none',
    syllabusWeekId: syllabusWeekIdEl ? (syllabusWeekIdEl.value || null) : null,
    updatedAt: Date.now(),
    score: scoreEl && scoreEl.value !== '' ? parseFloat(scoreEl.value) : (id ? (tasks.find(function (x) { return x.id === id; }) || {}).score || null : null),
    remarks: remarksEl ? remarksEl.value.trim() : (id ? (tasks.find(function (x) { return x.id === id; }) || {}).remarks || '' : ''),
  };

  data.progress = computeProgressFromChecklist(checklist, id ? ((tasks.find(function (x) { return x.id === id; }) || {}).progress || 0) : 0);

  if (data.progress === 100) data.status = 'completed';
  else if (data.progress > 0) data.status = 'in-progress';
  else data.status = 'not-started';

  if (id) {
    var idx  = tasks.findIndex(function (t) { return t.id === id; });
    var prev = tasks[idx];
    var wasCompleted = prev.status === 'completed';
    tasks[idx] = Object.assign({}, prev, data);
    if (!wasCompleted && data.status === 'completed') { tasks[idx].completedAt = Date.now(); fireConfetti(); }
    if (wasCompleted && data.status !== 'completed')  { delete tasks[idx].completedAt; }
  } else {
    var semId = DB.getActiveSemesterId();
    tasks.push(Object.assign({ id: DB.uid(), createdAt: Date.now(), semesterId: semId }, data));
  }

  DB.saveTasks(tasks);
  bootstrap.Modal.getInstance(document.getElementById('taskModal')).hide();
  Toast.show(id ? 'Task updated' : 'Task added');
  renderTasks();
}

function computeProgressFromChecklist(cl, fallback) {
  if (!cl || !cl.length) return fallback || 0;
  var done = cl.filter(function (c) { return c.done; }).length;
  return Math.round((done / cl.length) * 100);
}

/* ── Utility ── */
function escHtml(s) {
  var d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}
