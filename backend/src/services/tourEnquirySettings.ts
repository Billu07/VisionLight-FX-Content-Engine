/**
 * A tour page's enquiry button ("Book a viewing", "Ask a question" …), stored in
 * Organization.tourSettings.enquiries. Pure — the public drift payload (routes/drift.ts)
 * and the page routes (routes/driftFlows.ts) both read it without importing each other.
 */

export const ENQUIRY_LABEL_MAX = 28;
export const DEFAULT_ENQUIRY_LABEL = "Book a viewing";

export type EnquirySettings = { enabled: boolean; label: string; askPhone: boolean };

export function enquirySettingsOf(tourSettings: unknown): EnquirySettings {
  const raw = tourSettings && typeof tourSettings === "object" ? (tourSettings as Record<string, unknown>).enquiries : null;
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const label = typeof s.label === "string" ? s.label.trim().slice(0, ENQUIRY_LABEL_MAX) : "";
  return { enabled: s.enabled === true, label: label || DEFAULT_ENQUIRY_LABEL, askPhone: s.askPhone === true };
}

/** What the player needs to show the button — null while it's switched off. */
export function publicEnquiry(tourSettings: unknown): { label: string; askPhone: boolean } | null {
  const e = enquirySettingsOf(tourSettings);
  return e.enabled ? { label: e.label, askPhone: e.askPhone } : null;
}

/** The settings an admin saves (anything malformed falls back to off / the default label). */
export const parseEnquirySettings = (v: unknown): EnquirySettings => enquirySettingsOf({ enquiries: v });
