import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { uploadToCloudinary, uploadFileToR2 } from './utils';
import { prisma } from '../database';

/**
 * Background worker to generate lightweight proxies and timeline sprite sheets
 * for zero-latency video editing.
 */
export const processVideoAssetBackground = async (assetId: string, sourceUrl: string, userId: string) => {
    const tempId = crypto.randomUUID();
    const tempDir = os.tmpdir();
    
    // Create a specific folder for HLS chunks to avoid clutter
    const hlsDir = path.join(tempDir, `hls_${tempId}`);
    if (!fs.existsSync(hlsDir)) {
        fs.mkdirSync(hlsDir);
    }
    
    const hlsPlaylistPath = path.join(hlsDir, 'playlist.m3u8');
    const spriteSheetPath = path.join(tempDir, `${tempId}_spritesheet.jpg`);

    try {
        console.log(`[Processor] 🚀 Starting background processing for Asset ${assetId}`);

        // 1. Generate 480p HLS Stream (Fast Decode)
        console.log(`[Processor] Generating HLS Stream...`);
        await new Promise((resolve, reject) => {
            ffmpeg(sourceUrl)
                .outputOptions([
                    '-vf scale=-2:480',
                    '-c:v libx264',
                    '-preset veryfast',
                    '-crf 28',
                    '-c:a aac',
                    '-b:a 128k',
                    '-hls_time 2', // 2 second chunks for fast seeking
                    '-hls_playlist_type vod',
                    '-hls_segment_filename', path.join(hlsDir, 'segment_%03d.ts')
                ])
                .output(hlsPlaylistPath)
                .on('end', resolve)
                .on('error', reject)
                .run();
        });
        
        console.log(`[Processor] ✅ HLS Stream generated for Asset ${assetId}`);

        // 2. Generate Sprite Sheet (1 frame per second)
        console.log(`[Processor] Generating Timeline Sprite Sheet...`);
        await new Promise((resolve, reject) => {
            // Extracts 1 frame per second, scales to 120px height, tiles them horizontally
            ffmpeg(sourceUrl)
                .outputOptions([
                    '-vf fps=1,scale=-2:120,tile=1000x1'
                ])
                .frames(1)
                .output(spriteSheetPath)
                .on('end', resolve)
                .on('error', reject)
                .run();
        });
        
        console.log(`[Processor] ✅ Sprite sheet generated for Asset ${assetId}`);

        // 3. Upload HLS Files to R2
        console.log(`[Processor] Uploading HLS chunks to Storage...`);
        const hlsFiles = fs.readdirSync(hlsDir);
        let finalHlsUrl = "";
        
        // Upload all files in parallel
        await Promise.all(hlsFiles.map(async (file) => {
            const filePath = path.join(hlsDir, file);
            const fileBuffer = fs.readFileSync(filePath);
            const fileExt = path.extname(file);
            const contentType = fileExt === '.m3u8' ? 'application/vnd.apple.mpegurl' : 'video/MP2T';
            const r2Key = `visionlight/user_${userId}/hls/${assetId}/${file}`;
            
            const uploadedUrl = await uploadFileToR2(fileBuffer, r2Key, contentType);
            if (file === 'playlist.m3u8') {
                finalHlsUrl = uploadedUrl;
            }
        }));

        // 4. Upload Sprite Sheet
        const spriteBuffer = fs.readFileSync(spriteSheetPath);
        const spriteSheetUrl = await uploadToCloudinary(spriteBuffer, `sprite_${assetId}`, userId, 'Sprite', 'image');

        // 5. Update Database
        await prisma.asset.update({
            where: { id: assetId },
            data: {
                hlsUrl: finalHlsUrl,
                spriteSheetUrl
            }
        });
        console.log(`[Processor] 🎯 Asset ${assetId} fully processed and updated with HLS.`);

    } catch (e) {
        console.error(`[Processor] ❌ Failed to process Asset ${assetId}:`, e);
    } finally {
        // Cleanup temp files
        if (fs.existsSync(hlsDir)) {
            fs.readdirSync(hlsDir).forEach(f => fs.unlinkSync(path.join(hlsDir, f)));
            fs.rmdirSync(hlsDir);
        }
        if (fs.existsSync(spriteSheetPath)) fs.unlinkSync(spriteSheetPath);
    }
};
