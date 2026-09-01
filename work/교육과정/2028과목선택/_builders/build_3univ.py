# -*- coding: utf-8 -*-
"""3개 대학(숭실대·아주대·인하대) 선택과목 가이드북 → 2028 과목 선택 안내 자료.

원본: ForTeaching/3개대학(아주대, 숭실대, 인하대) 선택과목 가이드북.pdf
  <표-11> 3개 대학 통합 선택 과목 가이드 (1~3쪽) — 숭실대·인하대를 여기서 읽는다
  <표-12> 아주대학교 선택 과목 가이드   (4~5쪽) — 아주대는 이쪽이 전용 자료다

가이드북은 '3개 대학 공통으로 전공 학습과 연계성이 높은 과목'을 굵은 글씨로 표시하지만,
그것을 이 사이트의 '핵심과목'으로 옮기지는 않는다. 핵심과목은 대학이 자기 모집단위에
'필수적 이수를 권장'한다는 뜻이라 성격이 다르다. 모두 권장과목으로 넣는다.
"""
import pymupdf, json, re, io, os, sys, collections

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# 원본 PDF 는 저장소에 두지 않는다. 경로를 넘겨 쓴다.
#   python build_3univ.py "…/3개대학(아주대, 숭실대, 인하대) 선택과목 가이드북.pdf"
if len(sys.argv) < 2:
    sys.exit('쓰는 법: python build_3univ.py <가이드북 PDF 경로>')
PDF = sys.argv[1]
DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data') + os.sep

# ── 우리 과목 사전에 아직 없던 과목 ────────────────────────────
# 2022 개정 교육과정 보통 교과의 정식 이름·교과군·유형. 이미 사전에 있으면
# 건너뛰므로(설명이 지워지지 않는다) 다시 돌려도 안전하다.
# 설명은 경남교육청 안내자료를 근거로 따로 채웠다 — 작업로그 2026-09-01 참고.
NEW_SUBJECTS = [
    ('진로와 직업', '교양', '일반', []),
    ('삶과 종교', '교양', '진로', []),
    ('인간과 경제활동', '교양', '융합', ['인간과경제활동']),
    ('논술', '교양', '융합', []),
    ('수학과 문화', '수학', '융합', ['수학과문화']),
    ('직무 수학', '수학', '융합', ['직무수학']),
    ('실생활 영어 회화', '영어', '융합', ['실생활영어회화', '실생활 영어회화']),
    ('금융과 경제생활', '사회', '융합', ['금융과경제생활']),
    ('기후변화와 지속가능한 세계', '사회', '융합',
     ['기후변화와 지속가능한세계', '기후변화와지속가능한세계']),
    ('과학의 역사와 문화', '과학', '융합', ['과학의역사와문화']),
    ('로봇과 공학 세계', '기술·가정/정보', '진로', ['로봇과공학세계', '로봇과 공학세계']),
    ('생활과학 탐구', '기술·가정/정보', '진로', ['생활과학탐구']),
    ('창의 공학 설계', '기술·가정/정보', '융합', ['창의공학설계', '창의 공학설계']),
    ('지식 재산 일반', '기술·가정/정보', '융합', ['지식재산일반']),
    ('생애 설계와 자립', '기술·가정/정보', '융합', ['생애설계와 자립', '생애설계와자립']),
    ('아동 발달과 부모', '기술·가정/정보', '융합', ['아동발달과 부모', '아동발달과부모']),
    ('데이터 과학', '정보', '진로', ['데이터과학']),
    ('소프트웨어와 생활', '정보', '융합', ['소프트웨어와생활']),
    ('미술 창작', '예술', '진로', ['미술창작']),
    ('음악과 미디어', '예술', '융합', ['음악과미디어']),
    ('미술과 매체', '예술', '융합', ['미술과매체']),
    ('한문 고전 읽기', '한문', '진로', ['한문고전읽기']),
    ('독일어', '제2외국어/한문', '일반', []),
    ('독일어 회화', '제2외국어/한문', '진로', ['독일어회화']),
    ('일본어 회화', '제2외국어/한문', '진로', ['일본어회화']),
    ('중국어 회화', '제2외국어/한문', '진로', ['중국어회화']),
    ('프랑스어 회화', '제2외국어/한문', '진로', ['프랑스어회화']),
    ('심화 독일어', '제2외국어/한문', '진로', ['심화독일어']),
    ('심화 일본어', '제2외국어/한문', '진로', ['심화일본어']),
    ('심화 중국어', '제2외국어/한문', '진로', ['심화중국어']),
    ('심화 프랑스어', '제2외국어/한문', '진로', ['심화프랑스어']),
    ('독일어권 문화', '제2외국어/한문', '융합', ['독일어권문화']),
    ('일본 문화', '제2외국어/한문', '융합', ['일본문화']),
    ('중국 문화', '제2외국어/한문', '융합', ['중국문화']),
    ('프랑스어권 문화', '제2외국어/한문', '융합', ['프랑스어권문화']),
]

