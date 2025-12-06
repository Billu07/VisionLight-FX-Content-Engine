import { Hero } from "../components/marketing/Hero";

export const MarketingSite = () => {
  return (
    <div className="bg-gradient-to-b from-gray-900 via-purple-900 to-violet-900 min-h-screen">
      <Hero />

      {/* Enhanced Footer */}
      <footer className="bg-gray-900 py-12">
        <div className="container mx-auto px-6">
          <div className="text-center">
            <h3 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent mb-4">
              PicDrift Studio
            </h3>
            <p className="text-purple-300 mb-6 max-w-md mx-auto">
              Transform your content creation with AI-powered video, image, and
              carousel generation.
            </p>
            <div className="flex justify-center gap-6 mb-6">
              <a
                href="#"
                className="text-purple-400 hover:text-cyan-400 transition-colors"
              >
                Terms
              </a>
              <a
                href="#"
                className="text-purple-400 hover:text-cyan-400 transition-colors"
              >
                Privacy
              </a>
              <a
                href="#"
                className="text-purple-400 hover:text-cyan-400 transition-colors"
              >
                Contact
              </a>
            </div>
            <p className="text-purple-400 text-sm">
              © 2026 PicDrift Studio | ALL RIGHTS RESERVED.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};
