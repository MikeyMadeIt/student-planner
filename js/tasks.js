/* ============================================================
   TASKS.JS — v3 Advanced Task Management
   Features: Unified Filter/Sort Drawer, Board/List view,
             Progress rings, Time estimate, Bulk move-to-subject,
             Improved card design, mobile-first
   ============================================================ */

let tkFilter    = 'all';
let tkExpandedId = null;
let tkGroupBy   = 'none';
let tkSelected  = new Set();
let tkSort      = 'due';
let tkSortDir   = 'asc';
let tkCatFilter = '';
let tkSubFilter = '';
let tkView      = 'list'; // 'list' | 'board'

/* ── Init ── */
function initTasks() {
  renderTasks();

  document.getElementById('tkSearch').addEventListener('input', debounce(renderTasks, 180));

  // Unified filter/sort drawer
  var drawerBtn = document.getElementById('filterSortBtn');
  if (drawerBtn) {
    drawerBtn.addEventListener('click', function () {
      openFilterDrawer();
    });
  }

  // View toggle
  var listViewBtn = document.getElementById('tkViewList');
  var boardViewBtn = document.getElementById('tkViewBoard');
  if (listViewBtn) listViewBtn.addEventListener('click', function () { setView('list'); });
  if (boardViewBtn) boardViewBtn.addEventListener('click', function () { setView('board'); });

  var params = new URLSearchParams(location.search);
  if (params.get('new') === '1') openTaskModal(null, params.get('syllabusWeekId'), params.get('title'));
  window.quickAddHandlers = window.quickAddHandlers || {};
  window.quickAddHandlers['task'] = function () { openTaskModal(); };
}

function setView(v) {
  tkView = v;
  var listBtn = document.getElementById('tkViewList');
  var boardBtn = document.getElementById('tkViewBoard');
  if (listBtn) listBtn.classList.toggle('active', v === 'list');
  if (boardBtn) boardBtn.classList.toggle('active', v === 'board');
  renderTasks();
}

/* ── Filter Drawer ── */
function openFilterDrawer() {
  var existing = document.getElementById('tkFilterDrawer');
  if (existing) { closeFilterDrawer(); return; }

  var semId = DB.getActiveSemesterId();
  var subs  = DB.getSubjects().filter(function (s) { return s.semesterId === semId; });
  var tasks = DB.getTasks().filter(function (t) { return t.semesterId === semId; });
  var cats  = [];
  tasks.forEach(function (t) { if (t.category && !cats.includes(t.category)) cats.push(t.category); });
  cats.sort();

  var STATUS_OPTS = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'completed', label: 'Completed' },
    { value: 'overdue', label: 'Overdue' },
  ];
  var SORT_OPTS = [
    { value: 'due', label: 'Due Date' },
    { value: 'created', label: 'Created Date' },
    { value: 'priority', label: 'Priority' },
    { value: 'alpha', label: 'Title' },
    { value: 'updated', label: 'Last Updated' },
  ];

  function radioRow(name, val, label, checked) {
    return '<label class="tkd-radio-row ' + (checked ? 'checked' : '') + '" data-name="' + name + '" data-val="' + val + '">' +
      '<span class="tkd-radio ' + (checked ? 'checked' : '') + '"></span>' +
      '<span>' + label + '</span></label>';
  }

  var statusHtml = STATUS_OPTS.map(function (o) { return radioRow('status', o.value, o.label, tkFilter === o.value); }).join('');
  var sortHtml   = SORT_OPTS.map(function (o) { return radioRow('sort', o.value, o.label, tkSort === o.value); }).join('');
  var orderHtml  = radioRow('order', 'asc', 'Ascending', tkSortDir === 'asc') + radioRow('order', 'desc', 'Descending', tkSortDir === 'desc');
  var groupHtml  = radioRow('group', 'none', 'None', tkGroupBy === 'none') + radioRow('group', 'subject', 'Subject', tkGroupBy === 'subject');

  var catHtml = '<label class="tkd-radio-row ' + (tkCatFilter === '' ? 'checked' : '') + '" data-name="cat" data-val=""><span class="tkd-radio ' + (tkCatFilter === '' ? 'checked' : '') + '"></span><span>All Categories</span></label>' +
    cats.map(function (c) { return radioRow('cat', c, c, tkCatFilter === c); }).join('');

  var subHtml = '<label class="tkd-radio-row ' + (tkSubFilter === '' ? 'checked' : '') + '" data-name="sub" data-val=""><span class="tkd-radio ' + (tkSubFilter === '' ? 'checked' : '') + '"></span><span>All Subjects</span></label>' +
    subs.map(function (s) { return radioRow('sub', s.id, escHtml(s.code || s.name), tkSubFilter === s.id); }).join('');

  var drawer = document.createElement('div');
  drawer.id  = 'tkFilterDrawer';
  drawer.className = 'tkd-drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-label', 'Filter and Sort');
  drawer.innerHTML =
    '<div class="tkd-backdrop" onclick="closeFilterDrawer()"></div>' +
    '<div class="tkd-panel">' +
    '<div class="tkd-panel-header">' +
    '<span class="tkd-panel-title">Filter &amp; Sort</span>' +
    '<button class="tkd-close-btn" onclick="closeFilterDrawer()" aria-label="Close"><i class="bi bi-x-lg"></i></button>' +
    '</div>' +
    '<div class="tkd-panel-body">' +
    '<div class="tkd-section"><div class="tkd-section-label">Status</div>' + statusHtml + '</div>' +
    '<div class="tkd-section"><div class="tkd-section-label">Category</div>' + catHtml + '</div>' +
    (subs.length ? '<div class="tkd-section"><div class="tkd-section-label">Subject</div>' + subHtml + '</div>' : '') +
    '<div class="tkd-section"><div class="tkd-section-label">Sort By</div>' + sortHtml + '</div>' +
    '<div class="tkd-section"><div class="tkd-section-label">Order</div>' + orderHtml + '</div>' +
    '<div class="tkd-section"><div class="tkd-section-label">Group By</div>' + groupHtml + '</div>' +
    '</div>' +
    '<div class="tkd-panel-footer">' +
    '<button class="tkd-reset-btn" onclick="resetFilters()"><i class="bi bi-arrow-counterclockwise me-1"></i>Reset</button>' +
    '<button class="tkd-apply-btn" onclick="applyDrawerFilters()"><i class="bi bi-check2 me-1"></i>Apply</button>' +
    '</div></div>';

  document.body.appendChild(drawer);
  requestAnimationFrame(function () { drawer.classList.add('open'); });

  // Radio click handlers
  drawer.querySelectorAll('.tkd-radio-row').forEach(function (row) {
    row.addEventListener('click', function () {
      var name = this.dataset.name;
      var val  = this.dataset.val;
      drawer.querySelectorAll('.tkd-radio-row[data-name="' + name + '"]').forEach(function (r) {
        r.classList.remove('checked');
        r.querySelector('.tkd-radio').classList.remove('checked');
      });
      this.classList.add('checked');
      this.querySelector('.tkd-radio').classList.add('checked');
    });
  });

  // Trap focus
  setTimeout(function () { var closeBtn = drawer.querySelector('.tkd-close-btn'); if (closeBtn) closeBtn.focus(); }, 100);
}