# 가이드북 중분류 → 이 사이트의 계열
TRACK = {
    '인문학': '인문', '언어·문학': '인문',
    '사회과학': '사회', '법학': '사회',
    '경영·경제': '상경',
    '수학·물리·천문·지구': '자연', '화학·생명과학·환경': '자연', '생활과학': '자연',
    '수학·물리·천문·지구·화학·생명과학·환경': '자연',
    '간호': '의약', '의료예과': '의약', '의료': '의약', '약학': '의약',
    '교육': '사범',
    '건설': '공학', '교통·수송': '공학', '기계': '공학', '산업·안전': '공학',
    '재료': '공학', '전기·전자·컴퓨터': '공학', '화공·고분자·에너지': '공학',
}
지역 = {'숭실대': '서울', '아주대': '경기', '인하대': '인천'}


# ── PDF 읽기 ─────────────────────────────────────────────
def norm(s):
    return re.sub(r'\s+', ' ', s).strip()


def lines_of(spans, rect):
    picked = [(sr, st, sb) for sr, st, sb in spans
              if rect.contains(pymupdf.Point((sr.x0 + sr.x1) / 2, (sr.y0 + sr.y1) / 2))]
    # 같은 줄이라도 span 마다 y0 가 0.1pt 씩 어긋난다. 줄 간격(약 10pt)의
    # 절반으로 버킷을 지어야 한 줄 안의 차례가 뒤집히지 않는다.
    picked.sort(key=lambda x: (round(x[0].y0 / 5.0), x[0].x0))
    lines, cur, y = [], [], None
    for sr, st, sb in picked:
        if y is None or abs(sr.y0 - y) > 5.0:
            if cur:
                lines.append(cur)
            cur, y = [], sr.y0
        cur.append((st, sb))
    if cur:
        lines.append(cur)
    return lines


def flat(lines):
    return [p for ln in lines for p in ln]


def plain(lines):
    return norm(''.join(t for t, _ in flat(lines)))


UNIT_END = re.compile(r'(학과|학부|대학|전공|계열|과|부)\)?$')


def join_lines(txt):
    s = ''
    for t in txt:
        if s:
            s += '' if s.endswith(('·', '-')) else ' '
        s += t
    return norm(s)


def units_of(lines):
    txt = [norm(''.join(t for t, _ in ln)) for ln in lines]
    txt = [t for t in txt if t and t not in ('-', '\u3000', '\u3000-')]
    if not txt:
        return []
    if any(',' in t for t in txt):
        return [u.strip() for u in join_lines(txt).split(',') if u.strip()]
    out, buf = [], []
    for t in txt:
        buf.append(t)
        if UNIT_END.search(t):
            out.append(join_lines(buf))
            buf = []
    if buf:
        out.append(join_lines(buf))
    return out


