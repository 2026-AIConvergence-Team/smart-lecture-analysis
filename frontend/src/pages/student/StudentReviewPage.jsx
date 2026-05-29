import { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { useLocation } from "react-router-dom";
import RoleLayout from "../../components/RoleLayout.jsx";
import PdfViewer from "../../components/PdfViewer.jsx";
import { getPdfCache } from "../../data/sessionCache.js";
import { getCourses, getCourseLectures } from "../../api/courseApi.js";
import { getLectureReview, createMemo, updateMemo } from "../../api/lectureApi.js";

function StudentReviewPage() {
  const location = useLocation();
  const pdfCache = getPdfCache();
  // 수업 직후 이동 시 전달받는 lectureId (자동 선택용)
  const locationLectureId = location.state?.lectureId ? Number(location.state.lectureId) : null;

  const [courses, setCourses] = useState([]);
  const [lecturesByCourse, setLecturesByCourse] = useState({});
  const [activeCourseId, setActiveCourseId] = useState(null);
  const [activeLectureIdx, setActiveLectureIdx] = useState(0);

  const [review, setReview] = useState(null);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");

  const [activeSetIdx, setActiveSetIdx] = useState(0);
  const [filterMode, setFilterMode] = useState("all");
  const [memos, setMemos] = useState({});
  // quiz_id → "none" | "exists" (서버에 메모가 있는지 여부)
  const memoStateRef = useRef({});

  const [pdfPage, setPdfPage] = useState(1);
  const [pdfData] = useState(() => pdfCache.pdfData);

  // 강의 목록 초기 로드
  useEffect(() => {
    setCoursesLoading(true);
    getCourses()
      .then(async (list) => {
        setCourses(list);
        if (list.length === 0) return;

        // lectureId가 전달된 경우: 해당 강의가 속한 과목을 찾아 자동 선택
        if (locationLectureId) {
          for (const course of list) {
            const lectures = await getCourseLectures(course.id).catch(() => []);
            setLecturesByCourse((prev) => ({ ...prev, [course.id]: lectures }));
            const idx = lectures.findIndex(
              (l) => Number(l.id ?? l.lecture_id) === locationLectureId
            );
            if (idx !== -1) {
              setActiveCourseId(course.id);
              setActiveLectureIdx(idx);
              return; // 찾았으면 종료
            }
          }
        }

        // 기본: 첫 번째 과목의 마지막 강의
        const firstId = list[0].id;
        setActiveCourseId(firstId);
        const lectures = await getCourseLectures(firstId).catch(() => []);
        setLecturesByCourse((prev) => ({ ...prev, [firstId]: lectures }));
        setActiveLectureIdx(lectures.length > 0 ? lectures.length - 1 : 0);
      })
      .catch((err) => console.error(err))
      .finally(() => setCoursesLoading(false));
  }, []);

  const handleCourseChange = async (courseId) => {
    const numId = Number(courseId);
    setActiveCourseId(numId);
    setReview(null);
    setReviewError("");
    setActiveSetIdx(0);
    setFilterMode("all");
    setMemos({});
    if (!lecturesByCourse[numId]) {
      const lectures = await getCourseLectures(numId).catch(() => []);
      setLecturesByCourse((prev) => ({ ...prev, [numId]: lectures }));
      setActiveLectureIdx(lectures.length > 0 ? lectures.length - 1 : 0);
    } else {
      const lectures = lecturesByCourse[numId] || [];
      setActiveLectureIdx(lectures.length > 0 ? lectures.length - 1 : 0);
    }
  };

  const activeLectures = (activeCourseId ? lecturesByCourse[activeCourseId] : null) || [];
  const activeLecture = activeLectures[activeLectureIdx] || null;
  const activeLectureId = activeLecture?.id ?? activeLecture?.lecture_id ?? null;

  // 수업 변경 시 복습 로드
  useEffect(() => {
    if (!activeLectureId) return;
    setReviewLoading(true);
    setReview(null);
    setReviewError("");
    setActiveSetIdx(0);
    setFilterMode("all");
    getLectureReview(activeLectureId)
      .then((data) => {
        // my_answer가 null인 경우 localStorage 폴백으로 병합
        let localAnswers = {};
        try {
          localAnswers = JSON.parse(
            localStorage.getItem(`quizsync-myanswers-${activeLectureId}`) || "{}"
          );
        } catch {}
        const hasLocal = Object.keys(localAnswers).length > 0;

        // my_answer 병합 + is_correct 재계산
        // my_answer는 백엔드에서 "1"/"2" 번호 또는 텍스트, localStorage에서는 텍스트로 올 수 있음
        const mergeQuiz = (quiz) => {
          const my_answer = quiz.my_answer ?? (hasLocal ? localAnswers[String(quiz.quiz_id)] ?? null : null);
          let is_correct = quiz.is_correct;
          if ((is_correct === null || is_correct === undefined) && my_answer) {
            const num = parseInt(my_answer, 10);
            const myIdx = !isNaN(num) && num >= 1 && num <= (quiz.options || []).length
              ? num - 1
              : (quiz.options || []).indexOf(my_answer);
            const correctIdx = (quiz.options || []).indexOf(quiz.answer);
            is_correct = myIdx !== -1 && myIdx === correctIdx;
          }
          return { ...quiz, my_answer, is_correct };
        };

        // 세트별 quizzes 병합 + 세트 성적 재계산
        const mergedSets = (data.sets || []).map((set) => {
          const quizzes = (set.quizzes || []).map(mergeQuiz);
          const setCorrect = quizzes.filter((q) => q.is_correct === true).length;
          return { ...set, quizzes, my_correct_count: setCorrect, quiz_count: quizzes.length };
        });

        // 전체 my_stats도 병합된 데이터 기준으로 재계산
        const allQuizzes = mergedSets.flatMap((s) => s.quizzes);
        const totalCount = allQuizzes.length;
        const correctCount = allQuizzes.filter((q) => q.is_correct === true).length;
        const correctRate = totalCount > 0 ? (correctCount / totalCount) * 100 : 0;

        const merged = {
          ...data,
          sets: mergedSets,
          my_stats: {
            ...(data.my_stats || {}),
            total_quiz_count: totalCount,
            my_correct_count: correctCount,
            my_correct_rate: correctRate,
          },
        };

        setReview(merged);
        // 메모 초기값 + 상태 세팅
        const initMemos = {};
        const initMemoState = {};
        (merged.sets || []).forEach((set) => {
          (set.quizzes || []).forEach((quiz) => {
            initMemos[quiz.quiz_id] = quiz.memo || "";
            initMemoState[quiz.quiz_id] = quiz.memo != null ? "exists" : "none";
          });
        });
        setMemos(initMemos);
        memoStateRef.current = initMemoState;
      })
      .catch((err) => setReviewError(err.message))
      .finally(() => setReviewLoading(false));
  }, [activeLectureId]);

  // 메모 변경 핸들러 (blur 시 서버 저장)
  const handleMemoChange = (quizId, text) => {
    setMemos((prev) => ({ ...prev, [quizId]: text }));
  };

  const handleMemoBlur = async (quizId) => {
    const content = memos[quizId] || "";
    const state = memoStateRef.current[quizId];
    try {
      if (state === "exists") {
        await updateMemo(quizId, content);
      } else {
        await createMemo(quizId, content);
        memoStateRef.current = { ...memoStateRef.current, [quizId]: "exists" };
      }
    } catch (err) {
      console.error("메모 저장 실패:", err.message);
    }
  };

  const activeCourse = courses.find((c) => c.id === activeCourseId);
  const sets = review?.sets || [];
  const activeSet = sets[activeSetIdx] || null;

  // 필터 적용
  const filtered = (() => {
    if (!activeSet) return [];
    let list = activeSet.quizzes;
    if (filterMode === "wrong") {
      list = list.filter((q) => !q.is_correct);
    } else if (filterMode === "hot") {
      list = [...list].sort((a, b) => b.class_wrong_rate - a.class_wrong_rate);
    }
    return list;
  })();

  // PDF 페이지: 세트 탭 변경 시 해당 세트 시작 페이지로 이동
  useEffect(() => {
    if (activeSet?.page_start) setPdfPage(activeSet.page_start);
  }, [activeSetIdx]);

  return (
    <RoleLayout role="student">
      <div className="review-split">
        {/* ── 왼쪽: 복습 패널 ── */}
        <div className="review-quiz-panel">
          <div className="content">

            {/* 헤더 */}
            <div className="review-eyebrow-row">
              <p className="eyebrow">My Review</p>
              <label className="review-course-picker">
                <span>강의</span>
                <select value={activeCourseId || ""} onChange={(e) => handleCourseChange(e.target.value)}>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, marginTop: 8 }}>
              <div>
                <h1 className="page-title">
                  {activeCourse?.title || "강의"} 복습
                </h1>
                <p className="page-sub">
                  {activeLecture?.date ? `${activeLecture.date} · ` : ""}수업 중에 풀었던 퀴즈와 메모를 함께 확인할 수 있어요.
                </p>
              </div>
              {/* 수업 네비게이션 */}
              <div className="week-nav">
                <button
                  className="btn-arrow"
                  type="button"
                  onClick={() => { setActiveLectureIdx((i) => Math.max(0, i - 1)); setReview(null); setReviewError(""); setActiveSetIdx(0); setFilterMode("all"); }}
                  disabled={activeLectureIdx <= 0}
                >
                  <ChevronLeft size={16} />
                </button>
                <div className="now">
                  {activeLecture?.title || "수업 없음"}{" "}
                  <span className="sub">{activeLecture?.date || ""}</span>
                </div>
                <button
                  className="btn-arrow"
                  type="button"
                  onClick={() => { setActiveLectureIdx((i) => Math.min(activeLectures.length - 1, i + 1)); setReview(null); setReviewError(""); setActiveSetIdx(0); setFilterMode("all"); }}
                  disabled={activeLectureIdx >= activeLectures.length - 1}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* 로딩 */}
            {(coursesLoading || reviewLoading) && (
              <div className="card card-pad-lg" style={{ marginTop: 22, textAlign: "center", color: "var(--zinc-500)" }}>
                {coursesLoading ? "강의 목록을 불러오는 중..." : "복습 데이터를 불러오는 중..."}
              </div>
            )}

            {/* 수업 없음 */}
            {!coursesLoading && courses.length > 0 && activeLectures.length === 0 && !reviewLoading && (
              <div className="card card-pad-lg" style={{ marginTop: 22, textAlign: "center", color: "var(--zinc-500)" }}>
                이 강의에 아직 수업이 없습니다.
              </div>
            )}

            {/* 수업 미종료 */}
            {!reviewLoading && reviewError === "LECTURE_NOT_ENDED" && (
              <div className="card card-pad-lg" style={{ marginTop: 22, textAlign: "center", padding: "48px 24px" }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>📅</div>
                <span className="pill pill-warn" style={{ display: "inline-flex" }}>수업 전 / 진행 중</span>
                <h3 style={{ marginTop: 10, fontSize: 17, fontWeight: 700, color: "var(--zinc-900)" }}>
                  아직 수업이 종료되지 않았어요
                </h3>
                <p style={{ marginTop: 6, fontSize: 13, color: "var(--zinc-500)" }}>
                  수업이 끝난 뒤 복습 내용이 이곳에 표시됩니다.
                </p>
              </div>
            )}

            {/* 기타 에러 */}
            {!reviewLoading && reviewError && reviewError !== "LECTURE_NOT_ENDED" && (
              <div className="card card-pad-lg" style={{ marginTop: 22, color: "var(--danger)" }}>
                {reviewError}
              </div>
            )}

            {/* ── 복습 본문 ── */}
            {!reviewLoading && review && (
              <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 22 }}>

                {/* 전체 성적 카드 */}
                <div className="card card-pad flow-card">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--brand-deep)" }}>내 성적</div>
                      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>
                        전체 {review.my_stats.total_quiz_count}문제 중 {review.my_stats.my_correct_count}개 정답
                      </div>
                      {activeSet && (
                        <div style={{ fontSize: 13, color: "var(--zinc-500)", marginTop: 6 }}>
                          세트 #{activeSet.set_number} · {activeSet.quiz_count}문제 중 {activeSet.my_correct_count}개 정답
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div className="mono" style={{ fontSize: 36, fontWeight: 700, color: "var(--brand-deep)" }}>
                        {Math.round(review.my_stats.my_correct_rate)}
                        <span style={{ fontSize: 18 }}>%</span>
                      </div>
                    </div>
                  </div>
                  <div className="bar" style={{ marginTop: 12 }}>
                    <div style={{ width: `${review.my_stats.my_correct_rate}%` }} />
                  </div>
                </div>

                {/* 세트 탭 + 필터 */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div className="set-tabs">
                    {sets.map((s, i) => (
                      <button
                        key={s.set_id}
                        className={`set-tab ${activeSetIdx === i ? "active" : ""}`}
                        type="button"
                        onClick={() => { setActiveSetIdx(i); setFilterMode("all"); }}
                      >
                        <span className="dot" style={{ background: i === 0 ? "var(--brand)" : "var(--brand-2)" }} />
                        세트 #{s.set_number}
                      </button>
                    ))}
                  </div>
                  <div className="filter-group">
                    <button className={filterMode === "all" ? "on" : ""} type="button" onClick={() => setFilterMode("all")}>전체 문제</button>
                    <button className={filterMode === "wrong" ? "on" : ""} type="button" onClick={() => setFilterMode("wrong")}>내 오답만</button>
                    <button className={filterMode === "hot" ? "on" : ""} type="button" onClick={() => setFilterMode("hot")}>오답률 높은 순</button>
                  </div>
                </div>

                {/* 퀴즈 목록 */}
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {filtered.length === 0 && (
                    <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--zinc-500)", fontSize: 13 }}>
                      해당하는 문제가 없습니다
                    </div>
                  )}
                  {filtered.map((quiz, i) => {
                    const isCorrect = quiz.is_correct;
                    // my_answer가 "1"/"2" 번호형이든 텍스트든 0-based index로 정규화
                    const myAnswerIdx = (() => {
                      const ma = quiz.my_answer;
                      if (ma === null || ma === undefined || ma === "") return -1;
                      const num = parseInt(ma, 10);
                      if (!isNaN(num) && num >= 1 && num <= (quiz.options || []).length) return num - 1;
                      return (quiz.options || []).indexOf(ma);
                    })();
                    const hasAnswer = myAnswerIdx !== -1;
                    return (
                      <div key={quiz.quiz_id} className="quiz-item">
                        <div className="quiz-item-head">
                          <div className="q-num">
                            <strong>Q{i + 1}</strong>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 11, color: "var(--zinc-500)" }}>
                              전체 오답률{" "}
                              <span style={{ fontWeight: 700, color: quiz.class_wrong_rate >= 50 ? "var(--danger)" : quiz.class_wrong_rate >= 30 ? "var(--warning-700)" : "var(--zinc-700)" }}>
                                {Math.round(quiz.class_wrong_rate)}%
                              </span>
                            </span>
                            <span className={`pill ${!hasAnswer ? "pill-neutral" : isCorrect ? "pill-success" : "pill-danger"}`} style={{ fontSize: 10 }}>
                              {!hasAnswer ? "미제출" : isCorrect ? "정답" : "오답"}
                            </span>
                          </div>
                        </div>

                        <div style={{ marginTop: 12, fontSize: 14, fontWeight: 500 }}>
                          {quiz.question}
                        </div>

                        <div className={`choices ${(quiz.options || []).length <= 2 ? "col1" : ""}`} style={{ marginTop: 12 }}>
                          {(quiz.options || []).map((option, idx) => {
                            const correctIdx = (quiz.options || []).indexOf(quiz.answer);
                            const wasSelected = idx === myAnswerIdx;
                            const isAnswerOpt = idx === correctIdx;
                            let cls = "";
                            if (wasSelected && isAnswerOpt) cls = "correct";
                            else if (wasSelected && !isAnswerOpt) cls = "wrong";
                            else if (!wasSelected && isAnswerOpt) cls = "correct";
                            return (
                              <div key={idx} className={`choice ${cls}`} style={{ cursor: "default", justifyContent: "space-between" }}>
                                <span>{String.fromCharCode(65 + idx)}. {option}</span>
                                {isAnswerOpt && (
                                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--success-700)", flexShrink: 0 }}>정답</span>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {quiz.explanation && (
                          <div className="explain-box">{quiz.explanation}</div>
                        )}

                        <div className="postit" style={{ marginTop: 12 }}>
                          <div className="head">✏ 수업 중 메모</div>
                          <textarea
                            placeholder="메모를 남겨두세요..."
                            value={memos[quiz.quiz_id] || ""}
                            onChange={(e) => handleMemoChange(quiz.quiz_id, e.target.value)}
                            onBlur={() => handleMemoBlur(quiz.quiz_id)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── 오른쪽: PDF 패널 ── */}
        <div className="review-pdf-panel">
          <div className="review-pdf-header">
            <FileText size={14} style={{ flexShrink: 0 }} />
            <span>강의자료</span>
            {activeSet && (
              <span className="review-pdf-badge pill">
                세트 #{activeSet.set_number} 범위 · p.{activeSet.page_start}–{activeSet.page_end}
              </span>
            )}
          </div>
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <PdfViewer
              pdfData={pdfData}
              currentPage={pdfPage}
              onPageChange={setPdfPage}
              initialTotalPages={pdfCache.pdfTotal || 0}
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
