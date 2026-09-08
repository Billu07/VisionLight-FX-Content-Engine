import { useEffect, useMemo, useState } from "react";
import { apiEndpoints } from "../lib/api";
import { notify } from "../lib/notifications";

/**
 * Superadmin "Emails" panel (Drift admin tab). Every transactional email the
 * platform sends is a template: rewrite the copy, change who receives it, switch
 * it off, preview with sample data, and send yourself a test — no deploy needed.
 * Empty fields fall back to the code defaults shown as placeholders.
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

const card = "rounded-2xl border border-white/10 bg-gray-900/60 p-5";
const input =
  "w-full rounded-lg border border-gray-700 bg-gray-950/60 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-cyan-400/60 focus:outline-none";
const label = "mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400";
const btn = "rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] transition-colors";
const btnPrimary = `${btn} bg-cyan-400 text-gray-950 hover:bg-cyan-300 disabled:opacity-40`;
const btnGhost = `${btn} border border-gray-700 text-gray-300 hover:text-white disabled:opacity-40`;

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
    return <div className="text-sm text-gray-400">Loading email settings…</div>;
  }

  return (
    <div className="space-y-4">
      {meta && (
        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
            meta.configured ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100" : "border-amber-400/20 bg-amber-500/10 text-amber-100"
          }`}
        >
          <span>
            {meta.configured ? (
              <>
                Sending as <strong>{meta.from}</strong>
              </>
            ) : (
              "SMTP isn't configured on the server yet — templates are saved, but nothing is sent until SMTP_* env is set."
            )}
          </span>
          <span className="text-xs opacity-80">
            Team notices go to: {meta.adminEmails.length ? meta.adminEmails.join(", ") : "ADMIN_EMAILS (not set)"}
          </span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        {/* Template list */}
        <div className={card}>
          <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-white">Emails</h2>
          <p className="mt-1 text-xs text-gray-400">Pick an email to edit its copy, recipients, or switch it off.</p>
          <div className="mt-4 space-y-2">
            {templates.map((t) => {
              const off = t.override?.enabled === false;
              const custom = !!t.override && Object.entries(t.override).some(([k, v]) => k !== "enabled" && k !== "updatedAt" && k !== "toMode" && v !== null && v !== undefined && v !== "");
              return (
                <button
                  key={t.key}
                  onClick={() => select(t)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    t.key === selectedKey ? "border-cyan-400/40 bg-cyan-400/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-white">{t.name}</span>
                    <span className="flex gap-1">
                      {off && <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-200">Off</span>}
                      {!off && (custom || t.override?.toMode !== undefined && t.override?.toMode !== "DEFAULT") && (
                        <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-cyan-200">Edited</span>
                      )}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-gray-400">{t.trigger}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Editor */}
        {selected && draft ? (
          <div className="space-y-4">
            <div className={card}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-white">{selected.name}</h3>
                  <p className="mt-1 text-xs text-gray-400">{selected.description}</p>
                  <p className="mt-1 text-[11px] text-gray-500">
                    Sent when: {selected.trigger}. Default recipients: {selected.audience}.
                  </p>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-300">
                  <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
                  {draft.enabled ? "Sending is on" : "Switched off"}
                </label>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {FIELD_META.map((f) => (
                  <div key={f.key} className={f.multiline ? "md:col-span-2" : ""}>
                    <label className={label}>
                      {f.label}
                      {draft[f.key] ? <span className="ml-2 text-cyan-300/80">edited</span> : <span className="ml-2 text-gray-600">default</span>}
                    </label>
                    {f.multiline ? (
                      <textarea
                        className={`${input} ${f.mono ? "font-mono text-xs" : ""}`}
                        rows={f.mono ? 6 : 3}
                        value={draft[f.key]}
                        placeholder={selected.defaults[f.key] || "(empty)"}
                        onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                      />
                    ) : (
                      <input
                        className={input}
                        value={draft[f.key]}
                        placeholder={selected.defaults[f.key] || "(empty)"}
                        onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                      />
                    )}
                    <div className="mt-1 text-[11px] text-gray-500">{f.hint} Clear the field to use the default.</div>
                  </div>
                ))}
              </div>

              <div className="mt-4">
                <div className={label}>Variables — click to copy</div>
                <div className="flex flex-wrap gap-1.5">
                  {selected.vars.map((v) => (
                    <button
                      key={v.name}
                      type="button"
                      onClick={() => copyVar(v.name, v.html)}
                      title={`${v.description} · e.g. "${v.sample}"`}
                      className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[11px] text-cyan-200 hover:bg-white/[0.08]"
                    >
                      {v.html ? `{{{${v.name}}}}` : `{{${v.name}}}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className={card}>
              <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-white">Recipients</h4>
              <div className="mt-3 grid gap-3 md:grid-cols-[220px_1fr]">
                <div>
                  <label className={label}>Send to</label>
                  <select className={input} value={draft.toMode} onChange={(e) => setDraft({ ...draft, toMode: e.target.value as Draft["toMode"] })}>
                    <option value="DEFAULT">Default audience</option>
                    <option value="CUSTOM">Only these addresses</option>
                    <option value="BOTH">Default audience + these</option>
                  </select>
                  <div className="mt-1 text-[11px] text-gray-500">Default: {selected.audience}.</div>
                </div>
                <div>
                  <label className={label}>Addresses</label>
                  <textarea
                    className={input}
                    rows={2}
                    value={draft.toList}
                    disabled={draft.toMode === "DEFAULT"}
                    placeholder="one@example.com, two@example.com"
                    onChange={(e) => setDraft({ ...draft, toList: e.target.value })}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className={label}>BCC (always)</label>
                  <input className={input} value={draft.bcc} placeholder="Optional — e.g. a shared inbox that keeps a copy" onChange={(e) => setDraft({ ...draft, bcc: e.target.value })} />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button className={btnPrimary} onClick={save} disabled={saving || !dirty}>
                {saving ? "Saving…" : "Save"}
              </button>
              <button className={btnGhost} onClick={doPreview} disabled={previewing}>
                {previewing ? "Rendering…" : "Preview"}
              </button>
              <div className="flex items-center gap-2">
                <input className={`${input} w-56`} value={testTo} placeholder="Test to (defaults to you)" onChange={(e) => setTestTo(e.target.value)} />
                <button className={btnGhost} onClick={sendTest} disabled={testing || !meta?.configured} title={!meta?.configured ? "SMTP not configured" : undefined}>
                  {testing ? "Sending…" : "Send test"}
                </button>
              </div>
              <span className="flex-1" />
              <button className={`${btnGhost} text-rose-300`} onClick={reset} disabled={saving || !selected.override}>
                Reset to defaults
              </button>
            </div>

            {preview && (
              <div className={card}>
                <div className="mb-3 text-xs text-gray-400">
                  Subject: <span className="text-white">{preview.subject}</span>
                  <span className="ml-3 text-gray-600">rendered with sample values{dirty ? " and your unsaved edits" : ""}</span>
                </div>
                <div className="overflow-hidden rounded-xl border border-white/10 bg-white">
                  <iframe title="Email preview" srcDoc={preview.html} className="h-[560px] w-full" sandbox="" />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className={`${card} text-sm text-gray-400`}>Select an email on the left.</div>
        )}
      </div>
    </div>
  );
}
