

(function(){
  // ---------- Tiny DOM helpers ----------
  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

// ---- Empty deck message helpers ----
function showEmptyDeckMessage(show){
  const box = document.getElementById('drawEmptyMsg');
  if (!box) return;
  box.style.display = show ? 'block' : 'none';
}

function wireEmptyDeckActions(){
  const btnExample = document.getElementById('emptyLoadExample');
  const btnAces    = document.getElementById('emptyGotoAces');

  // Load example deck, then come back to Draw
  if (btnExample) btnExample.addEventListener('click', ()=>{
    try {
      if (typeof seedExample === 'function') {
        seedExample();
        alert('Example deck loaded. You can now draw your cards.');
        showSection('draw');
      }
    } catch(e) {
      console.error('[EmptyDeck] seedExample error:', e);
      alert('Could not load the example deck. Please refresh and try again.');
    }
  });

  // Jump to Aces to start building
  if (btnAces) btnAces.addEventListener('click', ()=> showSection('aces'));
}

// Call this once on startup (safe if elements are not yet in DOM)
wireEmptyDeckActions();

  // ---------- Local-time date helpers (no UTC drift) ----------
  const pad2 = n => (n < 10 ? '0' + n : '' + n);

  // Format Date -> "YYYY-MM-DD" in *local* time
  const fmtLocalDate = (dateObj) => {
    const y = dateObj.getFullYear();
    const m = pad2(dateObj.getMonth() + 1);
    const d = pad2(dateObj.getDate());
    return `${y}-${m}-${d}`;
  };

  // Parse "YYYY-MM-DD" -> Date at 00:00 in *local* time
  const parseLocalDate = (ymd) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  };

  // Monday as start-of-week (returns local Date)
  const startOfWeek = (d = new Date()) => {
    const day = d.getDay();              // Sun=0..Sat=6
    const diff = (day === 0 ? -6 : 1) - day; // shift to Monday
    const monday = new Date(d);
    monday.setHours(0,0,0,0);
    monday.setDate(monday.getDate() + diff);
    return monday;
  };

  // Add days in local time
  const addDays = (d, n) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };

  const todayISO = () => fmtLocalDate(new Date());

  // ---------- App State (LocalStorage) ----------
  const defaultState = {
    user: { name: "Momo Kromah", role: "Lecturer & Researcher" },
    settings: { weeklyCapacityHours: 8 },

    // Aces (one per suit)
    aces: {
      spades:   { title: "", metrics: [] },
      clubs:    { title: "", metrics: [] },
      hearts:   { title: "", metrics: [] },
      diamonds: { title: "", metrics: [] },
    },

    // Strategics (2 per suit: King & Queen)
    strategics: {
      spades:   [{ title: "", due: "" }, { title: "", due: "" }],
      clubs:    [{ title: "", due: "" }, { title: "", due: "" }],
      hearts:   [{ title: "", due: "" }, { title: "", due: "" }],
      diamonds: [{ title: "", due: "" }, { title: "", due: "" }],
    },

    // Habits picked during onboarding (J–2)
    habits: { spades: [], clubs: [], hearts: [], diamonds: [] },

    // Derived deck (A/K/Q/J..10)
    deck: [],

    // Weekly selection
    draw: { weekStart: null, selected: [] },

    // Weekly plan (flattened tasks with dates)
    plan: { weekStart: null, tasks: [] },

    // Optional future use
    log: { tasks: {} }
  };

  const save = () => localStorage.setItem('solventDeckState', JSON.stringify(state));
  const load = () => {
    try { return JSON.parse(localStorage.getItem('solventDeckState')) || null; }
    catch(e){ return null; }
  };

  let state = load() || structuredClone(defaultState);

  // ---------- Runtime flags ----------
  // v0.3: bind drag/drop once; v0.3.1: Alt copy mode
  let _dndBound  = false;
  let _copyMode  = false;

  // ---------- Navigation + Entry ----------
  function showSection(id){
    $$('.section').forEach(s => s.classList.remove('visible'));
    const el = document.getElementById(id);
    if(el) el.classList.add('visible');

    // Refresh dynamic screens on entry
    if(id==='aces')        renderAceEditor();
    if(id==='strategics')  renderStrategicEditor();
    if(id==='habits')      renderHabitEditor();
    if(id==='draw')        renderDraw();
    if(id==='plan')        renderPlan();
    if(id==='today')       renderToday();
    if(id==='deck')        renderDeck();
    if(id==='review')      renderReview();
    if(id==='insights')    renderInsights();
  }

  // Top navigation
  const topNav = $('#topNav');
  if (topNav) {
    topNav.addEventListener('click', (e)=>{
      if(e.target.matches('button[data-section]')){
        showSection(e.target.getAttribute('data-section'));
      }
    });
  }

  // In-page "continue" buttons
  $$('#main [data-goto]').forEach(btn => btn.addEventListener('click', (e)=>{
    const t = e.currentTarget.getAttribute('data-goto');
    showSection(t);
  }));

  // Welcome buttons
  $('#beginBtn')?.addEventListener('click', ()=> showSection('how'));
  $('#seedBtn')?.addEventListener('click', ()=>{
    seedExample();
    alert('Example deck loaded. Jumping to Weekly Draw.');
    showSection('draw');
  });

  // ---------- Per-suit meta ----------
  const suits = ['spades','clubs','hearts','diamonds'];
  const suitMeta = {
    spades:   { icon:'♠', name:'Spades',   color:'suit-spades'   },
    clubs:    { icon:'♣', name:'Clubs',    color:'suit-clubs'    },
    hearts:   { icon:'♥', name:'Hearts',   color:'suit-hearts'   },
    diamonds: { icon:'♦', name:'Diamonds', color:'suit-diamonds' },
  };

  // ---------- ACE editor ----------
  function renderAceEditor(){
    const root = $('#aceEditor');
    if(!root) return;
    root.innerHTML = '';
    suits.forEach(s => {
      const wrap = document.createElement('div');
      wrap.className = 'card';
      wrap.innerHTML = `
        <div class="suit-badge ${suitMeta[s].color}">${suitMeta[s].icon} ${suitMeta[s].name} — Ace</div>
        <div class="card-editor">
          <label class="label">Ace Title</label>
          <input type="text" id="ace-${s}" placeholder="Identity-level goal for ${suitMeta[s].name}" value="${state.aces[s].title || ''}">
          <label class="label">Metrics (comma-separated)</label>
          <input type="text" id="ace-${s}-metrics" placeholder="e.g., 2 papers, 1 book" value="${(state.aces[s].metrics||[]).join(', ')}">
          <div class="small">Tip: Bold but measurable.</div>
        </div>`;
      root.appendChild(wrap);
    });

    suits.forEach(s => {
      $('#ace-'+s)?.addEventListener('input', (e)=>{ state.aces[s].title = e.target.value; save(); });
      $('#ace-'+s+'-metrics')?.addEventListener('input', (e)=>{
        state.aces[s].metrics = e.target.value.split(',').map(x=>x.trim()).filter(Boolean);
        save();
      });
    });
  }

  // ---------- Strategics editor (King/Queen) ----------
  function renderStrategicEditor(){
    const root = $('#strategicEditor');
    if(!root) return;
    root.innerHTML = '';
    suits.forEach(s => {
      const wrap = document.createElement('div');
      wrap.className = 'card';
      const aceT = state.aces[s].title || '(set your Ace first)';
      const rows = state.strategics[s].map((st, i)=>`
        <div class="card-chip">
          <div class="meta"><span class="suit-badge ${suitMeta[s].color}">${suitMeta[s].icon} ${suitMeta[s].name} — ${i===0?'King':'Queen'}</span></div>
          <label class="label">Title</label>
          <input type="text" id="strategic-${s}-${i}-title" value="${st.title||''}" placeholder="Project that advances the Ace">
          <div class="grid grid-2">
            <div>
              <label class="label">Finish date</label>
              <input type="date" id="strategic-${s}-${i}-due" value="${st.due||''}">
            </div>
            <div>
              <label class="label">Planned weekly minutes</label>
              <input type="number" id="strategic-${s}-${i}-mins" value="${st.mins||60}" min="15" max="240">
            </div>
          </div>
          <div class="small">Ace: ${aceT}</div>
        </div>`
      ).join('');
      wrap.innerHTML = `
        <div class="suit-badge ${suitMeta[s].color}">${suitMeta[s].icon} ${suitMeta[s].name}</div>
        <div class="label">Ace: ${aceT}</div>
        ${rows}
      `;
      root.appendChild(wrap);
    });

    suits.forEach(s => state.strategics[s].forEach((_, i)=>{
      $('#strategic-'+s+'-'+i+'-title')?.addEventListener('input', (e)=>{ state.strategics[s][i].title = e.target.value; save(); });
      $('#strategic-'+s+'-'+i+'-due')?.addEventListener('change', (e)=>{ state.strategics[s][i].due = e.target.value; save(); });
      $('#strategic-'+s+'-'+i+'-mins')?.addEventListener('change', (e)=>{ state.strategics[s][i].mins = parseInt(e.target.value||60,10); save(); });
    }));
  }

  // ---------- Habit templates for onboarding ----------
  const habitTemplates = {
    spades:   [
      { title: 'Write 300 words',     cadence:'daily', duration:25 },
      { title: 'Two research sprints',cadence:'2x',    duration:45 },
      { title: 'Read one seminal paper', cadence:'weekly', duration:30 },
      { title: 'Outline next module', cadence:'weekly', duration:30 }
    ],
    clubs:    [
      { title: '10k steps',           cadence:'daily', duration:40 },
      { title: 'Protein at each meal',cadence:'daily', duration:10 },
      { title: 'Lights out 10pm',     cadence:'daily', duration:5 },
      { title: 'Mobility 10 min',     cadence:'daily', duration:10 }
    ],
    hearts:   [
      { title: 'Share three appreciations', cadence:'daily',  duration:10 },
      { title: 'Weekly partner meeting',    cadence:'weekly', duration:45 },
      { title: '1:1 with child',            cadence:'weekly', duration:30 },
      { title: 'Call a mentor',             cadence:'weekly', duration:20 }
    ],
    diamonds: [
      { title: 'Track daily expenses', cadence:'daily',  duration:8  },
      { title: 'DCA invest',           cadence:'weekly', duration:15 },
      { title: 'Review budget',        cadence:'weekly', duration:20 },
      { title: 'Draft offer asset',    cadence:'weekly', duration:30 }
    ]
  };

  function renderHabitEditor(){
    const root = $('#habitEditor');
    if(!root) return;
    root.innerHTML = '';
    suits.forEach(s => {
      const wrap = document.createElement('div');
      wrap.className = 'card';
      const selected = state.habits[s] || [];
      const templates = habitTemplates[s];
      wrap.innerHTML = `
        <div class="suit-badge ${suitMeta[s].color}">${suitMeta[s].icon} ${suitMeta[s].name}</div>
        <div class="label">Pick up to 3 starter habits</div>
        <div class="grid grid-2">
          ${templates.map((t, idx)=>{
            const id = `hab-${s}-${idx}`;
            const isChecked = selected.some(h=>h.title===t.title);
            const cadenceLbl = t.cadence==='daily'?'Daily':(t.cadence==='2x'?'Tue/Fri':'Weekly');
            return `<label class="card-chip">
              <input type="checkbox" id="${id}" ${isChecked?'checked':''}>
              <span class="title">${t.title}</span>
              <span class="meta">${cadenceLbl} · ${t.duration}m</span>
            </label>`;
          }).join('')}
        </div>`;
      root.appendChild(wrap);

      templates.forEach((t, idx)=>{
        $('#hab-'+s+'-'+idx)?.addEventListener('change', (e)=>{
          const checked = e.target.checked;
          let list = state.habits[s] || [];
          if(checked){
            if(list.length >= 3){ alert('Select up to 3 to keep it light.'); e.target.checked=false; return; }
            list.push(t);
          } else {
            list = list.filter(h=>h.title!==t.title);
          }
          state.habits[s] = list;
          save();
        });
      });
    });
  }

  // ---------- Build current deck from Aces/Strategics/Habits ----------
  function buildDeck(){
    const deck = [];
    suits.forEach(s => {
      const ace = state.aces[s];
      if(ace.title) deck.push({ id: 'A-'+s, suit:s, rank:'A', title: ace.title });

      const st = state.strategics[s];
      st.forEach((row, i)=>{
        if(row.title){
          deck.push({
            id: (i===0?'K':'Q')+'-'+s,
            suit:s,
            rank:(i===0?'K':'Q'),
            title: row.title,
            due: row.due,
            mins: row.mins || 60
          });
        }
      });

      (state.habits[s]||[]).forEach((h, j)=>{
        deck.push({
          id: 'H-'+s+'-'+j,
          suit:s,
          rank: j===0?'J':'10',
          title: h.title,
          cadence:h.cadence,
          duration:h.duration
        });
      });
    });
    state.deck = deck;
    save();
  }

  // ---------- Weekly Draw ----------
  
