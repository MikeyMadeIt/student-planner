/* ============================================================
   NOTES.JS — v3 Comprehensive Update
   Features: bulk-select, tags, templates, PDF export, masonry,
             note preview modal, edit button, tag input fix,
             word count, reading time, compact metadata
   ============================================================ */

/* ── State ── */
let favFilterOn    = false;
let noteLinkFilter = 'all';
let noteLinkSubId  = '';
let noteLinkTaskId = '';
let ntSelectMode   = false;
let ntSelected     = new Set();
let ntTagFilter    = '';

/* ── Templates ── */
const NOTE_TEMPLATES = {
  blank: { label: 'Blank Note', icon: 'bi-file-earmark', content: '' },
  lecture: {
    label: 'Lecture Notes',
    icon: 'bi-journal-text',
    content: '# Topic\n\n## Key Concepts\n\n- \n\n## Important Details\n\n- \n\n## Questions\n\n- \n\n## Summary\n\n- '
  },
  meeting: {
    label: 'Meeting Minutes',
    icon: 'bi-people',
    content: '# Meeting\n\nDate: \n\n## Attendees\n\n- \n\n## Agenda\n\n- \n\n## Discussion\n\n- \n\n## Decisions\n\n- \n\n## Action Items\n\n- [ ] '
  },
  study: {
    label: 'Study Plan',
    icon: 'bi-book',
    content: '# Study Plan\n\n## Goal\n\n- \n\n## Topics\n\n- [ ] \n\n## Schedule\n\n- \n\n## Resources\n\n- \n\n## Review Checklist\n\n- [ ] '
  }
};

/* ── Init ── */
function initNotes() {
  renderNotes();
  var searchEl = document.getElementById('noteSearch');
  if (searchEl) searchEl.addEventListener('input', debounce(renderNotes, 200));

  var catEl = document.getElementById('noteCatFilter');
  if (catEl) catEl.addEventListener('change', renderNotes);

  var linkEl = document.getElementById('noteLinkFilterSel');
  if (linkEl) {
    linkEl.addEventListener('change', function () {
      noteLinkFilter = this.value;
      var subSel  = document.getElementById('noteSubFilterSel');
      var taskSel = document.getElementById('noteTaskFilterSel');
      if (subSel)  subSel.style.display  = (noteLinkFilter === 'subject') ? '' : 'none';
      if (taskSel) taskSel.style.display = (noteLinkFilter === 'task')    ? '' : 'none';
      renderNotes();
    });
  }
  var subEl = document.getElementById('noteSubFilterSel');
  if (subEl) subEl.addEventListener('change', function () { noteLinkSubId = this.value; renderNotes(); });

  var taskEl = document.getElementById('noteTaskFilterSel');
  if (taskEl) taskEl.addEventListener('change', function () { noteLinkTaskId = this.value; renderNotes(); });

  populateNoteLinkFilters();
}

function populateNoteLinkFilters() {
  var semId = DB.getActiveSemesterId();
  var subs  = DB.getSubjects().filter(function (s) { return s.semesterId === semId; });
  var tasks = DB.getTasks().filter(function (t) { return t.semesterId === semId; });
  var subSel  = document.getElementById('noteSubFilterSel');
  var taskSel = document.getElementById('noteTaskFilterSel');
  if (!subSel || !taskSel) return;
  var prevSubVal  = subSel.value;
  var prevTaskVal = taskSel.value;
  subSel.innerHTML  = '<option value="">All Subjects</option>' +
    subs.map(function (s) { return '<option value="' + s.id + '"' + (prevSubVal === s.id ? ' selected' : '') + '>' + escapeHtml(s.code || s.name) + '</option>'; }).join('');
  taskSel.innerHTML = '<option value="">All Tasks</option>' +
    tasks.map(function (t) { return '<option value="' + t.id + '"' + (prevTaskVal === t.id ? ' selected' : '') + '>' + escapeHtml(t.title) + '</option>'; }).join('');
}

/* ── Favorites filter ── */
function toggleFavFilter() {
  favFilterOn = !favFilterOn;
  var btn = document.getElementById('favFilterBtn');
  if (btn) {
    btn.classList.toggle('nt-icon-btn-active', favFilterOn);
    btn.querySelector('i').className = favFilterOn ? 'bi bi-star-fill' : 'bi bi-star';
    btn.title = favFilterOn ? 'Show all notes' : 'Favorites only';
  }
  renderNotes();
}

/* ── Select mode ── */
function enterSelectMode() {
  ntSelectMode = true;
  ntSelected.clear();
  var btn = document.getElementById('ntSelectBtn');
  if (btn) {
    btn.classList.add('nt-icon-btn-active');
    btn.title = 'Exit selection mode';
    btn.setAttribute('aria-label', 'Exit selection mode');
  }
  renderNotes();
}

function exitSelectMode() {
  ntSelectMode = false;
  ntSelected.clear();
  var btn = document.getElementById('ntSelectBtn');
  if (btn) {
    btn.classList.remove('nt-icon-btn-active');
    btn.title = 'Select notes';
    btn.setAttribute('aria-label', 'Select notes');
  }
  renderNotes();
}

function toggleSelectMode() {
  if (ntSelectMode) exitSelectMode();
  else enterSelectMode();
}

function toggleNoteSelect(id) {
  if (ntSelected.has(id)) ntSelected.delete(id);
  else ntSelected.add(id);
  renderNotes();
}

function selectAllVisible() {
  var list = getFilteredNotes();
  var ids  = list.map(function (n) { return n.id; });
  var allSel = ids.length > 0 && ids.every(function (id) { return ntSelected.has(id); });
  ids.forEach(function (id) { if (allSel) ntSelected.delete(id); else ntSelected.add(id); });
  renderNotes();
}

