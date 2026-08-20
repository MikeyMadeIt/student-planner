/* ============================================================
   WALLPAPER.JS — canvas-based schedule wallpaper generator
   Two modes: Subject List + Timetable
   ============================================================ */

/* ── Themes ── */
const WP_THEMES = {
  minimal:   { bg:['#f5f6fa','#eceff5'], text:'#1c2030', sub:'#6a7086', accent:'#7C6CF6', card:'rgba(20,25,45,.06)', line:'rgba(20,25,45,.1)'  },
  dark:      { bg:['#12141d','#0a0c13'], text:'#f2f3fa', sub:'#9aa0b8', accent:'#7C6CF6', card:'rgba(255,255,255,.07)', line:'rgba(255,255,255,.12)' },
  glass:     { bg:['#2b2450','#151233'], text:'#ffffff', sub:'#c9c4e8', accent:'#a78bfa', card:'rgba(255,255,255,.12)', line:'rgba(255,255,255,.2)'  },
  gradient:  { bg:['#7C6CF6','#4F8CFF'], text:'#ffffff', sub:'#eef0ff', accent:'#ffffff', card:'rgba(255,255,255,.16)', line:'rgba(255,255,255,.28)' },
  neon:      { bg:['#0b0c1e','#03030a'], text:'#eafcff', sub:'#7cf5e0', accent:'#39ffea', card:'rgba(57,255,234,.09)', line:'rgba(57,255,234,.38)' },
  cyberpunk: { bg:['#1a0b2e','#0d0416'], text:'#fef08a', sub:'#f472b6', accent:'#f472b6', card:'rgba(244,114,182,.12)', line:'rgba(244,114,182,.42)' },
  pastel:    { bg:['#ffe8f0','#e8f0ff'], text:'#3a3355', sub:'#7a7398', accent:'#c084fc', card:'rgba(60,50,90,.07)', line:'rgba(60,50,90,.12)' },
  amoled:    { bg:['#000000','#000000'], text:'#ffffff', sub:'#8a8fa3', accent:'#7C6CF6', card:'rgba(255,255,255,.06)', line:'rgba(255,255,255,.14)' },
};

/* ── State ── */
let wpTheme = 'dark';
let wpMode  = 'list'; // 'list' | 'timetable'
let wpToggleState = { room:true, professor:true, name:true, semester:true };

const WP_DAY_ORDER = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const WP_DAY_FULL  = { Mon:'Monday', Tue:'Tuesday', Wed:'Wednesday', Thu:'Thursday', Fri:'Friday', Sat:'Saturday', Sun:'Sunday' };
const WP_PALETTE   = ['#7C6CF6','#4F8CFF','#34D399','#FB7185','#FBBF24','#F472B6','#22D3EE','#A78BFA','#F97316','#10B981'];

function getSubjectColor(subject){
  return subject.color || WP_PALETTE[0];
}

/* ── Helpers: get all active non-archived subjects / all days they use ── */
function getAllSubjects(){
  return DB.getActiveSubjects().filter(s => !s.archived);
}
function getAllDaysInUse(subjects){
  const used = new Set();
  subjects.forEach(s => (s.days||[]).forEach(d => used.add(d)));
  return WP_DAY_ORDER.filter(d => used.has(d));
}

/* ══════════════════════════════════════════
   INIT
   ══════════════════════════════════════════ */
function initWallpaper(){
  buildThemePicker();
  buildToggles();
  document.getElementById('wpSize').addEventListener('change', onSizeChange);
  generateWallpaper();
}

/* ── Mode toggle ── */
function setWpMode(mode){
  wpMode = mode;
  document.getElementById('modeTabList').classList.toggle('active', mode==='list');
  document.getElementById('modeTabList').setAttribute('aria-selected', mode==='list');
  document.getElementById('modeTabTimetable').classList.toggle('active', mode==='timetable');
  document.getElementById('modeTabTimetable').setAttribute('aria-selected', mode==='timetable');
  generateWallpaper();
}

/* ── Theme picker ── */
function buildThemePicker(){
  const grid = document.getElementById('themePicker');
  grid.innerHTML = Object.keys(WP_THEMES).map(k => {
    const t = WP_THEMES[k];
    return `<div class="col">
      <button class="wp-swatch ${k===wpTheme?'selected':''}" data-theme-swatch="${k}"
        onclick="selectWpTheme('${k}')"
        aria-label="Theme: ${k}" aria-pressed="${k===wpTheme}"
        style="background:linear-gradient(135deg,${t.bg[0]},${t.bg[1]})"></button>
      <div class="wp-swatch-label">${k}</div>
    </div>`;
  }).join('');
}

