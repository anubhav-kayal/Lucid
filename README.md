# Lucid

A Chrome extension (Manifest V3) that makes cluttered, text-dense web pages easier to read.

## Features

- **Structural simplification** — strips ads, navigation, sidebars, and clutter. Reflows articles into a clean, single-column reading view. Works instantly, offline, with zero AI dependency.
- **Content simplification** — rewrites dense paragraphs into plainer language using Chrome's built-in Gemini Nano (on-device, private, free) or an optional bring-your-own-key cloud API.
- **Diagram generation** (optional) — converts process/comparison/timeline content into rendered Mermaid.js diagrams.

## Architecture

Lucid uses two independent pipelines that merge at render time:

```
DOM → Readability.js → structural simplification → reader view
                     ↘ content simplification ↗
```

Structural simplification is always local and instant. Content simplification defaults to on-device AI (Gemini Nano) with an optional per-domain cloud API key.

## Quick Start

1. Clone this repo
2. Open `chrome://extensions` in Chrome
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `lucid/` directory

## Development

### Prerequisites
- Chrome 128+ (for Gemini Nano built-in AI APIs)
- Node.js 18+ (for tests)

### Install
```bash
npm install
```

### Test
```bash
npm test
```

### Build Phases

| Phase | Description | Branch |
|---|---|---|
| 0 | Validation spike — test AI APIs + Readability empirically | `phase-0-validation` |
| 1 | MVP: structure-only reader view (no AI) | `phase-1-reader-view` |
| 2 | On-device content simplification (Gemini Nano) | `phase-2-content-simplification` |
| 3 | Reading-level control + optional BYOK | `phase-3-byok` |
| 4 | Mermaid diagram generation | `phase-4-diagrams` |
| 5 | Hardening, SPA support, store submission | `phase-5-hardening` |

## Privacy

- **No data leaves your device by default.** All processing is done locally using Chrome's built-in AI.
- Cloud API keys are strictly opt-in, configured per-domain, and default-off.
- A persistent indicator shows when content will be sent off-device.
- Sensitive domains (banking, health, mail) are excluded by default.

## Open Questions

See `HANDOFF.md` for open questions to be resolved during Phase 0 validation.

## License

MIT
