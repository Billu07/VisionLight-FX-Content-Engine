import { useEffect, useState } from "react";
import { apiEndpoints } from "../lib/api";
import { LoadingSpinner } from "../components/LoadingSpinner";

/**
 * Drift lead-forms: a builder (single or multi-step, mixed field types, consent,
 * webhook) + a Leads viewer with CSV export. Dual-mode like the dashboards —
 * pass adminOrgId to run the superadmin brand-view (org-scoped endpoints).
 */

export type FormField = {
  key: string;
  type: "text" | "email" | "phone" | "textarea" | "select" | "radio" | "checkbox" | "consent" | "hidden";
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
  value?: string;
};
export type FormStep = { title?: string; fields: FormField[] };
export type FormDefinition = {
  multiStep: boolean;
  steps: FormStep[];
  consent: { enabled: boolean; text: string };
  submitLabel: string;
  successMessage: string;
};
export type DriftForm = {
  id: string;
  name: string;
  definition: FormDefinition;
  webhookUrl?: string | null;
  _count?: { leads: number };
};

const FIELD_TYPES: { value: FormField["type"]; label: string; hasOptions?: boolean }[] = [
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "textarea", label: "Paragraph" },
  { value: "select", label: "Dropdown", hasOptions: true },
  { value: "radio", label: "Radio", hasOptions: true },
  { value: "checkbox", label: "Checkboxes", hasOptions: true },
  { value: "consent", label: "Consent" },
  { value: "hidden", label: "Hidden" },
];
const hasOptions = (t: FormField["type"]) => t === "select" || t === "radio" || t === "checkbox";

const field =
  "w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-brand-accent";
const label = "block text-[11px] font-semibold uppercase tracking-wider text-gray-400";
const btn = "rounded-lg border border-gray-600 px-3 py-1.5 text-[11px] font-semibold text-gray-200 hover:bg-gray-800";
const btnAccent =
  "rounded-lg border border-brand-accent/40 bg-brand-accent/15 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-brand-accent hover:bg-brand-accent/25 disabled:opacity-50";

const keyFromLabel = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "field";

const emptyForm = (): FormDefinition => ({
  multiStep: false,
  steps: [{ title: "", fields: [{ key: "name", type: "text", label: "Name", required: true, options: [] }] }],
  consent: { enabled: false, text: "I agree to be contacted about this enquiry." },
  submitLabel: "Submit",
  successMessage: "Thanks — we'll be in touch.",
});

