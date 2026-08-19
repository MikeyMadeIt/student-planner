/* ============================================================
   GRADES.JS — Enhanced v4
   Features:
   1. Grade Trend Sparkline per subject (SVG, colored by direction)
   2. GWA Target Planner (semester-level)
   3. Inline Grade Equivalent Badge on numeric grades
   4. GWA Card full-width with 3 stat blocks
   5. Copy GWA Card as Image (Canvas API)
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

const PASSING_PCT = 75;

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

/* ---- Grade equivalent badge ---- */
function gradeEquivBadgeHtml(point){
  if(point===null||point===undefined) return '';
  const row = GRADE_TABLE.slice().sort((a,b)=>Math.abs(a.point-point)-Math.abs(b.point-point))[0];
  if(!row) return '';
  let cls = 'grade-equiv-badge-blue';
  if(row.point <= 1.75) cls = 'grade-equiv-badge-green';
  else if(row.point <= 2.75) cls = 'grade-equiv-badge-blue';
  else if(row.point === 3.00) cls = 'grade-equiv-badge-amber';
  else cls = 'grade-equiv-badge-red';
  return `<span class="grade-equiv-badge ${cls}">${escapeHtml(row.label)}</span>`;
}

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
  subjects.forEach(s=>{
    if(!allGrades.find(g=>g.subjectId===s.id)){
      allGrades.push({subjectId:s.id, semesterId:semId, components:[]});
    }
  });
  allGrades.forEach(g=>{
    if(!g.semesterId){
      const sub = DB.getSubject(g.subjectId);
      g.semesterId = sub ? sub.semesterId : semId;
    }
  });
  DB.saveGrades(allGrades);
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

/* ---- Sparkline trend data (grading period based) ---- */
function getSparklineDatapoints(components){
  // Use named grading period ordering if names match common patterns
  const periodOrder = ['prelim','midterm','semi','pre-final','final','prefinal'];
  function periodRank(name){
    const n = (name||'').toLowerCase();
    for(let i=0;i<periodOrder.length;i++) if(n.includes(periodOrder[i])) return i;
    return 999;
  }
  // Sort components by grading period name, then collect one point per component
  const sorted = [...components].sort((a,b)=>periodRank(a.name)-periodRank(b.name));
  const points = [];
  sorted.forEach(c=>{
    const avg = componentAvgPct(c);
    if(avg!==null) points.push({ label: c.name, pct: Math.round(avg*10)/10 });
  });
  return points;
}

/* ---- Trend direction ---- */
function trendDirection(points){
  if(!points||points.length<2) return 'flat';
  const first = points[0].pct;
  const last = points[points.length-1].pct;
  const diff = last - first;
  if(diff > 2) return 'up';
  if(diff < -2) return 'down';
  return 'flat';
}

/* ---- Init ---- */
function initGrades(){
  syncGradesWithSubjects();
  renderGradesOverview();
  renderGradeCards();
  renderGradeReferenceTable();
  renderGwaCalculator();
}

