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
        get: async keys => {
          if (!Array.isArray(keys)) return { [keys]: storage[keys] };
          return Object.fromEntries(keys.map(key => [key, storage[key]]));
        },
        set: async value => Object.assign(storage, value),
      },
    },
  };

  const context = vm.createContext({ chrome, console, Map, Object, JSON, Date, Promise, setTimeout, URL });
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

  Object.assign(storage, {
    aiMode: 'cloud',
    apiProvider: 'openai',
    apiKey: 'test-key-not-logged',
    domainAllowlist: ['*.example.com'],
    sensitiveDomainOverrides: [],
  });
  let cloudConfig;
  listeners[0](
    { type: 'GET_PROCESSING_CONFIG' },
    { tab: { id: 42, url: 'https://blog.example.com/article' } },
    value => { cloudConfig = value; },
  );
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepStrictEqual(
    { mode: cloudConfig.mode, provider: cloudConfig.provider, hostname: cloudConfig.hostname },
    { mode: 'cloud', provider: 'openai', hostname: 'blog.example.com' },
  );
  assert.strictEqual('apiKey' in cloudConfig, false);

  storage.domainAllowlist = ['health.example.com'];
  let blockedConfig;
  listeners[0](
    { type: 'GET_PROCESSING_CONFIG' },
    { tab: { id: 42, url: 'https://health.example.com/article' } },
    value => { blockedConfig = value; },
  );
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.strictEqual(blockedConfig.mode, 'blocked');
  assert.match(blockedConfig.reason, /explicitly confirm/i);
}

if (require.main === module) {
  testBackgroundOrchestration()
    .then(() => console.log('PASS: background streams chunks, caches results, and enforces cloud-domain policy'))
    .catch(error => { console.error(error); process.exitCode = 1; });
}

module.exports = { testBackgroundOrchestration };
