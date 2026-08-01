---
name: web-ai
description: Use supported web AI sessions with bounded context and artifact capture.
license: Apache-2.0
keywords: [web ai, chatgpt, gemini, deep think, code artifact]
triggers: [ask web ai, use chatgpt website, extract code artifact]
---

# Web AI

Use this skill only for supported browser-backed AI sessions. Live verification
requires headed Chrome; headless mode is forbidden because authentication,
consent, and rendered completion state must remain visible.

## Structured question envelope

Build a structured question envelope before sending:

```text
[SYSTEM]
State the role, evidence standard, and output contract.

## Project
Summarize only the project context needed for this question.

## Constraints
List scope, compatibility, safety, and verification requirements.

## Question
Ask one bounded question and name the requested artifact.
```

Use `active-tab -> snapshot -> act -> snapshot -> verify`. Refs are latest-snapshot scoped.
Use vision-click only as a fallback after DOM-based
interaction fails.

The supported first slice covers ChatGPT with an inline prompt and Gemini / Deep Think
with explicit model selection. A `--file` still means live browser upload;
it is a file upload, not a context-bundling shortcut.

## Context packaging

Inspect scope with `context-dry-run`, then create deterministic input with
`context-render`. Use repeatable `--context-from-files` and exclusions to avoid
uploading unrelated files. Never include credentials or private user data.

## ChatGPT Code Artifact Extraction

For repository work with an accepted `PLAN.md` or `00_plan.md`, run:

```text
weasley-podex browser web-ai code --vendor chatgpt --model thinking --effort standard
```

The command packages the bundled `gpt-dev-agent-context.zip`, uploads bounded
project context, and waits for a native code artifact. Re-retrieve an existing
artifact without sending a prompt with:

```text
weasley-podex browser web-ai code-extract --conversation <url>
```

Verify the resulting archive paths and manifest before applying any code.
