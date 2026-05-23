import { useState } from "react";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import RoleLayout from "../../components/RoleLayout.jsx";
import PdfViewer from "../../components/PdfViewer.jsx";

const WEEKS = [
  { week: 3, date: "2026.04.29" },
  { week: 4, date: "2026.05.06" },
  { week: 5, date: "2026.05.13" },
  { week: 6, date: "2026.05.20" },
];

const QUIZZES = [
  {
    id: 1,
    n: "01",
    keyword: "자료처",
    question: "스택은 ___ 구조 파른 선입 자료구조이다",
    setId: 1,
    choices: [
      { id: "A", label: "LIFO", correct: true, selected: true },
      { id: "B", label: "FIFO", correct: false },
      { id: "C", label: "트리", correct: false },
      { id: "D", label: "그래프", correct: false },
    ],
    explanation: "해설: 스택(Stack)은 Last-In-First-Out(LIFO) 구조, 기말 데이터가 가장 먼저 나온다는 의미입니다.",
    memoText: "수업 중에 배웠던 자료구조\n꼭 포현하기",
  },
  {
    id: 2,
    n: "02",
    keyword: "rear/front",
    question: "큐에서 삽입은 ___ 에서 이루어진다",
    setId: 1,
    choices: [
      { id: "A", label: "roar", correct: true, selected: true },
      { id: "B", label: "front", correct: false },
    ],
    explanation: "해설: 큐는 뒤에서 삽입(rear)하고 앞에서 삭제(front)합니다.",
    memoText: "",
  },
];

function StudentReviewPage() {
  const [currentWeek, setCurrentWeek] = useState(5);
  const [activeSet, setActiveSet] = useState(1);
  const [filterMode, setFilterMode] = useState("all");
  const [pdfPage, setPdfPage] = useState(1);

  const weekData = WEEKS.find((w) => w.week === currentWeek) || WEEKS[2];
  const quizzes = QUIZZES.filter((q) => q.setId === activeSet);

  const correctCount = quizzes.filter((q) => q.choices.some((c) => c.correct && c.selected)).length;
  const score = Math.round((correctCount / quizzes.length) * 100);

  const handleWeekChange = (delta) => {
    const newWeek = currentWeek + delta;
    if (newWeek >= 1 && newWeek <= 16) {
      setCurrentWeek(newWeek);
    }
  };

  return (
    <RoleLayout role="student">
      <div className="review-split">
        {/* 왼쪽: 퀴즈 복습 패널 */}
        <div className="review-quiz-panel">
          <div className="content">
            <p className="eyebrow">My Review</p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "18px", marginTop: "8px" }}>
              <div>
                <h1 className="page-title">자료구조론 {currentWeek}주차 복습</h1>
                <p className="page-sub">수업 중에 풀었던 퀴즈와 본인이 남긴 메모를 함께 확인할 수 있어요.</p>
              </div>
              <div className="week-nav">
                <button className="btn-arrow" onClick={() => handleWeekChange(-1)}>
                  <ChevronLeft size={16} />
                </button>
                <div className="now">
                  {currentWeek}주차 <span className="sub">{weekData.date}</span>
                </div>
                <button className="btn-arrow" onClick={() => handleWeekChange(1)}>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "18px", marginTop: "22px" }}>
              {/* 내 성적 카드 */}
              <div className="card card-pad flow-card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--brand-deep)" }}>내 성적</div>
                    <div style={{ fontSize: "24px", fontWeight: "700", marginTop: "4px" }}>
                      {activeSet} 세트 · {quizzes.length}문제 중 {correctCount}개 정답
                    </div>
                    <div style={{ fontSize: "13px", color: "var(--zinc-500)", marginTop: "6px" }}>전체 평균보다 2%p 높음</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="mono" style={{ fontSize: "36px", fontWeight: "700", color: "var(--brand-deep)" }}>
                      {score}<span style={{ fontSize: "18px" }}>%</span>
                    </div>
                  </div>
                </div>
                <div className="bar" style={{ marginTop: "12px" }}>
                  <div style={{ width: `${score}%` }}></div>
                </div>
              </div>

              {/* 세트 탭 및 필터 */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <div className="set-tabs">
                  <button
                    className={`set-tab ${activeSet === 1 ? "active" : ""}`}
                    onClick={() => setActiveSet(1)}
                  >
                    <span className="dot" style={{ background: "var(--brand)" }}></span>세트 #1
                  </button>
                  <button
                    className={`set-tab ${activeSet === 2 ? "active" : ""}`}
                    onClick={() => setActiveSet(2)}
                  >
                    <span className="dot" style={{ background: "var(--brand-2)" }}></span>세트 #2
                  </button>
                </div>
                <div className="filter-group">
                  <button className={filterMode === "all" ? "on" : ""} onClick={() => setFilterMode("all")}>
                    전체 문제
                  </button>
                  <button className={filterMode === "wrong" ? "on" : ""} onClick={() => setFilterMode("wrong")}>
                    내 오답만
                  </button>
                  <button className={filterMode === "hot" ? "on" : ""} onClick={() => setFilterMode("hot")}>
                    오답률 높은 순
                  </button>
                </div>
              </div>

              {/* 퀴즈 리스트 */}
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {quizzes.map((quiz) => (
                  <div key={quiz.id} className="quiz-item">
                    <div className="quiz-item-head">
                      <div className="q-num">
                        <strong>{quiz.n}</strong>
                        <span className="badge">{quiz.keyword}</span>
                      </div>
                    </div>
                    <div style={{ marginTop: "12px", fontSize: "14px", fontWeight: "500" }}>{quiz.question}</div>
                    <div className="choices">
                      {quiz.choices.map((choice) => (
                        <div
                          key={choice.id}
                          className={`choice ${choice.selected ? (choice.correct ? "" : "wrong") : choice.correct ? "correct" : ""}`}
                        >
                          <div className="ck"></div>
                          {choice.id}. {choice.label}
                        </div>
                      ))}
                    </div>
                    <div className="explain-box">{quiz.explanation}</div>
                    {quiz.memoText && (
                      <div className="postit" style={{ marginTop: "12px" }}>
                        <div className="head">수업 중 메모</div>
                        {quiz.memoText}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 오른쪽: PDF 패널 */}
        <div className="review-pdf-panel">
          <div className="review-pdf-header">
            <FileText size={14} style={{ flexShrink: 0 }} />
            <span>강의자료</span>
            <span className="pill review-pdf-badge">세트 #{activeSet} 범위 · p.1–5</span>
          </div>
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <PdfViewer currentPage={pdfPage} onPageChange={setPdfPage} role="student" />
          </div>
        </div>
      </div>
    </RoleLayout>
  );
}

export default StudentReviewPage;
