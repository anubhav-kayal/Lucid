// Lucid background service worker
// Acts as a message router between content script, offscreen document, and popup.

const OFFSCREEN_PATH = 'offscreen.html';
let offscreenDocumentReady = false;

async function ensureOffscreenDocument() {
  if (offscreenDocumentReady) return;
  const existing = await chrome.offscreen.hasDocument();
  if (existing) {
    offscreenDocumentReady = true;
    return;
  }
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: [chrome.offscreen.Reason.DOM_SCRAPING],
    justification: 'Host AI sessions for content simplification.',
  });
  offscreenDocumentReady = true;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'EXTRACT_AND_SIMPLIFY': {
      handleSimplifyRequest(message, sender.tab.id, sendResponse);
      return true;
    }
    case 'CHECK_AI_AVAILABILITY': {
      handleAIAvailabilityCheck(sendResponse);
      return true;
    }
    case 'SIMPLIFY_TEXT': {
      handleTextSimplification(message, sendResponse);
      return true;
    }
    default:
      break;
  }
});

async function handleSimplifyRequest(message, tabId, sendResponse) {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: (styleCss) => {
        const article = document.lucidArticle;
        if (!article) return { error: 'No article extracted' };
        return { html: article.content, title: article.title };
      },
    });
    sendResponse({ success: true, data: result[0]?.result });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

async function handleAIAvailabilityCheck(sendResponse) {
  const availability = {
    summarizer: !!self.ai?.summarizer,
    rewriter: !!self.ai?.rewriter,
    languageModel: !!self.ai?.languageModel,
  };
  sendResponse({ availability });
}

async function handleTextSimplification(message, sendResponse) {
  sendResponse({ success: false, error: 'Not yet implemented' });
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('Lucid installed.');
});
