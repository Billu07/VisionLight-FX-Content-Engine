export const Testimonials = () => {
  const testimonials = [
    {
      quote:
        "Visionlight saved our agency hundreds of hours a month. Clients think we built their dashboards ourselves.",
      author: "Emily R.",
      role: "Creative Agency Owner",
      avatar: "👩‍💼",
      gradient: "from-cyan-500 to-blue-500",
    },
    {
      quote:
        "We went from brainstorming to posting daily content in days. The ROI FX data showed a 3x increase in output.",
      author: "James P.",
      role: "Marketing Director",
      avatar: "👨‍💼",
      gradient: "from-purple-500 to-violet-500",
    },
    {
      quote:
        "I didn't expect the setup to be this easy. Visionlight handled everything — I just plugged in my OpenAI key and it worked.",
      author: "Sofia M.",
      role: "Content Strategist",
      avatar: "👩‍🎨",
      gradient: "from-green-500 to-emerald-500",
    },
  ];

  return (
    <div className="py-12 sm:py-20 bg-gradient-to-br from-white to-gray-50 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-32 h-32 sm:w-64 sm:h-64 bg-cyan-500/5 rounded-full blur-2xl sm:blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-32 h-32 sm:w-64 sm:h-64 bg-purple-500/5 rounded-full blur-2xl sm:blur-3xl"></div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <div className="text-center mb-8 sm:mb-16">
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-3 sm:mb-4">
            Loved by{" "}
            <span className="bg-gradient-to-r from-cyan-500 to-blue-500 bg-clip-text text-transparent">
              Content Teams
            </span>
          </h2>
          <p className="text-base sm:text-xl text-gray-600 max-w-2xl mx-auto px-2 sm:px-0">
            See how teams are transforming their content creation with
            Visionlight's automated studio.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 max-w-6xl mx-auto mb-8 sm:mb-16">
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              className="group bg-white/80 backdrop-blur-sm rounded-2xl p-4 sm:p-6 md:p-8 border border-white/50 hover:border-cyan-200 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
            >
              <div
                className={`w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-r ${testimonial.gradient} flex items-center justify-center text-white text-xl sm:text-2xl mb-4 sm:mb-6 shadow-lg group-hover:scale-110 transition-transform duration-300`}
              >
                {testimonial.avatar}
              </div>
              <blockquote className="text-base sm:text-lg text-gray-700 italic mb-4 sm:mb-6 leading-relaxed">
                "{testimonial.quote}"
              </blockquote>
              <div className="border-t border-gray-200 pt-3 sm:pt-4">
                <div className="font-semibold text-gray-900 text-sm sm:text-base">
                  {testimonial.author}
                </div>
                <div className="text-gray-600 text-xs sm:text-sm">
                  {testimonial.role}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center">
          <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-400/20 rounded-2xl p-4 sm:p-6 md:p-8 max-w-2xl mx-auto backdrop-blur-sm">
            <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 sm:mb-4">
              Ready to Join Them?
            </h3>
            <p className="text-gray-600 mb-4 sm:mb-6 text-sm sm:text-base">
              Start your free 7-day demo and experience the power of automated
              content creation.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 justify-center">
              <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-semibold shadow-lg">
                ✅ No risk • 7-day free trial
              </div>
              <div className="bg-gradient-to-r from-purple-500 to-violet-500 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-semibold shadow-lg">
                🎯 Setup included • No coding
              </div>
              <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-semibold shadow-lg">
                ⚡ Cancel anytime
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