function drawWeekly(){
  buildDeck();

  // Read controls
  const countSel = $('#drawCount');
  const perDomain = $('#minPerDomain');
  const count = countSel ? parseInt(countSel.value,10) : 4;
  const ensureBalance = perDomain ? perDomain.checked : true;

  // Build the pool (exclude Aces from random weekly draw)
  const pool = (state.deck || []).filter(c => c && c.rank !== 'A');

  // If there's nothing to draw from, show the helper message and bail early
  if (!pool.length) {
    showEmptyDeckMessage(true);
    // Also clear any previous selection rendering
    const root = $('#drawResult');
    if (root) root.innerHTML = '<div class="muted">No cards yet. Load the example deck or add cards in Aces / Strategics / Habits.</div>';
    return;
  }

  // Hide message if previously shown
  showEmptyDeckMessage(false);

  // Balance helper
  const bySuit = { spades:[], clubs:[], hearts:[], diamonds:[] };
  pool.forEach(c => { if (bySuit[c.suit]) bySuit[c.suit].push(c); });

  // Selection
  const selected = [];
  if (ensureBalance){
    ['spades','clubs','hearts','diamonds'].forEach(s => {
      if (bySuit[s].length > 0 && selected.length < count){
        selected.push(bySuit[s][Math.floor(Math.random()*bySuit[s].length)]);
      }
    });
  }
  while (selected.length < count && pool.length > 0){
    const c = pool.splice(Math.floor(Math.random()*pool.length), 1)[0];
    if (!selected.find(x => x.id === c.id)) selected.push(c);
  }

  // Save selection + week
  const weekStartDate = startOfWeek(new Date());
  state.draw = { weekStart: fmtLocalDate(weekStartDate), selected: selected.map(c=>c.id) };
  save();

  renderDraw();
}


  
function renderDraw(){
  buildDeck();
  // Hide empty message if pool is not empty anymore
  const poolNow = (state.deck || []).filter(c => c && c.rank !== 'A');
  showEmptyDeckMessage(poolNow.length === 0);

    const root = $('#drawResult');
    if(!root) return;
    root.innerHTML = '';
    const selectedIds = state.draw.selected || [];
    const selected = state.deck.filter(c => selectedIds.includes(c.id));
    const renderCard = (c) => `
      <div class="card">
        <div class="meta"><span class="suit-badge ${suitMeta[c.suit].color}">${suitMeta[c.suit].icon} ${c.rank}</span></div>
        <div class="title">${c.title}</div>
      </div>`;

    root.innerHTML = selected.length
      ? selected.map(renderCard).join('')
      : '<div class="muted">No cards selected yet. Click "Draw my cards".</div>';
  }

  $('#drawBtn')?.addEventListener('click', drawWeekly);

  // ---------- Generate Weekly Plan (guarded) ----------
  $('#genPlanBtn')?.addEventListener('click', ()=>{
    try {
      generatePlan();
      showSection('plan');
    } catch (err) {
      console.error('[GeneratePlan] Unhandled error:', err);
      alert('Something went wrong while generating the plan. Please refresh and try again.');
    }
  });

  function generatePlan(){
    // Ensure deck exists
    buildDeck();

    // Use existing week start or compute new Monday (local)
    const weekStart   = state.draw?.weekStart || fmtLocalDate(startOfWeek(new Date()));
    const selectedIds = Array.isArray(state.draw?.selected) ? state.draw.selected : [];

    // Guard: must have selected cards
    if (!selectedIds.length) {
      alert('No cards selected for this week yet.\n\nGo to Weekly Draw and click “🎴 Draw my cards”, then try “Generate Weekly Plan”.');
      showSection('draw');
      return;
    }

    // Build tasks from selected cards
    const selected = state.deck.filter(c => selectedIds.includes(c.id));
    const tasks = [];

    selected.forEach(c => {
      if (['K','Q'].includes(c.rank)) {
        // Strategic: one milestone on Wednesday
        const date = fmtLocalDate(addDays(parseLocalDate(weekStart), 2)); // Mon=0 -> Wed=2
        tasks.push({
          id: 't-'+c.id+'-WED',
          date,
          title: c.title + ' — milestone',
          suit: c.suit,
          rank: c.rank,
          duration: c.mins || 60,
          status: 'planned'
        });
      } else {
        // Habits: schedule by cadence
        let days = [];
        if (c.cadence === 'daily')   days = [0,1,2,3,4]; // Mon–Fri
        else if (c.cadence === '2x') days = [1,4];       // Tue, Fri
        else                         days = [2];         // Weekly -> Wed

        days.forEach(d => {
          tasks.push({
            id: 't-'+c.id+'-'+d,
            date: fmtLocalDate(addDays(parseLocalDate(weekStart), d)),
            title: c.title,
            suit: c.suit,
            rank: c.rank,
            duration: c.duration || 20,
            status: 'planned'
          });
        });
      }
    });

    state.plan = { weekStart, tasks };
    save();
    renderPlan();
  }

  // ---------- Render Weekly Plan (drag/move + Alt-copy + inline edit) ----------
  
