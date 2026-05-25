import { useState } from "react";
import { Link } from "react-router-dom";

import RoleLayout from "../../components/RoleLayout.jsx";
import { miniReport, quiz } from "../../data/mockData.js";

function StudentQuizPage() {
  const [selected, setSelected] = useState(quiz.selected);

  return (
    <RoleLayout role="student" title="퀴즈 풀기" subtitle="개념 이해도를 퀴즈 정답률로 확인합니다.">
      <section className="student-quiz-grid">
        <aside className="insight-side">
          <article className="summary-card warning-card">
            <strong>현재 문항 오답률 68%</strong>
            <span>스택과 큐의 입출력 순서를 헷갈리는 학생이 많습니다.</span>
          </article>

          <article className="summary-card">
            <h2>개념별 오답률</h2>
            {miniReport.weakConcepts.map((item) => (
              <div className="bar-row" key={item.title}>
                <span>{item.title}</span>
                <div>
                  <i style={{ width: `${item.rate.replace(/[^0-9]/g, "")}%` }} />
                </div>
                <b>{item.rate}</b>
              </div>
            ))}
          </article>

          <article className="summary-card">
            <h2>학습 요약</h2>
            <div className="mini-grid">
              <span>참여 학생 <strong>34명</strong></span>
              <span>평균 정답률 <strong>{miniReport.correctRate}%</strong></span>
            </div>
          </article>
        </aside>

        <article className="quiz-card">
          <div className="quiz-meta">
            <span>{quiz.progress}</span>
            <span>{quiz.score}</span>
          </div>
          <div className="progress-line">
            <span style={{ width: "33%" }} />
          </div>
          <h1>{quiz.question}</h1>
          <div className="option-list">
            {quiz.options.map((option) => (
              <button
                className={selected === option ? "option selected" : "option"}
                key={option}
                onClick={() => setSelected(option)}
                type="button"
              >
                {option}
              </button>
            ))}
          </div>
          <Link className="secondary-button align-right" to="/student/result">제출하기</Link>
        </article>
      </section>
    </RoleLayout>
  );
}

export default StudentQuizPage;
