import { useState } from "react";
import { useNavigate } from "react-router-dom";
import RoleLayout from "../../components/RoleLayout.jsx";

const DEFAULT_COURSES = [
  { id: "ds",   year: 2026, term: "1학기", title: "자료구조론",   section: "01", students: 32, meta: "컴퓨터공학과 · 월/수 10:30", status: "live", week: 5 },
  { id: "os",   year: 2026, term: "1학기", title: "운영체제",      section: "02", students: 28, meta: "컴퓨터공학과 · 화/목 13:30", status: "soon", week: 4 },
  { id: "algo", year: 2026, term: "1학기", title: "알고리즘 설계", section: "01", students: 41, meta: "소프트웨어학부 · 금 09:00",   status: "idle", week: 5 },
  { id: "db",   year: 2025, term: "2학기", title: "데이터베이스",  section: "01", students: 38, meta: "컴퓨터공학과 · 화/목 13:30", status: "done", week: 15 },
];

const STATUS_PILL = {
  live: <span className="status-tag pill pill-success"><span className="dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />수업 중</span>,
  soon: <span className="status-tag pill pill-warn">곧 시작</span>,
  idle: <span className="status-tag pill pill-neutral">대기</span>,
  done: <span className="status-tag pill pill-neutral">종료</span>,
};

function CodeJoinModal({ open, course, onClose, onJoin }) {
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");

  const handleInput = (i, val) => {
    const upper = val.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const next = [...code];
    if (upper) {
      next[i] = upper[0];
      setCode(next);
      setError("");
      const nextEl = document.getElementById(`codeInput${i + 1}`);
      if (nextEl) nextEl.focus();
    } else {
      next[i] = "";
      setCode(next);
    }
  };

  const handleKeyDown = (i, e) => {
    if (e.key === "Backspace") {
      const next = [...code];
      if (next[i]) { next[i] = ""; setCode(next); }
      else {
        const prev = document.getElementById(`codeInput${i - 1}`);
        if (prev) prev.focus();
      }
    }
  };

  const handleClose = () => {
    setCode(["", "", "", "", "", ""]);
    setError("");
    onClose();
  };

  const fullCode = code.join("");

  return (
    <div
      className={`modal-backdrop${open ? " open" : ""}`}
      id="codeJoinModal"
      onClick={(e) => e.target.id === "codeJoinModal" && handleClose()}
    >
      <div className="modal" style={{ position: "relative", maxWidth: 480 }}>
        {/* Close button */}
        <button
          className="modal-close"
          type="button"
          onClick={handleClose}
          style={{
            position: "absolute", top: 16, right: 16,
            background: "none", border: "none", cursor: "pointer",
            color: "var(--zinc-400)", padding: 4, borderRadius: 6,
            display: "grid", placeItems: "center",
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        {/* Header */}
        <div className="modal-head" style={{ textAlign: "center", paddingBottom: 6 }}>
          <div style={{
            width: 54, height: 54, margin: "0 auto 12px",
            borderRadius: 14, background: "var(--brand-soft)",
            display: "grid", placeItems: "center",
          }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="7.5" cy="15.5" r="5.5"/>
              <path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>
            </svg>
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--zinc-900)", margin: 0 }}>
            {course?.title || "강의"} 강의실 입장
          </h3>
          <p style={{ marginTop: 6, fontSize: 13, color: "var(--zinc-500)" }}>
            교수님이 띄운 6자리 수업 코드를 입력하세요
          </p>
        </div>

        {/* Code inputs */}
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
          <p style={{
            marginTop: 14, fontSize: 12,
            color: "var(--danger)", textAlign: "center", minHeight: 14,
          }}>
            {error}
          </p>
        </div>

        {/* Footer */}
        <div className="modal-foot">
          <button className="btn btn-ghost" type="button" onClick={handleClose}>취소</button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={fullCode.length < 6}
            onClick={() => { onJoin(fullCode); setCode(["", "", "", "", "", ""]); setError(""); }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
              <polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
            </svg>
            입장하기
          </button>
        </div>
      </div>
    </div>
  );
}

function StudentCoursesPage() {
  const navigate = useNavigate();
  const [modalCourse, setModalCourse] = useState(null);

  const active = DEFAULT_COURSES.filter((c) => c.status !== "done");
  const past   = DEFAULT_COURSES.filter((c) => c.status === "done");

  const handleCardClick = (c) => {
    if (c.status === "done") {
      navigate("/student/review");
    } else if (c.status === "live") {
      setModalCourse(c);
    }
  };

  const handleJoin = (code) => {
    setModalCourse(null);
    navigate("/student/live");
  };

  const renderCard = (c) => {
    const cta = c.status === "live"
      ? <span style={{ color: "var(--brand-deep)", fontWeight: 600 }}>강의실 입장 →</span>
      : c.status === "done"
        ? <span style={{ color: "var(--brand-deep)", fontWeight: 600 }}>복습 →</span>
        : <span style={{ color: "var(--zinc-500)", fontWeight: 600 }}>곧 시작</span>;

    return (
      <button key={c.id} className="course-card" type="button" onClick={() => handleCardClick(c)}>
        <div>
          <div className="title">{c.title}</div>
          <div className="term">{c.meta}</div>
        </div>
        {STATUS_PILL[c.status]}
        <div className="meta">
          <span className="key">{c.week}주차 · 담당 김OO 교수</span>
          {cta}
        </div>
      </button>
    );
  };

  return (
    <RoleLayout role="student" title="수업 목록">
      <div className="content">
        <p className="eyebrow">My Classes</p>
        <h1 className="page-title">내 수업</h1>
        <p className="page-sub">수업을 선택한 뒤 교수님이 띄운 수업 코드를 입력해 강의실에 입장합니다.</p>

        <div style={{ marginTop: 28 }}>
          {/* 현재 학기 */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--zinc-900)" }}>2026년 1학기</h2>
              <span style={{ fontSize: 12, color: "var(--zinc-500)" }}>수강 {active.length}과목</span>
            </div>
            <div className="course-grid">
              {active.map(renderCard)}
            </div>
          </div>

          {/* 이전 학기 */}
          {past.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--zinc-900)" }}>2025년 2학기</h2>
                <span style={{ fontSize: 12, color: "var(--zinc-500)" }}>수강 {past.length}과목</span>
              </div>
              <div className="course-grid">
                {past.map(renderCard)}
              </div>
            </div>
          )}
        </div>
      </div>

      <CodeJoinModal
        open={!!modalCourse}
        course={modalCourse}
        onClose={() => setModalCourse(null)}
        onJoin={handleJoin}
      />
    </RoleLayout>
  );
}

export default StudentCoursesPage;
