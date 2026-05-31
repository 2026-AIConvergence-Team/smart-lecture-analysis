import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Plus, Trash2, UsersRound } from "lucide-react";
import RoleLayout from "../../components/RoleLayout.jsx";
import { getCourses, createCourse, deleteCourse } from "../../api/courseApi.js";
import sungshinLogo from "../../assets/sungshin_logo.svg";

function deriveCourseStatus(course) {
  const lectures = course.lectures ?? [];
  if (lectures.some((l) => String(l.status || "").toUpperCase() === "ACTIVE")) return "live";
  if (lectures.length > 0) return "done";
  return "idle";
}

const STATUS_PILL = {
  live: (
    <span className="status-tag teacher-course-status course-status-badge status-live">
      <span className="course-status-dot" />
      <span>진행 중</span>
    </span>
  ),
  idle: (
    <span className="status-tag teacher-course-status course-status-badge status-idle">
      <span className="course-status-dot" />
      <span>대기</span>
    </span>
  ),
  done: (
    <span className="status-tag teacher-course-status course-status-badge status-done">
      <span className="course-status-dot" />
      <span>종료</span>
    </span>
  ),
};

const CTA_LABEL = {
  live: "수업 시작 →",
  idle: "수업 시작 →",
  done: "리포트 보기 →",
};

const WEEKDAYS = ["월", "화", "수", "목", "금"];
const PERIODS = Array.from({ length: 9 }, (_, index) => index + 1);

const DEFAULT_COURSE_FORM = {
  year: 2026,
  semester: "1학기",
  title: "",
  department: "",
  section: "01",
  student_count: 30,
  schedule_day: "월",
  schedule_start_period: 1,
  schedule_end_period: 2,
};

function groupBySemester(courses) {
  const map = {};
  courses.forEach((c) => {
    const key = `${c.year}년 ${c.semester}`;
    if (!map[key]) map[key] = [];
    map[key].push(c);
  });
  return map;
}

