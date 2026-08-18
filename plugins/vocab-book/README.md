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

- `scripts/vocab_book.py` — **이 파일 하나가 전부다.** `pdf` / `web` / `push` 세 명령을 갖고 있고,
  사용법과 JSON 형식이 파일 맨 위 주석에 들어 있다. 플러그인 없이 파일만 복사해도 동작한다.
- `skills/vocab-book/SKILL.md` — Claude가 따라갈 워크플로
- `examples/unit7.json` — 예시 데이터

## 클로드 데스크탑에서 쓰기

데스크탑에는 Chrome 헤드리스가 없어 PDF를 직접 못 만든다. 대신 스킬을 올려 두고
아티팩트로 만든 뒤 인쇄 → "PDF로 저장" 한다.

1. `desktop/vocab-book-desktop.zip` 을 내려받는다.
2. 설정 → 기능(Capabilities) → 스킬 → 업로드.
3. 이후 아무 대화에서나 교재 사진을 올리고 "단어장 만들어줘" 라고 하면 된다.
4. 만들어진 아티팩트에서 ⋯ → 인쇄 → 대상 "PDF로 저장" (A4 세로, 배경 그래픽 켜기).

PDF 디자인은 Claude Code에서 만든 것과 같은 CSS를 쓴다.

## 파일 하나만 옮겨 쓰기

`scripts/vocab_book.py`만 복사해 두고 Claude에게 "이 파일 읽고 단어장 만들어줘"라고 해도 된다.
플러그인 설치, 마켓플레이스 등록 없이 그대로 동작한다.

## 요구 사항

Python 3, Chrome 또는 Edge, git. PDF 변환에 쓸 브라우저를 못 찾으면 `CHROME_PATH`로 지정한다.
