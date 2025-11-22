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
    <div className="py-20 bg-gradient-to-br from-white to-gray-50 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl"></div>
      </div>

      <div className="container mx-auto px-6 relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Loved by{" "}
            <span className="bg-gradient-to-r from-cyan-500 to-blue-500 bg-clip-text text-transparent">
              Content Teams
            </span>
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            See how teams are transforming their content creation with
            Visionlight's automated studio.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-16">
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              className="group bg-white/80 backdrop-blur-sm rounded-2xl p-8 border border-white/50 hover:border-cyan-200 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
            >
              <div
                className={`w-16 h-16 rounded-2xl bg-gradient-to-r ${testimonial.gradient} flex items-center justify-center text-white text-2xl mb-6 shadow-lg group-hover:scale-110 transition-transform duration-300`}
              >
                {testimonial.avatar}
              </div>
              <blockquote className="text-lg text-gray-700 italic mb-6 leading-relaxed">
                "{testimonial.quote}"
              </blockquote>
              <div className="border-t border-gray-200 pt-4">
                <div className="font-semibold text-gray-900">
                  {testimonial.author}
                </div>
                <div className="text-gray-600 text-sm">{testimonial.role}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center">
          <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-400/20 rounded-2xl p-8 max-w-2xl mx-auto backdrop-blur-sm">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">
              Ready to Join Them?
            </h3>
            <p className="text-gray-600 mb-6">
              Start your free 7-day demo and experience the power of automated
              content creation.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-lg">
                ✅ No risk • 7-day free trial
              </div>
              <div className="bg-gradient-to-r from-purple-500 to-violet-500 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-lg">
                🎯 Setup included • No coding
              </div>
              <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-lg">
                ⚡ Cancel anytime
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
