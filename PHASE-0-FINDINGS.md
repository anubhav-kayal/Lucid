# Phase 0 — Validation Spike Findings

## 1. Readability.js Behavior

**Library tested:** `@mozilla/readability@0.6.0` against 13 synthetic HTML fixtures.

### Extraction Results

| Page Type | Extracted | Text Length | Confidence |
|---|---|---|---|
| Blog article | ✅ | 1,767 chars | High |
| News article | ✅ | 1,298 chars | High |
| Wikipedia entry | ✅ | 1,896 chars | High |
| Technical blog | ✅ | 1,650 chars | High |
| Legal/regulatory | ✅ | 1,755 chars | High |
| Medical abstract | ✅ | 1,805 chars | High |
| Paywalled article | ✅ | 540 chars | High |
| Documentation | ✅ | 1,112 chars | High |
| SPA (social feed) | ✅ | 529 chars | High |
| Search results | ✅ | 897 chars | High |
| Product page | ✅ | 366 chars | High |
| Video page | ✅ | 653 chars | High |
| Dashboard (GitHub) | ✅ | 172 chars | Low |

### Key Findings

1. **Readability.js is aggressive** — it extracts content from almost any HTML page, including SPAs, search results, and product pages. The 200-char gate in `content-script.js` is essential.
2. **Dashboard correctly excluded** — the GitHub dashboard (172 chars) falls below the gate. This is the only fixture that would show "not simplifiable".
3. **Paywalled content** — Readability extracts the visible teaser text correctly (540 chars). Hidden paywalled content (`display:none`) is excluded, so the extraction accurately reflects what the user can see.
4. **SPA detection** — Social feeds with posts do get extracted but lack clear article structure. May need additional heuristics (e.g., checking for `article` tag, byline, or excerpt signals).

### Recommendation
The 200-char gate is necessary but may not be sufficient. Consider adding: (a) check for `<article>` tag or semantic HTML5 elements, (b) check for byline/excerpt signals, (c) length threshold raised to 500+ chars for higher confidence.

---

## 2. AI API Surface

**Status:** Could not be tested in Node.js — requires live Chrome extension context.

### Probe script created
`scripts/phase0-probe.js` contains the probe code to run in the extension console:

```js
self.ai.languageModel  // Gemini Nano Prompt API
self.ai.rewriter      // Rewriter API (simplification)
self.ai.summarizer    // Summarizer API
```

### Manual test steps (when loaded in Chrome)
1. Open `chrome://extensions` → load unpacked `/Users/anubhavkayal/Lucid`
2. Open extension service worker console (inspect background.js)
3. Run the probe code from `scripts/phase0-probe.js`

**Open questions for real Chrome testing:**
- Are origin trial tokens needed for `Rewriter`/`Writer`/`Proofreader` in extension context?
- Is `self.ai.languageModel` available without tokens (stable API)?
- Does `self.ai.rewriter` exist on Chrome 128+ stable?

---

## 3. Offscreen Document Pattern

**Current implementation:** `background.js` uses `chrome.offscreen.createDocument` with `DOM_SCRAPING` reason.

### Dependency update needed
The `offscreen.js` currently calls `self.ai.languageModel.create()` and `aiSession.rewrite()`. The actual API surface needs verification:
- `ai.languageModel.create()` — does this accept `systemPrompt`?
- `aiSession.rewrite()` — does this exist on the session object?
- Alternatively, is `ai.rewriter.create()` the correct approach?

### Docs references
- [Chrome offscreen API docs](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [Built-in AI API explainer](https://developer.chrome.com/docs/extensions/ai)

---

## 4. Next Steps Before Phase 1

- [ ] Load extension in Chrome and run AI API probe
- [ ] Verify origin trial requirements
- [ ] Record real per-paragraph latency (5 text samples × 3 runs each)
- [ ] Verify offscreen document pattern works for long-lived AI sessions
- [ ] Update content-script.js extraction gate with additional heuristics if needed
- [ ] Create a `pageType` test variant for the GitHub dashboard that has more realistic dynamic content
