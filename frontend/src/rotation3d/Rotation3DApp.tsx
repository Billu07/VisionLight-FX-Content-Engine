import { Routes, Route, Navigate, useParams } from "react-router-dom";
import SpinViewer from "./SpinViewer";

/**
 * Rotation3D route tree (path-based tenancy). Rendered by App only when the app
 * is served on a Rotation3D host (see isRotation3dHost). URL shape:
 *   /                     → landing / featured demo
 *   /p/:productId         → public interactive player (no login)
 *   /embed/:productId     → same player, for iframe embeds on brand sites
 *   /b/:brandSlug         → a brand's product gallery
 *   /admin                → brand-admin panel (login required, built in a later stage)
 *
 * Player + gallery + admin currently render against the synthetic demo; they get
 * wired to real manifests once the backend data model + pipeline land.
 */

// Turns "air-max-90" → "Air Max 90" for placeholder display.
const titleFromSlug = (s?: string) =>
  (s || "Demo Product")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

function PlayerPage() {
  const { productId } = useParams();
  return (
    <SpinViewer
      manifest={{ frameCount: 36, defaultFrame: 3 }}
      brandName="Rotation3D"
      productName={titleFromSlug(productId)}
      ctaPrimary={{ label: "Buy now", url: "#" }}
      ctaSecondary={{ label: "Next product", url: "#" }}
    />
  );
}

function Placeholder({ title, sub }: { title: string; sub: string }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        textAlign: "center",
        color: "#eef1f6",
        fontFamily: '"Bai Jamjuree", ui-sans-serif, system-ui, sans-serif',
        background:
          "radial-gradient(120% 80% at 50% -10%, #1a2336 0%, rgba(17,24,39,0) 55%), linear-gradient(to bottom right, #111827, #0B0F19)",
      }}
    >
      <div style={{ maxWidth: 460 }}>
        <div
          style={{
            width: 44,
            height: 44,
            margin: "0 auto 18px",
            borderRadius: 12,
            display: "grid",
            placeItems: "center",
            background:
              "linear-gradient(135deg, var(--primary-brand,#6366f1), var(--secondary-brand,#8b5cf6))",
            boxShadow: "0 0 24px rgba(34,211,238,.18)",
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></svg>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 8px" }}>{title}</h1>
        <p style={{ color: "#9aa3b6", lineHeight: 1.6, margin: 0 }}>{sub}</p>
      </div>
    </div>
  );
}

export default function Rotation3DApp() {
  return (
    <Routes>
      <Route path="/" element={<PlayerPage />} />
      <Route path="/p/:productId" element={<PlayerPage />} />
      <Route path="/embed/:productId" element={<PlayerPage />} />
      <Route
        path="/b/:brandSlug"
        element={
          <Placeholder
            title="Brand gallery"
            sub="Product galleries render here once the backend catalog is wired up."
          />
        }
      />
      <Route
        path="/admin"
        element={
          <Placeholder
            title="Brand admin"
            sub="Sign-in and product / CTA management arrive in a later stage."
          />
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
