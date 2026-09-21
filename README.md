# 킹오더브라더스 그룹웨어 — 개발환경

시연본(`../소스/Index_ver1.0.html`)에서 **샘플 데이터를 모두 빼고**, GitHub · Supabase · Cloudflare 로 돌아가게 꾸린 소스입니다.
이 폴더가 **그룹웨어 GitHub 저장소의 루트**가 됩니다.

```
개발환경/
├─ index.html                 화면 전체 (그룹웨어 · 파트너센터 ?mode=partner · 운행일지 ?mode=mobile)
├─ config/
│   ├─ app-config.js          실행 환경 설정 — dev 값. Supabase URL · anon 키 · API 주소 (값이 갈리는 곳은 여기뿐)
│   └─ app-config.prod.example.js   prod 본보기 (배포 때 GitHub Secrets 로 채워짐)
├─ js/kob-store.js            저장소 부트스트랩 — Supabase(app_store) ↔ 로컬 폴백, 본체 실행
├─ js/kob-auth.js             로그인 · 비밀번호 — Supabase Auth ↔ 로컬 폴백 (4절)
├─ functions/api/[[route]].js 법인차량 API + 로그인 계정 관리 API (Cloudflare Pages Functions)
├─ supabase/schema.sql        Supabase 표 · RLS · Realtime
├─ sw.js · assets/ · image/   서비스 워커 · 아이콘 · 견적 템플릿 그림 · 로고
├─ tools/
│   ├─ strip-sample-data.js   시연본 → 개발환경 index.html 변환 (샘플 제거 · 저장소 치환)
│   └─ check-index.js         문법 · 샘플 흔적 검사 (npm run check)
├─ .github/workflows/deploy-pages.yml   develop → dev · main → prod 자동 배포
├─ wrangler.toml · package.json · .dev.vars.example · .gitignore
```

## 1. 무엇이 달라졌나 (시연본 대비)

| | 시연본 (`소스/`) | 개발환경 |
|---|---|---|
| 샘플 데이터 | 고객사 · 파트너사 · 계약 · 견적 · 업무 · 일정 · 프로젝트 · 협업티켓 · 인바운드 · 단가표 · 카드내역 · 차량 … 수백 건 | **전부 없음.** 사용자는 첫 로그인용 `admin` 하나 |
| 저장 | 브라우저 `localStorage` | `kobStorage` → **Supabase `app_store`** (설정이 비면 localStorage 로컬 모드) |
| 법인차량 API | `server.js` (Node · `data/*.json`) | **Cloudflare Pages Functions** → Supabase `vehicle_logs` · `vehicle_reservations` |
| 로그인 | 아이디만 (비밀번호 없음 · 데모 접두어) | **이메일 + 비밀번호** (Supabase Auth · 4절) |
| 환경 값 | 코드 곳곳 | `config/app-config.js` 한 곳 (dev / prod) |
| 배포 | 파일 복사 | GitHub push → Cloudflare Pages |

화면 코드 자체는 시연본과 같습니다. 시연본에서 기능을 고치면 `npm run rebuild-from-mockup` 으로 다시 뽑을 수 있습니다
(단, 개발환경 `index.html` 을 직접 고쳤다면 그 변경을 먼저 시연본에 반영해야 덮이지 않습니다 — 아래 "작업 흐름" 참고).

### 저장 방식 (1차)
화면은 지금까지 자료를 **키 하나 = JSON 하나**(`gwPartners.v1` · `gwPartnerIntakes.v1` · `gwInstallChecks.v1` …)로 저장해 왔습니다.
`js/kob-store.js` 가 이 키·값을 Supabase `app_store(key, value jsonb)` 표에 그대로 얹습니다.
- 부팅 때 표를 통째로 읽어 메모리에 두고, 쓰기는 300ms 모아 upsert. 로컬에도 사본을 남겨 오프라인·새로고침 직후에도 화면이 뜹니다.
- 다른 사람의 변경은 Realtime 으로 받아 화면이 이미 듣고 있는 `storage` 이벤트로 흘려보냅니다 → 창 간 동기화 코드가 그대로 동작합니다.
- 사람마다 다른 값(로그인 아이디 기억 · 화면 색 · 작성 중 임시저장)은 브라우저에만 둡니다.
- 화면마다 정식 표(고객사 · 계약 · 접수 …)로 쪼개는 것은 **2차**. 그때 `app_store` 값을 옮기면 됩니다.

