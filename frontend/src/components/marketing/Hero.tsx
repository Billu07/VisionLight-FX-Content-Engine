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
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 text-white relative overflow-hidden">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl"></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl"></div>
        </div>

        <div className="container mx-auto px-6 py-20 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            {/* Logo & Navigation */}
            <div className="flex justify-between items-center mb-16">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center shadow-lg">
                  <span className="text-white font-bold text-lg">✨</span>
                </div>
                <span className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                  Visionlight AI
                </span>
              </div>
              <button
                onClick={() => setShowLogin(true)}
                className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white rounded-xl font-semibold transition-all duration-300 hover:shadow-2xl hover:scale-105"
              >
                Start Free Demo
              </button>
            </div>

            {/* Main Hero Content */}
            <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
              Imagine Your Creative Studio
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-blue-300">
                — Automated.
              </span>
            </h1>

            <p className="text-xl md:text-2xl text-purple-200 mb-8 leading-relaxed">
              Your branded AI content studio — hosted by Visionlight, powered by
              the world's best creative tools, and built to grow as AI evolves.
            </p>

            <div className="text-lg text-purple-200 mb-12 space-y-2">
              <p>
                🎯 <strong>Plan it.</strong> Create it. Post it.
              </p>
              <p className="text-white font-semibold">
                All from one dashboard.
              </p>
            </div>

            {/* CTA Section */}
            <div className="bg-gray-800/30 backdrop-blur-lg rounded-2xl p-8 mb-12 border border-white/10 hover:border-cyan-400/30 transition-all duration-300">
              <p className="text-purple-300 mb-4">
                No credit card. No contracts. No commitment
              </p>
              <p className="text-white font-semibold mb-6">
                Try it, love it, and upgrade only when you're ready.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <button
                  onClick={() => setShowLogin(true)}
                  className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white px-8 py-4 rounded-xl font-bold text-lg transition-all duration-300 hover:shadow-2xl hover:scale-105 flex items-center gap-3"
                >
                  <span>🚀</span>
                  Start Your Free 7-Day Creative Demo
                </button>
                <button className="border border-white/20 bg-white/5 hover:bg-white/10 text-white px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-300 backdrop-blur-sm flex items-center gap-3">
                  <span>📺</span>
                  Watch Demo Video
                </button>
              </div>
            </div>

            {/* Credits & Limited Offer */}
            <div className="bg-gradient-to-r from-yellow-500 to-amber-500 text-yellow-900 inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold mb-6 shadow-lg">
              <div className="w-2 h-2 bg-yellow-700 rounded-full animate-pulse"></div>
              ⚡ Only 20 free demo builds available this month
            </div>

            <div className="text-purple-300 text-sm space-y-1">
              <p className="flex items-center justify-center gap-2">
                <span>🎥</span>
                Use demo credits to create real videos, images, and graphics
              </p>
              <p className="flex items-center justify-center gap-2">
                <span>💡</span>
                Your logo. Your branding. Your automations.
              </p>
            </div>
          </div>
        </div>

        {/* Floating Elements */}
        <div className="absolute bottom-20 left-10 w-4 h-4 bg-cyan-400 rounded-full opacity-40 animate-float"></div>
        <div className="absolute top-40 right-20 w-6 h-6 bg-purple-400 rounded-full opacity-30 animate-pulse"></div>
        <div className="absolute bottom-40 right-32 w-3 h-3 bg-blue-400 rounded-full opacity-50 animate-ping"></div>
      </div>

      <LoginModal
        isOpen={showLogin}
        onClose={() => setShowLogin(false)}
        onSuccess={handleDemoSuccess}
      />
    </>
  );
};
