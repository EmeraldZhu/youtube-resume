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
  const confirmCountEl = document.getElementById('confirm-count');
  const clearBtn = document.getElementById('clear-btn');
  const confirmPanel = document.getElementById('confirm-panel');
  const cancelBtn = document.getElementById('cancel-btn');
  const confirmBtn = document.getElementById('confirm-btn');

  let entryCount = 0;
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

  function buildRow(videoId, entry) {
    const li = document.createElement('li');
    li.className = 'video-row';
    li.dataset.id = videoId;

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
      img.width = 120;
      img.height = 68;
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

    const textBlock = document.createElement('div');
    textBlock.className = 'row-text';

    const titleEl = document.createElement('p');
    titleEl.className = 'row-title';
    titleEl.textContent = entry.title || 'Untitled video';

    const progressTrack = document.createElement('div');
    progressTrack.className = 'progress-track';
    const progressFill = document.createElement('div');
    progressFill.className = 'progress-fill';
    const duration = entry.duration > 0 ? entry.duration : 0;
    const percent = duration > 0 ? Math.min(100, Math.max(0, Math.round((entry.time / duration) * 100))) : 0;
    progressFill.style.width = `${percent}%`;
    progressTrack.appendChild(progressFill);

    const metaEl = document.createElement('p');
    metaEl.className = 'row-meta';
    metaEl.textContent = `${formatTime(entry.time)} / ${formatTime(duration)} · ${percent}% watched`;

    textBlock.appendChild(titleEl);
    textBlock.appendChild(progressTrack);
    textBlock.appendChild(metaEl);

    link.appendChild(thumbWrap);
    link.appendChild(textBlock);

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
      li.remove();
      updateCount(entryCount - 1);
    });

    li.appendChild(link);
    li.appendChild(removeBtn);
    return li;
  }

  try {
    const [store, settings] = await Promise.all([
      storageManager.getAllProgress(),
      storageManager.getSettings(),
    ]);
    loadThumbnails = settings.loadThumbnails;

    const entries = Object.entries(store).sort((a, b) => b[1].updated - a[1].updated);
    entries.forEach(([videoId, entry]) => {
      listEl.appendChild(buildRow(videoId, entry));
    });
    updateCount(entries.length);
  } catch (err) {
    console.warn('[YTResume] Failed to read storage:', err);
    updateCount(0);
  }

  // Clear saved progress (moved into settings view, D-014: youtubeResume only)
  clearBtn.addEventListener('click', () => {
    if (entryCount === 0) return;

    confirmCountEl.textContent = entryCount;
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
