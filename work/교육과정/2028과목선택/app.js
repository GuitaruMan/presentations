/* 2028 과목 선택 안내
   데이터: data/*.json — 기준은 각 대학 PDF 원문 */
'use strict';

var VERSION = '20260828r';

var D = {};              // 원자료
var UNITS = [];          // 모집단위 평탄화
var SUBJ = {};           // 과목명 → 마스터
var SCHOOL = {};         // 학교 개설 과목명 → 정보
var INDEX = {};          // 과목명 → 모집단위 목록 (런타임 생성)

/* 대학이 과목이 아니라 교과군 이름을 적어둔 경우.
   '미개설'로 표시하면 오해를 부른다 — 그 교과군에 우리 학교 과목이 있다.
   값은 recommendations.json의 meta.교과군지정에서 온다 (src/subject_groups.json). */
var GROUP_NAME = {};

var state = {
  view: 'univ',
  region: new Set(),   // 권역
  univ: new Set(),
  unit: null,     // 왼쪽에서 고른 학과 (학과별 권장과목 탭)
  track: new Set(),
  q: '',
  target: null,
  pRegion: null,    // 과목 고르기 — 고른 권역
  pUniv: null,      // 과목 고르기 — 고른 대학
  pTrack: null,     // 과목 고르기 — 고른 계열
  course: '일반',   // 내 과목 담기 — 일반 / 과학중점
  cart: {}          // 내 과목 담기 — 슬롯키 → [과목명]
};

/* 담기 슬롯 — 편성표 meta.선택슬롯 과 코호트의 '선택군' 목록에서 만든다.
   코드에 숫자를 박아두면 학년·연도가 바뀔 때마다 두 곳을 고쳐야 한다. */
var SLOTS = [];

function buildSlots() {
  var meta = (D.school.meta && D.school.meta.선택슬롯) || {};
  var only = (COHORT && COHORT.선택군) || Object.keys(meta);
  var out = [];

  only.forEach(function (g) {
    var m = meta[g];
    if (!m) return;
    [1, 2].forEach(function (sem) {
      var cap = m[sem + '학기'];
      if (!cap) return;
      // 교양(선택군3)은 같은 학기의 본 슬롯에 딸린 자리로 본다
      var sub = g === '선택군3';
      out.push({
        key: 'g' + m.학년 + 's' + sem + (sub ? 'e' : ''),
        학년: m.학년, 학기: sem, 선택군: g, 정원: cap, sub: sub,
        이름: sub ? '교양' : m.학년 + '학년 ' + sem + '학기'
      });
    });
  });

  // 학년 → 학기 → 본슬롯 먼저, 교양 뒤로
  out.sort(function (a, b) {
    return a.학년 - b.학년 || a.학기 - b.학기 || (a.sub ? 1 : 0) - (b.sub ? 1 : 0);
  });
  SLOTS = out;
}

/* ── 유틸 ─────────────────────────────────────────── */
function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function debounce(fn, ms) {
  var t;
  return function () {
    var a = arguments, self = this;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(self, a); }, ms);
  };
}

/* ── 자료 읽기 ────────────────────────────────────── */
var COHORT = null;      // 지금 보고 있는 코호트
var CLOSED = null;      // 폐강 목록

function getJSON(name) {
  return fetch('data/' + name + '?v=' + VERSION).then(function (r) {
    if (!r.ok) throw new Error(name + ' ' + r.status);
    return r.json();
  });
}

/* 공통 자료 — 코호트와 무관하게 한 번만 읽는다 */
function loadCommon() {
  return Promise.all([
    getJSON('cohorts.json'),
    getJSON('recommendations.json'),
    getJSON('subject_master.json'),
    getJSON('help_content.json')
  ]).then(function (res) {
    D.cohorts = res[0]; D.rec = res[1]; D.master = res[2]; D.help = res[3];
  });
}

/* 코호트별 자료 — 편성표와 폐강 목록. 학년을 바꾸면 이 둘만 다시 읽는다. */
function loadCohort(c) {
  COHORT = c;
  return Promise.all([
    getJSON(c.편성표),
    getJSON(c.폐강).catch(function () { return { 폐강: [] }; })   // 없으면 폐강 없음
  ]).then(function (res) {
    D.school = res[0];
    CLOSED = res[1];
    applyClosed();
    buildSlots();
    prepare();
  });
}

/* 폐강 반영 — 편성표에서 해당 학기·과정의 개설 표시를 지운다.
   원본 파일은 그대로 두고 메모리에서만 걷어낸다. */
function applyClosed() {
  var list = (CLOSED && CLOSED.폐강) || [];
  D.school.개설.forEach(function (c) { c.폐강 = null; });
  if (!list.length) return;

  list.forEach(function (x) {
    D.school.개설.forEach(function (c) {
      if (c.과목 !== x.과목) return;
      if (x.선택군 && c.선택군 !== x.선택군) return;
      var 과정들 = x.과정 && x.과정.length ? x.과정 : ['일반', '과학중점'];
      var 학기들 = x.학기 && x.학기.length ? x.학기 : [1, 2];
      과정들.forEach(function (g) {
        if (!c.학기 || !c.학기[g]) return;
        c.학기[g] = c.학기[g].filter(function (s) { return 학기들.indexOf(s) === -1; });
      });
      c.폐강 = x.사유 || '폐강';
    });
  });

  // 어느 과정에서도 열리지 않게 된 과목은 목록에서 뺀다
  D.school.개설 = D.school.개설.filter(function (c) {
    if (c.선택군 === '지정' || !c.학기) return true;
    return (c.학기['일반'] || []).length || (c.학기['과학중점'] || []).length;
  });
}

function prepare() {
  // 학년을 바꾸면 앞 코호트의 자료가 남아 있으면 안 된다.
  // 비우지 않으면 모집단위가 두 배로 세어지고, 없는 과목이 개설된 것처럼 보인다.
  SCHOOL = {}; SUBJ = {}; INDEX = {}; UNITS = [];

  GROUP_NAME = D.rec.meta.교과군지정 || {};

  // 과목 마스터
  D.master.forEach(function (m) { SUBJ[m.name] = m; });

  // 학교 개설 과목 — 같은 과목이 2·3학년에 모두 열리기도 한다.
  // 여기서는 과목 소개용으로 하나만 잡아 두고, 슬롯이 걸린 곳에서는 courseIn() 을 쓴다.
  D.school.개설.forEach(function (c) { SCHOOL[c.과목] = c; });

  // 모집단위 평탄화 + 역인덱스
  D.rec.대학.forEach(function (u) {
    u.모집단위.forEach(function (m) {
      var rec = {
        univ: u.대학,
        grade: u.제시강도,
        gradeWhy: u.강도근거,
        split: u.핵심권장구분,
        pubDate: u.발표일,
        source: u.출처,
        notes: u.안내 || [],
        region: m.권역 || '',
        area: m.지역 || '',
        track: m.계열,
        college: m.단과대학,
        unit: m.모집단위,
        core: m.핵심 || [],
        rec: m.권장 || [],
        cond: m.조건 || [],
        memo: m.비고 || ''
      };
      rec.all = rec.core.concat(rec.rec);
      rec.key = rec.univ + '·' + rec.unit;
      UNITS.push(rec);

      rec.all.forEach(function (s) {
        (INDEX[s] || (INDEX[s] = [])).push(rec);
      });
      // 조건 후보도 역인덱스에 넣되, 별도 표시
      rec.cond.forEach(function (c) {
        (c.후보 || []).forEach(function (s) {
          if (rec.all.indexOf(s) === -1) {
            (INDEX[s] || (INDEX[s] = [])).push(rec);
          }
        });
      });
    });
  });
}

/* ── 화면 전환 ────────────────────────────────────── */

/* 화면에서 내린 탭. 코드는 _archive_subject_tab.js 에 보관돼 있다.
   되살릴 때는 이 배열에서 빼고 index.html 의 주석을 푼다. */
var HIDDEN_VIEWS = ['subject'];

function setView(v) {
  // 옛 주소(#/subject)로 들어와도 빈 화면이 나오지 않게 첫 탭으로 돌린다
  if (HIDDEN_VIEWS.indexOf(v) !== -1 || !$('#view-' + v)) v = 'univ';
  state.view = v;
  $$('.tab').forEach(function (t) {
    t.setAttribute('aria-selected', String(t.dataset.view === v));
  });
  $$('.view').forEach(function (s) { s.hidden = true; });
  $('#view-' + v).hidden = false;

  if (location.hash.slice(2).split('/')[0] !== v) {
    // location.hash 에 직접 넣으면 브라우저가 앵커를 찾아 스크롤을 옮긴다.
    // 모바일에서 탭을 누를 때 화면이 맨 아래에서 시작하던 원인이라
    // 주소만 바꾸고 스크롤은 아래에서 직접 맞춘다.
    history.replaceState(null, '', location.pathname + location.search + '#/' + v);
  }
  window.scrollTo(0, 0);
}

/* ── 1. 대학으로 찾기 ─────────────────────────────── */
/* 왼쪽 필터 — 권역 → 대학 → 계열 → 학과 순으로 좁힌다.
   대학이 47곳이라 권역부터 고르지 않으면 칩이 화면을 덮는다. */
