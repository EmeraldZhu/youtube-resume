// popup.js - Data loading and UI interactions

document.addEventListener('DOMContentLoaded', async () => {
  // View switching
  const viewList = document.getElementById('view-list');
  const viewSettings = document.getElementById('view-settings');
  const settingsBtn = document.getElementById('settings-btn');
  const backBtn = document.getElementById('back-btn');

  settingsBtn.addEventListener('click', () => {
    viewList.classList.add('hidden');
    viewSettings.classList.remove('hidden');
  });

  backBtn.addEventListener('click', () => {
    viewSettings.classList.add('hidden');
    viewList.classList.remove('hidden');
  });

  // Saved videos count
  const countEl = document.getElementById('saved-count');
  const confirmCountEl = document.getElementById('confirm-count');
  const clearBtn = document.getElementById('clear-btn');
  const confirmPanel = document.getElementById('confirm-panel');
  const cancelBtn = document.getElementById('cancel-btn');
  const confirmBtn = document.getElementById('confirm-btn');

  let entryCount = 0;

  try {
    const store = await storageManager.getAllProgress();
    entryCount = Object.keys(store).length;
    countEl.textContent = entryCount;
  } catch (err) {
    console.warn('[YTResume] Failed to read storage:', err);
    countEl.textContent = '—'; // Fallback per spec, not 0
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
      entryCount = 0;
      countEl.textContent = '0';
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
