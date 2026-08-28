/* 과목별 수요 탭 — 화면에서 내린 코드 보관

   권장 대학 수가 앞에 보이면 학생이 자기 희망과 무관하게
   다수 선택에 휩쓸릴 수 있어 2026-08-28 에 화면에서 내렸다.

   되살리는 법
     1) 아래 함수를 app.js 로 옮긴다
     2) index.html 의 view-subject 주석을 푼다 (탭 버튼도 그 안에 있다)
     3) app.js 의 HIDDEN_VIEWS 에서 'subject' 를 뺀다
*/

/* ── renderSubjects / subjRow ── */
function renderSubjects() {
  // 편성표 순서를 따르되, 교과군 안에서는 일반 → 진로 → 융합으로 본다.
  // (막대그래프를 뺐으므로 빈도순으로 늘어놓으면 순서의 근거가 보이지 않는다.)
  var 편성순 = {};
  D.school.개설.forEach(function (c, i) {
    // 유형을 앞자리에 둬 교과군 안에서 일반 → 진로 → 융합이 되게 한다.
    // 뒷자리는 편성표에 적힌 차례.
    var rank = (TYPE_ORDER[c.유형] === undefined ? 9 : TYPE_ORDER[c.유형]) * 10000 + i;
    if (편성순[c.과목] === undefined || rank < 편성순[c.과목]) 편성순[c.과목] = rank;
  });

  var all = Object.keys(INDEX).filter(function (n) {
    return !GROUP_NAME[n];           // 교과군 이름은 과목이 아니다
  }).sort(function (a, b) {
    return (편성순[a] || 0) - (편성순[b] || 0);
  });

  var names = LOGIC.filterSubjects(all, {
    group: state.group,
    type: state.type,
    q: state.qSubject.trim()
  }, SUBJ, SCHOOL);

  $('#count-subject').innerHTML = names.length
    ? '<strong>' + names.length + '</strong>과목' +
      (names.length !== all.length ? ' (전체 ' + all.length + ')' : '')
    : '';

  var body = $('#subject-body');
  if (!names.length) {
    body.innerHTML = '<div class="empty"><h3>해당하는 과목이 없습니다</h3>' +
      '<p>조건을 지우거나 과목 이름 일부만 적어 보세요.</p></div>';
    return;
  }

  // 교과군을 안 골랐으면 교과군별로 묶어 소제목을 단다
  var html = '';
  if (state.group) {
    html = '<div class="pick-grid">' +
      names.map(function (n) { return subjRow(n); }).join('') + '</div>';
  } else {
    LOGIC.groupByGroup(names, SUBJ).forEach(function (g) {
      html += '<div class="subj-group"><h3 class="subj-h">' + esc(g.name) +
        '<span class="subj-h-n">' + g.items.length + '</span></h3>' +
        '<div class="pick-grid">' +
        g.items.map(function (n) { return subjRow(n); }).join('') + '</div></div>';
    });
  }
  html = evalLegend() + html;
  body.innerHTML = html;

  $$('[data-subject]', body).forEach(function (b) {
    b.onclick = function () { openSubject(b.dataset.subject); };
  });
}

/* 과목 하나를 버튼으로. 누르면 어느 대학이 권장하는지 상세 창이 열린다.
   권장 대학 수는 그 창에서 알려 주므로 목록에는 적지 않는다. */
function subjRow(n) {
  var c = SCHOOL[n], m = SUBJ[n];
  var 평가 = c && EVAL_MARK[c.평가] && !EVAL_MARK[c.평가].bare
    ? '<span class="pill-eval ev-' + c.평가 + '" title="' + esc(EVAL_MARK[c.평가].설명) +
      '">' + EVAL_ICON[c.평가] + ' ' + esc(EVAL_MARK[c.평가].약칭) + '</span>'
    : '';
  return '<button type="button" class="pill" data-subject="' + esc(n) + '">' +
    esc(n) +
    (m ? '<span class="pill-type">' + esc(m.유형) + '</span>' : '') +
    평가 + '</button>';
}

