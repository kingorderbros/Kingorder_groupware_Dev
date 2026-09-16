# 변경 이력 (개발환경)

## 2026-09-16 — 초기 구성
- 목업 `소스/Index_ver1.0.html`(판 2026-09-16.22)에서 샘플 데이터 제거 → `index.html`
- 저장소: `kobStorage` → Supabase `app_store` (로컬 폴백) · `js/kob-store.js`
- 법인차량 API: `server.js` → Cloudflare Pages Functions (`functions/api/[[route]].js`) + Supabase `vehicle_logs` · `vehicle_reservations`
- 설정 한 곳: `config/app-config.js` (dev) · prod 본보기
- 배포: GitHub Actions → Cloudflare Pages (develop → dev, main → prod)
- 검증: 헤드리스로 로컬 모드 · (가짜) Supabase 모드 모두 — 관리자 로그인 · 메뉴 79개 · 전 탭 · 파트너사/아이디 등록 · 저장 확인, 오류 0. Functions 는 REST 목으로 예약 · 충돌 · 승인 · 운행일지 등록/완료 확인

## 2026-09-16 — 조직도에서 초기 관리자 제외
- 초기 관리자 계정(`admin`, dept `admin`)이 조직도에 사람으로 나오고 "admin 1명" 부서 카드까지 생기던 것 수정 — `ORG_HIDDEN_DEPTS` 에 `admin` 추가 (`index.html` · `tools/strip-sample-data.js` 양쪽)
- 사용자/권한관리 목록에는 그대로 나오므로 거기서 실제 담당자 등록 후 고치거나 지움

## 2026-09-16 — 로그인 비밀번호 (Supabase Auth)
- **계정에 비밀번호** — 로그인은 이메일 + 비밀번호. 목업의 데모 접두어 로그인(sales · ops …)과 테스트 계정 안내 제거
- **계정 등록 → 임시 비밀번호** 자동 발급(영문+숫자 10자) → 임시 비밀번호 창(복사 · 한 번만 표시). 사용자 목록에 **[초기화]** 열 추가
- **첫 로그인 강제 변경** — 임시 비밀번호로 들어오면 새 비밀번호(8자 이상 · 영문+숫자)를 정해야 화면 진입
- **비밀번호 재설정 메일** — 로그인 화면 [비밀번호를 잊으셨나요?] → Supabase 가 메일 발송 → 링크로 돌아오면 새 비밀번호 창
- **[내 정보] › 비밀번호 변경** (현재 비밀번호 확인)
- **처음 설정** — 로그인 계정이 하나도 없으면 로그인 화면에 관리자 임시 비밀번호 만들기 버튼
- 구성원 이메일 변경 → 로그인 아이디도 변경 · 구성원 삭제 → 로그인 계정도 삭제 · 로그아웃 → 세션 종료
- 새 파일 `js/kob-auth.js` (Supabase Auth ↔ 로컬 SHA-256 폴백). functions 에 `/api/auth/status · bootstrap · users(POST/PATCH/DELETE)` — 관리자 그룹 토큰 확인
- `tools/strip-sample-data.js` — 개발환경 전용 기능이 있으면 덮어쓰기 전에 멈춤(`--force`)
- 검증: 로컬 모드 헤드리스 32항목(처음 설정 · 틀린 비밀번호 · 강제 변경 · 규칙 검사 · 변경 · 등록 → 발급 · 초기화 · 삭제 · 새로고침 유지) 통과.
  functions 는 GoTrue 목으로 17항목(권한 · 생성 · 초기화 · 이메일 변경 · 삭제 · 거부 사유) 확인. 실제 Supabase 는 틀린 비밀번호 거부만 확인(쓰기 없음)
- **해야 할 것 (Supabase 대시보드)**: Authentication › URL Configuration 에 Redirect URL 등록, Emails › SMTP 설정 (README 2-2 의 4 · 5)
