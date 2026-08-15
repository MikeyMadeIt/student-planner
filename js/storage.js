/* ============================================================
   STORAGE.JS — localStorage data layer (Multi-Semester Edition)
   ============================================================ */

function ymdLocal(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

const DB_KEYS = {
  subjects: 'sp_subjects',
  tasks: 'sp_tasks',
  notes: 'sp_notes',
  attendance: 'sp_attendance',
  grades: 'sp_grades',
  gwaCalc: 'sp_gwa_calc',
  settings: 'sp_settings',
  semester: 'sp_semester',         // legacy single-semester (kept for migration)
  pomodoro: 'sp_pomodoro_stats',
  universityEvents: 'sp_university_events',
  calendarEvents: 'sp_calendar_events',
  syllabusCourses: 'sp_syllabus_courses',
  semesters: 'sp_semesters',       // array of semester objects
  activeSemesterId: 'sp_active_semester_id',
};

/* ============================================================
   CURRENT EXPORT SCHEMA VERSION
   Bump when data shape changes incompatibly.
   ============================================================ */
const EXPORT_SCHEMA_VERSION = 1;

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function readKey(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  }catch(e){ console.warn('DB read failed', key, e); return fallback; }
}
function writeKey(key, value){
  try{ localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch(e){ console.warn('DB write failed', key, e); return false; }
}

const DEFAULT_SETTINGS = {
  name:'Student', studentNumber:'', course:'', yearLevel:'', section:'', school:'',
  theme:'dark', accent:'violet',
  notifications:{ upcomingClass:true, assignmentDue:true, examReminder:true, pomodoroFinished:true, dailyReview:false },
};

const SUBJECT_COLORS = ['#7C6CF6','#4F8CFF','#34D399','#FB7185','#FBBF24','#F472B6','#22D3EE','#A78BFA'];

/* ============================================================
   SEMESTER HELPERS
   ============================================================ */

function makeSemesterId(schoolYear, semName){
  const num = semName.toLowerCase().includes('2nd') ? '2' : '1';
  return `${schoolYear}-${num}`;
}

function makeSemesterObject(schoolYear, semName, extra){
  const id = makeSemesterId(schoolYear, semName);
  return {
    id,
    name: semName,
    schoolYear,
    startDate: extra && extra.startDate ? extra.startDate : ymdLocal(new Date()),
    endDate: extra && extra.endDate ? extra.endDate : ymdLocal(new Date(Date.now()+ 1000*60*60*24*105)),
    finalsDate: extra && extra.finalsDate ? extra.finalsDate : ymdLocal(new Date(Date.now()+ 1000*60*60*24*100)),
    totalWeeks: extra && extra.totalWeeks ? extra.totalWeeks : 15,
  };
}

/* ============================================================
   DATA MIGRATION — run once safely
   ============================================================ */
function migrateLegacyData(){
  if(localStorage.getItem('sp_semester_migrated')) return;

  const legacySem = readKey(DB_KEYS.semester, null);
  let semesters = readKey(DB_KEYS.semesters, []);

  // If no semester list yet, build from legacy or create default
  if(!semesters.length){
    const schoolYear = (legacySem && legacySem.schoolYear) ? legacySem.schoolYear : '2026-2027';
    const semName = (legacySem && legacySem.name) ? legacySem.name : '1st Semester';
    const sem = makeSemesterObject(schoolYear, semName, legacySem);
    semesters = [sem];
    writeKey(DB_KEYS.semesters, semesters);
  }

  const activeSemId = semesters[0].id;
  if(!localStorage.getItem(DB_KEYS.activeSemesterId)){
    writeKey(DB_KEYS.activeSemesterId, activeSemId);
  }

  // Migrate subjects — add semesterId if missing
  const subjects = readKey(DB_KEYS.subjects, []);
  let subjectsChanged = false;
  subjects.forEach(s => {
    if(!s.semesterId){
      const match = semesters.find(sem => sem.name === s.semester && sem.schoolYear === s.schoolYear);
      s.semesterId = match ? match.id : activeSemId;
      subjectsChanged = true;
    }
  });
  if(subjectsChanged) writeKey(DB_KEYS.subjects, subjects);

  // Migrate attendance
  const attendance = readKey(DB_KEYS.attendance, []);
  let attChanged = false;
  attendance.forEach(r => {
    if(!r.semesterId){
      const sub = subjects.find(s => s.id === r.subjectId);
      r.semesterId = sub ? sub.semesterId : activeSemId;
      attChanged = true;
    }
  });
  if(attChanged) writeKey(DB_KEYS.attendance, attendance);

  // Migrate grades
  const grades = readKey(DB_KEYS.grades, []);
  let gradesChanged = false;
  grades.forEach(g => {
    if(!g.semesterId){
      const sub = subjects.find(s => s.id === g.subjectId);
      g.semesterId = sub ? sub.semesterId : activeSemId;
      gradesChanged = true;
    }
  });
  if(gradesChanged) writeKey(DB_KEYS.grades, grades);

  // Migrate tasks
  const tasks = readKey(DB_KEYS.tasks, []);
  let tasksChanged = false;
  tasks.forEach(t => {
    if(!t.semesterId){
      const sub = t.subjectId ? subjects.find(s => s.id === t.subjectId) : null;
      t.semesterId = sub ? sub.semesterId : activeSemId;
      tasksChanged = true;
    }
  });
  if(tasksChanged) writeKey(DB_KEYS.tasks, tasks);

  // Migrate notes
  const notes = readKey(DB_KEYS.notes, []);
  let notesChanged = false;
  notes.forEach(n => {
    if(!n.semesterId){
      n.semesterId = activeSemId;
      notesChanged = true;
    }
  });
  if(notesChanged) writeKey(DB_KEYS.notes, notes);

  // Migrate syllabus courses
  const courses = readKey(DB_KEYS.syllabusCourses, []);
  let coursesChanged = false;
  courses.forEach(c => {
    if(!c.semesterId){
      const match = semesters.find(sem => sem.name === c.semester && sem.schoolYear === c.academicYear);
      c.semesterId = match ? match.id : activeSemId;
      coursesChanged = true;
    }
  });
  if(coursesChanged) writeKey(DB_KEYS.syllabusCourses, courses);

  localStorage.setItem('sp_semester_migrated', '1');
}

/* ============================================================
   SEED (development/demo only — NOT called on normal first launch)
   ============================================================ */
function seedDemoData(){
  const defaultSem = makeSemesterObject('2026-2027', '1st Semester', {
    startDate: ymdLocal(new Date()),
    endDate: ymdLocal(new Date(Date.now()+ 1000*60*60*24*105)),
    finalsDate: ymdLocal(new Date(Date.now()+ 1000*60*60*24*100)),
    totalWeeks: 15,
  });
  const semesterId = defaultSem.id;

  writeKey(DB_KEYS.semesters, [defaultSem]);
  writeKey(DB_KEYS.activeSemesterId, semesterId);

  const subjects = [
    { id: uid(), code:'CS101', desc:'Introduction to Computing', type:'Lecture', units:3, section:'BSCS-1A',
      days:['Mon','Wed'], start:'08:00', end:'09:30', room:'204', building:'IT Building',
      professor:'Dr. A. Reyes', email:'reyes@school.edu', color:SUBJECT_COLORS[0], notes:'Bring laptop',
      semester:'1st Semester', schoolYear:'2026-2027', semesterId, archived:false },
    { id: uid(), code:'MATH104', desc:'Calculus II', type:'Lecture', units:4, section:'BSCS-1A',
      days:['Tue','Thu'], start:'10:00', end:'11:30', room:'110', building:'Main Hall',
      professor:'Prof. L. Santos', email:'santos@school.edu', color:SUBJECT_COLORS[1], notes:'',
      semester:'1st Semester', schoolYear:'2026-2027', semesterId, archived:false },
    { id: uid(), code:'ENG102', desc:'Communication Arts', type:'Lecture', units:3, section:'BSCS-1A',
      days:['Mon','Wed','Fri'], start:'13:00', end:'14:00', room:'302', building:'Liberal Arts',
      professor:'Ms. K. Cruz', email:'cruz@school.edu', color:SUBJECT_COLORS[2], notes:'',
      semester:'1st Semester', schoolYear:'2026-2027', semesterId, archived:false },
    { id: uid(), code:'CS102L', desc:'Programming Laboratory', type:'Laboratory', units:1, section:'BSCS-1A',
      days:['Fri'], start:'15:00', end:'18:00', room:'Lab 2', building:'IT Building',
      professor:'Dr. A. Reyes', email:'reyes@school.edu', color:SUBJECT_COLORS[3], notes:'Weekly submission',
      semester:'1st Semester', schoolYear:'2026-2027', semesterId, archived:false },
  ];
  writeKey(DB_KEYS.subjects, subjects);

  const today = new Date();
  const inDays = (n)=>{ const d=new Date(today); d.setDate(d.getDate()+n); return ymdLocal(d); };

  const tasks = [
    { id: uid(), title:'Problem Set 3', description:'Derivatives and limits, items 1-20', subjectId:subjects[1].id, semesterId,
      priority:'high', category:'Homework', dueDate:inDays(1), dueTime:'23:59', status:'in-progress', progress:40,
      reminder:true, checklist:[{text:'Read chapter 4', done:true},{text:'Solve items 1-10', done:true},{text:'Solve items 11-20', done:false}],
      repeat:'none', score:null, remarks:'', createdAt:Date.now() },
    { id: uid(), title:'System Analysis Report', description:'Group report on requirements gathering', subjectId:subjects[0].id, semesterId,
      priority:'medium', category:'Project', dueDate:inDays(4), dueTime:'17:00', status:'not-started', progress:10,
      reminder:true, checklist:[], repeat:'none', score:null, remarks:'', createdAt:Date.now() },
    { id: uid(), title:'Quiz 2 - Grammar', description:'Coverage: parts of speech, sentence structure', subjectId:subjects[2].id, semesterId,
      priority:'medium', category:'Quiz', dueDate:inDays(2), dueTime:'13:00', status:'not-started', progress:0,
      reminder:true, checklist:[], repeat:'none', score:null, remarks:'', createdAt:Date.now() },
    { id: uid(), title:'Midterm Examination', description:'Coverage: chapters 1-5, comprehensive', subjectId:subjects[0].id, semesterId,
      priority:'high', category:'Exam', dueDate:inDays(9), dueTime:'08:00', status:'not-started', progress:0,
      reminder:true, checklist:[], repeat:'none', score:null, remarks:'', createdAt:Date.now() },
    { id: uid(), title:'Clean my room', description:'', subjectId:null, semesterId,
      priority:'low', category:'Personal', dueDate:inDays(0), dueTime:'20:00', status:'completed', progress:100,
      reminder:false, checklist:[], repeat:'none', score:null, remarks:'', createdAt:Date.now() },
  ];
  writeKey(DB_KEYS.tasks, tasks);

  const notes = [
    { id: uid(), title:'Welcome to your planner 👋', content:'This is your notes space. You can **bold**, make lists, add `code`, and organize by category.\n\n- Pin important notes\n- Star your favorites\n- Search anytime', category:'Organization', pinned:true, favorite:true, checklist:[], semesterId, createdAt:Date.now(), updatedAt:Date.now() },
  ];
  writeKey(DB_KEYS.notes, notes);

  writeKey(DB_KEYS.attendance, []);

  const grades = subjects.map((s,i)=>({
    subjectId:s.id, semesterId,
    components: i===0 ? [
      { id: uid(), name:'Quizzes', weight:20, score:88 },
      { id: uid(), name:'Activities', weight:20, score:92 },
      { id: uid(), name:'Midterm Exam', weight:25, score:85 },
      { id: uid(), name:'Final Exam', weight:35, score:null },
    ] : [],
  }));
  writeKey(DB_KEYS.grades, grades);
  writeKey(DB_KEYS.gwaCalc, []);

  writeKey(DB_KEYS.settings, DEFAULT_SETTINGS);
  writeKey(DB_KEYS.semester, { name:'1st Semester', schoolYear:'2026-2027', startDate:ymdLocal(new Date()), endDate:ymdLocal(new Date(Date.now()+ 1000*60*60*24*105)), finalsDate:ymdLocal(new Date(Date.now()+ 1000*60*60*24*100)), totalWeeks:15 });
  writeKey(DB_KEYS.pomodoro, { sessionsToday:0, totalFocusMinutes:0, lastDate:new Date().toDateString(), history:[] });
  writeKey(DB_KEYS.universityEvents, []);

  const syllabusCourses = [
    { id: uid(), courseTitle:'Introduction to Computing', courseCode:'CS101', creditUnits:3, semesterId,
      courseDescription:'Foundational concepts of computing, problem-solving, and computer systems for beginning CS students.',
      instructor:'Dr. A. Reyes', semester:'1st Semester', academicYear:'2026-2027',
      weeks:[
        { id: uid(), learningType:'unordered',
          learningOutcomes:['Explain the fundamental concepts of computing','Identify the major components of a computer system'],
          topics:[{ id: uid(), title:'Introduction to Computers', subtopics:['Definition and history','Types of computers','Hardware vs software'] }] },
        { id: uid(), learningType:'numbered',
          learningOutcomes:['Differentiate between data and information','Describe how data is processed'],
          topics:[{ id: uid(), title:'Data and Information Processing', subtopics:['The data processing cycle','Input-Process-Output model'] }] },
        { id: uid(), learningType:'unordered',
          learningOutcomes:['Explain the concept of algorithms','Trace simple algorithms using flowcharts'],
          topics:[
            { id: uid(), title:'Introduction to Algorithms', subtopics:['Definition','Characteristics','Applications'] },
            { id: uid(), title:'Flowcharts', subtopics:['Symbols','Simple examples'] },
          ] },
      ],
      createdAt:Date.now(), updatedAt:Date.now() },
  ];
  writeKey(DB_KEYS.syllabusCourses, syllabusCourses);

  localStorage.setItem('sp_seeded','1');
  localStorage.setItem('sp_semester_migrated','1');
}

/* ============================================================
   FIRST-RUN INIT — creates a clean empty planner (no demo data)
   ============================================================ */
function initIfEmpty(){
  // Already initialized
  if(localStorage.getItem('sp_initialized')) return;

  // Build a default semester so the app is functional immediately
  const defaultSem = makeSemesterObject('2026-2027', '1st Semester', {
    startDate: ymdLocal(new Date()),
    endDate: ymdLocal(new Date(Date.now()+ 1000*60*60*24*105)),
    finalsDate: ymdLocal(new Date(Date.now()+ 1000*60*60*24*100)),
    totalWeeks: 15,
  });

  writeKey(DB_KEYS.semesters, [defaultSem]);
  writeKey(DB_KEYS.activeSemesterId, defaultSem.id);
  writeKey(DB_KEYS.subjects, []);
  writeKey(DB_KEYS.tasks, []);
  writeKey(DB_KEYS.notes, []);
  writeKey(DB_KEYS.attendance, []);
  writeKey(DB_KEYS.grades, []);
  writeKey(DB_KEYS.gwaCalc, []);
  writeKey(DB_KEYS.universityEvents, []);
  writeKey(DB_KEYS.calendarEvents, []);
  writeKey(DB_KEYS.syllabusCourses, []);
  writeKey(DB_KEYS.pomodoro, { sessionsToday:0, totalFocusMinutes:0, lastDate:new Date().toDateString(), history:[] });
  writeKey(DB_KEYS.settings, DEFAULT_SETTINGS);
  // Keep legacy semester key for backward compat
  writeKey(DB_KEYS.semester, { name:'1st Semester', schoolYear:'2026-2027',
    startDate: ymdLocal(new Date()),
    endDate: ymdLocal(new Date(Date.now()+ 1000*60*60*24*105)),
    finalsDate: ymdLocal(new Date(Date.now()+ 1000*60*60*24*100)),
    totalWeeks: 15 });

  localStorage.setItem('sp_initialized', '1');
  localStorage.setItem('sp_semester_migrated', '1');
}

/* ============================================================
   IMPORT VALIDATION
   ============================================================ */
function validateImport(obj){
  // Must be a plain object
  if(!obj || typeof obj !== 'object' || Array.isArray(obj)){
    return { valid:false, error:'File does not contain a valid backup object.' };
  }

  // Accept both new schema-versioned format and legacy raw format
  const isNewFormat = ('schemaVersion' in obj) && ('data' in obj);
  const isLegacyFormat = !isNewFormat && ('subjects' in obj || 'tasks' in obj || 'semesters' in obj);

  if(!isNewFormat && !isLegacyFormat){
    return { valid:false, error:'File does not appear to be a Student Planner backup.' };
  }

  // Schema version check (new format)
  if(isNewFormat){
    const ver = obj.schemaVersion;
    if(typeof ver !== 'number' || ver < 1){
      return { valid:false, error:`Unsupported backup schema version (${ver}). Please export a fresh backup.` };
    }
    if(ver > EXPORT_SCHEMA_VERSION){
      return { valid:false, error:`Backup was created with a newer version of the app (schema v${ver}). Please update the app.` };
    }
    const data = obj.data;
    if(!data || typeof data !== 'object'){
      return { valid:false, error:'Backup "data" section is missing or malformed.' };
    }
    // Check arrays
    const arrayFields = ['subjects','tasks','notes','attendance','grades','semesters','calendarEvents','syllabusCourses'];
    for(const f of arrayFields){
      if(data[f] !== undefined && !Array.isArray(data[f])){
        return { valid:false, error:`Field "${f}" must be an array but got ${typeof data[f]}.` };
      }
    }
  }

  // Legacy format: check that arrays are arrays
  if(isLegacyFormat){
    const arrayFields = ['subjects','tasks','notes','attendance','grades','semesters','calendarEvents','syllabusCourses'];
    for(const f of arrayFields){
      if(obj[f] !== undefined && !Array.isArray(obj[f])){
        return { valid:false, error:`Field "${f}" must be an array but got ${typeof obj[f]}.` };
      }
    }
  }

  return { valid:true, isNewFormat, isLegacyFormat };
}

/* ============================================================
   DB OBJECT
   ============================================================ */
const DB = {
  init(){
    // If user has old 'sp_seeded' flag (pre-Phase1), treat as initialized
    if(localStorage.getItem('sp_seeded') && !localStorage.getItem('sp_initialized')){
      localStorage.setItem('sp_initialized', '1');
    }
    initIfEmpty();
    migrateLegacyData();
  },
  uid,
  colors: SUBJECT_COLORS,
  EXPORT_SCHEMA_VERSION,

  // generic
  get(key, fallback){ return readKey(DB_KEYS[key], fallback); },
  set(key, value){ return writeKey(DB_KEYS[key], value); },

  /* ---- SEMESTER MANAGEMENT ---- */
  getSemesters(){ return readKey(DB_KEYS.semesters, []); },
  saveSemesters(list){ return writeKey(DB_KEYS.semesters, list); },

  getActiveSemesterId(){
    const id = readKey(DB_KEYS.activeSemesterId, null);
    if(id) return id;
    const sems = this.getSemesters();
    return sems.length ? sems[0].id : null;
  },
  setActiveSemester(id){
    writeKey(DB_KEYS.activeSemesterId, id);
  },
  getActiveSemester(){
    const id = this.getActiveSemesterId();
    const sems = this.getSemesters();
    return sems.find(s=>s.id===id) || sems[0] || null;
  },

  addSemester(schoolYear, semName, extra){
    const sems = this.getSemesters();
    const newSem = makeSemesterObject(schoolYear, semName, extra);
    if(sems.find(s=>s.id===newSem.id)) return null;
    sems.push(newSem);
    this.saveSemesters(sems);
    return newSem;
  },
  updateSemester(id, data){
    const sems = this.getSemesters();
    const idx = sems.findIndex(s=>s.id===id);
    if(idx===-1) return false;
    sems[idx] = { ...sems[idx], ...data };
    this.saveSemesters(sems);
    return true;
  },
  deleteSemester(id){
    const sems = this.getSemesters();
    if(sems.length <= 1) return false;
    const filtered = sems.filter(s=>s.id!==id);
    this.saveSemesters(filtered);

    // Delete all data belonging to this semester
    ['subjects','tasks','notes','attendance','grades','syllabusCourses','calendarEvents'].forEach(key => {
      const all = readKey(DB_KEYS[key], []);
      const remaining = all.filter(r => r.semesterId !== id);
      writeKey(DB_KEYS[key], remaining);
    });

    if(this.getActiveSemesterId()===id){
      this.setActiveSemester(filtered[0].id);
    }
    return true;
  },

  /* ---- SEMESTER-FILTERED DATA HELPERS ---- */
  getSubjectsForSemester(semId){ return this.getSubjects().filter(s=>s.semesterId===semId); },
  getAttendanceForSemester(semId){ return this.getAttendance().filter(r=>r.semesterId===semId); },
  getGradesForSemester(semId){ return this.getGrades().filter(g=>g.semesterId===semId); },
  getTasksForSemester(semId){ return this.getTasks().filter(t=>t.semesterId===semId); },
  getNotesForSemester(semId){ return this.getNotes().filter(n=>n.semesterId===semId); },
  getSyllabusCoursesForSemester(semId){ return this.getSyllabusCourses().filter(c=>c.semesterId===semId); },
  getCalendarEventsForSemester(semId){ return this.getCalendarEvents().filter(e=>e.semesterId===semId); },

  /* ---- ACTIVE SEMESTER SHORTCUTS ---- */
  getActiveSubjects(){ return this.getSubjectsForSemester(this.getActiveSemesterId()); },
  getActiveAttendance(){ return this.getAttendanceForSemester(this.getActiveSemesterId()); },
  getActiveGrades(){ return this.getGradesForSemester(this.getActiveSemesterId()); },
  getActiveTasks(){ return this.getTasksForSemester(this.getActiveSemesterId()); },
  getActiveNotes(){ return this.getNotesForSemester(this.getActiveSemesterId()); },
  getActiveSyllabusCourses(){ return this.getSyllabusCoursesForSemester(this.getActiveSemesterId()); },

  /* ---- RAW DATA (full arrays, all semesters) ---- */
  getSubjects(){ return readKey(DB_KEYS.subjects, []); },
  saveSubjects(list){ return writeKey(DB_KEYS.subjects, list); },
  getSubject(id){ return this.getSubjects().find(s=>s.id===id); },

  getTasks(){ return readKey(DB_KEYS.tasks, []); },
  saveTasks(list){ return writeKey(DB_KEYS.tasks, list); },

  getNotes(){ return readKey(DB_KEYS.notes, []); },
  saveNotes(list){ return writeKey(DB_KEYS.notes, list); },

  getAttendance(){ return readKey(DB_KEYS.attendance, []); },
  saveAttendance(list){ return writeKey(DB_KEYS.attendance, list); },

  getGrades(){ return readKey(DB_KEYS.grades, []); },
  saveGrades(list){ return writeKey(DB_KEYS.grades, list); },

  getGwaCalcRows(){ return readKey(DB_KEYS.gwaCalc, []); },
  saveGwaCalcRows(list){ return writeKey(DB_KEYS.gwaCalc, list); },

  getUniversityEvents(){ return readKey(DB_KEYS.universityEvents, []); },
  saveUniversityEvents(list){ return writeKey(DB_KEYS.universityEvents, list); },

  getCalendarEvents(){ return readKey(DB_KEYS.calendarEvents, []); },
  saveCalendarEvents(list){ return writeKey(DB_KEYS.calendarEvents, list); },

  getSyllabusCourses(){ return readKey(DB_KEYS.syllabusCourses, []); },
  saveSyllabusCourses(list){ return writeKey(DB_KEYS.syllabusCourses, list); },
  getSyllabusCourse(id){ return this.getSyllabusCourses().find(c=>c.id===id); },

  getSettings(){ return readKey(DB_KEYS.settings, DEFAULT_SETTINGS); },
  saveSettings(s){ return writeKey(DB_KEYS.settings, s); },

  // Legacy single-semester support
  getSemester(){ return this.getActiveSemester() || readKey(DB_KEYS.semester, { name:'1st Semester', schoolYear:'2026-2027', startDate:ymdLocal(new Date()), endDate:ymdLocal(new Date(Date.now()+1000*60*60*24*105)), finalsDate:ymdLocal(new Date(Date.now()+1000*60*60*24*100)), totalWeeks:15 }); },
  saveSemester(s){ return writeKey(DB_KEYS.semester, s); },

  getPomo(){ return readKey(DB_KEYS.pomodoro, { sessionsToday:0, totalFocusMinutes:0, lastDate:new Date().toDateString(), history:[] }); },
  savePomo(p){ return writeKey(DB_KEYS.pomodoro, p); },

  /* ---- EXPORT / IMPORT (schema-versioned) ---- */
  exportAll(){
    return {
      schemaVersion: EXPORT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      appVersion: '2.1.0',
      data: {
        semesters: readKey(DB_KEYS.semesters, []),
        activeSemesterId: readKey(DB_KEYS.activeSemesterId, null),
        subjects: readKey(DB_KEYS.subjects, []),
        tasks: readKey(DB_KEYS.tasks, []),
        notes: readKey(DB_KEYS.notes, []),
        attendance: readKey(DB_KEYS.attendance, []),
        grades: readKey(DB_KEYS.grades, []),
        gwaCalc: readKey(DB_KEYS.gwaCalc, []),
        calendarEvents: readKey(DB_KEYS.calendarEvents, []),
        syllabusCourses: readKey(DB_KEYS.syllabusCourses, []),
        universityEvents: readKey(DB_KEYS.universityEvents, []),
        settings: readKey(DB_KEYS.settings, DEFAULT_SETTINGS),
        pomodoro: readKey(DB_KEYS.pomodoro, null),
      }
    };
  },

  importAll(obj){
    // Determine data source
    let data;
    if(obj.schemaVersion && obj.data){
      // New format
      data = obj.data;
    } else {
      // Legacy format — keys match DB_KEYS keys directly
      data = obj;
    }

    // Write each field if present and valid
    const arrayFields = ['subjects','tasks','notes','attendance','grades','gwaCalc','calendarEvents','syllabusCourses','universityEvents','semesters'];
    arrayFields.forEach(k => {
      if(Array.isArray(data[k])) writeKey(DB_KEYS[k], data[k]);
    });
    if(data.activeSemesterId !== undefined) writeKey(DB_KEYS.activeSemesterId, data.activeSemesterId);
    if(data.settings && typeof data.settings === 'object') writeKey(DB_KEYS.settings, data.settings);
    if(data.pomodoro && typeof data.pomodoro === 'object') writeKey(DB_KEYS.pomodoro, data.pomodoro);

    // Ensure semesters list is not empty after import
    const sems = readKey(DB_KEYS.semesters, []);
    if(!sems.length){
      const fallbackSem = makeSemesterObject('2026-2027', '1st Semester', {});
      writeKey(DB_KEYS.semesters, [fallbackSem]);
      writeKey(DB_KEYS.activeSemesterId, fallbackSem.id);
    }

    localStorage.setItem('sp_initialized', '1');
    localStorage.setItem('sp_semester_migrated', '1');
    return true;
  },

  validateImport,

  /* ---- RESET — clears planner data, leaves app functional ---- */
  resetAll(){
    // Remove all planner data
    Object.values(DB_KEYS).forEach(k => localStorage.removeItem(k));
    // Remove init flags so initIfEmpty() runs fresh
    localStorage.removeItem('sp_seeded');
    localStorage.removeItem('sp_initialized');
    localStorage.removeItem('sp_semester_migrated');
    // Re-initialize with clean empty state (no demo data)
    initIfEmpty();
    migrateLegacyData();
  },

  /* ---- DEMO DATA (call explicitly, never automatic) ---- */
  loadDemoData(){
    seedDemoData();
  }
};

DB.init();
