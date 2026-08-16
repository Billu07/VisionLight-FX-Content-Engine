import { useEffect, useState } from "react";
import { apiEndpoints } from "../lib/api";
import { LoadingSpinner } from "../components/LoadingSpinner";

/**
 * Per-brand drift analytics — engagement (views / CTA clicks / leads) as totals,
 * a daily bar series, and a per-drift table. Dual-mode (adminOrgId → superadmin
 * brand-view). Reads the aggregated DriftEvent + DriftLead data.
 */

type Analytics = {
  days: number;
  totals: { VIEW: number; ROTATE: number; ZOOM: number; CTA_CLICK: number; LEADS: number };
  series: { date: string; views: number; ctas: number; leads: number }[];
  byProduct: { productId: string; name: string; views: number; ctas: number; leads: number }[];
};

const RANGES = [7, 30, 90] as const;

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="d-stat">
      <p className="d-eyebrow">{label}</p>
      <p className="n">{value.toLocaleString()}</p>
      {hint && <p className="d-faint text-[11px]">{hint}</p>}
    </div>
  );
}

export default function DriftAnalytics({ adminOrgId }: { adminOrgId?: string } = {}) {
  const admin = !!adminOrgId;
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (admin ? apiEndpoints.driftBrandAnalytics(adminOrgId!, days) : apiEndpoints.driftMyAnalytics(days))
      .then((r) => alive && setData(r.data.analytics))
      .catch(() => alive && setData(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [admin, adminOrgId, days]);

  if (loading) return <div className="py-16 text-center"><LoadingSpinner size="sm" /></div>;
  if (!data) return <div className="d-empty">No analytics yet.</div>;

  const peak = Math.max(1, ...data.series.map((d) => d.views + d.ctas + d.leads));
  const ctr = data.totals.VIEW ? Math.round((data.totals.CTA_CLICK / data.totals.VIEW) * 100) : 0;

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <p className="d-sub">Last {data.days} days</p>
        <div className="d-tabs">
          {RANGES.map((r) => (
            <button key={r} onClick={() => setDays(r)} className={`d-tab ${days === r ? "active" : ""}`}>
              {r}d
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Views" value={data.totals.VIEW} />
        <Stat label="CTA clicks" value={data.totals.CTA_CLICK} hint={`${ctr}% CTR`} />
        <Stat label="Leads" value={data.totals.LEADS} />
        <Stat label="Rotations" value={data.totals.ROTATE} />
      </div>

      {/* Daily stacked bars: views (cyan) · CTAs (indigo) · leads (emerald). */}
      <div className="d-card d-card-pad mb-6">
        <div className="d-muted mb-3 flex items-center gap-4 text-[11px]">
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: "#22d3ee" }} />Views</span>
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: "#6366f1" }} />CTA clicks</span>
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: "#34d399" }} />Leads</span>
        </div>
        <div className="flex h-40 items-end gap-[2px] overflow-hidden">
          {data.series.map((d) => {
            const total = d.views + d.ctas + d.leads;
            const h = (total / peak) * 100;
            return (
              <div key={d.date} className="group relative flex-1" style={{ height: "100%" }} title={`${d.date}: ${d.views} views · ${d.ctas} CTAs · ${d.leads} leads`}>
                <div className="absolute bottom-0 w-full overflow-hidden rounded-t-sm" style={{ height: `${h}%` }}>
                  <div style={{ height: `${total ? (d.views / total) * 100 : 0}%`, background: "#22d3ee" }} />
                  <div style={{ height: `${total ? (d.ctas / total) * 100 : 0}%`, background: "#6366f1" }} />
                  <div style={{ height: `${total ? (d.leads / total) * 100 : 0}%`, background: "#34d399" }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="d-card" style={{ overflowX: "auto" }}>
        <table className="d-table">
          <thead>
            <tr>
              <th>Drift</th>
              <th style={{ textAlign: "right" }}>Views</th>
              <th style={{ textAlign: "right" }}>CTAs</th>
              <th style={{ textAlign: "right" }}>Leads</th>
            </tr>
          </thead>
          <tbody>
            {data.byProduct.length === 0 ? (
              <tr><td colSpan={4} className="d-muted" style={{ textAlign: "center", padding: "32px" }}>No activity in this range.</td></tr>
            ) : (
              data.byProduct.map((p) => (
                <tr key={p.productId}>
                  <td>{p.name}</td>
                  <td style={{ textAlign: "right" }}>{p.views.toLocaleString()}</td>
                  <td style={{ textAlign: "right" }}>{p.ctas.toLocaleString()}</td>
                  <td style={{ textAlign: "right" }}>{p.leads.toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
