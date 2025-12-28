import { useState, useRef } from "react";

interface DriftFrameExtractorProps {
  videoUrl: string;
  onExtract: (blob: Blob) => void;
  onCancel: () => void;
}

export function DriftFrameExtractor({
  videoUrl,
  onExtract,
  onCancel,
}: DriftFrameExtractorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Sync slider with video time
  const handleTimeUpdate = () => {
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const captureFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Draw current video frame to canvas
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to Blob and send back
    canvas.toBlob(
      (blob) => {
        if (blob) onExtract(blob);
      },
      "image/jpeg",
      0.95
    );
  };

  return (
    <div className="space-y-4 animate-in fade-in">
      <div className="bg-black rounded-xl overflow-hidden border border-gray-700 relative group">
        {/* Hidden Canvas for Extraction */}
        <canvas ref={canvasRef} className="hidden" />

        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full max-h-[50vh] object-contain"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
          loop
          crossOrigin="anonymous" // CRITICAL for canvas extraction
        />

        {/* Play/Pause Overlay */}
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/10 hover:bg-black/30 transition-colors cursor-pointer"
          onClick={() => {
            if (videoRef.current?.paused) {
              videoRef.current.play();
              setIsPlaying(true);
            } else {
              videoRef.current?.pause();
              setIsPlaying(false);
            }
          }}
        >
          {!isPlaying && (
            <span className="text-4xl text-white opacity-80">▶</span>
          )}
        </div>
      </div>

      {/* Scrubber Controls */}
      <div className="space-y-2 px-2">
        <div className="flex justify-between text-xs text-gray-400 font-mono">
          <span>Frame: {(currentTime * 30).toFixed(0)}</span>
          <span>
            {currentTime.toFixed(2)}s / {duration.toFixed(2)}s
          </span>
        </div>
        <input
          type="range"
          min="0"
          max={duration}
          step="0.03" // Approx 1 frame at 30fps
          value={currentTime}
          onChange={handleSliderChange}
          className="w-full accent-rose-500 cursor-pointer"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={captureFrame}
          className="flex-1 py-3 bg-gradient-to-r from-rose-600 to-orange-600 rounded-xl text-white font-bold hover:shadow-lg transition-all flex items-center justify-center gap-2"
        >
          <span>📸</span> Extract This Frame
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-3 bg-gray-800 text-gray-400 rounded-xl hover:bg-gray-700"
        >
          Back
        </button>
      </div>

      <div className="text-center">
        <a
          href={videoUrl}
          target="_blank"
          download
          className="text-xs text-gray-500 hover:text-white underline"
        >
          Download Full Video Path
        </a>
      </div>
    </div>
  );
}
