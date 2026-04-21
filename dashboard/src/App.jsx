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
// Navigation items
// ─────────────────────────────────────────
const NAV = [
  { id: "overview",   label: "Overview",   icon: GridIcon },
  { id: "campaigns",  label: "Campaigns",  icon: ListIcon },
  { id: "templates",  label: "Templates",  icon: MailIcon },
  { id: "targets",    label: "Targets",    icon: UsersIcon },
  { id: "analytics",  label: "Analytics",  icon: ChartIcon },
];

export default function App() {
  const [page, setPage]           = useState("overview");
  const [engineOnline, setEngine] = useState(null);
  const [aiStatus, setAiStatus]   = useState(null);

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
    <div style={styles.shell}>
      {/* ── Sidebar ── */}
      <aside style={styles.sidebar}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>&#128305;</span>
          <span style={styles.logoText}>Poseidon</span>
        </div>

        <nav style={styles.nav}>
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setPage(id)}
              style={{
                ...styles.navItem,
                ...(page === id ? styles.navItemActive : {}),
              }}
            >
              <Icon active={page === id} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        {/* Engine status footer */}
        <div style={styles.sidebarFooter}>
          <div style={styles.footerRow}>
            <span style={styles.footerLabel}>Engine</span>
            <div style={styles.statusPill}>
              <div style={{
                ...styles.statusDot,
                background: engineOnline === null ? "#EF9F27"
                          : engineOnline         ? "#639922"
                          :                        "#E24B4A",
              }} />
              <span style={styles.statusText}>
                {engineOnline === null ? "checking" : engineOnline ? "online" : "offline"}
              </span>
            </div>
          </div>
          <div style={styles.footerRow}>
            <span style={styles.footerLabel}>Model</span>
            <span style={styles.footerValue}>llama3.1:8b</span>
          </div>
          <div style={styles.footerRow}>
            <span style={styles.footerLabel}>Mock AI</span>
            <span style={{
              ...styles.footerValue,
              color: import.meta.env.VITE_MOCK_AI === "true" ? "#A32D2D" : "#3B6D11",
            }}>
              {import.meta.env.VITE_MOCK_AI === "true" ? "on" : "off"}
            </span>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main style={styles.main}>
        {page === "overview"  && <Overview setPage={setPage} />}
        {page === "campaigns" && <Campaigns />}
        {page === "templates" && <Templates />}
        {page === "targets"   && <Targets />}
        {page === "analytics" && <Analytics />}
      </main>
    </div>
  );
}

// ─────────────────────────────────────────
// Overview page - summary stats + quick links
// ─────────────────────────────────────────
function Overview({ setPage }) {
  const [stats, setStats] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    fetchOverview(setCampaigns);
  }, []);

  const activeCampaigns = campaigns.filter(c => c.status === "active").length;
  const totalTargets    = campaigns.reduce((acc, c) => acc + (c.total_targets || 0), 0);

  return (
    <div style={styles.page}>
      {/* Topbar */}
      <div style={styles.topbar}>
        <h1 style={styles.pageTitle}>Overview</h1>
        <button style={styles.btnPrimary} onClick={() => setPage("campaigns")}>
          + New campaign
        </button>
      </div>

      {/* Stat cards */}
      <div style={styles.statGrid}>
        <StatCard label="Active campaigns" value={activeCampaigns} sub="running now" subColor="#3B6D11" />
        <StatCard label="Total targets"    value={totalTargets.toLocaleString()} sub="across all groups" />
        <StatCard label="Campaigns"        value={campaigns.length} sub="all time" />
        <StatCard
          label="Engine"
          value="Online"
          sub="metrics at :9090"
          subColor="#3B6D11"
        />
      </div>

      {/* Recent campaigns table */}
      <Section title="Recent campaigns" action={{ label: "View all", onClick: () => setPage("campaigns") }}>
        <CampaignTable campaigns={campaigns.slice(0, 5)} />
      </Section>

      {/* Quick actions */}
      <div style={styles.quickGrid}>
        <QuickCard
          title="Create campaign"
          desc="Set up a new phishing simulation with AI-generated emails"
          onClick={() => setPage("campaigns")}
        />
        <QuickCard
          title="Manage targets"
          desc="Import target lists via CSV or add individuals manually"
          onClick={() => setPage("targets")}
        />
        <QuickCard
          title="Build template"
          desc="Design email templates or generate them with AI"
          onClick={() => setPage("templates")}
        />
        <QuickCard
          title="View analytics"
          desc="Deep dive into click rates, open rates and department breakdowns"
          onClick={() => setPage("analytics")}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// Shared UI components
// ─────────────────────────────────────────
export function StatCard({ label, value, sub, subColor }) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statLabel}>{label}</div>
      <div style={styles.statValue}>{value}</div>
      {sub && <div style={{ ...styles.statSub, color: subColor || "var(--muted)" }}>{sub}</div>}
    </div>
  );
}

