export const FAQ = () => {
  const faqs = [
    {
      question: "What do I get in the Free 7-Day Creative Demo?",
      answer:
        "You'll get access to a live, branded FX dashboard with Script FX, PicDrift FX, and ROI FX. Your demo includes credits to create real videos, images, and graphics — no card, no commitment.",
    },
    {
      question: "What's included in the Creative Bundle?",
      answer:
        "The Creative Bundle includes your custom-built FX Dashboard (Visionlight), Script FX (OpenAI), PicDrift FX (Sora2, Gemini, BannerBear), and ROI FX for performance tracking. Setup and first-month hosting are included for $1,500, then $200/month hosting going forward.",
    },
    {
      question: "What's in the Social Bundle?",
      answer:
        "The Social Bundle connects Buffer for full posting, analytics, and optimization through Social, Post, Metric, and Optimize FX. Add it during Creative upgrade for $1,000 setup and $0/month hosting forever, or add later for $2,500 setup + $150/month hosting.",
    },
    {
      question: "What does setup include?",
      answer:
        "Setup is a done-for-you build. Visionlight creates your branded dashboard, connects all integrations, tests automation flows, and guides you through onboarding so your system works perfectly on day one.",
    },
    {
      question: "Who pays for AI usage?",
      answer:
        "You do — directly to each AI provider (OpenAI, Sora2, Gemini, BannerBear, Buffer). There are no markups or middlemen.",
    },
    {
      question: "Will my API keys be secure?",
      answer:
        "Yes. Your API keys are fully encrypted and stored securely on your own dashboard instance. Visionlight never sees, stores, or has access to your API credentials. All connections use secure, tokenized authentication.",
    },
    {
      question: "Can agencies use this?",
      answer:
        "Yes! Agencies can add fully branded client dashboards for $200/month each with setup included. Offer white-label automation under your own brand while we handle the technology.",
    },
    {
      question: "Is there any risk or contract?",
      answer:
        "No. Try the demo free for 7 days. No card, no commitment. Upgrade only if you love it. Cancel anytime.",
    },
  ];

  return (
    <div className="py-20 bg-gray-50">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-xl text-gray-600">
              Everything you need to know about getting started with Visionlight
              AI.
            </p>
          </div>

          <div className="space-y-6">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="bg-white rounded-2xl p-6 border border-gray-200"
              >
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  {faq.question}
                </h3>
                <p className="text-gray-600 leading-relaxed">{faq.answer}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <div className="bg-blue-600 text-white rounded-2xl p-8">
              <h3 className="text-2xl font-bold mb-4">Still have questions?</h3>
              <p className="text-blue-100 mb-6">
                We're here to help you get started with your automated content
                studio.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button className="bg-white text-blue-600 px-6 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors">
                  📞 Schedule a Call
                </button>
                <button className="border border-white text-white px-6 py-3 rounded-lg font-semibold hover:bg-white/10 transition-colors">
                  ✉️ Contact Support
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
