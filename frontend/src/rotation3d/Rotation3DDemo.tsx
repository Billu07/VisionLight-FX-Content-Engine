import SpinViewer from "./SpinViewer";

/**
 * Public, no-login preview of the Rotation3D player. Served at /rotation3d so we
 * can validate the real React viewer on the VPS before the domain, backend, and
 * manifest wiring land. Uses the synthetic object (no `frames`); swap in a real
 * manifest ({ frameCount, frames }) once the processing pipeline produces one.
 */
export default function Rotation3DDemo() {
  return (
    <SpinViewer
      manifest={{ frameCount: 36, defaultFrame: 3 }}
      brandName="Rotation3D"
      productName="Demo Product"
      ctaPrimary={{ label: "Buy now", url: "#" }}
      ctaSecondary={{ label: "Next product", url: "#" }}
      onCtaClick={(which) => {
        // real player will POST a CTA_CLICK analytics event here
        // eslint-disable-next-line no-console
        console.log("cta", which);
      }}
    />
  );
}
