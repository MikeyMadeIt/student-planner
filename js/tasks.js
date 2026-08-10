/* ============================================================
   TASKS.JS
   ============================================================ */

let taskView = 'list';
let draggedTaskId = null;

function initTasks(){
  renderTasks();
  document.getElementById('taskSearch').addEventListener('input', debounce(renderTasks, 200));
  document.getElementById('taskCatFilter').addEventListener('change', renderTasks);
  document.getElementById('taskPriFilter').addEventListener('change', renderTasks);
  document.getElementById('taskSort').addEventListener('change', renderTasks);

  const params = new URLSearchParams(location.search);
  if(params.get('new')==='1') openTaskModal();
}

function switchTaskView(v){
  taskView = v;
  document.querySelectorAll('[data-tview]').forEach(b=>b.classList.toggle('active', b.dataset.tview===v));
  document.getElementById('taskListView').classList.toggle('d-none', v!=='list');
  document.getElementById('taskBoardView').classList.toggle('d-none', v!=='board');
  renderTasks();
}

function getFilteredTasks(){
  const q = document.getElementById('taskSearch').value.toLowerCase().trim();
  const cat = document.getElementById('taskCatFilter').value;
  const pri = document.getElementById('taskPriFilter').value;
  const sort = document.getElementById('taskSort').value;
  const semId = DB.getActiveSemesterId();
  let list = DB.getTasks().filter(t=>t.semesterId===semId && t.status!=='completed');
  if(q) list = list.filter(t=> t.title.toLowerCase().includes(q) || (t.description||'').toLowerCase().includes(q));
  if(cat) list = list.filter(t=>t.category===cat);
  if(pri) list = list.filter(t=>t.priority===pri);
  const priRank = {high:0, medium:1, low:2};
  if(sort==='due') list.sort((a,b)=> (a.dueDate+a.dueTime).localeCompare(b.dueDate+b.dueTime));
  else if(sort==='priority') list.sort((a,b)=> priRank[a.priority]-priRank[b.priority]);
  else list.sort((a,b)=> b.createdAt-a.createdAt);
  return list;
}

function renderTasks(){
  if(taskView==='list') renderListView(); else renderBoardView();
  renderCompletedHistory();
}

function renderListView(){
  const wrap = document.getElementById('taskListWrap');
  const list = getFilteredTasks();
  if(!list.length){ wrap.innerHTML = `<div class="text-center py-5"><i class="bi bi-inbox" style="font-size:1.8rem;color:var(--text-faint)"></i><p class="text-soft mt-2">No tasks match your filters.</p></div>`; return; }
  const subs = DB.getSubjects();
  wrap.innerHTML = list.map(t=>{
    const sub = subs.find(s=>s.id===t.subjectId);
    const mins = minutesUntil(t.dueDate, t.dueTime);
    const checklistDone = t.checklist && t.checklist.length ? `${t.checklist.filter(c=>c.done).length}/${t.checklist.length}` : null;
    return `<div class="task-row" draggable="true" ondragstart="draggedTaskId='${t.id}'">
      <div class="task-check" onclick="completeTask('${t.id}')"><i class="bi bi-check2" style="opacity:0"></i></div>
      <div class="flex-grow-1" style="cursor:pointer" onclick="openTaskModal('${t.id}')">
        <div class="task-title">${escapeHtml(t.title)} ${sub?`<span class="text-faint fw-normal">· ${sub.code}</span>`:''}</div>
        ${t.description?`<div class="text-faint" style="font-size:.78rem">${escapeHtml(t.description)}</div>`:''}
        <div class="task-meta">
          <span><i class="bi bi-calendar2"></i> ${t.dueDate} ${fmtTime(t.dueTime)}</span>
          <span><i class="bi bi-tag"></i> ${t.category}</span>
          ${checklistDone?`<span><i class="bi bi-list-check"></i> ${checklistDone}</span>`:''}
          ${t.score!==null && t.score!==undefined && t.score!==''?`<span><i class="bi bi-award"></i> ${t.score}</span>`:''}
        </div>
        <div class="progress mt-2" style="height:6px"><div class="progress-bar" style="width:${t.progress||0}%"></div></div>
      </div>
      <div class="d-flex flex-column align-items-end gap-1">
        <span class="chip ${t.priority}">${t.priority}</span>
        <span class="text-faint" style="font-size:.68rem">${fmtDuration(mins)}</span>
      </div>
    </div>`;
  }).join('');
}