/* ── Bulk toolbar ── */
function renderNtBulkToolbar() {
  var existing = document.getElementById('ntBulkToolbar');
  if (existing) existing.remove();
  if (!ntSelectMode || ntSelected.size === 0) return;

  var count = ntSelected.size;
  var wrap  = document.createElement('div');
  wrap.id   = 'ntBulkToolbar';
  wrap.className = 'nt-bulk-toolbar fade-in';
  wrap.setAttribute('aria-label', 'Note bulk actions');
  wrap.innerHTML =
    '<span class="nt-bulk-count"><i class="bi bi-check2-square"></i>' + count + ' selected</span>' +
    '<div class="nt-bulk-actions">' +
    '<button class="nt-bulk-btn nt-bulk-fav" onclick="bulkFavoriteNotes(true)" aria-label="Favorite selected notes" title="Favorite"><i class="bi bi-star-fill"></i><span>Fav</span></button>' +
    '<button class="nt-bulk-btn nt-bulk-unfav" onclick="bulkFavoriteNotes(false)" aria-label="Unfavorite selected notes" title="Unfavorite"><i class="bi bi-star"></i><span>Unfav</span></button>' +
    '<button class="nt-bulk-btn nt-bulk-delete" onclick="bulkDeleteNotes()" aria-label="Delete selected notes" title="Delete"><i class="bi bi-trash"></i><span>Delete</span></button>' +
    '<button class="nt-bulk-btn nt-bulk-clear" onclick="exitSelectMode()" aria-label="Exit selection mode" title="Done"><i class="bi bi-x-lg"></i></button>' +
    '</div>';

  var grid = document.getElementById('notesGrid');
  if (grid) grid.parentNode.insertBefore(wrap, grid);
}

/* ── Bulk actions ── */
function bulkFavoriteNotes(setFav) {
  var notes = DB.getNotes();
  var ids   = Array.from(ntSelected);
  ids.forEach(function (id) {
    var n = notes.find(function (x) { return x.id === id; });
    if (n) { n.favorite = setFav; n.updatedAt = Date.now(); }
  });
  DB.saveNotes(notes);
  ntSelected.clear();
  Toast.show(setFav ? 'Added to favorites' : 'Removed from favorites');
  renderNotes();
}

function bulkDeleteNotes() {
  var count = ntSelected.size;
  confirmAction({
    title: 'Delete ' + count + ' note' + (count !== 1 ? 's' : '') + '?',
    message: 'This will permanently remove the selected notes.',
    confirmLabel: 'Delete', danger: true, icon: 'bi-trash-fill',
    onConfirm: function () {
      var ids = Array.from(ntSelected);
      DB.saveNotes(DB.getNotes().filter(function (n) { return !ids.includes(n.id); }));
      ntSelected.clear();
      exitSelectMode();
      Toast.show(count + ' note' + (count !== 1 ? 's' : '') + ' deleted');
      renderNotes();
    }
  });
}

/* ── Filtering ── */
function getFilteredNotes() {
  var q     = (document.getElementById('noteSearch') || {}).value || '';
  q = q.toLowerCase().trim();
  var cat   = (document.getElementById('noteCatFilter') || {}).value || '';
  var semId = DB.getActiveSemesterId();
  var subs  = DB.getSubjects().filter(function (s) { return s.semesterId === semId; });
  var tasks = DB.getTasks().filter(function (t) { return t.semesterId === semId; });
  var list  = DB.getNotes().filter(function (n) { return n.semesterId === semId; });

  if (q) {
    list = list.filter(function (n) {
      var sub  = n.subjectId ? subs.find(function (s) { return s.id === n.subjectId; }) : null;
      var task = n.taskId    ? tasks.find(function (t) { return t.id === n.taskId; }) : null;
      var tags = (n.tags || []).join(' ').toLowerCase();
      var subName  = sub  ? (sub.code  || sub.name  || '').toLowerCase() : '';
      var taskName = task ? (task.title || '').toLowerCase() : '';
      return n.title.toLowerCase().includes(q) ||
             (n.content || '').toLowerCase().includes(q) ||
             (n.category || '').toLowerCase().includes(q) ||
             tags.includes(q) ||
             subName.includes(q) ||
             taskName.includes(q);
    });
  }
  if (cat)          list = list.filter(function (n) { return n.category === cat; });
  if (favFilterOn)  list = list.filter(function (n) { return n.favorite; });
  if (ntTagFilter)  list = list.filter(function (n) { return (n.tags || []).some(function (t) { return t.toLowerCase() === ntTagFilter.toLowerCase(); }); });

  if (noteLinkFilter === 'subject') {
    list = list.filter(function (n) { return noteLinkSubId ? n.subjectId === noteLinkSubId : !!n.subjectId; });
  } else if (noteLinkFilter === 'task') {
    list = list.filter(function (n) { return noteLinkTaskId ? n.taskId === noteLinkTaskId : !!n.taskId; });
  } else if (noteLinkFilter === 'unlinked') {
    list = list.filter(function (n) { return !n.subjectId && !n.taskId; });
  }

  list.sort(function (a, b) { return (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt); });
  return list;
}

/* ── Word count + reading time ── */
function calcWordCount(content) {
  if (!content) return 0;
  var text = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~`>]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^[-*] \[[ x]\] /gm, '')
    .replace(/^[-*+] /gm, '')
    .replace(/^\d+\. /gm, '')
    .trim();
  if (!text) return 0;
  return text.split(/\s+/).filter(function (w) { return w.length > 0; }).length;
}

function calcReadingTime(words) {
  var mins = Math.max(1, Math.ceil(words / 200));
  return mins + ' min read';
}

/* ── Card preview (short excerpt) ── */
function mdCardPreview(content) {
  var text = (content || '')
    .replace(/```[\s\S]*?```/g, '[code]')
    .replace(/`[^`]+`/g, '[code]')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^- \[[ x]\] /gm, '')
    .replace(/^[-*] /gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
  return escapeHtml(text.slice(0, 140)) + (text.length > 140 ? '…' : '');
}

