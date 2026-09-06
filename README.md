# Lucid

Lucid is a Chrome Manifest V3 extension that turns cluttered, text-heavy pages into a focused reading view and can rewrite dense paragraphs in plain language.

## Current status

Phases 1–3 are implemented on the active development branch.

- Readability-based article extraction with a 200-character gate.
- Isolated reader view in a closed Shadow DOM.
- Explicit Exit control and Escape-key support.
- Responsive and dark-mode reader styling.
- On-device paragraph simplification through Chrome's built-in AI APIs.
- Visible model availability/download states.
- Paragraph-by-paragraph progress updates.
- Two-paragraph context window for consistent terminology.
- Entity-preservation checks for numbers, dates, names, and institutions.
- Local URL/content-hash cache with bounded LRU-style eviction.
- Cancellation when the reader closes or the page navigates.
- Automated extraction, orchestration, entity, and reader integration tests.
- Reader-level selection: **Simpler**, **Original**, and **More detailed**.
- Optional BYOK cloud processing for Anthropic, OpenAI, or Google Gemini.
- Per-domain cloud allowlist, a persistent cloud indicator, and sensitive-domain blocking until explicitly confirmed.

The extension has not yet been validated across the full 30-page manual test set or every supported Chrome AI configuration.

## How it works

```
Web page
  └─ content script
       ├─ Readability extraction → structural reader view
       └─ paragraph chunks → background service worker
                              └─ offscreen AI session → streamed results
```

Structural rendering is local and does not require AI. Content rewriting is opt-in from the reader view and uses Chrome's on-device model by default. Cloud processing is only used when you select cloud mode, enter a key, and allow the current domain. A failed or unavailable model leaves the original readable content intact.

## Quick start

Install dependencies and build the Readability bundle:

```bash
npm install
npm run build
```

Load the unpacked extension:

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select `/Users/anubhavkayal/Lucid`.
5. Reload the extension after source changes. Refresh an already-open page if needed.

## Testing

Run the complete local suite:

```bash
npm test
```

The suite covers:

- Entity-preservation behavior.
- Background streaming, context propagation, cache writes, and session cleanup.
- Readability extraction and the article gate.
- Reader rendering, Escape/Exit behavior, cancellation, and model download progress UI.

For manual Chrome testing, open a long article, select **Open Reader View**, choose a reading level, then choose **Simplify text** or **Download & simplify**. The first on-device run may download Gemini Nano. To test BYOK, open Lucid Options, choose Cloud mode, add a provider key and the article's domain, then reopen the reader view and confirm its orange **Cloud · provider** indicator. Chrome's model availability depends on the browser channel, operating system, hardware, storage, and rollout state.

## Repository map

- `manifest.json` — MV3 permissions, scripts, and extension entry points.
- `content-script.js` — extraction, reader UI, simplification request, streaming updates, and cancellation.
- `background.js` — offscreen-document lifecycle, job orchestration, progress routing, and cache.
- `offscreen.js` — compatibility adapter for Chrome's `LanguageModel` and `Rewriter` APIs.
- `lib/entity-preservation.js` — shared model-output guardrail.
- `lib/readability.js` — generated Mozilla Readability bundle.
- `ui/` — popup and options pages.
- `tests/` — unit, orchestration, extraction, and reader integration coverage.
- `HANDOFF.md` — detailed project state and next steps.
- `ARCHITECTURE.md` — system design and decisions.
- `.plan.md` — local-only working plan.

## Roadmap

| Phase | Status | Scope |
|---|---|---|
| 0 — Validation | Partial | Readability fixtures/findings exist on the validation branch; live Chrome API measurements remain environment-specific. |
| 1 — Reader view | Implemented | Extraction gate, isolated reader UI, controls, styling, and integration tests. |
| 2 — On-device simplification | Implemented | Availability states, download progress, streaming paragraphs, context, verification, cache, and cancellation. |
| 3 — Reading level and BYOK | Implemented | Reading-level controls, optional cloud providers, privacy indicators, and sensitive-domain protections. |
| 4 — Diagrams | Planned | Mermaid bundling, detection, generation, validation, and rendering. |
| 5 — Hardening | Planned | SPA support, accessibility, storage finalization, privacy review, and store submission. |

## Privacy

Lucid's default processing path is local. No page content leaves the device for structural simplification or on-device rewriting. Cloud processing is optional, uses a key stored only in `chrome.storage.local`, and runs only for domains you explicitly allow. The reader header visibly identifies cloud processing. Banking, health, mail, finance, medical, `.gov`, and `.mil` domains require a separate confirmation before Lucid will send text to a provider.

## License

MIT
