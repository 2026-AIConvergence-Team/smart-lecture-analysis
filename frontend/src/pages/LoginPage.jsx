import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { getMe, login } from "../api/authApi.js";
import AuthCard from "../components/AuthCard.jsx";

function LoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (event) => {
    setForm({ ...form, [event.target.name]: event.target.value });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const tokenData = await login(form);
      localStorage.setItem("access_token", tokenData.access_token);
      const user = await getMe();
      navigate(user.role === "teacher" ? "/teacher/dashboard" : "/student/home");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard title="로그인" subtitle="강의 분석 대시보드에 접속하세요.">
      <form className="auth-form" onSubmit={handleSubmit}>
        <label>
          이메일
          <input name="email" type="email" value={form.email} onChange={handleChange} placeholder="teacher@example.com" required />
        </label>

        <label>
          비밀번호
          <input name="password" type="password" value={form.password} onChange={handleChange} placeholder="password123" required />
        </label>

        {message && <p className="form-message">{message}</p>}

        <button className="primary-button" type="submit" disabled={loading}>
          {loading ? "로그인 중..." : "로그인"}
        </button>
      </form>

      <p className="auth-link">
        계정이 없다면 <Link to="/signup">회원가입</Link>
      </p>
    </AuthCard>
  );
}

export default LoginPage;