// ----- Weekly Summary (Option D) -----
function renderPlanSummary(){
  const box = document.getElementById('planSummary');
  if (!box) return;

  const plan = (state.plan && Array.isArray(state.plan.tasks)) ? state.plan : { tasks: [] };
  const tasks = plan.tasks || [];

  // Totals
  const totalMins = tasks.reduce((a,b)=> a + (b.duration || 0), 0);
  const totalHours = Math.round((totalMins/60) * 10) / 10;

  const capHrs = state.settings && state.settings.weeklyCapacityHours ? state.settings.weeklyCapacityHours : 8;
  const capMins = capHrs * 60;
  const usagePct = capMins ? Math.round((totalMins / capMins) * 100) : 0;

  // Counts by suit
  const suitsList = ['spades','clubs','hearts','diamonds'];
  const counts = { spades:0, clubs:0, hearts:0, diamonds:0 };
  tasks.forEach(t => { if (counts.hasOwnProperty(t.suit)) counts[t.suit]++; });

  // Usage badge class
  let usageClass = 'badge-ok';
  if (usagePct >= 90) usageClass = 'badge-high';
  else if (usagePct >= 70) usageClass = 'badge-warn';

  // Hint logic
  const maxCount = Math.max(counts.spades, counts.clubs, counts.hearts, counts.diamonds);
  const minCount = Math.min(counts.spades, counts.clubs, counts.hearts, counts.diamonds);
  let hint = 'Looks balanced. Aim for small, meaningful steps.';
  if (usagePct >= 95) hint = 'This looks heavy—consider reducing durations or moving a card.';
  else if (usagePct <= 40) hint = 'Plenty of capacity left—consider adding one helpful habit.';
  else if (maxCount - minCount >= 3) hint = 'One suit dominates—check if that’s intentional this week.';

  // Suit icons
  const suitIcon = {
    spades: '♠', clubs: '♣', hearts: '♥', diamonds: '♦'
  };

  box.innerHTML = `
    <div class="summary-top">
      <div class="summary-title">Weekly Summary</div>
      <div class="summary-stats">
        <span class="stat"><span class="k">Time:</span> ${totalMins}m (${totalHours}h)</span>
        <span class="stat"><span class="k">Capacity:</span> ${capHrs}h</span>
        <span class="stat">
          <span class="k">Usage:</span> 
          <span class="badge-usage ${usageClass}">${usagePct}%</span>
        </span>
      </div>
    </div>

    <div class="summary-suits">
      <span class="suit-pill">${suitIcon.spades} <span class="count">${counts.spades}</span></span>
      <span class="suit-pill">${suitIcon.clubs} <span class="count">${counts.clubs}</span></span>
      <span class="suit-pill">${suitIcon.hearts} <span class="count">${counts.hearts}</span></span>
      <span class="suit-pill">${suitIcon.diamonds} <span class="count">${counts.diamonds}</span></span>
    </div>

    <div class="summary-hint">${hint}</div>
  `;
}

  function renderPlan(){
    const root = $('#planGrid');
    if(!root) return;
    root.innerHTML = '';

    const weekStart = state.plan.weekStart || fmtLocalDate(startOfWeek(new Date()));
    const tasks     = state.plan.tasks || [];

    // Build day buckets Mon..Sun
    const perDay = [0,1,2,3,4,5,6].map(i => ({
      date: fmtLocalDate(addDays(parseLocalDate(weekStart), i)),
      tasks: []
    }));

    // Place tasks in buckets
    tasks.forEach(t => {
      const dt = parseLocalDate(t.date);
      const day = dt.getDay();          // Sun=0..Sat=6
      const idx = (day + 6) % 7;        // Mon=0..Sun=6
      perDay[idx].tasks.push(t);
    });

    // Capacity banner
    const totalMins = tasks.reduce((a,b)=>a+(b.duration||0),0);
    const capMins   = (state.settings.weeklyCapacityHours||8)*60;
    const usage     = Math.round((totalMins/capMins)*100);
    $('#capacityBanner') && ($('#capacityBanner').innerText =
      `Capacity used: ${Math.round(totalMins/60)}h (${usage}%) of ${state.settings.weeklyCapacityHours}h`
      );
 renderPlanSummary();
    // Render columns and tasks
    const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    perDay.forEach((d, i) => {
      const col = document.createElement('div');
      col.className = 'day-col';
      col.dataset.date = d.date; // used by drop handler
      col.innerHTML = `<h3>${dayNames[i]} <span class="small">${d.date}</span></h3>`;

      d.tasks.forEach(t => {
        const node = document.createElement('div');
        node.className = 'task';
        node.setAttribute('draggable', 'true');
        node.dataset.taskId = t.id;

        node.innerHTML = `
          <div class="title" data-task-id="${t.id}" title="Click to edit title">${t.title}</div>
          <div class="meta">
            <span class="badge ${'suit-'+t.suit}">${suitMeta[t.suit].icon} ${t.rank}</span>
            <span class="badge duration-badge" data-task-id="${t.id}" title="Click to edit minutes">${t.duration}m</span>
            <button data-done="${t.id}">Mark done</button>
          </div>`;
        col.appendChild(node);
      });

      root.appendChild(col);
    });

    // Bind (once) — drag/drop + inline edit + copy mode
    if (!_dndBound) {
      _dndBound = true;

      // Alt toggles copy mode (visual hint via body class)
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Alt') { _copyMode = true;  document.body.classList.add('copy-mode'); }
      });
      document.addEventListener('keyup', (e) => {
        if (e.key === 'Alt') { _copyMode = false; document.body.classList.remove('copy-mode'); }
      });

      // DRAG START/END on tasks
      root.addEventListener('dragstart', (e) => {
        const taskEl = e.target.closest('.task');
        if (!taskEl) return;

        e.dataTransfer.effectAllowed = 'copyMove';
        const isCopy = _copyMode || !!e.altKey; // snapshot at drag start
        e.dataTransfer.setData('text/task-id', taskEl.dataset.taskId);
        e.dataTransfer.setData('text/copy',   isCopy ? '1' : '0');

        if (isCopy) taskEl.classList.add('copying');
        taskEl.classList.add('dragging');
      });

      root.addEventListener('dragend', (e) => {
        const taskEl = e.target.closest('.task');
        if (taskEl) { taskEl.classList.remove('dragging'); taskEl.classList.remove('copying'); }
      });

      // DRAG OVER / LEAVE on columns
      root.addEventListener('dragover', (e) => {
        const col = e.target.closest('.day-col');
        if (!col) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = _copyMode ? 'copy' : 'move';
        col.classList.add('drag-over');
      });
      root.addEventListener('dragleave', (e) => {
        const col = e.target.closest('.day-col');
        if (col) col.classList.remove('drag-over');
      });

      // DROP on columns (move OR copy)
      root.addEventListener('drop', (e) => {
        const col = e.target.closest('.day-col');
        if (!col) return;
        e.preventDefault();
        col.classList.remove('drag-over');

        const taskId  = e.dataTransfer.getData('text/task-id');
        const isCopy  = (e.dataTransfer.getData('text/copy') === '1') || _copyMode;
        if (!taskId) return;

        const newDate = col.dataset.date;
        const t = (state.plan.tasks||[]).find(x => x.id === taskId);
        if (!t) return;

        if (isCopy) {
          const newId = 't-' + Date.now() + '-' + Math.floor(Math.random()*1e6);
          const clone = { ...t, id: newId, date: newDate, status: 'planned' };
          state.plan.tasks.push(clone);
        } else {
          if (t.date !== newDate) t.date = newDate;
        }
        save();
        renderPlan();
      });

      // INLINE EDIT: Title
      root.addEventListener('click', (e) => {
        const titleEl = e.target.closest('.title');
        if (!titleEl) return;

        const taskId = titleEl.dataset.taskId;
        const t = (state.plan.tasks||[]).find(x => x.id === taskId);
        if (!t) return;

        const input = document.createElement('input');
        input.className = 'inline-edit';
        input.type = 'text';
        input.value = t.title;

        titleEl.replaceWith(input);
        input.focus(); input.select();

        const commit = () => { t.title = (input.value.trim() || t.title); save(); renderPlan(); };
        const cancel = () => renderPlan();

        input.addEventListener('keydown', (ev) => { if (ev.key==='Enter') commit(); else if (ev.key==='Escape') cancel(); });
        input.addEventListener('blur', commit);
      });

      // INLINE EDIT: Duration
      root.addEventListener('click', (e) => {
        const durEl = e.target.closest('.duration-badge');
        if (!durEl) return;

        const taskId = durEl.dataset.taskId;
        const t = (state.plan.tasks||[]).find(x => x.id === taskId);
        if (!t) return;

        const input = document.createElement('input');
        input.className = 'inline-edit';
        input.type = 'number';
        input.min = '5'; input.max = '240'; input.step = '5';
        input.value = t.duration || 20;

        durEl.replaceWith(input);
        input.focus(); input.select();

        const commit = () => {
          const val = parseInt(input.value, 10);
          if (!isNaN(val) && val > 0) { t.duration = Math.max(5, Math.min(240, val)); save(); renderPlan(); }
          else { renderPlan(); }
        };
        const cancel = () => renderPlan();

        input.addEventListener('keydown', (ev) => { if (ev.key==='Enter') commit(); else if (ev.key==='Escape') cancel(); });
        input.addEventListener('blur', commit);
      });

      // MARK DONE toggle
      root.addEventListener('click', (e) => {
        const id = e.target.getAttribute && e.target.getAttribute('data-done');
        if(!id) return;
        const t = (state.plan.tasks||[]).find(x=>x.id===id);
        if(t){ t.status = t.status==='done'?'planned':'done'; save(); renderPlan(); }
      });
    }
  }

  // ---------- Today ----------
  function renderToday(){
    const root = $('#todayList');
    if(!root) return;
    root.innerHTML = '';
    const today = fmtLocalDate(new Date());
    const tasks = (state.plan.tasks||[]).filter(t => t.date === today);

    if(tasks.length===0){ root.innerHTML = '<div class="muted">No tasks scheduled today.</div>'; return; }

    tasks.forEach(t => {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `
        <div>
          <div>${t.title}</div>
          <div class="small">${suitMeta[t.suit].icon} ${t.rank} · ${t.duration}m</div>
        </div>
        <div><button data-done="${t.id}">${t.status==='done'?'Done':'Mark done'}</button></div>
      `;
      root.appendChild(row);
    });

    root.addEventListener('click', (e)=>{
      const id = e.target.getAttribute && e.target.getAttribute('data-done');
      if(!id) return;
      const t = (state.plan.tasks||[]).find(x=>x.id===id);
      if(t){ t.status = t.status==='done'?'planned':'done'; save(); renderToday(); }
    });
  }

  // ---------- Deck ----------
  function renderDeck(){
    buildDeck();
    const root = $('#deckView');
    if(!root) return;
    root.innerHTML = '';
    suits.forEach(s => {
      const box = document.createElement('div');
      box.className = 'card';
      box.innerHTML = `<h3>${suitMeta[s].icon} ${suitMeta[s].name}</h3>`;
      const list = state.deck.filter(c=>c.suit===s);
      if(list.length===0){
        box.innerHTML += '<div class="muted">No cards yet.</div>';
      } else {
        list.forEach(c => {
          const metaColor = `suit-badge ${suitMeta[c.suit].color}`;
          const chip = document.createElement('div');
          chip.className = 'card-chip';
          chip.innerHTML = `
            <div class="meta"><span class="${metaColor}">${suitMeta[c.suit].icon} ${c.rank}</span></div>
            <div class="title">${c.title}</div>
            <div class="small">${c.due?('Due '+c.due):''}</div>
          `;
          box.appendChild(chip);
        });
      }
      root.appendChild(box);
    });
  }

  // ---------- Export ----------
  $('#exportBtn')?.addEventListener('click', ()=>{
    buildDeck();
    const blob = new Blob([JSON.stringify({state}, null, 2)], {type:'application/json'});
    const url  = URL.createObjectURL(blob);
    const link = $('#downloadLink');
    link.href = url;
    link.download = 'solvent-deck-export.json';
    link.style.display = 'inline-block';
    link.textContent = 'Download export';
  });

  // ---------- Review ----------
  function renderReview(){
    const root = $('#reviewView');
    if(!root) return;
    root.innerHTML = '';
    const tasks = state.plan.tasks||[];
    if(tasks.length===0){ root.innerHTML = '<div class="muted">No plan yet.</div>'; return; }

    const done = tasks.filter(t=>t.status==='done').length;
    const total = tasks.length;
    const pct = total? Math.round((done/total)*100) : 0;

    root.innerHTML = `
      <div class="card">
        <div>Completion: <span class="badge ${pct>=80?'good':pct>=60?'warn':'danger'}">${pct}%</span></div>
        <div class="small">${done}/${total} tasks completed</div>
      </div>
      <hr class="sep"/>
      <div class="grid grid-2">
        ${suits.map(s=>{
          const sTasks = tasks.filter(t=>t.suit===s);
          const sDone  = sTasks.filter(t=>t.status==='done').length;
          const sPct   = sTasks.length? Math.round((sDone/sTasks.length)*100) : 0;
          return `<div class="card"><strong>${suitMeta[s].icon} ${suitMeta[s].name}</strong><div class="small">${sDone}/${sTasks.length} · ${sPct}%</div></div>`;
        }).join('')}
      </div>
    `;
  }

  // ---------- Insights ----------
  function renderInsights(){
    const root = $('#insightsView');
    if(!root) return;
    root.innerHTML = '';
    const tasks = state.plan.tasks||[];
    if(tasks.length===0){ root.innerHTML = '<div class="muted">No data yet.</div>'; return; }

    const byTitle = {};
    tasks.forEach(t=>{
      byTitle[t.title] = byTitle[t.title] || { total:0, done:0 };
      byTitle[t.title].total++;
      if(t.status==='done') byTitle[t.title].done++;
    });
    const rows = Object.entries(byTitle)
      .map(([title, v])=>({ title, ratio: v.done/(v.total||1), total:v.total }))
      .sort((a,b)=>b.ratio-a.ratio)
      .slice(0,5);

    const list = document.createElement('div');
    list.className = 'card';
    list.innerHTML = `<h3>Most effective cards</h3>${
      rows.map(r=>`<div class="small">${Math.round(r.ratio*100)}% of ${r.total} — ${r.title}</div>`).join('')
    }`;
    root.appendChild(list);
  }

  // ---------- Settings ----------
  $('#saveSettingsBtn')?.addEventListener('click', ()=>{
    const cap = $('#capHours');
    const v = parseInt(cap && cap.value || 8,10);
    state.settings.weeklyCapacityHours = v;
    save();
    alert('Settings saved.');
  });

  $('#resetBtn')?.addEventListener('click', ()=>{
    const ok = confirm('Reset Solvent Deck to factory settings? This will clear your local data (deck/draw/plan).');
    if(!ok) return;
    localStorage.removeItem('solventDeckState');
    location.reload();
  });

  // ---------- Seeder (for demos) ----------
  function seedExample(){
    state.aces.spades   = { title:'Lead solvency psychology as a field', metrics:['2 papers','1 book','5 talks'] };
    state.aces.clubs    = { title:'Sustain a high‑energy body',          metrics:['7.5h sleep','150 workouts/yr'] };
    state.aces.hearts   = { title:'Build a solvent family culture',       metrics:['weekly partner meeting'] };
    state.aces.diamonds = { title:'Become financially sovereign creator', metrics:['30% savings','12mo runway'] };

    state.strategics.spades = [
      { title:'Complete territoriality SLR and submit',           due:fmtLocalDate(addDays(new Date(), 120)), mins:90 },
      { title:"Design and launch 'Solvent Career' course",        due:fmtLocalDate(addDays(new Date(), 180)), mins:60 }
    ];
    state.strategics.clubs = [
      { title:'Optimize sleep routine by June',                   due:fmtLocalDate(addDays(new Date(), 130)), mins:45 },
      { title:'Run comfortable 5k',                               due:fmtLocalDate(addDays(new Date(), 160)), mins:40 }
    ];
    state.strategics.hearts = [
      { title:'Weekly partner meeting ritual',                    due:fmtLocalDate(addDays(new Date(), 84)),  mins:45 },
      { title:'1:1 with each child weekly',                       due:fmtLocalDate(addDays(new Date(), 84)),  mins:30 }
    ];
    state.strategics.diamonds = [
      { title:'Launch consulting offer by July',                  due:fmtLocalDate(addDays(new Date(), 170)), mins:60 },
      { title:'Grant pipeline setup',                             due:fmtLocalDate(addDays(new Date(), 150)), mins:50 }
    ];

    state.habits.spades = [
      { title:'Write 300 words', cadence:'daily',  duration:25 },
      { title:'Two research sprints', cadence:'2x', duration:45 },
      { title:'Read one seminal paper', cadence:'weekly', duration:30 }
    ];
    state.habits.clubs = [
      { title:'10k steps', cadence:'daily', duration:40 },
      { title:'Protein at each meal', cadence:'daily', duration:10 },
      { title:'Lights out 10pm', cadence:'daily', duration:5 }
    ];
    state.habits.hearts = [
      { title:'Share three appreciations', cadence:'daily', duration:10 },
      { title:'Weekly partner meeting',    cadence:'weekly', duration:45 },
      { title:'Call a mentor',             cadence:'weekly', duration:20 }
    ];
    state.habits.diamonds = [
      { title:'Track daily expenses', cadence:'daily',  duration:8  },
      { title:'DCA invest',           cadence:'weekly', duration:15 },
      { title:'Review budget',        cadence:'weekly', duration:20 }
    ];

    state.draw = { weekStart: null, selected: [] };
    state.plan = { weekStart: null, tasks: [] };
    save();
  }

