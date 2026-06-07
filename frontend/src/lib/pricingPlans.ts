// Studio pricing plans for the public /pricing page shown on the .app / .studio
// marketing domains. These mirror the BYOK studio tiers but are presented with
// PicDrift / VisualFX branding (no BYOK wording). Checkout URLs match the
// canonical PicDrift checkout links used everywhere else.

export type BillingCycle = "monthly" | "annual";

export type PricingPlan = {
  code: string;
  title: string;
  monthlyPrice: string;
  annualPrice: string;
  checkoutUrl: string;
  features: string[];
  highlight?: string;
  featured?: boolean;
};

// Only the $49 / $99 / $197 studio tiers are offered on the .app / .studio pages.
export const STUDIO_PRICING_PLANS: PricingPlan[] = [
  {
    code: "PD_STUDIO",
    title: "PicDrift Studio",
    monthlyPrice: "$49/mo",
    annualPrice: "$588/yr",
    checkoutUrl:
      "https://www.picdrift.com/pricing-plans/checkout-1?planId=dc751744-5641-4086-a510-7d203e187a79&checkoutFlowId=b5b1614d-e4d5-4352-804a-19d57d5225d0",
    features: [
      "Nano Banana + GPT-2",
      "Kling 2.6 Animation",
      "Studio Admin Panel",
      "5 Team Members",
      "20 Project Timelines",
      "1GB Storage",
    ],
  },
  {
    code: "VFX_STUDIO",
    title: "VisualFX Studio",
    monthlyPrice: "$99/mo",
    annualPrice: "$1,188/yr",
    checkoutUrl:
      "https://www.picdrift.com/pricing-plans/checkout-1?planId=a97eb2df-59b6-4500-ba93-618171001d4b&checkoutFlowId=e90e22a5-29ed-4093-b268-7838c0fca777",
    features: [
      "PicDrift",
      "FX Models",
      "Studio",
      "5 Team Members",
      "20 Project Timelines",
      "2GB Storage",
    ],
    highlight: "Most Popular",
    featured: true,
  },
  {
    code: "VFX_STUDIO_AGENCY",
    title: "VisualFX Studio Agency",
    monthlyPrice: "$197/mo",
    annualPrice: "$2,364/yr",
    checkoutUrl:
      "https://www.picdrift.com/pricing-plans/checkout-1?planId=4785cf91-670a-416f-8bb1-637b926bf2a0&checkoutFlowId=893f469b-9e21-4baa-bb7b-3217b96aa285",
    features: [
      "PicDrift",
      "FX Models",
      "Studio Admin Panel",
      "20 Team Members",
      "200 Project Timelines",
      "5GB Storage",
    ],
  },
];

export const STUDIO_PLAN_BUTTON_CLASSES: Record<string, string> = {
  PD_STUDIO: "border-emerald-300/45 bg-emerald-500/85 text-emerald-50 hover:bg-emerald-400/90",
  VFX_STUDIO: "border-blue-300/60 bg-blue-500 text-white hover:bg-blue-400",
  VFX_STUDIO_AGENCY: "border-amber-300/45 bg-amber-500/85 text-amber-50 hover:bg-amber-400/90",
};
