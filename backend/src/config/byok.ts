export type ByokPackageCode =
  | "BYOK_TRIAL"
  | "PD_APP"
  | "VFX_APP"
  | "PD_STUDIO"
  | "VFX_STUDIO"
  | "VFX_STUDIO_AGENCY";

export type ByokProvisioningSource = "BYOK" | "MANUAL";

export type ByokView = "PICDRIFT" | "VISIONLIGHT";

export type ByokPackageConfig = {
  code: ByokPackageCode;
  title: string;
  view: ByokView;
  routingDomain: string;
  maxUsers: number;
  maxProjectsTotal: number;
  ownerMaxProjects: number;
  maxStorageMb: number;
  storageRetentionDays: number | null;
  adminPanelLocked: boolean;
  renderDailyLimit: number | null;
  trialDays: number | null;
  lockExtraSeats: boolean;
};

const normalizeDomain = (raw?: string | null): string => {
  if (!raw) return "";
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return "";
  const withoutProtocol = trimmed.replace(/^https?:\/\//, "");
  const host = withoutProtocol.split("/")[0]?.replace(/:\d+$/, "").replace(/\.$/, "");
  return host || "";
};

export const BYOK_DOMAINS = {
  byok: normalizeDomain(process.env.BYOK_CANONICAL_DOMAIN || "byok.link"),
  picdriftApp: normalizeDomain(process.env.PICDRIFT_APP_CANONICAL_DOMAIN || "picdrift.app"),
  visualfxApp: normalizeDomain(process.env.VISUALFX_APP_CANONICAL_DOMAIN || "visualfx.app"),
  picdriftStudio: normalizeDomain(process.env.PICDRIFT_CANONICAL_DOMAIN || "picdrift.studio"),
  visualfxStudio: normalizeDomain(process.env.VISIONLIGHT_CANONICAL_DOMAIN || process.env.VISUALFX_CANONICAL_DOMAIN || "visualfx.studio"),
};

export const BYOK_PACKAGE_ORDER: ByokPackageCode[] = [
  "PD_APP",
  "VFX_APP",
  "PD_STUDIO",
  "VFX_STUDIO",
  "VFX_STUDIO_AGENCY",
];

export const BYOK_PACKAGE_CONFIG: Record<ByokPackageCode, ByokPackageConfig> = {
  BYOK_TRIAL: {
    code: "BYOK_TRIAL",
    title: "BYOK Trial",
    view: "VISIONLIGHT",
    routingDomain: BYOK_DOMAINS.byok,
    maxUsers: 5,
    maxProjectsTotal: 20,
    ownerMaxProjects: 3,
    maxStorageMb: 10240,
    storageRetentionDays: null,
    adminPanelLocked: false,
    renderDailyLimit: 5,
    trialDays: 14,
    lockExtraSeats: false,
  },
  PD_APP: {
    code: "PD_APP",
    title: "PicDrift App",
    view: "PICDRIFT",
    routingDomain: BYOK_DOMAINS.picdriftApp,
    maxUsers: 1,
    maxProjectsTotal: 3,
    ownerMaxProjects: 3,
    maxStorageMb: 10240,
    storageRetentionDays: 7,
    adminPanelLocked: true,
    renderDailyLimit: null,
    trialDays: null,
    lockExtraSeats: true,
  },
  VFX_APP: {
    code: "VFX_APP",
    title: "VisualFX App",
    view: "VISIONLIGHT",
    routingDomain: BYOK_DOMAINS.visualfxApp,
    maxUsers: 1,
    maxProjectsTotal: 3,
    ownerMaxProjects: 3,
    maxStorageMb: 10240,
    storageRetentionDays: 7,
    adminPanelLocked: true,
    renderDailyLimit: null,
    trialDays: null,
    lockExtraSeats: true,
  },
  PD_STUDIO: {
    code: "PD_STUDIO",
    title: "PicDrift Studio",
    view: "PICDRIFT",
    routingDomain: BYOK_DOMAINS.picdriftStudio,
    maxUsers: 5,
    maxProjectsTotal: 20,
    ownerMaxProjects: 3,
    maxStorageMb: 1024,
    storageRetentionDays: null,
    adminPanelLocked: false,
    renderDailyLimit: null,
    trialDays: null,
    lockExtraSeats: false,
  },
  VFX_STUDIO: {
    code: "VFX_STUDIO",
    title: "VisualFX Studio",
    view: "VISIONLIGHT",
    routingDomain: BYOK_DOMAINS.visualfxStudio,
    maxUsers: 5,
    maxProjectsTotal: 20,
    ownerMaxProjects: 3,
    maxStorageMb: 1024,
    storageRetentionDays: null,
    adminPanelLocked: false,
    renderDailyLimit: null,
    trialDays: null,
    lockExtraSeats: false,
  },
  VFX_STUDIO_AGENCY: {
    code: "VFX_STUDIO_AGENCY",
    title: "VisualFX Studio Agency",
    view: "VISIONLIGHT",
    routingDomain: BYOK_DOMAINS.visualfxStudio,
    maxUsers: 20,
    maxProjectsTotal: 200,
    ownerMaxProjects: 10,
    maxStorageMb: 5120,
    storageRetentionDays: null,
    adminPanelLocked: false,
    renderDailyLimit: null,
    trialDays: null,
    lockExtraSeats: false,
  },
};

export const getByokPackageConfig = (code?: string | null) =>
  code ? BYOK_PACKAGE_CONFIG[code as ByokPackageCode] || null : null;

export const isByokHost = (host?: string | null) => {
  const normalized = normalizeDomain(host);
  if (!normalized) return false;
  return (
    normalized === BYOK_DOMAINS.byok ||
    normalized === BYOK_DOMAINS.picdriftApp ||
    normalized === BYOK_DOMAINS.visualfxApp ||
    normalized === BYOK_DOMAINS.picdriftStudio ||
    normalized === BYOK_DOMAINS.visualfxStudio
  );
};

export const normalizeByokDomain = normalizeDomain;
