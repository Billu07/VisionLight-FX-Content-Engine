// frontend/src/components/ProductionStudio.tsx
import { useState, useEffect } from "react";
import { LoadingSpinner } from "./LoadingSpinner";

interface ProductionStudioProps {
  mediaType: "video" | "image" | "carousel";
  prompt: string;
  isGenerating: boolean;
  progress?: number; // Added progress prop
}

export const ProductionStudio: React.FC<ProductionStudioProps> = ({
  mediaType,
  prompt,
  isGenerating,
  progress = 0, // Default progress to 0
}) => {
  const [currentScene, setCurrentScene] = useState(0);

  const productionScenes = {
    video: [
      {
        icon: "🎬",
        title: "SCRIPT BREAKDOWN",
        description: "Analyzing your cinematic vision...",
      },
      {
        icon: "🎭",
        title: "CASTING AI ACTORS",
        description: "Selecting digital performers...",
      },
      {
        icon: "🎥",
        title: "SET DESIGN",
        description: "Building virtual environments...",
      },
      {
        icon: "💡",
        title: "LIGHTING SETUP",
        description: "Setting mood and atmosphere...",
      },
      {
        icon: "🎞️",
        title: "FILMING IN PROGRESS",
        description: "Capturing each frame...",
      },
      {
        icon: "🎛️",
        title: "POST-PRODUCTION",
        description: "Adding final touches...",
      },
    ],
    image: [
      {
        icon: "🖼️",
        title: "CONCEPT ART",
        description: "Sketching your vision...",
      },
      {
        icon: "🎨",
        title: "COLOR PALETTE",
        description: "Selecting perfect hues...",
      },
      {
        icon: "🖌️",
        title: "DIGITAL PAINTING",
        description: "Brushing in details...",
      },
      {
        icon: "✨",
        title: "LIGHTING EFFECTS",
        description: "Adding depth and mood...",
      },
      {
        icon: "🔍",
        title: "QUALITY ENHANCEMENT",
        description: "Perfecting every pixel...",
      },
    ],
    carousel: [
      {
        icon: "📱",
        title: "STORYBOARDING",
        description: "Planning your narrative flow...",
      },
      {
        icon: "🎯",
        title: "SLIDE DESIGN",
        description: "Crafting each frame...",
      },
      {
        icon: "🔄",
        title: "FLOW OPTIMIZATION",
        description: "Ensuring smooth transitions...",
      },
      {
        icon: "🎨",
        title: "VISUAL CONSISTENCY",
        description: "Maintaining brand style...",
      },
      {
        icon: "📖",
        title: "FINAL REVIEW",
        description: "Polishing the story...",
      },
    ],
  };

  const scenes = productionScenes[mediaType];

  // Calculate current scene based on real progress
  useEffect(() => {
    if (!isGenerating) return;

    // Map progress to scenes (0-100% maps to scene indices)
    const progressPerScene = 100 / scenes.length;
    const calculatedScene = Math.min(
      Math.floor(progress / progressPerScene),
      scenes.length - 1
    );

    setCurrentScene(calculatedScene);
  }, [progress, isGenerating, scenes.length]);

  if (!isGenerating) return null;

  return (
    <div className="bg-gray-800/80 backdrop-blur-sm rounded-2xl border border-cyan-400/30 p-6 mb-6">
      {/* Studio Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-3 h-8 bg-gradient-to-b from-cyan-400 to-purple-400 rounded-full"></div>
        <div>
          <h3 className="text-white font-bold text-lg">AI PRODUCTION STUDIO</h3>
          <p className="text-cyan-400 text-sm">
            Creating: "{prompt.substring(0, 50)}
            {prompt.length > 50 ? "..." : ""}"
          </p>
        </div>
      </div>

      {/* Real Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between text-sm text-purple-300 mb-2">
          <span>Generation Progress</span>
          <span>{progress}%</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-3">
          <div
            className="bg-gradient-to-r from-cyan-500 to-blue-500 h-3 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      </div>

      {/* Current Scene */}
      <div className="text-center mb-6">
        <div className="text-5xl mb-3 animate-pulse">
          {scenes[currentScene].icon}
        </div>
        <h4 className="text-cyan-400 font-bold text-lg mb-2">
          {scenes[currentScene].title}
        </h4>
        <p className="text-purple-300">{scenes[currentScene].description}</p>
      </div>

      {/* Progress Indicator */}
      <div className="flex justify-center items-center gap-2 mb-4">
        {scenes.map((_, index) => (
          <div
            key={index}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              index === currentScene
                ? "bg-cyan-400 w-6"
                : index < currentScene
                ? "bg-green-400"
                : "bg-gray-600"
            }`}
          />
        ))}
      </div>

      {/* Studio Status */}
      <div className="bg-gray-900/50 rounded-lg p-4 border border-purple-500/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LoadingSpinner size="sm" variant="neon" />
            <span className="text-purple-300 text-sm">
              {progress < 30 && "Initializing generation..."}
              {progress >= 30 && progress < 70 && "Creating your content..."}
              {progress >= 70 && progress < 100 && "Adding final touches..."}
              {progress === 100 && "Generation complete!"}
            </span>
          </div>
          <div className="text-cyan-400 text-sm font-mono">
            SCENE {currentScene + 1}/{scenes.length}
          </div>
        </div>
      </div>
    </div>
  );
};
