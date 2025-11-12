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
    },
  ];

  const getColorClasses = (color: string) => {
    const colors = {
      orange: "bg-orange-500 text-white",
      green: "bg-green-500 text-white",
      purple: "bg-purple-500 text-white",
    };
    return colors[color as keyof typeof colors] || colors.orange;
  };

  return (
    <div className="py-20 bg-white">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            The Complete Content Engine
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Everything you need to automate your content creation, from initial
            idea to published post and performance analytics.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8 mb-16">
          {features.map((feature, index) => (
            <div
              key={index}
              className="bg-gray-50 rounded-2xl p-8 border border-gray-200 hover:shadow-lg transition-shadow"
            >
              <div
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold mb-6 ${getColorClasses(
                  feature.color
                )}`}
              >
                {feature.title}
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">
                {feature.subtitle}
              </h3>
              <p className="text-gray-600 mb-6">{feature.description}</p>
              <ul className="space-y-3">
                {feature.items.map((item, itemIndex) => (
                  <li
                    key={itemIndex}
                    className="flex items-center gap-3 text-gray-700"
                  >
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="text-center">
          <Link
            to="/demo"
            className="bg-blue-600 text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition-colors inline-flex items-center gap-2"
          >
            🚀 Experience All Features in Demo
          </Link>
          <p className="text-gray-500 mt-4 text-sm">
            No credit card required • 7-day free trial • Setup included
          </p>
        </div>
      </div>
    </div>
  );
};
