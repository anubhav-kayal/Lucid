// Readability extraction tests
// Run against real HTML snapshots to verify confidence/length signals.

const fs = require('fs');
const path = require('path');
const { Readability } = require('../../lib/readability');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

function testExtraction() {
  const results = [];
  const files = fs.readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.html'));

  for (const file of files) {
    const html = fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf-8');
    const doc = new (require('jsdom').JSDOM)(html).window.document;
    const reader = new Readability(doc);
    const article = reader.parse();

    results.push({
      file,
      extracted: !!article,
      length: article?.length || 0,
      title: article?.title || '',
    });
  }

  console.table(results);
}

if (require.main === module) {
  testExtraction();
}

module.exports = { testExtraction };
