import RoleLayout from "../../components/RoleLayout.jsx";
import StatCard from "../../components/StatCard.jsx";
import { studentResult } from "../../data/mockData.js";

function StudentResultPage() {
  const correctRate = Math.round((studentResult.correct / studentResult.total) * 100);

  return (
    <RoleLayout role="student" title="내 퀴즈 결과" subtitle="정답률과 오답 개념을 확인하고 복습하세요.">
      <div className="stat-grid compact">
        <StatCard label="정답률" value={`${correctRate}%`} />
        <StatCard label="오답률" value={`${studentResult.wrongRate}%`} tone="warning" />
        <StatCard label="맞힌 문제" value={`${studentResult.correct}개`} />
      </div>
      <section className="card-list">
        {studentResult.items.map((item) => (
          <article className={`list-card ${item.result === "오답" ? "wrong" : ""}`} key={item.concept}>
            <span>{item.result}</span>
            <strong>{item.concept}</strong>
            <p>{item.note}</p>
          </article>
        ))}
      </section>
    </RoleLayout>
  );
}

export default StudentResultPage;
