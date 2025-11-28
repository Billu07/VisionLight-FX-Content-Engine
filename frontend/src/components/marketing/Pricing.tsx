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
      gradient: "from-orange-500 to-red-500",
      icon: "🎨",
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
      gradient: "from-blue-500 to-cyan-500",
      icon: "🚀",
    },
  ];

  const addons = [
    {
      name: "Social Bundle Add-on",
      price: "$1,000",
      description: "Add later during Creative upgrade",
      note: "$0/month hosting forever",
      gradient: "from-green-500 to-emerald-500",
    },
    {
      name: "Custom FX Integration",
      price: "$500-1,500",
      description: "Add Runway, Pika, ElevenLabs, etc.",
      note: "One-time setup fee",
      gradient: "from-purple-500 to-violet-500",
    },
    {
      name: "Agency Client Dashboard",
      price: "$200/month",
      description: "Per client white-label dashboard",
      note: "Setup included",
      gradient: "from-cyan-500 to-blue-500",
    },
  ];

  return (
    <div className="py-12 sm:py-20 bg-gradient-to-br from-gray-50 to-gray-100 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-32 h-32 sm:w-64 sm:h-64 bg-cyan-500/5 rounded-full blur-2xl sm:blur-3xl"></div>
        <div className="absolute bottom-0 right-0 w-32 h-32 sm:w-64 sm:h-64 bg-purple-500/5 rounded-full blur-2xl sm:blur-3xl"></div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <div className="text-center mb-8 sm:mb-16">
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-3 sm:mb-4">
            Simple,{" "}
            <span className="bg-gradient-to-r from-cyan-500 to-blue-500 bg-clip-text text-transparent">
              Transparent Pricing
            </span>
          </h2>
          <p className="text-base sm:text-xl text-gray-600 max-w-2xl mx-auto px-2 sm:px-0">
            Get a $20,000 connected automation system for a fraction of the
            cost. Launch prices available for limited time.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 max-w-5xl mx-auto mb-8 sm:mb-16">
          {plans.map((plan, index) => (
            <div
              key={index}
              className={`group bg-white/80 backdrop-blur-sm rounded-2xl p-4 sm:p-6 md:p-8 border-2 transition-all duration-300 hover:scale-105 ${
                plan.popular
                  ? "border-cyan-400 shadow-2xl relative"
                  : "border-white/50 shadow-lg hover:shadow-xl"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 sm:-top-4 left-1/2 transform -translate-x-1/2">
                  <span className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white px-4 sm:px-6 py-1 sm:py-2 rounded-full text-xs sm:text-sm font-semibold shadow-lg">
                    Most Popular
                  </span>
                </div>
              )}

              {/* Plan Header */}
              <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
                <div
                  className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-r ${plan.gradient} flex items-center justify-center text-white text-lg sm:text-xl shadow-lg`}
                >
                  {plan.icon}
                </div>
                <div>
                  <h3 className="text-xl sm:text-2xl font-bold text-gray-900">
                    {plan.name}
                  </h3>
                  <p className="text-gray-600 text-sm sm:text-base">
                    {plan.description}
                  </p>
                </div>
              </div>

              {/* Pricing */}
              <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl border border-gray-200">
                <span className="text-2xl sm:text-4xl font-bold text-gray-900">
                  {plan.price}
                </span>
                <span className="text-gray-600 ml-2 text-sm sm:text-base">
                  setup + {plan.hosting} hosting
                </span>
              </div>

              {/* Features */}
              <ul className="space-y-3 sm:space-y-4 mb-6 sm:mb-8">
                {plan.features.map((feature, featureIndex) => (
                  <li
                    key={featureIndex}
                    className="flex items-start gap-2 sm:gap-3 group-hover:text-gray-900 transition-colors"
                  >
                    <div
                      className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-gradient-to-r ${plan.gradient} flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm`}
                    >
                      <svg
                        className="w-2 h-2 sm:w-3 sm:h-3 text-white"
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
                    <span className="text-gray-700 leading-relaxed text-sm sm:text-base">
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <Link
                to="/demo"
                className={`w-full py-3 sm:py-4 px-4 sm:px-6 rounded-xl font-bold text-base sm:text-lg text-center block transition-all duration-300 hover:shadow-xl ${
                  plan.popular
                    ? "bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white"
                    : "bg-gradient-to-r from-gray-900 to-gray-800 hover:from-gray-800 hover:to-gray-700 text-white"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        {/* Add-ons */}
        <div className="max-w-3xl mx-auto">
          <h3 className="text-xl sm:text-2xl font-bold text-center text-gray-900 mb-6 sm:mb-8">
            Add-ons & Extras
          </h3>
          <div className="grid gap-3 sm:gap-4">
            {addons.map((addon, index) => (
              <div
                key={index}
                className="group bg-white/80 backdrop-blur-sm rounded-xl p-4 sm:p-6 border border-white/50 hover:border-cyan-200 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-102"
              >
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div
                      className={`w-2 h-6 sm:w-3 sm:h-8 rounded-full bg-gradient-to-b ${addon.gradient}`}
                    ></div>
                    <div>
                      <h4 className="font-semibold text-gray-900 text-sm sm:text-base">
                        {addon.name}
                      </h4>
                      <p className="text-gray-600 text-xs sm:text-sm">
                        {addon.description}
                      </p>
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="font-bold text-gray-900 text-sm sm:text-base">
                      {addon.price}
                    </div>
                    <div className="text-xs sm:text-sm text-gray-500">
                      {addon.note}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Limited Time Offer */}
        <div className="text-center mt-8 sm:mt-12">
          <div className="bg-gradient-to-r from-amber-400 to-orange-400 border border-amber-300 rounded-2xl p-4 sm:p-6 inline-block shadow-lg max-w-sm sm:max-w-none">
            <p className="text-amber-900 font-semibold flex items-center gap-2 justify-center text-sm sm:text-base">
              <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-amber-700 rounded-full animate-pulse"></div>
              ⚡ Prices will rise once our first client capacity is filled —
              secure your rate now.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
