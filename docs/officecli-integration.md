---
created: 2026-04-02
tags: [weasley-podex, officecli, docx-xlsx-pptx, smoke-test, CJK]
aliases: [OfficeCLI Integration, Weasley Podex OfficeCLI, officecli 연동]
---
# OfficeCLI 연동 가이드

> **On-Demand Model (since v2.1):** OfficeCLI is no longer installed during `npm install -g weasley-podex`.
> It is installed on-demand when a skill needs L1/L2 features or HWP support.
> Basic office document editing uses Python OOXML libraries as the primary path.
> Postinstall 제어: OfficeCLI는 v2.1+ on-demand 설치(`scripts/install-officecli.sh`). 기본값은 Apache-2.0 `iOfficeAI/OfficeCLI` 공개 릴리스이며, `OFFICECLI_REPO`로 신뢰하는 대체 소스를 지정할 수 있습니다 (`structure/infra.md` §환경변수).

OfficeCLI는 Weasley Podex에서 오피스 문서를 직접 다룰 때 쓰는 기본 런타임 도구이다. Word, Excel, PowerPoint 파일을 열고, 읽고, 수정하고, 검증하는 일을 하나의 바이너리로 처리한다. Microsoft Office를 따로 설치하지 않아도 된다.

이 통합이 중요한 이유는 에이전트가 문서 작업을 쉘 명령 한 번으로 끝낼 수 있기 때문이다. `.docx`, `.xlsx`, `.pptx`를 각각 다른 툴로 나누지 않아도 되고, `--json` 출력으로 결과를 바로 후속 자동화에 연결할 수 있다. smoke test까지 함께 두었기 때문에 “설치만 되었는가”가 아니라 “실제로 문서 편집이 되는가”를 바로 확인할 수 있다.

사용 흐름은 단순하다. `bash "$(npm root -g)/weasley-podex/scripts/install-officecli.sh"`로 전역 OfficeCLI를 준비한다. 그다음 `bash tests/smoke/test_officecli_integration.sh`를 실행해 12개 기본 시나리오를 검증한다. 이 smoke test는 `OFFICECLI_BIN`이 없으면 먼저 PATH의 `officecli`를 찾고, 그래도 없을 때만 저장소 안의 `officecli/bin/release/officecli-*` publish output을 찾는다. 마지막 호환 fallback으로만 기존 `officecli/build-local/officecli`를 사용한다. 다른 바이너리를 강제로 시험하고 싶으면 `OFFICECLI_BIN=/path/to/officecli bash tests/smoke/test_officecli_integration.sh`처럼 실행한다.

실무에서는 아래처럼 바로 시작하면 된다.

```bash
bash "$(npm root -g)/weasley-podex/scripts/install-officecli.sh"
officecli create report.docx
officecli add report.docx /body --type paragraph --prop text="분기 요약"
officecli view report.docx text
officecli validate report.docx
```

엑셀과 프레젠테이션도 같은 흐름이다. 셀 하나를 바꾸고 싶으면 `set`, 새 슬라이드를 넣고 싶으면 `add`, 구조를 JSON으로 받고 싶으면 `get --json`을 쓴다. 여러 편집을 한 번에 묶고 싶으면 `batch`에 JSON 배열을 넘기면 된다. CJK 또는 HWP 작업이 중요하면 최신 publish output을 명시적으로 지정하는 편이 안전하다.

자주 쓰는 호출 문장은 다음과 같다.

- `"officecli 설치해줘"`, `"install officecli"`, `"오피스 문서 툴 깔자"`
- `"DOCX 만들어"`, `"엑셀 값 넣어"`, `"PPT 슬라이드 추가해"`
- `"officecli smoke test 돌려"`, `"Run officecli smoke test"`, `"문서 통합 테스트 확인해"`

```mermaid
graph TD
    A["install-officecli.sh 실행"] --> B["officecli 바이너리 준비"]
    B --> C["smoke test 실행"]
    C --> D["DOCX XLSX PPTX roundtrip + HWP readiness 확인"]
    D --> E["skills 또는 쉘 명령에서 사용"]
```

