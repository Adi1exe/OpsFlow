
import { useEffect, useState } from "react";
import "./App.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

type HealthResponse = {
  status: string;
  service: string;
};

function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [apiError, setApiError] = useState(false);

  useEffect(() => {
    let active = true;

    async function checkApi() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/health`);

        if (!response.ok) {
          throw new Error("API health check failed");
        }

        const data: HealthResponse = await response.json();

        if (active) {
          setHealth(data);
          setApiError(false);
        }
      } catch {
        if (active) {
          setHealth(null);
          setApiError(true);
        }
      }
    }

    void checkApi();

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="page">
      <nav className="navbar">
        <a className="brand" href="/" aria-label="OpsFlow home">
          <span className="brand-mark">O</span>
          <span>opsflow</span>
        </a>

        <span className="nav-label">Operations workspace</span>
      </nav>

      <section className="hero">
        <span className="eyebrow">YOUR TEAM'S WORKSPACE</span>

        <h1>
          Good work starts
          <br />
          with <span>clarity.</span>
        </h1>

        <p className="hero-description">
          A single place to organize operational work, assign ownership,
          track progress, and understand what needs attention.
        </p>

        <div className="status-card">
          <span
            className={`status-dot ${
              health ? "online" : apiError ? "offline" : "checking"
            }`}
          />

          <div className="status-copy">
            <strong>
              {health
                ? "Backend connected"
                : apiError
                  ? "Backend unavailable"
                  : "Checking backend..."}
            </strong>

            <span>
              {health
                ? `${health.service} is ${health.status}`
                : apiError
                  ? "Make sure the FastAPI server is running."
                  : "Contacting the OpsFlow API"}
            </span>
          </div>
        </div>
      </section>

      <section className="features">
        <article className="feature-card">
          <span className="feature-number">01</span>
          <h2>One source of truth</h2>
          <p>
            Keep requests and their current state in one organized workspace.
          </p>
        </article>

        <article className="feature-card">
          <span className="feature-number">02</span>
          <h2>Clear ownership</h2>
          <p>
            Make responsibilities visible so important work doesn't get lost.
          </p>
        </article>

        <article className="feature-card">
          <span className="feature-number">03</span>
          <h2>Accountable progress</h2>
          <p>
            Build a reliable history of changes, decisions, and outcomes.
          </p>
        </article>
      </section>

      <footer className="footer">
        <span>OpsFlow · Engineering challenge</span>
        <span>Segment 1 · Foundation</span>
      </footer>
    </main>
  );
}

export default App;
