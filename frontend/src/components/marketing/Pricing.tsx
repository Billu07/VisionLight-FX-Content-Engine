import { Link } from "react-router-dom";

export const Pricing = () => {
  const plans = [
    {
      name: "Creative Bundle",
      price: "$1,500",
      period: "one-time setup",
      hosting: "$200/month",
      description: "Perfect for content creators and small teams",
      features: [
        "FX Dashboard (branded & hosted)",
        "Script FX (OpenAI integration)",
        "PicDrift FX (Sora2, Gemini, BannerBear)",
        "ROI FX (performance tracking)",
        "7-day free demo with credits",
        "Managed hosting & support",
        "Future AI integrations",
      ],
      cta: "Start Free Demo",
      popular: false,
    },
    {
      name: "Complete System",
      price: "$2,500",
      period: "one-time setup",
      hosting: "$200/month",
      description: "Everything you need for full automation",
      features: [
        "Everything in Creative Bundle",
        "Social Bundle (Buffer integration)",
        "Post FX (auto-publishing)",
        "Metric FX (analytics)",
        "Optimize FX (AI optimization)",
        "$0 Social Bundle hosting forever",
        "Save $1,800/year vs adding later",
      ],
      cta: "Get Complete System",
      popular: true,
    },
  ];

  const addons = [
    {
      name: "Social Bundle Add-on",
      price: "$1,000",
      description: "Add later during Creative upgrade",
      note: "$0/month hosting forever",
    },
    {
      name: "Custom FX Integration",
      price: "$500-1,500",
      description: "Add Runway, Pika, ElevenLabs, etc.",
      note: "One-time setup fee",
    },
    {
      name: "Agency Client Dashboard",
      price: "$200/month",
      description: "Per client white-label dashboard",
      note: "Setup included",
    },
  ];

  return (
    <div className="py-20 bg-gray-50">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Get a $20,000 connected automation system for a fraction of the
            cost. Launch prices available for limited time.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto mb-16">
          {plans.map((plan, index) => (
            <div
              key={index}
              className={`bg-white rounded-2xl p-8 border-2 ${
                plan.popular ? "border-blue-500 relative" : "border-gray-200"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <span className="bg-blue-500 text-white px-4 py-1 rounded-full text-sm font-semibold">
                    Most Popular
                  </span>
                </div>
              )}

              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                {plan.name}
              </h3>
              <p className="text-gray-600 mb-6">{plan.description}</p>

              <div className="mb-6">
                <span className="text-4xl font-bold text-gray-900">
                  {plan.price}
                </span>
                <span className="text-gray-600 ml-2">
                  setup + {plan.hosting} hosting
                </span>
              </div>

              <ul className="space-y-4 mb-8">
                {plan.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-center gap-3">
                    <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg
                        className="w-3 h-3 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="3"
                          d="M5 13l4 4L19 7"
                        ></path>
                      </svg>
                    </div>
                    <span className="text-gray-700">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                to="/demo"
                className={`w-full py-4 px-6 rounded-xl font-bold text-lg text-center block transition-colors ${
                  plan.popular
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-gray-900 text-white hover:bg-gray-800"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        <div className="max-w-3xl mx-auto">
          <h3 className="text-2xl font-bold text-center text-gray-900 mb-8">
            Add-ons & Extras
          </h3>
          <div className="grid gap-4">
            {addons.map((addon, index) => (
              <div
                key={index}
                className="bg-white rounded-xl p-6 border border-gray-200 flex justify-between items-center"
              >
                <div>
                  <h4 className="font-semibold text-gray-900">{addon.name}</h4>
                  <p className="text-gray-600 text-sm">{addon.description}</p>
                </div>
                <div className="text-right">
                  <div className="font-bold text-gray-900">{addon.price}</div>
                  <div className="text-sm text-gray-500">{addon.note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-center mt-12">
          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-6 inline-block">
            <p className="text-yellow-800 font-semibold">
              ⚡ Prices will rise once our first client capacity is filled —
              secure your rate now.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
