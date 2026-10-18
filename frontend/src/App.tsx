import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, MouseEvent } from "react";
import { flushSync } from "react-dom";
import "./App.css";

const API = (import.meta.env.VITE_API_BASE_URL || (window.location.hostname === "localhost" ? "http://localhost:8000" : window.location.origin)).replace(/\/$/, "");
async function responseError(response: Response, fallback: string) {
  const body = await response.text();
  try {
    const data: unknown = JSON.parse(body);
    if (data && typeof data === "object" && "detail" in data && typeof data.detail === "string") return data.detail;
  } catch { /* The platform may return plain text or HTML for server errors. */ }
  const message = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return message ? `${fallback} (${response.status}): ${message.slice(0, 180)}` : `${fallback} (${response.status})`;
}
type User = { id: number; email: string; full_name: string };
type Item = { id: number; title: string; description: string | null; status: "open" | "in_progress" | "blocked" | "done"; priority: "low" | "medium" | "high" | "urgent"; version: number; team_id: number | null; assignee_id: number | null; created_at: string };
type Team = { id: number; name: string; role: string };
type Activity = { id: number; actor_id: number; action: string; details: Record<string, unknown>; created_at: string };
type Notice = { kind: "error" | "success"; text: string };
type Theme = "light" | "dark";
type ViewTransitionDocument = Document & { startViewTransition?: (update: () => void) => { ready: Promise<void> } };

const STATUS_LABEL: Record<Item["status"], string> = { open: "Open", in_progress: "In progress", blocked: "Blocked", done: "Done" };
const shortDate = (value: string) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));

const iconProps = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
const SunIcon = () => <svg {...iconProps}><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></svg>;
const MoonIcon = () => <svg {...iconProps}><path d="M20 14.2A8 8 0 0 1 9.8 4 8 8 0 1 0 20 14.2Z" /></svg>;
const CloseIcon = () => <svg {...iconProps}><path d="M6 6l12 12M18 6 6 18" /></svg>;

