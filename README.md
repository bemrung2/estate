# BEMESTATE

관심 단지의 **특정 평형** 호가 목록을 매일 낮 12시(한국 시간)에 기록해 두는 페이지.
직방과 네이버 부동산의 매물을 한 목록에 모으고, 국토교통부 실거래가를 곁에 둔다.
모양과 구조는 BEMTRIP(`bemrung2/sandbox`)을 따른다 — 빌드 없는 바닐라 JS, Vercel 함수, Supabase.

## 어디에 뭐가 있나

```
index.html · app.js   껍데기와 주소 (#/ 목록 · #/w/<id>/<날짜> 단지 하나)
ui/                   BEMTRIP에서 가져온 부품 — 창 · 아이콘 · 알림 · 주소 · 테마
estate/               화면(screens) · 숫자와 바깥 링크(format) · 호가 흐름 그림(chart)
style/core.css        BEMTRIP의 토큰과 부품 그대로
style/estate.css      이 앱의 화면
api/watch.js          관심 목록과 기록 읽기 · 등록 · 네이버 연결 · 해제
api/search.js         단지 검색 · 평형 목록 · 네이버 단지 찾기
api/collect.js        정해진 시각의 수집 (Vercel Cron이 부른다)
api/probe.js          이 서버가 직방 · 네이버에 닿는지 보는 주소
api/_data.js          저장소 — Supabase, 또는 로컬 파일
collect/run.js        수집 한 바퀴: 플랫폼별 매물을 한 기록으로 합친다
collect/zigbang.js    직방 · collect/naver.js 네이버 부동산 · collect/molit.js 실거래가
db/schema.sql         표 두 개: estate_watches · estate_snapshots
```

## 기록되는 것

- 관심 하나 = **단지 × 평형 × 거래(매매 · 전세)**. 단지와 평형은 직방의 번호로 잡고,
  네이버 부동산은 단지 번호와 면적(공급 · 전용)으로 같은 평형을 가려낸다.
- 기록 하나 = 그날(`2026-11-11`)의 호가 목록 전체와 최저 · 중간 · 최고 · 건수.
  매물마다 어느 플랫폼 것인지(`src`)가 붙고, 화면에서는 뱃지로 보인다. 누르면 그 플랫폼의 매물 화면으로 간다.
- 같은 날 다시 수집하면 **답한 플랫폼의 매물만** 바뀐다. 답하지 않은 플랫폼은 그날 먼저 받아둔 것이 남는다.
- 날짜 줄 맨 앞의 **현재**를 누르면 그 자리에서 플랫폼에 물어 지금 올라와 있는 호가를 보여준다 (기록하지는 않는다).
- 화면은 직전 기록과 견주어 **신규 · 가격 변동 · 빠진 매물**을 표시하고, 호가 흐름(최저–최고 범위,
  최저 · 중간 선, 실거래 점)을 한 그림에 그린다.
- 가격은 전부 만원.

## 무엇이 확인됐고 무엇이 아닌가

| 부분 | 상태 |
| --- | --- |
| 직방 매물 | **확인됨.** 실제 응답으로 검색 · 평형 · 수집을 돌려봤다. |
| 직방 매물 링크 | 확인 안 됨. `www.zigbang.com/home/apt/items/<번호>` 형식으로 만들지만 만든 환경에서는 직방 웹이 열리지 않았다. |
| 네이버 부동산 매물 | **확인 안 됨.** 미국 쪽 클라우드 서버의 연결은 네이버가 받지 않는다. 서울 리전에서 되는지는 `/api/probe`로 본다. |
| 실거래가 | 주소는 확인, 내용은 확인 안 됨. 인증키가 없어 실제 거래 목록은 받아보지 못했다. |
| 호갱노노 단추 | 단지 이름으로 찾은 화면(`hogangnono.com/search?q=…`)으로 간다. 호갱노노의 단지 번호는 알 수 없다. |

## 네이버 부동산

