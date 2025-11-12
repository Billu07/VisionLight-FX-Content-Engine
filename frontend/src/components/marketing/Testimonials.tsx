export const Testimonials = () => {
  const testimonials = [
    {
      quote:
        "Visionlight saved our agency hundreds of hours a month. Clients think we built their dashboards ourselves.",
      author: "Emily R.",
      role: "Creative Agency Owner",
      avatar: "👩‍💼",
    },
    {
      quote:
        "We went from brainstorming to posting daily content in days. The ROI FX data showed a 3x increase in output.",
      author: "James P.",
      role: "Marketing Director",
      avatar: "👨‍💼",
    },
    {
      quote:
        "I didn't expect the setup to be this easy. Visionlight handled everything — I just plugged in my OpenAI key and it worked.",
      author: "Sofia M.",
      role: "Content Strategist",
      avatar: "👩‍🎨",
    },
  ];

  return (
    <div className="py-20 bg-white">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Loved by Content Teams
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            See how teams are transforming their content creation with
            Visionlight's automated studio.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              className="bg-gray-50 rounded-2xl p-8 border border-gray-200"
            >
              <div className="text-4xl mb-4">{testimonial.avatar}</div>
              <blockquote className="text-lg text-gray-700 italic mb-6">
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

        <div className="text-center mt-12">
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-8 max-w-2xl mx-auto">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">
              Ready to Join Them?
            </h3>
            <p className="text-gray-600 mb-6">
              Start your free 7-day demo and experience the power of automated
              content creation.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <div className="bg-green-500 text-white px-4 py-2 rounded-full text-sm font-semibold">
                ✅ No risk • 7-day free trial
              </div>
              <div className="bg-purple-500 text-white px-4 py-2 rounded-full text-sm font-semibold">
                🎯 Setup included • No coding
              </div>
              <div className="bg-orange-500 text-white px-4 py-2 rounded-full text-sm font-semibold">
                ⚡ Cancel anytime
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
