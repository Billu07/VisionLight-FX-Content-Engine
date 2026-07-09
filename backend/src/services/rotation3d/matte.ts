import { createFalClient } from "@fal-ai/client";
import axios from "axios";
import { Blob as NodeBlob } from "buffer";
import { FAL_KEY } from "../engine/config";

/**
 * Per-frame background removal for Rotation3D via Fal (GPU — keeps CPU load off
 * the shared VPS). Isolated Fal client with the platform key so it never races
 * with the studio's per-tenant fal.config. Returns a transparent PNG buffer, or
 * null on any failure so the pipeline can fall back to the opaque frame.
 */

const client = FAL_KEY ? createFalClient({ credentials: FAL_KEY }) : null;

export const matteEnabled = (): boolean => !!client;

export const matteFrame = async (png: Buffer): Promise<Buffer | null> => {
  if (!client) return null;
  try {
    const blob = new NodeBlob([png], { type: "image/png" });
    const url = await client.storage.upload(blob);
    const result: any = await client.subscribe("fal-ai/birefnet", {
      input: { image_url: url, output_format: "png" },
    });
    const outUrl = result?.data?.image?.url || result?.image?.url;
    if (!outUrl) return null;
    const resp = await axios.get(outUrl, {
      responseType: "arraybuffer",
      timeout: 60000,
    });
    return Buffer.from(resp.data);
  } catch (e: any) {
    console.error("[r3d] matte error:", e?.message);
    return null;
  }
};
