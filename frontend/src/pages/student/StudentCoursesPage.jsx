import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  Clock,
  FileText,
  GraduationCap,
  KeyRound,
  Layers3,
  LogIn,
  Play,
  Radio,
  X,
} from "lucide-react";
import RoleLayout from "../../components/RoleLayout.jsx";
import { getCourseLectures, getCourses } from "../../api/courseApi.js";
import { joinLectureByCode } from "../../api/lectureApi.js";
import studentIcon from "../../assets/ph--student.svg";
import sungshinLogo from "../../assets/sungshin_logo.svg";

const STATUS_VIEW = {
  active: {
    label: "수업 중",
    pill: "pill-success",
    icon: Radio,
    action: "입장",
  },
  ended: {
    label: "종료",
    pill: "pill-neutral",
    icon: FileText,
    action: "복습",
  },
  ready: {
    label: "대기",
    pill: "pill-warn",
    icon: Clock,
    action: "보기",
  },
};

function getLectureId(lecture) {
  return lecture?.lecture_id ?? lecture?.id ?? null;
}

function getStatusKey(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "active") return "active";
  if (["ended", "closed", "done"].includes(normalized)) return "ended";
  return "ready";
}

function getLectureNumber(lecture, index) {
  const match = lecture?.title?.match(/(\d+)\s*주차/);
  return match ? Number(match[1]) : index + 1;
}

function formatDate(date) {
  if (!date) return "날짜 미정";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(date));
}

function formatTime(time) {
  if (!time) return "시간 미정";
  return String(time).slice(0, 5);
}

function sortLectures(lectures) {
  return [...lectures].sort((a, b) => {
    const left = `${a.date || ""} ${a.time || ""}`;
    const right = `${b.date || ""} ${b.time || ""}`;
    return right.localeCompare(left);
  });
}

function getCourseMeta(course) {
  return [course.department, course.schedule].filter(Boolean).join(" · ");
}

function getCourseTerm(course) {
  return `${course.year || ""}년 ${course.semester || ""}`.trim();
}

function getCourseLectureSummary(lectures) {
  const activeCount = lectures.filter((lecture) => getStatusKey(lecture.status) === "active").length;
  const endedCount = lectures.filter((lecture) => getStatusKey(lecture.status) === "ended").length;
  return { total: lectures.length, activeCount, endedCount };
}

function CodeJoinModal({ open, onClose, onJoin, externalError }) {
  const [code, setCode] = useState(["", "", "", "", "", ""]);

  useEffect(() => {
    if (!open) setCode(["", "", "", "", "", ""]);
  }, [open]);

  const handleInput = (i, val) => {
    const upper = val.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const next = [...code];
    if (upper) {
      next[i] = upper[0];
      setCode(next);
      const nextEl = document.getElementById(`codeInput${i + 1}`);
      if (nextEl) nextEl.focus();
    } else {
      next[i] = "";
      setCode(next);
    }
  };

  const handleKeyDown = (i, e) => {
    if (e.key !== "Backspace") return;
    const next = [...code];
    if (next[i]) {
      next[i] = "";
      setCode(next);
      return;
    }
    const prev = document.getElementById(`codeInput${i - 1}`);
    if (prev) prev.focus();
  };

  const fullCode = code.join("");

  return (
    <div
      className={`modal-backdrop${open ? " open" : ""}`}
      id="codeJoinModal"
      onClick={(e) => e.target.id === "codeJoinModal" && onClose()}
    >
      <div className="modal" style={{ position: "relative", maxWidth: 480 }}>
        <button
          className="modal-close"
          type="button"
          onClick={onClose}
          aria-label="닫기"
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--zinc-400)",
            padding: 4,
            borderRadius: 6,
            display: "grid",
            placeItems: "center",
          }}
        >
          <X size={16} />
        </button>

        <div className="modal-head" style={{ textAlign: "center", paddingBottom: 6 }}>
          <div
            style={{
              width: 54,
              height: 54,
              margin: "0 auto 12px",
              borderRadius: 14,
              background: "var(--brand-soft)",
              display: "grid",
              placeItems: "center",
            }}
          >
            <KeyRound size={24} color="var(--brand)" />
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--zinc-900)", margin: 0 }}>
            수업 코드 입력
          </h3>
          <p style={{ marginTop: 6, fontSize: 13, color: "var(--zinc-500)" }}>
            교수님이 공유한 6자리 코드를 입력하세요.
          </p>
        </div>

        <div className="modal-body">
          <div className="code-entry" id="cjCodeEntry">
            {code.map((v, i) => (
              <input
                key={i}
                id={`codeInput${i}`}
                type="text"
                maxLength={1}
                value={v}
                autoFocus={i === 0 && open}
                onChange={(e) => handleInput(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
              />
            ))}
          </div>
          <p
            style={{
              marginTop: 14,
              fontSize: 12,
              color: "var(--danger)",
              textAlign: "center",
              minHeight: 14,
            }}
          >
            {externalError}
          </p>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            취소
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={fullCode.length < 6}
            onClick={() => onJoin(fullCode)}
          >
            <LogIn size={14} />
            입장하기
          </button>
        </div>
      </div>
    </div>
  );
}

