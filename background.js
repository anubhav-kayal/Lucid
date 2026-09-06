// Lucid background service worker.
// Routes article jobs to the offscreen document and streams progress to a tab.

const OFFSCREEN_PATH = 'offscreen.html';
const CACHE_KEY = 'simplificationCache';
const MAX_CACHE_ENTRIES = 100;
const MAX_CACHE_BYTES = 5 * 1024 * 1024;
const activeJobs = new Map();
let offscreenDocumentReady = false;

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
    startArticleSimplification(message, tabId, sendResponse);
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
  await ensureOffscreenDocument();
  const cache = await readCache();
  const cached = cache[message.cacheKey]?.chunks || {};
  const missingChunks = message.chunks.filter(chunk => !cached[chunk.index]);

  if (missingChunks.length) {
    const init = await chrome.runtime.sendMessage({
      type: 'INIT_AI_SESSION',
      requestId: message.requestId,
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
      const result = await chrome.runtime.sendMessage({
        type: 'SIMPLIFY_CHUNK',
        requestId: message.requestId,
        index: chunk.index,
        text: chunk.text,
        context: context.slice(-2),
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
