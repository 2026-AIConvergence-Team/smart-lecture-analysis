import RoleLayout from "../../components/RoleLayout.jsx";
import { generatedQuizzes } from "../../data/mockData.js";

function TeacherQuizzesPage() {
  return (
    <RoleLayout role="teacher" title="자동 생성 퀴즈" subtitle="생성된 퀴즈를 확인하고 학생에게 배포합니다.">
      <section className="card-list">
        {generatedQuizzes.map((quizItem, index) => (
          <article className="list-card quiz-review-card" key={quizItem.question}>
            <span>{quizItem.type} · Q{index + 1}</span>
            <strong>{quizItem.question}</strong>
            <p>정답: {quizItem.answer}</p>
            <button className="secondary-button" type="button">수정</button>
          </article>
        ))}
      </section>
      <div className="footer-action">
        <button className="primary-button" type="button">퀴즈 배포하기</button>
      </div>
    </RoleLayout>
  );
}

export default TeacherQuizzesPage;