function buildFilters() {
  renderRegionChips();
  renderUnivChips();
  renderTrackChips();
}

function renderRegionChips() {
  var rw = $('#f-region');
  var regions = [];
  UNITS.forEach(function (u) {
    if (u.region && regions.indexOf(u.region) === -1) regions.push(u.region);
  });

  rw.innerHTML = regions.map(function (g) {
    var n = UNITS.filter(function (u) { return u.region === g; }).length;
    return '<button type="button" class="chip" data-val="' + esc(g) +
      '" aria-pressed="' + state.region.has(g) + '">' + esc(g) +
      '<span class="chip-n">' + n + '</span></button>';
  }).join('');

  $$('.chip', rw).forEach(function (b) {
    b.onclick = function () {
      pickOne(state.region, LOGIC.chipValue(b), rw);
      // 권역이 바뀌면 그 아래 고른 것들은 의미가 없어진다
      state.univ.clear();
      state.track.clear();
      state.unit = null;
      renderUnivChips();
      renderTrackChips();
      renderUniv();
    };
  });
}

function renderUnivChips() {
  var uw = $('#f-univ');
  // 고른 권역의 대학만 보여 준다. 권역을 안 골랐으면 전부.
  var list = D.rec.대학.filter(function (u) {
    if (!state.region.size) return true;
    return u.모집단위.some(function (m) { return state.region.has(m.권역); });
  });

  uw.innerHTML = list.map(function (u) {
    var n = UNITS.filter(function (x) { return x.univ === u.대학; }).length;
    return '<button type="button" class="chip" data-val="' + esc(u.대학) +
      '" aria-pressed="' + state.univ.has(u.대학) + '">' + esc(u.대학) +
      '<span class="chip-n">' + n + '</span></button>';
  }).join('');

  $$('.chip', uw).forEach(function (b) {
    b.onclick = function () {
      pickOne(state.univ, LOGIC.chipValue(b), uw);
      // 대학을 바꾸면 계열·학과는 지운다. 앞 대학에 없는 계열이 남아 있으면
      // 고를 수도 없고 해제할 수도 없는 상태가 된다.
      state.track.clear();
      state.unit = null;
      renderTrackChips();
      renderUniv();
    };
  });
}

/* 계열 칩. 대학을 골랐으면 그 대학이 제시한 계열만 보여준다.
   없는 조합을 고를 수 있게 두면 빈 결과만 나온다. */
function renderTrackChips() {
  var tw = $('#f-track');
  // 위에서 좁힌 범위(권역·대학) 안에 실제로 있는 계열만 보여 준다
  var 범위 = function (u) {
    if (state.region.size && !state.region.has(u.region)) return false;
    if (state.univ.size && !state.univ.has(u.univ)) return false;
    return true;
  };

  var tracks = D.rec.meta.계열분류.filter(function (t) {
    return UNITS.some(function (u) { return u.track === t && 범위(u); });
  });

  tw.innerHTML = tracks.map(function (t) {
    var n = UNITS.filter(function (u) { return u.track === t && 범위(u); }).length;
    return '<button type="button" class="chip" data-tone="' + esc(t) +
      '" data-val="' + esc(t) + '" aria-pressed="' + state.track.has(t) + '">' +
      esc(t) + '<span class="chip-n">' + n + '</span></button>';
  }).join('');

  $$('.chip', tw).forEach(function (b) {
    b.onclick = function () {
      pickOne(state.track, LOGIC.chipValue(b), tw);
      state.unit = null;   // 계열이 바뀌면 앞서 고른 학과는 목록에 없을 수 있다
      renderUniv();
    };
  });
}

function markChips(sel, val) {
  $$(sel + ' .chip').forEach(function (c) {
    c.setAttribute('aria-pressed', String(LOGIC.chipValue(c) === val));
  });
}

/* 대학·계열은 하나만 고른다. 여러 대학을 섞으면 기준이 뒤엉켜
   오히려 읽기 어려워지므로 고르는 순간 앞의 선택을 바꾼다.
   같은 것을 다시 누르면 해제된다. */
function pickOne(set, val, wrap) {
  var already = set.has(val);
  set.clear();
  if (!already) set.add(val);
  $$('.chip', wrap).forEach(function (c) {
    c.setAttribute('aria-pressed', String(!already && LOGIC.chipValue(c) === val));
  });
}

