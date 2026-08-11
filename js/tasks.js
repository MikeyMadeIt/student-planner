/* ============================================================
   TASKS.JS — Redesigned productivity-focused Task page
   ============================================================ */

let tkFilter = 'all';
let tkExpandedId = null;

/* ── Init ── */
function initTasks() {
  populateSubjectFilter();
  renderTasks();
  document.getElementById('tkSearch').addEventListener('input', debounce(renderTasks, 180));
  const params = new URLSearchParams(location.search);
  if (params.get('new') === '1') openTaskModal();

  // Register quick-add handler for sidebar shortcut
  window.quickAddHandlers = window.quickAddHandlers || {};
  window.quickAddHandlers['task'] = () => openTaskModal();
}

function setFilter(f) {
  tkFilter = f;
  document.querySelectorAll('.tk-pill').forEach(b => b.classList.toggle('active', b.dataset.filter === f));
  renderTasks();
}

function populateSubjectFilter() {
  const semId = DB.getActiveSemesterId();
  const subs = DB.getSubjects().filter(s => s.semesterId === semId);
  const sel = document.getElementById('tkSubFilter');
  sel.innerHTML = '<option value="">All Subjects</option>' +
    subs.map(s => `<option value="${s.id}">${escHtml(s.code)}</option>`).join('');
}

/* ── Compute task status ── */
function computeStatus(t) {
  if (t.status === 'completed') return 'completed';
  const prog = computeProgress(t);
  const now = new Date();
  const due = t.dueDate ? new Date(`${t.dueDate}T${t.dueTime || '23:59'}:00`) : null;
  const isOverdue = due && due < now;
  if (isOverdue && prog < 100) return 'overdue';
  if (prog === 100) return 'completed';
  if (prog > 0) return 'in-progress';
  return 'not-started';
}

function computeProgress(t) {
  if (!t.checklist || t.checklist.length === 0) return t.progress || 0;
  const done = t.checklist.filter(c => c.done).length;
  return Math.round((done / t.checklist.length) * 100);
}

/* ── Get due bucket for grouping ── */
function getDueBucket(t) {
  const status = computeStatus(t);
  if (status === 'completed') return 'completed';
  if (status === 'overdue') return 'overdue';
  if (!t.dueDate) return 'upcoming';
  const today = todayKey();
  const tomorrow = ymdLocal(new Date(Date.now() + 86400000));
  if (t.dueDate === today) return 'today';
  if (t.dueDate === tomorrow) return 'tomorrow';
  if (t.dueDate > today) return 'upcoming';
  return 'overdue';
}

/* ── Relative due label ── */
function dueLabelHtml(t, status) {
  if (!t.dueDate) return '';
  const due = new Date(`${t.dueDate}T${t.dueTime || '23:59'}:00`);
  const now = new Date();
  const diffMs = due - now;
  const diffMins = Math.round(diffMs / 60000);
  const diffDays = Math.floor(diffMs / 86400000);
  const timeStr = fmtTime(t.dueTime || '23:59');

  let relLabel = '';
  let relClass = '';

  if (status === 'completed') {
    const d = new Date(t.dueDate + 'T00:00:00');
    relLabel = `Due ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${timeStr}`;
    relClass = 'tk-due-done';
  } else if (diffMins < 0) {
    const overDays = Math.abs(Math.ceil(diffMs / 86400000));
    relLabel = overDays === 0 ? 'Overdue today' : `Overdue by ${overDays} day${overDays !== 1 ? 's' : ''}`;
    relClass = 'tk-due-overdue';
  } else if (t.dueDate === todayKey()) {
    relLabel = `Due today · ${timeStr}`;
    relClass = 'tk-due-today';
  } else if (diffDays === 1) {
    relLabel = `Due tomorrow · ${timeStr}`;
    relClass = 'tk-due-soon';
  } else if (diffDays <= 7) {
    const d = new Date(t.dueDate + 'T00:00:00');
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    relLabel = `${dayName}, ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${timeStr}`;
    relClass = 'tk-due-week';
  } else {
    const d = new Date(t.dueDate + 'T00:00:00');
    relLabel = `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${timeStr}`;
    relClass = 'tk-due-normal';
  }

  return `<span class="tk-due-label ${relClass}">${relLabel}</span>`;
}

