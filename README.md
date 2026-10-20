<div align="center">

<img src="public/assets/weasley-podex-mark.png" width="180" alt="Weasley Podex circuit mark">

# Weasley Podex

### Your personal AI agent. 2 lines to install. 13 AI runtime surfaces in one dashboard.

[GitHub](https://github.com/potatohoney-p/weasley-podex) · [Website](https://potatohoney-p.github.io/weasley-podex/) · [npm](https://npmjs.com/package/weasley-podex)

**English** / [한국어](README.ko.md) / [中文](README.zh-CN.md) / [日本語](README.ja.md)

</div>

## Install

<details>
<summary><b>Safe install</b> — for existing users who want minimal changes</summary>

```bash
# macOS / Linux
WEASLEY_PODEX_SAFE=1 npm install -g weasley-podex    # skips optional tool/runtime setup
weasley-podex init                              # interactive setup later when you're ready
```

Windows users should use the WSL install path below. Native PowerShell is not the supported Weasley Podex install target.

</details>

```bash
# macOS / Linux / WSL with Node.js 22+ already installed
npm install -g weasley-podex
weasley-podex dashboard
```

That's it. Open **http://localhost:24576** for the manager dashboard. Per-instance agent Web UIs still run from **http://localhost:3457** when you start `weasley-podex serve`. Requires [Node.js 22.4+](https://nodejs.org).

> **First time?** The default npm install initializes Weasley Podex and attempts native Claude setup. Other AI CLIs are optional; install them all during npm setup with `WEASLEY_PODEX_INSTALL_CLI_TOOLS=1 npm install -g weasley-podex` on macOS/Linux. On Windows, use the WSL install path below.

> State is stored in `~/.weasley/podex` by default. Set `WEASLEY_PODEX_HOME` to use another home.

> **Migration:** Existing data under `~/.podex` can be copied into the new default home during installation. The only public command is `weasley-podex`; use `WEASLEY_PODEX_*` names in scripts.

### Optional JWC Runtime

JWC is optional and external-only. The default npm install and Electron desktop sidecar do not bundle `jawcode`, `@jawcode-dev`, `@oven`, `bun`, or a `jwc` payload. To use JWC, install the runtime into Weasley Podex's external prefix and opt in with the printed SDK path:

```bash
weasley-podex jwc install
export JWC_SDK_PATH="/absolute/path/printed/by/weasley-podex-jwc-install/sdk.js"
weasley-podex jwc doctor
```

To remove the optional external JWC dependencies later:

```bash
weasley-podex jwc clean
```

<details>
<summary><b>macOS one-click</b> — don't have Node.js? This installs everything</summary>

```bash
curl -fsSL https://raw.githubusercontent.com/potatohoney-p/weasley-podex/main/scripts/install.sh | bash
source "${ZDOTDIR:-$HOME}/.zshrc" 2>/dev/null || true
bash "$(npm root -g)/weasley-podex/scripts/verify-fresh-install.sh"
```

</details>

<details>
<summary><b>Windows (WSL — Windows Subsystem for Linux)</b> — one-click from scratch</summary>

```powershell
# 1. Install WSL (PowerShell as Admin)
wsl --install
```

Restart, open **Ubuntu**, then:

```bash
# 2. Install weasley-podex + all dependencies
curl -fsSL https://raw.githubusercontent.com/potatohoney-p/weasley-podex/main/scripts/install-wsl.sh | bash
source ~/.bashrc
weasley-podex dashboard
bash "$(npm root -g)/weasley-podex/scripts/verify-fresh-install.sh"
```

From Windows PowerShell into WSL, run commands through a login shell so the WSL profile PATH is loaded:

```powershell
wsl.exe -d Ubuntu -- bash -lc "weasley-podex dashboard"
```

</details>

<details>
<summary><b>Fresh-machine evidence</b> — maintainer release check</summary>

Run this on a clean VM before publishing installer changes. It writes environment snapshots, installer logs, the exact collector/installer/verifier scripts that ran, their SHA-256 hashes, verifier logs, and new-shell PATH probes into `~/weasley-podex-fresh-install-evidence-*`.

```bash
# macOS Terminal
COLLECTOR=/tmp/weasley-podex-collect-fresh-install-evidence.sh
curl -fsSL https://raw.githubusercontent.com/potatohoney-p/weasley-podex/main/scripts/collect-fresh-install-evidence.sh -o "$COLLECTOR"
bash "$COLLECTOR" --target macos

# Ubuntu inside WSL
COLLECTOR=/tmp/weasley-podex-collect-fresh-install-evidence.sh
curl -fsSL https://raw.githubusercontent.com/potatohoney-p/weasley-podex/main/scripts/collect-fresh-install-evidence.sh -o "$COLLECTOR"
bash "$COLLECTOR" --target wsl
```

From Windows PowerShell, enter the supported WSL path:

```powershell
```

If the collector says `powershell.exe` is not available inside WSL, run this from Windows PowerShell before auditing:

```powershell
wsl.exe -d Ubuntu -- bash -lc 'EVIDENCE_DIR="$(ls -dt ~/weasley-podex-fresh-install-evidence-* | head -1)"; { echo "command=wsl.exe -d Ubuntu -- bash -lc weasley-podex --version"; weasley-podex --version; } | tee "$EVIDENCE_DIR/33-powershell-to-wsl-probe.log"'
```

For an unmerged branch or local VM checkout, pass the local installer and verifier explicitly:

```bash
bash scripts/collect-fresh-install-evidence.sh --target macos --install-script scripts/install.sh --verifier-script scripts/verify-fresh-install.sh
bash scripts/collect-fresh-install-evidence.sh --target wsl --install-script scripts/install-wsl.sh --verifier-script scripts/verify-fresh-install.sh
```

Audit each collected directory before treating it as target evidence:

```bash
EVIDENCE_DIR="$(ls -dt ~/weasley-podex-fresh-install-evidence-* | head -1)"
AUDITOR="$(npm root -g)/weasley-podex/scripts/audit-fresh-install-evidence.mjs"
node "$AUDITOR" "$EVIDENCE_DIR" --target macos
node "$AUDITOR" "$EVIDENCE_DIR" --target wsl

# For a local checkout, audit with the checkout's auditor:
node scripts/audit-fresh-install-evidence.mjs "$EVIDENCE_DIR" --target macos
node scripts/audit-fresh-install-evidence.mjs "$EVIDENCE_DIR" --target wsl
```

Before publishing installer changes, run the matrix gate with both strict evidence directories:

```bash
GATE="$(npm root -g)/weasley-podex/scripts/verify-release-evidence.mjs"
node "$GATE" --macos /path/to/macos-evidence --wsl /path/to/wsl-evidence

# For a local checkout:
node scripts/verify-release-evidence.mjs --macos /path/to/macos-evidence --wsl /path/to/wsl-evidence
```

The matrix gate rejects evidence collected with stale collector, installer, or verifier scripts; archived evidence scripts must match the current package or checkout that runs the gate.

When `scripts/release.sh`, `scripts/release-preview.sh`, or `npm publish` detects installer-sensitive changes since the previous tag, it runs this same matrix gate before any git push or npm publish. Set the evidence directories before starting a release:

```bash
WEASLEY_PODEX_MACOS_EVIDENCE_DIR=/path/to/macos-evidence \
WEASLEY_PODEX_WSL_EVIDENCE_DIR=/path/to/wsl-evidence \
bash scripts/release.sh patch
```

</details>

<details>
<summary><b>Docker</b></summary>

```bash
docker compose up -d       # → http://localhost:3457
```

</details>

---

## What is Weasley Podex?

Weasley Podex is an open-source platform that unifies the AI coding CLIs you already use — Pi, Claude, Claude E, AI-E, Antigravity, Codex, Codex App, Cursor, Grok, Kiro, OpenCode, and Copilot — into **one assistant with one memory and one dashboard**.

Your main CLI (the “Boss”) calls the others as “employees.” You stop copy-pasting between apps and start giving orders from a single place.

- **No API keys needed** — routes through subscriptions you already pay for
- **No per-token billing** — flat monthly cost, same as what you already have
- **Runs locally** — your code never leaves your machine


---

## Authenticate

You only need **one**. Pick whichever subscription you already have:

```bash
# Free options (no credit card needed)
copilot login        # GitHub Copilot (free tier available)
opencode             # OpenCode — free models available
kiro                 # AWS Kiro (free tier with AWS account)

# Paid (monthly subscription you already pay for)
claude auth login    # Anthropic Claude Pro or higher
codex login          # OpenAI ChatGPT Pro or higher
cursor-agent login   # Cursor
grok login --oauth   # xAI Grok / Grok Heavy
```

Check everything at once: `weasley-podex doctor`

<details>
<summary>Example weasley-podex doctor output</summary>

```
◆ Weasley Podex Doctor — 13 checks

 ✅ Node.js        v22.15.0
 ✅ Claude CLI      installed
 ✅ Codex CLI       installed
 ✅ Cursor CLI      installed
 ✅ OpenCode CLI    installed
 ✅ Copilot CLI     installed
 ✅ Database        weasley-podex.db OK
 ✅ Skills          29 active, 238 reference
 ✅ MCP (plugins)   3 servers configured
 ✅ Memory          structured/ exists
 ✅ Server          port 3457 available
```

</details>

---

## The Dashboard

The dashboard is your command center. `weasley-podex dashboard` starts the manager at `http://localhost:24576`; individual agent Web UIs are served by `weasley-podex serve` from `http://localhost:3457` and nearby managed ports.
Live Web/TUI updates use the SSE-first `GET /api/events` channel, with legacy WebSocket fallback only for older servers where SSE never opens.

### Instance Manager

See every running AI instance — start, stop, restart with one click. Preview live Web UIs directly in the dashboard.

Manager preview embeds the selected instance's regular Web UI. On long-running
homes with large chat databases, a fresh Chrome tab can briefly allocate more
memory while the preview loads its recent message window, renders markdown and
structured cards, and lets Chrome's garbage collector settle. If memory drops
back after a few minutes, treat it as a cold-load peak rather than a manager
server leak; the `weasley-podex dashboard` manager process should stay much smaller than
the embedded browser renderer and the individual `weasley-podex serve` worker processes.


### Kanban Board

Drag instance cards into lanes (Backlog → Ready → In Progress → Review → Done). Track what each AI session is working on.


### Priority Matrix

Eisenhower matrix for your tasks and reminders. Prioritize what matters.


### Notes

A mini-Obsidian inside the dashboard. Folders, visual (WYSIWYG) + raw + split editing, KaTeX (math rendering), Mermaid (diagram-as-code), syntax-highlighted code blocks.


### Agent Status

Monitor each AI engine's health and usage at a glance.


### Desktop App

Prefer a native window to a browser tab? Weasley Podex ships an **Electron desktop shell** that boots the manager dashboard and supervises the underlying `weasley-podex dashboard serve` process for you. Packaged desktop builds include a Node.js sidecar server, so the app can prefer its bundled `weasley-podex` shim before falling back to a global terminal install.

For end users, download the desktop artifact from **GitHub Releases**:

- **macOS**: download the DMG, drag Weasley Podex into Applications, then launch it. Current builds are unsigned / un-notarized, so first launch may require right-click → **Open** in Finder.
- **Windows**: download the NSIS installer. It includes the same sidecar server and adds the packaged `weasley-podex` shim to PATH.
- **Linux**: download the AppImage, make it executable, and run it.

After first launch, accept the **Install CLI command** prompt to create the terminal `weasley-podex` command from the bundled sidecar. If you skip the prompt, use the tray menu item **Install CLI to Terminal** later. This path does not require a global npm install for the packaged app or terminal shim.

Developer build:

```bash
# one-time, from the repo root
npm install && npm --prefix electron install

npm run electron:dev          # develop with hot reload
npm run electron:dist:mac     # build macOS arm64 .dmg + .zip with bundled sidecar
```

The packaged app lands in `electron/dist/`. The GitHub Actions desktop release workflow builds macOS arm64 DMG/ZIP, Windows x64 NSIS/ZIP, and Linux AppImage artifacts on release publish or manual dispatch. Native modules such as `better-sqlite3` stay in the manager/sidecar server — the Electron main process never imports them.

---

## How the Employee System Works

This is the core idea: **your main CLI calls other CLIs as workers.**

You talk to one AI (the "Boss"). When it needs specialized work, it dispatches tasks to employees — each running their own CLI with their own model:

```
You: "Fix the frontend styling and update the API endpoint"

Boss (Claude) thinks...
  ├── Dispatches to Frontend employee (OpenCode) → "Fix the CSS grid layout in dashboard.tsx"
  ├── Dispatches to Backend employee (Codex)     → "Update /api/users to return pagination metadata"
  └── Synthesizes both results for you
```

```bash
# Under the hood, it's one command:
weasley-podex dispatch --agent "Frontend" --task "Fix the CSS grid layout in dashboard.tsx"
weasley-podex dispatch --agent "Backend" --task "Run read-only verification" --watch
weasley-podex dispatch --virtual "security" --task "Review this branch for auth and secret leaks" --watch
weasley-podex worker status Backend
```

Employees are other AI CLIs configured in your settings. Each has its own session, its own model, its own context. For one-off specialist checks, the Boss can also dispatch an ephemeral virtual employee with `--virtual`; it uses the same dispatch machinery but is not saved to the employee database. The Boss reviews their output before presenting it to you.

### Employees vs. Sub-agents

These are different things:

| | Employees | Sub-agents |
|---|---|---|
| **What** | Other AI CLIs (Codex, OpenCode, etc.) configured as workers | Built-in parallel task tool within a single CLI |
| **When** | Multi-specialist work across different codebases or domains | Internal research, file reads, parallel analysis |
| **How** | `weasley-podex dispatch --agent "Name" --task "..."` | Automatic — the CLI spawns them internally |

Use employees for "Frontend does CSS, Backend does API." Use sub-agents for "read these 5 files in parallel before deciding."

---

## AI Runtime Surfaces

No per-token API billing. Route through subscriptions you already pay for.

| CLI | Default Model | Auth | Cost |
|---|---|---|---|
| **Pi** | `grok-composer-2.5-fast` | Settings profile API key, local proxy, or `PI_CODING_AGENT_BIN` | First-class `pi --mode rpc` runtime for local/API endpoints through an isolated `PI_CODING_AGENT_DIR` |
| **Claude** | `claude-opus-4-8` | `claude auth login` | Claude Pro subscription or higher |
| **Claude E** | `claude-opus-4-8` | underlying `claude auth login` | Claude Pro subscription or higher; preferred for June subscription allowance |
| **AI-E** | provider-selected | selected provider auth | Multi-provider runtime wrapper |
| **Antigravity** | AGY-selected | checked by `agy` at run time | Experimental AGY print-mode runtime (`agy -p`); optional `--model` is capability-probed (observed in AGY 1.0.12); resume via `--conversation`; no separate effort flag |
| **Codex** | `gpt-5.5` | `codex login` | ChatGPT Pro subscription or higher |
| **Codex App** | `gpt-5.5` | `codex login` | ChatGPT Pro subscription or higher |
| **Cursor** | `composer-2.5` | `cursor-agent login` or `CURSOR_API_KEY` | Cursor subscription; quota is auth/status-only |
| **Grok** | `grok-build` | `grok login --oauth` | Grok subscription; weekly usage pool read from `~/.grok/auth.json` via Grok Build billing |
| **Kiro** | registry-selected | `kiro` | AWS Kiro free tier; `kiro-cli chat --no-interactive` runtime |
| **OpenCode** | `opencode-go/kimi-k2.6` | `opencode` | Free models available |
| **Copilot** | `claude-sonnet-4.6` | `copilot login` | Free tier available |

GPT 5.5 and Claude Opus 4.8 are enabled from Pro-tier subscriptions and higher. Starting in June, select `claude-e` when you want Weasley Podex to use the Claude allowance bundled with the subscription plan.

The quota/status panel keeps the same runtime keyset as the registry. Wrapper runtimes (`ai-e`, `claude-e`, `codex-app`) delegate to their underlying provider, while Pi/AGY/Cursor/OpenCode are shown as auth/status-only when their CLIs do not expose quota windows. Grok uses the current Grok CLI auth store for the SuperGrok weekly usage pool and falls back to legacy monthly credits when the weekly endpoint is unavailable.

The Web UI renders provider and messaging indicators as brand-neutral initials in code. The package does not bundle third-party provider or social-service logo artwork.

**Fallback chain**: if one engine is rate-limited, the next picks up. Configure with `/fallback [cli1 cli2...]`.

**OpenCode wildcard**: connect any model endpoint — OpenRouter, local LLMs (Large Language Models), any OpenAI-compatible API.

> Switch engines live: `/cli codex`. Switch models: `/model gpt-5.5`. Works from Web, Terminal, Telegram, or Discord.

---

## PABCD Orchestration (Plan → Audit → Build → Check → Done)

For complex tasks, Weasley Podex uses a structured 5-phase workflow. You approve every transition — nothing ships without your OK.

```
P (Plan) → A (Audit) → B (Build) → C (Check) → D (Done) → IDLE
   ⛔          ⛔          ⛔         auto        auto
```

| Phase | What happens |
|---|---|
| **P — Plan** | Boss writes a diff-level plan. Stops for your review |
| **A — Audit** | Read-only worker verifies the plan is feasible (imports exist, signatures match) |
| **B — Build** | Boss implements. Read-only worker verifies the result |
| **C — Check** | Type-check (`tsc --noEmit`), docs update, consistency check |
| **D — Done** | Summary of all changes. Returns to idle |

State is database-persisted and survives restarts. Workers cannot modify files — only verify. Activate with `weasley-podex orchestrate`, `/orchestrate`, or `/pabcd`; resume an active worklog explicitly with `/continue`. Forward phase transitions require evidence attestation, e.g. `weasley-podex orchestrate B --attest '{"from":"A","to":"B","did":"<what you did>"}'` (C→D also needs pasted `checkOutput` and `exitCode`). Workflow helper slash commands include `/plan`, `/interview`, `/deliberate`, `/planaudit`, `/review`, `/search`, `/goal`, `/goalplan`, `/team`, `/task`, `/fork`, and `/gd`; `/plan` is a compatibility guide that explains "this is PABCD P" and points to the right next command instead of creating a second planning mode. `/search <query>` routes search intent through the active search skill: classify local vs external lookup, rewrite focused queries, discover candidate URLs, and only then use browser commands such as `browser fetch` for evidence verification. Bounded automation is expressed as `/goal run ...`, not a separate top-level `/autopilot`. Durable goals — `/goal <objective>` plus `update`/`done`/`cancel`/`pause`/`resume` — are functional and survive restarts, and a goal resume re-fires the work on every interface (Web/CLI included, not just messaging). AI-initiated `goal pause --agent --audit` arms a two-tap gate: one audit/finalizer continuation may run with `pause_gate_pending`, and if that turn exits with the gate still armed, `goal_pause_gate_pending` suppresses further auto-continuation until a productive checkpoint or a second audited pause. `/gd` is shorthand for `/goal done --force` (skips the completion evidence gate). `/goal run` (`preflight`/`start`/`stop`/`status`) is a tracking-only preview: it gates on preflight and tracks turn/dispatch budget, with enforcement still to come.

Goal-run tracking lifecycle: commands recover the persisted run without a prior status read. Start refuses to overwrite an existing run; resume requires the original goal to be active and refined. Paused time is excluded from minute usage, and blocked API resumes return HTTP 400 with the persisted gate reasons. Budget enforcement remains a preview.

Goal-run saved-state recovery: invalid JSON, malformed fields, or unreadable `goal/active-run.json` block status and explicit mutations with an actionable diagnostic (HTTP 409 with `goal_run_state_invalid` or `goal_run_state_unreadable`; CLI blocked result). Preflight reports a failed `persisted-run-state` gate. Preserve a backup and repair the file before retrying; the application never resets or rewrites a rejected record. Tracking callbacks warn and skip that record without interrupting worker completion; a counter already at the maximum safe integer also skips its increment without changing saved bytes. A repaired file is retried without restarting. This validates disk loads; an already loaded valid run remains the process-local authority, without cross-process locking or detection of later external edits.

---

## Memory

Three layers, each covering a different recall horizon.

| Layer | What it stores | How it works |
|---|---|---|
| **History Block** | Recent session context | Last 10 sessions, max 8000 chars, scoped to working directory. Injected at prompt start |
| **Memory Flush** | Structured knowledge from conversations | Triggered after threshold (default 10 turns). Extracts episodes, daily logs, semantic notes as markdown |
| **Soul + Task Snapshot** | Identity and semantic recall | Core values, tone, boundaries. Full-text search index returns up to 4 semantically relevant hits per prompt |

All three layers feed into the system prompt automatically. Memory is searchable:

```bash
weasley-podex memory search "how did we set up the API auth?"
```

---

## Skills

Weasley Podex ships a small, audited core skill catalog and can import additional skills from an installed Codex environment or a trusted repository you configure.

| Category | Bundled skills | What they cover |
|---|---|---|
| **Development** | `dev`, `dev-pabcd` | Safe implementation and structured PABCD delivery guidance |
| **Automation** | `browser`, `web-ai` | Browser and authenticated Web AI workflows |
| **Orchestration** | `goal`, `search`, `memory` | Persistent goals, evidence-backed search, and durable memory |
| **Visualization** | `diagram` | SVG diagrams, charts, interactive visualizations rendered in chat |

Bundled reference skills live in `skills_ref/` and install into the active runtime on demand. Imported skills remain in the user runtime home and are never published with this repository.

```bash
weasley-podex skill install <name>    # activate a reference skill
weasley-podex skill list              # see what's available
```

---

## Browser & Desktop Automation

| Capability | How it works |
|---|---|
| **Chrome DevTools Protocol** | Navigate, click, type, screenshot, evaluate JS, scroll, press keys — remote control for Chrome |
| **Vision-click** | Screenshot the screen → AI extracts target coordinates → clicks. `weasley-podex browser vision-click "Login button"` |
| **Computer Use** | Desktop app automation via Codex Computer Use. Use Safari for localhost and it feels like the Codex app |
| **Web-AI vendors** | `weasley-podex browser web-ai --vendor chatgpt\|gemini\|grok` with session lifecycle, diagnostics, source-audit/answer-artifact support, and ChatGPT code-mode zip recovery |
| **Diagram Skill** | Generate SVG diagrams and interactive visualizations, rendered inline in chat |

Computer Use lets you control any macOS app — Finder, Safari, System Settings, Xcode — through natural language. Point it at your localhost dev server in Safari and you get a full visual testing loop.

---

## Messaging

### Telegram

```
📱 Telegram ←→ ◆ Weasley Podex ←→ 🤖 AI Engines
```

Text chat, voice messages (auto-transcribed via STT — speech-to-text), file/photo upload, slash commands (52 registered, 51 visible; workflow helpers include `/plan`, `/interview`, `/review`, `/search`, `/goal`, `/orchestrate`, `/task`, `/fork`, `/gd`; dynamic `/skill:<id>` on CLI/Web), forum-topic routing and **Dashboard Telegram Hub** (`/setthread`, `/threads`, `/hubhelp`, per-topic model/systemPrompt overrides in Manager UI), scheduled task delivery via `every`/`cron` heartbeat jobs.

<details>
<summary>Setup (3 steps)</summary>

1. Message [@BotFather](https://t.me/BotFather) → `/newbot` → copy the token
2. `weasley-podex init --telegram-token YOUR_TOKEN` or use Web UI settings
3. Send any message to your bot. Chat ID is auto-saved on first message

</details>

### Discord

Same capabilities as Telegram — text, files, commands. Channel/thread routing, canonical `/api/channel/send`, and forwarder support for agent result broadcast. Setup via Web UI settings.

### Voice & STT

Voice input works on Web (mic button), Telegram (voice messages), and Discord. Providers: OpenAI-compatible, Google Vertex AI, or any custom endpoint.

---

## MCP (Model Context Protocol)

[MCP](https://modelcontextprotocol.io) is a standard that lets AI tools share capabilities — like plugins for AI agents. Weasley Podex manages MCP config for all your engines from one file.

```bash
weasley-podex mcp install @upstash/context7-mcp
# → syncs to Claude, Codex, Kiro, OpenCode, Copilot, and Antigravity config files simultaneously
```

No more editing several different JSON files. Install once, every MCP-aware engine gets it. Grok CLI is a standard runtime here, but it is not counted as MCP-sync capable until Grok exposes a compatible config surface. Antigravity MCP sync is a separate config target from the `agy` runtime registry entry.

```bash
weasley-podex mcp sync       # re-sync after manual edits
```

---

## CLI Commands

```bash
# Core
weasley-podex dashboard                     # launch manager dashboard
weasley-podex serve                         # start server (http://localhost:3457)
weasley-podex chat                          # terminal chat UI
weasley-podex chat search "query"           # search chat history
weasley-podex doctor                        # installation and runtime diagnostics

# Instances
weasley-podex clone ~/project               # clone instance to new directory
weasley-podex --home ~/project serve --port 3458  # run second instance
weasley-podex service install               # auto-start on boot
weasley-podex project set ~/repo            # set projectDirs for review/orchestration
weasley-podex lock                          # protect this instance from stop-all flows

# AI & Orchestration
weasley-podex employee list                         # list configured + static employees
weasley-podex dispatch --agent "Backend" --task "..."  # dispatch employee
weasley-podex dispatch --agent "Backend" --task "..." --watch  # dispatch and stream safe progress
weasley-podex dispatch --virtual "testing" --task "..." --watch  # one-off virtual employee
weasley-podex worker status Backend            # inspect current/previous employee progress
weasley-podex orchestrate                   # enter/control PABCD workflow
weasley-podex goal status                   # persistent goal lifecycle
weasley-podex task list                     # agent-native task checklist
# in chat: /continue               # explicit worklog/PABCD resume

# Skills & MCP
weasley-podex skill install <name>          # activate a skill
weasley-podex skill list                    # list available skills
weasley-podex mcp install <package>         # install MCP → syncs supported MCP-aware engines
weasley-podex mcp sync                      # re-sync MCP configs

# Memory
weasley-podex memory search <query>         # search across all memory layers
weasley-podex memory save <file> <content>  # save to structured memory

# Browser
weasley-podex browser start                 # launch Chrome automation
weasley-podex browser fetch "https://example.com" --json --trace  # adaptive URL reader
weasley-podex browser snapshot              # capture page state
weasley-podex browser vision-click "Login"  # AI-powered click
weasley-podex browser web-ai status         # ChatGPT/Gemini/Grok web-AI session tooling
weasley-podex browser web-ai code --vendor chatgpt --model thinking --effort heavy --prompt "Build an MVP" --output-zip ./result.zip

# Search
# in chat: /search "npm trusted publishing official docs"  # search-skill routing + evidence verification

# Dashboard connectors
weasley-podex dashboard memory search "query"  # read-only cross-instance memory search
weasley-podex dashboard chat search "query"    # cross-instance chat search
weasley-podex connector board add --title "Fix docs"
weasley-podex reminders add "Follow up tomorrow"

# Maintenance
weasley-podex reset                         # full reset
```

---

## Multi-Instance

Run isolated instances with separate settings, memory, and database:

```bash
weasley-podex clone ~/my-project
weasley-podex --home ~/my-project serve --port 3458
```

Each instance is fully independent — different working directory, different memory, different MCP config. The manager dashboard sees them all.

---

## Development

```bash
npm run build          # tsc → dist/
npm run build:frontend # vite → public/dist/
npm run dev            # tsx server.ts (hot-reload)
npm test               # programmatic node:test driver (tests/run.mts, isolation:'process')
npm run gate:all       # named release/docs parity gates (incl. doc-drift + strict-baseline)
npm run docs:check     # AST commands/routes inventory vs structure docs
bash structure/check-doc-drift.sh
```

Architecture details: [ARCHITECTURE.md](https://github.com/potatohoney-p/weasley-podex/blob/main/docs/ARCHITECTURE.md) · Pre-prompt context hooks: [pre-prompt-context-hooks.md](https://github.com/potatohoney-p/weasley-podex/blob/main/docs/dev/pre-prompt-context-hooks.md) · [Internal structure docs](https://github.com/potatohoney-p/weasley-podex/tree/main/structure)

---

## How It Compares

| | Weasley Podex 2.x | Hermes Agent | Claude Code |
|---|---|---|---|
| **Model access** | Pi, Antigravity, AI-E, Claude, Claude E, Codex, Codex App, Cursor, Gemini, Grok, Kiro, OpenCode, and Copilot through vendor/native auth where supported | API keys (OpenRouter 200+, Nous Portal) | Anthropic only |
| **Cost model** | Monthly subscriptions you already pay for | Per-token API billing | Anthropic subscription |
| **Primary UI** | Manager dashboard + Web app + Electron desktop + terminal UI | Terminal only | CLI + IDE plugins |
| **Dashboard** | Multi-instance manager, Kanban, Notes workspace | None | None |
| **Messaging** | Telegram (voice) + Discord | Telegram/Discord/Slack/WhatsApp/Signal | None |
| **Memory** | 3-layer (History/Flush/Soul) + full-text search | Self-improving loop + Honcho | File-based auto-memory |
| **Multi-agent** | Employee system (dispatch other CLIs) + PABCD | Subagent spawn | Task tool |
| **Browser automation** | Chrome DevTools + vision-click + Computer Use | Limited | Via MCP |
| **Execution** | Local + Docker | Local/Docker/SSH/Daytona/Modal | Local |
| **Skills** | Audited bundled core + local/trusted imports | Self-creating + agentskills.io | User-configured |
| **Languages** | English, Korean, Chinese, Japanese | English | English |

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `weasley-podex: command not found` | `npm install -g weasley-podex` again. macOS/Linux/WSL: check `~/.local/bin` or `npm prefix -g` + `/bin` is in `$PATH`. From Windows PowerShell, invoke WSL through a login shell: `wsl.exe -d Ubuntu -- bash -lc "weasley-podex dashboard"`. |
| `weasley-podex: permission denied` | The global shim can see Weasley Podex, but its internal `dist/bin/podex.js` target is not executable. Re-run `npm install -g weasley-podex` or, in a checkout, run `npm run build && npm run check:cli-bin-links`. |
| Fresh install verifier fails | `scripts/verify-fresh-install.sh` checks the public `weasley-podex` command. Fix the reported PATH or executable-bit issue, then rerun `bash "$(npm root -g)/weasley-podex/scripts/verify-fresh-install.sh"`. |
| `Error: node version` | Upgrade to Node.js 22.4+: `nvm install 22` |
| `NODE_MODULE_VERSION` mismatch | `npm run ensure:native` (auto-rebuilds native modules) |
| `EADDRINUSE: port 3457` | Another instance running. Use `--port 3458` or stop it first |
| Telegram / Discord auth fails | Run `weasley-podex doctor`, check tokens, restart `weasley-podex serve` |
| Browser commands fail | Install Chrome/Chromium. Run `weasley-podex browser start` first |
| Employee dispatch hangs | Run `weasley-podex employee list`, ensure the employee CLI is authenticated (`weasley-podex doctor`), then retry with `weasley-podex dispatch --watch` |
| Employee dispatch returns non-JSON or HTML | The server may be stale or missing the route. Run `npm run build` or restart the manager/dashboard process. |
| Computer Use not working | macOS only. Codex CLI required. Check Automation permission in System Settings |

---

## Contributing

1. Fork and branch from `dev`
2. `npm run build && npm run build:frontend && npm test`
3. For release-sensitive changes, also run `npm run gate:all` and any focused checks for the touched surface.
4. Submit a PR
