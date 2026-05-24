import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ChevronLeft, Play } from "lucide-react";
import RoleLayout from "../../components/RoleLayout.jsx";
import { getCourseLectures } from "../../api/courseApi.js";

// 주차 번호 → 뱃지 상태: 실제 수업 데이터 기반
// lectureMap: { [weekNum]: lecture }
function weekStatus(w, lectureMap) {
  const lecture = lectureMap[w];
  if (!lecture) return "idle";
  if (lecture.status === "active") return "next";   // 진행 중
  return "done";                                     // 완료된 수업
}

const STATUS_PILL = {
  done: <span className="pill pill-neutral">완료</span>,
  next: <span className="pill pill-brand">진행 중</span>,
  idle: null,
};

function TeacherWeekSelectPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    courseId    = null,
    courseName  = "자료구조론",
    section     = "01",
    students    = 32,
    courseMeta  = "컴퓨터공학과 · 월/수 10:30",
    currentWeek = 5,   // API 연동 전 fallback
  } = location.state || {};

  const [selectedWeek, setSelectedWeek] = useState(null);
  // weekNum → lecture 매핑 (API로 로드)
  const [lectureMap, setLectureMap] = useState(null);   // null = 로딩 중

  useEffect(() => {
    if (!courseId) {
      // courseId 없으면 fallback: currentWeek 기준으로 채우기
      const fallback = {};
      for (let i = 1; i < currentWeek; i++) fallback[i] = { status: "ended" };
      if (currentWeek <= 15) fallback[currentWeek] = { status: "active" };
      setLectureMap(fallback);
      return;
    }
    getCourseLectures(courseId)
      .then((lectures) => {
        const map = {};
        if (Array.isArray(lectures)) {
          lectures.forEach((l) => {
            const m = l.title?.match(/(\d+)주차/);
            if (m) map[+m[1]] = l;
          });
        }
        setLectureMap(map);
      })
      .catch(() => {
        // 실패 시 fallback
        const fallback = {};
        for (let i = 1; i < currentWeek; i++) fallback[i] = { status: "ended" };
        setLectureMap(fallback);
      });
  }, [courseId]);

  const handleStart = () => {
    if (!selectedWeek) return;
    navigate("/teacher/setup", {
      state: {
        courseId,
        courseName,
        week: selectedWeek,
        courseMeta,
      },
    });
  };

  return (
    <RoleLayout role="teacher">
      <section className="content">
        {/* 헤더 */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24 }}>
          <div>
            <p className="eyebrow">Week Selection</p>
            <h1 className="page-title">{courseName} · 주차 선택</h1>
            <p className="page-sub">수업을 진행할 주차를 선택한 뒤 강의 설정을 시작하세요.</p>
          </div>
          <button className="btn btn-ghost" type="button" onClick={() => navigate("/teacher/courses")}>
            <ChevronLeft size={14} />
            강의 목록
          </button>
        </div>

        {/* 과목 메타 요약 */}
        <div style={{
          marginTop: 20,
          padding: "14px 18px",
          background: "var(--zinc-50)",
          borderRadius: 12,
          border: "1px solid var(--zinc-200)",
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: "var(--brand-softer)",
            color: "var(--brand)",
            display: "grid", placeItems: "center",
            fontSize: 13, fontWeight: 700,
          }}>
            {courseName.slice(0, 2)}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--zinc-900)" }}>
              {courseName}
              <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 500, color: "var(--zinc-500)" }}>
                {section}분반
              </span>
            </div>
            <div style={{ fontSize: 12, color: "var(--zinc-500)", marginTop: 2 }}>
              {courseMeta} · 수강생 {students}명
            </div>
          </div>
        </div>

        {/* 주차 그리드 */}
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--zinc-700)", marginBottom: 12 }}>
            전체 15주차
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 10,
          }}>
            {Array.from({ length: 15 }, (_, i) => i + 1).map((w) => {
              const st = lectureMap ? weekStatus(w, lectureMap) : "idle";
              const isSelected = selectedWeek === w;
              return (
                <button
                  key={w}
                  type="button"
                  onClick={() => setSelectedWeek(w)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "14px 16px",
                    borderRadius: 12,
                    border: isSelected
                      ? "2px solid var(--brand)"
                      : "1.5px solid var(--zinc-200)",
                    background: isSelected ? "var(--brand-softer)" : "#fff",
                    cursor: "pointer",
                    transition: "var(--t)",
                    textAlign: "left",
                  }}
                >
                  <div style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: isSelected ? "var(--brand-deep)" : "var(--zinc-900)",
                    lineHeight: 1,
                  }}>
                    {w}주차
                  </div>
                  <div style={{ minHeight: 22 }}>
                    {STATUS_PILL[st]}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 하단 액션 */}
        <div style={{
          marginTop: 24,
          padding: "16px 20px",
          background: "#fff",
          border: "1px solid var(--zinc-200)",
          borderRadius: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}>
          <div style={{ fontSize: 13, color: "var(--zinc-600)" }}>
            {selectedWeek
              ? <><span style={{ fontWeight: 700, color: "var(--zinc-900)" }}>{selectedWeek}주차</span>를 선택했습니다. 강의 설정 페이지로 이동합니다.</>
              : "주차를 선택해 주세요."}
          </div>
          <button
            className="btn btn-primary btn-lg"
            type="button"
            disabled={!selectedWeek}
            onClick={handleStart}
          >
            <Play size={16} />
            강의 설정 시작
          </button>
        </div>
      </section>
    </RoleLayout>
  );
}

export default TeacherWeekSelectPage;
