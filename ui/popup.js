// Lucid popup script

document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('toggle-reader');
  const statusEl = document.getElementById('status-message');
  const modeBadge = document.getElementById('mode-badge');
  const privacyNote = document.getElementById('privacy-note');

  async function getCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async function updateUI() {
    const tab = await getCurrentTab();
    if (!tab) {
      statusEl.textContent = 'No active tab';
      toggleBtn.disabled = true;
      return;
    }
    toggleBtn.disabled = false;
    statusEl.textContent = `Page: ${tab.title?.slice(0, 40) || 'unknown'}`;
  }

  toggleBtn.addEventListener('click', async () => {
    const tab = await getCurrentTab();
    if (!tab) return;

    toggleBtn.disabled = true;
    statusEl.textContent = 'Processing...';

    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_READER_VIEW' });
      if (response?.active) {
        toggleBtn.textContent = 'Exit Reader View';
        statusEl.textContent = 'Reader view active';
      } else if (response?.error === 'not-simplifiable') {
        statusEl.textContent = 'This page cannot be simplified';
        toggleBtn.textContent = 'Open Reader View';
      } else {
        toggleBtn.textContent = 'Open Reader View';
        statusEl.textContent = 'Reader view closed';
      }
    } catch (err) {
      statusEl.textContent = 'Error: ' + err.message;
      toggleBtn.textContent = 'Open Reader View';
    }
    toggleBtn.disabled = false;
  });

  updateUI();
});
