/* ============================================================
   NOTES.JS
   ============================================================ */

let favFilterOn = false;

function initNotes(){
  renderNotes();
  document.getElementById('noteSearch').addEventListener('input', debounce(renderNotes, 200));
  document.getElementById('noteCatFilter').addEventListener('change', renderNotes);
}
function toggleFavFilter(){
  favFilterOn = !favFilterOn;
  document.getElementById('favFilterBtn').classList.toggle('btn-accent', favFilterOn);
  renderNotes();
}

function getFilteredNotes(){
  const q = document.getElementById('noteSearch').value.toLowerCase().trim();
  const cat = document.getElementById('noteCatFilter').value;
  const semId = DB.getActiveSemesterId();
  let list = DB.getNotes().filter(n=>n.semesterId===semId);
  if(q) list = list.filter(n=> n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q));
  if(cat) list = list.filter(n=>n.category===cat);
  if(favFilterOn) list = list.filter(n=>n.favorite);
  list.sort((a,b)=> (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));
  return list;
}

function renderNotes(){
  const wrap = document.getElementById('notesGrid');
  const list = getFilteredNotes();
  if(!list.length){ wrap.innerHTML = `<div class="col-12"><div class="glass card-pad text-center py-5 text-faint">No notes found. Create your first note!</div></div>`; return; }
  wrap.innerHTML = list.map(n=>`
    <div class="col-md-6 col-xl-4">
      <div class="glass note-card hover-lift" onclick="openNoteModal('${n.id}')">
        <div class="d-flex justify-content-between align-items-start mb-1">
          <div class="fw-bold" style="font-size:.92rem">${n.pinned?'<i class="bi bi-pin-angle-fill note-pin me-1"></i>':''}${escapeHtml(n.title)}</div>
          <i class="bi ${n.favorite?'bi-star-fill note-pin':'bi-star text-faint'}" onclick="event.stopPropagation();toggleFavorite('${n.id}')"></i>
        </div>
        <div class="text-soft" style="font-size:.8rem;max-height:70px;overflow:hidden">${mdPreview(n.content)}</div>
        <div class="d-flex justify-content-between align-items-center mt-2">
          <span class="chip">${n.category}</span>
          <span class="text-faint" style="font-size:.68rem">${new Date(n.updatedAt).toLocaleDateString()}</span>
        </div>
      </div>
    </div>`).join('');
}
function mdPreview(content){
  return escapeHtml(content).slice(0,140).replace(/\n/g,' ');
}
function toggleFavorite(id){
  const notes = DB.getNotes();
  const n = notes.find(x=>x.id===id); if(!n) return;
  n.favorite = !n.favorite; DB.saveNotes(notes); renderNotes();
}

