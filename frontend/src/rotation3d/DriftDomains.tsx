import { useEffect, useState } from "react";
import { apiEndpoints } from "../lib/api";
import { LoadingSpinner } from "../components/LoadingSpinner";

/**
 * Connect a brand's custom domain (e.g. drift.yourbrand.com) via Cloudflare for
 * SaaS. Shows the CNAME to set, live verification status, refresh + remove.
 * Dual-mode (adminOrgId → superadmin brand-view).
 */

type Domain = {
  id: string;
  hostname: string;
  status: string;
  sslStatus?: string | null;
  cnameTarget: string;
  verification?: {
    target?: string;
    ownership?: { name: string; value: string } | null;
    sslRecords?: { name: string; value: string; type?: string }[];
  } | null;
};

const statusPill = (s: string) => (s === "active" ? "ok" : s === "error" ? "err" : "warn");

export default function DriftDomains({ adminOrgId }: { adminOrgId?: string } = {}) {
  const admin = !!adminOrgId;
  const [domains, setDomains] = useState<Domain[]>([]);
  const [cnameTarget, setCnameTarget] = useState("link.drift.li");
  const [cfOn, setCfOn] = useState(true);
  const [loading, setLoading] = useState(true);
  const [host, setHost] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = admin ? await apiEndpoints.driftBrandDomains(adminOrgId!) : await apiEndpoints.driftMyDomains();
      setDomains(r.data.domains || []);
      setCnameTarget(r.data.cnameTarget || "link.drift.li");
      setCfOn(!!r.data.cloudflare);
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.response?.data?.error || "Failed to load domains" });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminOrgId]);

  const add = async () => {
    if (!host.trim()) return;
    setAdding(true);
    setMsg(null);
    try {
      admin ? await apiEndpoints.driftBrandAddDomain(adminOrgId!, host.trim()) : await apiEndpoints.driftAddDomain(host.trim());
      setHost("");
      await load();
      setMsg({ kind: "ok", text: "Domain added. Set the CNAME below, then Refresh." });
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.response?.data?.error || "Could not add that domain" });
    } finally {
      setAdding(false);
    }
  };

  const refresh = async (d: Domain) => {
    setBusy(d.id);
    try {
      admin ? await apiEndpoints.driftBrandRefreshDomain(adminOrgId!, d.id) : await apiEndpoints.driftRefreshDomain(d.id);
      await load();
    } finally {
      setBusy(null);
    }
  };
  const remove = async (d: Domain) => {
    if (!window.confirm(`Disconnect ${d.hostname}?`)) return;
    setBusy(d.id);
    try {
      admin ? await apiEndpoints.driftBrandDeleteDomain(adminOrgId!, d.id) : await apiEndpoints.driftDeleteDomain(d.id);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const cell = "d-code select-all";

  return (
    <div>
      <div className="mb-5">
        <h2 className="d-h2">Custom domain</h2>
        <p className="d-sub mt-1">
          Serve your drifts on your own domain (e.g. <b>drift.yourbrand.com</b>). Point a CNAME at{" "}
          <span className="d-code">{cnameTarget}</span>; we handle SSL.
        </p>
        {!cfOn && (
          <div className="d-banner warn mt-3 text-[12px]">
            <span>
              Cloudflare isn't configured on the server yet — you can register domains, but SSL/proxy activates once the
              platform sets <b>CLOUDFLARE_API_TOKEN</b> + <b>CLOUDFLARE_ZONE_ID</b>.
            </span>
          </div>
        )}
      </div>

      {msg && (
        <div className={`d-banner ${msg.kind === "ok" ? "ok" : "err"}`} style={{ marginBottom: 16 }}>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} className="d-btn ghost sm" style={{ padding: "2px 8px" }}>×</button>
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        <input
          value={host}
          onChange={(e) => setHost(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="drift.yourbrand.com"
          className="d-input"
          style={{ flex: 1, minWidth: 0 }}
        />
        <button onClick={add} disabled={adding || !host.trim()} className="d-btn primary">
          {adding ? "Adding…" : "Connect"}
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center"><LoadingSpinner size="sm" /></div>
      ) : domains.length === 0 ? (
        <div className="d-empty">No custom domains yet.</div>
      ) : (
        <div className="space-y-3">
          {domains.map((d) => (
            <div key={d.id} className="d-card d-card-pad">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="d-code" style={{ fontSize: 13 }}>{d.hostname}</span>
                  <span className={`d-pill ${statusPill(d.status)}`}>{d.status}</span>
                  {d.sslStatus && <span className="d-faint text-[11px]">SSL: {d.sslStatus}</span>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => refresh(d)} disabled={busy === d.id} className="d-btn sm">
                    {busy === d.id ? "…" : "↻ Refresh"}
                  </button>
                  <button onClick={() => remove(d)} disabled={busy === d.id} className="d-btn danger sm">
                    Remove
                  </button>
                </div>
              </div>

              {d.status !== "active" && (
                <div className="d-muted mt-3 space-y-2 text-[12px]" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                  <p>Add this DNS record at your registrar, then click Refresh:</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="d-faint">CNAME</span>
                    <span className={cell}>{d.hostname}</span>
                    <span className="d-faint">→</span>
                    <span className={cell}>{d.cnameTarget}</span>
                  </div>
                  {d.verification?.ownership && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="d-faint">TXT (ownership)</span>
                      <span className={cell}>{d.verification.ownership.name}</span>
                      <span className={cell}>{d.verification.ownership.value}</span>
                    </div>
                  )}
                  {(d.verification?.sslRecords || []).map((r, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <span className="d-faint">{r.type || "TXT"} (SSL)</span>
                      <span className={cell}>{r.name}</span>
                      <span className={cell}>{r.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
