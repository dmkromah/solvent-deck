
/* ========================== Solvent Deck – App ========================== */

/** ---------- Minimal state + persistence ---------- */
const STORAGE_KEY = 'solvent_deck_state_v1';

function createInitialState() {
  // Sample data (safe to replace later)
  const uid = () => Math.random().toString(36).slice(2, 10);
  const cards = [
    { id: uid(), suit: 'Spades',   rank: 'Ace',   title: 'Career North Star',   description: 'Multi‑year transformation goal.' },
    { id: uid(), suit: 'Hearts',   rank: 'Queen', title: 'Strengthen Marriage', description: 'Weekly rituals + monthly retreats.' },
    { id: uid(), suit: 'Clubs',    rank: 'Jack',  title: 'Morning Mobility',    description: '10‑minute joint mobility routine.' },
    { id: uid(), suit: 'Diamonds', rank: '10',    title: 'Budget Reset',        description: 'Track expenses + plan weekly.' }
  ];

  const tasks = [
    { id: uid(), cardId: cards[0].id, title: 'Draft career narrative (1 page)', when: 'Mon' },
    { id: uid(), cardId: cards[1].id, title: 'Date night plan + booking',       when: 'Wed' },
    { id: uid(), cardId: cards[2].id, title: 'Mobility: Hips + T‑spine',        when: 'Daily' },
    { id: uid(), cardId: cards[3].id, title: 'Review spending & envelope',      when: 'Sun' }
  ];

  return {
    cards,
    plan: { tasks }
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return createInitialState();
    // Ensure shapes
    parsed.cards = Array.isArray(parsed.cards) ? parsed.cards : [];
    parsed.plan = parsed.plan || {};
    parsed.plan.tasks = Array.isArray(parsed.plan.tasks) ? parsed.plan.tasks : [];
    return parsed;
  } catch {
    return createInitialState();
  }
}

let state = loadState();

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

