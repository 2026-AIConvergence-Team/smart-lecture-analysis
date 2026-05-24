import { useState } from "react";
import { ChevronLeft, ChevronRight, AlertTriangle, AlignJustify } from "lucide-react";
import RoleLayout from "../../components/RoleLayout.jsx";
import { getQuestionsCache } from "../../data/sessionCache.js";

const WEEKS = [
  { week: 3, date: "2026.04.29" },
  { week: 4, date: "2026.05.06" },
  { week: 5, date: "2026.05.13" },
  { week: 6, date: "2026.05.20", future: true },
  { week: 7, date: "2026.05.27", future: true },
  { week: 8, date: "2026.06.03", future: true },
];

const WEEK_CURRENT = 5;

const REPORT_COURSES = [
  {
    id: "ds",
    title: "자료구조론",
    weeks: WEEKS,
    currentWeek: WEEK_CURRENT,
    meta: "90분 · 출제 2세트 · 응답 32명",
  },
  {
    id: "os",
    title: "운영체제",
    weeks: [
      { week: 2, date: "2026.04.15" },
      { week: 3, date: "2026.04.22" },
      { week: 4, date: "2026.04.29" },
    ],
    currentWeek: 4,
    meta: "90분 · 출제 1세트 · 응답 28명",
  },
  {
    id: "algo",
    title: "알고리즘 설계",
    weeks: [
      { week: 3, date: "2026.04.24" },
      { week: 4, date: "2026.05.01" },
      { week: 5, date: "2026.05.08" },
    ],
    currentWeek: 5,
    meta: "90분 · 출제 1세트 · 응답 41명",
  },
  {
    id: "db",
    title: "데이터베이스",
    weeks: [
      { week: 13, date: "2025.12.02" },
      { week: 14, date: "2025.12.09" },
      { week: 15, date: "2025.12.16" },
    ],
    currentWeek: 15,
    meta: "90분 · 출제 1세트 · 응답 38명",
  },
];

// rows: [qNum, content, pct, colorKey, topWrong]
// colorKey: 'success' ≥70, 'warning' 50–69, 'danger' <50
const REPORT_SETS = {
  1: {
    range: [1, 5],
    avg: 68,
    rows: [
      ["Q1", "스택은 ___ 구조를 따르는 선형 자료구조이다",      75, "success", "FIFO (17%)"],
      ["Q2", "큐에서 삽입은 ___ 에서 이루어진다",               52, "warning", "front (22%)"],
      ["Q3", "연결 리스트의 각 요소를 ___ 라고 한다",           45, "danger",  "포인터 (38%)"],
      ["Q4", "스택은 중간 삽입이 가능하다 (O/X)",               62, "success", "O (38%)"],
      ["Q5", "힙은 ___ 트리의 일종이다",                        80, "success", "이진 탐색 (12%)"],
    ],
  },
  2: {
    range: [9, 14],
    avg: 72,
    rows: [
      ["Q1", "BST에서 왼쪽 서브트리의 값은 항상 부모보다 ___",   84, "success", "크다 (12%)"],
      ["Q2", "중위 순회의 방문 순서는?",                         66, "warning", "V-L-R (24%)"],
      ["Q3", "BST 노드 삭제 시 두 자식이 있는 경우 대체 값은?",  58, "warning", "부모 노드 (28%)"],
      ["Q4", "힙은 ___ 트리의 일종이다",                        82, "success", "이진 탐색 (10%)"],
      ["Q5", "우선순위 큐의 효율적 구현에 적합한 자료구조는?",   70, "success", "연결 리스트 (18%)"],
    ],
  },
};

const CONCEPTS = [
  { name: "포인터",     score: 38, key: "danger"  },
  { name: "연결 리스트", score: 45, key: "danger"  },
  { name: "큐 삽입/삭제", score: 52, key: "warning" },
  { name: "스택 개념",  score: 75, key: "success" },
  { name: "힙 트리",   score: 80, key: "success" },
];

