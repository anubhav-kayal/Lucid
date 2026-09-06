# Lucid Architecture

## Purpose

Lucid has two independent processing paths that converge in the reader view:

1. **Structural simplification** extracts the main article locally with Mozilla Readability and presents it in a clean single-column layout.
2. **Content simplification** optionally rewrites eligible paragraphs with Chrome's built-in on-device model or an explicitly configured cloud provider.

The structural path never depends on a language model.

## Runtime flow

```
Active tab
   │
   ▼
content-script.js
   │
   ├─ clone DOM + Readability.parse()
   │       └─ article length > 200 → reader view
   │
   └─ user selects a reading level and Simplify text
           │
           ▼
background.js
   ├─ resolve local/cloud mode from local settings and current hostname
   ├─ block sensitive cloud domains unless separately confirmed
   ├─ read URL/content-hash cache
   ├─ create an offscreen AI session (local) or call the selected provider (cloud)
   ├─ process eligible paragraphs in order
   │    └─ pass the last two simplified paragraphs as context
   ├─ write each result to chrome.storage.local
   └─ send progress/result messages back to the tab
           │
           ▼
offscreen.js
   ├─ LanguageModel / ai.languageModel
   └─ Rewriter / ai.rewriter
```

The offscreen document owns the heavyweight model session because Manifest V3 service workers can be suspended. The service worker owns job state, cache policy, cancellation, and tab routing.

## Reader view

The content script:

- Clones the page before parsing, so the source page is not modified.
- Requires a non-empty article with more than 200 characters.
- Shows a clear non-article state when the gate fails.
- Renders a closed Shadow DOM overlay.
- Uses text nodes for title and byline metadata.
- Keeps extracted article HTML for the content body.
- Provides Exit and Escape controls.
- Restores the original body display and document overflow on exit.
- Cancels active simplification when exiting or receiving `pagehide`.

Short/simple paragraphs are left unchanged and marked verified. Longer, linguistically complex paragraphs are sent to the model.

## AI adapter

`offscreen.js` feature-detects both current and transitional Chrome surfaces:

- `LanguageModel` / `self.ai.languageModel`
- `Rewriter` / `self.ai.rewriter`

It calls `availability()` and exposes `available`, `downloadable`, `downloading`, and `unavailable` states. Session creation passes a download monitor so progress can be routed back to the reader view.

The Prompt API path uses reading-level instructions and a two-paragraph context window. The Rewriter path maps simpler/detailed levels to its available tone controls. Original never calls a model: the reader restores the retained source paragraph.

The current implementation targets English text because the availability request declares English input/output.

## Streaming and cancellation

Simplification is paragraph-granular rather than token-granular:

1. The reader marks eligible paragraphs as loading.
2. The service worker processes one paragraph.
3. It writes the result to cache.
4. It immediately sends that result to the tab.
5. The reader verifies and renders it.
6. The process repeats until complete.

Each job has a cancellation flag. Exiting the reader sends a cancellation message, stops future work, and destroys the offscreen session.

## Entity preservation

Every model result is checked in the content script against its original paragraph.

The guardrail normalizes number formatting and checks:

- Numbers.
- Calendar dates.
- Strong proper-noun signals such as multi-word names, institutions, and honorific names.

Verified results receive a green marker. Mismatches receive an orange warning and remain visible; Lucid never silently treats an unverified rewrite as trustworthy.

## Storage

The background service worker stores:

```
simplificationCache[URL + "|" + SHA-256(text) + "|" + processing mode + "|" + reading level] = {
  chunks: { paragraphIndex: simplifiedText },
  updatedAt: timestamp
}
```

The cache is bounded to 100 entries and approximately 5 MB. Entries are sorted by recency and older/larger entries are dropped when limits are exceeded.

API keys and user settings use `chrome.storage.local`; keys are never returned to the content script or logged.

## Privacy and security

- Structural extraction is local.
- On-device rewriting is local to Chrome's model runtime.
- Cloud calls require all of: cloud mode, a configured key, and an allowlisted hostname.
- The header keeps a visible orange `Cloud · provider` indicator while content can leave the device.
- Hosts containing bank, health, mail, finance, or medical, plus `.gov` and `.mil`, are blocked unless listed in a separately confirmed sensitive-domain override.
- Model output is inserted as text, not executable HTML.
- Extracted article HTML comes from Readability's sanitized output.
- The entity guardrail visibly flags possible information loss.

## Testing boundaries

Automated tests cover the core runtime contracts with mocked Chrome APIs and jsdom. Live Gemini Nano behavior still depends on the installed Chrome version, model rollout, OS, hardware, storage, and user activation. Manual testing in Chrome remains required before treating the feature as production-ready.
