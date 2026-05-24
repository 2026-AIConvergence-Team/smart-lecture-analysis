import { Library, BarChart3, BookMarked } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

function Sidebar({ role = "teacher" }) {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path) => location.pathname.startsWith(path);

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="logo">Q</div>
        <div>
          <div className="wordmark">QuizSync</div>
          <div className="wordmark-sub">수업 이해도 체크</div>
        </div>
      </div>

      <div className="sidebar-section">
        {role === "teacher" && (
          <div>
            <div className="label">강의 운영</div>
            <button
              className={`nav-btn ${isActive("/teacher/courses") ? "active" : ""}`}
              type="button"
              onClick={() => navigate("/teacher/courses")}
            >
              <Library className="ico" size={16} />
              강의 목록
            </button>
            <div className="label" style={{ marginTop: "14px" }}>분석</div>
            <button
              className={`nav-btn ${isActive("/teacher/report") ? "active" : ""}`}
              type="button"
              onClick={() => navigate("/teacher/report")}
            >
              <BarChart3 className="ico" size={16} />
              수업 리포트
            </button>
          </div>
        )}

        {role === "student" && (
          <div>
            <div className="label">내 수업</div>
            <button
              className={`nav-btn ${isActive("/student/courses") ? "active" : ""}`}
              type="button"
              onClick={() => navigate("/student/courses")}
            >
              <Library className="ico" size={16} />
              수업 목록
            </button>
            <button
              className={`nav-btn ${isActive("/student/review") ? "active" : ""}`}
              type="button"
              onClick={() => navigate("/student/review")}
            >
              <BookMarked className="ico" size={16} />
              복습
            </button>
          </div>
        )}
      </div>

      <div style={{ flex: "1" }}></div>

      <div className="profile-card">
        <div className="av">K</div>
        <div style={{ minWidth: "0" }}>
          <div className="name">김교수</div>
          <div className="email">prof@sungshin.ac.kr</div>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
