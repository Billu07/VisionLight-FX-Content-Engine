import { useState, useRef, useEffect } from "react";

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
  const [hasMetadata, setHasMetadata] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const directVideoUrl = videoUrl;
  const controlsReady = hasMetadata && duration > 0;

  useEffect(() => {
    setHasMetadata(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [directVideoUrl]);

  // Sync slider with video time
  const handleTimeUpdate = () => {
    if (!isScrubbing && videoRef.current) setCurrentTime(videoRef.current.currentTime);
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

  const handleDownloadVideo = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    try {
      const response = await fetch(videoUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = "drift_video.mp4";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download video", err);
      // Fallback
      window.open(videoUrl, "_blank");
    }
  };

  // Pause while scrubbing for precision
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const seekToTime = async (video: HTMLVideoElement, time: number) => {
    const target = Math.max(
      0,
      Math.min(time, Number.isFinite(video.duration) ? video.duration : time),
    );
    const needsSeek = Math.abs(video.currentTime - target) > 0.02;
    if (needsSeek) {
      await new Promise<void>((resolve) => {
        const handleSeeked = () => resolve();
        video.addEventListener("seeked", handleSeeked, { once: true });
        video.currentTime = target;
      });
    } else {
      video.currentTime = target;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  };

  const waitForRenderableFrame = async (video: HTMLVideoElement) => {
    if ("requestVideoFrameCallback" in video) {
      await new Promise<void>((resolve) => {
        (video as any).requestVideoFrameCallback(() => resolve());
      });
      return;
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  };

  const captureVideoToBlob = async (
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
  ) => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context unavailable");

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.95),
    );
    if (!blob) throw new Error("Canvas extraction failed (Empty Blob).");
    return blob;
  };

  const extractAtTime = async (time: number, restoreAfterCapture: boolean) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    try {
      if (video.readyState < 2) {
        alert("Video is still loading, please wait a moment.");
        return;
      }

      setIsExtracting(true);
      const wasPlaying = !video.paused;
      const originalTime = video.currentTime;
      video.pause();

      await seekToTime(video, time);
      await waitForRenderableFrame(video);
      setCurrentTime(video.currentTime);

      const blob = await captureVideoToBlob(video, canvas);
      await onExtract(blob);

      if (restoreAfterCapture) {
        await seekToTime(video, originalTime);
        setCurrentTime(video.currentTime);
      }

      if (wasPlaying) {
        void video.play();
      }
    } catch (e: any) {
      console.error("Frame Extraction Error:", e);
      alert(
        "Security Error: The browser blocked frame extraction. \n\nEnsure your Cloudinary settings allow 'Access-Control-Allow-Origin: *'"
      );
    } finally {
      setIsExtracting(false);
    }
  };

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video) return;
    void extractAtTime(video.currentTime, false);
  };

  const extractSpecificFrame = (time: number) => {
    void extractAtTime(time, true);
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
          key={directVideoUrl}
          ref={videoRef}
          src={directVideoUrl}
          className="w-full h-full object-contain max-h-[60vh]"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={() => {
            setDuration(videoRef.current?.duration || 0);
            setHasMetadata(true);
          }}
          onSeeked={() => {
            if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          loop
          playsInline
          preload="metadata"
          crossOrigin="anonymous"
        />
        {!controlsReady && (
          <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-black/55 border border-white/10 text-[10px] tracking-wider text-gray-300 pointer-events-none">
            Loading metadata...
          </div>
        )}
      </div>

      {/* Controls Container */}
      <div className="w-full max-w-3xl space-y-4 bg-gray-900/80 p-4 rounded-2xl border border-gray-700">
        
        <div className="flex flex-wrap gap-2 justify-center pb-2 border-b border-gray-700/50">
          <button 
            onClick={() => extractSpecificFrame(0)}
            disabled={!controlsReady || isExtracting}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xs font-bold transition-all border border-white/5 disabled:opacity-50"
          >
            Capture Start Frame
          </button>
          <button 
            onClick={() => extractSpecificFrame(duration)}
            disabled={!controlsReady || isExtracting}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xs font-bold transition-all border border-white/5 disabled:opacity-50"
          >
            Capture End Frame
          </button>
        </div>

        {/* Scrubber Row */}
        <div className="flex items-center gap-4">
          {/* Dedicated Play/Pause Button on toolbar */}
          <button
            onClick={togglePlay}
            disabled={!controlsReady}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            {isPlaying ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
            ) : (
              <svg className="ml-0.5" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>
            )}
          </button>

          {/* Timeline Slider */}
          <div className="flex-1 space-y-1">
            <div className="flex justify-between text-[10px] text-gray-400 font-mono uppercase tracking-wider">
              <span>Frame: {((currentTime || 0) * 30).toFixed(0)}</span>
              <span>
                {(currentTime || 0).toFixed(2)}s / {(duration || 0).toFixed(2)}s
              </span>
            </div>
            <input
              type="range"
              min="0"
              max={duration || 100}
              step="0.033" // ~30fps precision
              value={currentTime}
              disabled={!controlsReady}
              onChange={handleSliderChange}
              onInput={(e) =>
                handleSliderChange(e as React.ChangeEvent<HTMLInputElement>)
              }
              onPointerDown={() => setIsScrubbing(true)}
              onPointerUp={() => setIsScrubbing(false)}
              className="w-full accent-rose-500 cursor-pointer disabled:opacity-50 h-2 bg-gray-700 rounded-lg"
            />
          </div>
        </div>

        {/* Action Buttons Row */}
        <div className="flex gap-3 pt-2 border-t border-gray-700/50">
          <button
            onClick={captureFrame}
            disabled={!controlsReady || isExtracting}
            className="flex-1 py-3 bg-gradient-to-r from-rose-600 to-orange-600 rounded-xl text-white font-bold hover:shadow-lg hover:from-rose-500 hover:to-orange-500 transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
          >
            {isExtracting ? "Capturing..." : "Capture 3DX Frame"}
          </button>

          <a
            href={videoUrl}
            onClick={handleDownloadVideo}
            className="px-6 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-xl text-white font-semibold text-center flex items-center justify-center gap-2 text-sm transition-colors cursor-pointer"
          >
            Download Video
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
