import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

function SignupPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState("professor");
  const [form, setForm] = useState({ name: "", dept: "", id: "", password: "", confirm: "" });
  const [message, setMessage] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.name || !form.id || !form.password || !form.confirm) {
      setMessage("모든 입력란을 채워 주세요.");
      return;
    }
    if (form.password !== form.confirm) {
      setMessage("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (form.password.length < 8) {
      setMessage("비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    setMessage("");
    navigate("/login");
  };

  return (
    <main className="login-page">
      <div className="login-bg">
        <div className="login-blob a" />
        <div className="login-blob b" />
        <div className="login-blob c" />
        <div className="login-wave" />
      </div>
      <div style={{ position: "relative", zIndex: 2, minHeight: "100vh", display: "grid", placeItems: "center", padding: "48px 24px" }}>
        <div className="login-card signup" style={{ width: 459.5 }}>
          <div style={{ textAlign: "center" }}>
            <div className="brand-mark" style={{ justifyContent: "center" }}>
              <div className="logo">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 22, height: 22 }}>
                  <path d="M12 2 L19 6 V14 L12 18 L5 14 V6 Z" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
                  <circle cx="12" cy="11" r="2.5" fill="#fff" />
                  <path d="M14 13 L17 16" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <div className="wordmark">QuizSync</div>
              </div>
            </div>
            <h2 style={{ marginTop: 14 }}>QuizSync 계정 만들기</h2>
            <p className="h2-sub">역할을 선택한 뒤 학번/사번과 비밀번호를 입력해 주세요</p>
          </div>

          <div className="role-tabs" style={{ marginTop: 24 }}>
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
            <div className="field">
              <label htmlFor="suName">이름</label>
              <input id="suName" type="text" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="이름을 입력하세요" />
            </div>
            <div className="field">
              <label htmlFor="suDept">소속 학과</label>
              <input id="suDept" type="text" value={form.dept} onChange={(event) => setForm({ ...form, dept: event.target.value })} placeholder="예: 컴퓨터공학과" />
            </div>
            <div className="field full">
              <label htmlFor="suId">{role === "student" ? "학번" : "사번 / 이메일"}</label>
              <input
                id="suId"
                type="text"
                value={form.id}
                onChange={(event) => setForm({ ...form, id: event.target.value })}
                placeholder={role === "student" ? "예: 20231349" : "예: prof@sungshin.ac.kr"}
              />
              <p className="small-text" style={{ marginTop: 6 }}>
                {role === "student"
                  ? "학생은 8자리 학번을 사용합니다."
                  : "교수자는 사번 또는 이메일을 사용합니다."}
              </p>
            </div>
            <div className="field">
              <label htmlFor="suPw">비밀번호</label>
              <input id="suPw" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="8자 이상" />
            </div>
            <div className="field">
              <label htmlFor="suPw2">비밀번호 확인</label>
              <input id="suPw2" type="password" value={form.confirm} onChange={(event) => setForm({ ...form, confirm: event.target.value })} placeholder="다시 한 번 입력" />
            </div>
          </form>

          {message && <p className="form-message">{message}</p>}

          <button className="login-submit" type="button" style={{ marginTop: 24 }} onClick={handleSubmit}>회원가입</button>

          <p style={{ marginTop: 20, textAlign: "center", fontSize: 13, color: "var(--zinc-500)" }}>
            이미 계정이 있으신가요?
            <Link to="/login" style={{ color: "#5B3D9F", fontWeight: 700, marginLeft: 4 }}>로그인</Link>
          </p>
        </div>
      </div>
    </main>
  );
}

export default SignupPage;