function closeFilterDrawer() {
  var drawer = document.getElementById('tkFilterDrawer');
  if (!drawer) return;
  drawer.classList.remove('open');
  setTimeout(function () { if (drawer.parentNode) drawer.parentNode.removeChild(drawer); }, 300);
}

function applyDrawerFilters() {
  var drawer = document.getElementById('tkFilterDrawer');
  if (!drawer) return;

  function getVal(name) {
    var checked = drawer.querySelector('.tkd-radio-row[data-name="' + name + '"].checked');
    return checked ? checked.dataset.val : null;
  }

  var status = getVal('status'); if (status !== null) tkFilter  = status;
  var sort   = getVal('sort');   if (sort !== null)   tkSort    = sort;
  var order  = getVal('order');  if (order !== null)  tkSortDir = order;
  var group  = getVal('group');  if (group !== null)  tkGroupBy = group;
  var cat    = getVal('cat');    if (cat !== null)    tkCatFilter = cat;
  var sub    = getVal('sub');    if (sub !== null)    tkSubFilter  = sub;

  updateFilterBadge();
  closeFilterDrawer();
  tkSelected.clear();
  renderTasks();
}

function resetFilters() {
  tkFilter    = 'all';
  tkSort      = 'due';
  tkSortDir   = 'asc';
  tkGroupBy   = 'none';
  tkCatFilter = '';
  tkSubFilter = '';
  closeFilterDrawer();
  updateFilterBadge();
  renderTasks();
}

function updateFilterBadge() {
  var btn  = document.getElementById('filterSortBtn');
  var badge= document.getElementById('filterBadge');
  if (!btn || !badge) return;
  var count = 0;
  if (tkFilter !== 'all')    count++;
  if (tkCatFilter !== '')    count++;
  if (tkSubFilter !== '')    count++;
  if (tkSort !== 'due' || tkSortDir !== 'asc') count++;
  if (tkGroupBy !== 'none')  count++;
  badge.textContent = count > 0 ? count : '';
  badge.style.display = count > 0 ? 'flex' : 'none';
  btn.classList.toggle('tk-filter-active', count > 0);
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
    timeEstimate: completedTask.timeEstimate || null,
    updatedAt: Date.now(),
  };
  tasks.push(child);
  DB.saveTasks(tasks);
  Toast.show('Next occurrence scheduled for ' + nextDate + ' (' + repeat + ')');
}

/* ── Status / Progress ── */
function computeStatus(t) {
  if (t.status === 'completed') return 'completed';
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
  return '<span class="tk-due-label ' + relClass + '"><i class="bi bi-calendar3"></i>' + relLabel + '</span>';
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
    label = diffDays + 'd left';
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
  return '<span class="tk-repeat-badge" title="Repeats ' + r + '"><i class="bi bi-arrow-repeat"></i>' + (labels[r] || r) + '</span>';
}

function timeEstimateHtml(t) {
  if (!t.timeEstimate) return '';
  var te = t.timeEstimate;
  var label = '';
  if (te >= 60) {
    var hrs = Math.floor(te / 60);
    var mins = te % 60;
    label = hrs + 'h' + (mins > 0 ? ' ' + mins + 'm' : '');
  } else {
    label = te + 'm';
  }
  return '<span class="tk-estimate-badge"><i class="bi bi-clock"></i>' + label + '</span>';
}

function progressRingHtml(t) {
  if (!t.checklist || !t.checklist.length) return '';
  var done  = t.checklist.filter(function (c) { return c.done; }).length;
  var total = t.checklist.length;
  var pct   = Math.round((done / total) * 100);
  var r     = 10;
  var circ  = 2 * Math.PI * r;
  var dash  = (pct / 100) * circ;
  var gap   = circ - dash;
  return '<div class="tk-ring-wrap" title="' + done + '/' + total + ' subtasks completed">' +
    '<svg class="tk-ring-svg" viewBox="0 0 26 26" aria-hidden="true">' +
    '<circle cx="13" cy="13" r="' + r + '" class="tk-ring-track" fill="none" stroke-width="3"/>' +
    '<circle cx="13" cy="13" r="' + r + '" class="tk-ring-fill" fill="none" stroke-width="3" ' +
    'stroke-dasharray="' + dash.toFixed(2) + ' ' + gap.toFixed(2) + '" stroke-linecap="round" transform="rotate(-90 13 13)"/>' +
    '</svg>' +
    '<span class="tk-ring-label">' + done + '/' + total + '</span></div>';
}

