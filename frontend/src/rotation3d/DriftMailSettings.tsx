import { useEffect, useMemo, useState } from "react";
import { apiEndpoints } from "../lib/api";
import { notify } from "../lib/notifications";

/**
 * Superadmin "Emails" panel (drift.li tab). Every transactional email the
 * platform sends is a template: rewrite the copy, change who receives it, switch
 * it off, preview with sample data, and send yourself a test — no deploy needed.
 * Empty fields fall back to the code defaults shown as placeholders.
 * Renders inside the drift.li console's .drift-ui root (themed light/dark).
 */

type TemplateVar = { name: string; description: string; sample: string; html?: boolean };
type Fields = { subject: string; heading: string; intro: string; bodyHtml: string; ctaLabel: string; ctaUrl: string; footnote: string };
type Override = Partial<Fields> & {
  enabled?: boolean;
  toMode?: "DEFAULT" | "CUSTOM" | "BOTH";
  toList?: string | null;
  bcc?: string | null;
  updatedAt?: string;
} & { [K in keyof Fields]?: string | null };
type Template = {
  key: string;
  name: string;
  description: string;
  trigger: string;
  audience: string;
  vars: TemplateVar[];
  defaults: Fields;
  override: Override | null;
};
type Draft = Fields & { enabled: boolean; toMode: "DEFAULT" | "CUSTOM" | "BOTH"; toList: string; bcc: string };

const FIELD_META: { key: keyof Fields; label: string; hint: string; multiline?: boolean; mono?: boolean }[] = [
  { key: "subject", label: "Subject", hint: "The email subject line." },
  { key: "heading", label: "Heading", hint: "Big title at the top of the email." },
  { key: "intro", label: "Intro", hint: "Opening paragraph under the heading.", multiline: true },
  { key: "bodyHtml", label: "Body (HTML)", hint: "Optional extra content. HTML is allowed; {{variables}} are escaped here.", multiline: true, mono: true },
  { key: "ctaLabel", label: "Button label", hint: "Leave both button fields empty for no button." },
  { key: "ctaUrl", label: "Button link", hint: "A URL or a {{variable}} that holds one." },
  { key: "footnote", label: "Footnote", hint: "Small print at the bottom." },
];

const draftFrom = (t: Template): Draft => ({
  subject: t.override?.subject ?? "",
  heading: t.override?.heading ?? "",
  intro: t.override?.intro ?? "",
  bodyHtml: t.override?.bodyHtml ?? "",
  ctaLabel: t.override?.ctaLabel ?? "",
  ctaUrl: t.override?.ctaUrl ?? "",
  footnote: t.override?.footnote ?? "",
  enabled: t.override?.enabled ?? true,
  toMode: t.override?.toMode ?? "DEFAULT",
  toList: t.override?.toList ?? "",
  bcc: t.override?.bcc ?? "",
});

const apiError = (e: any) => e?.message || "Something went wrong";

