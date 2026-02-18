
(function(){
  // ========= Tiny DOM helpers =========
  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  // ========= Local-time date helpers (no UTC drift) =========
  const pad2 = n => (n < 10 ? '0' + n : '' + n);

  const fmtLocalDate = (dateObj) => {
    const y = dateObj.getFullYear();
    const m = pad2(dateObj.getMonth() + 1);
    const d = pad2(dateObj.getDate());
    return `${y}-${m}-${d}`;
  };

  const parseLocalDate = (ymd) => {
    const [y, m, d] = (ymd || '').split('-').map(Number);
    return new Date(y || 1970, (m||1) - 1, d || 1, 0, 0, 0, 0);
  };

  const startOfWeek = (d = new Date()) => {
    const day = d.getDay(); // Sun=0 .. Sat=6
    const diff = (day === 0 ? -6 : 1) - day; // shift to Monday
    const monday = new Date(d);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() + diff);
    return monday;
  };

  const addDays = (d, n) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };

  // ========= App State =========
  const defaultState = {
    settings: { weeklyCapacityHours: 8 },
    aces:     { spades:{}, clubs:{}, hearts:{}, diamonds:{} },
    strategics: { spades:[{},{}], clubs:[{},{}], hearts:[{},{}], diamonds:[{},{}] },
    habits:   { spades:[], clubs:[], hearts:[], diamonds:[] },
    deck: [],
    draw: { weekStart: null, selected: [] },
    plan: { weekStart: null, tasks: [] }
  };

  const save = () => localStorage.setItem('solventDeckState', JSON.stringify(state));
  const load = () => {
    try { return JSON.parse(localStorage.getItem('solventDeckState')) || null; }
    catch(e){ return null; }
  };
  let state = load() || structuredClone(defaultState);

  // runtime flags
  let _dndBound = false;
  let _copyMode = false;

  // ========= Suits =========
  const suits = ['spades','clubs','hearts','diamonds'];
  const suitMeta = {
    spades:   { icon:'♠', name:'Spades',   color:'suit-spades'   },
    clubs:    { icon:'♣', name:'Clubs',    color:'suit-clubs'    },
    hearts:   { icon:'♥', name:'Hearts',   color:'suit-hearts'   },
    diamonds: { icon:'♦', name:'Diamonds', color:'suit-diamonds' },
  };

  // ========= Navigation with guards (prevents freezes) =========
  function showSection(id){
    $$('.section').forEach(s => s.classList.remove('visible'));
    const el = document.getElementById(id);
    if (el) el.classList.add('visible');

    if (id==='draw'     && typeof renderDraw      === 'function') renderDraw();
    if (id==='plan'     && typeof renderPlan      === 'function') renderPlan();
    if (id==='today'    && typeof renderToday     === 'function') renderToday();
    if (id==='deck'     && typeof renderDeck      === 'function') renderDeck();
    if (id==='review'   && typeof renderReview    === 'function') renderReview();
    if (id==='insights' && typeof renderInsights  === 'function') renderInsights();
    if (id==='aces'     && typeof renderAceEditor === 'function') renderAceEditor?.();
    if (id==='strategics'&& typeof renderStrategicEditor==='function') renderStrategicEditor?.();
    if (id==='habits'   && typeof renderHabitEditor==='function') renderHabitEditor?.();
  }

  // top nav binding
  const topNav = $('#topNav');
  if (topNav) {
    topNav.addEventListener('click', (e)=>{
      if (e.target.matches('button[data-section]')) {
        showSection(e.target.getAttribute('data-section'));
      }
    });
  }

  // seed example button (Welcome)
  $('#seedBtn')?.addEventListener('click', ()=>{
    seedExample();
    alert('Example deck loaded. Jumping to Weekly Draw.');
    showSection('draw');
  });

  // ========= Build Deck from current Aces/Strategics/Habits =========
  function buildDeck(){
    const deck = [];
    suits.forEach(s => {
      const ace = state.aces[s];
      if (ace && ace.title) deck.push({ id:'A-'+s, suit:s, rank:'A', title: ace.title });

      (state.strategics[s]||[]).forEach((row, i)=>{
        if (row && row.title) {
          deck.push({
            id: (i===0?'K':'Q')+'-'+s,
            suit:s,
            rank:(i===0?'K':'Q'),
            title: row.title,
            due: row.due,
            mins: row.mins||60
          });
        }
      });

      (state.habits[s]||[]).forEach((h, j)=>{
        if (h && h.title) {
          deck.push({
            id: 'H-'+s+'-'+j,
            suit:s,
            rank: j===0 ? 'J' : '10',
            title: h.title,
            cadence:h.cadence,
            duration:h.duration||20
          });
        }
      });
    });
    state.deck = deck;
    save();
  }

  // ========= Empty-deck helper (used by Draw) =========
  function showEmptyDeckMessage(show){
    const box = document.getElementById('drawEmptyMsg');
    if (!box) return;
    box.style.display = show ? 'block' : 'none';
  }
  function wireEmptyDeckActions(){
    const btnExample = document.getElementById('emptyLoadExample');
    const btnAces    = document.getElementById('emptyGotoAces');
    if (btnExample) btnExample.addEventListener('click', ()=>{
      try {
        seedExample();
        alert('Example deck loaded. You can now draw your cards.');
        showSection('draw');
      } catch(e) {
        console.error('[EmptyDeck] seedExample error:', e);
        alert('Could not load the example deck. Please refresh and try again.');
      }
    });
    if (btnAces) btnAces.addEventListener('click', ()=> showSection('aces'));
  }
  wireEmptyDeckActions();

  // ========= Weekly Draw (known-good) =========
  function drawWeekly(){
    buildDeck();

    const countSel = $('#drawCount');
    const perDomain = $('#minPerDomain');
    const count = countSel ? parseInt(countSel.value,10) : 4;
    const ensureBalance = perDomain ? perDomain.checked : true;

    const deck = Array.isArray(state.deck) ? state.deck : [];
    const pool = deck.filter(c => c && c.rank !== 'A');

    if (!pool.length) {
      showEmptyDeckMessage(true);
      const root = $('#drawResult');
      if (root) root.innerHTML = '<div class="muted">No cards yet. Load the example deck or add cards in Aces / Strategics / Habits.</div>';
      return;
    }
    showEmptyDeckMessage(false);

    const bySuit = { spades:[], clubs:[], hearts:[], diamonds:[] };
    pool.forEach(c => { if (bySuit[c.suit]) bySuit[c.suit].push(c); });

    const selected = [];
    if (ensureBalance){
      suits.forEach(s => {
        if (bySuit[s].length > 0 && selected.length < count){
          selected.push(bySuit[s][Math.floor(Math.random()*bySuit[s].length)]);
        }
      });
    }
    const poolCopy = pool.slice();
    while (selected.length < count && poolCopy.length > 0){
      const c = poolCopy.splice(Math.floor(Math.random()*poolCopy.length), 1)[0];
      if (!selected.find(x => x.id === c.id)) selected.push(c);
    }

    const weekStartDate = startOfWeek(new Date());
    state.draw = { weekStart: fmtLocalDate(weekStartDate), selected: selected.map(c=>c.id) };
    save();

    try { renderDraw(); } catch (err) { console.error('[Draw] render error:', err); }
  }

  function renderDraw(){
    buildDeck();

    const root = $('#drawResult');
    if (!root) return;
    root.innerHTML = '';

    const selectedIds = (state.draw && Array.isArray(state.draw.selected)) ? state.draw.selected : [];
    const deck = Array.isArray(state.deck) ? state.deck : [];

    if (!selectedIds.length) {
      const poolNow = deck.filter(c => c && c.rank !== 'A');
      showEmptyDeckMessage(poolNow.length === 0);
      root.innerHTML = '<div class="muted">No cards selected yet. Click "Draw my cards".</div>';
      return;
    }

    const selected = deck.filter(c => selectedIds.includes(c.id));
    const renderCard = (c) => `
      <div class="card">
        <div class="meta">
          <span class="suit-badge ${suitMeta[c.suit].color}">
            ${suitMeta[c.suit].icon} ${c.rank}
          </span>
        </div>
        <div class="title">${c.title}</div>
      </div>`;
    root.innerHTML = selected.length
      ? selected.map(renderCard).join('')
      : '<div class="muted">No cards selected yet. Click "Draw my cards".</div>';
  }

  // Bind Draw button (defensive)
  const drawBtn = $('#drawBtn');
  if (drawBtn) {
    drawBtn.addEventListener('click', () => {
      try { drawWeekly(); }
      catch (err) {
        console.error('[Draw] error:', err);
        alert('Something went wrong drawing cards. I will reload the page so you can try again.');
        location.reload();
      }
    });
  }

  // ========= Plan (with Delete + Alt-copy + inline edit + summary guard) =========
  function renderPlanSummary(){
    const box = document.getElementById('planSummary');
    if (!box) return;
    const tasks = (state.plan && Array.isArray(state.plan.tasks)) ? state.plan.tasks : [];
    const totalMins = tasks.reduce((a,b)=> a+(b.duration||0), 0);
    const totalHours = Math.round((totalMins/60)*10)/10;
    const capHrs = state.settings?.weeklyCapacityHours || 8;
    const capMins = capHrs*60;
    const usage = capMins ? Math.round((totalMins/capMins)*100) : 0;

    const counts = { spades:0, clubs:0, hearts:0, diamonds:0 };
    tasks.forEach(t => { if (counts[t.suit]!==undefined) counts[t.suit]++; });

    let usageClass = 'badge-ok';
    if (usage >= 90) usageClass='badge-high';
    else if (usage >= 70) usageClass='badge-warn';

    let hint = 'Looks balanced. Aim for small, meaningful steps.';
    const vals = Object.values(counts);
    const max = Math.max(...vals,0), min = Math.min(...vals,0);
    if (usage >= 95) hint = 'This looks heavy—consider reducing durations or moving a card.';
    else if (usage <= 40) hint = 'Plenty of capacity left—consider adding one helpful habit.';
    else if (max - min >= 3) hint = 'One suit dominates—check if that’s intentional this week.';

    box.innerHTML = `
      <div class="summary-top">
        <div class="summary-title">Weekly Summary</div>
        <div class="summary-stats">
          <span class="stat"><span class="k">Time:</span> ${totalMins}m (${totalHours}h)</span>
          <span class="stat"><span class="k">Capacity:</span> ${capHrs}h</span>
          <span class="stat"><span class="k">Usage:</span> <span class="badge-usage ${usageClass}">${usage}%</span></span>
        </div>
      </div>
      <div class="summary-suits">
        <span class="suit-pill">♠ <span class="count">${counts.spades}</span></span>
        <span class="suit-pill">♣ <span class="count">${counts.clubs}</span></span>
        <span class="suit-pill">♥ <span class="count">${counts.hearts}</span></span>
        <span class="suit-pill">♦ <span class="count">${counts.diamonds}</span></span>
      </div>
      <div class="summary-hint">${hint}</div>
    `;
  }

  function deleteTaskById(taskId){
    try {
      if (!state?.plan?.tasks) return;
      state.plan.tasks = state.plan.tasks.filter(t => t.id !== taskId);
      save(); renderPlan();
    } catch (err) {
      console.error('[DeleteTask] error:', err);
      alert('Could not delete the task. Please refresh and try again.');
    }
  }

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
        const date = fmtLocalDate(addDays(parseLocalDate(weekStart), 2)); // Wed
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
        let days = [];
        if (c.cadence === 'daily')      days = [0,1,2,3,4];
        else if (c.cadence === '2x')    days = [1,4];
        else                             days = [2];
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

    // Place tasks
    tasks.forEach(t => {
      const dt = parseLocalDate(t.date);
      const day = dt.getDay();           // Sun=0..Sat=6
      const idx = (day + 6) % 7;         // Mon=0..Sun=6
      perDay[idx].tasks.push(t);
    });

    // Capacity
    const totalMins = tasks.reduce((a,b)=>a+(b.duration||0),0);
    const capMins = (state.settings.weeklyCapacityHours||8)*60;
    const usage = capMins ? Math.round((totalMins/capMins)*100) : 0;
    const banner = `Capacity used: ${Math.round(totalMins/60)}h (${usage}%) of ${state.settings.weeklyCapacityHours||8}h`;
    const capEl = $('#capacityBanner');
    if (capEl) capEl.innerText = banner;

    // Summary card (guarded)
    try { renderPlanSummary(); } catch(e){ console.error('[Summary] render error:', e); }

    // Render columns
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
            <button data-done="${t.id}" class="task-btn">Mark done</button>
            <button data-delete="${t.id}" class="task-btn danger-btn" title="Delete this task">Delete</button>
          </div>`;
        col.appendChild(node);
      });

      root.appendChild(col);
    });

    // Delegated actions (Delete / Done)
    root.onclick = (e) => {
      const delId = e.target?.getAttribute?.('data-delete');
      if (delId) {
        const ok = confirm('Delete this task from the week? This cannot be undone.');
        if (ok) deleteTaskById(delId);
        return;
      }
      const doneId = e.target?.getAttribute?.('data-done');
      if (doneId) {
        const t = (state.plan.tasks||[]).find(x=>x.id===doneId);
        if (t){ t.status = t.status==='done'?'planned':'done'; save(); renderPlan(); }
        return;
      }
    };

    // Drag & Drop – bind once
    if (!_dndBound) {
      _dndBound = true;

      document.addEventListener('keydown', (e)=>{ if (e.key==='Alt'){ _copyMode=true;  document.body.classList.add('copy-mode'); }});
      document.addEventListener('keyup',   (e)=>{ if (e.key==='Alt'){ _copyMode=false; document.body.classList.remove('copy-mode'); }});

      root.addEventListener('dragstart', (e)=>{
        const taskEl = e.target.closest('.task');
        if (!taskEl) return;
        e.dataTransfer.effectAllowed = 'copyMove';
        const isCopy = _copyMode || !!e.altKey;
        e.dataTransfer.setData('text/task-id', taskEl.dataset.taskId);
        e.dataTransfer.setData('text/copy', isCopy ? '1' : '0');
        if (isCopy) taskEl.classList.add('copying');
        taskEl.classList.add('dragging');
      });
      root.addEventListener('dragend', (e)=>{
        const taskEl = e.target.closest('.task');
        if (taskEl) { taskEl.classList.remove('dragging'); taskEl.classList.remove('copying'); }
      });

      root.addEventListener('dragover', (e)=>{
        const col = e.target.closest('.day-col');
        if (!col) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = _copyMode ? 'copy' : 'move';
        col.classList.add('drag-over');
      });
      root.addEventListener('dragleave', (e)=>{
        const col = e.target.closest('.day-col');
        if (col) col.classList.remove('drag-over');
      });

      root.addEventListener('drop', (e)=>{
        const col = e.target.closest('.day-col');
        if (!col) return;
        e.preventDefault();
        col.classList.remove('drag-over');

        const taskId = e.dataTransfer.getData('text/task-id');
        const isCopy = (e.dataTransfer.getData('text/copy') === '1') || _copyMode;
        if (!taskId) return;

        const newDate = col.dataset.date;
        const t = (state.plan.tasks||[]).find(x => x.id === taskId);
        if (!t) return;

        if (isCopy) {
          const newId = 't-' + Date.now() + '-' + Math.floor(Math.random()*1e6);
          const clone = { ...t, id: newId, date: newDate, status:'planned' };
          state.plan.tasks.push(clone);
        } else {
          if (t.date !== newDate) t.date = newDate;
        }
        save(); renderPlan();
      });

      // Inline edit: title
      root.addEventListener('click', (e)=>{
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

        input.addEventListener('keydown', (ev)=>{ if (ev.key==='Enter') commit(); else if (ev.key==='Escape') cancel(); });
        input.addEventListener('blur', commit);
      });

      // Inline edit: duration
      root.addEventListener('click', (e)=>{
        const durEl = e.target.closest('.duration-badge');
        if (!durEl) return;
        const taskId = durEl.dataset.taskId;
        const t = (state.plan.tasks||[]).find(x => x.id === taskId);
        if (!t) return;

        const input = document.createElement('input');
        input.className = 'inline-edit';
        input.type = 'number'; input.min='5'; input.max='240'; input.step='5';
        input.value = t.duration || 20;
        durEl.replaceWith(input);
        input.focus(); input.select();

        const commit = () => {
          const val = parseInt(input.value,10);
          if (!isNaN(val) && val > 0) { t.duration = Math.max(5, Math.min(240, val)); save(); renderPlan(); }
          else { renderPlan(); }
        };
        const cancel = () => renderPlan();

        input.addEventListener('keydown', (ev)=>{ if (ev.key==='Enter') commit(); else if (ev.key==='Escape') cancel(); });
        input.addEventListener('blur', commit);
      });
    }
  }

  // Generate Plan button
  const genPlanBtn = $('#genPlanBtn');
  if (genPlanBtn) genPlanBtn.addEventListener('click', ()=>{
    try { generatePlan(); showSection('plan'); }
    catch (err) {
      console.error('[Plan] error:', err);
      alert('Something went wrong while generating the plan. Please refresh and try again.');
    }
  });

  // ========= Today (minimal) =========
  function renderToday(){
    const root = $('#todayList');
    if(!root) return;
    root.innerHTML = '';
    const today = fmtLocalDate(new Date());
    const tasks = (state.plan.tasks||[]).filter(t => t.date === today);

    if(!tasks.length){ root.innerHTML = '<div class="muted">No tasks scheduled today.</div>'; return; }

    tasks.forEach(t => {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `
        <div>
          <div>${t.title}</div>
          <div class="small">${suitMeta[t.suit].icon} ${t.rank} · ${t.duration}m</div>
        </div>
        <div><button data-done="${t.id}">${t.status==='done'?'Done':'Mark done'}</button></div>`;
      root.appendChild(row);
    });

    root.addEventListener('click', (e)=>{
      const id = e.target.getAttribute?.('data-done');
      if(!id) return;
      const t = (state.plan.tasks||[]).find(x=>x.id===id);
      if(t){ t.status = t.status==='done'?'planned':'done'; save(); renderToday(); }
    });
  }

  // ========= Deck / Review / Insights (minimal renderers) =========
  function renderDeck(){
    buildDeck();
    const root = $('#deckView'); if(!root) return;
    root.innerHTML = '';
    suits.forEach(s => {
      const box = document.createElement('div');
      box.className = 'card';
      box.innerHTML = `<h3>${suitMeta[s].icon} ${suitMeta[s].name}</h3>`;
      const list = state.deck.filter(c=>c.suit===s);
      if(!list.length){ box.innerHTML += '<div class="muted">No cards yet.</div>'; }
      else {
        list.forEach(c => {
          const chip = document.createElement('div');
          chip.className = 'card-chip';
          chip.innerHTML = `
            <div class="meta"><span class="suit-badge ${suitMeta[c.suit].color}">${suitMeta[c.suit].icon} ${c.rank}</span></div>
            <div class="title">${c.title}</div>
            <div class="small">${c.due?('Due '+c.due):''}</div>`;
          box.appendChild(chip);
        });
      }
      root.appendChild(box);
    });
  }

  function renderReview(){
    const root = $('#reviewView'); if(!root) return;
    root.innerHTML = '';
    const tasks = state.plan.tasks||[];
    if(!tasks.length){ root.innerHTML = '<div class="muted">No plan yet.</div>'; return; }
    const done = tasks.filter(t=>t.status==='done').length;
    const total = tasks.length;
    const pct = total? Math.round((done/total)*100) : 0;
    root.innerHTML = `
      <div class="card">
        <div>Completion: <span class="badge ${pct>=80?'good':pct>=60?'warn':'danger'}">${pct}%</span></div>
        <div class="small">${done}/${total} tasks completed</div>
      </div>`;
  }

  function renderInsights(){
    const root = $('#insightsView'); if(!root) return;
    root.innerHTML = '';
    const tasks = state.plan.tasks||[];
    if(!tasks.length){ root.innerHTML = '<div class="muted">No data yet.</div>'; return; }
    const byTitle = {};
    tasks.forEach(t=>{
      byTitle[t.title] = byTitle[t.title]||{ total:0, done:0 };
      byTitle[t.title].total++;
      if(t.status==='done') byTitle[t.title].done++;
    });
    const rows = Object.entries(byTitle).map(([title, v])=>({ title, ratio: v.done/(v.total||1), total:v.total }))
      .sort((a,b)=>b.ratio-a.ratio).slice(0,5);
    const list = document.createElement('div');
    list.className = 'card';
    list.innerHTML = `<h3>Most effective cards</h3>${
      rows.map(r=>`<div class="small">${Math.round(r.ratio*100)}% of ${r.total} — ${r.title}</div>`).join('')
    }`;
    root.appendChild(list);
  }

  // ========= Settings =========
  $('#saveSettingsBtn')?.addEventListener('click', ()=>{
    const cap = $('#capHours');
    const v = parseInt(cap && cap.value || 8,10);
    state.settings.weeklyCapacityHours = v;
    save(); alert('Settings saved.');
  });

  $('#resetBtn')?.addEventListener('click', ()=>{
    const ok = confirm('Reset Solvent Deck to factory settings? This will clear your local data (deck/draw/plan).');
    if(!ok) return;
    localStorage.removeItem('solventDeckState');
    location.reload();
  });

  // ========= Seeder =========
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

  // ========= First render =========
  showSection('welcome');
})();
