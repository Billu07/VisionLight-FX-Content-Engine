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
  const [isReady, setIsReady] = useState(false);

  // Sync slider with video time
  const handleTimeUpdate = () => {
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
  };

  // ✅ IMPROVEMENT 1: Pause while scrubbing for precision
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.pause(); // Pause so frame doesn't drift
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const captureFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    try {
      // ✅ IMPROVEMENT 2: Check if video data is actually loaded
      if (video.readyState < 2) {
        alert("Video is still loading, please wait a moment.");
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Draw current video frame to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert to Blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            onExtract(blob);
          } else {
            throw new Error("Canvas extraction failed (Empty Blob).");
          }
        },
        "image/jpeg",
        0.95
      );
    } catch (e: any) {
      // ✅ IMPROVEMENT 3: Catch CORS "Tainted Canvas" errors explicitly
      console.error("Frame Extraction Error:", e);
      alert(
        "Security Error: The browser blocked frame extraction. \n\nEnsure your Cloudinary settings allow 'Access-Control-Allow-Origin: *'"
      );
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in">
      <div className="bg-black rounded-xl overflow-hidden border border-gray-700 relative group">
        {/* Hidden Canvas for Extraction */}
        <canvas ref={canvasRef} className="hidden" />

        {/* ✅ IMPROVEMENT 4: Add key to force reload if URL changes */}
        <video
          key={videoUrl}
          ref={videoRef}
          src={videoUrl}
          className="w-full max-h-[50vh] object-contain bg-black"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={() => {
            setDuration(videoRef.current?.duration || 0);
            setIsReady(true);
          }}
          // ✅ IMPROVEMENT 5: Sync state with actual video events
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          loop
          playsInline
          crossOrigin="anonymous" // CRITICAL
        />

        {/* Play/Pause Overlay */}
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/10 hover:bg-black/30 transition-colors cursor-pointer"
          onClick={() => {
            if (videoRef.current?.paused) {
              videoRef.current.play();
            } else {
              videoRef.current?.pause();
            }
          }}
        >
          {!isPlaying && (
            <div className="bg-black/50 rounded-full p-4 backdrop-blur-sm border border-white/20">
              <span className="text-4xl text-white ml-1">▶</span>
            </div>
          )}
        </div>
      </div>

      {/* Scrubber Controls */}
      <div className="space-y-2 px-2">
        <div className="flex justify-between text-xs text-gray-400 font-mono">
          <span>Frame: {((currentTime || 0) * 30).toFixed(0)}</span>
          <span>
            {currentTime.toFixed(2)}s / {duration.toFixed(2)}s
          </span>
        </div>
        <input
          type="range"
          min="0"
          max={duration || 100} // Prevent NaN
          step="0.033" // 30fps
          value={currentTime}
          disabled={!isReady}
          onChange={handleSliderChange}
          className="w-full accent-rose-500 cursor-pointer disabled:opacity-50"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={captureFrame}
          disabled={!isReady}
          className="flex-1 py-3 bg-gradient-to-r from-rose-600 to-orange-600 rounded-xl text-white font-bold hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
          rel="noopener noreferrer"
          className="text-xs text-gray-500 hover:text-white underline"
        >
          Download Full Video Path
        </a>
      </div>
    </div>
  );
}