// ===== Onboarding Tour (Option A) =====
(function initTour(){
  const overlay = $('#tourOverlay');
  if (!overlay) return;

  const closeBtn     = $('#tourCloseBtn');
  const openBtn      = $('#openTourBtn');
  const dontShow     = $('#tourDontShow');
  const dots         = Array.from(overlay.querySelectorAll('[data-dot]'));
  const steps        = Array.from(overlay.querySelectorAll('.tour-step'));
  const prevBtns     = Array.from(overlay.querySelectorAll('[data-tour-prev]'));
  const next1        = $('#tourNext1');
  const next2        = $('#tourNext2');
  const next3        = $('#tourNext3');
  const finish       = $('#tourFinishBtn');

  let current = 1;
  let lastFocused = null;

  function show(step){
    current = step;
    steps.forEach(s => s.hidden = (parseInt(s.dataset.step,10) !== current));
    dots.forEach(d => d.classList.toggle('active', parseInt(d.dataset.dot,10) === current));
  }
  function openTour(auto=false){
    // If auto, check local flag
    const seen = localStorage.getItem('solventTourSeen') === '1';
    if (auto && seen) return;

    overlay.setAttribute('aria-hidden', 'false');
    lastFocused = document.activeElement;
    // Focus first actionable button in the step
    setTimeout(()=> {
      const firstBtn = overlay.querySelector('.tour-step:not([hidden]) .tour-actions button, .tour-close');
      if (firstBtn) firstBtn.focus();
    }, 0);
    trapFocus(true);
    show(1);
  }
  function closeTour(){
    overlay.setAttribute('aria-hidden', 'true');
    trapFocus(false);
    if (dontShow && dontShow.checked) localStorage.setItem('solventTourSeen','1');
    if (lastFocused && document.body.contains(lastFocused)) lastFocused.focus();
  }
  function trapFocus(enable){
    if (!enable) {
      document.removeEventListener('keydown', handleKeys);
      return;
    }
    document.addEventListener('keydown', handleKeys);
  }
  function handleKeys(e){
    if (e.key === 'Escape') { e.preventDefault(); closeTour(); return; }
    if (e.key !== 'Tab') return;

    const focusables = overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const f = Array.from(focusables).filter(el => !el.hasAttribute('hidden') && el.offsetParent !== null);
    if (!f.length) return;

    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  // Wire buttons
  closeBtn?.addEventListener('click', closeTour);
  openBtn?.addEventListener('click', ()=> openTour(false));
  prevBtns.forEach(b => b.addEventListener('click', ()=> show(Math.max(1, current - 1))));
  next1?.addEventListener('click', ()=> show(2));
  next2?.addEventListener('click', ()=> show(3));
  next3?.addEventListener('click', ()=> show(4));
  finish?.addEventListener('click', closeTour);

  // Click outside modal closes (optional, accessible-friendly)
  overlay.addEventListener('click', (e)=>{
    if (e.target === overlay) closeTour();
  });

  // Open automatically on first visit (after initial paint)
  window.requestAnimationFrame(()=> openTour(true));
})();

  // ---------- First render ----------
  showSection('welcome');
})();

