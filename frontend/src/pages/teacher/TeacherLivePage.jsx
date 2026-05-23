import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Sparkles, Zap, AlertCircle, Send, CheckCircle2 } from "lucide-react";
import RoleLayout from "../../components/RoleLayout.jsx";
import PdfViewer from "../../components/PdfViewer.jsx";
import { keywordsFor, quizFromKeyword, botCounts, BOT_RESP, SAMPLE_QUESTIONS } from "../../data/quizSyncMock.js";
import useBroadcastChannel from "../../hooks/useBroadcastChannel.js";
import { appendQuestionCache, getQuestionsCache, setPdfCache, setQuizSets, setCourseInfo, getPdfCache } from "../../data/sessionCache.js";

const PALETTE = ["var(--brand)", "var(--warning)", "#94a3b8", "#cbd5e1"];

function DonutStat({ counts }) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) {
    return (
      <div className="donut" style={{ background: "var(--zinc-100)" }}>
        <div className="ctr">
          <div className="v">0</div>
          <div className="l">명 응답</div>
        </div>
      </div>
    );
  }
  let cum = 0;
  const stops = counts.map((c, i) => {
    const pct = (c / total) * 100;
    const seg = `${PALETTE[i] || "#e2e8f0"} ${cum.toFixed(1)}% ${(cum + pct).toFixed(1)}%`;
    cum += pct;
    return seg;
  });
  return (
    <div className="donut" style={{ background: `conic-gradient(${stops.join(", ")})` }}>
      <div className="ctr">
        <div className="v">{total}</div>
        <div className="l">명 응답</div>
      </div>
    </div>
  );
}

