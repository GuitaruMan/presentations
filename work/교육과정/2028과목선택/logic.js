/* 화면과 무관한 순수 로직. 브라우저와 Node 양쪽에서 쓴다.
   테스트: node --test test/logic.test.js */
(function (root) {
  'use strict';

  /* 칩에 개수 뱃지를 붙이면 textContent가 '과학12'가 된다.
     선택 상태를 텍스트로 비교하면 깨지므로 data-val을 우선 읽는다. */
  function chipValue(el) {
    return (el.dataset && el.dataset.val) || el.textContent;
  }

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

  /* 과목 목록 좁히기. 조건은 겹쳐 쓸 수 있다. */
  /* 검색어 정규화 — 띄어쓰기·로마숫자·가운뎃점 차이를 없앤다.
     '화학반응의세계', '미적분2', '기술가정' 처럼 쳐도 찾히게 하려는 것. */
  function squash(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/ⅱ/g, '2')      // Ⅱ 를 Ⅰ 보다 먼저 — 순서를 바꾸면 'ii'가 '11'이 된다
      .replace(/ii/g, '2')
      .replace(/[ⅰi]/g, '1')
      .replace(/[·・･‧∙]/g, '')
      .replace(/[()（）[\]]/g, '');
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

  var api = { chipValue: chipValue, groupOf: groupOf, groupRank: groupRank,
              filterSubjects: filterSubjects, groupByGroup: groupByGroup,
              squash: squash, matchSubject: matchSubject };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LOGIC = api;
})(typeof self !== 'undefined' ? self : this);
