import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

function LoginPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState("professor");
  const [form, setForm] = useState({ id: "", password: "", keepSigned: false });
  const [message, setMessage] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.id || !form.password) {
      setMessage("아이디와 비밀번호를 모두 입력해 주세요.");
      return;
    }
    setMessage("");
    navigate("/app", { state: { role } });
  };

  return (
    <main className="login-page">
      <div className="login-bg">
        <div className="login-blob a" />
        <div className="login-blob b" />
        <div className="login-blob c" />
        <div className="login-wave" />
      </div>
      <div className="login-shell">
        <section className="login-left">
          <div>
            <div className="brand-mark">
              <div className="logo">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 22, height: 22 }}>
                  <path d="M12 2 L19 6 V14 L12 18 L5 14 V6 Z" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
                  <circle cx="12" cy="11" r="2.5" fill="#fff" />
                  <path d="M14 13 L17 16" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <div className="wordmark">QuizSync</div>
                <span className="sub">성신여자대학교 · 수업 이해도 플랫폼</span>
              </div>
            </div>

            <div style={{ marginTop: "40px" }}>
              <h1 className="login-headline">
                강의자료 한 장으로 시작하는<br />
                <em>실시간 이해도</em> 체크
              </h1>
              <p className="login-sub">
                PDF 한 장을 올리면 AI가 키워드를 추출하고 퀴즈를 즉시 만들어 드려요.<br />
                수업 중 학생 반응을 실시간으로 확인하고, 이후 리포트로 다음 강의를 준비하세요.
              </p>
              <div className="feature-row">
                <div className="feature-pill">
                  <p>STEP 01</p>
                  <p>수업 코드로<br />학생 익명 입장</p>
                </div>
                <div className="feature-pill">
                  <p>STEP 02</p>
                  <p>키워드 기반<br />퀴즈 한 세트 출제</p>
                </div>
                <div className="feature-pill">
                  <p>STEP 03</p>
                  <p>주차별 리포트와<br />학생 메모형 복습</p>
                </div>
              </div>
            </div>
          </div>

          <div className="login-footer-text">
            © 2026 QuizSync · Powered for SungShin Women's University<br />
            돈암수정캠퍼스 · 02844 서울특별시 성북구 보문로 34다길 2
          </div>
        </section>

        <section className="login-right">
          <div style={{ position: "relative", width: "100%", display: "flex", justifyContent: "center" }}>
            <div className="float-chip" style={{ top: -20, left: 0 }}>
              <span className="dot" style={{ background: "#10b981" }} /> 응답 23/32 · Live
            </div>
            <div className="float-chip" style={{ bottom: -20, right: 0 }}>
              <span className="dot" style={{ background: "#7C5BC4" }} /> 5주차 리포트 준비됨
            </div>

            <div className="login-card" style={{ width: 459.5, minWidth: 420 }}>
              <h2>다시 오신 걸 환영합니다</h2>
              <p className="h2-sub">학번 또는 사번으로 로그인해 주세요</p>

              <div className="role-tabs">
                <button type="button" className={`role-tab ${role === "professor" ? "active" : ""}`} onClick={() => setRole("professor")}> 
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 14, height: 14 }}>
                    <path d="M6 7V6.5C6 5.672 6.672 5 7.5 5H16.5C17.328 5 18 5.672 18 6.5V7H20C20.553 7 21 7.447 21 8V18C21 18.553 20.553 19 20 19H4C3.447 19 3 18.553 3 18V8C3 7.447 3.447 7 4 7H6Z" stroke="#5B3D9F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M9 7H15" stroke="#5B3D9F" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  교수자
                </button>
                <button type="button" className={`role-tab ${role === "student" ? "active" : ""}`} onClick={() => setRole("student")}> 
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 14, height: 14 }}>
                    <path d="M3 9L12 13L21 9L12 5L3 9Z" stroke="#5B3D9F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M12 13V18" stroke="#5B3D9F" strokeWidth="1.5" strokeLinecap="round" />
                    <path d="M6 14.5H18" stroke="#5B3D9F" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  학생
                </button>
              </div>

              <form className="login-form-grid" style={{ marginTop: 18 }} onSubmit={handleSubmit}>
                <div className="field full">
                  <label htmlFor="loginId">아이디</label>
                  <input
                    id="loginId"
                    type="text"
                    placeholder="학번(8자리) 또는 사번"
                    value={form.id}
                    onChange={(event) => setForm({ ...form, id: event.target.value })}
                  />
                </div>
                <div className="field full">
                  <label htmlFor="loginPw">비밀번호</label>
                  <input
                    id="loginPw"
                    type="password"
                    placeholder="••••••••"
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                  />
                </div>
              </form>

              <div className="login-row">
                <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={form.keepSigned}
                    onChange={(event) => setForm({ ...form, keepSigned: event.target.checked })}
                  /> 로그인 상태 유지
                </label>
                <a href="#" style={{ color: "#5B3D9F", fontWeight: 700, fontSize: 12 }}>비밀번호 찾기</a>
              </div>

              {message && <p className="form-message">{message}</p>}

              <button className="login-submit" type="button" onClick={handleSubmit}>
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 16, height: 16 }}>
                  <path d="M6 12H18" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M12 6L18 12L12 18" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                로그인
              </button>

            <p style={{ marginTop: 20, textAlign: "center", fontSize: 13, color: "var(--zinc-500)" }}>
              아직 계정이 없으신가요?
              <Link to="/signup" style={{ color: "#5B3D9F", fontWeight: 700, marginLeft: 4 }}>회원가입</Link>
            </p>
          </div>
        </div>
        </section>
      </div>
    </main>
  );
}

export default LoginPage;