## 2. 처음 한 번 — 환경 만들기

### 2-1. GitHub
**2026-09-21 연결 완료** — 저장소 `https://github.com/kingorderbros/Kingorder_groupware_Dev` (Private), 원격 이름 `origin`, `develop` 브랜치 push 됨.
당분간 **dev 만** 배포합니다. prod 는 이 개발환경에서 UAT 를 마친 최종본을 나중에 올립니다 (아래 "prod 를 켤 때").

처음 만들 때 한 것(기록용):
   ```bash
   cd 그룹웨어/개발환경
   git init -b main
   git add . && git commit -m "그룹웨어 개발환경 초기 소스"
   git remote add origin https://github.com/kingorderbros/Kingorder_groupware_Dev.git
   git checkout -b develop && git push -u origin develop
   ```
   `develop` = dev 배포. (`main` = prod 배포는 지금 꺼 두었습니다 — `.github/workflows/deploy-pages.yml` 의 `branches`)

### 2-2. Supabase (dev · prod 프로젝트 2개 — **지금은 dev 만**)
1. https://supabase.com 에서 프로젝트를 만듭니다 — `kingorder-groupware-dev` (리전 Northeast Asia · Seoul). **dev 는 2026-09-16 에 만들어 연결돼 있습니다.** prod(`kingorder-groupware`)는 UAT 뒤에 만듭니다.
2. SQL Editor 에 `supabase/schema.sql` → `schema-v2.sql` → `schema-v2-fix.sql` → `schema-v3.sql` → `schema-v4.sql` 을 **이 순서로** 붙여 넣고 Run. (dev 는 2026-09-17 까지 전부 실행됨. prod 를 만들 때 같은 순서로.)
3. Settings › API 에서 **Project URL** · **anon public** 키 · **service_role** 키를 적어 둡니다.
   - anon → 브라우저 설정 (`config/app-config.js` / GitHub Secrets `SUPABASE_ANON_KEY_*`)
   - service_role → **Cloudflare Pages 환경변수에만** (`SUPABASE_SERVICE_ROLE_KEY`). 코드·GitHub 에 넣지 않습니다.
4. **Authentication › URL Configuration** — 비밀번호 재설정 메일의 링크가 돌아올 주소입니다.
   - **Site URL**: 그 환경의 주소 (dev 는 `https://kingorder-groupware-dev.pages.dev`)
   - **Redirect URLs** 에 추가: `https://kingorder-groupware-dev.pages.dev/**` · 로컬 시험용 `http://localhost:8788/**`
5. **Authentication › Emails** — 기본 발송(Supabase 내장)은 **시간당 몇 통**으로 제한돼 시험용입니다.
   실제로 쓰려면 **SMTP Settings** 에 회사 메일(또는 Resend · SendGrid 등)을 넣습니다. 템플릿 **Reset Password** 의 문구는 여기서 한글로 고칠 수 있습니다.

### 2-3. Cloudflare Pages (프로젝트 2개 — **지금은 dev 만**)
1. Cloudflare 대시보드 › Workers & Pages › Create › Pages › **Direct Upload** 로 빈 프로젝트를 만듭니다 —
   `kingorder-groupware-dev` (prod 용 `kingorder-groupware` 는 UAT 뒤에). (GitHub Actions 가 올리므로 Git 연동은 켜지 않습니다)
