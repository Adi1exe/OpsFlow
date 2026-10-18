import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import "./App.css";

const API = (import.meta.env.VITE_API_BASE_URL || (window.location.hostname === "localhost" ? "http://localhost:8000" : window.location.origin)).replace(/\/$/, "");
type User = { id: number; email: string; full_name: string };
type Item = { id: number; title: string; description: string | null; status: "open" | "in_progress" | "blocked" | "done"; priority: "low" | "medium" | "high" | "urgent"; version: number; team_id: number | null; assignee_id: number | null; created_at: string };
type Team = { id: number; name: string; role: string };
type Activity = { id: number; actor_id: number; action: string; details: Record<string, unknown>; created_at: string };
type Notice = { kind: "error" | "success"; text: string };

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

  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${API}${path}`, {
      ...init,
      headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const detail = body.detail;
      throw new Error(typeof detail === "string" ? detail : `Request failed (${response.status})`);
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

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setNotice(null);
    const values = new FormData(event.currentTarget);
    try {
      if (authMode === "register") {
        await fetch(`${API}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: values.get("email"), full_name: values.get("name"), password: values.get("password") }) }).then(async (response) => { if (!response.ok) { const data = await response.json(); throw new Error(data.detail || "Could not create account"); } });
      }
      const login = new URLSearchParams({ username: String(values.get("email")), password: String(values.get("password")) });
      const response = await fetch(`${API}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: login });
      const data = await response.json(); if (!response.ok) throw new Error(data.detail || "Could not sign in");
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

  if (!token || !user) return <main className="auth-page"><div className="auth-card"><a className="brand" href="/"><span className="brand-icon">o</span>opsflow</a><p className="eyebrow">INTERNAL OPERATIONS</p><h1>{authMode === "login" ? "Welcome back" : "Create your workspace account"}</h1><p className="auth-subtitle">Keep important work visible, owned, and moving.</p>{notice && <div className="notice error">{notice.text}</div>}<form onSubmit={authenticate} className="form-stack">{authMode === "register" && <label>Full name<input name="name" required minLength={2} autoComplete="name" /></label>}<label>Email address<input name="email" type="email" required autoComplete="email" /></label><label>Password<input name="password" type="password" required minLength={8} autoComplete={authMode === "login" ? "current-password" : "new-password"} /></label><button className="button primary full" type="submit">{authMode === "login" ? "Sign in" : "Create account"}</button></form><p className="auth-switch">{authMode === "login" ? "New to OpsFlow?" : "Already have an account?"} <button className="link-button" onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setNotice(null); }}>{authMode === "login" ? "Create account" : "Sign in"}</button></p><div className="auth-foot">Secure team workspace <span>•</span> API {loading ? "connecting" : "ready"}</div></div></main>;

  return <div className="app-shell">
    <aside className="sidebar"><a className="brand" href="#overview" onClick={() => setView("overview")}><span className="brand-icon">o</span>opsflow</a><div className="workspace-select"><span className="workspace-mark">{user.full_name.slice(0, 1).toUpperCase()}</span><span><strong>{user.full_name}</strong><small>Personal workspace</small></span><span className="chevron">⌄</span></div><div className="nav-section-label">WORKSPACE</div><button className={`nav-item ${view === "overview" ? "active" : ""}`} onClick={() => setView("overview")}><span className="nav-symbol">◫</span>Overview</button><button className={`nav-item ${view === "work" ? "active" : ""}`} onClick={() => setView("work")}><span className="nav-symbol">▤</span>Work items<span className="nav-count">{openCount}</span></button><div className="nav-section-label team-label">YOUR TEAMS</div>{teams.map((team) => <div className="team-nav" key={team.id}><span className="team-dot" />{team.name}<span className="role-label">{team.role === "admin" ? "ADM" : ""}</span></div>)}<button className="team-add" onClick={() => setShowTeam(true)}>＋ Create a team</button><div className="sidebar-bottom"><div className="connection-label"><span className="status-dot connected" />Connected to OpsFlow API</div><button className="profile" onClick={() => { localStorage.removeItem("opsflow_token"); setToken(""); setUser(null); setItems([]); }}><span className="avatar">{user.full_name.slice(0, 1).toUpperCase()}</span><span><strong>{user.full_name}</strong><small>{user.email}</small></span><span className="logout">↪</span></button></div></aside>
    <main className="main-content"><header className="topbar"><div className="breadcrumb">Workspace <span>/</span> {view === "overview" ? "Overview" : "Work items"}</div><div className="top-actions"><span className="today-label">{new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(new Date())}</span><button className="avatar small-avatar" title={user.full_name}>{user.full_name.slice(0, 1).toUpperCase()}</button></div></header>
      <section className="content"><div className="page-heading"><div><p className="eyebrow">YOUR WORKSPACE</p><h1>{view === "overview" ? "Good work starts here." : "Work items"}</h1><p>{view === "overview" ? "A clear view of what needs doing and what needs your attention." : "Track ownership, priority, and progress in one place."}</p></div><button className="button primary" onClick={() => setShowCreate(true)}><span>＋</span> New work item</button></div>
      {notice && <div className={`notice ${notice.kind}`} role="status">{notice.text}<button onClick={() => setNotice(null)} aria-label="Dismiss">×</button></div>}
      {view === "overview" && <><div className="summary-grid"><article className="metric-card"><span className="metric-icon green">▤</span><div><span className="metric-label">Active work</span><strong>{openCount}</strong><small>Items that are not complete</small></div></article><article className="metric-card"><span className="metric-icon amber">◷</span><div><span className="metric-label">Needs attention</span><strong>{blockedCount + urgentCount}</strong><small>Blocked or urgent items</small></div></article><article className="metric-card"><span className="metric-icon blue">✓</span><div><span className="metric-label">Completed</span><strong>{items.filter((item) => item.status === "done").length}</strong><small>Resolved work items</small></div></article></div><div className="welcome-strip"><div className="welcome-symbol">✳</div><div><strong>Keep the important work moving</strong><p>Create a work item to give a request clear ownership, urgency, and a history your team can trust.</p></div><button className="text-action" onClick={() => setShowCreate(true)}>Create an item <span>↗</span></button></div></>}
      <div className="list-heading"><div><p className="eyebrow">THE QUEUE</p><h2>{view === "overview" ? "Recent work" : "All work items"}<span className="item-count">{visibleItems.length}</span></h2></div><div className="filters"><label className="search-box"><span>⌕</span><input aria-label="Search work" placeholder="Search work..." value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>⌘ K</kbd></label><select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="done">Done</option></select></div></div>
      {visibleItems.length ? <div className="work-list">{visibleItems.map((item) => <article className="work-row" key={item.id}><div className={`priority-mark ${item.priority}`} title={`${item.priority} priority`} /><button className="work-main" onClick={() => void openActivity(item)}><strong>{item.title}</strong><span>{item.description || "No description provided"}</span></button><span className={`status-pill ${item.status}`}>{item.status.replace("_", " ")}</span><span className={`priority-label ${item.priority}`}>{item.priority}</span><span className="date-label">{new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(item.created_at))}</span><select className="status-select" aria-label={`Change ${item.title} status`} value={item.status} onChange={(event) => void changeStatus(item, event.target.value as Item["status"])}><option value="open">Open</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="done">Done</option></select></article>)}</div> : <div className="empty-state"><div className="empty-art">✳</div><strong>{query || statusFilter !== "all" ? "No matching work" : "Nothing on the board yet"}</strong><p>{query || statusFilter !== "all" ? "Try a different search or status filter." : "Capture the request, set its priority, and make sure it has a clear owner."}</p>{!query && statusFilter === "all" && <button className="button secondary" onClick={() => setShowCreate(true)}>Create first work item</button>}</div>}
      <footer className="page-footer"><span>OpsFlow <span className="footer-dot">·</span> Work that stays visible.</span><span>{loading ? "Syncing..." : "All changes saved"}</span></footer></section></main>
    {showCreate && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCreate(false); }}><section className="modal"><div className="modal-head"><div><p className="eyebrow">NEW REQUEST</p><h2>Create a work item</h2></div><button className="icon-button" onClick={() => setShowCreate(false)}>×</button></div><form className="form-stack" onSubmit={createItem}><label>Title<input name="title" required maxLength={200} placeholder="What needs to be done?" autoFocus /></label><label>Context<textarea name="description" rows={4} placeholder="Add details that will help someone move this forward." /></label><div className="form-pair"><label>Priority<select name="priority"><option value="medium">Medium</option><option value="low">Low</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>{teams.length > 0 && <label>Team<select name="team_id"><option value="">Personal</option>{teams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label>}</div><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setShowCreate(false)}>Cancel</button><button type="submit" className="button primary">Create item</button></div></form></section></div>}
    {showTeam && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowTeam(false); }}><section className="modal"><div className="modal-head"><div><p className="eyebrow">TEAM SPACE</p><h2>Create a team</h2></div><button className="icon-button" onClick={() => setShowTeam(false)}>×</button></div><p className="modal-copy">You will be the team administrator. Team membership management can be added as the workspace grows.</p><form className="form-stack" onSubmit={createTeam}><label>Team name<input name="name" required minLength={2} maxLength={120} placeholder="e.g. Customer operations" /></label><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setShowTeam(false)}>Cancel</button><button type="submit" className="button primary">Create team</button></div></form></section></div>}
    {selected && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section className="modal activity-modal"><div className="modal-head"><div><p className="eyebrow">WORK ITEM #{selected.id}</p><h2>{selected.title}</h2></div><button className="icon-button" onClick={() => setSelected(null)}>×</button></div><p className="activity-description">{selected.description || "No description provided."}</p><div className="activity-meta"><span className={`status-pill ${selected.status}`}>{selected.status.replace("_", " ")}</span><span className={`priority-label ${selected.priority}`}>{selected.priority} priority</span></div><h3 className="activity-heading">Activity</h3>{activity.length ? <div className="activity-list">{activity.map((entry) => <div className="activity-entry" key={entry.id}><span className="activity-dot"/><div><strong>{entry.action === "created" ? "Work item created" : "Work item updated"}</strong><p>{entry.action === "updated" ? `Changed ${(entry.details.fields as string[] || []).join(", ")}` : "Item added to the workspace"}</p><small>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.created_at))}</small></div></div>)}</div> : <p className="activity-empty">Activity will appear here as work changes.</p>}</section></div>}
  </div>;
}

export default App;
