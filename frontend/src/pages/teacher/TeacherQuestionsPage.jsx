import RoleLayout from "../../components/RoleLayout.jsx";
import { questions } from "../../data/mockData.js";

function TeacherQuestionsPage() {
  return (
    <RoleLayout role="teacher" title="익명 질문 확인" subtitle="학생들이 남긴 질문을 묶어서 확인합니다.">
      <section className="panel-card">
        <h2>질문 목록</h2>
        <div className="question-list">
          {questions.map((question) => (
            <div key={question.text}>
              <span>{question.text}</span>
              <b>{question.count}</b>
            </div>
          ))}
        </div>
      </section>
    </RoleLayout>
  );
}

export default TeacherQuestionsPage;
