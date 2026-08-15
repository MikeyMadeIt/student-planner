/* ============================================================
   APP.JS — shared shell: nav, theming, clock, toasts, confetti
   ============================================================ */

/* ============================================================
   CENTRALIZED UTILITIES
   ============================================================ */

/**
 * Escape user-controlled text before inserting into HTML.
 * Single authoritative implementation — use everywhere.
 */
function escHtml(s){
  const d = document.createElement('div');
  d.textContent = (s == null) ? '' : String(s);
  return d.innerHTML;
}
/* Aliases used across different JS files */
window.escapeHtml = escHtml;
window.escHtml = escHtml;

/**
 * Format "14:30" -> "2:30 PM"
 */
function fmtTime(t){
  if(!t) return '';
  const [h,m] = t.split(':').map(Number);
  const ap = h>=12?'PM':'AM';
  const hh = h%12===0?12:h%12;
  return `${hh}:${String(m).padStart(2,'0')} ${ap}`;
}

function minutesUntil(dateStr, timeStr){
  const target = new Date(`${dateStr}T${timeStr}:00`);
  return Math.round((target - new Date())/60000);
}
function fmtDuration(mins){
  if(mins < 0) return 'Overdue';
  if(mins < 60) return `${mins}m`;
  const h = Math.floor(mins/60), m = mins%60;
  if(h < 24) return `${h}h ${m}m`;
  const d = Math.floor(h/24);
  return `${d}d ${h%24}h`;
}
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function todayKey(){ return ymdLocal(new Date()); }

function debounce(fn, wait=250){
  let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), wait); };
}

/* ============================================================
   NAV
   ============================================================ */

const NAV_ITEMS = [
  { href:'index.html',      icon:'bi-grid-1x2-fill',        label:'Dashboard',  key:'dashboard'  },
  { href:'schedule.html',   icon:'bi-calendar2-week-fill',  label:'Schedule',   key:'schedule'   },
  { href:'tasks.html',      icon:'bi-check2-square',        label:'Tasks',      key:'tasks'      },
  { href:'calendar.html',   icon:'bi-calendar3',            label:'Calendar',   key:'calendar'   },
  { href:'grades.html',     icon:'bi-mortarboard-fill',     label:'Grades',     key:'grades'     },
  { href:'attendance.html', icon:'bi-person-check-fill',    label:'Attendance', key:'attendance' },
  { href:'syllabus.html',   icon:'bi-journal-bookmark-fill',label:'Syllabus',   key:'syllabus'   },
  { href:'notes.html',      icon:'bi-journal-text',         label:'Notes',      key:'notes'      },
  { href:'university.html', icon:'bi-building-fill',        label:'University', key:'university' },
  { href:'curriculum.html', icon:'bi-book-half',            label:'Curriculum', key:'curriculum' },
  { href:'wallpaper.html',  icon:'bi-phone-fill',           label:'Wallpaper',  key:'wallpaper'  },
  { href:'settings.html',   icon:'bi-gear-fill',            label:'Settings',   key:'settings'   },
];
const MOBILE_NAV_KEYS = ['dashboard','schedule','tasks','calendar'];