export function Section({ title, action, children }) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionHeader}>
        <span style={styles.sectionTitle}>{title}</span>
        {action && (
          <button style={styles.btnGhost} onClick={action.onClick}>
            {action.label} →
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

export function CampaignTable({ campaigns }) {
  if (!campaigns.length) {
    return <div style={styles.empty}>No campaigns yet. Create one to get started.</div>;
  }
  return (
    <div style={styles.table}>
      <div style={{ ...styles.tableRow, ...styles.tableHead }}>
        <span style={styles.th}>Name</span>
        <span style={styles.th}>Status</span>
        <span style={styles.th}>From</span>
        <span style={styles.th}>Created</span>
      </div>
      {campaigns.map(c => (
        <div key={c.id} style={styles.tableRow}>
          <span style={styles.td}>{c.name}</span>
          <StatusBadge status={c.status} />
          <span style={{ ...styles.td, ...styles.muted }}>{c.from_email}</span>
          <span style={{ ...styles.td, ...styles.muted }}>
            {new Date(c.created_at).toLocaleDateString()}
          </span>
        </div>
      ))}
    </div>
  );
}

export function StatusBadge({ status }) {
  const map = {
    active:    { bg: "#EAF3DE", color: "#27500A" },
    draft:     { bg: "#F1EFE8", color: "#444441" },
    completed: { bg: "#E6F1FB", color: "#0C447C" },
    paused:    { bg: "#FAEEDA", color: "#633806" },
    archived:  { bg: "#FCEBEB", color: "#791F1F" },
  };
  const s = map[status] || map.draft;
  return (
    <span style={{ ...styles.badge, background: s.bg, color: s.color }}>
      {status}
    </span>
  );
}

function QuickCard({ title, desc, onClick }) {
  return (
    <button style={styles.quickCard} onClick={onClick}>
      <div style={styles.quickTitle}>{title}</div>
      <div style={styles.quickDesc}>{desc}</div>
    </button>
  );
}

// ─────────────────────────────────────────
// Data fetching
// ─────────────────────────────────────────
async function fetchOverview(setCampaigns) {
  try {
    const res  = await fetch(`${API_URL}/api/campaigns`);
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
      stroke={active ? "#185FA5" : "currentColor"} strokeWidth="1.5">
      <rect x="1" y="1" width="6" height="6" rx="1"/>
      <rect x="9" y="1" width="6" height="6" rx="1"/>
      <rect x="1" y="9" width="6" height="6" rx="1"/>
      <rect x="9" y="9" width="6" height="6" rx="1"/>
    </svg>
  );
}
function ListIcon({ active }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      stroke={active ? "#185FA5" : "currentColor"} strokeWidth="1.5">
      <path d="M2 4h12M2 8h8M2 12h5"/>
    </svg>
  );
}
function MailIcon({ active }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      stroke={active ? "#185FA5" : "currentColor"} strokeWidth="1.5">
      <rect x="1" y="3" width="14" height="10" rx="1"/>
      <path d="M1 5l7 5 7-5"/>
    </svg>
  );
}
function UsersIcon({ active }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      stroke={active ? "#185FA5" : "currentColor"} strokeWidth="1.5">
      <circle cx="6" cy="5" r="3"/>
      <path d="M1 14c0-3 2-5 5-5s5 2 5 5"/>
      <path d="M11 3a3 3 0 010 4M15 14c0-2-1-4-3-4.5"/>
    </svg>
  );
}
function ChartIcon({ active }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      stroke={active ? "#185FA5" : "currentColor"} strokeWidth="1.5">
      <path d="M2 12V8l4-4 4 4 4-4v8"/>
    </svg>
  );
}

