-- school_cohorts 에 '단계' 컬럼 추가
--
-- 학생 화면 머리말에 지금이 어느 기간인지 보이기 위한 값이다.
-- (예: "과목 선택 안내 — 선택과목 신청")
--
-- 지금까지 단계는 관리자 화면의 드롭다운에만 있었고 미리보기 JSON 에만 실려
-- 데이터베이스에는 저장되지 않았다. 그래서 학생 화면이 알 방법이 없었다.
--
-- 폐강 목록(closed_subjects)이 아니라 학년도(school_cohorts)에 두는 이유:
-- 폐강이 0건이어도 기간은 표시되어야 하고, 기간은 폐강 한 건 한 건이 아니라
-- 그 학년도 전체에 걸린 상태이기 때문이다.
--
-- 값은 셋 중 하나이거나 비어 있다(아무것도 안 고른 상태 = 학생 화면에 표시 없음).
--   '선택과목 신청' | '1차 정정' | '2차 정정'
--
-- 실행 방법: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행.
-- (서비스 키로도 DDL 을 REST 경로로 실행할 방법이 없어 자동화하지 못했다.)

ALTER TABLE school_cohorts
  ADD COLUMN IF NOT EXISTS 단계 text;

-- 확인용
SELECT id, 코호트id, 제목, 단계 FROM school_cohorts ORDER BY id;
