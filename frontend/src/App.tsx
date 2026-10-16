
import { useEffect, useState } from "react";
import "./App.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

function App() {
  const [apiStatus, setApiStatus] = useState<
    "checking" | "connected" | "offline"
  >("checking");

  useEffect(() => {
    let active = true;

    fetch(`${API_BASE_URL}/api/health`)
      .then((response) => {
        if (!response.ok) throw new Error("API unavailable");
        return response.json();
      })
      .then(() => {
        if (active) setApiStatus("connected");
      })
      .catch(() => {
        if (active) setApiStatus("offline");
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-icon">o</span>
          <span>opsflow</span>
        </a>

        <div className="nav-section-label">WORKSPACE</div>

        <div className="nav-item active">
          <span className="nav-symbol">▦</span>
          Overview
        </div>

        <div className="nav-item">
          <span className="nav-symbol">☷</span>
          Work items
        </div>

        <div className="nav-item">
          <span className="nav-symbol">◷</span>
          Activity
        </div>

        <div className="sidebar-bottom">
          <div className="connection-label">
            <span
              className={`status-dot ${apiStatus}`}
            />
            {apiStatus === "connected"
              ? "API connected"
              : apiStatus === "offline"
                ? "API unavailable"
                : "Connecting"}
          </div>
          <span className="version-label">OpsFlow · v0.1.0</span>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <span className="breadcrumb">Workspace / Overview</span>
          <span className="environment-label">Development</span>
        </header>

        <section className="content">
          <div className="page-heading">
            <div>
              <h1>Overview</h1>
              <p>A central place to manage operational work.</p>
            </div>
          </div>

          <div className="notice">
            <span className="notice-mark">i</span>
            <div>
              <strong>Workspace initialized</strong>
              <p>
                The application foundation is ready.
                Work items and team data will be added next.
              </p>
            </div>
          </div>

          <div className="section-heading">
            <h2>Workspace summary</h2>
            <span>Live data will appear here in the next milestones.</span>
          </div>

          <div className="summary-grid">
            <div className="summary-item">
              <span>Open items</span>
              <strong>—</strong>
              <small>Awaiting implementation</small>
            </div>

            <div className="summary-item">
              <span>Assigned to me</span>
              <strong>—</strong>
              <small>Awaiting implementation</small>
            </div>

            <div className="summary-item">
              <span>Needs attention</span>
              <strong>—</strong>
              <small>Awaiting implementation</small>
            </div>
          </div>

          <section className="recent-section">
            <div className="section-heading">
              <h2>Recent work</h2>
            </div>

            <div className="empty-state">
              <div className="empty-symbol">☷</div>
              <strong>No work items yet</strong>
              <p>
                Work items will appear here once the
                management API is implemented.
              </p>
            </div>
          </section>

          <footer className="page-footer">
            Internal operations workspace
          </footer>
        </section>
      </main>
    </div>
  );
}

export default App;
