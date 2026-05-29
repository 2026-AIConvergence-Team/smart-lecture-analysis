import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import RoleLayout from "../../components/RoleLayout.jsx";
import { getCourses, createCourse, deleteCourse } from "../../api/courseApi.js";

function deriveCourseStatus(course) {
  const lectures = course.lectures ?? [];
  if (lectures.some((l) => l.status === "ACTIVE")) return "live";
  if (lectures.length > 0) return "done";
  return "idle";
}

const STATUS_PILL = {
  live: <span className="status-tag pill pill-success"><span className="dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />진행 중</span>,
  idle: <span className="status-tag pill pill-neutral">대기</span>,
  done: <span className="status-tag pill pill-neutral">종료</span>,
};

const CTA_LABEL = {
  live: "수업 시작 →",
  idle: "수업 시작 →",
  done: "리포트 보기 →",
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
  const [form, setForm] = useState({
    year: 2026,
    semester: "1학기",
    title: "",
    department: "",
    section: "01",
    student_count: 30,
    schedule: "",
  });

  const handleAdd = () => {
    if (!form.title.trim()) return;
    onAdd(form);
    setForm({ year: 2026, semester: "1학기", title: "", department: "", section: "01", student_count: 30, schedule: "" });
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
          <div className="form-row">
            <label>수업 시간</label>
            <input className="input" placeholder="예: 월/수 10:30" value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} />
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
            <p className="eyebrow">Course Dashboard</p>
            <h1 className="page-title">내 강의</h1>
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
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
                  <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--zinc-900)" }}>{label}</h2>
                  <span style={{ fontSize: 12, color: "var(--zinc-500)" }}>담당 {list.length}과목</span>
                </div>
                <div className="course-grid">
                  {list.map((course) => {
                    const status = deriveCourseStatus(course);
                    const lectureCount = (course.lectures ?? []).length;
                    return (
                      <div
                        key={course.id}
                        className="course-card"
                        role="button"
                        tabIndex={0}
                        onClick={() => handleCardClick(course)}
                        onKeyDown={(e) => e.key === "Enter" && handleCardClick(course)}
                        style={{ cursor: "pointer", position: "relative" }}
                      >
                        <div>
                          <div className="title">{course.title}</div>
                          <div className="term">
                            {[course.department, course.schedule].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                        {STATUS_PILL[status] || STATUS_PILL.idle}
                        <div className="meta">
                          <span className="key">
                            수강생 {course.student_count}명 · {lectureCount}개 수업
                          </span>
                          <span style={{ color: "var(--brand-deep)", fontWeight: 600 }}>
                            {CTA_LABEL[status] || CTA_LABEL.idle}
                          </span>
                        </div>
                        <button
                          type="button"
                          title="강의 삭제"
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(course); }}
                          style={{
                            position: "absolute", bottom: 10, right: 10,
                            background: "none", border: "none", cursor: "pointer",
                            color: "var(--zinc-300)", padding: "4px", borderRadius: 5,
                            display: "flex", alignItems: "center", lineHeight: 1, transition: "color .15s",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--zinc-300)"; }}
                        >
                          <Trash2 size={13} />
                        </button>
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
