import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Briefcase, GraduationCap, UserPlus } from "lucide-react";
import { signup } from "../api/authApi.js";

function SignupPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState("teacher");
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.name || !form.email || !form.password || !form.confirm) {
      setMessage("모든 입력란을 채워 주세요.");
      return;
    }
    if (form.password !== form.confirm) {
      setMessage("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (form.password.length < 6) {
      setMessage("비밀번호는 6자 이상이어야 합니다.");
      return;
    }

    setMessage("");
    setLoading(true);
    try {
      await signup({
        email: form.email,
        name: form.name,
        role: role,           // "teacher" | "student"
        password: form.password,
      });
      navigate("/login");
    } catch (err) {
      setMessage(err.message || "회원가입에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main>
      <div className="login-bg">
        <div className="login-blob a" />
        <div className="login-blob b" />
        <div className="login-blob c" />
        <div className="login-wave" />
      </div>

      <div style={{ position: "relative", zIndex: 2, minHeight: "100vh", display: "grid", placeItems: "center", padding: "48px 24px" }}>
        <div className="login-card signup">
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
            <p className="h2-sub">역할을 선택한 뒤 정보를 입력해 주세요</p>
          </div>

          {/* 역할 선택 */}
          <div className="role-tabs" style={{ marginTop: 24 }}>
            <button
              type="button"
              className={`role-tab ${role === "teacher" ? "active" : ""}`}
              onClick={() => setRole("teacher")}
            >
              <Briefcase size={14} /> 교수자
            </button>
            <button
              type="button"
              className={`role-tab ${role === "student" ? "active" : ""}`}
              onClick={() => setRole("student")}
            >
              <GraduationCap size={14} /> 학생
            </button>
          </div>

          <div className="login-form-grid" style={{ marginTop: 18 }}>
            <div className="field full">
              <label htmlFor="suName">이름</label>
              <input
                id="suName"
                type="text"
                placeholder="이름을 입력하세요"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                disabled={loading}
              />
            </div>
            <div className="field full">
              <label htmlFor="suEmail">이메일</label>
              <input
                id="suEmail"
                type="email"
                placeholder={role === "student" ? "예: 20231349@sungshin.ac.kr" : "예: prof@sungshin.ac.kr"}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                disabled={loading}
              />
            </div>
            <div className="field">
              <label htmlFor="suPw">비밀번호</label>
              <input
                id="suPw"
                type="password"
                placeholder="6자 이상"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                disabled={loading}
              />
            </div>
            <div className="field">
              <label htmlFor="suPw2">비밀번호 확인</label>
              <input
                id="suPw2"
                type="password"
                placeholder="다시 한 번 입력"
                value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                disabled={loading}
              />
            </div>
          </div>

          {message && (
            <p style={{ marginTop: 10, fontSize: 12, color: "var(--danger)", textAlign: "center" }}>{message}</p>
          )}

          <button
            className="login-submit"
            type="button"
            style={{ marginTop: 24, opacity: loading ? 0.7 : 1 }}
            onClick={handleSubmit}
            disabled={loading}
          >
            <UserPlus size={16} />
            {loading ? "가입 중..." : "회원가입"}
          </button>

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
