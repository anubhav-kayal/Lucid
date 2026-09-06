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

    try {
      const config = await chrome.runtime.sendMessage({ type: 'GET_PROCESSING_CONFIG' });
      if (config?.mode === 'cloud') {
        modeBadge.className = 'badge cloud';
        modeBadge.textContent = 'Cloud';
        privacyNote.textContent = `Text may be sent to ${config.provider} for this domain`;
      } else {
        modeBadge.className = 'badge local';
        modeBadge.textContent = 'On-device';
        privacyNote.textContent = config?.reason || 'Processing stays on your device';
      }
    } catch {
      modeBadge.className = 'badge local';
      modeBadge.textContent = 'On-device';
      privacyNote.textContent = 'Processing stays on your device';
    }

    try {
      const state = await chrome.tabs.sendMessage(tab.id, { type: 'GET_READER_STATE' });
      if (state?.active) {
        toggleBtn.textContent = 'Exit Reader View';
        statusEl.textContent = 'Reader view active';
      }
    } catch {
      // Content scripts are unavailable on browser-internal pages.
    }
  }

  toggleBtn.addEventListener('click', async () => {
    const tab = await getCurrentTab();
    if (!tab) return;

    toggleBtn.disabled = true;
    statusEl.textContent = 'Processing...';

    try {
      const response = await sendToggleMessage(tab.id);
      if (response?.active) {
        toggleBtn.textContent = 'Exit Reader View';
        statusEl.textContent = response.notSimplifiable ? 'This page cannot be simplified' : 'Reader view active';
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

  async function sendToggleMessage(tabId) {
    try {
      return await chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_READER_VIEW' });
    } catch (error) {
      if (!error.message?.includes('Receiving end does not exist')) throw error;
      await chrome.scripting.executeScript({
        target: { tabId },
        files: [
          'lib/readability.js',
          'lib/entity-preservation.js',
          'content-script.js',
        ],
      });
      return chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_READER_VIEW' });
    }
  }
});
