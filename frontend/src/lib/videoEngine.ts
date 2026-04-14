/**
 * Industrial-Grade Video Engine Library
 * Handles Blob Caching and high-performance asset management for the Video Editor.
 */

class AssetCache {
  private cache: Map<string, string> = new Map();
  private loading: Map<string, Promise<string>> = new Map();

  /**
   * Fetches an asset as a Blob and returns a local ObjectURL.
   * Caches results to prevent redundant network requests.
   */
  async getAssetUrl(url: string, getCORSProxyUrl: (url: string) => string): Promise<string> {
    if (this.cache.has(url)) return this.cache.get(url)!;
    if (this.loading.has(url)) return this.loading.get(url)!;

    const loadPromise = (async () => {
      try {
        const response = await fetch(getCORSProxyUrl(url));
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        this.cache.set(url, objectUrl);
        return objectUrl;
      } catch (error) {
        console.error("VideoEngine: Failed to cache asset:", url, error);
        return getCORSProxyUrl(url); // Fallback to proxied URL if blob fetch fails
      } finally {
        this.loading.delete(url);
      }
    })();

    this.loading.set(url, loadPromise);
    return loadPromise;
  }

  /**
   * Clears specific asset from cache and revokes ObjectURL to free memory.
   */
  releaseAsset(url: string) {
    const objectUrl = this.cache.get(url);
    if (objectUrl && objectUrl.startsWith("blob:")) {
      URL.revokeObjectURL(objectUrl);
    }
    this.cache.delete(url);
  }

  /**
   * Wipes entire cache. Use when closing the editor.
   */
  clearAll() {
    this.cache.forEach((objectUrl) => {
      if (objectUrl.startsWith("blob:")) URL.revokeObjectURL(objectUrl);
    });
    this.cache.clear();
    this.loading.clear();
  }
}

export const videoEngine = new AssetCache();
