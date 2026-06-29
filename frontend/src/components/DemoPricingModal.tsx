import { useEffect, useMemo, useState } from "react";
import { apiEndpoints } from "../lib/api";
import { getSiteBrand } from "../lib/branding";
import {
  STUDIO_PRICING_PLANS,
  BYOK_PRICING_PACKAGES,
  type BillingCycle,
  type PricingPlan,
} from "../lib/pricingPlans";

// Shown when a demo visitor tries to DO something. Domain-aware:
//  - byok.link        → the 6-package surface (5 BYOK packages + Free Trial)
//  - .studio / .app   → the 3 studio cards + Free Trial
export function DemoPricingModal({ onClose }: { onClose: () => void }) {
  const brand = useMemo(() => getSiteBrand(), []);
  const isByok = brand === "byok";
  const plans: PricingPlan[] = isByok
    ? BYOK_PRICING_PACKAGES
    : STUDIO_PRICING_PLANS;
  const trialUrl = isByok ? "https://byok.link" : "https://picdrift.com/sign-up";

  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [checkoutPlan, setCheckoutPlan] = useState<PricingPlan | null>(null);
  const [checkoutStep, setCheckoutStep] = useState<"email" | "redirect" | null>(
    null,
  );
  const [urlOverrides, setUrlOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    apiEndpoints
      .byokGetCheckoutUrls()
      .then((res) => {
        if (active && res.data?.urls) setUrlOverrides(res.data.urls);
      })
      .catch(() => {
        /* keep bundled fallback URLs */
      });
    return () => {
      active = false;
    };
  }, []);

  const beginCheckout = (plan: PricingPlan) => {
    setCheckoutPlan(plan);
    setCheckoutStep("email");
  };

  const proceedCheckout = () => {
    if (!checkoutPlan) return;
    if (checkoutStep === "email") {
      setCheckoutStep("redirect");
      return;
    }
    const url = urlOverrides[checkoutPlan.code] || checkoutPlan.checkoutUrl;
    window.open(url, "_blank", "noopener,noreferrer");
    setCheckoutPlan(null);
    setCheckoutStep(null);
  };

  return (
    <div className="fixed inset-0 z-[200] overflow-y-auto bg-black/85 backdrop-blur-sm">
      <div className="flex min-h-full items-center justify-center p-4">
      <div className="relative my-4 w-full max-w-5xl rounded-2xl border border-white/10 bg-[#070a20] p-5 shadow-2xl sm:p-7">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          ✕
        </button>

        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200/85">
            You're previewing — sign up to create
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
            Pick a plan to start creating
          </h2>

          <div className="mt-5 inline-flex rounded-xl border border-white/15 bg-[#0b1629] p-1">
            {(["monthly", "annual"] as BillingCycle[]).map((cycle) => (
              <button
                key={cycle}
                type="button"
                onClick={() => setBillingCycle(cycle)}
                className={`rounded-lg px-4 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                  billingCycle === cycle
                    ? "bg-cyan-300/20 text-cyan-100"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                {cycle === "monthly" ? "Monthly" : "Annually"}
              </button>
            ))}
          </div>
        </div>

        <div
          className={`mt-6 grid gap-3 sm:grid-cols-2 ${
            isByok ? "lg:grid-cols-3" : "lg:grid-cols-2"
          }`}
        >
          {/* Free Trial card */}
          <article className="relative flex h-full flex-col rounded-2xl border border-cyan-300/45 bg-gradient-to-br from-cyan-500/15 to-blue-500/10 p-5 shadow-[0_12px_28px_rgba(2,10,26,0.42)]">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-extrabold text-white">Free Trial</h3>
              <span className="rounded-lg border border-cyan-300/40 bg-cyan-300/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-widest text-cyan-100">
                14 Days
              </span>
            </div>
            <div className="mt-5 text-[28px] font-extrabold text-white">$0</div>
            <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              No card required
            </p>
            <div className="mt-4 grid grid-cols-1 divide-y divide-white/10 rounded-xl border border-white/10 bg-[#0a1222]">
              {["Full dashboard access", "Your own Fal key", "Cancel anytime"].map(
                (f) => (
                  <p key={f} className="px-3 py-2 text-center text-xs text-slate-200">
                    {f}
                  </p>
                ),
              )}
            </div>
            <div className="mt-5">
              <a
                href={trialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full rounded-xl border border-cyan-300/60 bg-cyan-500 px-4 py-3 text-center text-xs font-bold uppercase tracking-[0.12em] text-slate-950 transition hover:bg-cyan-400"
              >
                Start Free Trial
              </a>
            </div>
          </article>

          {plans.map((plan) => (
            <article
              key={plan.code}
              className={`relative flex h-full flex-col rounded-2xl border bg-[#0e1729] p-5 shadow-[0_12px_28px_rgba(2,10,26,0.42)] ${
                plan.featured ? "border-blue-300/55" : "border-white/12"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-extrabold text-white">{plan.title}</h3>
                {plan.highlight && (
                  <span className="rounded-lg border border-blue-300/40 bg-blue-300/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-widest text-blue-100">
                    {plan.highlight}
                  </span>
                )}
              </div>
              <div className="mt-5 text-[28px] font-extrabold text-white">
                {billingCycle === "monthly" ? plan.monthlyPrice : plan.annualPrice}
              </div>
              <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {billingCycle === "monthly" ? "Billed monthly" : "Billed annually"}
              </p>
              <div className="mt-4 grid grid-cols-1 divide-y divide-white/10 rounded-xl border border-white/10 bg-[#0a1222]">
                {plan.features.map((feature) => (
                  <p
                    key={feature}
                    className="px-3 py-2 text-center text-xs text-slate-200"
                  >
                    {feature}
                  </p>
                ))}
              </div>
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => beginCheckout(plan)}
                  className="block w-full rounded-xl border border-blue-300/60 bg-blue-500 px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-blue-400"
                >
                  Buy Now
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
      </div>

      {checkoutPlan && checkoutStep && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#081126] p-6 shadow-2xl">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-200">
              {checkoutPlan.title}
            </p>
            {checkoutStep === "email" ? (
              <>
                <h3 className="mt-2 text-xl font-black text-white">
                  Use Your Dashboard Email
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-300">
                  Complete checkout using the same email you'll use for your
                  dashboard so your plan activates automatically.
                </p>
              </>
            ) : (
              <>
                <h3 className="mt-2 text-xl font-black text-white">
                  You Will Be Redirected To PicDrift For Checkout
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-300">
                  PicDrift handles the secure payment page. Return to sign in after
                  payment to finish activation.
                </p>
              </>
            )}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setCheckoutPlan(null);
                  setCheckoutStep(null);
                }}
                className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-gray-200 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={proceedCheckout}
                className="flex-1 rounded-xl bg-cyan-500 px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-slate-950 hover:bg-cyan-400"
              >
                {checkoutStep === "email" ? "Next" : "Proceed"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DemoPricingModal;