// ─────────────────────────── Builder modal ───────────────────────────
function FormBuilderModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: DriftForm;
  onSave: (data: { name: string; definition: FormDefinition; webhookUrl: string | null }) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name || "Untitled form");
  const [def, setDef] = useState<FormDefinition>(initial?.definition || emptyForm());
  const [webhookUrl, setWebhookUrl] = useState(initial?.webhookUrl || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const setStep = (si: number, patch: Partial<FormStep>) =>
    setDef((d) => ({ ...d, steps: d.steps.map((s, i) => (i === si ? { ...s, ...patch } : s)) }));
  const setField = (si: number, fi: number, patch: Partial<FormField>) =>
    setStep(si, { fields: def.steps[si].fields.map((f, i) => (i === fi ? { ...f, ...patch } : f)) });
  const addField = (si: number) =>
    setStep(si, { fields: [...def.steps[si].fields, { key: "", type: "text", label: "", required: false, options: [] }] });
  const removeField = (si: number, fi: number) =>
    setStep(si, { fields: def.steps[si].fields.filter((_, i) => i !== fi) });
  const addStep = () => setDef((d) => ({ ...d, steps: [...d.steps, { title: `Step ${d.steps.length + 1}`, fields: [] }] }));
  const removeStep = (si: number) => setDef((d) => ({ ...d, steps: d.steps.filter((_, i) => i !== si) }));

  const save = async () => {
    setErr("");
    // Backfill keys from labels + ensure uniqueness.
    const seen = new Set<string>();
    const steps = def.steps.map((s) => ({
      title: s.title,
      fields: s.fields.map((f) => {
        let k = (f.key || keyFromLabel(f.label || f.type)).replace(/[^a-zA-Z0-9_]/g, "_");
        let base = k, n = 2;
        while (seen.has(k)) k = `${base}_${n++}`;
        seen.add(k);
        return { ...f, key: k, options: hasOptions(f.type) ? (f.options || []).filter(Boolean) : [] };
      }),
    }));
    if (!steps.some((s) => s.fields.length)) {
      setErr("Add at least one field.");
      return;
    }
    setSaving(true);
    try {
      await onSave({ name: name.trim() || "Untitled form", definition: { ...def, steps }, webhookUrl: webhookUrl.trim() || null });
      onClose();
    } catch (e: any) {
      setErr(e?.response?.data?.error || "Save failed");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-3">
          <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-white">Form builder</h2>
          <button onClick={onClose} className="text-2xl leading-none text-gray-500 hover:text-white">×</button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {err && (
            <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-2.5 text-xs text-rose-200">{err}</div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>Form name</label>
              <input className={`${field} mt-1`} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <label className="mt-6 flex items-center gap-2 text-xs text-gray-300">
              <input
                type="checkbox"
                checked={def.multiStep}
                onChange={(e) => setDef((d) => ({ ...d, multiStep: e.target.checked }))}
                className="h-4 w-4 accent-brand-accent"
              />
              Multi-step form
            </label>
          </div>

          {def.steps.map((step, si) => (
            <div key={si} className="rounded-xl border border-gray-700/70 bg-gray-950/40 p-3">
              <div className="mb-2 flex items-center gap-2">
                {def.multiStep ? (
                  <input
                    className={`${field} !py-1.5`}
                    value={step.title || ""}
                    onChange={(e) => setStep(si, { title: e.target.value })}
                    placeholder={`Step ${si + 1} title`}
                  />
                ) : (
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Fields</span>
                )}
                {def.multiStep && def.steps.length > 1 && (
                  <button onClick={() => removeStep(si)} className="shrink-0 px-2 text-lg leading-none text-gray-600 hover:text-rose-400">×</button>
                )}
              </div>

              <div className="space-y-2">
                {step.fields.map((f, fi) => (
                  <div key={fi} className="rounded-lg border border-gray-700/60 bg-gray-900/60 p-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={f.type}
                        onChange={(e) => setField(si, fi, { type: e.target.value as FormField["type"] })}
                        className="rounded-lg border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-white"
                      >
                        {FIELD_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                      <input
                        className={`${field} !py-1.5 flex-1`}
                        value={f.label}
                        onChange={(e) => setField(si, fi, { label: e.target.value })}
                        placeholder={f.type === "consent" ? "Consent text" : "Field label"}
                      />
                      {f.type !== "consent" && f.type !== "hidden" && (
                        <label className="flex items-center gap-1.5 text-[11px] text-gray-300">
                          <input type="checkbox" checked={!!f.required} onChange={(e) => setField(si, fi, { required: e.target.checked })} className="h-3.5 w-3.5 accent-brand-accent" />
                          Req
                        </label>
                      )}
                      {f.type === "consent" && (
                        <label className="flex items-center gap-1.5 text-[11px] text-gray-300">
                          <input type="checkbox" checked={!!f.required} onChange={(e) => setField(si, fi, { required: e.target.checked })} className="h-3.5 w-3.5 accent-brand-accent" />
                          Req
                        </label>
                      )}
                      <button onClick={() => removeField(si, fi)} className="px-1.5 text-base leading-none text-gray-600 hover:text-rose-400">×</button>
                    </div>
                    {hasOptions(f.type) && (
                      <input
                        className={`${field} mt-2 !py-1.5`}
                        value={(f.options || []).join(", ")}
                        onChange={(e) => setField(si, fi, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })}
                        placeholder="Options, comma separated"
                      />
                    )}
                    {f.type === "hidden" && (
                      <input
                        className={`${field} mt-2 !py-1.5`}
                        value={f.value || ""}
                        onChange={(e) => setField(si, fi, { value: e.target.value })}
                        placeholder="Hidden value (e.g. campaign id)"
                      />
                    )}
                  </div>
                ))}
                <button onClick={() => addField(si)} className={btn}>+ Add field</button>
              </div>
            </div>
          ))}

          {def.multiStep && (
            <button onClick={addStep} className={btn}>+ Add step</button>
          )}

          <div className="rounded-xl border border-gray-700/70 bg-gray-950/40 p-3">
            <label className="flex items-center gap-2 text-xs text-gray-300">
              <input
                type="checkbox"
                checked={def.consent.enabled}
                onChange={(e) => setDef((d) => ({ ...d, consent: { ...d.consent, enabled: e.target.checked } }))}
                className="h-4 w-4 accent-brand-accent"
              />
              Require a consent checkbox
            </label>
            {def.consent.enabled && (
              <input
                className={`${field} mt-2`}
                value={def.consent.text}
                onChange={(e) => setDef((d) => ({ ...d, consent: { ...d.consent, text: e.target.value } }))}
                placeholder="Consent statement"
              />
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>Submit button</label>
              <input className={`${field} mt-1`} value={def.submitLabel} onChange={(e) => setDef((d) => ({ ...d, submitLabel: e.target.value }))} />
            </div>
            <div>
              <label className={label}>Success message</label>
              <input className={`${field} mt-1`} value={def.successMessage} onChange={(e) => setDef((d) => ({ ...d, successMessage: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className={label}>Webhook URL (optional)</label>
            <input className={`${field} mt-1`} value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://… — each new lead is POSTed here" />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-800 px-5 py-3">
          <button onClick={onClose} className={btn}>Cancel</button>
          <button onClick={save} disabled={saving} className={btnAccent}>{saving ? "Saving…" : "Save form"}</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── Leads viewer ───────────────────────────
function LeadsView({ admin, adminOrgId }: { admin: boolean; adminOrgId?: string }) {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = admin ? await apiEndpoints.driftBrandLeads(adminOrgId!) : await apiEndpoints.driftMyLeads();
      setLeads(r.data.leads || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminOrgId]);

  const exportCsv = async () => {
    const r = admin ? await apiEndpoints.driftBrandLeadsCsv(adminOrgId!) : await apiEndpoints.driftMyLeadsCsv();
    const url = URL.createObjectURL(r.data as Blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "drift-leads.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="py-16 text-center"><LoadingSpinner size="sm" /></div>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-400">{leads.length} lead(s)</p>
        <div className="flex gap-2">
          <button onClick={load} className={btn}>↻ Refresh</button>
          <button onClick={exportCsv} disabled={!leads.length} className={`${btn} disabled:opacity-40`}>⬇ Export CSV</button>
        </div>
      </div>
      {leads.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-white/[0.02] py-16 text-center text-sm text-gray-500">
          No leads yet. They'll appear here as people submit your forms.
        </div>
      ) : (
        <div className="space-y-2">
          {leads.map((l) => (
            <div key={l.id} className="rounded-xl border border-white/8 bg-white/[0.02] p-3.5">
              <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                <span>{new Date(l.createdAt).toLocaleString()}</span>
                {l.source?.drift && <span>· {l.source.drift}</span>}
                {l.source?.cta && <span>· CTA: {l.source.cta}</span>}
              </div>
              <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {Object.entries(l.data || {}).map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <span className="shrink-0 text-gray-500">{k}:</span>
                    <span className="min-w-0 break-words text-gray-200">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Manager (tabs) ───────────────────────────
export default function DriftFormsManager({ adminOrgId }: { adminOrgId?: string } = {}) {
  const admin = !!adminOrgId;
  const [tab, setTab] = useState<"forms" | "leads">("forms");
  const [forms, setForms] = useState<DriftForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<DriftForm | "new" | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = admin ? await apiEndpoints.driftBrandForms(adminOrgId!) : await apiEndpoints.driftMyForms();
      setForms(r.data.forms || []);
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.response?.data?.error || "Failed to load forms" });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminOrgId]);

  const saveForm = async (data: { name: string; definition: FormDefinition; webhookUrl: string | null }) => {
    if (editing === "new") {
      admin ? await apiEndpoints.driftBrandCreateForm(adminOrgId!, data) : await apiEndpoints.driftCreateForm(data);
    } else if (editing) {
      admin
        ? await apiEndpoints.driftBrandUpdateForm(adminOrgId!, editing.id, data)
        : await apiEndpoints.driftUpdateForm(editing.id, data);
    }
    await load();
    setMsg({ kind: "ok", text: "Form saved." });
  };

  const removeForm = async (f: DriftForm) => {
    if (!window.confirm(`Delete "${f.name}"? Its leads are kept but detached.`)) return;
    try {
      admin ? await apiEndpoints.driftBrandDeleteForm(adminOrgId!, f.id) : await apiEndpoints.driftDeleteForm(f.id);
      await load();
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.response?.data?.error || "Delete failed" });
    }
  };

  const fieldCount = (f: DriftForm) =>
    (f.definition?.steps || []).reduce((n, s) => n + (s.fields?.length || 0), 0);

  return (
    <div>
      <div className="mb-5 flex items-center gap-2">
        {(["forms", "leads"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors ${
              tab === t ? "bg-white/10 text-white" : "border border-gray-700 text-gray-400 hover:text-white"
            }`}
          >
            {t === "forms" ? "Forms" : "Leads"}
          </button>
        ))}
        <div className="flex-1" />
        {tab === "forms" && (
          <button onClick={() => setEditing("new")} className={btnAccent}>+ New form</button>
        )}
      </div>

      {msg && (
        <div
          className={`mb-4 flex items-center justify-between rounded-xl border p-3 text-sm ${
            msg.kind === "ok" ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200" : "border-rose-400/20 bg-rose-500/10 text-rose-200"
          }`}
        >
          {msg.text}
          <button onClick={() => setMsg(null)} className="text-lg">×</button>
        </div>
      )}

      {tab === "leads" ? (
        <LeadsView admin={admin} adminOrgId={adminOrgId} />
      ) : loading ? (
        <div className="py-16 text-center"><LoadingSpinner size="sm" /></div>
      ) : forms.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-white/[0.02] py-16 text-center text-sm text-gray-500">
          No forms yet. Create one, then attach it to a drift's CTA button.
        </div>
      ) : (
        <div className="grid gap-3">
          {forms.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{f.name}</p>
                <p className="text-[11px] text-gray-500">
                  {fieldCount(f)} field(s){f.definition?.multiStep ? ` · ${f.definition.steps.length} steps` : ""}
                  {f._count ? ` · ${f._count.leads} lead(s)` : ""}
                  {f.webhookUrl ? " · webhook" : ""}
                </p>
                <p className="mt-0.5 select-all font-mono text-[10px] text-gray-600">id: {f.id}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button onClick={() => setEditing(f)} className={btn}>Edit</button>
                <button onClick={() => removeForm(f)} className="px-1.5 text-lg leading-none text-gray-600 hover:text-rose-400">×</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <FormBuilderModal
          initial={editing === "new" ? undefined : editing}
          onSave={saveForm}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
