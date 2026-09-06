// Reader-view integration tests using the real content script in jsdom.

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { webcrypto } = require('crypto');
const { TextEncoder } = require('util');
const { JSDOM } = require('jsdom');
const ReadabilityModule = require('../../lib/readability');
const Readability = ReadabilityModule.Readability || ReadabilityModule;

const paragraphOne = 'On January 15, 2024, Dr. Smith reported 2,847 cases in 12 countries.';
const paragraphTwo = 'Harvard University published the complete report for readers who need more detail.';
const articleHtml = `<!doctype html><html><head><title>Source page</title></head><body style="display:block"><article><h1>Source page</h1><p>${paragraphOne}</p><p>${paragraphTwo}</p><p>${'Additional article context keeps this fixture above the extraction threshold. '.repeat(4)}</p></article></body></html>`;
const shortHtml = '<!doctype html><html><head><title>Search</title></head><body><form><input name="q"></form><p>Search results.</p></body></html>';

function loadContentScript(sourceHtml) {
  const dom = new JSDOM(sourceHtml, { url: 'https://example.com/article', runScripts: 'outside-only' });
  const { window } = dom;
  const shadowRoots = [];
  const listeners = [];
  const outbound = [];

  Object.defineProperty(window, 'crypto', { value: webcrypto });
  window.TextEncoder = TextEncoder;
  window.Readability = Readability;
  window.chrome = {
    runtime: {
      getURL: file => `chrome-extension://test/${file}`,
      sendMessage: async message => {
        outbound.push(message);
        if (message.type === 'CHECK_AI_AVAILABILITY') {
          return { availability: { languageModelState: 'available', rewriterState: 'unavailable' } };
        }
        if (message.type === 'GET_PROCESSING_CONFIG') return { mode: 'local', cacheScope: 'local' };
        if (message.type === 'SIMPLIFY_ARTICLE') return { success: true };
        if (message.type === 'CANCEL_SIMPLIFICATION') return { success: true };
        return {};
      },
      onMessage: { addListener: callback => listeners.push(callback) },
    },
  };

  const originalAttachShadow = window.Element.prototype.attachShadow;
  window.Element.prototype.attachShadow = function attachShadow(options) {
    const root = originalAttachShadow.call(this, { ...options, mode: 'open' });
    shadowRoots.push(root);
    return root;
  };

  vm.runInContext(fs.readFileSync('lib/entity-preservation.js', 'utf8'), dom.getInternalVMContext());
  vm.runInContext(fs.readFileSync('content-script.js', 'utf8'), dom.getInternalVMContext());

  function dispatch(message) {
    let response;
    listeners.forEach(listener => listener(message, {}, value => { response = value; }));
    return response;
  }

  return {
    dom,
    shadowRoots,
    outbound,
    send: async message => dispatch(message),
    dispatch,
  };
}

async function testReaderViewRenders() {
  const { dom, shadowRoots, send } = loadContentScript(articleHtml);
  const response = await send({ type: 'TOGGLE_READER_VIEW' });
  assert.strictEqual(response.active, true);
  assert.strictEqual(shadowRoots.length, 1);
  assert.strictEqual(shadowRoots[0].querySelector('.lucid-title').textContent, 'Source page');
  assert.ok(shadowRoots[0].querySelector('.lucid-exit'));
  assert.strictEqual(shadowRoots[0].querySelector('.lucid-reading-level').value, 'original');
  assert.match(shadowRoots[0].querySelector('.lucid-processing-indicator').textContent, /On-device/);
  assert.strictEqual(dom.window.document.body.style.display, 'none');

  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.strictEqual(dom.window.document.querySelector('#lucid-reader-host'), null);
  assert.strictEqual(dom.window.document.body.style.display, 'block');
}

