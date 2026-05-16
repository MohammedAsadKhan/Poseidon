import { useState, useEffect } from "react";
import Campaigns from "./components/Campaigns";
import Templates from "./components/Templates";
import Targets from "./components/Targets";
import Analytics from "./components/Analytics";

// ─────────────────────────────────────────
// API base URL from environment
// ─────────────────────────────────────────
export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";

// ─────────────────────────────────────────
// Global cyber styles injected once
// ─────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Rajdhani:wght@500;600;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg-void:    #030508;
    --bg-deep:    #060a11;
    --bg-surface: rgba(10, 15, 25, 0.7);
    --bg-raised:  rgba(15, 22, 36, 0.8);
    --bg-hover:   rgba(22, 32, 50, 0.9);

    --neon:       #00f0ff;
    --neon-dim:   rgba(0, 240, 255, 0.1);
    --neon-glow:  rgba(0, 240, 255, 0.05);
    --neon-mid:   rgba(0, 240, 255, 0.3);

    --accent:     #00f0ff;
    --accent-red: #ff003c;
    --accent-green:#00ff66;

    --text-primary:   #e0f2fe;
    --text-secondary: #7dd3fc;
    --text-dim:       #38bdf8;

    --border:     rgba(0, 240, 255, 0.15);
    --border-mid: rgba(0, 240, 255, 0.3);
    --border-bright: rgba(0, 240, 255, 0.6);

    --font-mono: 'JetBrains Mono', monospace;
    --font-display: 'Rajdhani', sans-serif;

    --radius: 2px;
    --radius-lg: 4px;
  }

  html, body, #root {
    height: 100vh;
    width: 100vw;
    overflow: hidden;
    background: var(--bg-void);
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 13px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }

  /* Scanline effect */
  .scanlines {
    position: fixed;
    top: 0; left: 0; width: 100vw; height: 100vh;
    background: linear-gradient(
      to bottom,
      rgba(255,255,255,0),
      rgba(255,255,255,0) 50%,
      rgba(0,0,0,0.2) 50%,
      rgba(0,0,0,0.2)
    );
    background-size: 100% 4px;
    pointer-events: none;
    z-index: 9999;
    opacity: 0.4;
  }

  /* Cyber Grid Background */
  .cyber-grid {
    position: absolute;
    inset: 0;
    background-image: 
      linear-gradient(rgba(0, 240, 255, 0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0, 240, 255, 0.03) 1px, transparent 1px);
    background-size: 30px 30px;
    z-index: 0;
    pointer-events: none;
  }

  /* Glitch effect on hover */
  .glitch-hover:hover {
    animation: glitch-anim 0.2s linear infinite;
  }
  @keyframes glitch-anim {
    0% { transform: translate(0) }
    20% { transform: translate(-2px, 1px) }
    40% { transform: translate(-1px, -1px) }
    60% { transform: translate(2px, 1px) }
    80% { transform: translate(1px, -1px) }
    100% { transform: translate(0) }
  }

  /* Typing effect for headers */
  .typing-effect {
    display: inline-block;
    overflow: hidden;
    white-space: nowrap;
    border-right: 2px solid var(--neon);
    animation: typing 1.5s steps(40, end), blink-caret 0.75s step-end infinite;
  }
  @keyframes typing { from { width: 0 } to { width: 100% } }
  @keyframes blink-caret { from, to { border-color: transparent } 50% { border-color: var(--neon); } }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: var(--bg-void); border-left: 1px solid var(--border); }
  ::-webkit-scrollbar-thumb { background: var(--neon-mid); border-radius: 0; }
  ::-webkit-scrollbar-thumb:hover { background: var(--neon); }

  /* Cyber button */
  .btn-cyber {
    background: rgba(0, 240, 255, 0.05);
    border: 1px solid var(--border-mid);
    color: var(--neon);
    font-family: var(--font-display);
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 8px 24px;
    border-radius: var(--radius);
    cursor: pointer;
    position: relative;
    transition: all 0.2s;
    overflow: hidden;
    text-shadow: 0 0 5px var(--neon-mid);
  }
  .btn-cyber::before {
    content: '';
    position: absolute;
    top: 0; left: -100%;
    width: 100%; height: 100%;
    background: linear-gradient(90deg, transparent, rgba(0,240,255,0.2), transparent);
    transition: left 0.4s ease-in-out;
  }
  .btn-cyber:hover::before { left: 100%; }
  .btn-cyber:hover {
    background: var(--neon-dim);
    box-shadow: 0 0 15px var(--neon-glow), inset 0 0 10px var(--neon-glow);
    border-color: var(--neon);
  }

  /* Nav item */
  .nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-radius: var(--radius);
    cursor: pointer;
    background: transparent;
    border: 1px solid transparent;
    border-left: 2px solid transparent;
    color: var(--text-secondary);
    font-family: var(--font-display);
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    width: 100%;
    text-align: left;
    transition: all 0.2s;
    position: relative;
  }
  .nav-item:hover {
    color: var(--neon);
    background: var(--bg-raised);
    border-color: var(--border);
    border-left-color: var(--neon-mid);
  }
  .nav-item.active {
    color: var(--neon);
    background: linear-gradient(90deg, var(--neon-dim) 0%, transparent 100%);
    border-left: 2px solid var(--neon);
    text-shadow: 0 0 8px var(--neon-mid);
  }

  /* Stat card */
  .stat-card {
    background: var(--bg-surface);
    backdrop-filter: blur(8px);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 24px;
    position: relative;
    transition: all 0.2s;
  }
  .stat-card:hover {
    border-color: var(--neon) !important;
    background: var(--bg-raised);
    box-shadow: 0 0 15px var(--neon-glow), inset 0 0 15px var(--neon-glow);
    transform: translateY(-2px);
  }
  
  .quick-card {
    background: rgba(10, 15, 25, 0.5);
    border: 1px solid var(--border);
    border-left: 3px solid var(--neon-mid);
    padding: 16px;
    cursor: pointer;
    text-align: left;
    transition: all 0.2s;
    display: flex;
    flex-direction: column;
    gap: 8px;
    border-radius: var(--radius);
  }
  .quick-card:hover {
    background: var(--bg-raised);
    border-left-color: var(--neon);
    transform: translateX(5px);
  }

  /* Table styles */
  .cyber-table {
    background: transparent;
    width: 100%;
    border-collapse: collapse;
  }
  .cyber-table-head {
    background: rgba(0, 240, 255, 0.05);
    border-bottom: 1px solid var(--border-bright);
    display: grid;
    grid-template-columns: 2fr 1fr 1.5fr 1fr;
    padding: 10px 14px;
  }
  .cyber-table-row {
    border-bottom: 1px dashed var(--border);
    transition: all 0.2s;
    display: grid;
    grid-template-columns: 2fr 1fr 1.5fr 1fr;
    padding: 10px 14px;
    align-items: center;
  }
  .cyber-table-row:hover { 
    background: var(--neon-glow); 
    border-bottom: 1px dashed var(--neon-mid);
  }

  /* Pulse animation */
  @keyframes pulse-neon {
    0%, 100% { box-shadow: 0 0 4px var(--accent-green); }
    50% { box-shadow: 0 0 12px var(--accent-green), 0 0 20px rgba(0,255,102,0.4); }
  }
  .pulse { animation: pulse-neon 2s ease-in-out infinite; }
