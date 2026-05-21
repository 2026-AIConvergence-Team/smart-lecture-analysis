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
    if (e.key === "Backspace") {
      const next = [...code];
      if (next[i]) { next[i] = ""; setCode(next); }
      else {
        const prev = document.getElementById(`codeInput${i - 1}`);
        if (prev) prev.focus();
      }
    }
  };

  const fullCode = code.join("");

  return (
    <div className={`modal-backdrop${open ? " open" : ""}`} id="codeJoinModal" onClick={(e) => e.target.id === "codeJoinModal" && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h3>수업 코드 입력</h3>
          <p>교수님이 화면에 띄운 6자리 코드를 입력하세요.</p>
        </div>
        <div className="modal-body">
          <div className="code-entry">
            {code.map((v, i) => (
              <input
                key={i}
                id={`codeInput${i}`}
                type="text"
                maxLength={1}
                value={v}
                onChange={(e) => handleInput(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
              />
            ))}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" type="button" onClick={() => { setCode(["","","","","",""]); onClose(); }}>취소</button>
          <button className="btn btn-primary" type="button" disabled={fullCode.length < 6} onClick={() => { onJoin(fullCode); setCode(["","","","","",""]); }}>
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