function timeLeftLabel(t, status) {
  if (status === 'completed' || status === 'overdue' || !t.dueDate) return '';
  const due = new Date(`${t.dueDate}T${t.dueTime || '23:59'}:00`);
  const diffMs = due - new Date();
  if (diffMs < 0) return '';
  const diffDays = Math.floor(diffMs / 86400000);
  const diffHrs = Math.floor(diffMs / 3600000);
  let label = '';
  if (diffDays === 0 && diffHrs < 1) {
    const diffMins = Math.round(diffMs / 60000);
    label = `${diffMins}m left`;
  } else if (diffDays === 0) {
    label = `${diffHrs}h left`;
  } else {
    label = `${diffDays} day${diffDays !== 1 ? 's' : ''} left`;
  }
  return `<span class="tk-time-left">${label}</span>`;
}

/* ── Priority dot ── */
function priDot(p) {
  const map = { high: 'tk-pri-high', medium: 'tk-pri-med', low: 'tk-pri-low' };
  return `<span class="tk-pri-dot ${map[p] || ''}"></span>`;
}

/* ── Category label ── */
function catLabel(c) {
  return `<span class="tk-cat-lbl">${escHtml(c || 'Other')}</span>`;
}

/* ── Progress bar HTML ── */
function progressHtml(prog, checklist) {
  const done = checklist ? checklist.filter(c => c.done).length : 0;
  const total = checklist ? checklist.length : 0;
  const hasChecklist = total > 0;
  const countLabel = hasChecklist ? `${done} / ${total} item${total !== 1 ? 's' : ''}` : (prog > 0 ? `${prog}%` : '');
  return `
    <div class="tk-progress-wrap">
      <div class="tk-progress-bar-track">
        <div class="tk-progress-bar-fill" style="width:${prog}%"></div>
      </div>
      <div class="tk-progress-meta">
        <span class="tk-prog-pct">${prog}%</span>
        ${countLabel ? `<span class="tk-prog-count">${countLabel}</span>` : ''}
      </div>
    </div>`;
}

/* ── Checklist HTML (expanded) ── */
function checklistHtml(t) {
  if (!t.checklist || !t.checklist.length) return `
    <div class="tk-cl-empty">
      <span class="text-faint" style="font-size:.78rem">No checklist items. Use Edit to add items.</span>
    </div>`;
  return `
    <div class="tk-cl-list" id="clList_${t.id}">
      ${t.checklist.map((c, i) => `
        <div class="tk-cl-item" data-taskid="${t.id}" data-i="${i}">
          <button class="tk-cl-check ${c.done ? 'done' : ''}" onclick="toggleChecklistItem('${t.id}', ${i})" title="${c.done ? 'Uncheck' : 'Check'}">
            ${c.done ? '<i class="bi bi-check-lg"></i>' : ''}
          </button>
          <span class="tk-cl-text ${c.done ? 'done' : ''}">${escHtml(c.text)}</span>
        </div>`).join('')}
    </div>`;
}

