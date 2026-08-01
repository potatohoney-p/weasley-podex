---
name: dev-pabcd
description: PABCD gates for planning, audit, build, check, and delivery.
license: Apache-2.0
keywords: [pabcd, plan, audit, build, check, deliver]
triggers: [orchestrate change, plan implementation, audit plan]
---

# PABCD

PABCD is a gated engineering loop:

1. **P — Plan:** define scope, constraints, acceptance evidence, and rollback.
2. **A — Audit:** challenge dependencies, interfaces, safety, and missing cases.
3. **B — Build:** implement only the audited plan and preserve unrelated work.
4. **C — Check:** run focused tests, integration checks, builds, and packaging.
5. **D — Deliver:** summarize evidence, remaining risk, and the exact artifact.

Never advance merely because work was attempted. A transition requires evidence
from the phase being left. If new evidence invalidates the plan, return to P.

## Catalog discovery

When a product request lacks a known option space, load
`references/catalog-discovery.yaml`. Present design and user-experience choices
before derived domain or backend questions, and record explicit decisions.

## Devlog naming

Use decade ranges for lexicographic order: `00` through `09` Research/Plan,
`10` through `19` Audit, `20` through `29` Build, and later decades for Check
and Delivery. Prefer `00_plan.md` over a bare `PLAN.md` when the repository uses
numbered phase files.
