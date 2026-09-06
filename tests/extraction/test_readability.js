const fs = require('fs');
const path = require('path');
const ReadabilityModule = require('../../lib/readability');
const Readability = ReadabilityModule.Readability || ReadabilityModule;

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

function testExtraction() {
  const results = [];
  const files = fs.readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.html'));

  for (const file of files) {
    const html = fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf-8');
    const doc = new JSDOM(html, { url: 'https://example.com' }).window.document;
    const reader = new Readability(doc);
    const article = reader.parse();

    results.push({
      file,
      extracted: !!article,
      textLength: article?.textContent?.length || 0,
      contentLength: article?.content?.length || 0,
      title: article?.title?.slice(0, 60) || '(none)',
      byline: article?.byline || '',
      excerpt: article?.excerpt?.slice(0, 60) || '',
    });
  }

  console.log('\n=== Readability.js Extraction Results ===\n');
  console.table(results);

  const article = results.find(result => result.file === 'article.html');
  const nonArticle = results.find(result => result.file === 'not-article.html');
  if (!article || !article.extracted || article.length <= 200) {
    throw new Error('Expected article.html to pass the Phase 1 extraction gate');
  }
  if (!nonArticle || nonArticle.length > 200) {
    throw new Error('Expected not-article.html to fail the Phase 1 extraction gate');
  }
}

if (require.main === module) {
  testExtraction();
}

module.exports = { testExtraction };
