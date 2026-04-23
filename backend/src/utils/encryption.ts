import CryptoJS from "crypto-js";

// We need a master encryption key to encrypt the tenant API keys before saving to the DB.
// This should be a strong random string set in your server's .env file.
const PRIMARY_KEY = process.env.TENANT_ENCRYPTION_KEY?.trim();
const SECONDARY_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const LEGACY_FALLBACK_KEY = "visionlight-fallback-secure-key-change-in-prod";

const ACTIVE_KEY = PRIMARY_KEY || SECONDARY_KEY;
if (!ACTIVE_KEY) {
  throw new Error(
    "Missing encryption key. Set TENANT_ENCRYPTION_KEY (recommended) or SUPABASE_SERVICE_ROLE_KEY.",
  );
}

if (!PRIMARY_KEY) {
  console.warn(
    "[Security] TENANT_ENCRYPTION_KEY is not set. Using fallback key source. Configure TENANT_ENCRYPTION_KEY and rotate tenant keys.",
  );
}

const DECRYPTION_KEYS = [
  PRIMARY_KEY,
  SECONDARY_KEY,
  LEGACY_FALLBACK_KEY,
].filter((value, index, list): value is string => !!value && list.indexOf(value) === index);

export const encryptionUtils = {
  /**
   * Encrypts a plaintext API key for secure storage in the database.
   */
  encrypt: (text: string | null | undefined): string | null => {
    if (!text) return null;
    try {
      return CryptoJS.AES.encrypt(text, ACTIVE_KEY).toString();
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
      for (const key of DECRYPTION_KEYS) {
        const bytes = CryptoJS.AES.decrypt(cipherText, key);
        const originalText = bytes.toString(CryptoJS.enc.Utf8);
        if (originalText) {
          return originalText;
        }
      }
      return null;
    } catch (e) {
      console.error("Decryption failed:", e);
      return null;
    }
  },
};
