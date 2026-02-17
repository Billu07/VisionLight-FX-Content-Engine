import { useState, useRef, useEffect } from "react";

export interface SequenceItem {
  id: string;
  url: string;
  type: "IMAGE" | "VIDEO" | "CAROUSEL";
  title?: string;
  duration?: number; // For images, default 3s
}

interface SequenceEditorProps {
  sequence: SequenceItem[];
  setSequence: React.Dispatch<React.SetStateAction<SequenceItem[]>>;
  onAddFromLibrary: () => void;
  onClear: () => void;
}

export function SequenceEditor({
  sequence,
  setSequence,
  onAddFromLibrary,
  onClear,
}: SequenceEditorProps) {
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentItem = playingIndex !== null ? sequence[playingIndex] : sequence[0];

  // Stop playback if sequence is empty
  useEffect(() => {
    if (sequence.length === 0) {
      setPlayingIndex(null);
      setIsPlaying(false);
    } else if (playingIndex === null && sequence.length > 0) {
      setPlayingIndex(0); // Ready to play first
    }
  }, [sequence.length]);

  // Handle Playback Logic
  useEffect(() => {
    if (!isPlaying || !currentItem) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    // Reset progress
    setProgress(0);

    if (currentItem.type === "VIDEO") {
      // Handled by onEnded and onTimeUpdate of <video>
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play().catch(e => console.error("Play error", e));
      }
    } else {
      // Image/Carousel: Use Timer
      const duration = currentItem.duration || 3000;
      const startTime = Date.now();
      
      const updateProgress = () => {
        const elapsed = Date.now() - startTime;
        const pct = Math.min(100, (elapsed / duration) * 100);
        setProgress(pct);
        
        if (elapsed < duration) {
          timerRef.current = setTimeout(updateProgress, 50);
        } else {
           handleNext();
        }
      };
      
      timerRef.current = setTimeout(updateProgress, 50);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [playingIndex, isPlaying]); // Re-run when index changes

  const handleNext = () => {
    if (playingIndex === null) return;
    if (playingIndex < sequence.length - 1) {
      setPlayingIndex(playingIndex + 1);
    } else {
      setIsPlaying(false);
      setPlayingIndex(0); // Reset to start
    }
  };

  const togglePlay = () => {
    if (sequence.length === 0) return;
    setIsPlaying(!isPlaying);
  };

  const removeItem = (index: number) => {
    const newSeq = [...sequence];
    newSeq.splice(index, 1);
    setSequence(newSeq);
    if (playingIndex === index) {
      setIsPlaying(false);
      setPlayingIndex(0);
    } else if (playingIndex !== null && playingIndex > index) {
      setPlayingIndex(playingIndex - 1);
    }
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    if (index + direction < 0 || index + direction >= sequence.length) return;
    const newSeq = [...sequence];
    const temp = newSeq[index];
    newSeq[index] = newSeq[index + direction];
    newSeq[index + direction] = temp;
    setSequence(newSeq);
    
    // Update playing index if we moved the currently playing item
    if (playingIndex === index) {
        setPlayingIndex(index + direction);
    } else if (playingIndex === index + direction) {
        setPlayingIndex(index);
    }
  };

  const updateDuration = (index: number, newDuration: number) => {
    const newSeq = [...sequence];
    newSeq[index].duration = newDuration;
    setSequence(newSeq);
  };

  return (
    <div className="bg-gray-900/50 rounded-3xl border border-white/10 p-6 shadow-2xl animate-in fade-in">
      <div className="flex flex-col lg:flex-row gap-6">
        
        {/* LEFT: PREVIEW PLAYER */}
        <div className="flex-1 flex flex-col gap-4">
          <div className="relative aspect-video bg-black rounded-xl border border-white/10 overflow-hidden flex items-center justify-center shadow-lg group">
             {sequence.length === 0 ? (
                <div className="text-center text-gray-500">
                    <span className="text-4xl block mb-2">🎬</span>
                    <p>Add items to start preview</p>
                </div>
             ) : (
                <>
                    {currentItem?.type === "VIDEO" ? (
                        <video
                            ref={videoRef}
                            src={currentItem.url}
                            className="w-full h-full object-contain"
                            onEnded={handleNext}
                            onTimeUpdate={(e) => {
                                if(e.currentTarget.duration) {
                                    setProgress((e.currentTarget.currentTime / e.currentTarget.duration) * 100);
                                }
                            }}
                            controls={false} // Custom controls
                            muted={false} // Allow audio
                        />
                    ) : (
                        <img 
                            src={currentItem?.url}
                            className="w-full h-full object-contain animate-in fade-in duration-500"
                        />
                    )}

                    {/* OVERLAY PLAY BUTTON */}
                    {!isPlaying && (
                        <button 
                            onClick={togglePlay}
                            className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/20 transition-all z-10"
                        >
                            <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-[0_0_30px_rgba(255,255,255,0.2)] group-hover:scale-110 transition-transform">
                                <span className="text-4xl text-white ml-2">▶</span>
                            </div>
                        </button>
                    )}

                    {/* PROGRESS BAR */}
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-800">
                        <div 
                            className="h-full bg-cyan-500 transition-all duration-100 ease-linear"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </>
             )}
          </div>

          {/* CONTROLS */}
          <div className="flex justify-between items-center bg-gray-800/50 p-4 rounded-xl border border-white/5">
             <div className="flex items-center gap-3">
                <button 
                    onClick={togglePlay}
                    disabled={sequence.length === 0}
                    className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                    {isPlaying ? "⏸" : "▶"}
                </button>
                <div className="text-sm text-gray-400 font-mono">
                    {currentItem ? (
                        <>
                            <span className="text-white font-bold">{playingIndex! + 1}</span>
                            <span className="mx-1">/</span>
                            <span>{sequence.length}</span>
                        </>
                    ) : "-- / --"}
                </div>
                <div className="text-sm text-gray-400 truncate max-w-[200px]">
                    {currentItem?.title || "Untitled"}
                </div>
             </div>

             <div className="flex gap-2">
                 <button 
                    onClick={onClear}
                    className="px-4 py-2 bg-red-900/20 text-red-300 rounded-lg hover:bg-red-900/40 text-xs font-bold uppercase transition-colors"
                 >
                    Clear All
                 </button>
                 {/* FUTURE: EXPORT BUTTON */}
                 <button 
                    disabled={true}
                    className="px-4 py-2 bg-gray-700 text-gray-500 rounded-lg cursor-not-allowed text-xs font-bold uppercase"
                    title="Export coming soon"
                 >
                    Export Video
                 </button>
             </div>
          </div>
        </div>

        {/* RIGHT: PLAYLIST */}
        <div className="w-full lg:w-80 flex flex-col gap-4">
            <div className="flex justify-between items-center">
                <h3 className="text-white font-bold">Timeline Sequence</h3>
                <button 
                    onClick={onAddFromLibrary}
                    className="text-xs px-3 py-1.5 bg-cyan-600/20 text-cyan-300 border border-cyan-500/30 rounded-lg hover:bg-cyan-600/30 transition-colors font-bold flex items-center gap-2"
                >
                    <span>+</span> Add Media
                </button>
            </div>

            <div className="flex-1 bg-gray-800/30 rounded-xl border border-white/5 overflow-y-auto max-h-[500px] custom-scrollbar p-2 space-y-2">
                {sequence.map((item, idx) => (
                    <div 
                        key={`${item.id}-${idx}`}
                        className={`group flex items-center gap-3 p-2 rounded-lg border transition-all ${
                            playingIndex === idx 
                            ? "bg-cyan-900/20 border-cyan-500/50" 
                            : "bg-gray-800/40 border-white/5 hover:border-white/20"
                        }`}
                    >
                        <div 
                            className="w-6 text-center text-xs text-gray-500 font-mono cursor-pointer"
                            onClick={() => {
                                setPlayingIndex(idx);
                                setIsPlaying(true);
                            }}
                        >
                            {idx + 1}
                        </div>
                        
                        <div 
                            className="w-16 h-12 bg-black rounded border border-white/10 overflow-hidden relative flex-shrink-0 cursor-pointer"
                            onClick={() => {
                                setPlayingIndex(idx);
                                setIsPlaying(true);
                            }}
                        >
                            {item.type === "VIDEO" ? (
                                <video src={item.url} className="w-full h-full object-cover opacity-80" muted />
                            ) : (
                                <img src={item.url} className="w-full h-full object-cover" />
                            )}
                        </div>

                        <div className="flex-1 min-w-0">
                            <p className="text-xs text-white font-medium truncate">{item.title || "Untitled"}</p>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] text-gray-500 uppercase">{item.type}</span>
                                {item.type !== "VIDEO" && (
                                    <div className="flex items-center gap-1">
                                        <span className="text-[10px] text-gray-500">Duration:</span>
                                        <input 
                                            type="number" 
                                            min={1} 
                                            max={60}
                                            value={(item.duration || 3000) / 1000}
                                            onChange={(e) => updateDuration(idx, parseFloat(e.target.value) * 1000)}
                                            className="w-8 p-0 bg-transparent text-[10px] text-cyan-400 border-none focus:ring-0 text-center font-bold"
                                        />
                                        <span className="text-[10px] text-gray-500">s</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => moveItem(idx, -1)} className="text-[10px] text-gray-400 hover:text-white disabled:opacity-30" disabled={idx === 0}>▲</button>
                            <button onClick={() => moveItem(idx, 1)} className="text-[10px] text-gray-400 hover:text-white disabled:opacity-30" disabled={idx === sequence.length - 1}>▼</button>
                        </div>
                        
                        <button 
                            onClick={() => removeItem(idx)}
                            className="text-gray-500 hover:text-red-400 transition-colors px-1"
                        >
                            ✕
                        </button>
                    </div>
                ))}

                {sequence.length === 0 && (
                    <div className="text-center py-10 text-gray-600 text-xs">
                        Drag & Drop is not supported yet.<br/>Use "Add Media" or Timeline.
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
}
