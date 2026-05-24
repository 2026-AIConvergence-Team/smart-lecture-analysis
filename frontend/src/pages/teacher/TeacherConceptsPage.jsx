import RoleLayout from "../../components/RoleLayout.jsx";
import { concepts } from "../../data/mockData.js";

function TeacherConceptsPage() {
  return (
    <RoleLayout role="teacher" title="추출 개념 확인" subtitle="PDF 분석으로 추출된 개념과 위험도를 검토합니다.">
      <section className="card-list">
        {concepts.map((concept) => (
          <article className={`list-card ${concept.risk}`} key={concept.name}>
            <span>p.{concept.page}</span>
            <strong>{concept.name}</strong>
            <p>{concept.keywords.join(" · ")}</p>
          </article>
        ))}
      </section>
    </RoleLayout>
  );
}

export default TeacherConceptsPage;