function renderShell(activeKey){
  // sidebar
  const sidebar = document.getElementById('sidebar');
  if(sidebar){
    const sidebarGroups = [
      { label: null,         keys: ['dashboard'] },
      { label: 'Academics',  keys: ['schedule','tasks','calendar','grades','attendance','syllabus','notes'] },
      { label: 'University', keys: ['university','curriculum'] },
      { label: 'App',        keys: ['wallpaper','settings'] },
    ];
    const itemMap = Object.fromEntries(NAV_ITEMS.map(n=>[n.key,n]));
    let sidebarHtml = `<div class="brand" role="banner"><span class="dot"><i class="bi bi-mortarboard" aria-hidden="true"></i></span> Planner</div><nav class="d-flex flex-column gap-0 flex-grow-1" aria-label="Main navigation">`;
    sidebarGroups.forEach(g => {
      if(g.label) sidebarHtml += `<div class="nav-group-label" role="heading" aria-level="2">${g.label}</div>`;
      g.keys.forEach(k => {
        const n = itemMap[k]; if(!n) return;
        const isActive = n.key===activeKey;
        sidebarHtml += `<a class="nav-link ${isActive?'active':''}" href="${n.href}" ${isActive?'aria-current="page"':''}><i class="bi ${n.icon}" aria-hidden="true"></i>${n.label}</a>`;
      });
    });
    const _sem = DB.getActiveSemester();
    const _semLabel = _sem ? `${_sem.schoolYear} &bull; ${_sem.name}` : '';
    sidebarHtml += `</nav><div class="sidebar-sep">
      <a class="nav-link" href="#" onclick="openQuickAdd('task');return false;"><i class="bi bi-plus-circle" aria-hidden="true"></i>Add Task</a>
      <a class="nav-link" href="#" onclick="Toast.confirmExport();return false;"><i class="bi bi-download" aria-hidden="true"></i>Export</a>
    </div>${_semLabel ? `<div class="sem-banner-nav"><i class="bi bi-calendar3 me-1" aria-hidden="true"></i>${_semLabel}</div>` : ''}`;
    sidebar.innerHTML = sidebarHtml;
  }
  // mobile bottom nav
  const mnav = document.getElementById('mobileNav');
  if(mnav){
    const isMore = !MOBILE_NAV_KEYS.includes(activeKey);
    mnav.setAttribute('aria-label', 'Mobile navigation');
    mnav.innerHTML = `<div class="row text-center g-0" role="tablist">
      ${NAV_ITEMS.filter(n=>MOBILE_NAV_KEYS.includes(n.key)).map(n=>`
        <div class="col" role="tab"><a class="${n.key===activeKey?'active':''}" href="${n.href}" ${n.key===activeKey?'aria-current="page"':''}><i class="bi ${n.icon}" aria-hidden="true"></i><span>${n.label}</span></a></div>
      `).join('')}
      <div class="col" role="tab"><a href="#" class="${isMore?'active':''}" onclick="openMoreMenu();return false;" aria-label="More pages" aria-expanded="false"><i class="bi bi-three-dots" aria-hidden="true"></i><span>More</span></a></div>
    </div>`;
  }
  ensureMoreMenu(activeKey);
  // Semester banner
  setTimeout(()=>{
    if(document.getElementById('semBanner')) return;
    const activeSem = DB.getActiveSemester();
    if(!activeSem) return;
    const banner = document.createElement('div');
    banner.id = 'semBanner';
    banner.setAttribute('aria-label', `Active semester: ${activeSem.schoolYear} ${activeSem.name}`);
    banner.innerHTML = `<i class="bi bi-calendar3" aria-hidden="true"></i><span>${activeSem.schoolYear} &bull; ${activeSem.name}</span>`;
    document.body.appendChild(banner);
  }, 0);
}

