import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { CloudUpload, ChevronLeft, Play, Trash2 } from "lucide-react";
import RoleLayout from "../../components/RoleLayout.jsx";
import { keywordsFor, quizFromKeyword, SAMPLE_QUESTIONS } from "../../data/quizSyncMock.js";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function genCode() {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
  }
  return code;
}

function TeacherSetupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const courseName = location.state?.courseName || "자료구조론";
  const week = location.state?.week || 5;
  const courseMeta = location.state?.courseMeta || "2025-1 / 월,수,금";

  // 상태 관리
  const [code, setCode] = useState(genCode());
  const [joinCount, setJoinCount] = useState(0);
  const [pdfFileName, setPdfFileName] = useState(null);
  const [pdfMeta, setPdfMeta] = useState(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfTotal, setPdfTotal] = useState(8);
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(3);
  const [extractedKeywords, setExtractedKeywords] = useState([]);
  const [selectedKeywords, setSelectedKeywords] = useState([]);
  const [currentQuizSet, setCurrentQuizSet] = useState([]);

  // 현재 스텝 계산
  const currentStep = pdfFileName ? 3 : joinCount > 0 ? 2 : 1;

  useEffect(() => {
    const interval = setInterval(() => {
      setJoinCount((prev) => Math.min(prev + Math.floor(Math.random() * 3), 32));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const handlePdfUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    processPdfFile(file);
  };

  const processPdfFile = (file) => {
    if (file.type !== "application/pdf") {
      alert("PDF 파일만 업로드 가능합니다.");
      return;
    }
    setPdfFileName(file.name);
    setPdfMeta({ size: file.size, type: file.type });
    setPdfTotal(12);
    setPdfPage(1);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processPdfFile(file);
    }
  };

  const handlePdfDelete = () => {
    setPdfFileName(null);
    setPdfMeta(null);
    setCurrentQuizSet([]);
    setExtractedKeywords([]);
    setSelectedKeywords([]);
  };

  const handleExtractKeywords = () => {
    setExtractedKeywords(keywordsFor(rangeStart, rangeEnd));
    setSelectedKeywords([]);
  };

  const handleToggleKeyword = (keyword) => {
    setSelectedKeywords((current) => {
      if (current.includes(keyword)) {
        return current.filter((item) => item !== keyword);
      }
      if (current.length >= 5) return current;
      return [...current, keyword];
    });
  };

  const handleGenerateQuiz = () => {
    const quizSet = selectedKeywords.map((keyword, index) => quizFromKeyword(keyword, index));
    if (quizSet.length === 0) return;
    setCurrentQuizSet(quizSet);
  };

  const handleStartClass = () => {
    if (!pdfFileName) return;
    navigate("/teacher/live", {
      state: {
        code,
        courseName,
        week,
        pdfFileName,
        pdfTotal,
        currentQuizSet,
      },
    });
  };

  return (
    <RoleLayout role="teacher">
      <section className="content">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "24px" }}>
        <div>
          <p className="eyebrow">Lecture Setup</p>
          <h1 className="page-title">{courseName} {week}주차 · 강의 설정</h1>
          <p className="page-sub">수업 코드를 만들고 학생들이 입장한 뒤 강의자료를 업로드하면 수업을 시작할 수 있습니다.</p>
        </div>
        <button className="btn btn-ghost" type="button" onClick={() => navigate("/teacher/courses")}>
          <ChevronLeft size={14} />
          강의 목록
        </button>
      </div>

      <div className="stepper" style={{ marginTop: "24px" }}>
        <div className={`step ${currentStep >= 1 ? "active" : ""}`}>
          <div className="n">1</div>
          <div className="lbl">수업 코드</div>
        </div>
        <div className={`step-line ${currentStep > 1 ? "done" : ""}`}></div>
        <div className={`step ${currentStep >= 2 ? "active" : ""}`}>
          <div className="n">2</div>
          <div className="lbl">학생 입장</div>
        </div>
        <div className={`step-line ${currentStep > 2 ? "done" : ""}`}></div>
        <div className={`step ${currentStep >= 3 ? "active" : ""}`}>
          <div className="n">3</div>
          <div className="lbl">강의자료 업로드</div>
        </div>
        <div className={`step-line ${currentStep > 3 ? "done" : ""}`}></div>
        <div className={`step ${currentStep >= 4 ? "active" : ""}`}>
          <div className="n">4</div>
          <div className="lbl">수업 시작</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: "18px", marginTop: "18px" }}>
        <article className="card flow-card">
          <div className="card-pad-lg">
            <div style={{ marginBottom: "14px" }}>
              <span className="eyebrow">Step 01 · 02</span>
              <h3 style={{ fontSize: "18px", fontWeight: "700", marginTop: "4px" }}>수업 코드 발급 · 학생 입장</h3>
              <p style={{ fontSize: "13px", color: "var(--zinc-500)", marginTop: "4px" }}>앞에 띄우면 학생들이 이 코드를 입력해 강의실에 입장합니다.</p>
            </div>
            <div className="class-code-stage">
              <div className="class-code-label">CLASS CODE</div>
              <div className="class-code-big mono" style={{ fontSize: "84px", marginTop: "14px", fontWeight: "700" }}>{code}</div>
              <div className="class-code-actions" style={{ marginTop: "22px" }}>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => navigator.clipboard.writeText(code)}>복사</button>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => setCode(genCode())}>코드 재생성</button>
                <button className="btn btn-ghost btn-sm" type="button">QR 보기</button>
              </div>
              <div className="join-counter" style={{ marginTop: "18px" }}>
                <span className="dot"></span> 지금 <span style={{ fontWeight: "700", color: "var(--zinc-900)" }}>{joinCount}</span>명이 입장하고 있어요
              </div>
            </div>
            <p style={{ marginTop: "16px", fontSize: "12px", color: "var(--zinc-500)", textAlign: "center" }}>
              익명 입장 기준입니다. 학생 명단은 노출되지 않으며 다음 단계와 동시에 진행할 수 있어요.
            </p>
          </div>
        </article>

        <article className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Step 03 · 강의자료 PDF</div>
              <div className="card-sub">전체 PDF가 학생 화면 왼쪽에 그대로 표시됩니다.</div>
            </div>
            <span className="pill pill-brand">PDF only</span>
          </div>

          <div className="card-pad">
            <label htmlFor="pdfInput" style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              minHeight: "200px", borderRadius: "12px",
              backgroundColor: "var(--brand-softer)",
              backgroundImage: `
                linear-gradient(var(--brand-ring) 1px, transparent 1px),
                linear-gradient(90deg, var(--brand-ring) 1px, transparent 1px)
              `,
              backgroundSize: "28px 28px",
              border: "1.5px dashed var(--brand-2)",
              cursor: "pointer", textAlign: "center", padding: "20px",
              transition: "var(--t)",
              position: "relative", overflow: "hidden"
            }}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            >
              <input id="pdfInput" type="file" accept="application/pdf" onChange={handlePdfUpload} style={{ display: "none" }} />
              <div style={{
                width: "48px", height: "48px", borderRadius: "14px", background: "#fff",
                display: "grid", placeItems: "center", boxShadow: "var(--sh-1)"
              }}>
                <CloudUpload size={22} color="var(--brand)" />
              </div>
              <p style={{ marginTop: "12px", fontSize: "16px", fontWeight: "600", margin: "3px 0" }}>
                {pdfFileName ? pdfFileName : "PDF 파일을 드래그하거나 클릭해 업로드"}
              </p>
              <p style={{ marginTop: "4px", fontSize: "12px", color: "var(--zinc-500)", margin: "0" }}>최대 20MB · PDF 형식만</p>
            </label>

            {pdfFileName && (
              <div style={{
                marginTop: "12px", padding: "12px 14px", background: "var(--zinc-50)",
                borderRadius: "11px", display: "flex", alignItems: "center", gap: "10px"
              }}>
                <div style={{
                  width: "36px", height: "36px", borderRadius: "8px",
                  background: "var(--danger-50)", color: "var(--danger-600)",
                  display: "grid", placeItems: "center", fontWeight: "700", fontSize: "11px"
                }}>PDF</div>
                <div style={{ flex: "1", minWidth: "0" }}>
                  <div style={{ fontSize: "13px", fontWeight: "600" }}>{pdfFileName}</div>
                  <div style={{ fontSize: "11px", color: "var(--zinc-500)" }}>{pdfTotal}p</div>
                </div>
                <button className="btn btn-ghost btn-sm" type="button" onClick={handlePdfDelete}>
                  <Trash2 size={14} />
                </button>
              </div>
            )}

            <hr className="hr-soft" />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: "12px", color: "var(--zinc-500)", lineHeight: "1.6" }}>
                강의자료 페이지 변경은<br/>학생 화면에 실시간 연동됩니다.
              </div>
              <button className="btn btn-primary btn-lg" type="button" disabled={!pdfFileName} onClick={handleStartClass}>
                <Play size={16} />
                수업 시작하기
              </button>
            </div>
          </div>
        </article>
      </div>
      </section>
    </RoleLayout>
  );
}

export default TeacherSetupPage;
