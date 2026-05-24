import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Sparkles, Zap, AlertCircle, Send, CheckCircle2, Pencil, Trash2, Plus } from "lucide-react";
import RoleLayout from "../../components/RoleLayout.jsx";
import PdfViewer from "../../components/PdfViewer.jsx";
import { keywordsFor, quizFromKeyword, botCounts, BOT_RESP, SAMPLE_QUESTIONS } from "../../data/quizSyncMock.js";
import useBroadcastChannel from "../../hooks/useBroadcastChannel.js";
import { appendQuestionCache, getQuestionsCache, setPdfCache, setQuizSets, setCourseInfo, getPdfCache } from "../../data/sessionCache.js";
import { generateQuizzes, getQuizGenerateStatus, getConcepts, getLectureQuizzes, deleteQuiz, updateQuizStatus, createManualQuiz, updateQuiz, getQuizDetail } from "../../api/lectureApi.js";

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
    lectureId = null,
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
  const dataLoadedRef = useRef(false);   // 초기 데이터 로드 중복 방지

  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(3);
  const [extractedKeywords, setExtractedKeywords] = useState([]);
  const [selectedKeywords, setSelectedKeywords] = useState([]);
  const [quizDraft, setQuizDraft] = useState(currentQuizSet);
  const [concepts, setConcepts] = useState([]);
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const [manualForm, setManualForm] = useState(null);   // null = 숨김
  const [editForm, setEditForm] = useState(null);       // null = 숨김

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

  // 마운트 시: 개념 목록 + 기존 DRAFT 퀴즈 로드 (1회만 실행)
  useEffect(() => {
    if (!lectureId || dataLoadedRef.current) return;
    dataLoadedRef.current = true;
    getConcepts(lectureId)
      .then((res) => setConcepts(res.concepts || []))
      .catch(() => {});
    getLectureQuizzes(lectureId, { status: "DRAFT" })
      .then((res) => {
        const list = res.quizzes || [];
        if (list.length > 0) {
          setQuizDraft((prev) =>
            prev.length === 0
              ? list.map((q, i) => ({
                  id: q.quiz_id,
                  n: i + 1,
                  keyword: q.concept || "개념",
                  type: q.quiz_type === "OX" ? "OX" : q.quiz_type === "BLANK" ? "빈칸형" : "객관식",
                  question: q.question,
                  choices: Array.isArray(q.options) ? q.options : [],
                  answer: Array.isArray(q.options) ? Math.max(0, q.options.indexOf(q.answer)) : 0,
                  explain: q.explanation || "",
                }))
              : prev
          );
        }
      })
      .catch(() => {});
  }, [lectureId]);

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
    if (!lectureId || concepts.length === 0) {
      // fallback: lectureId 없거나 아직 개념 로드 전
      setExtractedKeywords(keywordsFor(rangeStart, rangeEnd));
      setSelectedKeywords([]);
      return;
    }
    // page_num 기준 범위 필터 (없으면 전체)
    const filtered = concepts.filter(
      (c) => !c.page_num || (c.page_num >= rangeStart && c.page_num <= rangeEnd)
    );
    const list = filtered.length > 0 ? filtered : concepts;
    setExtractedKeywords(list.map((c) => c.concept_name));
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
    if (selectedKeywords.length === 0) return;

    if (!lectureId) {
      // fallback
      const quiz = selectedKeywords.map((kw, i) => quizFromKeyword(kw, i));
      setQuizDraft(quiz);
      setExtractedKeywords([]);
      setSelectedKeywords([]);
      return;
    }

    const conceptIds = selectedKeywords
      .map((kw) => concepts.find((c) => c.concept_name === kw)?.concept_id)
      .filter(Boolean);

    setLoadingQuiz(true);
    generateQuizzes(lectureId, {
      page_start: rangeStart,
      page_end: rangeEnd,
      quiz_type: "MIXED",
      ...(conceptIds.length > 0 && { concept_ids: conceptIds }),
    })
      .then(() => getQuizGenerateStatus(lectureId))
      .then((res) => {
        const list = res.quizzes || [];
        const converted = list.map((q, i) => ({
          id: q.quiz_id,
          n: i + 1,
          keyword: q.concept || concepts.find((c) => c.concept_id === q.concept_id)?.concept_name || "개념",
          type: q.quiz_type === "OX" ? "OX" : q.quiz_type === "BLANK" ? "빈칸형" : "객관식",
          question: q.question,
          choices: Array.isArray(q.options) ? q.options : [],
          answer: Array.isArray(q.options) ? Math.max(0, q.options.indexOf(q.answer)) : 0,
          explain: q.explanation || "",
        }));
        setQuizDraft(converted);
        setExtractedKeywords([]);
        setSelectedKeywords([]);
      })
      .catch((err) => {
        console.error("퀴즈 생성 실패:", err.message);
        // fallback
        const quiz = selectedKeywords.map((kw, i) => quizFromKeyword(kw, i));
        setQuizDraft(quiz);
        setExtractedKeywords([]);
        setSelectedKeywords([]);
      })
      .finally(() => setLoadingQuiz(false));
  };

  // ── 드래프트에서 개별 퀴즈 삭제 (deleteQuiz) ───────────
  const handleDeleteQuizFromDraft = (quizId) => {
    if (lectureId) {
      deleteQuiz(quizId).catch((err) => console.error("퀴즈 삭제 실패:", err.message));
    }
    setQuizDraft((prev) => prev.filter((q) => q.id !== quizId));
  };

  // ── 퀴즈 수정 폼 열기 (getQuizDetail → editForm 세팅) ──
  const handleEditClick = (quiz) => {
    const fallback = {
      quizId: quiz.id,
      question: quiz.question,
      options: Array.isArray(quiz.choices) ? [...quiz.choices] : [],
      answer: Array.isArray(quiz.choices) ? (quiz.choices[quiz.answer] ?? "") : "",
      explanation: quiz.explain || "",
    };
    if (lectureId) {
      getQuizDetail(quiz.id)
        .then((data) =>
          setEditForm({
            quizId: data.quiz_id,
            question: data.question,
            options: Array.isArray(data.options) ? [...data.options] : [],
            answer: data.answer ?? "",
            explanation: data.explanation || "",
          })
        )
        .catch(() => setEditForm(fallback));
    } else {
      setEditForm(fallback);
    }
  };

  // ── 퀴즈 수정 저장 (updateQuiz) ────────────────────────
  const handleEditSubmit = () => {
    if (!editForm?.question?.trim()) return;

    const payload = {
      question: editForm.question,
      ...(editForm.options?.length >= 2 && { options: editForm.options }),
      ...(editForm.answer?.trim() && { answer: editForm.answer }),
      ...(editForm.explanation !== undefined && { explanation: editForm.explanation }),
    };

    const applyLocal = (q, data) => ({
      ...q,
      question: data?.question ?? editForm.question,
      choices: data?.options ?? editForm.options ?? q.choices,
      answer: (() => {
        const opts = data?.options ?? editForm.options ?? q.choices;
        const ans = data?.answer ?? editForm.answer;
        const idx = opts.indexOf(ans);
        return idx >= 0 ? idx : q.answer;
      })(),
      explain: data?.explanation ?? editForm.explanation ?? q.explain,
    });

    if (lectureId) {
      updateQuiz(editForm.quizId, payload)
        .then((data) => {
          setQuizDraft((prev) =>
            prev.map((q) => (q.id === editForm.quizId ? applyLocal(q, data) : q))
          );
          setEditForm(null);
        })
        .catch((err) => console.error("퀴즈 수정 실패:", err.message));
    } else {
      setQuizDraft((prev) =>
        prev.map((q) => (q.id === editForm.quizId ? applyLocal(q, null) : q))
      );
      setEditForm(null);
    }
  };

  // ── 수동 퀴즈 추가 (createManualQuiz) ──────────────────
  const handleManualSubmit = () => {
    if (!manualForm?.question?.trim() || !lectureId) return;
    const opts = manualForm.options.filter((o) => o.trim());
    if (opts.length < 2) return;
    createManualQuiz(lectureId, {
      quiz_type: manualForm.quizType || "BLANK",
      question: manualForm.question,
      options: opts,
      answer: opts[manualForm.answerIdx] || opts[0],
      page: pdfPage,       // 현재 보고 있는 PDF 페이지 (필수 필드)
      status: "DRAFT",
      ...(manualForm.conceptId && { concept_id: Number(manualForm.conceptId) }),
      ...(manualForm.explanation?.trim() && { explanation: manualForm.explanation }),
    })
      .then((data) => {
        setQuizDraft((prev) => [
          ...prev,
          {
            id: data.quiz_id,
            n: prev.length + 1,
            keyword: "수동",
            type: "객관식",
            question: data.question,
            choices: data.options || opts,
            answer: (data.options || opts).indexOf(data.answer),
            explain: data.explanation || "",
          },
        ]);
        setManualForm(null);
      })
      .catch((err) => console.error("수동 퀴즈 추가 실패:", err.message));
  };

  const handlePublishQuiz = () => {
    if (!quizDraft.length) return;
    // 배포 시 모든 퀴즈 상태를 READY로 변경 (updateQuizStatus)
    if (lectureId) {
      quizDraft.forEach((q) =>
        updateQuizStatus(q.id, "READY").catch((err) =>
          console.error("상태 변경 실패:", err.message)
        )
      );
    }
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

                        <button
                          className="btn btn-ghost"
                          type="button"
                          style={{ marginTop: 8, width: "100%" }}
                          disabled={!lectureId}
                          onClick={() =>
                            setManualForm({ question: "", options: ["", "", "", ""], answerIdx: 0, quizType: "BLANK", conceptId: "", explanation: "" })
                          }
                        >
                          <Plus size={14} /> 수동 퀴즈 추가
                        </button>

                        {manualForm && (
                          <div style={{ marginTop: 12, padding: 12, background: "var(--zinc-50)", borderRadius: 10, border: "1px solid var(--zinc-200)" }}>
                            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--zinc-700)" }}>수동 퀴즈 추가</div>

                            {/* 개념 선택 */}
                            <select
                              className="input"
                              value={manualForm.conceptId}
                              onChange={(e) => setManualForm((f) => ({ ...f, conceptId: e.target.value }))}
                              style={{ marginBottom: 8, width: "100%" }}
                            >
                              <option value="">개념 선택 (선택사항)</option>
                              {concepts.map((c) => (
                                <option key={c.concept_id} value={c.concept_id}>{c.concept_name}</option>
                              ))}
                            </select>

                            {/* 퀴즈 유형 */}
                            <select
                              className="input"
                              value={manualForm.quizType}
                              onChange={(e) => {
                                const t = e.target.value;
                                setManualForm((f) => ({
                                  ...f,
                                  quizType: t,
                                  // OX형 선택 시 보기를 O/X로 자동 세팅
                                  options: t === "OX" ? ["O", "X", "", ""] : f.options,
                                  answerIdx: 0,
                                }));
                              }}
                              style={{ marginBottom: 8, width: "100%" }}
                            >
                              <option value="BLANK">빈칸형 (BLANK)</option>
                              <option value="OX">OX형</option>
                            </select>

                            {/* 질문 */}
                            <input
                              className="input"
                              placeholder="질문을 입력하세요"
                              value={manualForm.question}
                              onChange={(e) => setManualForm((f) => ({ ...f, question: e.target.value }))}
                              style={{ marginBottom: 8, width: "100%" }}
                            />
                            {manualForm.options.map((opt, i) => (
                              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                                <input
                                  type="radio"
                                  name="manual_answer"
                                  checked={manualForm.answerIdx === i}
                                  onChange={() => setManualForm((f) => ({ ...f, answerIdx: i }))}
                                />
                                <input
                                  className="input"
                                  placeholder={`보기 ${i + 1}`}
                                  value={opt}
                                  onChange={(e) =>
                                    setManualForm((f) => {
                                      const options = [...f.options];
                                      options[i] = e.target.value;
                                      return { ...f, options };
                                    })
                                  }
                                  style={{ flex: 1 }}
                                />
                              </div>
                            ))}
                            <p style={{ fontSize: 11, color: "var(--zinc-500)", margin: "4px 0 8px" }}>
                              라디오 버튼으로 정답 보기를 선택하세요
                            </p>

                            {/* 해설 */}
                            <input
                              className="input"
                              placeholder="해설 (선택사항)"
                              value={manualForm.explanation}
                              onChange={(e) => setManualForm((f) => ({ ...f, explanation: e.target.value }))}
                              style={{ marginBottom: 8, width: "100%" }}
                            />

                            <div style={{ display: "flex", gap: 8 }}>
                              <button
                                className="btn btn-primary btn-sm"
                                type="button"
                                onClick={handleManualSubmit}
                                disabled={!manualForm.question.trim()}
                              >
                                추가
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                type="button"
                                onClick={() => setManualForm(null)}
                              >
                                취소
                              </button>
                            </div>
                          </div>
                        )}

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
                              disabled={selectedKeywords.length === 0 || loadingQuiz}
                              onClick={handleGenerateQuiz}
                            >
                              <Zap size={14} /> {loadingQuiz ? "생성 중..." : "선택한 키워드로 퀴즈 생성"}
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
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <span className="pill pill-neutral" style={{ fontSize: 10 }}>
                                    {q.type}
                                  </span>
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    type="button"
                                    style={{ padding: "0 6px", height: 24 }}
                                    title="문제 수정"
                                    onClick={() => handleEditClick(q)}
                                  >
                                    <Pencil size={12} />
                                  </button>
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    type="button"
                                    style={{ padding: "0 6px", height: 24, color: "var(--danger)" }}
                                    title="퀴즈 삭제"
                                    onClick={() => handleDeleteQuizFromDraft(q.id)}
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
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

        {/* 퀴즈 수정 모달 (updateQuiz) */}
        {editForm && (
          <div className="modal-backdrop open">
            <div className="modal" style={{ maxWidth: 520 }}>
              <div className="modal-head">
                <h3>퀴즈 수정</h3>
                <p>문제·선택지·해설을 수정한 뒤 저장하세요.</p>
              </div>
              <div style={{ padding: "0 24px 16px", display: "flex", flexDirection: "column", gap: 14 }}>

                {/* 문제 */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--zinc-700)", marginBottom: 4 }}>문제</div>
                  <textarea
                    className="input"
                    style={{ width: "100%", minHeight: 64, resize: "vertical" }}
                    value={editForm.question}
                    onChange={(e) => setEditForm((f) => ({ ...f, question: e.target.value }))}
                  />
                </div>

                {/* 선택지 + 정답 라디오 */}
                {editForm.options?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--zinc-700)", marginBottom: 4 }}>
                      선택지 <span style={{ fontWeight: 400, color: "var(--zinc-500)" }}>(라디오로 정답 선택)</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {editForm.options.map((opt, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input
                            type="radio"
                            name="edit_answer"
                            checked={editForm.answer === opt}
                            onChange={() => setEditForm((f) => ({ ...f, answer: opt }))}
                          />
                          <input
                            className="input"
                            value={opt}
                            style={{ flex: 1 }}
                            onChange={(e) =>
                              setEditForm((f) => {
                                const opts = [...f.options];
                                const wasAnswer = f.answer === opts[i];
                                opts[i] = e.target.value;
                                return { ...f, options: opts, answer: wasAnswer ? e.target.value : f.answer };
                              })
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 해설 */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--zinc-700)", marginBottom: 4 }}>해설</div>
                  <textarea
                    className="input"
                    style={{ width: "100%", minHeight: 56, resize: "vertical" }}
                    value={editForm.explanation}
                    onChange={(e) => setEditForm((f) => ({ ...f, explanation: e.target.value }))}
                  />
                </div>

              </div>
              <div className="modal-foot">
                <button className="btn btn-ghost" type="button" onClick={() => setEditForm(null)}>
                  취소
                </button>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={handleEditSubmit}
                  disabled={!editForm.question.trim()}
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        )}

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