/* ===== Solvent Deck Delete System ===== */
(function () {
  'use strict';

  // --- Integration points (non-breaking if absent) ---
  const hasFn = (fn) => typeof fn === 'function';

  function persist() {
    if (hasFn(window.saveState)) window.saveState();
  }
  function reRender() {
    // Prefer your explicit renders if available
    if (hasFn(window.renderPlan)) window.renderPlan();
    if (hasFn(window.renderDeck)) window.renderDeck();
  }

  // Fallback state safety
  window.state = window.state || {};
  state.plan = state.plan || {};
  state.plan.tasks = Array.isArray(state.plan.tasks) ? state.plan.tasks : [];
  state.cards = Array.isArray(state.cards) ? state.cards : [];

  // --- Elements ---
  const els = {};
  function cacheEls() {
    els.modal = document.getElementById('sd-delete-modal');
    els.backdrop = document.getElementById('sd-delete-backdrop');
    els.title = document.getElementById('sd-delete-title');
    els.desc = document.getElementById('sd-delete-desc');
    els.assocWrap = document.getElementById('sd-associated-toggle');
    els.assocCheckbox = document.getElementById('sd-delete-associated');
    els.assocMeta = document.getElementById('sd-associated-count');
    els.btnCancel = document.getElementById('sd-cancel');
    els.btnConfirm = document.getElementById('sd-confirm');

    els.toast = document.getElementById('sd-toast');
    els.toastMsg = document.getElementById('sd-toast-msg');
    els.toastUndo = document.getElementById('sd-toast-undo');
  }

  // --- Internal pending + undo state ---
  let pendingDelete = null;
  let undoTimer = null;
  let lastDeleted = null; // { type: 'task'|'card', item, index, associatedTasks?:[], cardIndex? }

  // --- Modal controls ---
  function openModal() {
    if (!els.modal || !els.backdrop) return;
    els.modal.hidden = false;
    requestAnimationFrame(() => {
      els.modal.classList.add('is-open');
      els.backdrop.classList.add('is-open');
      els.backdrop.setAttribute('aria-hidden', 'false');
    });
  }
  function closeModal() {
    if (!els.modal || !els.backdrop) return;
    els.modal.classList.remove('is-open');
    els.backdrop.classList.remove('is-open');
    els.backdrop.setAttribute('aria-hidden', 'true');
    // Defer hiding to allow transition
    setTimeout(() => {
      els.modal.hidden = true;
    }, 180);
  }

  // --- Toast controls ---
  function showToast(message, onUndo) {
    if (!els.toast) return;
    els.toastMsg.textContent = message || 'Deleted.';
    els.toast.hidden = false;
    // Force transition
    requestAnimationFrame(() => {
      els.toast.classList.add('is-open');
    });

    // Wire undo
    els.toastUndo.onclick = () => {
      clearTimeout(undoTimer);
      hideToast();
      if (typeof onUndo === 'function') onUndo();
    };

    // Auto-hide after 5s
    clearTimeout(undoTimer);
    undoTimer = setTimeout(hideToast, 5000);
  }
  function hideToast() {
    if (!els.toast) return;
    els.toast.classList.remove('is-open');
    setTimeout(() => { els.toast.hidden = true; }, 200);
  }

  // --- Utilities ---
  function findTaskIndex(taskId) {
    return state.plan.tasks.findIndex(t => t && t.id === taskId);
  }
  function findCardIndex(cardId) {
    return state.cards.findIndex(c => c && c.id === cardId);
  }
  function tasksForCard(cardId) {
    return state.plan.tasks.filter(t => t && (t.cardId === cardId || t.parentCardId === cardId));
  }

  // --- Animated remove helper (non-blocking) ---
  function animateRemoveRow(el) {
    if (!el) return;
    try {
      const h = el.getBoundingClientRect().height;
      el.style.height = h + 'px';
      el.classList.add('sd-collapse'); // enable collapse transition
      // next frame collapse to 0
      requestAnimationFrame(() => {
        el.classList.add('sd-fade-out');
        el.style.height = '0px';
        el.style.marginTop = '0px';
        el.style.marginBottom = '0px';
        el.style.paddingTop = '0px';
        el.style.paddingBottom = '0px';
      });
    } catch (_) {}
  }

  // --- Public delete entrypoint (opens modal) ---
  function confirmDeleteTask(taskId, labelText) {
    const idx = findTaskIndex(taskId);
    if (idx === -1) return;

    pendingDelete = {
      type: 'task',
      id: taskId,
      idx,
      label: labelText || (state.plan.tasks[idx]?.title || state.plan.tasks[idx]?.name || `Task ${taskId}`)
    };

    // Configure modal
    els.title.textContent = 'Delete task?';
    els.desc.textContent = `“${pendingDelete.label}” will be removed. You can undo this action.`;
    els.assocWrap.hidden = true;

    openModal();
  }

  function confirmDeleteCard(cardId, labelText) {
    const idx = findCardIndex(cardId);
    if (idx === -1) return;

    const card = state.cards[idx];
    const label = labelText || card?.title || card?.name || `Card ${cardId}`;
    const related = tasksForCard(cardId);

    pendingDelete = {
      type: 'card',
      id: cardId,
      idx,
      label,
      relatedCount: related.length
    };

    // Configure modal
    els.title.textContent = 'Delete card?';
    els.desc.textContent = `“${label}” will be removed. You can undo this action.`;
    els.assocWrap.hidden = false;
    els.assocCheckbox.checked = true;
    els.assocMeta.textContent = related.length
      ? `${related.length} associated task${related.length === 1 ? '' : 's'} detected.`
      : 'No associated tasks detected.';

    openModal();
  }

  // --- Core delete operations ---
  function deleteTask(taskId, options = {}) {
    const idx = findTaskIndex(taskId);
    if (idx === -1) return;

    const task = state.plan.tasks[idx];

    // Capture undo info
    lastDeleted = { type: 'task', item: task, index: idx };

    // Animate row if present
    const row = document.querySelector(`[data-task-id="${taskId}"]`);
    animateRemoveRow(row);

    // Remove
    state.plan.tasks.splice(idx, 1);

    // Persist + render
    persist();
    reRender();

    if (!options.silent) {
      showToast('Task deleted.', () => {
        // Undo path
        const rollbackIdx = Math.min(lastDeleted.index, state.plan.tasks.length);
        state.plan.tasks.splice(rollbackIdx, 0, lastDeleted.item);
        persist();
        reRender();
      });
    }
  }

  function deleteCard(cardId, removeAssociated = true) {
    const cardIdx = findCardIndex(cardId);
    if (cardIdx === -1) return;

    const card = state.cards[cardIdx];
    const related = tasksForCard(cardId);

    lastDeleted = {
      type: 'card',
      item: card,
      cardIndex: cardIdx,
      associatedTasks: removeAssociated ? related.slice() : []
    };

    // Remove associated tasks (optional)
    if (removeAssociated && related.length) {
      const ids = new Set(related.map(t => t.id));
      state.plan.tasks = state.plan.tasks.filter(t => !ids.has(t.id));
    } else if (related.length) {
      // If not removing, detach their link to the deleted card to avoid dangling references
      state.plan.tasks = state.plan.tasks.map(t => {
        if (t && (t.cardId === cardId || t.parentCardId === cardId)) {
          return { ...t, cardId: null, parentCardId: null };
        }
        return t;
      });
    }

    // Remove card
    state.cards.splice(cardIdx, 1);

    // Persist + render
    persist();
    reRender();

    showToast('Card deleted.', () => {
      // Undo card, then tasks if applicable
      const restoreCardIdx = Math.min(lastDeleted.cardIndex, state.cards.length);
      state.cards.splice(restoreCardIdx, 0, lastDeleted.item);

      if (Array.isArray(lastDeleted.associatedTasks) && lastDeleted.associatedTasks.length) {
        // Re-attach tasks to the card
        state.plan.tasks = state.plan.tasks.concat(lastDeleted.associatedTasks);
      }

      persist();
      reRender();
    });
  }

  // --- Confirm action from modal ---
  function applyPendingDelete() {
    if (!pendingDelete) return;
    const kind = pendingDelete.type;

    if (kind === 'task') {
      deleteTask(pendingDelete.id, { silent: true });
      showToast('Task deleted.', () => {
        // Undo for task
        const rollbackIdx = Math.min(pendingDelete.idx, state.plan.tasks.length);
        state.plan.tasks.splice(rollbackIdx, 0, lastDeleted?.item);
        persist();
        reRender();
      });
    }

    if (kind === 'card') {
      const removeAssociated = !els.assocWrap.hidden ? !!els.assocCheckbox.checked : true;
      deleteCard(pendingDelete.id, removeAssociated);
    }

    pendingDelete = null;
  }

  // --- Event delegation (works with dynamic rendering) ---
  function handleGlobalClicks(e) {
    const t = e.target;

    // Task delete button
    const btnTask = t.closest('.btn-delete-task');
    if (btnTask) {
      const taskId = coerceId(btnTask.dataset.taskId);
      const label = btnTask.dataset.taskTitle;
      confirmDeleteTask(taskId, label);
      return;
    }

    // Card delete button
    const btnCard = t.closest('.btn-delete-card');
    if (btnCard) {
      const cardId = coerceId(btnCard.dataset.cardId);
      const label = btnCard.dataset.cardTitle;
      confirmDeleteCard(cardId, label);
      return;
    }

    // Modal actions
    if (t === els.btnCancel || t.closest('#sd-cancel')) {
      closeModal();
      pendingDelete = null;
      return;
    }
    if (t === els.btnConfirm || t.closest('#sd-confirm')) {
      closeModal();
      applyPendingDelete();
      return;
    }

    // Backdrop click closes
    if (t === els.backdrop) {
      closeModal();
      pendingDelete = null;
      return;
    }
  }

  // --- Minor helpers ---
  function coerceId(v) {
    // If your IDs are numbers in state, ensure numeric comparison; otherwise keep string
    if (v != null && v !== '' && !isNaN(v)) {
      return Number(v);
    }
    return v;
  }

  // --- Optional: minimal swipe-to-reveal hook (disabled by default) ---
  // You can implement your own; here’s a simple scaffold you can extend.
  /*
  function setupSwipe() {
    let startX = 0;
    document.addEventListener('touchstart', (e) => {
      const row = e.target.closest('.task-row');
      if (!row) return;
      startX = e.touches[0].clientX;
      row.dataset.swipeActive = '1';
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      const row = e.target.closest('.task-row');
      if (!row || row.dataset.swipeActive !== '1') return;
      const dx = e.touches[0].clientX - startX;
      if (dx < -30) row.classList.add('swipe-open');
      if (dx > 30) row.classList.remove('swipe-open');
    }, { passive: true });

    document.addEventListener('touchend', () => {
      document.querySelectorAll('.task-row[data-swipe-active="1"]').forEach(el => {
        el.removeAttribute('data-swipe-active');
      });
    });
  }
  */

  // --- Keyboard accessibility ---
  function handleKeydown(e) {
    if (e.key === 'Escape' && els.modal && !els.modal.hidden) {
      closeModal();
      pendingDelete = null;
    }
  }

  // --- Init once DOM is ready ---
  function initDeleteSystem() {
    cacheEls();
    document.addEventListener('click', handleGlobalClicks);
    document.addEventListener('keydown', handleKeydown);
    // setupSwipe(); // enable if you want swipe affordance
    // Expose minimal API if you prefer calling directly
    window.SolventDelete = {
      confirmDeleteTask,
      confirmDeleteCard,
      deleteTask,
      deleteCard
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDeleteSystem);
  } else {
    initDeleteSystem();
  }
})();

