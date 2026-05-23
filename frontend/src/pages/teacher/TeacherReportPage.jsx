import { useState } from "react";
import { ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import RoleLayout from "../../components/RoleLayout.jsx";

const WEEKS = [
  { week: 3, date: "2026.04.29" },
  { week: 4, date: "2026.05.06" },
  { week: 5, date: "2026.05.13" },
  { week: 6, date: "2026.05.20", future: true },
  { week: 7, date: "2026.05.27", future: true },
  { week: 8, date: "2026.06.03", future: true },
];

const WEEK_CURRENT = 5;

const REPORT_SETS = {
  1: {
    name: "세트 #1",
    questions: 5,
    pages: "p.1~3",
    avgScore: 68,
    results: [
      { q: "Q1. 스택 개념", correct: 28, total: 32, pct: 87.5 },
      { q: "Q2. 큐 개념", correct: 22, total: 32, pct: 68.75 },
      { q: "Q3. 연결 리스트", correct: 15, total: 32, pct: 46.87 },
      { q: "Q4. 포인터", correct: 12, total: 32, pct: 37.5 },
      { q: "Q5. 힙 개념", correct: 26, total: 32, pct: 81.25 },
    ],
  },
  2: {
    name: "세트 #2",
    questions: 3,
    pages: "p.4~8",
    avgScore: 68,
    results: [
      { q: "Q6. 이진 탐색", correct: 24, total: 32, pct: 75 },
      { q: "Q7. 해시 테이블", correct: 20, total: 32, pct: 62.5 },
      { q: "Q8. 그래프 순회", correct: 19, total: 32, pct: 59.37 },
    ],
  },
};

const CONCEPTS = [
  { name: "포인터", score: 38 },
  { name: "연결 리스트", score: 45 },
  { name: "큐 삽입/삭제", score: 52 },
  { name: "스택 개념", score: 75 },
  { name: "힙 트리", score: 80 },
];

const QNA_ITEMS = [
  { week: 5, time: "22분 전", text: "스택 오버플로우가 언제 발생하나요?" },
  { week: 5, time: "15분 전", text: "연결 리스트와 배열의 가장 큰 차이가 뭔지 다시 정리해주세요." },
  { week: 5, time: "8분 전", text: "큐와 덱(Deque)의 차이가 뭔가요? 환형 큐랑은 어떻게 다른가요?" },
  { week: 5, time: "5분 전", text: "힙에서 부모-자식 인덱스 계산 공식 한 번 더 짚어주실 수 있나요?" },
];

function TeacherReportPage() {
  const [currentWeek, setCurrentWeek] = useState(WEEK_CURRENT);
  const [activeSetId, setActiveSetId] = useState(1);

  const weekData = WEEKS.find((w) => w.week === currentWeek);
  const isFutureWeek = weekData?.future;
  const activeSet = REPORT_SETS[activeSetId];

  const handleWeekChange = (step) => {
    const newWeek = currentWeek + step;
    const validWeek = WEEKS.find((w) => w.week === newWeek);
    if (validWeek) setCurrentWeek(newWeek);
  };

  const getBarColor = (score) => {
    if (score < 50) return "var(--danger)";
    if (score < 70) return "var(--warning)";
    return "var(--success)";
  };

  return (
    <RoleLayout role="teacher" title="수업 리포트">
      <div className="content">
        {/* 헤더 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, marginBottom: 22 }}>
          <div>
            <p className="eyebrow">Weekly Report</p>
            <h1 className="page-title">자료구조론 {currentWeek}주차 — 수업 리포트</h1>
            <p className="page-sub">{weekData?.date} · 90분 · 출제 2세트 · 응답 32명</p>
          </div>
          <div className="week-nav" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() => handleWeekChange(-1)}
              disabled={currentWeek === Math.min(...WEEKS.map((w) => w.week))}
            >
              <ChevronLeft size={16} />
            </button>
            <div style={{ minWidth: 100, textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--zinc-900)" }}>{currentWeek}주차</div>
              <div style={{ fontSize: 11, color: "var(--zinc-500)", marginTop: 2 }}>{weekData?.date}</div>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() => handleWeekChange(1)}
              disabled={currentWeek === Math.max(...WEEKS.map((w) => w.week))}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Empty state */}
        {isFutureWeek && (
          <div style={{ marginTop: 32 }}>
            <div className="card card-pad-lg" style={{ textAlign: "center", padding: "60px 24px" }}>
              <div style={{ width: 64, height: 64, margin: "0 auto", borderRadius: 18, background: "var(--brand-50)", display: "grid", placeItems: "center", marginBottom: 14 }}>
                📅
              </div>
              <span className="pill pill-warn" style={{ display: "inline-flex" }}>
                수업 전
              </span>
              <h3 style={{ marginTop: 10, fontSize: 18, fontWeight: 700, color: "var(--zinc-900)" }}>
                {currentWeek}주차 수업은 아직 진행되지 않았어요
              </h3>
              <p style={{ marginTop: 6, fontSize: 13.5, color: "var(--zinc-500)", lineHeight: 1.7 }}>
                예정 일자: {weekData?.date} · 수업이 끝난 뒤 리포트가 이곳에 자동 생성됩니다.
              </p>
            </div>
          </div>
        )}

        {/* Report Content */}
        {!isFutureWeek && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 22 }}>
            {/* Stat Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              <div className="card card-pad">
                <div style={{ fontSize: 11, color: "var(--zinc-500)", fontWeight: 600 }}>참여 학생</div>
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>
                  32 <span style={{ fontSize: 13, color: "var(--zinc-500)", fontWeight: 500 }}>명</span>
                </div>
              </div>
              <div className="card card-pad">
                <div style={{ fontSize: 11, color: "var(--zinc-500)", fontWeight: 600 }}>출제 세트 · 문제</div>
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>
                  2 / 8 <span style={{ fontSize: 13, color: "var(--zinc-500)", fontWeight: 500 }}>개</span>
                </div>
              </div>
              <div className="card card-pad">
                <div style={{ fontSize: 11, color: "var(--zinc-500)", fontWeight: 600 }}>평균 정답률</div>
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6, color: "var(--success-700)" }}>
                  68 <span style={{ fontSize: 13, color: "var(--zinc-500)", fontWeight: 500 }}>%</span>
                </div>
              </div>
              <div className="card card-pad">
                <div style={{ fontSize: 11, color: "var(--zinc-500)", fontWeight: 600 }}>익명 질문</div>
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>
                  {QNA_ITEMS.length} <span style={{ fontSize: 13, color: "var(--zinc-500)", fontWeight: 500 }}>개</span>
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
                {CONCEPTS.map((c) => (
                  <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                    <div style={{ flex: "0 0 100px", fontSize: 13, fontWeight: 500, color: "var(--zinc-700)" }}>
                      {c.name}
                    </div>
                    <div style={{ flex: 1, height: 6, background: "var(--zinc-200)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${c.score}%`, background: getBarColor(c.score), transition: "width 0.3s" }} />
                    </div>
                    <div style={{ flex: "0 0 40px", textAlign: "right", fontSize: 12, fontWeight: 600, color: getBarColor(c.score) }}>
                      {c.score}%
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: 14, padding: "12px 14px", background: "var(--warning-50)", borderRadius: 11, display: "flex", alignItems: "flex-start", gap: 10 }}>
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
                    {activeSet.name} · {activeSet.questions}문제 · {activeSet.pages} · 평균 정답률 {activeSet.avgScore}%
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {Object.entries(REPORT_SETS).map(([id, set]) => (
                    <button
                      key={id}
                      className={`btn btn-sm${activeSetId === parseInt(id) ? " btn-primary" : " btn-ghost"}`}
                      type="button"
                      onClick={() => setActiveSetId(parseInt(id))}
                    >
                      <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: parseInt(id) === 1 ? "var(--brand-deep)" : "var(--brand-2)", marginRight: 6 }} />
                      {set.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="card-pad">
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--zinc-200)" }}>
                      <th style={{ textAlign: "left", padding: "8px 0", fontWeight: 600, color: "var(--zinc-600)" }}>문제</th>
                      <th style={{ textAlign: "center", padding: "8px 0", fontWeight: 600, color: "var(--zinc-600)" }}>정답 수</th>
                      <th style={{ textAlign: "center", padding: "8px 0", fontWeight: 600, color: "var(--zinc-600)" }}>정답률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeSet.results.map((r, idx) => (
                      <tr key={idx} style={{ borderBottom: "1px solid var(--zinc-100)" }}>
                        <td style={{ padding: "8px 0", color: "var(--zinc-800)" }}>{r.q}</td>
                        <td style={{ textAlign: "center", padding: "8px 0", color: "var(--zinc-600)" }}>
                          {r.correct} / {r.total}
                        </td>
                        <td style={{ textAlign: "center", padding: "8px 0", fontWeight: 600, color: "var(--zinc-800)" }}>
                          {r.pct.toFixed(1)}%
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
                <span className="pill pill-neutral">{QNA_ITEMS.length}개</span>
              </div>
              <div className="qna-scroll card-pad">
                {QNA_ITEMS.map((q, idx) => (
                  <div key={idx} className="qna-item">
                    <div className="meta">
                      {q.week}주차 · {q.time}
                    </div>
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