/* ── Metadata grid (expanded) ── */
function metaGridHtml(t) {
  const subs = DB.getSubjects();
  const sub = subs.find(s => s.id === t.subjectId);
  const created = t.createdAt ? new Date(t.createdAt) : null;
  const createdStr = created ? `${created.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · ${created.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : '—';
  const dueD = t.dueDate ? new Date(t.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const dueT = t.dueTime ? fmtTime(t.dueTime) : '';
  return `
    <div class="tk-meta-grid">
      <div class="tk-meta-row"><span class="tk-meta-k">Created</span><span class="tk-meta-v">${createdStr}</span></div>
      <div class="tk-meta-row"><span class="tk-meta-k">Due</span><span class="tk-meta-v">${dueD}${dueT ? ' · ' + dueT : ''}</span></div>
      <div class="tk-meta-row"><span class="tk-meta-k">Category</span><span class="tk-meta-v">${escHtml(t.category || '—')}</span></div>
      <div class="tk-meta-row"><span class="tk-meta-k">Priority</span><span class="tk-meta-v tk-meta-pri-${t.priority || 'low'}">${(t.priority || 'low').charAt(0).toUpperCase() + (t.priority || 'low').slice(1)}</span></div>
      <div class="tk-meta-row"><span class="tk-meta-k">Subject</span><span class="tk-meta-v">${sub ? escHtml(sub.name || sub.code) : '—'}</span></div>
    </div>`;
}

/* ── Build a single task card ── */
function buildTaskCard(t) {
  const status = computeStatus(t);
  const prog = computeProgress(t);
  const isExpanded = tkExpandedId === t.id;
  const isCompleted = status === 'completed';
  const isOverdue = status === 'overdue';
  const subs = DB.getSubjects();
  const sub = subs.find(s => s.id === t.subjectId);

  // Metadata line: category · priority dot · subject
  let metaLine = catLabel(t.category || 'Other');
  if (t.priority) metaLine += `${priDot(t.priority)}<span class="tk-pri-lbl tk-pri-${t.priority}">${t.priority.charAt(0).toUpperCase() + t.priority.slice(1)}</span>`;
  if (sub) metaLine += `<span class="tk-sep">·</span><span class="tk-sub-name">${escHtml(sub.code || sub.name)}</span>`;

  const dueHtml = dueLabelHtml(t, status);
  const tlHtml = timeLeftLabel(t, status);

  let statusBadge = '';
  if (isOverdue) statusBadge = `<span class="tk-status-badge overdue"><i class="bi bi-exclamation-circle"></i>Overdue</span>`;
  else if (isCompleted) statusBadge = `<span class="tk-status-badge completed"><i class="bi bi-check-circle"></i>Done</span>`;

  const collapsed = !isExpanded ? `
    <div class="tk-card-body-collapsed">
      <div class="tk-inline-meta">${metaLine}</div>
      ${progressHtml(prog, t.checklist)}
      <div class="tk-due-row">${dueHtml}${tlHtml}</div>
    </div>` : '';

  const expanded = isExpanded ? `
    <div class="tk-card-body-expanded">
      ${t.description ? `<p class="tk-description">${escHtml(t.description)}</p>` : ''}
      ${progressHtml(prog, t.checklist)}
      <div class="tk-cl-section">
        <div class="tk-cl-heading">Checklist</div>
        ${checklistHtml(t)}
      </div>
      <hr class="tk-divider">
      ${metaGridHtml(t)}
      <div class="tk-card-actions">
        <button class="btn btn-ghost btn-sm" onclick="openTaskModal('${t.id}')"><i class="bi bi-pencil me-1"></i>Edit</button>
        <button class="btn tk-btn-danger btn-sm" onclick="deleteTask('${t.id}')"><i class="bi bi-trash me-1"></i>Delete</button>
      </div>
    </div>` : '';

  return `
    <div class="tk-card ${isCompleted ? 'completed' : ''} ${isOverdue ? 'overdue' : ''} ${isExpanded ? 'expanded' : ''}" id="tkCard_${t.id}" data-taskid="${t.id}">
      <div class="tk-card-header" onclick="toggleCard('${t.id}')">
        <button class="tk-checkbox ${isCompleted ? 'done' : ''}" onclick="event.stopPropagation();toggleTaskComplete('${t.id}')" title="${isCompleted ? 'Mark incomplete' : 'Mark complete'}">
          ${isCompleted ? '<i class="bi bi-check-lg"></i>' : ''}
        </button>
        <div class="tk-card-title-wrap">
          <span class="tk-task-title ${isCompleted ? 'done' : ''}">${escHtml(t.title)}</span>
          ${statusBadge}
        </div>
        <button class="tk-expand-btn" title="${isExpanded ? 'Collapse' : 'Expand'}">
          <i class="bi bi-chevron-${isExpanded ? 'up' : 'down'}"></i>
        </button>
      </div>
      ${collapsed}
      ${expanded}
    </div>`;
}

/* ── Group builder ── */
function buildGroup(label, icon, tasks, groupClass, emptyMsg) {
  const cards = tasks.map(buildTaskCard).join('');
  const empty = `<div class="tk-group-empty">${emptyMsg}</div>`;
  return `
    <div class="tk-group ${groupClass}">
      <div class="tk-group-heading"><i class="bi ${icon}"></i>${label}<span class="tk-group-count">${tasks.length}</span></div>
      <div class="tk-group-cards">
        ${tasks.length ? cards : empty}
      </div>
    </div>`;
}

/* ── Main render ── */
function renderTasks() {
  const semId = DB.getActiveSemesterId();
  const allTasks = DB.getTasks().filter(t => t.semesterId === semId);

  // Auto-fix: sync completed status for tasks with 100% progress
  let changed = false;
  allTasks.forEach(t => {
    const prog = computeProgress(t);
    if (prog === 100 && t.status !== 'completed') {
      t.status = 'completed';
      if (!t.completedAt) t.completedAt = Date.now();
      changed = true;
    }
  });
  if (changed) DB.saveTasks(DB.getTasks()); // save only changed items

  // Stats
  const totalStat = allTasks.length;
  const doneStat = allTasks.filter(t => computeStatus(t) === 'completed').length;
  const overdueStat = allTasks.filter(t => computeStatus(t) === 'overdue').length;
  const activeStat = totalStat - doneStat;
  document.getElementById('statTotal').textContent = totalStat;
  document.getElementById('statActive').textContent = activeStat;
  document.getElementById('statDone').textContent = doneStat;
  document.getElementById('statOverdue').textContent = overdueStat;

  // Subject filter options refresh
  const semSubs = DB.getSubjects().filter(s => s.semesterId === semId);
  const subSel = document.getElementById('tkSubFilter');
  const curSubVal = subSel.value;
  subSel.innerHTML = '<option value="">All Subjects</option>' +
    semSubs.map(s => `<option value="${s.id}" ${s.id === curSubVal ? 'selected' : ''}>${escHtml(s.code)}</option>`).join('');

  // Search/filter
  const q = document.getElementById('tkSearch').value.toLowerCase().trim();
  const cat = document.getElementById('tkCatFilter').value;
  const subId = document.getElementById('tkSubFilter').value;
  const sort = document.getElementById('tkSort').value;

  let filtered = allTasks.filter(t => {
    if (q && !t.title.toLowerCase().includes(q) && !(t.description || '').toLowerCase().includes(q)) return false;
    if (cat && t.category !== cat) return false;
    if (subId && t.subjectId !== subId) return false;
    if (tkFilter === 'active') return computeStatus(t) !== 'completed';
    if (tkFilter === 'completed') return computeStatus(t) === 'completed';
    if (tkFilter === 'overdue') return computeStatus(t) === 'overdue';
    return true;
  });

  // Sort
  const priRank = { high: 0, medium: 1, low: 2 };
  if (sort === 'due') {
    filtered.sort((a, b) => {
      const da = (a.dueDate || '9999') + (a.dueTime || '23:59');
      const db = (b.dueDate || '9999') + (b.dueTime || '23:59');
      return da.localeCompare(db);
    });
  } else if (sort === 'priority') {
    filtered.sort((a, b) => (priRank[a.priority] || 2) - (priRank[b.priority] || 2));
  } else if (sort === 'created') {
    filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } else if (sort === 'updated') {
    filtered.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  } else if (sort === 'alpha') {
    filtered.sort((a, b) => a.title.localeCompare(b.title));
  }

  // Group
  const today = filtered.filter(t => getDueBucket(t) === 'today');
  const tomorrow = filtered.filter(t => getDueBucket(t) === 'tomorrow');
  const upcoming = filtered.filter(t => getDueBucket(t) === 'upcoming');
  const overdue = filtered.filter(t => getDueBucket(t) === 'overdue');
  const completed = filtered.filter(t => getDueBucket(t) === 'completed');

  const wrap = document.getElementById('tkGroups');

  if (!filtered.length) {
    wrap.innerHTML = `
      <div class="tk-empty-state glass card-pad fade-in">
        <i class="bi bi-inbox"></i>
        <p class="tk-empty-title">${tkFilter === 'completed' ? 'No completed tasks yet.' : tkFilter === 'overdue' ? 'No overdue tasks.' : 'No tasks yet'}</p>
        <p class="tk-empty-sub">${tkFilter === 'all' ? 'Start organizing your work for this semester.' : 'Nothing here right now.'}</p>
      </div>`;
    return;
  }

  let html = '';
  if (overdue.length) html += buildGroup('Overdue', 'bi-exclamation-triangle-fill', overdue, 'group-overdue', 'No overdue tasks.');
  if (today.length) html += buildGroup('Today', 'bi-sun-fill', today, 'group-today', 'No tasks due today.');
  if (tomorrow.length) html += buildGroup('Tomorrow', 'bi-calendar2-day', tomorrow, 'group-tomorrow', '');
  if (upcoming.length) html += buildGroup('Upcoming', 'bi-arrow-right-circle', upcoming, 'group-upcoming', 'No upcoming tasks. You\'re all caught up.');
  if (completed.length) html += buildGroup('Completed', 'bi-check-circle-fill', completed, 'group-completed', 'No completed tasks yet.');

  wrap.innerHTML = `<div class="tk-groups-wrap fade-in">${html}</div>`;
}

/* ── Toggle card expand/collapse ── */
function toggleCard(id) {
  tkExpandedId = tkExpandedId === id ? null : id;
  renderTasks();
  if (tkExpandedId) {
    setTimeout(() => {
      const el = document.getElementById(`tkCard_${id}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);
  }
}

