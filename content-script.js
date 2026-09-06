// Lucid content script
// Extracts article DOM via Readability.js, runs structural simplification,
// and renders the reader view.

let readerViewActive = false;
let readerShadowRoot = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'TOGGLE_READER_VIEW':
      toggleReaderView(sendResponse);
      return true;
    case 'EXIT_READER_VIEW':
      exitReaderView(sendResponse);
      return true;
    default:
      break;
  }
});

function extractArticle() {
  const documentClone = document.cloneNode(true);
  const reader = new Readability(documentClone);
  const article = reader.parse();
  return article;
}

function toggleReaderView(sendResponse) {
  if (readerViewActive) {
    exitReaderView();
    sendResponse({ active: false });
    return;
  }

  const article = extractArticle();

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
  document.body.style.display = '';
  if (sendResponse) sendResponse({ active: false });
}

function renderReaderView(article) {
  const host = document.createElement('div');
  host.id = 'lucid-reader-host';
  host.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647;overflow-y:auto;';

  const shadow = host.attachShadow({ mode: 'closed' });
  readerShadowRoot = shadow;

  document.body.style.display = 'none';
  document.documentElement.appendChild(host);

  const styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = chrome.runtime.getURL('styles/reader-view.css');
  shadow.appendChild(styleLink);

  const container = document.createElement('article');
  container.className = 'lucid-reader';
  container.innerHTML = `
    <header class="lucid-header">
      <h1 class="lucid-title">${article.title || ''}</h1>
      ${article.byline ? `<p class="lucid-byline">${article.byline}</p>` : ''}
    </header>
    <div class="lucid-content">${article.content}</div>
  `;

  shadow.appendChild(container);
}

function renderNotSimplifiable() {
  const host = document.createElement('div');
  host.id = 'lucid-reader-host';
  host.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647;overflow-y:auto;';

  const shadow = host.attachShadow({ mode: 'closed' });
  readerShadowRoot = shadow;

  document.body.style.display = 'none';
  document.documentElement.appendChild(host);

  const styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = chrome.runtime.getURL('styles/reader-view.css');
  shadow.appendChild(styleLink);

  const container = document.createElement('div');
  container.className = 'lucid-not-simplifiable';
  container.innerHTML = `
    <div>
      <p>This page cannot be simplified</p>
      <p>Lucid works best on articles and long-form content.</p>
    </div>
  `;

  shadow.appendChild(container);
}
