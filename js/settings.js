/* ============================================================
   SETTINGS.JS — includes Academic Semester Management
   ============================================================ */

function initSettings(){
  const s = DB.getSettings();
  document.getElementById('sName').value = s.name||'';
  document.getElementById('sNumber').value = s.studentNumber||'';
  document.getElementById('sCourse').value = s.course||'';
  document.getElementById('sYear').value = s.yearLevel||'';
  document.getElementById('sSection').value = s.section||'';
  document.getElementById('sSchool').value = s.school||'';

  highlightTheme(s.theme);
  renderAccentPicker(s.accent);
  renderNotifToggles(s.notifications);
  renderSemesterManager();
}

function saveProfile(){
  const s = DB.getSettings();
  s.name = document.getElementById('sName').value.trim();
  s.studentNumber = document.getElementById('sNumber').value.trim();
  s.course = document.getElementById('sCourse').value.trim();
  s.yearLevel = document.getElementById('sYear').value.trim();
  s.section = document.getElementById('sSection').value.trim();
  s.school = document.getElementById('sSchool').value.trim();
  DB.saveSettings(s);
  Toast.show('Profile saved');
}

/* ============================================================
   SEMESTER MANAGEMENT
   ============================================================ */

function renderSemesterManager(){
  const wrap = document.getElementById('semesterManager');
  if(!wrap) return;
  const semesters = DB.getSemesters();
  const activeId = DB.getActiveSemesterId();

  // Group by school year
  const byYear = {};
  semesters.forEach(sem => {
    if(!byYear[sem.schoolYear]) byYear[sem.schoolYear] = [];
    byYear[sem.schoolYear].push(sem);
  });

  const sortedYears = Object.keys(byYear).sort();

  let html = '';
  sortedYears.forEach(year => {
    const yearSems = byYear[year].sort((a,b) => a.name.localeCompare(b.name));
    html += `<div class="sem-year-group mb-3">
      <div class="sem-year-label">${year}</div>
      ${yearSems.map(sem => {
        const isActive = sem.id === activeId;
        return `<div class="sem-item ${isActive?'sem-item-active':''}">
          <div class="sem-item-left">
            <span class="sem-dot ${isActive?'active':''}"></span>
            <div>
              <div class="sem-item-name">${escapeSettingsHtml(sem.name)}</div>
              <div class="sem-item-dates">${sem.startDate} – ${sem.endDate}</div>
            </div>
          </div>
          <div class="sem-item-actions">
            ${isActive ? '<span class="chip sem-active-chip"><i class="bi bi-check2"></i> Active</span>' :
              `<button class="btn btn-ghost btn-sm" onclick="switchActiveSemester('${sem.id}')"><i class="bi bi-toggle-off me-1"></i>Switch</button>`}
            <button class="btn btn-ghost btn-sm" onclick="openEditSemesterModal('${sem.id}')"><i class="bi bi-pencil"></i></button>
            ${semesters.length > 1 ? `<button class="btn btn-ghost btn-sm text-danger" onclick="confirmDeleteSemester('${sem.id}')"><i class="bi bi-trash"></i></button>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>`;
  });

  html += `<div class="d-flex gap-2 mt-2">
    <button class="btn btn-accent btn-sm flex-grow-1" onclick="openAddSemesterModal()"><i class="bi bi-plus me-1"></i>Add Semester</button>
  </div>`;

  wrap.innerHTML = html;
}

function switchActiveSemester(id){
  DB.setActiveSemester(id);
  renderSemesterManager();
  const sem = DB.getActiveSemester();
  Toast.show(`Switched to ${sem.schoolYear} • ${sem.name}`);
}

function openAddSemesterModal(){
  const body = document.getElementById('semModalBody');
  body.innerHTML = `
    <input type="hidden" id="editSemId" value="">
    <div class="row g-2">
      <div class="col-md-6">
        <label>School Year</label>
        <input class="form-control" id="semYearInput" placeholder="e.g. 2026-2027" value="${new Date().getFullYear()}-${new Date().getFullYear()+1}">
      </div>
      <div class="col-md-6">
        <label>Semester</label>
        <select class="form-select" id="semNameInput">
          <option value="1st Semester">1st Semester</option>
          <option value="2nd Semester">2nd Semester</option>
        </select>
      </div>
      <div class="col-md-6"><label>Start Date</label><input type="date" class="form-control" id="semStartInput" value="${ymdLocalNow()}"></div>
      <div class="col-md-6"><label>End Date</label><input type="date" class="form-control" id="semEndInput" value="${ymdLocalFuture(105)}"></div>
      <div class="col-md-6"><label>Finals Date</label><input type="date" class="form-control" id="semFinalsInput" value="${ymdLocalFuture(100)}"></div>
      <div class="col-md-6"><label>Total Weeks</label><input type="number" class="form-control" id="semWeeksInput" value="15"></div>
    </div>
    <button class="btn btn-accent w-100 mt-3" onclick="saveSemesterModal()"><i class="bi bi-check2 me-1"></i>Add Semester</button>`;
  document.getElementById('semModalTitle').textContent = 'Add Semester';
  new bootstrap.Modal(document.getElementById('semModal')).show();
}

function openEditSemesterModal(id){
  const sem = DB.getSemesters().find(s=>s.id===id);
  if(!sem) return;
  const body = document.getElementById('semModalBody');
  body.innerHTML = `
    <input type="hidden" id="editSemId" value="${sem.id}">
    <div class="row g-2">
      <div class="col-md-6">
        <label>School Year</label>
        <input class="form-control" id="semYearInput" value="${sem.schoolYear}" readonly style="opacity:.7">
        <div class="text-faint mt-1" style="font-size:.75rem">School year cannot be changed (affects ID)</div>
      </div>
      <div class="col-md-6">
        <label>Semester</label>
        <input class="form-control" id="semNameInput" value="${sem.name}" readonly style="opacity:.7">
        <div class="text-faint mt-1" style="font-size:.75rem">Name cannot be changed (affects ID)</div>
      </div>
      <div class="col-md-6"><label>Start Date</label><input type="date" class="form-control" id="semStartInput" value="${sem.startDate}"></div>
      <div class="col-md-6"><label>End Date</label><input type="date" class="form-control" id="semEndInput" value="${sem.endDate}"></div>
      <div class="col-md-6"><label>Finals Date</label><input type="date" class="form-control" id="semFinalsInput" value="${sem.finalsDate}"></div>
      <div class="col-md-6"><label>Total Weeks</label><input type="number" class="form-control" id="semWeeksInput" value="${sem.totalWeeks}"></div>
    </div>
    <button class="btn btn-accent w-100 mt-3" onclick="saveSemesterModal()"><i class="bi bi-check2 me-1"></i>Update Semester</button>`;
  document.getElementById('semModalTitle').textContent = 'Edit Semester';
  new bootstrap.Modal(document.getElementById('semModal')).show();
}

function saveSemesterModal(){
  const editId = document.getElementById('editSemId').value;
  const schoolYear = (document.getElementById('semYearInput').value||'').trim();
  const semNameEl = document.getElementById('semNameInput');
  const semName = semNameEl ? semNameEl.value.trim() : '1st Semester';
  const startDate = document.getElementById('semStartInput').value;
  const endDate = document.getElementById('semEndInput').value;
  const finalsDate = document.getElementById('semFinalsInput').value;
  const totalWeeks = parseInt(document.getElementById('semWeeksInput').value)||15;

  if(!schoolYear){ Toast.show('School year is required','high','bi-exclamation-triangle'); return; }

  if(editId){
    DB.updateSemester(editId, { startDate, endDate, finalsDate, totalWeeks });
    Toast.show('Semester updated');
  } else {
    const result = DB.addSemester(schoolYear, semName, { startDate, endDate, finalsDate, totalWeeks });
    if(!result){
      Toast.show('That semester already exists','high','bi-exclamation-triangle');
    } else {
      Toast.show('Semester added');
    }
  }

  const modalEl = document.getElementById('semModal');
  const inst = bootstrap.Modal.getInstance(modalEl);
  if(inst) inst.hide();
  renderSemesterManager();
}

function confirmDeleteSemester(id){
  const sem = DB.getSemesters().find(s=>s.id===id);
  if(!sem) return;
  const subCount = DB.getSubjectsForSemester(id).length;
  const taskCount = DB.getTasksForSemester(id).length;
  const noteCount = DB.getNotesForSemester(id).length;
  const attCount = DB.getAttendanceForSemester(id).length;
  confirmAction({
    title:`Delete ${sem.schoolYear} ${sem.name}?`,
    message:`This will remove the semester record only. All linked data (${subCount} subjects, ${attCount} attendance, ${taskCount} tasks, ${noteCount} notes) will remain in storage but will no longer be associated with an active semester.`,
    confirmLabel:'Delete Semester', danger:true, icon:'bi-trash-fill',
    onConfirm(){
      if(!DB.deleteSemester(id)){
        Toast.show('Cannot delete the only semester','high','bi-exclamation-triangle');
      } else {
        Toast.show('Semester deleted');
        renderSemesterManager();
      }
    }
  });
}

function ymdLocalNow(){
  return ymdLocal(new Date());
}
function ymdLocalFuture(days){
  return ymdLocal(new Date(Date.now()+ 1000*60*60*24*days));
}
function ymdLocal(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function escapeSettingsHtml(s){ const d=document.createElement('div'); d.textContent=s||''; return d.innerHTML; }

/* ============================================================
   THEME / ACCENT / NOTIF (unchanged)
   ============================================================ */
function chooseTheme(theme){ setTheme(theme); highlightTheme(theme); }
function highlightTheme(theme){
  ['dark','light','amoled'].forEach(t=> document.getElementById('theme_'+t).classList.toggle('btn-accent', t===theme));
}
function renderAccentPicker(current){
  const accents = { violet:'#7C6CF6', blue:'#3B82F6', emerald:'#34D399', rose:'#FB7185', amber:'#FBBF24' };
  const wrap = document.getElementById('accentPicker');
  wrap.innerHTML = Object.entries(accents).map(([k,c])=>`
    <div onclick="chooseAccent('${k}')" data-accent-swatch="${k}" style="width:38px;height:38px;border-radius:12px;background:${c};cursor:pointer;box-shadow:${k===current?'0 0 0 3px rgba(255,255,255,.5)':'none'}"></div>`).join('');
}
function chooseAccent(a){
  setAccent(a);
  document.querySelectorAll('[data-accent-swatch]').forEach(el=> el.style.boxShadow = el.dataset.accentSwatch===a ? '0 0 0 3px rgba(255,255,255,.5)' : 'none');
}

function renderNotifToggles(n){
  const labels = { upcomingClass:'Upcoming Class', assignmentDue:'Assignment Due', examReminder:'Exam Reminder', pomodoroFinished:'Pomodoro Finished', dailyReview:'Daily Review Reminder' };
  document.getElementById('notifToggles').innerHTML = Object.entries(labels).map(([k,label])=>`
    <div class="form-check form-switch mb-2">
      <input class="form-check-input" type="checkbox" role="switch" id="notif_${k}" ${n[k]?'checked':''} onchange="updateNotifSetting('${k}', this.checked)">
      <label class="form-check-label">${label}</label>
    </div>`).join('');
}
function updateNotifSetting(key, val){
  const s = DB.getSettings();
  s.notifications[key] = val;
  DB.saveSettings(s);
}
function requestNotifPermission(){
  if(!('Notification' in window)){ Toast.show('Notifications not supported in this browser','high','bi-exclamation-triangle'); return; }
  Notification.requestPermission().then(p=>{
    Toast.show(p==='granted' ? 'Notifications enabled' : 'Permission not granted');
  });
}

function exportData(){
  const data = DB.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `student-planner-backup-${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  Toast.show('Data exported');
}
function importData(file){
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (e)=>{
    let data;
    try{ data = JSON.parse(e.target.result); }
    catch(err){ Toast.show('Invalid file — could not read backup','high','bi-exclamation-triangle'); return; }
    confirmAction({
      title:'Import this backup?',
      message:'This will overwrite your current subjects, tasks, notes, grades, and settings with the data from this file.',
      confirmLabel:'Import & Overwrite', danger:true, icon:'bi-upload',
      onConfirm(){
        DB.importAll(data);
        Toast.show('Data imported — reloading…');
        setTimeout(()=>location.reload(), 900);
      }
    });
  };
  reader.readAsText(file);
  document.getElementById('importFile').value = '';
}
function confirmReset(){
  confirmAction({
    title:'Reset all data?',
    message:'This permanently erases ALL your data — subjects, tasks, notes, grades, attendance, university calendar events, course syllabi — and restores the sample starter data. This cannot be undone.',
    confirmLabel:'Erase Everything', danger:true, icon:'bi-exclamation-octagon-fill',
    onConfirm(){
      DB.resetAll();
      Toast.show('Data reset');
      setTimeout(()=>location.reload(), 800);
    }
  });
}
window.exportData = exportData;