function filterUnits() {
  // 띄어쓰기·로마숫자 차이를 무시하고 찾는다 ('전기전자' 로도 '전기·전자공학부'가 나오도록)
  var q = LOGIC.squash(state.q);
  return UNITS.filter(function (u) {
    if (state.region.size && !state.region.has(u.region)) return false;
    if (state.univ.size && !state.univ.has(u.univ)) return false;
    if (state.track.size && !state.track.has(u.track)) return false;
    if (state.unit && u.key !== state.unit) return false;
    if (q) {
      var hay = LOGIC.squash(u.unit + u.univ + u.college + u.track);
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
}

/* 왼쪽 학과 목록 — 검색만으로는 무엇이 있는지 몰라 고르기 어렵다.
   대학이나 계열을 좁히면 그 안의 학과를 늘어놓아 눌러서 고르게 한다. */
function renderUnitList() {
  var box = $('#f-unit-box'), w = $('#f-unit');
  // 권역만으로는 학과가 수백 개라 목록이 쓸모없다. 대학이나 계열까지 좁혀야 보여 준다.
  var 좁혀짐 = state.univ.size || state.track.size;
  if (!좁혀짐) { box.hidden = true; w.innerHTML = ''; state.unit = null; return; }

  var list = UNITS.filter(function (u) {
    if (state.region.size && !state.region.has(u.region)) return false;
    if (state.univ.size && !state.univ.has(u.univ)) return false;
    if (state.track.size && !state.track.has(u.track)) return false;
    return true;
  });
  box.hidden = false;

  w.innerHTML = list.map(function (u) {
    return '<button type="button" class="unit-btn' +
      (state.unit === u.key ? ' on' : '') + '" data-key="' + esc(u.key) + '">' +
      esc(u.unit) + '<span class="unit-univ">' + esc(u.univ) + '</span></button>';
  }).join('');

  $$('.unit-btn', w).forEach(function (b) {
    b.onclick = function () {
      state.unit = state.unit === b.dataset.key ? null : b.dataset.key;
      // 목록은 그대로 두고 눌린 표시만 바꾼다 (renderUniv 가 다시 부르면 재귀가 된다)
      $$('.unit-btn', w).forEach(function (x) {
        x.classList.toggle('on', x.dataset.key === state.unit);
      });
      renderUniv();
    };
  });
}

function renderUniv() {
  renderUnitList();
  var list = filterUnits();
  var box = $('#list-univ');

  $('#count-univ').innerHTML = '<strong>' + list.length + '</strong>개 모집단위' +
    (list.length !== UNITS.length ? ' (전체 ' + UNITS.length + ')' : '');

  if (!list.length) {
    box.innerHTML = emptyBlock();
    return;
  }

  box.innerHTML = list.slice(0, 60).map(cardHTML).join('') +
    (list.length > 60
      ? '<p class="pane-note">앞의 60개만 표시했습니다. 검색어나 조건을 좁혀 보세요.</p>'
      : '');
  bindCard(box);
}

/* 결과가 없을 때. 대학을 고르면 그 대학이 낸 계열만 칩으로 나오므로
   '이 대학은 그 계열을 안 냈다'는 조합 자체가 만들어지지 않는다.
   여기서는 검색어를 좁혔을 때만 빈 화면이 된다. */
function emptyBlock() {
  return '<div class="empty"><h3>해당하는 모집단위가 없습니다</h3>' +
    '<p>검색어를 줄이거나 조건을 지워 보세요.</p></div>';
}

function cardHTML(u) {
  var h = '<article class="card" data-track="' + esc(u.track) + '">';

  h += '<div class="card-head"><h3 class="card-unit">' + esc(u.unit) + '</h3>' +
       '<span class="card-univ">' + esc(u.univ) +
       '<span class="grade grade-' + esc(u.grade) + '" title="' + esc(u.gradeWhy) + '">' +
       esc(u.grade) + '</span></span></div>';

  h += '<p class="card-meta">' + esc(u.college) + ' · ' + esc(u.track) + '계열</p>';

  // 비고는 과목이 왜 그렇게 묶였는지 설명한다. 과목보다 먼저 읽혀야 한다.
  if (u.memo) h += '<p class="card-memo">' + esc(u.memo) + '</p>';

  // 학교에 없는 과목은 빼고 보여준다 (사양서 주의 3)
  var core = u.core.filter(inSchool);
  var rec = u.rec.filter(inSchool);
  var off = u.all.filter(function (s) { return !inSchool(s); });

  if (u.split && core.length) {
    h += subRow('핵심', core, true);
  }
  if (rec.length) {
    h += subRow(u.split && core.length ? '권장' : '권장과목', rec, false);
  }
  u.cond.forEach(function (c) { h += condHTML(c); });

  if (off.length) {
    h += '<p class="card-off">권장 ' + u.all.length + '과목 가운데 ' + off.length +
      '과목은 우리 학교에 없어 뺐습니다 <button type="button" class="off-see" ' +
      'data-off="' + esc(off.join('|')) + '">어떤 과목인가요</button></p>';
  }

  return h + '</article>';
}

/* 교과군 지정은 과목이 아니므로 개설 여부를 따지지 않는다 */
function inSchool(s) { return !!GROUP_NAME[s] || !!SCHOOL[s]; }

/* 과목 알약 하나. 접기 전후가 같은 모양이어야 하므로 여기 한 곳에서만 만든다. */
function subChip(s, core) {
  if (GROUP_NAME[s]) {
    // 교과군 지정 — 해당 교과군 과목을 펼쳐 보여준다
    return '<button type="button" class="sub sub-grp' + (core ? ' sub-core' : '') +
      '" data-group="' + esc(GROUP_NAME[s]) + '" data-type="">' + esc(s) + ' 교과</button>';
  }
  return '<button type="button" class="sub sub-has' + (core ? ' sub-core' : '') +
    '" data-subject="' + esc(s) + '">' + esc(s) + '</button>';
}

function subRow(key, arr, core) {
  var h = '<div class="row' + (core ? ' row-core' : '') + '">' +
    '<span class="row-key">' + esc(key) + '</span><span class="row-val">';
  // 과목이 많으면 접어 둔다. 카드 높이가 들쭉날쭉해지는 것을 막는다.
  var FOLD = 10;
  var folded = arr.length > FOLD;
  var show = folded ? arr.slice(0, FOLD) : arr;

  h += show.map(function (s) { return subChip(s, core); }).join('');

  if (folded) {
    h += '<button type="button" class="sub sub-more" data-more="' +
      esc(arr.slice(FOLD).join('|')) + '" data-core="' + (core ? '1' : '') + '">+' +
      (arr.length - FOLD) + '개 더</button>';
  }
  return h + '</span></div>';
}

function condHTML(c) {
  var h = '<div class="cond">';
  h += '<b>조건</b> ' + esc(c.설명 || '');
  if (c.필수포함 && c.필수포함.length) {
    h += '<br>반드시 포함: ' + esc(c.필수포함.join(', '));
  }
  if (c.유형 === '교과군') {
    // 눌러야 보이면 정작 무엇을 고를지 모른 채 지나친다.
    // '편성표에 표시' 탭처럼 우리 학교 과목을 바로 펼쳐 보여 준다.
    var list = schoolInGroup(c.교과군, c.과목유형);
    if (list.length) {
      h += '<div class="cond-list">' +
        list.map(function (s) {
          return '<button type="button" class="sum-pill sum-cond" data-subject="' +
            esc(s) + '">' + esc(s) + '</button>';
        }).join('') + '</div>';
      if (c.최소 && list.length < c.최소) {
        h += '<p class="cond-short">우리 학교에는 ' + list.length +
          '과목만 열립니다. 공동교육과정 등 다른 방법을 담임 선생님과 상의해 보세요.</p>';
      }
    } else {
      h += '<p class="cond-short">우리 학교에 해당 교과군 과목이 없습니다.</p>';
    }
  }
  return h + '</div>';
}

function bindCard(box) {
  $$('[data-subject]', box).forEach(function (b) {
    b.onclick = function () { openSubject(b.dataset.subject); };
  });
  $$('[data-group]', box).forEach(function (b) {
    b.onclick = function () { openGroup(b.dataset.group, b.dataset.type); };
  });
  $$('[data-off]', box).forEach(function (b) {
    b.onclick = function () { openOff(b.dataset.off.split('|')); };
  });
  $$('[data-more]', box).forEach(function (b) {
    b.onclick = function () {
      var core = !!b.dataset.core;
      var frag = b.dataset.more.split('|').map(function (s) {
        return subChip(s, core);
      }).join('');
      b.insertAdjacentHTML('beforebegin', frag);
      var wrap = b.parentNode;
      b.remove();
      bindCard(wrap);
    };
  });
}

function openOff(list) {
  var h = '<div class="doc"><p>아래 과목은 대학이 권장했지만 <b>우리 학교에 개설되지 않았습니다.</b> ' +
    '그래서 목록에서 뺐습니다.</p><div class="pick-grid">';
  h += list.map(function (s) {
    var m = SUBJ[s];
    return '<span class="pill">' + esc(s) +
      (m ? '<span class="pill-type">' + esc(m.교과군) + '</span>' : '') + '</span>';
  }).join('');
  h += '</div><p class="pane-note">들을 수 없는 과목이므로 신경 쓰지 않아도 됩니다. ' +
    '남은 권장과목을 챙기는 편이 낫습니다.</p></div>';
  openModal('우리 학교에 없는 과목', h);
}

/* ── 2. 과목 고르기 ───────────────────────────────── */
/* 대학 → 계열 → 학과 순으로 좁혀 고른다.
   353개 학과 이름을 외워서 칠 수는 없으므로 목록에서 고르게 한다. */
function renderPicker() {
  // 1단계 — 권역
  var rw = $('#p-region');
  var regions = [];
  UNITS.forEach(function (u) {
    if (u.region && regions.indexOf(u.region) === -1) regions.push(u.region);
  });
  rw.innerHTML = regions.map(function (g) {
    var n = UNITS.filter(function (u) { return u.region === g; }).length;
    return '<button type="button" class="chip" data-val="' + esc(g) +
      '" aria-pressed="' + (state.pRegion === g) + '">' + esc(g) +
      '<span class="chip-n">' + n + '</span></button>';
  }).join('');
  $$('.chip', rw).forEach(function (b) {
    b.onclick = function () {
      var v = LOGIC.chipValue(b);
      state.pRegion = state.pRegion === v ? null : v;
      state.pUniv = null; state.pTrack = null; state.target = null;
      renderPicker(); renderPick();
    };
  });

  // 2단계 — 그 권역의 대학
  var uStepBox = $('#step-univ'), uw = $('#p-univ');
  if (!state.pRegion) {
    uStepBox.hidden = true;
    $('#step-track').hidden = true;
    $('#step-unit').hidden = true;
    return;
  }
  uStepBox.hidden = false;

  var univs = [];
  UNITS.forEach(function (u) {
    if (u.region === state.pRegion && univs.indexOf(u.univ) === -1) univs.push(u.univ);
  });
  uw.innerHTML = univs.map(function (name) {
    var n = UNITS.filter(function (x) { return x.univ === name; }).length;
    return '<button type="button" class="chip" data-val="' + esc(name) +
      '" aria-pressed="' + (state.pUniv === name) + '">' + esc(name) +
      '<span class="chip-n">' + n + '</span></button>';
  }).join('');
  $$('.chip', uw).forEach(function (b) {
    b.onclick = function () {
      var v = LOGIC.chipValue(b);
      state.pUniv = state.pUniv === v ? null : v;
      state.pTrack = null;
      state.target = null;
      renderPicker(); renderPick();
    };
  });

  // 3단계 — 고른 대학이 제시한 계열만
  var tStep = $('#step-track'), tw = $('#p-track');
  if (!state.pUniv) {
    tStep.hidden = true;
  } else {
    tStep.hidden = false;
    var tracks = [];
    UNITS.forEach(function (u) {
      if (u.univ === state.pUniv && tracks.indexOf(u.track) === -1) tracks.push(u.track);
    });
    tracks.sort(function (a, b) {
      return D.rec.meta.계열분류.indexOf(a) - D.rec.meta.계열분류.indexOf(b);
    });
    tw.innerHTML = tracks.map(function (t) {
      var n = UNITS.filter(function (u) {
        return u.univ === state.pUniv && u.track === t;
      }).length;
      return '<button type="button" class="chip" data-tone="' + esc(t) +
        '" data-val="' + esc(t) + '" aria-pressed="' + (state.pTrack === t) + '">' +
        esc(t) + '<span class="chip-n">' + n + '</span></button>';
    }).join('');
    $$('.chip', tw).forEach(function (b) {
      b.onclick = function () {
        var v = LOGIC.chipValue(b);
        state.pTrack = state.pTrack === v ? null : v;
        state.target = null;
        renderPicker(); renderPick();
      };
    });
  }

  // 4단계 — 학과 목록
  var uStep = $('#step-unit'), ul = $('#p-unit');
  if (!state.pUniv || !state.pTrack) {
    uStep.hidden = true;
    return;
  }
  uStep.hidden = false;

  var list = UNITS.filter(function (u) {
    return u.univ === state.pUniv && u.track === state.pTrack;
  });

  var byCollege = {};
  list.forEach(function (u) { (byCollege[u.college] || (byCollege[u.college] = [])).push(u); });

  var h = '';
  Object.keys(byCollege).forEach(function (col) {
    if (Object.keys(byCollege).length > 1) {
      h += '<p class="unit-col">' + esc(col) + '</p>';
    }
    h += byCollege[col].map(function (u) {
      var on = state.target && state.target.key === u.key;
      return '<button type="button" class="unit-btn' + (on ? ' on' : '') +
        '" data-key="' + esc(u.key) + '">' + esc(u.unit) + '</button>';
    }).join('');
  });
  ul.innerHTML = h;

  $$('.unit-btn', ul).forEach(function (b) {
    b.onclick = function () {
      state.target = UNITS.filter(function (u) { return u.key === b.dataset.key; })[0];
      renderPicker(); renderPick();
    };
  });
}

function renderPick() {
  var t = state.target;
  var tb = $('#target-box');

  if (t) {
    tb.hidden = false;
    tb.innerHTML = '<h3>' + esc(t.unit) + '</h3>' +
      '<p>' + esc(t.univ) + ' · ' + esc(t.college) + '</p>' +
      '<button type="button" class="clear">선택 해제</button>';
    $('.clear', tb).onclick = function () {
      state.target = null; renderPicker(); renderPick();
    };
  } else {
    tb.hidden = true;
  }

  var body = $('#pick-body');
  var want = {};       // 과목명 → 'core' | 'rec' | 'cond'

  if (t) {
    t.rec.forEach(function (s) { if (!GROUP_NAME[s]) want[s] = 'rec'; });
    t.core.forEach(function (s) { if (!GROUP_NAME[s]) want[s] = 'core'; });
    t.cond.forEach(function (c) {
      (c.후보 || []).forEach(function (s) { if (!want[s]) want[s] = 'cond'; });
      // 교과군으로만 제시된 조건도 우리 학교 과목에 표시해 준다
      if (c.유형 === '교과군') {
        schoolInGroup(c.교과군, c.과목유형).forEach(function (s) {
          if (!want[s]) want[s] = 'cond';
        });
      }
    });
    // 미적분Ⅱ는 미적분Ⅰ을 전제한다. 대학이 Ⅱ만 적었어도 Ⅰ은 사실상 필요하다.
    if (want['미적분Ⅱ'] && !want['미적분Ⅰ']) want['미적분Ⅰ'] = 'pre';
  }

  var h = '';

  if (t) {
    // 이 탭은 '그 과목이 편성표 어디에 있는지' 보는 곳이다.
    // 무엇을 담으라는 안내는 '내 과목 담기'에서 한다.
    h += summaryHTML(t, want);
  } else {
    h += '<div class="empty"><h3>' +
      (!state.pUniv ? '먼저 대학을 골라 주세요'
        : !state.pTrack ? '계열을 골라 주세요' : '학과를 골라 주세요') + '</h3>' +
      '<p>왼쪽에서 대학 → 계열 → 학과 순으로 고르면<br>' +
      '그 학과가 권장하는 과목이 아래 편성표에 표시됩니다.</p></div>';
  }

  h += '<div class="legend">' +
    '<span><i class="l-core"></i>핵심과목</span>' +
    '<span><i class="l-hit"></i>권장과목</span>' +
    '<span><i class="l-cond"></i>조건 후보</span>' +
    (state.target && want['미적분Ⅰ'] === 'pre'
      ? '<span><i class="l-pre"></i>선수과목</span>' : '') +
    '<span><i class="l-off"></i>해당 없음</span></div>';

  // 학기 단위로 나눈다. 선택군으로만 묶으면 어느 과목이 몇 학기에
  // 열리는지 보이지 않아, 정작 편성표를 보는 목적에 닿지 않는다.
  SLOTS.forEach(function (s) {
    h += slotHTML(s, want);
  });

  body.innerHTML = h;
  $$('[data-help]', body).forEach(function (b) {
    b.onclick = function () { openHelp(b.dataset.help); };
  });
  $$('[data-off]', body).forEach(function (b) {
    b.onclick = function () { openOff(b.dataset.off.split('|')); };
  });
  $$('[data-subject]', body).forEach(function (b) {
    b.onclick = function () { openSubject(b.dataset.subject); };
  });
}

/* 교과군 조건(예: '제2외국어/한문 1과목 이상')에 해당하는 우리 학교 과목.
   LOGIC.groupOf 는 소수 교과군을 '기타'로 묶으므로 여기서는 쓰지 않는다. */
function schoolInGroup(group, type) {
  return D.school.개설.filter(function (c) {
    if (c.선택군 === '지정') return false;
    if (c.교과군 !== group) return false;
    if (type && c.유형 !== type) return false;
    return true;
  }).map(function (c) { return c.과목; })
    // 2·3학년에 모두 열리는 과목은 두 번 잡힌다. 같은 과목을 두 번 보여줄 이유가 없다.
    .filter(function (n, i, a) { return a.indexOf(n) === i; });
}

function summaryHTML(t, want) {
  var offered = [], missing = [], groups = [];
  t.all.forEach(function (s) {
    if (GROUP_NAME[s]) {                // 과목이 아니라 교과군 이름
      if (groups.indexOf(GROUP_NAME[s]) === -1) groups.push(GROUP_NAME[s]);
      return;
    }
    if (SCHOOL[s]) offered.push(s); else missing.push(s);
  });
  var real = offered.length + missing.length;

  var h = '<div class="summary"><h3>' + esc(t.unit) + '이(가) 권장하는 과목</h3>';

  if (!t.all.length && !t.cond.length) {
    h += '<p>이 모집단위는 권장과목을 두지 않았습니다. 진로와 적성에 따라 자유롭게 고르세요.</p>';
    return h + '</div>';
  }

  if (real) {
    h += '<p>권장 ' + real + '과목 가운데 <b>' + offered.length +
         '과목</b>을 우리 학교에서 들을 수 있습니다.';
  } else {
    // 과목을 콕 집지 않고 교과군으로만 제시한 경우 (서울대 유형Ⅰ 등)
    h += '<p>특정 과목이 아니라 <b>' + esc(groups.join(', ')) +
         ' 교과(군)</b>에서 이수하도록 안내하고 있습니다.';
  }
  h += ' 제시 강도는 <b>' + esc(t.grade) + '</b>입니다. ' +
       '<button type="button" class="cond-open" data-help="weight">무슨 뜻인가요</button></p>';

  // 어떤 과목인지 바로 보여 준다. 숫자만 있으면 무엇을 챙겨야 할지 알 수 없다.
  function chips(list, cls) {
    return list.map(function (s) {
      var off = !SCHOOL[s];
      return '<button type="button" class="sum-pill ' + cls + (off ? ' sum-off' : '') +
        '" data-subject="' + esc(s) + '">' + esc(s) +
        (off ? '<span class="sum-x">미개설</span>' : '') + '</button>';
    }).join('');
  }

  var core = t.core.filter(function (s) { return !GROUP_NAME[s]; });
  var rec = t.rec.filter(function (s) { return !GROUP_NAME[s] && core.indexOf(s) === -1; });

  // 권장과목이 아래 조건의 후보로 남김없이 다시 나오면(부산대처럼 조건이 곧 권장인 경우)
  // 위에 한 번 더 늘어놓지 않는다. 같은 과목이 두 줄에 걸쳐 나오면 읽기만 어렵다.
  var 후보전부 = [];
  t.cond.forEach(function (c) {
    (c.후보 || []).forEach(function (s) {
      if (!GROUP_NAME[s] && 후보전부.indexOf(s) === -1) 후보전부.push(s);
    });
  });
  var 조건이덮음 = 후보전부.length > 0 &&
    core.concat(rec).every(function (s) { return 후보전부.indexOf(s) !== -1; });

  h += '<div class="sum-list">';
  if (core.length && !조건이덮음) {
    h += '<div class="sum-row"><span class="sum-key">' +
      (t.split && core.length ? '핵심과목' : '권장과목') + '</span><div class="sum-pills">' +
      chips(core, 'sum-core') + '</div></div>';
  }
  if (rec.length && !조건이덮음) {
    h += '<div class="sum-row"><span class="sum-key">' +
      '권장과목' + '</span><div class="sum-pills">' +
      chips(rec, 'sum-rec') + '</div></div>';
  }
  t.cond.forEach(function (c) {
    if (c.유형 === '교과군') {
      // 과목이 특정되지 않았으니 우리 학교의 해당 과목을 바로 펼쳐 보여 준다
      var list = schoolInGroup(c.교과군, c.과목유형);
      // 요구사항을 굵게 앞세우고, 그것을 채울 수 있는 우리 학교 과목을 바로 아래 편다.
      // 대학이 요구한 수보다 우리 학교 과목이 적으면 그 사실을 알려 준다.
      var 모자람 = c.최소 && list.length && list.length < c.최소;
      h += '<div class="sum-row"><span class="sum-key">조건</span>' +
        '<div class="sum-pills"><span class="sum-need">' + esc(c.설명 || '') + '</span>' +
        (list.length
          ? '<div class="sum-fold-in">' + chips(list, 'sum-cond') + '</div>' +
            (모자람
              ? '<span class="sum-note sum-short">우리 학교에는 ' + list.length +
                '과목만 열립니다. 공동교육과정 등 다른 방법을 담임 선생님과 상의해 보세요.</span>'
              : '')
          : '<span class="sum-note">우리 학교에 해당 과목이 없습니다.</span>') +
        '</div></div>';
      return;
    }
    var cand = (c.후보 || []).filter(function (s) { return !GROUP_NAME[s]; });
    if (!cand.length) return;

    // 어떤 과목 가운데 몇 과목인지가 핵심이다. 후보를 반드시 함께 보여 준다.
    // (위 권장과목과 겹친다고 목록을 생략하면 '위 8과목 중 3과목'처럼
    //  무엇을 고르라는 것인지 알 수 없게 된다.)
    h += '<div class="sum-row"><span class="sum-key">조건</span><div class="sum-pills">' +
      '<span class="sum-need">' + esc(c.설명 || (cand.length + '과목 중 ' + c.최소 + '과목 이상')) +
      '</span><div class="sum-fold-in">' + chips(cand, 'sum-cond') + '</div></div></div>';
  });
  h += '</div>';

  if (missing.length) {
    h += '<p class="miss">이 가운데 ' + missing.length +
      '과목은 우리 학교에 없습니다 (위에서 ‘미개설’ 표시) ' +
      '<button type="button" class="off-see" data-off="' + esc(missing.join('|')) +
      '">모아 보기</button></p>';
  }
  return h + '</div>';
}

function slotHTML(slot, want) {
  // slot 은 '내 과목 담기'와 같은 학기 단위 슬롯이다.
  var rows = D.school.개설.filter(function (c) { return offeredIn(c, slot); });
  if (!rows.length) return '';

  var h = '<section class="group' + (slot.sub ? ' my-sub' : '') + '">' +
    '<div class="group-head">' +
    (slot.sub ? '<h4>' + esc(slot.이름) + '</h4>' : '<h3>' + esc(slot.이름) + '</h3>') +
    '<span class="slot">택' + slot.정원 + '</span></div>';

  var groups = [];
  rows.forEach(function (c) { if (groups.indexOf(c.교과군) === -1) groups.push(c.교과군); });

  groups.forEach(function (g) {
    h += '<div class="sect"><p class="sect-key">' + esc(g) + '</p><div class="pick-grid">';
    h += rows.filter(function (c) { return c.교과군 === g; }).sort(byType).map(function (c) {
      var kind = want[c.과목];
      var cls = kind === 'core' ? 'pill-core' : kind === 'rec' ? 'pill-hit'
              : kind === 'cond' ? 'pill-cond' : kind === 'pre' ? 'pill-pre' : '';
      // 선수과목은 점선 테두리(pill-pre)로 이미 구분된다.
      // 라벨 자리에는 과목 유형(일반/진로/융합)을 그대로 둔다.
      var tag = c.유형;
      // 눌러서 '과목으로 찾기'와 같은 상세 창을 연다
      // 이 탭에서는 수능 출제과목만 표시한다. 편성표를 훑는 자리라
      // 다른 평가 유형까지 붙이면 표가 어수선해진다.
      var 수능 = c.평가 === '수능'
        ? '<span class="pill-eval ev-수능" title="' + esc(EVAL_MARK.수능.설명) + '">' +
          EVAL_ICON.수능 + ' 수능</span>'
        : '';
      return '<button type="button" class="pill ' + cls + '" data-subject="' + esc(c.과목) +
        '" title="' + esc(c.과목) + ' 자세히 보기">' + esc(c.과목) +
        '<span class="pill-type">' + esc(tag) + '</span>' + 수능 + '</button>';
    }).join('');
    h += '</div></div>';
  });

  return h + '</section>';
}

/* ── 3. 과목으로 찾기 ─────────────────────────────── */
/* ── 4. 내 과목 담기 ──────────────────────────────── */

/* 그 슬롯에서 고를 수 있는 과목인지 — 편성표의 학기·과정 표기를 그대로 따른다 */
function offeredIn(c, slot) {
  if (c.선택군 !== slot.선택군) return false;
  var sem = (c.학기 || {})[state.course] || [];
  return sem.indexOf(slot.학기) !== -1;
}

/* 그 슬롯에서 열리는 레코드를 찾는다.
   같은 과목이 2·3학년에 모두 열리는 경우(세포와 물질대사 등)가 있어
   과목 이름만으로 찾으면 한쪽(뒤에 읽힌 3학년)만 잡힌다. */
/* 같은 교과군 안에서는 일반 → 진로 → 융합 순으로 본다.
   편성표 원본은 이 순서가 섞여 있어 그대로 두면 읽기 어렵다. */
var TYPE_ORDER = { 공통: 0, 일반: 1, 진로: 2, 융합: 3 };

function byType(a, b) {
  var ta = TYPE_ORDER[a.유형], tb = TYPE_ORDER[b.유형];
  if (ta === undefined) ta = 9;
  if (tb === undefined) tb = 9;
  return ta - tb;
}

function courseIn(name, slot) {
  var rows = D.school.개설;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].과목 === name && offeredIn(rows[i], slot)) return rows[i];
  }
  return null;
}

