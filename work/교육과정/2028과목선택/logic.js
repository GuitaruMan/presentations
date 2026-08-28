/* 화면과 무관한 순수 로직. 브라우저와 Node 양쪽에서 쓴다.

   지금은 유틸 둘뿐이다. 이수 조건·선수과목·슬롯 계산 같은 진짜 규칙은
   아직 app.js 안에 있다(작업로그의 '다음에 할 것' 참고).
   앱으로 옮길 때 재사용할 것들이므로 차차 이리로 내린다. */
(function (root) {
  'use strict';

  /* 칩에 개수 뱃지를 붙이면 textContent가 '과학12'가 된다.
     선택 상태를 텍스트로 비교하면 깨지므로 data-val을 우선 읽는다. */
  function chipValue(el) {
    return (el.dataset && el.dataset.val) || el.textContent;
  }

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

  var api = { chipValue: chipValue, squash: squash };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LOGIC = api;
})(typeof self !== 'undefined' ? self : this);
