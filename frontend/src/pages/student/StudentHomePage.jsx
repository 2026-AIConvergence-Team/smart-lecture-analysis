import { Link } from "react-router-dom";

import RoleLayout from "../../components/RoleLayout.jsx";
import StatCard from "../../components/StatCard.jsx";
import { materials, studentResult } from "../../data/mockData.js";

function StudentHomePage() {
  return (
    <RoleLayout role="student" title="오늘의 학습" subtitle="업로드된 자료와 풀어야 할 퀴즈를 확인하세요.">
      <section className="content-grid two">
        <article className="panel-card action-panel">
          <h2>자료구조 3교시</h2>
          <p>스택, 큐, 힙 메모리 핵심 개념이 분석되었습니다.</p>
          <div className="quick-actions">
            <Link className="primary-button" to="/student/materials">개념 확인</Link>
            <Link className="secondary-button" to="/student/quiz">퀴즈 풀기</Link>
          </div>
        </article>
        <div className="stat-grid compact">
          <StatCard label="완료한 퀴즈" value={`${studentResult.correct}/${studentResult.total}`} />
          <StatCard label="오답률" value={`${studentResult.wrongRate}%`} tone="warning" />
        </div>
      </section>

      <section className="card-list">
        {materials.map((item) => (
          <article className="list-card" key={item.title}>
            <span>{item.type}</span>
            <strong>{item.title}</strong>
            <p>{item.status} · 핵심 개념 {item.concepts}개</p>
          </article>
        ))}
      </section>
    </RoleLayout>
  );
}

export default StudentHomePage;
