import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";

import LoginPage  from "./pages/LoginPage.jsx";
import SignupPage from "./pages/SignupPage.jsx";

import TeacherCoursesPage    from "./pages/teacher/TeacherCoursesPage.jsx";
import TeacherWeekSelectPage from "./pages/teacher/TeacherWeekSelectPage.jsx";
import TeacherSetupPage      from "./pages/teacher/TeacherSetupPage.jsx";
import TeacherLivePage       from "./pages/teacher/TeacherLivePage.jsx";
import TeacherReportPage     from "./pages/teacher/TeacherReportPage.jsx";

import StudentCoursesPage   from "./pages/student/StudentCoursesPage.jsx";
import StudentLivePage      from "./pages/student/StudentLivePage.jsx";
import StudentReviewPage    from "./pages/student/StudentReviewPage.jsx";

function App() {
  const location = useLocation();

  useEffect(() => {
    const role = location.pathname.startsWith("/student") ? "student" : "teacher";
    document.body.setAttribute("data-role", role);
  }, [location.pathname]);

  return (
    <Routes>
      <Route path="/"       element={<Navigate to="/login" replace />} />
      <Route path="/login"  element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />

      {/* 교수자 라우트 */}
      <Route path="/teacher/courses"      element={<TeacherCoursesPage />} />
      <Route path="/teacher/week-select"  element={<TeacherWeekSelectPage />} />
      <Route path="/teacher/setup"        element={<TeacherSetupPage />} />
      <Route path="/teacher/live"         element={<TeacherLivePage />} />
      <Route path="/teacher/report"       element={<TeacherReportPage />} />

      {/* 학생 라우트 */}
      <Route path="/student/courses"  element={<StudentCoursesPage />} />
      <Route path="/student/live"     element={<StudentLivePage />} />
      <Route path="/student/review"   element={<StudentReviewPage />} />

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