function progressHtml(prog, checklist) {
  var done  = checklist ? checklist.filter(function (c) { return c.done; }).length : 0;
  var total = checklist ? checklist.length : 0;
  var hasChecklist = total > 0;
  var countLabel   = hasChecklist ? (done + '/' + total) : (prog > 0 ? prog + '%' : '');
  if (prog === 0 && !hasChecklist) return '';
  return '<div class="tk-progress-wrap">' +
    '<div class="tk-progress-bar-track"><div class="tk-progress-bar-fill" style="width:' + prog + '%"></div></div>' +
    '<div class="tk-progress-meta"><span class="tk-prog-pct">' + prog + '%</span>' +
    (countLabel && hasChecklist ? '<span class="tk-prog-count">' + countLabel + ' items</span>' : '') + '</div></div>';
}

function checklistHtml(t) {
  if (!t.checklist || !t.checklist.length) return '<div class="tk-cl-empty"><span class="text-faint" style="font-size:.78rem">No checklist items. Use Edit to add items.</span></div>';
  return '<div class="tk-cl-list" id="clList_' + t.id + '">' +
    t.checklist.map(function (c, i) {
      return '<div class="tk-cl-item" data-taskid="' + t.id + '" data-i="' + i + '">' +
        '<button class="tk-cl-check ' + (c.done ? 'done' : '') + '" onclick="toggleChecklistItem(\'' + t.id + '\', ' + i + ')" title="' + (c.done ? 'Uncheck' : 'Check') + '" aria-label="' + (c.done ? 'Uncheck: ' : 'Check: ') + c.text + '">' +
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
  var teLabel = t.timeEstimate ? (t.timeEstimate >= 60 ? Math.floor(t.timeEstimate/60) + 'h ' + (t.timeEstimate % 60 > 0 ? (t.timeEstimate % 60) + 'm' : '') : t.timeEstimate + 'm') : '—';
  return '<div class="tk-meta-grid">' +
    '<div class="tk-meta-row"><span class="tk-meta-k">Created</span><span class="tk-meta-v">' + createdStr + '</span></div>' +
    '<div class="tk-meta-row"><span class="tk-meta-k">Due</span><span class="tk-meta-v">' + dueD + (dueT ? ' · ' + dueT : '') + '</span></div>' +
    '<div class="tk-meta-row"><span class="tk-meta-k">Category</span><span class="tk-meta-v">' + escHtml(t.category || '—') + '</span></div>' +
    '<div class="tk-meta-row"><span class="tk-meta-k">Priority</span><span class="tk-meta-v tk-meta-pri-' + (t.priority || 'low') + '">' + ((t.priority || 'low').charAt(0).toUpperCase() + (t.priority || 'low').slice(1)) + '</span></div>' +
    '<div class="tk-meta-row"><span class="tk-meta-k">Subject</span><span class="tk-meta-v">' + (sub ? escHtml(sub.name || sub.code) : '—') + '</span></div>' +
    '<div class="tk-meta-row"><span class="tk-meta-k">Repeat</span><span class="tk-meta-v">' + repeatLabel + '</span></div>' +
    '<div class="tk-meta-row"><span class="tk-meta-k">Estimate</span><span class="tk-meta-v">' + teLabel + '</span></div>' +
    '</div>';
}

/* ── Build a single task card (list view) ── */
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

  var dueHtml     = dueLabelHtml(t, status);
  var tlHtml      = timeLeftLabel(t, status);
  var repeatBadge = repeatBadgeHtml(t);
  var teHtml      = timeEstimateHtml(t);
  var ringHtml    = progressRingHtml(t);

  var statusBadge = '';
  if (isOverdue)   statusBadge = '<span class="tk-status-badge overdue"><i class="bi bi-exclamation-circle"></i>Overdue</span>';
  else if (isCompleted) statusBadge = '<span class="tk-status-badge completed"><i class="bi bi-check-circle"></i>Done</span>';

  var collapsed = !isExpanded ? '<div class="tk-card-body-collapsed">' +
    '<div class="tk-inline-meta">' + metaLine +
    (repeatBadge ? '<span class="tk-sep">·</span>' + repeatBadge : '') +
    (teHtml ? '<span class="tk-sep">·</span>' + teHtml : '') +
    '</div>' +
    (prog > 0 || (t.checklist && t.checklist.length) ? progressHtml(prog, t.checklist) : '') +
    '<div class="tk-due-row">' + dueHtml + tlHtml + '</div></div>' : '';

  var expanded = isExpanded ? '<div class="tk-card-body-expanded">' +
    (t.description ? '<p class="tk-description">' + escHtml(t.description) + '</p>' : '') +
    (prog > 0 || (t.checklist && t.checklist.length) ? progressHtml(prog, t.checklist) : '') +
    '<div class="tk-cl-section"><div class="tk-cl-heading">Checklist</div>' + checklistHtml(t) + '</div>' +
    '<hr class="tk-divider">' +
    metaGridHtml(t) +
    scoreRemarksHtml(t) +
    '<div class="tk-card-actions">' +
    '<button class="btn btn-ghost btn-sm" onclick="openTaskModal(\'' + t.id + '\')" aria-label="Edit task"><i class="bi bi-pencil me-1"></i>Edit</button>' +
    '<button class="btn tk-btn-danger btn-sm" onclick="deleteTask(\'' + t.id + '\')" aria-label="Delete task"><i class="bi bi-trash me-1"></i>Delete</button>' +
    '</div></div>' : '';

  var completeBtn = isCompleted
    ? '<button class="tk-complete-btn tk-complete-btn-done" onclick="event.stopPropagation();toggleTaskComplete(\'' + t.id + '\')" title="Mark as Active" aria-label="Reopen task"><i class="bi bi-arrow-counterclockwise"></i><span>Reopen</span></button>'
    : '<button class="tk-complete-btn" onclick="event.stopPropagation();toggleTaskComplete(\'' + t.id + '\')" title="Mark as Complete" aria-label="Mark task complete"><i class="bi bi-check-lg"></i><span>Complete</span></button>';

  return '<div class="tk-card ' + (isCompleted ? 'completed' : '') + ' ' + (isOverdue ? 'overdue' : '') + ' ' + (isExpanded ? 'expanded' : '') + ' ' + (isSelected ? 'tk-selected' : '') + '" id="tkCard_' + t.id + '" data-taskid="' + t.id + '">' +
    '<div class="tk-card-header" onclick="toggleCard(\'' + t.id + '\', event)">' +
    '<button class="tk-bulk-check ' + (isSelected ? 'selected' : '') + '" onclick="event.stopPropagation();toggleSelect(\'' + t.id + '\')" title="' + (isSelected ? 'Deselect' : 'Select for bulk action') + '" aria-label="' + (isSelected ? 'Deselect task' : 'Select task') + '">' +
    (isSelected ? '<i class="bi bi-check-lg"></i>' : '') + '</button>' +
    '<div class="tk-card-title-wrap">' +
    (ringHtml ? ringHtml : '') +
    '<span class="tk-task-title ' + (isCompleted ? 'done' : '') + '">' + escHtml(t.title) + '</span>' +
    statusBadge + '</div>' +
    completeBtn +
    '<button class="tk-expand-btn" title="' + (isExpanded ? 'Collapse' : 'Expand') + '" aria-label="' + (isExpanded ? 'Collapse task' : 'Expand task') + '" onclick="event.stopPropagation();toggleCard(\'' + t.id + '\')">' +
    '<i class="bi bi-chevron-' + (isExpanded ? 'up' : 'down') + '"></i></button></div>' +
    collapsed + expanded + '</div>';
}

/* ── Board card ── */
function buildBoardCard(t) {
  var status      = computeStatus(t);
  var prog        = computeProgress(t);
  var isCompleted = status === 'completed';
  var isOverdue   = status === 'overdue';
  var isSelected  = tkSelected.has(t.id);
  var subs        = DB.getSubjects();
  var sub         = subs.find(function (s) { return s.id === t.subjectId; });
  var ringHtml    = progressRingHtml(t);

  // Compact due string
  var dueStr = '';
  if (t.dueDate) {
    var d = new Date(t.dueDate + 'T00:00:00');
    dueStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (t.dueTime && t.dueTime !== '23:59') dueStr += ' ' + fmtTime(t.dueTime);
  }
  var dueClass = isOverdue ? 'bdue-overdue' : (t.dueDate === todayKey() ? 'bdue-today' : 'bdue-normal');

  // Priority color dot
  var priMap = { high: '#fb7185', medium: '#fbbf24', low: '#6b7280' };
  var priColor = priMap[t.priority || 'low'] || priMap.low;

  // Time estimate compact
  var teStr = '';
  if (t.timeEstimate) {
    var h = Math.floor(t.timeEstimate / 60), m = t.timeEstimate % 60;
    teStr = h > 0 ? (h + 'h' + (m > 0 ? m + 'm' : '')) : m + 'm';
  }

  // Checklist mini progress
  var clProg = '';
  if (t.checklist && t.checklist.length) {
    var done = t.checklist.filter(function(c) { return c.done; }).length;
    var total = t.checklist.length;
    var pct = Math.round(done / total * 100);
    clProg = '<div class="tk-bc-progress">' +
      '<div class="tk-bc-bar"><div class="tk-bc-bar-fill" style="width:' + pct + '%"></div></div>' +
      '<span class="tk-bc-prog-lbl">' + done + '/' + total + '</span>' +
      '</div>';
  }

  return '<div class="tk-board-card' +
    (isCompleted ? ' completed' : '') +
    (isOverdue   ? ' overdue'   : '') +
    (isSelected  ? ' tk-selected' : '') +
    '" data-taskid="' + t.id + '">' +

    '<div class="tk-bc-top">' +
    '<button class="tk-bulk-check' + (isSelected ? ' selected' : '') + '" ' +
      'onclick="event.stopPropagation();toggleSelect(\'' + t.id + '\')" ' +
      'aria-label="' + (isSelected ? 'Deselect' : 'Select') + ' task">' +
      (isSelected ? '<i class=\"bi bi-check-lg\"></i>' : '') +
    '</button>' +
    '<span class="tk-bc-title' + (isCompleted ? ' done' : '') + '">' + escHtml(t.title) + '</span>' +
    (ringHtml ? ringHtml : '') +
    '</div>' +

    '<div class="tk-bc-meta">' +
    (sub ? '<span class="tk-sub-color-dot" style="background:' + (sub.color || 'rgb(var(--accent))') + '" title="' + escHtml(sub.code || sub.name) + '"></span>' : '') +
    (sub ? '<span class="tk-bc-sub">' + escHtml(sub.code || sub.name) + '</span>' : '') +
    '<span class="tk-bc-pri-dot" style="background:' + priColor + '" title="' + (t.priority || 'low') + '"></span>' +
    '<span class="tk-bc-cat">' + escHtml(t.category || 'Other') + '</span>' +
    (dueStr ? '<span class="tk-bc-due ' + dueClass + '">' + dueStr + '</span>' : '') +
    (teStr  ? '<span class="tk-bc-te"><i class="bi bi-clock"></i>' + teStr + '</span>' : '') +
    '</div>' +

    clProg +

    '<div class="tk-bc-actions">' +
    (isCompleted
      ? '<button class="tk-bc-btn tk-bc-reopen" onclick="toggleTaskComplete(\'' + t.id + '\')" aria-label="Reopen task"><i class="bi bi-arrow-counterclockwise"></i>Reopen</button>'
      : '<button class="tk-bc-btn tk-bc-done"   onclick="toggleTaskComplete(\'' + t.id + '\')" aria-label="Mark complete"><i class="bi bi-check-lg"></i>Done</button>') +
    '<button class="tk-bc-icon-btn" onclick="openTaskModal(\'' + t.id + '\')" aria-label="Edit task"><i class="bi bi-pencil"></i></button>' +
    '</div>' +
    '</div>';
}

/* ── Group builder ── */
function buildDueBucketGroup(label, icon, tasks, groupClass) {
  if (!tasks.length) return '';
  var cards = tasks.map(function (t) { return buildTaskCard(t, false); }).join('');
  return '<div class="tk-group ' + groupClass + '">' +
    '<div class="tk-group-heading"><i class="bi ' + icon + '"></i>' + label + '<span class="tk-group-count">' + tasks.length + '</span>' + buildSelectAllGroupBtn(tasks) + '</div>' +
    '<div class="tk-group-cards">' + cards + '</div></div>';
}

function buildSelectAllGroupBtn(tasks) {
  var ids = tasks.map(function (t) { return t.id; });
  return '<button class="tk-group-select-all" onclick="event.stopPropagation();toggleSelectGroup(' + JSON.stringify(ids) + ')" title="Select all in group" aria-label="Select all in group"><i class="bi bi-check2-square"></i></button>';
}

/* ── Bulk toolbar ── */
function renderBulkToolbar(visibleIds) {
  var existing = document.getElementById('tkBulkToolbar');
  if (existing) existing.remove();
  if (tkSelected.size === 0) return;
  var count = tkSelected.size;
  var toolbar = document.createElement('div');
  toolbar.id  = 'tkBulkToolbar';
  toolbar.className = 'tk-bulk-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Bulk actions');
  toolbar.innerHTML =
    '<span class="tk-bulk-count"><i class="bi bi-check2-square"></i>' + count + ' selected</span>' +
    '<div class="tk-bulk-actions">' +
    '<button class="tk-bulk-btn tk-bulk-complete" onclick="bulkComplete()" aria-label="Mark selected complete"><i class="bi bi-check-lg"></i><span>Done</span></button>' +
    '<button class="tk-bulk-btn tk-bulk-reopen"   onclick="bulkActive()"   aria-label="Reopen selected"><i class="bi bi-arrow-counterclockwise"></i><span>Reopen</span></button>' +
    '<button class="tk-bulk-btn tk-bulk-move"     onclick="openBulkMove()" aria-label="Move to subject"><i class="bi bi-folder-symlink"></i><span>Move</span></button>' +
    '<button class="tk-bulk-btn tk-bulk-delete"   onclick="bulkDelete()"   aria-label="Delete selected"><i class="bi bi-trash"></i><span>Delete</span></button>' +
    '<button class="tk-bulk-btn tk-bulk-clear"    onclick="clearSelection()" aria-label="Clear selection"><i class="bi bi-x"></i></button>' +
    '</div>';
  var wrap = document.getElementById('tkGroups');
  if (wrap) wrap.parentNode.insertBefore(toolbar, wrap);
}

