import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { ChevronLeft, ChevronRight, AlertTriangle, AlignJustify } from "lucide-react";
import RoleLayout from "../../components/RoleLayout.jsx";
import { getCourses, getCourseLectures } from "../../api/courseApi.js";
import { getLectureReport } from "../../api/lectureApi.js";

const COLOR_VAR = {
  danger:  { bar: "var(--danger)",       text: "var(--danger)"       },
  warning: { bar: "var(--warning)",      text: "var(--warning-700)"  },
  success: { bar: "var(--success)",      text: "var(--success-700)"  },
};

function getColorKey(score) {
  if (score >= 70) return "success";
  if (score >= 50) return "warning";
  return "danger";
}

function TeacherReportPage() {
  const location = useLocation();
  const locationLectureId = location.state?.lectureId ? Number(location.state.lectureId) : null;

  const [courses, setCourses] = useState([]);
  const [lecturesByCourse, setLecturesByCourse] = useState({});
  const [activeCourseId, setActiveCourseId] = useState(null);
  const [activeLectureIdx, setActiveLectureIdx] = useState(0);
  const [report, setReport] = useState(null);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");
  const [activeSetIdx, setActiveSetIdx] = useState(0);

  // 강의 목록 초기 로드
  useEffect(() => {
    setCoursesLoading(true);
    getCourses()
      .then(async (list) => {
        setCourses(list);
        if (list.length === 0) return;

        if (locationLectureId) {
          for (const course of list) {
            const lectures = await getCourseLectures(course.id).catch(() => []);
            setLecturesByCourse((prev) => ({ ...prev, [course.id]: lectures }));
            const idx = lectures.findIndex(
              (lecture) => Number(lecture.id ?? lecture.lecture_id) === locationLectureId
            );
            if (idx !== -1) {
              setActiveCourseId(course.id);
              setActiveLectureIdx(idx);
              return;
            }
          }
        }

        const firstId = list[0].id;
        setActiveCourseId(firstId);
        const lectures = await getCourseLectures(firstId).catch(() => []);
        setLecturesByCourse((prev) => ({ ...prev, [firstId]: lectures }));
        setActiveLectureIdx(lectures.length > 0 ? lectures.length - 1 : 0);
      })
      .catch((err) => console.error(err))
      .finally(() => setCoursesLoading(false));
  }, []);

  // 강의 변경 시 해당 과목의 수업 목록 로드
  const handleCourseChange = async (courseId) => {
    const numId = Number(courseId);
    setActiveCourseId(numId);
    setReport(null);
    setReportError("");
    setActiveSetIdx(0);
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

  // 수업 선택 시 리포트 로드
  useEffect(() => {
    if (!activeLectureId) return;
    setReportLoading(true);
    setReport(null);
    setReportError("");
    setActiveSetIdx(0);
    getLectureReport(activeLectureId)
      .then((data) => setReport(data))
      .catch((err) => setReportError(err.message))
      .finally(() => setReportLoading(false));
  }, [activeLectureId]);

  const activeCourse = courses.find((c) => c.id === activeCourseId);
  const sets = report?.sets || [];
  const activeSet = sets[activeSetIdx] || null;
  const weakConcepts = (report?.concept_stats || []).filter((c) => c.is_weak).map((c) => c.concept);

  return (
    <RoleLayout role="teacher" title="수업 리포트">
      <div className="content">

        {/* ── 헤더 ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18, marginBottom: 22 }}>
          <div>
            <div className="review-eyebrow-row">
              <p className="eyebrow">Weekly Report</p>
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
            <h1 className="page-title">
              {activeCourse?.title || "강의"} — 수업 리포트
            </h1>
            <p className="page-sub">
              {activeLecture?.date || ""}{activeLecture?.title ? ` · ${activeLecture.title}` : ""}
            </p>
          </div>

          {/* 수업 네비게이션 */}
          <div className="week-nav" style={{ flexShrink: 0, marginTop: 4 }}>
            <button
              className="btn-arrow"
              type="button"
              onClick={() => { setActiveLectureIdx((i) => Math.max(0, i - 1)); setReport(null); setReportError(""); setActiveSetIdx(0); }}
              disabled={activeLectureIdx <= 0}
            >
              <ChevronLeft size={16} />
            </button>
            <div className="now" style={{ minWidth: 140, textAlign: "center" }}>
              {activeLecture?.title || "수업 없음"}{" "}
              <span className="sub">{activeLecture?.date || ""}</span>
            </div>
            <button
              className="btn-arrow"
              type="button"
              onClick={() => { setActiveLectureIdx((i) => Math.min(activeLectures.length - 1, i + 1)); setReport(null); setReportError(""); setActiveSetIdx(0); }}
              disabled={activeLectureIdx >= activeLectures.length - 1}
            >
              <ChevronRight size={16} />
            </button>
            <button className="btn-arrow" type="button">
              <AlignJustify size={15} />
            </button>
          </div>
        </div>

        {/* 로딩 */}
        {(coursesLoading || reportLoading) && (
          <div className="card card-pad-lg" style={{ textAlign: "center", color: "var(--zinc-500)" }}>
            {coursesLoading ? "강의 목록을 불러오는 중..." : "리포트를 불러오는 중..."}
          </div>
        )}

        {/* 강의 없음 */}
        {!coursesLoading && courses.length === 0 && (
          <div className="card card-pad-lg" style={{ textAlign: "center", color: "var(--zinc-500)" }}>
            등록된 강의가 없습니다.
          </div>
        )}

        {/* 수업 없음 */}
        {!coursesLoading && courses.length > 0 && activeLectures.length === 0 && !reportLoading && (
          <div className="card card-pad-lg" style={{ textAlign: "center", color: "var(--zinc-500)" }}>
            이 강의에 아직 수업이 없습니다.
          </div>
        )}

        {/* 수업 미종료 */}
        {!reportLoading && reportError === "LECTURE_NOT_ENDED" && (
          <div style={{ marginTop: 32 }}>
            <div className="card card-pad-lg" style={{ textAlign: "center", padding: "60px 24px" }}>
              <div style={{ width: 64, height: 64, margin: "0 auto 14px", borderRadius: 18, background: "var(--brand-50)", display: "grid", placeItems: "center" }}>
                📅
              </div>
              <span className="pill pill-warn" style={{ display: "inline-flex" }}>수업 전 / 진행 중</span>
              <h3 style={{ marginTop: 10, fontSize: 18, fontWeight: 700, color: "var(--zinc-900)" }}>
                아직 수업이 종료되지 않았어요
              </h3>
              <p style={{ marginTop: 6, fontSize: 13.5, color: "var(--zinc-500)", lineHeight: 1.7 }}>
                수업이 끝난 뒤 리포트가 이곳에 자동 생성됩니다.
              </p>
            </div>
          </div>
        )}

        {/* 기타 에러 */}
        {!reportLoading && reportError && reportError !== "LECTURE_NOT_ENDED" && (
          <div className="card card-pad-lg" style={{ color: "var(--danger)" }}>
            {reportError}
          </div>
        )}

        {/* ── 리포트 본문 ── */}
        {!reportLoading && report && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

            {/* Stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              <div className="card card-pad">
                <div style={{ fontSize: 11, color: "var(--zinc-500)", fontWeight: 600 }}>참여 학생</div>
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>
                  {report.stats.participant_count} <span style={{ fontSize: 13, color: "var(--zinc-500)", fontWeight: 500 }}>명</span>
                </div>
              </div>
              <div className="card card-pad">
                <div style={{ fontSize: 11, color: "var(--zinc-500)", fontWeight: 600 }}>출제 세트 · 문제</div>
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>
                  {report.stats.set_count} / {report.stats.quiz_count} <span style={{ fontSize: 13, color: "var(--zinc-500)", fontWeight: 500 }}>개</span>
                </div>
              </div>
              <div className="card card-pad">
                <div style={{ fontSize: 11, color: "var(--zinc-500)", fontWeight: 600 }}>평균 정답률</div>
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6, color: "var(--success-700)" }}>
                  {Math.round(report.stats.avg_correct_rate)} <span style={{ fontSize: 13, color: "var(--zinc-500)", fontWeight: 500 }}>%</span>
                </div>
              </div>
              <div className="card card-pad">
                <div style={{ fontSize: 11, color: "var(--zinc-500)", fontWeight: 600 }}>익명 질문</div>
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>
                  {report.stats.anonymous_question_count} <span style={{ fontSize: 13, color: "var(--zinc-500)", fontWeight: 500 }}>개</span>
                </div>
              </div>
            </div>

            {/* 개념별 이해도 */}
            {report.concept_stats.length > 0 && (
              <div className="card">
                <div className="card-head">
                  <div>
                    <div className="card-title">개념별 이해도</div>
                    <div className="card-sub">키워드별 평균 정답률 (낮은 순)</div>
                  </div>
                </div>
                <div className="card-pad" style={{ paddingTop: 10 }}>
                  {report.concept_stats.map((c) => {
                    const colorKey = getColorKey(c.avg_correct_rate);
                    return (
                      <div key={c.concept} className="concept-row">
                        <div className="lbl">{c.concept}</div>
                        <div className="bar">
                          <div style={{ width: `${c.avg_correct_rate}%`, background: COLOR_VAR[colorKey].bar }} />
                        </div>
                        <div className="v" style={{ color: COLOR_VAR[colorKey].text }}>{Math.round(c.avg_correct_rate)}%</div>
                      </div>
                    );
                  })}
                  {weakConcepts.length > 0 && (
                    <div style={{ marginTop: 14, padding: "12px 14px", background: "var(--warning-50)", borderRadius: 11, display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <AlertTriangle size={16} style={{ color: "var(--warning-700)", flexShrink: 0, marginTop: 1 }} />
                      <div style={{ fontSize: 12.5, color: "var(--warning-700)", lineHeight: 1.6 }}>
                        <strong>취약 개념</strong> — {weakConcepts.join(", ")}. 다음 수업에서 복습 또는 보강 자료 추천을 권장합니다.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 세트별 결과 */}
            {sets.length > 0 && activeSet && (
              <div className="card">
                <div className="card-head">
                  <div>
                    <div className="card-title">세트별 결과</div>
                    <div className="card-sub">
                      세트 #{activeSet.set_number} · {activeSet.quiz_count}문제 · p.{activeSet.page_start}~{activeSet.page_end} · 평균 정답률 {Math.round(activeSet.avg_correct_rate)}%
                    </div>
                  </div>
                  <div className="set-tabs">
                    {sets.map((set, idx) => (
                      <button
                        key={set.set_id}
                        className={`set-tab ${activeSetIdx === idx ? "active" : ""}`}
                        type="button"
                        onClick={() => setActiveSetIdx(idx)}
                      >
                        <span className="dot" style={{ background: idx === 0 ? "var(--brand)" : "var(--brand-2)" }} />
                        세트 #{set.set_number}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="card-pad">
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <span className="pill pill-brand" style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      </svg>
                      출제 범위 p.{activeSet.page_start}~{activeSet.page_end}
                    </span>
                    <span className="pill pill-neutral" style={{ fontSize: 11 }}>{activeSet.quiz_count}문제</span>
                    <span className="pill pill-success" style={{ fontSize: 11 }}>평균 정답률 {Math.round(activeSet.avg_correct_rate)}%</span>
                  </div>

                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ fontSize: 11, color: "var(--zinc-500)", textAlign: "left", borderBottom: "1px solid var(--zinc-150)" }}>
                        <th style={{ padding: "8px 0", fontWeight: 600 }}>문제</th>
                        <th style={{ padding: "8px 0", fontWeight: 600 }}>내용</th>
                        <th style={{ padding: "8px 0", fontWeight: 600, textAlign: "right" }}>정답률</th>
                        <th style={{ padding: "8px 0", fontWeight: 600, textAlign: "right" }}>오답 TOP</th>
                      </tr>
                    </thead>
                    <tbody style={{ fontSize: 13 }}>
                      {activeSet.quizzes.map((quiz, i) => {
                        const colorKey = getColorKey(quiz.correct_rate);
                        return (
                          <tr key={quiz.quiz_id} style={{ borderBottom: i < activeSet.quizzes.length - 1 ? "1px solid var(--zinc-100)" : "none" }}>
                            <td style={{ padding: "12px 0", fontWeight: 600, color: "var(--zinc-700)" }}>Q{i + 1}</td>
                            <td style={{ padding: "12px 8px 12px 0", color: "var(--zinc-800)" }}>{quiz.question}</td>
                            <td style={{ textAlign: "right", fontWeight: 700, color: COLOR_VAR[colorKey].text }}>{Math.round(quiz.correct_rate)}%</td>
                            <td style={{ textAlign: "right", paddingLeft: 8 }}>
                              {quiz.top_wrong_answer
                                ? <span className="pill pill-danger" style={{ fontSize: 11 }}>{quiz.top_wrong_answer} ({Math.round(quiz.top_wrong_rate)}%)</span>
                                : <span style={{ color: "var(--zinc-400)", fontSize: 12 }}>-</span>
                              }
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 익명 질문 */}
            <div className="card">
              <div className="card-head">
                <div>
                  <div className="card-title">익명 질문 목록</div>
                  <div className="card-sub">학생들이 수업 중에 보낸 질문입니다 · 스크롤로 확인하세요</div>
                </div>
                <span className="pill pill-neutral">{report.anonymous_questions.length}개</span>
              </div>
              <div className="qna-scroll card-pad">
                {report.anonymous_questions.length === 0 ? (
                  <div style={{ color: "var(--zinc-400)", fontSize: 13 }}>익명 질문이 없습니다.</div>
                ) : (
                  report.anonymous_questions.map((q) => (
                    <div key={q.question_id} className="qna-item">
                      <div className="meta">
                        {new Date(q.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                      <div className="body">{q.content}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        )}
      </div>
    </RoleLayout>
  );
}

export default TeacherReportPage;