/* ---------- MOBILE "MORE" MENU ---------- */
function ensureMoreMenu(activeKey){
  if(document.getElementById('moreMenuModal')) { document.getElementById('moreMenuModal').remove(); }
  const groups = [
    { label: 'Main',       keys: ['dashboard','schedule','tasks','calendar'] },
    { label: 'Academics',  keys: ['grades','attendance','syllabus','notes'] },
    { label: 'University', keys: ['university','curriculum'] },
    { label: 'More',       keys: ['wallpaper','settings'] },
  ];
  const itemMap = Object.fromEntries(NAV_ITEMS.map(n => [n.key, n]));

  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="modal fade" id="moreMenuModal" tabindex="-1" aria-label="All pages" aria-modal="true" role="dialog">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content more-menu-content">
        <div class="more-menu-header">
          <span><i class="bi bi-grid-3x3-gap-fill me-2" aria-hidden="true"></i>All Pages</span>
          <button class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="more-menu-body">
          ${groups.map(g => `
            <div class="more-menu-group-label">${g.label}</div>
            <div class="more-menu-grid">
              ${g.keys.map(k => {
                const n = itemMap[k]; if(!n) return '';
                const isActive = n.key === activeKey;
                return `<a href="${n.href}" class="more-menu-item more-menu-link${isActive?' more-menu-item-active':''}" ${isActive?'aria-current="page"':''}>
                  <i class="bi ${n.icon}" aria-hidden="true"></i>
                  <span>${n.label}</span>
                </a>`;
              }).join('')}
            </div>`).join('')}
        </div>
      </div>
    </div>
  </div>`;
  document.body.appendChild(wrap.firstElementChild);
}
function openMoreMenu(){
  const modalEl = document.getElementById('moreMenuModal');
  if(modalEl) new bootstrap.Modal(modalEl).show();
}

/* ---------- THEME ---------- */
function applyTheme(){
  const s = DB.getSettings();
  document.documentElement.setAttribute('data-theme', s.theme || 'dark');
  document.documentElement.setAttribute('data-accent', s.accent || 'violet');
}
function setTheme(theme){
  const s = DB.getSettings(); s.theme = theme; DB.saveSettings(s); applyTheme();
}
function setAccent(accent){
  const s = DB.getSettings(); s.accent = accent; DB.saveSettings(s); applyTheme();
}

/* ---------- CLOCK + GREETING ---------- */
function greetingText(){
  const h = new Date().getHours();
  if(h < 5) return 'Burning the midnight oil';
  if(h < 12) return 'Good morning';
  if(h < 17) return 'Good afternoon';
  if(h < 21) return 'Good evening';
  return 'Working late';
}
function startClock(clockEl, dateEl, greetEl){
  function tick(){
    const now = new Date();
    if(clockEl) clockEl.textContent = now.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'});
    if(dateEl) dateEl.textContent = now.toLocaleDateString([], {weekday:'long', year:'numeric', month:'long', day:'numeric'});
    if(greetEl){
      const s = DB.getSettings();
      const name = s.name ? s.name.split(' ')[0] : 'there';
      greetEl.textContent = `${greetingText()}, ${name}`;
    }
  }
  tick(); setInterval(tick, 1000);
}

/* ---------- TOASTS ---------- */
const Toast = {
  container(){
    let c = document.getElementById('toastStack');
    if(!c){
      c = document.createElement('div');
      c.id = 'toastStack';
      c.className = 'toast-container position-fixed bottom-0 end-0 p-3';
      c.setAttribute('aria-live', 'polite');
      c.setAttribute('aria-atomic', 'false');
      document.body.appendChild(c);
    }
    return c;
  },
  show(msg, type='accent', icon='bi-check-circle-fill'){
    const c = this.container();
    const el = document.createElement('div');
    el.className = 'glass glass-tight card-pad fade-in mb-2 d-flex align-items-center gap-2';
    el.style.minWidth = '240px';
    el.setAttribute('role', 'status');
    el.innerHTML = `<i class="bi ${icon} toast-item-icon" aria-hidden="true"></i><span class="toast-item-msg">${escHtml(msg)}</span>`;
    c.appendChild(el);
    setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateY(6px)'; setTimeout(()=>el.remove(), 300); }, 2600);
  },
  confirmExport(){ window.exportData ? window.exportData() : this.show('Open Settings to export data','accent','bi-download'); }
};

/* ---------- CONFETTI ---------- */
function fireConfetti(){
  const colors = ['#7C6CF6','#4F8CFF','#34D399','#FB7185','#FBBF24'];
  for(let i=0;i<40;i++){
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.setAttribute('aria-hidden', 'true');
    p.style.left = Math.random()*100+'vw';
    p.style.background = colors[Math.floor(Math.random()*colors.length)];
    p.style.transform = `rotate(${Math.random()*360}deg)`;
    document.body.appendChild(p);
    const duration = 1800 + Math.random()*1200;
    p.animate([
      { transform:`translateY(0) rotate(0deg)`, opacity:1 },
      { transform:`translateY(${window.innerHeight+40}px) rotate(${360+Math.random()*360}deg)`, opacity:0.9 }
    ], { duration, easing:'cubic-bezier(.22,.8,.4,1)' });
    setTimeout(()=>p.remove(), duration);
  }
}

/* ---------- CONFIRM ACTION MODAL ---------- */
function ensureConfirmModal(){
  if(document.getElementById('confirmActionModal')) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="modal fade" id="confirmActionModal" tabindex="-1" aria-modal="true" role="alertdialog" aria-labelledby="confirmTitle" aria-describedby="confirmMessage">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content card-pad text-center">
        <div class="confirm-icon-wrap" id="confirmIconWrap">
          <i id="confirmIcon" class="confirm-icon" aria-hidden="true"></i>
        </div>
        <h5 id="confirmTitle" class="mb-1">Are you sure?</h5>
        <p class="text-soft mb-0 confirm-message" id="confirmMessage"></p>
        <div class="d-flex gap-2 mt-3">
          <button class="btn btn-ghost flex-grow-1" data-bs-dismiss="modal">Cancel</button>
          <button class="btn flex-grow-1 confirm-action-btn" id="confirmActionBtn">Confirm</button>
        </div>
      </div>
    </div>
  </div>`;
  document.body.appendChild(wrap.firstElementChild);

  // Close on Escape
  document.getElementById('confirmActionModal').addEventListener('keydown', (e)=>{
    if(e.key === 'Escape'){
      const inst = bootstrap.Modal.getInstance(document.getElementById('confirmActionModal'));
      if(inst) inst.hide();
    }
  });
}