function selectWpTheme(k){
  wpTheme = k;
  document.querySelectorAll('[data-theme-swatch]').forEach(el => {
    const active = el.dataset.themeSwatch === k;
    el.classList.toggle('selected', active);
    el.setAttribute('aria-pressed', active);
  });
  generateWallpaper();
}

/* ── Info toggles ── */
function buildToggles(){
  const labels = { name:'Student Name', semester:'Semester', room:'Room / Building', professor:'Professor' };
  document.getElementById('wpToggles').innerHTML = Object.entries(labels).map(([k,label])=>`
    <div class="form-check">
      <input class="form-check-input" type="checkbox" id="wpT_${k}"
        ${wpToggleState[k]?'checked':''} onchange="wpToggleState['${k}']=this.checked;generateWallpaper()">
      <label class="form-check-label" for="wpT_${k}">${label}</label>
    </div>`).join('');
}

/* ── Size ── */
function onSizeChange(){
  const val = document.getElementById('wpSize').value;
  document.getElementById('customSizeRow').classList.toggle('d-none', val!=='custom');
  generateWallpaper();
}

function getWpSize(){
  const sel = document.getElementById('wpSize').value;
  if(sel==='custom'){
    return [parseInt(document.getElementById('wpW').value)||1080, parseInt(document.getElementById('wpH').value)||2400];
  }
  return sel.split('x').map(Number);
}

/* ══════════════════════════════════════════
   MAIN GENERATE DISPATCHER
   ══════════════════════════════════════════ */
