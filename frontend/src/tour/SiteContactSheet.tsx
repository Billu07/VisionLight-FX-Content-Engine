import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { apiEndpoints } from "../lib/api";

/** tourUi's apiError, kept here so this file never imports the module that imports it. */
const apiError = (e: any, fallback = "Something went wrong. Please try again.") =>
  e?.response?.data?.error || e?.message || fallback;

/**
 * "Contact" in the drift.li tour footer, and the form behind it (client's ref04, 2026-10-15).
 *
 * Deliberately NOT EnquirySheet: that one belongs to a creator's page — it carries their name,
 * their optional phone field, the tour and the personal link the visitor arrived on, and it
 * reaches THEIR inbox. This one is the site writing to us. Sharing the component would have
 * meant making every one of those page-shaped things optional inside it, for a form with three
 * fields. It shares the sheet's CSS instead, so the two look like one thing.
 */
export function SiteContactLink({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <a
        href="#contact"
        className={className}
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        Contact
      </a>
      {open && <SiteContactSheet onClose={() => setOpen(false)} />}
    </>
  );
}

export function SiteContactSheet({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
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
    if (!message.trim()) return setError("Please Add a Message");
    setSending(true);
    setError("");
    try {
      await apiEndpoints.driftSiteContact({
        name: name.trim(),
        email: email.trim(),
        message: message.trim(),
        page: typeof location !== "undefined" ? location.pathname : undefined,
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
    <div className="t-sheet" onClick={onClose} role="dialog" aria-modal aria-label="Contact drift.li">
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
              We Have Your Message and Will Reply at {email.trim()}.
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
              <div className="d-eyebrow">drift.li</div>
              <div className="t-sheet-title">Contact Us</div>
              <p className="d-sub" style={{ margin: 0, fontSize: 13 }}>
                Leave Your Details and a Message — We'll Reply by Email.
              </p>
            </div>
            <div>
              <label className="d-label" htmlFor="sc-name">
                Your Name
              </label>
              <input id="sc-name" className="d-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />
            </div>
            <div>
              <label className="d-label" htmlFor="sc-email">
                Email
              </label>
              <input
                id="sc-email"
                className="d-input"
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                maxLength={160}
              />
            </div>
            <div>
              <label className="d-label" htmlFor="sc-message">
                Message
              </label>
              <textarea
                id="sc-message"
                className="d-input"
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={2000}
                style={{ resize: "vertical" }}
              />
            </div>
            {/* the honeypot: off screen, never announced, never focusable by tabbing */}
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden
              style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
            />
            {error && <div className="d-error">{error}</div>}
            <div className="t-actions" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="d-btn" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="d-btn primary" disabled={sending}>
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );

  const host = typeof document !== "undefined" ? document.querySelector(".drift-ui.d-page") : null;
  return host ? createPortal(sheet, host) : sheet;
}
