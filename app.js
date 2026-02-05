
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
// v0.3: bind drag/drop handlers only once
let _dndBound = false;

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
      if (m) m.addEventListener('change', (e)=>{ state.strategics[s][i].mins = parseInt(e.target.value||60,10); save(); });
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

  // ---------- Plan ----------
  function generatePlan(){
    const weekStart = state.draw.weekStart || fmtLocalDate(startOfWeek(new Date()));
    const selected = state.deck.filter(c => (state.draw.selected||[]).includes(c.id));
    const tasks = [];

    selected.forEach(c => {
      if(['K','Q'].includes(c.rank)){
        const date = fmtLocalDate(addDays(parseLocalDate(weekStart), 2)); // Wed
        tasks.push({ id: 't-'+c.id+'-WED', date, title: c.title + ' — milestone', suit:c.suit, rank:c.rank, duration: c.mins || 60, status:'planned' });
      } else {
        let days = [];
        if(c.cadence==='daily') days = [0,1,2,3,4];       // Mon–Fri
        else if(c.cadence==='2x') days = [1,4];           // Tue, Fri
        else days = [2];                                  // Weekly -> Wed
        days.forEach(d => {
          tasks.push({
            id: 't-'+c.id+'-'+d,
            date: fmtLocalDate(addDays(parseLocalDate(weekStart), d)),
            title: c.title, suit:c.suit, rank:c.rank,
            duration: c.duration || 20, status:'planned'
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

  // Build day buckets for Mon..Sun using **local** dates
  const perDay = [0,1,2,3,4,5,6].map(i => ({
    date: fmtLocalDate(addDays(parseLocalDate(weekStart), i)),
    tasks: []
  }));

  // Place tasks in buckets
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
    col.dataset.date = d.date; // <-- used by drop handler
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

  // Delegate once for DnD + inline edit
  if (!_dndBound) {
    _dndBound = true;

    // DRAG START/END on tasks
    root.addEventListener('dragstart', (e) => {
      const taskEl = e.target.closest('.task');
      if (!taskEl) return;
      e.dataTransfer.setData('text/task-id', taskEl.dataset.taskId);
      taskEl.classList.add('dragging');
    });

    root.addEventListener('dragend', (e) => {
      const taskEl = e.target.closest('.task');
      if (taskEl) taskEl.classList.remove('dragging');
    });

    // DRAG OVER (allow drop) on columns
    root.addEventListener('dragover', (e) => {
      const col = e.target.closest('.day-col');
      if (!col) return;
      e.preventDefault(); // allow drop
      col.classList.add('drag-over');
    });

    root.addEventListener('dragleave', (e) => {
      const col = e.target.closest('.day-col');
      if (col) col.classList.remove('drag-over');
    });

    // DROP on columns
    root.addEventListener('drop', (e) => {
      const col = e.target.closest('.day-col');
      if (!col) return;
      e.preventDefault();
      col.classList.remove('drag-over');

      const taskId = e.dataTransfer.getData('text/task-id');
      if (!taskId) return;

      const newDate = col.dataset.date;
      const t = (state.plan.tasks||[]).find(x => x.id === taskId);
      if (!t) return;

      if (t.date !== newDate) {
        t.date = newDate;
        save();
        renderPlan(); // re-render + recalc banner
      }
    });

    // INLINE EDIT: Title
    root.addEventListener('click', (e) => {
      const titleEl = e.target.closest('.title');
      if (!titleEl) return;

      const taskId = titleEl.dataset.taskId;
      const t = (state.plan.tasks||[]).find(x => x.id === taskId);
      if (!t) return;

      // Replace with input
      const input = document.createElement('input');
      input.className = 'inline-edit';
      input.type = 'text';
      input.value = t.title;
      titleEl.replaceWith(input);
      input.focus();
      input.select();

      const commit = () => {
        const newVal = input.value.trim() || t.title;
        t.title = newVal;
        save();
        renderPlan();
      };
      const cancel = () => renderPlan();

      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') commit();
        else if (ev.key === 'Escape') cancel();
      });
      input.addEventListener('blur', commit);
    });

    // INLINE EDIT: Duration (minutes)
    root.addEventListener('click', (e) => {
      const durEl = e.target.closest('.duration-badge');
      if (!durEl) return;

      const taskId = durEl.dataset.taskId;
      const t = (state.plan.tasks||[]).find(x => x.id === taskId);
      if (!t) return;

      const input = document.createElement('input');
      input.className = 'inline-edit';
      input.type = 'number';
      input.min = '5';
      input.max = '240';
      input.step = '5';
      input.value = t.duration || 20;

      durEl.replaceWith(input);
      input.focus();
      input.select();

      const commit = () => {
        const val = parseInt(input.value, 10);
        if (!isNaN(val) && val > 0) {
          t.duration = Math.max(5, Math.min(240, val));
          save();
          renderPlan();
        } else {
          renderPlan(); // invalid -> cancel
        }
      };
      const cancel = () => renderPlan();

      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') commit();
        else if (ev.key === 'Escape') cancel();
      });
      input.addEventListener('blur', commit);
    });

    // MARK DONE (delegated)
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

  // Export
  const exportBtn = $('#exportBtn');
  if (exportBtn) exportBtn.addEventListener('click', ()=>{
    buildDeck();
    const blob = new Blob([JSON.stringify({state}, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const link = $('#downloadLink');
    link.href = url;
    link.download = 'solvent-deck-export.json';
    link.style.display = 'inline-block';
    link.textContent = 'Download export';
  });

  // ---------- Review & Insights ----------
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
        ${['spades','clubs','hearts','diamonds'].map(s=>{
          const sTasks = tasks.filter(t=>t.suit===s);
          const sDone = sTasks.filter(t=>t.status==='done').length;
          const sPct = sTasks.length? Math.round((sDone/sTasks.length)*100) : 0;
          return `<div class=card><strong>${suitMeta[s].icon} ${suitMeta[s].name}</strong><div class=small>${sDone}/${sTasks.length} · ${sPct}%</div></div>`
        }).join('')}
      </div>
    `;
  }

  function renderInsights(){
    const root = $('#insightsView');
    if(!root) return;
    root.innerHTML = '';
    const tasks = state.plan.tasks||[];
    if(tasks.length===0){ root.innerHTML = '<div class="muted">No data yet.</div>'; return; }

    const byTitle = {};
    tasks.forEach(t=>{ byTitle[t.title] = byTitle[t.title]||{ total:0, done:0 }; byTitle[t.title].total++; if(t.status==='done') byTitle[t.title].done++; });
    const rows = Object.entries(byTitle).map(([title, v])=>({ title, ratio: v.done/(v.total||1), total:v.total })).sort((a,b)=>b.ratio-a.ratio).slice(0,5);

    const list = document.createElement('div');
    list.className = 'card';
    list.innerHTML = `<h3>Most effective cards</h3>${rows.map(r=>`<div class=small>${r.title} — ${Math.round(r.ratio*100)}% of ${r.total}</div>`).join('')}`;
    root.appendChild(list);
  }

  // ---------- Settings ----------
  const saveSettingsBtn = $('#saveSettingsBtn');
  if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', ()=>{
    const cap = $('#capHours');
    const v = parseInt(cap && cap.value || 8,10);
    state.settings.weeklyCapacityHours = v;
    save();
    alert('Settings saved.');
  });

  // Optional reset button (harmless if not present)
  const resetBtn = $('#resetBtn');
  if (resetBtn) resetBtn.addEventListener('click', ()=>{
    const ok = confirm('Reset Solvent Deck to factory settings? This will clear your local data (deck/draw/plan).');
    if(!ok) return;
    localStorage.removeItem('solventDeckState');
    location.reload();
  });

  // ---------- Example Seeder ----------
  function seedExample(){
    state.aces.spades = { title:'Lead solvency psychology as a field', metrics:['2 papers','1 book','5 talks'] };
    state.aces.clubs = { title:'Sustain a high‑energy body', metrics:['7.5h sleep','150 workouts/yr'] };
    state.aces.hearts = { title:'Build a solvent family culture', metrics:['weekly partner meeting'] };
    state.aces.diamonds = { title:'Become financially sovereign creator', metrics:['30% savings','12mo runway'] };

    state.strategics.spades = [
      { title:'Complete territoriality SLR and submit', due:fmtLocalDate(addDays(new Date(), 120)), mins:90 },
      { title:"Design and launch 'Solvent Career' course", due:fmtLocalDate(addDays(new Date(), 180)), mins:60 }
    ];
    state.strategics.clubs = [
      { title:'Optimize sleep routine by June', due:fmtLocalDate(addDays(new Date(), 130)), mins:45 },
      { title:'Run comfortable 5k', due:fmtLocalDate(addDays(new Date(), 160)), mins:40 }
    ];
    state.strategics.hearts = [
      { title:'Weekly partner meeting ritual', due:fmtLocalDate(addDays(new Date(), 84)), mins:45 },
      { title:'1:1 with each child weekly', due:fmtLocalDate(addDays(new Date(), 84)), mins:30 }
    ];
    state.strategics.diamonds = [
      { title:'Launch consulting offer by July', due:fmtLocalDate(addDays(new Date(), 170)), mins:60 },
      { title:'Grant pipeline setup', due:fmtLocalDate(addDays(new Date(), 150)), mins:50 }
    ];

    state.habits.spades = [
      { title:'Write 300 words', cadence:'daily', duration:25 },
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
      { title:'Weekly partner meeting', cadence:'weekly', duration:45 },
      { title:'Call a mentor', cadence:'weekly', duration:20 }
    ];
    state.habits.diamonds = [
      { title:'Track daily expenses', cadence:'daily', duration:8 },
      { title:'DCA invest', cadence:'weekly', duration:15 },
      { title:'Review budget', cadence:'weekly', duration:20 }
    ];

    state.draw = { weekStart: null, selected: [] };
    state.plan = { weekStart: null, tasks: [] };
    save();
  }

  // First render
  showSection('welcome');
})();
