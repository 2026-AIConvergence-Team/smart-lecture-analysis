import { NavLink } from "react-router-dom";

const navItems = {
  student: [
    ["홈", "/student/home"],
    ["자료", "/student/materials"],
    ["퀴즈", "/student/quiz"],
    ["질문", "/student/questions"],
    ["결과", "/student/result"],
  ],
  teacher: [
    ["홈", "/teacher/home"],
    ["업로드", "/teacher/upload"],
    ["개념", "/teacher/concepts"],
    ["퀴즈", "/teacher/quizzes"],
    ["대시보드", "/teacher/dashboard"],
    ["질문", "/teacher/questions"],
    ["리포트", "/teacher/report"],
  ],
};

function RoleLayout({ role, title, subtitle, children }) {
  const isTeacher = role === "teacher";

  return (
    <main className={`role-shell ${isTeacher ? "teacher-theme" : "student-theme"}`}>
      <header className="role-topbar">
        <div className="brand">
          <span className="brand-mark">C</span>
          <span>Classtone</span>
        </div>
        <nav className="role-nav" aria-label={`${role} navigation`}>
          {navItems[role].map(([label, path]) => (
            <NavLink key={path} to={path}>
              {label}
            </NavLink>
          ))}
        </nav>
        <span className="role-badge">{isTeacher ? "교수자 모드" : "학생 모드"}</span>
      </header>

      <section className="role-hero">
        <div>
          <p>{isTeacher ? "Teacher Workspace" : "Student Workspace"}</p>
          <h1>{title}</h1>
          <span>{subtitle}</span>
        </div>
      </section>

      {children}
    </main>
  );
}

export default RoleLayout;