/* 평가 유형 표시 — 편성표의 색상 범례를 그대로 옮긴 것.
   '상대절대'(가장 흔한 경우)는 표시하지 않는다. 모든 과목에 배지가 붙으면 구분이 안 된다. */
var EVAL_MARK = {
  수능: { 약칭: '수능', 설명: '대학수학능력시험 출제과목' },
  석차미기재: { 약칭: '석차 미기재', 설명: '상대평가 석차 등급을 기재하지 않는 과목' },
  성취3단계: { 약칭: '성취 3단계', 설명: '성취도 3단계(A·B·C)로 평가하는 과목' },
  이수여부: { 약칭: 'P', 설명: '이수 여부만 기재하는 과목' },
  // 가장 흔한 경우라 목록에서는 배지를 붙이지 않는다(bare:true).
  // 다만 과목 설명에서는 이것도 분명히 밝힌다.
  상대절대: { 약칭: '', 설명: '상대평가와 절대평가를 모두 기재하는 과목', bare: true }
};

/* 과목 설명에 붙는 아이콘 — 글자만으로는 유형이 잘 구분되지 않는다 */
var EVAL_ICON = {
  수능: '◎', 석차미기재: '◑', 성취3단계: '△', 이수여부: 'P', 상대절대: '●'
};

function evalMark(c) {
  var m = EVAL_MARK[c.평가];
  if (!m || m.bare) return '';
  return '<span class="pill-eval ev-' + c.평가 + '" title="' + esc(m.설명) + '">' +
    EVAL_ICON[c.평가] + ' ' + esc(m.약칭) + '</span>';
}

