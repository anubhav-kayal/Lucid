// Service-worker orchestration test with an in-memory Chrome API.

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

async function testBackgroundOrchestration() {
  const listeners = [];
  const storage = {};
  const progress = [];
  const offscreenMessages = [];
  const contexts = [];

  const chrome = {
    offscreen: {
      hasDocument: async () => false,
      createDocument: async () => {},
      Reason: { DOM_SCRAPING: 'DOM_SCRAPING' },
    },
    runtime: {
      onMessage: { addListener: listener => listeners.push(listener) },
      onInstalled: { addListener: () => {} },
      sendMessage: async message => {
        offscreenMessages.push(message);
        if (message.type === 'INIT_AI_SESSION') return { success: true };
        if (message.type === 'SIMPLIFY_CHUNK') {
          contexts.push(message.context);
          return { success: true, result: `simple:${message.text}` };
        }
        return { success: true };
      },
    },
    tabs: {
      sendMessage: async (tabId, message) => { progress.push({ tabId, message }); },
    },
    storage: {
      local: {
        get: async key => ({ [key]: storage[key] }),
        set: async value => Object.assign(storage, value),
      },
    },
  };

  const context = vm.createContext({ chrome, console, Map, Object, JSON, Date, Promise, setTimeout });
  vm.runInContext(fs.readFileSync('background.js', 'utf8'), context);

  let response;
  const keepAlive = listeners[0](
    {
      type: 'SIMPLIFY_ARTICLE',
      requestId: 'job-1',
      cacheKey: 'https://example.test|hash',
      chunks: [{ index: 0, text: 'First paragraph.' }, { index: 1, text: 'Second paragraph.' }],
    },
    { tab: { id: 42 } },
    value => { response = value; },
  );

  assert.strictEqual(keepAlive, true);
  assert.strictEqual(response.success, true);
  await new Promise(resolve => setTimeout(resolve, 25));

  assert.strictEqual(JSON.stringify(contexts), JSON.stringify([[], ['simple:First paragraph.']]));
  assert.deepStrictEqual(
    progress.filter(entry => entry.message.result).map(entry => entry.message.index),
    [0, 1],
  );
  assert.ok(progress.some(entry => entry.message.phase === 'ready'));
  assert.ok(progress.some(entry => entry.message.done));
  assert.ok(storage.simplificationCache['https://example.test|hash']);
  assert.ok(offscreenMessages.some(message => message.type === 'DESTROY_AI_SESSION'));
}

if (require.main === module) {
  testBackgroundOrchestration()
    .then(() => console.log('PASS: background streams context-aware chunks and caches results'))
    .catch(error => { console.error(error); process.exitCode = 1; });
}

module.exports = { testBackgroundOrchestration };
