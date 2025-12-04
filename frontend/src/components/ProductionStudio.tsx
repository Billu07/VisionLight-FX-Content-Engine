import { useState, useEffect } from "react";

interface ProductionStudioProps {
  mediaType: "video" | "image" | "carousel";
  prompt: string;
  isGenerating: boolean;
  progress?: number;
}

export const ProductionStudio: React.FC<ProductionStudioProps> = ({
  mediaType,
  prompt,
  isGenerating,
  progress = 0,
}) => {
  const [currentScene, setCurrentScene] = useState(0);

  const productionScenes: any = {
    video: [
      {
        icon: "🎬",
        title: "SCRIPT BREAKDOWN",
        description: "Analyzing vision...",
        range: [0, 5],
      },
      {
        icon: "🎭",
        title: "CASTING",
        description: "Selecting performers...",
        range: [6, 20],
      },
      {
        icon: "🎥",
        title: "FILMING",
        description: "Generating frames...",
        range: [21, 60],
      },
      {
        icon: "🎞️",
        title: "RENDERING",
        description: "Processing video...",
        range: [61, 90],
      },
      {
        icon: "🎛️",
        title: "FINALIZING",
        description: "Polishing output...",
        range: [91, 100],
      },
    ],
    image: [
      {
        icon: "🖼️",
        title: "CONCEPT",
        description: "Sketching vision...",
        range: [0, 10],
      },
      {
        icon: "🎨",
        title: "COLORING",
        description: "Applying palette...",
        range: [11, 50],
      },
      {
        icon: "✨",
        title: "RENDERING",
        description: "Finalizing pixels...",
        range: [51, 100],
      },
    ],
    carousel: [
      {
        icon: "📝",
        title: "OUTLINING",
        description: "Planning slides...",
        range: [0, 20],
      },
      {
        icon: "🎨",
        title: "DESIGNING",
        description: "Creating visuals...",
        range: [21, 80],
      },
      {
        icon: "✨",
        title: "POLISHING",
        description: "Final touches...",
        range: [81, 100],
      },
    ],
  };

  const scenes = productionScenes[mediaType] || productionScenes["video"];

  useEffect(() => {
    if (!isGenerating) return;
    const idx = scenes.findIndex(
      (s: any) => progress >= s.range[0] && progress <= s.range[1]
    );
    setCurrentScene(idx >= 0 ? idx : scenes.length - 1);
  }, [progress, isGenerating, scenes]);

  if (!isGenerating) return null;

  return (
    <div className="bg-gray-800/80 backdrop-blur-sm rounded-2xl border border-cyan-400/30 p-6 mb-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-3 h-8 bg-gradient-to-b from-cyan-400 to-purple-400 rounded-full"></div>
        <div>
          <h3 className="text-white font-bold text-lg">PRODUCTION STUDIO</h3>
          <p className="text-cyan-400 text-sm truncate max-w-md">"{prompt}"</p>
        </div>
      </div>

      <div className="mb-6">
        <div className="flex justify-between text-sm text-purple-300 mb-2">
          <span>Progress</span>
          <span className="font-bold text-white">{progress}%</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
          <div
            className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      </div>

      <div className="text-center mb-6">
        <div className="text-5xl mb-3 animate-bounce">
          {scenes[currentScene].icon}
        </div>
        <h4 className="text-cyan-400 font-bold text-lg mb-1">
          {scenes[currentScene].title}
        </h4>
        <p className="text-purple-300 text-sm">
          {scenes[currentScene].description}
        </p>
      </div>
    </div>
  );
};
