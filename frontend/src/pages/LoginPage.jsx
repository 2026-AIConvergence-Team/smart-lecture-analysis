import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Briefcase, GraduationCap, LogIn } from "lucide-react";

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
    <main>
      <div className="login-bg">
        <div className="login-blob a" />
        <div className="login-blob b" />
        <div className="login-blob c" />
        <div className="login-wave" />
      </div>

      <div className="login-shell">
        {/* ── 왼쪽: 브랜딩 영역 ── */}
        <div className="login-left">
          {/* 1. 브랜드마크 */}
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
          </div>

          {/* 2. 헤드라인 + 기능 설명 */}
          <div>
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

          {/* 3. 푸터 */}
          <div className="login-footer-text">
            © 2026 QuizSync · Powered for SungShin Women's University<br />
            돈암수정캠퍼스 · 02844 서울특별시 성북구 보문로 34다길 2
          </div>
        </div>

        {/* ── 오른쪽: 로그인 카드 ── */}
        <div className="login-right">
          <div style={{ position: "relative", width: "100%", display: "flex", justifyContent: "center" }}>
            <div className="float-chip" style={{ top: -20, left: 0 }}>
              <span className="dot" style={{ background: "#10b981" }} /> 응답 23/32 · Live
            </div>
            <div className="float-chip" style={{ bottom: -20, right: 0 }}>
              <span className="dot" style={{ background: "#7C5BC4" }} /> 5주차 리포트 준비됨
            </div>

            <div className="login-card" style={{ width: "459.5px" }}>
              <h2>다시 오신 걸 환영합니다</h2>
              <p className="h2-sub">학번 또는 사번으로 로그인해 주세요</p>

              <div className="role-tabs">
                <button
                  type="button"
                  className={`role-tab ${role === "professor" ? "active" : ""}`}
                  onClick={() => setRole("professor")}
                >
                  <Briefcase size={14} />교수자
                </button>
                <button
                  type="button"
                  className={`role-tab ${role === "student" ? "active" : ""}`}
                  onClick={() => setRole("student")}
                >
                  <GraduationCap size={14} />학생
                </button>
              </div>

              <div className="login-form-grid" style={{ marginTop: 18 }}>
                <div className="field full">
                  <label htmlFor="loginId">아이디</label>
                  <input
                    id="loginId"
                    type="text"
                    placeholder="학번(8자리) 또는 사번"
                    value={form.id}
                    onChange={(e) => setForm({ ...form, id: e.target.value })}
                  />
                </div>
                <div className="field full">
                  <label htmlFor="loginPw">비밀번호</label>
                  <input
                    id="loginPw"
                    type="password"
                    placeholder="••••••••"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                </div>
              </div>

              <div className="login-row">
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    style={{ accentColor: "#7C5BC4" }}
                    checked={form.keepSigned}
                    onChange={(e) => setForm({ ...form, keepSigned: e.target.checked })}
                  /> 로그인 상태 유지
                </label>
                <a href="#" style={{ color: "#5B3D9F", fontWeight: 700, fontSize: 12 }}>비밀번호 찾기</a>
              </div>

              {message && (
                <p style={{ marginTop: 10, fontSize: 12, color: "var(--danger)", textAlign: "center" }}>{message}</p>
              )}

              <button className="login-submit" type="button" onClick={handleSubmit}>
                <LogIn size={16} /> 로그인
              </button>

              <p style={{ marginTop: 20, textAlign: "center", fontSize: 13, color: "var(--zinc-500)" }}>
                아직 계정이 없으신가요?
                <Link to="/signup" style={{ color: "#5B3D9F", fontWeight: 700, marginLeft: 4 }}>회원가입</Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default LoginPage;
