import RoleLayout from "../../components/RoleLayout.jsx";
import StatCard from "../../components/StatCard.jsx";
import { reportStats, weakConcepts } from "../../data/mockData.js";

function TeacherReportPage() {
  return (
    <RoleLayout role="teacher" title="수업 리포트" subtitle="수업 후 취약 개념과 복습 추천을 확인합니다.">
      <div className="stat-grid">
        {reportStats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>
      <article className="panel-card wide">
        <h2>오답률 급등 개념 TOP 3</h2>
        <div className="weak-list">
          {weakConcepts.map((concept) => (
            <div className="weak-row" key={concept.title}>
              <span className="rank">{concept.rank}</span>
              <div>
                <strong>{concept.title}</strong>
                <p>{concept.detail}</p>
              </div>
              <i />
              <b>{concept.drop}</b>
            </div>
          ))}
        </div>
      </article>
      <article className="ai-card">
        <strong>AI 총평</strong>
        <p>메모리 구조의 추상적 설명보다 포인터의 실제 동작 방식에서 오답률이 높았습니다. 다음 수업에서는 시각 자료와 단계별 tracing 실습을 추천합니다.</p>
      </article>
    </RoleLayout>
  );
}

export default TeacherReportPage;