function QuizStats({ question, counts }) {
  const total = counts.reduce((a, b) => a + b, 0);
  return (
    <div style={{ marginTop: 14 }}>
      <div className="donut-wrap">
        <DonutStat counts={counts} />
        <div style={{ flex: 1 }}>
          {question.choices.map((choice, i) => {
            const cnt = counts[i] || 0;
            const pct = total > 0 ? Math.round((cnt / total) * 100) : 0;
            return (
              <div key={i} className="choice-bar">
                <div className="sw" style={{ background: PALETTE[i] || "#e2e8f0" }} />
                <div className="lbl">
                  {String.fromCharCode(65 + i)}. {choice}
                  {i === question.answer && (
                    <span style={{ color: "var(--success)", marginLeft: 4 }}>★</span>
                  )}
                </div>
                <div className="v">{cnt}</div>
                <div className="pct">{pct}%</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TeacherLivePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    code = "JEB5ZA",
    courseName = "자료구조론",
    week = 5,
    pdfFileName = null,
    pdfTotal = 8,
    currentQuizSet = [],
  } = location.state || {};

  const [pdfData, setPdfData] = useState(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [totalPages, setTotalPages] = useState(pdfTotal);

  // Refs to read current state inside memoized callbacks without stale closure
  const emitRef = useRef(null);
  const pdfDataRef = useRef(null);
  const pdfPageRef = useRef(1);
  const setsRef = useRef([]);
  const activeSetIdRef = useRef(null);

  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(3);
  const [extractedKeywords, setExtractedKeywords] = useState([]);
  const [selectedKeywords, setSelectedKeywords] = useState([]);
  const [quizDraft, setQuizDraft] = useState(currentQuizSet);

  const [sets, setSets] = useState([]);
  const [activeSetId, setActiveSetId] = useState(null);

  const [activePanel, setActivePanel] = useState("quiz");
  const [setFilter, setSetFilter] = useState("current");
  const [joinCount, setJoinCount] = useState(12);
  const [questions, setQuestions] = useState(() => {
    const cached = getQuestionsCache();
    const defaults = SAMPLE_QUESTIONS.map((q) => ({ ...q, week, time: q.ago }));
    return [
      ...cached,
      ...defaults.filter((item) => !cached.some((q) => q.id === item.id)),
    ];
  });
  const [showEndModal, setShowEndModal] = useState(false);

  // class-mode hides sidebar and slims topbar
  useEffect(() => {
    document.body.classList.add("class-mode");
    return () => document.body.classList.remove("class-mode");
  }, []);

  // Load PDF from sessionCache (set by TeacherSetupPage on upload)
  useEffect(() => {
    const { pdfData: cached, pdfTotal: cachedTotal } = getPdfCache();
    if (cached) setPdfData(cached);
    if (cachedTotal) setTotalPages(cachedTotal);
  }, []);

  useEffect(() => {
    setCourseInfo({ code, courseName, week });
  }, [code, courseName, week]);

  // Keep refs current so handleMessage can read latest state
  useEffect(() => { pdfDataRef.current = pdfData; }, [pdfData]);
  useEffect(() => { pdfPageRef.current = pdfPage; }, [pdfPage]);
  useEffect(() => { setsRef.current = sets; }, [sets]);
  useEffect(() => { activeSetIdRef.current = activeSetId; }, [activeSetId]);

  const handleMessage = useCallback((msg) => {
    if (msg.type === "STUDENT_QUESTION") {
      const question = { ...msg.payload.question, week, time: msg.payload.question?.time || "방금 전" };
      setQuestions((prev) => {
        if (prev.some((item) => item.id === question.id)) return prev;
        appendQuestionCache(question);
        return [question, ...prev];
      });
    }
    // Student joined late — respond with current state
    if (msg.type === "STATE_REQUEST") {
      // Use ref if available, otherwise fall back to sessionStorage cache
      const pdfd = pdfDataRef.current || getPdfCache().pdfData;
      if (pdfd) {
        emitRef.current?.("PDF_LOADED", {
          pdfData: pdfd,
          pdfFileName,
          pdfTotal: totalPages,
        });
        // Keep ref in sync in case it was stale
        if (!pdfDataRef.current) pdfDataRef.current = pdfd;
      }
      emitRef.current?.("PDF_PAGE", { page: pdfPageRef.current || 1 });
      const active = setsRef.current.find((s) => s.id === activeSetIdRef.current);
      if (active) {
        emitRef.current?.("QUIZ_PUBLISHED", { setId: active.id, questions: active.questions });
      }
    }
  }, [week, pdfFileName, totalPages]);

  const emit = useBroadcastChannel("quizsync-v2", handleMessage);

  // Keep emitRef current
  useEffect(() => { emitRef.current = emit; }, [emit]);

  // Broadcast PDF to students as soon as the teacher live view receives it
  const pdfBroadcastedRef = useRef(false);
  useEffect(() => {
    if (!pdfData || pdfBroadcastedRef.current) return;
    pdfBroadcastedRef.current = true;
    emit("PDF_LOADED", { pdfData, pdfFileName, pdfTotal: totalPages });
  }, [pdfData, pdfFileName, totalPages, emit]);

  // Sync PDF page to students
  useEffect(() => {
    emit("PDF_PAGE", { page: pdfPage });
  }, [pdfPage, emit]);

  // Student count grows toward 32 during class
  useEffect(() => {
    const interval = setInterval(() => {
      setJoinCount((prev) => Math.min(prev + Math.floor(Math.random() * 2), 32));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Gradually fill response counts for the active set
  useEffect(() => {
    if (!activeSetId) return;
    const timer = setInterval(() => {
      setSets((prev) => {
        const set = prev.find((s) => s.id === activeSetId && s.status === "active");
        if (!set) return prev;
        let changed = false;
        const newCounts = { ...set.counts };
        set.questions.forEach((q) => {
          const full = BOT_RESP[q.keyword] || [10, 5, 3, 2];
          const cur = [...(newCounts[q.id] || [])];
          const totalFull = full.reduce((a, b) => a + b, 0);
          const totalCur = cur.reduce((a, b) => a + b, 0);
          if (totalCur < totalFull) {
            const eligible = full.reduce((acc, f, i) => {
              if ((cur[i] || 0) < f) acc.push(i);
              return acc;
            }, []);
            if (eligible.length > 0) {
              const idx = eligible[Math.floor(Math.random() * eligible.length)];
              cur[idx] = (cur[idx] || 0) + 1;
              newCounts[q.id] = cur;
              changed = true;
            }
          }
        });
        if (!changed) return prev;
        return prev.map((s) => (s.id === activeSetId ? { ...s, counts: newCounts } : s));
      });
    }, 1200);
    return () => clearInterval(timer);
  }, [activeSetId]);

  // Keep session cache in sync
  useEffect(() => {
    setQuizSets(sets);
  }, [sets]);

  const handleExtractKeywords = () => {
    setExtractedKeywords(keywordsFor(rangeStart, rangeEnd));
    setSelectedKeywords([]);
  };

  const handleToggleKeyword = (keyword) => {
    setSelectedKeywords((cur) => {
      if (cur.includes(keyword)) return cur.filter((k) => k !== keyword);
      if (cur.length >= 5) return cur;
      return [...cur, keyword];
    });
  };

  const handleGenerateQuiz = () => {
    const quiz = selectedKeywords.map((kw, i) => quizFromKeyword(kw, i));
    if (!quiz.length) return;
    setQuizDraft(quiz);
    setExtractedKeywords([]);
    setSelectedKeywords([]);
  };

  const handlePublishQuiz = () => {
    if (!quizDraft.length) return;
    const id = Date.now();
    const initialCounts = {};
    quizDraft.forEach((q) => {
      initialCounts[q.id] = botCounts(q.keyword);
    });
    const newSet = {
      id,
      idx: sets.length + 1,
      status: "active",
      createdAt: new Date().toLocaleTimeString("ko-KR"),
      startPage: rangeStart,
      pdfRange: rangeStart === rangeEnd ? `p.${rangeStart}` : `p.${rangeStart}-${rangeEnd}`,
      questions: quizDraft,
      counts: initialCounts,
    };
    setSets((prev) => [...prev, newSet]);
    setActiveSetId(id);
    setQuizDraft([]);
    emit("QUIZ_PUBLISHED", {
      setId: id,
      questions: quizDraft,
      startPage: rangeStart,
      pdfRange: rangeStart === rangeEnd ? `p.${rangeStart}` : `p.${rangeStart}-${rangeEnd}`,
    });
  };

  const handleCloseSet = (setId) => {
    setSets((prev) => prev.map((s) => (s.id === setId ? { ...s, status: "closed" } : s)));
    if (activeSetId === setId) setActiveSetId(null);
    emit("QUIZ_CLOSED", { setId });
  };

  const handleConfirmEnd = () => {
    emit("CLASS_ENDED", {});
    navigate("/teacher/report");
  };

  const activeSet = sets.find((s) => s.id === activeSetId);
  const closedSets = sets.filter((s) => s.status === "closed");
  const totalQuizCount =
    quizDraft.length +
    sets.reduce((a, s) => a + s.questions.length, 0);

  return (
    <RoleLayout role="teacher">
      <section className="content wide">
        {/* Status bar */}
        <div className="live-statusbar">
          <div className="left">
            <span className="pill pill-brand">
              {courseName} {week}주차
            </span>
            <span>
              학생 <strong>{joinCount}</strong>명 접속 중
            </span>
            <span className="live-pill">
              <span className="dot" />
              실시간 연동
            </span>
          </div>
          <div className="right">
            <span style={{ fontSize: 12, color: "var(--zinc-500)" }}>
              코드{" "}
              <strong className="mono" style={{ color: "var(--zinc-900)" }}>
                {code}
              </strong>
            </span>
            <button
              className="btn btn-danger btn-sm"
              type="button"
              onClick={() => setShowEndModal(true)}
            >
              수업 종료
            </button>
          </div>
        </div>

        <div className="split">
          {/* Left: PDF */}
          <div className="split-left" style={{ flex: "0 0 62%" }}>
            <PdfViewer
              pdfData={pdfData}
              currentPage={pdfPage}
              onPageChange={setPdfPage}
              onTotalPagesChange={setTotalPages}
              pdfFileName={pdfFileName}
              initialTotalPages={totalPages}
              role="teacher"
            />
          </div>

          <div className="split-handle" />

          {/* Right: Quiz / QnA */}
          <div
            className="split-right"
            style={{ flex: 1, paddingLeft: 14, minWidth: 340, display: "flex", flexDirection: "column" }}
          >
            <div className="set-filter-row">
              <div className="panel-tabs">
                <button
                  className={`panel-tab ${activePanel === "quiz" ? "active" : ""}`}
                  type="button"
                  onClick={() => setActivePanel("quiz")}
                >
                  퀴즈 <span className="badge">{totalQuizCount}</span>
                </button>
                <button
                  className={`panel-tab ${activePanel === "qna" ? "active" : ""}`}
                  type="button"
                  onClick={() => setActivePanel("qna")}
                >
                  질문함 <span className="badge">{questions.length}</span>
                </button>
              </div>
              <div className="filter-group">
                <button
                  className={setFilter === "current" ? "on" : ""}
                  type="button"
                  onClick={() => setSetFilter("current")}
                >
                  현재 세트
                </button>
                <button
                  className={setFilter === "closed" ? "on" : ""}
                  type="button"
                  onClick={() => setSetFilter("closed")}
                >
                  마감된 세트
                </button>
              </div>
            </div>

            {/* Quiz panel */}
            {activePanel === "quiz" && (
              <div className="panel-list">
                {setFilter === "current" ? (
                  <>
                    {/* AI Generator card */}
                    <article className="card flow-card">
                      <div className="card-pad-lg">
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <div>
                            <span className="eyebrow">Quiz Generator</span>
                            <h3 style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>
                              새 퀴즈 세트 만들기
                            </h3>
                          </div>
                          <span className="pill pill-brand">AI</span>
                        </div>

                        <div style={{ marginTop: 14 }}>
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: "var(--zinc-700)",
                              marginBottom: 8,
                            }}
                          >
                            생성 범위
                          </div>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 16px 1fr",
                              gap: 10,
                              alignItems: "center",
                            }}
                          >
                            <input
                              type="number"
                              className="input"
                              min="1"
                              value={rangeStart}
                              onChange={(e) => setRangeStart(Number(e.target.value))}
                            />
                            <div style={{ textAlign: "center", color: "var(--zinc-400)" }}>—</div>
                            <input
                              type="number"
                              className="input"
                              min="1"
                              value={rangeEnd}
                              onChange={(e) => setRangeEnd(Number(e.target.value))}
                            />
                          </div>
                          <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                            <button
                              className="btn btn-ghost btn-sm"
                              type="button"
                              onClick={() => {
                                setRangeStart(pdfPage);
                                setRangeEnd(pdfPage);
                              }}
                            >
                              현재 페이지
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              type="button"
                              onClick={() => {
                                setRangeStart(Math.max(1, pdfPage - 2));
                                setRangeEnd(pdfPage);
                              }}
                            >
                              최근 3p
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              type="button"
                              onClick={() => {
                                setRangeStart(1);
                                setRangeEnd(totalPages);
                              }}
                            >
                              전체
                            </button>
                          </div>
                        </div>

                        <button
                          className="btn btn-ghost"
                          type="button"
                          style={{ marginTop: 14, width: "100%" }}
                          onClick={handleExtractKeywords}
                        >
                          <Sparkles size={14} /> AI 핵심 키워드 추출
                        </button>

                        {extractedKeywords.length > 0 && (
                          <div style={{ marginTop: 14 }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 12,
                                  fontWeight: 600,
                                  color: "var(--zinc-700)",
                                }}
                              >
                                추출된 키워드
                              </div>
                              <div style={{ fontSize: 11, color: "var(--zinc-500)" }}>
                                선택{" "}
                                <span
                                  style={{ color: "var(--brand-deep)", fontWeight: 700 }}
                                >
                                  {selectedKeywords.length}
                                </span>{" "}
                                / 최대 5
                              </div>
                            </div>
                            <div className="chip-wrap" style={{ marginTop: 8 }}>
                              {extractedKeywords.map((kw) => (
                                <button
                                  key={kw}
                                  className={`chip ${
                                    selectedKeywords.includes(kw) ? "selected" : ""
                                  }`}
                                  type="button"
                                  onClick={() => handleToggleKeyword(kw)}
                                >
                                  {kw}
                                </button>
                              ))}
                            </div>
                            <p style={{ marginTop: 8, fontSize: 11, color: "var(--zinc-500)" }}>
                              선택한 키워드 1개당 1문제가 생성됩니다.
                            </p>
                            <button
                              className="btn btn-primary"
                              type="button"
                              style={{ marginTop: 12, width: "100%" }}
                              disabled={selectedKeywords.length === 0}
                              onClick={handleGenerateQuiz}
                            >
                              <Zap size={14} /> 선택한 키워드로 퀴즈 생성
                            </button>
                          </div>
                        )}
                      </div>
                    </article>

                    {/* Draft quiz card */}
                    {quizDraft.length > 0 && (
                      <article className="card">
                        <div className="card-head">
                          <div>
                            <div className="card-title">
                              새 세트 · #{sets.length + 1}
                            </div>
                            <div className="card-sub">
                              {quizDraft.length}문제 · 학생에게 출제하기 전 확인하세요
                            </div>
                          </div>
                          <button
                            className="btn btn-ghost btn-sm"
                            type="button"
                            onClick={() => setQuizDraft([])}
                          >
                            폐기
                          </button>
                        </div>
                        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                          {quizDraft.map((q) => (
                            <div key={q.id} className="quiz-item">
                              <div className="quiz-item-head">
                                <div className="q-num">
                                  <strong>{q.n}</strong>
                                  <span className="badge">{q.keyword}</span>
                                </div>
                                <span className="pill pill-neutral" style={{ fontSize: 10 }}>
                                  {q.type}
                                </span>
                              </div>
                              <div style={{ marginTop: 10, fontSize: 14, fontWeight: 500 }}>
                                {q.question}
                              </div>
                              <div
                                className={`choices ${
                                  q.choices.length <= 2 ? "col1" : ""
                                }`}
                                style={{ marginTop: 10 }}
                              >
                                {q.choices.map((choice, i) => (
                                  <div
                                    key={i}
                                    className={`choice ${i === q.answer ? "correct" : ""}`}
                                    style={{ cursor: "default" }}
                                  >
                                    {String.fromCharCode(65 + i)}. {choice}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div
                          style={{
                            padding: "14px 16px",
                            borderTop: "1px solid var(--zinc-150)",
                          }}
                        >
                          <button
                            className="btn btn-primary"
                            type="button"
                            style={{ width: "100%" }}
                            onClick={handlePublishQuiz}
                          >
                            <Send size={14} /> 학생에게 퀴즈 내보내기
                          </button>
                        </div>
                      </article>
                    )}

                    {/* Active set stats card */}
                    {activeSet && (
                      <article className="card">
                        <div className="card-head">
                          <div>
                            <div className="card-title">세트 #{activeSet.idx} 응답 현황</div>
                            <div className="card-sub">
                              {activeSet.questions.reduce(
                                (a, q) =>
                                  a +
                                  (activeSet.counts[q.id]?.reduce((x, y) => x + y, 0) || 0),
                                0
                              )}{" "}
                              / {joinCount}명 응답 중
                            </div>
                          </div>
                          <span className="pill pill-success">
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                background: "var(--success)",
                                display: "inline-block",
                                marginRight: 4,
                              }}
                            />
                            출제 중
                          </span>
                        </div>
                        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                          {activeSet.questions.map((q) => {
                            const counts =
                              activeSet.counts[q.id] ||
                              new Array(q.choices.length).fill(0);
                            return (
                              <div key={q.id} className="quiz-item active">
                                <div className="quiz-item-head">
                                  <div className="q-num">
                                    <strong>{q.n}</strong>
                                    <span className="badge">{q.keyword}</span>
                                  </div>
                                </div>
                                <div style={{ marginTop: 8, fontSize: 14 }}>
                                  {q.question}
                                </div>
                                <QuizStats question={q} counts={counts} />
                              </div>
                            );
                          })}
                        </div>
                        <div
                          style={{
                            padding: "14px 16px",
                            borderTop: "1px solid var(--zinc-150)",
                          }}
                        >
                          <button
                            className="btn btn-dark"
                            type="button"
                            style={{ width: "100%" }}
                            onClick={() => handleCloseSet(activeSet.id)}
                          >
                            <CheckCircle2 size={14} /> 정답 공개 및 마감
                          </button>
                        </div>
                      </article>
                    )}

                    {!quizDraft.length && !activeSet && (
                      <div
                        style={{
                          textAlign: "center",
                          padding: "32px 16px",
                          color: "var(--zinc-500)",
                          fontSize: 13,
                        }}
                      >
                        키워드를 추출하고 퀴즈를 생성해보세요
                      </div>
                    )}
                  </>
                ) : (
                  /* Closed sets */
                  <>
                    {closedSets.length === 0 ? (
                      <div
                        style={{
                          textAlign: "center",
                          padding: "32px 16px",
                          color: "var(--zinc-500)",
                          fontSize: 13,
                        }}
                      >
                        마감된 세트가 없습니다
                      </div>
                    ) : (
                      closedSets.map((s) => (
                        <article key={s.id} className="card">
                          <div className="card-head">
                            <div>
                              <div className="card-title">세트 #{s.idx}</div>
                              <div className="card-sub">
                                {s.questions.length}문제 · 마감 {s.createdAt}
                              </div>
                            </div>
                            <span className="pill pill-neutral">마감됨</span>
                          </div>
                          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                            {s.questions.map((q) => {
                              const counts =
                                s.counts[q.id] ||
                                new Array(q.choices.length).fill(0);
                              return (
                                <div key={q.id} className="quiz-item">
                                  <div className="quiz-item-head">
                                    <div className="q-num">
                                      <strong>{q.n}</strong>
                                      <span className="badge">{q.keyword}</span>
                                    </div>
                                  </div>
                                  <div style={{ marginTop: 8, fontSize: 14 }}>
                                    {q.question}
                                  </div>
                                  <QuizStats question={q} counts={counts} />
                                  <div className="explain-box">{q.explain}</div>
                                </div>
                              );
                            })}
                          </div>
                        </article>
                      ))
                    )}
                  </>
                )}
              </div>
            )}

            {/* QnA panel */}
            {activePanel === "qna" && (
              <div className="panel-list">
                <article className="card">
                  <div className="card-head">
                    <div>
                      <div className="card-title">익명 질문함</div>
                      <div className="card-sub">
                        학생들이 수업 중에 보낸 질문입니다 · 답변은 수업 후 리포트에서
                      </div>
                    </div>
                    <span className="pill pill-neutral">{questions.length}개</span>
                  </div>
                  <div style={{ padding: 14 }}>
                    {questions.map((q) => (
                      <div key={q.id} className="qna-item">
                        <div className="meta">
                          {q.week}주차 · {q.time || q.ago}
                        </div>
                        <div className="body">{q.text}</div>
                      </div>
                    ))}
                  </div>
                </article>
              </div>
            )}
          </div>
        </div>

        {/* End class modal */}
        {showEndModal && (
          <div className="modal-backdrop open">
            <div className="modal">
              <div
                className="modal-head"
                style={{ display: "flex", gap: 14, alignItems: "flex-start" }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: "var(--danger-50)",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <AlertCircle size={20} color="var(--danger)" />
                </div>
                <div>
                  <h3>수업을 종료하시겠어요?</h3>
                  <p>확인 시 수업이 마감되고 리포트 페이지로 이동합니다.</p>
                </div>
              </div>
              <div className="modal-foot">
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => setShowEndModal(false)}
                >
                  취소
                </button>
                <button
                  className="btn btn-danger"
                  type="button"
                  onClick={handleConfirmEnd}
                >
                  수업 종료
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </RoleLayout>
  );
}

export default TeacherLivePage;
