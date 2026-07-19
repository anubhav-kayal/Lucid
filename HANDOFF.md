# Lucid — Handoff Document

## Project Overview

Lucid is a Chrome extension (Manifest V3) that makes cluttered, text-dense web pages easier to read. It has two independent pipelines:

1. **Structural simplification** — strips layout clutter (ads, nav, sidebars) and reflows into a clean single-column reading view. Pure DOM/CSS, no AI, works offline instantly.
2. **Content simplification** — rewrites dense paragraphs into plainer language via Gemini Nano (on-device, default) or an optional BYOK cloud API (Anthropic/OpenAI/Gemini).

A third optional feature — **diagram generation** — converts process/comparison/timeline content into rendered Mermaid.js diagrams.

## Repository Structure

```
lucid/
├── manifest.json          # Extension manifest (MV3)
├── background.js          # Service worker — message router
├── offscreen.html         # Offscreen document for AI sessions
├── offscreen.js           # AI session management (Gemini Nano)
├── content-script.js      # DOM extraction + reader view renderer
├── lib/
│   ├── readability.js     # Mozilla Readability.js (stub — replace before Phase 1)
│   └── mermaid.min.js     # Mermaid.js (stub — replace before Phase 4)
├── ui/
│   ├── popup.html         # Popup UI
│   ├── popup.js           # Popup logic
│   ├── options.html       # Options page
│   └── options.js         # Options logic
├── styles/
│   └── reader-view.css    # Shadow-DOM-scoped reader view styles
├── tests/
│   ├── extraction/
│   │   ├── test_readability.js
│   │   └── fixtures/      # HTML snapshots for testing
│   ├── simplification/
│   │   └── test_entity_preservation.js
│   └── e2e/
│       └── test_reader_view.js
├── icons/                 # Extension icons (placeholder)
├── HANDOFF.md             # This file
├── ARCHITECTURE.md        # Architecture decisions and rationale
├── README.md              # Project README
└── package.json           # Node deps for test runners
```

## Build Order (Phases)

### Phase 0 — Validation Spike
**Before any product code is written**, empirically confirm:
- Which built-in AI APIs (`Summarizer`, `Rewriter`, `LanguageModel`) are usable from an extension context in current Chrome stable
- Whether origin trial tokens are required
- Real per-paragraph latency of `Rewriter`/`LanguageModel` on CPU-only hardware
- Readability.js confidence/length signals across 10+ varied real pages

**Deliverable**: A short findings document (see `Phase-0-validation` branch).

### Phase 1 — Structure-Only Reader View (MVP)
- Content script + Readability.js extraction
- Gate rendering on confidence/length (article must exist + length > 200 chars)
- Shadow-DOM-scoped reader view (CSS already scaffolded)
- "Not simplifiable" state for non-article pages
- Must work on 30+ diverse real-world pages

### Phase 2 — On-Device Content Simplification
- AI availability check flow (unavailable/downloadable/available)
- Model download UI gated on user gesture
- Chunk paragraphs with sliding context window
- Stream simplified paragraphs into reader view
- Storage cache (chrome.storage.local, keyed by URL + content hash, LRU eviction)
- Entity preservation check on all simplified output

### Phase 3 — Reading-Level Control + BYOK
- Reading level mapped to Rewriter tone/params or Prompt API template
- Options page: per-domain API key entry (chrome.storage.local only)
- Default-off per-domain cloud opt-in
- Privacy indicator when content leaves device
- Built-in exclusion list for sensitive categories (banking, health, mail)

### Phase 4 — Diagrams
- Heuristic detection of diagram-worthy sections (steps, comparisons, chronologies)
- Mermaid syntax generation via model
- Render with bundled mermaid.js; silently omit on error

### Phase 5 — Hardening & Store Submission
- SPA re-render handling (MutationObserver + content diffing)
- Storage quota/eviction policy finalized
- Multilingual scope honestly documented
- Privacy review + Chrome Web Store disclosure
- Accessibility pass

## Key Constraints (DO NOT VIOLATE)

- **No required API keys.** Fully functional with zero credentials.
- **No Ollama / local server / self-hosted model.** Only Chrome's built-in Gemini Nano.
- **API keys are optional, opt-in per-domain, default off.**
- **On-device is the default path**, not a fallback.
- **Never silently trust model output** — entity preservation checks on all simplified content.
- **Gate structural simplification on Readability confidence** — show "not simplifiable" state for non-article pages.
- **Never call a language model from the structural simplification pipeline.**

## Open Questions (to be resolved in Phase 0)

1. Do extensions get stable, token-free access to `Rewriter`/`Writer`/`Proofreader`, or only `Summarizer`/`LanguageModel`?
2. Is an offscreen document still the recommended pattern for hosting long-lived AI sessions from an extension?
3. What is real per-paragraph latency on CPU-only fallback hardware?
4. What fraction of users actually meet Gemini Nano's hardware requirements?

## Git Workflow

- `main` branch is protected — no direct commits
- Feature branches for each phase:
  - `phase-0-validation`
  - `phase-1-reader-view`
  - `phase-2-content-simplification`
  - `phase-3-byok`
  - `phase-4-diagrams`
  - `phase-5-hardening`
- All changes merged via PR to `main`

## Testing Strategy

- **Unit tests**: Entity preservation, Readability extraction signals
- **Snapshot tests**: Extraction against real HTML fixtures
- **E2E tests**: Headless Chrome with extension loaded
- **Manual testing**: 30+ diverse real-world pages per phase

## Running Tests

```bash
npm install
npm test
```

---

*This handoff document should be updated at the start of each phase with any learnings from the previous phase.*