function renderBoardView(){
  const semId = DB.getActiveSemesterId();
  const list = getFilteredTasks().concat(DB.getTasks().filter(t=>t.semesterId===semId && t.status==='completed').slice(0,10));
  ['not-started','in-progress','completed'].forEach(status=>{
    const col = document.querySelector(`.kanban-col[data-status="${status}"]`);
    const items = list.filter(t=>t.status===status);
    col.innerHTML = items.length ? items.map(t=>`
      <div class="task-row" draggable="true" ondragstart="draggedTaskId='${t.id}'" onclick="openTaskModal('${t.id}')">
        <div class="flex-grow-1">
          <div class="task-title">${escapeHtml(t.title)}</div>
          <div class="task-meta"><span><i class="bi bi-calendar2"></i> ${t.dueDate}</span></div>
        </div>
        <span class="chip ${t.priority}">${t.priority}</span>
      </div>`).join('') : `<div class="text-faint text-center py-3" style="font-size:.78rem">Drop tasks here</div>`;
  });
}
function onDrop(ev){
  ev.preventDefault();
  const status = ev.currentTarget.dataset.status;
  const tasks = DB.getTasks();
  const t = tasks.find(x=>x.id===draggedTaskId);
  if(t){
    t.status = status;
    t.progress = status==='completed' ? 100 : (status==='in-progress' ? Math.max(t.progress||0, 10) : t.progress);
    DB.saveTasks(tasks);
    if(status==='completed') fireConfetti();
    renderTasks();
  }
}

function completeTask(id){
  const tasks = DB.getTasks();
  const t = tasks.find(x=>x.id===id); if(!t) return;
  t.status='completed'; t.progress=100; t.completedAt = Date.now();
  DB.saveTasks(tasks);
  fireConfetti(); Toast.show('Task completed!');
  renderTasks();
}

function renderCompletedHistory(){
  const wrap = document.getElementById('completedHistory');
  const semId = DB.getActiveSemesterId();
  const done = DB.getTasks().filter(t=>t.semesterId===semId && t.status==='completed').sort((a,b)=>(b.completedAt||0)-(a.completedAt||0));
  if(!done.length){ wrap.innerHTML = `<div class="text-faint text-center py-3" style="font-size:.82rem">Nothing completed yet</div>`; return; }
  wrap.innerHTML = done.map(t=>`
    <div class="list-row completed">
      <i class="bi bi-check-circle-fill" style="color:#34d399"></i>
      <div class="flex-grow-1"><span style="text-decoration:line-through">${escapeHtml(t.title)}</span> <span class="text-faint" style="font-size:.72rem">· ${t.category}</span></div>
      <button class="btn-icon" style="width:28px;height:28px" onclick="reopenTask('${t.id}')" title="Reopen"><i class="bi bi-arrow-counterclockwise" style="font-size:.75rem"></i></button>
      <button class="btn-icon" style="width:28px;height:28px" onclick="deleteTask('${t.id}')" title="Delete"><i class="bi bi-trash" style="font-size:.75rem"></i></button>
    </div>`).join('');
}
function reopenTask(id){
  const tasks = DB.getTasks();
  const t = tasks.find(x=>x.id===id); if(!t) return;
  t.status='not-started'; t.progress=0;
  DB.saveTasks(tasks);
  renderTasks();
}
function deleteTask(id){
  const t = DB.getTasks().find(x=>x.id===id); if(!t) return;
  confirmAction({
    title:'Delete task?',
    message:`"${t.title}" will be permanently removed.`,
    confirmLabel:'Delete Task', danger:true, icon:'bi-trash-fill',
    onConfirm(){
      DB.saveTasks(DB.getTasks().filter(x=>x.id!==id));
      Toast.show('Task deleted');
      renderTasks();
    }
  });
}

