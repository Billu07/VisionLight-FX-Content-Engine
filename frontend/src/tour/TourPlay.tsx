import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiEndpoints } from "../lib/api";
import { DriftThemeStyles, useDriftTheme } from "../rotation3d/driftUiTheme";
import { CREATOR_START } from "./tourSession";

/**
 * /tour/:slug — the public entry of a tour. Resolves the published flow and
 * hands off to the normal player at its first stop; the auto "Next" buttons
 * carry the viewer along the path from there. /tour/demo is the client's demo.
 */
export default function TourPlay() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const [theme] = useDriftTheme();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    setMissing(false);
    apiEndpoints
      .driftPublicFlow("tour", slug)
      .then((r) => {
        if (!alive) return;
        const entry = r.data?.flow?.entryPath;
        if (entry) navigate(entry, { replace: true });
        else setMissing(true);
      })
      .catch(() => alive && setMissing(true));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  return (
    <div className="drift-ui d-page" data-theme={theme}>
      <DriftThemeStyles />
      <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 20 }}>
        {missing ? (
          <div className="d-card d-card-pad" style={{ maxWidth: 440, display: "grid", gap: 12, textAlign: "center" }}>
            <div className="d-wordmark">
              drift<i>.li</i>
            </div>
            <div className="d-h2" style={{ fontSize: 20 }}>This tour isn't live yet</div>
            <p className="d-sub">The link may be unpublished, renamed, or still being built.</p>
            <Link to={CREATOR_START} className="d-btn primary" style={{ textDecoration: "none", justifySelf: "center" }}>
              Build your own tour — free
            </Link>
          </div>
        ) : (
          <div style={{ textAlign: "center" }}>
            <div className="d-wordmark" style={{ marginBottom: 10 }}>
              drift<i>.li</i>
            </div>
            <div className="d-faint" style={{ fontSize: 13 }}>Opening the tour…</div>
          </div>
        )}
      </div>
    </div>
  );
}