/* ---- Overview (Current GWA) — full-width 3 stat blocks ---- */
function renderGradesOverview(){
  const semId = DB.getActiveSemesterId();
  const subjects = DB.getSubjects().filter(s=>s.semesterId===semId && !s.archived);
  const grades = syncGradesWithSubjects();

  const rows = subjects.map(s=>{
    const g = grades.find(x=>x.subjectId===s.id)||{components:[]};
    const pct = computeSubjectFinalPct(g.components);
    const point = pct!==null ? percentToGWA(pct) : null;
    return {subject:s,pct,point};
  });

  const scoredRows = rows.filter(r=>r.pct!==null);
  const totalSubjects = subjects.length;
  const scoredSubjects = scoredRows.length;

  let gwa=null;
  if(scoredRows.length){
    const tu = scoredRows.reduce((s,r)=>s+(+r.subject.units||0),0);
    if(tu>0) gwa = scoredRows.reduce((s,r)=>s+r.point*(+r.subject.units||0),0)/tu;
  }

  // Highest and lowest subject GWA points (lower point = better in PH system)
  let highestRow=null, lowestRow=null;
  if(scoredRows.length){
    // Highest grade = lowest point number (1.00 is best)
    highestRow = scoredRows.reduce((best,r)=> r.point < best.point ? r : best, scoredRows[0]);
    lowestRow  = scoredRows.reduce((worst,r)=> r.point > worst.point ? r : worst, scoredRows[0]);
  }

  const gwaEl = document.getElementById('gGwa');
  const gwaSubEl = document.getElementById('gGwaSub');
  const gwaStatusEl = document.getElementById('gGwaStatus');
  const gwaStatusSubEl = document.getElementById('gGwaStatusSub');

  if(gwaEl) gwaEl.textContent = gwa===null?'--':gwa.toFixed(2);
  if(gwaSubEl){
    if(gwa===null){
      gwaSubEl.textContent = '1.00–5.00 scale';
    } else {
      gwaSubEl.textContent = `${gwaLabel(gwa)} · 1.00–5.00 scale`;
    }
  }

  if(gwaStatusEl && gwaStatusSubEl){
    if(scoredSubjects === 0){
      gwaStatusEl.innerHTML = '';
      gwaStatusSubEl.textContent = 'Add assessments to compute GWA';
    } else if(scoredSubjects < totalSubjects){
      gwaStatusEl.innerHTML = `<span class="grade-status-badge incomplete"><i class="bi bi-hourglass-split me-1"></i>Incomplete</span>`;
      gwaStatusSubEl.textContent = `Based on ${scoredSubjects} of ${totalSubjects} subject${totalSubjects!==1?'s':''}`;
    } else {
      gwaStatusEl.innerHTML = `<span class="grade-status-badge complete"><i class="bi bi-check2-circle me-1"></i>All Subjects</span>`;
      gwaStatusSubEl.textContent = `Based on ${scoredSubjects} subject${scoredSubjects!==1?'s':''}`;
    }
  }

  // Highest block
  const hiNumEl = document.getElementById('gHighest');
  const hiSubEl = document.getElementById('gHighestSub');
  if(hiNumEl) hiNumEl.textContent = highestRow ? highestRow.point.toFixed(2) : '--';
  if(hiSubEl) hiSubEl.textContent = highestRow ? `${highestRow.subject.code} · ${highestRow.pct.toFixed(1)}%` : '—';

  // Lowest block
  const loNumEl = document.getElementById('gLowest');
  const loSubEl = document.getElementById('gLowestSub');
  if(loNumEl) loNumEl.textContent = lowestRow ? lowestRow.point.toFixed(2) : '--';
  if(loSubEl) loSubEl.textContent = lowestRow ? `${lowestRow.subject.code} · ${lowestRow.pct.toFixed(1)}%` : '—';

  // Sync GWA into target planner current display
  const gwaTargetCurrentEl = document.getElementById('gwaTargetCurrent');
  if(gwaTargetCurrentEl) gwaTargetCurrentEl.value = gwa===null ? '—' : gwa.toFixed(2);
}

/* ============================================================
   GWA TARGET PLANNER (semester-level)
   ============================================================ */
function renderGwaTargetPlanner(){
  // Sync current GWA display — done in renderGradesOverview which runs first
  computeGwaTarget();
}

