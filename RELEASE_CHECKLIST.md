# Lucid release checklist

## Automated gate

- `npm test` passes.
- `npm run build` produces both the Readability and Mermaid bundles.
- `git diff --check` passes for source and documentation files.
- No API key or article content appears in logs or test fixtures.

## Manual Chrome gate

- Load the unpacked extension from the current checkout.
- Test Reader View on at least five article, documentation, news, and non-article pages.
- Test Gemini Nano unavailable, downloadable, downloading, available, and failure states.
- Test Simpler, Original, and More detailed modes.
- Test cloud mode only on a deliberately allowlisted non-sensitive domain.
- Confirm the reader and popup show the Cloud indicator before text leaves the device.
- Confirm `.gov`, `.mil`, banking, health, mail, finance, and medical patterns remain blocked without override.
- Test diagram generation on a process, comparison, timeline, and ordinary paragraph.
- Test Escape, focus order, keyboard-only navigation, reduced motion, dark mode, and screen reader labels.
- Test extension reload, page navigation, SPA updates, cancellation, cache clearing, and re-entry.

## Store submission

- Replace placeholder/icon assets with reviewed 128px icon and store screenshots.
- Review permissions and host permissions against the final network behavior.
- Publish the privacy disclosure: local by default; optional user-keyed provider calls only for explicitly enabled domains.
- Record supported Chrome channel, built-in AI availability, and language limitations.
- Submit only after the manual gate passes on the supported target devices.
