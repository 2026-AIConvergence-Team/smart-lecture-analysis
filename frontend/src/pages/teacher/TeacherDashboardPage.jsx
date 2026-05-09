import RoleLayout from "../../components/RoleLayout.jsx";
import StatCard from "../../components/StatCard.jsx";
import { dashboardStats, questions, understandingTrend } from "../../data/mockData.js";

function TeacherDashboardPage() {
  const points = understandingTrend.map((value, index) => `${index * 12.5},${100 - value}`).join(" ");

  return (
    <RoleLayout role="teacher" title="실시간 오답률 대시보드" subtitle="학생 응답을 기반으로 위험 구간을 확인합니다.">
      <div className="stat-grid">
        {dashboardStats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>
      <article className="alert-card">
        <strong>AI 감지 - 오답률 급상승</strong>
        <p>스택 포인터와 힙 메모리 차이 설명 구간에서 오답률이 68%까지 상승했습니다.</p>
      </article>
      <section className="dashboard-grid">
        <article className="panel-card">
          <h2>정답률 흐름</h2>
          <div className="line-chart">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="정답률 흐름 차트">
              <polyline points={points} />
            </svg>
          </div>
        </article>
        <article className="panel-card">
          <h2>실시간 질문</h2>
          <div className="question-list">
            {questions.map((question) => (
              <div key={question.text}>
                <span>{question.text}</span>
                <b>{question.count}</b>
              </div>
            ))}
          </div>
        </article>
      </section>
    </RoleLayout>
  );
}

export default TeacherDashboardPage;
