# Jekyll 블로그 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스펙(docs/superpowers/specs/2026-09-21-blog-design.md)의 V1 미니멀 디자인대로 Jekyll 블로그를 만들어 ppaangss.github.io에 배포한다.

**Architecture:** GitHub Pages 네이티브 Jekyll 빌드(로컬 Ruby 불필요, push만으로 배포). 레이아웃 2개(default/post) + CSS 1파일 + 페이지 3개 + 샘플 글 1편. 다크모드는 CSS 변수 + `prefers-color-scheme`.

**Tech Stack:** Jekyll(GitHub Pages 내장), Pretendard Variable(jsdelivr CDN), JetBrains Mono(Google Fonts), jekyll-seo-tag/feed/sitemap(GH Pages 화이트리스트 플러그인)

## Global Constraints

- 사이트명(로고): `ppaangss.dev`
- 본문 폭 680px 중앙 정렬, 미니멀 텍스트 중심
- 라이트: bg `#FFFFFF`, 본문 `#1A1A1A`, 보조 `#8A8A8A`, 흐림 `#B5B5B5`, 선 `#EBEBEB`, 코드 `#F6F6F6`
- 다크: bg `#131316`, 본문 `#ECECEF`, 보조 `#9A9AA5`, 흐림 `#606068`, 선 `#26262E`, 코드 `#1D1D24`
- 홈 소개는 1줄: "공부한 것을 기록하고 커리어를 정리하는 공간입니다."
- 최근 글 목록: 왼쪽 썸네일 128×96(4:3, radius 6), 행 왼쪽 패딩 12px, `image:` 프론트매터 없으면 카테고리 기본(그라데이션) 썸네일
- About 페이지는 자리만: 본문 "준비중입니다."
- 검증: 로컬 jekyll 없으면 push 후 GitHub Pages 빌드 + `curl https://ppaangss.github.io`로 확인

---

### Task 1: Jekyll 기본 구조

**Files:**
- Create: `_config.yml`, `.gitignore`

- [ ] `_config.yml` 작성 (title/description/url, permalink `/posts/:title/`, plugins seo-tag·feed·sitemap, posts 기본 layout post, `docs/` exclude)
- [ ] `.gitignore` 작성 (`_site/`, `.jekyll-cache/`, `.DS_Store`)
- [ ] Commit: `feat: Jekyll 기본 설정`

### Task 2: 레이아웃

**Files:**
- Create: `_layouts/default.html`, `_layouts/post.html`

**Interfaces:**
- Produces: `default` 레이아웃(헤더 로고 ppaangss.dev + Posts/About 내비, 푸터 © · GitHub · Email), `post` 레이아웃(meta: 카테고리·날짜 → h1 → 본문)

- [ ] `default.html`: head(seo, Pretendard CDN, JetBrains Mono, main.css, feed_meta) + `.wrap` 컨테이너 + header/main/footer
- [ ] `post.html`: default 상속, `.post-meta`(카테고리 · YYYY.MM.DD) → `.post-title` → `.post-body`
- [ ] Commit: `feat: default/post 레이아웃`

### Task 3: 스타일

**Files:**
- Create: `assets/css/main.css`

- [ ] CSS 변수(:root 라이트, `@media (prefers-color-scheme: dark)` 다크 오버라이드), 리셋, `.wrap` 680px
- [ ] 헤더/푸터, 히어로, 섹션 라벨(mono, letter-spacing), 글 목록 행(썸네일 128×96 + 제목/카테고리 + 날짜, border-bottom, padding 18px 0 18px 12px), 카테고리 폴백 썸네일 그라데이션
- [ ] 글 본문 타이포(제목·소제목·문단·코드블록·인용·리스트), rouge 하이라이팅 색
- [ ] Commit: `feat: 메인 스타일시트`

### Task 4: 페이지

**Files:**
- Create: `index.html`, `posts.html`, `about.md`

**Interfaces:**
- Consumes: Task 2 레이아웃, Task 3 클래스명(`.post-list`, `.row`, `.thumb`, `.label` 등)

- [ ] `index.html`: 히어로(인사말 + 소개 1줄) + RECENT POSTS(최근 5편, 썸네일 행) + 전체 보기 링크
- [ ] `posts.html` (permalink `/posts/`): 카테고리별 그룹 목록
- [ ] `about.md` (permalink `/about/`): 제목 About + 본문 "준비중입니다."
- [ ] Commit: `feat: 홈/목록/About 페이지`

### Task 5: 샘플 글

**Files:**
- Create: `_posts/2026-09-21-tcp-3way-handshake.md`

- [ ] 카테고리 `네트워크`, 이미지 없음(폴백 썸네일 확인용), 본문에 문단·소제목·코드블록 포함
- [ ] Commit: `feat: 샘플 글 1편`

### Task 6: 배포 및 검증

- [ ] 로컬 jekyll 유무 확인 (`jekyll -v` 또는 `gem list`), 있으면 `jekyll build`로 사전 검증
- [ ] `git push origin main`
- [ ] GitHub Pages 빌드 완료 대기 후 `curl -s https://ppaangss.github.io` 로 홈 HTML 확인 (로고 ppaangss.dev, 샘플 글 제목 노출)
- [ ] `/posts/`, `/about/`, 샘플 글 페이지 각각 curl로 200 + 핵심 텍스트 확인 ("준비중입니다." 포함)
