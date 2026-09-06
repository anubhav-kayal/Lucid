// Lucid content script
// Extracts article DOM via Readability.js and renders an isolated reader view.

let readerViewActive = false;
let readerShadowRoot = null;
let originalBodyDisplay = null;
let originalDocumentOverflow = null;
let simplificationState = 'original';
let simplificationRequestId = null;

window.addEventListener('pagehide', cancelSimplification);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'TOGGLE_READER_VIEW':
      toggleReaderView(sendResponse);
      return true;
    case 'GET_READER_STATE':
      sendResponse({ active: readerViewActive });
      return false;
    case 'EXIT_READER_VIEW':
      exitReaderView(sendResponse);
      return true;
    default:
      break;
  }
});

function extractArticle() {
  const documentClone = document.cloneNode(true);
  return new Readability(documentClone).parse();
}

function toggleReaderView(sendResponse) {
  if (readerViewActive) {
    exitReaderView();
    sendResponse({ active: false });
    return;
  }

  let article;
  try {
    article = extractArticle();
  } catch (error) {
    renderNotSimplifiable('Lucid could not read this page.');
    readerViewActive = true;
    sendResponse({ active: true, notSimplifiable: true, error: error.message });
    return;
  }

  if (!article || !article.content || article.length < 200) {
    renderNotSimplifiable();
    readerViewActive = true;
    sendResponse({ active: true, notSimplifiable: true });
    return;
  }

  document.lucidArticle = article;
  renderReaderView(article);
  readerViewActive = true;
  sendResponse({ active: true, title: article.title });
}

function exitReaderView(sendResponse) {
  cancelSimplification();
  if (readerShadowRoot) {
    readerShadowRoot.host.remove();
    readerShadowRoot = null;
  }
  readerViewActive = false;
  document.removeEventListener('keydown', handleReaderKeydown, true);
  if (document.body && originalBodyDisplay !== null) {
    document.body.style.display = originalBodyDisplay;
  }
  if (originalDocumentOverflow !== null) {
    document.documentElement.style.overflow = originalDocumentOverflow;
  }
  originalBodyDisplay = null;
  originalDocumentOverflow = null;
  if (sendResponse) sendResponse({ active: false });
}

function renderReaderView(article) {
  const shadow = createReaderShell();
  const container = document.createElement('article');
  container.className = 'lucid-reader';

  const header = document.createElement('header');
  header.className = 'lucid-header';

  const utilityBar = document.createElement('div');
  utilityBar.className = 'lucid-utility-bar';
  const wordmark = document.createElement('span');
  wordmark.className = 'lucid-wordmark';
  wordmark.textContent = 'LUCID';
  const mode = document.createElement('span');
  mode.className = 'lucid-mode';
  mode.textContent = 'Reader view';
  const simplifyButton = document.createElement('button');
  simplifyButton.type = 'button';
  simplifyButton.className = 'lucid-simplify';
  simplifyButton.textContent = 'Simplify text';
  simplifyButton.addEventListener('click', () => simplifyArticle(container, simplifyButton));
  utilityBar.append(wordmark, mode, simplifyButton, createExitButton());

  const title = document.createElement('h1');
  title.className = 'lucid-title';
  title.textContent = article.title || 'Untitled article';
  header.append(utilityBar, title);

  if (article.byline) {
    const byline = document.createElement('p');
    byline.className = 'lucid-byline';
    byline.textContent = article.byline;
    header.appendChild(byline);
  }

  const content = document.createElement('div');
  content.className = 'lucid-content';
  content.innerHTML = article.content;
  container.append(header, content);
  shadow.appendChild(container);
  updateSimplifyAvailability(container, simplifyButton);
}

function renderNotSimplifiable(message = 'This page is not an article yet.') {
  const shadow = createReaderShell();
  const container = document.createElement('div');
  container.className = 'lucid-not-simplifiable';

  const card = document.createElement('div');
  card.className = 'lucid-empty-card';
  const label = document.createElement('p');
  label.className = 'lucid-empty-label';
  label.textContent = 'Nothing to simplify';
  const title = document.createElement('h1');
  title.textContent = message;
  const detail = document.createElement('p');
  detail.textContent = 'Lucid works best on articles and long-form content.';
  card.append(label, title, detail, createExitButton());
  container.appendChild(card);
  shadow.appendChild(container);
}

function createReaderShell() {
  if (readerShadowRoot) readerShadowRoot.host.remove();

  const host = document.createElement('div');
  host.id = 'lucid-reader-host';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;overflow-y:auto;';
  const shadow = host.attachShadow({ mode: 'closed' });
  readerShadowRoot = shadow;

  if (originalBodyDisplay === null && document.body) {
    originalBodyDisplay = document.body.style.display;
  }
  if (originalDocumentOverflow === null) {
    originalDocumentOverflow = document.documentElement.style.overflow;
  }
  if (document.body) document.body.style.display = 'none';
  document.documentElement.style.overflow = 'hidden';
  document.documentElement.appendChild(host);
  document.addEventListener('keydown', handleReaderKeydown, true);

  const styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = chrome.runtime.getURL('styles/reader-view.css');
  shadow.appendChild(styleLink);
  return shadow;
}

function createExitButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'lucid-exit';
  button.textContent = 'Exit';
  button.setAttribute('aria-label', 'Exit Lucid reader view');
  button.addEventListener('click', () => exitReaderView());
  return button;
}

function handleReaderKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    exitReaderView();
  }
}