`;

function injectGlobalCSS() {
  if (document.getElementById('poseidon-global-css')) return;
  const style = document.createElement('style');
  style.id = 'poseidon-global-css';
  style.textContent = GLOBAL_CSS;
  document.head.appendChild(style);
}

// ─────────────────────────────────────────
// Navigation items
// ─────────────────────────────────────────
const NAV = [
  { id: "overview", label: "OVERVIEW", icon: GridIcon },
  { id: "campaigns", label: "CAMPAIGNS", icon: ListIcon },
  { id: "templates", label: "TEMPLATES", icon: MailIcon },
  { id: "targets", label: "TARGETS", icon: UsersIcon },
  { id: "analytics", label: "ANALYTICS", icon: ChartIcon },
];

export default function App() {
  const [page, setPage] = useState("overview");
  const [engineOnline, setEngine] = useState(null);

  useEffect(() => { injectGlobalCSS(); }, []);

  // Poll engine health every 10 seconds
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${API_URL}/health`);
        const data = await res.json();
        setEngine(data.status === "ok");
      } catch {
        setEngine(false);
      }
    };
    check();
    const id = setInterval(check, 10000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", background: "var(--bg-void)", overflow: "hidden", position: "relative" }}>
      {/* Scanlines & Grid */}
      <div className="scanlines"></div>
      <div className="cyber-grid"></div>

      {/* ── Background glow orbs ── */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
        <div style={{
          position: "absolute", top: "-10%", left: "-5%",
          width: 500, height: 500,
          background: "radial-gradient(circle, rgba(0,240,255,0.05) 0%, transparent 60%)",
          borderRadius: "50%",
        }} />
      </div>

      {/* ── Sidebar ── */}
      <aside style={{
        width: 240, minWidth: 240,
        background: "var(--bg-deep)",
        borderRight: "1px solid var(--border)",
        display: "flex", flexDirection: "column",
        padding: "0",
        position: "relative", zIndex: 1,
        boxShadow: "5px 0 20px rgba(0,0,0,0.5)"
      }}>
        <div style={{
          padding: "28px 24px",
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 14,
        }}>
          <span style={{ fontSize: 24, color: "var(--neon)", textShadow: "0 0 10px var(--neon-glow)" }}>&#128305;</span>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.05em", textShadow: "0 0 10px var(--neon-glow)" }}>
              POSEIDON
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--neon)", letterSpacing: "0.2em", textTransform: "uppercase" }}>
              v1.0_SEC
            </div>
          </div>
        </div>

        <nav style={{ padding: "20px 16px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${page === id ? "active" : ""}`}
              onClick={() => setPage(id)}
            >
              <div style={{ color: page === id ? "var(--neon)" : "var(--text-dim)", display: "flex" }}>
                <Icon active={page === id} />
              </div>
              <span>{label}</span>
            </button>
          ))}
        </nav>

        {/* Engine status footer */}
        <div style={{
          padding: "20px 24px",
          borderTop: "1px solid var(--border)",
          background: "rgba(0,0,0,0.2)",
          display: "flex", flexDirection: "column", gap: 12,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--text-dim)", letterSpacing: "0.1em", textTransform: "uppercase" }}>ENGINE_STAT</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div className={engineOnline ? "pulse" : ""} style={{
                width: 8, height: 8, borderRadius: "50%",
                background: engineOnline === null ? "#ffaa00" : engineOnline ? "var(--accent-green)" : "var(--accent-red)",
              }} />
              <span style={{ color: engineOnline ? "var(--accent-green)" : "var(--accent-red)", fontSize: 11, fontWeight: "bold" }}>
                {engineOnline === null ? "CHK" : engineOnline ? "ON" : "ERR"}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--text-dim)", letterSpacing: "0.1em", textTransform: "uppercase" }}>AI_MODEL</span>
            <span style={{ color: "var(--text-secondary)", fontSize: 11 }}>LLAMA_3</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--text-dim)", letterSpacing: "0.1em", textTransform: "uppercase" }}>MOCK_MODE</span>
            <span style={{ color: import.meta.env.VITE_MOCK_AI === "true" ? "var(--accent-red)" : "var(--accent-green)", fontSize: 11 }}>
              {import.meta.env.VITE_MOCK_AI === "true" ? "ACTIVE" : "OFF"}
            </span>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main style={{ flex: 1, overflowY: "auto", overflowX: "hidden", position: "relative", zIndex: 1, padding: "40px" }}>
        {page === "overview" && <Overview setPage={setPage} />}
        {page === "campaigns" && <Campaigns setPage={setPage} />}
        {page === "templates" && <Templates setPage={setPage} />}
        {page === "targets" && <Targets setPage={setPage} />}
        {page === "analytics" && <Analytics setPage={setPage} />}
      </main>
    </div>
  );
}