def items_of(lines):
    chars = [(ch, b) for t, b in flat(lines) for ch in t]
    groups, cur = [], []
    for ch, b in chars:
        if ch == ',':
            groups.append(cur)
            cur = []
        else:
            cur.append((ch, b))
    groups.append(cur)
    out = []
    for g in groups:
        name = norm(''.join(c for c, _ in g))
        if not name or name in ('-', '\u3000', '\u3000-'):
            continue
        nb = sum(1 for c, b in g if b and not c.isspace())
        nt = sum(1 for c, b in g if not c.isspace())
        out.append((name, nt > 0 and nb / nt > 0.5))
    return out


def read_tables():
    doc = pymupdf.open(PDF)
    out = []
    for pno in range(len(doc)):
        page = doc[pno]
        spans = []
        for b in page.get_text('dict')['blocks']:
            for l in b.get('lines', []):
                for s in l['spans']:
                    spans.append((pymupdf.Rect(s['bbox']), s['text'], 'Bold' in s['font']))
        for t in sorted(page.find_tables().tables, key=lambda t: t.bbox[0]):
            grid = [[lines_of(spans, pymupdf.Rect(cb)) if cb else [] for cb in row.cells]
                    for row in t.rows]
            out.append({'page': pno + 1, 'grid': grid})
    return out


def MID(s):
    return norm(s).replace(' ', '').replace('\u318d', '·')


def parse():
    tables = read_tables()
    UNIV = ('숭실대', '아주대', '인하대')
    통합, block, major = [], None, ''
    for tb in tables:
        if tb['page'] > 3:
            continue
        for row in tb['grid'][1:]:
            c0, c1, c2 = plain(row[0]), plain(row[1]), plain(row[2])
            if c0:
                major = norm(c0).replace(' ', '')
            if c1:
                block = {'mid': MID(c1), '과목': items_of(row[3]) + items_of(row[4]) + items_of(row[5]),
                         'univ': None}
            if c2 in UNIV:
                block['univ'] = c2
            elif c2 and block:
                통합.append(dict(block, units=units_of(row[2])))

    아주대 = []
    for tb in tables:
        if tb['page'] < 4:
            continue
        for row in tb['grid'][1:]:
            c1 = plain(row[1])
            us = units_of(row[2])
            if not us:
                continue
            아주대.append({'mid': MID(c1), 'univ': '아주대', 'units': us,
                        '과목': items_of(row[3]) + items_of(row[4]) + items_of(row[5])})
    return 통합, 아주대


# ── 과목 이름 맞추기 ──────────────────────────────────────
def squash(s):
    s = str(s).lower().replace(' ', '')
    s = s.replace('Ⅱ', '2').replace('ⅱ', '2').replace('ii', '2')
    s = re.sub(r'[Ⅰⅰi]', '1', s)
    s = re.sub(r'[·・･‧∙\u318d]', '', s)
    return re.sub(r'[()（）\[\]]', '', s)