네이버는 공개 API가 없고, 해외 · 데이터센터에서 오는 연결을 받지 않는다 (미국의 클라우드 서버와
GitHub Actions 러너에서 일반 요청이 전부 끊기거나 타임아웃이었다). 차단을 속여 넘기는 장치
(브라우저 위장, 프록시 돌려쓰기)는 넣지 않았다. 대신:

1. **Vercel 함수를 서울 리전에서 돌린다** (`vercel.json`의 `"regions": ["icn1"]`). 막는 기준이 해외
   IP라면 이것으로 12시 수집과 '현재' 단추가 네이버까지 받는다.
2. **되는지는 주소 하나로 본다.** 배포한 뒤 브라우저로 연다:

   ```
   https://<도메인>/api/probe
   ```

   `naver.ok`가 `true`이고 `listings`가 0보다 크면 된 것이다. `naver_raw_first_item`에는 네이버가 준
   첫 매물이 그대로 찍힌다 — `collect/naver.js`는 실제 응답을 한 번도 받아보지 못하고 쓴 것이라,
   값이 이상하면 이 출력을 보고 그 파일을 고친다.
3. 서울 리전에서도 막히면, **네이버가 받아주는 컴퓨터**(집 PC 등)에서 같은 저장소에 대고 하루 한 번 돌린다.
   같은 날의 기록에 합쳐진다.

   ```bash
   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… MOLIT_SERVICE_KEY=… node dev.js collect
   ```

단지에 네이버를 잇는 법: 등록 창의 '네이버 부동산 단지' 칸, 또는 단지 화면의 **네이버 연결** 단추에
네이버 단지 주소를 붙여넣는다. 서버가 네이버에 닿으면 이름으로 찾아 미리 채워 준다.

## 실거래가

국토교통부 실거래가 공개 API를 쓴다. [공공데이터포털](https://www.data.go.kr)에서 아래 둘을 활용신청하고
받은 **일반 인증키(Decoding)** 를 `MOLIT_SERVICE_KEY`에 넣는다. 없으면 실거래가만 비고 나머지는 그대로 돈다.

- 국토교통부_아파트 매매 실거래가 상세 자료
- 국토교통부_아파트 전월세 실거래가 자료

수집할 때마다 최근 석 달을 받아 단지(법정동 + 지번)와 평형(전용 면적)으로 가려 쌓아 둔다.

## 내 컴퓨터에서

```bash
node dev.js
```

`http://localhost:3000` — 계정 없이 파일(`.estate-dev.json`)에 저장한다. `SUPABASE_URL`을 주면 진짜 저장소에 붙는다.

## 배포 (Vercel + Supabase)

1. Supabase SQL Editor에 `db/schema.sql`을 붙여넣고 실행. **전에 실행했더라도 다시 실행한다** — 새 칸이 더해지고,
   예전의 00시 기록이 지워진다.
2. Vercel → 프로젝트 → Settings → Environment Variables

   | 이름 | 값 |
   | --- | --- |
   | `SUPABASE_URL` | Supabase → Project Settings → API의 Project URL (`https://xxxx.supabase.co`) |
   | `SUPABASE_SERVICE_ROLE_KEY` | 같은 화면의 `service_role` 키 (`anon` 키가 아니다) |
   | `CRON_SECRET` | 아무 긴 임의 문자열 (`openssl rand -base64 32`). 없으면 12시 수집이 돌지 않는다 |
   | `MOLIT_SERVICE_KEY` | (선택) 공공데이터포털 인증키. 실거래가를 켠다 |

   넣은 뒤 다시 배포해야 적용된다.
3. 로그인은 없다. **주소를 아는 사람은 누구나 관심 단지를 등록 · 해제할 수 있다.**
4. 수집 시각은 `vercel.json`의 `crons` — UTC 03시 = 한국 낮 12시.
   Hobby 요금제는 정각에서 최대 한 시간까지 늦게 돌 수 있다.
