import { LogOut, UserRound } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { logout } from "../api/authApi.js";
import linkOnLogo from "../assets/linkON_logo.svg";

const ROUTE_COPY = {
  "/teacher/courses": {
    title: "Course Dashboard",
    crumb: ["Course Dashboard"],
  },
  "/teacher/week-select": {
    title: "Course Dashboard",
    crumb: ["Course Dashboard", "Lecture Select"],
  },
  "/teacher/setup": {
    title: "Class Setup",
    crumb: ["Course Dashboard", "Class Setup"],
  },
  "/teacher/live": {
    title: "Live Class",
    crumb: ["Course Dashboard", "Live"],
    live: true,
  },
  "/teacher/report": {
    title: "수업 리포트",
    crumb: ["리포트"],
  },
  "/student/courses": {
    title: "My Courses",
    crumb: ["My Courses"],
  },
  "/student/live": {
    title: "수업 참여",
    crumb: ["My Courses", "Live"],
    live: true,
  },
  "/student/review": {
    title: "복습",
    crumb: ["복습"],
  },
};

function getRouteInfo(pathname) {
  const matchedPath = Object.keys(ROUTE_COPY).find((path) => pathname.startsWith(path));
  return ROUTE_COPY[matchedPath] || ROUTE_COPY["/teacher/courses"];
}

function getUserInitial(role) {
  const fallback = role === "student" ? "S" : "T";
  return (localStorage.getItem("user_name") || fallback).trim().slice(0, 1).toUpperCase();
}

function getUserLabel(role) {
  return localStorage.getItem("user_name") || (role === "student" ? "학생" : "교수");
}

function Topbar({ role = "teacher" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const routeInfo = getRouteInfo(location.pathname);

  const isTeacher = role === "teacher";

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Token expiry should not block local logout cleanup.
    } finally {
      localStorage.removeItem("access_token");
      localStorage.removeItem("teacher_access_token");
      localStorage.removeItem("student_access_token");
      localStorage.removeItem("user_role");
      localStorage.removeItem("user_name");
      localStorage.removeItem("user_email");
      navigate("/login");
    }
  };

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-left">
          <button
            className="topbar-brand"
            type="button"
            aria-label="강의 목록으로 이동"
            onClick={() => navigate(isTeacher ? "/teacher/courses" : "/student/courses")}
          >
            <img src={linkOnLogo} alt="linkON" />
          </button>

          <span className="sr-only">{routeInfo.title}</span>
        </div>

        <div className="topbar-actions">
          {routeInfo.live && (
            <span className="live-pill">
              <span className="dot" />
              라이브
            </span>
          )}
          <div className="topbar-user" title={getUserLabel(role)}>
            <span className="topbar-avatar">{getUserInitial(role)}</span>
            <span className="topbar-user-text">
              <UserRound size={13} />
              {getUserLabel(role)}
            </span>
          </div>
          <button className="btn btn-ghost btn-sm topbar-logout" type="button" onClick={handleLogout}>
            <LogOut size={14} />
            로그아웃
          </button>
        </div>
      </div>
    </header>
  );
}

export default Topbar;
