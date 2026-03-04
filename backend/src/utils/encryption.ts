import CryptoJS from "crypto-js";

// We need a master encryption key to encrypt the tenant API keys before saving to the DB.
// This should be a strong random string set in your server's .env file.
const MASTER_KEY = process.env.TENANT_ENCRYPTION_KEY || "visionlight-fallback-secure-key-change-in-prod";

export const encryptionUtils = {
  /**
   * Encrypts a plaintext API key for secure storage in the database.
   */
  encrypt: (text: string | null | undefined): string | null => {
    if (!text) return null;
    try {
      return CryptoJS.AES.encrypt(text, MASTER_KEY).toString();
    } catch (e) {
      console.error("Encryption failed:", e);
      return null;
    }
  },

  /**
   * Decrypts a stored API key for use in engine requests.
   */
  decrypt: (cipherText: string | null | undefined): string | null => {
    if (!cipherText) return null;
    try {
      const bytes = CryptoJS.AES.decrypt(cipherText, MASTER_KEY);
      const originalText = bytes.toString(CryptoJS.enc.Utf8);
      return originalText || null;
    } catch (e) {
      console.error("Decryption failed:", e);
      return null;
    }
  },
};