// ─────────────────────────────────────────
// Overview page - summary stats + quick links
// ─────────────────────────────────────────
function Overview({ setPage }) {
  const [campaigns, setCampaigns] = useState([]);

  useEffect(() => {
    fetchOverview(setCampaigns);
  }, []);

  const activeCampaigns = campaigns.filter(c => c.status === "active").length;
  const totalTargets = campaigns.reduce((acc, c) => acc + (c.total_targets || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 40, maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "1px solid var(--border-mid)", paddingBottom: 20 }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--neon)", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 8, textShadow: "0 0 8px var(--neon-glow)" }}>
            [ SYS.MONITORING ]
          </div>
          <h1 className="typing-effect" style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.05em", margin: 0, paddingRight: 10 }}>
            COMMAND_CENTER
          </h1>
        </div>
        <button className="btn-cyber glitch-hover" onClick={() => setPage("campaigns")}>
          INITIALIZE_CAMPAIGN
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 }}>
        <StatCard label="ACTIVE_OPS" value={activeCampaigns} sub="EXECUTING" accent />
        <StatCard label="TOTAL_TARGETS" value={totalTargets.toLocaleString()} sub="DATABASES_LOADED" />
        <StatCard label="LOGGED_CAMPAIGNS" value={campaigns.length} sub="ARCHIVE_COUNT" />
        <StatCard label="ENGINE_PORT" value=":9090" sub="LISTENING" accent />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 30, alignItems: "start" }}>
        {/* Recent campaigns table */}
        <Section title="SYS.RECENT_LOGS" action={{ label: "VIEW_ALL >>", onClick: () => setPage("campaigns") }}>
          <div style={{ background: "var(--bg-surface)", backdropFilter: "blur(10px)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "10px" }}>
            <CampaignTable campaigns={campaigns.slice(0, 5)} />
          </div>
        </Section>

        {/* Quick actions */}
        <Section title="SYS.PROTOCOLS">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <QuickCard title="NEW_OP" desc="Launch simulated intrusion" onClick={() => setPage("campaigns")} />
            <QuickCard title="TARGET_DB" desc="Manage personnel records" onClick={() => setPage("targets")} />
            <QuickCard title="AI_TEMPLATES" desc="Generate payloads via AI" onClick={() => setPage("templates")} />
            <QuickCard title="DEEP_SCAN" desc="Analyze operation metrics" onClick={() => setPage("analytics")} />
          </div>
        </Section>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// Shared UI components
// ─────────────────────────────────────────
export function StatCard({ label, value, sub, accent }) {
  return (
    <div className="stat-card" style={{ borderTop: accent ? "2px solid var(--neon)" : "1px solid var(--border)" }}>
      <div style={{ fontSize: 11, color: "var(--text-dim)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 12 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, fontFamily: "var(--font-display)", color: accent ? "var(--neon)" : "var(--text-primary)", letterSpacing: "0.05em", textShadow: accent ? "0 0 15px rgba(0,240,255,0.5)" : "none" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--neon-mid)", marginTop: 8, letterSpacing: "0.1em" }}>// {sub}</div>}
    </div>
  );
}

export function Section({ title, action, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px dashed var(--border)", paddingBottom: 8 }}>
        <div style={{ fontSize: 12, color: "var(--neon)", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: "bold" }}>
          {">"} {title}
        </div>
        {action && (
          <button onClick={action.onClick} style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: 11, cursor: "pointer", letterSpacing: "0.1em", transition: "color 0.2s" }}
            onMouseEnter={e => e.currentTarget.style.color = "var(--neon)"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--text-secondary)"}>
            [{action.label}]
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

export function CampaignTable({ campaigns }) {
  if (!campaigns.length) {
    return <div style={{ fontSize: 13, color: "var(--text-secondary)", padding: "20px 14px", textAlign: "center" }}>No operations logged yet.</div>;
  }
  return (
    <div className="cyber-table">
      <div className="cyber-table-head">
        <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Name</span>
        <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Status</span>
        <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>From</span>
        <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Created</span>
      </div>
      {campaigns.map(c => (
        <div key={c.id} className="cyber-table-row">
          <span style={{ fontSize: 13, color: "var(--text-primary)" }}>{c.name}</span>
          <StatusBadge status={c.status} />
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{c.from_email}</span>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            {new Date(c.created_at).toLocaleDateString()}
          </span>
        </div>
      ))}
    </div>
  );
}

export function StatusBadge({ status }) {
  const map = {
    active: { bg: "rgba(0,255,102,0.1)", color: "var(--accent-green)", border: "var(--accent-green)" },
    draft: { bg: "rgba(125,211,252,0.1)", color: "var(--text-secondary)", border: "var(--border-mid)" },
    completed: { bg: "rgba(0,240,255,0.1)", color: "var(--neon)", border: "var(--neon)" },
    paused: { bg: "rgba(255,170,0,0.1)", color: "#ffaa00", border: "#ffaa00" },
    archived: { bg: "rgba(255,0,60,0.1)", color: "var(--accent-red)", border: "var(--accent-red)" },
  };
  const s = map[status] || map.draft;
  return (
    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 500, display: "inline-block", background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {status}
    </span>
  );
}

function QuickCard({ title, desc, onClick }) {
  return (
    <button className="quick-card" onClick={onClick}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.05em" }}>{title}</div>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>{desc}</div>
    </button>
  );
}

// ─────────────────────────────────────────
// Data fetching
// ─────────────────────────────────────────
async function fetchOverview(setCampaigns) {
  try {
    const res = await fetch(`${API_URL}/api/campaigns`);
    const data = await res.json();
    if (data.success) setCampaigns(data.data || []);
  } catch {
    // Engine offline - show empty state gracefully
  }
}

// ─────────────────────────────────────────
// SVG Icons
// ─────────────────────────────────────────
function GridIcon({ active }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      stroke={active ? "var(--neon)" : "currentColor"} strokeWidth="1.5">
      <rect x="1" y="1" width="6" height="6" rx="1" />
      <rect x="9" y="1" width="6" height="6" rx="1" />
      <rect x="1" y="9" width="6" height="6" rx="1" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  );
}
function ListIcon({ active }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      stroke={active ? "var(--neon)" : "currentColor"} strokeWidth="1.5">
      <path d="M2 4h12M2 8h8M2 12h5" />
    </svg>
  );
}
function MailIcon({ active }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      stroke={active ? "var(--neon)" : "currentColor"} strokeWidth="1.5">
      <rect x="1" y="3" width="14" height="10" rx="1" />
      <path d="M1 5l7 5 7-5" />
    </svg>
  );
}
function UsersIcon({ active }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      stroke={active ? "var(--neon)" : "currentColor"} strokeWidth="1.5">
      <circle cx="6" cy="5" r="3" />
      <path d="M1 14c0-3 2-5 5-5s5 2 5 5" />
      <path d="M11 3a3 3 0 010 4M15 14c0-2-1-4-3-4.5" />
    </svg>
  );
}
function ChartIcon({ active }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      stroke={active ? "var(--neon)" : "currentColor"} strokeWidth="1.5">
      <path d="M2 12V8l4-4 4 4 4-4v8" />
    </svg>
  );
}