function App() {
  const [token, setToken] = useState(() => localStorage.getItem("opsflow_token") || "");
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [view, setView] = useState<"overview" | "work">("overview");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [showCreate, setShowCreate] = useState(false);
  const [showTeam, setShowTeam] = useState(false);
  const [selected, setSelected] = useState<Item | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme === "dark" ? "dark" : "light"));

  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${API}${path}`, {
      ...init,
      headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
    });
    if (!response.ok) {
      throw new Error(await responseError(response, "Request failed"));
    }
    return response.status === 204 ? null : response.json();
  }, [token]);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [me, work, myTeams] = await Promise.all([
        request("/api/auth/me"), request("/api/work-items/?page=1&page_size=100"), request("/api/teams"),
      ]);
      setUser(me); setItems(work); setTeams(myTeams);
    } catch (error) {
      localStorage.removeItem("opsflow_token"); setToken(""); setUser(null);
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not load your workspace." });
    } finally { setLoading(false); }
  }, [request, token]);

  // Load remote workspace state when authentication changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh(); }, [refresh]);

  const visibleItems = useMemo(() => items.filter((item) => {
    const matchesQuery = `${item.title} ${item.description || ""}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (statusFilter === "all" || item.status === statusFilter);
  }), [items, query, statusFilter]);
  const openCount = items.filter((item) => item.status !== "done").length;
  const blockedCount = items.filter((item) => item.status === "blocked").length;
  const urgentCount = items.filter((item) => item.priority === "urgent" && item.status !== "done").length;
  const doneCount = items.filter((item) => item.status === "done").length;
  const attentionCount = blockedCount + urgentCount;

  // Theme toggle: the new theme is revealed as a circle growing out of the button.
  function toggleTheme(event: MouseEvent<HTMLButtonElement>) {
    const next: Theme = theme === "dark" ? "light" : "dark";
    const commit = () => {
      document.documentElement.dataset.theme = next;
      setTheme(next);
      try { localStorage.setItem("opsflow_theme", next); } catch { /* storage unavailable */ }
    };
    const doc = document as ViewTransitionDocument;
    if (!doc.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { commit(); return; }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const transition = doc.startViewTransition(() => flushSync(commit));
    void transition.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 650, easing: "cubic-bezier(.4, 0, .2, 1)", pseudoElement: "::view-transition-new(root)" },
      );
    });
  }

  const themeButton = (
    <button className="icon-button" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={theme === "dark" ? "Light mode" : "Dark mode"}>
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setNotice(null);
    const values = new FormData(event.currentTarget);
    try {
      if (authMode === "register") {
        const registration = await fetch(`${API}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: values.get("email"), full_name: values.get("name"), password: values.get("password") }) });
        if (!registration.ok) throw new Error(await responseError(registration, "Could not create account"));
      }
      const login = new URLSearchParams({ username: String(values.get("email")), password: String(values.get("password")) });
      const response = await fetch(`${API}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: login });
      if (!response.ok) throw new Error(await responseError(response, "Could not sign in"));
      const data = await response.json();
      const nextToken = data.access_token; localStorage.setItem("opsflow_token", nextToken); setToken(nextToken); setNotice(null);
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Authentication failed." }); }
  }

  async function createItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = new FormData(event.currentTarget);
    try {
      await request("/api/work-items/", { method: "POST", body: JSON.stringify({ title: values.get("title"), description: values.get("description") || null, priority: values.get("priority"), team_id: values.get("team_id") ? Number(values.get("team_id")) : null }) });
      setShowCreate(false); setNotice({ kind: "success", text: "Work item created." }); await refresh();
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not create work item." }); }
  }

  async function createTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = new FormData(event.currentTarget);
    try { await request("/api/teams", { method: "POST", body: JSON.stringify({ name: values.get("name") }) }); setShowTeam(false); setNotice({ kind: "success", text: "Team created. You are its admin." }); await refresh(); }
    catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not create team." }); }
  }

  async function changeStatus(item: Item, status: Item["status"]) {
    try {
      const updated = await request(`/api/work-items/${item.id}`, { method: "PATCH", body: JSON.stringify({ status, version: item.version }) });
      setItems((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
      if (selected?.id === item.id) setSelected(updated);
      setNotice({ kind: "success", text: "Status updated." });
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not update item." }); await refresh(); }
  }

  async function openActivity(item: Item) {
    setSelected(item); setActivity([]);
    try { setActivity(await request(`/api/work-items/${item.id}/activity?page=1&page_size=20`)); }
    catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not load activity." }); }
  }

  function signOut() {
    localStorage.removeItem("opsflow_token"); setToken(""); setUser(null); setItems([]);
  }

  const noticeBar = notice && (
    <div className={`notice ${notice.kind}`} role="status">
      <span>{notice.text}</span>
      <button onClick={() => setNotice(null)} aria-label="Dismiss">Dismiss</button>
    </div>
  );

  if (!token || !user) {
    const isLogin = authMode === "login";
    return (
      <div className="auth">
        <div className="auth-top">
          <span className="brand">opsflow</span>
          {themeButton}
        </div>
        <main className="auth-body">
          <h1>{isLogin ? "Sign in" : "Create an account"}</h1>
          <p className="lede">Keep track of what needs doing, and who is doing it.</p>
          {noticeBar}
          <form onSubmit={authenticate} className="form-stack">
            {!isLogin && <label>Full name<input name="name" required minLength={2} autoComplete="name" /></label>}
            <label>Email<input name="email" type="email" required autoComplete="email" /></label>
            <label>Password<input name="password" type="password" required minLength={8} autoComplete={isLogin ? "current-password" : "new-password"} /></label>
            <button className="button primary full" type="submit">{isLogin ? "Sign in" : "Create account"}</button>
          </form>
          <p className="switch">
            {isLogin ? "New here?" : "Already have an account?"}{" "}
            <button className="text-button" onClick={() => { setAuthMode(isLogin ? "register" : "login"); setNotice(null); }}>{isLogin ? "Create an account" : "Sign in"}</button>
          </p>
        </main>
      </div>
    );
  }

  const firstName = user.full_name.split(" ")[0];
  const filtering = Boolean(query) || statusFilter !== "all";

  return (
    <div className="page">
      <header className="header">
        <a className="brand" href="#overview" onClick={() => setView("overview")}>opsflow</a>
        <nav className="nav" aria-label="Main">
          <button className={view === "overview" ? "on" : ""} onClick={() => setView("overview")}>Overview</button>
          <button className={view === "work" ? "on" : ""} onClick={() => setView("work")}>Work<span className="count">{openCount}</span></button>
        </nav>
        <div className="header-end">
          {loading && <span className="sync">Syncing…</span>}
          {themeButton}
          <button className="text-button" onClick={signOut} title={user.email}>Sign out</button>
        </div>
      </header>

      <main className="main">
        <div className="heading">
          <div>
            <h1>{view === "overview" ? `Hi, ${firstName}` : "Work"}</h1>
            {view === "overview" && (
              <p className="lede">
                {items.length === 0
                  ? "Nothing here yet. Add the first thing that needs doing."
                  : `${openCount} open${attentionCount ? `, ${attentionCount} need${attentionCount === 1 ? "s" : ""} attention` : ""}, ${doneCount} done.`}
              </p>
            )}
          </div>
          <button className="button primary" onClick={() => setShowCreate(true)}>New item</button>
        </div>

        {noticeBar}

        <div className="teams">
          <span className="teams-label">Teams</span>
          {teams.map((team) => <span className="team" key={team.id}>{team.name}{team.role === "admin" && <em>admin</em>}</span>)}
          <button className="text-button" onClick={() => setShowTeam(true)}>{teams.length ? "New team" : "Create a team"}</button>
        </div>

        <div className="toolbar">
          <input className="search" type="search" aria-label="Search work" placeholder="Search" value={query} onChange={(event) => setQuery(event.target.value)} />
          <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            {Object.entries(STATUS_LABEL).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </div>

        {visibleItems.length ? (
          <ul className="list">
            {visibleItems.map((item) => (
              <li className="row" key={item.id}>
                <button className="row-main" onClick={() => void openActivity(item)}>
                  <span className="row-title">{item.title}</span>
                  <span className="row-desc">{item.description || "No description"}</span>
                </button>
                <div className="row-meta">
                  <span className={`priority ${item.priority}`}>{item.priority}</span>
                  <span className="date">{shortDate(item.created_at)}</span>
                  <select className={`status ${item.status}`} aria-label={`Change status of ${item.title}`} value={item.status} onChange={(event) => void changeStatus(item, event.target.value as Item["status"])}>
                    {Object.entries(STATUS_LABEL).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                  </select>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty">
            <strong>{filtering ? "Nothing matches" : "No work items yet"}</strong>
            <p>{filtering ? "Try a different search or status." : "Add a request, set how urgent it is, and it will show up here."}</p>
            {!filtering && <button className="button secondary" onClick={() => setShowCreate(true)}>Add the first item</button>}
          </div>
        )}
      </main>

      {showCreate && (
        <div className="backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCreate(false); }}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="create-title">
            <div className="modal-head">
              <h2 id="create-title">New work item</h2>
              <button className="icon-button" onClick={() => setShowCreate(false)} aria-label="Close"><CloseIcon /></button>
            </div>
            <form className="form-stack" onSubmit={createItem}>
              <label>Title<input name="title" required maxLength={200} placeholder="What needs to be done?" autoFocus /></label>
              <label>Details<textarea name="description" rows={4} placeholder="Anything that helps someone pick this up." /></label>
              <div className="form-pair">
                <label>Priority<select name="priority"><option value="medium">Medium</option><option value="low">Low</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
                {teams.length > 0 && <label>Team<select name="team_id"><option value="">Personal</option>{teams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label>}
              </div>
              <div className="modal-actions">
                <button type="button" className="button secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="button primary">Create item</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {showTeam && (
        <div className="backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowTeam(false); }}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="team-title">
            <div className="modal-head">
              <h2 id="team-title">New team</h2>
              <button className="icon-button" onClick={() => setShowTeam(false)} aria-label="Close"><CloseIcon /></button>
            </div>
            <p className="modal-copy">You will be the team’s admin. Adding members will come later.</p>
            <form className="form-stack" onSubmit={createTeam}>
              <label>Team name<input name="name" required minLength={2} maxLength={120} placeholder="e.g. Customer operations" autoFocus /></label>
              <div className="modal-actions">
                <button type="button" className="button secondary" onClick={() => setShowTeam(false)}>Cancel</button>
                <button type="submit" className="button primary">Create team</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {selected && (
        <div className="backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="item-title">
            <div className="modal-head">
              <h2 id="item-title">{selected.title}</h2>
              <button className="icon-button" onClick={() => setSelected(null)} aria-label="Close"><CloseIcon /></button>
            </div>
            <p className="modal-copy">{selected.description || "No description."}</p>
            <p className="facts">
              <span className={`status-text ${selected.status}`}>{STATUS_LABEL[selected.status]}</span>
              <span className={`priority ${selected.priority}`}>{selected.priority} priority</span>
              <span>#{selected.id}</span>
            </p>
            <h3 className="activity-heading">Activity</h3>
            {activity.length ? (
              <ul className="activity-list">
                {activity.map((entry) => (
                  <li className="activity-entry" key={entry.id}>
                    <strong>{entry.action === "created" ? "Created" : "Updated"}</strong>
                    <span>{entry.action === "updated" ? `Changed ${((entry.details.fields as string[]) || []).join(", ")}` : "Added to the workspace"}</span>
                    <small>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.created_at))}</small>
                  </li>
                ))}
              </ul>
            ) : <p className="activity-empty">No activity yet.</p>}
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
