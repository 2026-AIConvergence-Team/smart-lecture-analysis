import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";

function PdfViewer({ pdfData, currentPage = 1, onPageChange, role = "prof" }) {
  const canvasRef = useRef(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    if (!pdfData) return;

    const initPdf = async () => {
      try {
        if (typeof window !== "undefined" && window.pdfjsLib) {
          const pdf = await window.pdfjsLib.getDocument({ data: pdfData }).promise;
          setPdfDoc(pdf);
          setTotalPages(pdf.numPages);
        }
      } catch (error) {
        console.error("PDF 로딩 실패:", error);
      }
    };

    initPdf();
  }, [pdfData]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(currentPage);
        const viewport = page.getViewport({ scale: zoom });

        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({
          canvasContext: context,
          viewport: viewport,
        }).promise;
      } catch (error) {
        console.error("페이지 렌더링 실패:", error);
      }
    };

    renderPage();
  }, [pdfDoc, currentPage, zoom]);

  const handlePrevPage = () => {
    if (currentPage > 1) {
      onPageChange?.(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      onPageChange?.(currentPage + 1);
    }
  };

  const handleZoomIn = () => setZoom((z) => z + 0.1);
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.1, 0.5));

  if (!pdfData) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          background: "var(--zinc-50)",
          borderRadius: 8,
          color: "var(--zinc-500)",
        }}
      >
        PDF를 업로드해주세요
      </div>
    );
  }

  return (
    <div className="pdf-frame fill">
      <div className="pdf-toolbar">
        <div className="group">
          <button className="grp-btn" type="button" onClick={handlePrevPage} disabled={currentPage <= 1}>이전</button>
          <span className="mono">{currentPage} / {totalPages}</span>
          <button className="grp-btn" type="button" onClick={handleNextPage} disabled={currentPage >= totalPages}>다음</button>
        </div>
        <div className="mono">{Math.round(zoom * 100)}%</div>
        <div className="group">
          <button className="grp-btn" type="button" onClick={handleZoomOut} disabled={zoom <= 0.5}>−</button>
          <span className="mono">{Math.round(zoom * 100)}%</span>
          <button className="grp-btn" type="button" onClick={handleZoomIn}>+</button>
        </div>
      </div>

      <div className="pdf-stage">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

export default PdfViewer;