/* 범례 — 지금 이 코호트에 실제로 나오는 평가 유형만 보여 준다.
   쓰이지 않는 유형까지 늘어놓으면 학생이 없는 배지를 찾게 된다. */
function evalLegend() {
  var 있는유형 = {};
  D.school.개설.forEach(function (c) {
    if (c.선택군 !== '지정' && EVAL_MARK[c.평가] && !EVAL_MARK[c.평가].bare) {
      있는유형[c.평가] = true;
    }
  });
  var keys = Object.keys(EVAL_MARK).filter(function (k) { return 있는유형[k]; });
  if (!keys.length) return '';

  return '<div class="eval-legend"><span>표시 안내</span>' +
    keys.map(function (k) {
      return '<span><span class="pill-eval ev-' + k + '">' + EVAL_ICON[k] + ' ' +
        esc(EVAL_MARK[k].약칭) + '</span> ' + esc(EVAL_MARK[k].설명) + '</span>';
    }).join('') +
    '<span>' + EVAL_ICON.상대절대 + ' 표시가 없으면 ' +
    esc(EVAL_MARK.상대절대.설명) + '입니다.</span></div>';
}

function cartOf(key) { return state.cart[key] || (state.cart[key] = []); }

function cartHas(name) {
  for (var k in state.cart) if (state.cart[k].indexOf(name) !== -1) return true;
  return false;
}

/* 담은 과목을 학기 순서대로 편다. 선수과목이 '앞선 학기에' 있는지 볼 때 쓴다. */
function cartSeq() {
  var seq = [];
  SLOTS.forEach(function (s, i) {
    cartOf(s.key).forEach(function (n) { seq.push({ name: n, order: i, slot: s }); });
  });
  return seq;
}

/* 편성 규칙 검사 — school_courses.json 의 meta.유의사항을 코드로 옮긴 것.
   결과는 체크리스트로 보여 주고, 못 지킨 항목은 무엇이 모자란지 짚는다. */