function computeGwaTarget(){
  const targetInput = document.getElementById('gwaTargetInput');
  const resultEl = document.getElementById('gwaTargetResult');
  if(!resultEl) return;

  const targetStr = targetInput ? targetInput.value.trim() : '';
  if(!targetStr){ resultEl.innerHTML=''; return; }

  const targetGwa = parseFloat(targetStr);
  if(isNaN(targetGwa) || targetGwa < 1 || targetGwa > 5){
    resultEl.innerHTML=`<div class="tg-result-box tg-warn"><i class="bi bi-exclamation-triangle me-1"></i>Enter a valid GWA between 1.00 and 5.00.</div>`;
    return;
  }

  const semId = DB.getActiveSemesterId();
  const subjects = DB.getSubjects().filter(s=>s.semesterId===semId && !s.archived);
  const grades = DB.getGrades().map(normalizeGradeRecord);

  if(!subjects.length){
    resultEl.innerHTML=`<div class="tg-result-box tg-info"><i class="bi bi-info-circle me-1"></i>Add subjects to use the GWA Target Planner.</div>`;
    return;
  }

  const rows = subjects.map(s=>{
    const g = grades.find(x=>x.subjectId===s.id)||{components:[]};
    const pct = computeSubjectFinalPct(g.components);
    const point = pct!==null ? percentToGWA(pct) : null;
    const units = +s.units || 0;
    return {subject:s, pct, point, units, graded: point!==null};
  });

  const gradedRows = rows.filter(r=>r.graded);
  const ungradedRows = rows.filter(r=>!r.graded);

  // Current weighted sum from graded subjects
  const gradedWeightedSum = gradedRows.reduce((s,r)=>s+r.point*r.units, 0);
  const gradedUnits = gradedRows.reduce((s,r)=>s+r.units, 0);
  const ungradedUnits = ungradedRows.reduce((s,r)=>s+r.units, 0);
  const totalUnits = gradedUnits + ungradedUnits;

  // Current GWA
  const currentGwa = gradedUnits > 0 ? gradedWeightedSum / gradedUnits : null;

  // Already achieved?
  if(currentGwa !== null && currentGwa <= targetGwa){
    resultEl.innerHTML=`
      <div class="gwa-target-result-box">
        <div class="gwa-target-info-row"><span class="text-faint">Target GWA</span><span class="gwa-target-val">${targetGwa.toFixed(2)}</span></div>
        <div class="gwa-target-info-row"><span class="text-faint">Current GWA</span><span class="gwa-target-val" style="color:#34d399">${currentGwa.toFixed(2)}</span></div>
        <div class="tg-result-box tg-pass mt-2"><i class="bi bi-trophy-fill me-1"></i>Target already achieved! Your current GWA of ${currentGwa.toFixed(2)} meets or beats your target of ${targetGwa.toFixed(2)}.</div>
      </div>`;
    return;
  }

  if(!ungradedRows.length){
    // All graded but target not met
    resultEl.innerHTML=`
      <div class="gwa-target-result-box">
        <div class="gwa-target-info-row"><span class="text-faint">Target GWA</span><span class="gwa-target-val">${targetGwa.toFixed(2)}</span></div>
        <div class="gwa-target-info-row"><span class="text-faint">Current GWA</span><span class="gwa-target-val" style="color:#fb7185">${currentGwa!==null?currentGwa.toFixed(2):'—'}</span></div>
        <div class="tg-result-box tg-fail mt-2"><i class="bi bi-x-circle-fill me-1"></i>All subjects are graded and your GWA of ${currentGwa!==null?currentGwa.toFixed(2):'—'} did not reach the target of ${targetGwa.toFixed(2)}.</div>
      </div>`;
    return;
  }

  /*
   * Solve for required average GWA point across ungraded subjects:
   * (gradedWeightedSum + X * ungradedUnits) / totalUnits = targetGwa
   * X = (targetGwa * totalUnits - gradedWeightedSum) / ungradedUnits
   */
  const requiredPointAvg = (targetGwa * totalUnits - gradedWeightedSum) / ungradedUnits;

  let html = `<div class="gwa-target-result-box">`;
  html += `<div class="gwa-target-info-row"><span class="text-faint">Target GWA</span><span class="gwa-target-val">${targetGwa.toFixed(2)}</span></div>`;
  html += `<div class="gwa-target-info-row"><span class="text-faint">Current GWA</span><span class="gwa-target-val">${currentGwa!==null?currentGwa.toFixed(2):'No grades yet'}</span></div>`;
  html += `<div class="gwa-target-info-row"><span class="text-faint">Graded subjects</span><span class="gwa-target-val">${gradedRows.length} of ${rows.length}</span></div>`;
  html += `<div class="gwa-target-info-row"><span class="text-faint">Ungraded units</span><span class="gwa-target-val">${ungradedUnits}</span></div>`;

  if(requiredPointAvg < 1.0){
    html += `<div class="tg-result-box tg-pass mt-2"><i class="bi bi-trophy-fill me-1"></i>Your current grades are strong enough — even a 1.00 GWA on remaining subjects ensures you hit the target.</div>`;
  } else if(requiredPointAvg > 5.0){
    html += `<div class="gwa-target-info-row"><span class="text-faint">Required avg GWA on ungraded</span><span class="gwa-target-val" style="color:#fb7185">${requiredPointAvg.toFixed(2)} (impossible)</span></div>`;
    html += `<div class="tg-result-box tg-fail mt-2"><i class="bi bi-x-circle-fill me-1"></i>Target not achievable — you would need an average GWA of ${requiredPointAvg.toFixed(2)} across remaining subjects, which exceeds the 5.00 scale.</div>`;
  } else {
    const reqLabel = gwaLabel(requiredPointAvg);
    html += `<div class="gwa-target-info-row"><span class="text-faint">Required avg GWA on ungraded</span><span class="gwa-target-val" style="color:#34d399;font-weight:800">${requiredPointAvg.toFixed(2)} <span class="text-faint" style="font-weight:400;font-size:.8em">(${reqLabel})</span></span></div>`;
    html += `<div class="tg-result-box tg-pass mt-2"><i class="bi bi-check-circle-fill me-1"></i>You need an average GWA of <strong>${requiredPointAvg.toFixed(2)}</strong> (${reqLabel}) across your ${ungradedRows.length} remaining subject${ungradedRows.length!==1?'s':''} to reach a GWA of ${targetGwa.toFixed(2)}.</div>`;
  }
  html += `</div>`;
  resultEl.innerHTML = html;
}