/* ===== Solvent Delete: Lightweight Post-Render Attachment ===== */
(function () {
  'use strict';

  // Adds a delete button to any element with data-task-id if it doesn’t have one yet
  function attachTaskButtons(root = document) {
    root.querySelectorAll('[data-task-id]').forEach(row => {
      if (!row.querySelector('.btn-delete-task')) {
        const taskId = row.getAttribute('data-task-id');
        if (!taskId) return;
        const btn = document.createElement('button');
        btn.className = 'btn-delete-task';
        btn.title = 'Delete task';
        btn.setAttribute('aria-label', `Delete task ${taskId}`);
        btn.dataset.taskId = taskId;
        btn.textContent = '✖';
        row.appendChild(btn);
      }
    });
  }

  // Adds a delete button to any card header inside a [data-card-id] card
  function attachCardButtons(root = document) {
    root.querySelectorAll('[data-card-id]').forEach(card => {
      const header = card.querySelector('.card-header') || card;
      if (!header.querySelector('.btn-delete-card')) {
        const cardId = card.getAttribute('data-card-id');
        if (!cardId) return;
        const btn = document.createElement('button');
        btn.className = 'btn-delete-card';
        btn.title = 'Delete card';
        btn.setAttribute('aria-label', `Delete card ${cardId}`);
        btn.dataset.cardId = cardId;
        btn.textContent = 'Delete';
        header.appendChild(btn);
      }
    });
  }

  function attachAll() {
    attachTaskButtons(document);
    attachCardButtons(document);
  }

  // Monkey‑patch your renderers (if present) to attach buttons after each render
  function wrapIfExists(name) {
    const fn = window[name];
    if (typeof fn !== 'function') return;
    window[name] = function wrappedRender() {
      const result = fn.apply(this, arguments);
      // Give DOM a tick to finish updates, then attach
      setTimeout(attachAll, 0);
      return result;
    };
  }

  // Run once on load and also patch renders
  function init() {
    attachAll();
    wrapIfExists('renderPlan');
    wrapIfExists('renderDeck');
    wrapIfExists('renderCards');
    wrapIfExists('renderTasks');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();


