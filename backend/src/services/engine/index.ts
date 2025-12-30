import { assetsLogic } from "./assets";
import { imageLogic } from "./images";
import { videoLogic } from "./video";
import { uploadToCloudinary, downloadAndOptimizeImages } from "./utils";

export const contentEngine = {
  ...assetsLogic,
  ...imageLogic,
  ...videoLogic,
  uploadToCloudinary,
  downloadAndOptimizeImages,
};