/* ── Render notes grid (masonry) ── */
function renderNotes() {
  populateNoteLinkFilters();
  renderNtBulkToolbar();
  updateSelectAllBtn();

  var wrap = document.getElementById('notesGrid');
  var list = getFilteredNotes();

  if (!list.length) {
    wrap.innerHTML = '<div class="nt-empty glass card-pad text-center py-5 text-faint"><i class="bi bi-journal-x" style="font-size:2rem;display:block;margin-bottom:8px;opacity:.4"></i>No notes found. Create your first note!</div>';
    return;
  }

  var semId = DB.getActiveSemesterId();
  var subs  = DB.getSubjects().filter(function (s) { return s.semesterId === semId; });
  var tasks = DB.getTasks().filter(function (t) { return t.semesterId === semId; });

  wrap.innerHTML = list.map(function (n) {
    var sub      = n.subjectId  ? subs.find(function (s) { return s.id === n.subjectId; })  : null;
    var task     = n.taskId     ? tasks.find(function (t) { return t.id === n.taskId; }) : null;
    var taskBroken = n.taskId && !task;
    var isSelected = ntSelected.has(n.id);
    var tags     = n.tags || [];

    // Word count
    var wc    = calcWordCount(n.content);
    var wcHtml = '<span class="nt-card-wc">' + (wc > 0 ? wc.toLocaleString() + ' words · ' + calcReadingTime(wc) : 'Empty note') + '</span>';

    var preview = mdCardPreview(n.content);
    var date    = new Date(n.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    // Bottom meta row: subject code · task · tags (all inline)
    var bottomMeta = '';
    var bottomParts = [];
    if (sub)  bottomParts.push('<span class="nt-bm-sub"><i class="bi bi-book"></i>' + escapeHtml(sub.code || sub.name) + '</span>');
    if (task) bottomParts.push('<span class="nt-bm-task"><i class="bi bi-arrow-up-right-square"></i>' + escapeHtml(task.title) + '</span>');
    if (taskBroken) bottomParts.push('<span class="nt-bm-broken">Task unavailable</span>');
    if (tags.length > 0) {
      var visibleTags2 = tags.slice(0, 3);
      var hiddenCount2 = tags.length - visibleTags2.length;
      visibleTags2.forEach(function(t) { bottomParts.push('<span class="nt-bm-tag">' + escapeHtml(t) + '</span>'); });
      if (hiddenCount2 > 0) bottomParts.push('<span class="nt-bm-more">+' + hiddenCount2 + '</span>');
    }
    if (bottomParts.length > 0) {
      bottomMeta = '<div class="nt-card-bottom-meta">' + bottomParts.join('') + '</div>';
    }

    return '<div class="nt-masonry-item' + (isSelected ? ' nt-note-selected' : '') + '" id="ntCard_' + n.id + '">' +
      '<div class="glass note-card" data-noteid="' + n.id + '">' +
      '<div class="note-card-header">' +
      (ntSelectMode ? '<button class="nt-select-check' + (isSelected ? ' selected' : '') + '" onclick="event.stopPropagation();toggleNoteSelect(\'' + n.id + '\')" aria-label="' + (isSelected ? 'Deselect' : 'Select') + ' note" title="' + (isSelected ? 'Deselect' : 'Select') + '">' + (isSelected ? '<i class="bi bi-check-lg"></i>' : '') + '</button>' : '') +
      '<div class="note-card-title-wrap">' +
      (n.pinned ? '<i class="bi bi-pin-angle-fill note-pin" title="Pinned" aria-hidden="true"></i>' : '') +
      '<span class="note-card-title">' + escapeHtml(n.title) + '</span>' +
      '</div>' +
      '<div class="nt-card-actions">' +
      '<span class="nt-card-cat-pill">' + escapeHtml(n.category) + '</span>' +
      '<button class="nt-card-action-box ' + (n.favorite ? 'nt-fav-active' : '') + '" onclick="event.stopPropagation();toggleFavorite(\'' + n.id + '\')" title="' + (n.favorite ? 'Unfavorite' : 'Favorite') + '" aria-label="' + (n.favorite ? 'Remove from favorites' : 'Add to favorites') + '"><i class="bi ' + (n.favorite ? 'bi-star-fill' : 'bi-star') + '"></i></button>' +
      '<button class="nt-card-action-box" onclick="event.stopPropagation();openNoteModal(\'' + n.id + '\')" title="Edit note" aria-label="Edit note"><i class="bi bi-pencil"></i></button>' +
      '</div>' +
      '</div>' +
      '<div class="note-preview-text">' + preview + '</div>' +
      bottomMeta +
      '<div class="note-card-footer">' +
      wcHtml +
      '<span class="note-footer-date">' + date + '</span>' +
      '</div>' +
      '</div></div>';
  }).join('');

  // Attach card-body / preview-text click → open preview
  wrap.querySelectorAll('.note-card').forEach(function (card) {
    card.addEventListener('click', function (e) {
      // Only trigger if clicking the card body or preview text (not buttons/chips)
      var isButton = e.target.closest('button') || e.target.closest('.nt-card-action-box') || e.target.closest('.nt-select-check');
      var isInteractive = e.target.closest('.nt-card-actions') || e.target.closest('.nt-card-cat-pill');
      if (isButton || isInteractive) return;
      var noteId = card.dataset.noteid;
      if (ntSelectMode) {
        toggleNoteSelect(noteId);
      } else {
        openNotePreview(noteId);
      }
    });
  });
}

/* ── Update select-all button ── */
function updateSelectAllBtn() {
  var btn = document.getElementById('ntSelectAllBtn');
  if (!btn) return;
  if (!ntSelectMode) { btn.style.display = 'none'; return; }
  btn.style.display = '';
  var list = getFilteredNotes();
  var ids  = list.map(function (n) { return n.id; });
  var allSel = ids.length > 0 && ids.every(function (id) { return ntSelected.has(id); });
  var count  = ntSelected.size;
  if (allSel) {
    btn.innerHTML = '<i class="bi bi-check2-square"></i><span>' + count + '</span>';
    btn.classList.add('nt-select-all-active');
    btn.setAttribute('aria-label', 'Deselect all notes');
  } else if (count > 0) {
    btn.innerHTML = '<i class="bi bi-dash-square"></i><span>' + count + '</span>';
    btn.classList.remove('nt-select-all-active');
    btn.setAttribute('aria-label', count + ' notes selected');
  } else {
    btn.innerHTML = '<i class="bi bi-check2-square"></i><span>All</span>';
    btn.classList.remove('nt-select-all-active');
    btn.setAttribute('aria-label', 'Select all notes');
  }
  btn.onclick = function () { selectAllVisible(); };
}

/* ── Toggle favorite ── */
function toggleFavorite(id) {
  var notes = DB.getNotes();
  var n     = notes.find(function (x) { return x.id === id; });
  if (!n) return;
  n.favorite = !n.favorite;
  DB.saveNotes(notes);
  renderNotes();
}

/* ── Note Preview Modal ── */
function openNotePreview(id) {
  var notes = DB.getNotes();
  var n     = notes.find(function (x) { return x.id === id; });
  if (!n) return;

  var semId = DB.getActiveSemesterId();
  var subs  = DB.getSubjects().filter(function (s) { return s.semesterId === semId; });
  var tasks = DB.getTasks().filter(function (t) { return t.semesterId === semId; });
  var sub   = n.subjectId ? subs.find(function (s) { return s.id === n.subjectId; }) : null;
  var task  = n.taskId    ? tasks.find(function (t) { return t.id === n.taskId; }) : null;
  var tags  = n.tags || [];
  var wc    = calcWordCount(n.content);

  var metaHtml = '';
  if (sub)  metaHtml += '<span class="nt-prev-meta-item"><i class="bi bi-book"></i>' + escapeHtml(sub.code || sub.name) + '</span>';
  if (task) metaHtml += '<span class="nt-prev-meta-item"><i class="bi bi-arrow-up-right-square"></i>' + escapeHtml(task.title) + '</span>';

  var tagHtml = tags.length > 0
    ? '<div class="nt-prev-tags">' + tags.map(function (t) { return '<span class="nt-tag-chip">' + escapeHtml(t) + '</span>'; }).join('') + '</div>'
    : '';

  var wcHtml = wc > 0 ? '<span class="nt-prev-wc"><i class="bi bi-text-paragraph"></i>' + wc.toLocaleString() + ' words · ' + calcReadingTime(wc) + '</span>' : '';
  var dateHtml = n.createdAt ? '<span class="nt-prev-wc"><i class="bi bi-calendar3"></i>Updated ' + new Date(n.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + '</span>' : '';

  var existing = document.getElementById('ntPreviewOverlay');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id  = 'ntPreviewOverlay';
  overlay.className = 'nt-preview-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Note preview');
  overlay.innerHTML =
    '<div class="nt-preview-backdrop" onclick="closeNotePreview()"></div>' +
    '<div class="nt-preview-panel">' +
    '<div class="nt-preview-header">' +
    '<div class="nt-preview-title-wrap">' +
    (n.pinned ? '<i class="bi bi-pin-angle-fill nt-preview-pin" aria-hidden="true"></i>' : '') +
    '<h2 class="nt-preview-title">' + escapeHtml(n.title) + '</h2>' +
    '</div>' +
    '<div class="nt-preview-header-actions">' +
    '<button class="nt-preview-action-btn" onclick="closeNotePreview();openNoteModal(\'' + n.id + '\')" aria-label="Edit note" title="Edit note"><i class="bi bi-pencil"></i></button>' +
    '<button class="nt-preview-action-btn" onclick="exportNotePdf(\'' + n.id + '\')" aria-label="Export PDF" title="Export PDF"><i class="bi bi-file-earmark-pdf"></i></button>' +
    '<button class="nt-preview-close" onclick="closeNotePreview()" aria-label="Close preview"><i class="bi bi-x-lg"></i></button>' +
    '</div>' +
    '</div>' +
    '<div class="nt-preview-submeta">' +
    '<span class="nt-prev-cat">' + escapeHtml(n.category) + '</span>' +
    tagHtml +
    (metaHtml ? '<div class="nt-prev-links">' + metaHtml + '</div>' : '') +
    '<div class="nt-prev-stats">' + wcHtml + dateHtml + '</div>' +
    '</div>' +
    '<div class="nt-preview-content" id="ntPreviewContent">' +
    renderMarkdown(n.content, n.id) +
    '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  requestAnimationFrame(function () { overlay.classList.add('open'); });

  // Trap focus / close on Escape
  overlay.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeNotePreview();
  });
  setTimeout(function () {
    var closeBtn = overlay.querySelector('.nt-preview-close');
    if (closeBtn) closeBtn.focus();
  }, 100);
}

