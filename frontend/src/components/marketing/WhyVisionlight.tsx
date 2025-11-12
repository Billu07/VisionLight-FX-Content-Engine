export const WhyVisionlight = () => {
  return (
    <div className="py-20 bg-gray-50">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Why You're In The Right Place
          </h2>
          <p className="text-xl text-gray-600 mb-12">
            You want automation that produces daily content — effortlessly,
            consistently, and ready for the future.
          </p>

          <div className="grid md:grid-cols-2 gap-8 text-left">
            {[
              {
                title: "One Dashboard, All Tools",
                description:
                  "Connect all your creative AI tools in one seamless automation system.",
                icon: "🎛️",
              },
              {
                title: "No Markups, Direct Billing",
                description:
                  "Pay AI providers directly. No middlemen, no hidden fees.",
                icon: "💰",
              },
              {
                title: "Fully Hosted & Managed",
                description:
                  "We handle hosting, updates, and support so you can focus on creativity.",
                icon: "🛠️",
              },
              {
                title: "Future-Proof Platform",
                description:
                  "Easily add new AI integrations as technology evolves.",
                icon: "🚀",
              },
            ].map((feature, index) => (
              <div
                key={index}
                className="bg-white p-6 rounded-xl shadow-sm border border-gray-200"
              >
                <div className="text-3xl mb-4">{feature.icon}</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">
                  {feature.title}
                </h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 bg-blue-50 border border-blue-200 rounded-2xl p-8">
            <p className="text-lg text-blue-800 font-semibold">
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
