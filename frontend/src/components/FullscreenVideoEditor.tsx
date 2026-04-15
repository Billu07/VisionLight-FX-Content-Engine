import React, { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiEndpoints, getCORSProxyUrl } from "../lib/api";
import { videoEngine } from "../lib/videoEngine";
import { LoadingSpinner } from "./LoadingSpinner";

export interface Marker {
    id: string;
    time: number; // Time in ms
    label?: string;
    color?: string;
}

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
    originalDuration?: number; // Max possible duration for video
    thumbnail?: string;
    trimStart?: number; // Offset in ms for playback
    speed?: number; // Playback speed multiplier (0.5, 1, 2, etc.)
}

interface FullscreenVideoEditorProps {
    projectId?: string; // Optional: To sync with backend project storage
    sequence: SequenceItem[];
    setSequence: React.Dispatch<React.SetStateAction<SequenceItem[]>>;
    binItems: SequenceItem[];
    setBinItems: React.Dispatch<React.SetStateAction<SequenceItem[]>>;
    audioTracks?: AudioItem[];
    setAudioTracks?: React.Dispatch<React.SetStateAction<AudioItem[]>>;
    currentTime?: number; // Starting time
    onClose: () => void;
    onAddFromLibrary: () => void;
    onClear: () => void;
}

