# vocab-book

교재 사진 → 영어 단어·숙어장 PDF(굿노트용 A4) → presentations 사이트 게시까지의 작업을 재현 가능하게 묶은 Claude Code 플러그인.

## 설치

```
/plugin marketplace add GuitaruMan/presentations
/plugin install vocab-book@guitaruman-plugins
```

## 사용

```
/vocab-book ForStudy/Study_Docs/주현1.jpg ForStudy/Study_Docs/주현2.jpg
```

또는 그냥 "이 사진으로 단어장 만들어줘"라고 말하면 스킬이 자동으로 걸린다.

## 구성

- `skills/vocab-book/SKILL.md` — 워크플로, JSON 스키마, 흔한 실수
- `scripts/make_pdf.py` — JSON → A4 PDF (헤드리스 Chrome/Edge 사용, 외부 패키지 없음)
- `scripts/make_web.py` — JSON → 사이트용 HTML(다크모드 대응, 뜻 가리기 토글)
- `scripts/publish.py` — 가정용 카테고리에 파일 복사 + 목록 링크 추가 + push

## 스크립트 직접 실행

설치 경로는 `~/.claude/plugins/cache/guitaruman-plugins/vocab-book/<버전>/`.
정확한 경로는 `~/.claude/plugins/installed_plugins.json`의 `vocab-book@guitaruman-plugins` → `installPath`.

## 요구 사항

Python 3, Chrome 또는 Edge, git. PDF 변환에 쓸 브라우저를 못 찾으면 `CHROME_PATH`로 지정한다.
