/* ============================================================
   NOTES.JS  — v2 with Markdown toolbar, live preview, checklist
               rendering, subject/task linking, and note filtering
   ============================================================ */

let favFilterOn    = false;
let noteLinkFilter = 'all'; // 'all' | 'subject' | 'task' | 'unlinked'
let noteLinkSubId  = '';
let noteLinkTaskId = '';

/* ── Init ── */
function initNotes() {
  renderNotes();
  document.getElementById('noteSearch').addEventListener('input', debounce(renderNotes, 200));
  document.getElementById('noteCatFilter').addEventListener('change', renderNotes);
  document.getElementById('noteLinkFilterSel').addEventListener('change', function () {
    noteLinkFilter = this.value;
    // Show/hide sub-filters (now inline in nt-filters-row)
    var subSel  = document.getElementById('noteSubFilterSel');
    var taskSel = document.getElementById('noteTaskFilterSel');
    if (subSel)  subSel.style.display  = (noteLinkFilter === 'subject') ? '' : 'none';
    if (taskSel) taskSel.style.display = (noteLinkFilter === 'task')    ? '' : 'none';
    renderNotes();
  });
  document.getElementById('noteSubFilterSel').addEventListener('change', function () {
    noteLinkSubId = this.value;
    renderNotes();
  });
  document.getElementById('noteTaskFilterSel').addEventListener('change', function () {
    noteLinkTaskId = this.value;
    renderNotes();
  });
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

  subSel.innerHTML = '<option value="">All Subjects</option>' +
    subs.map(function (s) { return '<option value="' + s.id + '"' + (prevSubVal === s.id ? ' selected' : '') + '>' + escapeHtml(s.code || s.name) + '</option>'; }).join('');

  taskSel.innerHTML = '<option value="">All Tasks</option>' +
    tasks.map(function (t) { return '<option value="' + t.id + '"' + (prevTaskVal === t.id ? ' selected' : '') + '>' + escapeHtml(t.title) + '</option>'; }).join('');
}

function toggleFavFilter() {
  favFilterOn = !favFilterOn;
  var btn = document.getElementById('favFilterBtn');
  if (btn) {
    btn.classList.toggle('btn-accent', favFilterOn);
    btn.querySelector('i').className = favFilterOn ? 'bi bi-star-fill' : 'bi bi-star';
    btn.title = favFilterOn ? 'Show all notes' : 'Favorites only';
  }
  renderNotes();
}

function getFilteredNotes() {
  var q     = document.getElementById('noteSearch').value.toLowerCase().trim();
  var cat   = document.getElementById('noteCatFilter').value;
  var semId = DB.getActiveSemesterId();
  var list  = DB.getNotes().filter(function (n) { return n.semesterId === semId; });
  if (q)         list = list.filter(function (n) { return n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q); });
  if (cat)       list = list.filter(function (n) { return n.category === cat; });
  if (favFilterOn) list = list.filter(function (n) { return n.favorite; });

  // Link filters
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

