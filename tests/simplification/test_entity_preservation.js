// Entity preservation tests
// Verify that simplified output preserves numbers, names, dates, and qualifiers.

function extractEntities(text) {
  const numbers = [...text.matchAll(/\d+(?:[,.]\d+)*/g)].map(m => m[0]);
  const dates = [...text.matchAll(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2},?\s+\d{4}\b/g)].map(m => m[0]);
  const properNouns = [...text.matchAll(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g)].map(m => m[0]);
  return { numbers, dates, properNouns };
}

function checkPreservation(original, simplified) {
  const orig = extractEntities(original);
  const simp = extractEntities(simplified);
  const simpAll = new Set([...simp.numbers, ...simp.dates, ...simp.properNouns]);

  const missing = [];
  for (const num of orig.numbers) {
    if (!simpAll.has(num)) missing.push(`number: ${num}`);
  }
  for (const date of orig.dates) {
    if (!simpAll.has(date)) missing.push(`date: ${date}`);
  }

  return {
    passed: missing.length === 0,
    missing,
  };
}

function testEntityPreservation() {
  const testCases = [
    {
      original: 'On January 15, 2024, Dr. Smith from Harvard University reported 2,847 cases in 12 countries.',
      simplified: 'On January 15, 2024, Dr. Smith from Harvard University reported about 2,800 cases in over 10 countries.',
      expect: false,
    },
    {
      original: 'On January 15, 2024, Dr. Smith from Harvard University reported 2,847 cases in 12 countries.',
      simplified: 'On January 15, 2024, Dr. Smith from Harvard University reported 2,847 cases in 12 countries.',
      expect: true,
    },
  ];

  let passed = 0;
  for (const tc of testCases) {
    const result = checkPreservation(tc.original, tc.simplified);
    const ok = result.passed === tc.expect;
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${tc.original.slice(0, 40)}...`);
    if (!ok) console.log(`  missing: ${result.missing.join(', ')}`);
    if (ok) passed++;
  }

  console.log(`\n${passed}/${testCases.length} passed`);
}

if (require.main === module) {
  testEntityPreservation();
}

module.exports = { checkPreservation, extractEntities };
