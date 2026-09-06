// Lightweight guardrail for model output.
// Exposes the same helper in the content-script and Node test contexts.

(function exposeEntityPreservation(root) {
  function extractEntities(text) {
    const source = String(text || '');
    const numbers = [...source.matchAll(/\b\d+(?:[,.]\d+)*\b/g)]
      .map(match => match[0].replace(/,/g, ''));
    const dates = [...source.matchAll(
      /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2},?\s+\d{4}\b/gi,
    )].map(match => match[0].replace(/\s+/g, ' ').toLowerCase());
    const properNouns = [...source.matchAll(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g)]
      .map(match => match[0].toLowerCase())
      .filter(name => !['The', 'This', 'These', 'That', 'On', 'In', 'A'].includes(name[0].toUpperCase() + name.slice(1)));
    return { numbers, dates, properNouns };
  }

  function checkPreservation(original, simplified) {
    const expected = extractEntities(original);
    const actual = extractEntities(simplified);
    const actualNumbers = new Set(actual.numbers);
    const actualDates = new Set(actual.dates);
    const actualNames = new Set(actual.properNouns);
    const missing = [];

    expected.numbers.forEach(number => {
      if (!actualNumbers.has(number)) missing.push(`number: ${number}`);
    });
    expected.dates.forEach(date => {
      if (!actualDates.has(date)) missing.push(`date: ${date}`);
    });
    expected.properNouns.forEach(name => {
      if (!actualNames.has(name)) missing.push(`name: ${name}`);
    });

    return { passed: missing.length === 0, missing };
  }

  root.extractEntities = extractEntities;
  root.checkPreservation = checkPreservation;
  if (typeof module === 'object') module.exports = { extractEntities, checkPreservation };
})(typeof self !== 'undefined' ? self : globalThis);
