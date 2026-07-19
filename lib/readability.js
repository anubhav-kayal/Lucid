// Mozilla Readability.js — placeholder
// In production, bundle the full Readability library here.
// See: https://github.com/mozilla/readability
//
// This placeholder implements a minimal stub so the extension scaffold
// can load without errors. Replace with the real library before Phase 1
// testing.

class Readability {
  constructor(doc) {
    this._doc = doc;
  }

  parse() {
    const titleEl = this._doc.querySelector('title');
    const title = titleEl ? titleEl.textContent.trim() : '';
    const body = this._doc.body;

    if (!body) return null;

    const content = body.innerHTML;
    const textLength = body.textContent.replace(/\s+/g, ' ').trim().length;

    return {
      title,
      content: `<div class="lucid-original-content">${content}</div>`,
      length: textLength,
      excerpt: '',
      byline: '',
      dir: 'ltr',
    };
  }
}

if (typeof module !== 'undefined') {
  module.exports = { Readability };
}