function closeNotePreview() {
  var overlay = document.getElementById('ntPreviewOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  setTimeout(function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 280);
}

/* ── Markdown renderer (unchanged + checklist toggling) ── */
function renderMarkdown(src, noteId) {
  var html = src || '';
  var codeBlocks = [];
  html = html.replace(/```([\w]*)\n?([\s\S]*?)```/g, function (m, lang, code) {
    var idx = codeBlocks.length;
    codeBlocks.push('<pre class="md-code-block"><code>' + escapeHtml(code) + '</code></pre>');
    return '\x00CODE' + idx + '\x00';
  });
  html = escapeHtml(html);
  html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/^### (.*$)/gim, '<h6 class="md-h">$1</h6>');
  html = html.replace(/^## (.*$)/gim,  '<h5 class="md-h">$1</h5>');
  html = html.replace(/^# (.*$)/gim,   '<h4 class="md-h">$1</h4>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Checklists
  html = html.replace(/^- \[x\] (.*$)/gim, function (m, text) {
    if (noteId) {
      return '<div class="md-checklist-item md-checked" onclick="toggleNoteChecklistItem(\'' + noteId + '\', this, true)">' +
        '<span class="md-cl-box md-cl-checked"><i class="bi bi-check-lg"></i></span>' +
        '<span class="md-cl-text md-cl-done">' + text + '</span></div>';
    }
    return '<div class="md-checklist-item md-checked"><span class="md-cl-box md-cl-checked"><i class="bi bi-check-lg"></i></span><span class="md-cl-text md-cl-done">' + text + '</span></div>';
  });
  html = html.replace(/^- \[ \] (.*$)/gim, function (m, text) {
    if (noteId) {
      return '<div class="md-checklist-item" onclick="toggleNoteChecklistItem(\'' + noteId + '\', this, false)">' +
        '<span class="md-cl-box"></span><span class="md-cl-text">' + text + '</span></div>';
    }
    return '<div class="md-checklist-item"><span class="md-cl-box"></span><span class="md-cl-text">' + text + '</span></div>';
  });

  // Numbered lists
  var inOl = false;
  var lines = html.split('\n');
  html = lines.map(function (line) {
    var nm = line.match(/^(\d+)\. (.*)$/);
    if (nm) { if (!inOl) { inOl = true; return '<ol><li>' + nm[2] + '</li>'; } return '<li>' + nm[2] + '</li>'; }
    if (inOl) { inOl = false; return '</ol>' + line; }
    return line;
  }).join('\n');
  if (inOl) html += '</ol>';

  html = html.replace(/^[-*] (.*$)/gim, '<li class="md-li">$1</li>');
  html = html.replace(/(<li class="md-li">[\s\S]*?<\/li>(?:\n<li class="md-li">[\s\S]*?<\/li>)*)/g, '<ul class="md-ul">$1</ul>');
  html = html.replace(/\n{2,}/g, '</p><p class="md-p">');
  html = html.replace(/\n/g, '<br>');
  html = '<p class="md-p">' + html + '</p>';
  codeBlocks.forEach(function (block, idx) { html = html.replace('\x00CODE' + idx + '\x00', block); });
  html = html.replace(/<p class="md-p"><\/p>/g, '');
  html = html.replace(/<p class="md-p"><br><\/p>/g, '');
  return html;
}

function toggleNoteChecklistItem(noteId, el, currentlyChecked) {
  var notes = DB.getNotes();
  var n     = notes.find(function (x) { return x.id === noteId; });
  if (!n) return;
  var textEl  = el.querySelector('.md-cl-text');
  var textTxt = textEl ? textEl.textContent : '';
  var lines   = n.content.split('\n');
  var pattern = currentlyChecked
    ? new RegExp('^- \\[x\\] ' + escapeRegExp(textTxt) + '$')
    : new RegExp('^- \\[ \\] ' + escapeRegExp(textTxt) + '$');
  var changed = false;
  n.content = lines.map(function (line) {
    if (!changed && pattern.test(line)) {
      changed = true;
      return currentlyChecked ? line.replace(/^- \[x\] /, '- [ ] ') : line.replace(/^- \[ \] /, '- [x] ');
    }
    return line;
  }).join('\n');
  if (changed) {
    n.updatedAt = Date.now();
    DB.saveNotes(notes);
    var previewEl = document.getElementById('nPreview');
    if (previewEl) previewEl.innerHTML = renderMarkdown(n.content, n.id);
    var previewContent = document.getElementById('ntPreviewContent');
    if (previewContent) previewContent.innerHTML = renderMarkdown(n.content, n.id);
    var ta = document.getElementById('nContent');
    if (ta) ta.value = n.content;
  }
}

function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/* ── Markdown toolbar ── */
function mdInsert(before, after, placeholder) {
  var ta = document.getElementById('nContent');
  if (!ta) return;
  var start = ta.selectionStart, end = ta.selectionEnd;
  var sel   = ta.value.substring(start, end) || placeholder || '';
  ta.value  = ta.value.substring(0, start) + before + sel + (after || '') + ta.value.substring(end);
  ta.selectionStart = start + before.length;
  ta.selectionEnd   = start + before.length + sel.length;
  ta.focus();
  updateNotePreview();
}
function mdInsertLine(prefix) {
  var ta = document.getElementById('nContent');
  if (!ta) return;
  var start     = ta.selectionStart, val = ta.value;
  var lineStart = val.lastIndexOf('\n', start - 1) + 1;
  var lineEnd   = val.indexOf('\n', start);
  if (lineEnd === -1) lineEnd = val.length;
  var line = val.substring(lineStart, lineEnd);
  ta.value = val.substring(0, lineStart) + prefix + line + val.substring(lineEnd);
  ta.selectionStart = ta.selectionEnd = lineStart + prefix.length + line.length;
  ta.focus();
  updateNotePreview();
}
function mdInsertBlock(text) {
  var ta  = document.getElementById('nContent');
  if (!ta) return;
  var pos = ta.selectionStart, val = ta.value;
  var pre = (pos > 0 && val[pos - 1] !== '\n') ? '\n' : '';
  ta.value = val.substring(0, pos) + pre + text + val.substring(pos);
  ta.selectionStart = ta.selectionEnd = pos + pre.length + text.length;
  ta.focus();
  updateNotePreview();
}

/* ── Tag management for modal ── */
var ntCurrentTags = [];

function initTagInput(existingTags) {
  ntCurrentTags = existingTags ? existingTags.slice() : [];
  renderTagChips();
  var input = document.getElementById('nTagInput');
  if (!input) return;
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      addTagFromInput();
    } else if (e.key === 'Backspace' && input.value === '' && ntCurrentTags.length > 0) {
      ntCurrentTags.pop();
      renderTagChips();
    }
  });
  input.addEventListener('blur', function () {
    if (input.value.trim()) addTagFromInput();
  });
}

