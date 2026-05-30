import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  defaultCourses,
  KEYWORD_BANK,
  keywordsFor,
  quizFromKeyword,
  SAMPLE_QUESTIONS,
} from "../data/quizSyncMock.js";

const VIEW_LABELS = {
  courses: "강의 목록",
  setup: "강의 설정",
  profLive: "수업 진행",
  studentCourses: "My Courses",
  studentLive: "수업 참여",
  studentReview: "복습",
};

const ROLE_PANES = {
  professor: ["courses", "setup", "profLive"],
  student: ["studentCourses", "studentLive", "studentReview"],
};

function QuizSyncApp() {
  const navigate = useNavigate();
  const location = useLocation();
  const initialRole = location.state?.role || localStorage.getItem("quizsync_role") || "professor";
  const [role, setRole] = useState(initialRole);
  const [activeView, setActiveView] = useState(initialRole === "professor" ? "courses" : "studentCourses");
  const [courses, setCourses] = useState(defaultCourses);
  const [selectedCourseId, setSelectedCourseId] = useState(defaultCourses[0].id);
  const [classCode, setClassCode] = useState("JEB5ZA");
  const [joinCount, setJoinCount] = useState(12);
  const [studentsConnected, setStudentsConnected] = useState(32);
  const [pdfFileName, setPdfFileName] = useState(null);
  const [pdfMeta, setPdfMeta] = useState(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfTotal, setPdfTotal] = useState(8);
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(3);
  const [extractedKeywords, setExtractedKeywords] = useState([]);
  const [selectedKeywords, setSelectedKeywords] = useState([]);
  const [currentQuizSet, setCurrentQuizSet] = useState([]);
  const [publishedSet, setPublishedSet] = useState(null);
  const [activePanel, setActivePanel] = useState("quiz");
  const [studentQuizAnswers, setStudentQuizAnswers] = useState({});
  const [studentSubmitStatus, setStudentSubmitStatus] = useState(false);
  const [questionList, setQuestionList] = useState(SAMPLE_QUESTIONS);

  useEffect(() => {
    localStorage.setItem("quizsync_role", role);
    if (role === "professor") {
      setActiveView("courses");
    } else {
      setActiveView("studentCourses");
    }
  }, [role]);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) ?? courses[0],
    [courses, selectedCourseId]
  );

  const coursesByTerm = useMemo(() => {
    return courses.reduce((group, course) => {
      const key = `${course.year}년 ${course.term}`;
      if (!group[key]) group[key] = [];
      group[key].push(course);
      return group;
    }, {});
  }, [courses]);

  const currentStep = useMemo(() => {
    if (activeView === "courses") return 1;
    if (activeView === "setup") return 2;
    if (activeView === "profLive" || activeView === "studentLive") return 4;
    return 1;
  }, [activeView]);

  useEffect(() => {
    if (role === "student") {
      document.body.dataset.role = "student";
    } else {
      delete document.body.dataset.role;
    }
  }, [role]);

  useEffect(() => {
    document.body.classList.toggle("class-mode", activeView === "profLive" || activeView === "studentLive");
    return () => document.body.classList.remove("class-mode");
  }, [activeView]);

  const showBackButton = useMemo(() => {
    return role === "professor" ? activeView !== "courses" : activeView !== "studentCourses";
  }, [role, activeView]);

  const handleLogout = () => {
    localStorage.removeItem("quizsync_role");
    navigate("/login", { replace: true });
  };

  const handleSwitchRole = (nextRole) => {
    setRole(nextRole);
    setActivePanel("quiz");
  };

  const handleCourseChange = (courseId) => {
    setSelectedCourseId(courseId);
    setActiveView(role === "professor" ? "setup" : "studentLive");
  };

  const handlePdfUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPdfFileName(file.name);
    setPdfMeta({ size: file.size, type: file.type });
    setPdfTotal(12);
    setPdfPage(1);
  };

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
    setCurrentQuizSet(quizSet);
    setPublishedSet(null);
  };

  const handlePublishQuiz = () => {
    if (!currentQuizSet.length) return;
    setPublishedSet({ id: Date.now(), createdAt: new Date().toLocaleTimeString(), questions: currentQuizSet });
    setStudentSubmitStatus(false);
    setActiveView("profLive");
  };

  const handleSubmitStudentAnswers = () => {
    setStudentSubmitStatus(true);
  };

  const handleBackToCourses = () => {
    setActiveView(role === "professor" ? "courses" : "studentCourses");
  };

  const renderProfessorContent = () => {
    if (activeView === "courses") {
      return (
        <section className="content">
          <div className="page-heading-row">
            <div>
              <h1 className="page-title brand-title">Course Dashboard</h1>
              <p className="page-sub">담당 강의를 선택해 수업 코드를 만들고 학생을 입장시킬 수 있습니다.</p>
            </div>
            <button className="btn btn-primary" type="button" onClick={() => setActiveView("setup")}>새 강의 추가</button>
          </div>
          {Object.entries(coursesByTerm).map(([termLabel, termCourses]) => (
            <div key={termLabel} className="term-section">
              <div className="term-header">
                <h2>{termLabel}</h2>
                <span>담당 {termCourses.length}과목</span>
              </div>
              <div className="course-grid">
                {termCourses.map((course) => (
                  <button key={course.id} className="course-card" type="button" onClick={() => handleCourseChange(course.id)}>
                    <div>
                      <div className="title">{course.title}</div>
                      <div className="term">{course.meta}</div>
                    </div>
                    <span className={`status-tag pill ${course.status}`}>
                      {course.status === 'live' ? '진행 중' : course.status === 'soon' ? '준비 중' : course.status === 'done' ? '종료' : '대기'}
                    </span>
                    <div className="meta">
                      <span className="key">수강생 {course.students}명 · {course.week}주차</span>
                      <div className="acts">
                        <span>{course.status === 'done' ? '리포트 보기 →' : '수업 시작 →'}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      );
    }

    if (activeView === "setup") {
      return (
        <section className="content">
          <div className="page-heading-row">
            <div>
              <p className="eyebrow">Lecture Setup</p>
              <h1 className="page-title">{selectedCourse.title} {selectedCourse.week}주차 · 강의 설정</h1>
              <p className="page-sub">수업 코드를 만들고 학생들이 입장한 뒤 강의자료를 업로드하면 수업을 시작할 수 있습니다.</p>
            </div>
            <button className="btn btn-ghost" type="button" onClick={() => setActiveView("courses")}>강의 목록</button>
          </div>

          <div className="stepper">
            <div className={`step ${currentStep === 1 ? "active" : currentStep > 1 ? "done" : ""}`}>
              <div className="n">1</div>
              <div className="lbl">수업 코드</div>
            </div>
            <div className={`step-line ${currentStep > 1 ? "done" : ""}`}></div>
            <div className={`step ${currentStep === 2 ? "active" : currentStep > 2 ? "done" : ""}`}>
              <div className="n">2</div>
              <div className="lbl">학생 입장</div>
            </div>
            <div className={`step-line ${currentStep > 2 ? "done" : ""}`}></div>
            <div className={`step ${currentStep === 3 ? "active" : currentStep > 3 ? "done" : ""}`}>
              <div className="n">3</div>
              <div className="lbl">강의자료 업로드</div>
            </div>
            <div className={`step-line ${currentStep > 3 ? "done" : ""}`}></div>
            <div className={`step ${currentStep === 4 ? "active" : ""}`}>
              <div className="n">4</div>
              <div className="lbl">수업 시작</div>
            </div>
          </div>

          <div className="setup-grid">
            <article className="card flow-card">
              <div className="card-pad-lg">
                <div className="step-label-row">
                  <span className="eyebrow">Step 01 · 02</span>
                  <h3>수업 코드 발급 · 학생 입장</h3>
                  <p className="small-text">앞에 띄우면 학생들이 이 코드를 입력해 강의실에 입장합니다.</p>
                </div>
                <div className="class-code-stage">
                  <div className="class-code-label">CLASS CODE</div>
                  <div className="class-code-big">{classCode}</div>
                  <div className="class-code-actions">
                    <button className="btn btn-ghost btn-sm" type="button" onClick={() => navigator.clipboard.writeText(classCode)}>복사</button>
                    <button className="btn btn-ghost btn-sm" type="button" onClick={() => setClassCode(Math.random().toString(36).substring(2, 8).toUpperCase())}>코드 재생성</button>
                    <button className="btn btn-ghost btn-sm" type="button">QR 보기</button>
                  </div>
                  <div className="join-counter"><span className="dot" />지금 <strong>{joinCount}</strong>명이 입장하고 있어요</div>
                </div>
                <p className="tiny-text">익명 입장 기준입니다. 학생 명단은 노출되지 않으며 다음 단계와 동시에 진행할 수 있어요.</p>
              </div>
            </article>

            <article className="card">
              <div className="card-head">
                <div>
                  <div className="card-title">Step 03 · 강의자료 PDF</div>
                  <div className="card-sub">전체 PDF가 학생 화면 왼쪽에 그대로 표시됩니다.</div>
                </div>
                <span className="pill pill-brand">PDF only</span>
              </div>

              <div className="card-pad">
                <label htmlFor="pdfInput" className="pdf-dropzone">
                  <input id="pdfInput" type="file" accept="application/pdf" onChange={handlePdfUpload} />
                  <div className="upload-icon">UPLOAD</div>
                  <p>{pdfFileName ? pdfFileName : "PDF 파일을 드래그하거나 클릭해 업로드"}</p>
                  <p className="small-text">최대 20MB · PDF 형식만</p>
                </label>

                {pdfFileName && (
                  <div className="pdf-meta">
                    <div className="pdf-chip">PDF</div>
                    <div>
                      <div>{pdfFileName}</div>
                      <div className="small-text">{(pdfMeta?.size / 1024 / 1024).toFixed(2)}MB</div>
                    </div>
                    <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setPdfFileName(null); setPdfMeta(null); }}>삭제</button>
                  </div>
                )}

                <hr className="hr-soft" />
                <div className="space-between-row">
                  <div className="tiny-text">강의자료 페이지 변경은 학생 화면에 실시간 연동됩니다.</div>
                  <button className="btn btn-primary btn-lg" type="button" onClick={() => setActiveView("profLive")}>수업 시작하기</button>
                </div>
              </div>
            </article>
          </div>
        </section>
      );
    }

    if (activeView === "profLive") {
      return (
        <section className="content wide">
          <div className="live-statusbar">
            <div className="left">
              <span className="pill pill-brand">{selectedCourse.title}</span>
              <span>학생 <strong>{studentsConnected}</strong>명 접속 중</span>
              <span className="live-pill"><span className="dot" />실시간 연동</span>
            </div>
            <div className="right">
              <span className="small-text">코드 <strong>{classCode}</strong></span>
              <button className="btn btn-danger btn-sm" type="button" onClick={handleBackToCourses}>수업 종료</button>
            </div>
          </div>

          <div className="split-panel">
            <div className="split-left">
              <div className="pdf-frame">
                <div className="pdf-toolbar">
                  <div className="group">
                    <button className="grp-btn" type="button" onClick={() => setPdfPage((prev) => Math.max(1, prev - 1))}>이전</button>
                    <span className="mono">{pdfPage} / {pdfTotal}</span>
                    <button className="grp-btn" type="button" onClick={() => setPdfPage((prev) => Math.min(pdfTotal, prev + 1))}>다음</button>
                  </div>
                  <div className="small-text">{pdfFileName || "강의자료 미업로드"}</div>
                  <div className="group">
                    <button className="grp-btn" type="button">-</button>
                    <span className="mono">100%</span>
                    <button className="grp-btn" type="button">+</button>
                  </div>
                </div>
                <div className="pdf-stage">
                  {pdfFileName ? (
                    <div className="pdf-empty">PDF 미리보기: {pdfFileName}</div>
                  ) : (
                    <div className="pdf-empty">
                      <div className="icon-placeholder">FILE</div>
                      <p>강의자료가 아직 업로드되지 않았어요</p>
                      <p className="small-text">강의 설정에서 PDF를 업로드해 주세요</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="split-right">
              <div className="set-filter-row">
                <div className="panel-tabs">
                  <button className={`panel-tab ${activePanel === "quiz" ? "active" : ""}`} type="button" onClick={() => setActivePanel("quiz")}>퀴즈 <span className="badge">{currentQuizSet.length}</span></button>
                  <button className={`panel-tab ${activePanel === "qna" ? "active" : ""}`} type="button" onClick={() => setActivePanel("qna")}>질문함 <span className="badge">{questionList.length}</span></button>
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

                  {currentQuizSet.length > 0 && (
                    <article className="card">
                      <div className="card-head">
                        <div>
                          <div className="card-title">현재 세트 · #1</div>
                          <div className="card-sub">{currentQuizSet.length}문제 · 모두 풀고 제출하세요</div>
                        </div>
                        <button className="btn btn-ghost btn-sm" type="button" onClick={() => setCurrentQuizSet([])}>폐기</button>
                      </div>
                      <div className="quiz-list">
                        {currentQuizSet.map((item) => (
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
                      <span className="pill pill-neutral">{questionList.length}개</span>
                    </div>
                    <div className="quiz-list">
                      {questionList.map((question) => (
                        <div key={question.id} className="quiz-item">
                          <div className="quiz-meta"><strong>{question.ago}</strong></div>
                          <div>{question.text}</div>
                        </div>
                      ))}
                    </div>
                  </article>
                </div>
              )}
            </div>
          </div>
        </section>
      );
    }

    return null;
  };

  const renderStudentContent = () => {
    if (activeView === "studentCourses") {
      return (
        <section className="content">
          <div className="page-heading-row">
            <div>
              <h1 className="page-title brand-title">My Courses</h1>
              <p className="page-sub">수업을 선택한 뒤 교수님이 띄운 수업 코드를 입력해 강의실에 입장합니다.</p>
            </div>
          </div>
          <div className="student-course-grid">
            {courses.map((course) => (
              <button key={course.id} className="course-card" type="button" onClick={() => handleCourseChange(course.id)}>
                <div>
                  <div className="title">{course.title}</div>
                  <div className="term">{course.meta}</div>
                </div>
                <span className={`status-tag pill ${course.status}`}>
                  {course.status === "live" ? "수업 중" : course.status === "done" ? "복습" : course.status === "soon" ? "곧 시작" : "대기"}
                </span>
                <div className="meta">
                  <span className="key">{course.week}주차 · 담당 김OO 교수</span>
                  <div className="acts">
                    <span>{course.status === "done" ? "복습 →" : course.status === "live" ? "강의실 입장 →" : "곧 시작"}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      );
    }

    if (activeView === "studentLive") {
      return (
        <section className="content wide">
          <div className="live-statusbar">
            <div className="left">
              <span className="pill pill-brand">{selectedCourse.title}</span>
              <span>학번 <strong>20231349</strong> · 익명 응답</span>
              <span className="live-pill"><span className="dot" />실시간 연동</span>
            </div>
            <div className="right">
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setActiveView("studentReview")}>복습</button>
              <button className="btn btn-ghost btn-sm" type="button" onClick={handleBackToCourses}>퇴장</button>
            </div>
          </div>

          <div className="split-panel">
            <div className="split-left">
              <div className="pdf-frame">
                <div className="pdf-toolbar">
                  <div className="group">
                    <span className="grp-btn">교수자 화면 동기화</span>
                  </div>
                  <div className="mono">{pdfPage} / {pdfTotal}</div>
                  <div className="group">
                    <button className="grp-btn" type="button">maximize</button>
                  </div>
                </div>
                <div className="pdf-stage">
                  {pdfFileName ? (
                    <div className="pdf-empty">{pdfFileName} 페이지 보기 중</div>
                  ) : (
                    <div className="pdf-empty">
                      <div className="icon-placeholder">HOUR</div>
                      <p>강의자료 업로드 전</p>
                      <p className="small-text">교수님이 자료를 올리면 여기에 표시돼요</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="split-right">
              {!publishedSet ? (
                <article className="card">
                  <div className="card-pad-lg text-center">
                    <div className="status-icon">🤚</div>
                    <h3>수업이 진행되고 있어요</h3>
                    <p className="small-text">교수님이 퀴즈를 출제하면 이 영역에 표시됩니다. 왼쪽 강의자료를 따라가며 수업을 들어주세요.</p>
                  </div>
                </article>
              ) : (
                <article className="card student-set-card">
                  <div className="card-head">
                    <div>
                      <div className="card-title">퀴즈 세트 · #1</div>
                      <div className="card-sub">{publishedSet.questions.length}문제 · 모두 풀고 제출하세요</div>
                    </div>
                    <span className="pill pill-warn">진행 중</span>
                  </div>
                  <div className="quiz-list">
                    {publishedSet.questions.map((item) => (
                      <div key={item.id} className="quiz-item student-quiz-item">
                        <div className="quiz-meta"><strong>{item.n}</strong> · {item.keyword}</div>
                        <div>{item.question}</div>
                        <div className="answer-group">
                          {item.choices.map((choice, index) => (
                            <label key={choice} className="radio-option">
                              <input
                                type="radio"
                                name={`answer-${item.id}`}
                                checked={studentQuizAnswers[item.id] === index}
                                onChange={() => setStudentQuizAnswers((prev) => ({ ...prev, [item.id]: index }))}
                              />
                              {choice}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="card-actions">
                    <button className="btn btn-primary" type="button" onClick={handleSubmitStudentAnswers}>답안 제출</button>
                    {studentSubmitStatus && <p className="tiny-text">제출 완료되었습니다. 교수님이 마감하면 정답이 공개돼요.</p>}
                  </div>
                </article>
              )}
            </div>
          </div>
        </section>
      );
    }

    if (activeView === "studentReview") {
      return (
        <section className="content">
          <div>
            <p className="eyebrow">Review</p>
            <h1 className="page-title">복습 자료</h1>
            <p className="page-sub">최근 출제된 퀴즈 세트와 강의 자료를 확인해 보세요.</p>
          </div>
          <div className="review-grid">
            <article className="card review-card">
              <h3>최근 퀴즈 세트</h3>
              <p className="small-text">출제된 퀴즈를 다시 확인하고 핵심 개념을 복습하세요.</p>
              <button className="btn btn-primary" type="button">퀴즈 복습하기</button>
            </article>
            <article className="card review-card">
              <h3>강의 노트</h3>
              <p className="small-text">업로드된 PDF를 바탕으로 학습 요약을 빠르게 확인할 수 있습니다.</p>
              <button className="btn btn-ghost" type="button">자료 보기</button>
            </article>
          </div>
        </section>
      );
    }

    return null;
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-head">
          <div className="logo">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2 L19 6 V14 L12 18 L5 14 V6 Z" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
              <circle cx="12" cy="11" r="2.5" fill="#fff" />
              <path d="M14 13 L17 16" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <div className="wordmark">QuizSync</div>
            <div className="wordmark-sub">수업 이해도 체크</div>
          </div>
        </div>
        <div className="sidebar-section">
          {role === "professor" ? (
            <>
              <div className="label">강의 운영</div>
              <button className={`nav-btn ${activeView === "courses" ? "active" : ""}`} type="button" onClick={() => setActiveView("courses")}>강의 목록</button>
              <button className={`nav-btn ${activeView === "profLive" ? "active" : ""}`} type="button" onClick={() => setActiveView("profLive")}>수업 진행</button>
              <div className="label">분석</div>
              <button className={`nav-btn ${activeView === "setup" ? "active" : ""}`} type="button" onClick={() => setActiveView("setup")}>강의 설정</button>
            </>
          ) : (
            <>
              <div className="label">My Courses</div>
              <button className={`nav-btn ${activeView === "studentCourses" ? "active" : ""}`} type="button" onClick={() => setActiveView("studentCourses")}>My Courses</button>
              <button className={`nav-btn ${activeView === "studentLive" ? "active" : ""}`} type="button" onClick={() => setActiveView("studentLive")}>복습</button>
            </>
          )}
        </div>
        <div className="sidebar-spacer" />
        <div className="profile-card">
          <div className="av">{role === "professor" ? "K" : "노"}</div>
          <div className="profile-text">
            <div className="name">{role === "professor" ? "김교수" : "노은서"}</div>
            <div className="email">{role === "professor" ? "prof@sungshin.ac.kr" : "20231349@sungshin.ac.kr"}</div>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="crumbs">
            {showBackButton && (
              <button className="btn btn-ghost btn-sm" type="button" onClick={handleBackToCourses}>뒤로</button>
            )}
            <i className="icon-grid" />
            <strong>{VIEW_LABELS[activeView]}</strong>
          </div>
          <div className="top-actions">
            <span className="live-pill"><span className="dot" />실시간 연동</span>
            <div className="role-toggle">
              <button className={role === "professor" ? "on" : ""} type="button" onClick={() => handleSwitchRole("professor")}>교수</button>
              <button className={role === "student" ? "on" : ""} type="button" onClick={() => handleSwitchRole("student")}>학생</button>
            </div>
            <button className="btn btn-ghost btn-sm" type="button" onClick={handleLogout}>로그아웃</button>
          </div>
        </header>
        {role === "professor" ? renderProfessorContent() : renderStudentContent()}
      </main>
    </div>
  );
}

export default QuizSyncApp;
