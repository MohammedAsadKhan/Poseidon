import { useState, useEffect } from "react";
import { API_URL, Section, StatCard } from "../App";

// ─────────────────────────────────────────
// Templates page
// Email template management
// Manual builder + AI generation via Ollama
// ─────────────────────────────────────────
export default function Templates() {
  const [templates, setTemplates]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError]           = useState(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    setLoading(true);
    try {
      const res  = await fetch(`${API_URL}/api/templates`);
      const data = await res.json();
      if (data.success) setTemplates(data.data || []);
    } catch {
      // Engine offline - show empty state
    } finally {
      setLoading(false);
    }
  }

  function onCreated(template) {
    setTemplates(prev => [template, ...prev]);
    setShowCreate(false);
    setSelected(template);
  }

  if (selected) {
    return (
      <TemplateDetail
        template={selected}
        onBack={() => setSelected(null)}
        onSaved={updated => {
          setTemplates(prev => prev.map(t => t.id === updated.id ? updated : t));
          setSelected(updated);
        }}
      />
    );
  }

  return (
    <div style={s.page}>
      <div style={s.topbar}>
        <h1 style={s.pageTitle}>Templates</h1>
        <button style={s.btnPrimary} onClick={() => setShowCreate(true)}>
          + New template
        </button>
      </div>

      {error && <ErrorBanner msg={error} onDismiss={() => setError(null)} />}

      {showCreate && (
        <CreateTemplateForm
          onCreated={onCreated}
          onCancel={() => setShowCreate(false)}
        />
      )}

      <div style={s.statGrid}>
        <StatCard label="Total templates" value={templates.length} sub="saved" />
        <StatCard
          label="AI generated"
          value={templates.filter(t => t.ai_generated).length}
          sub="via Ollama"
          subColor="#3C3489"
        />
      </div>

      {/* AI generation notice */}
      <div style={s.aiNotice}>
        <div style={s.aiNoticeBadge}>AI</div>
        <div>
          <div style={s.aiNoticeTitle}>AI-powered template generation</div>
          <div style={s.aiNoticeDesc}>
            When you launch a campaign, Poseidon uses Ollama ({" "}
            <code style={s.code}>llama3.1:8b</code>) to generate a unique,
            personalized email for each target based on their name, job title,
            and department. Templates here serve as base prompts and manual
            fallbacks.
          </div>
        </div>
      </div>

      <Section title="Saved templates">
        {loading ? (
          <div style={s.empty}>Loading...</div>
        ) : templates.length === 0 ? (
          <EmptyState
            title="No templates yet"
            desc="Create a base template or use AI generation when launching campaigns"
            action={{ label: "+ New template", onClick: () => setShowCreate(true) }}
          />
        ) : (
          <div style={s.grid}>
            {templates.map(t => (
              <TemplateCard
                key={t.id}
                template={t}
                onClick={() => setSelected(t)}
              />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ─────────────────────────────────────────
// Template card in the grid
// ─────────────────────────────────────────
function TemplateCard({ template, onClick }) {
  return (
    <button style={s.card} onClick={onClick}>
      <div style={s.cardTop}>
        <span style={s.cardName}>{template.name}</span>
        {template.ai_generated && (
          <span style={s.aiBadge}>AI</span>
        )}
      </div>
      <div style={s.cardSubject}>{template.subject}</div>
      <div style={s.cardPreview}>{stripHtml(template.body_html).slice(0, 120)}...</div>
      <div style={s.cardFooter}>
        <span style={s.cardDate}>
          {new Date(template.created_at).toLocaleDateString()}
        </span>
        <span style={s.cardLink}>View →</span>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────
// Template detail / editor
// ─────────────────────────────────────────
function TemplateDetail({ template, onBack, onSaved }) {
  const [tab, setTab]         = useState("preview");
  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState({
    name:      template.name,
    subject:   template.subject,
    body_html: template.body_html,
    body_text: template.body_text,
  });
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState(null);

  function update(k, v) { setForm(p => ({ ...p, [k]: v })); }

  async function handleSave() {
    setSaving(true);
    try {
      const res  = await fetch(`${API_URL}/api/templates/${template.id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        onSaved(data.data);
        setEditing(false);
      } else {
        setError(data.error || "Failed to save");
      }
    } catch {
      setError("Engine offline");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={s.page}>
      <div style={s.topbar}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button style={s.backBtn} onClick={onBack}>← Back</button>
          <h1 style={s.pageTitle}>{template.name}</h1>
          {template.ai_generated && <span style={s.aiBadge}>AI generated</span>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {editing ? (
            <>
              <button style={s.btnGhostSm} onClick={() => setEditing(false)}>Cancel</button>
              <button
                style={{ ...s.btnPrimary, opacity: saving ? 0.6 : 1 }}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
            </>
          ) : (
            <button style={s.btnSecondary} onClick={() => setEditing(true)}>
              Edit template
            </button>
          )}
        </div>
      </div>

      {error && <ErrorBanner msg={error} onDismiss={() => setError(null)} />}

      {/* Subject line */}
      <div style={s.subjectRow}>
        <span style={s.subjectLabel}>Subject</span>
        {editing ? (
          <input
            style={{ ...s.input, flex: 1 }}
            value={form.subject}
            onChange={e => update("subject", e.target.value)}
          />
        ) : (
          <span style={s.subjectValue}>{template.subject}</span>
        )}
      </div>

      {/* Tabs */}
      <div style={s.tabs}>
        {["preview", "html", "text"].map(t => (
          <button
            key={t}
            style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }}
            onClick={() => setTab(t)}
          >
            {t === "preview" ? "Preview" : t === "html" ? "HTML" : "Plain text"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "preview" && (
        <div style={s.previewFrame}>
          <div
            style={s.previewInner}
            dangerouslySetInnerHTML={{ __html: editing ? form.body_html : template.body_html }}
          />
        </div>
      )}
      {tab === "html" && (
        editing ? (
          <textarea
            style={s.codeEditor}
            value={form.body_html}
            onChange={e => update("body_html", e.target.value)}
            spellCheck={false}
          />
        ) : (
          <pre style={s.codeView}>{template.body_html}</pre>
        )
      )}
      {tab === "text" && (
        editing ? (
          <textarea
            style={s.codeEditor}
            value={form.body_text}
            onChange={e => update("body_text", e.target.value)}
          />
        ) : (
          <pre style={s.codeView}>{template.body_text}</pre>
        )
      )}

      {/* Tracking variables reference */}
      <Section title="Available template variables">
        <div style={s.varsGrid}>
          {TEMPLATE_VARS.map(v => (
            <div key={v.var} style={s.varCard}>
              <code style={s.varCode}>{v.var}</code>
              <span style={s.varDesc}>{v.desc}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ─────────────────────────────────────────
// Create template form
// Manual entry or AI-assisted generation
// ─────────────────────────────────────────
function CreateTemplateForm({ onCreated, onCancel }) {
  const [mode, setMode]       = useState("manual"); // manual | ai
  const [generating, setGen]  = useState(false);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState(null);
  const [aiTheme, setAiTheme] = useState("");
  const [form, setForm]       = useState({
    name:      "",
    subject:   "",
    body_html: DEFAULT_HTML,
    body_text: DEFAULT_TEXT,
  });

  function update(k, v) { setForm(p => ({ ...p, [k]: v })); }

  async function handleGenerate() {
    if (!aiTheme.trim()) { setError("Enter a theme first"); return; }
    setGen(true);
    setError(null);
    try {
      const res  = await fetch(`${API_URL}/api/templates/generate`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ theme: aiTheme }),
      });
      const data = await res.json();
      if (data.success) {
        setForm(p => ({
          ...p,
          subject:   data.data.subject,
          body_html: data.data.body_html,
          body_text: data.data.body_text,
          name:      p.name || aiTheme,
        }));
        setMode("manual"); // switch to manual to review
      } else {
        setError(data.error || "Generation failed");
      }
    } catch {
      setError("Engine or Ollama offline");
    } finally {
      setGen(false);
    }
  }

  async function handleSave() {
    if (!form.name || !form.subject) {
      setError("Name and subject are required");
      return;
    }
    setSaving(true);
    try {
      const res  = await fetch(`${API_URL}/api/templates`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ...form, ai_generated: mode === "ai" }),
      });
      const data = await res.json();
      if (data.success) onCreated(data.data);
      else setError(data.error || "Failed to save template");
    } catch {
      setError("Engine offline");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={s.modal}>
      <div style={s.modalHeader}>
        <span style={s.modalTitle}>New template</span>
        <button style={s.closeBtn} onClick={onCancel}>×</button>
      </div>

      {error && <ErrorBanner msg={error} onDismiss={() => setError(null)} />}

      {/* Mode toggle */}
      <div style={s.modeToggle}>
        <button
          style={{ ...s.modeBtn, ...(mode === "manual" ? s.modeBtnActive : {}) }}
          onClick={() => setMode("manual")}
        >
          Manual
        </button>
        <button
          style={{ ...s.modeBtn, ...(mode === "ai" ? s.modeBtnActive : {}) }}
          onClick={() => setMode("ai")}
        >
          AI generation
        </button>
      </div>

      {mode === "ai" && (
        <div style={s.aiPanel}>
          <div style={s.aiPanelTitle}>Generate with Ollama</div>
          <div style={s.aiPanelDesc}>
            Enter a campaign theme and Ollama will generate a complete phishing
            email template. Review and edit before saving.
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input
              style={{ ...s.input, flex: 1 }}
              placeholder='e.g. "IT security alert", "HR open enrollment"'
              value={aiTheme}
              onChange={e => setAiTheme(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleGenerate()}
            />
            <button
              style={{ ...s.btnPrimary, opacity: generating ? 0.6 : 1, whiteSpace: "nowrap" }}
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? "Generating..." : "Generate"}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Template name *">
          <input style={s.input} value={form.name}
            onChange={e => update("name", e.target.value)}
            placeholder="IT Password Reset" />
        </Field>
        <Field label="Subject line *">
          <input style={s.input} value={form.subject}
            onChange={e => update("subject", e.target.value)}
            placeholder="Urgent: Your password will expire in 24 hours" />
        </Field>
        <Field label="HTML body">
          <textarea
            style={{ ...s.codeEditor, height: 200 }}
            value={form.body_html}
            onChange={e => update("body_html", e.target.value)}
            spellCheck={false}
          />
        </Field>
        <Field label="Plain text body">
          <textarea
            style={{ ...s.codeEditor, height: 100 }}
            value={form.body_text}
            onChange={e => update("body_text", e.target.value)}
          />
        </Field>
      </div>

      <div style={s.modalFooter}>
        <button style={s.btnGhostSm} onClick={onCancel}>Cancel</button>
        <button
          style={{ ...s.btnPrimary, opacity: saving ? 0.6 : 1 }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save template"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// Shared small components
// ─────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div>
      <label style={s.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}

function ErrorBanner({ msg, onDismiss }) {
  return (
    <div style={s.errorBanner}>
      {msg}
      <button style={s.dismissBtn} onClick={onDismiss}>×</button>
    </div>
  );
}

function EmptyState({ title, desc, action }) {
  return (
    <div style={s.emptyState}>
      <div style={s.emptyTitle}>{title}</div>
      <div style={s.emptyDesc}>{desc}</div>
      {action && (
        <button style={s.btnPrimary} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// Constants
// ─────────────────────────────────────────
const TEMPLATE_VARS = [
  { var: "{{FIRST_NAME}}",   desc: "Target's first name" },
  { var: "{{LAST_NAME}}",    desc: "Target's last name" },
  { var: "{{EMAIL}}",        desc: "Target's email address" },
  { var: "{{POSITION}}",     desc: "Target's job title" },
  { var: "{{DEPARTMENT}}",   desc: "Target's department" },
  { var: "{{CLICK_URL}}",    desc: "Unique tracking link (required)" },
  { var: "{{FROM_NAME}}",    desc: "Sender display name" },
  { var: "{{FROM_EMAIL}}",   desc: "Sender email address" },
];

const DEFAULT_HTML = `<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>Dear {{FIRST_NAME}},</p>
  <p>Your message here.</p>
  <p><a href="{{CLICK_URL}}">Click here to take action</a></p>
  <p>Regards,<br>{{FROM_NAME}}</p>
</body>
</html>`;

const DEFAULT_TEXT = `Dear {{FIRST_NAME}},

Your message here.

Click here: {{CLICK_URL}}

Regards,
{{FROM_NAME}}`;

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────
function stripHtml(html = "") {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// ─────────────────────────────────────────
// Styles
// ─────────────────────────────────────────
const s = {
  page:        { padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 },
  topbar:      { display: "flex", alignItems: "center", justifyContent: "space-between" },
  pageTitle:   { fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em" },
  statGrid:    { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 },
  aiNotice: {
    background:   "#EEEDFE",
    border:       "0.5px solid #AFA9EC",
    borderRadius: 10,
    padding:      "14px 16px",
    display:      "flex",
    gap:          12,
    alignItems:   "flex-start",
  },
  aiNoticeBadge: {
    background:   "#534AB7",
    color:        "#fff",
    fontSize:     10,
    fontWeight:   700,
    padding:      "2px 7px",
    borderRadius: 20,
    letterSpacing:"0.06em",
    marginTop:    2,
    flexShrink:   0,
  },
  aiNoticeTitle: { fontSize: 13, fontWeight: 600, color: "#3C3489", marginBottom: 4 },
  aiNoticeDesc:  { fontSize: 12, color: "#534AB7", lineHeight: 1.6 },
  code:          { fontFamily: "var(--font-mono, monospace)", fontSize: 11 },
  grid: {
    display:             "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap:                 12,
  },
  card: {
    background:    "var(--color-background-primary, #fff)",
    border:        "0.5px solid var(--color-border-tertiary, rgba(0,0,0,0.1))",
    borderRadius:  10,
    padding:       "14px 16px",
    cursor:        "pointer",
    textAlign:     "left",
    display:       "flex",
    flexDirection: "column",
    gap:           8,
  },
  cardTop:     { display: "flex", justifyContent: "space-between", alignItems: "center" },
  cardName:    { fontSize: 14, fontWeight: 600 },
  cardSubject: { fontSize: 12, color: "var(--color-text-secondary, #6b6b67)" },
  cardPreview: { fontSize: 12, color: "var(--color-text-secondary, #6b6b67)", lineHeight: 1.5 },
  cardFooter:  { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  cardDate:    { fontSize: 11, color: "var(--color-text-secondary, #6b6b67)" },
  cardLink:    { fontSize: 12, color: "#185FA5" },
  aiBadge: {
    fontSize:     10,
    padding:      "2px 8px",
    background:   "#EEEDFE",
    color:        "#3C3489",
    borderRadius: 20,
    fontWeight:   600,
    letterSpacing:"0.04em",
  },
  subjectRow:   { display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--color-background-secondary, #f0f0ee)", borderRadius: 8 },
  subjectLabel: { fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary, #6b6b67)", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" },
  subjectValue: { fontSize: 13, fontWeight: 500 },
  tabs:    { display: "flex", gap: 4, borderBottom: "0.5px solid var(--color-border-tertiary, rgba(0,0,0,0.1))", paddingBottom: 0 },
  tab: {
    fontSize:     13,
    padding:      "6px 14px",
    background:   "transparent",
    border:       "none",
    cursor:       "pointer",
    color:        "var(--color-text-secondary, #6b6b67)",
    borderBottom: "2px solid transparent",
    marginBottom: -1,
  },
  tabActive: { color: "#185FA5", borderBottomColor: "#185FA5", fontWeight: 500 },
  previewFrame: {
    background:   "#fff",
    border:       "0.5px solid var(--color-border-tertiary, rgba(0,0,0,0.1))",
    borderRadius: 8,
    padding:      20,
    minHeight:    300,
  },
  previewInner: { maxWidth: 600 },
  codeEditor: {
    width:        "100%",
    minHeight:    300,
    padding:      "12px 14px",
    fontSize:     12,
    fontFamily:   "var(--font-mono, monospace)",
    background:   "#1e1e2e",
    color:        "#cdd6f4",
    border:       "none",
    borderRadius: 8,
    outline:      "none",
    resize:       "vertical",
    boxSizing:    "border-box",
    lineHeight:   1.6,
  },
  codeView: {
    padding:      "12px 14px",
    fontSize:     12,
    fontFamily:   "var(--font-mono, monospace)",
    background:   "#1e1e2e",
    color:        "#cdd6f4",
    borderRadius: 8,
    overflow:     "auto",
    margin:       0,
    lineHeight:   1.6,
    whiteSpace:   "pre-wrap",
  },
  varsGrid: {
    display:             "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap:                 8,
  },
  varCard: {
    background:   "var(--color-background-secondary, #f0f0ee)",
    borderRadius: 6,
    padding:      "8px 12px",
    display:      "flex",
    gap:          10,
    alignItems:   "center",
  },
  varCode: {
    fontFamily:  "var(--font-mono, monospace)",
    fontSize:    11,
    background:  "#1e1e2e",
    color:       "#a6e3a1",
    padding:     "2px 6px",
    borderRadius:4,
    whiteSpace:  "nowrap",
  },
  varDesc: { fontSize: 12, color: "var(--color-text-secondary, #6b6b67)" },
  modal: {
    background:    "var(--color-background-primary, #fff)",
    border:        "0.5px solid var(--color-border-secondary, rgba(0,0,0,0.2))",
    borderRadius:  12,
    padding:       "20px 24px",
    display:       "flex",
    flexDirection: "column",
    gap:           16,
  },
  modalHeader:  { display: "flex", justifyContent: "space-between", alignItems: "center" },
  modalTitle:   { fontSize: 15, fontWeight: 600 },
  modalFooter:  { display: "flex", justifyContent: "flex-end", gap: 8 },
  closeBtn:     { background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--color-text-secondary)" },
  modeToggle:   { display: "flex", gap: 4, background: "var(--color-background-secondary, #f0f0ee)", padding: 4, borderRadius: 8, alignSelf: "flex-start" },
  modeBtn: {
    fontSize:     13,
    padding:      "6px 14px",
    background:   "transparent",
    border:       "none",
    borderRadius: 6,
    cursor:       "pointer",
    color:        "var(--color-text-secondary, #6b6b67)",
  },
  modeBtnActive: { background: "var(--color-background-primary, #fff)", color: "var(--color-text-primary, #1a1a18)", fontWeight: 500 },
  aiPanel: {
    background:   "#EEEDFE",
    border:       "0.5px solid #AFA9EC",
    borderRadius: 8,
    padding:      "14px 16px",
  },
  aiPanelTitle: { fontSize: 13, fontWeight: 600, color: "#3C3489", marginBottom: 4 },
  aiPanelDesc:  { fontSize: 12, color: "#534AB7", lineHeight: 1.5 },
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
  errorBanner: {
    background:     "#FCEBEB",
    color:          "#791F1F",
    border:         "0.5px solid #F09595",
    borderRadius:   8,
    padding:        "10px 14px",
    fontSize:       13,
    display:        "flex",
    justifyContent: "space-between",
    alignItems:     "center",
  },
  dismissBtn:   { background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "inherit" },
  empty:        { fontSize: 13, color: "var(--color-text-secondary)", padding: "20px 14px", textAlign: "center" },
  emptyState: {
    background:    "var(--color-background-primary, #fff)",
    border:        "0.5px solid var(--color-border-tertiary, rgba(0,0,0,0.1))",
    borderRadius:  10,
    padding:       "40px 20px",
    textAlign:     "center",
    display:       "flex",
    flexDirection: "column",
    alignItems:    "center",
    gap:           12,
  },
  emptyTitle:  { fontSize: 15, fontWeight: 500 },
  emptyDesc:   { fontSize: 13, color: "var(--color-text-secondary, #6b6b67)" },
  backBtn: {
    fontSize:   13,
    color:      "#185FA5",
    background: "none",
    border:     "none",
    cursor:     "pointer",
    padding:    0,
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
  btnSecondary: {
    fontSize:     13,
    padding:      "7px 16px",
    background:   "transparent",
    color:        "var(--color-text-primary)",
    border:       "0.5px solid var(--color-border-secondary, rgba(0,0,0,0.2))",
    borderRadius: 6,
    cursor:       "pointer",
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
