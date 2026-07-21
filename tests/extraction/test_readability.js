const fs = require('fs');
const path = require('path');
const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');

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

  const extracted = results.filter(r => r.extracted && r.textLength > 200);
  const borderline = results.filter(r => r.extracted && r.textLength > 0 && r.textLength <= 200);
  const failed = results.filter(r => !r.extracted);
  console.log(`\nSummary: ${extracted.length} extracted (>200 chars), ${borderline.length} borderline (<=200), ${failed.length} not extracted`);
  return results;
}

if (require.main === module) {
  testExtraction();
}

module.exports = { testExtraction };
