# BEMESTATE

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
api/search.js         단지 검색 · 평형 목록
api/collect.js        정해진 시각의 수집 (Vercel Cron이 부른다)
api/_data.js          저장소 — Supabase, 또는 로컬 파일
collect/run.js        수집 한 바퀴 · collect/zigbang.js · collect/naver.js 출처
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
| 직방 | **수집함 · 확인됨** | 웹이 쓰는 주소(`apis.zigbang.com`)가 일반 요청에 응답한다. 이름으로 단지를 찾는다. |
| 네이버 부동산 | **수집기 있음 · 확인 안 됨** | 클라우드 서버(Vercel 포함)의 연결은 네이버가 받지 않는다. 아래 '네이버 부동산' 참고. |
| KB부동산 | 후보 | `api.kbland.kr`이 응답은 한다. 검색 · 매물 주소를 확인해 출처를 하나 더하면 된다. |
| 다방 · 호갱노노 · 부동산R114 · 피터팬 · 아실 | 미확인 | |

출처를 더하려면 `collect/zigbang.js`와 같은 모양(`search` · `roomTypes` · `catalog`)의 파일을 만들고
`collect/run.js`의 `SOURCES`에 올린다. 공식 API가 아니므로 모양이 바뀌면 그 파일만 고친다.

## 네이버 부동산

네이버는 공개 API가 없고, 데이터센터에서 오는 연결을 받자마자 끊는다. 그래서 Vercel의 정각 수집은
직방만 기록하고 네이버 관심 단지는 실패로 남는다. 네이버는 **네이버가 받아주는 컴퓨터**(집 PC 등)에서
같은 저장소에 대고 수집을 돌려야 한다.

1. 그 컴퓨터에서 먼저 되는지 본다 (단지 번호는 네이버 부동산 단지 주소 끝의 숫자).

   ```bash
   node dev.js probe naver 111515
   ```

   평형과 매물이 찍히면 된 것이다. `collect/naver.js`는 실제 응답을 한 번도 받아보지 못하고 쓴
   것이라, 실패하거나 값이 이상하면 그 파일을 고쳐야 한다.
2. 관심 단지를 등록한다. 등록 창에서 출처를 '네이버 부동산'으로 고르고 단지 주소를 붙여넣는다.
   배포된 사이트에서는 평형을 불러오지 못하므로, 그 컴퓨터에서 Supabase에 붙여 띄운 화면에서 한다.

   ```bash
   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node dev.js
   ```

3. 하루 두 번 수집을 예약한다 (cron · 작업 스케줄러, 00:05 · 12:05).

   ```bash
   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node dev.js collect
   ```

   같은 반나절에 Vercel과 겹쳐 돌아도 덮어쓸 뿐이다.

요청은 꾸밈없이 보낸다. 브라우저인 척하거나 차단을 피해 가는 장치는 넣지 않았다.

## 내 컴퓨터에서

```bash
node dev.js
```

`http://localhost:3000` — 계정 없이 파일(`.estate-dev.json`)에 저장한다. 수집 한 번은 `node dev.js collect`.

## 배포 (Vercel + Supabase)

1. Supabase SQL Editor에 `db/schema.sql`을 붙여넣고 실행. BEMTRIP과 같은 프로젝트를 써도 된다.
2. Vercel → 프로젝트 → Settings → Environment Variables

   | 이름 | 값 |
   | --- | --- |
   | `SUPABASE_URL` | Supabase → Project Settings → API의 Project URL (`https://xxxx.supabase.co`) |
   | `SUPABASE_SERVICE_ROLE_KEY` | 같은 화면의 `service_role` 키 (`anon` 키가 아니다) |
   | `CRON_SECRET` | 아무 긴 임의 문자열 (`openssl rand -base64 32`). 없으면 정각 수집이 돌지 않는다 |

   넣은 뒤 다시 배포해야 적용된다.
3. 로그인은 없다. **주소를 아는 사람은 누구나 관심 단지를 등록 · 해제할 수 있다.**
4. 수집 시각은 `vercel.json`의 `crons` — UTC 15시 · 03시 = 한국 00시 · 12시.
   Hobby 요금제는 정각에서 최대 한 시간까지 늦게 돌 수 있다. 기록은 그 반나절의 것으로 남는다.