const COURSE_REPORTS = {
  ds: {
    students: 32,
    sets: REPORT_SETS,
    concepts: CONCEPTS,
  },
  os: {
    students: 28,
    sets: {
      1: {
        range: [2, 6],
        avg: 71,
        rows: [
          ["Q1", "실행 중인 프로그램을 무엇이라고 하는가", 82, "success", "스레드 (11%)"],
          ["Q2", "CPU 스케줄링의 주된 목적은?", 63, "warning", "디스크 포맷 (21%)"],
          ["Q3", "교착상태의 필요 조건 중 하나는?", 68, "warning", "선점 가능 (18%)"],
        ],
      },
    },
    concepts: [
      { name: "프로세스", score: 82, key: "success" },
      { name: "스케줄링", score: 63, key: "warning" },
      { name: "교착상태", score: 68, key: "warning" },
      { name: "메모리 관리", score: 74, key: "success" },
    ],
  },
  algo: {
    students: 41,
    sets: {
      1: {
        range: [3, 7],
        avg: 76,
        rows: [
          ["Q1", "이진 탐색의 시간 복잡도는?", 86, "success", "O(n) (9%)"],
          ["Q2", "퀵 정렬의 평균 시간 복잡도는?", 69, "warning", "O(n) (18%)"],
          ["Q3", "그리디 알고리즘의 핵심 선택 기준은?", 73, "success", "전체 탐색 (16%)"],
        ],
      },
    },
    concepts: [
      { name: "Big-O", score: 86, key: "success" },
      { name: "정렬", score: 69, key: "warning" },
      { name: "그리디", score: 73, key: "success" },
      { name: "동적 계획법", score: 58, key: "warning" },
    ],
  },
  db: {
    students: 38,
    sets: {
      1: {
        range: [8, 12],
        avg: 70,
        rows: [
          ["Q1", "데이터 중복을 줄이는 설계 과정은?", 78, "success", "인덱싱 (13%)"],
          ["Q2", "ACID 중 일관성의 의미는?", 56, "warning", "로그 삭제 (25%)"],
          ["Q3", "기본키의 특징으로 옳은 것은?", 75, "success", "중복 가능 (15%)"],
        ],
      },
    },
    concepts: [
      { name: "정규화", score: 78, key: "success" },
      { name: "트랜잭션", score: 56, key: "warning" },
      { name: "키 제약", score: 75, key: "success" },
      { name: "SQL 조인", score: 64, key: "warning" },
    ],
  },
};

const QNA_ITEMS = [
  { week: 5, time: "22분 전", text: "스택 오버플로우가 언제 발생하나요?" },
  { week: 5, time: "15분 전", text: "연결 리스트와 배열의 가장 큰 차이가 뭔지 다시 정리해주세요." },
  { week: 5, time: "8분 전",  text: "큐와 덱(Deque)의 차이가 뭔가요? 환형 큐랑은 어떻게 다른가요?" },
  { week: 5, time: "5분 전",  text: "힙에서 부모-자식 인덱스 계산 공식 한 번 더 짚어주실 수 있나요?" },
];

const COLOR_VAR = {
  danger:  { bar: "var(--danger)",       text: "var(--danger)"       },
  warning: { bar: "var(--warning)",      text: "var(--warning-700)"  },
  success: { bar: "var(--success)",      text: "var(--success-700)"  },
};