```mermaid
sequenceDiagram
    participant User as 사용자
    participant Script as 설치 스크립트
    participant Binary as officecli
    participant Test as smoke test

    User->>Script: bash "$(npm root -g)/weasley-podex/scripts/install-officecli.sh"
    Script->>Binary: 플랫폼별 바이너리 다운로드
    User->>Test: bash tests/smoke/test_officecli_integration.sh
    Test->>Binary: create, add, set, validate, batch, get
    Binary-->>Test: 12개 시나리오 결과 반환
```

---

## 기술 참고

### 설치 명령

| 작업 | 명령 |
| --- | --- |
| Weasley Podex 글로벌 설치 | `npm install -g weasley-podex` |
| 기본 설치 (검증된 upstream) | `bash "$(npm root -g)/weasley-podex/scripts/install-officecli.sh"` |
| upstream 명시 (호환 옵션) | `bash "$(npm root -g)/weasley-podex/scripts/install-officecli.sh" --upstream` |
| 강제 재설치 | `bash "$(npm root -g)/weasley-podex/scripts/install-officecli.sh" --force` |
| 오래된 경우만 갱신 | `bash "$(npm root -g)/weasley-podex/scripts/install-officecli.sh" --update` |
| 커스텀 소스 | `OFFICECLI_REPO=other/repo bash "$(npm root -g)/weasley-podex/scripts/install-officecli.sh"` |
| 버전 확인 | `officecli --version` |
| smoke test | `bash tests/smoke/test_officecli_integration.sh` |
| 특정 바이너리 지정 테스트 | `OFFICECLI_BIN=/path/to/officecli bash tests/smoke/test_officecli_integration.sh` |

### 설치 스크립트 동작

| 항목 | 내용 |
| --- | --- |
| 대상 릴리스 | Apache-2.0 `iOfficeAI/OfficeCLI` latest release |
| upstream 명시 | `--upstream`은 현재 기본값을 명시하는 호환 플래그 |
| 소스 오버라이드 | `OFFICECLI_REPO=other/repo` 환경변수로 임의 소스 지정 |
| 우선순위 규칙 | `OFFICECLI_REPO`와 `--upstream`은 함께 쓰지 않는다 |
| 설치 위치 | `~/.local/bin/officecli` |
| HWP sidecar | 릴리스에 플랫폼별 `*-rhwp-field-bridge`, `*-rhwp-officecli-bridge` asset이 있으면 `officecli` 옆에 설치 |
| 지원 플랫폼 | macOS arm64/x64, Linux x64/arm64, Alpine musl 변형 |
| 재실행 처리 | 기본은 idempotent, `--update`는 오래된 경우만 갱신, `--force`는 무조건 재설치 |
| 검증 | 다운로드 후 실행 가능 여부 확인, checksum 항목이 있으면 mismatch 시 실패 |
| 설치 후 출력 | 설치된 버전과 실제 다운로드 소스를 함께 출력 |

HWP/rhwp 기능은 일반 OOXML 기능과 다르게 sidecar에 의해 operation-gated 된다. 설치 후 아래를 먼저 확인한다.

```bash
officecli hwp doctor --json
officecli capabilities --json
officecli hwp --json
```

`rhwp-field-bridge`가 있으면 `officecli create file.hwp --json`이 blank binary `.hwp` 생성 경로로 동작한다. `rhwp-officecli-bridge`와 `rhwp-field-bridge`가 함께 있고 API help에 `insert-text`, `export-pdf`, `dump-controls`, `native-op`가 노출되면 body text insertion, PDF/PNG/markdown/thumbnail/info/diagnostic export, table scan/cell read, editable conversion, and generic native rhwp operations도 capability-gated surface로 동작한다. sidecar가 없거나 너무 오래됐으면 명령이 몰래 `.hwpx`로 우회하지 않고 `hwp_create_dependency_missing`, `rhwp_api_missing_or_too_old`, 또는 capability blocked reason을 반환해야 한다.

### smoke test 12종