function checkRules() {
  var picked = [];
  SLOTS.forEach(function (s) {
    cartOf(s.key).forEach(function (n) {
      var c = courseIn(n, s) || SCHOOL[n];
      if (c) picked.push({ name: n, 교과군: c.교과군, 유형: c.유형, slot: s });
    });
  });
  var byGroup = function (g) {
    return picked.filter(function (p) { return p.교과군 === g; });
  };
  var out = [];
  var R = (D.school.meta && D.school.meta.이수규칙) || {};

  // ① 교과(군)별 최소 이수 — 편성표 비고에 적힌 조건을 그대로 보여 준다.
  (R.교과군최소 || []).forEach(function (rule) {
    var got = picked.filter(function (p) {
      return rule.교과군.indexOf(p.교과군) !== -1;
    });
    out.push({
      ok: got.length >= rule.최소,
      text: rule.이름,
      detail: got.length >= rule.최소
        ? got.map(function (p) { return p.name; }).join(', ')
        : '아직 담지 않았습니다.'
    });
  });

  // ② 국어·수학·영어 합계 상한 (이수학점 총합 81학점 제한)
  if (R.교과군최대) {
    var mx = R.교과군최대;
    var kme = picked.filter(function (p) {
      return mx.교과군.indexOf(p.교과군) !== -1;
    });
    out.push({
      ok: kme.length <= mx.최대,
      text: mx.이름,
      detail: '지금 ' + kme.length + '과목' +
        (kme.length > mx.최대 ? ' — ' + (kme.length - mx.최대) + '과목을 빼야 합니다.'
                              : ' (남은 자리 ' + (mx.최대 - kme.length) + ')')
    });
  }

  if (state.course !== '과학중점' || !R.과학중점) return out;
  var S = R.과학중점;

  // ③ 과학중점 — 과제 연구 필수
  if (S.과제연구) {
    var hasPjt = picked.some(function (p) { return p.name === S.과제연구; });
    out.push({
      ok: hasPjt, text: S.과제연구 + ' 이수 (과학중점)',
      detail: hasPjt ? '담았습니다.' : '1·2학기 중 한 학기에 반드시 담아야 합니다.'
    });
  }

  // ④ 과학중점 — 과학 일반선택 모두 + 진로·융합 최소
  if (S.일반선택필수 && S.일반선택필수.length) {
    var need = S.일반선택필수;
    var got4 = need.filter(function (n) {
      return picked.some(function (p) { return p.name === n; });
    });
    out.push({
      ok: got4.length === need.length,
      text: '과학 일반선택 ' + need.length + '과목 모두 이수 (과학중점)',
      detail: got4.length === need.length ? need.join('·') + ' 모두 담았습니다.'
        : '빠진 과목: ' + need.filter(function (n) { return got4.indexOf(n) === -1; }).join(', ')
    });
  }

  if (S.심화최소) {
    var 심화 = byGroup('과학').filter(function (p) {
      return p.유형 === '진로' || p.유형 === '융합';
    });
    out.push({
      ok: 심화.length >= S.심화최소,
      text: '과학 진로·융합 ' + S.심화최소 + '과목 이상 (과학중점)',
      detail: '지금 ' + 심화.length + '과목' +
        (심화.length >= S.심화최소 ? '' : ' — ' + (S.심화최소 - 심화.length) + '과목 더 필요합니다.')
    });
  }

  // ⑤ 과학중점 — 수학 최소
  if (S.수학최소) {
    var math = byGroup('수학');
    out.push({
      ok: math.length >= S.수학최소,
      text: '수학 ' + S.수학최소 + '과목 이상 (과학중점)',
      detail: '지금 ' + math.length + '과목' +
        (math.length >= S.수학최소 ? '' : ' — ' + (S.수학최소 - math.length) + '과목 더 필요합니다.')
    });
  }

  return out;
}

/* 선수과목 검사 — school_courses.json 의 meta.선수과목 기준 */
function preCheck() {
  var pre = (D.school.meta && D.school.meta.선수과목) || {};
  var seq = cartSeq(), out = [];
  seq.forEach(function (item) {
    var need = pre[item.name];
    if (!need) return;
    var missing = need.filter(function (p) {
      var found = seq.filter(function (x) { return x.name === p; });
      // 같은 학기여도 되지만, 뒤 학기에 있으면 순서가 어긋난다
      return !found.some(function (x) { return x.order <= item.order; });
    });
    if (missing.length) out.push({ 과목: item.name, 슬롯: item.slot.이름, 필요: missing });
  });
  return out;
}

function toggleCart(name, key) {
  var arr = cartOf(key), i = arr.indexOf(name);
  if (i !== -1) { arr.splice(i, 1); saveCart(); renderMy(); return; }

  var slot = SLOTS.filter(function (s) { return s.key === key; })[0];

  // 같은 과목이 2·3학년에 모두 열려도 이수는 한 번뿐이다.
  // 양쪽에 담으면 이수 조건을 채운 것처럼 잘못 세어진다.
  if (cartHas(name)) {
    var 담은곳 = SLOTS.filter(function (s) {
      return cartOf(s.key).indexOf(name) !== -1;
    })[0];
    flash('‘' + name + '’은(는) 이미 ' + (담은곳 ? 담은곳.이름 + '에 ' : '') +
          '담았습니다. 같은 과목은 한 번만 이수합니다.');
    return;
  }

  if (arr.length >= slot.정원) {
    flash(slot.이름 + '은(는) ' + slot.정원 + '과목까지만 고를 수 있습니다. ' +
          '하나를 빼고 다시 담아 주세요.');
    return;
  }
  arr.push(name);
  saveCart();
  renderMy();

  // 선수과목 안내는 담은 직후에 알려 주는 편이 잡기 쉽다
  var pre = (D.school.meta && D.school.meta.선수과목) || {};
  var need = pre[name];
  if (need) {
    var lack = need.filter(function (p) { return !cartHas(p); });
    if (lack.length) {
      flash('‘' + name + '’을(를) 들으려면 ' +
            lack.map(function (x) { return '‘' + x + '’'; }).join('와 ') +
            ' 과목의 이수가 필수적으로 요구됩니다.', true);
    }
  }
}

