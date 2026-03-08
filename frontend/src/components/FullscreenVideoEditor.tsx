import React, { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiEndpoints, getCORSProxyUrl } from "../lib/api";
import { LoadingSpinner } from "./LoadingSpinner";

export interface AudioItem {
  id: string;
  url: string;
  title: string;
  startTime: number; // When it starts on the timeline (ms)
  duration: number; // How long it plays (ms)
  trimStart?: number; // Internal trim
  volume?: number;
}

export interface SequenceItem {
  id: string;
  url: string;
  type: "IMAGE" | "VIDEO" | "CAROUSEL";
  title?: string;
  duration?: number; // In milliseconds
  thumbnail?: string;
  trimStart?: number; // Offset in ms for playback
  speed?: number; // Playback speed multiplier (0.5, 1, 2, etc.)
}

interface FullscreenVideoEditorProps {
  projectId?: string; // Optional: To sync with backend project storage
  sequence: SequenceItem[];
  setSequence: React.Dispatch<React.SetStateAction<SequenceItem[]>>;
  audioTracks?: AudioItem[];
  setAudioTracks?: React.Dispatch<React.SetStateAction<AudioItem[]>>;
  onClose: () => void;
  onAddFromLibrary: () => void;
  onClear: () => void;
}

export function FullscreenVideoEditor({
  projectId,
  sequence,
  setSequence,
  audioTracks,
  setAudioTracks,
  onClose,
  onAddFromLibrary,
  onClear,
}: FullscreenVideoEditorProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0); // Global time in ms
  const [zoom, setZoom] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [viewportRatio, setViewportRatio] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [sidebarTab, setSidebarTab] = useState<"project" | "timeline" | "exports">("project");
  
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const queryClient = useQueryClient();

  const { data: projectAssets = [], isLoading: isLoadingAssets } = useQuery({
    queryKey: ["assets", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await apiEndpoints.getAssets();
      return (res.data.assets || []).filter((a: any) => a.projectId === projectId);
    },
    enabled: !!projectId,
  });

  const [draggingEdge, setDraggingEdge] = useState<{ id: string, edge: 'left' | 'right', initialX: number, initialDuration: number, initialTrim: number } | null>(null);

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
        const trimOffset = currentItem.trimStart || 0;
        const videoTime = (localTime + trimOffset) / 1000;
        videoRef.current.playbackRate = currentItem.speed || 1;
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

  const handleSplit = () => {
    if (!currentItem || itemStartIndex === -1 || localTime <= 0 || localTime >= (currentItem.duration || 3000)) return;

    const newSeq = [...sequence];
    const itemToSplit = newSeq[itemStartIndex];
    
    // First half
    const firstHalf: SequenceItem = {
      ...itemToSplit,
      id: crypto.randomUUID(),
      duration: localTime,
    };

    // Second half
    const secondHalf: SequenceItem = {
      ...itemToSplit,
      id: crypto.randomUUID(),
      duration: (itemToSplit.duration || 3000) - localTime,
      trimStart: (itemToSplit.trimStart || 0) + localTime,
    };

    newSeq.splice(itemStartIndex, 1, firstHalf, secondHalf);
    setSequence(newSeq);
    setSelectedItemId(secondHalf.id); // Select the new right half
  };

  const handleDeleteSelected = () => {
    if (window.confirm("Are you sure you want to remove this clip from the timeline?")) {
      if (selectedItemId) {
        setSequence(prev => prev.filter(item => item.id !== selectedItemId));
        setSelectedItemId(null);
      } else if (currentItem) {
        // If nothing explicitly selected, delete the one under playhead
        setSequence(prev => prev.filter(item => item.id !== currentItem.id));
      }
    }
  };


  const handleEdgeDrag = (e: React.MouseEvent, id: string, edge: 'left' | 'right') => {
    e.stopPropagation();
    const item = sequence.find(i => i.id === id);
    if (!item) return;

    setDraggingEdge({
      id,
      edge,
      initialX: e.clientX,
      initialDuration: item.duration || 3000,
      initialTrim: item.trimStart || 0
    });
  };

  useEffect(() => {
    if (!draggingEdge) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!timelineRef.current) return;
      
      const deltaX = e.clientX - draggingEdge.initialX;
      const timelineRect = timelineRef.current.getBoundingClientRect();
      
      // Calculate time delta based on current zoom and timeline width
      const msPerPixel = totalDuration / timelineRect.width;
      const deltaTimeMs = deltaX * msPerPixel;

      setSequence(prev => prev.map(item => {
        if (item.id !== draggingEdge.id) return item;

        let newDuration = draggingEdge.initialDuration;
        let newTrim = draggingEdge.initialTrim;

        if (draggingEdge.edge === 'right') {
          // Dragging right edge changes duration
          newDuration = Math.max(500, draggingEdge.initialDuration + deltaTimeMs);
        } else if (draggingEdge.edge === 'left') {
          // Dragging left edge changes trimStart AND duration
          const maxTrim = draggingEdge.initialTrim + draggingEdge.initialDuration - 500;
          newTrim = Math.max(0, Math.min(draggingEdge.initialTrim + deltaTimeMs, maxTrim));
          
          const changeInTrim = newTrim - draggingEdge.initialTrim;
          newDuration = Math.max(500, draggingEdge.initialDuration - changeInTrim);
        }

        return { ...item, duration: newDuration, trimStart: newTrim };
      }));
    };

    const handleMouseUp = () => {
      setDraggingEdge(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingEdge, totalDuration]);

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

  const handleSaveProject = async () => {
    if (!projectId) {
        alert("Cannot save: No active project detected.");
        return;
    }
    try {
        const editorState = {
            sequence,
            audioTracks: audioTracks || []
        };
        await apiEndpoints.updateProject(projectId, { editorState });
        alert("Project saved successfully!");
    } catch (error) {
        console.error("Failed to save project", error);
        alert("Failed to save project.");
    }
  };

  const handleExportVideo = async () => {
    if (sequence.length === 0) {
      alert("Timeline is empty. Add clips to export.");
      return;
    }
    
    setIsExporting(true);
    setExportProgress(0);

    // 1. Simulate Rendering Progress
    for (let i = 0; i <= 100; i += 10) {
      setExportProgress(i);
      await new Promise(r => setTimeout(r, 300));
    }

    try {
      // 2. Mock Export (Since we don't have backend FFmpeg yet)
      // We will take the first video clip and save it as an "EXPORTED" video in the project
      const firstClipUrl = sequence.find(s => s.type === "VIDEO")?.url || sequence[0].url;
      const response = await fetch(firstClipUrl);
      const blob = await response.blob();
      const file = new File([blob], `exported_video_${Date.now()}.mp4`, { type: "video/mp4" });

      const formData = new FormData();
      formData.append("image", file);
      formData.append("raw", "true");
      formData.append("aspectRatio", "EXPORTED_VIDEO"); // Custom tag to filter in the Exports tab
      if (projectId) formData.append("projectId", projectId);

      await apiEndpoints.uploadAssetSync(formData);
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      
      setIsExporting(false);
      setSidebarTab("exports");
      if (!sidebarOpen) setSidebarOpen(true);
      
    } catch (e) {
      console.error(e);
      alert("Failed to export video.");
      setIsExporting(false);
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
            onClick={handleSaveProject}
            className="px-4 py-1.5 rounded-lg text-xs font-bold text-gray-400 hover:text-white hover:bg-white/10 transition-all border border-transparent"
          >
            Save Project
          </button>
          <button 
            onClick={onClear}
            className="px-4 py-1.5 rounded-lg text-xs font-bold text-gray-400 hover:text-red-400 hover:bg-red-400/10 transition-all border border-transparent hover:border-red-400/20"
          >
            Clear
          </button>
          <button 
            onClick={handleExportVideo}
            disabled={isExporting}
            className="px-6 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-lg shadow-cyan-500/20 transition-all flex items-center gap-2"
          >
            <span>💾</span> {isExporting ? "Rendering..." : "Export Video"}
          </button>
        </div>
      </div>

      {/* RENDER PROGRESS OVERLAY */}
      {isExporting && (
          <div className="absolute inset-0 z-[200] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center">
              <div className="w-96 p-8 bg-gray-900 border border-gray-700 rounded-2xl flex flex-col items-center">
                  <h3 className="text-white font-bold text-lg mb-2">Rendering Video</h3>
                  <p className="text-gray-400 text-xs text-center mb-6">
                      (Note: True server-side NLE FFmpeg rendering is required for complex sequences. Saving demo clip...)
                  </p>
                  <div className="w-full bg-gray-800 rounded-full h-3 mb-2 overflow-hidden">
                      <div className="bg-cyan-500 h-full transition-all duration-300" style={{ width: `${exportProgress}%` }}></div>
                  </div>
                  <span className="text-cyan-400 font-mono text-sm">{exportProgress}%</span>
              </div>
          </div>
      )}

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* ASSET SIDEBAR */}
        {sidebarOpen && (
          <div className="w-72 bg-[#141414] border-r border-white/5 flex flex-col shrink-0 animate-in slide-in-from-left duration-300">
            <div className="p-4 border-b border-white/5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex gap-1 bg-gray-900 rounded-lg p-1">
                    <button 
                        onClick={() => setSidebarTab("project")}
                        className={`px-3 py-1 rounded text-[10px] font-bold transition-colors flex items-center gap-1 ${sidebarTab === "project" ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"}`}
                        title="View files saved in this project folder"
                    >
                        <span>📁</span> Folder
                    </button>
                    <button 
                        onClick={() => setSidebarTab("timeline")}
                        className={`px-3 py-1 rounded text-[10px] font-bold transition-colors flex items-center gap-1 ${sidebarTab === "timeline" ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"}`}
                        title="View clips currently in your sequence"
                    >
                        <span>🎞️</span> Pool
                    </button>
                    <button 
                        onClick={() => setSidebarTab("exports")}
                        className={`px-3 py-1 rounded text-[10px] font-bold transition-colors flex items-center gap-1 ${sidebarTab === "exports" ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"}`}
                        title="View rendered exported videos"
                    >
                        <span>🎬</span> Exports
                    </button>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={() => {
                            const fileInput = document.createElement('input');
                            fileInput.type = 'file';
                            fileInput.accept = 'audio/*';
                            fileInput.onchange = (e: any) => {
                                const file = e.target.files?.[0];
                                if (file && setAudioTracks) {
                                    const url = URL.createObjectURL(file);
                                    const newAudio: AudioItem = {
                                        id: crypto.randomUUID(),
                                        url,
                                        title: file.name,
                                        startTime: currentTime,
                                        duration: 10000 // default 10s until we can read metadata
                                    };
                                    setAudioTracks(prev => [...(prev || []), newAudio]);
                                }
                            };
                            fileInput.click();
                        }}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500 hover:text-white transition-all text-xs"
                        title="Add Audio"
                    >
                        🎵
                    </button>
                    <button 
                        onClick={onAddFromLibrary}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500 hover:text-white transition-all"
                        title="Add Visual Media"
                    >
                        +
                    </button>
                </div>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
              {sidebarTab === "timeline" && (
                  <>
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
                            <p className="text-xs text-gray-500 font-medium">Timeline empty.</p>
                            <button 
                                onClick={onAddFromLibrary}
                                className="mt-4 text-[10px] text-cyan-400 hover:text-cyan-300 font-black uppercase tracking-widest"
                            >
                                Import Clips
                            </button>
                        </div>
                      )}
                  </>
              )}

              {sidebarTab === "project" && (
                  <div className="grid grid-cols-2 gap-2">
                      {isLoadingAssets ? (
                          <div className="col-span-2 flex justify-center py-10"><LoadingSpinner /></div>
                      ) : projectAssets.filter((a: any) => a.aspectRatio !== "EXPORTED_VIDEO").length === 0 ? (
                          <div className="col-span-2 text-center text-gray-500 text-xs py-10">No media saved to this project yet.</div>
                      ) : (
                          projectAssets.filter((a: any) => a.aspectRatio !== "EXPORTED_VIDEO").map((asset: any) => (
                              <div 
                                key={asset.id} 
                                className="relative aspect-square bg-black rounded-lg border border-white/5 overflow-hidden group cursor-pointer hover:border-cyan-500/50 transition-all"
                                onClick={() => {
                                    setSequence(prev => [...prev, {
                                        id: crypto.randomUUID(),
                                        url: getCORSProxyUrl(asset.url),
                                        type: asset.type === "VIDEO" ? "VIDEO" : "IMAGE",
                                        duration: asset.type === "VIDEO" ? 5000 : 3000,
                                        title: "Project Media"
                                    }]);
                                }}
                              >
                                  {asset.type === "VIDEO" ? (
                                      <video src={getCORSProxyUrl(asset.url)} className="w-full h-full object-cover" muted />
                                  ) : (
                                      <img src={getCORSProxyUrl(asset.url)} className="w-full h-full object-cover" crossOrigin="anonymous" />
                                  )}
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                      <span className="bg-cyan-500 text-white text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">+ Add</span>
                                  </div>
                              </div>
                          ))
                      )}
                  </div>
              )}

              {sidebarTab === "exports" && (
                  <div className="flex flex-col gap-3">
                      {isLoadingAssets ? (
                          <div className="flex justify-center py-10"><LoadingSpinner /></div>
                      ) : projectAssets.filter((a: any) => a.aspectRatio === "EXPORTED_VIDEO").length === 0 ? (
                          <div className="text-center text-gray-500 text-xs py-10 border-2 border-dashed border-white/5 rounded-2xl">
                              <span className="text-3xl mb-2 block">🎬</span>
                              No exported videos yet. Click "Export Video" to render your sequence.
                          </div>
                      ) : (
                          projectAssets.filter((a: any) => a.aspectRatio === "EXPORTED_VIDEO").map((asset: any) => (
                              <div key={asset.id} className="bg-black/40 border border-white/10 rounded-xl overflow-hidden group">
                                  <div className="aspect-video relative bg-black">
                                      <video src={getCORSProxyUrl(asset.url)} className="w-full h-full object-contain" controls />
                                  </div>
                                  <div className="p-3 flex items-center justify-between">
                                      <div className="text-[10px] text-gray-400 font-mono">
                                          {new Date(asset.createdAt).toLocaleDateString()}
                                      </div>
                                      <a 
                                          href={getCORSProxyUrl(asset.url)} 
                                          download={`Render_${asset.id}.mp4`}
                                          target="_blank"
                                          className="text-xs font-bold text-cyan-400 hover:text-cyan-300"
                                      >
                                          Download
                                      </a>
                                  </div>
                              </div>
                          ))
                      )}
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
                {sidebarOpen ? (
                    <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                ) : (
                    <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                )}
            </button>

            {/* Viewport Ratio Switcher */}
            <div className="absolute top-4 right-4 z-10 flex gap-1 bg-black/50 backdrop-blur-md p-1 rounded-lg border border-white/10">
                {[
                    { id: "16:9", icon: "▭", label: "Landscape" },
                    { id: "9:16", icon: "▯", label: "Portrait" },
                    { id: "1:1", icon: "□", label: "Square" },
                ].map((ratio) => (
                    <button
                        key={ratio.id}
                        onClick={() => setViewportRatio(ratio.id as any)}
                        className={`px-3 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1 ${
                            viewportRatio === ratio.id ? "bg-cyan-600 text-white" : "text-gray-400 hover:text-white hover:bg-white/10"
                        }`}
                        title={ratio.label}
                    >
                        <span>{ratio.icon}</span>
                        <span className="hidden sm:inline">{ratio.id}</span>
                    </button>
                ))}
            </div>

            <div className="relative w-full h-full flex flex-col items-center justify-center pt-8">
                <div 
                    className="relative bg-[#050505] rounded-lg overflow-hidden border border-white/5 shadow-[0_0_50px_rgba(0,0,0,0.5)] flex items-center justify-center group transition-all duration-500"
                    style={{
                        width: viewportRatio === "16:9" ? "100%" : viewportRatio === "9:16" ? "auto" : "auto",
                        height: viewportRatio === "16:9" ? "auto" : "100%",
                        aspectRatio: viewportRatio === "16:9" ? "16/9" : viewportRatio === "9:16" ? "9/16" : "1/1",
                        maxHeight: "100%",
                        maxWidth: "100%"
                    }}
                >
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
                            className="absolute inset-0 flex items-center justify-center bg-black/10 hover:bg-black/30 transition-all duration-300 group-hover:bg-black/40"
                        >
                            <div className="w-24 h-24 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center scale-90 group-hover:scale-100 transition-transform shadow-2xl text-white">
                                <svg className="w-10 h-10 ml-2 drop-shadow-lg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                            </div>
                        </button>
                    )}
                </div>

                {/* Player Controls */}
                <div className="h-16 flex items-center justify-center gap-8 mt-4">
                    <button className="text-gray-500 hover:text-white transition-colors" onClick={() => handleSeek(currentTime - 5000)}>
                        <svg className="w-6 h-6" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 19 2 12 11 5 11 19"></polygon><polygon points="22 19 13 12 22 5 22 19"></polygon></svg>
                    </button>
                    <button 
                        onClick={handleTogglePlay}
                        className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform shadow-xl shadow-white/10"
                    >
                        {isPlaying ? (
                            <svg className="w-6 h-6" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                        ) : (
                            <svg className="w-6 h-6 ml-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        )}
                    </button>
                    <button className="text-gray-500 hover:text-white transition-colors" onClick={() => handleSeek(currentTime + 5000)}>
                        <svg className="w-6 h-6" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 19 22 12 13 5 13 19"></polygon><polygon points="2 19 11 12 2 5 2 19"></polygon></svg>
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

            <div className="flex items-center gap-2">
                {sequence.find(i => i.id === selectedItemId)?.type === "VIDEO" && (
                    <select 
                        value={sequence.find(i => i.id === selectedItemId)?.speed || 1}
                        onChange={(e) => {
                            const speed = parseFloat(e.target.value);
                            setSequence(prev => prev.map(item => item.id === selectedItemId ? { ...item, speed } : item));
                        }}
                        className="bg-gray-900 border border-white/10 text-[10px] text-cyan-400 font-bold uppercase tracking-widest rounded px-2 py-1 outline-none cursor-pointer"
                        title="Playback Speed"
                    >
                        <option value="0.5">0.5x Speed</option>
                        <option value="1">1.0x Speed</option>
                        <option value="2">2.0x Speed</option>
                        <option value="4">4.0x Speed</option>
                        <option value="8">8.0x Speed</option>
                    </select>
                )}
                <button onClick={handleSplit} className="text-[10px] font-bold text-gray-500 hover:text-white transition-colors uppercase tracking-widest px-3 py-1 bg-white/5 rounded hover:bg-white/10">✂ Split</button>
                <button onClick={handleDeleteSelected} className="text-[10px] font-bold text-red-500/70 hover:text-red-400 transition-colors uppercase tracking-widest px-3 py-1 bg-red-500/10 rounded hover:bg-red-500/20">🗑 Delete</button>
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
                            onClick={(e) => { e.stopPropagation(); setSelectedItemId(item.id); }}
                            className={`h-20 border-r border-black/50 overflow-hidden relative group/clip transition-all cursor-pointer hover:opacity-80 ${
                                selectedItemId === item.id ? 'ring-2 ring-purple-500 ring-inset z-10' : 
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

                            {/* Drag Handles (Visible when selected) */}
                            {selectedItemId === item.id && (
                                <>
                                    <div 
                                        className="absolute left-0 top-0 bottom-0 w-2 bg-purple-500 cursor-ew-resize hover:w-3 transition-all z-20 flex items-center justify-center opacity-80 hover:opacity-100"
                                        onMouseDown={(e) => handleEdgeDrag(e, item.id, 'left')}
                                    >
                                        <div className="w-[1px] h-4 bg-white/50"></div>
                                    </div>
                                    <div 
                                        className="absolute right-0 top-0 bottom-0 w-2 bg-purple-500 cursor-ew-resize hover:w-3 transition-all z-20 flex items-center justify-center opacity-80 hover:opacity-100"
                                        onMouseDown={(e) => handleEdgeDrag(e, item.id, 'right')}
                                    >
                                        <div className="w-[1px] h-4 bg-white/50"></div>
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                    
                    {sequence.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center text-gray-700 text-[10px] font-black uppercase tracking-[0.2em]">
                            Drop media here to start editing
                        </div>
                    )}
                </div>

                {/* Audio Track Container */}
                <div className="relative h-12 bg-white/5 mx-2 mt-2 rounded-xl flex items-center group/track border border-dashed border-white/10">
                    {audioTracks?.map((audio) => (
                        <div 
                            key={audio.id}
                            className="absolute h-10 top-1 bg-emerald-600/30 border border-emerald-500/50 rounded-md overflow-hidden flex items-center px-2"
                            style={{ 
                                left: `${(audio.startTime / totalDuration) * 100}%`,
                                width: `${(audio.duration / totalDuration) * 100}%` 
                            }}
                        >
                            <span className="text-[9px] font-bold text-emerald-300 truncate">🎵 {audio.title}</span>
                        </div>
                    ))}
                    
                    {(!audioTracks || audioTracks.length === 0) && (
                         <div className="absolute inset-0 flex items-center justify-center text-gray-700 text-[9px] font-black uppercase tracking-[0.2em] pointer-events-none">
                            Drop audio here
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