/* ---------- LIGHTWEIGHT MARKDOWN RENDERER ---------- */
function renderMarkdown(src){
  let html = escapeHtml(src);
  html = html.replace(/```([\s\S]*?)```/g, (m,code)=>`<pre class="p-2" style="background:var(--surface-2);border-radius:8px;overflow-x:auto"><code>${code}</code></pre>`);
  html = html.replace(/`([^`]+)`/g, '<code style="background:var(--surface-2);padding:1px 5px;border-radius:5px">$1</code>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  html = html.replace(/\*(.+?)\*/g, '<i>$1</i>');
  html = html.replace(/^### (.*$)/gim, '<h6>$1</h6>');
  html = html.replace(/^## (.*$)/gim, '<h5>$1</h5>');
  html = html.replace(/^# (.*$)/gim, '<h4>$1</h4>');
  html = html.replace(/^- \[ \] (.*$)/gim, '<div><input type="checkbox" disabled> $1</div>');
  html = html.replace(/^- \[x\] (.*$)/gim, '<div><input type="checkbox" checked disabled> $1</div>');
  html = html.replace(/^- (.*$)/gim, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/gims, '<ul>$1</ul>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

/* ---------- MODAL ---------- */
function openNoteModal(id){
  const n = id ? DB.getNotes().find(x=>x.id===id) : null;
  document.getElementById('noteModalTitle').textContent = n ? 'Edit Note' : 'New Note';
  document.getElementById('noteModalBody').innerHTML = `
    <input type="hidden" id="nId" value="${n?n.id:''}">
    <div class="row g-2">
      <div class="col-md-8"><label>Title</label><input class="form-control" id="nTitle" value="${n?escapeHtml(n.title):''}"></div>
      <div class="col-md-4"><label>Category</label><select class="form-select" id="nCategory">${['Homework','Project','Personal','Organization','Ideas'].map(c=>`<option ${n&&n.category===c?'selected':''}>${c}</option>`).join('')}</select></div>
      <div class="col-12">
        <label>Content <span class="text-faint" style="font-weight:400">(supports **bold**, *italic*, # headings, - lists, - [ ] checklists, \`code\`)</span></label>
        <ul class="nav nav-tabs mb-2" style="font-size:.8rem">
          <li class="nav-item"><a class="nav-link active" data-bs-toggle="tab" href="#writeTab">Write</a></li>
          <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#previewTab" onclick="updateNotePreview()">Preview</a></li>
        </ul>
        <div class="tab-content">
          <div class="tab-pane fade show active" id="writeTab"><textarea class="form-control" id="nContent" rows="8">${n?n.content:''}</textarea></div>
          <div class="tab-pane fade" id="previewTab"><div class="glass-tight card-pad" style="min-height:180px;background:var(--surface-2)" id="nPreview"></div></div>
        </div>
      </div>
      <div class="col-12 d-flex gap-3 mt-1">
        <div class="form-check"><input class="form-check-input" type="checkbox" id="nPinned" ${n&&n.pinned?'checked':''}><label class="form-check-label">Pin note</label></div>
        <div class="form-check"><input class="form-check-input" type="checkbox" id="nFavorite" ${n&&n.favorite?'checked':''}><label class="form-check-label">Favorite</label></div>
      </div>
    </div>
    <div class="d-flex gap-2 mt-3">
      <button class="btn btn-accent flex-grow-1" onclick="saveNote()"><i class="bi bi-check2 me-1"></i>${n?'Update':'Save'} Note</button>
      ${n?`<button class="btn btn-ghost" onclick="deleteNote('${n.id}')"><i class="bi bi-trash"></i></button>`:''}
    </div>`;
  new bootstrap.Modal(document.getElementById('noteModal')).show();
}
function updateNotePreview(){
  document.getElementById('nPreview').innerHTML = renderMarkdown(document.getElementById('nContent').value || '*Nothing to preview*');
}
function saveNote(){
  const title = document.getElementById('nTitle').value.trim() || 'Untitled';
  const content = document.getElementById('nContent').value;
  const category = document.getElementById('nCategory').value;
  const pinned = document.getElementById('nPinned').checked;
  const favorite = document.getElementById('nFavorite').checked;
  const id = document.getElementById('nId').value;
  const notes = DB.getNotes();
  if(id){
    const idx = notes.findIndex(n=>n.id===id);
    notes[idx] = { ...notes[idx], title, content, category, pinned, favorite, updatedAt:Date.now() };
  } else {
    const semId = DB.getActiveSemesterId();
    notes.unshift({ id:DB.uid(), title, content, category, pinned, favorite, checklist:[], semesterId:semId, createdAt:Date.now(), updatedAt:Date.now() });
  }
  DB.saveNotes(notes);
  bootstrap.Modal.getInstance(document.getElementById('noteModal')).hide();
  Toast.show(id?'Note updated':'Note added');
  renderNotes();
}
function deleteNote(id){
  const n = DB.getNotes().find(x=>x.id===id); if(!n) return;
  confirmAction({
    title:'Delete note?',
    message:`"${n.title}" will be permanently removed.`,
    confirmLabel:'Delete Note', danger:true, icon:'bi-trash-fill',
    onConfirm(){
      DB.saveNotes(DB.getNotes().filter(x=>x.id!==id));
      const modalEl = document.getElementById('noteModal');
      const inst = bootstrap.Modal.getInstance(modalEl);
      if(inst) inst.hide();
      Toast.show('Note deleted');
      renderNotes();
    }
  });
}
function escapeHtml(s){ const d=document.createElement('div'); d.textContent=s||''; return d.innerHTML; }
