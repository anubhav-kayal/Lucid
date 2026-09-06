// Lucid background service worker.
// Routes article jobs to the offscreen document and streams progress to a tab.

const OFFSCREEN_PATH = 'offscreen.html';
const CACHE_KEY = 'simplificationCache';
const MAX_CACHE_ENTRIES = 100;
const MAX_CACHE_BYTES = 5 * 1024 * 1024;
const activeJobs = new Map();
let offscreenDocumentReady = false;

const SENSITIVE_HOST_PARTS = ['bank', 'health', 'mail', 'finance', 'medical'];
const PROVIDERS = {
  anthropic: { model: 'claude-haiku-4-5-20251001' },
  openai: { model: 'gpt-4.1-mini' },
  gemini: { model: 'gemini-2.5-flash' },
};

async function ensureOffscreenDocument() {
  if (offscreenDocumentReady) return;
  if (await chrome.offscreen.hasDocument()) {
    offscreenDocumentReady = true;
    return;
  }
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: [chrome.offscreen.Reason.DOM_SCRAPING],
    justification: 'Host the optional on-device text simplification session.',
  });
  offscreenDocumentReady = true;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CHECK_AI_AVAILABILITY') {
    handleAIAvailabilityCheck(sendResponse);
    return true;
  }
  if (message.type === 'SIMPLIFY_ARTICLE') {
    const tabId = sender.tab?.id;
    if (tabId === undefined) {
      sendResponse({ success: false, error: 'No active tab for simplification.' });
      return false;
    }
    startArticleSimplification({ ...message, pageUrl: sender.tab?.url }, tabId, sendResponse);
    return true;
  }
  if (message.type === 'GET_PROCESSING_CONFIG') {
    getProcessingConfig(sender.tab?.url).then(({ apiKey, ...config }) => sendResponse(config));
    return true;
  }
  if (message.type === 'CANCEL_SIMPLIFICATION') {
    cancelJob(message.requestId);
    sendResponse({ success: true });
    return false;
  }
  if (message.type === 'AI_DOWNLOAD_PROGRESS') {
    const job = activeJobs.get(message.requestId);
    if (job && !job.cancelled) {
      sendProgress(job.tabId, {
        requestId: message.requestId,
        phase: 'download',
        loaded: message.loaded,
      });
    }
  }
  return false;
});

async function handleAIAvailabilityCheck(sendResponse) {
  try {
    await ensureOffscreenDocument();
    const response = await chrome.runtime.sendMessage({ type: 'GET_AI_AVAILABILITY' });
    sendResponse({ availability: response?.availability || {} });
  } catch (error) {
    sendResponse({ availability: {}, error: error.message });
  }
}

async function startArticleSimplification(message, tabId, sendResponse) {
  if (!Array.isArray(message.chunks) || !message.chunks.length) {
    sendResponse({ success: false, error: 'There is no text to simplify.' });
    return;
  }

  for (const [requestId, job] of activeJobs) {
    if (job.tabId === tabId) cancelJob(requestId);
  }

  const job = { tabId, cancelled: false, sessionStarted: false };
  activeJobs.set(message.requestId, job);
  sendResponse({ success: true });
  runArticleSimplification(message, job).catch(async error => {
    if (!job.cancelled) {
      await sendProgress(tabId, { requestId: message.requestId, error: error.message, done: true });
    }
  }).finally(() => {
    activeJobs.delete(message.requestId);
  });
}

async function runArticleSimplification(message, job) {
  const processing = await getProcessingConfig(message.pageUrl);
  if (processing.mode === 'blocked') throw new Error(processing.reason);

  if (processing.mode === 'local') await ensureOffscreenDocument();
  const cache = await readCache();
  const cached = cache[message.cacheKey]?.chunks || {};
  const missingChunks = message.chunks.filter(chunk => !cached[chunk.index]);

  if (missingChunks.length && processing.mode === 'local') {
    const init = await chrome.runtime.sendMessage({
      type: 'INIT_AI_SESSION',
      requestId: message.requestId,
      readingLevel: message.readingLevel || 'simpler',
    });
    if (!init?.success) throw new Error(init?.error || 'On-device AI is unavailable.');
    job.sessionStarted = true;
    await sendProgress(job.tabId, { requestId: message.requestId, phase: 'ready' });
  }

  const savedChunks = { ...cached };
  const context = [];
  let processed = 0;
  for (const chunk of message.chunks) {
    if (job.cancelled) break;

    let simplified = savedChunks[chunk.index];
    if (!simplified) {
      const result = processing.mode === 'cloud'
        ? await simplifyWithCloud(processing, chunk.text, context.slice(-2), message.readingLevel)
        : await chrome.runtime.sendMessage({
          type: 'SIMPLIFY_CHUNK',
          requestId: message.requestId,
          index: chunk.index,
          text: chunk.text,
          context: context.slice(-2),
          readingLevel: message.readingLevel || 'simpler',
        });
      if (job.cancelled) break;
      if (!result?.success) throw new Error(result?.error || 'The paragraph could not be simplified.');
      simplified = result.result;
      savedChunks[chunk.index] = simplified;
      await writeCache(message.cacheKey, savedChunks);
    }

    context.push(simplified);
    await sendProgress(job.tabId, {
      requestId: message.requestId,
      index: chunk.index,
      result: simplified,
      processed: ++processed,
      total: message.totalChunks || message.chunks.length,
    });
  }

  if (!job.cancelled) {
    await sendProgress(job.tabId, { requestId: message.requestId, done: true });
  }
  if (job.sessionStarted) await chrome.runtime.sendMessage({ type: 'DESTROY_AI_SESSION' });
}

