---
name: search
description: Unified search hub with source-first evidence verification.
license: Apache-2.0
keywords: [search, research, current information, sources, evidence]
triggers: [search the web, look up, verify current, find sources]
---

# Search

This is the Unified search hub. Search is discovery, not evidence: snippets and
model summaries identify candidates, while opened original sources support claims.

## 4-tier escalation

Order is mandatory unless a requested tool or source makes a tier inapplicable.

### Tier 1 — Built-in CLI Web Search

Rewrite the request into 1-3 focused keyword queries. Preserve dates, domains,
source types, and proper nouns. Treat returned links as URL candidates only.
Fetch/open the original page before citing a claim.

### Tier 2 — weasley-podex browser

Read the active `browser` skill from the current Weasley Podex home. For known
URLs, use adaptive fetch first. If the browser is not ready, run `weasley-podex browser start --agent` and retry
status/fetch once. Skip Tier 2 only if browser start, status, or fetch still
fails. Mark an unverified dynamic
candidate `browse-needed`.

For Naver shell/iframe pages, rendered dashboards, tables, attachments, or
login-adjacent shells, run Tier 2 browser verification before relying on secondary sources.
Secondary sources are corroboration, not substitutes.

### Tier 3 — progrok

Use an available Grok research integration for synthesis when primary browsing
did not answer the question. Its output still needs original-source checks.

### Tier 4 — web-ai

Read the active `web-ai` skill from the current Weasley Podex home and use a
supported headed session for difficult synthesis. Never treat the model response
as proof of a changing external fact.

## Optional query planner

`agbrowse research plan --query "<request>" --json` is an optional planning helper.
Use `plan.atomicQueries` as rewrite candidates.
Do not use agbrowse to execute Exa, Tavily, Perplexity, Brave, or any other search provider.

## `/search` command

`/search <query>` is a routing command, not a provider implementation. It must
inherit this skill's routing/evidence invariants, discover candidate URLs, and
open the sources needed for verification. Slash-specific report fields may add
route and uncertainty notes without redefining the evidence policy.

## Public-source reader routing map

Route known source classes toward `browser fetch` / adaptive-fetch:

- Package registries: use official metadata endpoints, then package provenance.
- Academic/library records: open DOI, publisher, or institutional records.
- Korean portals, Naver pages: resolve canonical content before rendering.
- Media pages: prefer the publisher page and publication timestamp.
- Archive-needed or removed pages: use a lawful archive only as attributed history.

This known-source lane is not permission to bypass a page that requires login, payment, private membership, CAPTCHA solving.

## Model-gated parallel research

Use single-agent search by default. For genuinely separable evidence classes,
cap it at 2-4 lanes such as official, community, realtime, and fetch verification.
Merge lane outputs into one evidence matrix. Parallel snippets still do not
count as sufficient evidence.

## Evidence status:

- `sufficient`: at least one original/primary URL was opened or fetched and directly supports the material claim.
- `partial`: candidate evidence exists, but one or more material claims remain unverified.
- `browse-needed`: a candidate primary URL exists, but rendering or interaction is still required.
- `insufficient`: no credible candidate evidence was obtained.

## Standalone owner

This skill is the Standalone owner of external/current evidence policy; other skills may point here for external/current evidence
but should not copy this tier policy. Update this skill first when the shared evidence contract changes.
