# ─── Weasley Podex Docker image (npm release) ───────────
FROM node:22-slim

# 시스템 Chromium + better-sqlite3 빌드 deps + curl (uv 설치용)
# findChrome()이 /usr/bin/chromium 탐지 → Playwright 캐시 경로 불필요
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    chromium \
    curl \
    && rm -rf /var/lib/apt/lists/*

# non-root 사용자 (Chromium sandbox 정상 동작 보장)
RUN groupadd -r weasley && useradd -r -g weasley -m weasley

# Install Weasley Podex with its primary data home configured before postinstall.
ENV WEASLEY_PODEX_HOME=/home/weasley/.weasley/podex
ARG WEASLEY_PODEX_VERSION=latest
RUN npm install -g weasley-podex@${WEASLEY_PODEX_VERSION}

# 빌드 시 기능 가드 — /api/health 엔드포인트가 있는 버전인지 확인
RUN node -e "const s=require('fs').readFileSync(require.resolve('weasley-podex/dist/server.js'),'utf8'); if(!s.includes('/api/health')) { console.error('ERROR: weasley-podex@'+require('weasley-podex/package.json').version+' does not include /api/health. Minimum required version not met.'); process.exit(1); }"

# 런타임 — CHROME_NO_SANDBOX 의도적 미설정 (sandbox 기본 유지)
ENV PORT=3457
RUN chown -R weasley:weasley /home/weasley/.weasley
USER weasley
EXPOSE 3457

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD node -e "fetch('http://localhost:3457/api/health').then(r=>{if(!r.ok)throw 1})" || exit 1

ENTRYPOINT ["weasley-podex", "serve", "--no-open"]

