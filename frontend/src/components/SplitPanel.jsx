import { useRef, useState } from "react";

function SplitPanel({ left, right, defaultRatio = 0.68, minRatio = 0.35, maxRatio = 0.80 }) {
  const splitRef = useRef(null);
  const [ratio, setRatio] = useState(defaultRatio);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = () => {
    setIsDragging(true);
  };

  const handleMouseMove = (e) => {
    if (!isDragging || !splitRef.current) return;

    const rect = splitRef.current.getBoundingClientRect();
    const newRatio = (e.clientX - rect.left) / rect.width;
    const clampedRatio = Math.max(minRatio, Math.min(newRatio, maxRatio));
    setRatio(clampedRatio);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div
      ref={splitRef}
      className="split"
      style={{
        display: "flex",
        height: "100%",
        overflow: "hidden",
        userSelect: isDragging ? "none" : "auto",
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* 좌측 패널 */}
      <div
        className="split-left"
        style={{
          flex: `0 0 ${ratio * 100}%`,
          overflow: "hidden",
          borderRight: "1px solid var(--zinc-200)",
        }}
      >
        {left}
      </div>

      {/* 핸들 */}
      <div
        className="split-handle"
        onMouseDown={handleMouseDown}
        style={{
          width: 6,
          background: isDragging ? "var(--brand-deep)" : "var(--zinc-200)",
          cursor: "col-resize",
          transition: isDragging ? "none" : "background 0.2s",
        }}
      />

      {/* 우측 패널 */}
      <div
        className="split-right"
        style={{
          flex: `0 0 ${(1 - ratio) * 100}%`,
          overflow: "auto",
        }}
      >
        {right}
      </div>
    </div>
  );
}

export default SplitPanel;
