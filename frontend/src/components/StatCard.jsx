function StatCard({ label, value, tone }) {
  return (
    <article className={`stat-card ${tone || ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export default StatCard;
