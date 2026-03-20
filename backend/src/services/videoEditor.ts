import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import fs from "fs";
import path from "path";
import os from "os";
import axios from "axios";
import crypto from "crypto";
import { uploadToCloudinary } from "./engine/utils";
import { dbService } from "./database";

// Set the path to the statically downloaded ffmpeg binary
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

export interface SequenceItem {
  id: string;
  url: string;
  type: "IMAGE" | "VIDEO" | "CAROUSEL";
  duration?: number;
  trimStart?: number;
  speed?: number;
}

export interface AudioItem {
  id: string;
  url: string;
  startTime: number;
  duration: number;
  trimStart?: number;
  volume?: number;
}

export interface EditorState {
  sequence: SequenceItem[];
  audioTracks?: AudioItem[];
}

const downloadFile = async (url: string, outputPath: string): Promise<void> => {
  const writer = fs.createWriteStream(outputPath);
  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
  });
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
};

const processClip = (inputPath: string, outputPath: string, item: SequenceItem): Promise<void> => {
  return new Promise((resolve, reject) => {
    const durationSec = (item.duration || 3000) / 1000;
    const command = ffmpeg(inputPath);

    // Standardize output to 1080p, 30fps, with padding to avoid aspect ratio stretching
    let videoFilter = `scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1:1,fps=30`;

    if (item.type === "IMAGE") {
      command.inputOptions(["-loop 1"]);
      command.duration(durationSec);
    } else if (item.type === "VIDEO") {
      const trimStartSec = (item.trimStart || 0) / 1000;
      const speed = item.speed || 1;
      
      // Trim first
      command.setStartTime(trimStartSec);
      // We set duration *before* speed adjustment so we capture the right amount of source footage
      // Wait, if we want the FINAL clip to be durationSec, we need durationSec * speed of source.
      const sourceDurationToCapture = durationSec * speed;
      command.setDuration(sourceDurationToCapture);

      if (speed !== 1) {
        // Adjust speed using setpts
        videoFilter += `,setpts=${1 / speed}*PTS`;
      }
    }

    command
      .videoFilter(videoFilter)
      .outputOptions([
        "-c:v libx264",
        "-pix_fmt yuv420p",
        "-an", // Strip audio from individual clips; we'll add it in the final mix
      ])
      .save(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => {
        console.error(`Error processing clip ${inputPath}:`, err);
        reject(err);
      });
  });
};

const concatClips = (inputFiles: string[], outputPath: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    // Create a concat demuxer text file
    const listPath = path.join(path.dirname(outputPath), "concat_list.txt");
    const listContent = inputFiles.map(file => `file '${file.replace(/'/g, "'\\''")}'`).join("\n");
    fs.writeFileSync(listPath, listContent);

    ffmpeg()
      .input(listPath)
      .inputOptions(["-f concat", "-safe 0"])
      .outputOptions(["-c copy"]) // We can stream copy because all clips are standardized!
      .save(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err));
  });
};

const mixAudio = (videoPath: string, audioTracks: AudioItem[], outputPath: string, tempDir: string): Promise<void> => {
  return new Promise(async (resolve, reject) => {
    if (!audioTracks || audioTracks.length === 0) {
      // Just copy if no audio
      fs.copyFileSync(videoPath, outputPath);
      return resolve();
    }

    const command = ffmpeg(videoPath);
    let filterComplex = "";
    
    // Add all audio inputs
    for (let i = 0; i < audioTracks.length; i++) {
      const audio = audioTracks[i];
      const audioLocalPath = path.join(tempDir, `audio_${i}.mp3`);
      await downloadFile(audio.url, audioLocalPath);
      command.input(audioLocalPath);
      
      const startSec = audio.startTime / 1000;
      const durationSec = audio.duration / 1000;
      const volume = audio.volume !== undefined ? audio.volume : 1;
      
      // Delay audio to its start time, trim it, and set volume
      // [1:a]atrim=0:10,adelay=5000|5000,volume=1.0[a1];
      filterComplex += `[${i + 1}:a]atrim=0:${durationSec},adelay=${startSec * 1000}|${startSec * 1000},volume=${volume}[a${i + 1}];`;
    }

    // Mix all processed audio streams together
    const mixInputs = audioTracks.map((_, i) => `[a${i + 1}]`).join("");
    filterComplex += `${mixInputs}amix=inputs=${audioTracks.length}:duration=longest[aout]`;

    command
      .complexFilter(filterComplex)
      .outputOptions([
        "-map 0:v",     // Take video from the first input (index 0)
        "-map [aout]",  // Take mixed audio from the complex filter
        "-c:v copy",    // Don't re-encode video
        "-c:a aac",     // Encode audio to AAC
        "-shortest"     // End when the shortest stream ends (usually the video)
      ])
      .save(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err));
  });
};

const cleanUrl = (url: string) => {
  if (url.includes("/api/proxy-image?url=")) {
    return decodeURIComponent(url.split("/api/proxy-image?url=")[1]);
  }
  return url;
};

export const renderVideoSequence = async (
  editorState: EditorState,
  userId: string,
  projectId?: string
): Promise<string> => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "visionlight-render-"));
  
  try {
    const { sequence, audioTracks } = editorState;

    if (!sequence || sequence.length === 0) {
      throw new Error("Timeline is empty.");
    }

    const processedClips: string[] = [];

    // 1. Download and process each sequence item into a standard MP4
    for (let i = 0; i < sequence.length; i++) {
      const item = sequence[i];
      const ext = item.type === "VIDEO" ? ".mp4" : ".jpg";
      const localPath = path.join(tempDir, `raw_clip_${i}${ext}`);
      const processedPath = path.join(tempDir, `processed_clip_${i}.mp4`);

      const rawUrl = cleanUrl(item.url);
      console.log(`Downloading ${rawUrl} to ${localPath}...`);
      await downloadFile(rawUrl, localPath);

      console.log(`Processing clip ${i}...`);
      await processClip(localPath, processedPath, item);
      processedClips.push(processedPath);
    }
    
    // 2. Concat the standardized clips
    const concatenatedVideoPath = path.join(tempDir, "concatenated.mp4");
    console.log(`Concatenating ${processedClips.length} clips...`);
    await concatClips(processedClips, concatenatedVideoPath);

    // 3. Mix audio tracks
    const finalOutputPath = path.join(tempDir, "final_output.mp4");
    console.log(`Mixing audio tracks...`);
    
    // Clean audio urls too
    const cleanAudioTracks = (audioTracks || []).map(a => ({ ...a, url: cleanUrl(a.url) }));
    await mixAudio(concatenatedVideoPath, cleanAudioTracks, finalOutputPath, tempDir);

    // 4. Upload to Cloudinary / R2
    console.log(`Uploading final render...`);
    const fileBuffer = fs.readFileSync(finalOutputPath);
    const finalUrl = await uploadToCloudinary(
      fileBuffer,
      `render_${userId}_${Date.now()}`,
      userId,
      "Exported Video",
      "video"
    );

    // 5. Save to database as an Asset
    const dbAsset = await dbService.createAsset(
      userId,
      finalUrl,
      "EXPORTED_VIDEO",
      "VIDEO",
      undefined,
      projectId,
      fileBuffer.length
    );

    return finalUrl;
  } catch (err) {
      console.error("Rendering failed:", err);
      throw err;
  } finally {
      // Clean up temp directory
      fs.rmSync(tempDir, { recursive: true, force: true });
  }
};
