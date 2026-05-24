import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import RoleLayout from "../../components/RoleLayout.jsx";

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

function loadCourses() {
  try {
    const raw = localStorage.getItem("quizsync-v2-courses");
    return raw ? JSON.parse(raw) : DEFAULT_COURSES.slice();
  } catch {
    return DEFAULT_COURSES.slice();
  }
}

function saveCourses(list) {
  try { localStorage.setItem("quizsync-v2-courses", JSON.stringify(list)); } catch {}
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

// ── 강의 추가 모달 ───────────────────────────────────────
function AddCourseModal({ open, onClose, onAdd }) {
  const [form, setForm] = useState({ year: 2026, term: "1학기", title: "", section: "01", students: 30, meta: "" });

  const handleAdd = () => {
    if (!form.title.trim()) return;
    onAdd({ ...form, id: `c-${Date.now()}`, status: "idle", week: 1 });
    setForm({ year: 2026, term: "1학기", title: "", section: "01", students: 30, meta: "" });
    onClose();
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
              <select className="select" value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })}>
                <option>1학기</option><option>2학기</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <label>강의명</label>
            <input className="input" placeholder="예: 자료구조론" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="form-grid-2">
            <div className="form-row">
              <label>분반</label>
              <input className="input" placeholder="예: 01" value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} />
            </div>
            <div className="form-row">
              <label>수강생 수</label>
              <input className="input" type="number" placeholder="30" value={form.students} onChange={(e) => setForm({ ...form, students: +e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <label>학과 · 시간</label>
            <input className="input" placeholder="예: 컴퓨터공학과 · 월/수 10:30" value={form.meta} onChange={(e) => setForm({ ...form, meta: e.target.value })} />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" type="button" onClick={onClose}>취소</button>
          <button className="btn btn-primary" type="button" onClick={handleAdd}>강의 추가</button>
        </div>
      </div>
    </div>
  );
}

// ── 강의 삭제 확인 모달 ──────────────────────────────────
function DeleteConfirmModal({ course, onClose, onConfirm }) {
  if (!course) return null;
  return (
    <div
      className="modal-backdrop open"
      id="courseDeleteModal"
      onClick={(e) => e.target.id === "courseDeleteModal" && onClose()}
    >
      <div className="modal" style={{ maxWidth: 400 }}>
        <div className="modal-head">
          <h3>강의 삭제</h3>
          <p>이 강의를 목록에서 삭제하시겠습니까?</p>
        </div>
        <div className="modal-body">
          <div style={{
            padding: "12px 14px",
            background: "var(--zinc-50)",
            border: "1px solid var(--zinc-200)",
            borderRadius: 10,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--zinc-900)" }}>{course.title}</div>
            <div style={{ fontSize: 12, color: "var(--zinc-500)", marginTop: 2 }}>{course.meta}</div>
          </div>
          <p style={{ marginTop: 12, fontSize: 13, color: "var(--zinc-500)" }}>
            삭제한 강의는 복구할 수 없습니다.
          </p>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" type="button" onClick={onClose}>취소</button>
          <button
            className="btn"
            type="button"
            onClick={onConfirm}
            style={{ background: "#ef4444", color: "#fff", borderColor: "#ef4444" }}
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 페이지 ──────────────────────────────────────────
function TeacherCoursesPage() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState(loadCourses);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);   // 삭제 확인 대상 강의

  const groups = groupBySemester(courses);

  const handleAdd = (newCourse) => {
    const updated = [newCourse, ...courses];
    setCourses(updated);
    saveCourses(updated);
  };

  const handleCardClick = (c) => {
    navigate("/teacher/week-select", {
      state: {
        courseId:    c.id,
        courseName:  c.title,
        section:     c.section,
        students:    c.students,
        courseMeta:  c.meta,
        status:      c.status,
        currentWeek: c.week,
      },
    });
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    const updated = courses.filter((c) => c.id !== deleteTarget.id);
    setCourses(updated);
    saveCourses(updated);
    setDeleteTarget(null);
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

        {/* 학기별 강의 목록 */}
        <div style={{ marginTop: 28 }}>
          {Object.entries(groups).map(([label, list]) => (
            <div key={label} style={{ marginBottom: 28 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--zinc-900)" }}>{label}</h2>
                <span style={{ fontSize: 12, color: "var(--zinc-500)" }}>담당 {list.length}과목</span>
              </div>
              <div className="course-grid">
                {list.map((c) => (
                  /* button 안에 button은 HTML 오류 → div[role=button]으로 카드 처리 */
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
                      <span style={{ color: "var(--brand-deep)", fontWeight: 600 }}>
                        {CTA_LABEL[c.status]}
                      </span>
                    </div>
                    {/* 휴지통 버튼 — 카드 우측 하단 절대 위치 */}
                    <button
                      type="button"
                      title="강의 삭제"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(c); }}
                      style={{
                        position: "absolute",
                        bottom: 10,
                        right: 10,
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--zinc-300)",
                        padding: "4px",
                        borderRadius: 5,
                        display: "flex",
                        alignItems: "center",
                        lineHeight: 1,
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
      <DeleteConfirmModal
        course={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
      />
    </RoleLayout>
  );
}

export default TeacherCoursesPage;