| 번호 | 항목 | 확인 내용 |
| --- | --- | --- |
| 1 | Binary availability | `officecli --version` 실행 가능 |
| 2 | DOCX roundtrip | create → add → view |
| 3 | XLSX roundtrip | create → set → view |
| 4 | PPTX roundtrip | create → add slide → outline |
| 5 | Validation | docx/xlsx/pptx validate |
| 6 | CJK roundtrip | 한글·일본어·중국어 문장 유지 |
| 7 | Batch operations | JSON batch 편집 적용 |
| 8 | JSON output | `get --json` 성공 응답 |
| 9 | HWP doctor/capabilities parity | `hwp doctor --json`과 `capabilities --json`의 operation readiness 일치 |
| 10 | HWP blank create contract | `create_blank` ready면 실제 `.hwp` 생성, 아니면 명시적 dependency error |
| 11 | HWP fixture read | read capability ready일 때 fixture text readback |
| 12 | HWP fixture mutation | mutation capability ready일 때 output-first mutation과 source hash 보존 |

### 빠른 명령 레퍼런스

| 작업 | 명령 |
| --- | --- |
| 빈 문서 생성 | `officecli create report.docx` |
| 본문 텍스트 보기 | `officecli view report.docx text` |
| PPT 개요 보기 | `officecli view report.pptx outline` |
| JSON 조회 | `officecli get report.docx /body --json` |
| 문단 추가 | `officecli add report.docx /body --type paragraph --prop text="..."` |
| 셀 값 변경 | `officecli set data.xlsx /Sheet1/A1 --prop value="42"` |
| 슬라이드 추가 | `officecli add deck.pptx / --type slide --prop title="Title"` |
| 선택자 조회 | `officecli query report.docx "paragraph[style=Heading1]"` |
| 문서 검증 | `officecli validate report.docx` |
| 배치 편집 | `officecli batch data.xlsx --json <<< '[...]'` |
| HWP readiness | `officecli hwp doctor --json` |
| HWP recipes | `officecli hwp --json` |
| 빈 HWP 생성 | `officecli create file.hwp --json` |
| HWP export/read | `officecli view file.hwp pdf --out out.pdf --json`; `officecli view file.hwp dump --json` |
| HWP native rhwp op | `officecli view file.hwp native --op get-style-list --json`; `officecli set file.hwp /native-op --prop op=split-paragraph --prop output=out.hwp --json` |

### upstream / custom source

기본 소스는 공개 상태와 Apache-2.0 라이선스를 확인한 `iOfficeAI/OfficeCLI`입니다. 조직 내부 포크처럼 사용자가 신뢰하는 다른 릴리스가 필요할 때만 `OFFICECLI_REPO=owner/repo`를 지정합니다. `--upstream`은 기존 자동화 호환을 위해 남아 있으며 현재 기본값과 동일합니다.

### 선택적 문서 워크플로우

아래 이름은 Weasley Podex의 8개 번들 스킬에 포함되지 않는다. 설치된 Codex
카탈로그나 사용자가 명시한 신뢰 저장소에서 가져온 경우에만 사용할 수 있으며,
OfficeCLI 자체는 위의 직접 명령으로 독립적으로 사용할 수 있다.

| 스킬 | 역할 |
| --- | --- |
| `docx` | Word 문서 생성/편집 (CJK·접근성 포함) |
| `xlsx` | Excel 시트 편집 (데이터 파이프라인·CJK·접근성 포함) |
| `pptx` | PowerPoint 슬라이드 생성 (CJK·접근성 포함) |
| `hwp` | HWP/HWPX 생성·편집, rhwp-backed binary HWP readiness gate |

가져온 스킬의 실제 위치와 설명은 `weasley-podex skill list` 및
`weasley-podex skill info <name>`으로 확인한다. 별도 CJK·접근성 규칙이
필요하면 가져온 카탈로그의 문서 또는 OfficeCLI 공식 문서를 따른다.

## 변경 기록

- 2026-05-15: HWP/rhwp doctor/capabilities parity, sidecar 설치, `.hwp create` 계약, HWP fixture smoke를 통합했다
- 2026-08-02: 비번들 문서 스킬과 존재하지 않는 공유 reference 경로를 명시적 선택 항목으로 정리했다
- 2026-04-02: narrative-first 구조와 frontmatter를 추가하고 smoke test의 바이너리 선택 규칙을 문서와 맞췄다

