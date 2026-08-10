/* ============================================================
   ATTENDANCE.JS (Enhanced)
   ============================================================ */

function initAttendance(){
  const subs = DB.getSubjects().filter(s=>!s.archived);
  document.getElementById('attSubject').innerHTML = subs.map(s=>`<option value="${s.id}">${s.code}</option>`).join('');
  document.getElementById('attDate').value = todayKey();
  renderAttendanceAll();
}

function logAttendance(){
  const subjectId = document.getElementById('attSubject').value;
  const date = document.getElementById('attDate').value;
  const status = document.getElementById('attStatus').value;
  const online = document.getElementById('attOnline').checked;
  if(!subjectId || !date){ Toast.show('Select subject and date','high','bi-exclamation-triangle'); return; }
  const records = DB.getAttendance();
  const existing = records.find(r=>r.subjectId===subjectId && r.date===date);
  if(existing){ existing.status = status; existing.online = online; }
  else records.push({ id:DB.uid(), subjectId, date, status, online });
  DB.saveAttendance(records);
  Toast.show('Attendance logged');
  renderAttendanceAll();
}

function renderAttendanceAll(){
  renderOverallRate();
  renderStatistics();
  renderRanking();
  renderLog();
}

/* ======== OVERALL RATE (excludes No Classes) ======== */
function renderOverallRate(){
  const records = DB.getAttendance();
  const relevantRecords = records.filter(r => r.status !== 'No Classes');
  const rate = relevantRecords.length ? Math.round(relevantRecords.filter(r=>r.status==='Present'||r.status==='Excused').length/relevantRecords.length*100) : null;
  document.getElementById('aRate').textContent = rate===null ? '--%' : rate+'%';
  document.getElementById('aRateBar').style.width = (rate||0)+'%';
}

/* ======== ATTENDANCE STATISTICS ======== */
function renderStatistics(){
  const records = DB.getAttendance();
  
  const stats = {
    Present: records.filter(r => r.status === 'Present').length,
    Late: records.filter(r => r.status === 'Late').length,
    Excused: records.filter(r => r.status === 'Excused').length,
    Absent: records.filter(r => r.status === 'Absent').length,
    'No Classes': records.filter(r => r.status === 'No Classes').length,
    Online: records.filter(r => r.online).length,
  };
  
  const relevantRecords = records.filter(r => r.status !== 'No Classes');
  const total = relevantRecords.length;
  
  const wrap = document.getElementById('attendanceStats');
  if(!records.length){
    wrap.innerHTML = `<div class="text-faint text-center py-3" style="font-size:.82rem; grid-column: 1/-1;">Log attendance to see statistics</div>`;
    return;
  }
  
  wrap.innerHTML = `
    <div class="att-stat-card present">
      <div class="stat-label">Present</div>
      <div class="stat-value">${stats.Present}</div>
      ${total > 0 ? `<div class="stat-percent">${Math.round(stats.Present / total * 100)}%</div>` : ''}
    </div>
    <div class="att-stat-card late">
      <div class="stat-label">Late</div>
      <div class="stat-value">${stats.Late}</div>
      ${total > 0 ? `<div class="stat-percent">${Math.round(stats.Late / total * 100)}%</div>` : ''}
    </div>
    <div class="att-stat-card excused">
      <div class="stat-label">Excused</div>
      <div class="stat-value">${stats.Excused}</div>
      ${total > 0 ? `<div class="stat-percent">${Math.round(stats.Excused / total * 100)}%</div>` : ''}
    </div>
    <div class="att-stat-card absent">
      <div class="stat-label">Absent</div>
      <div class="stat-value">${stats.Absent}</div>
      ${total > 0 ? `<div class="stat-percent">${Math.round(stats.Absent / total * 100)}%</div>` : ''}
    </div>
    <div class="att-stat-card noclasses">
      <div class="stat-label">No Class</div>
      <div class="stat-value">${stats['No Classes']}</div>
      <div class="stat-percent">—</div>
    </div>
    <div class="att-stat-card online">
      <div class="stat-label">Online</div>
      <div class="stat-value">${stats.Online}</div>
      ${total > 0 ? `<div class="stat-percent">${Math.round(stats.Online / total * 100)}%</div>` : ''}
    </div>
  `;
}

