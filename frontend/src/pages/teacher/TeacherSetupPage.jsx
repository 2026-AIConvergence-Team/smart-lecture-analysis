import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, CloudUpload, Copy, Play, QrCode, Ticket, Trash2 } from "lucide-react";
import RoleLayout from "../../components/RoleLayout.jsx";
import { clearSession, setPdfCache } from "../../data/sessionCache.js";
import {
  analyzePdf,
  createLecture,
  generateClassCode,
  getConcepts,
  updateLectureStatus,
  uploadPdf,
} from "../../api/lectureApi.js";
import useBroadcastChannel from "../../hooks/useBroadcastChannel.js";

function estimatePdfPages(data) {
  try {
    const text = new TextDecoder("latin1").decode(data);
    const matches = text.match(/\/Type\s*\/Page\b/g);
    return matches?.length || 0;
  } catch {
    return 0;
  }
}

function TeacherSetupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const courseId = location.state?.courseId || null;
  const courseName = location.state?.courseName || "강의";
  const week = location.state?.week || 1;
  const courseMeta = location.state?.courseMeta || "";
  const lectureTitle = location.state?.lectureTitle?.trim() || `${courseName} ${week}주차`;
  const existingLectureId = location.state?.lectureId || null;
  const initialClassCode = location.state?.classCode || "";
  const initialPdfFileName = location.state?.pdfFileName || null;
  const initialPdfTotal = location.state?.pdfTotal || 8;

  const emit = useBroadcastChannel("quizsync-v2");
  const createdRef = useRef(false);

  const [lectureId, setLectureId] = useState(existingLectureId);
  const [lectureError, setLectureError] = useState("");
  const [code, setCode] = useState(initialClassCode);
  const [issuingCode, setIssuingCode] = useState(false);
  const [joinCount, setJoinCount] = useState(0);

  const [pdfFile, setPdfFile] = useState(null);
  const [pdfFileName, setPdfFileName] = useState(initialPdfFileName);
  const [pdfReady, setPdfReady] = useState(Boolean(initialPdfFileName));
  const [pdfUploadError, setPdfUploadError] = useState(null);
  const [pdfTotal, setPdfTotal] = useState(initialPdfTotal);
  const [currentQuizSet, setCurrentQuizSet] = useState([]);

  useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;

    if (existingLectureId) {
      emit("LECTURE_CHANGED", { lectureId: existingLectureId });
      return;
    }

    const today = new Date();
    const date = today.toISOString().split("T")[0];
    const time = today.toTimeString().slice(0, 5);

    createLecture({ title: lectureTitle, date, time, ...(courseId && { course_id: courseId }) })
      .then((data) => {
        const id = data.lecture_id ?? data.id;
        setLectureId(id);
        emit("LECTURE_CHANGED", { lectureId: id });
      })
      .catch((err) => {
        setLectureError(err.message || "강의를 생성하지 못했습니다.");
        console.error("강의 생성 실패:", err);
      });
  }, [courseId, emit, existingLectureId, lectureTitle]);

  useEffect(() => {
    if (!lectureId || !pdfFile) return;

    uploadPdf(lectureId, pdfFile)
      .then((data) => {
        if (data?.file_name) setPdfFileName(data.file_name);
        if (data?.total_pages) setPdfTotal(data.total_pages);
        return analyzePdf(lectureId);
      })
      .then(() => getConcepts(lectureId))
      .catch((err) => {
        setPdfUploadError(err.message || "PDF 처리 중 오류가 발생했습니다.");
      });
  }, [lectureId, pdfFile]);

  useEffect(() => {
    if (!code) return undefined;

    const interval = setInterval(() => {
      setJoinCount((prev) => Math.min(prev + Math.floor(Math.random() * 3), 32));
    }, 2000);
    return () => clearInterval(interval);
  }, [code]);

  const processPdfFile = (file) => {
    if (file.type !== "application/pdf") {
      alert("PDF 파일만 업로드 가능합니다.");
      return;
    }

    setPdfFileName(file.name);
    setPdfReady(false);
    setPdfUploadError(null);

    file.arrayBuffer().then((buf) => {
      const pdfBytes = new Uint8Array(buf);
      const localTotal = estimatePdfPages(pdfBytes) || 12;
      setPdfTotal(localTotal);
      setPdfCache(pdfBytes, file.name, localTotal);
      setPdfReady(true);
      setPdfFile(file);
    });
  };

  const handlePdfUpload = (event) => {
    const file = event.target.files?.[0];
    if (file) processPdfFile(file);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer.files?.[0];
    if (file) processPdfFile(file);
  };

  const handlePdfDelete = () => {
    setPdfFileName(null);
    setPdfReady(false);
    setPdfUploadError(null);
    setPdfFile(null);
    setCurrentQuizSet([]);
    clearSession();
  };

  const handleIssueCode = () => {
    if (!lectureId || issuingCode || code) return;

    setIssuingCode(true);
    generateClassCode(lectureId)
      .then((res) => {
        if (res?.class_code) {
          setCode(res.class_code);
          setJoinCount(0);
        }
      })
      .catch((err) => alert(err.message || "코드 발급에 실패했습니다."))
      .finally(() => setIssuingCode(false));
  };

  const handleCopyCode = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
  };

  const handleStartClass = () => {
    if (!pdfFileName || !pdfReady) return;

    if (lectureId) {
      updateLectureStatus(lectureId, "active").catch(() => {});
    }

    navigate("/teacher/live", {
      replace: true,
      state: {
        code: code || "미발급",
        courseId,
        courseName,
        courseMeta,
        week,
        pdfFileName,
        pdfTotal,
        currentQuizSet,
        lectureId,
      },
    });
  };

  return (
    <RoleLayout role="teacher">
      <section className="content">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
          <div>
            <p className="eyebrow">Lecture Setup</p>
            <h1 className="page-title">{lectureTitle} · 강의자료 준비</h1>
            <p className="page-sub">
              PDF 업로드와 수업 코드 발급은 서로 독립적으로 진행됩니다. 자료를 먼저 올려도 되고, 코드를 먼저 발급해도 됩니다.
            </p>
          </div>
          <button className="btn btn-ghost" type="button" onClick={() => navigate("/teacher/courses")}>
            <ChevronLeft size={14} />
            과목 목록
          </button>
        </div>

        {lectureError && (
          <div className="card card-pad" style={{ marginTop: 18, color: "var(--danger)" }}>
            {lectureError}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.35fr) 360px",
            gap: 18,
            alignItems: "start",
            marginTop: 24,
          }}
        >
          <article className="card flow-card">
            <div className="card-head">
              <div>
                <div className="card-title">강의자료 PDF</div>
                <div className="card-sub">수업에서 사용할 PDF를 크게 업로드하고 확인합니다.</div>
              </div>
              <span className={`pill ${pdfFileName ? "pill-success" : "pill-brand"}`}>
                {pdfFileName ? "업로드 완료" : "PDF only"}
              </span>
            </div>

            <div className="card-pad-lg">
              <label
                htmlFor="pdfInput"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: "460px",
                  borderRadius: "14px",
                  backgroundColor: "var(--brand-softer)",
                  backgroundImage: `
                    linear-gradient(var(--brand-ring) 1px, transparent 1px),
                    linear-gradient(90deg, var(--brand-ring) 1px, transparent 1px)
                  `,
                  backgroundSize: "30px 30px",
                  border: "2px dashed var(--brand-2)",
                  cursor: "pointer",
                  textAlign: "center",
                  padding: "32px",
                  transition: "var(--t)",
                  position: "relative",
                  overflow: "hidden",
                }}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                <input id="pdfInput" type="file" accept="application/pdf" onChange={handlePdfUpload} style={{ display: "none" }} />
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 18,
                    background: "#fff",
                    display: "grid",
                    placeItems: "center",
                    boxShadow: "var(--sh-2)",
                    color: "var(--brand)",
                  }}
                >
                  <CloudUpload size={32} />
                </div>
                <p style={{ marginTop: 18, fontSize: 22, fontWeight: 700, color: "var(--zinc-900)" }}>
                  {pdfFileName || "PDF 파일을 업로드하세요"}
                </p>
                <p style={{ marginTop: 6, fontSize: 13, color: "var(--zinc-500)" }}>
                  파일을 드래그하거나 클릭해서 선택할 수 있습니다. 최대 20MB · PDF 형식만 지원합니다.
                </p>
              </label>

              {pdfFileName && (
                <div
                  style={{
                    marginTop: 14,
                    padding: "14px 16px",
                    background: "var(--zinc-50)",
                    border: "1px solid var(--zinc-200)",
                    borderRadius: 12,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 10,
                      background: "var(--danger-50)",
                      color: "var(--danger-600)",
                      display: "grid",
                      placeItems: "center",
                      fontWeight: 800,
                      fontSize: 12,
                    }}
                  >
                    PDF
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{pdfFileName}</div>
                    <div style={{ fontSize: 12, color: "var(--zinc-500)", marginTop: 2 }}>{pdfTotal}p</div>
                  </div>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={handlePdfDelete}>
                    <Trash2 size={14} />
                    삭제
                  </button>
                </div>
              )}

              {pdfUploadError && (
                <p style={{ marginTop: 10, fontSize: 12, color: "var(--danger)", textAlign: "center" }}>
                  {pdfUploadError}
                </p>
              )}
            </div>
          </article>

          <aside style={{ display: "grid", gap: 14 }}>
            <article className="card">
              <div className="card-head">
                <div>
                  <div className="card-title">수업 코드</div>
                  <div className="card-sub">PDF 업로드 전후 언제든 발급할 수 있습니다.</div>
                </div>
              </div>
              <div className="card-pad">
                <div
                  className="mono"
                  style={{
                    minHeight: 86,
                    display: "grid",
                    placeItems: "center",
                    borderRadius: 14,
                    background: code ? "var(--brand-soft)" : "var(--zinc-50)",
                    color: code ? "var(--brand-deep)" : "var(--zinc-400)",
                    fontSize: code ? 42 : 24,
                    fontWeight: 800,
                  }}
                >
                  {code || "미발급"}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
                  <button className="btn btn-primary btn-sm" type="button" onClick={handleIssueCode} disabled={!lectureId || issuingCode || !!code}>
                    <Ticket size={14} />
                    {issuingCode ? "발급 중..." : code ? "발급 완료" : "코드 발급"}
                  </button>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={handleCopyCode} disabled={!code}>
                    <Copy size={14} />
                    복사
                  </button>
                </div>
                <button className="btn btn-ghost btn-sm" type="button" disabled={!code} style={{ width: "100%", marginTop: 8 }}>
                  <QrCode size={14} />
                  QR 보기
                </button>

                <div className="join-counter" style={{ marginTop: 14 }}>
                  <span className="dot" />
                  {code ? (
                    <>
                      지금 <span style={{ fontWeight: 700, color: "var(--zinc-900)" }}>{joinCount}</span>명이 입장하고 있어요
                    </>
                  ) : (
                    "코드를 발급하면 학생 입장이 가능해집니다"
                  )}
                </div>
              </div>
            </article>

            <article className="card">
              <div className="card-pad">
                <div style={{ fontSize: 12, color: "var(--zinc-500)", lineHeight: 1.7 }}>
                  {courseMeta || "강의 정보가 등록되었습니다."}
                  <br />
                  PDF만 업로드되어 있어도 강의실을 열 수 있습니다.
                </div>
                <button
                  className="btn btn-primary btn-lg"
                  type="button"
                  disabled={!pdfFileName || !pdfReady}
                  onClick={handleStartClass}
                  style={{ width: "100%", marginTop: 14 }}
                >
                  <Play size={16} />
                  PDF 업로드
                </button>
              </div>
            </article>
          </aside>
        </div>
      </section>
    </RoleLayout>
  );
}

export default TeacherSetupPage;
