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
  const confirmCountEl = document.getElementById('confirm-count');
  const confirmPinnedNoteEl = document.getElementById('confirm-pinned-note');
  const clearBtn = document.getElementById('clear-btn');
  const confirmPanel = document.getElementById('confirm-panel');
  const cancelBtn = document.getElementById('cancel-btn');
  const confirmBtn = document.getElementById('confirm-btn');

  let entryCount = 0;
  let pinnedCount = 0;
  let loadThumbnails = true;

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

  function updatePinButton(pinBtn, pinned) {
    pinBtn.classList.toggle('pinned', pinned);
    pinBtn.setAttribute('aria-pressed', String(pinned));
    pinBtn.setAttribute('aria-label', pinned ? 'Unpin this video' : 'Pin this video');
    pinBtn.replaceChildren(createPinIcon(pinned, 13));
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
      thumbWrap.appendChild(img);
    } else {
      thumbWrap.classList.add('placeholder');
    }

    // Pinned badge (D-077, UX Spec §6.3): passive, always-visible indicator
    // — the interactive pin control below is the hover-revealed toggle.
    updatePinBadge(thumbWrap, !!entry.pinned);

    const duration = entry.duration > 0 ? entry.duration : 0;
    const percent = duration > 0 ? Math.min(100, Math.max(0, Math.round((entry.time / duration) * 100))) : 0;

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
    thumbProgressFill.style.width = `${percent}%`;
    thumbProgressTrack.appendChild(thumbProgressFill);
    thumbWrap.appendChild(thumbProgressTrack);

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
    metaEl.textContent = `${formatTime(entry.time)} / ${formatTime(duration)} · ${percent}% watched`;
    textBlock.appendChild(metaEl);

    link.appendChild(thumbWrap);
    link.appendChild(textBlock);

    // Pin control (5.1, D-077): reading order "pin, then remove" (UX Spec
    // §6.3) — appended before the remove button below, both siblings of
    // the link so each is independently reachable by Tab (T5.4).
    const pinBtn = document.createElement('button');
    pinBtn.type = 'button';
    pinBtn.className = 'pin-btn';
    pinBtn.appendChild(createPinIcon(!!entry.pinned, 13));
    pinBtn.setAttribute('aria-pressed', String(!!entry.pinned));
    pinBtn.setAttribute('aria-label', entry.pinned ? 'Unpin this video' : 'Pin this video');
    if (entry.pinned) pinBtn.classList.add('pinned');
    pinBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const willPin = !pinBtn.classList.contains('pinned');
      try {
        if (willPin) {
          await storageManager.pinProgress(videoId);
        } else {
          await storageManager.unpinProgress(videoId);
        }
      } catch (err) {
        if (willPin && /pin cap/.test(err.message)) {
          showPinCapMessage(li, pinBtn);
        } else {
          console.warn('[YTResume] Failed to toggle pin:', err);
        }
        return;
      }
      entry.pinned = willPin;
      li.dataset.pinned = willPin ? 'true' : 'false';
      pinnedCount += willPin ? 1 : -1;
      updatePinButton(pinBtn, willPin);
      updatePinBadge(thumbWrap, willPin);
      moveRowToSortedPosition(li, willPin, entry.updated);
    });

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-btn';
    removeBtn.setAttribute('aria-label', 'Remove from saved videos');
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await storageManager.deleteProgress(videoId);
      } catch (err) {
        console.warn('[YTResume] Failed to delete entry:', err);
        return;
      }
      if (entry.pinned) pinnedCount -= 1;
      li.remove();
      updateCount(entryCount - 1);
    });

    li.appendChild(link);
    li.appendChild(pinBtn);
    li.appendChild(removeBtn);
    return li;
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
    let settings;
    try {
      settings = await storageManager.getSettings();
    } catch (err) {
      console.warn('[YTResume] Failed to read settings, using defaults:', err);
      settings = storageManager.getDefaultSettings();
    }
    loadThumbnails = settings.loadThumbnails;

    // Two-tier sort (UX Spec §6.3): pinned entries first, then unpinned;
    // most recently watched first within each group.
    const entries = Object.entries(store).sort((a, b) => {
      if (!!a[1].pinned !== !!b[1].pinned) return a[1].pinned ? -1 : 1;
      return b[1].updated - a[1].updated;
    });
    entries.forEach(([videoId, entry]) => {
      listEl.appendChild(buildRow(videoId, entry));
    });
    pinnedCount = entries.filter(([, entry]) => entry.pinned).length;
    updateCount(entries.length);
  } else {
    // CP-75/CP-76 (UX Spec §6.3 Load-Failure State) — same layout position
    // as the empty state, distinct copy, never the empty-state message.
    listEl.classList.add('hidden');
    emptyStateEl.classList.add('hidden');
    loadFailureEl.classList.remove('hidden');
    clearBtn.disabled = true;
  }

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
  });

  cancelBtn.addEventListener('click', () => {
    confirmPanel.classList.add('hidden');
    clearBtn.classList.remove('hidden');
  });

  confirmBtn.addEventListener('click', async () => {
    try {
      await storageManager.clearAllProgress();
      listEl.replaceChildren();
      pinnedCount = 0;
      updateCount(0);
    } catch (err) {
      console.warn('[YTResume] Failed to clear storage:', err);
    } finally {
      confirmPanel.classList.add('hidden');
      clearBtn.classList.remove('hidden');
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
  });

  resetCancelBtn.addEventListener('click', () => {
    resetConfirmPanel.classList.add('hidden');
    resetBtn.classList.remove('hidden');
  });

  resetConfirmBtn.addEventListener('click', async () => {
    try {
      const defaults = await storageManager.resetSettings();
      renderSettings(defaults);
    } catch (err) {
      console.warn('[YTResume] Failed to reset settings:', err);
    } finally {
      resetConfirmPanel.classList.add('hidden');
      resetBtn.classList.remove('hidden');
    }
  });
});
