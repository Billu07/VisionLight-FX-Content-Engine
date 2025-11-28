import { Link } from "react-router-dom";

export const Features = () => {
  const features = [
    {
      title: "FX Dashboard",
      subtitle: "Your AI Automation Hub",
      description:
        "Your hosted control center that connects directly to leading AI tools, giving you one place to plan, create, and post content automatically.",
      color: "orange",
      items: [
        "Branded dashboard built for you",
        "All integrations connected",
        "Step-by-step guidance",
        "Grows with your needs",
      ],
      icon: "🎛️",
      gradient: "from-orange-500 to-red-500",
    },
    {
      title: "Creative Bundle",
      subtitle: "Free 7-Day Demo",
      description:
        "Automates your content creation from ideas to finished visuals using the best AI systems connected through your dashboard.",
      color: "green",
      items: [
        "Script FX (OpenAI) - generates ideas & scripts",
        "PicDrift FX - creates videos, images, graphics",
        "ROI FX - tracks performance & time saved",
        "Demo credits to test everything",
      ],
      icon: "🎨",
      gradient: "from-green-500 to-emerald-500",
    },
    {
      title: "Social Bundle",
      subtitle: "Post, Track, Optimize",
      description:
        "Completes your creative system by turning everything you produce into measurable results across all platforms.",
      color: "purple",
      items: [
        "Social FX - writes captions automatically",
        "Post FX - publishes across platforms",
        "Metric FX - tracks engagement & growth",
        "Optimize FX - improves future campaigns",
      ],
      icon: "📊",
      gradient: "from-purple-500 to-violet-500",
    },
  ];

  const getColorClasses = (color: string) => {
    const colors = {
      orange: "bg-gradient-to-r from-orange-500 to-red-500",
      green: "bg-gradient-to-r from-green-500 to-emerald-500",
      purple: "bg-gradient-to-r from-purple-500 to-violet-500",
    };
    return colors[color as keyof typeof colors] || colors.orange;
  };

  return (
    <div className="py-12 sm:py-20 bg-gradient-to-br from-gray-50 to-gray-100 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-32 h-32 sm:w-64 sm:h-64 bg-cyan-500/5 rounded-full blur-2xl sm:blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-32 h-32 sm:w-64 sm:h-64 bg-purple-500/5 rounded-full blur-2xl sm:blur-3xl"></div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <div className="text-center mb-8 sm:mb-16">
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-3 sm:mb-4">
            The Complete{" "}
            <span className="bg-gradient-to-r from-cyan-500 to-blue-500 bg-clip-text text-transparent">
              Content Engine
            </span>
          </h2>
          <p className="text-base sm:text-xl text-gray-600 max-w-3xl mx-auto px-2 sm:px-0">
            Everything you need to automate your content creation, from initial
            idea to published post and performance analytics.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 mb-8 sm:mb-16">
          {features.map((feature, index) => (
            <div
              key={index}
              className="group bg-white/80 backdrop-blur-sm rounded-2xl p-4 sm:p-6 md:p-8 border border-white/50 hover:border-cyan-200 shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-105"
            >
              {/* Feature Header */}
              <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
                <div
                  className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl ${getColorClasses(
                    feature.color
                  )} flex items-center justify-center text-white text-lg sm:text-xl shadow-lg`}
                >
                  {feature.icon}
                </div>
                <div>
                  <div
                    className={`inline-flex items-center gap-2 px-2 sm:px-3 py-1 rounded-full text-xs font-semibold text-white ${getColorClasses(
                      feature.color
                    )}`}
                  >
                    {feature.title}
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mt-1 sm:mt-2">
                    {feature.subtitle}
                  </h3>
                </div>
              </div>

              <p className="text-gray-600 mb-4 sm:mb-6 leading-relaxed text-sm sm:text-base">
                {feature.description}
              </p>

              <ul className="space-y-2 sm:space-y-3">
                {feature.items.map((item, itemIndex) => (
                  <li
                    key={itemIndex}
                    className="flex items-center gap-2 sm:gap-3 text-gray-700 group-hover:text-gray-900 transition-colors text-sm sm:text-base"
                  >
                    <div
                      className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${getColorClasses(
                        feature.color
                      )} flex-shrink-0`}
                    ></div>
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="text-center">
          <Link
            to="/demo"
            className="inline-flex items-center gap-2 sm:gap-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white px-4 sm:px-6 md:px-8 py-3 sm:py-4 rounded-xl font-bold text-base sm:text-lg transition-all duration-300 hover:shadow-2xl hover:scale-105 w-full sm:w-auto justify-center"
          >
            <span>🚀</span>
            Experience All Features in Demo
          </Link>
          <p className="text-gray-500 mt-3 sm:mt-4 text-xs sm:text-sm">
            No credit card required • 7-day free trial • Setup included
          </p>
        </div>
      </div>
    </div>
  );
};