/* ---------- MODAL ---------- */
function openTaskModal(id){
  const t = id ? DB.getTasks().find(x=>x.id===id) : null;
  document.getElementById('taskModalTitle').textContent = t ? 'Edit Task' : 'Add Task';
  const semId = DB.getActiveSemesterId();
  const subs = DB.getSubjects().filter(s=>s.semesterId===semId);
  const checklist = t && t.checklist ? t.checklist : [];
  const showScore = t && ['Quiz','Exam','Project','Homework'].includes(t.category);

  document.getElementById('taskModalBody').innerHTML = `
    <input type="hidden" id="tId" value="${t?t.id:''}">
    <div class="row g-2">
      <div class="col-12"><label>Title</label><input class="form-control" id="tTitle" value="${t?escapeHtml(t.title):''}"></div>
      <div class="col-12"><label>Description</label><textarea class="form-control" id="tDesc" rows="2">${t?escapeHtml(t.description):''}</textarea></div>
      <div class="col-md-4"><label>Subject</label><select class="form-select" id="tSubject"><option value="">None</option>${subs.map(s=>`<option value="${s.id}" ${t&&t.subjectId===s.id?'selected':''}>${s.code}</option>`).join('')}</select></div>
      <div class="col-md-4"><label>Category</label><select class="form-select" id="tCategory">${['Homework','Project','Quiz','Exam','Personal','Organization'].map(c=>`<option ${t&&t.category===c?'selected':''}>${c}</option>`).join('')}</select></div>
      <div class="col-md-4"><label>Priority</label><select class="form-select" id="tPriority">${['low','medium','high'].map(p=>`<option value="${p}" ${t&&t.priority===p?'selected':''}>${p[0].toUpperCase()+p.slice(1)}</option>`).join('')}</select></div>

      <div class="col-md-4"><label>Due Date</label><input type="date" class="form-control" id="tDueDate" value="${t?t.dueDate:todayKey()}"></div>
      <div class="col-md-4"><label>Due Time</label><input type="time" class="form-control" id="tDueTime" value="${t?t.dueTime:'23:59'}"></div>
      <div class="col-md-4"><label>Status</label><select class="form-select" id="tStatus">${['not-started','in-progress','completed'].map(s=>`<option value="${s}" ${t&&t.status===s?'selected':''}>${s.replace('-',' ')}</option>`).join('')}</select></div>

      <div class="col-md-6"><label>Progress (${t?t.progress:0}%)</label><input type="range" class="form-range" id="tProgress" min="0" max="100" value="${t?t.progress:0}" oninput="document.getElementById('tProgressLbl').textContent=this.value+'%'"><span id="tProgressLbl" class="text-faint" style="font-size:.75rem">${t?t.progress:0}%</span></div>
      <div class="col-md-6"><label>Repeat</label><select class="form-select" id="tRepeat">${['none','daily','weekly','monthly'].map(r=>`<option ${t&&t.repeat===r?'selected':''}>${r}</option>`).join('')}</select></div>

      <div class="col-md-6"><label>Score (optional)</label><input type="text" class="form-control" id="tScore" value="${t&&t.score!=null?t.score:''}" placeholder="e.g. 92/100"></div>
      <div class="col-md-6"><label>Remarks</label><input class="form-control" id="tRemarks" value="${t?escapeHtml(t.remarks||''):''}" placeholder="e.g. Passed, needs revision"></div>

      <div class="col-12 form-check mt-2">
        <input class="form-check-input" type="checkbox" id="tReminder" ${t&&t.reminder?'checked':(t?'':'checked')}>
        <label class="form-check-label" for="tReminder">Set reminder notification</label>
      </div>

      <div class="col-12">
        <label>Checklist</label>
        <div id="checklistWrap">${checklist.map((c,i)=>checklistItemHtml(c,i)).join('')}</div>
        <button type="button" class="btn btn-ghost btn-sm mt-1" onclick="addChecklistItem()"><i class="bi bi-plus"></i> Add item</button>
      </div>

      <div class="col-12"><label>Attachments</label><input type="file" class="form-control" id="tAttachments" multiple>
        <div class="text-faint" style="font-size:.72rem">Files are referenced by name only (no upload storage in this offline app).</div>
      </div>
    </div>
    <button class="btn btn-accent w-100 mt-3" onclick="saveTask()"><i class="bi bi-check2 me-1"></i>${t?'Update':'Save'} Task</button>`;
  new bootstrap.Modal(document.getElementById('taskModal')).show();
}
function checklistItemHtml(c,i){
  return `<div class="d-flex align-items-center gap-2 mb-1 checklist-item" data-i="${i}">
    <input type="checkbox" class="form-check-input" ${c.done?'checked':''}>
    <input type="text" class="form-control form-control-sm" value="${escapeHtml(c.text)}">
    <button type="button" class="btn-icon" style="width:28px;height:28px" onclick="this.closest('.checklist-item').remove()"><i class="bi bi-x" style="font-size:.8rem"></i></button>
  </div>`;
}
function addChecklistItem(){
  const wrap = document.getElementById('checklistWrap');
  const i = wrap.children.length;
  wrap.insertAdjacentHTML('beforeend', checklistItemHtml({text:'',done:false}, i));
}
function saveTask(){
  const title = document.getElementById('tTitle').value.trim();
  if(!title){ Toast.show('Please enter a title','high','bi-exclamation-triangle'); return; }
  const checklist = [...document.querySelectorAll('.checklist-item')].map(row=>({
    done: row.querySelector('input[type=checkbox]').checked,
    text: row.querySelector('input[type=text]').value.trim()
  })).filter(c=>c.text);

  const data = {
    title, description: document.getElementById('tDesc').value.trim(),
    subjectId: document.getElementById('tSubject').value || null,
    category: document.getElementById('tCategory').value,
    priority: document.getElementById('tPriority').value,
    dueDate: document.getElementById('tDueDate').value,
    dueTime: document.getElementById('tDueTime').value,
    status: document.getElementById('tStatus').value,
    progress: parseInt(document.getElementById('tProgress').value)||0,
    repeat: document.getElementById('tRepeat').value,
    score: document.getElementById('tScore').value.trim() || null,
    remarks: document.getElementById('tRemarks').value.trim(),
    reminder: document.getElementById('tReminder').checked,
    checklist,
  };
  if(data.status==='completed') data.progress = 100;

  const id = document.getElementById('tId').value;
  const tasks = DB.getTasks();
  if(id){
    const idx = tasks.findIndex(t=>t.id===id);
    const wasCompleted = tasks[idx].status==='completed';
    tasks[idx] = { ...tasks[idx], ...data };
    if(!wasCompleted && data.status==='completed'){ tasks[idx].completedAt = Date.now(); fireConfetti(); }
  } else {
    const newSemId = DB.getActiveSemesterId();
    tasks.push({ id: DB.uid(), createdAt: Date.now(), semesterId: newSemId, ...data });
  }
  DB.saveTasks(tasks);
  bootstrap.Modal.getInstance(document.getElementById('taskModal')).hide();
  Toast.show(id?'Task updated':'Task added');
  renderTasks();
}
function escapeHtml(s){ const d=document.createElement('div'); d.textContent=s||''; return d.innerHTML; }