/* ── Note card ── */
function renderNotes() {
  populateNoteLinkFilters();
  var wrap = document.getElementById('notesGrid');
  var list = getFilteredNotes();
  if (!list.length) {
    wrap.innerHTML = '<div class="col-12"><div class="glass card-pad text-center py-5 text-faint">No notes found. Create your first note!</div></div>';
    return;
  }

  var semId = DB.getActiveSemesterId();
  var subs  = DB.getSubjects().filter(function (s) { return s.semesterId === semId; });
  var tasks = DB.getTasks().filter(function (t) { return t.semesterId === semId; });

  wrap.innerHTML = list.map(function (n) {
    var sub  = n.subjectId  ? subs.find(function (s) { return s.id === n.subjectId; })  : null;
    var task = n.taskId     ? tasks.find(function (t) { return t.id === n.taskId; }) : null;
    var taskBroken = n.taskId && !task;

    var subBadge  = sub  ? '<span class="note-link-badge note-sub-badge" style="--badge-color:' + (sub.color || 'rgb(var(--accent))') + '">' + escapeHtml(sub.code || sub.name) + '</span>' : '';
    var taskBadge = task ? '<span class="note-link-badge note-task-badge"><i class="bi bi-arrow-up-right-square"></i> ' + escapeHtml(task.title) + '</span>' :
                    (taskBroken ? '<span class="note-link-badge note-task-broken">Task unavailable</span>' : '');

    var badges = subBadge || taskBadge ? '<div class="note-badges">' + subBadge + taskBadge + '</div>' : '';

    var preview = mdCardPreview(n.content);
    var date    = new Date(n.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    return '<div class="col-md-6 col-xl-4">' +
      '<div class="glass note-card hover-lift" onclick="openNoteModal(\'' + n.id + '\')">' +
      '<div class="note-card-header">' +
      '<div class="note-card-title-wrap">' +
      (n.pinned ? '<i class="bi bi-pin-angle-fill note-pin me-1" title="Pinned"></i>' : '') +
      '<span class="note-card-title">' + escapeHtml(n.title) + '</span>' +
      '</div>' +
      '<button class="note-fav-btn ' + (n.favorite ? 'note-fav-active' : '') + '" onclick="event.stopPropagation();toggleFavorite(\'' + n.id + '\')" title="' + (n.favorite ? 'Remove from favorites' : 'Add to favorites') + '" aria-label="' + (n.favorite ? 'Unfavorite' : 'Favorite') + '">' +
      '<i class="bi ' + (n.favorite ? 'bi-star-fill' : 'bi-star') + '"></i>' +
      '</button>' +
      '</div>' +
      '<div class="note-preview-text">' + preview + '</div>' +
      badges +
      '<div class="note-card-footer">' +
      '<span class="chip">' + escapeHtml(n.category) + '</span>' +
      '<span class="note-footer-date">Updated ' + date + '</span>' +
      '</div></div></div>';
  }).join('');
}

function mdCardPreview(content) {
  // Show a short plain-text excerpt
  var text = content.replace(/```[\s\S]*?```/g, '[code]')
    .replace(/`[^`]+`/g, '[code]')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^- \[[ x]\] /gm, '')
    .replace(/^[-*] /gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
  return escapeHtml(text.slice(0, 120)) + (text.length > 120 ? '…' : '');
}

function toggleFavorite(id) {
  var notes = DB.getNotes();
  var n     = notes.find(function (x) { return x.id === id; });
  if (!n) return;
  n.favorite = !n.favorite;
  DB.saveNotes(notes);
  renderNotes();
}

/* ── Markdown renderer (extended) ── */
function renderMarkdown(src, noteId) {
  var html = src || '';

  // Escape HTML first, then restore block code
  var codeBlocks = [];
  html = html.replace(/```([\w]*)\n?([\s\S]*?)```/g, function (m, lang, code) {
    var idx = codeBlocks.length;
    codeBlocks.push('<pre class="md-code-block"><code>' + escapeHtml(code) + '</code></pre>');
    return '\x00CODE' + idx + '\x00';
  });
  html = escapeHtml(html);

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

  // Bold/italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Headings
  html = html.replace(/^### (.*$)/gim, '<h6 class="md-h">$1</h6>');
  html = html.replace(/^## (.*$)/gim,  '<h5 class="md-h">$1</h5>');
  html = html.replace(/^# (.*$)/gim,   '<h4 class="md-h">$1</h4>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Checklists (before regular bullets)
  html = html.replace(/^- \[x\] (.*$)/gim, function (m, text) {
    var safeTxt = text;
    if (noteId) {
      return '<div class="md-checklist-item md-checked" onclick="toggleNoteChecklistItem(\'' + noteId + '\', this, true)">' +
        '<span class="md-cl-box md-cl-checked"><i class="bi bi-check-lg"></i></span>' +
        '<span class="md-cl-text md-cl-done">' + safeTxt + '</span></div>';
    }
    return '<div class="md-checklist-item md-checked"><span class="md-cl-box md-cl-checked"><i class="bi bi-check-lg"></i></span><span class="md-cl-text md-cl-done">' + safeTxt + '</span></div>';
  });
  html = html.replace(/^- \[ \] (.*$)/gim, function (m, text) {
    var safeTxt = text;
    if (noteId) {
      return '<div class="md-checklist-item" onclick="toggleNoteChecklistItem(\'' + noteId + '\', this, false)">' +
        '<span class="md-cl-box"></span><span class="md-cl-text">' + safeTxt + '</span></div>';
    }
    return '<div class="md-checklist-item"><span class="md-cl-box"></span><span class="md-cl-text">' + safeTxt + '</span></div>';
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

  // Bullet lists
  html = html.replace(/^[-*] (.*$)/gim, '<li class="md-li">$1</li>');
  html = html.replace(/(<li class="md-li">[\s\S]*?<\/li>(?:\n<li class="md-li">[\s\S]*?<\/li>)*)/g, '<ul class="md-ul">$1</ul>');

  // Paragraphs (newlines)
  html = html.replace(/\n{2,}/g, '</p><p class="md-p">');
  html = html.replace(/\n/g, '<br>');
  html = '<p class="md-p">' + html + '</p>';

  // Restore code blocks
  codeBlocks.forEach(function (block, idx) {
    html = html.replace('\x00CODE' + idx + '\x00', block);
  });

  // Clean empty paragraphs
  html = html.replace(/<p class="md-p"><\/p>/g, '');
  html = html.replace(/<p class="md-p"><br><\/p>/g, '');

  return html;
}

/* ── Toggle note checklist item in preview ── */
function toggleNoteChecklistItem(noteId, el, currentlyChecked) {
  var notes = DB.getNotes();
  var n     = notes.find(function (x) { return x.id === noteId; });
  if (!n) return;

  var textEl  = el.querySelector('.md-cl-text');
  var textTxt = textEl ? textEl.textContent : '';

  // Find and toggle the matching line in content
  var lines   = n.content.split('\n');
  var pattern = currentlyChecked
    ? new RegExp('^- \\[x\\] ' + escapeRegExp(textTxt) + '$')
    : new RegExp('^- \\[ \\] ' + escapeRegExp(textTxt) + '$');

  var changed = false;
  n.content = lines.map(function (line) {
    if (!changed && pattern.test(line)) {
      changed = true;
      return currentlyChecked
        ? line.replace(/^- \[x\] /, '- [ ] ')
        : line.replace(/^- \[ \] /, '- [x] ');
    }
    return line;
  }).join('\n');

  if (changed) {
    n.updatedAt = Date.now();
    DB.saveNotes(notes);
    // Refresh preview
    var previewEl = document.getElementById('nPreview');
    if (previewEl) previewEl.innerHTML = renderMarkdown(n.content, n.id);
    // Update textarea if open
    var ta = document.getElementById('nContent');
    if (ta) ta.value = n.content;
  }
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ── Markdown toolbar actions ── */
function mdInsert(before, after, placeholder) {
  var ta    = document.getElementById('nContent');
  if (!ta) return;
  var start = ta.selectionStart;
  var end   = ta.selectionEnd;
  var sel   = ta.value.substring(start, end) || placeholder || '';
  var insert= before + sel + (after || '');
  ta.value  = ta.value.substring(0, start) + insert + ta.value.substring(end);
  ta.selectionStart = start + before.length;
  ta.selectionEnd   = start + before.length + sel.length;
  ta.focus();
  updateNotePreview();
}

function mdInsertLine(prefix) {
  var ta    = document.getElementById('nContent');
  if (!ta) return;
  var start = ta.selectionStart;
  var val   = ta.value;
  // Find start of line
  var lineStart = val.lastIndexOf('\n', start - 1) + 1;
  var lineEnd   = val.indexOf('\n', start);
  if (lineEnd === -1) lineEnd = val.length;
  var line  = val.substring(lineStart, lineEnd);
  ta.value  = val.substring(0, lineStart) + prefix + line + val.substring(lineEnd);
  ta.selectionStart = ta.selectionEnd = lineStart + prefix.length + line.length;
  ta.focus();
  updateNotePreview();
}

function mdInsertBlock(text) {
  var ta   = document.getElementById('nContent');
  if (!ta) return;
  var pos  = ta.selectionStart;
  var val  = ta.value;
  var pre  = (pos > 0 && val[pos - 1] !== '\n') ? '\n' : '';
  ta.value = val.substring(0, pos) + pre + text + val.substring(pos);
  ta.selectionStart = ta.selectionEnd = pos + pre.length + text.length;
  ta.focus();
  updateNotePreview();
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

  var subOptions = '<option value="">No Subject</option>' +
    subs.map(function (s) { return '<option value="' + s.id + '" ' + (curSubId === s.id ? 'selected' : '') + '>' + escapeHtml(s.code || s.name) + '</option>'; }).join('');

  // Handle broken task reference
  var taskOptions = '<option value="">No Task</option>' +
    tasks.map(function (t) { return '<option value="' + t.id + '" ' + (curTaskId === t.id ? 'selected' : '') + '>' + escapeHtml(t.title) + '</option>'; }).join('');

  var CATS = ['Homework', 'Project', 'Personal', 'Organization', 'Ideas'];

  document.getElementById('noteModalBody').innerHTML =
    '<input type="hidden" id="nId" value="' + (n ? n.id : '') + '">' +
    '<div class="row g-2">' +
    '<div class="col-12"><label>Title</label><input class="form-control" id="nTitle" value="' + (n ? escapeHtml(n.title) : '') + '" placeholder="Note title…"></div>' +
    '<div class="col-sm-6 col-md-4"><label>Category</label><select class="form-select" id="nCategory">' + CATS.map(function (c) { return '<option ' + (n && n.category === c ? 'selected' : '') + '>' + c + '</option>'; }).join('') + '</select></div>' +
    '<div class="col-sm-6 col-md-4"><label>Subject</label><select class="form-select" id="nSubject">' + subOptions + '</select></div>' +
    '<div class="col-sm-6 col-md-4"><label>Related Task</label><select class="form-select" id="nTask">' + taskOptions + '</select></div>' +
    '<div class="col-12">' +
    '<div class="note-editor-tabs">' +
    '<button class="note-tab-btn active" id="noteTabWrite" onclick="switchNoteTab(\'write\')"><i class="bi bi-pencil"></i> Write</button>' +
    '<button class="note-tab-btn" id="noteTabPreview" onclick="switchNoteTab(\'preview\')"><i class="bi bi-eye"></i> Preview</button>' +
    '</div>' +
    '<div class="note-md-toolbar">' +
    '<button type="button" class="note-md-btn" onclick="mdInsert(\'**\',\'**\',\'bold text\')" title="Bold"><b>B</b></button>' +
    '<button type="button" class="note-md-btn" onclick="mdInsert(\'*\',\'*\',\'italic text\')" title="Italic"><i>I</i></button>' +
    '<button type="button" class="note-md-btn" onclick="mdInsertLine(\'## \')" title="Heading">H</button>' +
    '<button type="button" class="note-md-btn" onclick="mdInsertBlock(\'- item\')" title="Bullet list"><i class="bi bi-list-ul"></i></button>' +
    '<button type="button" class="note-md-btn" onclick="mdInsertBlock(\'1. item\')" title="Numbered list"><i class="bi bi-list-ol"></i></button>' +
    '<button type="button" class="note-md-btn" onclick="mdInsertBlock(\'- [ ] item\')" title="Checklist item"><i class="bi bi-check2-square"></i></button>' +
    '<button type="button" class="note-md-btn" onclick="mdInsert(\'[\',\'](url)\',\'link text\')" title="Link"><i class="bi bi-link-45deg"></i></button>' +
    '<button type="button" class="note-md-btn" onclick="mdInsert(\'`\',\'`\',\'code\')" title="Inline code"><i class="bi bi-code"></i></button>' +
    '<button type="button" class="note-md-btn" onclick="mdInsertBlock(\'```\\n\\n```\')" title="Code block"><i class="bi bi-code-slash"></i></button>' +
    '</div>' +
    '<div id="noteTabWritePane">' +
    '<textarea class="form-control note-editor-ta" id="nContent" rows="10" oninput="updateNotePreview()" placeholder="Write your note here…">' + (n ? escapeHtml(n.content || '') : '') + '</textarea>' +
    '</div>' +
    '<div id="noteTabPreviewPane" style="display:none">' +
    '<div class="note-preview-pane" id="nPreview"><span class="text-faint">Switch to Write tab to enter content.</span></div>' +
    '</div>' +
    '</div>' +
    '<div class="col-12 d-flex gap-3 mt-1">' +
    '<div class="form-check"><input class="form-check-input" type="checkbox" id="nPinned" ' + (n && n.pinned ? 'checked' : '') + '><label class="form-check-label">Pin note</label></div>' +
    '<div class="form-check"><input class="form-check-input" type="checkbox" id="nFavorite" ' + (n && n.favorite ? 'checked' : '') + '><label class="form-check-label">Favorite</label></div>' +
    '</div></div>' +
    '<div class="d-flex gap-2 mt-3">' +
    '<button class="btn btn-accent flex-grow-1" onclick="saveNote()"><i class="bi bi-check2 me-1"></i>' + (n ? 'Update' : 'Save') + ' Note</button>' +
    (n ? '<button class="btn btn-ghost" onclick="deleteNote(\'' + n.id + '\')"><i class="bi bi-trash"></i></button>' : '') +
    '</div>';

  new bootstrap.Modal(document.getElementById('noteModal')).show();
}

function switchNoteTab(tab) {
  var writePan = document.getElementById('noteTabWritePane');
  var prevPan  = document.getElementById('noteTabPreviewPane');
  var wBtn     = document.getElementById('noteTabWrite');
  var pBtn     = document.getElementById('noteTabPreview');
  if (tab === 'write') {
    writePan.style.display = '';
    prevPan.style.display  = 'none';
    wBtn.classList.add('active');
    pBtn.classList.remove('active');
  } else {
    writePan.style.display = 'none';
    prevPan.style.display  = '';
    wBtn.classList.remove('active');
    pBtn.classList.add('active');
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

function saveNote() {
  var title    = (document.getElementById('nTitle').value.trim())   || 'Untitled';
  var content  = document.getElementById('nContent').value;
  var category = document.getElementById('nCategory').value;
  var pinned   = document.getElementById('nPinned').checked;
  var favorite = document.getElementById('nFavorite').checked;
  var subjectId= document.getElementById('nSubject').value  || null;
  var taskId   = document.getElementById('nTask').value     || null;
  var id       = document.getElementById('nId').value;
  var notes    = DB.getNotes();

  if (id) {
    var idx     = notes.findIndex(function (n) { return n.id === id; });
    notes[idx]  = Object.assign({}, notes[idx], { title, content, category, pinned, favorite, subjectId, taskId, updatedAt: Date.now() });
  } else {
    var semId = DB.getActiveSemesterId();
    notes.unshift({ id: DB.uid(), title, content, category, pinned, favorite, subjectId, taskId, checklist: [], semesterId: semId, createdAt: Date.now(), updatedAt: Date.now() });
  }

  DB.saveNotes(notes);
  bootstrap.Modal.getInstance(document.getElementById('noteModal')).hide();
  Toast.show(id ? 'Note updated' : 'Note added');
  renderNotes();
}

function deleteNote(id) {
  var n = DB.getNotes().find(function (x) { return x.id === id; });
  if (!n) return;
  confirmAction({
    title: 'Delete note?',
    message: '"' + n.title + '" will be permanently removed.',
    confirmLabel: 'Delete Note', danger: true, icon: 'bi-trash-fill',
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

function escapeHtml(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
