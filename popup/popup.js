// popup.js - Data loading and UI interactions

/**
 * Formats seconds as m:ss or h:mm:ss. Duplicated from content/uiInjector.js —
 * that copy runs in the content-script world, this one in the popup's, and
 * the two contexts share no module loader.
 */
function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
// Material Icons "push_pin" glyph — outlined (stroke) when unpinned, filled
// (fill) when pinned. Same path both ways so "outline vs filled" (UX Spec
// §6.3 Row Specification) is a literal toggle of the same shape, not two
// different icons.
const PIN_PATH_D = 'M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z';

function createPinIcon(pinned, size) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', PIN_PATH_D);
  if (pinned) {
    path.setAttribute('fill', 'currentColor');
  } else {
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('stroke-linejoin', 'round');
  }
  svg.appendChild(path);
  return svg;
}

document.addEventListener('DOMContentLoaded', async () => {
  // View switching
  const viewList = document.getElementById('view-list');
  const viewSettings = document.getElementById('view-settings');
  const settingsBtn = document.getElementById('settings-btn');
  const backBtn = document.getElementById('back-btn');

  settingsBtn.addEventListener('click', () => {
    viewList.classList.add('hidden');
    viewSettings.classList.remove('hidden');
    backBtn.focus();
  });

  backBtn.addEventListener('click', () => {
    viewSettings.classList.add('hidden');
    viewList.classList.remove('hidden');
    settingsBtn.focus();
  });

  // Saved videos list
  const countEl = document.getElementById('saved-count');
  const listEl = document.getElementById('video-list');
  const emptyStateEl = document.getElementById('empty-state');
  const loadFailureEl = document.getElementById('load-failure-state');
  const listAnnouncerEl = document.getElementById('list-announcer');
  const confirmCountEl = document.getElementById('confirm-count');
  const confirmPinnedNoteEl = document.getElementById('confirm-pinned-note');
  const clearBtn = document.getElementById('clear-btn');
  const confirmPanel = document.getElementById('confirm-panel');
  const cancelBtn = document.getElementById('cancel-btn');
  const confirmBtn = document.getElementById('confirm-btn');

  // Remove completed (Roadmap 7.5, D-105)
  const removeCompletedBtn = document.getElementById('remove-completed-btn');
  const removeCompletedCountEl = document.getElementById('remove-completed-count');
  const includePinnedCheckbox = document.getElementById('include-pinned-checkbox');
  const removeCompletedConfirmPanel = document.getElementById('remove-completed-confirm-panel');
  const removeCompletedBodyEl = document.getElementById('remove-completed-body');
  const removeCompletedCancelBtn = document.getElementById('remove-completed-cancel-btn');
  const removeCompletedConfirmBtn = document.getElementById('remove-completed-confirm-btn');

  let entryCount = 0;
  let pinnedCount = 0;
  let loadThumbnails = true;
  let listUsable = false; // false while the load-failure state is showing (v4 Phase 8)

  // videoId -> entry, the last state this popup has acknowledged (either
  // from its own initial read or a subsequent storage-change notification —
  // v4 Phase 8, 8.1/8.2: every counter/row below is derived from this, never
  // from an optimistic local increment made before the write is confirmed).
  const entriesById = new Map();
  // videoId -> <li>, so a removal/update can find each row directly instead
  // of a CSS.escape'd attribute-selector query.
  const rowsById = new Map();
  // videoIds with an in-flight pin/remove request from THIS popup, so a
  // second click on the same row before the first one's storage-change
  // acknowledgment arrives is a no-op instead of double-sending (8.2).
  const rowPending = new Set();
  // True while "Remove completed" or "Clear all" is in flight — blocks new
  // per-row pin/remove clicks so a batch mutation and an individual row
  // action can never interleave in the UI (8.3). Storage-level correctness
  // doesn't depend on this (storageWriter.js's queue already serializes
  // every command), but the UI must not let a user fire a row action against
  // a row that a batch operation is about to remove out from under them.
  let batchInFlight = false;
  // videoId -> 'pin' | 'remove', captured at the moment a row's own control
  // is clicked, BEFORE it gets disabled (v4 Phase 8, 8.7 gotcha found via
  // live testing: disabling a focused button blurs it to <body> immediately
  // in real Chrome, synchronously — well before the acknowledged write's
  // storage-change notification arrives and reconcile()/removeRow() run.
  // Re-checking document.activeElement at THAT point would always see
  // <body>, never the control that actually had focus when the user acted.
  // Capturing intent up front is what lets pin-resort refocus (below) and
  // removal focus-handoff work at all for this popup's own actions; an
  // externally-caused row removal/pin-change (nothing disabled here) still
  // falls back to a live activeElement check, which is accurate for that case.
  const focusIntentByRow = new Map();

  function captureFocusIntent(li, videoId) {
    const active = document.activeElement;
    if (active && li.contains(active)) {
      focusIntentByRow.set(videoId, active.classList.contains('pin-btn') ? 'pin' : 'remove');
    }
  }

  /**
   * Announces a list/count change to assistive tech (8.9), distinct from
   * each row's own pin-cap/confirm-panel aria-live regions. Clearing first
   * (via a microtask) forces re-announcement even if the new text happens
   * to match the previous one.
   */
  function announce(message) {
    listAnnouncerEl.textContent = '';
    requestAnimationFrame(() => {
      listAnnouncerEl.textContent = message;
    });
  }

  function entryLabel(entry) {
    return (entry && entry.title) || 'Untitled video';
  }

  /**
   * Recomputes and renders the Remove-completed button/count (CP-68/69/70/74)
   * from entriesById against the current include-pinned scope. Returns the
   * live matching count so callers (the confirm-panel copy) can reuse it.
   */
  function refreshRemoveCompletedUI() {
    const includePinned = includePinnedCheckbox.checked;
    let n = 0;
    entriesById.forEach((entry) => {
      if (!includePinned && entry.pinned) return;
      if (storageValidation.isCompleteEntry(entry)) n += 1;
    });
    if (n === 0) {
      removeCompletedBtn.disabled = true;
      removeCompletedCountEl.textContent = 'No completed videos to remove'; // CP-74
    } else {
      removeCompletedBtn.disabled = listUsable ? batchInFlight : true;
      removeCompletedCountEl.textContent = n === 1 ? '1 completed video' : `${n} completed videos`; // CP-69/70
    }
    return n;
  }

  function updateCount(n) {
    entryCount = n;
    countEl.textContent = n === 1 ? '1 saved video' : `${n} saved videos`;
    confirmCountEl.textContent = n;
    if (n === 0) {
      listEl.classList.add('hidden');
      emptyStateEl.classList.remove('hidden');
      clearBtn.disabled = true;
    } else {
      listEl.classList.remove('hidden');
      emptyStateEl.classList.add('hidden');
      clearBtn.disabled = false;
    }
  }

  // Two-tier sort (UX Spec §6.3, Roadmap 5.2): pinned entries first (most
  // recent within that group), then unpinned (most recent within that
  // group). Rows carry their own sort key as data attributes so pin/unpin
  // can find the correct re-insertion point by reading live DOM order
  // instead of maintaining a parallel JS array (5.7 — move one row, not a
  // full rebuild).
  function shouldPrecede(pinned, updated, row) {
    const rowPinned = row.dataset.pinned === 'true';
    if (pinned !== rowPinned) return pinned;
    return updated > Number(row.dataset.updated);
  }

  function moveRowToSortedPosition(li, pinned, updated) {
    li.remove();
    const rows = Array.from(listEl.children);
    const insertBefore = rows.find((row) => shouldPrecede(pinned, updated, row));
    if (insertBefore) {
      listEl.insertBefore(li, insertBefore);
    } else {
      listEl.appendChild(li);
    }
  }

  function updatePinBadge(thumbWrap, pinned) {
    const existing = thumbWrap.querySelector('.thumb-pin-badge');
    if (pinned) {
      if (!existing) {
        const badge = document.createElement('div');
        badge.className = 'thumb-pin-badge';
        badge.setAttribute('aria-hidden', 'true');
        badge.appendChild(createPinIcon(true, 12));
        thumbWrap.insertBefore(badge, thumbWrap.firstChild);
      }
    } else if (existing) {
      existing.remove();
    }
  }

  // Row action labels identify the specific video, not a generic verb
  // (8.9/F17) — every accessible name below is built from the row's own
  // display label, updated whenever the underlying entry (e.g. a
  // lazily-backfilled title) changes.
  function updatePinButton(pinBtn, pinned, label) {
    pinBtn.classList.toggle('pinned', pinned);
    pinBtn.setAttribute('aria-pressed', String(pinned));
    pinBtn.setAttribute('aria-label', pinned ? `Unpin ${label}` : `Pin ${label}`);
    pinBtn.replaceChildren(createPinIcon(pinned, 13));
  }

  function updateRemoveButtonLabel(removeBtn, label) {
    removeBtn.setAttribute('aria-label', `Remove ${label} from saved videos`);
  }

  function showPinCapMessage(li, pinBtn) {
    pinBtn.classList.add('hidden');
    const msg = document.createElement('div');
    msg.className = 'pin-cap-message';
    msg.setAttribute('role', 'status');
    msg.setAttribute('aria-live', 'polite');
    msg.textContent = 'You can pin up to 20 videos';
    li.appendChild(msg);
    setTimeout(() => {
      msg.remove();
      pinBtn.classList.remove('hidden');
    }, 2500);
  }

  /** Enables/disables a row's own pin/remove controls (8.2/8.3). */
  function setRowControlsDisabled(li, disabled) {
    li.querySelectorAll('.pin-btn, .remove-btn').forEach((btn) => {
      btn.disabled = disabled;
    });
  }

  function setAllRowControlsDisabled(disabled) {
    rowsById.forEach((li) => setRowControlsDisabled(li, disabled));
  }

  /**
   * Applies the current loadThumbnails setting to one already-rendered
   * row's thumbnail, immediately — no image element/src at all when off
   * (D-005's zero-network guarantee), an image restored when re-enabled
   * (8.5/F18). Reassigning/removing `src` aborts any in-flight request
   * ("cancel what can be cancelled"); a `<img>` never yet inserted into the
   * viewport (loading="lazy") never gets the chance to start one at all
   * once its element is removed.
   */
  function applyThumbnailStateToRow(li, videoId) {
    const thumbWrap = li.querySelector('.thumb-wrap');
    if (!thumbWrap) return;
    const existingImg = thumbWrap.querySelector('.thumb');
    if (!loadThumbnails) {
      if (existingImg) {
        existingImg.src = '';
        existingImg.remove();
      }
      thumbWrap.classList.add('placeholder');
      return;
    }
    thumbWrap.classList.remove('placeholder');
    if (existingImg) return;
    const img = document.createElement('img');
    img.className = 'thumb';
    img.width = 144;
    img.height = 81;
    img.alt = '';
    img.loading = 'lazy';
    img.addEventListener('error', () => {
      img.remove();
      thumbWrap.classList.add('placeholder');
    }, { once: true });
    img.src = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
    const durationBadge = thumbWrap.querySelector('.thumb-duration');
    thumbWrap.insertBefore(img, durationBadge);
  }

  /** Applies a newly-changed loadThumbnails setting to every rendered row (8.5/8.6). */
  function applyThumbnailSetting(newValue) {
    if (newValue === loadThumbnails) return;
    loadThumbnails = newValue;
    rowsById.forEach((li, videoId) => applyThumbnailStateToRow(li, videoId));
  }

  /**
   * Updates a row's non-identity display (duration badge, progress fill,
   * meta line, title/channel text) to match `entry`, without moving or
   * rebuilding the row — called for every external progress tick so a
   * still-open popup stays live without losing scroll/focus position (8.1).
   */
  function updateRowDisplay(li, entry) {
    const thumbWrap = li.querySelector('.thumb-wrap');
    const duration = entry.duration > 0 ? entry.duration : 0;
    const durationBadge = thumbWrap?.querySelector('.thumb-duration');
    if (durationBadge) durationBadge.textContent = formatTime(duration);

    const barPercent = duration > 0 ? Math.min(100, Math.max(0, Math.round((entry.time / duration) * 100))) : 0;
    const fill = thumbWrap?.querySelector('.thumb-progress-fill');
    if (fill) fill.style.width = `${barPercent}%`;

    const complete = storageValidation.isCompleteEntry(entry);
    const titleEl = li.querySelector('.row-title');
    if (titleEl) titleEl.textContent = entry.title || 'Untitled video';

    let channelEl = li.querySelector('.row-channel');
    const textBlock = li.querySelector('.row-text');
    if (entry.channel) {
      if (!channelEl && textBlock) {
        channelEl = document.createElement('p');
        channelEl.className = 'row-channel';
        textBlock.insertBefore(channelEl, textBlock.querySelector('.row-meta'));
      }
      if (channelEl) channelEl.textContent = entry.channel;
    } else if (channelEl) {
      channelEl.remove();
    }

    const metaEl = li.querySelector('.row-meta');
    if (metaEl) {
      if (complete) {
        metaEl.textContent = 'Completed'; // CP-77
      } else {
        const displayPercent = duration > 0 ? Math.min(99, Math.max(0, Math.round((entry.time / duration) * 100))) : 0;
        metaEl.textContent = `${formatTime(entry.time)} / ${formatTime(duration)} · ${displayPercent}% watched`;
      }
    }

    const label = entryLabel(entry);
    const pinBtn = li.querySelector('.pin-btn');
    if (pinBtn) updatePinButton(pinBtn, !!entry.pinned, label);
    const removeBtn = li.querySelector('.remove-btn');
    if (removeBtn) updateRemoveButtonLabel(removeBtn, label);
  }

  function buildRow(videoId, entry) {
    const li = document.createElement('li');
    li.className = 'video-row';
    li.dataset.id = videoId;
    li.dataset.pinned = entry.pinned ? 'true' : 'false';
    li.dataset.updated = String(entry.updated);

    const link = document.createElement('a');
    link.className = 'row-link';
    link.href = `https://www.youtube.com/watch?v=${videoId}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'thumb-wrap';
    if (!loadThumbnails) thumbWrap.classList.add('placeholder');

    // Pinned badge (D-077, UX Spec §6.3): passive, always-visible indicator
    // — the interactive pin control below is the hover-revealed toggle.
    updatePinBadge(thumbWrap, !!entry.pinned);

    const duration = entry.duration > 0 ? entry.duration : 0;
    const barPercent = duration > 0 ? Math.min(100, Math.max(0, Math.round((entry.time / duration) * 100))) : 0;
    const complete = storageValidation.isCompleteEntry(entry);

    // Duration badge and watched-progress line render directly on the
    // thumbnail (D-054) — text/CSS only, not an image, so they still show
    // when loadThumbnails is off without violating the zero-network promise.
    const durationBadge = document.createElement('span');
    durationBadge.className = 'thumb-duration';
    durationBadge.textContent = formatTime(duration);
    thumbWrap.appendChild(durationBadge);

    const thumbProgressTrack = document.createElement('div');
    thumbProgressTrack.className = 'thumb-progress-track';
    const thumbProgressFill = document.createElement('div');
    thumbProgressFill.className = 'thumb-progress-fill';
    thumbProgressFill.style.width = `${barPercent}%`;
    thumbProgressTrack.appendChild(thumbProgressFill);
    thumbWrap.appendChild(thumbProgressTrack);

    // Built directly here (not via applyThumbnailStateToRow, which queries
    // through `li` — not yet wired up with its children at this point in
    // construction). Inserted before the duration badge, the same position
    // applyThumbnailStateToRow() restores it to later if toggled off/on (8.5).
    if (loadThumbnails) {
      const img = document.createElement('img');
      img.className = 'thumb';
      img.width = 144;
      img.height = 81;
      img.alt = '';
      img.loading = 'lazy';
      img.addEventListener('error', () => {
        img.remove();
        thumbWrap.classList.add('placeholder');
      }, { once: true });
      // Only reached when loadThumbnails is on — src is what triggers the
      // network request (D-004/D-005), so the img element itself must not
      // exist at all in the off case, not just be unset.
      img.src = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
      thumbWrap.insertBefore(img, durationBadge);
    }

    const textBlock = document.createElement('div');
    textBlock.className = 'row-text';

    const titleEl = document.createElement('p');
    titleEl.className = 'row-title';
    titleEl.textContent = entry.title || 'Untitled video';
    textBlock.appendChild(titleEl);

    if (entry.channel) {
      const channelEl = document.createElement('p');
      channelEl.className = 'row-channel';
      channelEl.textContent = entry.channel;
      textBlock.appendChild(channelEl);
    }

    const metaEl = document.createElement('p');
    metaEl.className = 'row-meta';
    if (complete) {
      // CP-77 — replaces the entire meta line, not just the percent segment
      // (Completion Display, UX Spec §6.3). Reserved for the completion
      // marker; percentage alone never earns this label.
      metaEl.textContent = 'Completed';
    } else {
      const displayPercent = duration > 0 ? Math.min(99, Math.max(0, Math.round((entry.time / duration) * 100))) : 0;
      metaEl.textContent = `${formatTime(entry.time)} / ${formatTime(duration)} · ${displayPercent}% watched`;
    }
    textBlock.appendChild(metaEl);

    link.appendChild(thumbWrap);
    link.appendChild(textBlock);

    const label = entryLabel(entry);

    // Pin control (5.1, D-077): reading order "pin, then remove" (UX Spec
    // §6.3) — appended before the remove button below, both siblings of
    // the link so each is independently reachable by Tab (T5.4).
    const pinBtn = document.createElement('button');
    pinBtn.type = 'button';
    pinBtn.className = 'pin-btn';
    pinBtn.appendChild(createPinIcon(!!entry.pinned, 13));
    pinBtn.setAttribute('aria-pressed', String(!!entry.pinned));
    pinBtn.setAttribute('aria-label', entry.pinned ? `Unpin ${label}` : `Pin ${label}`);
    if (entry.pinned) pinBtn.classList.add('pinned');
    pinBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (batchInFlight || rowPending.has(videoId)) return; // 8.2/8.3
      rowPending.add(videoId);
      captureFocusIntent(li, videoId);
      setRowControlsDisabled(li, true);
      const willPin = !pinBtn.classList.contains('pinned');
      try {
        if (willPin) {
          await storageManager.pinProgress(videoId);
        } else {
          await storageManager.unpinProgress(videoId);
        }
        // Success: the acknowledged write's storage-change notification
        // (subscribeProgress below) is what actually updates the row/counts
        // and clears rowPending — never an optimistic local increment here.
      } catch (err) {
        rowPending.delete(videoId);
        focusIntentByRow.delete(videoId);
        setRowControlsDisabled(li, false);
        if (willPin && /pin cap/.test(err.message)) {
          showPinCapMessage(li, pinBtn);
        } else {
          console.warn('[YTResume] Failed to toggle pin:', err);
          announce(`Couldn't update pin for ${label}. Try again.`);
        }
      }
    });

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-btn';
    removeBtn.setAttribute('aria-label', `Remove ${label} from saved videos`);
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (batchInFlight || rowPending.has(videoId)) return; // 8.2/8.3
      rowPending.add(videoId);
      captureFocusIntent(li, videoId);
      setRowControlsDisabled(li, true);
      try {
        await storageManager.deleteProgress(videoId);
        // Success: the storage-change notification removes the row (8.4
        // distinguishes this acknowledged removal from the failure branch
        // below, which leaves the row exactly as it was).
      } catch (err) {
        rowPending.delete(videoId);
        focusIntentByRow.delete(videoId);
        setRowControlsDisabled(li, false);
        console.warn('[YTResume] Failed to delete entry:', err);
        announce(`Couldn't remove ${label}. Try again.`);
      }
    });

    li.appendChild(link);
    li.appendChild(pinBtn);
    li.appendChild(removeBtn);
    return li;
  }

  /**
   * Focus handoff for an in-place row removal (8.7/D-123): next row, else
   * previous row, else the Remove-completed button, else the settings gear
   * — only when the removed row (or one of its controls) actually held
   * focus. `capturedIntent` ('pin'|'remove'|undefined) is this popup's own
   * pre-disable record of which control had focus when the user acted
   * (captureFocusIntent) — required for its own acknowledged removals,
   * since by the time this runs (after the async round trip), the control
   * was already disabled and therefore already blurred to <body> in real
   * Chrome (confirmed live — a synchronous side effect of `.disabled = true`
   * on the focused element itself, well before any storage-change
   * notification arrives). An externally-caused removal never disabled
   * anything here, so a live document.activeElement check is accurate for it.
   */
  function handOffFocusAfterRemoval(li, capturedIntent) {
    let hadFocus;
    let preferPin;
    if (capturedIntent) {
      hadFocus = true;
      preferPin = capturedIntent === 'pin';
    } else {
      const active = document.activeElement;
      hadFocus = !!active && li.contains(active);
      preferPin = hadFocus && active.classList && active.classList.contains('pin-btn');
    }
    if (!hadFocus) return;
    const next = li.nextElementSibling;
    const prev = li.previousElementSibling;
    const target = next || prev;
    if (target) {
      const control = (preferPin && target.querySelector('.pin-btn')) || target.querySelector('.remove-btn');
      if (control) {
        control.focus();
        return;
      }
    }
    if (!removeCompletedBtn.disabled) {
      removeCompletedBtn.focus();
      return;
    }
    settingsBtn.focus();
  }

  function removeRow(videoId) {
    const li = rowsById.get(videoId);
    if (!li) return;
    handOffFocusAfterRemoval(li, focusIntentByRow.get(videoId));
    li.remove();
    rowsById.delete(videoId);
    entriesById.delete(videoId);
    rowPending.delete(videoId);
    focusIntentByRow.delete(videoId);
  }

  function insertRow(videoId, entry) {
    const li = buildRow(videoId, entry);
    rowsById.set(videoId, li);
    const rows = Array.from(listEl.children);
    const insertBefore = rows.find((row) => shouldPrecede(!!entry.pinned, entry.updated, row));
    if (insertBefore) {
      listEl.insertBefore(li, insertBefore);
    } else {
      listEl.appendChild(li);
    }
  }

  /** True if any field `updateRowDisplay`/sort order cares about differs. */
  function entryChanged(a, b) {
    return a.time !== b.time
      || a.duration !== b.duration
      || a.updated !== b.updated
      || !!a.pinned !== !!b.pinned
      || !!a.ended !== !!b.ended
      || a.title !== b.title
      || a.channel !== b.channel;
  }

  /**
   * Reconciles the rendered list against a freshly-acknowledged full store
   * snapshot (v4 Phase 8, 8.1) — called on every chrome.storage.onChanged
   * notification for youtubeResume, whether triggered by this popup's own
   * mutation, playback continuing to save in an open YouTube tab, or an
   * eviction/removal from anywhere else. Every counter is derived fresh
   * from `newStore` here, never from an incremental adjustment (8.2).
   * Rows are updated in place (content only) rather than resorted on an
   * ordinary progress tick, so scroll position and focus are undisturbed
   * (T8.2) — only a pin-state change (which already changes sort tier)
   * moves a row, and always refocuses the control that triggered it.
   */
  function reconcile(newStore) {
    const removedLabels = [];
    Array.from(rowsById.keys()).forEach((videoId) => {
      if (videoId in newStore) return;
      const oldEntry = entriesById.get(videoId);
      removedLabels.push(entryLabel(oldEntry));
      removeRow(videoId);
    });

    Object.keys(newStore).forEach((videoId) => {
      const entry = newStore[videoId];
      const oldEntry = entriesById.get(videoId);
      if (!oldEntry) {
        insertRow(videoId, entry);
      } else if (entryChanged(oldEntry, entry)) {
        const li = rowsById.get(videoId);
        if (li) {
          const pinnedChanged = !!entry.pinned !== !!oldEntry.pinned;
          const capturedIntent = focusIntentByRow.get(videoId);
          const liveHadFocus = li.contains(document.activeElement);
          const liveActive = document.activeElement;
          updateRowDisplay(li, entry);
          rowPending.delete(videoId);
          focusIntentByRow.delete(videoId);
          // Re-enable BEFORE any focus() call below — a disabled control is
          // not focusable at all in real Chrome, so calling .focus() on it
          // first (while still disabled) would silently do nothing. Found
          // via live testing: capturing intent pre-disable was necessary but
          // not sufficient on its own.
          if (!batchInFlight) setRowControlsDisabled(li, false);
          if (pinnedChanged) {
            // Same capture-before-disable requirement as removal handoff
            // above: this popup's own pin click already disabled the
            // control before this reconciliation ever runs (and — separately
            // — real Chrome eventually blurs a disabled focused element too),
            // so a live activeElement check here can't be trusted for this
            // popup's own action. An externally-caused pin change falls back
            // to the live check, which is accurate for that case.
            li.dataset.pinned = entry.pinned ? 'true' : 'false';
            li.dataset.updated = String(entry.updated);
            moveRowToSortedPosition(li, !!entry.pinned, entry.updated);
            // Moving a node via remove()+re-insert blurs it synchronously in
            // most browsers even though it's the same element — re-focus
            // explicitly so pin re-sorting never drops keyboard focus (8.7).
            if (capturedIntent) {
              const control = li.querySelector(capturedIntent === 'pin' ? '.pin-btn' : '.remove-btn');
              if (control) control.focus();
            } else if (liveHadFocus) {
              liveActive.focus();
            }
          }
        }
      }
      entriesById.set(videoId, entry);
    });

    const newIds = Object.keys(newStore);
    const previousCount = entryCount;
    pinnedCount = newIds.filter((id) => newStore[id].pinned).length;
    updateCount(newIds.length);
    refreshRemoveCompletedUI();

    if (removedLabels.length === 1) {
      announce(`${removedLabels[0]} removed. ${countEl.textContent}.`);
    } else if (removedLabels.length > 1) {
      announce(`${removedLabels.length} videos removed. ${countEl.textContent}.`);
    } else if (newIds.length !== previousCount) {
      announce(`${countEl.textContent}.`);
    }
  }

  // Progress and settings are read independently (v4 Phase 1, 1.7/D-121):
  // a settings-read failure must never hide valid saved-video data — it
  // falls back to safe defaults and the list still renders normally. Only
  // a progress-read failure (or unrenderable progress data) produces the
  // distinct load-failure state; it is never conflated with "genuinely
  // empty" (CP-32/33 must not be shown when the read itself failed).
  let store = null;
  try {
    store = await storageManager.getAllProgress();
  } catch (err) {
    console.warn('[YTResume] Failed to read saved videos:', err);
  }

  if (store) {
    listUsable = true;
    let settings;
    try {
      settings = await storageManager.getSettings();
    } catch (err) {
      console.warn('[YTResume] Failed to read settings, using defaults:', err);
      settings = storageManager.getDefaultSettings();
    }
    loadThumbnails = settings.loadThumbnails;

    // Two-tier sort (UX Spec §6.3): pinned entries first, then unpinned;
    // most recently watched first within each group. Bulk-sorted once here
    // (not via reconcile()'s per-row insert, which would be O(n^2) against
    // the render budget for a 200-entry library) — reconcile() is used only
    // for subsequent live storage-change notifications.
    const entries = Object.entries(store).sort((a, b) => {
      if (!!a[1].pinned !== !!b[1].pinned) return a[1].pinned ? -1 : 1;
      return b[1].updated - a[1].updated;
    });
    entries.forEach(([videoId, entry]) => {
      entriesById.set(videoId, entry);
      const row = buildRow(videoId, entry);
      rowsById.set(videoId, row);
      listEl.appendChild(row);
    });
    pinnedCount = entries.filter(([, entry]) => entry.pinned).length;
    updateCount(entries.length);
    refreshRemoveCompletedUI();

    // Live reconciliation (8.1/F16/F17) — starts only after the initial
    // render above has established a baseline in entriesById/rowsById.
    storageManager.subscribeProgress((newStore) => {
      reconcile(newStore);
    });
  } else {
    // CP-75/CP-76 (UX Spec §6.3 Load-Failure State) — same layout position
    // as the empty state, distinct copy, never the empty-state message.
    listEl.classList.add('hidden');
    emptyStateEl.classList.add('hidden');
    loadFailureEl.classList.remove('hidden');
    clearBtn.disabled = true;
    removeCompletedBtn.disabled = true;
  }

  includePinnedCheckbox.addEventListener('change', () => {
    refreshRemoveCompletedUI();
  });

  removeCompletedBtn.addEventListener('click', () => {
    const n = refreshRemoveCompletedUI();
    if (n === 0) return;
    const countLabel = n === 1 ? '1 completed video' : `${n} completed videos`; // CP-69/70
    removeCompletedBodyEl.textContent = `This will permanently remove ${countLabel}. This cannot be undone.`; // CP-72
    removeCompletedBtn.classList.add('hidden');
    removeCompletedCountEl.classList.add('hidden');
    includePinnedCheckbox.closest('.include-pinned-label').classList.add('hidden');
    removeCompletedConfirmPanel.classList.remove('hidden');
    removeCompletedCancelBtn.focus(); // 8.7/D-123 — focus lands on Cancel when a confirmation opens
  });

  function restoreRemoveCompletedControls() {
    removeCompletedConfirmPanel.classList.add('hidden');
    removeCompletedBtn.classList.remove('hidden');
    removeCompletedCountEl.classList.remove('hidden');
    includePinnedCheckbox.closest('.include-pinned-label').classList.remove('hidden');
  }

  removeCompletedCancelBtn.addEventListener('click', () => {
    restoreRemoveCompletedControls();
    removeCompletedBtn.focus(); // 8.7/D-123 — return focus to the trigger on cancel
  });

  removeCompletedConfirmBtn.addEventListener('click', async () => {
    const includePinned = includePinnedCheckbox.checked;
    batchInFlight = true; // 8.3 — blocks individual row pin/remove clicks for the duration
    setAllRowControlsDisabled(true);
    try {
      await storageManager.removeCompleted(includePinned);
      // Row removal/count update arrives via the subscribeProgress
      // notification triggered by this same acknowledged write.
    } catch (err) {
      console.warn('[YTResume] Failed to remove completed videos:', err);
      announce("Couldn't remove completed videos. Try again.");
    } finally {
      batchInFlight = false;
      setAllRowControlsDisabled(false);
      restoreRemoveCompletedControls();
      refreshRemoveCompletedUI();
      if (!removeCompletedBtn.disabled) removeCompletedBtn.focus();
      else settingsBtn.focus();
    }
  });

  // Clear saved progress (moved into settings view, D-014: youtubeResume only)
  clearBtn.addEventListener('click', () => {
    if (entryCount === 0) return;

    confirmCountEl.textContent = entryCount;
    // UX Spec §6.6 / CP-66 / CP-67 / D-080: pinning protects only against
    // the 200-entry eviction cap, not this explicit clear-all action, so a
    // user with pinned videos must be told they're included before confirming.
    if (pinnedCount > 0) {
      confirmPinnedNoteEl.textContent =
        pinnedCount === 1
          ? 'This includes 1 pinned video.'
          : `This includes ${pinnedCount} pinned videos.`;
      confirmPinnedNoteEl.classList.remove('hidden');
    } else {
      confirmPinnedNoteEl.classList.add('hidden');
    }
    clearBtn.classList.add('hidden');
    confirmPanel.classList.remove('hidden');
    cancelBtn.focus(); // 8.7/D-123
  });

  cancelBtn.addEventListener('click', () => {
    confirmPanel.classList.add('hidden');
    clearBtn.classList.remove('hidden');
    clearBtn.focus(); // 8.7/D-123 — return focus to the trigger on cancel
  });

  confirmBtn.addEventListener('click', async () => {
    batchInFlight = true;
    setAllRowControlsDisabled(true);
    try {
      await storageManager.clearAllProgress();
      // Row/count clearing arrives via the subscribeProgress notification.
    } catch (err) {
      console.warn('[YTResume] Failed to clear storage:', err);
      announce("Couldn't clear saved progress. Try again.");
    } finally {
      batchInFlight = false;
      setAllRowControlsDisabled(false);
      confirmPanel.classList.add('hidden');
      clearBtn.classList.remove('hidden');
      clearBtn.focus();
    }
  });

  // Settings — segmented controls and toggles
  const segmentedGroups = document.querySelectorAll('.segmented');
  const toggles = document.querySelectorAll('.toggle');

  function renderSettings(settings) {
    segmentedGroups.forEach((group) => {
      const key = group.dataset.setting;
      const current = settings[key];
      group.querySelectorAll('.segment').forEach((btn) => {
        const active = Number(btn.dataset.value) === current;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', String(active));
      });
    });

    toggles.forEach((btn) => {
      const key = btn.dataset.setting;
      const active = Boolean(settings[key]);
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-checked', String(active));
    });
  }

  try {
    const settings = await storageManager.getSettings();
    renderSettings(settings);
  } catch (err) {
    console.warn('[YTResume] Failed to read settings:', err);
    renderSettings(storageManager.getDefaultSettings());
  }

  segmentedGroups.forEach((group) => {
    const key = group.dataset.setting;
    group.querySelectorAll('.segment').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const updated = await storageManager.saveSettings({ [key]: Number(btn.dataset.value) });
          renderSettings(updated);
        } catch (err) {
          console.warn('[YTResume] Failed to save setting:', err);
        }
      });
    });
  });

  toggles.forEach((btn) => {
    const key = btn.dataset.setting;
    btn.addEventListener('click', async () => {
      const nextValue = !btn.classList.contains('active');
      try {
        const updated = await storageManager.saveSettings({ [key]: nextValue });
        renderSettings(updated);
        // 8.5/8.6 — applies to already-rendered rows in this same popup
        // session immediately, not only the next time the popup opens.
        if (key === 'loadThumbnails') applyThumbnailSetting(updated.loadThumbnails);
      } catch (err) {
        console.warn('[YTResume] Failed to save setting:', err);
      }
    });
  });

  // Reset to defaults
  const resetBtn = document.getElementById('reset-btn');
  const resetConfirmPanel = document.getElementById('reset-confirm-panel');
  const resetCancelBtn = document.getElementById('reset-cancel-btn');
  const resetConfirmBtn = document.getElementById('reset-confirm-btn');

  resetBtn.addEventListener('click', () => {
    resetBtn.classList.add('hidden');
    resetConfirmPanel.classList.remove('hidden');
    resetCancelBtn.focus(); // 8.7/D-123
  });

  resetCancelBtn.addEventListener('click', () => {
    resetConfirmPanel.classList.add('hidden');
    resetBtn.classList.remove('hidden');
    resetBtn.focus(); // 8.7/D-123 — return focus to the trigger on cancel
  });

  resetConfirmBtn.addEventListener('click', async () => {
    try {
      const defaults = await storageManager.resetSettings();
      renderSettings(defaults);
      applyThumbnailSetting(defaults.loadThumbnails); // 8.5 — applies live, same as a direct toggle
    } catch (err) {
      console.warn('[YTResume] Failed to reset settings:', err);
    } finally {
      resetConfirmPanel.classList.add('hidden');
      resetBtn.classList.remove('hidden');
      resetBtn.focus();
    }
  });
});