async function getProcessingConfig(pageUrl) {
  const settings = await chrome.storage.local.get([
    'aiMode', 'apiProvider', 'apiKey', 'domainAllowlist', 'sensitiveDomainOverrides',
  ]);
  const hostname = safeHostname(pageUrl);
  const provider = settings.apiProvider || 'anthropic';
  const requestedCloud = settings.aiMode === 'cloud';
  const allowed = matchesAllowlist(hostname, settings.domainAllowlist || []);
  const sensitive = isSensitiveHost(hostname);
  const overridden = matchesAllowlist(hostname, settings.sensitiveDomainOverrides || []);

  if (!requestedCloud) return { mode: 'local', provider: null, hostname };
  if (!settings.apiKey || !allowed) {
    return {
      mode: 'local', provider: null, hostname,
      reason: 'Cloud processing is off for this domain; using on-device AI.',
    };
  }
  if (sensitive && !overridden) {
    return {
      mode: 'blocked', provider, hostname,
      reason: 'Cloud processing is blocked on this sensitive domain until you explicitly confirm an override in Lucid Options.',
    };
  }
  if (!PROVIDERS[provider]) return { mode: 'blocked', reason: 'Choose a supported cloud provider in Lucid Options.' };
  return {
    mode: 'cloud', provider, hostname,
    apiKey: settings.apiKey,
    cacheScope: `cloud:${provider}`,
  };
}

function safeHostname(pageUrl) {
  try { return new URL(pageUrl || '').hostname.toLowerCase(); } catch { return ''; }
}

function matchesAllowlist(hostname, patterns) {
  return patterns.some(pattern => {
    const value = String(pattern || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!value) return false;
    if (value.startsWith('*.')) return hostname.endsWith(value.slice(1));
    return hostname === value || hostname.endsWith(`.${value}`);
  });
}

function isSensitiveHost(hostname) {
  return hostname.endsWith('.gov') || hostname.endsWith('.mil')
    || SENSITIVE_HOST_PARTS.some(part => hostname.includes(part));
}

function readingInstruction(readingLevel) {
  if (readingLevel === 'detailed') {
    return 'Rewrite for a curious reader. Add only brief clarifying explanations that are directly supported by the paragraph; do not invent facts.';
  }
  return 'Rewrite at approximately a grade 5–6 reading level using shorter, plain-language sentences.';
}

function buildCloudPrompt(text, context, readingLevel) {
  const previous = context.length
    ? `Previous rewritten context (do not repeat it):\n${context.join('\n\n')}\n\n`
    : '';
  return `${previous}${readingInstruction(readingLevel)} Preserve every name, number, date, quote, qualification, and uncertainty. Return only the rewritten paragraph.\n\nParagraph:\n${text}`;
}

async function simplifyWithCloud(config, text, context, readingLevel) {
  const prompt = buildCloudPrompt(text, context, readingLevel);
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await callProvider(config, prompt);
      if (!result) throw new Error('The cloud provider returned an empty response.');
      return { success: true, result };
    } catch (error) {
      lastError = error;
      if (attempt === 0 && (error.rateLimited || /empty response/i.test(error.message))) {
        await new Promise(resolve => setTimeout(resolve, 600));
        continue;
      }
      break;
    }
  }
  throw lastError || new Error('Cloud simplification failed.');
}

async function callProvider(config, prompt) {
  let url;
  let headers = { 'content-type': 'application/json' };
  let body;
  if (config.provider === 'anthropic') {
    url = 'https://api.anthropic.com/v1/messages';
    headers = { ...headers, 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' };
    body = { model: PROVIDERS.anthropic.model, max_tokens: 900, messages: [{ role: 'user', content: prompt }] };
  } else if (config.provider === 'openai') {
    url = 'https://api.openai.com/v1/responses';
    headers = { ...headers, authorization: `Bearer ${config.apiKey}` };
    body = { model: PROVIDERS.openai.model, input: prompt };
  } else {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${PROVIDERS.gemini.model}:generateContent`;
    headers = { ...headers, 'x-goog-api-key': config.apiKey };
    body = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
  }
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Cloud provider error (${response.status}).`);
    error.rateLimited = response.status === 429;
    throw error;
  }
  const text = config.provider === 'anthropic'
    ? payload.content?.map(part => part.text || '').join('')
    : config.provider === 'openai'
      ? (payload.output_text || payload.output?.flatMap(item => item.content || []).map(part => part.text || '').join(''))
      : payload.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('');
  return String(text || '').trim();
}

function cancelJob(requestId) {
  const job = activeJobs.get(requestId);
  if (!job) return;
  job.cancelled = true;
  if (job.sessionStarted) chrome.runtime.sendMessage({ type: 'DESTROY_AI_SESSION' }).catch(() => {});
}

async function sendProgress(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'SIMPLIFICATION_PROGRESS', ...message });
  } catch {
    // The tab was closed or navigated away.
  }
}

async function readCache() {
  const result = await chrome.storage.local.get(CACHE_KEY);
  return result[CACHE_KEY] || {};
}

async function writeCache(cacheKey, chunks) {
  const cache = await readCache();
  cache[cacheKey] = { chunks, updatedAt: Date.now() };
  const entries = Object.entries(cache)
    .sort(([, a], [, b]) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CACHE_ENTRIES);
  let totalBytes = 0;
  const trimmed = {};
  for (const [key, value] of entries) {
    const size = JSON.stringify(value).length;
    if (totalBytes + size > MAX_CACHE_BYTES) continue;
    trimmed[key] = value;
    totalBytes += size;
  }
  await chrome.storage.local.set({ [CACHE_KEY]: trimmed });
}

chrome.runtime.onInstalled.addListener(() => console.log('Lucid installed.'));
