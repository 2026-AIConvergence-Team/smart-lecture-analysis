import { ArrowLeft, LogOut } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { logout } from "../api/authApi.js";

function Topbar({ role = "teacher" }) {
  const navigate = useNavigate();
  const location = useLocation();

  const getPageTitle = () => {
    const path = location.pathname;
    if (path.includes("/teacher/courses")) return "강의 목록";
    if (path.includes("/teacher/setup")) return "강의 설정";
    if (path.includes("/teacher/live")) return "수업 진행";
    if (path.includes("/teacher/report")) return "수업 리포트";
    if (path.includes("/student/courses")) return "수업 목록";
    if (path.includes("/student/live")) return "수업 참여";
    if (path.includes("/student/review")) return "복습";
    return "강의 목록";
  };

  const handleBack = () => {
    navigate(-1);
  };

  const handleRoleSwitch = (newRole) => {
    if (newRole === "teacher") {
      navigate("/teacher/courses");
    } else {
      navigate("/student/courses");
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // 토큰 만료 등 실패해도 로그아웃 처리
    } finally {
      localStorage.removeItem("access_token");
      localStorage.removeItem("user_role");
      localStorage.removeItem("user_name");
      localStorage.removeItem("user_email");
      navigate("/login");
    }
  };

  const showBackBtn = !location.pathname.includes("/courses") || location.pathname.includes("/setup");

  return (
    <header className="topbar">
      <div className="crumbs">
        {showBackBtn && (
          <button className="btn btn-ghost btn-sm" style={{ padding: "0 10px", height: "30px" }} title="뒤로 가기" onClick={handleBack}>
            <ArrowLeft size={14} /> 뒤로
          </button>
        )}
        <span style={{ fontSize: "13px", color: "var(--zinc-500)" }}>
          <strong style={{ color: "var(--zinc-900)" }}>{getPageTitle()}</strong>
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        <span className="live-pill">
          <span className="dot"></span>
          실시간 연동
        </span>
        <div className="role-toggle" title="시연용 역할 전환">
          <button className={role === "teacher" ? "on" : ""} onClick={() => handleRoleSwitch("teacher")}>
            교수
          </button>
          <button className={role === "student" ? "on" : ""} onClick={() => handleRoleSwitch("student")}>
            학생
          </button>
        </div>
        <button className="btn btn-ghost btn-sm" title="로그아웃" onClick={handleLogout}>
          <LogOut size={14} /> 로그아웃
        </button>
      </div>
    </header>
  );
}

export default Topbar;
