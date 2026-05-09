import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { signup } from "../api/authApi.js";
import AuthCard from "../components/AuthCard.jsx";

function SignupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: "",
    name: "",
    role: "teacher",
    password: "",
  });
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
      await signup(form);
      navigate("/login");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard title="회원가입" subtitle="교수자 또는 학생 계정을 생성하세요.">
      <form className="auth-form" onSubmit={handleSubmit}>
        <label>
          이름
          <input name="name" value={form.name} onChange={handleChange} placeholder="Kim Teacher" required />
        </label>

        <label>
          이메일
          <input name="email" type="email" value={form.email} onChange={handleChange} placeholder="teacher@example.com" required />
        </label>

        <label>
          역할
          <select name="role" value={form.role} onChange={handleChange}>
            <option value="teacher">교수자</option>
            <option value="student">학생</option>
          </select>
        </label>

        <label>
          비밀번호
          <input name="password" type="password" value={form.password} onChange={handleChange} placeholder="6자 이상" required />
        </label>

        {message && <p className="form-message">{message}</p>}

        <button className="primary-button" type="submit" disabled={loading}>
          {loading ? "가입 중..." : "회원가입"}
        </button>
      </form>

      <p className="auth-link">
        이미 계정이 있다면 <Link to="/login">로그인</Link>
      </p>
    </AuthCard>
  );
}

export default SignupPage;
