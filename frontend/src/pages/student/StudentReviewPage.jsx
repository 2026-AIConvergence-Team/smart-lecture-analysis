import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import RoleLayout from "../../components/RoleLayout.jsx";
import PdfViewer from "../../components/PdfViewer.jsx";
import { getPdfCache } from "../../data/sessionCache.js";

const WEEKS = [
  { week: 3, date: "2026.04.29" },
  { week: 4, date: "2026.05.06" },
  { week: 5, date: "2026.05.13" },
  { week: 6, date: "2026.05.20" },
];

const REVIEW_COURSES = [
  {
    id: "ds",
    title: "자료구조론",
    meta: "컴퓨터공학과 · 월/수 10:30",
    week: 5,
    weeks: WEEKS,
  },
  {
    id: "os",
    title: "운영체제",
    meta: "컴퓨터공학과 · 화/목 13:30",
    week: 4,
    weeks: [
      { week: 2, date: "2026.04.15" },
      { week: 3, date: "2026.04.22" },
      { week: 4, date: "2026.04.29" },
    ],
  },
  {
    id: "algo",
    title: "알고리즘 설계",
    meta: "소프트웨어학부 · 금 09:00",
    week: 5,
    weeks: [
      { week: 3, date: "2026.04.24" },
      { week: 4, date: "2026.05.01" },
      { week: 5, date: "2026.05.08" },
    ],
  },
  {
    id: "db",
    title: "데이터베이스",
    meta: "컴퓨터공학과 · 화/목 13:30",
    week: 15,
    weeks: [
      { week: 13, date: "2025.12.02" },
      { week: 14, date: "2025.12.09" },
      { week: 15, date: "2025.12.16" },
    ],
  },
];

// Mock quiz sets for review
// studentAnswer: index the student chose, answer: correct index
const SETS = [
  {
    id: 1,
    label: "세트 #1",
    pdfRange: "p.1–5",
    startPage: 1,
    quizzes: [
      {
        id: 1001,
        n: "Q1",
        keyword: "스택",
        question: "스택은 ___ 구조를 따르는 선형 자료구조이다",
        choices: ["LIFO", "FIFO", "트리", "그래프"],
        answer: 0,
        studentAnswer: 0,
        errorRate: 21,
        explain: "스택(Stack)은 Last-In-First-Out(LIFO) 구조로, 가장 마지막에 들어간 데이터가 가장 먼저 나옵니다.",
      },
      {
        id: 1002,
        n: "Q2",
        keyword: "rear/front",
        question: "큐에서 삽입은 ___ 에서 이루어진다",
        choices: ["rear", "front", "top", "bottom"],
        answer: 0,
        studentAnswer: 1,
        errorRate: 52,
        explain: "큐는 rear(뒤)에서 삽입(enqueue), front(앞)에서 삭제(dequeue)합니다.",
      },
      {
        id: 1003,
        n: "Q3",
        keyword: "push/pop",
        question: "스택의 push 연산은 top을 1 증가시킨다",
        choices: ["O", "X"],
        answer: 0,
        studentAnswer: 0,
        errorRate: 27,
        explain: "push는 top을 +1 한 뒤 해당 위치에 데이터를 저장합니다. pop은 반대로 동작합니다.",
      },
    ],
  },
  {
    id: 2,
    label: "세트 #2",
    pdfRange: "p.4–8",
    startPage: 4,
    quizzes: [
      {
        id: 1004,
        n: "Q1",
        keyword: "연결 리스트",
        question: "연결 리스트의 각 요소를 ___ 라고 한다",
        choices: ["노드", "배열", "셀", "블록"],
        answer: 0,
        studentAnswer: 0,
        errorRate: 18,
        explain: "연결 리스트의 각 요소는 데이터와 다음 노드 참조를 가진 노드(Node)입니다.",
      },
      {
        id: 1005,
        n: "Q2",
        keyword: "단일 연결",
        question: "단일 연결 리스트는 역방향 순회가 O(1)이다",
        choices: ["O", "X"],
        answer: 1,
        studentAnswer: 0,
        errorRate: 61,
        explain: "단일 연결 리스트는 다음 참조만 있어 역방향 순회가 O(n)으로 느립니다.",
      },
    ],
  },
];