/* ── Complete / uncomplete task ── */
function toggleTaskComplete(id) {
  const tasks = DB.getTasks();
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  if (t.status === 'completed') {
    t.status = 'not-started';
    t.progress = computeProgress(t);
    delete t.completedAt;
  } else {
    t.status = 'completed';
    t.progress = 100;
    t.completedAt = Date.now();
    if (t.checklist) t.checklist.forEach(c => c.done = true);
    fireConfetti();
    Toast.show('Task completed! 🎉');
  }
  DB.saveTasks(tasks);
  renderTasks();
}

/* ── Checklist live interactions ── */
function toggleChecklistItem(taskId, idx) {
  const tasks = DB.getTasks();
  const t = tasks.find(x => x.id === taskId);
  if (!t || !t.checklist) return;
  t.checklist[idx].done = !t.checklist[idx].done;
  const prog = computeProgress(t);
  t.progress = prog;
  t.updatedAt = Date.now();
  if (prog === 100 && t.status !== 'completed') {
    t.status = 'completed';
    t.completedAt = Date.now();
    DB.saveTasks(tasks);
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
  const tasks = DB.getTasks();
  const t = tasks.find(x => x.id === taskId);
  if (!t) return;
  const text = prompt('New checklist item:');
  if (!text || !text.trim()) return;
  if (!t.checklist) t.checklist = [];
  t.checklist.push({ text: text.trim(), done: false });
  t.progress = computeProgress(t);
  t.updatedAt = Date.now();
  DB.saveTasks(tasks);
  tkExpandedId = taskId;
  renderTasks();
}

function editChecklistItemLive(taskId, idx, el) {
  const tasks = DB.getTasks();
  const t = tasks.find(x => x.id === taskId);
  if (!t || !t.checklist) return;
  const newText = prompt('Edit item:', t.checklist[idx].text);
  if (newText === null) return;
  if (!newText.trim()) { deleteChecklistItem(taskId, idx); return; }
  t.checklist[idx].text = newText.trim();
  t.updatedAt = Date.now();
  DB.saveTasks(tasks);
  tkExpandedId = taskId;
  renderTasks();
}

function deleteChecklistItem(taskId, idx) {
  const tasks = DB.getTasks();
  const t = tasks.find(x => x.id === taskId);
  if (!t || !t.checklist) return;
  t.checklist.splice(idx, 1);
  t.progress = computeProgress(t);
  t.updatedAt = Date.now();
  DB.saveTasks(tasks);
  tkExpandedId = taskId;
  renderTasks();
}

/* ── Delete task ── */
function deleteTask(id) {
  const t = DB.getTasks().find(x => x.id === id);
  if (!t) return;
  confirmAction({
    title: 'Delete this task?',
    message: 'This will permanently remove the task and its checklist items.',
    confirmLabel: 'Delete', danger: true, icon: 'bi-trash-fill',
    onConfirm() {
      if (tkExpandedId === id) tkExpandedId = null;
      DB.saveTasks(DB.getTasks().filter(x => x.id !== id));
      Toast.show('Task deleted');
      renderTasks();
    }
  });
}

/* ── Add/Edit Modal ── */
function openTaskModal(id) {
  const t = id ? DB.getTasks().find(x => x.id === id) : null;
  document.getElementById('taskModalTitle').textContent = t ? 'Edit Task' : 'Add Task';
  const semId = DB.getActiveSemesterId();
  const subs = DB.getSubjects().filter(s => s.semesterId === semId);
  const checklist = t && t.checklist ? t.checklist : [];

  const CATEGORIES = ['Academic', 'Assignment', 'Project', 'Exam', 'Personal', 'Organization', 'Other'];
  const PRIORITIES = ['low', 'medium', 'high'];

  document.getElementById('taskModalBody').innerHTML = `
    <div class="row g-2">
      <input type="hidden" id="tId" value="${t ? t.id : ''}">
      <div class="col-12">
        <label>Task Title *</label>
        <input class="form-control" id="tTitle" value="${t ? escHtml(t.title) : ''}" placeholder="What needs to be done?" autocomplete="off">
      </div>
      <div class="col-12">
        <label>Description</label>
        <textarea class="form-control" id="tDesc" rows="2" placeholder="Optional details…">${t ? escHtml(t.description || '') : ''}</textarea>
      </div>
      <div class="col-md-4">
        <label>Category</label>
        <select class="form-select" id="tCategory">
          ${CATEGORIES.map(c => `<option ${t && t.category === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="col-md-4">
        <label>Subject</label>
        <select class="form-select" id="tSubject">
          <option value="">None</option>
          ${subs.map(s => `<option value="${s.id}" ${t && t.subjectId === s.id ? 'selected' : ''}>${escHtml(s.code)}</option>`).join('')}
        </select>
      </div>
      <div class="col-md-4">
        <label>Priority</label>
        <select class="form-select" id="tPriority">
          ${PRIORITIES.map(p => `<option value="${p}" ${t && t.priority === p ? 'selected' : ''}>${p.charAt(0).toUpperCase() + p.slice(1)}</option>`).join('')}
        </select>
      </div>
      <div class="col-md-6">
        <label>Due Date</label>
        <input type="date" class="form-control" id="tDueDate" value="${t ? t.dueDate : todayKey()}">
      </div>
      <div class="col-md-6">
        <label>Due Time</label>
        <input type="time" class="form-control" id="tDueTime" value="${t ? (t.dueTime || '23:59') : '23:59'}">
      </div>

      <div class="col-12 mt-1">
        <label>Checklist</label>
        <div id="modalChecklistWrap" class="tk-modal-cl-wrap">
          ${checklist.map((c, i) => modalClItemHtml(c, i)).join('')}
        </div>
        <button type="button" class="tk-cl-add-btn mt-1" onclick="modalAddClItem()"><i class="bi bi-plus"></i> Add item</button>
      </div>

      ${t ? `<div class="col-12"><div class="tk-modal-created-note"><i class="bi bi-clock"></i> Created ${new Date(t.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})} · ${new Date(t.createdAt).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</div></div>` : ''}
    </div>
    <button class="btn btn-accent w-100 mt-3" onclick="saveTask()">
      <i class="bi bi-check2 me-1"></i>${t ? 'Update Task' : 'Save Task'}
    </button>`;

  new bootstrap.Modal(document.getElementById('taskModal')).show();
}

function modalClItemHtml(c, i) {
  return `<div class="tk-modal-cl-row" data-i="${i}">
    <input type="checkbox" class="form-check-input" ${c.done ? 'checked' : ''}>
    <input type="text" class="form-control form-control-sm" value="${escHtml(c.text)}" placeholder="Item…">
    <button type="button" class="btn-icon" style="width:28px;height:28px;flex-shrink:0" onclick="this.closest('.tk-modal-cl-row').remove()"><i class="bi bi-x" style="font-size:.8rem"></i></button>
  </div>`;
}

function modalAddClItem() {
  const wrap = document.getElementById('modalChecklistWrap');
  const i = wrap.children.length;
  wrap.insertAdjacentHTML('beforeend', modalClItemHtml({ text: '', done: false }, i));
  wrap.lastElementChild.querySelector('input[type=text]').focus();
}

function saveTask() {
  const title = document.getElementById('tTitle').value.trim();
  if (!title) { Toast.show('Please enter a title', 'high', 'bi-exclamation-triangle'); return; }

  const checklist = [...document.querySelectorAll('.tk-modal-cl-row')].map(row => ({
    done: row.querySelector('input[type=checkbox]').checked,
    text: row.querySelector('input[type=text]').value.trim()
  })).filter(c => c.text);

  const id = document.getElementById('tId').value;
  const tasks = DB.getTasks();

  const data = {
    title,
    description: document.getElementById('tDesc').value.trim(),
    subjectId: document.getElementById('tSubject').value || null,
    category: document.getElementById('tCategory').value,
    priority: document.getElementById('tPriority').value,
    dueDate: document.getElementById('tDueDate').value,
    dueTime: document.getElementById('tDueTime').value,
    checklist,
    updatedAt: Date.now(),
  };
  data.progress = computeProgressFromChecklist(checklist, id ? (tasks.find(x => x.id === id) || {}).progress : 0);

  // Auto-set status
  if (data.progress === 100) {
    data.status = 'completed';
  } else if (data.progress > 0) {
    data.status = 'in-progress';
  } else {
    data.status = 'not-started';
  }

  if (id) {
    const idx = tasks.findIndex(t => t.id === id);
    const prev = tasks[idx];
    const wasCompleted = prev.status === 'completed';
    tasks[idx] = { ...prev, ...data };
    if (!wasCompleted && data.status === 'completed') { tasks[idx].completedAt = Date.now(); fireConfetti(); }
    if (wasCompleted && data.status !== 'completed') { delete tasks[idx].completedAt; }
  } else {
    const semId = DB.getActiveSemesterId();
    tasks.push({ id: DB.uid(), createdAt: Date.now(), semesterId: semId, ...data });
  }

  DB.saveTasks(tasks);
  bootstrap.Modal.getInstance(document.getElementById('taskModal')).hide();
  Toast.show(id ? 'Task updated' : 'Task added');
  renderTasks();
}

function computeProgressFromChecklist(cl, fallback) {
  if (!cl || !cl.length) return fallback || 0;
  const done = cl.filter(c => c.done).length;
  return Math.round((done / cl.length) * 100);
}

/* ── Utility ── */
function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}
