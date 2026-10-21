# Weasley Podex

System-level AI agent with full computer control via CLI wrapping (pi, agy, ai-e, claude, claude-e, codex, codex-app, cursor, kiro-code, gemini, grok, opencode, copilot).

The public package and sole command are `weasley-podex`. New runtime data defaults
to `~/.weasley/podex` and is overridden with `WEASLEY_PODEX_HOME`. Historical
source identifiers remain internal implementation details. The public repository is
`potatohoney-p/weasley-podex`.

## Repository Structure

```
├── skills_ref/                ← bundled audited core skills
├── mcp-ref/                   ← bundled MCP registry
├── structure/                 ← architecture and contract docs
└── .npmignore                 ← local/private workspace exclusions
```

### Clone

```bash
git clone https://github.com/potatohoney-p/weasley-podex.git
```

The public repository has no required submodules or private-repository dependencies.

### Architecture Docs Sync

- `structure/` is the current architecture-doc hub; do not point new docs at `devlog/structure/`.
- Keep `README.md`, root `AGENTS.md`, root `CLAUDE.md`, and `structure/AGENTS.md` synchronized when command/API/orchestration surfaces change.
- Recent non-strict hotspots: explicit `/continue`, workflow helper slash commands (`/plan` as PABCD P compatibility guide, `/interview`, `/deliberate`, `/planaudit`, `/review`, `/search`, `/goal`, `/goalplan`, `/team`, `/task`, `/fork`, `/gd`; forward PABCD transitions require `weasley-podex orchestrate <phase> --attest '{"from","to","did",...}'`), pre-prompt context hooks (`context-hooks.json`, `weasley-podex hooks`), bounded local search contract (narrow-path Grep/rg; external search via active search skill), Telegram Hub P0–P4 (`structure/telegram.md`, `/api/dashboard/telegram-hub`), goal pause gate continuation suppression (`goal_pause_gate_pending`), `tests/run.mts` programmatic test driver, `/goal plan` and `/goalplan` store user direction as `planHint` and require `/goal refine` before checkpoints; agent pause first-tap state is exposed as derived `pauseGate` on status/API surfaces while persisted status remains `active`; bounded automation is `/goal run ...`, not top-level `/autopilot`), Pi top-level `pi --mode rpc` runtime with isolated `PI_CODING_AGENT_DIR` profiles, AGY `-p` print-mode runtime with capability-probed optional `--model` (observed in AGY 1.0.12), Grok weekly quota via `~/.grok/auth.json` + Grok Build billing gRPC-web before legacy monthly fallback, SSE-first `GET /api/events` event channel with WebSocket fallback, bounded tool-log sanitizer, worker progress query/watch, canonical `/api/channel/send`, heartbeat `every`/`cron` schedules, browser runtime diagnostics/session lifecycle, Electron Node sidecar packaging, trusted opt-in skill imports, and `npm run gate:all`.
- Optimization/score-maximization goals follow the optimization-loop discipline (LOOP-PHASE-DEATH/CONTINUITY/CANDIDATE-ANCHOR/INSTANCE-CHECK + GATE-ORACLE-VALIDITY):
  classify candidate changes, ban a class after 3 consecutive discards, force evaluator-gate work on repeated D-phase deaths.
  Canonical: dev-pabcd §10, dev-testing §9.5; injected via orchestration template and goal continuation.
- `structure/` reading map: start at `structure/INDEX.md`; depth — `telegram.md` (Hub), `prompt_flow.md` (attest/hooks/bounded search), `stream-events.md` (pause gate/SSE), `infra.md` (test scripts), `commands.md` + `server_api.md` (slash/API surfaces).

GitHub `browser fetch` routing uses repository metadata only for repository-root URLs. Blob files retain raw-file reads; issue, PR, release, directory, and other subpages use the requested page's reader path.

### Optional Skill Routing

