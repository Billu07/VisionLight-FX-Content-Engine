import React, { useState, useRef, useEffect, useMemo } from "react";

export interface SequenceItem {
  id: string;
  url: string;
  type: "IMAGE" | "VIDEO" | "CAROUSEL";
  title?: string;
  duration?: number; // In milliseconds
}

interface FullscreenVideoEditorProps {
  sequence: SequenceItem[];
  setSequence: React.Dispatch<React.SetStateAction<SequenceItem[]>>;
  onClose: () => void;
  onAddFromLibrary: () => void;
  onClear: () => void;
}

export function FullscreenVideoEditor({
  sequence,
  setSequence,
  onClose,
  onAddFromLibrary,
  onClear,
}: FullscreenVideoEditorProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0); // Global time in ms
  const [zoom, setZoom] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);

  // Calculate total duration
  const totalDuration = useMemo(() => {
    return sequence.reduce((acc, item) => acc + (item.duration || 3000), 0);
  }, [sequence]);

  // Find current item and local time
  const { currentItem, localTime, itemStartIndex } = useMemo(() => {
    if (sequence.length === 0) {
      return { currentItem: null, localTime: 0, itemStartIndex: -1 };
    }
    let accumulated = 0;
    for (let i = 0; i < sequence.length; i++) {
      const item = sequence[i];
      const duration = item.duration || 3000;
      if (currentTime >= accumulated && currentTime < accumulated + duration) {
        return { 
          currentItem: item, 
          localTime: currentTime - accumulated,
          itemStartIndex: i
        };
      }
      accumulated += duration;
    }
    // Fallback to last item if at the very end
    return { 
      currentItem: sequence[sequence.length - 1], 
      localTime: sequence[sequence.length - 1]?.duration || 0,
      itemStartIndex: sequence.length - 1
    };
  }, [sequence, currentTime]);

  // Sync Video Element
  useEffect(() => {
    if (currentItem?.type === "VIDEO" && videoRef.current) {
        // Only update if drift is significant to avoid stutter
        const videoTime = localTime / 1000;
        if (Math.abs(videoRef.current.currentTime - videoTime) > 0.1) {
            videoRef.current.currentTime = videoTime;
        }
        if (isPlaying) {
            videoRef.current.play().catch(() => {});
        } else {
            videoRef.current.pause();
        }
    }
  }, [currentItem, isPlaying]);

  // Playback Loop
  useEffect(() => {
    if (isPlaying) {
      const startTimestamp = performance.now() - currentTime;
      const animate = (now: number) => {
        const newTime = now - startTimestamp;
        if (newTime >= totalDuration) {
          setCurrentTime(0);
          setIsPlaying(false);
        } else {
          setCurrentTime(newTime);
          animationRef.current = requestAnimationFrame(animate);
        }
      };
      animationRef.current = requestAnimationFrame(animate);
    } else {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    }
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, totalDuration]);

  const handleTogglePlay = () => {
    if (sequence.length === 0) return;
    if (currentTime >= totalDuration) setCurrentTime(0);
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (time: number) => {
    setCurrentTime(Math.max(0, Math.min(time, totalDuration)));
  };

  const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = moveEvent.clientX - rect.left;
      const clickedTime = (x / rect.width) * totalDuration;
      handleSeek(clickedTime);
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    
    // Also trigger for the initial click
    if (timelineRef.current) {
      const rect = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const clickedTime = (x / rect.width) * totalDuration;
      handleSeek(clickedTime);
    }
  };

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const centiseconds = Math.floor((ms % 1000) / 10);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
  };

  const removeItem = (id: string) => {
    setSequence(prev => prev.filter(item => item.id !== id));
  };

  const moveItem = (index: number, direction: number) => {
    const newSeq = [...sequence];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sequence.length) return;
    [newSeq[index], newSeq[targetIndex]] = [newSeq[targetIndex], newSeq[index]];
    setSequence(newSeq);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#0f0f0f] text-gray-200 flex flex-col font-sans select-none overflow-hidden animate-in fade-in zoom-in-95 duration-300">
      
      {/* HEADER */}
      <div className="h-14 bg-[#1a1a1a] border-b border-white/5 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
            title="Exit Editor"
          >
            <span className="text-xl">✕</span>
          </button>
          <div className="h-6 w-[1px] bg-white/10 mx-2"></div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-wide uppercase">Sequence Merger PRO</h1>
            <p className="text-[10px] text-gray-500 font-mono">{formatTime(currentTime)} / {formatTime(totalDuration)}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={onClear}
            className="px-4 py-1.5 rounded-lg text-xs font-bold text-gray-400 hover:text-red-400 hover:bg-red-400/10 transition-all border border-transparent hover:border-red-400/20"
          >
            Clear Project
          </button>
          <button 
            className="px-6 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-cyan-500/20 transition-all flex items-center gap-2"
          >
            <span>💾</span> Export Video
          </button>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* ASSET SIDEBAR */}
        {sidebarOpen && (
          <div className="w-72 bg-[#141414] border-r border-white/5 flex flex-col shrink-0 animate-in slide-in-from-left duration-300">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-widest text-gray-500">Media Pool</h2>
              <button 
                onClick={onAddFromLibrary}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500 hover:text-white transition-all"
                title="Add Media"
              >
                +
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
              {sequence.map((item, idx) => (
                <div 
                    key={item.id}
                    className={`group relative p-2 rounded-xl border transition-all cursor-pointer ${
                        itemStartIndex === idx ? 'bg-cyan-500/10 border-cyan-500/50' : 'bg-[#1a1a1a] border-white/5 hover:border-white/20'
                    }`}
                    onClick={() => {
                        let offset = 0;
                        for(let i=0; i<idx; i++) offset += (sequence[i].duration || 3000);
                        handleSeek(offset);
                    }}
                >
                  <div className="flex gap-3">
                    <div className="w-16 h-12 rounded-lg bg-black overflow-hidden shrink-0 border border-white/5 relative">
                        {item.type === "VIDEO" ? (
                             <video src={item.url} className="w-full h-full object-cover opacity-60" />
                        ) : (
                             <img src={item.url} className="w-full h-full object-cover" />
                        )}
                        <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors"></div>
                        <div className="absolute bottom-1 right-1 text-[8px] bg-black/60 px-1 rounded text-gray-400 font-mono">
                            {Math.round((item.duration || 3000) / 1000)}s
                        </div>
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <p className="text-[11px] font-bold text-white truncate">{item.title || "Untitled"}</p>
                        <p className="text-[9px] text-gray-500 uppercase">{item.type}</p>
                    </div>
                  </div>
                  
                  {/* Item Actions */}
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); moveItem(idx, -1); }} className="p-1 hover:text-white text-gray-500">▲</button>
                    <button onClick={(e) => { e.stopPropagation(); moveItem(idx, 1); }} className="p-1 hover:text-white text-gray-500">▼</button>
                    <button onClick={(e) => { e.stopPropagation(); removeItem(item.id); }} className="p-1 hover:text-red-400 text-gray-500 ml-1">✕</button>
                  </div>
                </div>
              ))}
              
              {sequence.length === 0 && (
                <div className="h-64 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-white/5 rounded-2xl">
                    <span className="text-3xl mb-4">📂</span>
                    <p className="text-xs text-gray-500 font-medium">Your media pool is empty.</p>
                    <button 
                        onClick={onAddFromLibrary}
                        className="mt-4 text-[10px] text-cyan-400 hover:text-cyan-300 font-black uppercase tracking-widest"
                    >
                        Import Clips
                    </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* PREVIEW VIEWPORT */}
        <div className="flex-1 bg-black relative flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
            <button 
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="absolute top-4 left-4 z-10 w-8 h-8 bg-white/5 hover:bg-white/10 rounded-lg flex items-center justify-center border border-white/10 text-gray-400 transition-colors"
            >
                {sidebarOpen ? "◀" : "▶"}
            </button>

            <div className="relative w-full h-full flex flex-col max-w-7xl mx-auto">
                <div className="flex-1 relative bg-[#050505] rounded-2xl overflow-hidden border border-white/5 shadow-[0_0_50px_rgba(0,0,0,0.5)] flex items-center justify-center group">
                    {currentItem ? (
                        <>
                            {currentItem.type === "VIDEO" ? (
                                <video 
                                    ref={videoRef}
                                    src={currentItem.url}
                                    className="w-full h-full object-contain"
                                    muted
                                    playsInline
                                />
                            ) : (
                                <img 
                                    src={currentItem.url}
                                    className="w-full h-full object-contain"
                                />
                            )}
                        </>
                    ) : (
                        <div className="text-center">
                            <span className="text-5xl block mb-4 opacity-20">🎬</span>
                            <p className="text-gray-500 font-medium">No media selected</p>
                        </div>
                    )}
                    
                    {/* Play Overlay */}
                    {!isPlaying && currentItem && (
                        <button 
                            onClick={handleTogglePlay}
                            className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/10 transition-all group-hover:bg-black/40"
                        >
                            <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center scale-90 group-hover:scale-100 transition-transform shadow-2xl">
                                <span className="text-4xl text-white ml-2">▶</span>
                            </div>
                        </button>
                    )}
                </div>

                {/* Player Controls */}
                <div className="h-16 flex items-center justify-center gap-8 mt-4">
                    <button className="text-gray-500 hover:text-white transition-colors" onClick={() => handleSeek(currentTime - 5000)}>
                        <span className="text-xl">⏪</span>
                    </button>
                    <button 
                        onClick={handleTogglePlay}
                        className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 transition-transform shadow-xl shadow-white/10"
                    >
                        <span className="text-2xl">{isPlaying ? "⏸" : "▶"}</span>
                    </button>
                    <button className="text-gray-500 hover:text-white transition-colors" onClick={() => handleSeek(currentTime + 5000)}>
                        <span className="text-xl">⏩</span>
                    </button>
                </div>
            </div>
        </div>
      </div>

      {/* TIMELINE AREA */}
      <div className="h-48 sm:h-56 bg-[#141414] border-t border-white/10 flex flex-col shrink-0">
        <div className="h-10 border-b border-white/5 flex items-center px-4 justify-between bg-[#1a1a1a]">
            <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Zoom</span>
                    <input 
                        type="range" 
                        min="1" 
                        max="10" 
                        step="0.1"
                        value={zoom}
                        onChange={(e) => setZoom(parseFloat(e.target.value))}
                        className="w-24 accent-cyan-500 h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer"
                    />
                </div>
                <div className="h-4 w-[1px] bg-white/10"></div>
                <div className="text-[10px] font-mono text-cyan-400 font-bold bg-cyan-500/10 px-2 py-0.5 rounded">
                    {formatTime(currentTime)}
                </div>
            </div>

            <div className="flex gap-2">
                <button className="text-[10px] font-bold text-gray-500 hover:text-white transition-colors uppercase tracking-widest px-3 py-1">✂ Split</button>
                <button className="text-[10px] font-bold text-gray-500 hover:text-white transition-colors uppercase tracking-widest px-3 py-1">🗑 Delete</button>
            </div>
        </div>

        {/* Tracks */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden relative custom-scrollbar-h" style={{ scrollBehavior: 'smooth' }}>
            <div 
                ref={timelineRef}
                className="h-full relative py-6"
                style={{ width: `${Math.max(100, (totalDuration / 100) * zoom)}%`, minWidth: '100%' }}
                onMouseDown={handleTimelineMouseDown}
            >
                {/* Time Rulers */}
                <div className="absolute top-0 left-0 right-0 h-4 flex items-end opacity-20 pointer-events-none">
                    {Array.from({ length: Math.ceil(totalDuration / 1000) + 1 }).map((_, i) => (
                        <div key={i} className="border-l border-white h-2 flex-shrink-0" style={{ width: `${(1000 / totalDuration) * 100}%` }}>
                            <span className="text-[8px] ml-1">{i}s</span>
                        </div>
                    ))}
                </div>

                {/* Primary Video Track */}
                <div className="relative h-24 bg-white/5 mx-2 rounded-xl flex items-center px-0.5 group/track">
                    {sequence.map((item, idx) => (
                        <div 
                            key={item.id}
                            className={`h-20 border-r border-black/50 overflow-hidden relative group/clip transition-all ${
                                itemStartIndex === idx ? 'ring-2 ring-cyan-500 ring-inset' : ''
                            }`}
                            style={{ width: `${((item.duration || 3000) / totalDuration) * 100}%` }}
                        >
                            {item.type === "VIDEO" ? (
                                <video src={item.url} className="w-full h-full object-cover opacity-50" />
                            ) : (
                                <img src={item.url} className="w-full h-full object-cover opacity-50" />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/40"></div>
                            <div className="absolute bottom-2 left-2 right-2 flex justify-between items-center pointer-events-none">
                                <span className="text-[9px] font-bold text-white/80 truncate drop-shadow-md">{item.title || "Clip"}</span>
                                <span className="text-[8px] text-white/40 font-mono">{Math.round((item.duration || 3000) / 1000)}s</span>
                            </div>
                        </div>
                    ))}
                    
                    {sequence.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center text-gray-700 text-[10px] font-black uppercase tracking-[0.2em]">
                            Drop media here to start editing
                        </div>
                    )}
                </div>

                {/* Playhead Scrubber */}
                <div 
                    className="absolute top-0 bottom-0 w-[2px] bg-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.8)] z-20 pointer-events-none transition-transform duration-100 ease-linear"
                    style={{ left: `${(currentTime / totalDuration) * 100}%`, transform: 'translateX(-1px)' }}
                >
                    <div className="w-3 h-3 bg-cyan-500 rounded-full -ml-[5.5px] -mt-1 shadow-lg"></div>
                </div>
            </div>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        
        .custom-scrollbar-h::-webkit-scrollbar { height: 4px; }
        .custom-scrollbar-h::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar-h::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .custom-scrollbar-h::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        
        @keyframes pulse-slow {
            0%, 100% { opacity: 0.5; }
            50% { opacity: 0.8; }
        }
        .animate-pulse-slow {
            animation: pulse-slow 4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>
    </div>
  );
}
