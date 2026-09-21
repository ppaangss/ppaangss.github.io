# ppaangss.github.io — 공부 기록 + 커리어 블로그 설계

날짜: 2026-09-21
상태: 디자인 확정 (Pencil 시안: `~/Textfiles/깃허브페이지` — V1 Home/Post/About + Dark 3종)

## 목적

- 공부한 것을 마크다운 글로 기록하고, 커리어를 정리하는 개인 사이트
- GitHub Pages 유저 사이트로 배포: https://ppaangss.github.io

## 확정 사항

### 스택
- **Jekyll** (GitHub Pages 네이티브 빌드 — CI 설정·로컬 Ruby 없이 push만으로 배포)
- 글 작성: `_posts/YYYY-MM-DD-slug.md` 커밋 → 자동 배포
- 프론트매터: `title`, `categories` 최소한만

### 페이지
- `/` 홈 — 인사말 + 소개 2줄 + RECENT POSTS 목록(제목·카테고리·날짜, 얇은 구분선) + 푸터
- `/posts/` — 전체 글 목록 (카테고리 구분)
- `/about/` — 커리어/이력 (이번엔 틀만, 내용은 추후)
- 글 페이지 — 카테고리·날짜 메타 → 제목 → 본문, 코드 블록 하이라이팅

### 디자인 (Pencil V1 시안 기준)
- 미니멀 텍스트 중심. 본문 폭 680px 중앙 정렬, 장식 없음
- 사이트명(로고): **ppaangss.dev** (모노스페이스, 볼드)
- 폰트: 본문 Pretendard(웹폰트), 날짜·라벨·로고 JetBrains Mono
- 라이트 팔레트: bg `#FFFFFF`, 본문 `#1A1A1A`, 보조 `#8A8A8A`, 흐림 `#B5B5B5`, 선 `#EBEBEB`, 코드 `#F6F6F6`
- 다크 팔레트: bg `#131316`, 본문 `#ECECEF`, 보조 `#9A9AA5`, 흐림 `#606068`, 선 `#26262E`, 코드 `#1D1D24`
- 다크모드: CSS 변수 + `prefers-color-scheme` 자동 전환
- 섹션 라벨(RECENT POSTS 등): 모노스페이스, letter-spacing 넓게, 흐림색

### 이번 범위
- 위 틀 전체 + 샘플 글 1편 + 배포까지
- 기존 공부 노트 이전, About 내용 채우기는 다음 작업

## 검토한 대안 (기각)
- V2 터미널 / V5 Ghostty / V6 내 터미널 재현 / V3 에디토리얼 / V4 블루프린트 / V7 노트 / V8 indieblog풍 괘선 배경 — 시안 비교 후 V1 미니멀로 확정
- 생성기 대안: Astro·Hugo — GitHub Actions 설정이 필요해 Jekyll 대비 복잡, 기각

## 참고
- `ppaangss.dev` 커스텀 도메인은 추후 구입·연결 가능 (CNAME + DNS 설정)
