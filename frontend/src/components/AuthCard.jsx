function AuthCard({ title, subtitle, children }) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">C</span>
          <span>Classtone</span>
        </div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
        {children}
      </section>
    </main>
  );
}

export default AuthCard;
