function DonutChart({ choices = [], counts = [], correctIdx = 0 }) {
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  const colors = [
    "#10b981", // 초록 (정답)
    "#ef4444", // 빨강 (오답)
    "#f59e0b", // 주황
    "#6366f1", // 보라
  ];

  let angle = 0;
  const segments = counts.map((count, idx) => {
    const sliceAngle = (count / total) * 360;
    const startAngle = angle;
    const endAngle = angle + sliceAngle;

    const x1 = 52 + 50 * Math.cos((startAngle * Math.PI) / 180);
    const y1 = 52 + 50 * Math.sin((startAngle * Math.PI) / 180);
    const x2 = 52 + 50 * Math.cos((endAngle * Math.PI) / 180);
    const y2 = 52 + 50 * Math.sin((endAngle * Math.PI) / 180);

    const largeArc = sliceAngle > 180 ? 1 : 0;

    const path = `M 52 52 L ${x1} ${y1} A 50 50 0 ${largeArc} 1 ${x2} ${y2} Z`;

    angle = endAngle;

    return {
      path,
      color: idx === correctIdx ? colors[0] : colors[idx % colors.length],
      count,
      percentage: Math.round((count / total) * 100),
    };
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* 도넛 차트 */}
      <svg width="104" height="104" viewBox="0 0 104 104" style={{ margin: "0 auto" }}>
        {segments.map((seg, idx) => (
          <path
            key={idx}
            d={seg.path}
            fill={seg.color}
            stroke="white"
            strokeWidth="1"
          />
        ))}
        <circle cx="52" cy="52" r="28" fill="white" />
      </svg>

      {/* 범례 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {choices.map((choice, idx) => (
          <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: idx === correctIdx ? colors[0] : colors[idx % colors.length],
              }}
            />
            <span style={{ fontSize: 12, flex: 1, color: "var(--zinc-600)" }}>
              {choice}
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--zinc-900)" }}>
              {segments[idx]?.percentage || 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default DonutChart;
