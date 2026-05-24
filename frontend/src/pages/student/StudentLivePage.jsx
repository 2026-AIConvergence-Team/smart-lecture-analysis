import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, MessageCircle, Send } from "lucide-react";
import RoleLayout from "../../components/RoleLayout.jsx";
import PdfViewer from "../../components/PdfViewer.jsx";
import useBroadcastChannel from "../../hooks/useBroadcastChannel.js";
import { appendQuestionCache, getPdfCache, setPdfCache } from "../../data/sessionCache.js";

const WEEK = 5;
const MEMO_KEY = (qid) => `quizsync-memo-${WEEK}-${qid}`;
const RESULTS_KEY = `quizsync-liveresults-${WEEK}`;

function saveMemoToStorage(qid, text) {
  try { localStorage.setItem(MEMO_KEY(qid), text); } catch {}
}

function saveResultsToStorage(sets) {
  try { localStorage.setItem(RESULTS_KEY, JSON.stringify(sets)); } catch {}
}

function StudentLivePage() {
  const navigate = useNavigate();
  const [pdfData, setPdfData] = useState(() => getPdfCache().pdfData);
  const [currentPage, setCurrentPage] = useState(1);
  // activeSet: { setId, setIdx, questions }
  const [activeSet, setActiveSet] = useState(null);
  const [choices, setChoices] = useState({});      // { [qid]: choiceIdx }
  const [submitted, setSubmitted] = useState(false);
  const [quizClosed, setQuizClosed] = useState(false); // teacher revealed answers
  const [memos, setMemos] = useState({});           // { [qid]: string }
  const [showChatbot, setShowChatbot] = useState(false);
  const [chatbotInput, setChatbotInput] = useState("");
  const [recentQuestion, setRecentQuestion] = useState(null);
  const [classEnded, setClassEnded] = useState(false);

  // Refs for reading current state inside memoized callbacks
  const activeSetRef = useRef(null);
  const choicesRef = useRef({});
  const savedSetsRef = useRef([]); // accumulates closed sets for review
  const setCounterRef = useRef(0);

  useEffect(() => { activeSetRef.current = activeSet; }, [activeSet]);
  useEffect(() => { choicesRef.current = choices; }, [choices]);

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
      const data = msg.payload?.pdfData;
      if (data) {
        setPdfData(data);
        setPdfCache(data, msg.payload?.pdfFileName || null, msg.payload?.pdfTotal || 0);
      }
    }
    if (msg.type === "PDF_PAGE") setCurrentPage(msg.payload?.page ?? 1);

    if (msg.type === "QUIZ_PUBLISHED") {
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
        saveResultsToStorage(savedSetsRef.current);
      }
    }

    if (msg.type === "CLASS_ENDED") setClassEnded(true);
  }, []);

  const emit = useBroadcastChannel("quizsync-v2", handleMessage);

  // Ask teacher for current state; retry a few times for late joins
  useEffect(() => {
    emit("STATE_REQUEST", {});
    const t1 = setTimeout(() => emit("STATE_REQUEST", {}), 300);
    const t2 = setTimeout(() => emit("STATE_REQUEST", {}), 1200);
    const t3 = setTimeout(() => emit("STATE_REQUEST", {}), 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [emit]);

  const handleChoiceSelect = (qid, idx) => {
    if (!submitted && !quizClosed) {
      setChoices((prev) => ({ ...prev, [qid]: idx }));
    }
  };

  const handleSubmit = () => {
    if (!activeSet) return;
    activeSet.questions.forEach((q) => {
      emit("STUDENT_ANSWER", {
        setId: activeSet.setId,
        qid: q.id,
        choiceIdx: choices[q.id],
      });
    });
    setSubmitted(true);
  };

  const handleMemoChange = (qid, text) => {
    setMemos((prev) => ({ ...prev, [qid]: text }));
    saveMemoToStorage(qid, text);
  };

  const handleSendQuestion = () => {
    const text = chatbotInput.trim();
    if (!text) return;
    const question = { id: Date.now(), text, week: WEEK, time: "방금 전" };
    appendQuestionCache(question);
    emit("STUDENT_QUESTION", { question });
    setRecentQuestion(text);
    setChatbotInput("");
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
            <span className="pill pill-brand" style={{ fontSize: 12 }}>
              자료구조론 {WEEK}주차
            </span>
            <span style={{ color: "var(--zinc-500)" }}>
              학번 <strong style={{ color: "var(--zinc-900)" }}>20231349 · 익명 응답</strong>
            </span>
            <span className="live-pill">
              <span className="dot" />
              실시간 연동
            </span>
          </div>
          <div className="right">
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => navigate("/student/review")}>
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

        {/* Class ended overlay */}
        {classEnded && (
          <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,.72)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ borderRadius: 20, padding: "40px 36px", maxWidth: 440, background: "white", textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>수업이 종료되었습니다</div>
              <p style={{ fontSize: 13, color: "var(--zinc-600)", marginBottom: 24 }}>복습 페이지로 이동하시겠습니까?</p>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-ghost" type="button" style={{ flex: 1, whiteSpace: "nowrap" }} onClick={() => setClassEnded(false)}>
                  잠깐 더 머무르기
                </button>
                <button className="btn btn-primary" type="button" style={{ flex: 1, whiteSpace: "nowrap" }} onClick={() => navigate("/student/review")}>
                  복습 페이지로 이동
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </RoleLayout>
  );
}

export default StudentLivePage;
