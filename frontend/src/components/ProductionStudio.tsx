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
        progressRange: [0, 2], // 0-2%: Prompt enhancement
      },
      {
        icon: "🎭",
        title: "CASTING AI ACTORS",
        description: "Selecting digital performers...",
        progressRange: [3, 20], // 3-20%: Early generation
      },
      {
        icon: "🎥",
        title: "SET DESIGN",
        description: "Building virtual environments...",
        progressRange: [21, 40], // 21-40%: Environment creation
      },
      {
        icon: "💡",
        title: "LIGHTING SETUP",
        description: "Setting mood and atmosphere...",
        progressRange: [41, 60], // 41-60%: Lighting and effects
      },
      {
        icon: "🎞️",
        title: "FILMING IN PROGRESS",
        description: "Capturing each frame...",
        progressRange: [61, 80], // 61-80%: Main generation
      },
      {
        icon: "🎛️",
        title: "POST-PRODUCTION",
        description: "Adding final touches...",
        progressRange: [81, 99], // 81-99%: Final processing
      },
    ],
    image: [
      {
        icon: "🖼️",
        title: "CONCEPT ART",
        description: "Sketching your vision...",
        progressRange: [0, 2], // 0-2%: Prompt enhancement
      },
      {
        icon: "🎨",
        title: "COLOR PALETTE",
        description: "Selecting perfect hues...",
        progressRange: [3, 30], // 3-30%: Early generation
      },
      {
        icon: "🖌️",
        title: "DIGITAL PAINTING",
        description: "Brushing in details...",
        progressRange: [31, 60], // 31-60%: Main generation
      },
      {
        icon: "✨",
        title: "LIGHTING EFFECTS",
        description: "Adding depth and mood...",
        progressRange: [61, 85], // 61-85%: Enhancement
      },
      {
        icon: "🔍",
        title: "QUALITY ENHANCEMENT",
        description: "Perfecting every pixel...",
        progressRange: [86, 99], // 86-99%: Final processing
      },
    ],
    carousel: [
      {
        icon: "📱",
        title: "STORYBOARDING",
        description: "Planning your narrative flow...",
        progressRange: [0, 2], // 0-2%: Prompt enhancement
      },
      {
        icon: "🎯",
        title: "SLIDE DESIGN",
        description: "Crafting each frame...",
        progressRange: [3, 40], // 3-40%: Early generation
      },
      {
        icon: "🔄",
        title: "FLOW OPTIMIZATION",
        description: "Ensuring smooth transitions...",
        progressRange: [41, 70], // 41-70%: Main generation
      },
      {
        icon: "🎨",
        title: "VISUAL CONSISTENCY",
        description: "Maintaining brand style...",
        progressRange: [71, 90], // 71-90%: Enhancement
      },
      {
        icon: "📖",
        title: "FINAL REVIEW",
        description: "Polishing the story...",
        progressRange: [91, 99], // 91-99%: Final processing
      },
    ],
  };

  const scenes = productionScenes[mediaType];

  // Calculate current scene based on real progress
  useEffect(() => {
    if (!isGenerating) return;

    // Find the current scene based on progress ranges
    const currentSceneIndex = scenes.findIndex((scene) => {
      const [start, end] = scene.progressRange;
      return progress >= start && progress <= end;
    });

    // If no scene found for current progress, use the last scene
    const calculatedScene =
      currentSceneIndex >= 0 ? currentSceneIndex : scenes.length - 1;
    setCurrentScene(calculatedScene);
  }, [progress, isGenerating, scenes]);

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
              {progress <= 2 && "🔄 Enhancing your prompt..."}
              {progress > 2 &&
                progress < 30 &&
                "🎬 Starting final generation..."}
              {progress >= 30 && progress < 70 && "🎨 Creating your content..."}
              {progress >= 70 && progress < 100 && "✨ Adding final touches..."}
              {progress === 100 && "✅ Generation complete!"}
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
