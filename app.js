
(function(){
  // ---------- Utility ----------
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  // ---- Local-only date helpers (no UTC drift) ----
  const pad2 = n => (n < 10 ? '0' + n : '' + n);

  // Return YYYY-MM-DD in local time
  const fmtLocalDate = (dateObj) => {
    const y = dateObj.getFullYear();
    const m = pad2(dateObj.getMonth() + 1);
    const d = pad2(dateObj.getDate());
    return `${y}-${m}-${d}`;
  };

  // Parse YYYY-MM-DD as local date (00:00 local)
  const parseLocalDate = (ymd) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  };

  // Monday as start of week, returns Date (local)
  const startOfWeek = (d = new Date()) => {
    const day = d.getDay(); // Sun=0 .. Sat=6
    const diff = (day === 0 ? -6 : 1) - day; // shift to Monday
    const monday = new Date(d);
    monday.setHours(0, 0, 0, 0);
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

  // ---------- App State ----------
  const defaultState = {
    user: { name: "Momo Kromah", role: "Lecturer & Researcher" },
    settings: { weeklyCapacityHours: 8 },
    aces: {
      spades: { title: "", metrics: [] },
      clubs: { title: "", metrics: [] },
      hearts: { title: "", metrics: [] },
      diamonds: { title: "", metrics: [] },
    },
    strategics: {
      spades: [{ title: "", due: "" }, { title: "", due: "" }],
      clubs: [{ title: "", due: "" }, { title: "", due: "" }],
      hearts: [{ title: "", due: "" }, { title: "", due: "" }],
      diamonds: [{ title: "", due: "" }, { title: "", due: "" }],
    },
    habits: {
      spades: [], clubs: [], hearts: [], diamonds: []
    },
    deck: [],
    draw: { weekStart: null, selected: [] },
    plan: { weekStart: null, tasks: [] },
    log: { tasks: {} }
  };

  const save = () => localStorage.setItem('solventDeckState', JSON.stringify(state));
  const load = () => {
    try { return JSON.parse(localStorage.getItem('solventDeckState')) || null } catch(e){ return null }
  }
  let state = load() || structuredClone(defaultState);

  // v0.3 / v0.3.1 runtime flags
  let _dndBound = false;  // bind drag/drop once
  let _copyMode = false;  // true when Alt is held

  // ---------- Navigation ----------
  function showSection(id){
    $$('.section').forEach(s => s.classList.remove('visible'));
    const el = document.getElementById(id);
    if(el) el.classList.add('visible');

    if(id==='aces') renderAceEditor();
    if(id==='strategics') renderStrategicEditor();
    if(id==='habits') renderHabitEditor();
    if(id==='draw') renderDraw();
    if(id==='plan') renderPlan();
    if(id==='today') renderToday();
    if(id==='deck') renderDeck();
    if(id==='review') renderReview();
    if(id==='insights') renderInsights();
  }

  const topNav = $('#topNav');
  if (topNav) {
    topNav.addEventListener('click', (e)=>{
      if(e.target.matches('button[data-section]')){
        showSection(e.target.getAttribute('data-section'));
      }
    });
  }
  $$('#main [data-goto]').forEach(btn => btn.addEventListener('click', (e)=>{
    const t = e.currentTarget.getAttribute('data-goto');
    showSection(t);
  }));

  const beginBtn = $('#beginBtn');
  if (beginBtn) beginBtn.addEventListener('click', ()=> showSection('how'));

  const seedBtn = $('#seedBtn');
  if (seedBtn) seedBtn.addEventListener('click', ()=>{
    seedExample();
    alert('Example deck loaded. Jumping to Weekly Draw.');
    showSection('draw');
  });

  // ---------- Editors ----------
  const suits = ['spades','clubs','hearts','diamonds'];
  const suitMeta = {
    spades: { icon:'♠', name:'Spades', color:'suit-spades' },
    clubs: { icon:'♣', name:'Clubs', color:'suit-clubs' },
    hearts: { icon:'♥', name:'Hearts', color:'suit-hearts' },
    diamonds: { icon:'♦', name:'Diamonds', color:'suit-diamonds' },
  };

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
      const t1 = $('#ace-'+s);
      const t2 = $('#ace-'+s+'-metrics');
      if (t1) t1.addEventListener('input', (e)=>{ state.aces[s].title = e.target.value; save(); });
      if (t2) t2.addEventListener('input', (e)=>{ state.aces[s].metrics = e.target.value.split(',').map(x=>x.trim()).filter(Boolean); save(); });
    });
  }

  function renderStrategicEditor(){
    const root = $('#strategicEditor');
    if(!root) return;
    root.innerHTML = '';
    suits.forEach(s => {
      const wrap = document.createElement('div');
      wrap.className = 'card';
      const aceT = state.aces[s].title || '(set your Ace first)';
      const rows = state.strategics[s].map((st, i)=>{
        return `
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
        </div>`;
      }).join('');
      wrap.innerHTML = `
        <div class="suit-badge ${suitMeta[s].color}">${suitMeta[s].icon} ${suitMeta[s].name}</div>
        <div class="label">Ace: ${aceT}</div>
        ${rows}
      `;
      root.appendChild(wrap);
    });

    suits.forEach(s => state.strategics[s].forEach((_, i)=>{
      const t = $('#strategic-'+s+'-'+i+'-title');
      const d = $('#strategic-'+s+'-'+i+'-due');
      const m = $('#strategic-'+s+'-'+i+'-mins');
      if (t) t.addEventListener('input', (e)=>{ state.strategics[s][i].title = e.target.value; save(); });
      if (d) d.addEventListener('change', (e)=>{ state.strategics[s][i].due = e.target.value; save(); });
      if (m) d.addEventListener('change', (e)=>{ state.strategics[s][i].mins = parseInt(e.target.value||60,10); save(); });
    }));
  }

  const habitTemplates = {
    spades: [
      { title: 'Write 300 words', cadence:'daily', duration:25 },
      { title: 'Two research sprints', cadence:'2x', duration:45 },
      { title: 'Read one seminal paper', cadence:'weekly', duration:30 },
      { title: 'Outline next module', cadence:'weekly', duration:30 }
    ],
    clubs: [
      { title: '10k steps', cadence:'daily', duration:40 },
      { title: 'Protein at each meal', cadence:'daily', duration:10 },
      { title: 'Lights out 10pm', cadence:'daily', duration:5 },
      { title: 'Mobility 10 min', cadence:'daily', duration:10 }
    ],
    hearts: [
      { title: 'Share three appreciations', cadence:'daily', duration:10 },
      { title: 'Weekly partner meeting', cadence:'weekly', duration:45 },
      { title: '1:1 with child', cadence:'weekly', duration:30 },
      { title: 'Call a mentor', cadence:'weekly', duration:20 }
    ],
    diamonds: [
      { title: 'Track daily expenses', cadence:'daily', duration:8 },
      { title: 'DCA invest', cadence:'weekly', duration:15 },
      { title: 'Review budget', cadence:'weekly', duration:20 },
      { title: 'Draft offer asset', cadence:'weekly', duration:30 }
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
        <div class="grid grid-2">${templates.map((t, idx)=>{
          const id = `hab-${s}-${idx}`;
          const isChecked = selected.some(h=>h.title===t.title);
          const cadenceLbl = t.cadence==='daily'?'Daily':(t.cadence==='2x'?'Tue/Fri':'Weekly');
          return `<label class="card-chip"><input type="checkbox" id="${id}" ${isChecked?'checked':''}> <span class="title">${t.title}</span><span class="meta">${cadenceLbl} · ${t.duration}m</span></label>`
        }).join('')}</div>
      `;
      root.appendChild(wrap);

      templates.forEach((t, idx)=>{
        const box = $('#hab-'+s+'-'+idx);
        if (!box) return;
        box.addEventListener('change', (e)=>{
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

  // ---------- Weekly Draw ----------
  function buildDeck(){
    const deck = [];
    suits.forEach(s => {
      const ace = state.aces[s];
      if(ace.title) deck.push({ id: 'A-'+s, suit:s, rank:'A', title: ace.title });
      const st = state.strategics[s];
      st.forEach((row, i)=>{
        if(row.title){ deck.push({ id: (i===0?'K':'Q')+'-'+s, suit:s, rank:(i===0?'K':'Q'), title: row.title, due: row.due, mins: row.mins||60 }); }
      });
      (state.habits[s]||[]).forEach((h, j)=>{
        deck.push({ id: 'H-'+s+'-'+j, suit:s, rank: j===0?'J':'10', title: h.title, cadence:h.cadence, duration:h.duration });
      });
    });
    state.deck = deck;
    save();
  }

  function drawWeekly(){
    buildDeck();
    const countSel = $('#drawCount');
    const perDomain = $('#minPerDomain');
    const count = countSel ? parseInt(countSel.value,10) : 4;
    const ensureBalance = perDomain ? perDomain.checked : true;
    const pool = state.deck.filter(c => c.rank!=='A');
    const bySuit = { spades:[], clubs:[], hearts:[], diamonds:[] };
    pool.forEach(c => bySuit[c.suit].push(c));

    const selected = [];
    if(ensureBalance){
      suits.forEach(s => {
        if(bySuit[s].length>0 && selected.length<count){
          selected.push(bySuit[s][Math.floor(Math.random()*bySuit[s].length)]);
        }
      });
    }
    while(selected.length < count && pool.length>0){
      const c = pool.splice(Math.floor(Math.random()*pool.length), 1)[0];
      if(!selected.find(x=>x.id===c.id)) selected.push(c);
    }

    const weekStartDate = startOfWeek(new Date());
    state.draw = { weekStart: fmtLocalDate(weekStartDate), selected: selected.map(c=>c.id) };
    save();

    renderDraw();
  }

  function renderDraw(){
    buildDeck();
    const root = $('#drawResult');
    if(!root) return;
    root.innerHTML = '';
    const selectedIds = state.draw.selected || [];
    const selected = state.deck.filter(c => selectedIds.includes(c.id));
    const renderCard = (c) => `
      <div class="card">
        <div class="meta"><span class="suit-badge ${suitMeta[c.suit].color}">${suitMeta[c.suit].icon} ${suitMeta[c.suit].name} — ${c.rank}</span></div>
        <div class="title">${c.title}</div>
      </div>`;

    if(selected.length===0){
      root.innerHTML = '<div class="muted">No cards selected yet. Click "Draw my cards".</div>';
    } else {
      root.innerHTML = selected.map(renderCard).join('');
    }
  }

  const drawBtn = $('#drawBtn');
  if (drawBtn) drawBtn.addEventListener('click', drawWeekly);

  const genPlanBtn = $('#genPlanBtn');
  if (genPlanBtn) genPlanBtn.addEventListener('click', ()=>{ generatePlan(); showSection('plan'); });

  // ---------- Plan: generate + render ----------
  function generatePlan(){
    buildDeck();

    const weekStart = state.draw?.weekStart || fmtLocalDate(startOfWeek(new Date()));
    const selectedIds = Array.isArray(state.draw?.selected) ? state.draw.selected : [];

    if (!selectedIds.length) {
      alert('No cards selected for this week yet.\n\nGo to Weekly Draw and click “🎴 Draw my cards”, then try “Generate Weekly Plan”.');
      showSection('draw');
      return;
    }

    const selected = state.deck.filter(c => selectedIds.includes(c.id));
    const tasks = [];

    selected.forEach(c => {
      if (['K','Q'].includes(c.rank)) {
        // Strategic milestone (Wed)
        const date = fmtLocalDate(addDays(parseLocalDate(weekStart), 2));
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
        // Habits by cadence
        let days = [];
        if (c.cadence === 'daily') days = [0,1,2,3,4]; // Mon–Fri
        else if (c.cadence === '2x') days = [1,4];     // Tue, Fri
        else days = [2];                                // Weekly -> Wed

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

  function renderPlan(){
    const root = $('#planGrid');
    if(!root) return;
    root.innerHTML = '';

    const weekStart = state.plan.weekStart || fmtLocalDate(startOfWeek(new Date()));
    const tasks = state.plan.tasks || [];

    // Build day buckets Mon..Sun
    const perDay = [0,1,2,3,4,5,6].map(i => ({
      date: fmtLocalDate(addDays(parseLocalDate(weekStart), i)),
      tasks: []
    }));

    tasks.forEach(t => {
      const dt = parseLocalDate(t.date);
      const day = dt.getDay();           // Sun=0..Sat=6
      const idx = (day + 6) % 7;         // Mon=0..Sun=6
      perDay[idx].tasks.push(t);
    });

    // Capacity banner
    const totalMins = tasks.reduce((a,b)=>a+(b.duration||0),0);
    const capMins = (state.settings.weeklyCapacityHours||8)*60;
    const usage = Math.round((totalMins/capMins)*100);
    const banner = `Capacity used: ${Math.round(totalMins/60)}h (${usage}%) of ${state.settings.weeklyCapacityHours}h`;
    const capEl = $('#capacityBanner');
    if (capEl) capEl.innerText = banner;

    // Render columns and tasks
    const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    perDay.forEach((d, i) => {
      const col = document.createElement('div');
      col.className = 'day-col';
      col.dataset.date = d.date;
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

    // Bind once — drag/drop + inline edit + copy mode
    if (!_dndBound) {
      _dndBound = true;

      // Alt toggles copy mode (visual hint)
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Alt') { _copyMode = true; document.body.classList.add('copy-mode'); }
      });
      document.addEventListener('keyup', (e) => {
        if (e.key === 'Alt') { _copyMode = false; document.body.classList.remove('copy-mode'); }
      });

      // DRAG START/END on tasks
      root.addEventListener('dragstart', (e) => {
        const taskEl = e.target.closest('.task');
        if (!taskEl) return;

        e.dataTransfer.effectAllowed = 'copyMove';

        const isCopy = _copyMode || !!e.altKey;
        e.dataTransfer.setData('text/task-id', taskEl.dataset.taskId);
        e.dataTransfer.setData('text/copy', isCopy ? '1' : '0');

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

        const taskId = e.dataTransfer.getData('text/task-id');
        const copyMeta = e.dataTransfer.getData('text/copy');
        const isCopy = (copyMeta === '1') || _copyMode;
        if (!taskId) return;

        const newDate = col.dataset.date;
        const t = (state.plan.tasks||[]).find(x => x.id === taskId);
        if (!t) return;

        if (isCopy) {
          const newId = 't-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
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

        input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') commit(); else if (ev.key === 'Escape') cancel(); });
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
        input.type = 'number'; input.min = '5'; input.max = '240'; input.step = '5';
        input.value = t.duration || 20;

        durEl.replaceWith(input);
        input.focus(); input.select();

        const commit = () => {
          const val = parseInt(input.value, 10);
          if (!isNaN(val) && val > 0) { t.duration = Math.max(5, Math.min(240, val)); save(); renderPlan(); }
          else { renderPlan(); }
        };
        const cancel = () => renderPlan();

        input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') commit(); else if (ev.key === 'Escape') cancel(); });
        input.addEventListener('blur', commit);
      });

      // MARK DONE
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
        <div><I’ve got you, Momo. Let’s stop the back‑and‑forth and put everything into a **single, clean, working baseline** so you’re back in control—no hunting for functions, no guessing.

Below is a **“golden state”** you can paste exactly as-is:

- a complete, corrected **`index.html`** (all sections, correct CSS/JS tags)  
- a complete, unified **`app.js`** that includes:
  - timezone‑safe dates (no Tuesday collapsing),
  - **Weekly Draw → Generate Weekly Plan** (with an empty‑selection guard),
  - **drag‑to‑move**,
  - **Alt‑drag‑to‑copy**,
  - **inline edit** for title and minutes,
  - capacity recalculation,
  - and the Reset button support.

Your **`styles.css`** can stay as you have it (including the v0.3 and v0.3.1 snippets you already added). I’ll also re‑include the tiny CSS for copy‑cursor at the end in case it didn’t get added.

---

## 0) What you’ll do (2 quick steps)

1) Replace the **entire contents** of `index.html` with the version below.  
2) Replace the **entire contents** of `app.js` with the version below.  

Then wait ~30–60 seconds for GitHub Pages to republish, and do a **hard refresh** (Cmd/Ctrl + Shift + R).

---

## 1) Drop‑in `index.html` (full, correct)

> In GitHub, open `index.html` → paste everything below → **Commit changes**.

```html
<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />

  <title>Solvent Deck — 52‑Goal Digital Platform (Prototype)</title>
  <meta name="description" content="Design a balanced life across Career, Health & Fitness, Relationships, and Finances—one card at a time. Draw weekly focus, plan, and review." />

  <!-- Open Graph / Twitter -->
  <meta property="og:title" content="Solvent Deck — 52‑Goal Digital Platform" />
  <meta property="og:description" content="A playful system to align Aces (identity), Kings/Queens (strategy), and J–2 (habits). Draw weekly and compound progress." />
  <meta property="og:type" content="website" />
  <meta property="og:image" content="https://dmkromah.github.io/solvent-deck/favicon.svg" />
  <meta property="og:url" content="https://dmkromah.github.io/solvent-deck/" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="Solvent Deck — 52‑Goal Digital Platform" />
  <meta name="twitter:description" content="Draw weekly focus cards and turn them into a simple plan." />
  <meta name="twitter:image" content="https://dmkromah.github.io/solvent-deck/favicon.svg" />

  <!-- Favicon -->
  favicon.svg

  <!-- Styles -->
  styles.css
</head>
<body>
  <!-- Skip link for keyboard users -->
  #mainSkip to main content</a>

  <header class="app-header" role="banner">
    <div class="brand" aria-label="Solvent Deck brand">
      favicon.svg
      <div class="title">Solvent Deck</div>
    </div>

    <nav class="top-nav" id="topNav" role="navigation" aria-label="Primary">
      <button data-section="welcome">Welcome</button>
      <button data-section="how">How It Works</button>
      <button data-section="domains">Domains</button>
      <button data-section="aces">Aces</button>
      <button data-section="strategics">K/Q</button>
      <button data-section="habits">J–2</button>
      <button data-section="draw">Weekly Draw</button>
      <button data-section="plan">Weekly Plan</button>
      <button data-section="today">Today</button>
      <button data-section="deck">Deck</button>
      <button data-section="review">Review</button>
      <button data-section="insights">Insights</button>
      <button data-section="settings">Settings</button>
    </nav>
  </header>

  <main id="main" role="main" tabindex="-1">
    <!-- Welcome -->
    <section id="welcome" class="section visible" aria-labelledby="welcome-h1">
      <div class="hero">
        <h1 id="welcome-h1">Design a life aligned with who you're becoming — one card at a time.</h1>
        <p class="subtitle">
          This is a low‑fidelity prototype to demonstrate the flow.
          Build your deck, draw weekly focus cards, and turn them into a simple plan.
        </p>
        <div class="actions">
          <button class="primary" id="beginBtn" aria-describedby="welcome-hint">Begin Your Deck</button>
          <button id="seedBtn" aria-label="Load a complete example deck for demo">Load Example Deck</button>
        </div>
        <p id="welcome-hint" class="small muted">Tip: Use “Load Example Deck” for a quick tour.</p>
      </div>
    </section>

    <!-- How it works -->
    <section id="how" class="section" aria-labelledby="how-h2">
      <div class="card info">
        <h2 id="how-h2">How the Deck Works</h2>
        <ol>
          <li><strong>Aces</strong> — transformational identity shifts (3–10 years)</li>
          <li><strong>Kings & Queens</strong> — strategic projects (semester–year)</li>
          <li><strong>J–2</strong> — weekly/daily habits that compound</li>
          <li><strong>Weekly Draw</strong> — pick 3–5 to focus your week</li>
          <li><strong>Plan & Review</strong> — make progress, reflect, iterate</li>
        </ol>
        <p class="muted">Suits: ♠ Career · ♣ Health & Fitness · ♥ Relationships · ♦ Finances</p>
      </div>
    </section>

    <!-- Domains -->
    <section id="domains" class="section" aria-labelledby="domains-h2">
      <h2 id="domains-h2">Domains (Suits)</h2>
      <div class="grid grid-2">
        <div class="card domain">
          <h3>♠ Spades — Career</h3>
          <p>Growth, mastery, contribution</p>
        </div>
        <div class="card domain">
          <h3>♣ Clubs — Health & Fitness</h3>
          <p>Vitality, energy, resilience</p>
        </div>
        <div class="card domain">
          <h3>♥ Hearts — Relationships</h3>
          <p>Students, colleagues, collaborators, family</p>
        </div>
        <div class="card domain">
          <h3>♦ Diamonds — Finances</h3>
          <p>Grants, sustainability, freedom</p>
        </div>
      </div>
      <div class="actions">
        <button class="primary" data-goto="aces">Let's build your deck</button>
      </div>
    </section>

    <!-- Aces -->
    <section id="aces" class="section" aria-labelledby="aces-h2">
      <h2 id="aces-h2">Create Your Aces</h2>
      <p class="muted">Identity-level ambitions per domain. Keep them bold and measurable.</p>
      <div class="grid grid-2" id="aceEditor" aria-live="polite"></div>
      <div class="actions">
        <button class="primary" data-goto="strategics">Save Aces & Continue</button>
      </div>
    </section>

    <!-- Strategics -->
    <section id="strategics" class="section" aria-labelledby="strategics-h2">
      <h2 id="strategics-h2">Strategic Projects (Kings & Queens)</h2>
      <p class="muted">Two per domain. Add finish lines and simple milestones.</p>
      <div id="strategicEditor" aria-live="polite"></div>
      <div class="actions">
        <button class="primary" data-goto="habits">Save Strategics & Continue</button>
      </div>
    </section>

    <!-- Habits -->
    <section id="habits" class="section" aria-labelledby="habits-h2">
      <h2 id="habits-h2">Tactical Habits (J–2)</h2>
      <p class="muted">Pick 3 starter habits per domain to keep onboarding light. You can add more later.</p>
      <div id="habitEditor" aria-live="polite"></div>
      <div class="actions">
        <button class="primary" data-goto="draw">Save Habits & Go to Draw</button>
      </div>
    </section>

    <!-- Weekly Draw -->
    <section id="draw" class="section" aria-labelledby="draw-h2">
      <h2 id="draw-h2">Weekly Draw</h2>
      <p class="small muted">Hint: Keep “min 1 per domain” on for a balanced week.</p>
      <div class="controls">
        <label><input type="checkbox" id="minPerDomain" checked> Ensure at least 1 per domain</label>
        <label>Number of cards:
          <select id="drawCount">
            <option>3</option>
            <option selected>4</option>
            <option>5</option>
          </select>
        </label>
        <button class="primary" id="drawBtn">🎴 Draw my cards</button>
      </div>
      <div id="drawResult" class="grid grid-4" aria-live="polite"></div>
      <div class="actions">
        <button class="primary" id="genPlanBtn">Generate Weekly Plan</button>
      </div>
    </section>

    <!-- Weekly Plan -->
    <section id="plan" class="section" aria-labelledby="plan-h2">
      <h2 id="plan-h2">Weekly Plan</h2>
      <p class="small muted">
        Hint: You can mark tasks done here or in <strong>Today</strong>. 
        <strong>Hold Alt while dragging</strong> to copy a task.
      </p>
      <p class="muted" id="capacityBanner">Capacity: —</p>
      <div id="planGrid" class="plan-grid" aria-live="polite"></div>
      <div class="actions">
        <button class="primary" data-goto="today">Approve Plan & Go to Today</button>
      </div>
    </section>

    <!-- Today -->
    <section id="today" class="section" aria-labelledby="today-h2">
      <h2 id="today-h2">Today</h2>
      <div id="todayList" class="list" aria-live="polite"></div>
    </section>

    <!-- Deck -->
    <section id="deck" class="section" aria-labelledby="deck-h2">
      <h2 id="deck-h2">Your Deck</h2>
      <div id="deckView" aria-live="polite"></div>
      <div class="actions">
        <button id="exportBtn">Export Deck JSON</button>
        <a id="downloadLink" style="display:none;">Download</a>
      </div>
    </section>

    <!-- Review -->
    <section id="review" class="section" aria-labelledby="review-h2">
      <h2 id="review-h2">Weekly Review</h2>
      <div id="reviewView" aria-live="polite"></div>
      <div class="actions">
        <button id="newWeekBtn" data-goto="draw">Draw Next Week</button>
      </div>
    </section>

    <!-- Insights -->
    <section id="insights" class="section" aria-labelledby="insights-h2">
      <h2 id="insights-h2">Insights</h2>
      <div id="insightsView" aria-live="polite"></div>
    </section>

    <!-- Settings -->
    <section id="settings" class="section" aria-labelledby="settings-h2">
      <h2 id="settings-h2">Settings</h2>
      <div class="controls">
        <label>Weekly capacity (hours): <input type="number" id="capHours" value="8" min="1" max="40"></label>
        <button id="saveSettingsBtn">Save</button>
        <button id="resetBtn" class="danger" aria-label="Reset the app to factory state">Reset data</button>
      </div>
    </section>
  </main>

  <footer class="app-footer" role="contentinfo">
    <small>Prototype v0.3.1 • LocalStorage only • No external libs</small>
  </footer>

  <!-- Scripts -->
  app.js</script>
</body>
</html>
