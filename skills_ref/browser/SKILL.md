---
name: browser
description: Operate and verify browser sessions through Weasley Podex.
license: Apache-2.0
keywords: [browser, cdp, web automation, screenshot, adaptive fetch]
triggers: [open a page, automate browser, inspect webpage, click website]
---

# Browser

Use browser automation for rendered pages, interaction, or source verification.
Use `browser start --agent` for an automation-owned headless session. Live web-AI
verification is a separate headed-session policy described by the `web-ai` skill.

For ChatGPT web-ai workflows, use the `web-ai` skill.

## Current Commands

Representative current commands:

```text
weasley-podex browser status
weasley-podex browser start --agent
weasley-podex browser tabs
weasley-podex browser snapshot --interactive --max-nodes 30
weasley-podex browser screenshot --clip 0 0 320 180 --json
weasley-podex browser fetch <url>
weasley-podex browser stop
```

Follow `active-tab -> snapshot -> act -> snapshot -> verify`. Refs are
latest-snapshot scoped: Ref IDs are short-lived and must not be reused after
navigation or a fresh snapshot. Use vision-click only as a fallback when the
target cannot be identified from the current DOM snapshot.

## Planned Runtime Delta

Commands such as `wait-for-selector` and richer scripted sequences are planned
runtime delta, not current commands. Do not invent them in an execution plan.

## Korean Search Result Verification

Treat search snippets as URL candidates. Try `weasley-podex browser fetch` on the
original URL, then render only when adaptive fetch reports incomplete content.
Naver-cafe/blog/search shell content needs canonical-source resolution. Escalate
PDF, attachment, table, list, ranking, pagination, or live-state pages when text
fetch cannot preserve structure; mark the result `browse-needed` until verified.

`agbrowse research plan` may help rewrite queries but does not replace native
Weasley Podex search/browser verification.

## Known URL Reader / Adaptive Fetch

The known-URL reader lane is not generic search. Apply this order:

1. Public endpoint resolver
2. Direct fetch
3. Jina Reader when allowed and useful
4. Browser render
5. DOM/table extraction
6. Network/metadata inspection

Stop and ask for authority when access requires login, payment, private
membership, or a CAPTCHA. Do not bypass access controls.