const COURSE_SETS = {
  ds: SETS,
  os: [
    {
      id: 1,
      label: "세트 #1",
      pdfRange: "p.2–6",
      startPage: 2,
      quizzes: [
        {
          id: 2001,
          n: "Q1",
          keyword: "프로세스",
          question: "실행 중인 프로그램을 무엇이라고 하나요?",
          choices: ["프로세스", "스레드", "커널", "캐시"],
          answer: 0,
          studentAnswer: 0,
          errorRate: 24,
          explain: "프로세스는 메모리에 올라와 실행 중인 프로그램 단위입니다.",
        },
        {
          id: 2002,
          n: "Q2",
          keyword: "스케줄링",
          question: "CPU 스케줄링의 주된 목적은?",
          choices: ["CPU 효율 향상", "디스크 포맷", "네트워크 암호화", "파일 압축"],
          answer: 0,
          studentAnswer: 2,
          errorRate: 47,
          explain: "스케줄링은 준비 큐의 프로세스 중 CPU를 배정할 대상을 정해 효율을 높입니다.",
        },
      ],
    },
  ],
  algo: [
    {
      id: 1,
      label: "세트 #1",
      pdfRange: "p.3–7",
      startPage: 3,
      quizzes: [
        {
          id: 3001,
          n: "Q1",
          keyword: "Big-O",
          question: "이진 탐색의 시간 복잡도는?",
          choices: ["O(log n)", "O(n)", "O(n²)", "O(1)"],
          answer: 0,
          studentAnswer: 0,
          errorRate: 19,
          explain: "이진 탐색은 탐색 범위를 절반씩 줄이므로 O(log n)입니다.",
        },
        {
          id: 3002,
          n: "Q2",
          keyword: "정렬",
          question: "퀵 정렬의 평균 시간 복잡도는?",
          choices: ["O(n log n)", "O(n)", "O(log n)", "O(n³)"],
          answer: 0,
          studentAnswer: 1,
          errorRate: 39,
          explain: "퀵 정렬은 평균적으로 분할이 균형 있게 일어나 O(n log n)입니다.",
        },
      ],
    },
  ],
  db: [
    {
      id: 1,
      label: "세트 #1",
      pdfRange: "p.8–12",
      startPage: 8,
      quizzes: [
        {
          id: 4001,
          n: "Q1",
          keyword: "정규화",
          question: "데이터 중복을 줄이고 이상 현상을 방지하는 설계 과정은?",
          choices: ["정규화", "파티셔닝", "인덱싱", "샤딩"],
          answer: 0,
          studentAnswer: 0,
          errorRate: 22,
          explain: "정규화는 중복과 삽입/삭제/갱신 이상을 줄이기 위한 관계형 DB 설계 과정입니다.",
        },
        {
          id: 4002,
          n: "Q2",
          keyword: "트랜잭션",
          question: "트랜잭션의 ACID 중 일관성은 무엇을 의미하나요?",
          choices: ["규칙을 만족한 상태 유지", "동시 실행 차단", "항상 빠른 조회", "로그 삭제"],
          answer: 0,
          studentAnswer: 2,
          errorRate: 44,
          explain: "일관성은 트랜잭션 전후 데이터가 정의된 제약조건과 규칙을 만족해야 함을 뜻합니다.",
        },
      ],
    },
  ],
};

const MEMO_PREFIX = "quizsync-memo-5-";
const LIVE_RESULTS_KEY = "quizsync-liveresults-5";

function loadMemo(qid) {
  try {
    return localStorage.getItem(MEMO_PREFIX + qid) || "";
  } catch {
    return "";
  }
}

