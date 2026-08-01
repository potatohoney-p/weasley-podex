# Contributing to podex

## Quick Start

```bash
# Clone with skills (public)
cd podex
npm install
npm test
```

## Repository Structure

```
```

### Submodules

| Submodule | Repo | Visibility | 용도 |
|-----------|------|:---:|------|
| `devlog/` | podex-internal | **private** | Internal devlog & planning |

> devlog가 없어도 코드 빌드와 테스트에는 영향 없습니다.

### Clone Options

```bash
# 1. 코드만 (일반 유저 / CI)

# 2. 코드 + skills (개발자)

# 3. 이미 clone 한 후 submodule 추가
git submodule update --init --recursive
```

## Development

```bash
npm install          # dependencies
npm run dev          # dev server (tsx watch)
npm run build        # production build
npm test             # full test suite
npm run typecheck    # tsc --noEmit
```

## Submodule Workflow

서브모듈 내용을 수정한 경우:

```bash
# 1. 서브모듈 안에서 커밋 + 푸시
cd skills_ref   # 또는 cd devlog
git add -A && git commit -m "update" && git push
cd ..

# 2. 메인 레포에서 참조 업데이트
git add skills_ref   # 또는 git add devlog
git commit -m "chore: update skills_ref ref"
git push
```

## Pull Request

1. Fork this repo
2. Create a feature branch
3. `npm run build && npm test` — 빌드 + 테스트 통과 확인
4. Submit PR

