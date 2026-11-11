# BEMSTATE

관심 단지의 **특정 평형** 호가 목록을 하루 두 번(한국 시간 00시 · 12시) 기록해 두는 페이지.
모양과 구조는 BEMTRIP(`bemrung2/sandbox`)을 따른다 — 빌드 없는 바닐라 JS, Vercel 함수, Supabase.

## 어디에 뭐가 있나

```
index.html · app.js   껍데기와 주소 (#/ 목록 · #/w/<id>/<기록> 단지 하나)
ui/                   BEMTRIP에서 가져온 부품 — 창 · 아이콘 · 알림 · 주소 · 테마
estate/               화면(screens) · 숫자 읽는 법(format) · 추이 그림(chart)
style/core.css        BEMTRIP의 토큰과 부품 그대로
style/estate.css      이 앱의 화면
api/watch.js          관심 목록과 기록 읽기 · 등록 · 해제
api/search.js         단지 검색 · 평형 목록 (편집자만)
api/collect.js        정해진 시각의 수집 (Vercel Cron이 부른다)
api/_data.js          저장소 — Supabase, 또는 로컬 파일
collect/run.js        수집 한 바퀴 · collect/zigbang.js 출처 하나
db/schema.sql         표 두 개: estate_watches · estate_snapshots
```

## 기록되는 것

- 관심 하나 = **단지 × 평형 × 거래(매매 · 전세)**.
- 기록 하나 = 그 반나절(`2026-11-11T00` · `…T12`)의 호가 목록 전체와 최저 · 중간 · 최고 · 건수.
  같은 반나절에 다시 수집하면 덮어쓴다(키가 `watch_id + slot`).
- 화면은 직전 기록과 견주어 **신규 · 가격 변동 · 빠진 매물**을 표시한다.
- 가격은 전부 만원.

## 출처

| 사이트 | 상태 | 메모 |
| --- | --- | --- |
| 직방 | **수집함** | 웹이 쓰는 주소(`apis.zigbang.com`)가 일반 요청에 응답한다. 매물이 '호' 단위로 묶여 와서 같은 집을 기록 사이에서 알아볼 수 있다. |
| 네이버 부동산 | 수집하지 않음 | 매물이 가장 많지만 공개 API가 없고, 자동 요청은 서버에서 끊는다(429 · 연결 종료). 차단을 피해 가며 긁는 코드는 넣지 않았다. |
| KB부동산 | 후보 | `api.kbland.kr`이 응답은 한다. 검색 · 매물 주소를 확인해 `collect/`에 출처를 하나 더하면 된다. |
| 다방 · 호갱노노 · 부동산R114 · 피터팬 · 아실 | 미확인 | 호갱노노는 직방 계열, 아실은 매물 증감 통계가 강점. |

출처를 더하려면 `collect/zigbang.js`와 같은 모양(`search` · `roomTypes` · `catalog`)의 파일을 만들고
`collect/run.js`의 `SOURCES`에 올린다. 공식 API가 아니므로 모양이 바뀌면 그 파일만 고친다.

## 내 컴퓨터에서

```bash
node dev.js
```

`http://localhost:3000` — 계정 없이 파일(`.estate-dev.json`)에 저장한다. 수집 한 번은 `node dev.js collect`.

## 배포 (Vercel + Supabase)

1. Supabase SQL Editor에 `db/schema.sql`을 붙여넣고 실행. BEMTRIP과 같은 프로젝트를 써도 된다.
2. Vercel 환경변수

   | 이름 | 값 |
   | --- | --- |
   | `SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` | Supabase 프로젝트 |
   | `CRON_SECRET` | 아무 긴 임의 문자열. 이게 있어야 정각 수집이 돈다 |
   | `KAKAO_REST_API_KEY` · `SESSION_SECRET` (· `KAKAO_CLIENT_SECRET`) | 카카오 로그인. Redirect URI는 `https://<도메인>/api/auth/callback` |
   | `EDITOR_IDS` | (선택) 등록 · 해제할 수 있는 카카오 id |

3. 보기는 누구나, 등록 · 해제는 로그인한 편집자만 (BEMTRIP과 같은 규칙). 로그인 설정 전에
   혼자 써 보려면 `EDIT_OPEN=1`.
4. 수집 시각은 `vercel.json`의 `crons` — UTC 15시 · 03시 = 한국 00시 · 12시.
   Hobby 요금제는 정각에서 최대 한 시간까지 늦게 돌 수 있다. 기록은 그 반나절의 것으로 남는다.
