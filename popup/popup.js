// popup.js - Data loading and UI interactions

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const countEl = document.getElementById('saved-count');
  const confirmCountEl = document.getElementById('confirm-count');
  const clearBtn = document.getElementById('clear-btn');
  const confirmPanel = document.getElementById('confirm-panel');
  const cancelBtn = document.getElementById('cancel-btn');
  const confirmBtn = document.getElementById('confirm-btn');

  let entryCount = 0;

  // 1. Data Loading
  try {
    const store = await storageManager.getAllProgress();
    entryCount = Object.keys(store).length;
    countEl.textContent = entryCount;
  } catch (err) {
    console.warn('[YTResume] Failed to read storage:', err);
    countEl.textContent = '—'; // Fallback per spec, not 0
  }

  // 2. Interaction: Initial Clear Click -> Show Confirmation
  clearBtn.addEventListener('click', () => {
    if (entryCount === 0) return; // Optional: maybe do nothing if already 0

    confirmCountEl.textContent = entryCount;
    clearBtn.classList.add('hidden');
    confirmPanel.classList.remove('hidden');
  });

  // 3. Interaction: Cancel Confirmation
  cancelBtn.addEventListener('click', () => {
    confirmPanel.classList.add('hidden');
    clearBtn.classList.remove('hidden');
  });

  // 4. Interaction: Confirm Deletion
  confirmBtn.addEventListener('click', async () => {
    try {
      await storageManager.clearAllProgress();
      entryCount = 0;
      countEl.textContent = '0';
      
      // Inline reset to original state
      confirmPanel.classList.add('hidden');
      clearBtn.classList.remove('hidden');
    } catch (err) {
      console.warn('[YTResume] Failed to clear storage:', err);
      // Fallback state if it errors
      confirmPanel.classList.add('hidden');
      clearBtn.classList.remove('hidden');
    }
  });
});