/* ── buildFilters 안에 있던 교과군·과목유형 칩 ── */
function buildSubjectChips() {
  // 교과군 — 실제로 권장된 과목이 있는 교과군만, 과목 수와 함께
  var counted = {};
  Object.keys(INDEX).forEach(function (n) {
    if (GROUP_NAME[n]) return;
    var m = SUBJ[n];
    if (!m) return;
    var g = LOGIC.groupOf(m.교과군);
    counted[g] = (counted[g] || 0) + 1;
  });

  $('#f-group').innerHTML = Object.keys(counted)
    .sort(function (a, b) { return LOGIC.groupRank(a) - LOGIC.groupRank(b); })
    .map(function (g) {
      return '<button type="button" class="chip" data-val="' + esc(g) +
        '" aria-pressed="false">' + esc(g) +
        '<span class="chip-n">' + counted[g] + '</span></button>';
    }).join('');

  $$('#f-group .chip').forEach(function (b) {
    b.onclick = function () {
      var v = LOGIC.chipValue(b);
      state.group = state.group === v ? null : v;
      markChips('#f-group', state.group);
      renderSubjects();
    };
  });

  // 과목 유형
  $('#f-type').innerHTML = ['일반', '진로'].map(function (t) {
    return '<button type="button" class="chip" data-val="' + t +
      '" aria-pressed="false">' + t + '선택</button>';
  }).join('');

  $$('#f-type .chip').forEach(function (b) {
    b.onclick = function () {
      var v = LOGIC.chipValue(b);
      state.type = state.type === v ? null : v;
      markChips('#f-type', state.type);
      renderSubjects();
    };
  });
}


/* ── logic.js 에 있던 것 — 이 탭에서만 쓰던 순수 함수 ──
   되살릴 때 logic.js 로 되돌리고 api 에 다시 실어야 한다. */

  /* 과목이 한둘뿐인 교과군은 칩을 따로 두지 않고 '기타'로 묶는다. */
  var MINOR = ['교양', '한문', '정보', '기술·가정/정보', '제2외국어/한문', '체육', '예술'];

  /* 교육과정 편제 순서. 과목 수와 무관하게 이 차례로 놓는다. */
  var GROUP_ORDER = ['국어', '수학', '영어', '사회', '과학', '기타'];

  function groupOf(g) {
    return MINOR.indexOf(g) === -1 ? g : '기타';
  }

  function groupRank(g) {
    var i = GROUP_ORDER.indexOf(g);
    return i === -1 ? GROUP_ORDER.length : i;   // 모르는 교과군은 맨 뒤
  }

  /* 과목명 또는 별칭에 검색어가 들어 있나 */
  function matchSubject(name, q, master) {
    var qq = squash(q);
    if (!qq) return true;
    if (squash(name).indexOf(qq) !== -1) return true;
    var m = master && master[name];
    if (m && m.별칭) {
      for (var i = 0; i < m.별칭.length; i++) {
        if (squash(m.별칭[i]).indexOf(qq) !== -1) return true;
      }
    }
    return false;
  }

  function filterSubjects(names, f, master, school) {
    return names.filter(function (n) {
      var m = master[n];
      // 우리 학교에 열리지 않는 과목은 이 탭에서 다루지 않는다.
      // 고를 수 없는 과목의 수요를 알려 줘 봐야 학생에게 쓸모가 없다.
      if (!school[n]) return false;
      if (f.group) {
        if (!m) return false;
        if (groupOf(m.교과군) !== f.group) return false;
      }
      if (f.type) {
        if (!m || m.유형 !== f.type) return false;
      }
      if (f.q && !matchSubject(n, f.q, master)) return false;
      return true;
    });
  }

  /* 교과군별로 묶는다. 들어온 순서(권장 학과 수 내림차순)는 교과군 안에서 유지하고,
     교과군끼리는 교육과정 편제 순서(국·수·영·사·과·기타)로 놓는다. */
  function groupByGroup(names, master) {
    var bag = {}, order = [];
    names.forEach(function (n) {
      var m = master[n];
      var g = m ? groupOf(m.교과군) : '기타';
      if (!bag[g]) { bag[g] = []; order.push(g); }
      bag[g].push(n);
    });
    return order.map(function (g) {
      return { name: g, items: bag[g] };
    }).sort(function (a, b) {
      return groupRank(a.name) - groupRank(b.name);
    });
  }

