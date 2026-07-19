// Lucid options page script

document.addEventListener('DOMContentLoaded', () => {
  const modeRadios = document.querySelectorAll('input[name="ai-mode"]');
  const cloudSettings = document.getElementById('cloud-settings');
  const apiProvider = document.getElementById('api-provider');
  const apiKey = document.getElementById('api-key');
  const domainAllowlist = document.getElementById('domain-allowlist');
  const saveBtn = document.getElementById('save-options');
  const saveStatus = document.getElementById('save-status');
  const aiIndicator = document.getElementById('ai-indicator');
  const aiStatusText = document.getElementById('ai-status-text');

  // Load saved settings
  chrome.storage.local.get(['aiMode', 'apiProvider', 'apiKey', 'domainAllowlist'], (result) => {
    if (result.aiMode === 'cloud') {
      document.querySelector('input[value="cloud"]').checked = true;
      cloudSettings.style.display = 'block';
    }
    if (result.apiProvider) apiProvider.value = result.apiProvider;
    if (result.apiKey) apiKey.value = result.apiKey;
    if (result.domainAllowlist) domainAllowlist.value = result.domainAllowlist.join('\n');
  });

  // Toggle cloud settings
  modeRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      cloudSettings.style.display = radio.value === 'cloud' ? 'block' : 'none';
    });
  });

  // Save options
  saveBtn.addEventListener('click', () => {
    const allowlist = domainAllowlist.value
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    chrome.storage.local.set({
      aiMode: document.querySelector('input[name="ai-mode"]:checked').value,
      apiProvider: apiProvider.value,
      apiKey: apiKey.value,
      domainAllowlist: allowlist,
    }, () => {
      saveStatus.textContent = 'Settings saved.';
      setTimeout(() => { saveStatus.textContent = ''; }, 2000);
    });
  });

  // Check AI availability
  async function checkAIAvailability() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'CHECK_AI_AVAILABILITY' });
      const avail = response?.availability || {};
      const hasAI = avail.summarizer || avail.rewriter || avail.languageModel;
      aiIndicator.className = hasAI ? 'indicator on' : 'indicator off';
      const parts = [];
      if (avail.languageModel) parts.push('LanguageModel');
      if (avail.rewriter) parts.push('Rewriter');
      if (avail.summarizer) parts.push('Summarizer');
      aiStatusText.textContent = parts.length
        ? `Available: ${parts.join(', ')}`
        : 'Not available (Gemini Nano may not be available on this device)';
    } catch {
      aiIndicator.className = 'indicator off';
      aiStatusText.textContent = 'Could not check AI availability';
    }
  }

  checkAIAvailability();
});