// ─────────────────────────────────────────
// Styles
// ─────────────────────────────────────────
const styles = {
  shell: {
    display: "flex",
    height: "100vh",
    background: "var(--color-background-tertiary, #f5f5f3)",
    fontFamily: "'IBM Plex Sans', sans-serif",
    color: "var(--color-text-primary, #1a1a18)",
  },
  sidebar: {
    width: 200,
    minWidth: 200,
    background: "var(--color-background-primary, #fff)",
    borderRight: "0.5px solid var(--color-border-tertiary, rgba(0,0,0,0.1))",
    display: "flex",
    flexDirection: "column",
    padding: "16px 0",
  },
  logo: {
    padding: "0 16px 20px",
    display: "flex",
    alignItems: "center",
    gap: 8,
    borderBottom: "0.5px solid var(--color-border-tertiary, rgba(0,0,0,0.1))",
    marginBottom: 12,
  },
  logoIcon: { fontSize: 20 },
  logoText: { fontSize: 15, fontWeight: 600, letterSpacing: "-0.02em" },
  nav: { display: "flex", flexDirection: "column", gap: 2, padding: "0 8px" },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    fontSize: 13,
    color: "var(--color-text-secondary, #6b6b67)",
    background: "transparent",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
  },
  navItemActive: {
    background: "var(--color-background-secondary, #f0f0ee)",
    color: "#185FA5",
    fontWeight: 500,
  },
  sidebarFooter: {
    marginTop: "auto",
    padding: "12px 16px",
    borderTop: "0.5px solid var(--color-border-tertiary, rgba(0,0,0,0.1))",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  footerRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  footerLabel: { fontSize: 11, color: "var(--color-text-secondary, #6b6b67)" },
  footerValue: { fontSize: 12, fontWeight: 500 },
  statusPill: { display: "flex", alignItems: "center", gap: 4 },
  statusDot: { width: 6, height: 6, borderRadius: "50%" },
  statusText: { fontSize: 11, fontWeight: 500 },
  main: { flex: 1, overflow: "auto" },
  page: { padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 },
  topbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pageTitle: { fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em" },
  statGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 },
  statCard: {
    background: "var(--color-background-secondary, #f0f0ee)",
    borderRadius: 8,
    padding: "12px 14px",
  },
  statLabel: { fontSize: 11, color: "var(--color-text-secondary, #6b6b67)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" },
  statValue: { fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" },
  statSub: { fontSize: 11, marginTop: 2 },
  section: { display: "flex", flexDirection: "column", gap: 8 },
  sectionHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontSize: 13, fontWeight: 500, color: "var(--color-text-secondary, #6b6b67)", textTransform: "uppercase", letterSpacing: "0.04em" },
  table: {
    background: "var(--color-background-primary, #fff)",
    border: "0.5px solid var(--color-border-tertiary, rgba(0,0,0,0.1))",
    borderRadius: 10,
    overflow: "hidden",
  },
  tableHead: {
    background: "var(--color-background-secondary, #f0f0ee)",
    borderBottom: "0.5px solid var(--color-border-tertiary, rgba(0,0,0,0.1))",
  },
  tableRow: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr 1.5fr 1fr",
    padding: "10px 14px",
    borderBottom: "0.5px solid var(--color-border-tertiary, rgba(0,0,0,0.08))",
    alignItems: "center",
  },
  th: { fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary, #6b6b67)", textTransform: "uppercase", letterSpacing: "0.04em" },
  td: { fontSize: 13 },
  muted: { color: "var(--color-text-secondary, #6b6b67)" },
  badge: { fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 500, display: "inline-block" },
  btnPrimary: {
    fontSize: 13,
    padding: "7px 16px",
    background: "#185FA5",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: 500,
    letterSpacing: "-0.01em",
  },
  btnGhost: {
    fontSize: 12,
    padding: "4px 8px",
    background: "transparent",
    border: "none",
    color: "#185FA5",
    cursor: "pointer",
  },
  quickGrid: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 },
  quickCard: {
    background: "var(--color-background-primary, #fff)",
    border: "0.5px solid var(--color-border-tertiary, rgba(0,0,0,0.1))",
    borderRadius: 10,
    padding: "14px 16px",
    cursor: "pointer",
    textAlign: "left",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  quickTitle: { fontSize: 13, fontWeight: 500 },
  quickDesc: { fontSize: 12, color: "var(--color-text-secondary, #6b6b67)", lineHeight: 1.5 },
  empty: { fontSize: 13, color: "var(--color-text-secondary, #6b6b67)", padding: "20px 14px", textAlign: "center" },
};
