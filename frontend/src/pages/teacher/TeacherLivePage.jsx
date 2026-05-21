import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Sparkles, Zap, AlertCircle, Trash2 } from "lucide-react";
import RoleLayout from "../../components/RoleLayout.jsx";
import PdfViewer from "../../components/PdfViewer.jsx";
import DonutChart from "../../components/DonutChart.jsx";
import { keywordsFor, quizFromKeyword, SAMPLE_QUESTIONS } from "../../data/quizSyncMock.js";
import useBroadcastChannel from "../../hooks/useBroadcastChannel.js";

function TeacherLivePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { code = "JEB5ZA", courseName = "자료구조론", week = 5, pdfFileName = null, pdfTotal = 8, currentQuizSet = [] } = location.state || {};

  // PDF 상태
  const [pdfData, setPdfData] = useState(null);
  const [pdfPage, setPdfPage] = useState(1);

  // 퀴즈 상태
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(3);
  const [extractedKeywords, setExtractedKeywords] = useState([]);
  const [selectedKeywords, setSelectedKeywords] = useState([]);
  const [quizzes, setQuizzes] = useState(currentQuizSet);
  const [publishedSet, setPublishedSet] = useState(null);

  // 응답 상태
  const [studentAnswers, setStudentAnswers] = useState({});

  // UI 상태
  const [activePanel, setActivePanel] = useState("quiz");
  const [setFilter, setSetFilter] = useState("current");
  const [joinCount, setJoinCount] = useState(0);
  const [questions, setQuestions] = useState(SAMPLE_QUESTIONS);
  const [showEndModal, setShowEndModal] = useState(false);

  const emitRef = useRef(null);

  // PDF 파일 로드
  useEffect(() => {
    if (!location.state?.pdfFile) return;
    location.state.pdfFile.arrayBuffer().then((buf) => setPdfData(new Uint8Array(buf)));
  }, [location.state?.pdfFile]);

  const handleMessage = (msg) => {
    if (msg.type === "STUDENT_QUESTION") {
      setQuestions((prev) => [{ ...msg.question, week, time: "방금 전" }, ...prev]);
    }
  };

  const emit = useBroadcastChannel("quizsync-v2", handleMessage);
  useEffect(() => {
    emitRef.current = emit;
  }, [emit]);

  // 학생 수 증가
  useEffect(() => {
    const interval = setInterval(() => {
      setJoinCount((prev) => Math.min(prev + Math.floor(Math.random() * 2), 32));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // 핸들러들
  const handleExtractKeywords = () => {
    setExtractedKeywords(keywordsFor(rangeStart, rangeEnd));
    setSelectedKeywords([]);
  };

  const handleToggleKeyword = (keyword) => {
    setSelectedKeywords((current) => {
      if (current.includes(keyword)) {
        return current.filter((item) => item !== keyword);
      }
      if (current.length >= 5) return current;
      return [...current, keyword];
    });
  };

  const handleGenerateQuiz = () => {
    const quizSet = selectedKeywords.map((keyword, index) => quizFromKeyword(keyword, index));
    if (quizSet.length === 0) return;
    setQuizzes(quizSet);
    setPublishedSet(null);
  };

  const handlePublishQuiz = () => {
    if (!quizzes.length) return;
    setPublishedSet({ id: Date.now(), createdAt: new Date().toLocaleTimeString(), questions: quizzes });
    setStudentAnswers({});
  };

  const handleEndClass = () => {
    setShowEndModal(true);
  };

  const handleConfirmEnd = () => {
    if (emitRef.current) {
      emitRef.current({ type: "CLASS_ENDED" });
    }
    navigate("/teacher/report");
  };

  return (
    <RoleLayout role="teacher">
      <section className="content wide">
      <div className="live-statusbar">
        <div className="left">
          <span className="pill pill-brand">{courseName}</span>
          <span>학생 <strong>{joinCount}</strong>명 접속 중</span>
          <span className="live-pill"><span className="dot" />실시간 연동</span>
        </div>
        <div className="right">
          <span className="small-text">코드 <strong>{code}</strong></span>
          <button className="btn btn-danger btn-sm" type="button" onClick={handleEndClass}>수업 종료</button>
        </div>
      </div>

      <div className="split">
        {/* 왼쪽: PDF */}
        <div className="split-left">
          {pdfData ? (
            <PdfViewer pdfData={pdfData} currentPage={pdfPage} onPageChange={setPdfPage} role="teacher" />
          ) : (
            <div className="pdf-frame">
              <div className="pdf-toolbar">
                <div className="group">
                  <button className="grp-btn" type="button" disabled>이전</button>
                  <span className="mono">— / —</span>
                  <button className="grp-btn" type="button" disabled>다음</button>
                </div>
                <div className="small-text">{pdfFileName || "강의자료 미업로드"}</div>
                <div className="group">
                  <button className="grp-btn" type="button" disabled>−</button>
                  <span className="mono">100%</span>
                  <button className="grp-btn" type="button" disabled>+</button>
                </div>
              </div>
              <div className="pdf-stage">
                <div className="pdf-empty">
                  <div className="icon-placeholder">FILE</div>
                  <p>강의자료가 아직 업로드되지 않았어요</p>
                  <p className="small-text">강의 설정에서 PDF를 업로드해 주세요</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 오른쪽: 퀴즈 */}
        <div className="split-right">
          <div className="set-filter-row">
            <div className="panel-tabs">
              <button className={`panel-tab ${activePanel === "quiz" ? "active" : ""}`} type="button" onClick={() => setActivePanel("quiz")}>퀴즈 <span className="badge">{quizzes.length}</span></button>
              <button className={`panel-tab ${activePanel === "qna" ? "active" : ""}`} type="button" onClick={() => setActivePanel("qna")}>질문함 <span className="badge">{questions.length}</span></button>
            </div>
            <div className="filter-group">
              <button className="on" type="button">현재 세트</button>
              <button type="button">마감된 세트</button>
            </div>
          </div>

          {activePanel === "quiz" ? (
            <div className="panel-list">
              <article className="card flow-card">
                <div className="card-pad-lg">
                  <div className="head-row">
                    <div>
                      <span className="eyebrow">Quiz Generator</span>
                      <h3>새 퀴즈 세트 만들기</h3>
                    </div>
                    <span className="pill pill-brand">AI</span>
                  </div>
                  <div className="range-row">
                    <div className="small-text">생성 범위</div>
                    <div className="range-inputs">
                      <input type="number" className="input" min="1" value={rangeStart} onChange={(e) => setRangeStart(Number(e.target.value))} />
                      <span>—</span>
                      <input type="number" className="input" min="1" value={rangeEnd} onChange={(e) => setRangeEnd(Number(e.target.value))} />
                    </div>
                  </div>
                  <div className="button-group">
                    <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setRangeStart(pdfPage); setRangeEnd(pdfPage); }}>현재 페이지</button>
                    <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setRangeStart(Math.max(1, pdfPage - 2)); setRangeEnd(pdfPage); }}>최근 3p</button>
                    <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setRangeStart(1); setRangeEnd(pdfTotal); }}>전체</button>
                  </div>
                  <button className="btn btn-ghost" type="button" onClick={handleExtractKeywords}>AI 핵심 키워드 추출</button>

                  {extractedKeywords.length > 0 && (
                    <div className="kw-section">
                      <div className="head-row">
                        <div className="small-text">추출된 키워드</div>
                        <div className="tiny-text">선택 {selectedKeywords.length} / 최대 5</div>
                      </div>
                      <div className="chip-wrap">
                        {extractedKeywords.map((keyword) => (
                          <button key={keyword} className={`chip ${selectedKeywords.includes(keyword) ? "selected" : ""}`} type="button" onClick={() => handleToggleKeyword(keyword)}>{keyword}</button>
                        ))}
                      </div>
                      <button className="btn btn-primary" type="button" onClick={handleGenerateQuiz} disabled={selectedKeywords.length === 0}>선택한 키워드로 퀴즈 생성</button>
                    </div>
                  )}
                </div>
              </article>

              {quizzes.length > 0 && (
                <article className="card">
                  <div className="card-head">
                    <div>
                      <div className="card-title">현재 세트 · #1</div>
                      <div className="card-sub">{quizzes.length}문제 · 모두 풀고 제출하세요</div>
                    </div>
                    <button className="btn btn-ghost btn-sm" type="button" onClick={() => setQuizzes([])}>폐기</button>
                  </div>
                  <div className="quiz-list">
                    {quizzes.map((item) => (
                      <div key={item.id} className="quiz-item">
                        <div className="quiz-meta"><strong>{item.n}</strong> · {item.keyword}</div>
                        <div>{item.question}</div>
                      </div>
                    ))}
                  </div>
                  <div className="card-actions">
                    <button className="btn btn-primary" type="button" onClick={handlePublishQuiz}>학생에게 퀴즈 내보내기</button>
                  </div>
                </article>
              )}

              {publishedSet && (
                <article className="card">
                  <div className="card-head">
                    <div>
                      <div className="card-title">현재 세트 응답 현황</div>
                      <div className="card-sub">{publishedSet.questions.length}문제 · 학생 응답 대기</div>
                    </div>
                    <span className="pill pill-success">출제 중</span>
                  </div>
                  <div className="quiz-list">
                    {publishedSet.questions.map((item) => (
                      <div key={item.id} className="quiz-item">
                        <div className="quiz-meta"><strong>{item.n}</strong> · {item.keyword}</div>
                        <div>{item.question}</div>
                      </div>
                    ))}
                  </div>
                  <div className="card-actions">
                    <button className="btn btn-dark" type="button">정답 공개 및 마감</button>
                  </div>
                </article>
              )}
            </div>
          ) : (
            <div className="panel-list">
              <article className="card">
                <div className="card-head">
                  <div>
                    <div className="card-title">익명 질문함</div>
                    <div className="card-sub">학생들이 수업 중에 보낸 질문입니다 · 답변은 수업 후 리포트에서</div>
                  </div>
                  <span className="pill pill-neutral">{questions.length}개</span>
                </div>
                <div className="quiz-list">
                  {questions.map((question) => (
                    <div key={question.id} className="quiz-item">
                      <div className="quiz-meta"><strong>{question.week}주차</strong> · {question.time}</div>
                      <div>{question.text}</div>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          )}
        </div>
      </div>

      {/* 수업 종료 모달 */}
      {showEndModal && (
        <div className="modal-backdrop open">
          <div className="modal">
            <div className="modal-head">
              <div className="modal-icon alert">
                <AlertCircle size={22} />
              </div>
              <div>
                <h3>수업을 종료하시겠어요?</h3>
                <p>확인 시 수업이 마감되고 리포트 페이지로 이동합니다.</p>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" type="button" onClick={() => setShowEndModal(false)}>취소</button>
              <button className="btn btn-danger" type="button" onClick={handleConfirmEnd}>수업 종료</button>
            </div>
          </div>
        </div>
      )}
      </section>
    </RoleLayout>
  );
}

export default TeacherLivePage;
