import { Link } from "react-router-dom";

import RoleLayout from "../../components/RoleLayout.jsx";
import StatCard from "../../components/StatCard.jsx";
import { dashboardStats } from "../../data/mockData.js";

function TeacherHomePage() {
  return (
    <RoleLayout role="teacher" title="교수자 홈" subtitle="강의 자료 분석과 실시간 수업 현황을 관리합니다.">
      <section className="content-grid two">
        <article className="panel-card action-panel">
          <h2>자료구조 3교시 준비</h2>
          <p>PDF를 업로드하고 개념 추출 결과와 자동 생성 퀴즈를 확인하세요.</p>
          <div className="quick-actions">
            <Link className="primary-button" to="/teacher/upload">PDF 업로드</Link>
            <Link className="secondary-button" to="/teacher/dashboard">대시보드 보기</Link>
          </div>
        </article>
        <div className="stat-grid compact">
          {dashboardStats.slice(0, 2).map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </div>
      </section>
    </RoleLayout>
  );
}

export default TeacherHomePage;
