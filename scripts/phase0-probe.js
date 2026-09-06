const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');

const FIXTURES_DIR = path.join(__dirname, '..', 'tests', 'extraction', 'fixtures');

function probeReadability() {
  console.log('\n========================================');
  console.log('  Phase 0: Readability.js Validation');
  console.log('========================================\n');

  const files = fs.readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.html'));
  const pageTypes = {
    'blog-article.html': 'Blog article',
    'news-article.html': 'News article',
    'wikipedia.html': 'Wikipedia entry',
    'technical-blog.html': 'Technical blog',
    'legal-text.html': 'Legal/regulatory text',
    'medical-abstract.html': 'Medical abstract',
    'spa-page.html': 'SPA (social feed)',
    'dashboard.html': 'Dashboard (GitHub)',
    'paywalled-article.html': 'Paywalled article',
    'search-results.html': 'Search results',
    'product-page.html': 'Product page',
    'documentation-page.html': 'Documentation page',
    'video-page.html': 'Video page (YouTube)',
  };

  const results = [];

  for (const file of files) {
    const html = fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf-8');
    const doc = new JSDOM(html, { url: 'https://example.com' }).window.document;
    const reader = new Readability(doc);
    const article = reader.parse();
    const pageType = pageTypes[file] || file;

    const textLen = article?.textContent?.replace(/\s+/g, ' ').trim().length || 0;
    const htmlLen = article?.content?.length || 0;
    const confidence = article ? (textLen > 200 ? 'high' : textLen > 0 ? 'low' : 'none') : 'none';
    const isArticle = !!article && textLen > 200;

    results.push({ pageType, extracted: !!article, textLen, htmlLen, confidence, isArticle });
  }

  console.table(results, ['pageType', 'extracted', 'textLen', 'htmlLen', 'confidence', 'isArticle']);

  const articles = results.filter(r => r.isArticle);
  const nonArticles = results.filter(r => !r.isArticle);
  console.log(`\n✅ Detected as article (text > 200): ${articles.length}`);
  console.log(`❌ Not detected as article: ${nonArticles.length}`);
  console.log('\nExpected: blog, news, Wikipedia, tech blog, legal, medical, paywall, docs = 8 articles');
  console.log('Expected: SPA, dashboard, search, product, video = 5 non-articles\n');
  return results;
}

function probeExtensionAPIs() {
  console.log('\n========================================');
  console.log('  Phase 0: AI API Surface Probe');
  console.log('  (Run this inside the extension console)');
  console.log('========================================\n');

  const probeCode = `
(async function probeAIAPIs() {
  const results = {};
  const apis = ['ai.languageModel', 'ai.rewriter', 'ai.summarizer', 'ai.writer', 'ai.proofreader'];
  for (const api of apis) {
    const parts = api.split('.');
    let obj = self;
    for (const part of parts) {
      obj = obj?.[part];
    }
    results[api] = !!obj;
  }
  console.table(results);
  const anyAvailable = Object.values(results).some(v => v);
  console.log('AI available:', anyAvailable);
  return results;
})();
  `.trim();

  console.log('Run this in the extension service worker console:\n');
  console.log(probeCode);
  console.log('\nOr use the CHECK_AI_AVAILABILITY message from any extension page.');
}

function probeOffscreenPattern() {
  console.log('\n========================================');
  console.log('  Phase 0: Offscreen Document Pattern');
  console.log('========================================\n');
  console.log('Current implementation: background.js uses chrome.offscreen.createDocument');
  console.log('with reason DOM_SCRAPING for hosting AI sessions.');
  console.log('Verify: chrome.offscreen.createDocument still works for long-lived sessions.');
  console.log('Check: Does the offscreen session persist across service worker restarts?');
  console.log('Docs: https://developer.chrome.com/docs/extensions/reference/api/offscreen\n');
}

function probeLatency() {
  console.log('\n========================================');
  console.log('  Phase 0: Latency Test Plan');
  console.log('========================================\n');
  console.log('Test paragraphs from fixtures:');
  console.log('------------------------------');
  const files = fs.readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.html'));
  for (const file of files) {
    const html = fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf-8');
    const doc = new JSDOM(html, { url: 'https://example.com' }).window.document;
    const firstP = doc.querySelector('p');
    if (firstP) {
      const text = firstP.textContent.trim();
      console.log(`  ${file}: "${text.slice(0, 80)}..."`);
    }
  }
  console.log('\nTo test latency:');
  console.log('1. Load the extension in Chrome');
  console.log('2. Use offscreen.js SIMPLIFY_CHUNK to rewrite each paragraph');
  console.log('3. Record time-to-first-token and total time per 100-word chunk');
  console.log('4. Check entity preservation on output\n');
}

probeReadability();
probeExtensionAPIs();
probeOffscreenPattern();
probeLatency();