Only the eight entries in `skills_ref/registry.json` are bundled. Imported skills are user-selected extensions from an installed Codex environment or an explicit trusted repository; never document them as bundled or required by the core runtime.

### Build & Deploy Contract (서버 코드 변경 시 필수)

**실행 중인 서버는 TS 소스가 아니라 컴파일된 `dist/`를 실행한다** (`weasley-podex serve` → `dist/server.js`, CLI → internal entrypoint `dist/bin/podex.js`). 소스만 커밋하고 빌드를 빼먹으면 서버를 재시작해도 변경이 반영되지 않는다 (260610 `/api/project/pick` 404 사고의 원인).

서버/CLI 코드(`server.ts`, `src/**`, `bin/**`)를 변경했다면:

```bash
npm run build           # tsc → dist/ atomic swap (prebuild: ensure:native 포함)
npm run build:frontend  # public/js·public/manager 변경 시 (→ public/dist)
```

- 변경 반영 단위 = **커밋 + 해당 빌드 + 서버 재시작** 3종 세트. 빌드 없이 "재시작하면 됩니다"라고 안내하지 말 것.
- 프론트엔드(`public/js/*.ts`, `public/manager/src/**`)는 `build:frontend`만으로 충분하며 서버 재시작 없이 브라우저 새로고침으로 반영된다 (`public/dist` 정적 서빙).
- 반영 여부 검증: `grep <new-symbol> dist/...` 또는 해당 엔드포인트 curl로 확인 후 안내.

### Line Count Format (`str_func.md`)

File tree の行数は **`(NNNL)`** 형식으로 기재. 두 가지 변형 허용:

```
├── server.js          ← 설명 (757L)           ← 단순 형식
├── chat.js            ← 설명 (3모드, ..., 843L) ← 다중 메타 형식
```

- 숫자 + `L` + `)` 또는 `,` 로 끝나야 detection 가능
- 검증: `bash structure/verify-counts.sh` (exit code = 불일치 수; 현재는 `str_func.md` 파일 트리의 모든 `(NNNL)` 파일 항목도 검사)
- 자동 수정: `bash structure/verify-counts.sh --fix`
- **파일 수정 후 반드시 verify-counts 실행해서 문서 동기화**

### OfficeCLI (On-Demand)

OfficeCLI is NOT bundled with Weasley Podex postinstall. It is installed on-demand when skills need L1/L2 features or HWP support.

- **Format support**: .docx, .xlsx, .pptx, .hwpx, .hwp (HWP via rhwp sidecars)
- **Install (verified Apache-2.0 upstream)**: `bash "$(npm root -g)/weasley-podex/scripts/install-officecli.sh"`
- **Custom trusted release source**: set `OFFICECLI_REPO=owner/repo`
- **Smoke test**: `officecli --version && officecli capabilities --json`
- **Binary priority**: `OFFICECLI_BIN` env → global `officecli` → not available
- **Safety**: Never run parallel officecli processes on the same file

```bash
officecli create file.docx                                          # create blank
officecli view file.docx text                                       # view content
officecli add file.docx /body --type paragraph --prop text="..."    # add content
officecli set data.xlsx /Sheet1/A1 --prop value="42"                # set cell
officecli add deck.pptx / --type slide --prop title="Title"         # add slide
officecli create file.hwpx                                          # create blank HWPX
officecli hwp doctor --json                                         # HWP/rhwp readiness
officecli create file.hwp --json                                    # create blank HWP when rhwp-field-bridge is ready
officecli add file.hwp /text --type paragraph --prop value="..." --prop output=out.hwp --json
officecli view file.hwp pdf --out out.pdf --json                    # export HWP through rhwp sidecars
officecli set file.hwp /native-op --prop op=split-paragraph --prop output=out.hwp --json
officecli validate file.docx                                        # validate
officecli get file.docx / --json                                    # JSON output
echo '[...]' | officecli batch data.xlsx --json                     # batch ops
```