var flashT = null;
function flash(msg, warn) {
  var el = $('#flash');
  if (!el) {
    el = document.createElement('div');
    el.id = 'flash'; el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = 'flash' + (warn ? ' flash-warn' : '') + ' on';
  clearTimeout(flashT);
  flashT = setTimeout(function () { el.className = 'flash'; }, 5200);
}

function saveCart() {
  // 코호트가 다르면 남의 담기 목록이 되므로 id를 함께 저장한다
  try {
    localStorage.setItem('cart2028', JSON.stringify({
      id: COHORT ? COHORT.id : '', c: state.course, k: state.cart
    }));
  } catch (e) { /* 사파리 프라이빗 모드 등 — 저장 못 해도 기능은 돌아간다 */ }

  var flat = [];
  SLOTS.forEach(function (s) {
    cartOf(s.key).forEach(function (n) { flat.push(s.key + ':' + n); });
  });
  var p = new URLSearchParams(location.search);
  if (COHORT) p.set('y', COHORT.id);
  if (flat.length) {
    p.set('course', state.course);
    p.set('cart', flat.join('|'));
  } else {
    p.delete('course'); p.delete('cart');
  }
  history.replaceState(null, '', '?' + p.toString() + location.hash);
}

/* 저장된 담기 목록 읽기 — URL이 있으면 그쪽을 우선한다 */
function readCart() {
  var p = new URLSearchParams(location.search);
  if (p.get('cart')) {
    var k = {};
    p.get('cart').split('|').forEach(function (t) {
      var i = t.indexOf(':');
      if (i > 0) (k[t.slice(0, i)] || (k[t.slice(0, i)] = [])).push(t.slice(i + 1));
    });
    return { id: p.get('y') || '', c: p.get('course') === '과학중점' ? '과학중점' : '일반', k: k };
  }
  try {
    var raw = localStorage.getItem('cart2028');
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function renderMy() {
  // 과정 칩
  var cw = $('#my-course');
  if (!cw.childNodes.length) {
    ['일반', '과학중점'].forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = t + '과정';
      b.onclick = function () {
        state.course = t;
        // 과정을 바꾸면 그 과정에 없는 과목은 자동으로 빠진다
        SLOTS.forEach(function (s) {
          state.cart[s.key] = cartOf(s.key).filter(function (n) {
            return !!courseIn(n, s);
          });
        });
        saveCart(); renderMy();
      };
      cw.appendChild(b);
    });
  }
  $$('.chip', cw).forEach(function (b) {
    b.setAttribute('aria-pressed', String(b.textContent === state.course + '과정'));
  });

  var want = {};   // 이 탭에서는 지망 학과를 따로 띄우지 않는다 ('편성표에 표시' 탭과 역할 분리)

  // 슬롯별 현황
  var st = '<ul class="my-count">';
  SLOTS.forEach(function (s) {
    var n = cartOf(s.key).length;
    var cls = (n >= s.정원 ? 'full' : '') + (s.sub ? ' sub' : '');
    st += '<li' + (cls.trim() ? ' class="' + cls.trim() + '"' : '') + '><span>' +
      (s.sub ? '↳ ' : '') + esc(s.이름) +
      '</span><b>' + n + ' / ' + s.정원 + '</b></li>';
  });
  st += '</ul>';

  // 편성 규칙 체크리스트
  var rules = checkRules();
  var bad = rules.filter(function (r) { return !r.ok; }).length;
  st += '<div class="rules"><h4>우리 학교 이수 조건' +
    (bad ? '<span class="rules-bad">' + bad + '개 미충족</span>'
         : '<span class="rules-ok">모두 충족</span>') + '</h4><ul>';
  rules.forEach(function (r) {
    st += '<li class="' + (r.ok ? 'r-ok' : 'r-no') + '">' +
      '<span class="r-mark" aria-hidden="true">' + (r.ok ? '✓' : '!') + '</span>' +
      '<span class="r-txt"><b>' + esc(r.text) + '</b>' +
      '<em>' + esc(r.detail) + '</em></span></li>';
  });
  st += '</ul></div>';

  var lack = preCheck();
  if (lack.length) {
    st += '<div class="warn warn-sm warn-pre"><h4>⚠ 먼저 이수해야 하는 과목이 있습니다</h4><ul>';
    lack.forEach(function (x) {
      st += '<li>‘' + esc(x.과목) + '’(' + esc(x.슬롯) + ')을(를) 들으려면 ' +
        '<b>' + x.필요.map(function (p) { return '‘' + esc(p) + '’'; }).join('와 ') +
        '</b>을(를) 먼저 이수해야 합니다.</li>';
    });
    st += '</ul></div>';
  }
  $('#my-status').innerHTML = st;

  // 본문 — 슬롯마다 고를 수 있는 과목
  var h = '<div class="my-intro"><h3>2·3학년 과목을 함께 골라 보세요</h3>' +
    '<p>우리 학교 편성표에 맞춰 그 학기에 열리는 과목만 나옵니다. ' +
    '과목을 누르면 담기고, 다시 누르면 빠집니다. ' +
    '이수 조건은 2·3학년을 합쳐서 따지므로 두 학년을 함께 놓고 봐야 확인됩니다. ' +
    '이미 들은 학년이 있다면 그대로 짚어 두면 됩니다.</p>' + evalLegend() + '</div>';

  SLOTS.forEach(function (s) {
    var rows = D.school.개설.filter(function (c) { return offeredIn(c, s); });
    var picked = cartOf(s.key);
    h += '<section class="group my-slot' + (s.sub ? ' my-sub' : '') + '">' +
      '<div class="group-head">' +
      (s.sub ? '<h4>' + esc(s.이름) + '</h4>' : '<h3>' + esc(s.이름) + '</h3>') +
      '<span class="slot' + (picked.length >= s.정원 ? ' slot-full' : '') + '">' +
      picked.length + ' / ' + s.정원 + '과목</span></div>';

    var groups = [];
    rows.forEach(function (c) { if (groups.indexOf(c.교과군) === -1) groups.push(c.교과군); });
    groups.forEach(function (g) {
      h += '<div class="sect"><p class="sect-key">' + esc(g) + '</p><div class="pick-grid">';
      h += rows.filter(function (c) { return c.교과군 === g; }).sort(byType).map(function (c) {
        var on = picked.indexOf(c.과목) !== -1;
        var kind = want[c.과목];
        var cls = 'pill my-pill' + (on ? ' on' : '') +
          (kind === 'core' ? ' pill-core' : kind ? ' pill-hit' : '');
        return '<button type="button" class="' + cls + '" data-add="' + esc(c.과목) +
          '" data-slot="' + s.key + '" aria-pressed="' + on + '">' +
          esc(c.과목) + '<span class="pill-type">' + esc(c.유형) + '</span>' +
          evalMark(c) + '</button>';
      }).join('');
      h += '</div></div>';
    });
    h += '</section>';
  });

  var body = $('#my-body');
  body.innerHTML = h;
  $$('[data-add]', body).forEach(function (b) {
    b.onclick = function () { toggleCart(b.dataset.add, b.dataset.slot); };
  });
}

/* ── 모달 ─────────────────────────────────────────── */
var lastFocus = null;

function openModal(title, html) {
  lastFocus = document.activeElement;
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = html;
  $('#modal').hidden = false;
  document.body.style.overflow = 'hidden';
  $('.modal-x').focus();

  $$('[data-help]', $('#modal-body')).forEach(function (b) {
    b.onclick = function () { openHelp(b.dataset.help); };
  });
  $$('[data-subject]', $('#modal-body')).forEach(function (b) {
    b.onclick = function () { openSubject(b.dataset.subject); };
  });
}

function closeModal() {
  $('#modal').hidden = true;
  document.body.style.overflow = '';
  if (lastFocus) lastFocus.focus();
}

function openSubject(name) {
  var arr = INDEX[name] || [];
  var m = SUBJ[name];
  var h = '<div class="doc">';

  // 어떤 과목인지 먼저 알려준다 (2022 개정 교육과정 과목 소개 기반)
  if (m && m.설명) {
    h += '<p class="subj-desc">' + esc(m.설명) + '</p>';
  }

  h += '<p>';
  if (m) h += esc(m.교과군) + ' 교과 · ' + esc(m.유형) + '선택. ';
  // 같은 과목이 2·3학년에 모두 열리기도 한다. 한쪽만 알려 주면 선택 폭이 좁아 보인다.
  var scs = D.school.개설.filter(function (c) { return c.과목 === name; });
  var sc = scs[0];
  h += scs.length
    ? '우리 학교 ' + scs.map(function (c) {
        return '<b>' + esc(c.선택군) + '</b>(' + esc(c.학년) + '학년)';
      }).join(', ') + '에 열려 있습니다.'
    : '<b>우리 학교에는 개설되지 않았습니다.</b>';
  h += '</p>';

  // 평가 방식 — 목록의 배지와 같은 색으로 묶어 한눈에 이어지게 한다
  if (sc && EVAL_MARK[sc.평가]) {
    h += '<p class="subj-eval ev-' + sc.평가 + '">' +
      '<span class="subj-eval-icon" aria-hidden="true">' + EVAL_ICON[sc.평가] + '</span>' +
      esc(EVAL_MARK[sc.평가].설명) + '입니다.</p>';
  }

  // 선수과목 — 먼저 들어야 하는 과목이 있으면 알려 준다
  var need = ((D.school.meta && D.school.meta.선수과목) || {})[name];
  if (need && need.length) {
    h += '<p class="subj-pre"><span class="subj-pre-icon" aria-hidden="true">⚠</span>' +
      '<span><b>' + esc(need.join(', ')) + '</b> 과목을 먼저 이수해야 합니다.</span></p>';
  }

  if (!arr.length) {
    h += '<p>이 과목을 권장한 모집단위가 없습니다.</p>';
    return openModal(name, h + '</div>');
  }

  var byUniv = {};
  arr.forEach(function (u) { (byUniv[u.univ] || (byUniv[u.univ] = [])).push(u); });
  var univs = Object.keys(byUniv);

  // 대학 목록은 접어 둔다. 과목 설명을 보러 온 학생에게
  // 대학 이름이 먼저 쏟아지면 정작 과목 이야기가 묻힌다.
  h += '<details class="subj-univs"><summary class="su-head">' +
    '<span>이 과목을 권장하는 곳은 <b>' + arr.length + '개 모집단위</b>입니다. ' +
    '<span class="sub-quiet">(' + univs.length + '개 대학)</span></span>' +
    '<span class="su-more"><span class="su-open">대학 보기</span>' +
    '<span class="su-close">접기</span></span></summary>';

  h += '<div class="subj-detail">';
  univs.forEach(function (uv) {
    var list = byUniv[uv];
    h += '<details class="du"><summary>' +
      '<span class="du-univ">' + esc(uv) + '</span>' +
      '<span class="du-n">' + list.length + '곳</span></summary>' +
      '<p class="du-units">' +
      esc(list.map(function (x) { return x.unit; }).join(', ')) +
      '</p></details>';
  });
  h += '</div></details>';

  openModal(name, h + '</div>');
}

function openGroup(group, type) {
  var rows = D.school.개설.filter(function (c) {
    if (c.교과군 !== group) return false;
    if (type && c.유형 !== type) return false;
    return c.선택군 !== '지정';
  });

  var h = '<div class="doc"><p>우리 학교가 연 ' + esc(group) +
    (type ? ' ' + esc(type) + '선택' : '') + ' 과목입니다. ' +
    '이 가운데에서 조건에 맞는 수만큼 고르면 됩니다.</p>';

  var slots = [];
  rows.forEach(function (c) { if (slots.indexOf(c.선택군) === -1) slots.push(c.선택군); });

  slots.forEach(function (s) {
    h += '<div class="cur-slot"><h3>' + esc(s) + '</h3><div class="cur-s">';
    h += rows.filter(function (c) { return c.선택군 === s; }).map(function (c) {
      return '<span class="pill">' + esc(c.과목) +
        '<span class="pill-type">' + esc(c.유형) + '</span></span>';
    }).join('');
    h += '</div></div>';
  });

  if (!rows.length) h += '<p>해당하는 과목이 없습니다.</p>';

  openModal(group + (type ? ' ' + type + '선택' : '') + ' 과목', h + '</div>');
}

function openCurriculum() {
  var h = '<div class="doc"><p>' + esc(D.school.meta.출처) + '</p>';

  ['지정', '선택군1', '선택군2', '선택군3'].forEach(function (slot) {
    var rows = D.school.개설.filter(function (c) { return c.선택군 === slot; });
    if (!rows.length) return;

    var meta = D.school.meta.선택슬롯[slot];
    var sl = slot === '지정' ? '전교생 공통' : '';
    if (meta) {
      sl = meta.학년 + '학년';
      if (meta['1학기']) sl += ' · 1학기 택' + meta['1학기'];
      if (meta['2학기']) sl += ' · 2학기 택' + meta['2학기'];
    }

    h += '<div class="cur-slot"><h3>' + esc(slot) + '</h3><p class="sl">' + esc(sl) + '</p>';

    var groups = [];
    rows.forEach(function (c) { if (groups.indexOf(c.교과군) === -1) groups.push(c.교과군); });
    groups.forEach(function (g) {
      h += '<div class="cur-row"><span class="cur-g">' + esc(g) + '</span><span class="cur-s">';
      h += rows.filter(function (c) { return c.교과군 === g; }).sort(byType).map(function (c) {
        return '<span class="pill">' + esc(c.과목) +
          '<span class="pill-type">' + esc(c.유형) + '</span></span>';
      }).join('');
      h += '</span></div>';
    });
    h += '</div>';
  });

  h += '<h3>유의사항</h3><dl>';
  D.school.meta.유의사항.forEach(function (t) {
    h += '<dd>· ' + esc(t) + '</dd>';
  });
  h += '</dl>';

  openModal('우리 학교 교육과정 편성표', h + '</div>');
}

function openHelp(focusId) {
  var h = '<div class="doc">';

  D.help.섹션.forEach(function (s) {
    h += '<h3 id="h-' + esc(s.id) + '">' + esc(s.제목) + '</h3>';

    (s.본문 || []).forEach(function (p) { h += '<p>' + esc(p) + '</p>'; });

    if (s.목록) {
      h += '<dl>';
      s.목록.forEach(function (it) {
        h += '<dt>' + esc(it.이름) + '</dt><dd>' + esc(it.설명) + '</dd>';
      });
      h += '</dl>';
    }

    if (s.표) {
      h += '<div class="tscroll"><table><thead><tr>';
      s.표.머리.forEach(function (c) { h += '<th>' + esc(c) + '</th>'; });
      h += '</tr></thead><tbody>';
      s.표.행.forEach(function (r) {
        h += '<tr>';
        r.forEach(function (c) { h += '<td>' + esc(c) + '</td>'; });
        h += '</tr>';
      });
      h += '</tbody></table></div>';
    }

    if (s.강조) h += '<div class="accent">' + esc(s.강조) + '</div>';
  });

  // 원문을 직접 확인할 수 있게 링크를 남긴다
  var src = D.rec.meta.출처 || {};
  var keys = Object.keys(src).filter(function (k) { return src[k] && src[k].링크; });
  if (keys.length) {
    h += '<h3 id="h-links">자료 원문 보기</h3>';
    h += '<p>이 페이지의 내용은 아래 공식 자료를 근거로 했습니다. ' +
         '직접 확인하고 싶으면 눌러 보세요.</p><ul class="srclist">';
    keys.forEach(function (k) {
      var s = src[k];
      h += '<li><a href="' + esc(s.링크) + '" target="_blank" rel="noopener">' +
        esc(s.제목) + '</a>' +
        (s.발행 ? '<span class="src-pub">' + esc(s.발행) + '</span>' : '') +
        (s.설명 ? '<span class="src-note">' + esc(s.설명) + '</span>' : '') +
        '</li>';
    });
    h += '</ul>';
  }

  openModal('설명서', h + '</div>');

  if (focusId) {
    var el = $('#h-' + focusId);
    if (el) el.scrollIntoView({ block: 'start' });
  }
}

/* ── 시작 ─────────────────────────────────────────── */
function bind() {
  $$('.tab').forEach(function (t) {
    t.onclick = function () { setView(t.dataset.view); };
  });

  $('#q-univ').oninput = debounce(function (e) {
    state.q = e.target.value; renderUniv();
  }, 200);

  $('#reset-univ').onclick = function () {
    state.region.clear(); state.univ.clear(); state.track.clear();
    state.q = ''; state.unit = null;
    $('#q-univ').value = '';
    renderRegionChips();
    renderUnivChips();
    renderTrackChips();
    renderUniv();
  };

  $$('[data-open]').forEach(function (b) {
    b.onclick = function () {
      if (b.dataset.open === 'help') openHelp();
      else openCurriculum();
    };
  });

  $$('[data-close]').forEach(function (b) { b.onclick = closeModal; });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('#modal').hidden) closeModal();
  });

  window.addEventListener('hashchange', function () {
    var v = location.hash.slice(2).split('/')[0];
    if (v && v !== state.view && $('#view-' + v)) setView(v);
  });
}

