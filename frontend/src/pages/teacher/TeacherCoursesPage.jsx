import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, Pencil } from "lucide-react";
import RoleLayout from "../../components/RoleLayout.jsx";
import { getCourses, createCourse, updateCourse, getCourseLectures, deleteCourse } from "../../api/courseApi.js";

const STATUS_PILL = {
  live: <span className="status-tag pill pill-success"><span className="dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />진행 중</span>,
  soon: <span className="status-tag pill pill-warn">준비 중</span>,
  idle: <span className="status-tag pill pill-neutral">대기</span>,
  done: <span className="status-tag pill pill-neutral">종료</span>,
};

const CTA_LABEL = {
  live: "수업 시작 →",
  soon: "수업 시작 →",
  idle: "수업 시작 →",
  done: "리포트 보기 →",
};

const DEFAULT_COURSES = [
  { id: "ds",   year: 2026, term: "1학기", title: "자료구조론",   section: "01", students: 32, meta: "컴퓨터공학과 · 월/수 10:30", status: "live", week: 5 },
  { id: "os",   year: 2026, term: "1학기", title: "운영체제",      section: "02", students: 28, meta: "컴퓨터공학과 · 화/목 13:30", status: "soon", week: 4 },
  { id: "algo", year: 2026, term: "1학기", title: "알고리즘 설계", section: "01", students: 41, meta: "소프트웨어학부 · 금 09:00",   status: "idle", week: 5 },
  { id: "db",   year: 2025, term: "2학기", title: "데이터베이스",  section: "01", students: 38, meta: "컴퓨터공학과 · 화/목 13:30", status: "done", week: 15 },
];

function apiCourseToLocal(c) {
  return {
    id:         c.id,
    year:       c.year,
    term:       c.semester,
    title:      c.title,
    section:    c.section,
    students:   c.student_count,
    meta:       `${c.department} · ${c.schedule}`,
    // raw fields for edit form
    department: c.department,
    schedule:   c.schedule,
    status:     "idle",
    week:       1,
  };
}

function loadLocalCourses() {
  try {
    const raw = localStorage.getItem("quizsync-v2-courses");
    return raw ? JSON.parse(raw) : DEFAULT_COURSES.slice();
  } catch {
    return DEFAULT_COURSES.slice();
  }
}

function groupBySemester(courses) {
  const map = {};
  courses.forEach((c) => {
    const key = `${c.year}년 ${c.term}`;
    if (!map[key]) map[key] = [];
    map[key].push(c);
  });
  return map;
}

