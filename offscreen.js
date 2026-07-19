// Lucid offscreen document
// Hosts long-lived AI sessions (Gemini Nano) that persist across service-worker sleep cycles.

let aiSession = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
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
      break;
  }
});

async function handleInitSession(message, sendResponse) {
  try {
    if (self.ai?.languageModel) {
      aiSession = await self.ai.languageModel.create({
        systemPrompt: 'You are a text simplification assistant. Rewrite the given paragraph in plainer language while preserving every fact, number, name, date, and qualifier. Do not add any information not present in the original.',
      });
      sendResponse({ success: true });
    } else if (self.ai?.rewriter) {
      aiSession = await self.ai.rewriter.create({ tone: 'simpler' });
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'No AI API available' });
    }
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

async function handleSimplifyChunk(message, sendResponse) {
  if (!aiSession) {
    sendResponse({ success: false, error: 'No active AI session' });
    return;
  }
  try {
    const result = await aiSession.rewrite(message.text);
    sendResponse({ success: true, result });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

function handleDestroySession(sendResponse) {
  if (aiSession) {
    aiSession.destroy();
    aiSession = null;
  }
  sendResponse({ success: true });
}
