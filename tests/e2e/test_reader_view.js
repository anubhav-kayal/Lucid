// Reader-view integration tests using the real content script in jsdom.

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { JSDOM } = require('jsdom');
const ReadabilityModule = require('../../lib/readability');
const Readability = ReadabilityModule.Readability || ReadabilityModule;

const articleText = 'A calm reading view should preserve the meaning of an article while removing distractions. '.repeat(5);
const articleHtml = `<!doctype html><html><head><title>Source page</title></head><body style="display:block"><div id="page">${articleText}</div></body></html>`;
const shortHtml = '<!doctype html><html><head><title>Search</title></head><body><form><input name="q"></form><p>Search results.</p></body></html>';

function loadContentScript(sourceHtml) {
  const dom = new JSDOM(sourceHtml, { url: 'https://example.com/article', runScripts: 'outside-only' });
  const { window } = dom;
  const shadowRoots = [];
  let listener;

  window.Readability = Readability;
  window.chrome = {
    runtime: {
      getURL: file => `chrome-extension://test/${file}`,
      onMessage: { addListener: callback => { listener = callback; } },
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
  return { dom, shadowRoots, send: message => new Promise(resolve => listener(message, {}, resolve)) };
}

async function testReaderViewRenders() {
  const { dom, shadowRoots, send } = loadContentScript(articleHtml);
  const response = await send({ type: 'TOGGLE_READER_VIEW' });
  assert.strictEqual(response.active, true);
  assert.strictEqual(shadowRoots.length, 1);
  assert.strictEqual(shadowRoots[0].querySelector('.lucid-title').textContent, 'Source page');
  assert.ok(shadowRoots[0].querySelector('.lucid-exit'));
  assert.strictEqual(dom.window.document.body.style.display, 'none');

  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.strictEqual(dom.window.document.querySelector('#lucid-reader-host'), null);
  assert.strictEqual(dom.window.document.body.style.display, 'block');
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
    .then(testNotSimplifiableState)
    .then(() => console.log('PASS: not-simplifiable state renders and exits'))
    .then(() => console.log('All reader-view integration tests passed'))
    .catch(error => { console.error(error); process.exitCode = 1; });
}

module.exports = { testReaderViewRenders, testNotSimplifiableState };
