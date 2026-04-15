# High-Performance Video Editor Architecture (The "Proxy & Stream" Paradigm)

This document outlines the target architecture for transitioning the VisionLight-FX video editor from a "download-everything-upfront" model to an industrial-grade, zero-latency streaming editor.

## 1. Core Philosophy: The Proxy Workflow
Professional editors do not edit raw 4K/1080p source files in real-time. They edit using lightweight **Proxies**.
- **Source of Truth:** High-res original files remain on the server (e.g., Cloudflare R2 / S3).
- **Editing Media:** Tiny, low-resolution proxies (480p WebP/MP4) are streamed to the client for zero-latency editing.
- **Final Render:** When the user clicks "Export", the backend constructs the final video using the high-res originals based on the sequence data (EDL - Edit Decision List).

---

## 2. Backend Architecture (Ingestion & Processing)

When a user uploads a video, or an AI generation finishes, the backend must instantly spawn a background worker (e.g., using BullMQ or AWS SQS) to prepare the assets for the editor:

### A. Proxy Generation
- **Action:** Compress the video to a 480p, low-bitrate MP4 or WebM.
- **Why:** Reduces a 50MB file to 2MB, allowing instant browser loading.

### B. HLS / DASH Segmentation
- **Action:** Convert the proxy into an HLS (`.m3u8`) playlist with 2-second segments (`.ts` files).
- **Why:** The frontend will only download the exact 2-second chunk the playhead is currently over, eliminating the "Preparing Studio" loading screen.

### C. Sprite Sheet Extraction
- **Action:** Extract 1 frame per second and stitch them together into a single horizontal JPG (a Sprite Sheet).
- **Why:** The frontend timeline will display this single image using CSS `background-position` for thumbnails, completely eliminating the need to load video objects into memory just to show timeline previews.

---

## 3. Frontend Architecture (React + Canvas)

The frontend must be strictly separated into the **UI Layer** and the **Engine Layer**.

### A. The State Layer (Zustand)
- Move away from standard `useState` for the sequence and playhead.
- Use **Zustand** (or Redux) to manage the `sequence` state. This provides instantaneous, mutable state access outside of React components and makes implementing Undo/Redo trivial.
- **Playhead Time:** Store the current time in a mutable `useRef` to prevent React from re-rendering the entire DOM at 60fps.

### B. The Engine Layer (HLS.js + Canvas)
- **HLS Engine:** Use `hls.js` attached to hidden `<video>` elements in a pool.
- **Pre-buffering:** As the playhead moves, `hls.js` naturally predicts and fetches the upcoming 2-second chunks.
- **Canvas Rendering:** A `requestAnimationFrame` loop constantly draws the active hidden video to the visible `<canvas>`.
- **Frame Sync:** Use `video.requestVideoFrameCallback()` (if supported) to only draw when a new frame is actually decoded by the browser, saving massive GPU overhead.

### C. The UI Layer (Timeline Virtualization)
- **Virtualization:** Use `@tanstack/react-virtual` for the timeline. If a user has 100 clips, only the 5 clips currently visible on the screen will exist in the HTML DOM.
- **DOM Manipulation:** The playhead line will be manipulated directly via `playheadRef.current.style.transform` to bypass React's render cycle completely.

---

## 4. Local Caching Strategy (IndexedDB / OPFS)

Currently, the `videoEngine.ts` stores Blobs in RAM (`URL.createObjectURL`). This will eventually crash the browser on large projects.

- **Upgrade:** Integrate `localforage` (IndexedDB).
- **Workflow:** When `hls.js` fetches a video segment, intercept it and store it in IndexedDB.
- **Result:** If the user closes the tab and reopens it tomorrow, the video segments load directly from their SSD at 2000MB/s instead of fetching from your R2 bucket.

---

## 5. Step-by-Step Implementation Roadmap

**Phase 1: Backend Prep (The Foundation)**
1. Implement a processing queue on the backend.
2. Integrate `ffmpeg` on the server to generate 480p proxies and Sprite Sheets for newly generated videos.

**Phase 2: Frontend Data Shift**
1. Move the sequence and timeline state from React `useState` to a `Zustand` store.
2. Implement `@tanstack/react-virtual` on the timeline track to handle infinite clips without DOM lag.

**Phase 3: The Streaming Engine**
1. Replace `videoEngine.ts` Blob fetching with `hls.js` streams.
2. Implement CSS Sprite Sheets on the timeline items instead of hidden video tags.

**Phase 4: Export Engine**
1. Ensure the React frontend exports an "EDL" (Edit Decision List - JSON containing clip IDs, start times, trims, etc.).
2. The backend reads this EDL and uses FFmpeg to stitch the high-res original files together.