// ── 강의 추가 모달 ───────────────────────────────────────
function AddCourseModal({ open, onClose, onAdd, adding }) {
  const [form, setForm] = useState(DEFAULT_COURSE_FORM);

  const handleAdd = () => {
    if (!form.title.trim()) return;
    const { schedule_day, schedule_start_period, schedule_end_period, ...courseForm } = form;
    const startPeriod = Number(schedule_start_period);
    const endPeriod = Math.max(Number(schedule_end_period), startPeriod);
    onAdd({
      ...courseForm,
      schedule: `${schedule_day} ${startPeriod}교시~${endPeriod}교시`,
    });
    setForm(DEFAULT_COURSE_FORM);
  };

  const handleStartPeriodChange = (value) => {
    const nextStart = Number(value);
    setForm({
      ...form,
      schedule_start_period: nextStart,
      schedule_end_period: Math.max(Number(form.schedule_end_period), nextStart),
    });
  };

  return (
    <div className={`modal-backdrop${open ? " open" : ""}`} id="courseAddModal" onClick={(e) => e.target.id === "courseAddModal" && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h3>새 강의 추가</h3>
          <p>이번 학기에 담당하는 강의를 등록하세요.</p>
        </div>
        <div className="modal-body">
          <div className="form-grid-2">
            <div className="form-row">
              <label>학년도</label>
              <select className="select" value={form.year} onChange={(e) => setForm({ ...form, year: +e.target.value })}>
                <option>2026</option><option>2025</option><option>2024</option>
              </select>
            </div>
            <div className="form-row">
              <label>학기</label>
              <select className="select" value={form.semester} onChange={(e) => setForm({ ...form, semester: e.target.value })}>
                <option>1학기</option><option>2학기</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <label>강의명</label>
            <input className="input" placeholder="예: 자료구조론" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="form-row">
            <label>학과</label>
            <input className="input" placeholder="예: 컴퓨터공학과" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
          </div>
          <div className="form-grid-3">
            <div className="form-row">
              <label>요일</label>
              <select className="select" value={form.schedule_day} onChange={(e) => setForm({ ...form, schedule_day: e.target.value })}>
                {WEEKDAYS.map((day) => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label>시작 교시</label>
              <select className="select" value={form.schedule_start_period} onChange={(e) => handleStartPeriodChange(e.target.value)}>
                {PERIODS.map((period) => (
                  <option key={period} value={period}>{period}교시</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label>종료 교시</label>
              <select className="select" value={form.schedule_end_period} onChange={(e) => setForm({ ...form, schedule_end_period: Number(e.target.value) })}>
                {PERIODS.filter((period) => period >= Number(form.schedule_start_period)).map((period) => (
                  <option key={period} value={period}>{period}교시</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-grid-2">
            <div className="form-row">
              <label>분반</label>
              <input className="input" placeholder="예: 01" value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} />
            </div>
            <div className="form-row">
              <label>수강생 수</label>
              <input className="input" type="number" placeholder="30" value={form.student_count} onChange={(e) => setForm({ ...form, student_count: +e.target.value })} />
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={adding}>취소</button>
          <button className="btn btn-primary" type="button" onClick={handleAdd} disabled={adding || !form.title.trim()}>
            {adding ? "추가 중..." : "강의 추가"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 강의 삭제 확인 모달 ──────────────────────────────────
function DeleteConfirmModal({ course, onClose, onConfirm, deleting }) {
  if (!course) return null;
  return (
    <div className="modal-backdrop open" id="courseDeleteModal" onClick={(e) => e.target.id === "courseDeleteModal" && onClose()}>
      <div className="modal" style={{ maxWidth: 400 }}>
        <div className="modal-head">
          <h3>강의 삭제</h3>
          <p>이 강의를 목록에서 삭제하시겠습니까?</p>
        </div>
        <div className="modal-body">
          <div style={{ padding: "12px 14px", background: "var(--zinc-50)", border: "1px solid var(--zinc-200)", borderRadius: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--zinc-900)" }}>{course.title}</div>
            <div style={{ fontSize: 12, color: "var(--zinc-500)", marginTop: 2 }}>
              {course.department}{course.schedule ? ` · ${course.schedule}` : ""}
            </div>
          </div>
          <p style={{ marginTop: 12, fontSize: 13, color: "var(--zinc-500)" }}>
            삭제한 강의는 복구할 수 없습니다.
          </p>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={deleting}>취소</button>
          <button
            className="btn"
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            style={{ background: "#ef4444", color: "#fff", borderColor: "#ef4444" }}
          >
            {deleting ? "삭제 중..." : "삭제"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 페이지 ──────────────────────────────────────────
function TeacherCoursesPage() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadCourses = () => {
    setLoading(true);
    setError("");
    getCourses()
      .then(setCourses)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadCourses();
  }, []);

  const groups = groupBySemester(courses);

  const handleAdd = (formData) => {
    setAdding(true);
    createCourse(formData)
      .then(() => {
        setModalOpen(false);
        loadCourses();
      })
      .catch((err) => alert(err.message))
      .finally(() => setAdding(false));
  };

  const handleCardClick = (course) => {
    const status = deriveCourseStatus(course);
    navigate("/teacher/week-select", {
      state: {
        courseId:    course.id,
        courseName:  course.title,
        section:     course.section,
        students:    course.student_count,
        courseMeta:  [course.department, course.schedule].filter(Boolean).join(" · "),
        status,
        currentWeek: (course.lectures ?? []).length + 1,
      },
    });
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    setDeleting(true);
    deleteCourse(deleteTarget.id)
      .then(() => {
        setDeleteTarget(null);
        loadCourses();
      })
      .catch((err) => alert(err.message))
      .finally(() => setDeleting(false));
  };

  return (
    <RoleLayout role="teacher" title="강의 목록">
      <div className="content">
        {/* 헤더 */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24 }}>
          <div>
            <h1 className="page-title brand-title">Course Dashboard</h1>
            <p className="page-sub">담당 강의를 선택해 수업 코드를 만들고 학생을 입장시킬 수 있습니다.</p>
          </div>
          <button className="btn btn-primary" type="button" onClick={() => setModalOpen(true)}>
            <Plus size={16} /> 새 강의 추가
          </button>
        </div>

        {/* 로딩 */}
        {loading && (
          <div className="card card-pad-lg" style={{ marginTop: 28, textAlign: "center", color: "var(--zinc-500)" }}>
            강의 목록을 불러오는 중...
          </div>
        )}

        {/* 에러 */}
        {!loading && error && (
          <div className="card card-pad-lg" style={{ marginTop: 28, color: "var(--danger)" }}>
            {error}
          </div>
        )}

        {/* 강의 없음 */}
        {!loading && !error && courses.length === 0 && (
          <div className="card card-pad-lg" style={{ marginTop: 28, textAlign: "center" }}>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>등록된 강의가 없습니다</h3>
            <p style={{ marginTop: 8, color: "var(--zinc-500)", fontSize: 13 }}>오른쪽 상단 "새 강의 추가"로 강의를 등록하세요.</p>
            <button className="btn btn-primary" type="button" onClick={() => setModalOpen(true)} style={{ marginTop: 18 }}>
              <Plus size={16} /> 새 강의 추가
            </button>
          </div>
        )}

        {/* 학기별 강의 목록 */}
        {!loading && !error && courses.length > 0 && (
          <div style={{ marginTop: 28 }}>
            {Object.entries(groups).map(([label, list]) => (
              <div key={label} style={{ marginBottom: 28 }}>
                <div className="course-section-head">
                  <h2>{label}</h2>
                  <span>담당 {list.length}과목</span>
                </div>
                <div className="course-grid">
                  {list.map((course) => {
                    const status = deriveCourseStatus(course);
                    const lectureCount = (course.lectures ?? []).length;
                    return (
                      <div
                        key={course.id}
                        className={`course-card teacher-course-card ${status}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleCardClick(course)}
                        onKeyDown={(e) => e.key === "Enter" && handleCardClick(course)}
                      >
                        <button
                          className="teacher-course-delete"
                          type="button"
                          title="강의 삭제"
                          aria-label={`${course.title} 강의 삭제`}
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(course); }}
                        >
                          <Trash2 size={14} />
                        </button>

                        <div className="teacher-course-card-top">
                          <div className="teacher-course-icon">
                            <img src={sungshinLogo} alt="" aria-hidden="true" />
                          </div>
                          {STATUS_PILL[status] || STATUS_PILL.idle}
                        </div>

                        <div className="teacher-course-card-body">
                          <div className="title">{course.title}</div>
                          <div className="term">
                            {[course.department, course.schedule].filter(Boolean).join(" · ") || "강의 정보 없음"}
                          </div>
                        </div>

                        <div className="meta teacher-course-card-meta">
                          <div className="teacher-course-card-stats">
                            <span>
                              <UsersRound size={14} />
                              수강생 {course.student_count ?? 0}명
                            </span>
                            <span>
                              <BookOpen size={14} />
                              {lectureCount}개 수업
                            </span>
                          </div>
                          <div className="teacher-course-card-actions">
                            <strong>{CTA_LABEL[status] || CTA_LABEL.idle}</strong>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AddCourseModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdd={handleAdd}
        adding={adding}
      />
      <DeleteConfirmModal
        course={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        deleting={deleting}
      />
    </RoleLayout>
  );
}

export default TeacherCoursesPage;