/* ======== SUBJECT RANKING (Compact) - Excludes No Classes ======== */
function renderRanking(){
  const subs = DB.getSubjects().filter(s=>!s.archived);
  const records = DB.getAttendance();
  
  const ranked = subs.map(s=>{
    const recs = records.filter(r=>r.subjectId===s.id && r.status !== 'No Classes');
    const rate = recs.length ? Math.round(recs.filter(r=>r.status==='Present'||r.status==='Excused').length/recs.length*100) : null;
    return { s, rate, count:recs.length };
  }).filter(r=>r.rate!==null).sort((a,b)=>b.rate-a.rate);
  
  const wrap = document.getElementById('subjectRanking');
  if(!ranked.length){ 
    wrap.innerHTML = `<div class="text-faint text-center py-3" style="font-size:.82rem">Log attendance to see ranking</div>`; 
    return; 
  }
  
  wrap.innerHTML = ranked.map((r,i)=>{
    const dotColor = r.s.color || '#888';
    return `
      <div class="att-ranking-row" style="border-color: ${dotColor}20">
        <div class="att-ranking-badge">#${i+1}</div>
        <div class="att-ranking-code" style="color: ${dotColor}">${r.s.code}</div>
        <div class="att-ranking-bar">
          <div class="progress" style="height:100%">
            <div class="progress-bar" style="width:${r.rate}%; background: linear-gradient(90deg, ${dotColor}, ${dotColor}80);"></div>
          </div>
        </div>
        <div class="att-ranking-percent">${r.rate}%</div>
        <div class="att-ranking-count">${r.count}x</div>
      </div>
    `;
  }).join('');
}

/* ======== ATTENDANCE LOG (Compact) - Includes No Classes ======== */
function renderLog(){
  const subs = DB.getSubjects();
  const records = [...DB.getAttendance()].sort((a,b)=>b.date.localeCompare(a.date));
  const wrap = document.getElementById('attendanceLog');
  
  if(!records.length){ 
    wrap.innerHTML = `<div class="text-faint text-center py-4" style="font-size:.82rem">No attendance logged yet</div>`; 
    return; 
  }
  
  wrap.innerHTML = records.map(r=>{
    const s = subs.find(x=>x.id===r.subjectId);
    const dotColor = s ? s.color : '#888';
    const statusClass = r.status === 'No Classes' ? 'noclasses' : r.status.toLowerCase().replace(' ', '');
    const statusDisplay = r.status === 'No Classes' ? 'No Class' : r.status;
    const onlineBadge = r.online ? `<span class="att-status-badge online" style="margin-left: 4px;">Online</span>` : '';
    
    return `
      <div class="att-log-row">
        <div class="att-log-dot" style="background: ${dotColor};"></div>
        <div class="att-log-date">${r.date}</div>
        <div class="att-log-subject" title="${s?s.code:'Unknown'}">${s?s.code:'Unknown'}</div>
        <div class="att-log-status">
          <span class="att-status-badge ${statusClass}">${statusDisplay}</span>${onlineBadge}
        </div>
        <button class="att-log-delete" onclick="deleteAttendance('${r.id}')" title="Delete record">
          <i class="bi bi-trash"></i>
        </button>
      </div>
    `;
  }).join('');
}

function deleteAttendance(id){
  confirmAction({
    title:'Remove attendance record?',
    message:'This log entry will be permanently removed.',
    confirmLabel:'Remove', 
    danger:true, 
    icon:'bi-trash-fill',
    onConfirm(){
      DB.saveAttendance(DB.getAttendance().filter(r=>r.id!==id));
      Toast.show('Record removed');
      renderAttendanceAll();
    }
  });
}
