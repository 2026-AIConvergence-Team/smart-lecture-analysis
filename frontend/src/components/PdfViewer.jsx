import { useEffect, useRef, useState } from "react";
import { Expand, Hourglass, Minimize2, UserRound, ZoomIn, ZoomOut } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

function toUint8Array(data) {
  if (!data) return null;
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return null;
}

function PdfViewer({
  pdfData,
  currentPage = 1,
  onPageChange,
  onTotalPagesChange,
  pdfFileName,
  role = "teacher",
  initialTotalPages = 0,
  variant = "live",
}) {
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const update = () => {
      const rect = stage.getBoundingClientRect();
      setStageSize({ width: rect.width, height: rect.height });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [variant, pdfData]);

  useEffect(() => {
    let cancelled = false;
    const bytes = toUint8Array(pdfData);

    renderTaskRef.current?.cancel();
    setPdfDoc(null);

    if (!bytes) {
      setTotalPages(initialTotalPages || 0);
      return () => {
        cancelled = true;
      };
    }

    pdfjsLib
      .getDocument({ data: bytes.slice() })
      .promise.then((doc) => {
        if (cancelled) {
          doc.destroy();
          return;
        }
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        onTotalPagesChange?.(doc.numPages);
      })
      .catch((err) => {
        if (!cancelled) console.error("PDF load failed:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [pdfData, initialTotalPages, onTotalPagesChange]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || stageSize.width <= 0 || stageSize.height <= 0) return;

    let cancelled = false;

    async function renderPage() {
      try {
        renderTaskRef.current?.cancel();
        const safePage = Math.min(Math.max(currentPage, 1), pdfDoc.numPages);
        const page = await pdfDoc.getPage(safePage);
        if (cancelled) return;

        const base = page.getViewport({ scale: 1 });
        const padding = variant === "review" ? 0 : 16;
        const availableWidth = Math.max(120, stageSize.width - padding);
        const availableHeight = Math.max(120, stageSize.height - padding);
        const fitScale = Math.min(availableWidth / base.width, availableHeight / base.height);
        const scale = fitScale * (zoom / 100);
        const viewport = page.getViewport({ scale });
        const dpr = window.devicePixelRatio || 1;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, viewport.width, viewport.height);

        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
      } catch (err) {
        if (!cancelled && err?.name !== "RenderingCancelledException") {
          console.error("PDF render failed:", err);
        }
      }
    }

    renderPage();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [pdfDoc, currentPage, stageSize, variant, zoom]);

  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) onPageChange?.(totalPages);
  }, [currentPage, totalPages, onPageChange]);

  const safePage = Math.min(Math.max(currentPage, 1), totalPages || currentPage || 1);
  const hasPdf = Boolean(pdfData && pdfDoc);

  const handlePrev = () => {
    if (safePage > 1) onPageChange?.(safePage - 1);
  };

  const handleNext = () => {
    if (totalPages && safePage < totalPages) onPageChange?.(safePage + 1);
  };

  const handleZoomOut = () => setZoom((value) => Math.max(50, value - 10));
  const handleZoomIn = () => setZoom((value) => Math.min(200, value + 10));
  const pageLabel = `${safePage} / ${totalPages || "-"}`;

  if (variant === "review") {
    return (
      <div className="pdf-frame pdf-frame-review">
        <div className="pdf-stage pdf-stage-review" ref={stageRef}>
          {hasPdf ? (
            <canvas ref={canvasRef} />
          ) : (
            <div className="pdf-empty pdf-empty-review">
              <Hourglass size={28} />
              <strong>강의자료 없음</strong>
              <span>수업에서 사용한 PDF가 여기에 표시됩니다</span>
            </div>
          )}
        </div>
        <div className="pdf-review-nav">
          <button className="btn btn-ghost btn-sm" type="button" onClick={handlePrev} disabled={!hasPdf || safePage <= 1}>
            이전
          </button>
          <span className="mono">p.{pageLabel}</span>
          <button className="btn btn-ghost btn-sm" type="button" onClick={handleNext} disabled={!hasPdf || safePage >= totalPages}>
            다음
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`pdf-frame fill ${isFullscreen ? "pdf-fullscreen" : ""}`}>
      <div className="pdf-toolbar pdf-toolbar-live">
        {role === "student" ? (
          <>
            <div className="group">
              <span className="grp-btn sync-label">
                <UserRound size={13} />
                교수자 화면 동기화
              </span>
            </div>
            <span className="mono pdf-page-center">{pageLabel}</span>
            <div className="group">
              <button
                className="grp-btn icon-only"
                type="button"
                onClick={() => setIsFullscreen((value) => !value)}
                title={isFullscreen ? "전체화면 닫기" : "강의자료 크게 보기"}
              >
                {isFullscreen ? <Minimize2 size={14} /> : <Expand size={14} />}
              </button>
            </div>
          </>
        ) : hasPdf ? (
          <>
            <div className="group">
              <button className="grp-btn" type="button" onClick={handlePrev} disabled={safePage <= 1}>이전</button>
              <span className="mono">{pageLabel}</span>
              <button className="grp-btn" type="button" onClick={handleNext} disabled={safePage >= totalPages}>다음</button>
            </div>
            <div className="mono pdf-file-name">{pdfFileName || ""}</div>
            <div className="group pdf-zoom-group">
              <button className="grp-btn icon-only" type="button" onClick={handleZoomOut} disabled={zoom <= 50}>
                <ZoomOut size={14} />
              </button>
              <span className="mono">{zoom}%</span>
              <button className="grp-btn icon-only" type="button" onClick={handleZoomIn} disabled={zoom >= 200}>
                <ZoomIn size={14} />
              </button>
              <button
                className="grp-btn icon-only"
                type="button"
                onClick={() => setIsFullscreen((value) => !value)}
                title={isFullscreen ? "전체화면 닫기" : "강의자료 크게 보기"}
              >
                {isFullscreen ? <Minimize2 size={14} /> : <Expand size={14} />}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="group">
              <span className="grp-btn sync-label">
                <UserRound size={13} />
                교수자 화면 동기화
              </span>
            </div>
            <span className="mono pdf-page-center">1 / -</span>
            <div className="group">
              <button
                className="grp-btn icon-only"
                type="button"
                onClick={() => setIsFullscreen((value) => !value)}
                title={isFullscreen ? "전체화면 닫기" : "강의자료 크게 보기"}
              >
                {isFullscreen ? <Minimize2 size={14} /> : <Expand size={14} />}
              </button>
            </div>
          </>
        )}
      </div>

      <div className={`pdf-stage ${zoom > 100 ? "zoomed" : ""}`} ref={stageRef}>
        {hasPdf ? (
          <canvas ref={canvasRef} />
        ) : (
          <div className="pdf-empty">
            <Hourglass size={46} />
            <strong>강의자료 업로드 전</strong>
            <span>교수님이 자료를 올리면 여기에 표시돼요</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default PdfViewer;