/** ---------- Utilities ---------- */
function esc(s='') {
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

/** ---------- Rendering ---------- */
function renderDeck() {
  const root = document.getElementById('cards');
  if (!root) return;

  root.innerHTML = state.cards.map(card => `
    <div class="card" data-card-id="${esc(card.id)}">
      <div class="card-header">
        <div>
          <span class="badge">${esc(card.suit)} ${esc(card.rank || '')}</span>
          <h4 class="card-title">${esc(card.title || 'Untitled')}</h4>
          <div class="card__meta">${(state.plan.tasks || []).filter(t => t.cardId === card.id).length} task(s)</div>
        </div>
        <button
          class="btn-delete-card"
          title="Delete card"
          aria-label="Delete card ${esc(card.title || card.id)}"
          data-card-id="${esc(card.id)}"
        >Delete</button>
      </div>
      <div class="card-body">
        <p>${esc(card.description || '')}</p>
      </div>
    </div>
  `).join('');
}

function renderPlan() {
  const list = document.getElementById('weekly-plan');
  const empty = document.getElementById('weekly-empty');
  if (!list) return;

  const tasks = state.plan.tasks || [];
  if (!tasks.length) {
    list.innerHTML = '';
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;

  list.innerHTML = tasks.map(t => `
    <li class="plan-task" data-task-id="${esc(t.id)}">
      <span class="t-title">${esc(t.title || 'Untitled')}</span>
      <span class="t-meta">${esc(t.when || '')}</span>
      <button
        class="btn-delete-task"
        title="Delete task"
        aria-label="Delete task ${esc(t.title || t.id)}"
        data-task-id="${esc(t.id)}"
      >✖</button>
    </li>
  `).join('');
}

function reRender() {
  renderDeck();
  renderPlan();
}

/** ---------- Delete System (Modal + Undo) ---------- */
const els = {};

function cacheEls() {
  els.modal      = document.getElementById('sd-delete-modal');
  els.backdrop   = document.getElementById('sd-delete-backdrop');
  els.title      = document.getElementById('sd-delete-title');
  els.desc       = document.getElementById('sd-delete-desc');
  els.assocWrap  = document.getElementById('sd-associated-toggle');
  els.assocChk   = document.getElementById('sd-delete-associated');
  els.assocMeta  = document.getElementById('sd-associated-count');
  els.btnCancel  = document.getElementById('sd-cancel');
  els.btnConfirm = document.getElementById('sd-confirm');

  els.toast      = document.getElementById('sd-toast');
  els.toastMsg   = document.getElementById('sd-toast-msg');
  els.toastUndo  = document.getElementById('sd-toast-undo');
}

let pendingDelete = null; // { type: 'task'|'card', id, idx?, label?, relatedCount? }
let undoTimer = null;
let lastDeleted = null;   // { type, item, index, associatedTasks?, cardIndex? }

function openModal() {
  if (!els.modal || !els.backdrop) return;
  els.modal.hidden = false;
  requestAnimationFrame(() => {
    els.modal.classList.add('is-open');
    els.backdrop.classList.add('is-open');
    els.backdrop.setAttribute('aria-hidden','false');
  });
}

function closeModal() {
  if (!els.modal || !els.backdrop) return;
  els.modal.classList.remove('is-open');
  els.backdrop.classList.remove('is-open');
  els.backdrop.setAttribute('aria-hidden','true');
  setTimeout(() => { els.modal.hidden = true; }, 180);
}

function showToast(message, onUndo) {
  if (!els.toast) return;
  els.toastMsg.textContent = message || 'Deleted.';
  els.toast.hidden = false;
  requestAnimationFrame(() => els.toast.classList.add('is-open'));

  // Wire undo
  els.toastUndo.onclick = () => {
    clearTimeout(undoTimer);
    hideToast();
    if (typeof onUndo === 'function') onUndo();
  };

  clearTimeout(undoTimer);
  undoTimer = setTimeout(hideToast, 5000);
}
function hideToast() {
  if (!els.toast) return;
  els.toast.classList.remove('is-open');
  setTimeout(() => { els.toast.hidden = true; }, 200);
}

/** ---------- Delete entrypoints ---------- */
function confirmDeleteTask(taskId, labelText) {
  const idx = (state.plan.tasks || []).findIndex(t => t && t.id === taskId);
  if (idx === -1) return;

  pendingDelete = {
    type: 'task',
    id: taskId,
    idx,
    label: labelText || state.plan.tasks[idx]?.title || `Task ${taskId}`
  };

  els.title.textContent = 'Delete task?';
  els.desc.textContent  = `“${pendingDelete.label}” will be removed. You can undo this action.`;
  els.assocWrap.hidden  = true;

  openModal();
}

function confirmDeleteCard(cardId, labelText) {
  const idx = (state.cards || []).findIndex(c => c && c.id === cardId);
  if (idx === -1) return;

  const card = state.cards[idx];
  const related = (state.plan.tasks || []).filter(t => t && (t.cardId === cardId));

  pendingDelete = {
    type: 'card',
    id: cardId,
    idx,
    label: labelText || card?.title || `Card ${cardId}`,
    relatedCount: related.length
  };

  els.title.textContent  = 'Delete card?';
  els.desc.textContent   = `“${pendingDelete.label}” will be removed. You can undo this action.`;
  els.assocWrap.hidden   = false;
  els.assocChk.checked   = true;
  els.assocMeta.textContent = related.length
    ? `${related.length} associated task${related.length === 1 ? '' : 's'} detected.`
    : 'No associated tasks detected.';

  openModal();
}

function applyPendingDelete() {
  if (!pendingDelete) return;
  if (pendingDelete.type === 'task') {
    deleteTask(pendingDelete.id, { silent: true, expectedIndex: pendingDelete.idx });
    showToast('Task deleted.', () => {
      // Undo task
      const idx = Math.min(pendingDelete.idx, state.plan.tasks.length);
      state.plan.tasks.splice(idx, 0, lastDeleted?.item);
      saveState(); reRender();
    });
  } else if (pendingDelete.type === 'card') {
    const removeAssociated = !els.assocWrap.hidden ? !!els.assocChk.checked : true;
    deleteCard(pendingDelete.id, removeAssociated);
  }
  pendingDelete = null;
}

function deleteTask(taskId, opts = {}) {
  const idx = (state.plan.tasks || []).findIndex(t => t && t.id === taskId);
  if (idx === -1) return;

  const task = state.plan.tasks[idx];
  lastDeleted = { type: 'task', item: task, index: idx };

  state.plan.tasks.splice(idx, 1);
  saveState(); reRender();

  if (!opts.silent) {
    showToast('Task deleted.', () => {
      const rollbackIdx = Math.min(lastDeleted.index, state.plan.tasks.length);
      state.plan.tasks.splice(rollbackIdx, 0, lastDeleted.item);
      saveState(); reRender();
    });
  }
}

function deleteCard(cardId, removeAssociated = true) {
  const cardIdx = (state.cards || []).findIndex(c => c && c.id === cardId);
  if (cardIdx === -1) return;

  const card = state.cards[cardIdx];
  const related = (state.plan.tasks || []).filter(t => t && t.cardId === cardId);

  lastDeleted = {
    type: 'card',
    item: card,
    cardIndex: cardIdx,
    associatedTasks: removeAssociated ? related.slice() : []
  };

  if (removeAssociated && related.length) {
    const ids = new Set(related.map(t => t.id));
    state.plan.tasks = state.plan.tasks.filter(t => !ids.has(t.id));
  } else if (related.length) {
    // Detach tasks so they don't point at a non-existing card
    state.plan.tasks = state.plan.tasks.map(t => {
      if (t && t.cardId === cardId) return { ...t, cardId: null };
      return t;
    });
  }

  state.cards.splice(cardIdx, 1);
  saveState(); reRender();

  showToast('Card deleted.', () => {
    const restoreCardIdx = Math.min(lastDeleted.cardIndex, state.cards.length);
    state.cards.splice(restoreCardIdx, 0, lastDeleted.item);

    if (Array.isArray(lastDeleted.associatedTasks) && lastDeleted.associatedTasks.length) {
      state.plan.tasks = state.plan.tasks.concat(lastDeleted.associatedTasks);
    }
    saveState(); reRender();
  });
}

/** ---------- Events (delegated) ---------- */
function onClick(e) {
  const t = e.target;

  // Task delete
  const btnTask = t.closest('.btn-delete-task');
  if (btnTask) {
    const taskId = btnTask.dataset.taskId;
    const li = btnTask.closest('[data-task-id]');
    const label = li ? li.querySelector('.t-title')?.textContent : '';
    confirmDeleteTask(taskId, label);
    return;
  }

  // Card delete
  const btnCard = t.closest('.btn-delete-card');
  if (btnCard) {
    const cardId = btnCard.dataset.cardId;
    const cardEl = btnCard.closest('[data-card-id]');
    const label = cardEl ? cardEl.querySelector('.card-title')?.textContent : '';
    confirmDeleteCard(cardId, label);
    return;
  }

  // Modal actions
  if (t.id === 'sd-cancel' || t.closest('#sd-cancel')) {
    closeModal(); pendingDelete = null; return;
  }
  if (t.id === 'sd-confirm' || t.closest('#sd-confirm')) {
    closeModal(); applyPendingDelete(); return;
  }

  // Backdrop click closes
  if (t === els.backdrop) {
    closeModal(); pendingDelete = null; return;
  }
}

function onKeydown(e) {
  if (e.key === 'Escape' && els.modal && !els.modal.hidden) {
    closeModal(); pendingDelete = null;
  }
}

/** ---------- Init ---------- */
function init() {
  cacheEls();
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKeydown);
  reRender();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