async function testReadingLevelRestoresOriginal() {
  const { shadowRoots, outbound, dispatch } = loadContentScript(articleHtml);
  dispatch({ type: 'TOGGLE_READER_VIEW' });
  await new Promise(resolve => setTimeout(resolve, 25));
  const root = shadowRoots[0];
  const level = root.querySelector('.lucid-reading-level');
  level.value = 'simpler';
  level.dispatchEvent(new root.ownerDocument.defaultView.Event('change'));
  await new Promise(resolve => setTimeout(resolve, 25));
  const request = outbound.find(message => message.type === 'SIMPLIFY_ARTICLE');
  assert.strictEqual(request.readingLevel, 'simpler');
  const chunk = request.chunks[0];
  dispatch({ type: 'SIMPLIFICATION_PROGRESS', requestId: request.requestId, index: chunk.index, result: 'A rewritten paragraph.' });
  const paragraph = root.querySelector(`.lucid-content p[data-lucid-index="${chunk.index}"]`);
  assert.strictEqual(paragraph.textContent, 'A rewritten paragraph.');
  dispatch({ type: 'SIMPLIFICATION_PROGRESS', requestId: request.requestId, done: true });
  level.value = 'original';
  level.dispatchEvent(new root.ownerDocument.defaultView.Event('change'));
  assert.strictEqual(paragraph.textContent, chunk.text);
}

async function testSimplificationProgressAndCancellation() {
  const { shadowRoots, outbound, dispatch } = loadContentScript(articleHtml);
  dispatch({ type: 'TOGGLE_READER_VIEW' });
  await new Promise(resolve => setTimeout(resolve, 25));

  const root = shadowRoots[0];
  const simplifyButton = root.querySelector('.lucid-simplify');
  simplifyButton.click();
  await new Promise(resolve => setTimeout(resolve, 25));

  const request = outbound.find(message => message.type === 'SIMPLIFY_ARTICLE');
  assert.ok(request, 'clicking Simplify should start a background job');
  assert.ok(request.chunks.length >= 1);
  const firstChunk = request.chunks[0];

  dispatch({
    type: 'SIMPLIFICATION_PROGRESS',
    requestId: request.requestId,
    index: firstChunk.index,
    result: firstChunk.text,
  });
  const firstParagraph = root.querySelector(`.lucid-content p[data-lucid-index="${firstChunk.index}"]`);
  assert.ok(firstParagraph.classList.contains('lucid-simplified'));

  dispatch({ type: 'SIMPLIFICATION_PROGRESS', requestId: request.requestId, phase: 'download', loaded: 0.5 });
  assert.match(root.querySelector('.lucid-status').textContent, /50%/);
  assert.strictEqual(root.querySelector('.lucid-download-progress').value, 0.5);

  root.querySelector('.lucid-exit').click();
  assert.ok(outbound.some(message => message.type === 'CANCEL_SIMPLIFICATION' && message.requestId === request.requestId));
}

async function testNotSimplifiableState() {
  const { dom, shadowRoots, send } = loadContentScript(shortHtml);
  const response = await send({ type: 'TOGGLE_READER_VIEW' });
  assert.strictEqual(response.active, true);
  assert.strictEqual(response.notSimplifiable, true);
  assert.strictEqual(shadowRoots[0].querySelector('.lucid-empty-label').textContent, 'Nothing to simplify');
  shadowRoots[0].querySelector('.lucid-exit').click();
  assert.strictEqual(dom.window.document.querySelector('#lucid-reader-host'), null);
}

if (require.main === module) {
  Promise.resolve()
    .then(testReaderViewRenders)
    .then(() => console.log('PASS: reader view renders and exits with Escape'))
    .then(testSimplificationProgressAndCancellation)
    .then(() => console.log('PASS: simplification progress and cancellation work'))
    .then(testReadingLevelRestoresOriginal)
    .then(() => console.log('PASS: reading level sends the right job and restores originals'))
    .then(testNotSimplifiableState)
    .then(() => console.log('PASS: not-simplifiable state renders and exits'))
    .then(() => console.log('All reader-view integration tests passed'))
    .catch(error => { console.error(error); process.exitCode = 1; });
}

module.exports = { testReaderViewRenders, testSimplificationProgressAndCancellation, testReadingLevelRestoresOriginal, testNotSimplifiableState };
