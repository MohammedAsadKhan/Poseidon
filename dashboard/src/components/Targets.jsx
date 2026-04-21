import { useState, useEffect, useRef } from "react";
import { API_URL, StatCard, Section, StatusBadge } from "../App";

// ─────────────────────────────────────────
// Targets page
// Manage target groups and individual targets
// CSV import, manual entry, group management
// ─────────────────────────────────────────
export default function Targets() {
  const [groups, setGroups]         = useState([]);
  const [selected, setSelected]     = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  useEffect(() => {
    loadGroups();
  }, []);

  async function loadGroups() {
    setLoading(true);
    try {
      const res  = await fetch(`${API_URL}/api/target-groups`);
      const data = await res.json();
      if (data.success) setGroups(data.data || []);
    } catch {
      // Engine offline - show empty state
    } finally {
      setLoading(false);
    }
  }

  function onGroupCreated(group) {
    setGroups(prev => [group, ...prev]);
    setShowCreate(false);
    setSelected(group);
  }

  if (selected) {
    return (
      <GroupDetail
        group={selected}
        onBack={() => setSelected(null)}
        onRefresh={loadGroups}
      />
    );
  }

  return (
    <div style={s.page}>
      <div style={s.topbar}>
        <h1 style={s.pageTitle}>Targets</h1>
        <button style={s.btnPrimary} onClick={() => setShowCreate(true)}>
          + New group
        </button>
      </div>

      {error && <ErrorBanner msg={error} onDismiss={() => setError(null)} />}

      {showCreate && (
        <CreateGroupForm
          onCreated={onGroupCreated}
          onCancel={() => setShowCreate(false)}
        />
      )}

      <div style={s.statGrid}>
        <StatCard label="Total groups" value={groups.length} sub="target lists" />
        <StatCard
          label="Total targets"
          value={groups.reduce((a, g) => a + (g.target_count || 0), 0).toLocaleString()}
          sub="across all groups"
        />
      </div>

      <Section title="Target groups">
        {loading ? (
          <div style={s.empty}>Loading...</div>
        ) : groups.length === 0 ? (
          <EmptyState
            title="No target groups yet"
            desc="Create a group and import targets via CSV or add them manually"
            action={{ label: "+ Create group", onClick: () => setShowCreate(true) }}
          />
        ) : (
          <div style={s.table}>
            <div style={{ ...s.tableRow, ...s.tableHead }}>
              <span style={s.th}>Group name</span>
              <span style={s.th}>Targets</span>
              <span style={s.th}>Description</span>
              <span style={s.th}>Created</span>
              <span style={s.th}></span>
            </div>
            {groups.map(g => (
              <div key={g.id} style={s.tableRow}>
                <span style={s.td}>{g.name}</span>
                <span style={s.td}>{(g.target_count || 0).toLocaleString()}</span>
                <span style={{ ...s.td, ...s.muted }}>{g.description || "—"}</span>
                <span style={{ ...s.td, ...s.muted }}>
                  {new Date(g.created_at).toLocaleDateString()}
                </span>
                <button style={s.btnGhost} onClick={() => setSelected(g)}>
                  View →
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* CSV format reference */}
      <Section title="CSV import format">
        <div style={s.codeBlock}>
          <div style={s.codeLabel}>Expected columns</div>
          <pre style={s.code}>
{`email,first_name,last_name,position,department
john.smith@company.com,John,Smith,Software Engineer,Engineering
sarah.jones@company.com,Sarah,Jones,VP Finance,Finance
m.chen@company.com,Michael,Chen,HR Manager,Human Resources`}
          </pre>
          <div style={s.codeNote}>
            Only <code>email</code> is required. All other columns are optional but
            improve AI email personalization — the more context, the more convincing the simulation.
          </div>
        </div>
      </Section>
    </div>
  );
}

// ─────────────────────────────────────────
// Group detail - view and manage targets
// in a specific group
// ─────────────────────────────────────────
function GroupDetail({ group, onBack, onRefresh }) {
  const [targets, setTargets]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showAdd, setShowAdd]       = useState(false);
  const [importing, setImporting]   = useState(false);
  const [importResult, setResult]   = useState(null);
  const [error, setError]           = useState(null);
  const fileRef                     = useRef(null);

  useEffect(() => {
    loadTargets();
  }, [group.id]);

  async function loadTargets() {
    setLoading(true);
    try {
      const res  = await fetch(`${API_URL}/api/target-groups/${group.id}/targets`);
      const data = await res.json();
      if (data.success) setTargets(data.data || []);
    } catch {
      setError("Failed to load targets");
    } finally {
      setLoading(false);
    }
  }

  async function handleCSV(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setResult(null);
    setError(null);

    try {
      const text    = await file.text();
      const parsed  = parseCSV(text);

      if (parsed.errors.length && !parsed.rows.length) {
        setError(`CSV error: ${parsed.errors[0]}`);
        return;
      }

      const res = await fetch(`${API_URL}/api/target-groups/${group.id}/targets/bulk`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ targets: parsed.rows }),
      });
      const data = await res.json();

      if (data.success) {
        setResult({
          imported: data.data.imported,
          skipped:  data.data.skipped,
          errors:   data.data.errors || [],
        });
        loadTargets();
        onRefresh();
      } else {
        setError(data.error || "Import failed");
      }
    } catch {
      setError("Failed to import CSV");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function onTargetAdded(target) {
    setTargets(prev => [target, ...prev]);
    setShowAdd(false);
    onRefresh();
  }

  return (
    <div style={s.page}>
      <div style={s.topbar}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button style={s.backBtn} onClick={onBack}>← Back</button>
          <h1 style={s.pageTitle}>{group.name}</h1>
          <span style={s.countBadge}>{targets.length} targets</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            style={s.btnSecondary}
            onClick={() => fileRef.current?.click()}
            disabled={importing}
          >
            {importing ? "Importing..." : "Import CSV"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={handleCSV}
          />
          <button style={s.btnPrimary} onClick={() => setShowAdd(true)}>
            + Add target
          </button>
        </div>
      </div>

      {error && <ErrorBanner msg={error} onDismiss={() => setError(null)} />}

      {importResult && (
        <div style={s.successBanner}>
          Imported {importResult.imported} targets
          {importResult.skipped > 0 && `, skipped ${importResult.skipped} duplicates`}
          {importResult.errors.length > 0 && `, ${importResult.errors.length} errors`}
          <button style={s.dismissBtn} onClick={() => setResult(null)}>×</button>
        </div>
      )}

      {showAdd && (
        <AddTargetForm
          groupId={group.id}
          onAdded={onTargetAdded}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {/* Authorization reminder */}
      <div style={s.authNotice}>
        <span style={s.authIcon}>&#9888;</span>
        <span>
          Only add targets from organizations where you have explicit written authorization
          to conduct security awareness testing. Unauthorized use is illegal.
        </span>
      </div>

      <Section title="Targets">
        {loading ? (
          <div style={s.empty}>Loading...</div>
        ) : targets.length === 0 ? (
          <EmptyState
            title="No targets in this group"
            desc="Import a CSV file or add targets manually"
            action={{ label: "Import CSV", onClick: () => fileRef.current?.click() }}
          />
        ) : (
          <div style={s.table}>
            <div style={{ ...s.targetRow, ...s.tableHead }}>
              <span style={s.th}>Email</span>
              <span style={s.th}>Name</span>
              <span style={s.th}>Position</span>
              <span style={s.th}>Department</span>
              <span style={s.th}>Added</span>
            </div>
            {targets.map(t => (
              <div key={t.id} style={s.targetRow}>
                <span style={s.td}>{t.email}</span>
                <span style={s.td}>
                  {[t.first_name, t.last_name].filter(Boolean).join(" ") || "—"}
                </span>
                <span style={{ ...s.td, ...s.muted }}>{t.position || "—"}</span>
                <span style={{ ...s.td, ...s.muted }}>{t.department || "—"}</span>
                <span style={{ ...s.td, ...s.muted }}>
                  {new Date(t.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ─────────────────────────────────────────
// Create target group form
// ─────────────────────────────────────────
function CreateGroupForm({ onCreated, onCancel }) {
  const [name, setName]         = useState("");
  const [desc, setDesc]         = useState("");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);

  async function handleSubmit() {
    if (!name.trim()) { setError("Group name is required"); return; }
    setSaving(true);
    try {
      const res  = await fetch(`${API_URL}/api/target-groups`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name, description: desc }),
      });
      const data = await res.json();
      if (data.success) onCreated(data.data);
      else setError(data.error || "Failed to create group");
    } catch {
      setError("Engine offline");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={s.modal}>
      <div style={s.modalHeader}>
        <span style={s.modalTitle}>New target group</span>
        <button style={s.closeBtn} onClick={onCancel}>×</button>
      </div>
      {error && <ErrorBanner msg={error} onDismiss={() => setError(null)} />}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Group name *">
          <input style={s.input} value={name} onChange={e => setName(e.target.value)}
            placeholder="Engineering Department" autoFocus />
        </Field>
        <Field label="Description">
          <input style={s.input} value={desc} onChange={e => setDesc(e.target.value)}
            placeholder="Optional description" />
        </Field>
      </div>
      <div style={s.modalFooter}>
        <button style={s.btnGhostSm} onClick={onCancel}>Cancel</button>
        <button
          style={{ ...s.btnPrimary, opacity: saving ? 0.6 : 1 }}
          onClick={handleSubmit}
          disabled={saving}
        >
          {saving ? "Creating..." : "Create group"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// Add single target form
// ─────────────────────────────────────────
function AddTargetForm({ groupId, onAdded, onCancel }) {
  const [form, setForm] = useState({
    email: "", first_name: "", last_name: "", position: "", department: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  function update(k, v) { setForm(p => ({ ...p, [k]: v })); }

  async function handleSubmit() {
    if (!form.email.trim()) { setError("Email is required"); return; }
    if (!form.email.includes("@")) { setError("Enter a valid email address"); return; }
    setSaving(true);
    try {
      const res  = await fetch(`${API_URL}/api/target-groups/${groupId}/targets`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) onAdded(data.data);
      else setError(data.error || "Failed to add target");
    } catch {
      setError("Engine offline");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={s.modal}>
      <div style={s.modalHeader}>
        <span style={s.modalTitle}>Add target</span>
        <button style={s.closeBtn} onClick={onCancel}>×</button>
      </div>
      {error && <ErrorBanner msg={error} onDismiss={() => setError(null)} />}
      <div style={s.formGrid}>
        <Field label="Email *" span={2}>
          <input style={s.input} value={form.email}
            onChange={e => update("email", e.target.value)}
            placeholder="john.smith@company.com" autoFocus />
        </Field>
        <Field label="First name">
          <input style={s.input} value={form.first_name}
            onChange={e => update("first_name", e.target.value)}
            placeholder="John" />
        </Field>
        <Field label="Last name">
          <input style={s.input} value={form.last_name}
            onChange={e => update("last_name", e.target.value)}
            placeholder="Smith" />
        </Field>
        <Field label="Position">
          <input style={s.input} value={form.position}
            onChange={e => update("position", e.target.value)}
            placeholder="Software Engineer" />
        </Field>
        <Field label="Department">
          <input style={s.input} value={form.department}
            onChange={e => update("department", e.target.value)}
            placeholder="Engineering" />
        </Field>
      </div>
      <div style={s.modalFooter}>
        <button style={s.btnGhostSm} onClick={onCancel}>Cancel</button>
        <button
          style={{ ...s.btnPrimary, opacity: saving ? 0.6 : 1 }}
          onClick={handleSubmit}
          disabled={saving}
        >
          {saving ? "Adding..." : "Add target"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// CSV parser
// Handles headers, trims whitespace,
// skips blank rows, collects errors
// ─────────────────────────────────────────
function parseCSV(text) {
  const lines  = text.trim().split("\n").map(l => l.trim()).filter(Boolean);
  const errors = [];
  const rows   = [];

  if (lines.length < 2) {
    return { rows, errors: ["CSV must have a header row and at least one data row"] };
  }

  const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
  const emailIdx = headers.indexOf("email");

  if (emailIdx === -1) {
    return { rows, errors: ["CSV must have an 'email' column"] };
  }

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.trim());
    const email = cols[emailIdx];

    if (!email || !email.includes("@")) {
      errors.push(`Row ${i + 1}: invalid email "${email}"`);
      continue;
    }

    rows.push({
      email,
      first_name:  get(cols, headers, "first_name") || get(cols, headers, "firstname"),
      last_name:   get(cols, headers, "last_name")  || get(cols, headers, "lastname"),
      position:    get(cols, headers, "position")   || get(cols, headers, "title"),
      department:  get(cols, headers, "department"),
    });
  }

  return { rows, errors };
}

function get(cols, headers, key) {
  const i = headers.indexOf(key);
  return i !== -1 ? (cols[i] || "") : "";
}

// ─────────────────────────────────────────
// Shared small components
// ─────────────────────────────────────────
function Field({ label, children, span }) {
  return (
    <div style={{ gridColumn: span === 2 ? "1 / -1" : undefined }}>
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
    gridTemplateColumns: "2fr 1fr 1.5fr 1fr 80px",
    padding:             "10px 14px",
    borderBottom:        "0.5px solid var(--color-border-tertiary, rgba(0,0,0,0.08))",
    alignItems:          "center",
  },
  targetRow: {
    display:             "grid",
    gridTemplateColumns: "2fr 1.5fr 1.5fr 1.5fr 1fr",
    padding:             "10px 14px",
    borderBottom:        "0.5px solid var(--color-border-tertiary, rgba(0,0,0,0.08))",
    alignItems:          "center",
  },
  th:    { fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary, #6b6b67)", textTransform: "uppercase", letterSpacing: "0.04em" },
  td:    { fontSize: 13 },
  muted: { color: "var(--color-text-secondary, #6b6b67)" },
  empty: { fontSize: 13, color: "var(--color-text-secondary)", padding: "20px 14px", textAlign: "center" },
  emptyState: {
    background: "var(--color-background-primary, #fff)",
    border: "0.5px solid var(--color-border-tertiary, rgba(0,0,0,0.1))",
    borderRadius: 10,
    padding: "40px 20px",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
  },
  emptyTitle: { fontSize: 15, fontWeight: 500 },
  emptyDesc:  { fontSize: 13, color: "var(--color-text-secondary, #6b6b67)" },
  authNotice: {
    background:   "#FAEEDA",
    border:       "0.5px solid #EF9F27",
    borderRadius: 8,
    padding:      "10px 14px",
    fontSize:     12,
    color:        "#633806",
    display:      "flex",
    alignItems:   "flex-start",
    gap:          8,
    lineHeight:   1.6,
  },
  authIcon:  { fontSize: 14, marginTop: 1 },
  codeBlock: {
    background:   "#1e1e2e",
    borderRadius: 10,
    padding:      "16px 20px",
    display:      "flex",
    flexDirection:"column",
    gap:          10,
  },
  codeLabel: { fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em" },
  code: {
    fontSize:   12,
    color:      "#a6e3a1",
    fontFamily: "var(--font-mono, monospace)",
    margin:     0,
    lineHeight: 1.7,
    whiteSpace: "pre",
  },
  codeNote: {
    fontSize:   12,
    color:      "#888",
    lineHeight: 1.6,
  },
  countBadge: {
    fontSize:     11,
    padding:      "2px 8px",
    background:   "#E6F1FB",
    color:        "#0C447C",
    borderRadius: 20,
    fontWeight:   500,
  },
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
  successBanner: {
    background:     "#EAF3DE",
    color:          "#27500A",
    border:         "0.5px solid #97C459",
    borderRadius:   8,
    padding:        "10px 14px",
    fontSize:       13,
    display:        "flex",
    justifyContent: "space-between",
    alignItems:     "center",
  },
  dismissBtn: { background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "inherit" },
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