def main():
    master = json.load(open(DATA + 'subject_master.json', encoding='utf-8'))
    rec = json.load(open(DATA + 'recommendations.json', encoding='utf-8'))
    GROUP = rec['meta']['교과군지정']

    have = set(m['name'] for m in master)
    added = []
    for name, 교과군, 유형, alias in NEW_SUBJECTS:
        if name in have:
            continue
        master.append({'name': name, '교과군': 교과군, '유형': 유형,
                       '별칭': alias, '설명': '', '출처쪽': None})
        added.append(name)

    LOOK = {}
    for m in master:
        LOOK[squash(m['name'])] = m['name']
        for a in m.get('별칭', []):
            LOOK.setdefault(squash(a), m['name'])
    for g in GROUP:
        LOOK.setdefault(squash(g), g)

    통합, 아주대 = parse()
    미상 = collections.Counter()

    def 과목이름(raw):
        k = squash(raw)
        if k in LOOK:
            return LOOK[k]
        미상[raw] += 1
        return None

    rows = collections.OrderedDict()   # (대학) -> [모집단위…]
    for blocks, only in ((통합, ('숭실대', '인하대')), (아주대, ('아주대',))):
        for b in blocks:
            if b['univ'] not in only:
                continue
            권장 = []
            for raw, _bold in b['과목']:
                n = 과목이름(raw)
                if n is not None:
                    권장.append(n)
            # 같은 이름이 두 번 나오면(교과군 지정 등) 앞의 것만 남긴다
            권장 = list(dict.fromkeys(권장))
            for unit in b['units']:
                rows.setdefault(b['univ'], []).append({
                    '계열': TRACK[b['mid']],
                    '단과대학': b['mid'],
                    '모집단위': unit,
                    '핵심': [],
                    '권장': 권장,
                    '조건': [],
                    '비고': '',
                    '권역': '수도권',
                    '지역': 지역[b['univ']],
                })

    공통안내 = [
        "선택과목 '가이드'로서 입시에 반영하는 권장과목과는 성격이 다릅니다",
        '중분류(계열)에 해당하는 모집단위의 전공 학습에 도움이 되는 과목을 '
        '일반선택·진로선택·융합선택으로 나누어 제시한 것입니다',
        '세부적인 모집단위(전공) 안내는 대학별 홈페이지를 참고하시기 바랍니다',
    ]
    핵심안내 = '핵심과목은 3개 대학(숭실대·아주대·인하대)이 공통으로 ' \
             '전공 학습과 연계성이 높다고 밝힌 과목입니다'

    출처 = '2028학년도 3개 대학(아주대·숭실대·인하대) 선택과목 가이드북'
    새대학 = []
    for univ in ('숭실대', '아주대', '인하대'):
        units = rows[univ]
        통합자료 = univ != '아주대'
        새대학.append({
            '대학': univ,
            '출처': 출처 + (' <표-11> 3개 대학 통합 선택 과목 가이드' if 통합자료
                        else ' <표-12> 아주대학교 선택 과목 가이드'),
            '발표일': '2026.03.',
            '제시범위': '중분류(계열) 단위로 제시 — %d개 모집단위' % len(units),
            '핵심권장구분': False,
            '제시강도': '가이드라인(참고용)',
            '강도근거': "입시에 반영하는 권장과목이 아니라 전공 학습 연계를 안내한 '가이드'",
            '안내': 공통안내,
            '모집단위': units,
        })

    # 이미 들어 있으면 갈아 끼운다 (다시 돌려도 같은 결과)
    rec['대학'] = [u for u in rec['대학'] if u['대학'] not in ('숭실대', '아주대', '인하대')]
    rec['대학'].extend(새대학)
    if '독일어' in GROUP:
        del GROUP['독일어']

    # 자료 파일은 indent=2 · LF 로 쓴다. 형식이 달라지면 diff 가 통째로 부풀어
    # 무엇이 실제로 바뀌었는지 볼 수 없다.
    def 쓰기(이름, 값):
        with open(DATA + 이름, 'w', encoding='utf-8', newline='\n') as f:
            json.dump(값, f, ensure_ascii=False, indent=2)

    쓰기('subject_master.json', master)
    쓰기('recommendations.json', rec)

    print('과목 사전에 추가: %d개' % len(added))
    print('  ', ', '.join(added))
    print()
    for u in 새대학:
        print('%s — 모집단위 %d개, 권장 %d과목 (첫 항목 기준)' %
              (u['대학'], len(u['모집단위']), len(u['모집단위'][0]['권장'])))
    print()
    print('전체 대학 %d개 / 모집단위 %d개'
          % (len(rec['대학']), sum(len(u['모집단위']) for u in rec['대학'])))
    if 미상:
        print()
        print('!! 이름을 맞추지 못한 과목:', dict(미상))


main()
