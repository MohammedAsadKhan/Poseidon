import { useState, useEffect } from "react";
import { API_URL, StatCard, Section, StatusBadge } from "../App";

// ─────────────────────────────────────────
// Analytics page
// Deep dive into campaign performance
// Click rates, open rates, department
// breakdowns, campaign comparisons
// ─────────────────────────────────────────
export default function Analytics() {
  const [campaigns, setCampaigns] = useState([]);
  const [stats, setStats]         = useState({});
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState("all");

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const res  = await fetch(`${API_URL}/api/campaigns`);
      const data = await res.json();
      if (!data.success) return;

      const campaigns = data.data || [];
      setCampaigns(campaigns);

      // Load stats for every campaign in parallel
      const statsMap = {};
      await Promise.all(
        campaigns.map(async c => {
          try {
            const r = await fetch(`${API_URL}/api/campaigns/${c.id}/stats`);
            const d = await r.json();
            if (d.success) statsMap[c.id] = d.data;
          } catch {}
        })
      );
      setStats(statsMap);
    } catch {
      // Engine offline
    } finally {
      setLoading(false);
    }
  }

  // Aggregate stats across all or selected campaign
  const filtered = selected === "all"
    ? campaigns
    : campaigns.filter(c => c.id === selected);

  const aggregated = aggregateStats(filtered, stats);

  // Department breakdown across all campaigns
  const deptData = buildDeptBreakdown(filtered, stats);

  // Per-campaign comparison data
  const comparison = filtered
    .map(c => ({ campaign: c, stats: stats[c.id] }))
    .filter(x => x.stats);

  return (
    <div style={s.page}>
      <div style={s.topbar}>
        <h1 style={s.pageTitle}>Analytics</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={s.filterLabel}>Campaign</span>
          <select
            style={s.select}
            value={selected}
            onChange={e => setSelected(e.target.value)}
          >
            <option value="all">All campaigns</option>
            {campaigns.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div style={s.empty}>Loading analytics...</div>
      ) : campaigns.length === 0 ? (
        <EmptyAnalytics />
      ) : (
        <>
          {/* Top level stats */}
          <div style={s.statGrid}>
            <StatCard
              label="Emails sent"
              value={aggregated.sent.toLocaleString()}
              sub="total delivered"
            />
            <StatCard
              label="Open rate"
              value={`${aggregated.openRate.toFixed(1)}%`}
              sub={`${aggregated.opened} opened`}
              subColor={riskColor(aggregated.openRate, 30, 60)}
            />
            <StatCard
              label="Click rate"
              value={`${aggregated.clickRate.toFixed(1)}%`}
              sub={`${aggregated.clicked} clicked`}
              subColor={riskColor(aggregated.clickRate, 15, 30)}
            />
            <StatCard
              label="Submission rate"
              value={`${aggregated.submitRate.toFixed(1)}%`}
              sub={`${aggregated.submitted} submitted credentials`}
              subColor={riskColor(aggregated.submitRate, 5, 15)}
            />
            <StatCard
              label="Reported phishing"
              value={aggregated.reported.toLocaleString()}
              sub="correctly identified"
              subColor="#3B6D11"
            />
            <StatCard
              label="Security score"
              value={`${aggregated.score}/100`}
              sub={scoreLabel(aggregated.score)}
              subColor={scoreColor(aggregated.score)}
            />
          </div>

          {/* Risk assessment */}
          <Section title="Risk assessment">
            <RiskPanel aggregated={aggregated} />
          </Section>

          {/* Campaign comparison */}
          {comparison.length > 1 && (
            <Section title="Campaign comparison">
              <CampaignComparison data={comparison} />
            </Section>
          )}

          {/* Per-campaign stat table */}
          <Section title="Per-campaign breakdown">
            <CampaignBreakdownTable campaigns={filtered} stats={stats} />
          </Section>

          {/* Grafana callout */}
          <GrafanaCallout />
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// Risk assessment panel
// Color coded risk levels per metric
// ─────────────────────────────────────────
function RiskPanel({ aggregated }) {
  const risks = [
    {
      label:    "Open rate risk",
      value:    aggregated.openRate,
      low:      30,
      high:     60,
      desc:     "Percentage of targets who opened the phishing email",
      format:   v => `${v.toFixed(1)}%`,
    },
    {
      label:    "Click rate risk",
      value:    aggregated.clickRate,
      low:      15,
      high:     30,
      desc:     "Percentage of targets who clicked the tracking link",
      format:   v => `${v.toFixed(1)}%`,
    },
    {
      label:    "Credential submission risk",
      value:    aggregated.submitRate,
      low:      5,
      high:     15,
      desc:     "Percentage of targets who submitted credentials",
      format:   v => `${v.toFixed(1)}%`,
    },
    {
      label:    "Phishing reporting rate",
      value:    aggregated.sent > 0
        ? (aggregated.reported / aggregated.sent) * 100 : 0,
      low:      10,
      high:     25,
      desc:     "Percentage of targets who correctly reported the email",
      format:   v => `${v.toFixed(1)}%`,
      inverted: true, // higher is better
    },
  ];

  return (
    <div style={s.riskGrid}>
      {risks.map(r => {
        const level = r.inverted
          ? (r.value >= r.high ? "low" : r.value >= r.low ? "medium" : "high")
          : (r.value >= r.high ? "high" : r.value >= r.low ? "medium" : "low");
        const colors = {
          high:   { bg: "#FCEBEB", border: "#F09595", text: "#791F1F", label: "High risk" },
          medium: { bg: "#FAEEDA", border: "#EF9F27", text: "#633806", label: "Medium risk" },
          low:    { bg: "#EAF3DE", border: "#97C459", text: "#27500A", label: "Low risk" },
        }[level];

        return (
          <div key={r.label} style={{ ...s.riskCard, background: colors.bg, borderColor: colors.border }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ ...s.riskLabel, color: colors.text }}>{r.label}</div>
              <span style={{ ...s.riskBadge, background: colors.border, color: colors.text }}>
                {colors.label}
              </span>
            </div>
            <div style={{ ...s.riskValue, color: colors.text }}>{r.format(r.value)}</div>
            <div style={{ ...s.riskDesc, color: colors.text, opacity: 0.8 }}>{r.desc}</div>
            <BarMeter value={r.value} max={r.inverted ? 40 : 80} color={colors.border} />
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────
// Horizontal bar meter
// ─────────────────────────────────────────
function BarMeter({ value, max, color }) {
  const pct = Math.min(100, (value / max) * 100).toFixed(0);
  return (
    <div style={s.barTrack}>
      <div style={{ ...s.barFill, width: `${pct}%`, background: color }} />
    </div>
  );
}

// ─────────────────────────────────────────
// Campaign comparison bars
// ─────────────────────────────────────────
function CampaignComparison({ data }) {
  const metrics = [
    { key: "open_rate",       label: "Open rate",   color: "#378ADD" },
    { key: "click_rate",      label: "Click rate",  color: "#E24B4A" },
    { key: "submission_rate", label: "Submissions", color: "#EF9F27" },
  ];

  return (
    <div style={s.compTable}>
      <div style={{ ...s.compRow, ...s.compHead }}>
        <span style={s.th}>Campaign</span>
        <span style={s.th}>Status</span>
        {metrics.map(m => (
          <span key={m.key} style={s.th}>{m.label}</span>
        ))}
        <span style={s.th}>Sent</span>
      </div>
      {data.map(({ campaign: c, stats: st }) => (
        <div key={c.id} style={s.compRow}>
          <span style={s.td}>{c.name}</span>
          <StatusBadge status={c.status} />
          {metrics.map(m => (
            <div key={m.key}>
              <div style={s.td}>{st[m.key].toFixed(1)}%</div>
              <div style={s.miniBar}>
                <div style={{
                  height: "100%",
                  width:  `${Math.min(100, st[m.key])}%`,
                  background: m.color,
                  borderRadius: 2,
                }} />
              </div>
            </div>
          ))}
          <span style={s.td}>{st.emails_sent.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────
// Full breakdown table
// ─────────────────────────────────────────
function CampaignBreakdownTable({ campaigns, stats }) {
  return (
    <div style={s.table}>
      <div style={{ ...s.breakRow, ...s.tableHead }}>
        <span style={s.th}>Campaign</span>
        <span style={s.th}>Sent</span>
        <span style={s.th}>Opened</span>
        <span style={s.th}>Clicked</span>
        <span style={s.th}>Submitted</span>
        <span style={s.th}>Reported</span>
      </div>
      {campaigns.map(c => {
        const st = stats[c.id];
        if (!st) return null;
        return (
          <div key={c.id} style={s.breakRow}>
            <div>
              <div style={s.td}>{c.name}</div>
              <StatusBadge status={c.status} />
            </div>
            <span style={s.td}>{st.emails_sent.toLocaleString()}</span>
            <span style={{ ...s.td, color: riskColor(st.open_rate, 30, 60) }}>
              {st.open_rate.toFixed(1)}%
            </span>
            <span style={{ ...s.td, color: riskColor(st.click_rate, 15, 30) }}>
              {st.click_rate.toFixed(1)}%
            </span>
            <span style={{ ...s.td, color: riskColor(st.submission_rate, 5, 15) }}>
              {st.submission_rate.toFixed(1)}%
            </span>
            <span style={{ ...s.td, color: "#3B6D11" }}>
              {st.reported_phishing.toLocaleString()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────
// Grafana callout - deep metrics live there
// ─────────────────────────────────────────
function GrafanaCallout() {
  return (
    <div style={s.grafanaCard}>
      <div style={s.grafanaTitle}>Want deeper metrics?</div>
      <div style={s.grafanaDesc}>
        Grafana shows time-series data, AI generation latency, email throughput,
        and historical campaign trends. The full SOC-grade observability stack is
        running at localhost:3001.
      </div>
      <a
        href="http://localhost:3001"
        target="_blank"
        rel="noreferrer"
        style={s.grafanaBtn}
      >
        Open Grafana →
      </a>
    </div>
  );
}

function EmptyAnalytics() {
  return (
    <div style={s.emptyState}>
      <div style={s.emptyTitle}>No campaign data yet</div>
      <div style={s.emptyDesc}>
        Launch a campaign to start seeing analytics. Once emails are sent,
        open rates, click rates and submission data will appear here.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// Data helpers
// ─────────────────────────────────────────
function aggregateStats(campaigns, statsMap) {
  let sent = 0, opened = 0, clicked = 0, submitted = 0, reported = 0;

  campaigns.forEach(c => {
    const st = statsMap[c.id];
    if (!st) return;
    sent      += st.emails_sent;
    opened    += st.emails_opened;
    clicked   += st.links_clicked;
    submitted += st.forms_submitted;
    reported  += st.reported_phishing;
  });

  const openRate   = sent > 0 ? (opened    / sent) * 100 : 0;
  const clickRate  = sent > 0 ? (clicked   / sent) * 100 : 0;
  const submitRate = sent > 0 ? (submitted / sent) * 100 : 0;

  // Security score: start at 100, deduct for bad rates, add for reporting
  const reportRate = sent > 0 ? (reported / sent) * 100 : 0;
  const score = Math.max(0, Math.min(100, Math.round(
    100
    - (clickRate  * 1.5)
    - (submitRate * 3)
    - (openRate   * 0.3)
    + (reportRate * 2)
  )));

  return { sent, opened, clicked, submitted, reported, openRate, clickRate, submitRate, score };
}

function buildDeptBreakdown(campaigns, statsMap) {
  return [];
}

function riskColor(value, low, high) {
  if (value >= high) return "#A32D2D";
  if (value >= low)  return "#854F0B";
  return "#3B6D11";
}

function scoreLabel(score) {
  if (score >= 80) return "Good security posture";
  if (score >= 60) return "Moderate risk";
  if (score >= 40) return "High risk";
  return "Critical — immediate training needed";
}

function scoreColor(score) {
  if (score >= 80) return "#3B6D11";
  if (score >= 60) return "#854F0B";
  return "#A32D2D";
}

// ─────────────────────────────────────────
// Styles
// ─────────────────────────────────────────
const s = {
  page:        { padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 },
  topbar:      { display: "flex", alignItems: "center", justifyContent: "space-between" },
  pageTitle:   { fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em" },
  filterLabel: { fontSize: 12, color: "var(--color-text-secondary, #6b6b67)" },
  select: {
    fontSize:     13,
    padding:      "6px 10px",
    border:       "0.5px solid var(--color-border-secondary, rgba(0,0,0,0.2))",
    borderRadius: 6,
    background:   "var(--color-background-primary, #fff)",
    color:        "var(--color-text-primary, #1a1a18)",
    cursor:       "pointer",
  },
  statGrid:  { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 },
  riskGrid:  { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 },
  riskCard: {
    border:        "0.5px solid",
    borderRadius:  10,
    padding:       "14px 16px",
    display:       "flex",
    flexDirection: "column",
    gap:           8,
  },
  riskLabel:  { fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" },
  riskValue:  { fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em" },
  riskDesc:   { fontSize: 12, lineHeight: 1.5 },
  riskBadge: {
    fontSize:     10,
    padding:      "2px 8px",
    borderRadius: 20,
    fontWeight:   600,
    whiteSpace:   "nowrap",
  },
  barTrack: {
    height:       6,
    background:   "rgba(0,0,0,0.1)",
    borderRadius: 3,
    overflow:     "hidden",
  },
  barFill: {
    height:       "100%",
    borderRadius: 3,
    transition:   "width 0.4s ease",
  },
  compTable: {
    background:   "var(--color-background-primary, #fff)",
    border:       "0.5px solid var(--color-border-tertiary, rgba(0,0,0,0.1))",
    borderRadius: 10,
    overflow:     "hidden",
  },
  compHead: {
    background:   "var(--color-background-secondary, #f0f0ee)",
    borderBottom: "0.5px solid var(--color-border-tertiary, rgba(0,0,0,0.1))",
  },
  compRow: {
    display:             "grid",
    gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr",
    padding:             "10px 14px",
    borderBottom:        "0.5px solid var(--color-border-tertiary, rgba(0,0,0,0.08))",
    alignItems:          "center",
  },
  table: {
    background:   "var(--color-background-primary, #fff)",
    border:       "0.5px solid var(--color-border-tertiary, rgba(0,0,0,0.1))",
    borderRadius: 10,
    overflow:     "hidden",
  },
  tableHead: {
    background:   "var(--color-background-secondary, #f0f0ee)",
    borderBottom: "0.5px solid var(--color-border-tertiary, rgba(0,0,0,0.1))",
  },
  breakRow: {
    display:             "grid",
    gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr",
    padding:             "10px 14px",
    borderBottom:        "0.5px solid var(--color-border-tertiary, rgba(0,0,0,0.08))",
    alignItems:          "center",
  },
  miniBar: {
    height:       4,
    width:        60,
    background:   "rgba(0,0,0,0.08)",
    borderRadius: 2,
    overflow:     "hidden",
    marginTop:    3,
  },
  th:    { fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary, #6b6b67)", textTransform: "uppercase", letterSpacing: "0.04em" },
  td:    { fontSize: 13 },
  muted: { color: "var(--color-text-secondary, #6b6b67)" },
  empty: { fontSize: 13, color: "var(--color-text-secondary)", padding: "20px 14px", textAlign: "center" },
  emptyState: {
    background:    "var(--color-background-primary, #fff)",
    border:        "0.5px solid var(--color-border-tertiary, rgba(0,0,0,0.1))",
    borderRadius:  10,
    padding:       "60px 20px",
    textAlign:     "center",
    display:       "flex",
    flexDirection: "column",
    alignItems:    "center",
    gap:           12,
  },
  emptyTitle:   { fontSize: 15, fontWeight: 500 },
  emptyDesc:    { fontSize: 13, color: "var(--color-text-secondary, #6b6b67)", maxWidth: 400, lineHeight: 1.6 },
  grafanaCard: {
    background:    "#1e1e2e",
    borderRadius:  10,
    padding:       "20px 24px",
    display:       "flex",
    flexDirection: "column",
    gap:           10,
  },
  grafanaTitle: { fontSize: 14, fontWeight: 600, color: "#cdd6f4" },
  grafanaDesc:  { fontSize: 13, color: "#a6adc8", lineHeight: 1.6 },
  grafanaBtn: {
    alignSelf:      "flex-start",
    fontSize:       13,
    padding:        "7px 16px",
    background:     "#89b4fa",
    color:          "#1e1e2e",
    border:         "none",
    borderRadius:   6,
    cursor:         "pointer",
    fontWeight:     600,
    textDecoration: "none",
    display:        "inline-block",
  },
};
