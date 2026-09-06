// Lucid content script
// Extracts article DOM via Readability.js and renders an isolated reader view.

let readerViewActive = false;
let readerShadowRoot = null;
let originalBodyDisplay = null;
let originalDocumentOverflow = null;

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
  utilityBar.append(wordmark, mode, createExitButton());

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
