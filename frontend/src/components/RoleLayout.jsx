import Topbar from "./Topbar.jsx";

function RoleLayout({ children, role = "teacher" }) {
  return (
    <div className="app-shell">
      <main className="main">
        <Topbar role={role} />
        {children}
      </main>
    </div>
  );
}

export default RoleLayout;