function confirmAction(opts){
  const { title='Are you sure?', message='This action cannot be undone.', confirmLabel='Delete', danger=true, icon, onConfirm } = opts;
  ensureConfirmModal();
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  const iconWrap = document.getElementById('confirmIconWrap');
  const iconEl = document.getElementById('confirmIcon');
  iconWrap.style.background = danger ? 'rgba(251,113,133,.15)' : 'rgba(var(--accent),.15)';
  iconEl.style.color = danger ? '#fb7185' : 'rgb(var(--accent))';
  iconEl.className = 'bi ' + (icon || (danger ? 'bi-exclamation-triangle-fill' : 'bi-question-circle-fill'));
  const btn = document.getElementById('confirmActionBtn');
  btn.textContent = confirmLabel;
  btn.style.background = danger ? '#fb7185' : 'linear-gradient(135deg, rgb(var(--accent)), rgb(var(--accent-2)))';
  const freshBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(freshBtn, btn);
  freshBtn.addEventListener('click', ()=>{
    bootstrap.Modal.getInstance(document.getElementById('confirmActionModal')).hide();
    if(onConfirm) onConfirm();
  });
  new bootstrap.Modal(document.getElementById('confirmActionModal')).show();
}

function openQuickAdd(type){
  if(window.quickAddHandlers && window.quickAddHandlers[type]) window.quickAddHandlers[type]();
  else window.location.href = type==='task' ? 'tasks.html?new=1' : 'index.html';
}

/* ---------- INIT ON EVERY PAGE ---------- */
document.addEventListener('DOMContentLoaded', ()=>{
  applyTheme();
  registerSW();
  setupInstallPrompt();
});

/* ---------- PWA ---------- */
function registerSW(){
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('service-worker.js').catch(()=>{});
  }
}
let deferredInstallPrompt = null;
function setupInstallPrompt(){
  window.addEventListener('beforeinstallprompt', (e)=>{
    e.preventDefault();
    deferredInstallPrompt = e;
    let fab = document.getElementById('installFab');
    if(!fab){
      fab = document.createElement('button');
      fab.id = 'installFab';
      fab.className = 'install-fab';
      fab.setAttribute('aria-label', 'Install app');
      fab.innerHTML = '<i class="bi bi-download" aria-hidden="true"></i> Install App';
      fab.onclick = async ()=>{
        fab.style.display='none';
        if(deferredInstallPrompt){ deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt=null; }
      };
      document.body.appendChild(fab);
    }
    fab.style.display='flex';
  });
  window.addEventListener('appinstalled', ()=>{ const fab=document.getElementById('installFab'); if(fab) fab.remove(); Toast.show('App installed'); });
}
