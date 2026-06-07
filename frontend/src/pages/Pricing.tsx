import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { apiEndpoints } from "../lib/api";
import { getSiteBrand } from "../lib/branding";
import {
  STUDIO_PRICING_PLANS,
  STUDIO_PLAN_BUTTON_CLASSES,
  type BillingCycle,
  type PricingPlan,
} from "../lib/pricingPlans";

export const Pricing = () => {
  const siteBrand = useMemo(() => getSiteBrand(), []);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [checkoutPlan, setCheckoutPlan] = useState<PricingPlan | null>(null);
  const [checkoutConfirmStep, setCheckoutConfirmStep] =
    useState<"email" | "redirect" | null>(null);
  const [checkoutUrlOverrides, setCheckoutUrlOverrides] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    let active = true;
    apiEndpoints
      .byokGetCheckoutUrls()
      .then((res) => {
        if (active && res.data?.urls) setCheckoutUrlOverrides(res.data.urls);
      })
      .catch(() => {
        // Keep the bundled fallback URLs if the endpoint is unreachable.
      });
    return () => {
      active = false;
    };
  }, []);

  // BYOK domain keeps its own dedicated landing/package sheet.
  if (siteBrand === "byok") {
    return <Navigate to="/" replace />;
  }

  const brandName = siteBrand === "visualfx" ? "VisualFX" : "PicDrift";

  const beginCheckout = (plan: PricingPlan) => {
    setCheckoutPlan(plan);
    setCheckoutConfirmStep("email");
  };

  const closeCheckoutConfirm = () => {
    setCheckoutPlan(null);
    setCheckoutConfirmStep(null);
  };

  const proceedCheckoutConfirm = () => {
    if (!checkoutPlan) return;
    if (checkoutConfirmStep === "email") {
      setCheckoutConfirmStep("redirect");
      return;
    }
    const checkoutUrl =
      checkoutUrlOverrides[checkoutPlan.code] || checkoutPlan.checkoutUrl;
    window.open(checkoutUrl, "_blank", "noopener,noreferrer");
    closeCheckoutConfirm();
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#070a20] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(157,57,255,0.2),transparent_38%),radial-gradient(circle_at_82%_18%,rgba(26,103,255,0.35),transparent_42%),radial-gradient(circle_at_50%_64%,rgba(15,12,40,0.65),transparent_62%)]" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#170316] via-[#1a164f] to-[#0d2f59]" />

      <header className="relative z-20 border-b border-white/10 bg-[#120f2b]/65 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="text-lg font-black tracking-tight text-white">
            {brandName}
            <span className="ml-1 bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">
              Studio
            </span>
          </Link>
          <Link
            to="/"
            className="rounded-full border border-white/35 bg-white/5 px-5 py-1.5 text-sm font-semibold text-white transition hover:bg-white/12"
          >
            Back to Site
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200/85">
            {brandName} Studio Plans
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">
            Simple Studio Pricing
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-300">
            Team-ready studio plans for collaboration, admin controls, and shared
            workflows. Cancel or upgrade anytime.
          </p>

          <div className="mt-7 inline-flex rounded-xl border border-white/15 bg-[#0b1629] p-1">
            <button
              type="button"
              onClick={() => setBillingCycle("monthly")}
              className={`rounded-lg px-4 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                billingCycle === "monthly"
                  ? "bg-cyan-300/20 text-cyan-100"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle("annual")}
              className={`rounded-lg px-4 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                billingCycle === "annual"
                  ? "bg-cyan-300/20 text-cyan-100"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              Annually
            </button>
          </div>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STUDIO_PRICING_PLANS.map((plan) => (
            <article
              key={plan.code}
              className={`relative flex h-full flex-col rounded-2xl border bg-[#0e1729] p-5 shadow-[0_12px_28px_rgba(2,10,26,0.42)] transition-all ${
                plan.featured ? "border-blue-300/55" : "border-white/12"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-extrabold text-white">{plan.title}</h2>
                {plan.highlight && (
                  <span className="rounded-lg border border-blue-300/40 bg-blue-300/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-widest text-blue-100">
                    {plan.highlight}
                  </span>
                )}
              </div>

              <div className="relative mt-5 h-10 overflow-hidden">
                <span
                  className={`absolute left-0 top-0 text-[28px] font-extrabold text-white transition-all duration-300 ${
                    billingCycle === "monthly"
                      ? "translate-y-0 opacity-100"
                      : "translate-y-2 opacity-0"
                  }`}
                >
                  {plan.monthlyPrice}
                </span>
                <span
                  className={`absolute left-0 top-0 text-[28px] font-extrabold text-white transition-all duration-300 ${
                    billingCycle === "annual"
                      ? "translate-y-0 opacity-100"
                      : "translate-y-2 opacity-0"
                  }`}
                >
                  {plan.annualPrice}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {billingCycle === "monthly" ? "Monthly View" : "Annual View"}
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
                  className={`block w-full rounded-xl border px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.12em] transition ${
                    STUDIO_PLAN_BUTTON_CLASSES[plan.code] ||
                    "border-blue-300/60 bg-blue-500 text-white hover:bg-blue-400"
                  }`}
                >
                  Buy Now
                </button>
              </div>
            </article>
          ))}
        </div>
      </main>

      <footer className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-8 text-xs text-slate-200/90 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link to="/terms" className="transition-colors hover:text-white">
            Terms
          </Link>
          <span className="text-white/35">|</span>
          <Link to="/privacy" className="transition-colors hover:text-white">
            Privacy
          </Link>
          <span className="text-white/35">|</span>
          <a
            href="https://www.picdrift.com/contact"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-white"
          >
            Contact
          </a>
        </div>
      </footer>

      {checkoutPlan && checkoutConfirmStep && (
        <div className="fixed inset-0 z-[45] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#081126] p-6 shadow-2xl">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-200">
              {checkoutPlan.title}
            </p>
            {checkoutConfirmStep === "email" ? (
              <>
                <h3 className="mt-2 text-xl font-black text-white">
                  Use Your Dashboard Email
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-300">
                  Complete checkout using the same email you use for your {brandName}{" "}
                  dashboard so your plan activates automatically.
                </p>
              </>
            ) : (
              <>
                <h3 className="mt-2 text-xl font-black text-white">
                  You Will Be Redirected To PicDrift For Checkout
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-300">
                  PicDrift handles the secure payment page. Return to your dashboard
                  after payment to finish activation.
                </p>
              </>
            )}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={closeCheckoutConfirm}
                className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-gray-200 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={proceedCheckoutConfirm}
                className="flex-1 rounded-xl bg-cyan-500 px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-white hover:bg-cyan-400"
              >
                Proceed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Pricing;