function generateWallpaper(){
  const [W,H] = getWpSize();
  const canvas = document.getElementById('wpCanvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const t = WP_THEMES[wpTheme];

  drawBackground(ctx, W, H, t);

  if(wpMode === 'list'){
    drawSubjectList(ctx, W, H, t);
  } else {
    drawTimetable(ctx, W, H, t);
  }
}

/* ══════════════════════════════════════════
   BACKGROUND
   ══════════════════════════════════════════ */
function drawBackground(ctx, W, H, t){
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, t.bg[0]);
  grad.addColorStop(1, t.bg[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  if(wpTheme==='neon'||wpTheme==='cyberpunk'){
    const step = Math.round(H/40);
    for(let y=0; y<H; y+=step){
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y);
      ctx.strokeStyle=t.line; ctx.lineWidth=1; ctx.globalAlpha=.12; ctx.stroke();
    }
    ctx.globalAlpha=1;
  }

  if(wpTheme==='glass'){
    const g1 = ctx.createRadialGradient(W*.2,H*.15,0,W*.2,H*.15,W*.65);
    g1.addColorStop(0,'rgba(167,139,250,.22)'); g1.addColorStop(1,'transparent');
    ctx.fillStyle=g1; ctx.fillRect(0,0,W,H);
    const g2 = ctx.createRadialGradient(W*.8,H*.7,0,W*.8,H*.7,W*.55);
    g2.addColorStop(0,'rgba(99,102,241,.18)'); g2.addColorStop(1,'transparent');
    ctx.fillStyle=g2; ctx.fillRect(0,0,W,H);
  }
}

/* ══════════════════════════════════════════
   SUBJECT LIST MODE
   ══════════════════════════════════════════ */
function drawSubjectList(ctx, W, H, t){
  const scale = W / 1080;
  const pad   = W * 0.08;          // equal left & right margin
  let y       = H * 0.22;          // 22% top space

  const settings = DB.getSettings();
  const sem      = DB.getSemester();

  /* Header */
  if(wpToggleState.name){
    ctx.fillStyle = t.sub;
    ctx.font = `500 ${30*scale}px 'Inter', sans-serif`;
    ctx.fillText((settings.name||'Student').toUpperCase(), pad, y);
    y += 44*scale;
  }
  ctx.fillStyle = t.text;
  ctx.font = `800 ${54*scale}px 'Plus Jakarta Sans', sans-serif`;
  ctx.fillText('MY SCHEDULE', pad, y + 6*scale);
  y += 68*scale;
  if(wpToggleState.semester){
    ctx.fillStyle = t.sub;
    ctx.font = `${26*scale}px 'Inter', sans-serif`;
    ctx.fillText(`${sem.name||''} · ${sem.schoolYear||''}`, pad, y);
    y += 46*scale;
  }

  /* Divider */
  y += 10*scale;
  ctx.strokeStyle = t.line; ctx.lineWidth = 1.5*scale;
  ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W-pad, y); ctx.stroke();
  y += 30*scale;

  /* All subjects, all days */
  const subjects  = getAllSubjects();
  const usedDays  = getAllDaysInUse(subjects);

  const dayBlocks = usedDays.map(d => ({
    day: d,
    items: subjects.filter(s=>s.days && s.days.includes(d)).sort((a,b)=>a.start.localeCompare(b.start))
  })).filter(b => b.items.length);

  if(!dayBlocks.length){
    drawEmptyState(ctx, W, H, t, scale, y);
    return;
  }

  /* Sizing — bigger rows */
  const reserveBottom = H * 0.04;
  const availH = H - y - reserveBottom;
  const totalClassRows = dayBlocks.reduce((s,b)=>s+b.items.length, 0);
  const totalDayHeaders = dayBlocks.length;

  // Day header is 0.45× of a class row weight
  const effectiveRows = totalClassRows + totalDayHeaders * 0.45;
  // Clamp row height: bigger minimum than before (was 52, now 70)
  const itemH      = Math.max(70*scale, Math.min(110*scale, availH / effectiveRows));
  const dayHeaderH = Math.round(itemH * 0.45);
  const gapH       = Math.round(6*scale);

  const accentW   = Math.round(6*scale);
  const accentR   = Math.round(3*scale);
  const timeFontSz = Math.max(20, Math.min(34, 28*scale));
  const timeColW   = Math.round(timeFontSz * 5.8);
  const infoX      = pad + accentW + 20*scale + timeColW + 16*scale;
  const codeFontSz = Math.max(20, Math.min(34, 30*scale));
  const metaFontSz = Math.max(15, Math.min(24, 21*scale));
  const dayFontSz  = Math.max(15, Math.min(26, 22*scale));

  ctx.textBaseline = 'middle';
  let overflowed = false;

  dayBlocks.forEach(block => {
    if(y > H - reserveBottom - dayHeaderH){ overflowed=true; return; }

    /* Day label */
    ctx.fillStyle = t.accent;
    ctx.font = `700 ${dayFontSz}px 'Plus Jakarta Sans', sans-serif`;
    ctx.fillText(WP_DAY_FULL[block.day].toUpperCase(), pad, y + dayHeaderH/2);
    y += dayHeaderH + 4*scale;

    block.items.forEach(s => {
      if(y > H - reserveBottom - itemH){ overflowed=true; return; }

      const color  = getSubjectColor(s);
      const rowH   = itemH - gapH;
      const midY   = y + rowH / 2;

      /* Accent border */
      ctx.fillStyle = color;
      roundRectFill(ctx, pad, y, accentW, rowH, accentR);

      /* Time: stacked start / end */
      const timeX = pad + accentW + 20*scale;
      ctx.fillStyle = t.text;
      ctx.font = `600 ${timeFontSz}px 'JetBrains Mono', monospace`;
      ctx.fillText(fmtTime(s.start), timeX, midY - timeFontSz*0.65);
      ctx.fillStyle = t.sub;
      ctx.font = `500 ${timeFontSz}px 'JetBrains Mono', monospace`;
      ctx.fillText(fmtTime(s.end),   timeX, midY + timeFontSz*0.75);

      /* Course code — right margin equals left pad */
      const maxInfoW = W - infoX - pad;
      ctx.fillStyle = t.text;
      ctx.font = `700 ${codeFontSz}px 'Plus Jakarta Sans', sans-serif`;
      ctx.fillText(truncateText(ctx, s.code||'', maxInfoW), infoX, midY - codeFontSz*0.6);

      /* Room · Professor */
      const meta = [];
      if(wpToggleState.room){
        const loc = [s.room, s.building].filter(Boolean).join(' ');
        if(s.online) meta.push('Online');
        else if(loc) meta.push(loc);
      }
      if(wpToggleState.professor && s.professor) meta.push(s.professor);
      if(meta.length){
        ctx.fillStyle = t.sub;
        ctx.font = `500 ${metaFontSz}px 'Inter', sans-serif`;
        ctx.fillText(truncateText(ctx, meta.join(' · '), maxInfoW), infoX, midY + metaFontSz*0.85);
      }

      y += itemH;
    });

    y += 6*scale; // gap between day groups
  });

  if(overflowed){
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = t.sub;
    ctx.font = `${Math.round(14*scale)}px 'Inter', sans-serif`;
    ctx.fillText('↓ more classes below — try a larger canvas size', pad, H - 22*scale);
  }

  ctx.textBaseline = 'alphabetic';
}