/* ============================================================
   SUBJECT CARDS — sparkline + inline grade badge
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

    // Passing/Failing status
    let statusBadge = '';
    const hasComponents = g.components.length > 0;
    const hasAnyScores = hasComponents && g.components.some(c=>c.assessments&&c.assessments.some(a=>assessmentPct(a)!==null));

    if(pct !== null){
      if(pct >= PASSING_PCT){
        statusBadge = `<span class="grade-pass-badge passing"><i class="bi bi-check-circle-fill"></i> Passing</span>`;
      } else {
        statusBadge = `<span class="grade-pass-badge failing"><i class="bi bi-exclamation-triangle-fill"></i> At Risk</span>`;
      }
    } else if(hasComponents && !hasAnyScores){
      statusBadge = `<span class="grade-pass-badge no-data"><i class="bi bi-dash-circle"></i> No data</span>`;
    }

    // Grade equiv badge
    const equivBadge = gradeEquivBadgeHtml(point);

    // Sparkline — per grading period
    const sparkPoints = getSparklineDatapoints(g.components);
    const hasSparkline = sparkPoints.length >= 2;

    return `<div class="col-md-6 col-xl-4">
      <div class="grade-card hover-lift" style="border-left:3px solid ${s.color}">
        <!-- Card top: compact three-column layout -->
        <div class="grade-card-top">
          <div class="grade-card-left">
            <div class="grade-card-code" title="${escapeHtml(s.code)}">${escapeHtml(s.code)}</div>
            ${statusBadge ? `<div class="grade-card-status-row">${statusBadge}</div>` : ''}
          </div>
          <div class="grade-card-center">
            <div class="grade-card-pct">${pct===null?'--':pct.toFixed(1)+'%'}</div>
            <div class="grade-card-gwa">${point===null?'—':'GWA '+point.toFixed(2)}${equivBadge}</div>
          </div>
          <div class="grade-card-actions">
            <button class="btn-icon btn-icon-xs" onclick="openGradeModal('${s.id}')" title="Edit grades"><i class="bi bi-pencil"></i></button>
            <button class="btn-icon btn-icon-xs chev-toggle" data-bs-toggle="collapse" data-bs-target="#${collapseId}" title="Toggle details"><i class="bi bi-chevron-down"></i></button>
          </div>
        </div>
        ${hasSparkline ? renderSparklineHtml(sparkPoints) : ''}
        <div class="progress grade-card-bar"><div class="progress-bar" style="width:${Math.min(pct||0,100)}%;background:${pct!==null&&pct<PASSING_PCT?'#fb7185':''}"></div></div>
        <!-- Expanded detail -->
        <div class="collapse" id="${collapseId}">
          <div class="grade-card-detail">
            ${s.desc?`<div class="text-faint mb-2" style="font-size:.76rem">${escapeHtml(s.desc)}</div>`:''}
            ${g.components.length ? `
              <div class="d-flex flex-column gap-1 mb-2">
                ${g.components.map(c=>{
                  const ws = componentWeightedScore(c);
                  const avg = componentAvgPct(c);
                  const cPassing = avg!==null ? avg>=PASSING_PCT : null;
                  return `<div class="d-flex justify-content-between align-items-center" style="font-size:.75rem">
                    <span class="text-soft">${escapeHtml(c.name)} <span class="text-faint">(${c.weight}%)</span></span>
                    <div class="d-flex gap-2 align-items-center">
                      <span style="color:${cPassing===null?'var(--text-faint)':cPassing?'#34d399':'#fb7185'}">${avg===null?'—':avg.toFixed(1)+'%'}</span>
                      <span class="mono fw-bold" style="min-width:36px;text-align:right">${ws===null?'—':ws.toFixed(2)}</span>
                    </div>
                  </div>`;
                }).join('')}
              </div>
              ${pct!==null&&pct<PASSING_PCT?`<div class="grade-warning-box mb-2"><i class="bi bi-exclamation-triangle-fill me-1"></i>Below passing threshold (${PASSING_PCT}%). Current: ${pct.toFixed(1)}%</div>`:''}
              ${weightWarn?`<div class="text-faint mb-2" style="font-size:.68rem;color:rgb(var(--accent-2))"><i class="bi bi-exclamation-triangle me-1"></i>Weights total ${totalWeight}%, not 100%</div>`:''}
            ` : `<div class="text-faint" style="font-size:.76rem">No components yet — tap <i class="bi bi-pencil"></i> to add.</div>`}
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ---- SVG Sparkline (inline, below grade display) ---- */
function renderSparklineHtml(points){
  if(!points||points.length<2) return '';
  const W = 280, H = 48, PL = 4, PR = 4, PT = 6, PB = 6;
  const chartW = W - PL - PR;
  const chartH = H - PT - PB;

  const vals = points.map(p=>p.pct);
  const minV = Math.max(0, Math.min(...vals) - 5);
  const maxV = Math.min(100, Math.max(...vals) + 5);
  const range = maxV - minV || 1;

  const toX = i => PL + (i / (points.length-1)) * chartW;
  const toY = v => PT + (1 - (v - minV) / range) * chartH;

  const dir = trendDirection(points);
  const lineColor = dir==='up' ? '#34d399' : dir==='down' ? '#fb7185' : '#94a3b8';
  const dotColorFn = (pct) => pct >= PASSING_PCT ? '#34d399' : '#fb7185';

  const polyPts = points.map((p,i)=>`${toX(i).toFixed(1)},${toY(p.pct).toFixed(1)}`).join(' ');

  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="grade-sparkline-svg" role="img" aria-label="Grade trend sparkline">`;

  // Trend line
  svg += `<polyline points="${polyPts}" fill="none" stroke="${lineColor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity="0.9"/>`;

  // Dots
  points.forEach((p,i)=>{
    const cx = toX(i), cy = toY(p.pct);
    svg += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3" fill="${dotColorFn(p.pct)}" stroke="var(--bg,#0a0d16)" stroke-width="1">`;
    svg += `<title>${escapeHtml(p.label)}: ${p.pct}%</title>`;
    svg += `</circle>`;
  });

  svg += `</svg>`;

  const dirIcon = dir==='up' ? '<i class="bi bi-graph-up-arrow" style="color:#34d399"></i>' : dir==='down' ? '<i class="bi bi-graph-down-arrow" style="color:#fb7185"></i>' : '<i class="bi bi-dash-lg" style="color:#94a3b8"></i>';

  return `<div class="grade-sparkline-wrap">
    <div class="grade-sparkline-label">${dirIcon} <span>${points[0].pct}% → ${points[points.length-1].pct}%</span></div>
    ${svg}
  </div>`;
}

/* ============================================================
   GRADE MODAL — fixed layout, live avg/weighted updates
   ============================================================ */
let gradeDraft=null, gradeDraftSubjectId=null;
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

  const isPassing = finalPct !== null ? finalPct >= PASSING_PCT : null;

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
      <div class="stat-num" style="font-size:2rem;color:${isPassing===null?'var(--text)':isPassing?'#34d399':'#fb7185'}" id="modalFinalPct">${finalPct===null?'--':finalPct.toFixed(2)+'%'}</div>
      <div class="text-faint" style="font-size:.8rem" id="modalFinalGwa">
        ${finalPct===null?'Add assessments to preview':`GWA ${percentToGWA(finalPct).toFixed(2)} · ${gwaLabel(percentToGWA(finalPct))}`}
      </div>
      ${finalPct!==null ? `
        <div class="mt-1" id="modalPassStatus">
          ${isPassing
            ? `<span class="grade-pass-badge passing"><i class="bi bi-check-circle-fill"></i> Passing (≥${PASSING_PCT}%)</span>`
            : `<span class="grade-pass-badge failing"><i class="bi bi-exclamation-triangle-fill"></i> At Risk — ${(PASSING_PCT-finalPct).toFixed(1)}% below passing</span>`
          }
        </div>` : ''}
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
  const pctColor = pct===null?'var(--text-faint)':pct>=PASSING_PCT?'rgb(52,211,153)':'rgb(251,113,133)';
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
  const pct = assessmentPct(a);
  const pctEl = document.getElementById(`assessPct-${ci}-${ai}`);
  if(pctEl){
    pctEl.textContent = pct===null?'—':pct.toFixed(1)+'%';
    pctEl.style.color = pct===null?'var(--text-faint)':pct>=PASSING_PCT?'rgb(52,211,153)':'rgb(251,113,133)';
  }
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
  const isPassing = finalPct !== null ? finalPct >= PASSING_PCT : null;
  const pctEl = document.getElementById('modalFinalPct');
  const gwaEl = document.getElementById('modalFinalGwa');
  const statusEl = document.getElementById('modalPassStatus');
  if(pctEl){
    pctEl.textContent = finalPct===null?'--':finalPct.toFixed(2)+'%';
    pctEl.style.color = isPassing===null?'var(--text)':isPassing?'#34d399':'#fb7185';
  }
  if(gwaEl) gwaEl.textContent = finalPct===null?'Add assessments to preview':`GWA ${percentToGWA(finalPct).toFixed(2)} · ${gwaLabel(percentToGWA(finalPct))}`;
  if(statusEl){
    if(finalPct===null){
      statusEl.innerHTML='';
    } else {
      statusEl.innerHTML = isPassing
        ? `<span class="grade-pass-badge passing"><i class="bi bi-check-circle-fill"></i> Passing (≥${PASSING_PCT}%)</span>`
        : `<span class="grade-pass-badge failing"><i class="bi bi-exclamation-triangle-fill"></i> At Risk — ${(PASSING_PCT-finalPct).toFixed(1)}% below passing</span>`;
    }
  }
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
   TARGET GRADE CALCULATOR
   ============================================================ */
function openTargetGradeInfo(){
  new bootstrap.Modal(document.getElementById('targetGradeInfoModal')).show();
}

function renderTargetGradeSection(){
  const wrap = document.getElementById('targetGradeWrap');
  if(!wrap) return;
  const semId = DB.getActiveSemesterId();
  const subs = DB.getSubjects().filter(s=>s.semesterId===semId && !s.archived);

  if(!subs.length){
    wrap.innerHTML = `<div class="text-faint text-center py-3" style="font-size:.82rem">Add subjects to use the Target Grade calculator.</div>`;
    return;
  }

  const subOptions = subs.map(s=>`<option value="${s.id}">${escapeHtml(s.code)}</option>`).join('');

  wrap.innerHTML = `
    <div class="tg-form-grid">
      <div class="tg-form-field">
        <label class="tg-label">Subject</label>
        <select class="form-select form-select-sm" id="tgSubject" onchange="updateTargetGradeComponents()">
          ${subOptions}
        </select>
      </div>
      <div class="tg-form-field">
        <label class="tg-label">Desired Final Grade <span class="tg-label-sub">(%)</span></label>
        <input type="number" min="0" max="100" step="0.1" class="form-control form-control-sm" id="tgTarget" placeholder="e.g. 90" oninput="computeTargetGrade()">
      </div>
      <div class="tg-form-field">
        <label class="tg-label">Remaining Component <span class="tg-label-sub">(to compute)</span></label>
        <select class="form-select form-select-sm" id="tgComponent" onchange="computeTargetGrade()">
          <option value="">Select component…</option>
        </select>
      </div>
    </div>
    <button class="btn btn-accent w-100 tg-calc-btn" onclick="computeTargetGrade()">
      <i class="bi bi-calculator me-1"></i>Calculate Target Grade
    </button>
    <div id="tgResult" class="mt-2"></div>`;

  updateTargetGradeComponents();
}

function updateTargetGradeComponents(){
  const subId = document.getElementById('tgSubject')?.value;
  if(!subId) return;
  const grades = DB.getGrades().map(normalizeGradeRecord);
  const g = grades.find(x=>x.subjectId===subId)||{components:[]};
  const sel = document.getElementById('tgComponent');
  if(!sel) return;
  sel.innerHTML = `<option value="">Select component</option>` +
    g.components.map(c=>`<option value="${c.id}">${escapeHtml(c.name)} (${c.weight}%)</option>`).join('');
  document.getElementById('tgResult').innerHTML='';
}

function computeTargetGrade(){
  const subId = document.getElementById('tgSubject')?.value;
  const targetStr = document.getElementById('tgTarget')?.value;
  const compId = document.getElementById('tgComponent')?.value;
  const resultEl = document.getElementById('tgResult');
  if(!resultEl) return;

  if(!subId || !targetStr || !compId){
    resultEl.innerHTML='';
    return;
  }

  const target = parseFloat(targetStr);
  if(isNaN(target) || target < 0 || target > 100){
    resultEl.innerHTML=`<div class="tg-result-box tg-warn"><i class="bi bi-exclamation-triangle me-1"></i>Enter a valid target between 0 and 100.</div>`;
    return;
  }

  const grades = DB.getGrades().map(normalizeGradeRecord);
  const g = grades.find(x=>x.subjectId===subId)||{components:[]};
  const targetComp = g.components.find(c=>c.id===compId);
  if(!targetComp){
    resultEl.innerHTML=`<div class="tg-result-box tg-warn">Component not found.</div>`;
    return;
  }

  const remainingWeight = +targetComp.weight || 0;
  if(!remainingWeight){
    resultEl.innerHTML=`<div class="tg-result-box tg-warn">Selected component has 0% weight — cannot calculate.</div>`;
    return;
  }

  const otherComponents = g.components.filter(c => c.id !== compId);

  let scoredWeightedSum = 0;
  let scoredOtherWeight = 0;
  let unscoredOtherWeight = 0;

  otherComponents.forEach(c => {
    const avg = componentAvgPct(c);
    const w = +c.weight || 0;
    if(avg !== null){
      scoredWeightedSum += (avg * w / 100);
      scoredOtherWeight += w;
    } else {
      unscoredOtherWeight += w;
    }
  });

  const requiredPct = (target - scoredWeightedSum) / (remainingWeight / 100);

  let resultHtml = '';

  if(scoredOtherWeight === 0 && otherComponents.length > 0){
    resultHtml = `<div class="tg-info-box">
      <div class="tg-info-row"><span class="text-faint">Target Grade</span><span class="tg-val">${target}%</span></div>
      <div class="tg-info-row"><span class="text-faint">Current Grade</span><span class="tg-val text-faint">No data yet</span></div>
      <div class="tg-info-row"><span class="text-faint">${escapeHtml(targetComp.name)} Weight</span><span class="tg-val">${remainingWeight}%</span></div>
      <div class="tg-result-box tg-info mt-2"><i class="bi bi-info-circle me-1"></i>Enter scores for other components first to get an accurate required score.</div>
    </div>`;
  } else if(requiredPct > 100){
    resultHtml = `<div class="tg-info-box">
      <div class="tg-info-row"><span class="text-faint">Target Grade</span><span class="tg-val">${target}%</span></div>
      <div class="tg-info-row"><span class="text-faint">Current Weighted Score</span><span class="tg-val">${scoredWeightedSum.toFixed(2)} pts</span></div>
      <div class="tg-info-row"><span class="text-faint">${escapeHtml(targetComp.name)} Weight</span><span class="tg-val">${remainingWeight}%</span></div>
      <div class="tg-info-row"><span class="text-faint">Required Score</span><span class="tg-val" style="color:#fb7185">${requiredPct.toFixed(1)}% <span class="text-faint">(impossible)</span></span></div>
      ${unscoredOtherWeight > 0 ? `<div class="tg-result-box tg-warn mt-2"><i class="bi bi-info-circle me-1"></i>${unscoredOtherWeight}% in unscored components — adding scores may improve achievability.</div>` : ''}
      <div class="tg-result-box tg-fail mt-2"><i class="bi bi-x-circle-fill me-1"></i>Target not achievable — requires ${requiredPct.toFixed(1)}% on ${escapeHtml(targetComp.name)}.</div>
    </div>`;
  } else if(requiredPct <= 0){
    resultHtml = `<div class="tg-info-box">
      <div class="tg-info-row"><span class="text-faint">Target Grade</span><span class="tg-val">${target}%</span></div>
      <div class="tg-info-row"><span class="text-faint">Current Weighted Score</span><span class="tg-val" style="color:#34d399">${scoredWeightedSum.toFixed(2)} pts</span></div>
      <div class="tg-result-box tg-pass mt-2"><i class="bi bi-trophy-fill me-1"></i>Target already achieved — even with 0% on ${escapeHtml(targetComp.name)} you will meet the target.</div>
    </div>`;
  } else {
    resultHtml = `<div class="tg-info-box">
      <div class="tg-info-row"><span class="text-faint">Target Grade</span><span class="tg-val">${target}%</span></div>
      <div class="tg-info-row"><span class="text-faint">Current Weighted Score</span><span class="tg-val">${scoredWeightedSum.toFixed(2)} pts <span class="text-faint">of ${(scoredOtherWeight+remainingWeight)}% available</span></span></div>
      <div class="tg-info-row"><span class="text-faint">${escapeHtml(targetComp.name)} Weight</span><span class="tg-val">${remainingWeight}%</span></div>
      <div class="tg-info-row"><span class="text-faint">Required Score</span><span class="tg-val" style="color:#34d399;font-size:1.1em;font-weight:800">${requiredPct.toFixed(1)}%</span></div>
      ${unscoredOtherWeight > 0 ? `<div class="tg-info-row"><span class="text-faint">Unscored components</span><span class="tg-val text-faint">${unscoredOtherWeight}% weight not yet entered</span></div>` : ''}
      <div class="tg-result-box tg-pass mt-2"><i class="bi bi-check-circle-fill me-1"></i>You need at least <strong>${requiredPct.toFixed(1)}%</strong> on ${escapeHtml(targetComp.name)} to reach ${target}%.</div>
    </div>`;
  }
  resultEl.innerHTML = resultHtml;
}

/* ============================================================
   GWA CALCULATOR — clearly labeled as manual utility
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

/* ============================================================
   COPY GWA CARD AS IMAGE (Canvas API, no external libs)
   ============================================================ */
function copyGwaCardAsImage(){
  const settings = DB.getSettings();
  const name = (settings && settings.name) ? settings.name : 'Student';
  const sem = DB.getActiveSemester();
  const semLabel = sem ? `${sem.name} · ${sem.schoolYear}` : 'Current Semester';

  const gwaEl = document.getElementById('gGwa');
  const gwaSubEl = document.getElementById('gGwaSub');
  const gwa = gwaEl ? gwaEl.textContent : '--';
  const gwaSub = gwaSubEl ? gwaSubEl.textContent : '';

  const W = 560, H = 220;
  const canvas = document.createElement('canvas');
  canvas.width = W * 2;
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0f1220');
  bg.addColorStop(1, '#1a1030');
  ctx.fillStyle = bg;
  ctx.roundRect(0, 0, W, H, 18);
  ctx.fill();

  // Accent stripe top
  const stripe = ctx.createLinearGradient(0, 0, W, 0);
  stripe.addColorStop(0, 'rgba(124,108,246,0.9)');
  stripe.addColorStop(1, 'rgba(79,140,255,0.9)');
  ctx.fillStyle = stripe;
  ctx.fillRect(0, 0, W, 4);

  // App label
  ctx.font = '700 11px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(124,108,246,0.8)';
  ctx.letterSpacing = '0.08em';
  ctx.fillText('STUDENT PLANNER', 28, 30);

  // Student name
  ctx.font = '600 18px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.letterSpacing = '0';
  ctx.fillText(name, 28, 56);

  // Semester
  ctx.font = '400 12px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText(semLabel, 28, 76);

  // Divider
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(28, 92);
  ctx.lineTo(W - 28, 92);
  ctx.stroke();

  // GWA label
  ctx.font = '700 10px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.letterSpacing = '0.1em';
  ctx.fillText('CURRENT GWA', 28, 118);

  // GWA value
  ctx.font = '800 56px monospace';
  const gwaGrad = ctx.createLinearGradient(0, 0, 200, 0);
  gwaGrad.addColorStop(0, 'rgba(124,108,246,1)');
  gwaGrad.addColorStop(1, 'rgba(79,140,255,1)');
  ctx.fillStyle = gwaGrad;
  ctx.letterSpacing = '0';
  ctx.fillText(gwa, 26, 176);

  // GWA sub label
  ctx.font = '400 13px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.letterSpacing = '0';
  ctx.fillText(gwaSub, 28, 200);

  // Date
  const dateStr = new Date().toLocaleDateString('en-PH', {year:'numeric',month:'long',day:'numeric'});
  ctx.font = '400 11px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  const dateW = ctx.measureText(dateStr).width;
  ctx.fillText(dateStr, W - 28 - dateW, H - 18);

  // Download as PNG
  canvas.toBlob(blob => {
    if(!blob){ showGwaToast('Failed to generate image', true); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gwa-${name.replace(/\s+/g,'-').toLowerCase()}-${new Date().toISOString().slice(0,10)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showGwaToast('Image downloaded!');
  }, 'image/png');
}

function showGwaToast(msg, isError){
  const el = document.getElementById('gwaToast');
  if(!el) return;
  el.textContent = msg;
  el.className = 'gwa-toast' + (isError ? ' gwa-toast-error' : ' gwa-toast-visible');
  void el.offsetWidth;
  el.classList.add('gwa-toast-visible');
  setTimeout(()=>{ el.classList.remove('gwa-toast-visible','gwa-toast-error'); }, 2600);
}