function addTagFromInput() {
  var input = document.getElementById('nTagInput');
  if (!input) return;
  var val = input.value.trim();
  if (!val) return;
  addTag(val);
  input.value = '';
  input.focus();
}

function addTag(tag) {
  if (!tag) return;
  var normalized = tag.trim().toLowerCase();
  if (!normalized) return;
  var exists = ntCurrentTags.some(function (t) { return t.toLowerCase() === normalized; });
  if (exists) return;
  ntCurrentTags.push(tag.trim());
  renderTagChips();
}

function removeTag(idx) {
  ntCurrentTags.splice(idx, 1);
  renderTagChips();
  var input = document.getElementById('nTagInput');
  if (input) input.focus();
}

function renderTagChips() {
  var container = document.getElementById('nTagsContainer');
  if (!container) return;
  var chips = ntCurrentTags.map(function (t, i) {
    return '<span class="nt-tag-edit-chip">' + escapeHtml(t) +
      '<button type="button" class="nt-tag-remove" onclick="removeTag(' + i + ')" aria-label="Remove tag ' + escapeHtml(t) + '"><i class="bi bi-x"></i></button></span>';
  }).join('');
  container.innerHTML = chips;
}

/* ── Note Templates ── */
function applyTemplate(key) {
  var tmpl = NOTE_TEMPLATES[key];
  if (!tmpl) return;
  var ta = document.getElementById('nContent');
  if (!ta) return;
  if (ta.value.trim() && key !== 'blank') {
    if (!confirm('Replace current content with the "' + tmpl.label + '" template?')) return;
  }
  ta.value = tmpl.content;
  updateNotePreview();
  ta.focus();
  // Close template dropdown if open
  var dd = document.getElementById('ntTemplateDropdown');
  if (dd) dd.style.display = 'none';
}