/* ══════════════════════════════════════════
   TIMETABLE MODE — no clock, just the grid
   ══════════════════════════════════════════ */
function drawTimetable(ctx, W, H, t){
  const scale   = W / 1080;
  const pad     = W * 0.08;       // equal left & right margin
  const gridTop = H * 0.22;       // 22% top space

  /* All subjects — use Mon–Fri always as columns, add Sat/Sun if needed */
  const subjects   = getAllSubjects();
  const usedByData = getAllDaysInUse(subjects);

  // Always show Mon–Fri; append Sat/Sun only if subjects use them
  const WEEKDAYS = ['Mon','Tue','Wed','Thu','Fri'];
  const extras   = ['Sat','Sun'].filter(d => usedByData.includes(d));
  const days     = [...WEEKDAYS, ...extras];

  if(!subjects.length){
    drawEmptyState(ctx, W, H, t, scale, gridTop + 20*scale);
    ctx.textBaseline = 'alphabetic';
    return;
  }

  /* Time range from actual data */
  const allTimes = subjects.flatMap(s =>
    (s.days||[]).filter(d=>days.includes(d)).length ? [s.start, s.end] : []
  );
  const minHour = allTimes.length
    ? Math.max(6,  Math.floor(Math.min(...allTimes.map(timeToMins))/60))
    : 8;
  const maxHour = allTimes.length
    ? Math.min(22, Math.ceil( Math.max(...allTimes.map(timeToMins))/60))
    : 18;

  /* Layout */
  const timeColW = Math.round(68*scale);
  const gridLeft = pad + timeColW;
  const gridW    = W - gridLeft - pad;
  const dayColW  = gridW / days.length;
  const headerH  = Math.round(36*scale);
  const gridH    = H - gridTop - headerH - H*0.03;
  const hourH    = gridH / (maxHour - minHour);

  const dayFontSz = Math.max(12, Math.min(20, 16*scale));
  const timeLblSz = Math.max(10, Math.min(18, 14*scale));
  const codeSz    = Math.max(10, Math.min(18, 14*scale));
  const metaSz    = Math.max(9,  Math.min(15, 12*scale));

  ctx.textBaseline = 'middle';

  /* Day header background strip */
  ctx.fillStyle = hexToRgba(t.accent || '#7C6CF6', .08);
  ctx.fillRect(gridLeft, gridTop, gridW, headerH);

  /* Day header labels */
  ctx.fillStyle = t.sub;
  ctx.font = `700 ${dayFontSz}px 'Plus Jakarta Sans', sans-serif`;
  days.forEach((d, i) => {
    const lbl = d.toUpperCase();
    const cx  = gridLeft + i * dayColW + dayColW / 2;
    ctx.fillText(lbl, cx - ctx.measureText(lbl).width / 2, gridTop + headerH / 2);
  });

  /* Header bottom border */
  ctx.strokeStyle = t.line; ctx.lineWidth = 1.5 * scale;
  ctx.beginPath();
  ctx.moveTo(gridLeft, gridTop + headerH);
  ctx.lineTo(W - pad,  gridTop + headerH);
  ctx.stroke();

  /* Vertical column separators */
  ctx.lineWidth = scale;
  days.forEach((_, i) => {
    const lx = gridLeft + i * dayColW;
    ctx.strokeStyle = t.line;
    ctx.beginPath();
    ctx.moveTo(lx, gridTop + headerH);
    ctx.lineTo(lx, gridTop + headerH + gridH);
    ctx.stroke();
  });
  ctx.beginPath();
  ctx.moveTo(W - pad, gridTop + headerH);
  ctx.lineTo(W - pad, gridTop + headerH + gridH);
  ctx.stroke();

  const rowTop = gridTop + headerH;

  /* Hour grid lines + time labels */
  for(let h = minHour; h <= maxHour; h++){
    const ly = rowTop + (h - minHour) * hourH;
    if(ly > H - H * 0.02) break;

    ctx.strokeStyle = t.line; ctx.lineWidth = scale;
    ctx.beginPath(); ctx.moveTo(gridLeft, ly); ctx.lineTo(W - pad, ly); ctx.stroke();

    ctx.fillStyle = t.sub;
    ctx.font = `500 ${timeLblSz}px 'JetBrains Mono', monospace`;
    const lbl  = h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h-12} PM`;
    const lblW = ctx.measureText(lbl).width;
    ctx.fillText(lbl, pad + timeColW - lblW - 8*scale, ly);
  }

  /* Subject blocks */
  subjects.forEach(s => {
    const sMin   = timeToMins(s.start);
    const eMin   = timeToMins(s.end);
    const blockH = ((eMin - sMin) / 60) * hourH;
    const color  = getSubjectColor(s);

    (s.days || []).filter(d => days.includes(d)).forEach(d => {
      const col = days.indexOf(d);
      const bx  = gridLeft + col * dayColW + 2 * scale;
      const by  = rowTop + (sMin / 60 - minHour) * hourH;
      const bw  = dayColW - 4 * scale;
      const bh  = Math.max(blockH - 2 * scale, 10 * scale);

      ctx.fillStyle = hexToRgba(color, .22);
      roundRectFill(ctx, bx, by, bw, bh, 5*scale);

      ctx.fillStyle = color;
      roundRectFill(ctx, bx, by, 3*scale, bh, 3*scale);

      ctx.strokeStyle = hexToRgba(color, .5);
      ctx.lineWidth = scale;
      roundRectStroke(ctx, bx, by, bw, bh, 5*scale);

      if(bh > 18*scale){
        ctx.fillStyle = t.text;
        ctx.font = `700 ${codeSz}px 'Plus Jakarta Sans', sans-serif`;
        ctx.fillText(truncateText(ctx, s.code||'', bw - 10*scale), bx + 6*scale, by + 13*scale);
      }
      if(bh > 32*scale){
        ctx.fillStyle = t.sub;
        ctx.font = `500 ${metaSz}px 'Inter', sans-serif`;
        const line2 = s.type || (s.online ? 'Online' : s.room) || '';
        if(line2) ctx.fillText(truncateText(ctx, line2, bw - 10*scale), bx + 6*scale, by + 13*scale + metaSz * 1.4);
      }
    });
  });

  ctx.textBaseline = 'alphabetic';
}

/* ══════════════════════════════════════════
   EMPTY STATE
   ══════════════════════════════════════════ */
function drawEmptyState(ctx, W, H, t, scale, y){
  ctx.textBaseline = 'top';
  ctx.fillStyle = t.sub;
  ctx.font = `600 ${22*scale}px 'Plus Jakarta Sans', sans-serif`;
  const msg = 'No classes found';
  ctx.fillText(msg, (W - ctx.measureText(msg).width)/2, y + 20*scale);
  ctx.font = `${17*scale}px 'Inter', sans-serif`;
  const sub = 'Add subjects in Schedule to build your wallpaper.';
  ctx.fillText(sub, (W - ctx.measureText(sub).width)/2, y + 52*scale);
  ctx.textBaseline = 'alphabetic';
}

/* ══════════════════════════════════════════
   CANVAS HELPERS
   ══════════════════════════════════════════ */
function timeToMins(t){
  if(!t) return 0;
  const [h,m] = t.split(':').map(Number);
  return h*60 + (m||0);
}
function hexToRgba(hex, alpha){
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}
function roundRectFill(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  ctx.fill();
}
function roundRectStroke(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  ctx.stroke();
}
function truncateText(ctx, text, maxW){
  if(ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while(ctx.measureText(t+'…').width > maxW && t.length) t = t.slice(0,-1);
  return t + '…';
}

/* ══════════════════════════════════════════
   DOWNLOAD
   ══════════════════════════════════════════ */
function downloadWallpaper(format){
  const canvas = document.getElementById('wpCanvas');
  const link   = document.createElement('a');
  link.download = `wallpaper-${wpTheme}-${wpMode}.${format==='jpeg'?'jpg':'png'}`;
  link.href     = canvas.toDataURL(format==='jpeg'?'image/jpeg':'image/png', 0.96);
  link.click();
  Toast.show('Wallpaper downloaded');
}
