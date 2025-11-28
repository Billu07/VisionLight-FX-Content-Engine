import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LoginModal } from "../LoginModal";
import logo from "../../assets/logo.png";

export const Hero = () => {
  const [showLogin, setShowLogin] = useState(false);
  const navigate = useNavigate();

  const handleDemoSuccess = () => {
    navigate("/demo");
  };

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 text-white relative overflow-hidden">
        {/* Enhanced Animated Background Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-20 -right-20 sm:-top-40 sm:-right-40 w-40 h-40 sm:w-80 sm:h-80 bg-cyan-500/10 rounded-full blur-2xl sm:blur-3xl"></div>
          <div className="absolute -bottom-20 -left-20 sm:-bottom-40 sm:-left-40 w-40 h-40 sm:w-80 sm:h-80 bg-purple-500/10 rounded-full blur-2xl sm:blur-3xl"></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-48 h-48 sm:w-96 sm:h-96 bg-blue-500/5 rounded-full blur-2xl sm:blur-3xl"></div>
        </div>

        <div className="container mx-auto px-4 sm:px-6 pt-8 sm:pt-20 pb-6 sm:pb-8 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            {/* Enhanced Logo & Navigation */}
            <div className="flex flex-col sm:flex-row justify-between items-center mb-4 sm:mb-0 gap-4 sm:gap-0">
              <img
                src={logo}
                alt="Visionlight AI Logo"
                className="w-32 h-32 sm:w-56 sm:h-56 object-contain transition-all duration-300 hover:scale-105"
              />
              <button
                onClick={() => setShowLogin(true)}
                className="px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white rounded-xl font-semibold transition-all duration-300 hover:shadow-2xl hover:scale-105 text-sm sm:text-base w-full sm:w-auto"
              >
                Start Free Demo
              </button>
            </div>

            {/* Enhanced Main Hero Content */}
            <h1 className="text-3xl sm:text-5xl md:text-7xl font-bold mb-4 sm:mb-6 leading-tight">
              Imagine Your Creative Studio
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-blue-300 mt-2 sm:mt-0">
                — Automated.
              </span>
            </h1>

            <p className="text-lg sm:text-xl md:text-2xl text-purple-200 mb-6 sm:mb-8 leading-relaxed px-2 sm:px-0">
              Your branded AI content studio — hosted by Visionlight, powered by
              the world's best creative tools, and built to grow as AI evolves.
            </p>

            <div className="text-base sm:text-lg text-purple-200 mb-8 sm:mb-12 space-y-2">
              <p>
                🎯 <strong>Plan it.</strong> Create it. Post it.
              </p>
              <p className="text-white font-semibold">
                All from one dashboard.
              </p>
            </div>

            {/* Enhanced CTA Section */}
            <div className="bg-gray-800/30 backdrop-blur-lg rounded-2xl p-4 sm:p-6 md:p-8 mb-8 sm:mb-12 border border-white/10 hover:border-cyan-400/30 transition-all duration-300">
              <p className="text-purple-300 mb-3 sm:mb-4 text-sm sm:text-base">
                No credit card. No contracts. No commitment
              </p>
              <p className="text-white font-semibold mb-4 sm:mb-6 text-base sm:text-lg">
                Try it, love it, and upgrade only when you're ready.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center">
                <button
                  onClick={() => setShowLogin(true)}
                  className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white px-4 sm:px-6 md:px-8 py-3 sm:py-4 rounded-xl font-bold text-base sm:text-lg transition-all duration-300 hover:shadow-2xl hover:scale-105 flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-center"
                >
                  <span>🚀</span>
                  Start Your Free 7-Day Creative Demo
                </button>
                <button className="border border-white/20 bg-white/5 hover:bg-white/10 text-white px-4 sm:px-6 md:px-8 py-3 sm:py-4 rounded-xl font-semibold text-base sm:text-lg transition-all duration-300 backdrop-blur-sm flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-center">
                  <span>📺</span>
                  Watch Demo Video
                </button>
              </div>
            </div>

            {/* Enhanced Credits & Limited Offer */}
            <div className="bg-gradient-to-r from-yellow-500 to-amber-500 text-yellow-900 inline-flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 rounded-full text-xs sm:text-sm font-semibold mb-4 sm:mb-6 shadow-lg max-w-sm sm:max-w-none mx-auto">
              <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-yellow-700 rounded-full animate-pulse"></div>
              ⚡ Only 20 free demo builds available this month
            </div>

            {/* Enhanced Feature Points */}
            <div className="text-purple-300 text-xs sm:text-sm space-y-1 px-2 sm:px-0">
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

        {/* Enhanced Floating Elements */}
        <div className="absolute bottom-10 sm:bottom-20 left-4 sm:left-10 w-3 h-3 sm:w-4 sm:h-4 bg-cyan-400 rounded-full opacity-40 animate-float"></div>
        <div className="absolute top-20 sm:top-40 right-8 sm:right-20 w-4 h-4 sm:w-6 sm:h-6 bg-purple-400 rounded-full opacity-30 animate-pulse"></div>
        <div className="absolute bottom-20 sm:bottom-40 right-12 sm:right-32 w-2 h-2 sm:w-3 sm:h-3 bg-blue-400 rounded-full opacity-50 animate-ping"></div>

        {/* Additional Mobile-Only Floating Elements */}
        <div className="sm:hidden absolute top-1/4 left-6 w-2 h-2 bg-cyan-300 rounded-full opacity-40 animate-bounce"></div>
        <div className="sm:hidden absolute bottom-1/3 right-8 w-2 h-2 bg-purple-300 rounded-full opacity-30 animate-pulse"></div>
      </div>

      <LoginModal
        isOpen={showLogin}
        onClose={() => setShowLogin(false)}
        onSuccess={handleDemoSuccess}
      />
    </>
  );
};
