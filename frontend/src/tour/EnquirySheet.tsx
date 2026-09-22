import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { apiEndpoints } from "../lib/api";
import type { Page } from "./types";
import { apiError } from "./tourUi";
import { shareLinkFor } from "../rotation3d/personalLink";

/**
 * A page's enquiry button ("Book a viewing", "Ask a question" …) and its form: name, email,
 * an optional phone and a message, sent to the page's team. Renders nothing while the
 * page has the button switched off. In the player the same form opens over the drift
 * (DriftFormOverlay with `enquiry`).
 */
export function EnquiryButton({ page, flowId, className = "d-btn primary" }: { page: Page; flowId?: string | null; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!page.enquiries?.enabled || !page.slug) return null;
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {page.enquiries.label}
      </button>
      {open && <EnquirySheet page={page} flowId={flowId ?? null} onClose={() => setOpen(false)} />}
    </>
  );
}

/** The message form. `title` + `via: "contact"`: opened from the page's contact button. */
export function EnquirySheet({
  page,
  flowId,
  onClose,
  title,
  via,
}: {
  page: Page;
  flowId: string | null;
  onClose: () => void;
  title?: string;
  via?: "contact";
}) {
  const settings = page.enquiries!;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — people never see it
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!name.trim()) return setError("Please Add Your Name");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setError("Please Add a Valid Email Address");
    setSending(true);
    setError("");
    try {
      await apiEndpoints.driftSubmitEnquiry(page.slug!, {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        message: message.trim() || undefined,
        flowId: flowId || undefined,
        link: shareLinkFor(flowId) || undefined,
        via,
        website,
      });
      setSent(true);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSending(false);
    }
  };

  const sheet = (
    <div className="t-sheet" onClick={onClose} role="dialog" aria-modal aria-label={title || settings.label}>
      <div className="t-sheet-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="t-sheet-x" onClick={onClose} aria-label="Close">
          ×
        </button>
        {sent ? (
          <div className="tpg-enq-done">
            <div className="tpg-enq-tick" aria-hidden>
              ✓
            </div>
            <div className="t-sheet-title">Sent</div>
            <p className="d-sub" style={{ margin: 0 }}>
              {page.name} Has Your Message and Will Get Back to You at {email.trim()}.
            </p>
            <div className="t-actions" style={{ justifyContent: "center", marginTop: 6 }}>
              <button type="button" className="d-btn primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form className="tpg-enq-form" onSubmit={submit} noValidate>
            <div style={{ paddingRight: 34 }}>
              <div className="d-eyebrow">{page.name}</div>
              <div className="t-sheet-title">{title || settings.label}</div>
              <p className="d-sub" style={{ margin: 0, fontSize: 13 }}>
                Leave Your Details and a Message — They'll Reply by Email.
              </p>
            </div>
            <div>
              <label className="d-label" htmlFor="enq-name">
                Your Name
              </label>
              <input id="enq-name" className="d-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />
            </div>
            <div>
              <label className="d-label" htmlFor="enq-email">
                Email
              </label>
              <input
                id="enq-email"
                className="d-input"
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                maxLength={160}
              />
            </div>
            {settings.askPhone && (
              <div>
                <label className="d-label" htmlFor="enq-phone">
                  Phone <span className="d-faint">(Optional)</span>
                </label>
                <input
                  id="enq-phone"
                  className="d-input"
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  maxLength={40}
                />
              </div>
            )}
            <div>
              <label className="d-label" htmlFor="enq-msg">
                Message <span className="d-faint">(Optional)</span>
              </label>
              <textarea
                id="enq-msg"
                className="d-textarea"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={2000}
                placeholder="What would you like to know — or a good time to reach you"
              />
            </div>
            <input
              className="tpg-hp"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
            {error && <div className="d-banner err">{error}</div>}
            <button type="submit" className="d-btn primary" disabled={sending} style={{ padding: "12px 16px", fontSize: 14 }}>
              {sending ? "Sending…" : "Send"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
  // Rendered at the top of the drift.li page (it keeps the theme), outside any animated section
  // — an animated hero is its own layer, and the sections after it painted over the form.
  const host = typeof document !== "undefined" ? document.querySelector(".drift-ui.d-page") : null;
  return host ? createPortal(sheet, host) : sheet;
}
