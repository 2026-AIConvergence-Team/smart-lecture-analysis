import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import RoleLayout from "../../components/RoleLayout.jsx";
import { listCourses } from "../../api/courseApi.js";
import { joinLectureByCode } from "../../api/lectureApi.js";

function getLectureId(lecture) {
  return lecture?.lecture_id ?? lecture?.id;
}

function getCourseTerm(course) {
  return `${course.year}년 ${course.semester}`;
}

function getCourseMeta(course) {
  return [course.department, course.schedule].filter(Boolean).join(" · ");
}

function getCourseStatus(course) {
  const lectures = course.lectures ?? [];
  if (lectures.some((lecture) => lecture.status === "ACTIVE")) return "live";
  if (lectures.length > 0) return "done";
  return "idle";
}

function groupByTerm(courses) {
  return courses.reduce((groups, course) => {
    const key = getCourseTerm(course);
    if (!groups[key]) groups[key] = [];
    groups[key].push(course);
    return groups;
  }, {});
}

function StatusPill({ status }) {
  if (status === "live") {
    return (
      <span className="status-tag pill pill-success">
        <span className="dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />
        진행 중
      </span>
    );
  }

  if (status === "done") {
    return <span className="status-tag pill pill-neutral">참여 완료</span>;
  }

  return <span className="status-tag pill pill-neutral">대기</span>;
}

function CodeJoinModal({ open, onClose, onJoin, joining, error }) {
  const [code, setCode] = useState("");

  useEffect(() => {
    if (!open) setCode("");
  }, [open]);

  if (!open) return null;

  const normalizedCode = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

  return (
    <div className="modal-backdrop open" id="codeJoinModal" onClick={(event) => event.target.id === "codeJoinModal" && onClose()}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-head" style={{ textAlign: "center" }}>
          <h3>수업 코드로 참여</h3>
          <p>교수가 공유한 6자리 수업 코드를 입력하세요.</p>
        </div>

        <div className="modal-body">
          <input
            className="input"
            value={normalizedCode}
            autoFocus
            maxLength={6}
            placeholder="ABC123"
            onChange={(event) => setCode(event.target.value)}
            style={{
              height: 52,
              textAlign: "center",
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: 0,
              fontFamily: "JetBrains Mono, monospace",
            }}
          />
          <p style={{ marginTop: 12, minHeight: 18, color: "var(--danger)", fontSize: 13, textAlign: "center" }}>
            {error}
          </p>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={joining}>
            취소
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={joining || normalizedCode.length < 6}
            onClick={() => onJoin(normalizedCode)}
          >
            {joining ? "참여 중..." : "참여하기"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StudentCoursesPage() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);

  const groupedCourses = useMemo(() => groupByTerm(courses), [courses]);

  const loadCourses = async () => {
    setLoading(true);
    setError("");
    try {
      setCourses(await listCourses());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCourses();
  }, []);

  const handleJoin = async (classCode) => {
    setJoining(true);
    setJoinError("");
    try {
      const joined = await joinLectureByCode(classCode);
      setJoinOpen(false);
      await loadCourses();
      navigate("/student/live", {
        state: {
          courseId: joined.course_id,
          lectureId: joined.lecture_id,
        },
      });
    } catch (err) {
      setJoinError(err.message);
    } finally {
      setJoining(false);
    }
  };

  const handleCourseClick = (course) => {
    const lectures = course.lectures ?? [];
    const activeLecture = lectures.find((lecture) => lecture.status === "ACTIVE") ?? lectures[lectures.length - 1];

    if (!activeLecture) return;

    navigate("/student/live", {
      state: {
        courseId: course.id,
        lectureId: getLectureId(activeLecture),
      },
    });
  };

  const renderCourse = (course) => {
    const status = getCourseStatus(course);
    const lectures = course.lectures ?? [];
    const latestLecture = lectures[lectures.length - 1];
    const cta = status === "live" ? "입장하기" : "복습하기";

    return (
      <button key={course.id} className="course-card" type="button" onClick={() => handleCourseClick(course)}>
        <div>
          <div className="title">{course.title}</div>
          <div className="term">{getCourseMeta(course)}</div>
        </div>
        <StatusPill status={status} />
        <div className="meta">
          <span className="key">
            {course.section}분반 · {lectures.length}개 수업
            {latestLecture ? ` · ${latestLecture.title}` : ""}
          </span>
          <span style={{ color: "var(--brand-deep)", fontWeight: 600 }}>{cta}</span>
        </div>
      </button>
    );
  };

  return (
    <RoleLayout role="student" title="수업 목록">
      <div className="content">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24 }}>
          <div>
            <p className="eyebrow">My Classes</p>
            <h1 className="page-title">내 수업</h1>
            <p className="page-sub">처음 참여하는 수업은 교수님이 공유한 수업 코드로 입장하세요.</p>
          </div>
          <button className="btn btn-primary" type="button" onClick={() => setJoinOpen(true)}>
            코드로 참여
          </button>
        </div>

        {error && (
          <div className="card" style={{ marginTop: 24 }}>
            <div className="card-pad-lg" style={{ color: "var(--danger)" }}>{error}</div>
          </div>
        )}

        {loading ? (
          <div className="card" style={{ marginTop: 24 }}>
            <div className="card-pad-lg">수업 목록을 불러오는 중...</div>
          </div>
        ) : courses.length === 0 ? (
          <div className="card" style={{ marginTop: 24 }}>
            <div className="card-pad-lg" style={{ textAlign: "center" }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>아직 참여한 수업이 없습니다</h3>
              <p style={{ marginTop: 8, color: "var(--zinc-500)", fontSize: 13 }}>수업 코드를 입력하면 이 목록에 course가 추가됩니다.</p>
              <button className="btn btn-primary" type="button" onClick={() => setJoinOpen(true)} style={{ marginTop: 18 }}>
                코드로 참여
              </button>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 28 }}>
            {Object.entries(groupedCourses).map(([term, termCourses]) => (
              <div key={term} style={{ marginBottom: 28 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
                  <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--zinc-900)" }}>{term}</h2>
                  <span style={{ fontSize: 12, color: "var(--zinc-500)" }}>참여 {termCourses.length}과목</span>
                </div>
                <div className="course-grid">{termCourses.map(renderCourse)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CodeJoinModal
        open={joinOpen}
        joining={joining}
        error={joinError}
        onClose={() => {
          setJoinOpen(false);
          setJoinError("");
        }}
        onJoin={handleJoin}
      />
    </RoleLayout>
  );
}

export default StudentCoursesPage;