function toggleTemplateDropdown() {
  var dd = document.getElementById('ntTemplateDropdown');
  if (!dd) return;
  dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

/* ── Note Modal ── */
function openNoteModal(id) {
  var n     = id ? DB.getNotes().find(function (x) { return x.id === id; }) : null;
  var semId = DB.getActiveSemesterId();
  var subs  = DB.getSubjects().filter(function (s) { return s.semesterId === semId; });
  var tasks = DB.getTasks().filter(function (t) { return t.semesterId === semId; });
  var curSubId  = n ? (n.subjectId  || '') : '';
  var curTaskId = n ? (n.taskId     || '') : '';

  document.getElementById('noteModalTitle').textContent = n ? 'Edit Note' : 'New Note';

  var subOptions  = '<option value="">No Subject</option>' +
    subs.map(function (s) { return '<option value="' + s.id + '" ' + (curSubId === s.id ? 'selected' : '') + '>' + escapeHtml(s.code || s.name) + '</option>'; }).join('');
  var taskOptions = '<option value="">No Task</option>' +
    tasks.map(function (t) { return '<option value="' + t.id + '" ' + (curTaskId === t.id ? 'selected' : '') + '>' + escapeHtml(t.title) + '</option>'; }).join('');

  var CATS = ['Homework', 'Lecture', 'Project', 'Personal', 'Organization', 'Ideas'];

  // Template buttons
  var tmplHtml = '<div class="nt-template-wrap">' +
    '<button type="button" class="nt-template-trigger btn-ghost btn btn-sm" onclick="toggleTemplateDropdown()" aria-haspopup="true" aria-expanded="false"><i class="bi bi-layout-text-window me-1"></i>Template</button>' +
    '<div class="nt-template-dropdown" id="ntTemplateDropdown" style="display:none">' +
    Object.entries(NOTE_TEMPLATES).map(function (entry) {
      var k = entry[0], v = entry[1];
      return '<button type="button" class="nt-template-item" onclick="applyTemplate(\'' + k + '\')" aria-label="Apply ' + v.label + ' template"><i class="bi ' + v.icon + '"></i>' + v.label + '</button>';
    }).join('') +
    '</div></div>';

  document.getElementById('noteModalBody').innerHTML =
    '<input type="hidden" id="nId" value="' + (n ? n.id : '') + '">' +
    '<div class="row g-2">' +
    '<div class="col-12"><label>Title</label><input class="form-control" id="nTitle" value="' + (n ? escapeHtml(n.title) : '') + '" placeholder="Note title…" autocomplete="off"></div>' +
    '<div class="col-sm-6 col-md-4"><label>Category</label><select class="form-select" id="nCategory">' + CATS.map(function (c) { return '<option ' + (n && n.category === c ? 'selected' : '') + '>' + c + '</option>'; }).join('') + '</select></div>' +
    '<div class="col-sm-6 col-md-4"><label>Subject</label><select class="form-select" id="nSubject">' + subOptions + '</select></div>' +
    '<div class="col-sm-6 col-md-4"><label>Related Task</label><select class="form-select" id="nTask">' + taskOptions + '</select></div>' +
    '<div class="col-12">' +
    '<label>Tags <span class="text-faint" style="font-weight:400;font-size:.75rem">(press Enter to add each tag)</span></label>' +
    '<div class="nt-tags-input-wrap" id="nTagsWrap" onclick="document.getElementById(\'nTagInput\').focus()">' +
    '<div class="nt-tags-chips" id="nTagsContainer"></div>' +
    '<input type="text" class="nt-tag-text-input" id="nTagInput" placeholder="' + (n && n.tags && n.tags.length ? '' : 'Add tag…') + '" autocomplete="off" aria-label="Add tag">' +
    '</div>' +
    '</div>' +
    '<div class="col-12">' +
    '<div class="d-flex align-items-center justify-content-between mb-1">' +
    '<div class="note-editor-tabs">' +
    '<button class="note-tab-btn active" id="noteTabWrite" onclick="switchNoteTab(\'write\')" type="button"><i class="bi bi-pencil"></i> Write</button>' +
    '<button class="note-tab-btn" id="noteTabPreview" onclick="switchNoteTab(\'preview\')" type="button"><i class="bi bi-eye"></i> Preview</button>' +
    '</div>' +
    tmplHtml +
    '</div>' +
    '<div class="note-md-toolbar">' +
    '<button type="button" class="note-md-btn" onclick="mdInsert(\'**\',\'**\',\'bold text\')" title="Bold" aria-label="Bold"><b>B</b></button>' +
    '<button type="button" class="note-md-btn" onclick="mdInsert(\'*\',\'*\',\'italic text\')" title="Italic" aria-label="Italic"><i>I</i></button>' +
    '<div class="nt-tb-sep"></div>' +
    '<button type="button" class="note-md-btn" onclick="mdInsertLine(\'# \')" title="Heading 1" aria-label="Heading 1"><span style="font-weight:800;font-size:.75rem">H1</span></button>' +
    '<button type="button" class="note-md-btn" onclick="mdInsertLine(\'## \')" title="Heading 2" aria-label="Heading 2"><span style="font-weight:700;font-size:.72rem">H2</span></button>' +
    '<button type="button" class="note-md-btn" onclick="mdInsertLine(\'### \')" title="Heading 3" aria-label="Heading 3"><span style="font-weight:600;font-size:.68rem">H3</span></button>' +
    '<div class="nt-tb-sep"></div>' +
    '<button type="button" class="note-md-btn" onclick="mdInsertBlock(\'- item\')" title="Bullet list" aria-label="Bullet list"><i class="bi bi-list-ul"></i></button>' +
    '<button type="button" class="note-md-btn" onclick="mdInsertBlock(\'1. item\')" title="Numbered list" aria-label="Numbered list"><i class="bi bi-list-ol"></i></button>' +
    '<button type="button" class="note-md-btn" onclick="mdInsertBlock(\'- [ ] item\')" title="Checklist item" aria-label="Checklist item"><i class="bi bi-check2-square"></i></button>' +
    '<div class="nt-tb-sep"></div>' +
    '<button type="button" class="note-md-btn" onclick="mdInsert(\'[\',\'](url)\',\'link text\')" title="Link" aria-label="Link"><i class="bi bi-link-45deg"></i></button>' +
    '<button type="button" class="note-md-btn" onclick="mdInsert(\'`\',\'`\',\'code\')" title="Inline code" aria-label="Inline code"><i class="bi bi-code"></i></button>' +
    '<button type="button" class="note-md-btn" onclick="mdInsertBlock(\'```\\n\\n```\')" title="Code block" aria-label="Code block"><i class="bi bi-code-slash"></i></button>' +
    '</div>' +
    '<div id="noteTabWritePane">' +
    '<textarea class="form-control note-editor-ta" id="nContent" rows="12" oninput="updateNotePreview()" placeholder="Write your note here…">' + (n ? escapeHtml(n.content || '') : '') + '</textarea>' +
    '</div>' +
    '<div id="noteTabPreviewPane" style="display:none">' +
    '<div class="note-preview-pane" id="nPreview"><span class="text-faint">Switch to Write tab to enter content.</span></div>' +
    '</div>' +
    '</div>' +
    '<div class="col-12 d-flex gap-3 mt-1">' +
    '<div class="form-check"><input class="form-check-input" type="checkbox" id="nPinned" ' + (n && n.pinned ? 'checked' : '') + '><label class="form-check-label" for="nPinned">Pin note</label></div>' +
    '<div class="form-check"><input class="form-check-input" type="checkbox" id="nFavorite" ' + (n && n.favorite ? 'checked' : '') + '><label class="form-check-label" for="nFavorite">Favorite</label></div>' +
    '</div></div>' +
    '<div class="d-flex gap-2 mt-3">' +
    '<button class="btn btn-accent flex-grow-1" type="button" onclick="saveNote()"><i class="bi bi-check2 me-1"></i>' + (n ? 'Update' : 'Save') + ' Note</button>' +
    (n ? '<button class="btn btn-ghost" type="button" onclick="exportNotePdf(\'' + n.id + '\')" aria-label="Export PDF" title="Export PDF"><i class="bi bi-file-earmark-pdf"></i></button>' : '') +
    (n ? '<button class="btn btn-ghost" type="button" onclick="deleteNote(\'' + n.id + '\')" aria-label="Delete note"><i class="bi bi-trash"></i></button>' : '') +
    '</div>';

  // Prevent Enter from submitting modal when in tag input
  document.getElementById('noteModalBody').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target && e.target.id === 'nTagInput') {
      e.preventDefault();
    }
  });

  // Close template dropdown when clicking outside
  document.addEventListener('click', function onOutsideClick(e) {
    var dd = document.getElementById('ntTemplateDropdown');
    if (dd && !e.target.closest('.nt-template-wrap')) {
      dd.style.display = 'none';
    }
    // Clean up listener when modal closes
    var modal = document.getElementById('noteModal');
    if (modal && !modal.classList.contains('show')) {
      document.removeEventListener('click', onOutsideClick);
    }
  });

  // Init tag input with existing tags
  setTimeout(function () { initTagInput(n ? (n.tags || []) : []); }, 10);

  new bootstrap.Modal(document.getElementById('noteModal')).show();
}

