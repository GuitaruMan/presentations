# -*- coding: utf-8 -*-
"""단어장 JSON -> A4 PDF (굿노트용).

사용법:
    python make_pdf.py vocab.json 출력.pdf [--keep-html]

JSON 스키마는 skills/vocab-book/SKILL.md 참고.
헤드리스 Chrome/Edge로 인쇄하므로 별도 파이썬 패키지가 필요 없다.
"""
import json
import os
import subprocess
import sys
import tempfile
from html import escape as e
from pathlib import Path

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


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
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


if __name__ == "__main__":
    main()
