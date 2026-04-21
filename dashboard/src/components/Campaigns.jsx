import { useState, useEffect } from "react";
import { API_URL, StatusBadge, StatCard, Section } from "../App";

// ─────────────────────────────────────────
// Campaigns page
// Full campaign management - list, create,
// launch, pause, complete, view stats
// ─────────────────────────────────────────
export default function Campaigns() {
  const [campaigns, setCampaigns]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected]     = useState(null);
  const [error, setError]           = useState(null);

  useEffect(() => {
    loadCampaigns();
  }, []);

  async function loadCampaigns() {
    setLoading(true);
    try {
      const res  = await fetch(`${API_URL}/api/campaigns`);
      const data = await res.json();
      if (data.success) setCampaigns(data.data || []);
      else setError("Failed to load campaigns");
    } catch {
      setError("Engine offline — start the engine to manage campaigns");
    } finally {
      setLoading(false);
    }
  }

  async function handleLaunch(id, theme) {
    try {
      const res = await fetch(`${API_URL}/api/campaigns/${id}/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme }),
      });
      const data = await res.json();
      if (data.success) {
        setCampaigns(prev =>
          prev.map(c => c.id === id ? data.data : c)
        );
        if (selected?.id === id) setSelected(data.data);
      }
    } catch {
      setError("Failed to launch campaign");
    }
  }

  async function handlePause(id) {
    try {
      const res  = await fetch(`${API_URL}/api/campaigns/${id}/pause`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setCampaigns(prev => prev.map(c => c.id === id ? data.data : c));
        if (selected?.id === id) setSelected(data.data);
      }
    } catch {
      setError("Failed to pause campaign");
    }
  }

  async function handleComplete(id) {
    try {
      const res  = await fetch(`${API_URL}/api/campaigns/${id}/complete`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setCampaigns(prev => prev.map(c => c.id === id ? data.data : c));
        if (selected?.id === id) setSelected(data.data);
      }
    } catch {
      setError("Failed to complete campaign");
    }
  }

  function onCreated(campaign) {
    setCampaigns(prev => [campaign, ...prev]);
    setShowCreate(false);
    setSelected(campaign);
  }

  // ── Render ──────────────────────────────
  if (selected) {
    return (
      <CampaignDetail
        campaign={selected}
        onBack={() => setSelected(null)}
        onLaunch={handleLaunch}
        onPause={handlePause}
        onComplete={handleComplete}
        onRefresh={loadCampaigns}
      />
    );
  }

  return (
    <div style={s.page}>
      {/* Topbar */}
      <div style={s.topbar}>
        <h1 style={s.pageTitle}>Campaigns</h1>
        <button style={s.btnPrimary} onClick={() => setShowCreate(true)}>
          + New campaign
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div style={s.errorBanner}>
          {error}
          <button style={s.errorDismiss} onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Create form modal */}
      {showCreate && (
        <CreateCampaignForm
          onCreated={onCreated}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Stats row */}
      <div style={s.statGrid}>
        <StatCard
          label="Total"
          value={campaigns.length}
          sub="all campaigns"
        />
        <StatCard
          label="Active"
          value={campaigns.filter(c => c.status === "active").length}
          sub="running now"
          subColor="#3B6D11"
        />
        <StatCard
          label="Draft"
          value={campaigns.filter(c => c.status === "draft").length}
          sub="not launched"
        />
        <StatCard
          label="Completed"
          value={campaigns.filter(c => c.status === "completed").length}
          sub="finished"
          subColor="#0C447C"
        />
      </div>

      {/* Campaign list */}
      <Section title="All campaigns">
        {loading ? (
          <div style={s.empty}>Loading...</div>
        ) : campaigns.length === 0 ? (
          <div style={s.emptyState}>
            <div style={s.emptyTitle}>No campaigns yet</div>
            <div style={s.emptyDesc}>Create your first phishing simulation to get started</div>
            <button style={s.btnPrimary} onClick={() => setShowCreate(true)}>
              + Create campaign
            </button>
          </div>
        ) : (
          <div style={s.table}>
            <div style={{ ...s.tableRow, ...s.tableHead }}>
              <span style={s.th}>Name</span>
              <span style={s.th}>Status</span>
              <span style={s.th}>From</span>
              <span style={s.th}>Subject</span>
              <span style={s.th}>Created</span>
              <span style={s.th}></span>
            </div>
            {campaigns.map(c => (
              <div key={c.id} style={s.tableRow}>
                <div>
                  <div style={s.td}>{c.name}</div>
                  {c.description && (
                    <div style={{ ...s.td, ...s.muted, fontSize: 11, marginTop: 2 }}>
                      {c.description}
                    </div>
                  )}
                </div>
                <StatusBadge status={c.status} />
                <span style={{ ...s.td, ...s.muted }}>{c.from_email}</span>
                <span style={{ ...s.td, ...s.muted }}>{truncate(c.subject, 30)}</span>
                <span style={{ ...s.td, ...s.muted }}>
                  {new Date(c.created_at).toLocaleDateString()}
                </span>
                <button style={s.btnGhost} onClick={() => setSelected(c)}>
                  View →
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ─────────────────────────────────────────
// Campaign detail view
// Shows full campaign info + stats + actions
// ─────────────────────────────────────────
function CampaignDetail({ campaign, onBack, onLaunch, onPause, onComplete, onRefresh }) {
  const [stats, setStats]       = useState(null);
  const [theme, setTheme]       = useState("");
  const [launching, setLaunch]  = useState(false);
  const [showTheme, setShowTheme] = useState(false);

  useEffect(() => {
    loadStats();
  }, [campaign.id]);

  async function loadStats() {
    try {
      const res  = await fetch(`${API_URL}/api/campaigns/${campaign.id}/stats`);
      const data = await res.json();
      if (data.success) setStats(data.data);
    } catch {}
  }

  async function confirmLaunch() {
    if (!theme.trim()) return;
    setLaunch(true);
    await onLaunch(campaign.id, theme);
    setLaunch(false);
    setShowTheme(false);
    loadStats();
  }

  return (
    <div style={s.page}>
      {/* Topbar */}
      <div style={s.topbar}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button style={s.backBtn} onClick={onBack}>← Back</button>
          <h1 style={s.pageTitle}>{campaign.name}</h1>
          <StatusBadge status={campaign.status} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {campaign.status === "draft" && (
            <button style={s.btnPrimary} onClick={() => setShowTheme(true)}>
              Launch campaign
            </button>
          )}
          {campaign.status === "active" && (
            <>
              <button style={s.btnWarning} onClick={() => onPause(campaign.id)}>
                Pause
              </button>
              <button style={s.btnDanger} onClick={() => onComplete(campaign.id)}>
                Complete
              </button>
            </>
          )}
          {campaign.status === "paused" && (
            <button style={s.btnPrimary} onClick={() => setShowTheme(true)}>
              Resume
            </button>
          )}
        </div>
      </div>

      {/* Launch theme prompt */}
      {showTheme && (
        <div style={s.themePrompt}>
          <div style={s.themeTitle}>Set campaign theme</div>
          <div style={s.themeDesc}>
            This tells the AI what kind of phishing email to generate for each target.
            Be specific — the more context, the more convincing the email.
          </div>
          <input
            style={s.input}
            placeholder='e.g. "IT password reset", "HR benefits enrollment", "DocuSign contract"'
            value={theme}
            onChange={e => setTheme(e.target.value)}
            onKeyDown={e => e.key === "Enter" && confirmLaunch()}
            autoFocus
          />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              style={{ ...s.btnPrimary, opacity: launching || !theme.trim() ? 0.6 : 1 }}
              onClick={confirmLaunch}
              disabled={launching || !theme.trim()}
            >
              {launching ? "Launching..." : "Launch"}
            </button>
            <button style={s.btnGhostSm} onClick={() => setShowTheme(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Campaign info */}
      <div style={s.infoGrid}>
        <InfoCard label="From" value={`${campaign.from_name} <${campaign.from_email}>`} />
        <InfoCard label="Subject" value={campaign.subject} />
        <InfoCard label="Redirect URL" value={campaign.redirect_url || "Not set"} />
        <InfoCard
          label="Launched"
          value={campaign.launched_at
            ? new Date(campaign.launched_at).toLocaleString()
            : "Not launched"}
        />
      </div>

      {/* Stats */}
      {stats && (
        <Section title="Campaign results">
          <div style={s.statGrid}>
            <StatCard
              label="Emails sent"
              value={stats.emails_sent.toLocaleString()}
              sub={`of ${stats.total_targets} targets`}
            />
            <StatCard
              label="Open rate"
              value={`${stats.open_rate.toFixed(1)}%`}
              sub={`${stats.emails_opened} opened`}
              subColor={stats.open_rate > 50 ? "#A32D2D" : "#3B6D11"}
            />
            <StatCard
              label="Click rate"
              value={`${stats.click_rate.toFixed(1)}%`}
              sub={`${stats.links_clicked} clicked`}
              subColor={stats.click_rate > 20 ? "#A32D2D" : "#3B6D11"}
            />
            <StatCard
              label="Submissions"
              value={`${stats.submission_rate.toFixed(1)}%`}
              sub={`${stats.forms_submitted} submitted credentials`}
              subColor={stats.submission_rate > 5 ? "#A32D2D" : "#3B6D11"}
            />
            <StatCard
              label="Reported phishing"
              value={stats.reported_phishing.toLocaleString()}
              sub="correctly identified"
              subColor="#3B6D11"
            />
          </div>
        </Section>
      )}

      {!stats && campaign.status !== "draft" && (
        <div style={s.empty}>Loading stats...</div>
      )}

      {campaign.status === "draft" && (
        <div style={s.draftNotice}>
          Campaign is in draft mode. Launch it to start sending emails and tracking results.
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// Create campaign form
// ─────────────────────────────────────────
function CreateCampaignForm({ onCreated, onCancel }) {
  const [form, setForm] = useState({
    name:            "",
    description:     "",
    from_name:       "",
    from_email:      "",
    subject:         "",
    redirect_url:    "",
    template_id:     "00000000-0000-0000-0000-000000000001",
    target_group_id: "00000000-0000-0000-0000-000000000001",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit() {
    if (!form.name || !form.from_name || !form.from_email || !form.subject) {
      setError("Name, from name, from email and subject are required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res  = await fetch(`${API_URL}/api/campaigns`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        onCreated(data.data);
      } else {
        setError(data.error || "Failed to create campaign");
      }
    } catch {
      setError("Engine offline — cannot create campaign");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={s.modal}>
      <div style={s.modalHeader}>
        <span style={s.modalTitle}>New campaign</span>
        <button style={s.closeBtn} onClick={onCancel}>×</button>
      </div>

      {error && <div style={s.errorBanner}>{error}</div>}

      <div style={s.formGrid}>
        <Field label="Campaign name *" span={2}>
          <input style={s.input} value={form.name}
            onChange={e => update("name", e.target.value)}
            placeholder="Q1 IT Password Reset" />
        </Field>
        <Field label="Description" span={2}>
          <input style={s.input} value={form.description}
            onChange={e => update("description", e.target.value)}
            placeholder="Optional description" />
        </Field>
        <Field label="From name *">
          <input style={s.input} value={form.from_name}
            onChange={e => update("from_name", e.target.value)}
            placeholder="IT Security Team" />
        </Field>
        <Field label="From email *">
          <input style={s.input} value={form.from_email}
            onChange={e => update("from_email", e.target.value)}
            placeholder="security@yourcompany.com" />
        </Field>
        <Field label="Email subject *" span={2}>
          <input style={s.input} value={form.subject}
            onChange={e => update("subject", e.target.value)}
            placeholder="Action required: Reset your password immediately" />
        </Field>
        <Field label="Redirect URL" span={2}>
          <input style={s.input} value={form.redirect_url}
            onChange={e => update("redirect_url", e.target.value)}
            placeholder="https://yourcompany.com/security-awareness" />
        </Field>
      </div>

      <div style={s.formNote}>
        Template and target group selection coming in next update.
        AI will generate personalized emails for each target on launch.
      </div>

      <div style={s.modalFooter}>
        <button style={s.btnGhostSm} onClick={onCancel}>Cancel</button>
        <button
          style={{ ...s.btnPrimary, opacity: saving ? 0.6 : 1 }}
          onClick={handleSubmit}
          disabled={saving}
        >
          {saving ? "Creating..." : "Create campaign"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// Small reusable components
// ─────────────────────────────────────────
function InfoCard({ label, value }) {
  return (
    <div style={s.infoCard}>
      <div style={s.infoLabel}>{label}</div>
      <div style={s.infoValue}>{value}</div>
    </div>
  );
}

function Field({ label, children, span }) {
  return (
    <div style={{ gridColumn: span === 2 ? "1 / -1" : undefined }}>
      <label style={s.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}

function truncate(str, n) {
  return str && str.length > n ? str.slice(0, n) + "..." : str;
}

// ─────────────────────────────────────────
// Styles
// ─────────────────────────────────────────
const s = {
  page:        { padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 },
  topbar:      { display: "flex", alignItems: "center", justifyContent: "space-between" },
  pageTitle:   { fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em" },
  statGrid:    { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 },
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
  tableRow: {
    display:             "grid",
    gridTemplateColumns: "2fr 1fr 1.5fr 2fr 1fr 80px",
    padding:             "10px 14px",
    borderBottom:        "0.5px solid var(--color-border-tertiary, rgba(0,0,0,0.08))",
    alignItems:          "center",
  },
  th:     { fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary, #6b6b67)", textTransform: "uppercase", letterSpacing: "0.04em" },
  td:     { fontSize: 13 },
  muted:  { color: "var(--color-text-secondary, #6b6b67)" },
  empty:  { fontSize: 13, color: "var(--color-text-secondary)", padding: "20px 14px", textAlign: "center" },
  emptyState: {
    background:   "var(--color-background-primary, #fff)",
    border:       "0.5px solid var(--color-border-tertiary, rgba(0,0,0,0.1))",
    borderRadius: 10,
    padding:      "40px 20px",
    textAlign:    "center",
    display:      "flex",
    flexDirection:"column",
    alignItems:   "center",
    gap:          12,
  },
  emptyTitle: { fontSize: 15, fontWeight: 500 },
  emptyDesc:  { fontSize: 13, color: "var(--color-text-secondary, #6b6b67)" },
  errorBanner: {
    background:   "#FCEBEB",
    color:        "#791F1F",
    border:       "0.5px solid #F09595",
    borderRadius: 8,
    padding:      "10px 14px",
    fontSize:     13,
    display:      "flex",
    justifyContent: "space-between",
    alignItems:   "center",
  },
  errorDismiss: { background: "none", border: "none", color: "#791F1F", cursor: "pointer", fontSize: 16 },
  modal: {
    background:   "var(--color-background-primary, #fff)",
    border:       "0.5px solid var(--color-border-secondary, rgba(0,0,0,0.2))",
    borderRadius: 12,
    padding:      "20px 24px",
    display:      "flex",
    flexDirection:"column",
    gap:          16,
  },
  modalHeader:  { display: "flex", justifyContent: "space-between", alignItems: "center" },
  modalTitle:   { fontSize: 15, fontWeight: 600 },
  modalFooter:  { display: "flex", justifyContent: "flex-end", gap: 8 },
  closeBtn:     { background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--color-text-secondary)" },
  formGrid:     { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  fieldLabel:   { fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary, #6b6b67)", display: "block", marginBottom: 4 },
  input: {
    width:        "100%",
    padding:      "8px 10px",
    fontSize:     13,
    border:       "0.5px solid var(--color-border-secondary, rgba(0,0,0,0.2))",
    borderRadius: 6,
    background:   "var(--color-background-primary, #fff)",
    color:        "var(--color-text-primary, #1a1a18)",
    outline:      "none",
    boxSizing:    "border-box",
  },
  formNote: {
    fontSize:     12,
    color:        "var(--color-text-secondary, #6b6b67)",
    background:   "var(--color-background-secondary, #f0f0ee)",
    borderRadius: 6,
    padding:      "8px 12px",
  },
  infoGrid:     { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 },
  infoCard: {
    background:   "var(--color-background-secondary, #f0f0ee)",
    borderRadius: 8,
    padding:      "10px 14px",
  },
  infoLabel:    { fontSize: 11, color: "var(--color-text-secondary, #6b6b67)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 },
  infoValue:    { fontSize: 13, fontWeight: 500 },
  themePrompt: {
    background:   "var(--color-background-primary, #fff)",
    border:       "0.5px solid #378ADD",
    borderRadius: 10,
    padding:      "16px 20px",
  },
  themeTitle:   { fontSize: 14, fontWeight: 600, marginBottom: 6 },
  themeDesc:    { fontSize: 12, color: "var(--color-text-secondary, #6b6b67)", marginBottom: 12, lineHeight: 1.6 },
  draftNotice: {
    fontSize:     13,
    color:        "#633806",
    background:   "#FAEEDA",
    border:       "0.5px solid #EF9F27",
    borderRadius: 8,
    padding:      "12px 16px",
  },
  backBtn: {
    fontSize:     13,
    color:        "#185FA5",
    background:   "none",
    border:       "none",
    cursor:       "pointer",
    padding:      0,
  },
  btnPrimary: {
    fontSize:     13,
    padding:      "7px 16px",
    background:   "#185FA5",
    color:        "#fff",
    border:       "none",
    borderRadius: 6,
    cursor:       "pointer",
    fontWeight:   500,
  },
  btnWarning: {
    fontSize:     13,
    padding:      "7px 16px",
    background:   "#FAEEDA",
    color:        "#633806",
    border:       "0.5px solid #EF9F27",
    borderRadius: 6,
    cursor:       "pointer",
    fontWeight:   500,
  },
  btnDanger: {
    fontSize:     13,
    padding:      "7px 16px",
    background:   "#FCEBEB",
    color:        "#791F1F",
    border:       "0.5px solid #F09595",
    borderRadius: 6,
    cursor:       "pointer",
    fontWeight:   500,
  },
  btnGhost: {
    fontSize:     12,
    padding:      "5px 10px",
    background:   "transparent",
    border:       "0.5px solid var(--color-border-secondary, rgba(0,0,0,0.2))",
    borderRadius: 6,
    cursor:       "pointer",
    color:        "var(--color-text-primary)",
  },
  btnGhostSm: {
    fontSize:     13,
    padding:      "7px 14px",
    background:   "transparent",
    border:       "0.5px solid var(--color-border-secondary, rgba(0,0,0,0.2))",
    borderRadius: 6,
    cursor:       "pointer",
    color:        "var(--color-text-primary)",
  },
};
