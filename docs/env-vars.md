# 환경변수 가이드

Weasley Podex에서 사용하는 주요 환경변수. **전체 목록·사용처**는 `structure/infra.md` §환경변수가 source of truth다. 이 문서는 자주 쓰는 변수와 운영 팁을 **curated**로 정리한다. 제품 전용 설정은 `WEASLEY_PODEX_*` 이름을 사용한다.

---

## 서버 / 포트

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `PORT` | `3457` | 서버 포트. CDP 포트는 `PORT + 5783`으로 자동 파생 |
| `WEASLEY_PODEX_HOME` | `~/.weasley/podex` | 설정, DB, 프로필 등 데이터 루트 경로 |

> 기존 `~/.podex` 데이터는 새 기본 홈으로 복사 마이그레이션할 수 있다.

## 브라우저

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `CHROME_NO_SANDBOX` | *(미설정)* | `1`로 설정 시 `--no-sandbox` 플래그 추가. Docker/CI에서 Chromium sandbox가 실패할 때만 사용 |

> [!CAUTION]
> `CHROME_NO_SANDBOX=1`은 보안상 필요한 경우에만 설정하세요.
> 기본값은 sandbox ON이며, 컨테이너 환경에서도 자동으로 끄지 않습니다.

## 텔레그램

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `TELEGRAM_TOKEN` | *(미설정)* | 텔레그램 봇 토큰. `settings.json`의 `telegram.token`보다 우선 |
| `TELEGRAM_ALLOWED_CHAT_IDS` | *(미설정)* | 허용된 채팅 ID (쉼표 구분) |
| `WEASLEY_PODEX_HUB_CALLBACK_URL` | *(미설정)* | Telegram Hub member outbound callback override (loopback HTTP only) |

## Manager dashboard

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `DASHBOARD_PORT` | `24576` | Manager server 포트 |
| `WEASLEY_PODEX_DASHBOARD_OPEN` | *(미설정)* | `1`이면 `weasley-podex dashboard serve` 후 브라우저 오픈 |

## 프롬프트 / 훅

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `WEASLEY_PODEX_PRE_PROMPT_HOOKS` | *(enabled)* | `0`이면 pre-prompt context hooks 비활성화 |

## 인증 / 보안

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `WEASLEY_PODEX_AUTH_TOKEN` | *(미설정)* | loopback 외 REST API bearer token |
| `WEASLEY_PODEX_BOSS_TOKEN` | *(미설정)* | boss-only employee dispatch token |
| `WEASLEY_PODEX_EMPLOYEE_MODE` | *(미설정)* | employee 내부 dispatch 차단 |
| `HOST` | *(미설정)* | `weasley-podex serve` child에 전달되는 bind host |
| `WEASLEY_PODEX_OPEN_BROWSER` | *(미설정)* | `1`이면 serve 후 브라우저 오픈 |
| `WEASLEY_PODEX_LAN_MODE` | *(미설정)* | LAN host/origin bypass |
| `WEASLEY_PODEX_REMOTE_ACCESS_MODE` | *(미설정)* | `--remote` 시 `direct` 주입 |
| `WEASLEY_PODEX_TRUST_PROXY` | *(미설정)* | Express trust proxy |
| `WEASLEY_PODEX_TRUST_FORWARDED` | *(미설정)* | forwarded host/proto 신뢰 |

## Discord

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `DISCORD_TOKEN` | *(미설정)* | Discord bot token (`settings.json` override) |
| `DISCORD_GUILD_ID` | *(미설정)* | 허용 guild ID |
| `DISCORD_CHANNEL_IDS` | *(미설정)* | 허용 channel ID (쉼표 구분) |

## Dashboard scan / OfficeCLI

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `DASHBOARD_SCAN_FROM` | *(미설정)* | manager instance scan 시작 포트 |
| `DASHBOARD_SCAN_COUNT` | *(미설정)* | scan 포트 개수 |
| `OFFICECLI_REPO` | *(미설정)* | `scripts/install-officecli.sh` 소스 repo override (`iOfficeAI/OfficeCLI` 기본) |
| `WEASLEY_PODEX_SKILLS_REPO` | *(미설정)* | 명시적으로 신뢰한 원격 스킬 저장소 override; 미설정 시 npm에 포함된 핵심 카탈로그 사용 |
| `WEASLEY_PODEX_MCP_REGISTRY_URL` | *(미설정)* | 명시적으로 신뢰한 원격 MCP 카탈로그 override; 미설정/실패 시 bundled registry 사용 |
| `WEASLEY_PODEX_SAFE` | *(미설정)* | `1`/`true`이면 postinstall이 홈 디렉터리 생성만 수행 |
| `WEASLEY_PODEX_INSTALL_CLI_TOOLS` | *(미설정)* | `1`/`true`이면 postinstall에서 선택 AI CLI도 설치 |
| `WEASLEY_PODEX_SKIP_CLAUDE` | *(미설정)* | `1`/`true`이면 기본 Claude CLI 설치를 건너뜀 |

## 디버깅

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `DEBUG` | *(미설정)* | 설정 시 ACP 통신, 에이전트 스폰 등 상세 로그 출력 |
| `LOG_LEVEL` | `info` | 로그 레벨: `debug`, `info`, `warn`, `error` |