function switchNoteTab(tab) {
  var writePan = document.getElementById('noteTabWritePane');
  var prevPan  = document.getElementById('noteTabPreviewPane');
  var wBtn     = document.getElementById('noteTabWrite');
  var pBtn     = document.getElementById('noteTabPreview');
  if (tab === 'write') {
    writePan.style.display = ''; prevPan.style.display = 'none';
    wBtn.classList.add('active'); pBtn.classList.remove('active');
  } else {
    writePan.style.display = 'none'; prevPan.style.display = '';
    wBtn.classList.remove('active'); pBtn.classList.add('active');
    updateNotePreview();
  }
}

function updateNotePreview() {
  var content  = (document.getElementById('nContent') || {}).value || '';
  var idEl     = document.getElementById('nId');
  var noteId   = idEl ? idEl.value : null;
  var previewEl= document.getElementById('nPreview');
  if (previewEl) {
    previewEl.innerHTML = content.trim()
      ? renderMarkdown(content, noteId || null)
      : '<span class="text-faint">Nothing to preview yet.</span>';
  }
}

/* ── Save note ── */
function saveNote() {
  var title    = (document.getElementById('nTitle').value.trim()) || 'Untitled';
  var content  = document.getElementById('nContent').value;
  var category = document.getElementById('nCategory').value;
  var pinned   = document.getElementById('nPinned').checked;
  var favorite = document.getElementById('nFavorite').checked;
  var subjectId= document.getElementById('nSubject').value || null;
  var taskId   = document.getElementById('nTask').value || null;
  var id       = document.getElementById('nId').value;
  var tags     = ntCurrentTags.slice();
  var notes    = DB.getNotes();

  if (id) {
    var idx = notes.findIndex(function (n) { return n.id === id; });
    if (idx !== -1) {
      notes[idx] = Object.assign({}, notes[idx], { title, content, category, pinned, favorite, subjectId, taskId, tags, updatedAt: Date.now() });
    }
  } else {
    var semId = DB.getActiveSemesterId();
    notes.unshift({ id: DB.uid(), title, content, category, pinned, favorite, subjectId, taskId, tags, checklist: [], semesterId: semId, createdAt: Date.now(), updatedAt: Date.now() });
  }

  DB.saveNotes(notes);
  bootstrap.Modal.getInstance(document.getElementById('noteModal')).hide();
  Toast.show(id ? 'Note updated' : 'Note added');
  renderNotes();
}