function loadLiveSets() {
  try {
    const raw = localStorage.getItem(LIVE_RESULTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return null;
}

function saveMemo(qid, text) {
  try {
    localStorage.setItem(MEMO_PREFIX + qid, text);
  } catch {}
}

function StudentReviewPage() {
  const pdfCache = getPdfCache();
  const [activeCourseId, setActiveCourseId] = useState("ds");
  const activeCourse = REVIEW_COURSES.find((course) => course.id === activeCourseId) || REVIEW_COURSES[0];
  const [currentWeek, setCurrentWeek] = useState(activeCourse.week);
  // Load real session data if available for 자료구조론, fall back to per-course mock sets.
  const [sets, setSets] = useState(() => loadLiveSets() || COURSE_SETS.ds);
  const [activeSetId, setActiveSetId] = useState(() => {
    const live = loadLiveSets();
    return live ? live[0]?.id : 1;
  });
  const [filterMode, setFilterMode] = useState("all");
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfData, setPdfData] = useState(() => pdfCache.pdfData);
  const [memos, setMemos] = useState(() => {
    const allSets = loadLiveSets() || SETS;
    const m = {};
    allSets.forEach((s) =>
      s.quizzes.forEach((q) => {
        m[q.id] = loadMemo(q.id);
      })
    );
    return m;
  });

  useEffect(() => {
    const nextCourse = REVIEW_COURSES.find((course) => course.id === activeCourseId) || REVIEW_COURSES[0];
    const nextSets = activeCourseId === "ds" ? loadLiveSets() || COURSE_SETS.ds : COURSE_SETS[activeCourseId];
    setCurrentWeek(nextCourse.week);
    setSets(nextSets);
    setActiveSetId(nextSets[0]?.id || 1);
    setPdfPage(nextSets[0]?.startPage || 1);
    setFilterMode("all");

    const nextMemos = {};
    nextSets.forEach((s) =>
      s.quizzes.forEach((q) => {
        nextMemos[q.id] = loadMemo(q.id);
      })
    );
    setMemos(nextMemos);
  }, [activeCourseId]);

  // Apply student theme
  useEffect(() => {
    document.body.setAttribute("data-role", "student");
    return () => document.body.removeAttribute("data-role");
  }, []);

  // Jump to this set's starting page in the PDF when the tab changes
  useEffect(() => {
    const set = sets.find((s) => s.id === activeSetId);
    if (set?.startPage) setPdfPage(set.startPage);
  }, [activeSetId, sets]);

  const weekData =
    activeCourse.weeks.find((w) => w.week === currentWeek) ||
    activeCourse.weeks[activeCourse.weeks.length - 1];
  const activeSet = sets.find((s) => s.id === activeSetId) || sets[0];

  const handleWeekChange = (delta) => {
    const idx = activeCourse.weeks.findIndex((w) => w.week === currentWeek);
    const next = activeCourse.weeks[idx + delta];
    if (next) setCurrentWeek(next.week);
  };

  const handleMemoChange = (qid, text) => {
    setMemos((prev) => ({ ...prev, [qid]: text }));
    saveMemo(qid, text);
  };

  // Apply filter and sort
  const filtered = (() => {
    let list = activeSet.quizzes;
    if (filterMode === "wrong") {
      list = list.filter((q) => q.studentAnswer !== q.answer);
    } else if (filterMode === "hot") {
      list = [...list].sort((a, b) => b.errorRate - a.errorRate);
    }
    return list;
  })();

  const correctCount = activeSet.quizzes.filter(
    (q) => q.studentAnswer === q.answer
  ).length;
  const score = Math.round((correctCount / activeSet.quizzes.length) * 100);

  return (
    <RoleLayout role="student">
      <div className="review-split">
        {/* Left: quiz review panel */}
        <div className="review-quiz-panel">
          <div className="content">
            <div className="review-eyebrow-row">
              <p className="eyebrow">My Review</p>
              <label className="review-course-picker">
                <span>강의</span>
                <select value={activeCourseId} onChange={(e) => setActiveCourseId(e.target.value)}>
                  {REVIEW_COURSES.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 18,
                marginTop: 8,
              }}
            >
              <div>
                <h1 className="page-title">
                  {activeCourse.title} {currentWeek}주차 복습
                </h1>
                <p className="page-sub">
                  {activeCourse.meta} · 수업 중에 풀었던 퀴즈와 본인이 남긴 메모를 함께 확인할 수 있어요.
                </p>
              </div>
              <div className="week-nav">
                <button className="btn-arrow" type="button" onClick={() => handleWeekChange(-1)}>
                  <ChevronLeft size={16} />
                </button>
                <div className="now">
                  {currentWeek}주차{" "}
                  <span className="sub">{weekData.date}</span>
                </div>
                <button className="btn-arrow" type="button" onClick={() => handleWeekChange(1)}>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            <div
              style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 22 }}
            >
              {/* Score card */}
              <div className="card card-pad flow-card">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 16,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--brand-deep)",
                      }}
                    >
                      내 성적
                    </div>
                    <div
                      style={{
                        fontSize: 20,
                        fontWeight: 700,
                        marginTop: 4,
                      }}
                    >
                      {activeSet.label} · {activeSet.quizzes.length}문제 중{" "}
                      {correctCount}개 정답
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--zinc-500)",
                        marginTop: 6,
                      }}
                    >
                      전체 평균보다 2%p 높음
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div
                      className="mono"
                      style={{
                        fontSize: 36,
                        fontWeight: 700,
                        color: "var(--brand-deep)",
                      }}
                    >
                      {score}
                      <span style={{ fontSize: 18 }}>%</span>
                    </div>
                  </div>
                </div>
                <div className="bar" style={{ marginTop: 12 }}>
                  <div style={{ width: `${score}%` }} />
                </div>
              </div>

              {/* Set tabs + filter */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div className="set-tabs">
                  {sets.map((s, i) => (
                    <button
                      key={s.id}
                      className={`set-tab ${activeSetId === s.id ? "active" : ""}`}
                      type="button"
                      onClick={() => setActiveSetId(s.id)}
                    >
                      <span
                        className="dot"
                        style={{
                          background: i === 0 ? "var(--brand)" : "var(--brand-2)",
                        }}
                      />
                      {s.label}
                    </button>
                  ))}
                </div>
                <div className="filter-group">
                  <button
                    className={filterMode === "all" ? "on" : ""}
                    type="button"
                    onClick={() => setFilterMode("all")}
                  >
                    전체 문제
                  </button>
                  <button
                    className={filterMode === "wrong" ? "on" : ""}
                    type="button"
                    onClick={() => setFilterMode("wrong")}
                  >
                    내 오답만
                  </button>
                  <button
                    className={filterMode === "hot" ? "on" : ""}
                    type="button"
                    onClick={() => setFilterMode("hot")}
                  >
                    오답률 높은 순
                  </button>
                </div>
              </div>

              {/* Quiz list */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {filtered.length === 0 && (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "32px 16px",
                      color: "var(--zinc-500)",
                      fontSize: 13,
                    }}
                  >
                    해당하는 문제가 없습니다
                  </div>
                )}
                {filtered.map((quiz) => {
                  const isCorrect = quiz.studentAnswer === quiz.answer;
                  return (
                    <div key={quiz.id} className="quiz-item">
                      <div className="quiz-item-head">
                        <div className="q-num">
                          <strong>{quiz.n}</strong>
                          <span className="badge">{quiz.keyword}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span
                            style={{
                              fontSize: 11,
                              color: "var(--zinc-500)",
                            }}
                          >
                            전체 오답률{" "}
                            <span
                              style={{
                                fontWeight: 700,
                                color:
                                  quiz.errorRate >= 50
                                    ? "var(--danger)"
                                    : quiz.errorRate >= 30
                                    ? "var(--warning-700)"
                                    : "var(--zinc-700)",
                              }}
                            >
                              {quiz.errorRate}%
                            </span>
                          </span>
                          <span
                            className={`pill ${isCorrect ? "pill-success" : "pill-danger"}`}
                            style={{ fontSize: 10 }}
                          >
                            {isCorrect ? "정답" : "오답"}
                          </span>
                        </div>
                      </div>

                      <div
                        style={{ marginTop: 12, fontSize: 14, fontWeight: 500 }}
                      >
                        {quiz.question}
                      </div>

                      <div
                        className={`choices ${quiz.choices.length <= 2 ? "col1" : ""}`}
                        style={{ marginTop: 12 }}
                      >
                        {quiz.choices.map((choice, i) => {
                          const wasSelected = i === quiz.studentAnswer;
                          const isAnswerCorrect = i === quiz.answer;
                          let cls = "";
                          if (wasSelected && isAnswerCorrect) cls = "correct";
                          else if (wasSelected && !isAnswerCorrect) cls = "wrong";
                          else if (!wasSelected && isAnswerCorrect) cls = "correct";
                          return (
                            <div
                              key={i}
                              className={`choice ${cls}`}
                              style={{ cursor: "default", justifyContent: "space-between" }}
                            >
                              <span>{String.fromCharCode(65 + i)}. {choice}</span>
                              {isAnswerCorrect && (
                                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--success-700)", flexShrink: 0 }}>
                                  정답
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="explain-box">{quiz.explain}</div>

                      <div className="postit" style={{ marginTop: 12 }}>
                        <div className="head">✏ 수업 중 메모</div>
                        <textarea
                          placeholder="메모를 남겨두세요..."
                          value={memos[quiz.id] || ""}
                          onChange={(e) => handleMemoChange(quiz.id, e.target.value)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right: PDF panel */}
        <div className="review-pdf-panel">
          <div className="review-pdf-header">
            <FileText size={14} style={{ flexShrink: 0 }} />
            <span>강의자료</span>
            <span className="review-pdf-badge pill">
              {activeSet.label} 범위 · {activeSet.pdfRange}
            </span>
          </div>
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <PdfViewer
              pdfData={activeCourseId === "ds" ? pdfData : null}
              currentPage={pdfPage}
              onPageChange={setPdfPage}
              initialTotalPages={activeCourseId === "ds" ? pdfCache.pdfTotal : 0}
              role="student"
              variant="review"
            />
          </div>
        </div>
      </div>
    </RoleLayout>
  );
}

export default StudentReviewPage;
