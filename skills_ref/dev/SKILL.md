---
name: dev
description: Shared engineering workflow for safe, tested repository changes.
license: Apache-2.0
keywords: [development, implementation, debugging, review, testing]
triggers: [change code, fix bug, build feature, review repository]
---

# Development

Use this skill for repository changes that must remain understandable, reversible, and tested.

## Workflow

1. Read repository instructions and inspect the existing behavior before editing.
2. State the smallest testable outcome and identify affected interfaces.
3. Preserve unrelated work and avoid destructive source-control commands.
4. Make a focused change, then run the narrowest meaningful test first.
5. Run type, build, and package checks in proportion to the change.
6. Report the result, evidence, and any unresolved risk.

## External/current evidence

For current versions, release notes, CVEs, package/source checks, or provider
behavior, read the active `search` skill and follow its query-rewrite, source-fetch, and
evidence-status rules. Repository grep is not evidence about
a changing external system.

## Devlog names

When the repository uses a devlog, use decade-range numeric prefixes so files
sort in workflow order: `00-09` research and planning, `10-19` audit, `20-29`
build, and later ranges for verification and delivery. Prefer a concrete name
such as `00_plan.md`; do not introduce a bare `PLAN.md` when numbered siblings
already define the local convention.

## Safety gates

- Do not claim success from compilation alone when runtime behavior changed.
- Do not silently weaken a failing test to accommodate a regression.
- Treat credentials, tokens, private URLs, and user data as secrets.
- Keep public commands, package names, paths, and documentation synchronized.