export function FullscreenVideoEditor({
    projectId,
    sequence,
    setSequence,
    binItems,
    setBinItems,
    audioTracks,
    setAudioTracks,
    currentTime: initialTime = 0,
    onClose,
    onAddFromLibrary,
    onClear,
}: FullscreenVideoEditorProps) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(initialTime); // Global time in ms
    const [zoom, setZoom] = useState(1);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
    const [viewportRatio, setViewportRatio] = useState<"16:9" | "9:16" | "1:1">("16:9");
    const [sidebarTab, setSidebarTab] = useState<"project" | "bin" | "storyline" | "exports">("bin");
    const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);

    const [isExporting, setIsExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);
    const [showExportModal, setShowExportModal] = useState(false);
    const [exportFps, setExportFps] = useState(30);

    const [markers, setMarkers] = useState<Marker[]>([]);
    const [isCapturingFrame, setIsCapturingFrame] = useState(false);
    const [isPreparing, setIsPreparing] = useState(true);

    const queryClient = useQueryClient();

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const playheadRef = useRef<HTMLDivElement>(null);
    const internalTimeRef = useRef(initialTime);
    const lastStateSyncRef = useRef(0);
    const videoPoolRef = useRef<Map<string, HTMLVideoElement>>(new Map());
    const [cachedUrls, setCachedUrls] = useState<Map<string, string>>(new Map());
    
    const sequenceRef = useRef(sequence);
    const cachedUrlsRef = useRef(cachedUrls);
    const isPlayingRef = useRef(isPlaying);
    const totalDurationRef = useRef(0);

    const totalDuration = useMemo(() => {
        return sequence.reduce((acc, item) => acc + (item.duration || 3000), 0);
    }, [sequence]);

    useEffect(() => {
        sequenceRef.current = sequence;
    }, [sequence]);

    useEffect(() => {
        cachedUrlsRef.current = cachedUrls;
    }, [cachedUrls]);

    useEffect(() => {
        isPlayingRef.current = isPlaying;
    }, [isPlaying]);

    useEffect(() => {
        totalDurationRef.current = totalDuration;
    }, [totalDuration]);

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

    const timelineRef = useRef<HTMLDivElement>(null);
    const animationRef = useRef<number | null>(null);

    // Blob Caching Engine
    useEffect(() => {
        let isMounted = true;
        const cacheAssets = async () => {
            const urlsToCache = [...new Set([
                ...sequence.map(i => i.url),
                ...binItems.map(i => i.url)
            ])];

            if (urlsToCache.length === 0) {
                setIsPreparing(false);
                return;
            }

            // We only block "Preparing Studio" for items actually on the timeline (sequence)
            const sequenceUrls = new Set(sequence.map(i => i.url));
            let sequenceLoadedCount = 0;
            const sequenceTotal = sequenceUrls.size;

            if (sequenceTotal === 0) setIsPreparing(false);

            for (const url of urlsToCache) {
                const isTimelineItem = sequenceUrls.has(url);
                if (!cachedUrls.has(url)) {
                    const blobUrl = await videoEngine.getAssetUrl(url, getCORSProxyUrl);
                    if (isMounted) {
                        setCachedUrls(prev => {
                            const next = new Map(prev);
                            next.set(url, blobUrl);
                            return next;
                        });
                    }
                }
                
                if (isTimelineItem) {
                    sequenceLoadedCount++;
                    if (sequenceLoadedCount >= sequenceTotal && isMounted) {
                        setIsPreparing(false);
                    }
                }
            }
        };
        cacheAssets();
        return () => { isMounted = false; };
    }, [sequence, binItems]);

    // Helper to find item at specific time
    const findItemAtTime = (time: number, seq: SequenceItem[], totalDur: number) => {
        if (seq.length === 0) return { item: null, localTime: 0, index: -1 };
        const clampedTime = Math.max(0, Math.min(time, totalDur - 0.001));
        let accumulated = 0;
        for (let i = 0; i < seq.length; i++) {
            const item = seq[i];
            const duration = item.duration || 3000;
            if (clampedTime >= accumulated && clampedTime < accumulated + duration) {
                return { item, localTime: clampedTime - accumulated, index: i };
            }
            accumulated += duration;
        }
        const lastItem = seq[seq.length - 1];
        return { item: lastItem, localTime: lastItem?.duration || 0, index: seq.length - 1 };
    };

    // Find current item and local time for React UI state
    const { item: currentItem, localTime, index: itemStartIndex } = useMemo(() => 
        findItemAtTime(currentTime, sequence, totalDuration),
    [sequence, currentTime, totalDuration]);

    // PRE-FETCH & POOL MANAGEMENT
    useEffect(() => {
        const pool = videoPoolRef.current;
        const activeUrls = new Set(sequence.filter(i => i.type === "VIDEO").map(i => cachedUrls.get(i.url)).filter(Boolean));

        // Cleanup stale videos from pool
        pool.forEach((video, url) => {
            if (!activeUrls.has(url)) {
                video.pause();
                video.src = "";
                video.load();
                pool.delete(url);
            }
        });

        // Pre-warm pool with next few videos
        const lookAheadCount = 3;
        const startIndex = itemStartIndex === -1 ? 0 : itemStartIndex;
        for (let i = startIndex; i < Math.min(sequence.length, startIndex + lookAheadCount); i++) {
            const item = sequence[i];
            if (item.type === "VIDEO") {
                const blobUrl = cachedUrls.get(item.url);
                if (blobUrl && !pool.has(blobUrl)) {
                    const v = document.createElement("video");
                    v.src = blobUrl;
                    v.preload = "auto";
                    v.muted = true;
                    v.playsInline = true;
                    v.crossOrigin = "anonymous";
                    v.load();
                    // Pre-seek to trimStart for instant transitions
                    v.currentTime = (item.trimStart || 0) / 1000;
                    pool.set(blobUrl, v);
                }
            }
        }
    }, [sequence, itemStartIndex, cachedUrls]);

    const imagePoolRef = useRef<Map<string, HTMLImageElement>>(new Map());

    const pixelsPerMs = (zoom) / 10; // At zoom 1, 100px = 1s

    // RENDER LOOP (Dual-Loop Architecture) - Completely Stable & Continuous
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) return;

        let lastFrameTime = performance.now();
        
        const render = () => {
            if (document.visibilityState !== "visible") {
                animationRef.current = requestAnimationFrame(render);
                return;
            }

            const now = performance.now();
            const delta = now - lastFrameTime;
            lastFrameTime = now;

            const isPlaying = isPlayingRef.current;
            const totalDur = totalDurationRef.current;
            const currentSequence = sequenceRef.current;

            // 1. Update Clock if playing
            if (isPlaying) {
                internalTimeRef.current += delta;
                if (internalTimeRef.current >= totalDur) {
                    internalTimeRef.current = 0;
                    setIsPlaying(false);
                }

                // Sync React state every 100ms for UI
                if (now - lastStateSyncRef.current > 100) {
                    setCurrentTime(internalTimeRef.current);
                    lastStateSyncRef.current = now;
                }
            }

            const clampedTime = Math.max(0, Math.min(internalTimeRef.current, totalDur - 0.001));

            // Find current item and local time directly in loop using refs
            let loopItem: SequenceItem | null = null;
            let loopLocalTime = 0;
            let accumulated = 0;
            
            for (let i = 0; i < currentSequence.length; i++) {
                const item = currentSequence[i];
                const duration = item.duration || 3000;
                if (clampedTime >= accumulated && clampedTime < accumulated + duration) {
                    loopItem = item;
                    loopLocalTime = clampedTime - accumulated;
                    break;
                }
                accumulated += duration;
            }

            // 2. Draw current frame to canvas
            if (loopItem) {
                const blobUrl = cachedUrlsRef.current.get(loopItem.url);
                const drawMedia = (media: HTMLVideoElement | HTMLImageElement) => {
                    const canvasWidth = canvas.width;
                    const canvasHeight = canvas.height;
                    const mediaWidth = media instanceof HTMLVideoElement ? media.videoWidth : media.width;
                    const mediaHeight = media instanceof HTMLVideoElement ? media.videoHeight : media.height;

                    if (!mediaWidth || !mediaHeight) return;

                    const scale = Math.min(canvasWidth / mediaWidth, canvasHeight / mediaHeight);
                    const drawWidth = mediaWidth * scale;
                    const drawHeight = mediaHeight * scale;
                    const x = (canvasWidth - drawWidth) / 2;
                    const y = (canvasHeight - drawHeight) / 2;

                    ctx.fillStyle = "#000";
                    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
                    ctx.drawImage(media, x, y, drawWidth, drawHeight);
                };

                if (loopItem.type === "VIDEO" && blobUrl) {
                    const video = videoPoolRef.current.get(blobUrl);
                    if (video) {
                        const targetVideoTime = ((loopLocalTime * (loopItem.speed || 1)) + (loopItem.trimStart || 0)) / 1000;
                        const drift = Math.abs(video.currentTime - targetVideoTime);
                        
                        // Optimized Seek Logic for live feedback while scrubbing
                        const threshold = isPlaying ? 0.5 : 0.033;
                        if (drift > threshold) {
                            video.currentTime = targetVideoTime;
                        }

                        if (isPlaying && video.paused) {
                            video.play().catch(() => {});
                        } else if (!isPlaying && !video.paused) {
                            video.pause();
                        }

                        if (video.readyState >= 2) {
                            drawMedia(video);
                        } else {
                            ctx.fillStyle = "#050505";
                            ctx.fillRect(0, 0, canvas.width, canvas.height);
                        }
                    }
                } else if (loopItem.type === "IMAGE" && blobUrl) {
                    let img = imagePoolRef.current.get(blobUrl);
                    if (!img) {
                        img = new Image();
                        img.src = blobUrl;
                        img.crossOrigin = "anonymous";
                        imagePoolRef.current.set(blobUrl, img);
                    }
                    if (img.complete) {
                        drawMedia(img);
                    } else {
                        ctx.fillStyle = "#050505";
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                    }
                }
            } else {
                ctx.fillStyle = "#000";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }

            // 3. Update Playhead every single frame based on internalTimeRef (Pixels)
            if (playheadRef.current && totalDur > 0) {
                playheadRef.current.style.left = `${clampedTime * pixelsPerMs}px`;
            }

            animationRef.current = requestAnimationFrame(render);
        };

        animationRef.current = requestAnimationFrame(render);
        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
            // Cleanup video pool on unmount
            videoPoolRef.current.forEach(v => {
                v.pause();
                v.src = "";
                v.load();
            });
            videoPoolRef.current.clear();
        };
    }, [pixelsPerMs]); // Re-run loop only if zoom (pixelsPerMs) changes

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;

            switch (e.code) {
                case "Space":
                    e.preventDefault();
                    handleTogglePlay();
                    break;
                case "ArrowLeft":
                    e.preventDefault();
                    handleSeek(internalTimeRef.current - (e.shiftKey ? 1000 : 33)); // 1 frame at 30fps
                    break;
                case "ArrowRight":
                    e.preventDefault();
                    handleSeek(internalTimeRef.current + (e.shiftKey ? 1000 : 33));
                    break;
                case "KeyM":
                    handleToggleMarker();
                    break;
                case "KeyS":
                    if (e.ctrlKey) { e.preventDefault(); handleSaveProject(); }
                    break;
                case "Delete":
                case "Backspace":
                    handleDeleteSelected();
                    break;
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isPlaying, totalDuration, selectedItemId, markers]);

    const handleToggleMarker = () => {
        const time = internalTimeRef.current;
        const existing = markers.find(m => Math.abs(m.time - time) < 100);
        if (existing) {
            setMarkers(prev => prev.filter(m => m.id !== existing.id));
        } else {
            setMarkers(prev => [...prev, { id: crypto.randomUUID(), time }].sort((a,b) => a.time - b.time));
        }
    };

    const handleZoomFit = () => {
        if (!timelineRef.current || totalDuration <= 0) return;
        const containerWidth = timelineRef.current.parentElement?.clientWidth || 1000;
        const newZoom = (containerWidth / totalDuration) * 10;
        setZoom(Math.max(0.1, newZoom));
    };

    const handleSnapshot = async () => {
        const canvas = canvasRef.current;
        if (!canvas || isCapturingFrame) return;

        setIsCapturingFrame(true);
        canvas.toBlob(async (blob) => {
            if (!blob) {
                setIsCapturingFrame(false);
                return;
            }
            try {
                const file = new File([blob], `Snapshot_${Date.now()}.jpg`, { type: "image/jpeg" });
                const formData = new FormData();
                formData.append("image", file);
                formData.append("raw", "true");
                if (projectId) formData.append("projectId", projectId);

                const res = await apiEndpoints.uploadAssetSync(formData);
                if (res.data.success) {
                    queryClient.invalidateQueries({ queryKey: ["assets"] });
                    alert("Frame captured and added to library! ✨");
                }
            } catch (err) {
                console.error("Snapshot failed", err);
            } finally {
                setIsCapturingFrame(false);
            }
        }, "image/jpeg", 0.95);
    };

    const handleTogglePlay = () => {
        if (sequenceRef.current.length === 0) return;
        if (internalTimeRef.current >= totalDurationRef.current) {
            internalTimeRef.current = 0;
            setCurrentTime(0);
        }
        setIsPlaying(!isPlaying);
    };

    const handleSeek = (time: number) => {
        const snapMarker = markers.find(m => Math.abs(m.time - time) < 150);
        const finalTime = Math.max(0, Math.min(snapMarker ? snapMarker.time : time, totalDurationRef.current));
        
        internalTimeRef.current = finalTime;
        setCurrentTime(finalTime);

        if (playheadRef.current && totalDurationRef.current > 0) {
            playheadRef.current.style.left = `${finalTime * pixelsPerMs}px`;
        }
    };

    const handleSplit = () => {
        if (!currentItem || itemStartIndex === -1 || localTime <= 0 || localTime >= (currentItem.duration || 3000)) return;

        const newSeq = [...sequence];
        const itemToSplit = newSeq[itemStartIndex];

        const firstHalf: SequenceItem = {
            ...itemToSplit,
            id: crypto.randomUUID(),
            duration: localTime,
        };

        const secondHalf: SequenceItem = {
            ...itemToSplit,
            id: crypto.randomUUID(),
            duration: (itemToSplit.duration || 3000) - localTime,
            trimStart: (itemToSplit.trimStart || 0) + localTime,
        };

        newSeq.splice(itemStartIndex, 1, firstHalf, secondHalf);
        setSequence(newSeq);
        setSelectedItemId(secondHalf.id);
    };

    const handleDeleteSelected = () => {
        if (window.confirm("Are you sure you want to remove this clip from the timeline?")) {
            if (selectedItemId) {
                setSequence(prev => prev.filter(item => item.id !== selectedItemId));
                setSelectedItemId(null);
            } else if (currentItem) {
                setSequence(prev => prev.filter(item => item.id !== currentItem.id));
            }
        }
    };


    const handleEdgeDrag = (e: React.MouseEvent, id: string, edge: 'left' | 'right') => {
        e.stopPropagation();
        e.preventDefault();
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
            const msPerPx = 1 / pixelsPerMs;
            const deltaTimeMs = deltaX * msPerPx;

            const itemIndex = sequenceRef.current.findIndex(i => i.id === draggingEdge.id);
            if (itemIndex === -1) return;

            const item = sequenceRef.current[itemIndex];
            let newDuration = draggingEdge.initialDuration;
            let newTrim = draggingEdge.initialTrim;

            if (draggingEdge.edge === 'right') {
                newDuration = Math.max(100, draggingEdge.initialDuration + deltaTimeMs);
                if (item.originalDuration) {
                    newDuration = Math.min(newDuration, item.originalDuration - newTrim);
                }
            } else if (draggingEdge.edge === 'left') {
                const maxTrim = draggingEdge.initialTrim + draggingEdge.initialDuration - 100;
                newTrim = Math.max(0, Math.min(draggingEdge.initialTrim + deltaTimeMs, maxTrim));
                const changeInTrim = newTrim - draggingEdge.initialTrim;
                newDuration = Math.max(100, draggingEdge.initialDuration - changeInTrim);
            }

            const newSeq = [...sequenceRef.current];
            newSeq[itemIndex] = { ...item, duration: newDuration, trimStart: newTrim };
            
            // Sync refs immediately for the render loop to pick up changes
            sequenceRef.current = newSeq;
            totalDurationRef.current = newSeq.reduce((acc, i) => acc + (i.duration || 3000), 0);
            
            setSequence(newSeq);

            let accumulated = 0;
            for (let i = 0; i < itemIndex; i++) {
                accumulated += newSeq[i].duration || 3000;
            }

            const targetTime = draggingEdge.edge === 'left' ? accumulated : accumulated + newDuration;
            internalTimeRef.current = targetTime;
            setCurrentTime(targetTime);
        };

        const handleMouseUp = () => {
            setDraggingEdge(null);
        };

        window.addEventListener('mousemove', handleMouseMove, { passive: false });
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [draggingEdge, zoom, pixelsPerMs]);

    const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if ((e.target as HTMLElement).closest('.drag-handle')) return;

        const seekToPoint = (clientX: number) => {
            if (!timelineRef.current) return;
            const rect = timelineRef.current.getBoundingClientRect();
            const x = clientX - rect.left;
            const clickedTime = x / pixelsPerMs;
            handleSeek(clickedTime);
        };

        const handleMouseMove = (moveEvent: MouseEvent) => {
            seekToPoint(moveEvent.clientX);
        };

        const handleMouseUp = () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
        seekToPoint(e.clientX);
    };

    const handleSaveProject = async () => {
        if (!projectId) {
            alert("Cannot save: No active project detected.");
            return;
        }
        try {
            const editorState = { sequence, audioTracks: audioTracks || [] };
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
        setShowExportModal(true);
    };

    const confirmExportVideo = async () => {
        if (totalDuration > 60000) {
            alert("Total sequence duration cannot exceed 60 seconds.");
            return;
        }
        setShowExportModal(false);
        setIsExporting(true);
        setExportProgress(0);

        const progressInterval = setInterval(() => {
            setExportProgress(prev => {
                if (prev >= 90) return prev;
                const increment = prev > 70 ? 2 : prev > 40 ? 5 : 10;
                return prev + increment;
            });
        }, 1000);

        try {
            const editorState = { sequence, audioTracks: audioTracks || [] };
            await apiEndpoints.exportVideo({ editorState, projectId, fps: exportFps });
            clearInterval(progressInterval);
            setExportProgress(100);
            queryClient.invalidateQueries({ queryKey: ["assets"] });
            setTimeout(() => {
                setIsExporting(false);
                setSidebarTab("exports");
                if (!sidebarOpen) setSidebarOpen(true);
            }, 500);
        } catch (e) {
            clearInterval(progressInterval);
            console.error(e);
            alert("Failed to export video. Check console for details.");
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

    const timelineWidthPx = totalDuration * pixelsPerMs;

    return (
        <div className="fixed inset-0 z-[100] bg-[#0f0f0f] text-gray-200 flex flex-col font-sans select-none overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            
            {/* PREPARING OVERLAY */}
            {isPreparing && (
                <div className="absolute inset-0 z-[300] bg-black flex flex-col items-center justify-center">
                    <LoadingSpinner size="lg" variant="neon" />
                    <h2 className="mt-6 text-xl font-black uppercase tracking-[0.3em] text-cyan-400 animate-pulse">Preparing Studio</h2>
                    <p className="mt-2 text-xs text-gray-500 font-mono">Caching media for instant playback...</p>
                </div>
            )}

            {/* HEADER */}
            <div className="h-14 bg-[#1a1a1a] border-b border-white/5 flex items-center justify-between px-6 shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors">
                        <span className="text-xl">✕</span>
                    </button>
                    <div className="h-6 w-[1px] bg-white/10 mx-2"></div>
                    <div>
                        <h1 className="text-sm font-bold text-white tracking-wide uppercase">Video Editor</h1>
                        <p className="text-[10px] text-gray-500 font-mono">{formatTime(currentTime)} / {formatTime(totalDuration)}</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button onClick={handleSaveProject} className="px-4 py-1.5 rounded-lg text-xs font-bold text-gray-400 hover:text-white hover:bg-white/10 transition-all">
                        Save Project
                    </button>
                    <button onClick={onClear} className="px-4 py-1.5 rounded-lg text-xs font-bold text-gray-400 hover:text-red-400 hover:bg-red-400/10 transition-all">
                        Clear
                    </button>
                    <button onClick={handleExportVideo} disabled={isExporting} className="px-6 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-lg shadow-cyan-500/20 transition-all flex items-center gap-2">
                        <span>💾</span> {isExporting ? "Rendering..." : "Export Video"}
                    </button>
                </div>
            </div>

            {/* RENDER PROGRESS OVERLAY */}
            {isExporting && (
                <div className="absolute inset-0 z-[200] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center">
                    <div className="w-96 p-8 bg-gray-900 border border-gray-700 rounded-2xl flex flex-col items-center">
                        <h3 className="text-white font-bold text-lg mb-2">Rendering Video</h3>
                        <div className="w-full bg-gray-800 rounded-full h-3 mb-2 overflow-hidden">
                            <div className="bg-cyan-500 h-full transition-all duration-300" style={{ width: `${exportProgress}%` }}></div>
                        </div>
                        <span className="text-cyan-400 font-mono text-sm">{exportProgress}%</span>
                    </div>
                </div>
            )}

            {/* EXPORT SETTINGS MODAL */}
            {showExportModal && (
                <div className="absolute inset-0 z-[200] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center">
                    <div className="w-96 p-8 bg-gray-900 border border-gray-700 rounded-2xl flex flex-col space-y-6">
                        <h3 className="text-white font-bold text-lg text-center border-b border-gray-800 pb-4">Export Settings</h3>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Frames Per Second (FPS)</label>
                            <select
                                value={exportFps}
                                onChange={(e) => setExportFps(Number(e.target.value))}
                                className="w-full p-3 bg-black border border-gray-800 rounded-lg text-white font-bold outline-none cursor-pointer"
                            >
                                <option value={24}>24 FPS (Cinematic)</option>
                                <option value={30}>30 FPS (Standard)</option>
                                <option value={60}>60 FPS (Smooth)</option>
                            </select>
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button onClick={() => setShowExportModal(false)} className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-bold text-xs uppercase tracking-widest">
                                Cancel
                            </button>
                            <button onClick={confirmExportVideo} className="flex-1 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-bold text-xs uppercase tracking-widest shadow-lg shadow-cyan-500/20">
                                Start Render
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MAIN CONTENT AREA */}
            <div className="flex-1 flex overflow-hidden">
                {/* ASSET SIDEBAR */}
                {sidebarOpen && (
                    <div className="w-80 bg-[#141414] border-r border-white/5 flex flex-col shrink-0 animate-in slide-in-from-left duration-300">
                        <div className="p-4 border-b border-white/5 flex flex-col gap-4">
                            <div className="flex flex-col gap-3">
                                <div className="flex flex-wrap gap-1 bg-gray-900 rounded-lg p-1">
                                    {["project", "bin", "storyline", "exports"].map((tab) => (
                                        <button
                                            key={tab}
                                            onClick={() => setSidebarTab(tab as any)}
                                            className={`flex-1 min-w-[60px] px-2 py-1.5 rounded text-[10px] font-bold transition-colors capitalize ${sidebarTab === tab ? "bg-white/10 text-white shadow-sm" : "text-gray-500 hover:text-gray-300"}`}
                                        >
                                            {tab}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            const fileInput = document.createElement('input');
                                            fileInput.type = 'file';
                                            fileInput.accept = 'audio/*';
                                            fileInput.onchange = async (e: any) => {
                                                const file = e.target.files?.[0];
                                                if (file && setAudioTracks) {
                                                    try {
                                                        const formData = new FormData();
                                                        formData.append("image", file);
                                                        formData.append("raw", "true");
                                                        if (projectId) formData.append("projectId", projectId);
                                                        const res = await apiEndpoints.uploadAssetSync(formData);
                                                        if (res.data.success && res.data.asset) {
                                                            const newAudio: AudioItem = {
                                                                id: crypto.randomUUID(),
                                                                url: res.data.asset.url,
                                                                title: file.name,
                                                                startTime: currentTime,
                                                                duration: 10000
                                                            };
                                                            setAudioTracks(prev => [...(prev || []), newAudio]);
                                                        }
                                                    } catch (err) {
                                                        console.error("Audio upload failed:", err);
                                                        alert("Failed to upload audio track.");
                                                    }
                                                }
                                            };
                                            fileInput.click();
                                        }}
                                        className="flex-1 h-9 flex items-center justify-center gap-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500 hover:text-white transition-all text-[10px] font-bold uppercase tracking-wider"
                                    >
                                        🎵 Add Audio
                                    </button>
                                    <button onClick={onAddFromLibrary} className="flex-1 h-9 flex items-center justify-center gap-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500 hover:text-white transition-all text-[10px] font-bold uppercase tracking-wider">
                                        <span>+</span> Add Media
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                            {sidebarTab === "project" && (
                                <div className="grid grid-cols-2 gap-2">
                                    {isLoadingAssets ? <div className="col-span-2 flex justify-center py-10"><LoadingSpinner /></div> : 
                                     projectAssets.filter((a: any) => a.aspectRatio !== "EXPORTED_VIDEO").map((asset: any) => (
                                        <div key={asset.id} className="relative aspect-square bg-black rounded-lg border border-white/5 overflow-hidden group cursor-pointer hover:border-cyan-500/50 transition-all"
                                             onClick={() => { setBinItems(prev => [...prev, { id: crypto.randomUUID(), url: asset.url, type: asset.type === "VIDEO" ? "VIDEO" : "IMAGE", duration: asset.type === "VIDEO" ? 5000 : 3000, originalDuration: asset.type === "VIDEO" ? 15000 : 3000, title: asset.type === "VIDEO" ? "Video Clip" : "Image Frame" }]); setSidebarTab("bin"); }}>
                                            {asset.type === "VIDEO" ? <video src={getCORSProxyUrl(asset.url)} className="w-full h-full object-cover" muted /> : <img src={getCORSProxyUrl(asset.url)} className="w-full h-full object-cover" crossOrigin="anonymous" />}
                                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm p-2">
                                                <span className="bg-cyan-600 text-white text-[9px] font-bold px-2 py-1.5 rounded uppercase shadow-lg">+ Add to Bin</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {sidebarTab === "bin" && (
                                <div className="grid grid-cols-2 gap-2">
                                    {binItems.map((item, idx) => (
                                        <div key={item.id} className="relative aspect-square bg-black rounded-lg border border-white/5 overflow-hidden group cursor-pointer hover:border-purple-500/50 transition-all"
                                             onClick={() => { setSequence(prev => [...prev, { ...item, id: crypto.randomUUID() }]); }}>
                                            {item.type === "VIDEO" ? <video src={getCORSProxyUrl(item.url)} className="w-full h-full object-cover" muted /> : <img src={getCORSProxyUrl(item.url)} className="w-full h-full object-cover" />}
                                            <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={(e) => { e.stopPropagation(); setBinItems(prev => prev.filter((_, i) => i !== idx)); }} className="w-5 h-5 bg-red-600/80 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-[10px]">✕</button>
                                            </div>
                                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm p-2">
                                                <span className="bg-purple-600 text-white text-[9px] font-bold px-2 py-1.5 rounded uppercase shadow-lg">+ Add to Sequence</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {sidebarTab === "exports" && (
                                <div className="flex flex-col gap-3">
                                    {projectAssets.filter((a: any) => a.aspectRatio === "EXPORTED_VIDEO").map((asset: any) => (
                                        <div key={asset.id} className="bg-black/40 border border-white/10 rounded-xl overflow-hidden group">
                                            <div className="aspect-video relative bg-black"><video src={getCORSProxyUrl(asset.url)} className="w-full h-full object-contain" controls /></div>
                                            <div className="p-3 flex items-center justify-between">
                                                <div className="text-[10px] text-gray-400 font-mono">{new Date(asset.createdAt).toLocaleDateString()}</div>
                                                <a href={getCORSProxyUrl(asset.url)} download target="_blank" className="text-xs font-bold text-cyan-400 hover:text-cyan-300">Download</a>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* PREVIEW VIEWPORT */}
                <div className="flex-1 bg-black relative flex flex-col items-center justify-center p-4">
                    <button onClick={() => setSidebarOpen(!sidebarOpen)} className="absolute top-4 left-4 z-10 w-8 h-8 bg-white/5 hover:bg-white/10 rounded-lg flex items-center justify-center border border-white/10 text-gray-400 transition-colors">
                        {sidebarOpen ? "◀" : "▶"}
                    </button>
                    <div className="absolute top-4 right-4 z-10 flex gap-1 bg-black/50 backdrop-blur-md p-1 rounded-lg border border-white/10">
                        {["16:9", "9:16", "1:1"].map((ratio) => (
                            <button key={ratio} onClick={() => setViewportRatio(ratio as any)} className={`px-3 py-1.5 rounded text-xs font-bold transition-all ${viewportRatio === ratio ? "bg-cyan-600 text-white" : "text-gray-400 hover:text-white hover:bg-white/10"}`}>{ratio}</button>
                        ))}
                    </div>
                    <div className="relative w-full h-full flex flex-col items-center justify-center pt-8">
                        <div className="relative bg-[#050505] rounded-lg overflow-hidden border border-white/5 shadow-2xl flex items-center justify-center group"
                             style={{ width: viewportRatio === "16:9" ? "100%" : "auto", height: viewportRatio === "16:9" ? "auto" : "100%", aspectRatio: viewportRatio === "16:9" ? "16/9" : viewportRatio === "9:16" ? "9/16" : "1/1", maxHeight: "100%", maxWidth: "100%" }}>
                            <canvas ref={canvasRef} width={1920} height={1080} className="w-full h-full object-contain" />
                            <button onClick={handleSnapshot} disabled={isCapturingFrame} className="absolute bottom-4 right-4 z-20 w-10 h-10 bg-black/50 hover:bg-cyan-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-xl">
                                {isCapturingFrame ? <LoadingSpinner size="sm" /> : "📸"}
                            </button>
                        </div>
                        <div className="h-16 flex items-center justify-center gap-8 mt-4">
                            <button className="text-gray-500 hover:text-white" onClick={() => handleSeek(internalTimeRef.current - 5000)}>⏪</button>
                            <button onClick={handleTogglePlay} className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform shadow-xl">{isPlaying ? "⏸" : "▶"}</button>
                            <button className="text-gray-500 hover:text-white" onClick={() => handleSeek(internalTimeRef.current + 5000)}>⏩</button>
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
                            <input type="range" min="0.1" max="10" step="0.1" value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} className="w-24 accent-cyan-500 h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer" />
                            <button onClick={handleZoomFit} className="px-2 py-0.5 bg-white/5 hover:bg-white/10 text-[9px] font-bold text-gray-400 hover:text-white rounded border border-white/10 transition-colors">Fit</button>
                        </div>
                        <div className="text-[10px] font-mono text-cyan-400 font-bold bg-cyan-500/10 px-2 py-0.5 rounded">{formatTime(currentTime)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                        {sequence.find(i => i.id === selectedItemId)?.type === "VIDEO" && (
                            <select value={sequence.find(i => i.id === selectedItemId)?.speed || 1} onChange={(e) => { const speed = parseFloat(e.target.value); setSequence(prev => prev.map(item => item.id === selectedItemId ? { ...item, speed } : item)); }}
                                    className="bg-gray-900 border border-white/10 text-[10px] text-cyan-400 font-bold rounded px-2 py-1 outline-none cursor-pointer">
                                {[0.5, 1, 2, 4, 8].map(s => <option key={s} value={s}>{s}x Speed</option>)}
                            </select>
                        )}
                        <button onClick={handleSplit} className="text-[10px] font-bold text-gray-500 hover:text-white px-3 py-1 bg-white/5 rounded">✂ Split</button>
                        <button onClick={handleDeleteSelected} className="text-[10px] font-bold text-red-500/70 hover:text-red-400 px-3 py-1 bg-red-500/10 rounded">🗑 Delete</button>
                    </div>
                </div>

                <div className="flex-1 overflow-x-auto overflow-y-hidden relative custom-scrollbar-h" style={{ scrollBehavior: 'smooth' }}>
                    <div ref={timelineRef} className="h-full relative py-6" style={{ width: `${Math.max(100, (timelineWidthPx / (timelineRef.current?.parentElement?.clientWidth || 1)) * 100)}%`, minWidth: '100%' }} onMouseDown={handleTimelineMouseDown}>
                        {/* Time Rulers */}
                        <div className="absolute top-0 left-0 right-0 h-6 flex items-end border-b border-white/5 bg-black/20 pointer-events-none">
                            {Array.from({ length: Math.ceil(totalDuration / 1000) + 1 }).map((_, i) => (
                                <div key={i} className="border-l border-gray-600 h-3 flex-shrink-0" style={{ width: `${1000 * pixelsPerMs}px`, minWidth: '1px' }}>
                                    <span className="text-[7px] ml-1 text-gray-500 font-mono">{i}s</span>
                                </div>
                            ))}
                        </div>
                        {/* Markers (Cyan Dots) */}
                        <div className="absolute top-6 left-0 right-0 h-4 z-10">
                            {markers.map(marker => (
                                <div key={marker.id} className="absolute top-0 w-3 h-3 bg-cyan-400 rounded-sm transform -rotate-45 -translate-x-1/2 cursor-pointer hover:bg-white shadow-[0_0_8px_rgba(34,211,238,0.8)]"
                                     style={{ left: `${marker.time * pixelsPerMs}px` }} onClick={(e) => { e.stopPropagation(); handleSeek(marker.time); }} />
                            ))}
                        </div>
                        {/* Video Track */}
                        <div className="relative h-24 bg-white/5 rounded-xl flex items-center px-0 mt-4 overflow-hidden" style={{ width: `${timelineWidthPx}px` }}>
                            {sequence.map((item, idx) => (
                                <div key={item.id} draggable onDragStart={() => setDraggedItemIndex(idx)} onDragOver={(e) => e.preventDefault()}
                                     onDrop={(e) => { e.preventDefault(); if (draggedItemIndex === null || draggedItemIndex === idx) return; setSequence(prev => { const newSeq = [...prev]; const [movedItem] = newSeq.splice(draggedItemIndex, 1); newSeq.splice(idx, 0, movedItem); return newSeq; }); setDraggedItemIndex(null); }}
                                     onClick={(e) => { e.stopPropagation(); setSelectedItemId(item.id); }}
                                     className={`h-20 border-r border-black/50 overflow-hidden relative transition-all cursor-pointer ${selectedItemId === item.id ? 'ring-2 ring-purple-500 z-10' : itemStartIndex === idx ? 'ring-2 ring-cyan-500' : ''}`}
                                     style={{ width: `${(item.duration || 3000) * pixelsPerMs}px` }}>
                                    {item.type === "VIDEO" ? <video src={cachedUrls.get(item.url)} className="w-full h-full object-cover opacity-50 pointer-events-none" /> : <img src={cachedUrls.get(item.url)} className="w-full h-full object-cover opacity-50 pointer-events-none" />}
                                    <div className="absolute bottom-2 left-2 text-[9px] font-bold text-white/80 truncate">{item.title || "Clip"}</div>
                                    {selectedItemId === item.id && (
                                        <>
                                            <div className="absolute left-0 top-0 bottom-0 w-2 bg-purple-500 cursor-ew-resize drag-handle" onMouseDown={(e) => handleEdgeDrag(e, item.id, 'left')} />
                                            <div className="absolute right-0 top-0 bottom-0 w-2 bg-purple-500 cursor-ew-resize drag-handle" onMouseDown={(e) => handleEdgeDrag(e, item.id, 'right')} />
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                        {/* Audio Track */}
                        <div className="relative h-12 bg-emerald-500/5 rounded-xl flex items-center px-0 mt-2 border border-emerald-500/10 overflow-hidden" style={{ width: `${timelineWidthPx}px` }}>
                            {audioTracks?.map((track) => (
                                <div key={track.id} 
                                     onClick={(e) => { e.stopPropagation(); setSelectedItemId(track.id); }}
                                     className={`h-10 bg-emerald-500/20 border border-emerald-500/40 rounded-lg absolute flex items-center px-3 cursor-pointer transition-all ${selectedItemId === track.id ? 'ring-2 ring-white z-10' : ''}`}
                                     style={{ 
                                         left: `${track.startTime * pixelsPerMs}px`,
                                         width: `${track.duration * pixelsPerMs}px` 
                                     }}>
                                    <span className="text-[9px] font-bold text-emerald-400 truncate">🎵 {track.title}</span>
                                </div>
                            ))}
                        </div>
                        {/* Playhead (The Vertical Line) */}
                        <div ref={playheadRef} className="absolute top-0 bottom-0 w-[2px] bg-cyan-400 shadow-[0_0_20px_rgba(34,211,238,1)] z-20 pointer-events-none" style={{ left: 0 }}>
                            <div className="w-3.5 h-3.5 bg-cyan-400 rounded-full -ml-[6px] -mt-1.5 shadow-[0_0_15px_rgba(34,211,238,1)] border-2 border-white/30"></div>
                            <div className="absolute top-0 bottom-0 w-[6px] -left-[2px] bg-cyan-400/10 blur-sm"></div>
                        </div>
                    </div>
                </div>
            </div>
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
                .custom-scrollbar-h::-webkit-scrollbar { height: 4px; }
                .custom-scrollbar-h::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar-h::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
            `}</style>
        </div>
    );
}