function TeacherReportPage() {
  const [activeCourseId, setActiveCourseId] = useState("ds");
  const activeCourse = REPORT_COURSES.find((course) => course.id === activeCourseId) || REPORT_COURSES[0];
  const activeReport = COURSE_REPORTS[activeCourseId] || COURSE_REPORTS.ds;
  const [currentWeek, setCurrentWeek] = useState(activeCourse.currentWeek);
  const [activeSetId, setActiveSetId] = useState(1);
  const [qnaItems] = useState(() => {
    const cached = getQuestionsCache();
    return [
      ...cached,
      ...QNA_ITEMS.filter((item, idx) => {
        const fallbackId = `fallback-${idx}`;
        return !cached.some((q) => q.id === fallbackId || q.text === item.text);
      }),
    ];
  });

  const weekData = activeCourse.weeks.find((w) => w.week === currentWeek);
  const isFutureWeek = weekData?.future;
  const activeSet = activeReport.sets[activeSetId] || Object.values(activeReport.sets)[0];
  const totalSetCount = Object.keys(activeReport.sets).length;
  const totalQuestionCount = Object.values(activeReport.sets).reduce((sum, set) => sum + set.rows.length, 0);

  const handleCourseChange = (courseId) => {
    const nextCourse = REPORT_COURSES.find((course) => course.id === courseId) || REPORT_COURSES[0];
    setActiveCourseId(courseId);
    setCurrentWeek(nextCourse.currentWeek);
    setActiveSetId(1);
  };

  const handleWeekChange = (step) => {
    const idx = activeCourse.weeks.findIndex((w) => w.week === currentWeek);
    const next = activeCourse.weeks[idx + step];
    if (next) setCurrentWeek(next.week);
  };

  return (
    <RoleLayout role="teacher" title="수업 리포트">
      <div className="content">

        {/* ── 헤더 ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18, marginBottom: 22 }}>
          <div>
            <div className="review-eyebrow-row">
              <p className="eyebrow">Weekly Report</p>
              <label className="review-course-picker">
                <span>강의</span>
                <select value={activeCourseId} onChange={(e) => handleCourseChange(e.target.value)}>
                  {REPORT_COURSES.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <h1 className="page-title">{activeCourse.title} {currentWeek}주차 — 수업 리포트</h1>
            <p className="page-sub">
              {weekData?.date} · {activeCourse.meta}
            </p>
          </div>

          {/* Week nav — right side with arrows + label + menu icon */}
          <div className="week-nav" style={{ flexShrink: 0, marginTop: 4 }}>
            <button
              className="btn-arrow"
              type="button"
              onClick={() => handleWeekChange(-1)}
              disabled={activeCourse.weeks.findIndex((w) => w.week === currentWeek) <= 0}
            >
              <ChevronLeft size={16} />
            </button>
            <div className="now" style={{ minWidth: 120, textAlign: "center" }}>
              {currentWeek}주차{" "}
              <span className="sub">{weekData?.date}</span>
            </div>
            <button
              className="btn-arrow"
              type="button"
              onClick={() => handleWeekChange(1)}
              disabled={activeCourse.weeks.findIndex((w) => w.week === currentWeek) >= activeCourse.weeks.length - 1}
            >
              <ChevronRight size={16} />
            </button>
            <button
              className="btn-arrow"
              type="button"
            >
              <AlignJustify size={15} />
            </button>
          </div>
        </div>

        {/* ── 수업 전 empty state ── */}
        {isFutureWeek && (
          <div style={{ marginTop: 32 }}>
            <div className="card card-pad-lg" style={{ textAlign: "center", padding: "60px 24px" }}>
              <div style={{
                width: 64, height: 64, margin: "0 auto 14px",
                borderRadius: 18, background: "var(--brand-50)",
                display: "grid", placeItems: "center",
              }}>
                📅
              </div>
              <span className="pill pill-warn" style={{ display: "inline-flex" }}>수업 전</span>
              <h3 style={{ marginTop: 10, fontSize: 18, fontWeight: 700, color: "var(--zinc-900)" }}>
                {currentWeek}주차 수업은 아직 진행되지 않았어요
              </h3>
              <p style={{ marginTop: 6, fontSize: 13.5, color: "var(--zinc-500)", lineHeight: 1.7 }}>
                예정 일자: {weekData?.date} · 수업이 끝난 뒤 리포트가 이곳에 자동 생성됩니다.
              </p>
            </div>
          </div>
        )}

        {/* ── 리포트 본문 ── */}
        {!isFutureWeek && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

            {/* Stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              <div className="card card-pad">
                <div style={{ fontSize: 11, color: "var(--zinc-500)", fontWeight: 600 }}>참여 학생</div>
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>
                  {activeReport.students} <span style={{ fontSize: 13, color: "var(--zinc-500)", fontWeight: 500 }}>명</span>
                </div>
              </div>
              <div className="card card-pad">
                <div style={{ fontSize: 11, color: "var(--zinc-500)", fontWeight: 600 }}>출제 세트 · 문제</div>
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>
                  {totalSetCount} / {totalQuestionCount} <span style={{ fontSize: 13, color: "var(--zinc-500)", fontWeight: 500 }}>개</span>
                </div>
              </div>
              <div className="card card-pad">
                <div style={{ fontSize: 11, color: "var(--zinc-500)", fontWeight: 600 }}>평균 정답률</div>
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6, color: "var(--success-700)" }}>
                  {activeSet.avg} <span style={{ fontSize: 13, color: "var(--zinc-500)", fontWeight: 500 }}>%</span>
                </div>
              </div>
              <div className="card card-pad">
                <div style={{ fontSize: 11, color: "var(--zinc-500)", fontWeight: 600 }}>익명 질문</div>
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>
                  {qnaItems.length} <span style={{ fontSize: 13, color: "var(--zinc-500)", fontWeight: 500 }}>개</span>
                </div>
              </div>
            </div>

            {/* 개념별 이해도 */}
            <div className="card">
              <div className="card-head">
                <div>
                  <div className="card-title">개념별 이해도</div>
                  <div className="card-sub">키워드별 평균 정답률 (낮은 순)</div>
                </div>
              </div>
              <div className="card-pad" style={{ paddingTop: 10 }}>
                {activeReport.concepts.map((c) => (
                  <div key={c.name} className="concept-row">
                    <div className="lbl">{c.name}</div>
                    <div className="bar">
                      <div style={{ width: `${c.score}%`, background: COLOR_VAR[c.key].bar }} />
                    </div>
                    <div className="v" style={{ color: COLOR_VAR[c.key].text }}>{c.score}%</div>
                  </div>
                ))}
                <div style={{
                  marginTop: 14, padding: "12px 14px",
                  background: "var(--warning-50)", borderRadius: 11,
                  display: "flex", alignItems: "flex-start", gap: 10,
                }}>
                  <AlertTriangle size={16} style={{ color: "var(--warning-700)", flexShrink: 0, marginTop: 1 }} />
                  <div style={{ fontSize: 12.5, color: "var(--warning-700)", lineHeight: 1.6 }}>
                    <strong>취약 개념</strong> — 포인터, 연결 리스트. 다음 수업에서 복습 또는 보강 자료 추천을 권장합니다.
                  </div>
                </div>
              </div>
            </div>

            {/* 세트별 결과 */}
            <div className="card">
              <div className="card-head">
                <div>
                  <div className="card-title">세트별 결과</div>
                  <div className="card-sub">
                    세트 #{activeSetId} · {activeSet.rows.length}문제 · p.{activeSet.range[0]}~{activeSet.range[1]} · 평균 정답률 {activeSet.avg}%
                  </div>
                </div>
                <div className="set-tabs">
                  {Object.entries(activeReport.sets).map(([id]) => (
                    <button
                      key={id}
                      className={`set-tab ${activeSetId === parseInt(id) ? "active" : ""}`}
                      type="button"
                      onClick={() => setActiveSetId(parseInt(id))}
                    >
                      <span className="dot" style={{ background: parseInt(id) === 1 ? "var(--brand)" : "var(--brand-2)" }} />
                      세트 #{id}
                    </button>
                  ))}
                </div>
              </div>
              <div className="card-pad">
                {/* 출제 범위 pills */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span className="pill pill-brand" style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                    </svg>
                    출제 범위 p.{activeSet.range[0]}~{activeSet.range[1]}
                  </span>
                  <span className="pill pill-neutral" style={{ fontSize: 11 }}>{activeSet.rows.length}문제</span>
                  <span className="pill pill-success" style={{ fontSize: 11 }}>평균 정답률 {activeSet.avg}%</span>
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ fontSize: 11, color: "var(--zinc-500)", textAlign: "left", borderBottom: "1px solid var(--zinc-150)" }}>
                      <th style={{ padding: "8px 0", fontWeight: 600 }}>문제</th>
                      <th style={{ padding: "8px 0", fontWeight: 600 }}>내용</th>
                      <th style={{ padding: "8px 0", fontWeight: 600, textAlign: "right" }}>정답률</th>
                      <th style={{ padding: "8px 0", fontWeight: 600, textAlign: "right" }}>오답 TOP</th>
                    </tr>
                  </thead>
                  <tbody style={{ fontSize: 13 }}>
                    {activeSet.rows.map((r, i) => (
                      <tr key={i} style={{ borderBottom: i < activeSet.rows.length - 1 ? "1px solid var(--zinc-100)" : "none" }}>
                        <td style={{ padding: "12px 0", fontWeight: 600, color: "var(--zinc-700)" }}>{r[0]}</td>
                        <td style={{ padding: "12px 8px 12px 0", color: "var(--zinc-800)" }}>{r[1]}</td>
                        <td style={{ textAlign: "right", fontWeight: 700, color: COLOR_VAR[r[3]].text }}>{r[2]}%</td>
                        <td style={{ textAlign: "right", paddingLeft: 8 }}>
                          <span className="pill pill-danger" style={{ fontSize: 11 }}>{r[4]}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 익명 질문 */}
            <div className="card">
              <div className="card-head">
                <div>
                  <div className="card-title">익명 질문 목록</div>
                  <div className="card-sub">학생들이 수업 중에 보낸 질문입니다 · 스크롤로 확인하세요</div>
                </div>
                <span className="pill pill-neutral">{qnaItems.length}개</span>
              </div>
              <div className="qna-scroll card-pad">
                {qnaItems.map((q, idx) => (
                  <div key={idx} className="qna-item">
                    <div className="meta">{q.week}주차 · {q.time}</div>
                    <div className="body">{q.text}</div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
      </div>
    </RoleLayout>
  );
}

export default TeacherReportPage;
