// Lucid diagram heuristics. Kept dependency-free so detection never sends
// article text off-device and can run before an optional AI request.
(function exposeDiagramTools(root) {
  const STEP_WORDS = /\b(first|second|third|next|then|finally|step\s+\d+)\b/i;
  const COMPARE_WORDS = /\b(unlike|whereas|in contrast|both|compared with|on the other hand)\b/i;
  const TIME_WORDS = /\b(in \d{4}|by \d{4}|after|before|later|eventually|then)\b/i;

  function normalize(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function typeFor(text) {
    const value = normalize(text);
    if (COMPARE_WORDS.test(value)) return 'comparison';
    if (TIME_WORDS.test(value) && /\d{4}/.test(value)) return 'timeline';
    if (STEP_WORDS.test(value) || /\b\d+[.)]\s/.test(value)) return 'flowchart';
    return null;
  }

  function parts(text) {
    return normalize(text)
      .split(/(?:\.|;|\?|!|\d+[.)])\s+/)
      .map(normalize)
      .filter(part => part.length >= 12)
      .slice(0, 15);
  }

  function timelineEvents(text) {
    const events = normalize(text)
      .split(/(?<=[.!?])\s+/)
      .map(sentence => {
        const year = sentence.match(/\b(?:1[0-9]{3}|20[0-9]{2})\b/)?.[0];
        if (!year) return null;
        return { year, text: label(sentence.replace(year, '').replace(/^\W+/, '')) };
      })
      .filter(Boolean);
    const unique = [];
    const seen = new Set();
    for (const event of events) {
      if (seen.has(event.year)) continue;
      seen.add(event.year);
      unique.push(event);
    }
    return unique.slice(0, 8);
  }

  function label(text) {
    return normalize(text).replace(/["`{}\[\]<>]/g, '').slice(0, 100) || 'Step';
  }

  function generate(text) {
    const type = typeFor(text);
    const items = parts(text);
    if (!type || items.length < 3) return null;
    if (type === 'comparison') {
      const midpoint = Math.ceil(items.length / 2);
      return `flowchart LR\n  A[${label(items[0])}] --> B[${label(items[midpoint] || items[1])}]\n  A --> C[${label(items[items.length - 1])}]`;
    }
    if (type === 'timeline') {
      const events = timelineEvents(text);
      if (events.length < 3) return null;
      return `timeline\n  title Article timeline\n${events.map(event => `    ${event.year} : ${event.text}`).join('\n')}`;
    }
    return `flowchart TD\n${items.map((item, index) => `  N${index}[${label(item)}]${index ? ` --> N${index + 1}` : ''}`).join('\n')}`;
  }

  function valid(source) {
    return /^(flowchart|graph|sequenceDiagram|timeline|gantt)\b/.test(normalize(source));
  }

  root.LucidDiagram = { typeFor, generate, valid, parts, timelineEvents };
  if (typeof module === 'object') module.exports = root.LucidDiagram;
})(typeof self !== 'undefined' ? self : globalThis);
