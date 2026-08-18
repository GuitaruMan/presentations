---
name: vocab-book
description: 교재 사진이나 단어 목록으로 영어 단어장·숙어장을 만들 때 사용한다. 굿노트(아이패드)에 넣어 쓸 A4 인쇄용 단어장, 초등·중등 영어 단어 정리, 화상영어 단원 정리 요청에 쓴다.
---

# 영어 단어 · 숙어장 만들기

교재 사진에서 단어·숙어를 뽑아 **아티팩트 하나**로 A4 인쇄용 단어장을 만든다.
사용자는 아티팩트에서 인쇄 → "PDF로 저장" 을 눌러 굿노트로 보낸다.

## 만들기 전에 정할 것

- **학년** — 말하지 않았으면 물어본다. 뜻과 예문 난이도를 여기에 맞춘다.
- **쪽수** — 말하지 않았으면 4~6쪽. 다 담으려 하지 말고 핵심만 고른다.

## 항목 고르는 규칙

- 교재 본문에 **실제로 나온** 단어·숙어만 넣는다. 지어내지 않는다.
- 뜻은 짧게 한 줄, 학생이 아는 말로.
- 예문은 본문 문장을 그대로 쓰거나 더 짧게 다듬는다.
- **한 쪽에 12개까지.** 13개를 넣으면 마지막 카드가 페이지 밖으로 잘린다.
- 단어는 품사끼리(동사 / 명사·형용사) 묶고, 숙어는 따로 모은다.
- 번호는 표지 다음부터 1번으로 시작해 끝까지 이어 매긴다.

## 페이지 구성

| 쪽 | 내용 |
|---|---|
| 1 | 표지 |
| 2~ | 단어 그룹마다 한 쪽 (12개까지) |
| 다음 | 숙어 그룹마다 한 쪽 |
| 마지막 | 연습 ① 단어 뜻 쓰기 / 연습 ② 숙어 뜻 쓰기 + 빈칸 채우기 |

연습 페이지의 뜻 칸은 **비워 둔다**(학생이 직접 쓴다).

## 그룹 색

순서대로 쓴다: `#F79FBF` → `#B9A7E0` → `#7ECFC0` → `#F6B26B` → `#8FBEE8`

## 다 만든 뒤

사용자에게 **쪽수**를 알려 주고, 이렇게 저장하라고 안내한다:

> 아티팩트 오른쪽 위 ⋯ → 인쇄 → 대상을 "PDF로 저장" 으로.
> A4 세로, 배율 100%, **배경 그래픽 켜기**, 머리글·바닥글 끄기.

원한 쪽수를 넘었으면 항목을 줄여 다시 만든다.

---

# HTML 틀 (이대로 쓴다)

`<style>`는 손대지 않는다. A4 인쇄에 맞춘 값이라 고치면 페이지가 어긋난다.

```html
<style>
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
</style>

<!-- ── 표지 ── -->
<div class="page cover">
  <div class="ribbon">★ ENGLISH ★</div>
  <h1>영어 단어 · 숙어장<small>My Favorite Gadget is My Cell Phone</small></h1>
  <div class="unit">Unit 7 &nbsp;|&nbsp; 핵심 단어 24개 · 숙어 12개</div>
  <div class="subtitle">꼭 필요한 것만 골랐어요. 3일이면 끝!</div>
  <div class="steps">
    <div><b>1. 읽기</b>단어와 뜻, 예문을<br>소리 내어 읽어요</div>
    <div><b>2. 쓰기</b>오른쪽 점선 위에<br>세 번 써 봐요</div>
    <div><b>3. 확인</b>연습 문제로<br>스스로 점검해요</div>
  </div>
  <div class="namebox">이름 ______________ &nbsp;&nbsp; 시작한 날 ____ 월 ____ 일</div>
  <div class="deco">✿ ♡ ✿ ♡ ✿</div>
</div>

<!-- ── 단어 페이지 : card 를 12개까지 반복 ── -->
<div class="page">
  <div class="head">
    <div class="tag" style="background:#F79FBF">Day 1</div>
    <div class="ttl">꼭 알아야 할 단어 ①</div>
    <div class="right">단어 <b>12</b>개</div>
  </div>

  <div class="card">
    <div class="no" style="background:#F79FBF">1</div>
    <div class="body">
      <div class="line1">
        <span class="word">notice</span>
        <span class="pron">[노우티스]</span>
        <span class="pos">동사</span>
        <span class="mean">알아차리다</span>
      </div>
      <div class="ex">I notice people using smart phones.</div>
    </div>
    <div class="write"><i></i><i></i><i></i></div>
  </div>

  <div class="foot">♡ Unit 7 · My Favorite Gadget ♡ &nbsp;·&nbsp; Day 1</div>
</div>

<!-- ── 숙어 카드 : card 에 icard 를 함께. 발음·품사는 없다 ── -->
<div class="card icard">
  <div class="no" style="background:#7ECFC0">25</div>
  <div class="body">
    <div class="line1">
      <span class="word">be addicted to ~</span>
      <span class="mean">~에 중독되다</span>
    </div>
    <div class="ex">They are addicted to their cell phones.</div>
  </div>
  <div class="write"><i></i><i></i><i></i></div>
</div>

<!-- ── 연습 ① 단어 뜻 쓰기 ── -->
<div class="page">
  <div class="head">
    <div class="tag" style="background:#F6B26B">연습 ①</div>
    <div class="ttl">단어 뜻 쓰기</div>
    <div class="right">총 <b>24</b>문항</div>
  </div>
  <div class="hint">♡ 앞장을 보지 않고 우리말 뜻을 써 보세요. 다 쓴 뒤에 앞장으로 돌아가 확인하고, 틀린 것에는 별표 ★를 그려요.</div>
  <table class="qtable">
    <tr><th>번호</th><th>영어</th><th>우리말 뜻</th><th>번호</th><th>영어</th><th>우리말 뜻</th></tr>
    <tr><td class="no">1</td><td class="en">notice</td><td></td>
        <td class="no">13</td><td class="en">gadget</td><td></td></tr>
  </table>
  <div class="note">★ 맞은 개수: ______ / 24 개</div>
  <div class="foot">♡ Unit 7 · My Favorite Gadget ♡ &nbsp;·&nbsp; 연습 ①</div>
</div>

<!-- ── 연습 ② : 위 표 + 아래 빈칸 채우기 ── -->
<div class="sub">＊ 아래 낱말 상자에서 골라 빈칸을 채워 보세요</div>
<div class="wordbank">gadget &nbsp;·&nbsp; necessary &nbsp;·&nbsp; directions &nbsp;·&nbsp; to &nbsp;·&nbsp; than &nbsp;·&nbsp; without</div>
<div class="sent">1. My favorite <u></u> is my cell phone.<span>내가 가장 좋아하는 기계는 휴대폰이야.</span></div>
```
