import { Navigate, Route, Routes } from "react-router-dom";

import LoginPage from "./pages/LoginPage.jsx";
import SignupPage from "./pages/SignupPage.jsx";
import StudentHomePage from "./pages/student/StudentHomePage.jsx";
import StudentMaterialsPage from "./pages/student/StudentMaterialsPage.jsx";
import StudentQuestionsPage from "./pages/student/StudentQuestionsPage.jsx";
import StudentQuizPage from "./pages/student/StudentQuizPage.jsx";
import StudentResultPage from "./pages/student/StudentResultPage.jsx";
import TeacherConceptsPage from "./pages/teacher/TeacherConceptsPage.jsx";
import TeacherDashboardPage from "./pages/teacher/TeacherDashboardPage.jsx";
import TeacherHomePage from "./pages/teacher/TeacherHomePage.jsx";
import TeacherQuestionsPage from "./pages/teacher/TeacherQuestionsPage.jsx";
import TeacherQuizzesPage from "./pages/teacher/TeacherQuizzesPage.jsx";
import TeacherReportPage from "./pages/teacher/TeacherReportPage.jsx";
import TeacherUploadPage from "./pages/teacher/TeacherUploadPage.jsx";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/student/home" element={<StudentHomePage />} />
      <Route path="/student/materials" element={<StudentMaterialsPage />} />
      <Route path="/student/quiz" element={<StudentQuizPage />} />
      <Route path="/student/questions" element={<StudentQuestionsPage />} />
      <Route path="/student/result" element={<StudentResultPage />} />
      <Route path="/teacher/home" element={<TeacherHomePage />} />
      <Route path="/teacher/upload" element={<TeacherUploadPage />} />
      <Route path="/teacher/concepts" element={<TeacherConceptsPage />} />
      <Route path="/teacher/quizzes" element={<TeacherQuizzesPage />} />
      <Route path="/teacher/dashboard" element={<TeacherDashboardPage />} />
      <Route path="/teacher/questions" element={<TeacherQuestionsPage />} />
      <Route path="/teacher/report" element={<TeacherReportPage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
