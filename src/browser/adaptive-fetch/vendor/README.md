# Vendored third-party bundles

## defuddle.iife.min.js

- Source: [kepano/defuddle](https://github.com/kepano/defuddle) v0.18.1 — MIT License (c) kepano
- Purpose: in-page main-content → Markdown extraction for the browser-escalation
  reader candidate (`browser-defuddle`). Injected into the rendered page; never
  imported by Node code as a module.
- Not an npm dependency by decision (2026-06-10): the prebuilt single-file IIFE
  is committed so `package.json` stays minimal and the bundle ships via the
  podex dist build (atomic-build.sh copies `vendor/`).

### Rebuild (version upgrade)

```bash
npm pack defuddle@<version> && tar xzf defuddle-<version>.tgz
cd package
npx esbuild dist/index.full.js --bundle --format=iife --global-name=Defuddle \
  --minify --outfile=<repo>/src/browser/adaptive-fetch/vendor/defuddle.iife.min.js
```

Uses the **full** entry (`dist/index.full.js`, ~700KB minified): the
markdown serializer lives only in the full build — the lite `dist/index.js`
silently ignores `markdown: true` and returns cleaned HTML (verified
2026-06-10 against v0.18.1). After rebuilding, update the version in this
file and rerun `npm run test:unit`.