/* ── Delete note ── */
function deleteNote(id) {
  var n = DB.getNotes().find(function (x) { return x.id === id; });
  if (!n) return;
  confirmAction({
    title: 'Delete note?',
    message: '"' + n.title + '" will be permanently removed.',
    confirmLabel: 'Delete', danger: true, icon: 'bi-trash-fill',
    onConfirm: function () {
      DB.saveNotes(DB.getNotes().filter(function (x) { return x.id !== id; }));
      var modalEl = document.getElementById('noteModal');
      var inst    = bootstrap.Modal.getInstance(modalEl);
      if (inst) inst.hide();
      Toast.show('Note deleted');
      renderNotes();
    }
  });
}

/* ── PDF Export ── */
function exportNotePdf(id) {
  var notes = DB.getNotes();
  var n     = notes.find(function (x) { return x.id === id; });
  if (!n) return;

  var semId = DB.getActiveSemesterId();
  var subs  = DB.getSubjects().filter(function (s) { return s.semesterId === semId; });
  var tasks = DB.getTasks().filter(function (t) { return t.semesterId === semId; });
  var sub   = n.subjectId ? subs.find(function (s) { return s.id === n.subjectId; }) : null;
  var task  = n.taskId    ? tasks.find(function (t) { return t.id === n.taskId; }) : null;
  var tags  = n.tags || [];
  var wc    = calcWordCount(n.content);

  var metaRows = '';
  if (n.category) metaRows += '<tr><td style="color:#888;padding:3px 12px 3px 0;font-size:.82rem;white-space:nowrap">Category</td><td style="font-size:.82rem">' + escapeHtml(n.category) + '</td></tr>';
  if (sub)        metaRows += '<tr><td style="color:#888;padding:3px 12px 3px 0;font-size:.82rem;white-space:nowrap">Subject</td><td style="font-size:.82rem">' + escapeHtml(sub.code || sub.name) + '</td></tr>';
  if (task)       metaRows += '<tr><td style="color:#888;padding:3px 12px 3px 0;font-size:.82rem;white-space:nowrap">Task</td><td style="font-size:.82rem">' + escapeHtml(task.title) + '</td></tr>';
  if (tags.length) metaRows += '<tr><td style="color:#888;padding:3px 12px 3px 0;font-size:.82rem;white-space:nowrap">Tags</td><td style="font-size:.82rem">' + tags.map(escapeHtml).join(', ') + '</td></tr>';
  if (wc)         metaRows += '<tr><td style="color:#888;padding:3px 12px 3px 0;font-size:.82rem;white-space:nowrap">Length</td><td style="font-size:.82rem">' + wc.toLocaleString() + ' words · ' + calcReadingTime(wc) + '</td></tr>';
  metaRows += '<tr><td style="color:#888;padding:3px 12px 3px 0;font-size:.82rem;white-space:nowrap">Updated</td><td style="font-size:.82rem">' + new Date(n.updatedAt).toLocaleDateString('en-US', {year:'numeric',month:'long',day:'numeric'}) + '</td></tr>';

  var renderedContent = renderMarkdown(n.content, null);
  // Make checklist items non-interactive for PDF
  renderedContent = renderedContent.replace(/onclick="[^"]*"/g, '');

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<title>' + escapeHtml(n.title) + '</title>' +
    '<style>' +
    'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.65;color:#1a1a2e;margin:0;padding:0}' +
    '.page{max-width:720px;margin:0 auto;padding:48px 40px}' +
    'h1.note-title{font-size:1.7rem;font-weight:800;color:#1a1a2e;margin:0 0 4px;line-height:1.25}' +
    '.meta-table{border-collapse:collapse;margin:12px 0 24px}' +
    '.divider{border:none;border-top:2px solid #e8e8f0;margin:0 0 24px}' +
    '.md-h{font-weight:800;margin:.9em 0 .3em;padding-bottom:4px;border-bottom:1px solid #e8e8f0;color:#1a1a2e}' +
    'h4.md-h{font-size:1.1rem}h5.md-h{font-size:.96rem}h6.md-h{font-size:.88rem}' +
    '.md-p{margin:0 0 .6em}' +
    '.md-ul{margin:0 0 .6em;padding-left:1.5em}' +
    '.md-li{margin-bottom:3px}' +
    'ol{margin:0 0 .6em;padding-left:1.5em}' +
    '.md-inline-code{background:#f0f0f8;border:1px solid #ddd;border-radius:4px;padding:1px 5px;font-family:monospace;font-size:.85em}' +
    '.md-code-block{background:#f5f5fa;border:1px solid #ddd;border-radius:8px;padding:12px 16px;overflow-x:auto;margin:.6em 0;font-family:monospace;font-size:.82rem;line-height:1.55}' +
    '.md-checklist-item{display:flex;align-items:flex-start;gap:8px;margin:4px 0;break-inside:avoid}' +
    '.md-cl-box{width:16px;height:16px;min-width:16px;border:1.5px solid #999;border-radius:4px;display:flex;align-items:center;justify-content:center;margin-top:3px;flex-shrink:0}' +
    '.md-cl-checked{background:#7c6cf6;border-color:#7c6cf6}' +
    '.md-cl-checked::after{content:"✓";color:#fff;font-size:.68rem;font-weight:700;margin-top:-1px}' +
    '.md-cl-text{font-size:.9rem;line-height:1.5}' +
    '.md-cl-done{text-decoration:line-through;color:#aaa}' +
    'a{color:#7c6cf6}' +
    '@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{padding:32px 32px}}' +
    '</style></head><body>' +
    '<div class="page">' +
    '<h1 class="note-title">' + escapeHtml(n.title) + '</h1>' +
    (metaRows ? '<table class="meta-table">' + metaRows + '</table>' : '') +
    '<hr class="divider">' +
    renderedContent +
    '</div></body></html>';

  var blob   = new Blob([html], { type: 'text/html' });
  var url    = URL.createObjectURL(blob);
  var win    = window.open(url, '_blank');
  if (win) {
    win.addEventListener('load', function () {
      setTimeout(function () { win.print(); }, 400);
    });
  }
  setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  Toast.show('Opening print dialog…', 'accent', 'bi-file-earmark-pdf');
}