/* ── 진입 화면 ────────────────────────────────────── */
function showGate() {
  var list = D.cohorts.목록.filter(function (c) { return c.노출; });

  // 하나뿐이면 고를 것이 없으니 바로 들어간다
  if (list.length === 1) return enterCohort(list[0]);

  $('#gate').hidden = false;
  $('#tabs').hidden = true;
  $('#main').hidden = true;
  $('#cohort-tag').hidden = true;
  $('#tool-curriculum').hidden = true;   // 편성표는 학년을 골라야 열 수 있다

  $('#gate-cards').innerHTML = list.map(function (c) {
    return '<button type="button" class="gate-card" data-cohort="' + esc(c.id) + '">' +
      '<span class="gate-who">' + esc(c.대상) + '</span>' +
      '<strong class="gate-title">' + esc(c.제목) + '</strong>' +
      '<span class="gate-desc">' + esc(c.설명) + '</span></button>';
  }).join('');

  $$('[data-cohort]', $('#gate-cards')).forEach(function (b) {
    b.onclick = function () {
      var c = list.filter(function (x) { return x.id === b.dataset.cohort; })[0];
      enterCohort(c);
    };
  });
}

function enterCohort(c) {
  $('#loading').hidden = false;
  return loadCohort(c).then(function () {
    // 코호트가 바뀌면 앞서 담은 과목은 의미가 없다
    var saved = readCart();
    state.cart = (saved && saved.id === c.id && saved.k) ? saved.k : {};
    if (saved && saved.id === c.id && saved.c) state.course = saved.c;

    dropClosedFromCart();

    $('#gate').hidden = true;
    $('#tabs').hidden = false;
    $('#main').hidden = false;
    $('#cohort-tag').hidden = false;
    $('#tool-curriculum').hidden = false;
    $('#cohort-name').textContent = c.입학연도 + '학년도 입학 · ' + c.대상;

    buildFilters();
    renderUniv();
    renderPicker();
    renderPick();
    renderMy();
    stampFoot();

    var p = new URLSearchParams(location.search);
    p.set('y', c.id);
    history.replaceState(null, '', '?' + p.toString() + location.hash);

    var v = location.hash.slice(2).split('/')[0];
    setView(v && $('#view-' + v) ? v : 'univ');
    $('#loading').hidden = true;
  });
}

/* 담아둔 과목이 폐강됐으면 알려 주고 빼낸다 */
function dropClosedFromCart() {
  var gone = [];
  SLOTS.forEach(function (s) {
    var arr = cartOf(s.key);
    state.cart[s.key] = arr.filter(function (n) {
      var ok = !!courseIn(n, s);
      if (!ok) gone.push(n + ' (' + s.이름 + ')');
      return ok;
    });
  });
  if (gone.length) {
    saveCart();
    setTimeout(function () {
      flash('폐강되어 담은 목록에서 뺐습니다 — ' + gone.join(', ') +
            '. 다른 과목을 골라 주세요.', true);
    }, 700);
  }
}

function stampFoot() {
  // 대학 수는 자료에서 읽는다. 대학이 늘어도 문구를 고칠 일이 없다.
  if ($('#univ-count')) $('#univ-count').textContent = D.rec.meta.대학수;

  var t = '자료 기준일 ' + D.rec.meta.갱신일 + ' · ' + D.rec.meta.대학수 + '개 대학 ' +
          D.rec.meta.모집단위수 + '개 모집단위';
  if (CLOSED && CLOSED.meta && CLOSED.meta.갱신일) {
    t += ' · 개설 현황 ' + CLOSED.meta.갱신일 +
         (CLOSED.meta.단계 ? ' (' + CLOSED.meta.단계 + ')' : '');
  }
  $('#stamp').textContent = t + ' · 출처: 각 대학 발표 원문';
}

/* 상단 업데이트 날짜 — dates.json 은 GitHub Actions 가 각 파일의
   마지막 커밋일로 자동 생성한다. 손으로 적으면 고치는 걸 잊는다. */
function stampUpdated() {
  var el = $('#site-updated');
  if (!el) return;
  fetch('../../../dates.json?v=' + Date.now())
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var v = d['./work/교육과정/2028과목선택/index.html'];
      if (!v) return;
      var p = v.split('-');
      el.textContent = '업데이트: ' + p[0] + '. ' + Number(p[1]) + '. ' + Number(p[2]) + '.';
    })
    .catch(function () { /* 못 읽으면 표시하지 않는다 */ });
}

stampUpdated();

loadCommon().then(function () {
  bind();
  $('#my-reset').onclick = function () {
    state.cart = {}; saveCart(); renderMy();
  };
  $('#cohort-tag').onclick = function () { showGate(); };

  var want = new URLSearchParams(location.search).get('y');
  var hit = D.cohorts.목록.filter(function (c) { return c.노출 && c.id === want; })[0];
  if (hit) enterCohort(hit); else showGate();
  $('#loading').hidden = true;
}).catch(function (err) {
  $('#loading').textContent =
    '자료를 불러오지 못했습니다. 새로고침해 보세요. (' + err.message + ')';
  console.error(err);
});


