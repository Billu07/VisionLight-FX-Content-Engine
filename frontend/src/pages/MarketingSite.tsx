import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Hero } from "../components/marketing/Hero";
import { getSiteBrand } from "../lib/branding";

export const MarketingSite = () => {
  const siteBrand = useMemo(() => getSiteBrand(), []);
  const studioLabel = siteBrand === "visualfx" ? "VisualFX Studio" : "PicDrift Studio";

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900 to-violet-900">
      <Hero />

      <footer className="bg-gray-900 py-12">
        <div className="container mx-auto px-6">
          <div className="text-center">
            <h3 className="mb-4 bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-2xl font-bold text-transparent">
              {studioLabel}
            </h3>
            <p className="mx-auto mb-6 max-w-md text-purple-300">
              Transform your content creation with AI-powered image, and video generation.
            </p>
            <div className="mb-6 flex justify-center gap-6">
              <Link
                to="/terms"
                className="text-purple-400 transition-colors hover:text-cyan-400"
              >
                Terms
              </Link>

              <Link
                to="/privacy"
                className="text-purple-400 transition-colors hover:text-cyan-400"
              >
                Privacy
              </Link>

              <a
                href="https://www.picdrift.com/contact"
                className="text-purple-400 transition-colors hover:text-cyan-400"
              >
                Contact
              </a>
            </div>
            <p className="text-sm text-purple-400">
              {"\u00A9"} 2026 {studioLabel} | ALL RIGHTS RESERVED.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};
