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
├── offscreen.js           # AI session adapter and download monitoring
├── content-script.js      # DOM extraction + reader view renderer
├── lib/
│   ├── readability.js     # Generated Mozilla Readability.js bundle
│   ├── entity-preservation.js # Shared model-output guardrail
│   └── mermaid.min.js     # Mermaid.js placeholder (replace before Phase 4)
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
│   │   ├── test_entity_preservation.js
│   │   └── test_background_orchestration.js
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
The validation branch established Readability behavior across 13 synthetic fixtures. Live AI measurements remain Chrome/device-specific:
- Which built-in AI APIs (`Summarizer`, `Rewriter`, `LanguageModel`) are usable from an extension context in current Chrome stable
- Whether origin trial tokens are required
- Real per-paragraph latency of `Rewriter`/`LanguageModel` on CPU-only hardware
- Readability.js confidence/length signals across 10+ varied real pages

**Deliverable**: `PHASE-0-FINDINGS.md` exists on the `phase-0-validation` branch.

### Phase 1 — Structure-Only Reader View (MVP)
- [x] Content script + Readability.js extraction
- [x] Gate rendering on confidence/length (article must exist + length > 200 chars)
- [x] Shadow-DOM-scoped reader view
- [x] "Not simplifiable" state for non-article pages
- [x] Exit button, Escape-key handling, and popup state synchronization
- [x] Responsive styling, dark-mode support, and reduced-motion support
- [x] DOM-level integration coverage for render, exit, and extraction gate
- [ ] Manual validation on 30+ diverse real-world pages

### Phase 2 — On-Device Content Simplification
- [x] AI availability check flow (unavailable/downloadable/available)
- [x] Model download UI gated on user gesture, with download progress
- [x] Chunk paragraphs and stream simplified paragraphs into reader view
- [x] Storage cache (chrome.storage.local, keyed by URL + content hash, LRU eviction)
- [x] Entity preservation check on all simplified output, with visible warnings
- [x] On-device session adapter for the `ai.languageModel` and `LanguageModel` surfaces
- [x] Sliding two-paragraph context window and cancellation on reader exit/navigation
- [ ] Live Chrome validation across supported and unsupported Gemini Nano devices

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

## Open Questions / Follow-up

1. Confirm the exact Chrome channel and origin-trial requirements for the installed device. The Prompt API is the preferred path; Rewriter availability varies by Chrome rollout.
2. Record real per-paragraph latency and model download duration on representative hardware.
3. Confirm that session creation from the offscreen document preserves the required user-activation behavior.
4. Decide whether to add token-level streaming after paragraph streaming is stable.

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

## End-of-day status — 2026-09-06

Phase 1–3 implementation work is complete on the active development branch. The local suite passes, including the reader, entity, extraction, background orchestration, cache, context-window, cancellation, reading-level, and cloud-domain policy paths. Chrome manual testing reached the Gemini Nano model download step; it still needs a completed post-download rewrite and a BYOK smoke test using a non-sensitive allowlisted domain. Phase 4 (diagrams) is the next planned implementation phase.

---

*This handoff document should be updated at the start of each phase with any learnings from the previous phase.*
