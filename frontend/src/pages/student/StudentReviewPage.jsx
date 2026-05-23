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
  const [currentWeek, setCurrentWeek] = useState(5);
  // Load real session data if available, fall back to mock SETS
  const [sets, setSets] = useState(() => loadLiveSets() || SETS);
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

  const weekData = WEEKS.find((w) => w.week === currentWeek) || WEEKS[2];
  const activeSet = sets.find((s) => s.id === activeSetId) || sets[0];

  const handleWeekChange = (delta) => {
    const next = currentWeek + delta;
    if (next >= 1 && next <= 16) setCurrentWeek(next);
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
            <p className="eyebrow">My Review</p>
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
                  자료구조론 {currentWeek}주차 복습
                </h1>
                <p className="page-sub">
                  수업 중에 풀었던 퀴즈와 본인이 남긴 메모를 함께 확인할 수 있어요.
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
              pdfData={pdfData}
              currentPage={pdfPage}
              onPageChange={setPdfPage}
              initialTotalPages={pdfCache.pdfTotal}
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
