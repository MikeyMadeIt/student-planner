/* ============================================================
   GRADES.JS — Redesigned v2
   1. Subject cards: compact collapsed view
   2. Modal: wider assessment name, narrow score/total, live avg+weighted update
   3. GWA Calculator: cleaner result area, total units + total courses
   ============================================================ */

const GRADE_TABLE = [
  { point:1.00, min:99, max:100, label:'Excellent' },
  { point:1.25, min:96, max:98,  label:'Outstanding' },
  { point:1.50, min:93, max:95,  label:'Superior' },
  { point:1.75, min:90, max:92,  label:'Very Good' },
  { point:2.00, min:87, max:89,  label:'Good' },
  { point:2.25, min:84, max:86,  label:'Satisfactory' },
  { point:2.50, min:81, max:83,  label:'Fairly Satisfactory' },
  { point:2.75, min:78, max:80,  label:'Fair' },
  { point:3.00, min:75, max:77,  label:'Passing' },
  { point:5.00, min:0,  max:74,  label:'Failed' },
];
function percentToGWA(pct){
  if(pct===null||pct===undefined||isNaN(pct)) return null;
  for(const row of GRADE_TABLE){ if(pct>=row.min) return row.point; }
  return 5.00;
}
function gwaLabel(point){
  if(point===null||point===undefined) return '—';
  const row = GRADE_TABLE.slice().sort((a,b)=>Math.abs(a.point-point)-Math.abs(b.point-point))[0];
  return row ? row.label : '—';
}
function escapeHtml(s){ const d=document.createElement('div'); d.textContent=s==null?'':String(s); return d.innerHTML; }

/* ---- Data normalization ---- */
function normalizeGradeRecord(g){
  if(!Array.isArray(g.components)) g.components = [];
  g.components.forEach(c=>{
    if(!c.id) c.id = DB.uid();
    if(!c.name) c.name = '';
    if(c.weight===undefined||c.weight===null||isNaN(+c.weight)) c.weight = 0;
    if(!Array.isArray(c.assessments)){
      const oldScore = (c.rawScore!==null&&c.rawScore!==undefined&&c.rawScore!=='')
        ? { id:DB.uid(), name:'Score', score:+c.rawScore, totalItems:c.totalItems!=null?+c.totalItems:null }
        : (c.score!==null&&c.score!==undefined&&c.score!=='')
          ? { id:DB.uid(), name:'Score', score:+c.score, totalItems:100 }
          : null;
      c.assessments = oldScore ? [oldScore] : [];
    }
    c.assessments.forEach(a=>{
      if(!a.id) a.id = DB.uid();
      a.score = (a.score===''||a.score===undefined) ? null : +a.score;
      a.totalItems = (a.totalItems===''||a.totalItems===undefined||a.totalItems===null) ? null : +a.totalItems;
    });
  });
  return g;
}
function syncGradesWithSubjects(){
  const semId = DB.getActiveSemesterId();
  const subjects = DB.getSubjects().filter(s=>s.semesterId===semId && !s.archived);
  let allGrades = DB.getGrades().map(normalizeGradeRecord);
  // Add missing grade records for subjects in this semester
  subjects.forEach(s=>{
    if(!allGrades.find(g=>g.subjectId===s.id)){
      allGrades.push({subjectId:s.id, semesterId:semId, components:[]});
    }
  });
  // Ensure semesterId on existing grade records matches subject
  allGrades.forEach(g=>{
    if(!g.semesterId){
      const sub = DB.getSubject(g.subjectId);
      g.semesterId = sub ? sub.semesterId : semId;
    }
  });
  DB.saveGrades(allGrades);
  // Return only grades for active semester subjects
  return allGrades.filter(g=>subjects.some(s=>s.id===g.subjectId));
}

