---
created: 2026-03-27
tags: [weasley-podex, git, packaging, devlog]
aliases: [Weasley Podex Git Structure, Weasley Podex 패키징 구조, Git Structure Guide]
---

> 📚 [INDEX](INDEX.md) · [체크리스트 ↗](AGENTS.md) · [str_func ↗](str_func.md) · **Git 구조 & 패키징**

# Git Structure Guide (Weasley Podex)

live working tree와 npm 패키지 경계를 기준으로 정리한 Git 구조/운영 요약입니다. top-level prose docs와 다를 때는 실제 트리를 우선합니다.

## 1) Repository Topology

```text
potatohoney-p/weasley-podex    ← public repository
├── skills_ref/                ← npm에 포함되는 감사된 핵심 스킬
├── mcp-ref/                   ← npm에 포함되는 기본 MCP 카탈로그
├── devlog/                    ← 선택적 로컬 작업 공간 (git/npm 제외)
└── .npmignore                 ← 로컬/비공개 작업 공간 제외
```

- `skills_ref/`: 오프라인 설치에서도 동작하는 핵심 스킬 소스
- `mcp-ref/`: 네트워크 장애와 무관하게 사용할 수 있는 기본 MCP 카탈로그
- `devlog/`: 필요한 개발자만 로컬에 두는 비공개 작업 공간
- OfficeCLI는 저장소에 vendoring하지 않고 검증된 Apache-2.0 upstream 릴리스를 on-demand 설치한다
- 존재하지 않는 보조 저장소를 가리키는 `.gitmodules`는 사용하지 않는다

### Dashboard Diff Root Policy

Manager/Electron Diff panel에서 이 repo를 볼 때 source repo root와 runtime home을 혼동하면 안 된다.

- 실제 source repo root 예시: `/Users/you/src/weasley-podex`
- runtime/`WEASLEY_PODEX_HOME` 예시: `/Users/you/.weasley/podex-3459`
- `weasley-podex dashboard serve`가 스캔한 instance metadata의 `projectDirs[]`와 `workingDir`가 diff root 후보의 source of truth다.
- Diff panel은 `projectDirs[]`를 우선 사용하고, 설정에 따라 `workingDir` 또는 port별 pinned root를 먼저 사용한다. `$HOME`은 마지막 fallback이다.
- source repo와 runtime home은 서로 다른 root이므로 root selector에서 명시적으로 선택해야 한다.

## 2) Clone Strategy

```bash
# 일반 사용자/CI
git clone https://github.com/potatohoney-p/weasley-podex.git
```

`skills_ref/`와 `mcp-ref/`가 본 저장소에 추적되므로 별도 submodule 초기화가 필요하지 않습니다. 원격 스킬/MCP 카탈로그 override는 명시적으로 신뢰하는 URL을 설정한 경우에만 사용합니다.

## 4) devlog / internal policy

- `devlog/`는 git과 npm에서 제외되는 선택적 로컬 디렉터리입니다.
- 공개 코드나 설치 과정은 `devlog/`의 존재에 의존하면 안 됩니다.

## 5) PR & Quality Gate

PR 전 최소 검증:

```bash
npm run build
npm test
npm run typecheck
bash structure/check-doc-drift.sh
bash structure/verify-counts.sh
```

추가로 실제 `package.json`에는 아래 스크립트들이 있다.

- `npm run build:frontend`
- `npm run test:all`
- `npm run test:integration`
- `npm run test:smoke`
- `npm run prepublishOnly`

## 6) str_func 문서 동기화 규칙

`AGENTS.md` 규칙:

- `str_func.md` 파일 트리 라인수 표기 형식: `(NNNL)`
- 파일 수정 후 동기화 검증:

```bash
bash structure/verify-counts.sh
```

- 자동 보정:

```bash
bash structure/verify-counts.sh --fix
```

## 7) Devlog 운영 규칙

- 완료된 phase는 `devlog/_fin/`으로 이동
- `devlog/` 루트에는 진행 중 항목만 유지
- 후순위 항목은 `269999_` 접두사 사용

## 8) Structure Sync Scope

- `server.ts`가 route glue layer로 바뀌었으므로 API 변경은 `src/routes/*`와 `structure/server_api.md`를 함께 본다.
- CLI command transport 변경은 `src/cli/commands.ts`, `src/cli/handlers.ts`, `src/cli/handlers-runtime.ts`, `src/cli/handlers-completions.ts`, `src/cli/handlers-workflows.ts`, `src/cli/api-auth.ts`, `src/command-contract/*`와 `structure/commands.md`를 같이 동기화한다.
- prompt/spawn 구조 변경은 `src/prompt/*`, `src/agent/*`, `src/orchestrator/*`와 `structure/prompt_flow.md`, `prompt_basic_*.md`, `agent_spawn.md`를 같이 본다.
- memory/heartbeat runtime 변경은 `src/memory/*`, `src/routes/memory.ts`, `src/routes/jaw-memory.ts`, `src/routes/heartbeat.ts`와 `memory_architecture.md`, `telegram.md`, `infra.md`를 같이 본다.
- 큰 refactor 뒤에는 parent repo quality gate와 별개로 `structure/` drift 검사까지 같이 통과시킨다.

