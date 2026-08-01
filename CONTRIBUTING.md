# Contributing to Weasley Podex

The public npm package and sole CLI are both `weasley-podex`.

## Quick Start

```bash
# Clone the public repository
git clone https://github.com/potatohoney-p/weasley-podex.git
cd weasley-podex
npm install
npm test
```

## Repository Structure

```text
bin/          CLI entrypoints and commands
src/          Server, runtimes, orchestration, and manager code
public/       Web and manager frontends
electron/     Desktop shell
skills_ref/   Audited bundled core skills
mcp-ref/      Bundled MCP registry
tests/        Unit, integration, and smoke tests
structure/    Architecture and contract documentation
```

The public repository has no required submodules or private-repository dependencies.

### Clone

```bash
git clone https://github.com/potatohoney-p/weasley-podex.git
cd weasley-podex
```

## Development

```bash
npm install          # dependencies
npm run dev          # dev server (tsx watch)
npm run build        # production build
npm test             # full test suite
npm run typecheck    # tsc --noEmit
```

## Pull Request

1. Fork `potatohoney-p/weasley-podex`
2. Create a feature branch
3. `npm run build && npm test` — 빌드 + 테스트 통과 확인
4. Submit PR

