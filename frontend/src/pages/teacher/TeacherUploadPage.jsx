import RoleLayout from "../../components/RoleLayout.jsx";

function TeacherUploadPage() {
  return (
    <RoleLayout role="teacher" title="PDF 업로드" subtitle="강의 자료를 업로드하면 핵심 개념 분석을 시작합니다.">
      <section className="content-grid two">
        <article className="upload-card">
          <span>PDF</span>
          <strong>강의 PDF를 여기에 업로드</strong>
          <p>현재 화면은 프로토타입이며 실제 파일 분석은 mock data로 표시합니다.</p>
          <button className="primary-button" type="button">파일 선택</button>
        </article>
        <article className="panel-card">
          <h2>분석 예정 항목</h2>
          <div className="check-row">페이지별 텍스트 추출</div>
          <div className="check-row">핵심 키워드 분석</div>
          <div className="check-row">개념 단위 chunk 생성</div>
          <div className="check-row">퀴즈 생성 후보 문장 추출</div>
        </article>
      </section>
    </RoleLayout>
  );
}

export default TeacherUploadPage;
