import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { apiEndpoints } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import CreatorRoute from "./CreatorRoute";
import TourLanding from "./TourLanding";
import { TourShell, apiError } from "./tourUi";

/** /tour for a signed-in creator: straight to their page (drift.li/tour/{page}). */
function GoToMyPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    apiEndpoints
      .driftMyPage()
      .then((r) => {
        const path = r.data?.page?.path;
        if (!alive) return;
        if (path) navigate(path, { replace: true });
        else setError("Your page doesn't have a link yet.");
      })
      .catch((e) => alive && setError(apiError(e)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!error) {
    return (
      <div style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
        <div className="d-faint" style={{ fontSize: 13 }}>
          Opening your page…
        </div>
      </div>
    );
  }
  return (
    <TourShell>
      <div className="d-empty">{error}</div>
    </TourShell>
  );
}

/** /tour: a creator (any TOUR profile) goes to their page; everyone else — and
 *  /tour?view=landing — sees the Drift Tour landing. */
export function TourIndex() {
  const { user, profiles, isLoading, checkAuth } = useAuth();
  const location = useLocation();
  useEffect(() => {
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const forceLanding = new URLSearchParams(location.search).get("view") === "landing";
  const creator = user?.view === "TOUR" || profiles.some((p) => p.view === "TOUR");
  if (!forceLanding && creator) {
    return (
      <CreatorRoute>
        <GoToMyPage />
      </CreatorRoute>
    );
  }
  if (isLoading && !forceLanding) {
    return (
      <div style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
        <div className="d-faint" style={{ fontSize: 13 }}>
          Loading…
        </div>
      </div>
    );
  }
  return <TourLanding />;
}

/** Legacy /tour/:id/edit links → the tour's pathway (its admin view for the owner). */
function EditRedirect() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    apiEndpoints
      .driftFlow(id)
      .then((r) => alive && navigate(r.data.flow.publicPath, { replace: true }))
      .catch((e) => alive && setError(apiError(e)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return (
    <TourShell>
      {error ? (
        <div className="d-empty">
          {error}{" "}
          <Link to="/tour" style={{ color: "var(--accent)" }}>
            Back to your page
          </Link>
        </div>
      ) : (
        <div className="d-faint" style={{ fontSize: 13 }}>
          Opening the tour…
        </div>
      )}
    </TourShell>
  );
}

export function TourEditRedirect() {
  return (
    <CreatorRoute>
      <EditRedirect />
    </CreatorRoute>
  );
}
