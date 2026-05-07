import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { apiEndpoints } from "../lib/api";

type CallbackPhase =
  | "REDIRECTING"
  | "WAITING"
  | "ACTIVATING"
  | "COMPLETE"
  | "DELAYED"
  | "ERROR";

const sanitizeDomain = (raw?: string | null): string | null => {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  const withoutProtocol = trimmed.replace(/^https?:\/\//, "");
  const host = withoutProtocol
    .split("/")[0]
    ?.replace(/:\d+$/, "")
    .replace(/\.$/, "");
  return host || null;
};

const isLocalHost = (host: string) =>
  host === "localhost" ||
  host === "0.0.0.0" ||
  host === "::1" ||
  host.startsWith("127.") ||
  host.endsWith(".local");

export default function BillingReturn() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const checkoutSessionId = searchParams.get("checkoutSessionId")?.trim() || "";
  const plan = searchParams.get("plan")?.trim() || "";

  const [phase, setPhase] = useState<CallbackPhase>("REDIRECTING");
  const [message, setMessage] = useState("Preparing payment confirmation...");
  const [isPolling, setIsPolling] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const stopRef = useRef(false);

  const title = useMemo(() => {
    if (phase === "WAITING") return "Waiting for payment confirmation";
    if (phase === "ACTIVATING") return "Activating package";
    if (phase === "COMPLETE") return "Activation complete";
    if (phase === "DELAYED") return "Activation delayed";
    if (phase === "ERROR") return "Activation failed";
    return "Redirecting to checkout";
  }, [phase]);

  useEffect(() => {
    if (!checkoutSessionId) {
      setPhase("ERROR");
      setMessage("Missing checkout session ID in callback URL.");
      return;
    }

    let timeoutId: number | undefined;
    stopRef.current = false;
    setIsPolling(true);

    const poll = async () => {
      const startedAt = Date.now();
      while (!stopRef.current && Date.now() - startedAt < 120000) {
        try {
          const response = await apiEndpoints.byokGetActivationStatusPublic(
            checkoutSessionId,
          );
          const status = response.data?.status as "PENDING" | "PROCESSED" | "ERROR" | undefined;
          const lifecycle = String(response.data?.lifecycle || "").toUpperCase();
          const routingDomain = sanitizeDomain(response.data?.routingDomain || null);
          const activationMessage = response.data?.message || "";

          if (status === "PROCESSED") {
            setPhase("COMPLETE");
            setMessage("Activation complete. Opening your projects...");
            sessionStorage.setItem(
              "visionlight_activation_message",
              `Package ${plan || "upgrade"} activated successfully.`,
            );
            stopRef.current = true;
            const currentHost = sanitizeDomain(window.location.host);
            if (
              routingDomain &&
              currentHost &&
              routingDomain !== currentHost &&
              !isLocalHost(currentHost)
            ) {
              const protocol = window.location.protocol || "https:";
              window.location.replace(`${protocol}//${routingDomain}/projects`);
              return;
            }
            timeoutId = window.setTimeout(() => navigate("/projects", { replace: true }), 900);
            return;
          }

          if (status === "ERROR") {
            setPhase("DELAYED");
            setMessage(
              activationMessage ||
                "Payment received but activation is delayed. Retry in a few seconds.",
            );
            stopRef.current = true;
            setIsPolling(false);
            return;
          }

          if (lifecycle === "RECEIVED" || lifecycle === "VERIFIED") {
            setPhase("ACTIVATING");
            setMessage("Applying entitlement and routing...");
          } else {
            setPhase("WAITING");
            setMessage("Payment submitted. Waiting for backend webhook confirmation...");
          }
        } catch (error: any) {
          setPhase("WAITING");
          setMessage(error?.message || "Checking activation status...");
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      if (!stopRef.current) {
        setPhase("DELAYED");
        setMessage(
          "Activation is taking longer than usual. Keep this page open and retry.",
        );
      }
      setIsPolling(false);
    };

    void poll();

    return () => {
      stopRef.current = true;
      setIsPolling(false);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [checkoutSessionId, navigate, plan, retryCount]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 p-4 text-gray-200">
      <div className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-gray-900 p-7 text-center shadow-[0_0_50px_rgba(0,0,0,0.5)] sm:p-10">
        {(phase === "WAITING" || phase === "ACTIVATING" || phase === "REDIRECTING") && (
          <div className="mb-6 flex justify-center">
            <LoadingSpinner size="lg" variant="neon" />
          </div>
        )}
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300">
          Billing Callback
        </p>
        <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">{title}</h1>
        <p className="mt-4 text-sm text-gray-300">{message}</p>
        <p className="mt-2 text-xs text-gray-500">
          Session: {checkoutSessionId.slice(0, 12)}...
        </p>

        {(phase === "DELAYED" || phase === "ERROR") && (
          <div className="mt-7 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                setPhase("WAITING");
                setMessage("Retrying activation check...");
                setRetryCount((prev) => prev + 1);
              }}
              className="flex-1 rounded-xl bg-cyan-500 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-gray-950"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => navigate("/projects", { replace: true })}
              className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-gray-200"
            >
              Continue
            </button>
          </div>
        )}

        {phase === "COMPLETE" && (
          <div className="mt-6 inline-flex rounded-xl border border-emerald-300/35 bg-emerald-400/15 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-100">
            Package Active
          </div>
        )}

        {!isPolling && phase !== "COMPLETE" && (
          <p className="mt-5 text-xs text-gray-500">
            If this persists, contact support with your checkout session ID.
          </p>
        )}
      </div>
    </div>
  );
}
