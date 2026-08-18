---
name: vocab-book
description: Use when the user wants an English vocabulary/idiom study book (단어장, 숙어장) built from textbook photos, scans, or a word list — especially for GoodNotes on iPad, elementary/middle school learners, or publishing to the presentations site.
---

# 영어 단어 · 숙어장 만들기

교재 사진이나 단어 목록에서 단어/숙어를 뽑아 굿노트용 A4 PDF와 웹 페이지를 만들고,
`GuitaruMan/presentations` 사이트의 가정용 카테고리에 게시한다.

**핵심 원칙:** 단어 선정은 사람이 판단하고(내가 한다), 조판·PDF 변환·게시는 스크립트가 한다.
JSON 하나만 정확히 쓰면 나머지는 재현된다.

## 워크플로

1. **원문 읽기** — Read 도구로 교재 이미지를 읽는다. 사진이 회전돼 있어도 그대로 읽힌다.
2. **항목 뽑기** — 본문에 실제로 나온 단어/숙어만 고른다. 학습자 학년에 맞춰 뜻은 짧게,
   예문은 본문 문장을 그대로 쓰거나 더 짧게 다듬는다.
3. **JSON 작성** — 아래 스키마대로 `vocab.json`을 쓴다. **한 그룹(day)당 최대 12개** —
   넘으면 PDF 한 쪽에서 잘리므로 스크립트가 에러를 낸다.
4. **PDF 생성** — `python scripts/make_pdf.py vocab.json 출력.pdf`
5. **분량 확인** — 생성된 PDF 쪽수를 확인하고, 사용자가 정한 상한(보통 4~6쪽)을 넘으면
   항목 수를 줄인다. 다 담으려 하지 말고 핵심만 남긴다.
6. **웹 페이지 생성** (게시할 때만) — `python scripts/make_web.py ...`
7. **게시** (사용자가 요청할 때만) — `python scripts/publish.py ...`

## JSON 스키마

```json
{
  "unit": "Unit 7",
  "title": "My Favorite Gadget is My Cell Phone",
  "page_title": "화상영어 Unit 7 단어 · 숙어장",
  "emoji": "📱",
  "cover_title": "영어 단어 · 숙어장",
  "subtitle": "꼭 필요한 것만 골랐어요. 3일이면 끝!",
  "running_title": "Unit 7 · My Favorite Gadget",
  "days": [
    { "tag": "Day 1", "subtitle": "꼭 알아야 할 단어 ①", "color": "#F79FBF",
      "words": [ { "word": "notice", "pron": "[노우티스]", "pos": "동사",
                   "mean": "알아차리다", "ex": "I notice people using smart phones." } ] }
  ],
  "idiom_days": [
    { "tag": "Day 3", "subtitle": "꼭 외워야 할 숙어", "color": "#7ECFC0",
      "idioms": [ { "phrase": "be addicted to ~", "mean": "~에 중독되다",
                    "ex": "They are addicted to their cell phones." } ] }
  ],
  "word_bank": ["gadget", "necessary", "to"],
  "fill_blanks": [
    { "en": "My favorite <u></u> is my cell phone.", "ko": "내가 가장 좋아하는 기계는 휴대폰이야." }
  ]
}
```

- `color` 생략 시 파스텔 팔레트가 순서대로 배정된다.
- `fill_blanks`의 `en`은 HTML이므로 빈칸은 `<u></u>`로 쓴다.
- 연습 페이지(단어 뜻 쓰기 / 숙어 뜻 쓰기 + 빈칸 채우기)는 자동 생성된다.

## 출력물 구성

| 쪽 | 내용 |
|---|---|
| 1 | 표지 — 제목, 항목 수, 공부 3단계, 이름·시작일 기입란 |
| 2~ | 단어 그룹마다 한 쪽 (12개까지, 카드 오른쪽에 필기용 점선 3줄) |
| 다음 | 숙어 그룹마다 한 쪽 |
| 뒤 | 연습 ① 단어 뜻 쓰기 / 연습 ② 숙어 뜻 쓰기 + 빈칸 채우기 |

A4 세로, 크림 배경 + 파스텔 카드. 굿노트에서 애플펜슬로 바로 쓸 수 있게 여백을 둔다.

## 명령 예시

```bash
cd ${CLAUDE_PLUGIN_ROOT}
python scripts/make_pdf.py vocab.json 화상영어_Unit7_단어장.pdf
python scripts/make_web.py vocab.json 화상영어_Unit7.html \
  --pdf 화상영어_Unit7_단어장.pdf --pdf-pages 6 \
  --back-href ../주현이.html --back-label 주현이 --home-href ../../index.html
python scripts/publish.py --category 주현이 \
  --page 화상영어_Unit7.html --pdf 화상영어_Unit7_단어장.pdf \
  --title "화상영어 Unit 7 - 단어 · 숙어장" --icon 📱
```

`publish.py`는 repo를 임시로 clone해서 `home/<카테고리>/`에 파일을 넣고,
`home/<카테고리>.html` 목록 맨 위에 링크를 추가한 뒤 push한다.
확인만 하려면 `--dry-run`.

## 흔한 실수

| 실수 | 결과 | 대응 |
|---|---|---|
| 한 그룹에 13개 이상 | 마지막 카드가 페이지 밖으로 잘림 | 스크립트가 에러로 막는다. 그룹을 나눈다 |
| 본문에 없는 단어 추가 | 교재 진도와 어긋남 | 이미지에서 확인한 단어만 넣는다 |
| 쪽수 확인 생략 | 사용자가 원한 분량 초과 | 생성 후 쪽수를 보고하고, 넘으면 줄인다 |
| Chrome 경로 문제 | PDF 변환 실패 | `CHROME_PATH` 환경변수로 실행 파일 지정 |
| push 먼저 실행 | 확인 없이 공개됨 | 게시는 사용자가 요청했을 때만 |

## 필요한 것

- Python 3 (표준 라이브러리만 사용)
- Chrome 또는 Edge (헤드리스 인쇄용)
- git, repo push 권한 (게시할 때만)