2. 각 프로젝트 Settings › Environment variables (Production) 에:
   | 이름 | 값 |
   |---|---|
   | `SUPABASE_URL` | 그 환경의 Supabase URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | 그 환경의 service_role 키 (Encrypt) |
   | `KOB_ENV` | `dev` 또는 `prod` |
3. **사내만 접근** — Zero Trust › Access › Applications 에서 두 Pages 도메인을 등록하고 사내 이메일 도메인만 허용합니다.
   1차 RLS 가 anon 에게 열려 있으므로 이 문이 실제 보호막입니다. 파트너센터(`/?mode=partner`)를 사외에 열려면 그 경로는 Access 예외로 두고 2차(Supabase Auth)에서 RLS 를 좁힙니다.
4. My Profile › API Tokens 에서 **Cloudflare Pages: Edit** 권한 토큰을 만들고, Account ID 와 함께 GitHub Secrets 에 넣습니다.

### 2-4. GitHub Secrets (저장소 › Settings › Secrets and variables › Actions)
지금(dev 만) 필요한 4개: `CLOUDFLARE_API_TOKEN` · `CLOUDFLARE_ACCOUNT_ID` · `SUPABASE_URL_DEV` · `SUPABASE_ANON_KEY_DEV`
prod 를 켤 때 추가: `SUPABASE_URL_PROD` · `SUPABASE_ANON_KEY_PROD`

이제 `develop` 에 push 하면 dev 로 배포됩니다 (`.github/workflows/deploy-pages.yml`).

### prod 를 켤 때 (UAT 뒤)
1. 2-2 대로 Supabase `kingorder-groupware` 프로젝트 + SQL 5개 순서대로
2. 2-3 대로 Cloudflare Pages `kingorder-groupware` + 환경변수(`KOB_ENV`=`prod`)
3. GitHub Secrets 에 `SUPABASE_URL_PROD` · `SUPABASE_ANON_KEY_PROD`
4. `.github/workflows/deploy-pages.yml` 의 `branches: [develop]` → `[develop, main]`
5. `develop` 을 `main` 에 합쳐 push → prod 배포

## 3. 로컬에서 돌리기