export default function DriftMailSettings() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [meta, setMeta] = useState<{ configured: boolean; from: string; adminEmails: string[] } | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [testTo, setTestTo] = useState("");
  // Phones: the list and the editor take turns (pick → editor, back → list).
  const [mobileEditing, setMobileEditing] = useState(false);

  const selected = useMemo(() => templates.find((t) => t.key === selectedKey) || null, [templates, selectedKey]);

  const load = async (keepKey?: string | null) => {
    setLoading(true);
    try {
      const r = await apiEndpoints.driftMailTemplates();
      const list: Template[] = r.data.templates || [];
      setTemplates(list);
      setMeta({ configured: !!r.data.configured, from: r.data.from || "", adminEmails: r.data.adminEmails || [] });
      const key = keepKey ?? selectedKey ?? list[0]?.key ?? null;
      setSelectedKey(key);
      const t = list.find((x) => x.key === key);
      if (t) setDraft(draftFrom(t));
    } catch (e) {
      notify.error(apiError(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const select = (t: Template) => {
    setSelectedKey(t.key);
    setDraft(draftFrom(t));
    setPreview(null);
    setMobileEditing(true);
  };

  const draftPayload = (d: Draft) => ({
    enabled: d.enabled,
    subject: d.subject,
    heading: d.heading,
    intro: d.intro,
    bodyHtml: d.bodyHtml,
    ctaLabel: d.ctaLabel,
    ctaUrl: d.ctaUrl,
    footnote: d.footnote,
    toMode: d.toMode,
    toList: d.toList,
    bcc: d.bcc,
  });

  const dirty = !!selected && !!draft && JSON.stringify(draftFrom(selected)) !== JSON.stringify(draft);

  const save = async () => {
    if (!selected || !draft) return;
    setSaving(true);
    try {
      await apiEndpoints.driftMailSaveTemplate(selected.key, draftPayload(draft));
      notify.success("Email saved");
      await load(selected.key);
    } catch (e) {
      notify.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!selected) return;
    if (!window.confirm(`Reset "${selected.name}" to the built-in defaults?`)) return;
    setSaving(true);
    try {
      await apiEndpoints.driftMailResetTemplate(selected.key);
      notify.success("Back to defaults");
      await load(selected.key);
      setPreview(null);
    } catch (e) {
      notify.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const doPreview = async () => {
    if (!selected || !draft) return;
    setPreviewing(true);
    try {
      const r = await apiEndpoints.driftMailPreview(selected.key, draftPayload(draft));
      setPreview({ subject: r.data.subject, html: r.data.html });
    } catch (e) {
      notify.error(apiError(e));
    } finally {
      setPreviewing(false);
    }
  };

  const sendTest = async () => {
    if (!selected || !draft) return;
    setTesting(true);
    try {
      const r = await apiEndpoints.driftMailTest(selected.key, draftPayload(draft), testTo.trim() || undefined);
      notify.success(`Test sent to ${(r.data.to || []).join(", ")}`);
    } catch (e) {
      notify.error(apiError(e));
    } finally {
      setTesting(false);
    }
  };

  const copyVar = async (name: string, html?: boolean) => {
    const token = html ? `{{{${name}}}}` : `{{${name}}}`;
    try {
      await navigator.clipboard.writeText(token);
      notify.success(`${token} copied — paste it into any field`);
    } catch {
      notify.info(token);
    }
  };

  if (loading && templates.length === 0) {
    return (
      <div className="d-sub" style={{ padding: "24px 0" }}>
        Loading email settings…
      </div>
    );
  }

  return (
    <div className="d-rise" style={{ display: "grid", gap: 14, minWidth: 0 }}>
      {meta && (
        <div className={`d-banner ${meta.configured ? "ok" : "warn"}`} style={{ flexWrap: "wrap" }}>
          <span>
            {meta.configured ? (
              <>
                Sending as <strong>{meta.from}</strong>
              </>
            ) : (
              "SMTP isn't configured on the server yet — templates are saved, but nothing is sent until SMTP_* env is set."
            )}
          </span>
          <span style={{ fontSize: 12, opacity: 0.85 }}>
            Team notices go to: {meta.adminEmails.length ? meta.adminEmails.join(", ") : "ADMIN_EMAILS (not set)"}
          </span>
        </div>
      )}

      <div className={`d-split ${mobileEditing && selected ? "has-detail" : ""}`}>
        {/* Template list */}
        <aside className="d-split-side">
          <div className="d-card d-card-pad">
            <div className="d-h2">Emails</div>
            <p className="d-sub" style={{ fontSize: 12.5 }}>
              Pick an email to edit its copy, recipients, or switch it off.
            </p>
            <div className="d-list" style={{ marginTop: 12 }}>
              {templates.map((t) => {
                const off = t.override?.enabled === false;
                const custom =
                  !!t.override &&
                  Object.entries(t.override).some(
                    ([k, v]) => k !== "enabled" && k !== "updatedAt" && k !== "toMode" && v !== null && v !== undefined && v !== "",
                  );
                const edited = !off && (custom || (t.override?.toMode !== undefined && t.override?.toMode !== "DEFAULT"));
                return (
                  <button key={t.key} onClick={() => select(t)} className={`d-item ${t.key === selectedKey ? "active" : ""}`}>
                    <span className="grow">
                      <span className="d-name" style={{ display: "block", fontSize: 13.5 }}>
                        {t.name}
                      </span>
                      <span className="sub">{t.trigger}</span>
                    </span>
                    {off && <span className="d-pill err">Off</span>}
                    {edited && <span className="d-pill accent">Edited</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Editor */}
        {selected && draft ? (
          <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
            <button className="d-btn ghost sm d-mobile-back" style={{ marginBottom: 0, justifySelf: "start" }} onClick={() => setMobileEditing(false)}>
              ← All emails
            </button>
            <div className="d-card d-card-pad">
              <div className="d-head" style={{ alignItems: "flex-start" }}>
                <div>
                  <div className="d-h1" style={{ fontSize: 17 }}>
                    {selected.name}
                  </div>
                  <p className="d-sub" style={{ marginTop: 4 }}>
                    {selected.description}
                  </p>
                  <p className="d-note" style={{ marginTop: 4 }}>
                    Sent when: {selected.trigger}. Default recipients: {selected.audience}.
                  </p>
                </div>
                <label className="d-check" style={{ fontWeight: 650 }}>
                  <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
                  {draft.enabled ? "Sending is on" : "Switched off"}
                </label>
              </div>

              <div className="d-grid-2" style={{ marginTop: 16, gap: 14 }}>
                {FIELD_META.map((f) => (
                  <div key={f.key} className={f.multiline ? "sm:col-span-2" : ""} style={{ minWidth: 0 }}>
                    <label className="d-label">
                      {f.label}
                      <span style={{ marginLeft: 8, textTransform: "none", letterSpacing: 0, color: draft[f.key] ? "var(--accent)" : "var(--faint)" }}>
                        {draft[f.key] ? "edited" : "default"}
                      </span>
                    </label>
                    {f.multiline ? (
                      <textarea
                        className="d-textarea"
                        style={f.mono ? { fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12.5 } : undefined}
                        rows={f.mono ? 6 : 3}
                        value={draft[f.key]}
                        placeholder={selected.defaults[f.key] || "(empty)"}
                        onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                      />
                    ) : (
                      <input
                        className="d-input"
                        value={draft[f.key]}
                        placeholder={selected.defaults[f.key] || "(empty)"}
                        onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                      />
                    )}
                    <div className="d-note" style={{ marginTop: 5 }}>
                      {f.hint} Clear the field to use the default.
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 16 }}>
                <div className="d-label">Variables — click to copy</div>
                <div className="d-actions" style={{ gap: 6 }}>
                  {selected.vars.map((v) => (
                    <button key={v.name} type="button" onClick={() => copyVar(v.name, v.html)} title={`${v.description} · e.g. "${v.sample}"`} className="d-code">
                      {v.html ? `{{{${v.name}}}}` : `{{${v.name}}}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="d-card d-card-pad">
              <div className="d-eyebrow">Recipients</div>
              <div className="d-grid-2" style={{ marginTop: 12, gridTemplateColumns: undefined }}>
                <div className="d-field">
                  <label className="d-label">Send to</label>
                  <select className="d-select" value={draft.toMode} onChange={(e) => setDraft({ ...draft, toMode: e.target.value as Draft["toMode"] })}>
                    <option value="DEFAULT">Default audience</option>
                    <option value="CUSTOM">Only these addresses</option>
                    <option value="BOTH">Default audience + these</option>
                  </select>
                  <div className="d-note" style={{ marginTop: 5 }}>
                    Default: {selected.audience}.
                  </div>
                </div>
                <div className="d-field">
                  <label className="d-label">Addresses</label>
                  <textarea
                    className="d-textarea"
                    rows={2}
                    value={draft.toList}
                    disabled={draft.toMode === "DEFAULT"}
                    placeholder="one@example.com, two@example.com"
                    onChange={(e) => setDraft({ ...draft, toList: e.target.value })}
                  />
                </div>
                <div className="d-field sm:col-span-2">
                  <label className="d-label">BCC (always)</label>
                  <input
                    className="d-input"
                    value={draft.bcc}
                    placeholder="Optional — e.g. a shared inbox that keeps a copy"
                    onChange={(e) => setDraft({ ...draft, bcc: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="d-card d-card-pad">
              <div className="d-actions">
                <button className="d-btn primary" onClick={save} disabled={saving || !dirty}>
                  {saving ? "Saving…" : "Save"}
                </button>
                <button className="d-btn" onClick={doPreview} disabled={previewing}>
                  {previewing ? "Rendering…" : "Preview"}
                </button>
                <input
                  className="d-input"
                  style={{ flex: "1 1 200px", maxWidth: 280 }}
                  value={testTo}
                  placeholder="Test to (defaults to you)"
                  onChange={(e) => setTestTo(e.target.value)}
                  inputMode="email"
                />
                <button className="d-btn" onClick={sendTest} disabled={testing || !meta?.configured} title={!meta?.configured ? "SMTP not configured" : undefined}>
                  {testing ? "Sending…" : "Send test"}
                </button>
                <span style={{ flex: "1 0 8px" }} />
                <button className="d-btn danger sm" onClick={reset} disabled={saving || !selected.override}>
                  Reset to defaults
                </button>
              </div>
            </div>

            {preview && (
              <div className="d-card d-card-pad">
                <div className="d-sub" style={{ marginBottom: 10, fontSize: 12.5 }}>
                  Subject: <strong style={{ color: "var(--text)" }}>{preview.subject}</strong>
                  <span className="d-faint" style={{ marginLeft: 10 }}>
                    rendered with sample values{dirty ? " and your unsaved edits" : ""}
                  </span>
                </div>
                <div style={{ overflow: "hidden", borderRadius: 14, border: "1px solid var(--border)", background: "#fff" }}>
                  <iframe title="Email preview" srcDoc={preview.html} style={{ width: "100%", height: 560, border: 0, display: "block" }} sandbox="" />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="d-empty">Select an email to edit it.</div>
        )}
      </div>
    </div>
  );
}
