import RoleLayout from "../../components/RoleLayout.jsx";
import { concepts, materials } from "../../data/mockData.js";

function StudentMaterialsPage() {
  return (
    <RoleLayout role="student" title="PDF 자료와 추출 개념" subtitle="교수자가 업로드한 자료의 핵심 개념을 확인합니다.">
      <section className="content-grid two">
        <article className="panel-card">
          <h2>수업 자료</h2>
          {materials.map((material) => (
            <div className="resource-row" key={material.title}>
              <b>{material.title}</b>
              <span>{material.type}</span>
              <em>{material.status}</em>
            </div>
          ))}
        </article>

        <article className="panel-card">
          <h2>핵심 개념</h2>
          <div className="concept-chip-list">
            {concepts.map((concept) => (
              <span className={`concept-chip ${concept.risk}`} key={concept.name}>
                {concept.name} · p.{concept.page}
              </span>
            ))}
          </div>
        </article>
      </section>
    </RoleLayout>
  );
}

export default StudentMaterialsPage;
