# -*- coding: utf-8 -*-
"""단어장 JSON -> presentations 사이트용 HTML 페이지.

사용법:
    python make_web.py vocab.json 출력.html [--pdf 파일명.pdf] [--pdf-pages 6]

기존 사이트와 같은 다크모드 대응 스타일을 쓰고, "뜻 가리고 외우기" 토글을 넣는다.
"""
import json
import sys
from html import escape as e
from pathlib import Path

PALETTE = ["#F79FBF", "#B9A7E0", "#7ECFC0", "#F6B26B", "#8FBEE8"]

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


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
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


if __name__ == "__main__":
    main()
