export const WhyVisionlight = () => {
  const features = [
    {
      title: "One Dashboard, All Tools",
      description:
        "Connect all your creative AI tools in one seamless automation system.",
      icon: "🎛️",
      gradient: "from-blue-500 to-cyan-500",
    },
    {
      title: "No Markups, Direct Billing",
      description: "Pay AI providers directly. No middlemen, no hidden fees.",
      icon: "💰",
      gradient: "from-green-500 to-emerald-500",
    },
    {
      title: "Fully Hosted & Managed",
      description:
        "We handle hosting, updates, and support so you can focus on creativity.",
      icon: "🛠️",
      gradient: "from-purple-500 to-violet-500",
    },
    {
      title: "Future-Proof Platform",
      description: "Easily add new AI integrations as technology evolves.",
      icon: "🚀",
      gradient: "from-orange-500 to-red-500",
    },
  ];

  return (
    <div className="py-12 sm:py-20 bg-gradient-to-br from-gray-900 to-gray-800 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-32 h-32 sm:w-64 sm:h-64 bg-cyan-500/5 rounded-full blur-2xl sm:blur-3xl"></div>
        <div className="absolute bottom-0 right-0 w-32 h-32 sm:w-64 sm:h-64 bg-purple-500/5 rounded-full blur-2xl sm:blur-3xl"></div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-bold text-white mb-3 sm:mb-4">
            Why You're In The{" "}
            <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              Right Place
            </span>
          </h2>
          <p className="text-base sm:text-xl text-gray-300 mb-8 sm:mb-12 max-w-2xl mx-auto px-2 sm:px-0">
            You want automation that produces daily content — effortlessly,
            consistently, and ready for the future.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 text-left">
            {features.map((feature, index) => (
              <div
                key={index}
                className="group bg-gray-800/50 backdrop-blur-sm border border-white/10 rounded-2xl p-4 sm:p-6 hover:border-cyan-400/30 transition-all duration-300 hover:scale-105"
              >
                <div
                  className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-r ${feature.gradient} flex items-center justify-center text-white text-xl sm:text-2xl mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300`}
                >
                  {feature.icon}
                </div>
                <h3 className="text-lg sm:text-xl font-semibold text-white mb-2 sm:mb-3">
                  {feature.title}
                </h3>
                <p className="text-gray-400 leading-relaxed text-sm sm:text-base">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-8 sm:mt-12 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-400/20 rounded-2xl p-4 sm:p-6 md:p-8 backdrop-blur-sm">
            <p className="text-base sm:text-lg text-cyan-100 font-semibold leading-relaxed">
              Visionlight brings everything together into one seamless
              automation system — built, hosted, and maintained for you today,
              and adaptable to whatever AI comes next.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