/* ---- Grade math ---- */
function assessmentPct(a){
  if(a.score===null||a.totalItems===null||a.totalItems===0) return null;
  return (a.score/a.totalItems)*100;
}
function componentAvgPct(c){
  const valid = c.assessments.filter(a=>assessmentPct(a)!==null);
  if(!valid.length) return null;
  return valid.reduce((s,a)=>s+assessmentPct(a),0)/valid.length;
}
function componentWeightedScore(c){
  const avg = componentAvgPct(c);
  if(avg===null) return null;
  return (avg*(+c.weight||0))/100;
}
function computeSubjectFinalPct(components){
  if(!components||!components.length) return null;
  const scored = components.filter(c=>componentWeightedScore(c)!==null);
  if(!scored.length) return null;
  return scored.reduce((s,c)=>s+componentWeightedScore(c),0);
}
function sumWeights(components){ return (components||[]).reduce((s,c)=>s+(+c.weight||0),0); }

/* ---- Init ---- */
function initGrades(){
  syncGradesWithSubjects();
  renderGradesOverview();
  renderGradeCards();
  renderGradeReferenceTable();
  renderGwaCalculator();
}

/* ---- Overview ---- */
function renderGradesOverview(){
  const semId = DB.getActiveSemesterId();
  const subjects = DB.getSubjects().filter(s=>s.semesterId===semId && !s.archived);
  const grades = syncGradesWithSubjects();
  const rows = subjects.map(s=>{
    const g = grades.find(x=>x.subjectId===s.id)||{components:[]};
    const pct = computeSubjectFinalPct(g.components);
    const point = pct!==null ? percentToGWA(pct) : null;
    return {subject:s,pct,point};
  }).filter(r=>r.pct!==null);
  let gwa=null;
  if(rows.length){
    const tu = rows.reduce((s,r)=>s+(+r.subject.units||0),0);
    if(tu>0) gwa = rows.reduce((s,r)=>s+r.point*(+r.subject.units||0),0)/tu;
  }
  document.getElementById('gGwa').textContent = gwa===null?'--':gwa.toFixed(2);
  document.getElementById('gGwaSub').textContent = gwa===null?'1.00–5.00 scale':`${gwaLabel(gwa)} · 1.00–5.00 scale`;
}

/* ============================================================
   SUBJECT CARDS — compact collapsed view
   ============================================================ */