// ── 과목 추가 모달 ───────────────────────────────────────
function AddCourseModal({ open, onClose, onAdd }) {
  const [form, setForm] = useState({
    year: 2026, semester: "1학기", title: "",
    department: "", schedule: "", section: "01", student_count: 30,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleAdd = () => {
    if (!form.title.trim()) return;
    setLoading(true);
    setError("");
    createCourse({
      title: form.title, department: form.department, year: form.year,
      semester: form.semester, schedule: form.schedule,
      student_count: form.student_count, section: form.section,
    })
      .then((data) => {
        onAdd(apiCourseToLocal(data));
        setForm({ year: 2026, semester: "1학기", title: "", department: "", schedule: "", section: "01", student_count: 30 });
        onClose();
      })
      .catch((err) => setError(err.message || "과목 생성에 실패했습니다."))
      .finally(() => setLoading(false));
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
          {error && <p style={{ fontSize: 12, color: "var(--danger)", marginTop: 4 }}>{error}</p>}
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={loading}>취소</button>
          <button className="btn btn-primary" type="button" onClick={handleAdd} disabled={loading}>
            {loading ? "추가 중..." : "강의 추가"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 과목 수정 모달 ───────────────────────────────────────
function EditCourseModal({ course, onClose, onSave }) {
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // course가 바뀔 때 폼 초기화
  useEffect(() => {
    if (!course) return;
    setForm({
      title:         course.title       || "",
      department:    course.department  || "",
      schedule:      course.schedule    || "",
      year:          course.year        || 2026,
      semester:      course.term        || "1학기",
      section:       course.section     || "01",
      student_count: course.students    || 0,
    });
    setError("");
  }, [course]);

  if (!course || !form) return null;

  const handleSave = () => {
    if (!form.title.trim()) return;
    setLoading(true);
    setError("");
    updateCourse(course.id, {
      title:         form.title,
      department:    form.department,
      year:          form.year,
      semester:      form.semester,
      schedule:      form.schedule,
      student_count: form.student_count,
      section:       form.section,
    })
      .then((data) => {
        onSave(apiCourseToLocal({ ...data, status: course.status, week: course.week }));
        onClose();
      })
      .catch((err) => setError(err.message || "수정에 실패했습니다."))
      .finally(() => setLoading(false));
  };

  return (
    <div className="modal-backdrop open" id="courseEditModal" onClick={(e) => e.target.id === "courseEditModal" && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h3>강의 정보 수정</h3>
          <p>변경할 내용을 입력하세요.</p>
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
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="form-row">
            <label>학과</label>
            <input className="input" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
          </div>
          <div className="form-row">
            <label>수업 시간</label>
            <input className="input" value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} />
          </div>
          <div className="form-grid-2">
            <div className="form-row">
              <label>분반</label>
              <input className="input" value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} />
            </div>
            <div className="form-row">
              <label>수강생 수</label>
              <input className="input" type="number" value={form.student_count} onChange={(e) => setForm({ ...form, student_count: +e.target.value })} />
            </div>
          </div>
          {error && <p style={{ fontSize: 12, color: "var(--danger)", marginTop: 4 }}>{error}</p>}
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={loading}>취소</button>
          <button className="btn btn-primary" type="button" onClick={handleSave} disabled={loading}>
            {loading ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 강의 삭제 확인 모달 ──────────────────────────────────
function DeleteConfirmModal({ course, onClose, onConfirm }) {
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
            <div style={{ fontSize: 12, color: "var(--zinc-500)", marginTop: 2 }}>{course.meta}</div>
          </div>
          <p style={{ marginTop: 12, fontSize: 13, color: "var(--zinc-500)" }}>삭제한 강의는 복구할 수 없습니다.</p>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" type="button" onClick={onClose}>취소</button>
          <button className="btn" type="button" onClick={onConfirm} style={{ background: "#ef4444", color: "#fff", borderColor: "#ef4444" }}>삭제</button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 페이지 ──────────────────────────────────────────
function TeacherCoursesPage() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState(loadLocalCourses);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    getCourses()
      .then((data) => {
        if (!Array.isArray(data)) return;
        const localList = data.map(apiCourseToLocal);
        setCourses(localList);

        // 각 과목의 수업 목록으로 week + status 갱신
        localList.forEach((course) => {
          getCourseLectures(course.id)
            .then((lectures) => {
              if (!Array.isArray(lectures) || lectures.length === 0) return;

              // week: 제목에서 최대 주차 추출
              const weeks = lectures
                .map((l) => { const m = l.title?.match(/(\d+)주차/); return m ? +m[1] : null; })
                .filter(Boolean);
              const maxWeek = weeks.length > 0 ? Math.max(...weeks) : null;

              // status: 날짜 + 강의 상태 기반 추론
              const today = new Date().toISOString().split("T")[0];
              let derivedStatus = "idle";
              if (lectures.some((l) => l.date === today || l.status === "active")) {
                derivedStatus = "live";
              } else if (lectures.some((l) => l.date > today)) {
                derivedStatus = "soon";
              } else if (maxWeek >= 15) {
                derivedStatus = "done";
              }

              setCourses((prev) =>
                prev.map((c) =>
                  c.id === course.id
                    ? { ...c, ...(maxWeek && { week: maxWeek }), status: derivedStatus }
                    : c
                )
              );
            })
            .catch(() => {});
        });
      })
      .catch(() => {});
  }, []);

  const groups = groupBySemester(courses);

  const handleAdd = (newCourse) => setCourses((prev) => [newCourse, ...prev]);

  const handleSave = (updatedCourse) => {
    setCourses((prev) => prev.map((c) => (c.id === updatedCourse.id ? { ...updatedCourse, week: c.week, status: c.status } : c)));
  };

  const handleCardClick = (c) => {
    navigate("/teacher/week-select", {
      state: { courseId: c.id, courseName: c.title, section: c.section, students: c.students, courseMeta: c.meta, status: c.status, currentWeek: c.week },
    });
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    setCourses((prev) => prev.filter((c) => c.id !== deleteTarget.id));
    setDeleteTarget(null);
    deleteCourse(deleteTarget.id).catch(() => {});
  };

  return (
    <RoleLayout role="teacher" title="강의 목록">
      <div className="content">
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

        <div style={{ marginTop: 28 }}>
          {Object.entries(groups).map(([label, list]) => (
            <div key={label} style={{ marginBottom: 28 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--zinc-900)" }}>{label}</h2>
                <span style={{ fontSize: 12, color: "var(--zinc-500)" }}>담당 {list.length}과목</span>
              </div>
              <div className="course-grid">
                {list.map((c) => (
                  <div
                    key={c.id}
                    className="course-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => handleCardClick(c)}
                    onKeyDown={(e) => e.key === "Enter" && handleCardClick(c)}
                    style={{ cursor: "pointer", position: "relative" }}
                  >
                    <div>
                      <div className="title">{c.title}</div>
                      <div className="term">{c.meta}</div>
                    </div>
                    {STATUS_PILL[c.status]}
                    <div className="meta">
                      <span className="key">수강생 {c.students}명 · {c.week}주차</span>
                      <span style={{ color: "var(--brand-deep)", fontWeight: 600 }}>{CTA_LABEL[c.status]}</span>
                    </div>

                    {/* 연필 아이콘 — 우측 하단 휴지통 왼쪽 */}
                    <button
                      type="button"
                      title="강의 수정"
                      onClick={(e) => { e.stopPropagation(); setEditTarget(c); }}
                      style={{
                        position: "absolute", bottom: 10, right: 36,
                        background: "none", border: "none", cursor: "pointer",
                        color: "var(--zinc-300)", padding: "4px", borderRadius: 5,
                        display: "flex", alignItems: "center", lineHeight: 1,
                        transition: "color .15s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--brand)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--zinc-300)"; }}
                    >
                      <Pencil size={13} />
                    </button>

                    {/* 휴지통 아이콘 — 우측 하단 */}
                    <button
                      type="button"
                      title="강의 삭제"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(c); }}
                      style={{
                        position: "absolute", bottom: 10, right: 10,
                        background: "none", border: "none", cursor: "pointer",
                        color: "var(--zinc-300)", padding: "4px", borderRadius: 5,
                        display: "flex", alignItems: "center", lineHeight: 1,
                        transition: "color .15s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--zinc-300)"; }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <AddCourseModal open={modalOpen} onClose={() => setModalOpen(false)} onAdd={handleAdd} />
      <EditCourseModal course={editTarget} onClose={() => setEditTarget(null)} onSave={handleSave} />
      <DeleteConfirmModal course={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDeleteConfirm} />
    </RoleLayout>
  );
}

export default TeacherCoursesPage;
