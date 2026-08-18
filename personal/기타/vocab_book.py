# -*- coding: utf-8 -*-
"""영어 단어·숙어장 만들기 — 이 파일 하나면 된다.

굿노트(아이패드)용 A4 PDF와, presentations 사이트에 올릴 웹 페이지를 만든다.
필요한 것: Python 3(표준 라이브러리만) + Chrome 또는 Edge. git은 게시할 때만.

━━ 사용법 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  python vocab_book.py pdf  vocab.json 단어장.pdf
  python vocab_book.py web  vocab.json 페이지.html --pdf 단어장.pdf --pdf-pages 6                             --back-href ../주현이.html --back-label 주현이
  python vocab_book.py push --category 주현이 --page 페이지.html --pdf 단어장.pdf                             --title "화상영어 Unit 8" --icon 📱 [--dry-run]

━━ 만드는 순서 (Claude에게 시킬 때) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  1. 교재 사진을 읽는다. 사진이 회전돼 있어도 그대로 읽힌다.
  2. 본문에 실제로 나온 단어/숙어만 고른다. 학년에 맞춰 뜻은 짧게,
     예문은 본문 문장을 그대로 쓰거나 더 짧게 다듬는다.
  3. 아래 형식으로 vocab.json을 쓴다. 한 그룹(Day)당 최대 12개.
     넘으면 PDF에서 잘리므로 이 스크립트가 에러로 막는다.
  4. pdf 명령으로 PDF를 만들고 쪽수를 확인해 보고한다. 보통 4~6쪽이 적당하다.
     넘으면 다 담으려 하지 말고 항목을 줄인다.
  5. 사이트 게시(web → push)는 사용자가 요청했을 때만 한다.

━━ vocab.json 형식 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  "unit": "Unit 7",
  "title": "My Favorite Gadget is My Cell Phone",
  "page_title": "화상영어 Unit 7 단어 · 숙어장",   // 웹 페이지 제목
  "emoji": "📱",
  "cover_title": "영어 단어 · 숙어장",
  "subtitle": "꼭 필요한 것만 골랐어요. 3일이면 끝!",
  "running_title": "Unit 7 · My Favorite Gadget",  // PDF 쪽 아래 문구
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
  "word_bank": ["gadget", "necessary", "to"],        // 빈칸 채우기 보기 (선택)
  "fill_blanks": [                                   // 빈칸은 <u></u> 로 (선택)
    { "en": "My favorite <u></u> is my cell phone.", "ko": "내가 가장 좋아하는 기계는 휴대폰이야." }
  ]
}

  · color를 빼면 파스텔 색이 순서대로 배정된다.
  · 표지와 연습 페이지(뜻 쓰기 · 빈칸 채우기)는 자동으로 만들어진다.

━━ 결과물 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  1쪽    표지 (제목, 항목 수, 공부 3단계, 이름·시작일 칸)
  2쪽~   단어 그룹마다 한 쪽 — 카드 오른쪽에 필기용 점선 3줄
  다음   숙어 그룹마다 한 쪽
  마지막 연습 ① 단어 뜻 쓰기 / 연습 ② 숙어 뜻 쓰기 + 빈칸 채우기

  A4 세로, 크림 배경 + 파스텔 카드. 굿노트에서 애플펜슬로 바로 쓸 수 있다.

━━ 막힐 때 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  · Chrome을 못 찾는다 → CHROME_PATH 환경변수에 실행 파일 경로를 넣는다.
  · push가 안 된다 → 그 PC에 GitHub 로그인(자격 증명)이 돼 있어야 한다.
  · 먼저 --dry-run 으로 무엇이 바뀌는지 확인하고 올린다.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from html import escape as e
from pathlib import Path

# ─────────────────────── PDF 만들기 ───────────────────────

CHROME_CANDIDATES = [
    os.environ.get("CHROME_PATH", ""),
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
]

PALETTE = ["#F79FBF", "#B9A7E0", "#7ECFC0", "#F6B26B", "#8FBEE8"]

CSS = """
@page { size: A4 portrait; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: "Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", sans-serif; color: #4A4453; }
.page { width: 210mm; height: 297mm; padding: 13mm 13mm 10mm 13mm; background: #FFFCF9;
  overflow: hidden; page-break-after: always; display: flex; flex-direction: column; }
.page:last-child { page-break-after: auto; }

.cover { justify-content: center; align-items: center; text-align: center;
  background: linear-gradient(160deg, #FFF1F6 0%, #FFFCF9 45%, #F1ECFB 100%); }
.cover .ribbon { font-size: 13pt; letter-spacing: 6px; color: #E68CB0; margin-bottom: 8mm; }
.cover h1 { font-size: 34pt; color: #E1699A; line-height: 1.25; font-weight: 800; }
.cover h1 small { display: block; font-size: 14pt; color: #8B7FB0; font-weight: 600;
  margin-top: 5mm; letter-spacing: 1px; }
.cover .unit { display: inline-block; margin: 9mm 0 7mm; padding: 4mm 12mm; border-radius: 40px;
  background: #fff; border: 2.5px solid #F7C6DA; color: #C9578B; font-size: 13.5pt; font-weight: 700; }
.cover .subtitle { font-size: 12pt; color: #7A7188; line-height: 2; }
.cover .steps { margin-top: 9mm; display: flex; gap: 4mm; }
.cover .steps div { background: #fff; border: 1.8px solid #EEE3F3; border-radius: 14px;
  padding: 4mm 6mm; font-size: 10pt; color: #6E6485; width: 42mm; line-height: 1.6; }
.cover .steps b { display: block; color: #C9578B; font-size: 11pt; margin-bottom: 1.5mm; }
.cover .namebox { margin-top: 11mm; padding: 6mm 13mm; background: #fff; border-radius: 18px;
  border: 2px dashed #CDBEEA; font-size: 12.5pt; color: #6E6485; }
.cover .deco { font-size: 18pt; color: #F3B8CE; letter-spacing: 8px; margin-top: 8mm; }

.head { display: flex; align-items: center; gap: 4mm; margin-bottom: 4mm; }
.head .tag { padding: 2.2mm 6.5mm; border-radius: 30px; color: #fff; font-size: 12pt; font-weight: 800; }
.head .ttl { font-size: 12.5pt; font-weight: 700; color: #5B5268; }
.head .right { margin-left: auto; font-size: 9.5pt; color: #A79DB5; }
.head .right b { color: #E68CB0; }

.card { border: 1.6px solid #EFE6F3; border-radius: 13px; background: #fff;
  padding: 2.4mm 4mm; margin-bottom: 2.2mm; display: flex; gap: 3.5mm; align-items: center; }
.card .no { flex: 0 0 7.4mm; height: 7.4mm; border-radius: 50%; color: #fff; font-size: 9.5pt;
  font-weight: 800; display: flex; align-items: center; justify-content: center; }
.card .body { flex: 1 1 auto; min-width: 0; }
.card .line1 { display: flex; align-items: baseline; gap: 2.5mm; flex-wrap: wrap; }
.card .word { font-size: 14pt; font-weight: 800; color: #3F3A4A; font-family: Georgia, "Malgun Gothic", serif; }
.card .pron { font-size: 8.5pt; color: #A79DB5; }
.card .pos { font-size: 8pt; padding: 0.5mm 2.4mm; border-radius: 20px; background: #F4EFFB;
  color: #8272AE; font-weight: 700; }
.card .mean { font-size: 11pt; font-weight: 700; color: #C9578B; }
.card .ex { font-size: 9pt; color: #7C7489; margin-top: 1mm; font-family: Georgia, "Malgun Gothic", serif; }
.card .write { flex: 0 0 46mm; border-left: 1.4px dashed #E7DFF0; padding-left: 3.5mm;
  display: flex; flex-direction: column; justify-content: center; gap: 4.6mm; }
.card .write i { display: block; border-bottom: 1.1px dotted #D8CFE6; height: 0; }
.icard .word { font-size: 13pt; }

.qtable { width: 100%; border-collapse: collapse; }
.qtable th { background: #FBF3F7; color: #B36189; font-size: 9.5pt; padding: 2.6mm 2mm; border: 1.4px solid #F0E3EB; }
.qtable td { border: 1.4px solid #F0E3EB; padding: 2.6mm 2.5mm; font-size: 10.5pt; height: 9mm; }
.qtable td.en { font-family: Georgia, serif; color: #423C4E; width: 21%; }
.qtable td.no { width: 6%; text-align: center; color: #C3B8D2; font-weight: 700; font-size: 9pt; }
.qtable tr:nth-child(even) td { background: #FEFAFC; }
.hint { background: #FFF7FA; border: 1.5px solid #F8DCE8; border-radius: 12px; padding: 3mm 4.5mm;
  font-size: 9.5pt; color: #A2718C; margin-bottom: 3.5mm; line-height: 1.7; }
.note { margin-top: 3.5mm; font-size: 9.5pt; color: #A79DB5; }
.sub { font-size: 11pt; font-weight: 700; color: #7E6DB0; margin: 5mm 0 2.5mm; }
.sent { border: 1.6px solid #EFE6F3; border-radius: 12px; background: #fff; padding: 3mm 4mm;
  margin-bottom: 2.4mm; font-size: 10.5pt; font-family: Georgia, "Malgun Gothic", serif; color: #423C4E; }
.sent u { text-decoration: none; border-bottom: 1.3px solid #E7C9D9; padding: 0 9mm; }
.sent span { display: block; font-family: "Malgun Gothic", sans-serif; font-size: 9pt;
  color: #A79DB5; margin-top: 1.2mm; }
.wordbank { border: 1.8px dashed #CDBEEA; border-radius: 12px; background: #FBF8FF;
  padding: 3.5mm 4.5mm; font-size: 10pt; color: #6E6485; line-height: 1.9; margin-bottom: 3.5mm;
  font-family: Georgia, "Malgun Gothic", serif; }
.foot { margin-top: auto; padding-top: 3mm; text-align: center; font-size: 8.5pt; color: #CFC6DC; }
"""

MAX_PER_PAGE = 12  # 한 쪽에 12개까지 넣어야 잘리지 않는다


def find_chrome():
    for path in CHROME_CANDIDATES:
        if path and Path(path).exists():
            return path
    sys.exit("Chrome/Edge를 찾지 못했습니다. CHROME_PATH 환경변수로 실행 파일 경로를 지정하세요.")


def head(tag, color, title, right):
    return (f'<div class="head"><div class="tag" style="background:{color}">{e(tag)}</div>'
            f'<div class="ttl">{e(title)}</div><div class="right">{right}</div></div>')


def foot(label, running):
    return f'<div class="foot">♡ {e(running)} ♡ &nbsp;·&nbsp; {e(label)}</div>'


def color_of(group, i):
    return group.get("color") or PALETTE[i % len(PALETTE)]


def build_html(data):
    running = data.get("running_title") or data.get("title", "")
    words = [(g, w) for g in data.get("days", []) for w in g["words"]]
    idioms = [(g, x) for g in data.get("idiom_days", []) for x in g["idioms"]]
    pages = []

    # 표지
    steps = "".join(
        f'<div><b>{e(s["title"])}</b>{e(s["body"])}</div>'
        for s in data.get("steps", [
            {"title": "1. 읽기", "body": "단어와 뜻, 예문을 소리 내어 읽어요"},
            {"title": "2. 쓰기", "body": "오른쪽 점선 위에 세 번 써 봐요"},
            {"title": "3. 확인", "body": "연습 문제로 스스로 점검해요"},
        ]))
    pages.append(f"""<div class="page cover">
<div class="ribbon">★ ENGLISH ★</div>
<h1>{e(data.get("cover_title", "영어 단어 · 숙어장"))}<small>{e(data.get("title", ""))}</small></h1>
<div class="unit">{e(data.get("unit", ""))} &nbsp;|&nbsp; 핵심 단어 {len(words)}개 · 숙어 {len(idioms)}개</div>
<div class="subtitle">{e(data.get("subtitle", "꼭 필요한 것만 골랐어요."))}</div>
<div class="steps">{steps}</div>
<div class="namebox">이름 ______________ &nbsp;&nbsp; 시작한 날 ____ 월 ____ 일</div>
<div class="deco">✿ ♡ ✿ ♡ ✿</div>
</div>""")

    # 단어 페이지
    n = 1
    for gi, g in enumerate(data.get("days", [])):
        color = color_of(g, gi)
        items = g["words"]
        if len(items) > MAX_PER_PAGE:
            sys.exit(f'"{g["tag"]}"에 단어가 {len(items)}개입니다. 한 쪽에는 {MAX_PER_PAGE}개까지만 넣으세요.')
        cards = []
        for w in items:
            cards.append(f"""<div class="card">
<div class="no" style="background:{color}">{n}</div>
<div class="body"><div class="line1"><span class="word">{e(w["word"])}</span>
<span class="pron">{e(w.get("pron", ""))}</span><span class="pos">{e(w.get("pos", ""))}</span>
<span class="mean">{e(w["mean"])}</span></div>
<div class="ex">{e(w.get("ex", ""))}</div></div>
<div class="write"><i></i><i></i><i></i></div></div>""")
            n += 1
        pages.append(f'<div class="page">{head(g["tag"], color, g.get("subtitle", ""), f"단어 <b>{len(items)}</b>개")}'
                     f'{"".join(cards)}{foot(g["tag"], running)}</div>')

    # 숙어 페이지
    for gi, g in enumerate(data.get("idiom_days", [])):
        color = color_of(g, gi + len(data.get("days", [])))
        items = g["idioms"]
        if len(items) > MAX_PER_PAGE:
            sys.exit(f'"{g["tag"]}"에 숙어가 {len(items)}개입니다. 한 쪽에는 {MAX_PER_PAGE}개까지만 넣으세요.')
        cards = []
        for x in items:
            cards.append(f"""<div class="card icard">
<div class="no" style="background:{color}">{n}</div>
<div class="body"><div class="line1"><span class="word">{e(x["phrase"])}</span>
<span class="mean">{e(x["mean"])}</span></div>
<div class="ex">{e(x.get("ex", ""))}</div></div>
<div class="write"><i></i><i></i><i></i></div></div>""")
            n += 1
        pages.append(f'<div class="page">{head(g["tag"], color, g.get("subtitle", ""), f"숙어 <b>{len(items)}</b>개")}'
                     f'{"".join(cards)}{foot(g["tag"], running)}</div>')

    def quiz_rows(labels):
        half = (len(labels) + 1) // 2
        out = []
        for i in range(half):
            right = (f'<td class="no">{half + i + 1}</td><td class="en">{e(labels[half + i])}</td><td></td>'
                     if half + i < len(labels) else '<td class="no"></td><td class="en"></td><td></td>')
            out.append(f'<tr><td class="no">{i + 1}</td><td class="en">{e(labels[i])}</td><td></td>{right}</tr>')
        return "".join(out)

    # 연습 ① 단어
    if words:
        labels = [w["word"] for _, w in words]
        pages.append(f"""<div class="page">
{head("연습 ①", "#F6B26B", "단어 뜻 쓰기", f"총 <b>{len(labels)}</b>문항")}
<div class="hint">♡ 앞장을 보지 않고 우리말 뜻을 써 보세요. 다 쓴 뒤에 앞장으로 돌아가 확인하고, 틀린 것에는 별표 ★를 그려요.</div>
<table class="qtable"><tr><th>번호</th><th>영어</th><th>우리말 뜻</th><th>번호</th><th>영어</th><th>우리말 뜻</th></tr>
{quiz_rows(labels)}</table>
<div class="note">★ 맞은 개수: ______ / {len(labels)} 개</div>
<div class="sub">＊ 다시 외울 단어를 세 번씩 써 보세요</div>
<div class="sent"><u></u> &nbsp; <u></u> &nbsp; <u></u> &nbsp; <u></u></div>
<div class="sent"><u></u> &nbsp; <u></u> &nbsp; <u></u> &nbsp; <u></u></div>
{foot("연습 ①", running)}
</div>""")

    # 연습 ② 숙어 + 빈칸 채우기
    if idioms:
        labels = [x["phrase"] for _, x in idioms]
        fills = "".join(
            f'<div class="sent">{i}. {f["en"]}<span>{e(f.get("ko", ""))}</span></div>'
            for i, f in enumerate(data.get("fill_blanks", []), 1))
        bank = data.get("word_bank", [])
        bank_html = (f'<div class="sub">＊ 아래 낱말 상자에서 골라 빈칸을 채워 보세요</div>'
                     f'<div class="wordbank">{" &nbsp;·&nbsp; ".join(e(b) for b in bank)}</div>') if bank else ""
        total = len(labels) + len(data.get("fill_blanks", []))
        pages.append(f"""<div class="page">
{head("연습 ②", "#8FBEE8", "숙어 뜻 쓰기 · 문장 완성하기", f"총 <b>{total}</b>문항")}
<table class="qtable"><tr><th>번호</th><th>숙어</th><th>우리말 뜻</th><th>번호</th><th>숙어</th><th>우리말 뜻</th></tr>
{quiz_rows(labels)}</table>
{bank_html}{fills}
<div class="note">★ 참 잘했어요! 오늘도 열심히 공부한 나에게 칭찬 한마디 ♡</div>
{foot("연습 ②", running)}
</div>""")

    return (f'<!doctype html><html lang="ko"><head><meta charset="utf-8">'
            f'<title>{e(data.get("unit", ""))} {e(data.get("cover_title", "단어장"))}</title>'
            f"<style>{CSS}</style></head><body>{''.join(pages)}</body></html>"), len(pages)


def main_pdf():
    if len(sys.argv) < 3:
        sys.exit(USAGE)
    src, out = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
    data = json.loads(src.read_text(encoding="utf-8"))
    doc, n_pages = build_html(data)

    html_path = (out.with_suffix(".html") if "--keep-html" in sys.argv
                 else Path(tempfile.gettempdir()) / f"{out.stem}.html")
    html_path.write_text(doc, encoding="utf-8")

    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([find_chrome(), "--headless", "--disable-gpu", "--no-pdf-header-footer",
                    f"--print-to-pdf={out}", html_path.as_uri()],
                   check=True, capture_output=True)
    print(f"{n_pages}쪽 PDF 생성 완료 -> {out}")
    if "--keep-html" in sys.argv:
        print(f"HTML 유지 -> {html_path}")


# ─────────────────────── 웹 페이지 만들기 ───────────────────────

TEMPLATE = """<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title} - My Presentations</title>
<style>
  :root {{
    --bg: #f5f6f8; --card: #ffffff; --ink: #1c2230; --ink-soft: #5b6270;
    --accent: #3a5ba0; --shadow: rgba(28, 34, 48, 0.10); --pink: #C9578B; --line: #ece7f2;
  }}
  @media (prefers-color-scheme: dark) {{
    :root {{ --bg: #14161c; --card: #1f232c; --ink: #eceef2; --ink-soft: #a3aab8; --accent: #7fa2e0;
      --shadow: rgba(0,0,0,0.4); --pink: #F2A0C4; --line: #2c313c; }}
  }}
  :root[data-theme="dark"] {{ --bg: #14161c; --card: #1f232c; --ink: #eceef2; --ink-soft: #a3aab8;
    --accent: #7fa2e0; --shadow: rgba(0,0,0,0.4); --pink: #F2A0C4; --line: #2c313c; }}
  :root[data-theme="light"] {{ --bg: #f5f6f8; --card: #ffffff; --ink: #1c2230; --ink-soft: #5b6270;
    --accent: #3a5ba0; --shadow: rgba(28, 34, 48, 0.10); --pink: #C9578B; --line: #ece7f2; }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; min-height: 100vh; background: var(--bg); color: var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Malgun Gothic", sans-serif;
    display: flex; flex-direction: column; align-items: center; padding: 6vh 5vw 6vh; }}
  .top {{ width: 100%; max-width: 860px; margin-bottom: 1.5rem; display: flex; justify-content: space-between; }}
  a.back {{ color: var(--ink-soft); text-decoration: none; font-size: 0.9rem; }}
  a.back:hover {{ color: var(--accent); }}
  .wrap {{ width: 100%; max-width: 860px; }}
  h1 {{ font-size: 1.6rem; margin: 0.5rem 0 0.4rem; }}
  .lead {{ color: var(--ink-soft); font-size: 0.95rem; margin-bottom: 1.6rem; line-height: 1.7; }}
  .bar {{ display: flex; gap: 0.7rem; flex-wrap: wrap; margin-bottom: 2rem; }}
  .btn {{ display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.7rem 1.2rem; border-radius: 12px;
    background: var(--card); color: var(--ink); text-decoration: none; font-size: 0.92rem; font-weight: 600;
    box-shadow: 0 3px 12px var(--shadow); border: none; cursor: pointer; font-family: inherit; }}
  .btn.primary {{ background: var(--pink); color: #fff; }}
  .btn:hover {{ transform: translateY(-1px); }}
  section.day {{ background: var(--card); border-radius: 14px; box-shadow: 0 3px 12px var(--shadow);
    padding: 1.3rem 1.5rem 0.6rem; margin-bottom: 1.2rem; }}
  section.day h2 {{ font-size: 1.05rem; margin: 0 0 1rem; display: flex; align-items: center; gap: 0.7rem; }}
  .chip {{ color: #fff; font-size: 0.8rem; padding: 0.25rem 0.8rem; border-radius: 20px; }}
  .row {{ display: grid; grid-template-columns: 1.9rem 12rem 9rem 1fr; gap: 0.8rem; align-items: baseline;
    padding: 0.75rem 0; border-top: 1px solid var(--line); }}
  section.day .row:first-of-type {{ border-top: none; }}
  .num {{ color: #fff; font-size: 0.72rem; width: 1.5rem; height: 1.5rem; border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center; }}
  .w b {{ font-size: 1.02rem; }}
  .w i {{ font-style: normal; color: var(--ink-soft); font-size: 0.75rem; margin-left: 0.35rem; }}
  .w em {{ font-style: normal; color: var(--accent); font-size: 0.7rem; margin-left: 0.35rem; }}
  .m {{ color: var(--pink); font-weight: 700; font-size: 0.92rem; }}
  .x {{ font-size: 0.83rem; color: var(--ink); line-height: 1.6; }}
  body.hide-mean .m {{ background: var(--line); color: transparent; border-radius: 6px; cursor: pointer; }}
  body.hide-mean .m:hover {{ color: var(--pink); background: transparent; }}
  @media (max-width: 700px) {{
    .row {{ grid-template-columns: 1.7rem 1fr; }}
    .m, .x {{ grid-column: 2; }}
  }}
</style>
</head>
<body>
  <div class="top">
    <a class="back" href="{back_href}">&larr; {back_label}</a>
    <a class="back" href="{home_href}">홈으로</a>
  </div>
  <div class="wrap">
    <h1>{emoji} {title}</h1>
    <div class="lead">{lead}</div>
    <div class="bar">{buttons}</div>
    {sections}
  </div>
<script>
  const btn = document.getElementById('toggle');
  btn.addEventListener('click', () => {{
    document.body.classList.toggle('hide-mean');
    btn.textContent = document.body.classList.contains('hide-mean') ? '👀 뜻 다시 보기' : '🙈 뜻 가리고 외우기';
  }});
</script>
</body>
</html>
"""


def arg(flag, default=None):
    return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv else default


def main_web():
    if len(sys.argv) < 3:
        sys.exit(USAGE)
    data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    out = Path(sys.argv[2]).resolve()

    secs, n = [], 1
    for gi, g in enumerate(data.get("days", [])):
        color = g.get("color") or PALETTE[gi % len(PALETTE)]
        rows = []
        for w in g["words"]:
            rows.append(f'<div class="row"><span class="num" style="background:{color}">{n}</span>'
                        f'<div class="w"><b>{e(w["word"])}</b><i>{e(w.get("pron", ""))}</i>'
                        f'<em>{e(w.get("pos", ""))}</em></div><div class="m">{e(w["mean"])}</div>'
                        f'<div class="x">{e(w.get("ex", ""))}</div></div>')
            n += 1
        secs.append(f'<section class="day"><h2><span class="chip" style="background:{color}">{e(g["tag"])}</span>'
                    f'{e(g.get("subtitle", ""))}</h2>{"".join(rows)}</section>')

    for gi, g in enumerate(data.get("idiom_days", [])):
        color = g.get("color") or PALETTE[(gi + len(data.get("days", []))) % len(PALETTE)]
        rows = []
        for x in g["idioms"]:
            rows.append(f'<div class="row"><span class="num" style="background:{color}">{n}</span>'
                        f'<div class="w"><b>{e(x["phrase"])}</b></div><div class="m">{e(x["mean"])}</div>'
                        f'<div class="x">{e(x.get("ex", ""))}</div></div>')
            n += 1
        secs.append(f'<section class="day"><h2><span class="chip" style="background:{color}">{e(g["tag"])}</span>'
                    f'{e(g.get("subtitle", ""))}</h2>{"".join(rows)}</section>')

    n_words = sum(len(g["words"]) for g in data.get("days", []))
    n_idioms = sum(len(g["idioms"]) for g in data.get("idiom_days", []))
    pdf = arg("--pdf")
    buttons = ""
    if pdf:
        pages = arg("--pdf-pages", "")
        suffix = f" ({pages}쪽)" if pages else ""
        buttons += f'<a class="btn primary" href="{e(pdf)}" download>⬇ 단어장 PDF 내려받기{suffix}</a>'
    buttons += '<button class="btn" id="toggle">🙈 뜻 가리고 외우기</button>'

    lead = (f'{e(data.get("title", ""))} &nbsp;·&nbsp; 핵심 단어 {n_words}개 + 숙어 {n_idioms}개<br>'
            f'{e(data.get("subtitle", ""))} 아이패드 굿노트에 넣어 쓸 수 있는 PDF도 함께 있어요.')

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(TEMPLATE.format(
        title=e(data.get("page_title", data.get("unit", "단어장"))),
        emoji=data.get("emoji", "📘"),
        lead=lead, buttons=buttons, sections="".join(secs),
        back_href=arg("--back-href", "../index.html"),
        back_label=e(arg("--back-label", "뒤로")),
        home_href=arg("--home-href", "../../index.html"),
    ), encoding="utf-8")
    print(f"웹 페이지 생성 완료 ({n - 1}개 항목) -> {out}")


# ─────────────────────── 사이트에 게시 ───────────────────────

DEFAULT_REPO = "https://github.com/GuitaruMan/presentations.git"
LIST_ANCHOR = '<div class="list">'


def run(cmd, cwd=None):
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode:
        sys.exit(f"명령 실패: {' '.join(cmd)}\n{r.stdout}\n{r.stderr}")
    return r.stdout.strip()


def link_html(href, data_file, icon, title):
    return (f'    <a class="item" href="{href}" data-file="{data_file}">\n'
            f'      <span class="doc-icon">{icon}</span>\n'
            f'      <span class="item-text">\n'
            f'        <span>{title}</span>\n'
            f'        <span class="date"></span>\n'
            f'      </span>\n'
            f'    </a>\n')


def main_push():
    p = argparse.ArgumentParser()
    p.add_argument("--category", required=True, help="가정용 하위 카테고리 (예: 주현이)")
    p.add_argument("--page", required=True, help="게시할 HTML 파일 경로")
    p.add_argument("--pdf", help="함께 올릴 PDF 경로")
    p.add_argument("--title", required=True, help="목록에 표시할 제목")
    p.add_argument("--icon", default="📘")
    p.add_argument("--repo", default=DEFAULT_REPO)
    p.add_argument("--message", help="커밋 메시지 (기본: 자동 생성)")
    p.add_argument("--dry-run", action="store_true", help="push 없이 변경 내용만 확인")
    a = p.parse_args()

    page_src = Path(a.page).resolve()
    if not page_src.exists():
        sys.exit(f"페이지 파일이 없습니다: {page_src}")

    work = Path(tempfile.mkdtemp(prefix="vocab-publish-"))
    clone = work / "repo"
    print(f"clone 중... ({a.repo})")
    run(["git", "clone", "--depth", "1", a.repo, str(clone)])

    index = clone / "home" / f"{a.category}.html"
    if not index.exists():
        sys.exit(f"카테고리 페이지가 없습니다: home/{a.category}.html")

    target_dir = clone / "home" / a.category
    target_dir.mkdir(exist_ok=True)
    shutil.copy2(page_src, target_dir / page_src.name)
    if a.pdf:
        shutil.copy2(Path(a.pdf).resolve(), target_dir / Path(a.pdf).name)

    href = f"{a.category}/{page_src.name}"
    data_file = f"home/{a.category}/{page_src.name}"
    s = index.read_text(encoding="utf-8")
    if href in s:
        print("이미 목록에 있는 링크입니다. 파일만 갱신합니다.")
    else:
        if LIST_ANCHOR not in s:
            sys.exit(f'{index}에서 \'{LIST_ANCHOR}\'를 찾지 못했습니다. 목록 구조를 확인하세요.')
        s = s.replace(LIST_ANCHOR + "\n", LIST_ANCHOR + "\n" + link_html(href, data_file, a.icon, a.title), 1)
        index.write_text(s, encoding="utf-8")

    run(["git", "add", "-A"], cwd=clone)
    status = run(["git", "status", "--short"], cwd=clone)
    if not status:
        print("변경 사항이 없습니다.")
        return
    print(status)

    if a.dry_run:
        print(f"--dry-run: push하지 않았습니다. 작업 폴더 -> {clone}")
        return

    msg = a.message or (f"가정용/{a.category}에 {a.title} 추가\n\n"
                        "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>")
    run(["git", "-c", "core.quotepath=false", "commit", "-m", msg], cwd=clone)
    run(["git", "push", "origin", "HEAD"], cwd=clone)
    sha = run(["git", "rev-parse", "--short", "HEAD"], cwd=clone)
    slug = a.repo.rstrip("/").removesuffix(".git").split("/")[-1]
    owner = a.repo.rstrip("/").removesuffix(".git").split("/")[-2]
    print(f"push 완료 ({sha})")
    print(f"https://{owner.lower()}.github.io/{slug}/home/{a.category}/{page_src.name}")
    shutil.rmtree(work, ignore_errors=True)


# ─────────────────────── 명령 분기 ───────────────────────

USAGE = """사용법:
  python vocab_book.py pdf  vocab.json 단어장.pdf
  python vocab_book.py web  vocab.json 페이지.html [--pdf 단어장.pdf] [--pdf-pages 6]
  python vocab_book.py push --category 주현이 --page 페이지.html --title "제목" [--dry-run]

자세한 설명과 vocab.json 형식은 이 파일 맨 위 주석에 있다."""


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help", "help"):
        sys.exit(USAGE)
    cmd, sys.argv = sys.argv[1], [sys.argv[0]] + sys.argv[2:]
    if cmd == "pdf":
        main_pdf()
    elif cmd == "web":
        main_web()
    elif cmd == "push":
        main_push()
    else:
        sys.exit("모르는 명령: " + cmd + "\n\n" + USAGE)