function renderGradeCards(){
  const wrap = document.getElementById('gradesWrap');
  const semId = DB.getActiveSemesterId();
  const sem = DB.getActiveSemester();
  const subs = DB.getSubjects().filter(s=>s.semesterId===semId && !s.archived);
  const grades = DB.getGrades().map(normalizeGradeRecord);
  if(!subs.length){
    const msg = sem ? `No subjects yet for ${sem.schoolYear} • ${sem.name}. Add subjects in Schedule.` : 'Add subjects in Schedule to start tracking grades.';
    wrap.innerHTML=`<div class="col-12"><div class="glass card-pad text-center py-5 text-faint">${msg}</div></div>`;
    return;
  }
  wrap.innerHTML = subs.map(s=>{
    const g = grades.find(x=>x.subjectId===s.id)||{components:[]};
    const pct = computeSubjectFinalPct(g.components);
    const point = pct!==null ? percentToGWA(pct) : null;
    const totalWeight = sumWeights(g.components);
    const weightWarn = g.components.length && totalWeight!==100;
    const collapseId = `gc-${s.id}`;
    return `<div class="col-md-6 col-xl-4">
      <div class="grade-card hover-lift" style="border-left:3px solid ${s.color}">
        <!-- Collapsed: always visible -->
        <div class="grade-card-top">
          <div class="grade-card-info">
            <div class="grade-card-code">${escapeHtml(s.code)}</div>
            <div class="grade-card-pct">${pct===null?'--':pct.toFixed(1)+'%'}</div>
          </div>
          <div class="grade-card-actions">
            <span class="chip chip-sm">${point===null?'--':'GWA '+point.toFixed(2)}</span>
            <button class="btn-icon btn-icon-sm" onclick="openGradeModal('${s.id}')" title="Edit"><i class="bi bi-pencil"></i></button>
            <button class="btn-icon btn-icon-sm chev-toggle" data-bs-toggle="collapse" data-bs-target="#${collapseId}"><i class="bi bi-chevron-down"></i></button>
          </div>
        </div>
        <div class="progress grade-card-bar"><div class="progress-bar" style="width:${pct||0}%"></div></div>
        <!-- Expanded detail -->
        <div class="collapse" id="${collapseId}">
          <div class="grade-card-detail">
            ${s.desc?`<div class="text-faint mb-2" style="font-size:.76rem">${escapeHtml(s.desc)}</div>`:''}
            ${g.components.length ? `
              <div class="d-flex flex-column gap-1">
                ${g.components.map(c=>{
                  const ws = componentWeightedScore(c);
                  const avg = componentAvgPct(c);
                  return `<div class="d-flex justify-content-between align-items-center" style="font-size:.75rem">
                    <span class="text-soft">${escapeHtml(c.name)} <span class="text-faint">(${c.weight}%)</span></span>
                    <div class="d-flex gap-2">
                      <span class="text-faint">${avg===null?'—':avg.toFixed(1)+'%'}</span>
                      <span class="mono fw-bold" style="min-width:36px;text-align:right">${ws===null?'—':ws.toFixed(2)}</span>
                    </div>
                  </div>`;
                }).join('')}
              </div>
              ${weightWarn?`<div class="text-faint mt-2" style="font-size:.68rem;color:rgb(var(--accent-2))"><i class="bi bi-exclamation-triangle me-1"></i>Weights total ${totalWeight}%, not 100%</div>`:''}
            ` : `<div class="text-faint" style="font-size:.76rem">No components yet — tap <i class="bi bi-pencil"></i> to add.</div>`}
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ============================================================
   GRADE MODAL — fixed layout, live avg/weighted updates
   Assessment grid: wide name col, narrow score/total
   ============================================================ */
let gradeDraft=null, gradeDraftSubjectId=null;

// Column layout: assessment name gets most space, score+total are narrow
const ASSESS_GRID = '1fr 56px 56px 52px 28px';

function openGradeModal(subjectId){
  const s = DB.getSubject(subjectId);
  const grades = DB.getGrades().map(normalizeGradeRecord);
  const g = grades.find(x=>x.subjectId===subjectId)||{subjectId,components:[]};
  gradeDraftSubjectId = subjectId;
  gradeDraft = {components: JSON.parse(JSON.stringify(g.components||[]))};
  if(!gradeDraft.components.length) gradeDraft.components.push({id:DB.uid(),name:'',weight:'',assessments:[]});
  document.querySelector('#gradeModal .modal-title').textContent = `${s.code} — Grading Breakdown`;
  renderGradeModalBody();
  new bootstrap.Modal(document.getElementById('gradeModal')).show();
}

function renderGradeModalBody(){
  const body = document.getElementById('gradeModalBody');
  const finalPct = computeSubjectFinalPct(gradeDraft.components);
  const totalWeight = sumWeights(gradeDraft.components);
  const weightWarn = totalWeight!==100 && totalWeight!==0;

  body.innerHTML = `
    <p class="text-faint mb-3" style="font-size:.8rem">
      <strong>How it works:</strong> Create components (e.g., Quizzes 30%, Midterm 25%).
      Add assessments under each — enter the name, score, and total items.
      The system averages each component's assessments, applies the weight, and sums to a final grade.
    </p>
    <div id="componentAccordion" class="d-flex flex-column gap-3">
      ${gradeDraft.components.map((c,ci)=>componentBlockHtml(c,ci)).join('')}
    </div>
    <button type="button" class="btn btn-ghost btn-sm mt-3 w-100" onclick="addComponent()">
      <i class="bi bi-plus-lg me-1"></i>Add Component
    </button>
    ${weightWarn?`<div class="mt-2 p-2 rounded" style="background:rgba(var(--accent-2),.1);font-size:.76rem;color:rgb(var(--accent-2))">
      <i class="bi bi-exclamation-triangle me-1"></i>Weights total <strong>${totalWeight}%</strong> — should add up to 100%.
    </div>`:''}
    <div class="text-center mt-4 pt-3" style="border-top:1px solid var(--border)">
      <div class="text-faint" style="font-size:.68rem;text-transform:uppercase;letter-spacing:.07em">Computed Final Grade</div>
      <div class="stat-num" style="font-size:2rem" id="modalFinalPct">${finalPct===null?'--':finalPct.toFixed(2)+'%'}</div>
      <div class="text-faint" style="font-size:.8rem" id="modalFinalGwa">
        ${finalPct===null?'Add assessments to preview':`GWA ${percentToGWA(finalPct).toFixed(2)} · ${gwaLabel(percentToGWA(finalPct))}`}
      </div>
    </div>
    <button class="btn btn-accent w-100 mt-3" onclick="saveGradeComponents()">
      <i class="bi bi-check2 me-1"></i>Save Grading Breakdown
    </button>`;
}

function componentBlockHtml(c,ci){
  const avg = componentAvgPct(c);
  const ws = componentWeightedScore(c);
  return `<div class="comp-block" style="background:var(--surface-2);border:1px solid var(--border);border-radius:14px;overflow:hidden">
    <!-- Header: name + weight input-group + delete -->
    <div class="d-flex align-items-center gap-2 p-2" style="border-bottom:1px solid var(--border)">
      <input class="form-control form-control-sm" style="flex:1" placeholder="Component name (e.g., Quizzes)"
        value="${escapeHtml(c.name)}" oninput="gradeDraft.components[${ci}].name=this.value;refreshGradePreview()">
      <div class="input-group input-group-sm" style="width:88px;flex-shrink:0">
        <input type="number" min="0" max="100" step="1" class="form-control text-center" placeholder="Wt."
          value="${c.weight===0||c.weight===''?'':c.weight}"
          oninput="gradeDraft.components[${ci}].weight=this.value===''?0:+this.value;refreshGradePreview()"
          title="Weight %">
        <span class="input-group-text" style="background: transparent; color: white; border: none;">%</span>
      </div>
      <button type="button" class="btn-icon btn-icon-sm" onclick="removeComponent(${ci})" title="Remove">
        <i class="bi bi-trash3" style="color:#fb7185"></i>
      </button>
    </div>
    <!-- Assessment column headers -->
    <div style="display:grid;grid-template-columns:${ASSESS_GRID};gap:5px;padding:6px 10px 3px;font-size:.66rem;color:var(--text-faint);font-weight:700;text-transform:uppercase;letter-spacing:.04em">
      <div>Assessment</div>
      <div class="text-center">Score</div>
      <div class="text-center">Out of</div>
      <div class="text-center">%</div>
      <div></div>
    </div>
    <!-- Assessment rows -->
    <div id="assessRows-${ci}">
      ${(c.assessments||[]).map((a,ai)=>assessmentRowHtml(ci,ai,a)).join('')}
    </div>
    <!-- Footer: add button + live avg/weighted -->
    <div class="d-flex align-items-center justify-content-between px-2 py-2" style="border-top:1px solid var(--border);margin-top:2px">
      <button type="button" class="btn btn-ghost btn-sm" onclick="addAssessment(${ci})" style="font-size:.74rem;padding:2px 9px">
        <i class="bi bi-plus-lg me-1"></i>Add
      </button>
      <div class="text-end" style="font-size:.74rem" id="compSummary-${ci}">
        ${compSummaryHtml(avg,ws)}
      </div>
    </div>
  </div>`;
}

function compSummaryHtml(avg,ws){
  return `<span class="text-faint">Avg: </span><span class="mono fw-bold">${avg===null?'—':avg.toFixed(1)+'%'}</span>`
       + `<span class="text-faint ms-2">→ Weighted: </span><span class="mono fw-bold" style="color:rgb(var(--accent))">${ws===null?'—':ws.toFixed(2)}</span>`;
}

function assessmentRowHtml(ci,ai,a){
  const pct = assessmentPct(a);
  const pctColor = pct===null?'var(--text-faint)':pct>=75?'rgb(52,211,153)':'rgb(251,113,133)';
  return `<div id="assessRow-${ci}-${ai}" style="display:grid;grid-template-columns:${ASSESS_GRID};gap:5px;padding:3px 10px;align-items:center">
    <input class="form-control form-control-sm" placeholder="e.g., Quiz 1"
      value="${escapeHtml(a.name||'')}"
      oninput="gradeDraft.components[${ci}].assessments[${ai}].name=this.value">
    <input type="number" min="0" step="0.01" class="form-control form-control-sm text-center" placeholder="0"
      value="${a.score===null?'':a.score}"
      oninput="onAssessInput(${ci},${ai},'score',this.value)">
    <input type="number" min="0" step="0.01" class="form-control form-control-sm text-center" placeholder="100"
      value="${a.totalItems===null?'':a.totalItems}"
      oninput="onAssessInput(${ci},${ai},'totalItems',this.value)">
    <div class="text-center mono" id="assessPct-${ci}-${ai}" style="font-size:.76rem;color:${pctColor}">
      ${pct===null?'—':pct.toFixed(1)+'%'}
    </div>
    <button type="button" class="btn-icon btn-icon-sm" onclick="removeAssessment(${ci},${ai})">
      <i class="bi bi-x-lg" style="font-size:.6rem"></i>
    </button>
  </div>`;
}

function onAssessInput(ci,ai,field,value){
  const a = gradeDraft.components[ci].assessments[ai];
  a[field] = value==='' ? null : +value;
  // Update just the % cell
  const pct = assessmentPct(a);
  const pctEl = document.getElementById(`assessPct-${ci}-${ai}`);
  if(pctEl){
    pctEl.textContent = pct===null?'—':pct.toFixed(1)+'%';
    pctEl.style.color = pct===null?'var(--text-faint)':pct>=75?'rgb(52,211,153)':'rgb(251,113,133)';
  }
  // Update component summary (avg + weighted)
  updateCompSummary(ci);
  refreshGradePreview();
}

function updateCompSummary(ci){
  const c = gradeDraft.components[ci];
  const avg = componentAvgPct(c);
  const ws = componentWeightedScore(c);
  const el = document.getElementById(`compSummary-${ci}`);
  if(el) el.innerHTML = compSummaryHtml(avg,ws);
}

function addAssessment(ci){
  gradeDraft.components[ci].assessments.push({id:DB.uid(),name:'',score:null,totalItems:null});
  rerenderAssessRows(ci);
  updateCompSummary(ci);
  refreshGradePreview();
}

function removeAssessment(ci,ai){
  gradeDraft.components[ci].assessments.splice(ai,1);
  rerenderAssessRows(ci);
  updateCompSummary(ci);
  refreshGradePreview();
}

function rerenderAssessRows(ci){
  const wrap = document.getElementById(`assessRows-${ci}`);
  if(wrap) wrap.innerHTML = (gradeDraft.components[ci].assessments||[]).map((a,ai)=>assessmentRowHtml(ci,ai,a)).join('');
}

function addComponent(){
  gradeDraft.components.push({id:DB.uid(),name:'',weight:0,assessments:[]});
  renderGradeModalBody();
}

function removeComponent(ci){
  gradeDraft.components.splice(ci,1);
  if(!gradeDraft.components.length) gradeDraft.components.push({id:DB.uid(),name:'',weight:0,assessments:[]});
  renderGradeModalBody();
}

function refreshGradePreview(){
  const finalPct = computeSubjectFinalPct(gradeDraft.components);
  const pctEl = document.getElementById('modalFinalPct');
  const gwaEl = document.getElementById('modalFinalGwa');
  if(pctEl) pctEl.textContent = finalPct===null?'--':finalPct.toFixed(2)+'%';
  if(gwaEl) gwaEl.textContent = finalPct===null?'Add assessments to preview':`GWA ${percentToGWA(finalPct).toFixed(2)} · ${gwaLabel(percentToGWA(finalPct))}`;
}

function saveGradeComponents(){
  const cleaned = gradeDraft.components
    .map(c=>({
      id:c.id||DB.uid(), name:(c.name||'').trim(), weight:+c.weight||0,
      assessments:(c.assessments||[])
        .filter(a=>a.name||(a.score!==null&&a.totalItems!==null))
        .map(a=>({id:a.id||DB.uid(),name:(a.name||'').trim(),score:a.score,totalItems:a.totalItems}))
    })).filter(c=>c.name);
  const semId = DB.getActiveSemesterId();
  const grades = DB.getGrades().map(normalizeGradeRecord);
  const idx = grades.findIndex(g=>g.subjectId===gradeDraftSubjectId);
  if(idx>-1){ grades[idx].components=cleaned; grades[idx].semesterId = grades[idx].semesterId || semId; }
  else grades.push({subjectId:gradeDraftSubjectId, semesterId:semId, components:cleaned});
  DB.saveGrades(grades);
  const inst = bootstrap.Modal.getInstance(document.getElementById('gradeModal'));
  if(inst) inst.hide();
  if(typeof Toast!=='undefined') Toast.show('Grading breakdown saved');
  gradeDraft=null; gradeDraftSubjectId=null;
  renderGradesOverview();
  renderGradeCards();
}

/* ---- Grade reference table ---- */
function renderGradeReferenceTable(){
  const host = document.getElementById('gradeReferenceTable');
  if(!host) return;
  host.innerHTML = GRADE_TABLE.map(row=>`
    <div class="ref-row">
      <div class="ref-col-grade"><span class="grade-badge">${row.point.toFixed(2)}</span></div>
      <div class="ref-col-range text-soft">${row.max===100?`${row.min}–${row.max}%`:row.min===0?`Below ${row.max+1}%`:`${row.min}–${row.max}%`}</div>
      <div class="ref-col-meaning">${row.label}</div>
    </div>`).join('');
}

/* ============================================================
   GWA CALCULATOR — v2: clean result area, total units + courses
   ============================================================ */
function renderGwaCalculator(){
  const wrap = document.getElementById('gwaCalcRows');
  if(!wrap) return;
  let rows = DB.getGwaCalcRows();
  if(!rows.length){ rows=[{id:DB.uid(),label:'',units:'',grade:''}]; DB.saveGwaCalcRows(rows); }

  wrap.innerHTML = rows.map((r,i)=>gwaCalcRowHtml(r,i)).join('');

  let totalUnits=0, weightedSum=0, courseCount=0;
  rows.forEach(r=>{
    const u=+r.units||0, gr=+r.grade||0;
    if(r.units!==''&&r.grade!==''){ totalUnits+=u; weightedSum+=u*gr; courseCount++; }
  });

  const result = courseCount>0&&totalUnits>0 ? weightedSum/totalUnits : null;
  const passed = result!==null ? result<=3.00 : null;

  document.getElementById('gwaCalcResult').textContent = result===null?'--':result.toFixed(2);

  const meaningEl = document.getElementById('gwaCalcResultMeaning');
  if(meaningEl){
    meaningEl.textContent = result===null?'':gwaLabel(result);
    meaningEl.style.color = result===null?'var(--text-faint)':passed?'rgb(52,211,153)':'rgb(251,113,133)';
  }

  const statusEl = document.getElementById('gwaCalcResultStatus');
  if(statusEl){
    statusEl.textContent = result===null?'':passed?'PASSED':'FAILED';
    statusEl.style.color = result===null?'var(--text-faint)':passed?'rgba(52,211,153,.7)':'rgba(251,113,133,.7)';
  }

  const totUnitsEl = document.getElementById('gwaTotalUnits');
  if(totUnitsEl) totUnitsEl.textContent = totalUnits;
  const totCoursesEl = document.getElementById('gwaTotalCourses');
  if(totCoursesEl) totCoursesEl.textContent = courseCount;
}

function gwaCalcRowHtml(r,i){
  const gradeOptions = ['','1.00','1.25','1.50','1.75','2.00','2.25','2.50','2.75','3.00','5.00'];
  const sel = gradeOptions.map(v=>
    `<option value="${v}" ${r.grade==v&&v!==''?'selected':''}>${v===''?'Select grade':v}</option>`
  ).join('');
  return `<div class="gwa-input-row">
    <input class="form-control form-control-sm gwa-col-code" placeholder="e.g., HUM 1"
      value="${escapeHtml(r.label||'')}" oninput="updateGwaCalcRow(${i},'label',this.value)">
    <input type="number" min="0" step="0.5" class="form-control form-control-sm text-center gwa-col-units" placeholder="Uts."
      value="${r.units===''?'':r.units}" oninput="updateGwaCalcRow(${i},'units',this.value)">
    <select class="form-select form-select-sm gwa-col-grade" onchange="updateGwaCalcRow(${i},'grade',this.value)">
      ${sel}
    </select>
    <button type="button" class="btn-icon btn-icon-sm" onclick="removeGwaCalcRow(${i})">
      <i class="bi bi-trash3" style="color:#fb7185"></i>
    </button>
  </div>`;
}

function updateGwaCalcRow(i,field,value){
  const rows = DB.getGwaCalcRows();
  if(!rows[i]) return;
  rows[i][field] = (field==='units'||field==='grade') ? (value===''?'':+value) : value;
  DB.saveGwaCalcRows(rows);
  // For text/number inputs: only refresh the result totals, don't re-render
  // the rows (which destroys focus and dismisses the keyboard).
  // For grade select (dropdown): safe to full re-render since it doesn't have focus text.
  if(field==='grade'){
    renderGwaCalculator();
  } else {
    refreshGwaTotals(rows);
  }
}

function refreshGwaTotals(rows){
  if(!rows) rows = DB.getGwaCalcRows();
  let totalUnits=0, weightedSum=0, courseCount=0;
  rows.forEach(r=>{
    const u=+r.units||0, gr=+r.grade||0;
    if(r.units!==''&&r.grade!==''){ totalUnits+=u; weightedSum+=u*gr; courseCount++; }
  });
  const result = courseCount>0&&totalUnits>0 ? weightedSum/totalUnits : null;
  const passed = result!==null ? result<=3.00 : null;

  document.getElementById('gwaCalcResult').textContent = result===null?'--':result.toFixed(2);

  const meaningEl = document.getElementById('gwaCalcResultMeaning');
  if(meaningEl){
    meaningEl.textContent = result===null?'':gwaLabel(result);
    meaningEl.style.color = result===null?'var(--text-faint)':passed?'rgb(52,211,153)':'rgb(251,113,133)';
  }
  const statusEl = document.getElementById('gwaCalcResultStatus');
  if(statusEl){
    statusEl.textContent = result===null?'':passed?'PASSED':'FAILED';
    statusEl.style.color = result===null?'var(--text-faint)':passed?'rgba(52,211,153,.7)':'rgba(251,113,133,.7)';
  }
  const totUnitsEl = document.getElementById('gwaTotalUnits');
  if(totUnitsEl) totUnitsEl.textContent = totalUnits;
  const totCoursesEl = document.getElementById('gwaTotalCourses');
  if(totCoursesEl) totCoursesEl.textContent = courseCount;
}
function addGwaCalcRow(){
  const rows = DB.getGwaCalcRows();
  rows.push({id:DB.uid(),label:'',units:'',grade:''});
  DB.saveGwaCalcRows(rows);
  renderGwaCalculator();
}
function removeGwaCalcRow(i){
  const rows = DB.getGwaCalcRows();
  rows.splice(i,1);
  DB.saveGwaCalcRows(rows.length?rows:[{id:DB.uid(),label:'',units:'',grade:''}]);
  renderGwaCalculator();
}
function clearAllGwaRows(){
  DB.saveGwaCalcRows([{id:DB.uid(),label:'',units:'',grade:''}]);
  renderGwaCalculator();
}
