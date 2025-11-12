import { Hero } from "../components/marketing/Hero";
import { WhyVisionlight } from "../components/marketing/WhyVisionlight";
import { Features } from "../components/marketing/Features";
import { Pricing } from "../components/marketing/Pricing";
import { Testimonials } from "../components/marketing/Testimonials";
import { FAQ } from "../components/marketing/FAQ";

export const MarketingSite = () => {
  return (
    <div className="bg-white">
      <Hero />
      <WhyVisionlight />
      <Features />
      <Pricing />
      <Testimonials />
      <FAQ />

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-6 text-center">
          <p>© 2024 Visionlight AI. All rights reserved.</p>
          <div className="flex justify-center gap-6 mt-4 text-sm text-gray-400">
            <a href="#" className="hover:text-white">
              Terms
            </a>
            <a href="#" className="hover:text-white">
              Privacy
            </a>
            <a href="#" className="hover:text-white">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};
