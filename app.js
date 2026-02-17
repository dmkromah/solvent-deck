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
