import { useEffect, useMemo, useState, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { apiEndpoints } from "../lib/api";
import { notify } from "../lib/notifications";
import { LoadingSpinner } from "./LoadingSpinner";

interface StockPhoto {
  id: number;
  width: number;
  height: number;
  alt: string;
  avgColor: string;
  photographer: string;
  photographerUrl: string;
  pexelsUrl: string;
  preview: string;
  full: string;
}

interface StockPhotosModalProps {
  isOpen: boolean;
  onClose: () => void;
  onViewOriginals?: () => void;
}

export function StockPhotosModal({
  isOpen,
  onClose,
  onViewOriginals,
}: StockPhotosModalProps) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [photos, setPhotos] = useState<StockPhoto[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());

  const projectId = useMemo(
    () => localStorage.getItem("visionlight_active_project") || undefined,
    [],
  );

  const fetchPhotos = async (q: string, pageToLoad: number, append: boolean) => {
    if (append) setIsLoadingMore(true);
    else setIsLoading(true);
    setErrorMsg("");
    try {
      const res = await apiEndpoints.stockSearch({
        q: q || undefined,
        page: pageToLoad,
        perPage: 24,
      });
      const next: StockPhoto[] = Array.isArray(res.data?.photos)
        ? res.data.photos
        : [];
      setHasMore(Boolean(res.data?.hasMore));
      setPage(pageToLoad);
      setPhotos((prev) => (append ? [...prev, ...next] : next));
    } catch (error: any) {
      setErrorMsg(
        error?.response?.data?.error ||
          error?.message ||
          "Failed to load stock photos.",
      );
      if (!append) setPhotos([]);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setPhotos([]);
    setSavedIds(new Set());
    setSubmittedQuery("");
    setQuery("");
    void fetchPhotos("", 1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    setSubmittedQuery(trimmed);
    void fetchPhotos(trimmed, 1, false);
  };

  const handleSave = async (photo: StockPhoto) => {
    if (savingId !== null || savedIds.has(photo.id)) return;
    setSavingId(photo.id);
    try {
      await apiEndpoints.stockSave({ url: photo.full, projectId });
      setSavedIds((prev) => new Set(prev).add(photo.id));
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      if (onViewOriginals) {
        notify.successAction("Saved to Asset Library (Originals).", {
          label: "View Originals",
          onClick: () => onViewOriginals(),
        });
      } else {
        notify.success("Saved to Asset Library (Originals).");
      }
    } catch (error: any) {
      notify.error(
        error?.response?.data?.error ||
          error?.message ||
          "Failed to save photo.",
      );
    } finally {
      setSavingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 backdrop-blur-sm p-3 sm:p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="bg-[#0f111a] border border-gray-800 rounded-2xl w-full max-w-6xl h-[88vh] sm:h-[85vh] flex flex-col shadow-2xl overflow-hidden"
          >
            {/* Header + search */}
            <div className="px-4 sm:px-6 py-4 border-b border-gray-800 bg-[#0f111a]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-white tracking-tight">
                    Stock Media Library
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Search free photos from Pexels and add them straight to your Originals.
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors font-mono text-sm"
                >
                  ✕
                </button>
              </div>
              <form onSubmit={handleSearch} className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search photos (e.g. mountains, coffee, city)…"
                  className="flex-1 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-cyan-500"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-cyan-500"
                >
                  Search
                </button>
              </form>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#0b0d14] p-4">
              {isLoading ? (
                <div className="flex h-full items-center justify-center">
                  <LoadingSpinner size="lg" variant="neon" />
                </div>
              ) : errorMsg ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <p className="max-w-md text-sm text-rose-300">{errorMsg}</p>
                  <button
                    type="button"
                    onClick={() => void fetchPhotos(submittedQuery, 1, false)}
                    className="rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-xs font-bold text-gray-200 hover:bg-gray-800"
                  >
                    Try again
                  </button>
                </div>
              ) : photos.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-gray-500">
                  No photos found. Try a different search.
                </div>
              ) : (
                <>
                  <div className="columns-2 gap-3 sm:columns-3 lg:columns-4">
                    {photos.map((photo) => {
                      const saved = savedIds.has(photo.id);
                      const saving = savingId === photo.id;
                      return (
                        <div
                          key={photo.id}
                          className="group relative mb-3 break-inside-avoid overflow-hidden rounded-lg border border-gray-800"
                        >
                          <img
                            src={photo.preview}
                            alt={photo.alt}
                            loading="lazy"
                            style={{ backgroundColor: photo.avgColor }}
                            className="w-full"
                          />
                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                            <a
                              href={photo.photographerUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="pointer-events-auto truncate text-[10px] font-medium text-gray-200 underline decoration-gray-500 underline-offset-2 hover:text-white"
                              title={`Photo by ${photo.photographer} on Pexels`}
                            >
                              {photo.photographer}
                            </a>
                            <button
                              type="button"
                              onClick={() => void handleSave(photo)}
                              disabled={saved || savingId !== null}
                              className={`pointer-events-auto shrink-0 rounded-md px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                                saved
                                  ? "border border-emerald-400/40 bg-emerald-500/20 text-emerald-200"
                                  : "bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-60"
                              }`}
                            >
                              {saved ? (
                                "✓ Added"
                              ) : saving ? (
                                <span className="inline-flex items-center gap-1">
                                  <LoadingSpinner size="sm" variant="light" />
                                  Saving
                                </span>
                              ) : (
                                "Add to Library"
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {hasMore && (
                    <div className="flex justify-center pt-2">
                      <button
                        type="button"
                        onClick={() => void fetchPhotos(submittedQuery, page + 1, true)}
                        disabled={isLoadingMore}
                        className="rounded-lg border border-gray-700 bg-gray-900 px-5 py-2 text-xs font-bold uppercase tracking-widest text-gray-200 transition-colors hover:bg-gray-800 disabled:opacity-60"
                      >
                        {isLoadingMore ? "Loading…" : "Load more"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Attribution footer (Pexels requirement) */}
            <div className="flex items-center justify-between border-t border-gray-800 px-4 sm:px-6 py-2 text-[10px] text-gray-500">
              <span>Photos provided by Pexels</span>
              <a
                href="https://www.pexels.com"
                target="_blank"
                rel="noreferrer"
                className="underline decoration-gray-700 underline-offset-4 hover:text-white"
              >
                Pexels.com
              </a>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
