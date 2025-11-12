import { useState } from "react";

interface WelcomeTourProps {
  onClose: () => void;
}

export const WelcomeTour = ({ onClose }: WelcomeTourProps) => {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      title: "🎉 Welcome to Your AI Content Studio!",
      content:
        "Let's quickly tour your new creative dashboard. You can create, manage, and publish content all in one place.",
      position: "center",
    },
    {
      title: "📊 Track Your Progress",
      content:
        "Monitor your content creation metrics, time saved, and media generated in real-time.",
      position: "top",
    },
    {
      title: "🎬 Use Your Credits Wisely",
      content:
        "You have limited demo credits for each media type. Use them to test different content formats.",
      position: "top",
    },
    {
      title: "🚀 Create Amazing Content",
      content:
        "Start with a prompt, generate AI scripts, then create stunning media with one click.",
      position: "center",
    },
    {
      title: "🎨 Make It Yours",
      content:
        "Customize your dashboard with your branding to see how it would look for your business.",
      position: "bottom",
    },
  ];

  const currentStepData = steps[currentStep];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onClose();
    }
  };

  const handleSkip = () => {
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-auto animate-scale-in">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-2xl mx-auto mb-4">
            {currentStep + 1}
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">
            {currentStepData.title}
          </h3>
          <p className="text-gray-600 leading-relaxed">
            {currentStepData.content}
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`w-2 h-2 rounded-full transition-colors ${
                  index === currentStep ? "bg-blue-600" : "bg-gray-300"
                }`}
              />
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSkip}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium transition-colors"
            >
              Skip Tour
            </button>
            <button
              onClick={handleNext}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
            >
              {currentStep === steps.length - 1 ? "Get Started" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