function StudentCoursesPage() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [lecturesByCourse, setLecturesByCourse] = useState({});
  const [activeCourseId, setActiveCourseId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lecturesLoading, setLecturesLoading] = useState(false);
  const [error, setError] = useState("");
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinError, setJoinError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");

    getCourses()
      .then((list) => {
        const nextCourses = Array.isArray(list) ? list : [];
        const embeddedLectures = {};

        nextCourses.forEach((course) => {
          if (Array.isArray(course.lectures)) {
            embeddedLectures[course.id] = sortLectures(course.lectures);
          }
        });

        setCourses(nextCourses);
        setLecturesByCourse(embeddedLectures);
      })
      .catch((err) => setError(err.message || "수강 중인 과목을 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, []);

  const groupedCourses = useMemo(() => {
    return courses.reduce((groups, course) => {
      const key = getCourseTerm(course) || "학기 미정";
      if (!groups[key]) groups[key] = [];
      groups[key].push(course);
      return groups;
    }, {});
  }, [courses]);

  const activeCourse = courses.find((course) => Number(course.id) === Number(activeCourseId)) || null;
  const activeLectures = activeCourse ? lecturesByCourse[activeCourse.id] || [] : [];

  const loadCourseLectures = async (courseId) => {
    if (lecturesByCourse[courseId]) return lecturesByCourse[courseId];

    setLecturesLoading(true);
    try {
      const lectures = await getCourseLectures(courseId);
      const sorted = sortLectures(Array.isArray(lectures) ? lectures : []);
      setLecturesByCourse((prev) => ({ ...prev, [courseId]: sorted }));
      return sorted;
    } finally {
      setLecturesLoading(false);
    }
  };

  const handleCourseClick = async (course) => {
    setActiveCourseId(course.id);
    setError("");
    try {
      await loadCourseLectures(course.id);
    } catch (err) {
      setError(err.message || "수업 목록을 불러오지 못했습니다.");
    }
  };

  const handleLectureClick = (lecture) => {
    const lectureId = getLectureId(lecture);
    if (!lectureId) return;

    const status = getStatusKey(lecture.status);
    if (status === "ended") {
      navigate("/student/review", { state: { lectureId } });
      return;
    }

    navigate("/student/live", { state: { lectureId } });
  };

  const handleJoin = (code) => {
    setJoinError("");
    joinLectureByCode(code)
      .then((res) => {
        setJoinOpen(false);
        setJoinError("");
        navigate("/student/live", { state: { lectureId: res?.lecture_id } });
      })
      .catch((err) => {
        setJoinError(err.message || "수업 코드가 올바르지 않습니다.");
      });
  };

  const renderCourseCard = (course) => {
    const lectures = lecturesByCourse[course.id] || course.lectures || [];
    const summary = getCourseLectureSummary(lectures);
    const actionLabel = summary.activeCount > 0 ? "진행 중" : summary.endedCount === summary.total && summary.total > 0 ? "복습" : "열어보기";

    return (
      <button key={course.id} className="course-card student-course-card" type="button" onClick={() => handleCourseClick(course)}>
        <div className="student-course-card-top">
          <div className="student-course-icon" aria-hidden="true">
            <img className="student-profile-icon" src={studentIcon} alt="" />
          </div>
          <span className="student-course-status pill pill-success">
            <BookOpen size={13} />
            수강 중
          </span>
        </div>

        <div className="student-course-card-body">
          <div className="title">{course.title}</div>
          <div className="term">{getCourseMeta(course) || "과목 정보 없음"}</div>
        </div>

        <div className="meta student-course-card-meta">
          <span>
            <GraduationCap size={14} />
            {course.section}분반
          </span>
          <span>
            <Layers3 size={14} />
            {summary.total}개 수업
          </span>
          <strong>{actionLabel}</strong>
        </div>
      </button>
    );
  };

  const renderLectureCard = (lecture, index) => {
    const status = getStatusKey(lecture.status);
    const view = STATUS_VIEW[status];
    const StatusIcon = view.icon;
    const lectureNo = getLectureNumber(lecture, index);

    return (
      <article className={`lecture-card student-lecture-card ${status}`} key={getLectureId(lecture) || `${lecture.title}-${index}`}>
        <div className="lecture-card-top">
          <div className="lecture-number">
            <img className="student-profile-icon" src={studentIcon} alt="" aria-hidden="true" />
          </div>
          <span className={`pill ${view.pill}`}>
            <StatusIcon size={13} />
            {view.label}
          </span>
        </div>
        <div className="lecture-card-body">
          <p className="lecture-card-label">수업 {lectureNo}</p>
          <h2>{lecture.title || `${lectureNo}번째 수업`}</h2>
          <div className="lecture-meta-list">
            <span>
              <CalendarDays size={14} />
              {formatDate(lecture.date)}
            </span>
            <span>
              <Clock size={14} />
              {formatTime(lecture.time)}
            </span>
          </div>
        </div>
        <div className="lecture-card-footer">
          <span className="lecture-code">
            코드 <strong>{lecture.class_code || "비공개"}</strong>
          </span>
          <button className="btn btn-soft btn-sm" type="button" onClick={() => handleLectureClick(lecture)}>
            <Play size={13} />
            {view.action}
          </button>
        </div>
      </article>
    );
  };

  return (
    <RoleLayout role="student" title="수업 목록">
      <section className="content lecture-list-page">
        <div className="lecture-list-header">
          <div>
            <h1 className="page-title brand-title">{activeCourse ? "My Lectures" : "My Courses"}</h1>
            <p className="page-sub">
              {activeCourse
                ? "참여한 수업을 열고 진행 중인 퀴즈와 복습 자료를 확인하세요."
                : "내가 입장한 수업이 있는 과목만 표시됩니다."}
            </p>
          </div>
          <div className="lecture-list-header-actions">
            {activeCourse && (
              <button className="btn btn-ghost" type="button" onClick={() => setActiveCourseId(null)}>
                <ChevronLeft size={14} />
                과목 목록
              </button>
            )}
            <button className="btn btn-primary" type="button" onClick={() => setJoinOpen(true)}>
              <KeyRound size={15} />
              수업 코드
            </button>
          </div>
        </div>

        {loading && (
          <div className="lecture-state-card">
            <div className="loader" />
            <strong>과목 목록을 불러오는 중입니다</strong>
            <span>잠시만 기다려 주세요.</span>
          </div>
        )}

        {!loading && error && (
          <div className="lecture-state-card danger">
            <strong>목록을 불러오지 못했습니다</strong>
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && !activeCourse && courses.length === 0 && (
          <div className="lecture-empty">
            <div className="lecture-empty-icon">
              <BookOpen size={24} />
            </div>
            <strong>수강 중인 과목이 없습니다</strong>
            <span>공유받은 수업 코드를 입력하면 해당 과목과 수업이 여기에 표시됩니다.</span>
            <button className="btn btn-primary" type="button" onClick={() => setJoinOpen(true)}>
              <KeyRound size={15} />
              수업 코드 입력
            </button>
          </div>
        )}

        {!loading && !error && !activeCourse && courses.length > 0 && (
          <div style={{ display: "grid", gap: 28 }}>
            {Object.entries(groupedCourses).map(([termLabel, termCourses]) => (
              <div key={termLabel}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
                  <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--zinc-900)" }}>{termLabel}</h2>
                  <span style={{ fontSize: 12, color: "var(--zinc-500)" }}>수강 {termCourses.length}과목</span>
                </div>
                <div className="course-grid">{termCourses.map(renderCourseCard)}</div>
              </div>
            ))}
          </div>
        )}

        {!loading && !error && activeCourse && (
          <>
            <div className="lecture-course-band">
              <div className="lecture-course-mark" aria-hidden="true">
                <img src={sungshinLogo} alt="" />
              </div>
              <div className="lecture-course-info">
                <strong>{activeCourse.title}</strong>
                <span>
                  {[getCourseMeta(activeCourse), `${activeCourse.section}분반`, getCourseTerm(activeCourse)]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <div className="lecture-course-stats">
                <span>
                  <BookOpen size={14} />
                  {activeLectures.length}개 수업
                </span>
              </div>
            </div>

            {lecturesLoading && (
              <div className="lecture-state-card">
                <div className="loader" />
                <strong>수업 목록을 불러오는 중입니다</strong>
                <span>잠시만 기다려 주세요.</span>
              </div>
            )}

            {!lecturesLoading && activeLectures.length === 0 && (
              <div className="lecture-empty">
                <div className="lecture-empty-icon">
                  <FileText size={24} />
                </div>
                <strong>참여한 수업이 없습니다</strong>
                <span>새 수업 코드를 입력하면 이 과목 아래에 수업이 추가됩니다.</span>
              </div>
            )}

            {!lecturesLoading && activeLectures.length > 0 && (
              <div className="lecture-list-grid">{activeLectures.map(renderLectureCard)}</div>
            )}
          </>
        )}
      </section>

      <CodeJoinModal
        open={joinOpen}
        onClose={() => {
          setJoinOpen(false);
          setJoinError("");
        }}
        onJoin={handleJoin}
        externalError={joinError}
      />
    </RoleLayout>
  );
}

export default StudentCoursesPage;
