import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ChevronLeft, LogOut, MessageCircle, Save, Send } from "lucide-react";
import RoleLayout from "../../components/RoleLayout.jsx";
import PdfViewer from "../../components/PdfViewer.jsx";
import useLectureRealtime from "../../hooks/useLectureRealtime.js";
import { appendQuestionCache, clearPdfCache, setPdfCache } from "../../data/sessionCache.js";
import {
  createMemo,
  downloadLecturePdf,
  getLecture,
  getLectureQuizzes,
  submitAnswers,
  submitQuestion,
  updateMemo,
} from "../../api/lectureApi.js";

function saveMemoToStorage(key, text) {
  try { localStorage.setItem(key, text); } catch {}
}

function saveResultsToStorage(key, sets) {
  try { localStorage.setItem(key, JSON.stringify(sets)); } catch {}
}

function getBackendAnswerIndex(quiz) {
  const options = Array.isArray(quiz.options) ? quiz.options : [];
  const index = options.findIndex((option) => String(option) === String(quiz.answer));
  return index >= 0 ? index : 0;
}

function mapBackendQuizToLiveQuestion(quiz, index) {
  return {
    id: quiz.quiz_id,
    n: index + 1,
    keyword: quiz.concept || "개념",
    question: quiz.question,
    choices: Array.isArray(quiz.options) ? quiz.options : [],
    answer: getBackendAnswerIndex(quiz),
    explain: quiz.explanation || "",
  };
}

function pickLatestVisibleQuizSet(sets) {
  return [...sets]
    .filter((set) => ["SENT", "CLOSED"].includes(String(set.status || "").toUpperCase()))
    .filter((set) => Array.isArray(set.quizzes) && set.quizzes.length > 0)
    .sort((a, b) => {
      const left = Number(a.set_number ?? a.set_id ?? 0);
      const right = Number(b.set_number ?? b.set_id ?? 0);
      return right - left;
    })[0] || null;
}

function StudentLivePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const lectureId = location.state?.lectureId ?? null;
  const lectureIdRef = useRef(lectureId);   // useCallback 내 stale closure 방지
  const [pdfData, setPdfData] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  // activeSet: { setId, setIdx, questions }
  const [activeSet, setActiveSet] = useState(null);
  const [choices, setChoices] = useState({});      // { [qid]: choiceIdx }
  const [submitted, setSubmitted] = useState(false);
  const [quizClosed, setQuizClosed] = useState(false); // teacher revealed answers
  const [memos, setMemos] = useState({});           // { [qid]: string }
  const [memoSaving, setMemoSaving] = useState({});  // { [qid]: boolean }
  const [memoStatus, setMemoStatus] = useState({});  // { [qid]: string }
  const [showChatbot, setShowChatbot] = useState(false);
  const [chatbotInput, setChatbotInput] = useState("");
  const [recentQuestion, setRecentQuestion] = useState(null);
  const [liveWeek, setLiveWeek] = useState(5);
  const [liveCourseName, setLiveCourseName] = useState("자료구조론");
  const liveWeekRef = useRef(5);

  // Refs for reading current state inside memoized callbacks
  const activeSetRef = useRef(null);
  const choicesRef = useRef({});
  const quizClosedRef = useRef(false);
  const savedSetsRef = useRef([]); // accumulates closed sets for review
  const memoStateRef = useRef({}); // { [qid]: "none" | "exists" }
  const setCounterRef = useRef(0);
  // QUIZ_SET_BACKEND_ID 수신 시 즉시(동기) 저장 → handleSubmit race condition 방지
  const backendSetIdRef = useRef(null);
  // LECTURE_CHANGED 수신 시 true → 이후 PDF_LOADED 무시 (이전 세션 탭 오염 방지)
  const sessionInvalidatedRef = useRef(false);

  const goToReview = useCallback((options = {}) => {
    const targetLectureId = lectureIdRef.current;
    if (!targetLectureId) {
      navigate("/student/courses", options);
      return;
    }

    navigate("/student/review", {
      ...options,
      state: { lectureId: targetLectureId },
    });
  }, [navigate]);

  useEffect(() => { activeSetRef.current = activeSet; }, [activeSet]);
  useEffect(() => { choicesRef.current = choices; }, [choices]);
  useEffect(() => { quizClosedRef.current = quizClosed; }, [quizClosed]);
  useEffect(() => { liveWeekRef.current = liveWeek; }, [liveWeek]);

  useEffect(() => {
    clearPdfCache();
  }, []);

  // class-mode for slim topbar
  useEffect(() => {
    document.body.classList.add("class-mode");
    document.body.setAttribute("data-role", "student");
    return () => {
      document.body.classList.remove("class-mode");
      document.body.removeAttribute("data-role");
    };
  }, []);

  const handleMessage = useCallback((msg) => {
    if (msg.type === "PDF_LOADED") {
      if (sessionInvalidatedRef.current) return;
      if (lectureIdRef.current && msg.payload?.lectureId !== lectureIdRef.current) return;

      const data = msg.payload?.pdfData;

      if (data) {
        setPdfData(data);
        setPdfCache(data, msg.payload?.pdfFileName || null, msg.payload?.pdfTotal || 0);
        return;
      }

      // WebSocket으로는 PDF 바이너리를 보내지 않으므로,
      // PDF_LOADED 메타데이터를 받으면 학생이 직접 API로 PDF를 다운로드한다.
      if (lectureIdRef.current && msg.payload?.pdfFileName) {
        downloadLecturePdf(lectureIdRef.current)
          .then((buffer) => {
            const bytes = new Uint8Array(buffer);
            setPdfData(bytes);
            setPdfCache(
              bytes,
              msg.payload?.pdfFileName || null,
              msg.payload?.pdfTotal || 0
            );
          })
          .catch((err) => {
            console.error("실시간 PDF 다운로드 실패:", err.message);
          });
      }
    }
    if (msg.type === "PDF_PAGE") setCurrentPage(msg.payload?.page ?? 1);

    if (msg.type === "QUIZ_PUBLISHED") {
      backendSetIdRef.current = null; // 새 세트마다 초기화
      setCounterRef.current += 1;
      const setIdx = setCounterRef.current;
      setActiveSet({
        setId: msg.payload.setId,
        setIdx,
        questions: msg.payload.questions,
        startPage: msg.payload.startPage || 1,
        pdfRange: msg.payload.pdfRange || "수업 중 출제",
      });
      setChoices({});
      setSubmitted(false);
      setQuizClosed(false);
    }

    if (msg.type === "QUIZ_CLOSED") {
      setQuizClosed(true);
      // Save this set's results to localStorage for review page
      const set = activeSetRef.current;
      const currentChoices = choicesRef.current;
      if (set) {
        const setData = {
          id: set.setIdx,
          label: `세트 #${set.setIdx}`,
          pdfRange: set.pdfRange || "수업 중 출제",
          startPage: set.startPage || 1,
          quizzes: set.questions.map((q) => ({
            id: q.id,
            n: q.n,
            keyword: q.keyword,
            question: q.question,
            choices: q.choices,
            answer: q.answer,
            studentAnswer: currentChoices[q.id] !== undefined ? currentChoices[q.id] : -1,
            errorRate: 30,
            explain: q.explain || "",
          })),
        };
        savedSetsRef.current = [
          ...savedSetsRef.current.filter((s) => s.id !== set.setIdx),
          setData,
        ];
        saveResultsToStorage(`quizsync-liveresults-${liveWeekRef.current}`, savedSetsRef.current);
      }
    }

    if (msg.type === "CLASS_ENDED") {
      goToReview({ replace: true });
    }

    // 교수 화면이 백엔드 set_id를 확인하면 학생 쪽 setId도 업데이트
    if (msg.type === "QUIZ_SET_BACKEND_ID") {
      backendSetIdRef.current = msg.payload.backendSetId; // 동기적으로 즉시 저장
      setActiveSet((prev) => {
        if (!prev || prev.setId !== msg.payload?.localSetId) return prev;
        return { ...prev, setId: msg.payload.backendSetId };
      });
    }

    if (msg.type === "COURSE_INFO") {
      if (msg.payload?.week) { setLiveWeek(msg.payload.week); liveWeekRef.current = msg.payload.week; }
      if (msg.payload?.courseName) setLiveCourseName(msg.payload.courseName);
    }

    // 교수가 새 강의를 생성했는데 내 lectureId와 다르면 → 이전 세션 잔존 상태 초기화
    if (msg.type === "LECTURE_CHANGED") {
      const newId = msg.payload?.lectureId;
      if (newId && newId !== lectureIdRef.current) {
        sessionInvalidatedRef.current = true; // 이후 PDF_LOADED 차단
        setPdfData(null);
        clearPdfCache();
        setCurrentPage(1);
        setActiveSet(null);
        setChoices({});
        setSubmitted(false);
        setQuizClosed(false);
      }
    }
  }, [goToReview]);

  const emit = useLectureRealtime("quizsync-v2", lectureId, handleMessage);

  // Ask teacher for current state; retry a few times for late joins
  // lectureId를 함께 보내 → 이전 세션 TeacherLivePage 탭이 응답하지 못하도록 필터링
  useEffect(() => {
    const req = { lectureId };
    emit("STATE_REQUEST", req);
    const t1 = setTimeout(() => emit("STATE_REQUEST", req), 300);
    const t2 = setTimeout(() => emit("STATE_REQUEST", req), 1200);
    const t3 = setTimeout(() => emit("STATE_REQUEST", req), 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [emit]);

  useEffect(() => {
    if (!lectureId || pdfData) return;

    getLecture(lectureId)
      .then((lecture) => {
        if (lecture?.status === "ENDED") {
          goToReview({ replace: true });
          return null;
        }
        if (lecture?.title) setLiveCourseName(lecture.title);
        if (!lecture?.file_name) return null;

        return downloadLecturePdf(lectureId).then((buffer) => {
          const bytes = new Uint8Array(buffer);
          setPdfData(bytes);
          setPdfCache(bytes, lecture.file_name, lecture.total_pages || 0);
        });
      })
      .catch((err) => console.error("강의 자료 로드 실패:", err.message));
  }, [lectureId, pdfData, goToReview]);

  const syncVisibleQuizSet = useCallback(() => {
    if (!lectureId) return Promise.resolve();

    return getLectureQuizzes(lectureId)
      .then((res) => {
        const latestSet = pickLatestVisibleQuizSet(res?.sets || []);
        if (!latestSet) return;

        const isClosed = String(latestSet.status || "").toUpperCase() === "CLOSED";
        const currentSet = activeSetRef.current;
        const currentSetId = currentSet?.setId == null ? null : Number(currentSet.setId);
        const latestSetId = Number(latestSet.set_id);

        if (currentSet && currentSetId === latestSetId) {
          if (isClosed && !quizClosedRef.current) {
            setQuizClosed(true);
          }
          return;
        }

        const questions = latestSet.quizzes.map(mapBackendQuizToLiveQuestion);

        setCounterRef.current = Math.max(setCounterRef.current, Number(latestSet.set_number || 1));
        setActiveSet({
          setId: latestSet.set_id,
          setIdx: latestSet.set_number || 1,
          questions,
          startPage: latestSet.page_start || 1,
          pdfRange: latestSet.page_start === latestSet.page_end
            ? `p.${latestSet.page_start}`
            : `p.${latestSet.page_start}-${latestSet.page_end}`,
        });
        setChoices({});
        setSubmitted(false);
        setQuizClosed(isClosed);
      })
      .catch((err) => console.error("출제된 퀴즈 동기화 실패:", err.message));
  }, [lectureId]);

  useEffect(() => {
    if (!lectureId) return undefined;

    syncVisibleQuizSet();
    const timer = setInterval(syncVisibleQuizSet, 3000);
    return () => clearInterval(timer);
  }, [lectureId, syncVisibleQuizSet]);

  const handleChoiceSelect = (qid, idx) => {
    if (!submitted && !quizClosed) {
      setChoices((prev) => ({ ...prev, [qid]: idx }));
    }
  };

  const handleSubmit = () => {
    if (!activeSet) return;

    // BroadcastChannel — 실시간 동기화 (교수 화면 즉시 반영)
    activeSet.questions.forEach((q) => {
      emit("STUDENT_ANSWER", {
        setId: activeSet.setId,
        qid: q.id,
        choiceIdx: choices[q.id],
      });
    });
    setSubmitted(true);

    // API — 백엔드 저장 (복습·리포트용)
    // backendSetIdRef: QUIZ_SET_BACKEND_ID 수신 시 동기적으로 저장된 값 → React 배치 업데이트보다 빠름
    const effectiveSetId = backendSetIdRef.current || activeSet.setId;
    if (lectureId && effectiveSetId) {
      // 백엔드는 selected를 "1"/"2"/"3"/"4" 형식의 1-based 번호로 받음
      const answers = activeSet.questions.map((q) => ({
        quiz_id: q.id,
        selected: choices[q.id] !== undefined ? String(choices[q.id] + 1) : "",
      }));
      submitAnswers(lectureId, effectiveSetId, { answers }).catch((err) => {
        console.error("답안 제출 API 오류:", err.message);
      });
    }

    // localStorage 폴백 저장 — 복습 페이지에서 my_answer null일 때 사용
    if (lectureId) {
      try {
        const key = `quizsync-myanswers-${lectureId}`;
        const saved = JSON.parse(localStorage.getItem(key) || "{}");
        activeSet.questions.forEach((q) => {
          if (choices[q.id] !== undefined) {
            saved[String(q.id)] = q.choices[choices[q.id]] ?? "";
          }
        });
        localStorage.setItem(key, JSON.stringify(saved));
      } catch {}
    }
  };

  const handleMemoChange = (qid, text) => {
    setMemos((prev) => ({ ...prev, [qid]: text }));
    setMemoStatus((prev) => ({ ...prev, [qid]: "" }));
    saveMemoToStorage(`quizsync-memo-${liveWeek}-${qid}`, text);
  };

  const handleMemoSave = async (qid) => {
    const content = memos[qid] || "";
    const state = memoStateRef.current[qid] || "none";

    if (state !== "exists" && !content.trim()) {
      setMemoStatus((prev) => ({ ...prev, [qid]: "메모를 입력한 뒤 저장해 주세요." }));
      return;
    }

    setMemoSaving((prev) => ({ ...prev, [qid]: true }));
    setMemoStatus((prev) => ({ ...prev, [qid]: "" }));

    try {
      if (state === "exists") {
        await updateMemo(qid, content);
      } else {
        try {
          await createMemo(qid, content);
        } catch (err) {
          await updateMemo(qid, content);
        }
        memoStateRef.current = { ...memoStateRef.current, [qid]: "exists" };
      }
      setMemoStatus((prev) => ({ ...prev, [qid]: "저장됨" }));
    } catch (err) {
      setMemoStatus((prev) => ({ ...prev, [qid]: err.message || "저장에 실패했습니다." }));
    } finally {
      setMemoSaving((prev) => ({ ...prev, [qid]: false }));
    }
  };

  const handleSendQuestion = () => {
    const text = chatbotInput.trim();
    if (!text) return;

    // BroadcastChannel — 실시간 동기화 (교수 화면 즉시 반영)
    const question = { id: Date.now(), text, week: liveWeek, time: "방금 전" };
    appendQuestionCache(question);
    emit("STUDENT_QUESTION", { question });
    setRecentQuestion(text);
    setChatbotInput("");

    // API — 백엔드 저장 (리포트 익명 질문 목록용)
    if (lectureId) {
      submitQuestion(lectureId, text).catch((err) => {
        console.error("질문 제출 API 오류:", err.message);
      });
    }
  };

  const allAnswered =
    activeSet !== null &&
    activeSet.questions.every((q) => choices[q.id] !== undefined);

  return (
    <RoleLayout role="student">
      <div
        style={{
          height: "calc(100vh - 48px)",
          display: "flex",
          flexDirection: "column",
          padding: "12px 18px",
          gap: 0,
        }}
      >
        {/* Status bar */}
        <div className="live-statusbar" style={{ marginBottom: 12 }}>
          <div className="left">
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => navigate("/student/courses")}>
              <ChevronLeft size={14} />
              뒤로
            </button>
            <span className="pill pill-brand" style={{ fontSize: 12 }}>
              {liveCourseName} {liveWeek}주차
            </span>
            <span style={{ color: "var(--zinc-500)" }}>
              학번 <strong style={{ color: "var(--zinc-900)" }}>20231349 · 익명 응답</strong>
            </span>
          </div>
          <div className="right">
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => goToReview()}>
              복습
            </button>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => navigate("/student/courses")}>
              <LogOut size={14} />
              퇴장
            </button>
          </div>
        </div>

        {/* Split layout */}
        <div className="split" style={{ flex: 1, height: "auto", minHeight: 0 }}>
          {/* Left: PDF */}
          <div className="split-left" style={{ flex: "0 0 65%", position: "relative" }}>
            <PdfViewer
              pdfData={pdfData}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              role="student"
            />
            {/* Lock overlay only while answering (not after submit / not after results) */}
            {activeSet && !submitted && !quizClosed && (
              <div className="pdf-lock-overlay">
                <div className="lock-card">
                  <div className="lk">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                  <div className="t">퀴즈 풀이 중 강의자료 비활성화</div>
                  <div className="s">제출 후 다시 자료를 확인할 수 있습니다</div>
                </div>
              </div>
            )}
          </div>

          <div className="split-handle" />

          {/* Right: Quiz panel */}
          <div
            className="split-right"
            style={{ flex: 1, paddingLeft: 14, minWidth: 340, display: "flex", flexDirection: "column", gap: 0 }}
          >
            {!activeSet ? (
              /* Waiting state */
              <div className="card" style={{ margin: "0 0 12px" }}>
                <div className="card-pad-lg" style={{ textAlign: "center", padding: "38px 26px" }}>
                  <div style={{ width: 56, height: 56, margin: "0 auto", borderRadius: 18, background: "var(--brand-soft)", display: "grid", placeItems: "center" }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2">
                      <path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8" />
                      <path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34" />
                    </svg>
                  </div>
                  <h3 style={{ marginTop: 14, fontSize: 16, fontWeight: 700 }}>수업이 진행되고 있어요</h3>
                  <p style={{ marginTop: 6, fontSize: 13, color: "var(--zinc-500)", lineHeight: 1.6 }}>
                    교수님이 퀴즈를 출제하면 이 영역에 표시됩니다.
                    <br />왼쪽 강의자료를 따라가며 수업을 들어주세요.
                  </p>
                </div>
              </div>
            ) : (
              /* Active or closed quiz */
              <div className="card" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                <div className="card-head">
                  <div>
                    <div className="card-title">퀴즈 세트 #{activeSet.setIdx}</div>
                    <div className="card-sub">
                      {activeSet.questions.length}문제 ·{" "}
                      {quizClosed ? "정답 공개됨" : submitted ? "제출 완료 — 정답 공개 대기 중" : "모두 풀고 제출하세요"}
                    </div>
                  </div>
                  <span className={`pill ${quizClosed ? "pill-neutral" : submitted ? "pill-success" : "pill-warn"}`}>
                    {quizClosed ? "마감됨" : submitted ? "제출 완료" : "진행 중"}
                  </span>
                </div>

                <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
                  {activeSet.questions.map((q) => {
                    const selected = choices[q.id];
                    return (
                      <div key={q.id} className="quiz-item">
                        <div className="quiz-item-head">
                          <div className="q-num">
                            <strong>{q.n}</strong>
                            <span className="badge">{q.keyword}</span>
                          </div>
                        </div>
                        <div style={{ marginTop: 10, fontSize: 14, fontWeight: 500 }}>
                          {q.question}
                        </div>

                        <div className={`choices ${q.choices.length <= 2 ? "col1" : ""}`} style={{ marginTop: 12 }}>
                          {q.choices.map((choice, i) => {
                            // After quiz closed: show correct/wrong highlighting
                            if (quizClosed) {
                              const wasSelected = i === selected;
                              const isCorrect = i === q.answer;
                              let cls = "";
                              if (wasSelected && isCorrect) cls = "correct";
                              else if (wasSelected && !isCorrect) cls = "wrong";
                              else if (!wasSelected && isCorrect) cls = "correct";
                              return (
                                <div
                                  key={i}
                                  className={`choice ${cls}`}
                                  style={{ cursor: "default" }}
                                >
                                  <span>{String.fromCharCode(65 + i)}. {choice}</span>
                                </div>
                              );
                            }
                            // Before close: interactive selection with circle
                            return (
                              <button
                                key={i}
                                className={`choice ${selected === i ? "selected" : ""}`}
                                type="button"
                                onClick={() => handleChoiceSelect(q.id, i)}
                                disabled={submitted}
                              >
                                <div className="ck" />
                                {String.fromCharCode(65 + i)}. {choice}
                              </button>
                            );
                          })}
                        </div>

                        {/* Show explanation after quiz is closed */}
                        {quizClosed && q.explain && (
                          <div className="explain-box">{q.explain}</div>
                        )}

                        {/* Memo — always available */}
                        <div className="postit" style={{ marginTop: 12 }}>
                          <div className="head">✏ 수업 중 메모</div>
                          <textarea
                            placeholder="이 문제와 관련하여 메모를 남겨두세요..."
                            value={memos[q.id] || ""}
                            onChange={(e) => handleMemoChange(q.id, e.target.value)}
                          />
                          <div className="postit-actions">
                            <span className={`postit-status ${memoStatus[q.id] === "저장됨" ? "success" : ""}`}>
                              {memoStatus[q.id] || ""}
                            </span>
                            <button
                              className="btn btn-soft btn-sm"
                              type="button"
                              disabled={memoSaving[q.id] || (!(memos[q.id] || "").trim() && memoStateRef.current[q.id] !== "exists")}
                              onClick={() => handleMemoSave(q.id)}
                            >
                              <Save size={13} />
                              {memoSaving[q.id] ? "저장 중" : memoStateRef.current[q.id] === "exists" ? "수정" : "저장"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ padding: "14px 16px", borderTop: "1px solid var(--zinc-150)", flexShrink: 0 }}>
                  {quizClosed ? (
                    <div style={{ padding: 12, background: "var(--zinc-50)", borderRadius: 8, textAlign: "center" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--zinc-700)" }}>
                        정답이 공개되었습니다
                      </div>
                      <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--zinc-500)" }}>
                        메모를 추가하고 복습 리포트에서 다시 확인하세요
                      </div>
                    </div>
                  ) : !submitted ? (
                    <>
                      <button
                        className="btn btn-primary"
                        type="button"
                        style={{ width: "100%" }}
                        disabled={!allAnswered}
                        onClick={handleSubmit}
                      >
                        <Send size={14} /> 답안 제출
                      </button>
                      <p style={{ marginTop: 8, fontSize: 11.5, color: "var(--zinc-500)", textAlign: "center" }}>
                        교수님이 마감해야 정답이 공개돼요
                      </p>
                    </>
                  ) : (
                    <div style={{ padding: 12, background: "var(--success-50)", borderRadius: 8, textAlign: "center" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--success-700)" }}>
                        답변이 제출되었습니다
                      </div>
                      <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--zinc-500)" }}>
                        교수님이 마감하면 정답이 공개됩니다
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Chatbot float */}
        <div className="chatbot-float">
          <div className={`chatbot-popup ${showChatbot ? "open" : ""}`}>
            <div className="chatbot-head">
              <div className="t">익명 질문하기</div>
              <div className="s">교수님께 익명으로 질문을 보냅니다. 수업 후 Q&amp;A에서 답변받을 수 있어요.</div>
            </div>
            <div className="chatbot-body">
              <textarea
                placeholder="궁금한 점을 입력하세요..."
                maxLength={200}
                value={chatbotInput}
                onChange={(e) => setChatbotInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendQuestion(); }
                }}
              />
              <div className="count">{chatbotInput.length} / 200</div>
              {recentQuestion && (
                <div className="chatbot-recent" style={{ display: "block", marginTop: 10 }}>
                  <div className="lbl">방금 보낸 질문</div>
                  <div className="it">{recentQuestion}</div>
                </div>
              )}
            </div>
            <div className="chatbot-foot">
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setShowChatbot(false)}>취소</button>
              <button className="btn btn-primary btn-sm" type="button" onClick={handleSendQuestion}>
                <Send size={13} /> 보내기
              </button>
            </div>
          </div>
          <button className="chatbot-btn" type="button" onClick={() => setShowChatbot((v) => !v)}>
            <MessageCircle size={18} /> 질문하기
          </button>
        </div>
      </div>
    </RoleLayout>
  );
}

export default StudentLivePage;
