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

const statusPill = (s: string) =>
  s === "active"
    ? "text-emerald-300 border-emerald-400/30 bg-emerald-500/10"
    : s === "error"
      ? "text-rose-300 border-rose-400/30 bg-rose-500/10"
      : "text-amber-300 border-amber-400/30 bg-amber-500/10";

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

  const cell = "rounded-md border border-gray-700 bg-gray-950 px-2 py-1 font-mono text-[11px] text-gray-200 select-all";

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-base font-bold text-white">Custom domain</h2>
        <p className="mt-1 text-sm text-gray-400">
          Serve your drifts on your own domain (e.g. <span className="text-gray-300">drift.yourbrand.com</span>). Point a
          CNAME at <span className="font-mono text-gray-300">{cnameTarget}</span>; we handle SSL.
        </p>
        {!cfOn && (
          <p className="mt-2 rounded-lg border border-amber-400/20 bg-amber-500/10 p-2 text-[11px] text-amber-200">
            Cloudflare isn't configured on the server yet — you can register domains, but SSL/proxy activates once the
            platform sets <span className="font-mono">CLOUDFLARE_API_TOKEN</span> + <span className="font-mono">CLOUDFLARE_ZONE_ID</span>.
          </p>
        )}
      </div>

      {msg && (
        <div className={`mb-4 flex items-center justify-between rounded-xl border p-3 text-sm ${msg.kind === "ok" ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200" : "border-rose-400/20 bg-rose-500/10 text-rose-200"}`}>
          {msg.text}
          <button onClick={() => setMsg(null)} className="text-lg">×</button>
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        <input
          value={host}
          onChange={(e) => setHost(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="drift.yourbrand.com"
          className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
        />
        <button
          onClick={add}
          disabled={adding || !host.trim()}
          className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-40"
        >
          {adding ? "Adding…" : "Connect"}
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center"><LoadingSpinner size="sm" /></div>
      ) : domains.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-white/[0.02] py-12 text-center text-sm text-gray-500">
          No custom domains yet.
        </div>
      ) : (
        <div className="space-y-3">
          {domains.map((d) => (
            <div key={d.id} className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-white">{d.hostname}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${statusPill(d.status)}`}>{d.status}</span>
                  {d.sslStatus && <span className="text-[11px] text-gray-500">SSL: {d.sslStatus}</span>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => refresh(d)} disabled={busy === d.id} className="rounded-lg border border-gray-600 px-3 py-1.5 text-[11px] font-semibold text-gray-200 hover:bg-gray-800 disabled:opacity-50">
                    {busy === d.id ? "…" : "↻ Refresh"}
                  </button>
                  <button onClick={() => remove(d)} disabled={busy === d.id} className="rounded-lg border border-rose-500/30 px-3 py-1.5 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50">
                    Remove
                  </button>
                </div>
              </div>

              {d.status !== "active" && (
                <div className="mt-3 space-y-2 border-t border-white/8 pt-3 text-[12px] text-gray-400">
                  <p>Add this DNS record at your registrar, then click Refresh:</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-gray-500">CNAME</span>
                    <span className={cell}>{d.hostname}</span>
                    <span className="text-gray-500">→</span>
                    <span className={cell}>{d.cnameTarget}</span>
                  </div>
                  {d.verification?.ownership && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-gray-500">TXT (ownership)</span>
                      <span className={cell}>{d.verification.ownership.name}</span>
                      <span className={cell}>{d.verification.ownership.value}</span>
                    </div>
                  )}
                  {(d.verification?.sslRecords || []).map((r, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <span className="text-gray-500">{r.type || "TXT"} (SSL)</span>
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
