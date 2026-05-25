import RoleLayout from "../../components/RoleLayout.jsx";
import { studentQuestions } from "../../data/mockData.js";

function StudentQuestionsPage() {
  return (
    <RoleLayout role="student" title="익명 질문" subtitle="수업 중 이해되지 않는 부분을 편하게 남겨보세요.">
      <section className="content-grid two">
        <article className="panel-card">
          <h2>질문 작성</h2>
          <textarea className="question-input" placeholder="모르는 부분을 자유롭게 적어주세요." />
          <button className="primary-button" type="button">익명 질문 보내기</button>
        </article>
        <article className="panel-card">
          <h2>자주 나온 질문</h2>
          {studentQuestions.map((question) => (
            <div className="question-row" key={question}>{question}</div>
          ))}
        </article>
      </section>
    </RoleLayout>
  );
}

export default StudentQuestionsPage;