async function simplifyArticle(container, button) {
  if (simplificationState === 'loading' || simplificationState === 'simplified') return;
  const paragraphs = [...container.querySelectorAll('.lucid-content p')]
    .map((element, index) => ({ index, text: element.textContent.trim(), element }))
    .filter(item => item.text.length > 0);
  if (!paragraphs.length) return;
  paragraphs.forEach(({ index, element }) => {
    element.dataset.lucidIndex = String(index);
  });

  simplificationState = 'loading';
  simplificationRequestId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  button.disabled = true;
  button.textContent = 'Preparing…';
  paragraphs.forEach(({ element }) => element.classList.add('lucid-simplifying'));

  try {
    const contentText = paragraphs.map(item => item.text).join('\n\n');
    const contentHash = await hashText(contentText);
    const response = await chrome.runtime.sendMessage({
      type: 'SIMPLIFY_ARTICLE',
      requestId: simplificationRequestId,
      cacheKey: `${location.href}|${contentHash}`,
      chunks: paragraphs.map(({ index, text }) => ({ index, text })),
    });
    if (!response?.success) throw new Error(response?.error || 'Simplification is unavailable');
    button.textContent = 'Simplifying…';
  } catch (error) {
    simplificationState = 'original';
    button.disabled = false;
    button.textContent = 'Simplify text';
    paragraphs.forEach(({ element }) => element.classList.remove('lucid-simplifying'));
    showReaderStatus(container, error.message);
  }
}

async function updateSimplifyAvailability(container, button) {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'CHECK_AI_AVAILABILITY' });
    const availability = response?.availability || {};
    const state = availability.languageModelState || availability.rewriterState || 'unavailable';
    if (state === 'unavailable') {
      button.disabled = true;
      button.textContent = 'AI unavailable';
      button.title = 'On-device AI is not available in this browser or on this device.';
    } else if (state === 'downloadable') {
      button.textContent = 'Download & simplify';
      showReaderStatus(container, 'The on-device model will download after you choose Simplify.');
    } else if (state === 'downloading') {
      button.textContent = 'Simplify text';
      showReaderStatus(container, 'The on-device model is downloading.');
    }
  } catch {
    button.disabled = true;
    button.textContent = 'AI unavailable';
  }
}

function cancelSimplification() {
  if (simplificationState !== 'loading' || !simplificationRequestId) return;
  chrome.runtime.sendMessage({ type: 'CANCEL_SIMPLIFICATION', requestId: simplificationRequestId }).catch(() => {});
  simplificationState = 'original';
  simplificationRequestId = null;
}

async function hashText(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function showReaderStatus(container, message) {
  let status = container.querySelector('.lucid-status');
  if (!status) {
    status = document.createElement('p');
    status.className = 'lucid-status';
    container.querySelector('.lucid-header').appendChild(status);
  }
  status.textContent = message;
}

function renderSimplifiedParagraph(message) {
  if (!readerShadowRoot || message.requestId !== simplificationRequestId) return;
  if (message.error) {
    const container = readerShadowRoot.querySelector('.lucid-reader');
    if (container) showReaderStatus(container, message.error);
    simplificationState = 'original';
    const button = readerShadowRoot.querySelector('.lucid-simplify');
    if (button) { button.disabled = false; button.textContent = 'Try again'; }
    readerShadowRoot.querySelectorAll('.lucid-simplifying').forEach(element => element.classList.remove('lucid-simplifying'));
    readerShadowRoot.querySelector('.lucid-download-progress')?.remove();
    return;
  }
  if (message.phase === 'download') {
    const container = readerShadowRoot.querySelector('.lucid-reader');
    if (container) showDownloadProgress(container, message.loaded || 0);
    return;
  }
  if (message.phase === 'ready') {
    const container = readerShadowRoot.querySelector('.lucid-reader');
    if (container) showReaderStatus(container, 'Model ready. Simplifying your article…');
    readerShadowRoot.querySelector('.lucid-download-progress')?.remove();
    return;
  }
  const element = readerShadowRoot.querySelector(`.lucid-content p[data-lucid-index="${message.index}"]`);
  if (!element) return;

  const original = element.dataset.lucidOriginal || element.textContent;
  element.dataset.lucidOriginal = original;
  const result = String(message.result || '').trim();
  if (!result) return;
  const verification = checkPreservation(original, result);
  element.textContent = result;
  element.classList.remove('lucid-simplifying');
  element.classList.add(verification.passed ? 'lucid-simplified' : 'lucid-simplified-flagged');
  if (!verification.passed) element.title = `Check this paragraph: ${verification.missing.join(', ')}`;
}

function showDownloadProgress(container, loaded) {
  let progress = container.querySelector('.lucid-download-progress');
  if (!progress) {
    progress = document.createElement('progress');
    progress.className = 'lucid-download-progress';
    progress.max = 1;
    container.querySelector('.lucid-header').appendChild(progress);
  }
  progress.value = loaded;
  showReaderStatus(container, `Downloading on-device model: ${Math.round(loaded * 100)}%`);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SIMPLIFICATION_PROGRESS') {
    renderSimplifiedParagraph(message);
    if (message.done && message.requestId === simplificationRequestId) {
      simplificationState = message.error ? 'original' : 'simplified';
      const button = readerShadowRoot?.querySelector('.lucid-simplify');
      if (button) { button.disabled = false; button.textContent = 'Simplified'; }
    }
  }
});
