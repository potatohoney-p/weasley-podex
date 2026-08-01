---
created: 2026-03-27
tags: [podex, git, submodule, devlog]
aliases: [podex Git Structure, podex 서브모듈 구조, Git Structure Guide]
---

> 📚 [INDEX](INDEX.md) · [체크리스트 ↗](AGENTS.md) · [str_func ↗](str_func.md) · **Git 구조 & 서브모듈**

# Git Structure Guide (podex)

live working tree + `.gitmodules` 기준으로 정리한 Git 구조/운영 요약입니다. top-level prose docs와 다를 때는 실제 트리와 `.gitmodules`를 우선한다.

## 1) Repository Topology

```text
potatohoney-p/podex              ← public parent repo
├── skills_ref/  (submodule)   ← potatohoney-p/podex-skills (public)
├── devlog/      (submodule)   ← potatohoney-p/podex-internal (private)
├── officecli/   (submodule)   ← potatohoney-p/OfficeCLI (public)
└── .npmignore                 ← npm publish 시 submodule 제외
```

- `skills_ref/`: 스킬 레퍼런스 저장소
- `devlog/`: 내부 개발 로그/계획 저장소
- `officecli/`: Office 문서 도구용 별도 submodule
- parent repo 기준 `git status`에는 이 3개 submodule이 독립 항목으로 보인다
- 현재 `.gitmodules`와 `git submodule status` 기준으로 세 submodule 모두 live tree에 존재한다
- `AGENTS.md`/`CONTRIBUTING.md` 일부 문단은 아직 `officecli/`를 생략하고 있어도, 구조 문서의 기준은 live tree다

### Dashboard Diff Root Policy

Manager/Electron Diff panel에서 이 repo를 볼 때 source repo root와 runtime home을 혼동하면 안 된다.

- 실제 source repo root: `/Users/jun/Developer/new/700_projects/podex`
- runtime/JAW_HOME 예시: `/Users/jun/.podex-3459`
- `jaw dashboard serve`가 스캔한 instance metadata의 `projectDirs[]`와 `workingDir`가 diff root 후보의 source of truth다.
- Diff panel은 `projectDirs[]`를 우선 사용하고, 설정에 따라 `workingDir` 또는 port별 pinned root를 먼저 사용한다. `$HOME`은 마지막 fallback이다.
- parent repo와 `skills_ref/`, `devlog/`, `officecli/` submodule은 각각 독립 git repo일 수 있으므로 root selector에서 명시적으로 선택해야 한다.

## 2) Clone Strategy

```bash
# 코드만 (일반 사용자/CI)
git clone https://github.com/potatohoney-p/podex.git

# 코드 + submodule 전체
git clone --recursive https://github.com/potatohoney-p/podex.git

# 이미 clone 후 submodule 초기화
git submodule update --init --recursive
```

## 3) Submodule Commit Flow (중요)

서브모듈 내용을 바꿨다면 반드시 2단계로 커밋합니다.

```bash
# 1) submodule 내부에서 먼저 커밋/푸시
cd skills_ref   # 또는 cd devlog / cd officecli
git add -A
git commit -m "update"
git push
cd ..

# 2) parent repo에서 submodule ref 업데이트 커밋
git add skills_ref   # 또는 git add devlog / git add officecli
git commit -m "chore: update skills_ref ref"
git push
```

핵심: submodule commit과 parent repo ref commit은 별개입니다.

## 4) devlog / internal policy

- `devlog/`는 private submodule입니다.
- devlog 내부 문서는 `devlog/AGENTS.md`와 하위 `AGENTS.md`를 우선 따른다.
- 접근 필요 시 이슈에서 collaborator 권한 요청:
  - https://github.com/potatohoney-p/podex/issues

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

