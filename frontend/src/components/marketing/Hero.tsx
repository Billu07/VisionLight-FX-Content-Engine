import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LoginModal } from "../LoginModal";

export const Hero = () => {
  const [showLogin, setShowLogin] = useState(false);
  const navigate = useNavigate();

  const handleDemoSuccess = () => {
    navigate("/demo");
  };

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-blue-900 to-purple-900 text-white">
        <div className="container mx-auto px-6 py-20">
          <div className="max-w-4xl mx-auto text-center">
            {/* Logo & Navigation */}
            <div className="flex justify-between items-center mb-16">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-white rounded-lg"></div>
                <span className="text-xl font-bold">Visionlight AI</span>
              </div>
              <button
                onClick={() => setShowLogin(true)}
                className="bg-white text-blue-900 px-6 py-2 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
              >
                Start Free Demo
              </button>
            </div>

            {/* Main Hero Content */}
            <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
              Imagine Your Creative Studio
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-purple-300">
                — Automated.
              </span>
            </h1>

            <p className="text-xl md:text-2xl text-blue-200 mb-8 leading-relaxed">
              Your branded AI content studio — hosted by Visionlight, powered by
              the world's best creative tools, and built to grow as AI evolves.
            </p>

            <div className="text-lg text-blue-200 mb-12 space-y-2">
              <p>
                🎯 <strong>Plan it.</strong> Create it. Post it.
              </p>
              <p className="text-white">All from one dashboard.</p>
            </div>

            {/* CTA Section */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 mb-12 border border-white/20">
              <p className="text-blue-200 mb-4">
                No credit card. No contracts. No commitment
              </p>
              <p className="text-white font-semibold mb-6">
                Try it, love it, and upgrade only when you're ready.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <button
                  onClick={() => setShowLogin(true)}
                  className="bg-white text-blue-900 px-8 py-4 rounded-xl font-bold text-lg hover:bg-gray-100 transition-all transform hover:scale-105"
                >
                  🚀 Start Your Free 7-Day Creative Demo
                </button>
                <button className="border border-white text-white px-8 py-4 rounded-xl font-semibold text-lg hover:bg-white/10 transition-all">
                  📺 Watch Demo Video
                </button>
              </div>
            </div>

            {/* Credits & Limited Offer */}
            <div className="bg-yellow-500 text-yellow-900 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold mb-4">
              ⚡ Only 20 free demo builds available this month
            </div>

            <div className="text-blue-200 text-sm">
              <p>
                🎥 Use demo credits to create real videos, images, and graphics
              </p>
              <p>💡 Your logo. Your branding. Your automations.</p>
            </div>
          </div>
        </div>
      </div>

      <LoginModal
        isOpen={showLogin}
        onClose={() => setShowLogin(false)}
        onSuccess={handleDemoSuccess}
      />
    </>
  );
};