/* ── Select all button ── */
function renderSelectAllBtn(visibleIds) {
  var btn = document.getElementById('selectAllBtn');
  if (!btn) return;
  var allSelected = visibleIds.length > 0 && visibleIds.every(function (id) { return tkSelected.has(id); });
  var someSelected = tkSelected.size > 0;
  var count = tkSelected.size;
  if (allSelected) {
    btn.classList.add('tk-select-all-active');
    btn.innerHTML = '<i class="bi bi-check2-square"></i><span>' + count + '</span>';
    btn.setAttribute('aria-label', 'Deselect all tasks');
  } else if (someSelected) {
    btn.classList.remove('tk-select-all-active');
    btn.innerHTML = '<i class="bi bi-dash-square"></i><span>' + count + '</span>';
    btn.setAttribute('aria-label', count + ' tasks selected');
  } else {
    btn.classList.remove('tk-select-all-active');
    btn.innerHTML = '<i class="bi bi-square"></i><span>Select</span>';
    btn.setAttribute('aria-label', 'Select all tasks');
  }
  btn.onclick = function () { toggleSelectAll(visibleIds, !allSelected); };
}

/* ── Selection helpers ── */
function toggleSelect(id) {
  if (tkSelected.has(id)) tkSelected.delete(id); else tkSelected.add(id);
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
    t.status = 'completed'; t.progress = 100; t.completedAt = Date.now(); t.updatedAt = Date.now();
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
    t.status = 'not-started'; t.progress = computeProgress(t); t.updatedAt = Date.now();
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

/* ── Bulk move to subject ── */
function openBulkMove() {
  var semId = DB.getActiveSemesterId();
  var subs  = DB.getSubjects().filter(function (s) { return s.semesterId === semId; });

  var existing = document.getElementById('tkMoveModal');
  if (existing) existing.remove();

  var modal = document.createElement('div');
  modal.id  = 'tkMoveModal';
  modal.className = 'tk-move-modal-overlay';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-label', 'Move tasks to subject');

  var subOptions = subs.length
    ? '<select class="form-select" id="tkMoveSubject">' +
      '<option value="">— Select Subject —</option>' +
      subs.map(function (s) { return '<option value="' + s.id + '">' + escHtml(s.code || s.name) + '</option>'; }).join('') +
      '</select>'
    : '<p class="tk-move-no-subs">No subjects available for this semester.</p>';

  modal.innerHTML =
    '<div class="tk-move-modal glass">' +
    '<div class="tk-move-header"><span class="tk-move-title"><i class="bi bi-folder-symlink me-2"></i>Move to Subject</span>' +
    '<button class="tkd-close-btn" onclick="closeBulkMove()" aria-label="Close"><i class="bi bi-x-lg"></i></button></div>' +
    '<div class="tk-move-body">' +
    '<p class="tk-move-count">' + tkSelected.size + ' task' + (tkSelected.size !== 1 ? 's' : '') + ' selected</p>' +
    subOptions +
    '</div>' +
    '<div class="tk-move-footer">' +
    '<button class="btn btn-ghost btn-sm" onclick="closeBulkMove()">Cancel</button>' +
    (subs.length ? '<button class="btn btn-accent btn-sm" onclick="executeBulkMove()"><i class="bi bi-check2 me-1"></i>Move</button>' : '') +
    '</div></div>';

  document.body.appendChild(modal);
  requestAnimationFrame(function () { modal.classList.add('open'); });
  modal.addEventListener('click', function (e) { if (e.target === modal) closeBulkMove(); });
}

function closeBulkMove() {
  var modal = document.getElementById('tkMoveModal');
  if (!modal) return;
  modal.classList.remove('open');
  setTimeout(function () { if (modal.parentNode) modal.parentNode.removeChild(modal); }, 250);
}

function executeBulkMove() {
  var sel = document.getElementById('tkMoveSubject');
  if (!sel || !sel.value) { Toast.show('Please select a subject', 'high', 'bi-exclamation-triangle'); return; }
  var subId = sel.value;
  var tasks = DB.getTasks();
  var ids   = Array.from(tkSelected);
  var moved = 0;
  ids.forEach(function (id) {
    var t = tasks.find(function (x) { return x.id === id; });
    if (!t) return;
    t.subjectId = subId;
    t.updatedAt = Date.now();
    moved++;
  });
  DB.saveTasks(tasks);
  closeBulkMove();
  tkSelected.clear();
  Toast.show(moved + ' task' + (moved !== 1 ? 's' : '') + ' moved');
  renderTasks();
}

/* ── Main render ── */
function renderTasks() {
  var semId    = DB.getActiveSemesterId();
  var allTasks = DB.getTasks().filter(function (t) { return t.semesterId === semId; });

  // Auto-sync completed status
  var changed = false;
  allTasks.forEach(function (t) {
    if (t.status === 'not-started') return;
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
  var activeStat  = allTasks.filter(function (t) { var s = computeStatus(t); return s !== 'completed'; }).length;
  document.getElementById('statTotal').textContent   = allTasks.length;
  document.getElementById('statActive').textContent  = activeStat;
  document.getElementById('statDone').textContent    = doneStat;
  document.getElementById('statOverdue').textContent = overdueStat;

  var q = document.getElementById('tkSearch').value.toLowerCase().trim();

  var filtered = allTasks.filter(function (t) {
    if (q) {
      var subs = DB.getSubjects();
      var sub  = subs.find(function (s) { return s.id === t.subjectId; });
      var subStr = sub ? ((sub.code || '') + ' ' + (sub.name || '')).toLowerCase() : '';
      var match = t.title.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        (t.category || '').toLowerCase().includes(q) ||
        (t.remarks || '').toLowerCase().includes(q) ||
        subStr.includes(q);
      if (!match) return false;
    }
    if (tkCatFilter && t.category !== tkCatFilter) return false;
    if (tkSubFilter && t.subjectId !== tkSubFilter) return false;
    if (tkFilter === 'active')    return computeStatus(t) !== 'completed';
    if (tkFilter === 'completed') return computeStatus(t) === 'completed';
    if (tkFilter === 'overdue')   return computeStatus(t) === 'overdue';
    return true;
  });

  // Sort
  var priRank = { high: 0, medium: 1, low: 2 };
  if (tkSort === 'due') {
    filtered.sort(function (a, b) {
      return ((a.dueDate || '9999') + (a.dueTime || '23:59')).localeCompare((b.dueDate || '9999') + (b.dueTime || '23:59'));
    });
  } else if (tkSort === 'priority') {
    filtered.sort(function (a, b) { return (priRank[a.priority] || 2) - (priRank[b.priority] || 2); });
  } else if (tkSort === 'created') {
    filtered.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  } else if (tkSort === 'updated') {
    filtered.sort(function (a, b) { return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0); });
  } else if (tkSort === 'alpha') {
    filtered.sort(function (a, b) { return a.title.localeCompare(b.title); });
  }
  if (tkSortDir === 'desc') filtered.reverse();

  // Clean selection
  var visibleIds = filtered.map(function (t) { return t.id; });
  Array.from(tkSelected).forEach(function (id) { if (!visibleIds.includes(id)) tkSelected.delete(id); });

  var wrap = document.getElementById('tkGroups');
  var old  = document.getElementById('tkBulkToolbar');
  if (old) old.remove();

  if (!filtered.length) {
    renderSelectAllBtn([]);
    var isFiltered = q || tkFilter !== 'all' || tkCatFilter || tkSubFilter;
    wrap.innerHTML = '<div class="tk-empty-state glass card-pad fade-in">' +
      '<i class="bi ' + (isFiltered ? 'bi-filter-circle' : 'bi-inbox') + '"></i>' +
      '<p class="tk-empty-title">' + (isFiltered ? 'No matching tasks' : (tkFilter === 'completed' ? 'No completed tasks yet.' : tkFilter === 'overdue' ? 'No overdue tasks.' : 'No tasks yet')) + '</p>' +
      '<p class="tk-empty-sub">' + (isFiltered ? 'Try adjusting your filters or search.' : 'Start organizing your work for this semester.') + '</p></div>';
    return;
  }

  var html = '';
  if (tkView === 'board') {
    html = renderBoardView(filtered);
  } else if (tkGroupBy === 'subject') {
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
  renderSelectAllBtn(visibleIds);
  if (tkSelected.size > 0) renderBulkToolbar(visibleIds);
}

/* ── Board view ── */
function renderBoardView(tasks) {
  var active    = tasks.filter(function (t) { var s = computeStatus(t); return s === 'not-started' || s === 'in-progress'; });
  var overdue   = tasks.filter(function (t) { return computeStatus(t) === 'overdue'; });
  var completed = tasks.filter(function (t) { return computeStatus(t) === 'completed'; });

  function col(title, icon, cls, items) {
    var cards = items.map(function (t) { return buildBoardCard(t); }).join('');
    return '<div class="tk-board-col ' + cls + '">' +
      '<div class="tk-board-col-header"><i class="bi ' + icon + '"></i>' + title + '<span class="tk-board-col-count">' + items.length + '</span></div>' +
      '<div class="tk-board-col-cards">' + (cards || '<div class="tk-board-empty">No tasks here</div>') + '</div></div>';
  }

  return '<div class="tk-board-wrap">' +
    col('Active', 'bi-hourglass-split', 'col-active', active) +
    col('Overdue', 'bi-exclamation-triangle-fill', 'col-overdue', overdue) +
    col('Completed', 'bi-check-circle-fill', 'col-completed', completed) +
    '</div>';
}

/* ── Subject grouping ── */
function renderSubjectGroups(tasks) {
  var subs    = DB.getSubjects();
  var semId   = DB.getActiveSemesterId();
  var semSubs = subs.filter(function (s) { return s.semesterId === semId; });
  var groups  = {};
  var noSubject = [];
  tasks.forEach(function (t) {
    if (t.subjectId) { if (!groups[t.subjectId]) groups[t.subjectId] = []; groups[t.subjectId].push(t); }
    else { noSubject.push(t); }
  });
  var html = '';
  semSubs.forEach(function (sub) {
    var list = groups[sub.id] || [];
    if (!list.length) return;
    var cards = list.map(function (t) { return buildTaskCard(t, true); }).join('');
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
      '<div class="tk-group-heading"><i class="bi bi-tag"></i>Unassigned<span class="tk-group-count">' + noSubject.length + '</span>' +
      buildSelectAllGroupBtn(noSubject) + '</div>' +
      '<div class="tk-group-cards">' + cards + '</div></div>';
  }
  return html || '<div class="tk-group-empty">No tasks match the current filters.</div>';
}

/* ── Toggle expand/collapse ── */
function toggleCard(id, evt) {
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

/* ── Complete / uncomplete ── */
function toggleTaskComplete(id) {
  var tasks = DB.getTasks();
  var t     = tasks.find(function (x) { return x.id === id; });
  if (!t) return;
  if (t.status === 'completed') {
    t.status = 'not-started'; t.progress = computeProgress(t); delete t.completedAt;
  } else {
    t.status = 'completed'; t.progress = 100; t.completedAt = Date.now();
    if (t.checklist) t.checklist.forEach(function (c) { c.done = true; });
    DB.saveTasks(tasks); generateNextOccurrence(t); fireConfetti();
    Toast.show('Task completed! 🎉'); renderTasks(); return;
  }
  DB.saveTasks(tasks); renderTasks();
}

/* ── Checklist ── */
function toggleChecklistItem(taskId, idx) {
  var tasks = DB.getTasks();
  var t     = tasks.find(function (x) { return x.id === taskId; });
  if (!t || !t.checklist) return;
  t.checklist[idx].done = !t.checklist[idx].done;
  var prog = computeProgress(t);
  t.progress = prog; t.updatedAt = Date.now();
  if (prog === 100 && t.status !== 'completed') {
    t.status = 'completed'; t.completedAt = Date.now();
    DB.saveTasks(tasks); generateNextOccurrence(t); fireConfetti();
    Toast.show('All items done — task completed! 🎉'); renderTasks(); return;
  }
  if (prog < 100 && t.status === 'completed') { t.status = 'in-progress'; delete t.completedAt; }
  DB.saveTasks(tasks); renderTasks();
}

function addChecklistItemLive(taskId) {
  var tasks = DB.getTasks();
  var t     = tasks.find(function (x) { return x.id === taskId; });
  if (!t) return;
  var text = prompt('New checklist item:');
  if (!text || !text.trim()) return;
  if (!t.checklist) t.checklist = [];
  t.checklist.push({ text: text.trim(), done: false });
  t.progress = computeProgress(t); t.updatedAt = Date.now();
  DB.saveTasks(tasks); tkExpandedId = taskId; renderTasks();
}

function deleteChecklistItem(taskId, idx) {
  var tasks = DB.getTasks();
  var t     = tasks.find(function (x) { return x.id === taskId; });
  if (!t || !t.checklist) return;
  t.checklist.splice(idx, 1);
  t.progress = computeProgress(t); t.updatedAt = Date.now();
  DB.saveTasks(tasks); tkExpandedId = taskId; renderTasks();
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
      Toast.show('Task deleted'); renderTasks();
    }
  });
}

/* ── Time estimate helpers ── */
function parseTimeEstimate(hrs, mins) {
  var h = parseInt(hrs) || 0;
  var m = parseInt(mins) || 0;
  var total = h * 60 + m;
  return total > 0 ? total : null;
}

function teHrsMins(te) {
  if (!te) return { hrs: 0, mins: 0 };
  return { hrs: Math.floor(te / 60), mins: te % 60 };
}

/* ── Add/Edit Modal ── */
function openTaskModal(id, prefillSyllabusWeekId, prefillTitle) {
  var t      = id ? DB.getTasks().find(function (x) { return x.id === id; }) : null;
  var isEdit = !!t;
  document.getElementById('taskModalTitle').textContent = t ? 'Edit Task' : 'Add Task';
  var semId    = DB.getActiveSemesterId();
  var subs     = DB.getSubjects().filter(function (s) { return s.semesterId === semId; });
  var checklist= t && t.checklist ? t.checklist : [];

  var CATEGORIES = ['Academic', 'Assignment', 'Project', 'Exam', 'Quiz', 'Homework', 'Personal', 'Organization', 'Other'];
  var PRIORITIES = ['low', 'medium', 'high'];
  var REPEATS = [
    { value: 'none', label: 'None', desc: '' },
    { value: 'daily', label: 'Daily', desc: 'Repeat this task every day.' },
    { value: 'weekly', label: 'Weekly', desc: 'Repeat this task every week.' },
    { value: 'monthly', label: 'Monthly', desc: 'Repeat this task every month.' },
  ];
  var curRepeat = t ? (t.repeat || 'none') : 'none';
  var repeatOptions = REPEATS.map(function (r) {
    return '<option value="' + r.value + '" ' + (curRepeat === r.value ? 'selected' : '') + ' data-desc="' + r.desc + '">' + r.label + '</option>';
  }).join('');
  var repeatDesc = REPEATS.find(function (r) { return r.value === curRepeat; });
  var repeatDescHtml = (repeatDesc && repeatDesc.desc)
    ? '<div class="tk-repeat-hint" id="tRepeatHint">' + repeatDesc.desc + '</div>'
    : '<div class="tk-repeat-hint" id="tRepeatHint" style="display:none"></div>';

  var te = t && t.timeEstimate ? teHrsMins(t.timeEstimate) : { hrs: 0, mins: 0 };
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
    '<div class="col-12"><label class="form-label">Task Title *</label>' +
    '<input class="form-control" id="tTitle" value="' + (t ? escHtml(t.title) : (prefillTitle ? escHtml(prefillTitle) : '')) + '" placeholder="What needs to be done?" autocomplete="off"></div>' +
    '<div class="col-12"><label class="form-label">Description</label>' +
    '<textarea class="form-control" id="tDesc" rows="2" placeholder="Optional details…">' + (t ? escHtml(t.description || '') : '') + '</textarea></div>' +
    '<div class="col-6 col-md-4"><label class="form-label">Category</label><select class="form-select" id="tCategory">' +
    CATEGORIES.map(function (c) { return '<option ' + (t && t.category === c ? 'selected' : '') + '>' + c + '</option>'; }).join('') + '</select></div>' +
    '<div class="col-6 col-md-4"><label class="form-label">Subject</label><select class="form-select" id="tSubject">' +
    '<option value="">None</option>' +
    subs.map(function (s) { return '<option value="' + s.id + '" ' + (t && t.subjectId === s.id ? 'selected' : '') + '>' + escHtml(s.code) + '</option>'; }).join('') +
    '</select></div>' +
    '<div class="col-6 col-md-4"><label class="form-label">Priority</label><select class="form-select" id="tPriority">' +
    PRIORITIES.map(function (p) { return '<option value="' + p + '" ' + (t && t.priority === p ? 'selected' : '') + '>' + p.charAt(0).toUpperCase() + p.slice(1) + '</option>'; }).join('') + '</select></div>' +
    '<div class="col-6 col-md-4"><label class="form-label">Due Date</label><input type="date" class="form-control" id="tDueDate" value="' + (t ? t.dueDate : todayKey()) + '"></div>' +
    '<div class="col-6 col-md-4"><label class="form-label">Due Time</label><input type="time" class="form-control" id="tDueTime" value="' + (t ? (t.dueTime || '23:59') : '23:59') + '"></div>' +
    '<div class="col-6 col-md-4"><label class="form-label">Repeat</label><select class="form-select" id="tRepeat" onchange="updateRepeatHint(this)">' + repeatOptions + '</select>' + repeatDescHtml + '</div>' +
    '<div class="col-12"><label class="form-label">Time Estimate <span class="text-faint" style="font-weight:400;font-size:.8em">(how long will this take?)</span></label>' +
    '<div class="tk-time-est-row">' +
    '<input type="number" class="form-control tk-te-input" id="tTeHrs" min="0" max="99" placeholder="0" value="' + (te.hrs > 0 ? te.hrs : '') + '"><span class="tk-te-unit">hr</span>' +
    '<input type="number" class="form-control tk-te-input" id="tTeMins" min="0" max="59" step="5" placeholder="0" value="' + (te.mins > 0 ? te.mins : '') + '"><span class="tk-te-unit">min</span>' +
    '</div></div>' +
    (isEdit ? '<div class="col-6 col-md-4"><label class="form-label">Score (%)</label><input type="number" class="form-control" id="tScore" min="0" max="100" step="0.01" placeholder="Optional" value="' + escHtml(String(scoreVal)) + '"></div>' : '') +
    (isEdit ? '<div class="col-' + (isEdit ? '6 col-md-8' : '12') + '"><label class="form-label">Remarks</label><input type="text" class="form-control" id="tRemarks" placeholder="Optional feedback or remarks…" value="' + escHtml(remarksVal) + '"></div>' : '') +
    '<div class="col-12 mt-1"><label class="form-label">Checklist</label>' +
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
    '<input type="checkbox" class="form-check-input" ' + (c.done ? 'checked' : '') + ' aria-label="Item done">' +
    '<input type="text" class="form-control form-control-sm" value="' + escHtml(c.text) + '" placeholder="Item…" aria-label="Checklist item">' +
    '<button type="button" class="btn-icon" style="width:28px;height:28px;flex-shrink:0" onclick="this.closest(\'.tk-modal-cl-row\').remove()" aria-label="Remove item"><i class="bi bi-x" style="font-size:.8rem"></i></button>' +
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
  var teHrsEl   = document.getElementById('tTeHrs');
  var teMinsEl  = document.getElementById('tTeMins');

  var timeEstimate = parseTimeEstimate(teHrsEl ? teHrsEl.value : 0, teMinsEl ? teMinsEl.value : 0);

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
    timeEstimate: timeEstimate,
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
