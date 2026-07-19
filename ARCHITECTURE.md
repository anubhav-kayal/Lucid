# Lucid Architecture

## Overview

Lucid uses two independent pipelines — structural and content simplification — that operate on the same extracted article and merge at render time.

```
Active browser tab
        │
        ▼
Content script — extracts DOM, parses with Readability.js
        │
        ├─────────────────────────────┐
        ▼                             ▼
Structure simplifier             Content simplifier
(local DOM/CSS rebuild,          (Gemini Nano first,
 no AI, no network call)          optional per-domain API key)
        │                             │
        └──────────────┬──────────────┘
                        ▼
                  Reader view
        (simplified structure + text,
           optional Mermaid diagrams)
```

## Key Decisions

### Two-Pipeline Architecture
Structural and content simplification are architecturally independent. This ensures:
- Structural mode works instantly offline with zero AI dependency
- Content mode can be upgraded to cloud APIs without touching the structural path
- Each pipeline can be tested and validated independently

### On-Device First
Chrome's built-in Gemini Nano (accessed via `LanguageModel`, `Rewriter`, or `Summarizer` APIs) is the default content simplification path. Cloud APIs are strictly opt-in, per-domain, default-off.

### Offscreen Document for AI Sessions
AI sessions are heavyweight objects. In Manifest V3, service workers are killed on idle. Hosting sessions in an offscreen document keeps them alive. The background service worker routes messages between the content script, offscreen document, and popup/options.

```
content-script ←→ background SW ←→ offscreen document (AI)
                      ↕
                 popup / options
```

### Shadow DOM Isolation
The reader view is rendered in a closed Shadow DOM to prevent style leakage from/to the host page.

### Readability.js Gate
Structural simplification only activates when Readability.js returns a confident parse (article content exists with length > 200 chars). Non-article pages (dashboards, SPAs, search results) show a clean "not simplifiable" state.

### Entity Preservation Check
Every content-simplification output passes through a lightweight checker that verifies the output contains a superset of the input's numbers, dates, and proper nouns. Mismatches are flagged with a visible warning, never silently trusted.

## Storage

- `chrome.storage.local` for:
  - Simplified text cache (by URL + content hash, LRU eviction, size-capped)
  - API keys (per-domain, never synced)
  - User preferences

## Security & Privacy

- No data ever leaves the device unless the user explicitly:
  1. Enables cloud mode for a specific domain
  2. Provides their own API key
- A persistent visual indicator shows when content will be sent off-device
- Built-in exclusion list (banking, health, mail) requires explicit override
- API keys stored only in `chrome.storage.local` — never logged, never synced
