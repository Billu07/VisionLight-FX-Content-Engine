import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { uploadToCloudinary } from './utils';
import { prisma } from '../database';

/**
 * Background worker to generate lightweight proxies and timeline sprite sheets
 * for zero-latency video editing.
 */
export const processVideoAssetBackground = async (assetId: string, sourceUrl: string, userId: string) => {
    const tempId = crypto.randomUUID();
    const tempDir = os.tmpdir();
    const proxyPath = path.join(tempDir, `${tempId}_proxy.mp4`);
    const spriteSheetPath = path.join(tempDir, `${tempId}_spritesheet.jpg`);

    try {
        console.log(`[Processor] 🚀 Starting background processing for Asset ${assetId}`);

        // 1. Generate 480p Proxy (Fast Decode)
        console.log(`[Processor] Generating 480p Proxy...`);
        await new Promise((resolve, reject) => {
            ffmpeg(sourceUrl)
                .outputOptions([
                    '-vf scale=-2:480',
                    '-c:v libx264',
                    '-preset veryfast',
                    '-crf 28',
                    '-c:a aac',
                    '-b:a 128k',
                    '-movflags +faststart' // Optimize for instant web streaming
                ])
                .output(proxyPath)
                .on('end', resolve)
                .on('error', reject)
                .run();
        });
        
        console.log(`[Processor] ✅ Proxy generated for Asset ${assetId}`);

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

        // 3. Upload to Storage (Using the existing R2 uploadToCloudinary wrapper)
        const proxyBuffer = fs.readFileSync(proxyPath);
        const spriteBuffer = fs.readFileSync(spriteSheetPath);
        
        const proxyUrl = await uploadToCloudinary(proxyBuffer, `proxy_${assetId}`, userId, 'Proxy', 'video');
        const spriteSheetUrl = await uploadToCloudinary(spriteBuffer, `sprite_${assetId}`, userId, 'Sprite', 'image');

        // 4. Update Database
        await prisma.asset.update({
            where: { id: assetId },
            data: {
                proxyUrl,
                spriteSheetUrl
            }
        });
        console.log(`[Processor] 🎯 Asset ${assetId} fully processed and updated.`);

    } catch (e) {
        console.error(`[Processor] ❌ Failed to process Asset ${assetId}:`, e);
    } finally {
        // Cleanup temp files
        if (fs.existsSync(proxyPath)) fs.unlinkSync(proxyPath);
        if (fs.existsSync(spriteSheetPath)) fs.unlinkSync(spriteSheetPath);
    }
};
