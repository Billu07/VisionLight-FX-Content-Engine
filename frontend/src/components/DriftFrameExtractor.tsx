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

  const togglePlay = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  // Pause while scrubbing for precision
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.pause(); // Pause so frame doesn't drift
      setIsPlaying(false);
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const captureFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    try {
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
      console.error("Frame Extraction Error:", e);
      alert(
        "Security Error: The browser blocked frame extraction. \n\nEnsure your Cloudinary settings allow 'Access-Control-Allow-Origin: *'"
      );
    }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full h-full p-2 animate-in fade-in">
      {/* Video Container */}
      <div
        className="bg-black rounded-xl overflow-hidden border border-gray-700 relative group w-full flex-1 min-h-0 flex items-center justify-center mb-4 cursor-pointer"
        onClick={togglePlay} // Click video to toggle play, but no icon overlay
      >
        <canvas ref={canvasRef} className="hidden" />

        <video
          key={videoUrl}
          ref={videoRef}
          src={videoUrl}
          className="w-full h-full object-contain max-h-[60vh]"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={() => {
            setDuration(videoRef.current?.duration || 0);
            setIsReady(true);
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          loop
          playsInline
          crossOrigin="anonymous"
        />

        {/* Removed the big centered Play button Overlay from here */}
      </div>

      {/* Controls Container */}
      <div className="w-full max-w-3xl space-y-4 bg-gray-900/80 p-4 rounded-2xl border border-gray-700">
        {/* Scrubber Row */}
        <div className="flex items-center gap-4">
          {/* ✅ NEW: Dedicated Play/Pause Button on toolbar */}
          <button
            onClick={togglePlay}
            disabled={!isReady}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            {isPlaying ? (
              <span className="text-sm font-bold">⏸</span>
            ) : (
              <span className="text-sm font-bold ml-0.5">▶</span>
            )}
          </button>

          {/* Timeline Slider */}
          <div className="flex-1 space-y-1">
            <div className="flex justify-between text-[10px] text-gray-400 font-mono uppercase tracking-wider">
              <span>Frame: {((currentTime || 0) * 30).toFixed(0)}</span>
              <span>
                {currentTime.toFixed(2)}s / {duration.toFixed(2)}s
              </span>
            </div>
            <input
              type="range"
              min="0"
              max={duration || 100}
              step="0.033" // ~30fps precision
              value={currentTime}
              disabled={!isReady}
              onChange={handleSliderChange}
              className="w-full accent-rose-500 cursor-pointer disabled:opacity-50 h-2 bg-gray-700 rounded-lg appearance-none"
            />
          </div>
        </div>

        {/* Action Buttons Row */}
        <div className="flex gap-3 pt-2 border-t border-gray-700/50">
          <button
            onClick={captureFrame}
            disabled={!isReady}
            className="flex-1 py-3 bg-gradient-to-r from-rose-600 to-orange-600 rounded-xl text-white font-bold hover:shadow-lg hover:from-rose-500 hover:to-orange-500 transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
          >
            <span>📸</span> Extract This Frame
          </button>

          <a
            href={videoUrl}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-xl text-white font-semibold text-center flex items-center justify-center gap-2 text-sm transition-colors"
          >
            <span></span> Download Video
          </a>

          <button
            onClick={onCancel}
            className="px-6 py-3 bg-gray-800 text-gray-400 hover:text-white rounded-xl hover:bg-gray-700 text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
