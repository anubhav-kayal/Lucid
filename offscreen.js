// Lucid offscreen document.
// AI API names vary by Chrome channel, so the adapter supports both the
// built-in `ai` namespace and the newer global LanguageModel surface.

let aiSession = null;
let aiSessionKind = null;
const LANGUAGE_MODEL_OPTIONS = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_AI_AVAILABILITY':
      handleAIAvailability(sendResponse);
      return true;
    case 'INIT_AI_SESSION':
      handleInitSession(message, sendResponse);
      return true;
    case 'SIMPLIFY_CHUNK':
      handleSimplifyChunk(message, sendResponse);
      return true;
    case 'DESTROY_AI_SESSION':
      handleDestroySession(sendResponse);
      return true;
    default:
      return false;
  }
});

function getLanguageModel() {
  return self.ai?.languageModel || self.LanguageModel || null;
}

function getRewriter() {
  return self.ai?.rewriter || self.Rewriter || null;
}

async function getAvailability(api, options) {
  if (!api) return 'unavailable';
  if (typeof api.availability !== 'function') return 'available';
  try { return await api.availability(options); } catch { return 'unavailable'; }
}

async function handleAIAvailability(sendResponse) {
  const languageModel = getLanguageModel();
  const rewriter = getRewriter();
  sendResponse({ availability: {
    languageModel: !!languageModel,
    rewriter: !!rewriter,
    languageModelState: await getAvailability(languageModel, LANGUAGE_MODEL_OPTIONS),
    rewriterState: await getAvailability(rewriter),
  }});
}

async function handleInitSession(message, sendResponse) {
  try {
    await handleDestroySession();
    const languageModel = getLanguageModel();
    const rewriter = getRewriter();
    const languageModelState = await getAvailability(languageModel, LANGUAGE_MODEL_OPTIONS);
    const rewriterState = await getAvailability(rewriter);

    if (languageModel && languageModelState !== 'unavailable') {
      aiSession = await languageModel.create({
        ...LANGUAGE_MODEL_OPTIONS,
        monitor: createDownloadMonitor(message.requestId),
      });
      aiSessionKind = 'languageModel';
    } else if (rewriter && rewriterState !== 'unavailable') {
      aiSession = await rewriter.create({ tone: 'simpler', monitor: createDownloadMonitor(message.requestId) });
      aiSessionKind = 'rewriter';
    } else {
      throw new Error('On-device AI is unavailable on this device.');
    }
    sendResponse({ success: true, state: languageModelState !== 'unavailable' ? languageModelState : rewriterState });
  } catch (error) {
    aiSession = null;
    aiSessionKind = null;
    sendResponse({ success: false, error: error.message });
  }
}

async function handleSimplifyChunk(message, sendResponse) {
  if (!aiSession) {
    sendResponse({ success: false, error: 'No active AI session.' });
    return;
  }
  try {
    const context = Array.isArray(message.context) && message.context.length
      ? `Previous simplified context (do not repeat it):\n${message.context.join('\n\n')}\n\n`
      : '';
    const prompt = `${context}Simplify this paragraph while preserving all entities and qualifiers:\n\n${message.text}`;
    const result = aiSessionKind === 'languageModel'
      ? await aiSession.prompt(prompt)
      : await aiSession.rewrite(message.text);
    sendResponse({ success: true, result: String(result || '').trim() });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

function createDownloadMonitor(requestId) {
  return monitor => {
    monitor.addEventListener('downloadprogress', event => {
      chrome.runtime.sendMessage({
        type: 'AI_DOWNLOAD_PROGRESS',
        requestId,
        loaded: event.loaded,
      }).catch(() => {});
    });
  };
}

function handleDestroySession(sendResponse) {
  if (aiSession?.destroy) aiSession.destroy();
  aiSession = null;
  aiSessionKind = null;
  if (sendResponse) sendResponse({ success: true });
}
