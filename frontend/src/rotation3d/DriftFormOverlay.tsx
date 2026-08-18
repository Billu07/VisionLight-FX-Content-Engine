import { useMemo, useState } from "react";
import { apiEndpoints } from "../lib/api";
import { track } from "./metaPixel";
import type { FormDefinition, FormField } from "./DriftFormsManager";

/**
 * The in-player lead form. A CTA with an attached form opens this over the
 * player (same page); Back returns to the player. Supports single or multi-step
 * forms, the builder's field types, and a consent gate. On submit it posts to
 * the public endpoint and shows the form's success message.
 */

export type OverlayForm = { id: string; name: string; definition: FormDefinition };

export default function DriftFormOverlay({
  form,
  productId,
  productName,
  which,
  accent,
  onClose,
}: {
  form: OverlayForm;
  productId?: string;
  productName?: string;
  which: "primary" | "secondary";
  accent?: string | null;
  onClose: () => void;
}) {
  const def = form.definition;
  const steps = def.steps?.length ? def.steps : [{ fields: [] }];
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = {};
    for (const s of steps) for (const f of s.fields) if (f.type === "hidden") init[f.key] = f.value ?? "";
    return init;
  });
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const isLast = step >= steps.length - 1;
  const btnColor = accent || "var(--primary-brand, #22d3ee)";

  const set = (key: string, v: any) => setValues((prev) => ({ ...prev, [key]: v }));

  // Fields with a real input (hidden fields are carried silently).
  const visibleFields = (s: { fields: FormField[] }) => s.fields.filter((f) => f.type !== "hidden");

  const validateStep = (): string => {
    for (const f of steps[step].fields) {
      if (f.type === "hidden") continue;
      if (f.type === "consent") {
        if (f.required && !values[f.key]) return `Please accept: ${f.label || "consent"}`;
        continue;
      }
      const v = values[f.key];
      const has = f.type === "checkbox" ? Array.isArray(v) && v.length : v != null && String(v).trim();
      if (f.required && !has) return `"${f.label || f.key}" is required`;
    }
    return "";
  };

  const next = () => {
    const e = validateStep();
    if (e) return setErr(e);
    setErr("");
    setStep((s) => Math.min(steps.length - 1, s + 1));
  };
  const back = () => {
    setErr("");
    setStep((s) => Math.max(0, s - 1));
  };

  const submit = async () => {
    const e = validateStep();
    if (e) return setErr(e);
    if (def.consent?.enabled && !consent) return setErr("Please provide consent to continue.");
    setErr("");
    setSubmitting(true);
    try {
      const data: Record<string, any> = { ...values };
      if (def.consent?.enabled) data.__consent = true;
      const r = await apiEndpoints.driftSubmitForm(form.id, {
        data,
        productId,
        source: { drift: productName, cta: which },
      });
      track("Lead", { content_name: productName });
      setDone(r.data?.successMessage || def.successMessage || "Thanks — we'll be in touch.");
    } catch (e: any) {
      setErr(e?.response?.data?.error || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const stepFields = useMemo(() => visibleFields(steps[step]), [steps, step]);

  return (
    <div className="r3d-formoverlay">
      <style>{`
        .r3d-formoverlay{position:absolute;inset:0;z-index:40;display:flex;flex-direction:column;background:rgba(6,9,16,.97);backdrop-filter:blur(6px);color:#fff;font-family:inherit}
        .r3d-formoverlay .fo-head{display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.08)}
        .r3d-formoverlay .fo-back{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:#cbd5e1;background:none;border:0;cursor:pointer;padding:6px 8px;border-radius:8px}
        .r3d-formoverlay .fo-back:hover{background:rgba(255,255,255,.06)}
        .r3d-formoverlay .fo-body{flex:1;min-height:0;overflow-y:auto;padding:20px 18px;max-width:520px;width:100%;margin:0 auto}
        .r3d-formoverlay label.fo-l{display:block;font-size:12px;font-weight:600;color:#94a3b8;margin:0 0 6px}
        .r3d-formoverlay .fo-in{width:100%;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);border-radius:12px;padding:12px 14px;font-size:15px;color:#fff;outline:none;font-family:inherit}
        .r3d-formoverlay .fo-in:focus{border-color:${btnColor}}
        .r3d-formoverlay .fo-field{margin-bottom:16px}
        .r3d-formoverlay .fo-opt{display:flex;align-items:center;gap:10px;padding:9px 0;font-size:15px;color:#e2e8f0}
        .r3d-formoverlay .fo-foot{padding:14px 18px calc(16px + env(safe-area-inset-bottom));border-top:1px solid rgba(255,255,255,.08);display:flex;gap:10px;max-width:520px;width:100%;margin:0 auto}
        .r3d-formoverlay .fo-btn{flex:1;border:0;border-radius:14px;padding:14px;font-size:15px;font-weight:700;cursor:pointer;color:#04121a}
        .r3d-formoverlay .fo-ghost{flex:0 0 auto;background:rgba(255,255,255,.08);color:#e2e8f0;border:1px solid rgba(255,255,255,.14)}
        .r3d-formoverlay .fo-err{color:#fda4af;font-size:13px;margin-bottom:12px}
        .r3d-formoverlay .fo-steps{font-size:12px;color:#64748b}
      `}</style>

      <div className="fo-head">
        <button className="fo-back" onClick={onClose}>← Back to drift</button>
        <div style={{ flex: 1 }} />
        {def.multiStep && steps.length > 1 && (
          <span className="fo-steps">Step {step + 1} / {steps.length}</span>
        )}
      </div>

      {done ? (
        <div className="fo-body" style={{ display: "grid", placeItems: "center", textAlign: "center" }}>
          <div>
            <div style={{ fontSize: 44, marginBottom: 12 }}>✓</div>
            <p style={{ fontSize: 17, fontWeight: 600 }}>{done}</p>
            <button className="fo-back" style={{ marginTop: 16 }} onClick={onClose}>← Back to drift</button>
          </div>
        </div>
      ) : (
        <>
          <div className="fo-body">
            {steps[step].title && <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 14 }}>{steps[step].title}</h3>}
            {err && <div className="fo-err">{err}</div>}

            {stepFields.map((f) => (
              <div className="fo-field" key={f.key}>
                {f.type !== "consent" && f.label && (
                  <label className="fo-l">{f.label}{f.required ? " *" : ""}</label>
                )}
                {f.type === "textarea" ? (
                  <textarea className="fo-in" rows={4} placeholder={f.placeholder} value={values[f.key] || ""} onChange={(e) => set(f.key, e.target.value)} />
                ) : f.type === "select" ? (
                  <select className="fo-in" value={values[f.key] || ""} onChange={(e) => set(f.key, e.target.value)}>
                    <option value="">{f.placeholder || "Select…"}</option>
                    {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : f.type === "radio" ? (
                  <div>
                    {(f.options || []).map((o) => (
                      <label className="fo-opt" key={o}>
                        <input type="radio" name={f.key} checked={values[f.key] === o} onChange={() => set(f.key, o)} />
                        {o}
                      </label>
                    ))}
                  </div>
                ) : f.type === "checkbox" ? (
                  <div>
                    {(f.options || []).map((o) => {
                      const arr: string[] = Array.isArray(values[f.key]) ? values[f.key] : [];
                      return (
                        <label className="fo-opt" key={o}>
                          <input
                            type="checkbox"
                            checked={arr.includes(o)}
                            onChange={(e) => set(f.key, e.target.checked ? [...arr, o] : arr.filter((x) => x !== o))}
                          />
                          {o}
                        </label>
                      );
                    })}
                  </div>
                ) : f.type === "consent" ? (
                  <label className="fo-opt">
                    <input type="checkbox" checked={!!values[f.key]} onChange={(e) => set(f.key, e.target.checked)} />
                    {f.label || "I agree"}
                  </label>
                ) : (
                  <input
                    className="fo-in"
                    type={f.type === "email" ? "email" : f.type === "phone" ? "tel" : "text"}
                    placeholder={f.placeholder}
                    value={values[f.key] || ""}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                )}
              </div>
            ))}

            {isLast && def.consent?.enabled && (
              <label className="fo-opt">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                {def.consent.text || "I agree to be contacted."}
              </label>
            )}
          </div>

          <div className="fo-foot">
            {def.multiStep && step > 0 && (
              <button className="fo-btn fo-ghost" onClick={back}>Back</button>
            )}
            {isLast ? (
              <button className="fo-btn" style={{ background: btnColor }} onClick={submit} disabled={submitting}>
                {submitting ? "Sending…" : def.submitLabel || "Submit"}
              </button>
            ) : (
              <button className="fo-btn" style={{ background: btnColor }} onClick={next}>Continue</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
