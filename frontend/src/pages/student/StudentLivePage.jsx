import { useState, useEffect, useRef } from "react";
import { MessageCircle, Send } from "lucide-react";
import RoleLayout from "../../components/RoleLayout.jsx";
import SplitPanel from "../../components/SplitPanel.jsx";
import PdfViewer from "../../components/PdfViewer.jsx";
import useBroadcastChannel from "../../hooks/useBroadcastChannel.js";

function StudentLivePage() {
  const [pdfData, setPdfData] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeSet, setActiveSet] = useState(null);
  const [choices, setChoices] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [showChatbot, setShowChatbot] = useState(false);
  const [chatbotInput, setChatbotInput] = useState("");
  const [classEnded, setClassEnded] = useState(false);

  const emitRef = useRef(null);

  const mockSet = {
    id: 1,
    quizzes: [
      {
        id: 1,
        text: "스택의 LIFO 원칙은?",
        choices: ["후입선출", "선입선출", "우선순위", "임의 접근"],
        answer: 0,
      },
      {
        id: 2,
        text: "큐의 특징은?",
        choices: ["FIFO 구조", "LIFO 구조", "트리 구조", "그래프"],
        answer: 0,
      },
    ],
  };

  const handleMessage = (msg) => {
    if (msg.type === "PDF_LOADED") {
      setPdfData(msg.pdfData);
    }
    if (msg.type === "PDF_PAGE") {
      setCurrentPage(msg.page);
    }
    if (msg.type === "QUIZ_PUBLISHED") {
      setActiveSet(msg);
      setChoices({});
      setSubmitted(false);
    }
    if (msg.type === "QUIZ_CLOSED") {
      setActiveSet(null);
    }
    if (msg.type === "CLASS_ENDED") {
      setClassEnded(true);
    }
    if (msg.type === "STATE_RESPONSE") {
      if (msg.quizzes && msg.quizzes.length > 0) {
        setActiveSet({ quizzes: msg.quizzes });
      }
    }
  };

  useBroadcastChannel("quizsync-v2", handleMessage).current = emitRef;

  useEffect(() => {
    if (emitRef.current) {
      emitRef.current({ type: "STATE_REQUEST" });
    }
  }, []);

  const handleChoiceSelect = (qid, choiceIdx) => {
    if (!submitted) {
      setChoices((prev) => ({ ...prev, [qid]: choiceIdx }));
    }
  };

  const handleSubmit = () => {
    if (activeSet?.quizzes) {
      activeSet.quizzes.forEach((q) => {
        if (emitRef.current) {
          emitRef.current({
            type: "STUDENT_ANSWER",
            setId: activeSet.id,
            qid: q.id,
            choiceIdx: choices[q.id],
          });
        }
      });
    }
    setSubmitted(true);
  };

  const handleSendQuestion = () => {
    if (chatbotInput.trim() && emitRef.current) {
      emitRef.current({
        type: "STUDENT_QUESTION",
        question: {
          id: Math.random(),
          text: chatbotInput,
          time: "방금 전",
        },
      });
      setChatbotInput("");
    }
  };

  const leftPanel = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <PdfViewer pdfData={null} currentPage={currentPage} onPageChange={setCurrentPage} role="student" />
      {!submitted && activeSet && (
        <div
          className="pdf-lock-overlay"
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0, 0, 0, 0.4)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ textAlign: "center", color: "white" }}>
            <p style={{ fontSize: 14, fontWeight: 600 }}>퀴즈 풀이 중</p>
            <p style={{ fontSize: 12, marginTop: 4 }}>우측 패널에서 답변을 선택하세요</p>
          </div>
        </div>
      )}
    </div>
  );

  const rightPanel = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--zinc-50)" }}>
      {/* 상태바 */}
      <div style={{ padding: 16, background: "white", borderBottom: "1px solid var(--zinc-200)" }}>
        <div style={{ fontSize: 12, color: "var(--zinc-600)" }}>
          <strong>자료구조론 5주차</strong> · 학번 20231349
        </div>
      </div>

      {/* 콘텐츠 */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {!activeSet ? (
          <div
            className="card"
            style={{
              padding: "40px 20px",
              textAlign: "center",
              color: "var(--zinc-500)",
            }}
          >
            <div style={{ fontSize: 14 }}>교수님이 퀴즈를 출제할 때까지 기다리고 있습니다.</div>
          </div>
        ) : (
          <div>
            {/* 퀴즈 헤더 */}
            <div
              className="card"
              style={{
                padding: 12,
                marginBottom: 16,
                background: "white",
                borderLeft: "3px solid var(--brand-deep)",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--zinc-900)" }}>
                세트 1 - {submitted ? "제출 완료" : "진행 중"}
              </div>
            </div>

            {/* 퀴즈 목록 */}
            {mockSet.quizzes.map((q) => (
              <div key={q.id} className="card" style={{ marginBottom: 12, padding: 12, background: "white" }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--zinc-900)" }}>
                  Q{q.id}. {q.text}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {q.choices.map((choice, idx) => (
                    <button
                      key={idx}
                      className={`btn btn-sm${choices[q.id] === idx ? " btn-primary" : " btn-ghost"}`}
                      type="button"
                      onClick={() => handleChoiceSelect(q.id, idx)}
                      disabled={submitted}
                      style={{
                        justifyContent: "flex-start",
                        fontSize: 12,
                        textAlign: "left",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-block",
                          width: 20,
                          textAlign: "center",
                          marginRight: 8,
                        }}
                      >
                        {idx + 1})
                      </span>
                      {choice}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {!submitted && (
              <button
                className="btn btn-primary w-full"
                type="button"
                onClick={handleSubmit}
                disabled={Object.keys(choices).length < mockSet.quizzes.length}
              >
                제출하기
              </button>
            )}

            {submitted && (
              <div style={{ padding: 12, background: "#d1fae5", borderRadius: 8, textAlign: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#065f46" }}>
                  답변이 제출되었습니다!
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 챗봇 버튼 */}
      <button
        className="chatbot-btn"
        type="button"
        onClick={() => setShowChatbot(!showChatbot)}
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: "var(--brand-deep)",
          border: "none",
          color: "white",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        }}
      >
        <MessageCircle size={20} />
      </button>

      {/* 챗봇 팝업 */}
      {showChatbot && (
        <div
          className="chatbot-popup"
          style={{
            position: "fixed",
            bottom: 80,
            right: 24,
            width: 280,
            background: "white",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            padding: 12,
          }}
        >
          <div style={{ fontSize: 12, color: "var(--zinc-600)", marginBottom: 8 }}>
            익명 질문을 남길 수 있습니다
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              type="text"
              placeholder="질문..."
              value={chatbotInput}
              onChange={(e) => setChatbotInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSendQuestion();
              }}
              style={{
                flex: 1,
                padding: "6px 8px",
                border: "1px solid var(--zinc-200)",
                borderRadius: 4,
                fontSize: 12,
              }}
            />
            <button
              className="btn btn-primary btn-sm"
              type="button"
              onClick={handleSendQuestion}
              style={{ padding: "6px 10px" }}
            >
              <Send size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <RoleLayout role="student">
      <div style={{ height: "calc(100vh - 62px)", display: "flex", flexDirection: "column" }}>
      <SplitPanel
        left={leftPanel}
        right={rightPanel}
        defaultRatio={0.65}
      />
      {classEnded && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0, 0, 0, 0.72)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              borderRadius: 20,
              padding: "40px 36px",
              maxWidth: 380,
              background: "white",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>수업이 종료되었습니다</div>
            <p style={{ fontSize: 13, color: "var(--zinc-600)", marginBottom: 24 }}>복습 페이지로 이동하시겠습니까?</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setClassEnded(false)}
                style={{ flex: 1 }}
              >
                잠깐 더 머무르기
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => (window.location.href = "/student/review")}
                style={{ flex: 1 }}
              >
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