```bash
npm install                       # wrangler
cp .dev.vars.example .dev.vars    # SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 채우기 (dev 프로젝트 값)
# config/app-config.js 에 dev 의 supabaseUrl · supabaseAnonKey 를 넣습니다 (비우면 로컬 저장소 모드)
npm run dev                       # http://localhost:8788  (/api/* 도 함께 동작)
```
- 그룹웨어 `http://localhost:8788/` · 파트너센터 `/?mode=partner` · 운행일지 `/?mode=mobile`
- 첫 로그인: 로그인 화면의 **[처음 설정 — 관리자 임시 비밀번호 만들기]** (4절). 로그인 뒤 **사용자/권한관리** 에서 실제 담당자를 등록합니다.
- 화면 왼쪽 아래 작은 표시가 `Supabase · dev` 인지 `로컬 저장소` 인지 알려 줍니다. 파트너센터 로그인 화면 아래 판 번호에도 환경 이름이 붙습니다.
- Supabase 모드에서 계정 만들기 · 비밀번호 초기화는 `/api/auth/*`(functions) 를 거치므로 **`.dev.vars` 가 있어야** 로컬에서도 됩니다.
  파일을 직접 열거나(file://) 정적 서버로만 띄우면 "서버(/api)에 연결하지 못했습니다" 가 나옵니다.

## 4. 로그인 · 비밀번호 (2026-09-16)

계정의 이름 · 소속 · 권한은 지금까지처럼 **사용자/권한관리**(`gwUsers.v1`) 에 있고, **비밀번호만 Supabase Auth** 가 맡습니다. 둘은 이메일로 이어집니다.
Supabase 설정이 비어 있으면(로컬 저장소 모드) 비밀번호를 브라우저에 SHA-256 으로 저장해 같은 흐름을 시험할 수 있습니다 — 단, 메일은 못 보냅니다.

| 언제 | 누가 | 어떻게 |
|---|---|---|
| **처음 한 번** (로그인 계정이 하나도 없을 때) | 관리자 | 로그인 화면에 **[처음 설정]** 버튼이 보입니다. 누르면 관리자 그룹 계정의 **임시 비밀번호**가 만들어집니다. 그걸로 로그인하면 새 비밀번호를 정하는 창이 뜹니다. |
| **계정 등록** | 관리자 | 사용자/권한관리 › 구성원 등록 → 저장하면 **임시 비밀번호 창**이 뜹니다. **이 창을 닫으면 다시 볼 수 없으니** 복사해 본인에게 전달합니다. |
| **첫 로그인** | 본인 | 이메일 + 임시 비밀번호로 로그인 → **새 비밀번호를 정해야** 화면으로 들어갑니다 (8자 이상, 영문 + 숫자). |
| **비밀번호 변경** | 본인 | 오른쪽 위 **[내 정보] › [비밀번호 변경]** — 현재 비밀번호를 확인한 뒤 바꿉니다. |
| **비밀번호를 잊음** | 본인 | 로그인 화면 **[비밀번호를 잊으셨나요?]** → 이메일 입력 → 메일의 링크를 누르면 새 비밀번호 창이 열립니다. (Supabase 모드만 · 2-2 의 4 · 5번 설정 필요) |
| **초기화** | 관리자 | 사용자/권한관리 목록의 **[초기화]** → 새 임시 비밀번호가 만들어집니다 (메일이 안 될 때 · 본인이 요청할 때). |

- 로그인 아이디는 **이메일**입니다 (`@company.com` 앞부분만 넣어도 됩니다). 시연본의 데모 접두어 로그인(`sales` · `ops` …)은 없습니다.
- 구성원의 이메일을 바꾸면 로그인 아이디도 함께 바뀌고, 구성원을 지우면 로그인 계정도 지워집니다.
- 계정 만들기 · 초기화 · 삭제는 **관리자 그룹**으로 로그인한 사람만 됩니다 (서버가 로그인 토큰으로 확인).
- 파트너센터 아이디(사외)는 이 절과 무관하게 전처럼 **파트너 ID 관리**에서 비밀번호를 직접 넣습니다.

## 5. 작업 흐름

- **기능 개발은 이 폴더에서** 합니다 (`index.html` 직접 수정 → `npm run check` → develop 에 push).
- 시연본(`../소스`)은 발표·시연용 샘플 데이터본으로 남겨 둡니다. 시연본을 고친 것을 이쪽에 가져오려면
  `npm run rebuild-from-mockup` 을 돌리는데, 이 명령은 **개발환경 index.html 을 덮어씁니다** — 개발환경에만 있는 변경이 있으면 먼저 시연본에 옮기세요.
  2026-09-16 부터 개발환경에만 있는 기능(로그인 비밀번호 등)이 있어 **스크립트가 스스로 멈춥니다** (`--force` 를 붙여야 덮어씀).
  (두 갈래를 오래 함께 가져가지는 마세요. 개발환경이 자리 잡았으니 시연본은 보관용으로 두고 이쪽만 고치는 편이 안전합니다.)
- 스키마를 바꾸면 `supabase/schema.sql` 을 고치고 dev → prod 순서로 SQL Editor 에서 실행합니다.
- 화면 판(`PC_BUILD`)은 파트너센터 화면 아래에 보입니다. 배포 뒤 옛 화면이 보이면 서비스 워커 캐시(`sw.js` 의 `CACHE` 이름)를 올립니다.

## 6. 다음 단계 (2차)
1. ~~Supabase Auth 로 로그인 교체~~ (2026-09-16 완료) → `app_store` RLS 를 `authenticated` 로 좁히고, 파트너센터 계정을 Auth 사용자로.
2. `app_store` 의 큰 값(접수 첨부 · 설치사진 dataURL)을 **Supabase Storage** 로.
3. 자주 조회·검색하는 자료(고객사 · 접수 · 계약)부터 정식 표로 분리.
