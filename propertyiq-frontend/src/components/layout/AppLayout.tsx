
import type { ReactNode } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function AppLayout({
  children
}: {
  children: ReactNode;
}) {
  return (
    <div className="piq-layout">
      <Sidebar />

      <div className="piq-main">
        <Topbar />
        <main className="piq-content">
          {children}
        </main>
      </div>
    </div>
  );
}
