# -*- coding: utf-8 -*-
"""완성된 페이지·PDF를 presentations 사이트의 가정용 카테고리에 게시한다.

사용법:
    python publish.py --category 주현이 --page 화상영어_Unit7.html --pdf 화상영어_Unit7_단어장.pdf \
                      --title "화상영어 Unit 7 - 단어 · 숙어장" [--icon 📱] [--message "커밋 메시지"] [--dry-run]

동작: repo를 임시 폴더에 clone -> home/<category>/ 에 파일 복사 ->
      home/<category>.html 목록 맨 위에 링크 추가(이미 있으면 갱신) -> commit -> push
"""
import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

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


def main():
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


if __name__ == "__main__":
    main()
