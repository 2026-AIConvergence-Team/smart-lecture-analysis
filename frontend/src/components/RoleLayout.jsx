import { useState } from "react";
import Sidebar from "./Sidebar.jsx";
import Topbar from "./Topbar.jsx";

function RoleLayout({ children, role = "teacher" }) {
  return (
    <div className="app-shell">
      <Sidebar role={role} />
      <main className="main">
        <Topbar role={role} />
        {children}
      </main>
    </div>
  );
}

export default RoleLayout;
