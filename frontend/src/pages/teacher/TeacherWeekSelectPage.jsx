import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  Clock,
  FileText,
  ListChecks,
  Play,
  Plus,
  Radio,
  Search,
  Users,
} from "lucide-react";
import RoleLayout from "../../components/RoleLayout.jsx";
import { getCourseLectures } from "../../api/courseApi.js";

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

function hasUploadedPdf(lecture) {
  return Boolean(lecture?.file_name || lecture?.pdf_url || Number(lecture?.total_pages) > 0);
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

const STATUS_VIEW = {
  active: {
    label: "진행 중",
    pill: "pill-success",
    icon: Radio,
    action: "강의실 열기",
  },
  ended: {
    label: "종료",
    pill: "pill-neutral",
    icon: CheckCircle2,
    action: "리포트 보기",
  },
  ready: {
    label: "준비됨",
    pill: "pill-brand",
    icon: FileText,
    action: "강의 열기",
  },
};

function NewLectureModal({ open, value, onChange, onClose, onSubmit }) {
  return (
    <div
      className={`modal-backdrop${open ? " open" : ""}`}
      id="newLectureModal"
      onClick={(event) => event.target.id === "newLectureModal" && onClose()}
    >
      <div className="modal">
        <div className="modal-head">
          <h3>새 강의 만들기</h3>
          <p>강의 제목만 입력하면 날짜와 시간은 자동으로 채워집니다.</p>
        </div>
        <div className="modal-body">
          <div className="form-row" style={{ marginTop: 0 }}>
            <label htmlFor="newLectureTitle">강의 제목</label>
            <input
              id="newLectureTitle"
              className="input"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onSubmit();
              }}
              placeholder="예: 7주차 학습하는 뇌"
              autoFocus
            />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            취소
          </button>
          <button className="btn btn-primary" type="button" onClick={onSubmit} disabled={!value.trim()}>
            <Plus size={16} />
            만들기
          </button>
        </div>
      </div>
    </div>
  );
}

function TeacherWeekSelectPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    courseId = null,
    courseName = "강의",
    section = "01",
    students = 0,
    courseMeta = "",
    currentWeek = 1,
  } = location.state || {};

  const [lectures, setLectures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [newLectureTitle, setNewLectureTitle] = useState("");

  useEffect(() => {
    if (!courseId) {
      setLectures([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    getCourseLectures(courseId)
      .then((data) => setLectures(Array.isArray(data) ? sortLectures(data) : []))
      .catch((err) => setError(err.message || "강의 목록을 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [courseId]);

  const filteredLectures = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return lectures;
    return lectures.filter((lecture) => {
      const haystack = [
        lecture.title,
        lecture.date,
        lecture.time,
        lecture.class_code,
        lecture.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [lectures, query]);

  const stats = useMemo(() => {
    const active = lectures.filter((lecture) => getStatusKey(lecture.status) === "active").length;
    const ended = lectures.filter((lecture) => getStatusKey(lecture.status) === "ended").length;
    return {
      total: lectures.length,
      active,
      ended,
      ready: Math.max(lectures.length - active - ended, 0),
    };
  }, [lectures]);

  const nextLectureNumber = Math.max(currentWeek, lectures.length + 1);

  const openCreateModal = () => {
    setNewLectureTitle("");
    setModalOpen(true);
  };

  const closeCreateModal = () => {
    setModalOpen(false);
    setNewLectureTitle("");
  };

  const handleCreateLecture = () => {
    const lectureTitle = newLectureTitle.trim();
    if (!lectureTitle) return;

    navigate("/teacher/setup", {
      state: {
        courseId,
        courseName,
        week: nextLectureNumber,
        courseMeta,
        lectureTitle,
      },
    });
  };

  const handleOpenLecture = (lecture, index) => {
    const lectureId = getLectureId(lecture);
    const status = getStatusKey(lecture.status);
    const weekNumber = getLectureNumber(lecture, index);

    if (status === "ended") {
      navigate("/teacher/report", { state: { lectureId } });
      return;
    }

    if (!hasUploadedPdf(lecture)) {
      navigate("/teacher/setup", {
        state: {
          courseId,
          courseName,
          week: weekNumber,
          courseMeta,
          lectureId,
          lectureTitle: lecture.title,
          classCode: lecture.class_code || "",
        },
      });
      return;
    }

    navigate("/teacher/live", {
      state: {
        code: lecture.class_code || "------",
        courseId,
        courseName,
        section,
        students,
        courseMeta,
        week: weekNumber,
        lectureId,
        pdfFileName: lecture.file_name || null,
        pdfTotal: lecture.total_pages || 0,
      },
    });
  };

  return (
    <RoleLayout role="teacher">
      <section className="content lecture-list-page">
        <div className="lecture-list-header">
          <div>
            <p className="eyebrow">Lecture Library</p>
            <h1 className="page-title">{courseName} 강의 목록</h1>
            <p className="page-sub">
              과목에 등록된 강의를 한 곳에서 확인하고, 진행 중인 강의나 리포트로 바로 이동할 수 있습니다.
            </p>
          </div>
          <div className="lecture-list-header-actions">
            <button className="btn btn-ghost" type="button" onClick={() => navigate("/teacher/courses")}>
              <ChevronLeft size={14} />
              과목 목록
            </button>
            <button className="btn btn-primary" type="button" onClick={openCreateModal} disabled={!courseId}>
              <Plus size={16} />
              새 강의
            </button>
          </div>
        </div>

        <div className="lecture-course-band">
          <div className="lecture-course-mark">{courseName.slice(0, 2)}</div>
          <div className="lecture-course-info">
            <strong>{courseName}</strong>
            <span>{[courseMeta, `${section}분반`].filter(Boolean).join(" · ")}</span>
          </div>
          <div className="lecture-course-stats">
            <span>
              <Users size={14} />
              {students}명
            </span>
            <span>
              <ListChecks size={14} />
              {stats.total}개 강의
            </span>
          </div>
        </div>

        <div className="lecture-toolbar">
          <div className="lecture-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="강의명, 날짜, 코드 검색"
            />
          </div>
          <div className="lecture-stat-row">
            <span className="lecture-stat active">{stats.active} 진행</span>
            <span className="lecture-stat ready">{stats.ready} 준비</span>
            <span className="lecture-stat ended">{stats.ended} 종료</span>
          </div>
        </div>

        {loading && (
          <div className="lecture-state-card">
            <div className="loader" />
            <strong>강의 목록을 불러오는 중입니다</strong>
            <span>잠시만 기다려 주세요.</span>
          </div>
        )}

        {!loading && error && (
          <div className="lecture-state-card danger">
            <strong>목록을 불러오지 못했습니다</strong>
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && filteredLectures.length === 0 && (
          <div className="lecture-empty">
            <div className="lecture-empty-icon">
              <FileText size={24} />
            </div>
            <strong>{lectures.length === 0 ? "아직 등록된 강의가 없습니다" : "검색 결과가 없습니다"}</strong>
            <span>
              {lectures.length === 0
                ? "새 강의를 만들어 자료 업로드와 수업 코드를 준비해 보세요."
                : "다른 키워드로 다시 검색해 보세요."}
            </span>
            {lectures.length === 0 && (
              <button className="btn btn-primary" type="button" onClick={openCreateModal} disabled={!courseId}>
                <Plus size={16} />
                첫 강의 만들기
              </button>
            )}
          </div>
        )}

        {!loading && !error && filteredLectures.length > 0 && (
          <div className="lecture-list-grid">
            {filteredLectures.map((lecture, index) => {
              const status = getStatusKey(lecture.status);
              const view = STATUS_VIEW[status];
              const StatusIcon = view.icon;
              const lectureNo = getLectureNumber(lecture, index);

              return (
                <article className={`lecture-card ${status}`} key={getLectureId(lecture) || `${lecture.title}-${index}`}>
                  <div className="lecture-card-top">
                    <div className="lecture-number">{lectureNo}</div>
                    <span className={`pill ${view.pill}`}>
                      <StatusIcon size={13} />
                      {view.label}
                    </span>
                  </div>
                  <div className="lecture-card-body">
                    <h2>{lecture.title || `${lectureNo}번째 강의`}</h2>
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
                      코드 <strong>{lecture.class_code || "미발급"}</strong>
                    </span>
                    <button className="btn btn-soft btn-sm" type="button" onClick={() => handleOpenLecture(lecture, index)}>
                      <Play size={13} />
                      {view.action}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <NewLectureModal
        open={modalOpen}
        value={newLectureTitle}
        onChange={setNewLectureTitle}
        onClose={closeCreateModal}
        onSubmit={handleCreateLecture}
      />
    </RoleLayout>
  );
}

export default TeacherWeekSelectPage;
