import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  apiEndpoints,
  startReadOnlyImpersonation,
  API_BASE_URL,
} from "../lib/api";
import { confirmAction } from "../lib/notifications";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { useAuth } from "../hooks/useAuth";
import { isUserCreditLimited } from "../lib/adminCredits";
import Rotation3DAdminPanel from "../rotation3d/Rotation3DAdminPanel";
import DriftAdminPanel from "../rotation3d/DriftAdminPanel";
import { DriftThemeStyles, ThemeToggle, useDriftTheme } from "../rotation3d/driftUiTheme";
import { SA_GROUPS, SA_STYLES, isLegacyTab, type SuperAdminTab } from "./superAdminShell";

type DemoView = "VISIONLIGHT" | "PICDRIFT";

const DEMO_PICKER_PAGE = 36;

// mediaUrl can be a JSON array (carousels) — take the first entry for the thumbnail.
const demoCleanUrl = (url?: string): string => {
  if (!url) return "";
  const trimmed = url.trim();
  if (trimmed.startsWith("[") && trimmed.includes("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.length > 0) return String(parsed[0]);
    } catch {
      /* ignore */
    }
  }
  return trimmed;
};

// Small, fast thumbnail: route R2 media through the backend's resizing image
// proxy (works for any R2 host, including custom domains — not just *.r2.dev).
const demoThumbUrl = (raw?: string, w = 220, q = 55): string => {
  const u = demoCleanUrl(raw);
  if (!u || !/^https?:\/\//i.test(u)) return u || "";
  if (u.includes(".m3u8") || u.includes(".ts")) return u;
  return `${API_BASE_URL}/api/proxy-image?url=${encodeURIComponent(u)}&w=${w}&q=${q}`;
};

const isDemoVideo = (url: string, type?: string) =>
  type === "VIDEO" || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);

function DemoPickTile({
  url,
  type,
  poster,
  selected,
  onClick,
}: {
  url?: string;
  type?: string;
  poster?: string;
  selected: boolean;
  onClick: () => void;
}) {
  const clean = demoCleanUrl(url);
  if (!clean) return null;
  const video = isDemoVideo(clean, type);
  // Never mount a <video> in the picker — use a small poster image (or a
  // placeholder for videos without one) so hundreds of tiles stay fast.
  const rawForThumb = video ? demoCleanUrl(poster) : clean;
  const thumb = demoThumbUrl(rawForThumb);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group sa-pick ${selected ? "on" : ""}`}
    >
      {thumb ? (
        <img
          src={thumb}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={(e) => {
            // If the resizing proxy can't serve this host, fall back to the
            // original URL so legacy/edge content never shows broken.
            const img = e.currentTarget;
            if (img.dataset.fallback || !rawForThumb) return;
            img.dataset.fallback = "1";
            img.src = rawForThumb;
          }}
        />
      ) : (
        <div className="sa-pick-ph">
          ▶
        </div>
      )}
      {video && (
        <span className="absolute bottom-1 left-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-[9px] text-white">
          ▶
        </span>
      )}
      <span
        className={`absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-black ${
          selected
            ? "bg-emerald-400 text-gray-950"
            : "bg-black/50 text-white opacity-0 group-hover:opacity-100"
        }`}
      >
        {selected ? "✓" : "+"}
      </span>
    </button>
  );
}

interface Tenant {
  id: string;
  name: string;
  isActive: boolean;
  isDefault?: boolean;
  tenantPlan?: "PAID" | "DEMO";
  trialEndsAt?: string | null;
  maxUsers: number;
  maxProjectsTotal: number;
  maxStorageMb: number;
  storageSummary?: {
    limitMb: number;
    usedMb: number;
    remainingMb: number;
    usagePercent: number;
  };
  createdAt: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  view: string;
  isDemo?: boolean;
  organizationId: string;
  creditsPicDrift: number;
  creditsPicDriftPlus: number;
  creditsImageFX: number;
  creditsVideoFX1: number;
  creditsVideoFX2: number;
  creditsVideoFX3: number;
  maxProjects?: number;
  isOrganizationOwner?: boolean;
  isProtectedFromRemoval?: boolean;
  protectionReason?: "SUPERADMIN" | "TENANT_OWNER" | null;
  createdAt?: string;
  adminNotes?: string | null;
}

interface CreditRequest {
  id: string;
  email: string;
  name?: string;
  createdAt: string;
  organization?: {
    id: string;
    name: string;
  } | null;
  user?: {
    id: string;
    email: string;
    name?: string;
    role?: string;
  } | null;
}

interface ProvisionEmailStatus {
  email: string;
  authExists: boolean;
  profileCount: number;
  existingProfileInOrganization: boolean;
  requiresPassword: boolean;
}

const COVERAGE_WALLETS = [
  { key: "creditsPicDrift", label: "PicDrift (Standard)", provider: "fal" },
  { key: "creditsPicDriftPlus", label: "Kling 3.0", provider: "fal" },
  { key: "creditsImageFX", label: "Image FX (Nano/GPT 2)", provider: "fal" },
  { key: "creditsVideoFX1", label: "Topaz Upscale", provider: "fal" },
  { key: "creditsVideoFX2", label: "Seedance 2.0", provider: "fal" },
  { key: "creditsVideoFX3", label: "H3 Max", provider: "fal" },
] as const;

type CoverageWalletKey = (typeof COVERAGE_WALLETS)[number]["key"];

const COVERAGE_VARIANTS = [
  {
    id: "picdrift_5s",
    label: "PicDrift 5s",
    provider: "fal",
    wallet: "creditsPicDrift",
    deductionKey: "pricePicDrift_5s",
  },
  {
    id: "picdrift_10s",
    label: "PicDrift 10s",
    provider: "fal",
    wallet: "creditsPicDrift",
    deductionKey: "pricePicDrift_10s",
  },
  {
    id: "picdrift_plus_5s",
    label: "Kling 3.0 5s",
    provider: "fal",
    wallet: "creditsPicDriftPlus",
    deductionKey: "pricePicDrift_Plus_5s",
  },
  {
    id: "picdrift_plus_10s",
    label: "Kling 3.0 10s",
    provider: "fal",
    wallet: "creditsPicDriftPlus",
    deductionKey: "pricePicDrift_Plus_10s",
  },
  {
    id: "picfx_nano",
    label: "Pic FX — Nano-Banana",
    provider: "fal",
    wallet: "creditsImageFX",
    deductionKey: "pricePicFX_Standard",
  },
  {
    id: "picfx_gpt2",
    label: "Pic FX — GPT-2",
    provider: "fal",
    wallet: "creditsImageFX",
    deductionKey: "pricePicFX_Standard",
  },
  {
    id: "picfx_carousel",
    label: "Pic FX Carousel",
    provider: "fal",
    wallet: "creditsImageFX",
    deductionKey: "pricePicFX_Carousel",
  },
  {
    id: "picfx_batch",
    label: "Pic FX Batch",
    provider: "fal",
    wallet: "creditsImageFX",
    deductionKey: "pricePicFX_Batch",
  },
  {
    id: "editor_pro",
    label: "Pic FX Editor",
    provider: "fal",
    wallet: "creditsImageFX",
    deductionKey: "priceEditor_Pro",
  },
  {
    id: "editor_enhance",
    label: "Image Enhance/Upscale",
    provider: "fal",
    wallet: "creditsImageFX",
    deductionKey: "priceEditor_Enhance",
  },
  {
    id: "editor_convert",
    label: "Image Format Convert",
    provider: "fal",
    wallet: "creditsImageFX",
    deductionKey: "priceEditor_Convert",
  },
  {
    id: "asset_drift_path",
    label: "3DX Drift Path",
    provider: "fal",
    wallet: "creditsPicDrift",
    deductionKey: "priceAsset_DriftPath",
  },
  {
    id: "topaz_upscale_2x",
    label: "Topaz Upscale 2x",
    provider: "fal",
    wallet: "creditsVideoFX1",
    deductionKey: "priceVideoFX1_10s",
  },
  {
    id: "topaz_upscale_4x",
    label: "Topaz Upscale 4x",
    provider: "fal",
    wallet: "creditsVideoFX1",
    deductionKey: "priceVideoFX1_15s",
  },
  {
    id: "seedance_fal_4s",
    label: "Seedance 2.0 4s",
    provider: "fal",
    wallet: "creditsVideoFX2",
    deductionKey: "priceVideoFX2_4s",
  },
  {
    id: "seedance_fal_8s",
    label: "Seedance 2.0 8s",
    provider: "fal",
    wallet: "creditsVideoFX2",
    deductionKey: "priceVideoFX2_8s",
  },
  {
    id: "seedance_fal_12s",
    label: "Seedance 2.0 12s",
    provider: "fal",
    wallet: "creditsVideoFX2",
    deductionKey: "priceVideoFX2_12s",
  },
  {
    id: "veo3_4s",
    label: "H3 Max 5–6s",
    provider: "fal",
    wallet: "creditsVideoFX3",
    deductionKey: "priceVideoFX3_4s",
  },
  {
    id: "veo3_6s",
    label: "H3 Max 7–10s",
    provider: "fal",
    wallet: "creditsVideoFX3",
    deductionKey: "priceVideoFX3_6s",
  },
  {
    id: "veo3_8s",
    label: "H3 Max 11–15s",
    provider: "fal",
    wallet: "creditsVideoFX3",
    deductionKey: "priceVideoFX3_8s",
  },
] as const;

type CoverageVariantId = (typeof COVERAGE_VARIANTS)[number]["id"];

const COST_FIELD_BY_VARIANT: Record<CoverageVariantId, string> = {
  picdrift_5s: "costPicDrift_5s",
  picdrift_10s: "costPicDrift_10s",
  picdrift_plus_5s: "costPicDrift_Plus_5s",
  picdrift_plus_10s: "costPicDrift_Plus_10s",
  picfx_nano: "costPicFX_Nano",
  picfx_gpt2: "costPicFX_Gpt2",
  picfx_carousel: "costPicFX_Carousel",
  picfx_batch: "costPicFX_Batch",
  editor_pro: "costEditor_Pro",
  editor_enhance: "costEditor_Enhance",
  editor_convert: "costEditor_Convert",
  asset_drift_path: "costAsset_DriftPath",
  topaz_upscale_2x: "costVideoFX1_10s",
  topaz_upscale_4x: "costVideoFX1_15s",
  seedance_fal_4s: "costVideoFX2_4s",
  seedance_fal_8s: "costVideoFX2_8s",
  seedance_fal_12s: "costVideoFX2_12s",
  veo3_4s: "costVideoFX3_4s",
  veo3_6s: "costVideoFX3_6s",
  veo3_8s: "costVideoFX3_8s",
};

const DEFAULT_VARIANT_COST_USD: Record<CoverageVariantId, number> = {
  picdrift_5s: 0.35,
  picdrift_10s: 0.7,
  picdrift_plus_5s: 0.56,
  picdrift_plus_10s: 1.12,
  picfx_nano: 0.12,
  picfx_gpt2: 0.155,
  picfx_carousel: 0.2,
  picfx_batch: 0.08,
  editor_pro: 0.1,
  editor_enhance: 0.12,
  editor_convert: 0.08,
  asset_drift_path: 0.35,
  topaz_upscale_2x: 0.2,
  topaz_upscale_4x: 0.3,
  seedance_fal_4s: 1.21,
  seedance_fal_8s: 2.42,
  seedance_fal_12s: 3.63,
  veo3_4s: 1.6,
  veo3_6s: 2.4,
  veo3_8s: 3.2,
};

export default function SuperAdminDashboard() {
  const { user: adminUser, checkAuth } = useAuth();
  const adminCreditLimitsEnabled = adminUser?.adminCreditLimitsEnabled === true;
  const [creditLimitsBusy, setCreditLimitsBusy] = useState(false);
  const [releaseEmailInput, setReleaseEmailInput] = useState("");
  const [releaseEmailBusy, setReleaseEmailBusy] = useState(false);
  const [userView, setUserView] = useState<
    "recent" | "oldest" | "alpha" | "demo" | "active"
  >("recent");
  const handleReleaseEmail = async () => {
    const email = releaseEmailInput.trim().toLowerCase();
    if (!email) {
      setMsg("Enter an email to release.");
      return;
    }
    if (
      !(await confirmAction(
        `Release ${email} so it can sign up again? This permanently removes any leftover account data for this email. No past data is restored.`,
        { confirmLabel: "Release" },
      ))
    ) {
      return;
    }
    setReleaseEmailBusy(true);
    try {
      const res = await apiEndpoints.superadminReleaseEmail(email);
      const d = res.data || {};
      setMsg(
        `Released ${email}. Removed ${d.profilesRemoved ?? 0} profile(s), ${d.organizationsRemoved ?? 0} org(s); auth ${d.authDeleted ? "cleared" : "not found"}. They can sign up again now.`,
      );
      setReleaseEmailInput("");
    } catch (err: any) {
      setMsg(
        "Error: " +
          (err?.response?.data?.error || err?.message || "Failed to release email."),
      );
    } finally {
      setReleaseEmailBusy(false);
    }
  };
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<SuperAdminTab>("platform");
  // One light/dark theme for the whole panel (shared with the drift.li tab).
  const [theme, toggleTheme] = useDriftTheme();

  // Demo Preview curation state
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoSaving, setDemoSaving] = useState(false);
  const [demoView, setDemoView] = useState<DemoView>("VISIONLIGHT");
  const [demoPosts, setDemoPosts] = useState<any[]>([]);
  const [demoAssets, setDemoAssets] = useState<any[]>([]);
  const [demoSelection, setDemoSelection] = useState<
    Record<DemoView, { postIds: string[]; assetIds: string[] }>
  >({
    PICDRIFT: { postIds: [], assetIds: [] },
    VISIONLIGHT: { postIds: [], assetIds: [] },
  });
  const [demoPostsVisible, setDemoPostsVisible] = useState(DEMO_PICKER_PAGE);
  const [demoAssetsVisible, setDemoAssetsVisible] = useState(DEMO_PICKER_PAGE);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [byokOrganizations, setByokOrganizations] = useState<any[]>([]);
  const [byokWebhookEvents, setByokWebhookEvents] = useState<any[]>([]);
  const [byokOpsHealth, setByokOpsHealth] = useState<any>(null);
  const [byokEventsLoading, setByokEventsLoading] = useState(false);
  const [byokEventFilters, setByokEventFilters] = useState<{
    status: string;
    packageCode: string;
    limit: number;
  }>({
    status: "",
    packageCode: "",
    limit: 80,
  });
  const [users, setUsers] = useState<User[]>([]);
  const [creditRequests, setCreditRequests] = useState<CreditRequest[]>([]);
  const [globalSettings, setGlobalSettings] = useState<any>(null);
  const [presets, setPresets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [enteringDashboardUserId, setEnteringDashboardUserId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  // Modals
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [showAddTeamModal, setShowAddTeamModal] = useState(false);
  const [showPresetModal, setShowPresetModal] = useState(false);

  // Edit Preset State
  const [editingPreset, setEditingPreset] = useState<any | null>(null);
  const [presetForm, setPresetForm] = useState({
    name: "",
    prompt: "",
    isActive: true
  });

  // Editor (PicFX + Convert) Preset State — isolated from the shared presets above
  const [editorPresets, setEditorPresets] = useState<any[]>([]);
  const [showEditorPresetModal, setShowEditorPresetModal] = useState(false);
  const [editingEditorPreset, setEditingEditorPreset] = useState<any | null>(null);
  const [editorPresetForm, setEditorPresetForm] = useState({
    name: "",
    prompt: "",
    isActive: true
  });

  // Restore Missing States
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [tenantUpdates, setTenantUpdates] = useState({
    name: "",
    maxUsers: 0,
    maxProjectsTotal: 0,
    maxStorageMb: 10240,
    view: "VISIONLIGHT",
    isActive: true,
  });
  const [planPackageCode, setPlanPackageCode] = useState("VFX_STUDIO");
  const [planDemoDays, setPlanDemoDays] = useState(14);

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userUpdates, setUserUpdates] = useState({
    view: "VISIONLIGHT",
    role: "USER",
    maxProjects: 3,
  });

  const [newTenant, setNewTenant] = useState({
    orgName: "",
    adminEmail: "",
    adminPassword: "",
    adminName: "",
    maxUsers: 5,
    maxProjectsTotal: 20,
    maxStorageMb: 10240,
    tenantPlan: "PAID",
    trialDays: 14,
    view: "VISIONLIGHT"
  });
  const [tenantAdminEmailStatus, setTenantAdminEmailStatus] =
    useState<ProvisionEmailStatus | null>(null);
  const [checkingTenantAdminEmail, setCheckingTenantAdminEmail] = useState(false);

  const [newDemo, setNewDemo] = useState({
    email: "",
    password: "",
    name: ""
  });
  const [demoEmailStatus, setDemoEmailStatus] =
    useState<ProvisionEmailStatus | null>(null);
  const [checkingDemoEmail, setCheckingDemoEmail] = useState(false);

  const [newTeamMember, setNewTeamMember] = useState({
    email: "",
    password: "",
    name: "",
    role: "USER",
    view: "VISIONLIGHT",
    maxProjects: 3,
  });
  const [teamMemberEmailStatus, setTeamMemberEmailStatus] =
    useState<ProvisionEmailStatus | null>(null);
  const [checkingTeamMemberEmail, setCheckingTeamMemberEmail] = useState(false);
  const [welcomeVideoUploading, setWelcomeVideoUploading] = useState(false);
  const [welcomePreviewReady, setWelcomePreviewReady] = useState(false);
  const [variantCostUsd, setVariantCostUsd] = useState<
    Record<CoverageVariantId, number>
  >({ ...DEFAULT_VARIANT_COST_USD });

  const toInt = (value: string, fallback = 0) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.round(n));
  };
  const toUsdCost = (value: string, fallback = 0) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Number(n.toFixed(4)));
  };
  const MB_PER_GB = 1024;
  const mbToGb = (mb: number) => Math.max(0, Number(mb || 0)) / MB_PER_GB;
  const gbToMb = (gb: string, fallbackMb = 0) => {
    const parsed = Number(gb);
    if (!Number.isFinite(parsed)) return fallbackMb;
    return Math.max(0, Math.round(parsed * MB_PER_GB));
  };

  const normalizedTenantAdminEmail = newTenant.adminEmail.trim().toLowerCase();
  const normalizedDemoEmail = newDemo.email.trim().toLowerCase();
  const normalizedTeamMemberEmail = newTeamMember.email.trim().toLowerCase();

  const isTenantAdminEmailChecked =
    !!tenantAdminEmailStatus &&
    tenantAdminEmailStatus.email === normalizedTenantAdminEmail;
  const canContinueTenantAdmin =
    isTenantAdminEmailChecked &&
    !tenantAdminEmailStatus?.existingProfileInOrganization;
  const tenantAdminNeedsPassword =
    canContinueTenantAdmin && tenantAdminEmailStatus?.requiresPassword === true;

  const isDemoEmailChecked =
    !!demoEmailStatus && demoEmailStatus.email === normalizedDemoEmail;
  const canContinueDemo =
    isDemoEmailChecked && !demoEmailStatus?.existingProfileInOrganization;
  const demoNeedsPassword =
    canContinueDemo && demoEmailStatus?.requiresPassword === true;

  const isTeamMemberEmailChecked =
    !!teamMemberEmailStatus &&
    teamMemberEmailStatus.email === normalizedTeamMemberEmail;
  const canContinueTeamMember =
    isTeamMemberEmailChecked &&
    !teamMemberEmailStatus?.existingProfileInOrganization;
  const teamMemberNeedsPassword =
    canContinueTeamMember && teamMemberEmailStatus?.requiresPassword === true;

  const resetNewTenantForm = () => {
    setNewTenant({
      orgName: "",
      adminEmail: "",
      adminPassword: "",
      adminName: "",
      maxUsers: 5,
      maxProjectsTotal: 20,
      maxStorageMb: 10240,
      tenantPlan: "PAID",
      trialDays: 14,
      view: "VISIONLIGHT",
    });
    setTenantAdminEmailStatus(null);
  };

  const resetNewDemoForm = () => {
    setNewDemo({ email: "", password: "", name: "" });
    setDemoEmailStatus(null);
  };

  const resetNewTeamMemberForm = () => {
    setNewTeamMember({
      email: "",
      password: "",
      name: "",
      role: "USER",
      view: "VISIONLIGHT",
      maxProjects: 3,
    });
    setTeamMemberEmailStatus(null);
  };

  const checkTenantAdminEmail = async () => {
    if (!normalizedTenantAdminEmail) {
      setMsg("Error: Admin email is required.");
      return null;
    }
    setCheckingTenantAdminEmail(true);
    try {
      const res = await apiEndpoints.superadminCheckEmailStatus({
        email: normalizedTenantAdminEmail,
      });
      const status = res.data as ProvisionEmailStatus;
      setTenantAdminEmailStatus(status);
      if (status.authExists) {
        setNewTenant((prev) => ({ ...prev, adminPassword: "" }));
      }
      return status;
    } catch (err: any) {
      setMsg("Error: " + err.message);
      return null;
    } finally {
      setCheckingTenantAdminEmail(false);
    }
  };

  const checkDemoEmail = async () => {
    if (!normalizedDemoEmail) {
      setMsg("Error: Demo lead email is required.");
      return null;
    }
    setCheckingDemoEmail(true);
    try {
      const res = await apiEndpoints.superadminCheckEmailStatus({
        email: normalizedDemoEmail,
        defaultOrganization: true,
      });
      const status = res.data as ProvisionEmailStatus;
      setDemoEmailStatus(status);
      if (status.authExists) {
        setNewDemo((prev) => ({ ...prev, password: "" }));
      }
      return status;
    } catch (err: any) {
      setMsg("Error: " + err.message);
      return null;
    } finally {
      setCheckingDemoEmail(false);
    }
  };

  const checkTeamMemberEmail = async () => {
    if (!normalizedTeamMemberEmail) {
      setMsg("Error: Team member email is required.");
      return null;
    }
    setCheckingTeamMemberEmail(true);
    try {
      const res = await apiEndpoints.tenantCheckTeamEmail(normalizedTeamMemberEmail);
      const status = res.data as ProvisionEmailStatus;
      setTeamMemberEmailStatus(status);
      if (status.authExists) {
        setNewTeamMember((prev) => ({ ...prev, password: "" }));
      }
      return status;
    } catch (err: any) {
      setMsg("Error: " + err.message);
      return null;
    } finally {
      setCheckingTeamMemberEmail(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (activeTab !== "platform") return;
    const interval = setInterval(async () => {
      try {
        const requestsRes = await apiEndpoints.superadminGetRequests();
        if (requestsRes.data.success) {
          setCreditRequests(requestsRes.data.requests || []);
        }
      } catch {
        // Silent polling failure
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "lab") return;
    setWelcomePreviewReady(false);
  }, [activeTab, globalSettings?.welcomeVideoUrl]);

  useEffect(() => {
    if (!globalSettings) return;
    const next = { ...DEFAULT_VARIANT_COST_USD } as Record<
      CoverageVariantId,
      number
    >;
    for (const variant of COVERAGE_VARIANTS) {
      const costField = COST_FIELD_BY_VARIANT[variant.id];
      const value = Number((globalSettings as any)?.[costField]);
      if (Number.isFinite(value) && value >= 0) {
        next[variant.id] = value;
      }
    }
    setVariantCostUsd(next);
  }, [globalSettings]);

  useEffect(() => {
    if (activeTab !== "byok") return;
    void fetchByokOpsData();
    const interval = setInterval(() => {
      void fetchByokOpsData();
    }, 30000);
    return () => clearInterval(interval);
  }, [activeTab, byokEventFilters.status, byokEventFilters.packageCode, byokEventFilters.limit]);

  // Load demo curation data when the Demo Preview tab is opened.
  useEffect(() => {
    if (activeTab !== "demo") return;
    let cancelled = false;
    (async () => {
      setDemoLoading(true);
      try {
        const res = await apiEndpoints.superadminGetDemoConfig();
        if (cancelled) return;
        const cfg = res.data?.config || {};
        const norm = (v: any) => ({
          postIds: Array.isArray(v?.postIds) ? v.postIds : [],
          assetIds: Array.isArray(v?.assetIds) ? v.assetIds : [],
        });
        setDemoSelection({
          PICDRIFT: norm(cfg.PICDRIFT),
          VISIONLIGHT: norm(cfg.VISIONLIGHT),
        });
        setDemoPosts(res.data?.posts || []);
        setDemoAssets(res.data?.assets || []);
        setDemoPostsVisible(DEMO_PICKER_PAGE);
        setDemoAssetsVisible(DEMO_PICKER_PAGE);
      } catch (e: any) {
        if (!cancelled) setMsg("Error loading demo content: " + (e?.message || ""));
      } finally {
        if (!cancelled) setDemoLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  const toggleDemoItem = (kind: "post" | "asset", id: string) => {
    setDemoSelection((prev) => {
      const sel = prev[demoView];
      const key = kind === "post" ? "postIds" : "assetIds";
      const list = sel[key];
      const next = list.includes(id)
        ? list.filter((x) => x !== id)
        : [...list, id];
      return { ...prev, [demoView]: { ...sel, [key]: next } };
    });
  };

  const saveDemoConfig = async () => {
    setDemoSaving(true);
    try {
      await apiEndpoints.superadminSaveDemoConfig(demoSelection);
      setMsg("Demo preview content saved.");
    } catch (e: any) {
      setMsg("Error saving demo content: " + (e?.message || ""));
    } finally {
      setDemoSaving(false);
    }
  };

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [tenantsRes, settingsRes, usersRes, presetsRes, editorPresetsRes, requestsRes, byokRes] = await Promise.all([
        apiEndpoints.superadminGetOrganizations(),
        apiEndpoints.superadminGetGlobalSettings(),
        apiEndpoints.superadminGetUsers(),
        apiEndpoints.superadminGetPresets(),
        apiEndpoints.superadminGetEditorPresets(),
        apiEndpoints.superadminGetRequests(),
        apiEndpoints.superadminGetByokOrganizations(),
      ]);

      if (tenantsRes.data.success) setTenants(tenantsRes.data.organizations);
      if (settingsRes.data.success) setGlobalSettings(settingsRes.data.settings);
      if (usersRes.data.success) setUsers(usersRes.data.users);
      if (presetsRes.data.success) setPresets(presetsRes.data.presets);
      if (editorPresetsRes.data.success) setEditorPresets(editorPresetsRes.data.presets);
      if (requestsRes.data.success) setCreditRequests(requestsRes.data.requests || []);
      if (byokRes.data.success) setByokOrganizations(byokRes.data.organizations || []);
      await fetchByokOpsData();
    } catch (err: any) {
      setMsg("Error loading data: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchByokOpsData = async () => {
    setByokEventsLoading(true);
    try {
      const [eventsRes, healthRes] = await Promise.all([
        apiEndpoints.superadminGetByokWebhookEvents({
          status: byokEventFilters.status || undefined,
          packageCode: byokEventFilters.packageCode || undefined,
          limit: byokEventFilters.limit || 80,
        }),
        apiEndpoints.superadminGetByokOpsHealth(),
      ]);
      if (eventsRes.data?.success) {
        setByokWebhookEvents(eventsRes.data.events || []);
      }
      if (healthRes.data?.success) {
        setByokOpsHealth(healthRes.data);
      }
    } catch (error: any) {
      setMsg("Error loading BYOK ops data: " + (error?.message || "unknown"));
    } finally {
      setByokEventsLoading(false);
    }
  };

  const handleManualByokActivation = async (
    organizationId: string,
    packageCode: string,
  ) => {
    setActionLoading(true);
    try {
      await apiEndpoints.superadminActivateByokPackage({ organizationId, packageCode });
      setMsg(`BYOK package switched to ${packageCode}.`);
      await fetchInitialData();
    } catch (error: any) {
      setMsg("Error: " + (error?.message || "Failed to activate package."));
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetByokTrial = async (organizationId: string) => {
    setActionLoading(true);
    try {
      await apiEndpoints.superadminResetByokTrial({ organizationId, reason: "ops_reset" });
      setMsg("BYOK trial reset completed.");
      await fetchInitialData();
    } catch (error: any) {
      setMsg("Error: " + (error?.message || "Failed to reset trial."));
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolveCreditRequest = async (requestId: string) => {
    try {
      await apiEndpoints.superadminResolveRequest(requestId);
      setMsg("Credit request resolved.");
      fetchInitialData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSavePreset = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      if (editingPreset) {
        await apiEndpoints.superadminUpdatePreset(editingPreset.id, presetForm);
      } else {
        await apiEndpoints.superadminCreatePreset(presetForm);
      }
      setMsg(`Preset ${editingPreset ? 'updated' : 'created'} successfully.`);
      setShowPresetModal(false);
      setEditingPreset(null);
      setPresetForm({ name: "", prompt: "", isActive: true });
      fetchInitialData();
    } catch (err: any) {
      setMsg("Error: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeletePreset = async (id: string) => {
    if (!(await confirmAction("Are you sure you want to delete this global preset?", { confirmLabel: "Delete" }))) return;
    try {
      await apiEndpoints.superadminDeletePreset(id);
      fetchInitialData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const openEditPreset = (p: any) => {
    setEditingPreset(p);
    setPresetForm({
      name: p.name,
      prompt: p.prompt,
      isActive: p.isActive
    });
    setShowPresetModal(true);
  };

  // ---- Editor (PicFX + Convert) global presets — isolated CRUD ----
  const handleSaveEditorPreset = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      if (editingEditorPreset) {
        await apiEndpoints.superadminUpdateEditorPreset(editingEditorPreset.id, editorPresetForm);
      } else {
        await apiEndpoints.superadminCreateEditorPreset(editorPresetForm);
      }
      setMsg(`Editor preset ${editingEditorPreset ? 'updated' : 'created'} successfully.`);
      setShowEditorPresetModal(false);
      setEditingEditorPreset(null);
      setEditorPresetForm({ name: "", prompt: "", isActive: true });
      fetchInitialData();
    } catch (err: any) {
      setMsg("Error: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteEditorPreset = async (id: string) => {
    if (!(await confirmAction("Are you sure you want to delete this editor preset?", { confirmLabel: "Delete" }))) return;
    try {
      await apiEndpoints.superadminDeleteEditorPreset(id);
      fetchInitialData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const openEditEditorPreset = (p: any) => {
    setEditingEditorPreset(p);
    setEditorPresetForm({
      name: p.name,
      prompt: p.prompt,
      isActive: p.isActive
    });
    setShowEditorPresetModal(true);
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canContinueTenantAdmin) {
      await checkTenantAdminEmail();
      return;
    }
    if (tenantAdminNeedsPassword && newTenant.adminPassword.trim().length < 6) {
      setMsg("Error: Admin password must be at least 6 characters for a new login.");
      return;
    }

    setActionLoading(true);
    try {
      const res = await apiEndpoints.superadminCreateTenant({
        ...newTenant,
        adminPassword: tenantAdminNeedsPassword
          ? newTenant.adminPassword.trim()
          : "",
      });
      setMsg(
        res.data?.adminUser?.authIdentityReused
          ? "Tenant created. Existing admin login credentials will be reused."
          : "Tenant created successfully.",
      );
      setShowTenantModal(false);
      resetNewTenantForm();
      fetchInitialData();
    } catch (err: any) {
      setMsg("Error: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteTenant = async (id: string) => {
    const targetTenant = tenants.find((t) => t.id === id);
    const targetName = targetTenant?.name || "this organization";
    if (
      !(await confirmAction(
        `Delete "${targetName}" and all associated users forever?`,
        {
          confirmLabel: "Delete",
          critical: true,
          confirmationText: `DELETE ${targetName}`,
        },
      ))
    )
      return;
    setActionLoading(true);
    try {
      await apiEndpoints.superadminDeleteOrganization(id);
      setMsg("Organization deleted.");
      fetchInitialData();
    } catch (err: any) {
      setMsg("Error: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateTenant = async () => {
    if (!editingTenant) return;
    setActionLoading(true);
    try {
      const orgUpdates: Record<string, any> = {
        name: tenantUpdates.name,
        maxUsers: tenantUpdates.maxUsers,
        maxProjectsTotal: tenantUpdates.maxProjectsTotal,
        maxStorageMb: tenantUpdates.maxStorageMb,
      };
      if (!editingTenant.isDefault) {
        orgUpdates.view = tenantUpdates.view;
      }

      await apiEndpoints.superadminUpdateOrgLimits(editingTenant.id, orgUpdates);
      if (!editingTenant.isDefault && editingTenant.isActive !== tenantUpdates.isActive) {
        await apiEndpoints.superadminUpdateOrgStatus(editingTenant.id, tenantUpdates.isActive);
      }
      setMsg(editingTenant.isDefault ? "Default organization updated." : "Tenant updated.");
      setEditingTenant(null);
      fetchInitialData();
    } catch (err: any) {
      setMsg("Error: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Isolation-preserving plan flip for a (manual) tenant. Only changes
  // tenantPlan / trial window — keeps their view, domain, and provisioning, so a
  // view-specific manual tenant stays on picdrift.studio / visualfx.studio.
  const handleSetManualPlan = async (
    orgId: string,
    plan: "DEMO" | "PAID",
    days = 14,
  ) => {
    const label = plan === "DEMO" ? `a ${days}-day Demo` : "Paid";
    if (
      !window.confirm(
        `Set this tenant to ${label}? This keeps their view, domain, and limits — it only changes the plan status.`,
      )
    ) {
      return;
    }
    setActionLoading(true);
    try {
      await apiEndpoints.superadminSetOrgPlan(orgId, plan, days);
      setMsg(
        plan === "DEMO"
          ? `Tenant set to a ${days}-day demo.`
          : "Tenant marked as paid.",
      );
      setEditingTenant(null);
      fetchInitialData();
    } catch (err: any) {
      setMsg("Error: " + (err?.message || "Failed to update plan."));
    } finally {
      setActionLoading(false);
    }
  };

  // Explicit package activation. This intentionally routes the tenant through
  // the BYOK package lifecycle: it applies the package's limits AND its domain /
  // view. Use this only when you want package-specific domain routing.
  const handleActivatePackage = async (orgId: string, packageCode: string) => {
    const isTrial = packageCode === "BYOK_TRIAL";
    const what = isTrial ? "the BYOK 14-day trial" : `the ${packageCode} package`;
    if (
      !window.confirm(
        `Activate ${what} for this tenant? This moves them into the BYOK lifecycle — it applies that plan's limits AND its domain (${isTrial ? "byok.link" : "the package's domain"}).`,
      )
    ) {
      return;
    }
    setActionLoading(true);
    try {
      await apiEndpoints.superadminActivateByokPackage({
        organizationId: orgId,
        packageCode,
      });
      setMsg(
        isTrial
          ? "Tenant activated on the BYOK 14-day trial."
          : `Tenant activated on ${packageCode}.`,
      );
      setEditingTenant(null);
      fetchInitialData();
    } catch (err: any) {
      setMsg("Error: " + (err?.message || "Failed to activate package."));
    } finally {
      setActionLoading(false);
    }
  };

  const openEditTenant = (t: Tenant) => {
    // Try to find an admin user for this tenant to get the current view
    const adminUser = users.find(
      (u) =>
        u.organizationId === t.id &&
        (t.isDefault ? u.role === "SUPERADMIN" : u.role === "ADMIN"),
    );
    setEditingTenant(t);
    setTenantUpdates({
      name: t.name,
      maxUsers: t.maxUsers,
      maxProjectsTotal: t.maxProjectsTotal,
      maxStorageMb: t.maxStorageMb || 10240,
      view: adminUser ? adminUser.view : "VISIONLIGHT",
      isActive: t.isActive,
    });
  };

  const handleCreateDemo = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canContinueDemo) {
      await checkDemoEmail();
      return;
    }
    if (demoNeedsPassword && newDemo.password.trim().length < 6) {
      setMsg("Error: Password must be at least 6 characters for a new login.");
      return;
    }

    setActionLoading(true);
    try {
      const res = await apiEndpoints.superadminCreateDemoUser({
        ...newDemo,
        password: demoNeedsPassword ? newDemo.password.trim() : "",
      });
      setMsg(
        res.data?.user?.authIdentityReused
          ? "Demo profile created. Existing login credentials will be reused."
          : "Demo user created.",
      );
      setShowDemoModal(false);
      resetNewDemoForm();
      fetchInitialData();
    } catch (err: any) {
      setMsg("Error: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddTeamMember = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canContinueTeamMember) {
      await checkTeamMemberEmail();
      return;
    }
    if (teamMemberNeedsPassword && newTeamMember.password.trim().length < 6) {
      setMsg("Error: Password must be at least 6 characters for a new login.");
      return;
    }

    setActionLoading(true);
    try {
      const res = await apiEndpoints.tenantAddUser({
        ...newTeamMember,
        password: teamMemberNeedsPassword
          ? newTeamMember.password.trim()
          : "",
      });
      setMsg(
        res.data?.user?.authIdentityReused
          ? "Team member added. Existing login credentials will be reused."
          : "Team member added.",
      );
      setShowAddTeamModal(false);
      resetNewTeamMemberForm();
      fetchInitialData();
    } catch (err: any) {
      setMsg("Error: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateAgencyUser = async (userId: string, data: any) => {
    try {
      await apiEndpoints.tenantUpdateUser(userId, data);
      fetchInitialData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUpdateUserBasic = async () => {
    if (!editingUser) return;
    try {
      const payload: any = {
        view: userUpdates.view,
        role: userUpdates.role,
      };
      // Project limit is only managed for the default agency here. SuperAdmins
      // are unlimited, so we don't push a cap for them. Tenant users are not
      // edited from this modal, so tenant setup is untouched.
      const isDefaultAgencyUser =
        editingUser.organizationId === adminUser?.organizationId;
      if (isDefaultAgencyUser && userUpdates.role !== "SUPERADMIN") {
        payload.maxProjects = Math.max(1, Number(userUpdates.maxProjects) || 3);
      }
      await apiEndpoints.superadminUpdateUser(editingUser.id, payload);
      setMsg("User updated.");
      setEditingUser(null);
      setUserUpdates({ view: "VISIONLIGHT", role: "USER", maxProjects: 3 });
      fetchInitialData();
    } catch (err: any) {
      alert(err.message);
    }
  }

  const handleEnterReadOnlyDashboard = async (target: User) => {
    if (!target?.id || enteringDashboardUserId) return;
    setEnteringDashboardUserId(target.id);
    try {
      const handoffRes = await apiEndpoints.startSupportHandoff(target.id);
      if (handoffRes.data?.domainSwitchRequired && handoffRes.data?.handoffUrl) {
        window.location.replace(handoffRes.data.handoffUrl);
        return;
      }

      startReadOnlyImpersonation(target.id, target.email);
      // Rotation3D/Drift brands aren't project-scoped — their controls live on the
      // brand dashboard at /app, so send the operator straight there.
      if (target.view === "ROTATION3D" || target.view === "DRIFT") {
        navigate("/app");
        return;
      }
      const res = await apiEndpoints.getProjects();
      const firstProject = res.data?.projects?.[0];
      if (firstProject?.id) {
        localStorage.setItem("visionlight_active_project", firstProject.id);
        navigate("/app");
        return;
      }
      navigate("/projects");
    } catch (err: any) {
      alert(err?.message || "Failed to enter dashboard.");
    } finally {
      setEnteringDashboardUserId((current) =>
        current === target.id ? null : current,
      );
    }
  };

  const myAgencyUsers = useMemo(() => {
    return users.filter(u => u.organizationId === adminUser?.organizationId);
  }, [users, adminUser]);

  const demoUsers = useMemo(() => {
    return users.filter(u => u.isDemo === true);
  }, [users]);

  const visibleUsers = useMemo(() => {
    let list = [...users];
    if (userView === "demo") list = list.filter((u) => u.isDemo === true);
    else if (userView === "active") list = list.filter((u) => u.isDemo !== true);

    if (userView === "alpha") {
      list.sort((a, b) =>
        (a.name || a.email).localeCompare(b.name || b.email),
      );
    } else if (userView === "oldest") {
      list.sort(
        (a, b) =>
          new Date(a.createdAt || 0).getTime() -
          new Date(b.createdAt || 0).getTime(),
      );
    } else {
      list.sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime(),
      );
    }
    return list;
  }, [users, userView]);

  const variantRows = useMemo(() => {
    return COVERAGE_VARIANTS.map((variant) => {
      const deductionCredits = Math.max(
        0,
        Number((globalSettings as any)?.[variant.deductionKey]) || 0,
      );
      const providerCostPerRender = Math.max(
        0,
        Number(variantCostUsd[variant.id]) || 0,
      );
      const impliedUsdPerCredit =
        deductionCredits > 0 ? providerCostPerRender / deductionCredits : 0;
      return {
        ...variant,
        deductionCredits,
        providerCostPerRender,
        impliedUsdPerCredit,
      };
    });
  }, [globalSettings, variantCostUsd]);

  const walletUsdPerCredit = useMemo(() => {
    const result = {} as Record<CoverageWalletKey, number>;
    for (const wallet of COVERAGE_WALLETS) {
      const rates = variantRows
        .filter((row) => row.wallet === wallet.key)
        .map((row) => row.impliedUsdPerCredit)
        .filter((value) => Number.isFinite(value) && value > 0);
      result[wallet.key] = rates.length ? Math.max(...rates) : 0;
    }
    return result;
  }, [variantRows]);

  const walletCoverageRows = useMemo(() => {
    return COVERAGE_WALLETS.map((wallet) => {
      const allocatedCredits = myAgencyUsers.reduce(
        (sum, user) =>
          sum + (isUserCreditLimited(user) ? Number(user[wallet.key]) || 0 : 0),
        0,
      );
      const usdPerCredit = walletUsdPerCredit[wallet.key] || 0;
      return {
        ...wallet,
        allocatedCredits,
        usdPerCredit,
        requiredUsd: allocatedCredits * usdPerCredit,
      };
    });
  }, [myAgencyUsers, walletUsdPerCredit]);

  const coverageTotals = useMemo(() => {
    return walletCoverageRows.reduce(
      (acc, row) => {
        acc.fal += row.requiredUsd;
        acc.total += row.requiredUsd;
        return acc;
      },
      { fal: 0, total: 0 },
    );
  }, [walletCoverageRows]);

  const getUserCoverageUsd = (user: User) => {
    if (!isUserCreditLimited(user)) return 0;
    return COVERAGE_WALLETS.reduce((sum, wallet) => {
      const credits = Number(user[wallet.key]) || 0;
      const usdPerCredit = walletUsdPerCredit[wallet.key] || 0;
      return sum + credits * usdPerCredit;
    }, 0);
  };

  const sortedTenants = useMemo(() => {
    return [...tenants].sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return (
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    });
  }, [tenants]);

  const canEnterDashboard = (targetUserId?: string) =>
    !!targetUserId && targetUserId !== adminUser?.id;

  const isProtectedUser = (user: User) =>
    user.isProtectedFromRemoval === true ||
    user.role === "SUPERADMIN" ||
    user.isOrganizationOwner === true;

  const getProtectionLabel = (user: User) => {
    if (user.protectionReason === "SUPERADMIN" || user.role === "SUPERADMIN") {
      return "Protected: SuperAdmin";
    }
    if (user.protectionReason === "TENANT_OWNER" || user.isOrganizationOwner) {
      return "Protected: Tenant Owner";
    }
    return "Protected";
  };

  const formatUsd = (value: number) =>
    value.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const handleVariantCostChange = (key: CoverageVariantId, raw: string) => {
    const parsed = Number(raw);
    setVariantCostUsd((prev) => ({
      ...prev,
      [key]: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0,
    }));
  };

  const handleVariantCostCommit = async (key: CoverageVariantId) => {
    const costField = COST_FIELD_BY_VARIANT[key];
    if (!costField) return;
    const fallback = Number((globalSettings as any)?.[costField]) || 0;
    const nextValue = toUsdCost(String(variantCostUsd[key] ?? 0), fallback);
    const currentValue = Number((globalSettings as any)?.[costField]) || 0;
    if (Math.abs(nextValue - currentValue) < 0.0001) return;

    try {
      const res = await apiEndpoints.superadminUpdateGlobalSettings({
        [costField]: nextValue,
      });
      if (res.data?.success) {
        setGlobalSettings(res.data.settings);
      }
    } catch (err: any) {
      setMsg("Error: " + (err?.message || "Failed to update provider cost."));
    }
  };

  if (loading) return (
    <div className="drift-ui d-page sa-loading" data-theme={theme}>
      <DriftThemeStyles />
      <style>{SA_STYLES}</style>
      <LoadingSpinner size="lg" variant="neon" />
    </div>
  );

  return (
    <div className="drift-ui d-page sa-page" data-theme={theme}>
      <DriftThemeStyles />
      <style>{SA_STYLES}</style>

      {/* TOP BAR */}
      <header className="sa-top">
        <div className="sa-brand">
          <div className="d-wordmark">
            Platform <i>Control</i>
          </div>
          <div className="sa-who">Super Admin · {adminUser?.email}</div>
        </div>
        <div className="d-actions sa-top-actions">
          <a
            href="https://fal.ai/dashboard/usage-billing/credits"
            target="_blank"
            rel="noopener noreferrer"
            className="d-btn sm"
          >
            Check fal credits ↗
          </a>
          <button
            type="button"
            disabled={creditLimitsBusy}
            onClick={async () => {
              setCreditLimitsBusy(true);
              try {
                await apiEndpoints.setAdminCreditLimits(!adminCreditLimitsEnabled);
                await checkAuth();
                setMsg(
                  !adminCreditLimitsEnabled
                    ? "Credit limits enabled for your account. Your credits now count toward coverage."
                    : "Credit limits disabled. Your account is unlimited again.",
                );
              } catch (err: any) {
                setMsg("Error: " + (err?.message || "Failed to update credit limits."));
              } finally {
                setCreditLimitsBusy(false);
              }
            }}
            title="When enabled, your account uses credit limits and your allocated credits count toward Needed Coverage."
            className={`d-btn sm ${adminCreditLimitsEnabled ? "soft" : ""}`}
          >
            {creditLimitsBusy ? (
              <LoadingSpinner size="sm" />
            ) : (
              <>
                My credit limits: <b>{adminCreditLimitsEnabled ? "On" : "Off"}</b>
              </>
            )}
          </button>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <button type="button" onClick={() => navigate("/app")} className="d-btn sm primary">
            Back to App
          </button>
        </div>
      </header>

      <main className="sa-main">
        {/* SECTION TABS */}
        <nav className="sa-nav" aria-label="Admin sections">
          {SA_GROUPS.map((group) => (
            <div key={group.label} className="sa-group">
              <div className="sa-group-label">{group.label}</div>
              <div className="d-tabs" role="tablist" aria-label={group.label}>
                {group.tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`d-tab ${activeTab === tab.id ? "active" : ""}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {msg && (
          <div className={`d-banner ${msg.startsWith("Error") ? "err" : "ok"}`} style={{ marginBottom: 16 }}>
            <span>{msg}</span>
            <button type="button" className="d-x" onClick={() => setMsg("")} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}

        {/* RELEASE EMAIL */}
        <section className="d-card sa-release">
          <div className="sa-release-copy">
            <div className="d-h2">Release email</div>
            <p className="d-note">
              Free up a deleted or stuck email so it can sign up again from scratch.
              Removes leftover profiles/orgs and the auth identity. No past data is restored.
            </p>
          </div>
          <div className="sa-release-form">
            <input
              type="email"
              value={releaseEmailInput}
              onChange={(e) => setReleaseEmailInput(e.target.value)}
              placeholder="user@email.com"
              className="d-input"
            />
            <button
              type="button"
              onClick={() => void handleReleaseEmail()}
              disabled={releaseEmailBusy}
              className="d-btn warn"
            >
              {releaseEmailBusy ? "Releasing…" : "Release"}
            </button>
          </div>
        </section>

        <div className={isLegacyTab(activeTab) ? "sa-legacy" : undefined}>
        {/* TAB CONTENT: ROTATION3D */}
        {activeTab === "rotation3d" && <Rotation3DAdminPanel />}
        {activeTab === "drift" && <DriftAdminPanel />}

        {/* TAB CONTENT: DEMO PREVIEW */}
        {activeTab === "demo" && (
          <div className="sa-stack d-rise">
            <div className="d-head">
              <div>
                <div className="d-eyebrow">Studio</div>
                <h2 className="d-h1">Demo preview</h2>
                <p className="d-sub">
                  Choose which of your renders &amp; assets appear in the public read-only demo for
                  each view. Visitors can only look.
                </p>
              </div>
              <div className="d-actions">
                <div className="d-tabs" role="tablist" aria-label="Demo view">
                  {(["VISIONLIGHT", "PICDRIFT"] as DemoView[]).map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="tab"
                      aria-selected={demoView === v}
                      onClick={() => setDemoView(v)}
                      className={`d-tab ${demoView === v ? "active" : ""}`}
                    >
                      {v === "PICDRIFT" ? "PicDrift" : "Visionlight"}
                    </button>
                  ))}
                </div>
                <a className="d-btn ghost" href={`/demo?view=${demoView}`} target="_blank" rel="noreferrer">
                  Open preview ↗
                </a>
                <button
                  type="button"
                  onClick={() => void saveDemoConfig()}
                  disabled={demoSaving || demoLoading}
                  className="d-btn primary"
                >
                  {demoSaving ? "Saving…" : "Save selection"}
                </button>
              </div>
            </div>

            {demoLoading ? (
              <div className="d-card sa-center">
                <LoadingSpinner size="lg" variant="neon" />
              </div>
            ) : (
              <>
                <div className="d-banner">
                  <span>
                    Showing in <b>{demoView === "PICDRIFT" ? "PicDrift" : "Visionlight"}</b> view:{" "}
                    <b className="sa-count">{demoSelection[demoView].postIds.length}</b> renders,{" "}
                    <b className="sa-count">{demoSelection[demoView].assetIds.length}</b> assets. Click any
                    tile to add or remove it, then Save.
                  </span>
                </div>

                <section className="d-card d-card-pad">
                  <h3 className="d-h2 sa-sec-title">Renders</h3>
                  {demoPosts.length === 0 ? (
                    <p className="d-note">No completed renders on your account yet.</p>
                  ) : (
                    <>
                      <div className="sa-pick-grid">
                        {demoPosts.slice(0, demoPostsVisible).map((p) => (
                          <DemoPickTile
                            key={p.id}
                            url={p.mediaUrl}
                            type={p.mediaType}
                            poster={p.imageReference}
                            selected={demoSelection[demoView].postIds.includes(p.id)}
                            onClick={() => toggleDemoItem("post", p.id)}
                          />
                        ))}
                      </div>
                      {demoPosts.length > demoPostsVisible && (
                        <button
                          type="button"
                          onClick={() => setDemoPostsVisible((n) => n + DEMO_PICKER_PAGE)}
                          className="d-btn sm sa-more"
                        >
                          Load more ({demoPosts.length - demoPostsVisible} left)
                        </button>
                      )}
                    </>
                  )}
                </section>

                <section className="d-card d-card-pad">
                  <h3 className="d-h2 sa-sec-title">Assets</h3>
                  {demoAssets.length === 0 ? (
                    <p className="d-note">No assets on your account yet.</p>
                  ) : (
                    <>
                      <div className="sa-pick-grid">
                        {demoAssets.slice(0, demoAssetsVisible).map((a) => (
                          <DemoPickTile
                            key={a.id}
                            url={a.url}
                            type={a.type}
                            selected={demoSelection[demoView].assetIds.includes(a.id)}
                            onClick={() => toggleDemoItem("asset", a.id)}
                          />
                        ))}
                      </div>
                      {demoAssets.length > demoAssetsVisible && (
                        <button
                          type="button"
                          onClick={() => setDemoAssetsVisible((n) => n + DEMO_PICKER_PAGE)}
                          className="d-btn sm sa-more"
                        >
                          Load more ({demoAssets.length - demoAssetsVisible} left)
                        </button>
                      )}
                    </>
                  )}
                </section>
              </>
            )}
          </div>
        )}

        {/* TAB CONTENT: GLOBAL PRESETS */}
        {activeTab === "global-presets" && (
          <div className="sa-stack d-rise">
            <div className="d-head">
              <div>
                <div className="d-eyebrow">Settings</div>
                <h2 className="d-h1">Global prompt presets</h2>
                <p className="d-sub">These presets automatically appear in every user's PromptFX menu.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingPreset(null);
                  setPresetForm({ name: "", prompt: "", isActive: true });
                  setShowPresetModal(true);
                }}
                className="d-btn primary"
              >
                Add new preset
              </button>
            </div>

            {presets.length === 0 ? (
              <div className="d-empty">No global presets created yet.</div>
            ) : (
              <div className="d-list">
                {presets.map((p) => (
                  <div key={p.id} className="d-row">
                    <div className="d-row-main">
                      <div className="sa-title-row">
                        <span className="d-name">{p.name}</span>
                        <span className={`d-pill ${p.isActive ? "ok" : "err"}`}>
                          {p.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <p className="sa-clamp">{p.prompt}</p>
                    </div>
                    <div className="d-actions">
                      <button type="button" className="d-btn sm" onClick={() => openEditPreset(p)}>
                        Edit
                      </button>
                      <button type="button" className="d-btn sm danger" onClick={() => handleDeletePreset(p.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB CONTENT: EDITOR PRESETS (PicFX + Convert) */}
        {activeTab === "editor-presets" && (
          <div className="sa-stack d-rise">
            <div className="d-head">
              <div>
                <div className="d-eyebrow">Settings</div>
                <h2 className="d-h1">Editor prompt presets</h2>
                <p className="d-sub">
                  These presets appear only in the asset-library editor — the PicFX and Convert tabs.
                  They are isolated from the global presets.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingEditorPreset(null);
                  setEditorPresetForm({ name: "", prompt: "", isActive: true });
                  setShowEditorPresetModal(true);
                }}
                className="d-btn primary"
              >
                Add new preset
              </button>
            </div>

            {editorPresets.length === 0 ? (
              <div className="d-empty">No editor presets created yet.</div>
            ) : (
              <div className="d-list">
                {editorPresets.map((p) => (
                  <div key={p.id} className="d-row">
                    <div className="d-row-main">
                      <div className="sa-title-row">
                        <span className="d-name">{p.name}</span>
                        <span className={`d-pill ${p.isActive ? "ok" : "err"}`}>
                          {p.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <p className="sa-clamp">{p.prompt}</p>
                    </div>
                    <div className="d-actions">
                      <button type="button" className="d-btn sm" onClick={() => openEditEditorPreset(p)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="d-btn sm danger"
                        onClick={() => handleDeleteEditorPreset(p.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB CONTENT: PLATFORM (TENANTS) */}
        {activeTab === "platform" && (
          <div className="sa-stack d-rise">
            <section className="d-card">
              <div className="sa-card-head">
                <div className="d-h2">Pending render requests</div>
                <span className={`d-pill ${creditRequests.length ? "accent" : ""}`}>
                  {creditRequests.length} pending
                </span>
              </div>
              <div className="sa-card-body">
                {creditRequests.length === 0 ? (
                  <p className="d-note">No pending render requests across all tenants.</p>
                ) : (
                  <div className="d-list">
                    {creditRequests.map((r) => (
                      <div key={r.id} className="sa-grid-row sa-request">
                        <div>
                          <div className="d-name">{r.user?.name || r.name || "Unknown User"}</div>
                          <div className="sa-mono">{r.user?.email || r.email}</div>
                        </div>
                        <div className="sa-small d-muted">
                          <span className="sa-cell-label">Organization · submitted</span>
                          {r.organization?.name || "Unassigned"} · {new Date(r.createdAt).toLocaleString()}
                        </div>
                        <div className="d-actions">
                          <button
                            type="button"
                            onClick={() => handleResolveCreditRequest(r.id)}
                            className="d-btn sm primary"
                          >
                            Mark resolved
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <div className="d-head">
              <div>
                <div className="d-eyebrow">Studio</div>
                <h2 className="d-h1">Subscription management</h2>
              </div>
              <button type="button" onClick={() => setShowTenantModal(true)} className="d-btn primary">
                Create new tenant
              </button>
            </div>

            {tenants.length === 0 ? (
              <div className="d-empty">No organizations created yet.</div>
            ) : (
              <div className="d-list">
                {sortedTenants.map((t) => {
                  const adminCandidates = users.filter(
                    (u) =>
                      u.organizationId === t.id &&
                      (u.role === "ADMIN" || u.role === "SUPERADMIN"),
                  );
                  const organizationAdmin = t.isDefault
                    ? adminCandidates.find((u) => u.role === "SUPERADMIN") ||
                      adminCandidates.find((u) => u.role === "ADMIN")
                    : adminCandidates.find((u) => u.role === "ADMIN") ||
                      adminCandidates.find((u) => u.role === "SUPERADMIN");
                  const isEnteringOrganizationAdminDashboard =
                    !!organizationAdmin &&
                    enteringDashboardUserId === organizationAdmin.id;
                  const usagePercent = Number(t.storageSummary?.usagePercent || 0);
                  return (
                    <div key={t.id} className="sa-grid-row sa-tenant">
                      <div>
                        <div className="d-name">{t.name}</div>
                        <div className="sa-mono">{organizationAdmin?.email || "No admin email"}</div>
                        <div className="sa-pills">
                          {(() => {
                            const demoExpired =
                              t.tenantPlan === "DEMO" &&
                              !!t.trialEndsAt &&
                              new Date(t.trialEndsAt).getTime() <= Date.now();
                            const badge = t.isDefault
                              ? { label: "Default Org", cls: "ok" }
                              : t.tenantPlan === "DEMO"
                                ? demoExpired
                                  ? { label: "Demo · Expired", cls: "err" }
                                  : { label: "Demo", cls: "warn" }
                                : t.tenantPlan === "PAID"
                                  ? {
                                      label: `Premium${(t as any).entitlementCode ? ` · ${(t as any).entitlementCode}` : ""}`,
                                      cls: "ok",
                                    }
                                  : { label: "Standard", cls: "" };
                            return <span className={`d-pill ${badge.cls}`}>{badge.label}</span>;
                          })()}
                          {t.trialEndsAt && t.tenantPlan === "DEMO" && (
                            <span className="d-pill warn">Ends {new Date(t.trialEndsAt).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="sa-cell-label">Status</span>
                        {t.isDefault ? (
                          <span className="d-pill ok">System</span>
                        ) : (
                          <span className={`d-pill ${t.isActive ? "ok" : "err"}`}>
                            {t.isActive ? "Active" : "Deactivated"}
                          </span>
                        )}
                      </div>
                      <div>
                        <span className="sa-cell-label">Users · projects · storage</span>
                        <div className="sa-strong">
                          {t.maxUsers} users · {t.maxProjectsTotal} projects
                        </div>
                        <div className="d-faint sa-small">
                          {mbToGb(Number(t.storageSummary?.usedMb || 0)).toFixed(2)}GB / {mbToGb(Number(t.maxStorageMb || 0)).toFixed(2)}GB
                        </div>
                        <div className={`sa-bar ${usagePercent >= 90 ? "err" : usagePercent >= 75 ? "warn" : ""}`}>
                          <i style={{ width: `${Math.max(0, Math.min(100, usagePercent))}%` }} />
                        </div>
                      </div>
                      <div className="d-actions">
                        {canEnterDashboard(organizationAdmin?.id) ? (
                          <button
                            type="button"
                            className="d-btn sm warn"
                            onClick={() =>
                              organizationAdmin &&
                              handleEnterReadOnlyDashboard(organizationAdmin)
                            }
                            disabled={!organizationAdmin || !!enteringDashboardUserId}
                          >
                            {isEnteringOrganizationAdminDashboard && <span className="sa-spin" />}
                            {isEnteringOrganizationAdminDashboard ? "Opening..." : "Enter dashboard"}
                          </button>
                        ) : (
                          <span className="d-pill">Own profile</span>
                        )}
                        <button type="button" className="d-btn sm" onClick={() => openEditTenant(t)}>
                          Configure
                        </button>
                        {t.isDefault ? (
                          <span className="d-pill ok">Protected</span>
                        ) : (
                          <button type="button" className="d-btn sm danger" onClick={() => handleDeleteTenant(t.id)}>
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <section className="d-card">
              <div className="sa-card-head">
                <div>
                  <div className="d-h2">All platform users</div>
                  <p className="d-note sa-tight">
                    Use read-only entry for support/debugging. Passwords can be reset from Manage.
                  </p>
                </div>
                <select
                  value={userView}
                  onChange={(e) => setUserView(e.target.value as any)}
                  className="d-select sm"
                  aria-label="Sort users"
                >
                  <option value="recent">Recently Added</option>
                  <option value="oldest">Oldest</option>
                  <option value="alpha">Alphabetical</option>
                  <option value="demo">Demo Users</option>
                  <option value="active">Active</option>
                </select>
              </div>
              <div className="sa-card-body">
                <div className="d-list">
                  {visibleUsers.map((u) => {
                    const org = tenants.find((t) => t.id === u.organizationId);
                    return (
                      <div key={u.id} className="sa-grid-row sa-user">
                        <div>
                          <div className="d-name">{u.name || "Unnamed User"}</div>
                          <div className="sa-mono">{u.email}</div>
                        </div>
                        <div className="sa-small d-muted">
                          <span className="sa-cell-label">Org</span>
                          {org?.name || "Default / Unassigned"}
                        </div>
                        <div>
                          <span className="sa-cell-label">Role</span>
                          <span className="d-pill">{u.role}</span>
                        </div>
                        <div>
                          <span className="sa-cell-label">View</span>
                          <span className="d-pill accent">{u.view}</span>
                        </div>
                        <div className="d-actions">
                          {canEnterDashboard(u.id) ? (
                            <button
                              type="button"
                              onClick={() => handleEnterReadOnlyDashboard(u)}
                              disabled={!!enteringDashboardUserId}
                              className="d-btn sm warn"
                            >
                              {enteringDashboardUserId === u.id && <span className="sa-spin" />}
                              {enteringDashboardUserId === u.id ? "Opening..." : "Enter dashboard"}
                            </button>
                          ) : (
                            <span className="d-pill">Own profile</span>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingUser(u);
                              setUserUpdates({ view: u.view, role: u.role, maxProjects: u.maxProjects ?? 3 });
                            }}
                            className="d-btn sm soft"
                          >
                            Manage
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === "byok" && (
          <div className="sa-stack d-rise">
            <section className="d-card">
              <div className="sa-card-head">
                <div>
                  <div className="d-h2">BYOK ops health</div>
                  <p className="d-note sa-tight">
                    Webhook reliability, stale activations, routing drift, and entitlement drift.
                  </p>
                </div>
                <button
                  type="button"
                  className="d-btn sm soft"
                  onClick={() => void fetchByokOpsData()}
                  disabled={byokEventsLoading}
                >
                  Refresh ops
                </button>
              </div>
              <div className="sa-card-body sa-stats">
                <div className="d-stat">
                  <div className="d-eyebrow">Errors (1h)</div>
                  <div className="n err">{byokOpsHealth?.windows?.lastHour?.errorCount ?? 0}</div>
                  <div className="d-note">Rate: {byokOpsHealth?.windows?.lastHour?.errorRate ?? 0}%</div>
                </div>
                <div className="d-stat">
                  <div className="d-eyebrow">Stale pending</div>
                  <div className="n warn">{byokOpsHealth?.stalePendingActivations?.count ?? 0}</div>
                  <div className="d-note">&gt; {byokOpsHealth?.stalePendingMinutes ?? 0} minutes</div>
                </div>
                <div className="d-stat">
                  <div className="d-eyebrow">Routing drift</div>
                  <div className="n accent">{byokOpsHealth?.routingDrift?.count ?? 0}</div>
                  <div className="d-note">Expected vs org routing domain</div>
                </div>
                <div className="d-stat">
                  <div className="d-eyebrow">Entitlement drift</div>
                  <div className="n violet">{byokOpsHealth?.entitlementDrift?.count ?? 0}</div>
                  <div className="d-note">Org + entitlement mismatch</div>
                </div>
              </div>
            </section>

            <section className="d-card">
              <div className="sa-card-head">
                <div>
                  <div className="d-h2">BYOK organizations</div>
                  <p className="d-note sa-tight">
                    Isolated self-serve tenants from byok.link and package activations.
                  </p>
                </div>
              </div>
              <div className="sa-card-body">
                {byokOrganizations.length === 0 ? (
                  <p className="d-note">No BYOK organizations yet.</p>
                ) : (
                  <div className="d-list">
                    {byokOrganizations.map((org) => {
                      const primaryUser = Array.isArray(org.users) ? org.users[0] : null;
                      return (
                        <div key={org.id} className="sa-grid-row sa-byok">
                          <div>
                            <div className="d-name">{org.name}</div>
                            <div className="sa-mono">{primaryUser?.email || "No primary email"}</div>
                            <div className="d-faint sa-small">Domain: {org.routingDomain || "n/a"}</div>
                          </div>
                          <div>
                            <span className="sa-cell-label">Package</span>
                            <div className="sa-strong">
                              {org.entitlement?.packageCode || org.entitlementCode || "BYOK_TRIAL"}
                            </div>
                            <div className="d-faint sa-small">{org.entitlement?.status || "ACTIVE"}</div>
                          </div>
                          <div className="sa-small d-muted">
                            <span className="sa-cell-label">Limits</span>
                            <div>{org.maxUsers} users</div>
                            <div>{org.maxProjectsTotal} projects</div>
                            <div>{(Number(org.maxStorageMb || 0) / 1024).toFixed(1)} GB</div>
                          </div>
                          <div className="sa-small d-muted">
                            <span className="sa-cell-label">Trial</span>
                            {org.trialEndsAt
                              ? new Date(org.trialEndsAt).toLocaleDateString()
                              : "n/a"}
                          </div>
                          <div>
                            <span className="sa-cell-label">Admin</span>
                            <span className={`d-pill ${org.adminPanelLocked ? "warn" : "ok"}`}>
                              {org.adminPanelLocked ? "Locked" : "Enabled"}
                            </span>
                          </div>
                          <div className="d-actions">
                            <button
                              type="button"
                              onClick={async () => {
                                const packageCode = window.prompt(
                                  "Enter package code: PD_APP, VFX_APP, PD_STUDIO, VFX_STUDIO, VFX_STUDIO_AGENCY",
                                );
                                if (!packageCode) return;
                                await handleManualByokActivation(org.id, packageCode.trim());
                              }}
                              className="d-btn sm soft"
                              disabled={actionLoading}
                            >
                              Activate package
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleResetByokTrial(org.id)}
                              className="d-btn sm warn"
                              disabled={actionLoading}
                            >
                              Reset trial
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            <section className="d-card">
              <div className="sa-card-head">
                <div>
                  <div className="d-h2">BYOK webhook events</div>
                  <p className="d-note sa-tight">
                    Filter by status/package and inspect activation lifecycle.
                  </p>
                </div>
                <div className="d-actions">
                  <select
                    value={byokEventFilters.status}
                    onChange={(e) =>
                      setByokEventFilters((prev) => ({ ...prev, status: e.target.value }))
                    }
                    className="d-select sm"
                    aria-label="Status"
                  >
                    <option value="">All Statuses</option>
                    <option value="PENDING">PENDING</option>
                    <option value="RECEIVED">RECEIVED</option>
                    <option value="VERIFIED">VERIFIED</option>
                    <option value="PROCESSED">PROCESSED</option>
                    <option value="ERROR">ERROR</option>
                    <option value="IGNORED">IGNORED</option>
                  </select>
                  <select
                    value={byokEventFilters.packageCode}
                    onChange={(e) =>
                      setByokEventFilters((prev) => ({ ...prev, packageCode: e.target.value }))
                    }
                    className="d-select sm"
                    aria-label="Package"
                  >
                    <option value="">All Packages</option>
                    <option value="PD_APP">PD_APP</option>
                    <option value="VFX_APP">VFX_APP</option>
                    <option value="PD_STUDIO">PD_STUDIO</option>
                    <option value="VFX_STUDIO">VFX_STUDIO</option>
                    <option value="VFX_STUDIO_AGENCY">VFX_STUDIO_AGENCY</option>
                  </select>
                  <select
                    value={String(byokEventFilters.limit)}
                    onChange={(e) =>
                      setByokEventFilters((prev) => ({
                        ...prev,
                        limit: Number.parseInt(e.target.value, 10) || 80,
                      }))
                    }
                    className="d-select sm"
                    aria-label="Limit"
                  >
                    <option value="50">50</option>
                    <option value="80">80</option>
                    <option value="120">120</option>
                    <option value="200">200</option>
                  </select>
                  <button
                    type="button"
                    className="d-btn sm soft"
                    onClick={() => void fetchByokOpsData()}
                    disabled={byokEventsLoading}
                  >
                    {byokEventsLoading ? "Loading..." : "Refresh"}
                  </button>
                </div>
              </div>

              {byokWebhookEvents.length === 0 ? (
                <div className="sa-card-body">
                  <p className="d-note">No webhook events for current filter.</p>
                </div>
              ) : (
                <div className="sa-table-wrap">
                  <table className="d-table wide">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Provider</th>
                        <th>Status</th>
                        <th>Package</th>
                        <th>Email</th>
                        <th>Checkout session</th>
                        <th>Order</th>
                        <th>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byokWebhookEvents.map((event) => (
                        <tr key={event.id}>
                          <td className="sa-small">
                            {event.createdAt ? new Date(event.createdAt).toLocaleString() : "n/a"}
                          </td>
                          <td className="sa-small sa-accent">{event.provider}</td>
                          <td>
                            <span className="d-pill">{event.status}</span>
                          </td>
                          <td className="sa-small">{event.packageCode || "n/a"}</td>
                          <td className="sa-small">{event.customerEmail || "n/a"}</td>
                          <td className="sa-mono-cell">{event.checkoutSessionId || "n/a"}</td>
                          <td className="sa-small">{event.orderId || "n/a"}</td>
                          <td className="sa-small sa-err-text">{event.error || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}

        {/* TAB CONTENT: MY AGENCY */}
        {activeTab === "my-agency" && (
          <div className="sa-stack d-rise">
            <div className="d-head">
              <div>
                <div className="d-eyebrow">Studio</div>
                <h2 className="d-h1">Default agency team</h2>
                <p className="d-sub">Credit fields save when you leave them.</p>
              </div>
              <button type="button" onClick={() => setShowAddTeamModal(true)} className="d-btn primary">
                Add team member
              </button>
            </div>
            <section className="d-card">
              <div className="sa-table-wrap">
                <table className="d-table wide">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th className="mid">View</th>
                      <th className="mid">PicDrift</th>
                      <th className="mid">PicFX</th>
                      <th className="mid">Video engines (Kling / Topaz / Seedance / H3 Max)</th>
                      <th className="num">Coverage (USD)</th>
                      <th className="num">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myAgencyUsers.map(u => (
                      <tr key={u.id}>
                        <td>
                          <div className="d-name">{u.name}</div>
                          <div className="sa-mono">{u.email}</div>
                        </td>
                        <td className="mid">
                          <span className={`d-pill ${u.view === 'PICDRIFT' ? 'violet' : 'accent'}`}>
                            {u.view}
                          </span>
                        </td>
                        <td className="mid">
                          <input type="number" step="1" min="0" className="d-input sa-num" aria-label="PicDrift credits" disabled={!isUserCreditLimited(u)} defaultValue={u.creditsPicDrift} onBlur={(e) => handleUpdateAgencyUser(u.id, { addCredits: toInt(e.target.value, u.creditsPicDrift) - u.creditsPicDrift, creditType: "creditsPicDrift" })} />
                        </td>
                        <td className="mid">
                          <input type="number" step="1" min="0" className="d-input sa-num" aria-label="PicFX credits" disabled={!isUserCreditLimited(u)} defaultValue={u.creditsImageFX} onBlur={(e) => handleUpdateAgencyUser(u.id, { addCredits: toInt(e.target.value, u.creditsImageFX) - u.creditsImageFX, creditType: "creditsImageFX" })} />
                        </td>
                        <td className="mid">
                          <div className="sa-num-row">
                            <input type="number" step="1" min="0" title="Kling 3.0" aria-label="Kling 3.0 credits" className="d-input sa-num" disabled={!isUserCreditLimited(u)} defaultValue={u.creditsPicDriftPlus} onBlur={(e) => handleUpdateAgencyUser(u.id, { addCredits: toInt(e.target.value, u.creditsPicDriftPlus) - u.creditsPicDriftPlus, creditType: "creditsPicDriftPlus" })} />
                            <input type="number" step="1" min="0" title="Topaz Upscale" aria-label="Topaz Upscale credits" className="d-input sa-num" disabled={!isUserCreditLimited(u)} defaultValue={u.creditsVideoFX1} onBlur={(e) => handleUpdateAgencyUser(u.id, { addCredits: toInt(e.target.value, u.creditsVideoFX1) - u.creditsVideoFX1, creditType: "creditsVideoFX1" })} />
                            <input type="number" step="1" min="0" title="Seedance 2.0" aria-label="Seedance 2.0 credits" className="d-input sa-num" disabled={!isUserCreditLimited(u)} defaultValue={u.creditsVideoFX2} onBlur={(e) => handleUpdateAgencyUser(u.id, { addCredits: toInt(e.target.value, u.creditsVideoFX2) - u.creditsVideoFX2, creditType: "creditsVideoFX2" })} />
                            <input type="number" step="1" min="0" title="H3 Max" aria-label="H3 Max credits" className="d-input sa-num" disabled={!isUserCreditLimited(u)} defaultValue={u.creditsVideoFX3} onBlur={(e) => handleUpdateAgencyUser(u.id, { addCredits: toInt(e.target.value, u.creditsVideoFX3) - u.creditsVideoFX3, creditType: "creditsVideoFX3" })} />
                          </div>
                        </td>
                        <td className="num sa-accent">
                          {formatUsd(getUserCoverageUsd(u))}
                        </td>
                        <td className="num">
                          <div className="d-actions sa-end">
                            {canEnterDashboard(u.id) ? (
                              <button
                                type="button"
                                onClick={() => handleEnterReadOnlyDashboard(u)}
                                disabled={!!enteringDashboardUserId}
                                className="d-btn sm warn"
                              >
                                {enteringDashboardUserId === u.id && <span className="sa-spin" />}
                                {enteringDashboardUserId === u.id ? "Opening..." : "Enter dashboard"}
                              </button>
                            ) : (
                              <span className="d-pill">Own profile</span>
                            )}
                            <button type="button" onClick={() => { setEditingUser(u); setUserUpdates({ view: u.view, role: u.role, maxProjects: u.maxProjects ?? 3 }); }} className="d-btn sm soft">Manage</button>
                            {isProtectedUser(u) ? (
                              <span className="d-pill warn">{getProtectionLabel(u)}</span>
                            ) : (
                              <button
                                type="button"
                                className="d-btn sm danger"
                                onClick={async () => {
                                  if (
                                    await confirmAction(`Remove "${u.email}" from platform?`, {
                                      confirmLabel: "Remove",
                                      critical: true,
                                      confirmationText: `REMOVE ${u.email}`,
                                    })
                                  ) {
                                    apiEndpoints.tenantDeleteUser(u.id).then(fetchInitialData);
                                  }
                                }}
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* TAB CONTENT: DEMO LEADS */}
        {activeTab === "demo-leads" && (
          <div className="sa-stack d-rise">
            <div className="d-head">
              <div>
                <div className="d-eyebrow">Studio</div>
                <h2 className="d-h1">Demo users</h2>
                <p className="d-sub">PicDrift demo accounts — open one read-only or change its view.</p>
              </div>
              <button type="button" onClick={() => setShowDemoModal(true)} className="d-btn primary">
                New demo user
              </button>
            </div>

            {demoUsers.length === 0 ? (
              <div className="d-empty">No demo users yet.</div>
            ) : (
              <div className="sa-cards">
                {demoUsers.map((u) => (
                  <div key={u.id} className="d-card sa-lead">
                    <div className="sa-lead-top">
                      <div>
                        <div className="d-name">{u.name}</div>
                        <div className="sa-mono">{u.email}</div>
                      </div>
                      <span className="d-pill accent">{u.view}</span>
                    </div>
                    <div className="sa-lead-stats">
                      <div>
                        <span className="d-eyebrow">PicDrift</span>
                        <b>{u.creditsPicDrift}</b>
                      </div>
                      <div>
                        <span className="d-eyebrow">PicFX</span>
                        <b>{u.creditsImageFX}</b>
                      </div>
                    </div>
                    <div className="d-actions">
                      {canEnterDashboard(u.id) ? (
                        <button
                          type="button"
                          onClick={() => handleEnterReadOnlyDashboard(u)}
                          disabled={!!enteringDashboardUserId}
                          className="d-btn sm soft"
                        >
                          {enteringDashboardUserId === u.id && <span className="sa-spin" />}
                          {enteringDashboardUserId === u.id ? "Opening…" : "Enter dashboard"}
                        </button>
                      ) : (
                        <span className="d-pill">Own profile</span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingUser(u);
                          setUserUpdates({ view: u.view, role: u.role, maxProjects: u.maxProjects ?? 3 });
                        }}
                        className="d-btn sm ghost"
                      >
                        Edit view
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB CONTENT: LAB */}
        {activeTab === "lab" && globalSettings && (
          <div className="sa-stack d-rise">
            <div className="d-head">
              <div>
                <div className="d-eyebrow">Settings</div>
                <h2 className="d-h1">Experimental lab</h2>
                <p className="d-sub">
                  Controlled feature switches and system media, organized for low-noise operations.
                </p>
              </div>
              <span className="d-pill accent">SuperAdmin</span>
            </div>

            <div className="sa-lab">
              <div className="sa-stack">
                <section className="d-card d-card-pad">
                  <h3 className="d-h2 sa-sec-title">Feature controls</h3>
                  <div className="d-list">
                    <div className="d-row">
                      <div className="d-row-main">
                        <div className="d-name">Video Editor rollout</div>
                        <p className="d-note sa-tight">
                          Keep editor access restricted while testing, then expand globally.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          const nextValue = !Boolean(globalSettings.featureVideoEditorForAll);
                          try {
                            const res = await apiEndpoints.superadminUpdateGlobalSettings({
                              featureVideoEditorForAll: nextValue,
                            });
                            if (res.data?.success) {
                              setGlobalSettings(res.data.settings);
                              setMsg(
                                nextValue
                                  ? "Video Editor rollout enabled for all users."
                                  : "Video Editor restricted to SuperAdmin.",
                              );
                            }
                          } catch (err: any) {
                            setMsg("Error: " + err.message);
                          }
                        }}
                        className={`d-btn sm ${globalSettings.featureVideoEditorForAll ? "soft" : ""}`}
                      >
                        {globalSettings.featureVideoEditorForAll ? "Enabled for all" : "SuperAdmin only"}
                      </button>
                    </div>

                    <div className="d-row">
                      <div className="d-row-main">
                        <div className="d-name">Carousel rollout</div>
                        <p className="d-note sa-tight">
                          Enable Carousel for all users when needed, or keep it restricted to
                          SuperAdmin-only lab access.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          const enabled =
                            Number(globalSettings.pricePicFX_Carousel || 0) > 0;
                          const nextEnabled = !enabled;
                          const nextCarouselPrice = nextEnabled
                            ? Math.max(1, Number(globalSettings.pricePicFX_Carousel || 3))
                            : 0;
                          try {
                            const res = await apiEndpoints.superadminUpdateGlobalSettings({
                              pricePicFX_Carousel: nextCarouselPrice,
                            });
                            if (res.data?.success) {
                              setGlobalSettings(res.data.settings);
                              setMsg(
                                nextEnabled
                                  ? "Carousel rollout enabled for all users."
                                  : "Carousel restricted to SuperAdmin lab access.",
                              );
                            }
                          } catch (err: any) {
                            setMsg("Error: " + err.message);
                          }
                        }}
                        className={`d-btn sm ${Number(globalSettings.pricePicFX_Carousel || 0) > 0 ? "soft" : ""}`}
                      >
                        {Number(globalSettings.pricePicFX_Carousel || 0) > 0
                          ? "Enabled for all"
                          : "SuperAdmin only"}
                      </button>
                    </div>
                  </div>
                </section>

                <section className="d-card d-card-pad">
                  <h3 className="d-h2">Default welcome video</h3>
                  <p className="d-note sa-tight">This appears as a read-only system item in user timelines.</p>

                  <label className="sa-upload">
                    <div>
                      <div className="d-name">
                        {welcomeVideoUploading ? "Uploading welcome video..." : "Replace welcome video"}
                      </div>
                      <div className="d-faint sa-small">Storage-managed upload</div>
                    </div>
                    {welcomeVideoUploading ? (
                      <LoadingSpinner size="sm" variant="light" />
                    ) : (
                      <span className="d-btn sm soft">Choose file</span>
                    )}
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      disabled={welcomeVideoUploading}
                      onChange={async (event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        if (!file) return;
                        if (!file.type.startsWith("video/")) {
                          setMsg("Error: Welcome media must be a video file.");
                          return;
                        }
                        setWelcomeVideoUploading(true);
                        try {
                          const payload = new FormData();
                          payload.append("video", file);
                          const res = await apiEndpoints.superadminUploadWelcomeVideo(payload);
                          if (res.data?.success) {
                            setGlobalSettings(res.data.settings);
                            setWelcomePreviewReady(false);
                            setMsg("Welcome video uploaded and updated.");
                          }
                        } catch (err: any) {
                          setMsg("Error: " + (err?.message || "Welcome video upload failed."));
                        } finally {
                          setWelcomeVideoUploading(false);
                        }
                      }}
                    />
                  </label>

                  <div className="d-actions sa-gap">
                    {globalSettings.welcomeVideoUrl ? (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const res = await apiEndpoints.superadminUpdateGlobalSettings({
                              welcomeVideoUrl: "",
                            });
                            if (res.data?.success) {
                              setGlobalSettings(res.data.settings);
                              setWelcomePreviewReady(false);
                              setMsg("Welcome video cleared.");
                            }
                          } catch (err: any) {
                            setMsg("Error: " + err.message);
                          }
                        }}
                        className="d-btn sm danger"
                      >
                        Clear video
                      </button>
                    ) : (
                      <span className="d-pill">No welcome video configured</span>
                    )}
                  </div>
                </section>
              </div>

              <section className="d-card d-card-pad">
                <div className="d-head">
                  <h3 className="d-h2">Preview monitor</h3>
                  <span className="d-eyebrow">Auto preview</span>
                </div>
                {!globalSettings.welcomeVideoUrl ? (
                  <div className="sa-video sa-video-empty">Upload a video to enable preview.</div>
                ) : (
                  <div className="sa-video">
                    {!welcomePreviewReady && (
                      <div className="sa-video-wait">
                        <LoadingSpinner size="sm" variant="light" />
                        Loading preview
                      </div>
                    )}
                    <video
                      key={globalSettings.welcomeVideoUrl}
                      src={globalSettings.welcomeVideoUrl}
                      controls
                      preload="metadata"
                      onLoadedData={() => setWelcomePreviewReady(true)}
                      onWaiting={() => setWelcomePreviewReady(false)}
                    />
                  </div>
                )}
              </section>
            </div>
          </div>
        )}

        {/* TAB CONTENT: GLOBAL SETTINGS */}
        {activeTab === "global-settings" && globalSettings && (
          <div className="sa-stack d-rise">
            <div className="d-head">
              <div>
                <div className="d-eyebrow">Settings</div>
                <h2 className="d-h1">Global pricing template</h2>
                <p className="d-sub">
                  These prices are used as defaults for all new organizations unless overridden.
                </p>
              </div>
            </div>

            <div className="sa-stats">
              <div className="d-stat">
                <div className="d-eyebrow">Fal coverage needed</div>
                <div className="n violet">{formatUsd(coverageTotals.fal)}</div>
              </div>
              <div className="d-stat">
                <div className="d-eyebrow">Total coverage needed</div>
                <div className="n">{formatUsd(coverageTotals.total)}</div>
              </div>
            </div>

            <div className="sa-pricing">
              <section className="d-card">
                <div className="sa-card-head">
                  <div>
                    <div className="d-h2">Actual provider cost</div>
                    <p className="d-note sa-tight">
                      USD per render. Implied USD/credit is auto-calculated from configured platform deductions.
                    </p>
                  </div>
                </div>
                <div className="sa-table-wrap">
                  <table className="d-table">
                    <thead>
                      <tr>
                        <th>Generation variant</th>
                        <th>Provider</th>
                        <th className="num">Credit / render</th>
                        <th className="num">Cost / render ($)</th>
                        <th className="num">Implied / credit ($)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {variantRows.map((row) => (
                        <tr key={row.id}>
                          <td>{row.label}</td>
                          <td>
                            <span className="d-eyebrow">{row.provider}</span>
                          </td>
                          <td className="num">{row.deductionCredits.toFixed(0)}</td>
                          <td className="num">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={row.providerCostPerRender}
                              onChange={(e) => handleVariantCostChange(row.id, e.target.value)}
                              onBlur={() => void handleVariantCostCommit(row.id)}
                              aria-label={`${row.label} cost per render`}
                              className="d-input sa-num wide"
                            />
                          </td>
                          <td className="num sa-accent">{formatUsd(row.impliedUsdPerCredit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="d-note sa-card-note">
                  Wallet USD/credit uses the highest implied variant rate per wallet (conservative mode).
                </p>
                <div className="sa-table-wrap">
                  <table className="d-table">
                    <thead>
                      <tr>
                        <th>Wallet</th>
                        <th>Provider</th>
                        <th className="num">Allocated credits</th>
                        <th className="num">Derived / credit ($)</th>
                        <th className="num">Coverage ($)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {walletCoverageRows.map((row) => (
                        <tr key={row.key}>
                          <td>{row.label}</td>
                          <td>
                            <span className="d-eyebrow">{row.provider}</span>
                          </td>
                          <td className="num">{row.allocatedCredits.toFixed(0)}</td>
                          <td className="num">{formatUsd(row.usdPerCredit)}</td>
                          <td className="num sa-accent">{formatUsd(row.requiredUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="d-card d-card-pad">
                <div className="d-h2">Platform render credit cost</div>
                <p className="d-note sa-tight">Credits per render. Each field saves when you leave it.</p>

                <div className="d-hair sa-price-group">
                  <div className="d-label">PicDrift engine</div>
                  {[
                    { key: "pricePicDrift_5s", label: "Standard 5s" },
                    { key: "pricePicDrift_10s", label: "Standard 10s" },
                    { key: "priceAsset_DriftPath", label: "3DX Drift Path" },
                  ].map(({ key, label }) => (
                    <div key={key} className="sa-price-row">
                      <span>{label}</span>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        aria-label={label}
                        className="d-input sa-num"
                        defaultValue={toInt(String(globalSettings[key]), 0)}
                        onBlur={(e) =>
                          apiEndpoints.superadminUpdateGlobalSettings({
                            [key]: toInt(
                              e.target.value,
                              toInt(String(globalSettings[key]), 0),
                            ),
                          })
                        }
                      />
                    </div>
                  ))}
                </div>

                <div className="d-hair sa-price-group">
                  <div className="d-label">Studio &amp; editor</div>
                  {["pricePicFX_Standard", "pricePicFX_Carousel", "pricePicFX_Batch", "priceEditor_Pro", "priceEditor_Enhance", "priceEditor_Convert"].map(key => (
                    <div key={key} className="sa-price-row">
                      <span title={key}>{key.replace('price', '').replace(/_/g, ' ')}</span>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        aria-label={key}
                        className="d-input sa-num"
                        defaultValue={toInt(String(globalSettings[key]), 0)}
                        onBlur={(e) =>
                          apiEndpoints.superadminUpdateGlobalSettings({
                            [key]: toInt(
                              e.target.value,
                              toInt(String(globalSettings[key]), 0),
                            ),
                          })
                        }
                      />
                    </div>
                  ))}
                </div>

                <div className="d-hair sa-price-group">
                  <div className="d-label">Video engines</div>
                  {[
                    { key: "pricePicDrift_Plus_5s", label: "Kling 3.0 · 5s" },
                    { key: "pricePicDrift_Plus_10s", label: "Kling 3.0 · 10s" },
                    { key: "priceVideoFX1_10s", label: "Topaz Upscale 2x" },
                    { key: "priceVideoFX1_15s", label: "Topaz Upscale 4x" },
                    { key: "priceVideoFX2_4s", label: "Seedance 2.0 · 4s" },
                    { key: "priceVideoFX2_8s", label: "Seedance 2.0 · 8s" },
                    { key: "priceVideoFX2_12s", label: "Seedance 2.0 · 12s" },
                    { key: "priceVideoFX3_4s", label: "H3 Max · 5–6s" },
                    { key: "priceVideoFX3_6s", label: "H3 Max · 7–10s" },
                    { key: "priceVideoFX3_8s", label: "H3 Max · 11–15s" },
                  ].map(({ key, label }) => (
                    <div key={key} className="sa-price-row">
                      <span>{label}</span>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        aria-label={label}
                        className="d-input sa-num"
                        defaultValue={toInt(String(globalSettings[key]), 0)}
                        onBlur={(e) =>
                          apiEndpoints.superadminUpdateGlobalSettings({
                            [key]: toInt(
                              e.target.value,
                              toInt(String(globalSettings[key]), 0),
                            ),
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}
        </div>
      </main>

      <div className="sa-ink">
      {/* MODAL: NEW TENANT */}
      {showTenantModal && (
        <div className="sa-overlay">
          <div className="sa-dialog" role="dialog" aria-modal="true" aria-labelledby="new-tenant-title">
            <div className="sa-dialog-head">
              <div>
                <h3 id="new-tenant-title" className="d-h1">Provision new tenant</h3>
                <p className="d-note sa-tight">Create organization &amp; admin account</p>
              </div>
            </div>
            <form onSubmit={handleCreateTenant} className="sa-dialog-body">
              <div className="d-field">
                <label className="d-label" htmlFor="new-tenant-name">Organization name</label>
                <input
                  id="new-tenant-name"
                  className="d-input"
                  placeholder="e.g. Paramount Visuals"
                  required
                  onChange={e => setNewTenant({ ...newTenant, orgName: e.target.value })}
                />
              </div>
              <div className="sa-grid-2">
                <div className="d-field">
                  <label className="d-label" htmlFor="new-tenant-users">User limit</label>
                  <input id="new-tenant-users" type="number" className="d-input" defaultValue={5} onChange={e => setNewTenant({ ...newTenant, maxUsers: parseInt(e.target.value) })} />
                </div>
                <div className="d-field">
                  <label className="d-label" htmlFor="new-tenant-projects">Project limit</label>
                  <input id="new-tenant-projects" type="number" className="d-input" defaultValue={20} onChange={e => setNewTenant({ ...newTenant, maxProjectsTotal: parseInt(e.target.value) })} />
                </div>
              </div>
              <div className="d-field">
                <label className="d-label" htmlFor="new-tenant-storage">Platform storage limit (GB)</label>
                <input
                  id="new-tenant-storage"
                  type="number"
                  step="0.25"
                  min="0"
                  className="d-input"
                  value={mbToGb(newTenant.maxStorageMb).toString()}
                  onChange={e =>
                    setNewTenant({
                      ...newTenant,
                      maxStorageMb: gbToMb(e.target.value, newTenant.maxStorageMb),
                    })
                  }
                />
                <p className="d-note sa-tight">Default 10GB</p>
              </div>
              <div className="d-field">
                <label className="d-label" htmlFor="new-tenant-view">Platform view</label>
                <select
                  id="new-tenant-view"
                  className="d-select"
                  value={newTenant.view}
                  onChange={e => setNewTenant({ ...newTenant, view: e.target.value })}
                >
                  <option value="VISIONLIGHT">VisionLight View (Full)</option>
                  <option value="PICDRIFT">PicDrift View (Limited)</option>
                </select>
              </div>
              <div className="d-hair sa-plan">
                <div className="d-label sa-flat">Tenant type</div>
                <div className="d-tabs fill" role="radiogroup" aria-label="Tenant type">
                  {["PAID", "DEMO"].map((plan) => (
                    <button
                      key={plan}
                      type="button"
                      role="radio"
                      aria-checked={newTenant.tenantPlan === plan}
                      onClick={() => setNewTenant({ ...newTenant, tenantPlan: plan })}
                      className={`d-tab ${newTenant.tenantPlan === plan ? "active" : ""}`}
                    >
                      {plan === "PAID" ? "Paid" : "Demo"}
                    </button>
                  ))}
                </div>
                {newTenant.tenantPlan === "DEMO" && (
                  <div className="d-field">
                    <label className="d-label" htmlFor="new-tenant-days">Deactivate after days</label>
                    <input
                      id="new-tenant-days"
                      type="number"
                      min="1"
                      step="1"
                      className="d-input"
                      value={newTenant.trialDays}
                      onChange={(e) =>
                        setNewTenant({
                          ...newTenant,
                          trialDays: Math.max(1, toInt(e.target.value, 14)),
                        })
                      }
                    />
                  </div>
                )}
              </div>
              <div className="sa-divide sa-stack-sm">
                <div className="d-label sa-flat">Tenant admin account</div>
                <input
                  className="d-input"
                  placeholder="Admin Email"
                  type="email"
                  value={newTenant.adminEmail}
                  required
                  onChange={(e) => {
                    setNewTenant({ ...newTenant, adminEmail: e.target.value });
                    setTenantAdminEmailStatus(null);
                  }}
                />
                {isTenantAdminEmailChecked && (
                  <div className={`d-banner ${tenantAdminEmailStatus?.authExists ? "sa-info" : "warn"}`}>
                    <span>
                      {tenantAdminEmailStatus?.authExists
                        ? "Existing login found. Tenant admin will use their current password."
                        : "New login. Set an initial password for this tenant admin."}
                    </span>
                  </div>
                )}
                {canContinueTenantAdmin && (
                  <>
                    <input
                      className="d-input"
                      placeholder="Admin Name (optional)"
                      value={newTenant.adminName}
                      onChange={e => setNewTenant({ ...newTenant, adminName: e.target.value })}
                    />
                    {tenantAdminNeedsPassword && (
                      <input
                        className="d-input"
                        placeholder="Initial Password"
                        type="password"
                        value={newTenant.adminPassword}
                        required
                        minLength={6}
                        onChange={e => setNewTenant({ ...newTenant, adminPassword: e.target.value })}
                      />
                    )}
                  </>
                )}
              </div>
              <div className="sa-dialog-foot">
                <button
                  type="button"
                  onClick={() => {
                    setShowTenantModal(false);
                    resetNewTenantForm();
                  }}
                  className="d-btn ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || checkingTenantAdminEmail}
                  className="d-btn primary"
                >
                  {actionLoading ? (
                    <LoadingSpinner size="sm" color="text-gray-950" />
                  ) : checkingTenantAdminEmail ? (
                    "Checking..."
                  ) : canContinueTenantAdmin ? (
                    "Deploy Tenant"
                  ) : (
                    "Continue"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT TENANT */}
      {editingTenant && (
        <div className="sa-overlay">
          <div className="sa-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-tenant-title">
            <div className="sa-dialog-head">
              <div>
                <h3 id="edit-tenant-title" className="d-h1">
                  {editingTenant.isDefault ? "Configure default org" : "Configure tenant"}
                </h3>
                <p className="d-note sa-tight">{editingTenant.name}</p>
              </div>
              <button type="button" onClick={() => setEditingTenant(null)} className="d-x" aria-label="Close">
                ×
              </button>
            </div>
            <div className="sa-dialog-body">
              <div className="d-field">
                <label className="d-label" htmlFor="edit-tenant-name">Organization name</label>
                <input
                  id="edit-tenant-name"
                  className="d-input"
                  value={tenantUpdates.name}
                  onChange={e => setTenantUpdates({ ...tenantUpdates, name: e.target.value })}
                />
              </div>

              <div className="sa-grid-2">
                <div className="d-field">
                  <label className="d-label" htmlFor="edit-tenant-users">Max users</label>
                  <input
                    id="edit-tenant-users"
                    type="number"
                    className="d-input"
                    value={tenantUpdates.maxUsers}
                    onChange={e => setTenantUpdates({ ...tenantUpdates, maxUsers: parseInt(e.target.value) })}
                  />
                </div>
                <div className="d-field">
                  <label className="d-label" htmlFor="edit-tenant-projects">Max projects</label>
                  <input
                    id="edit-tenant-projects"
                    type="number"
                    className="d-input"
                    value={tenantUpdates.maxProjectsTotal}
                    onChange={e => setTenantUpdates({ ...tenantUpdates, maxProjectsTotal: parseInt(e.target.value) })}
                  />
                </div>
              </div>

              <div className="d-field">
                <label className="d-label" htmlFor="edit-tenant-storage">Platform storage limit (GB)</label>
                <input
                  id="edit-tenant-storage"
                  type="number"
                  step="0.25"
                  min="0"
                  className="d-input"
                  value={mbToGb(tenantUpdates.maxStorageMb).toString()}
                  onChange={e =>
                    setTenantUpdates({
                      ...tenantUpdates,
                      maxStorageMb: gbToMb(e.target.value, tenantUpdates.maxStorageMb),
                    })
                  }
                />
              </div>
              {editingTenant.storageSummary && (
                <div className="d-hair sa-plan sa-tight-gap">
                  <div className="d-label sa-flat">Current storage usage</div>
                  <div className="sa-strong">
                    {mbToGb(Number(editingTenant.storageSummary.usedMb || 0)).toFixed(2)}GB used
                  </div>
                  <div className="d-faint sa-small">
                    Remaining {mbToGb(Number(editingTenant.storageSummary.remainingMb || 0)).toFixed(2)}GB
                  </div>
                </div>
              )}

              {editingTenant.isDefault ? (
                <div className="d-banner ok">
                  <span>
                    Default org is platform-owned and protected. You can rename it and adjust limits, but deletion,
                    deactivation, and bulk platform-view switching are disabled.
                  </span>
                </div>
              ) : (
                <>
                  <div className="d-field">
                    <label className="d-label" htmlFor="edit-tenant-view">Platform view (applies to all users)</label>
                    <select
                      id="edit-tenant-view"
                      className="d-select"
                      value={tenantUpdates.view}
                      onChange={e => setTenantUpdates({ ...tenantUpdates, view: e.target.value })}
                    >
                      <option value="VISIONLIGHT">VisionLight View (Full)</option>
                      <option value="PICDRIFT">PicDrift View (Limited)</option>
                    </select>
                  </div>

                  <div className="d-field">
                    <div className="d-label">Subscription status</div>
                    <div className="sa-grid-2">
                      <button
                        type="button"
                        onClick={() => setTenantUpdates({ ...tenantUpdates, isActive: true })}
                        className={`d-btn ${tenantUpdates.isActive ? "sa-on-ok" : ""}`}
                      >
                        Active
                      </button>
                      <button
                        type="button"
                        onClick={() => setTenantUpdates({ ...tenantUpdates, isActive: false })}
                        className={`d-btn ${!tenantUpdates.isActive ? "sa-on-err" : ""}`}
                      >
                        Deactivated
                      </button>
                    </div>
                  </div>

                  <div className="d-hair sa-plan">
                    <div className="d-head">
                      <div className="d-label sa-flat">Plan &amp; billing</div>
                      <span
                        className={`d-pill ${
                          (editingTenant as any).tenantPlan === "DEMO"
                            ? "warn"
                            : (editingTenant as any).tenantPlan === "PAID"
                              ? "ok"
                              : ""
                        }`}
                      >
                        {(editingTenant as any).tenantPlan === "DEMO"
                          ? "Demo"
                          : (editingTenant as any).tenantPlan === "PAID"
                            ? `Premium${(editingTenant as any).entitlementCode ? ` · ${(editingTenant as any).entitlementCode}` : ""}`
                            : "Standard"}
                      </span>
                    </div>

                    {/* Plan flip — keeps the tenant on their own view-based
                        domain (no BYOK, no domain change). */}
                    <div className="sa-inline">
                      <div className="sa-days">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={planDemoDays}
                          onChange={(e) =>
                            setPlanDemoDays(Math.max(1, toInt(e.target.value, 14)))
                          }
                          title="Demo length in days"
                          aria-label="Demo length in days"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            void handleSetManualPlan(
                              editingTenant.id,
                              "DEMO",
                              planDemoDays,
                            )
                          }
                          disabled={actionLoading}
                          className="d-btn sm warn"
                        >
                          Start demo
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          void handleSetManualPlan(editingTenant.id, "PAID")
                        }
                        disabled={actionLoading}
                        className="d-btn sm sa-on-ok sa-grow"
                      >
                        Mark as paid
                      </button>
                    </div>
                    <p className="d-note sa-flat">
                      Keeps their view &amp; {tenantUpdates.view === "PICDRIFT" ? "picdrift.studio" : "visualfx.studio"} domain.
                      Demo runs for the days you set; after it ends they keep their
                      dashboard &amp; content but can&rsquo;t render until upgraded.
                    </p>

                    {/* Explicit package activation — intentionally applies the
                        package's domain routing (moves them onto a BYOK domain). */}
                    <div className="sa-divide sa-stack-sm">
                      <label className="d-label sa-flat" htmlFor="edit-tenant-package">
                        Activate a package (advanced)
                      </label>
                      <div className="sa-inline">
                        <select
                          id="edit-tenant-package"
                          value={planPackageCode}
                          onChange={(e) => setPlanPackageCode(e.target.value)}
                          className="d-select sm sa-grow"
                        >
                          <option value="BYOK_TRIAL">BYOK Trial (14-day · byok.link)</option>
                          <option value="PD_APP">PicDrift App</option>
                          <option value="VFX_APP">VisualFX App</option>
                          <option value="PD_STUDIO">PicDrift Studio</option>
                          <option value="VFX_STUDIO">VisualFX Studio</option>
                          <option value="VFX_STUDIO_AGENCY">Studio Agency</option>
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            void handleActivatePackage(editingTenant.id, planPackageCode)
                          }
                          disabled={actionLoading}
                          className="d-btn sm soft"
                        >
                          Activate
                        </button>
                      </div>
                      <p className="d-note sa-flat sa-warn-note">
                        Moves the tenant onto the package&rsquo;s domain &amp; limits (BYOK lifecycle). Use only when you want package-specific routing.
                      </p>
                    </div>
                  </div>
                </>
              )}

              <div className="sa-dialog-foot">
                <button type="button" onClick={() => setEditingTenant(null)} className="d-btn ghost">Cancel</button>
                <button type="button" onClick={handleUpdateTenant} disabled={actionLoading} className="d-btn primary">
                  {actionLoading ? <LoadingSpinner size="sm" color="text-gray-950" /> : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT USER (Manage View/Role) */}
      {editingUser && (
        <div className="sa-overlay">
          <div className="sa-dialog sm" role="dialog" aria-modal="true" aria-labelledby="edit-user-title">
            <div className="sa-dialog-head">
              <div>
                <h3 id="edit-user-title" className="d-h1">Manage user</h3>
                <p className="d-note sa-tight">{editingUser.email}</p>
              </div>
            </div>
            <div className="sa-dialog-body">
              <div className="d-field">
                <label className="d-label" htmlFor="edit-user-view">Platform view</label>
                <select
                  id="edit-user-view"
                  className="d-select"
                  value={userUpdates.view}
                  onChange={e => setUserUpdates({ ...userUpdates, view: e.target.value })}
                >
                  <option value="PICDRIFT">PICDRIFT (Demo Mode)</option>
                  <option value="VISIONLIGHT">VISIONLIGHT (Full Mode)</option>
                </select>
              </div>

              <div className="d-field">
                <label className="d-label" htmlFor="edit-user-role">Account role</label>
                <select
                  id="edit-user-role"
                  className="d-select"
                  value={userUpdates.role}
                  disabled={isProtectedUser(editingUser)}
                  onChange={e => setUserUpdates({ ...userUpdates, role: e.target.value })}
                >
                  <option value="USER">Standard User</option>
                  <option value="MANAGER">Agency Manager</option>
                  <option value="ADMIN">Organization Admin</option>
                  <option value="SUPERADMIN">System SuperAdmin</option>
                </select>
                {isProtectedUser(editingUser) && (
                  <p className="d-note sa-tight sa-warn-note">
                    {getProtectionLabel(editingUser)} role cannot be downgraded.
                  </p>
                )}
              </div>

              {editingUser.organizationId === adminUser?.organizationId && (
                <div className="d-field">
                  <label className="d-label" htmlFor="edit-user-projects">Project limit</label>
                  {userUpdates.role === "SUPERADMIN" ? (
                    <div className="d-banner ok">
                      <span>Unlimited (SuperAdmin)</span>
                    </div>
                  ) : (
                    <input
                      id="edit-user-projects"
                      type="number"
                      min={1}
                      className="d-input"
                      value={userUpdates.maxProjects}
                      onChange={e => setUserUpdates({ ...userUpdates, maxProjects: Math.max(1, toInt(e.target.value, 3)) })}
                    />
                  )}
                  <p className="d-note sa-tight">Drawn from the agency's project pool.</p>
                </div>
              )}

              <div className="d-hair sa-plan sa-tight-gap">
                <div className="d-label sa-flat">Password reset</div>
                <p className="d-note sa-flat">
                  Passwords are account-level and may be shared across multiple studios. Users reset their own password from the login page.
                </p>
              </div>

              <div className="sa-dialog-foot">
                <button type="button" onClick={() => setEditingUser(null)} className="d-btn ghost">Cancel</button>
                <button type="button" onClick={handleUpdateUserBasic} disabled={actionLoading} className="d-btn primary">
                  Update User
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: NEW DEMO */}
      {showDemoModal && (
        <div className="sa-overlay">
          <div className="sa-dialog sm" role="dialog" aria-modal="true" aria-labelledby="new-demo-title">
            <div className="sa-dialog-head">
              <div>
                <h3 id="new-demo-title" className="d-h1">New demo account</h3>
                <p className="d-note sa-tight">Locked to PicDrift view</p>
              </div>
            </div>
            <form onSubmit={handleCreateDemo} className="sa-dialog-body">
              <input
                className="d-input"
                placeholder="Demo Lead Email"
                type="email"
                value={newDemo.email}
                required
                onChange={(e) => {
                  setNewDemo({ ...newDemo, email: e.target.value });
                  setDemoEmailStatus(null);
                }}
              />
              {isDemoEmailChecked && (
                <div
                  className={`d-banner ${
                    demoEmailStatus?.existingProfileInOrganization
                      ? "err"
                      : demoEmailStatus?.authExists
                        ? "sa-info"
                        : "warn"
                  }`}
                >
                  <span>
                    {demoEmailStatus?.existingProfileInOrganization
                      ? "This email already has a demo/default workspace profile."
                      : demoEmailStatus?.authExists
                        ? "Existing login found. Demo profile will use the current password."
                        : "New login. Set an initial password for this demo profile."}
                  </span>
                </div>
              )}
              {canContinueDemo && (
                <>
                  <input
                    className="d-input"
                    placeholder="Demo Lead Name"
                    value={newDemo.name}
                    required
                    onChange={e => setNewDemo({ ...newDemo, name: e.target.value })}
                  />
                  {demoNeedsPassword && (
                    <input
                      className="d-input"
                      placeholder="Initial Password"
                      type="password"
                      value={newDemo.password}
                      required
                      minLength={6}
                      onChange={e => setNewDemo({ ...newDemo, password: e.target.value })}
                    />
                  )}
                </>
              )}
              <div className="sa-dialog-foot">
                <button
                  type="button"
                  onClick={() => {
                    setShowDemoModal(false);
                    resetNewDemoForm();
                  }}
                  className="d-btn ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    actionLoading ||
                    checkingDemoEmail ||
                    demoEmailStatus?.existingProfileInOrganization === true
                  }
                  className="d-btn primary"
                >
                  {actionLoading ? (
                    <LoadingSpinner size="sm" color="text-gray-950" />
                  ) : checkingDemoEmail ? (
                    "Checking..."
                  ) : canContinueDemo ? (
                    "Create Demo"
                  ) : (
                    "Continue"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: GLOBAL PRESET */}
      {showPresetModal && (
        <div className="sa-overlay">
          <div className="sa-dialog" role="dialog" aria-modal="true" aria-labelledby="preset-dialog-title">
            <div className="sa-dialog-head">
              <div>
                <h3 id="preset-dialog-title" className="d-h1">
                  {editingPreset ? "Edit global preset" : "New global preset"}
                </h3>
                <p className="d-note sa-tight">Appears for every user</p>
              </div>
              <button type="button" onClick={() => setShowPresetModal(false)} className="d-x" aria-label="Close">
                ×
              </button>
            </div>
            <form onSubmit={handleSavePreset} className="sa-dialog-body">
              <div className="d-field">
                <label className="d-label" htmlFor="preset-name">Preset name</label>
                <input
                  id="preset-name"
                  className="d-input"
                  placeholder="e.g. Cinematic 8K"
                  required
                  value={presetForm.name}
                  onChange={e => setPresetForm({ ...presetForm, name: e.target.value })}
                />
              </div>

              <div className="d-field">
                <label className="d-label" htmlFor="preset-prompt">Prompt content</label>
                <textarea
                  id="preset-prompt"
                  className="d-textarea sa-prompt"
                  placeholder="The base prompt to apply..."
                  required
                  value={presetForm.prompt}
                  onChange={e => setPresetForm({ ...presetForm, prompt: e.target.value })}
                />
              </div>

              <label className="d-check" htmlFor="preset-active">
                <input
                  type="checkbox"
                  id="preset-active"
                  checked={presetForm.isActive}
                  onChange={e => setPresetForm({ ...presetForm, isActive: e.target.checked })}
                />
                Preset is active
              </label>

              <div className="sa-dialog-foot">
                <button type="button" onClick={() => setShowPresetModal(false)} className="d-btn ghost">
                  Cancel
                </button>
                <button type="submit" disabled={actionLoading} className="d-btn primary">
                  {actionLoading ? <LoadingSpinner size="sm" color="text-gray-950" /> : (editingPreset ? "Update preset" : "Save preset")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDITOR PRESET (PicFX + Convert) */}
      {showEditorPresetModal && (
        <div className="sa-overlay">
          <div className="sa-dialog" role="dialog" aria-modal="true" aria-labelledby="editor-preset-dialog-title">
            <div className="sa-dialog-head">
              <div>
                <h3 id="editor-preset-dialog-title" className="d-h1">
                  {editingEditorPreset ? "Edit editor preset" : "New editor preset"}
                </h3>
                <p className="d-note sa-tight">PicFX + Convert tabs only</p>
              </div>
              <button type="button" onClick={() => setShowEditorPresetModal(false)} className="d-x" aria-label="Close">
                ×
              </button>
            </div>
            <form onSubmit={handleSaveEditorPreset} className="sa-dialog-body">
              <div className="d-field">
                <label className="d-label" htmlFor="editor-preset-name">Preset name</label>
                <input
                  id="editor-preset-name"
                  className="d-input"
                  placeholder="e.g. Cinematic Relight"
                  required
                  value={editorPresetForm.name}
                  onChange={e => setEditorPresetForm({ ...editorPresetForm, name: e.target.value })}
                />
              </div>

              <div className="d-field">
                <label className="d-label" htmlFor="editor-preset-prompt">Prompt content</label>
                <textarea
                  id="editor-preset-prompt"
                  className="d-textarea sa-prompt"
                  placeholder="The base prompt to apply..."
                  required
                  value={editorPresetForm.prompt}
                  onChange={e => setEditorPresetForm({ ...editorPresetForm, prompt: e.target.value })}
                />
              </div>

              <label className="d-check" htmlFor="editor-preset-active">
                <input
                  type="checkbox"
                  id="editor-preset-active"
                  checked={editorPresetForm.isActive}
                  onChange={e => setEditorPresetForm({ ...editorPresetForm, isActive: e.target.checked })}
                />
                Preset is active
              </label>

              <div className="sa-dialog-foot">
                <button type="button" onClick={() => setShowEditorPresetModal(false)} className="d-btn ghost">
                  Cancel
                </button>
                <button type="submit" disabled={actionLoading} className="d-btn primary">
                  {actionLoading ? <LoadingSpinner size="sm" color="text-gray-950" /> : (editingEditorPreset ? "Update preset" : "Save preset")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD TEAM MEMBER */}
      {showAddTeamModal && (
        <div className="sa-overlay">
          <div className="sa-dialog sm" role="dialog" aria-modal="true" aria-labelledby="add-member-title">
            <div className="sa-dialog-head">
              <div>
                <h3 id="add-member-title" className="d-h1">New agency member</h3>
              </div>
            </div>
            <form onSubmit={handleAddTeamMember} className="sa-dialog-body">
              <input
                className="d-input"
                placeholder="Email Address"
                type="email"
                value={newTeamMember.email}
                required
                onChange={(e) => {
                  setNewTeamMember({ ...newTeamMember, email: e.target.value });
                  setTeamMemberEmailStatus(null);
                }}
              />
              {isTeamMemberEmailChecked && (
                <div
                  className={`d-banner ${
                    teamMemberEmailStatus?.existingProfileInOrganization
                      ? "err"
                      : teamMemberEmailStatus?.authExists
                        ? "sa-info"
                        : "warn"
                  }`}
                >
                  <span>
                    {teamMemberEmailStatus?.existingProfileInOrganization
                      ? "This email is already a member of this organization."
                      : teamMemberEmailStatus?.authExists
                        ? "Existing login found. This member will use their current password."
                        : "New login. Set a temporary password for this member."}
                  </span>
                </div>
              )}
              {canContinueTeamMember && (
                <>
                  <input
                    className="d-input"
                    placeholder="Full Name"
                    value={newTeamMember.name}
                    required
                    onChange={e => setNewTeamMember({ ...newTeamMember, name: e.target.value })}
                  />
                  {teamMemberNeedsPassword && (
                    <input
                      className="d-input"
                      placeholder="Temporary Password"
                      type="password"
                      value={newTeamMember.password}
                      required
                      minLength={6}
                      onChange={e => setNewTeamMember({ ...newTeamMember, password: e.target.value })}
                    />
                  )}
                  <select
                    className="d-select"
                    aria-label="Role"
                    value={newTeamMember.role}
                    onChange={e => setNewTeamMember({ ...newTeamMember, role: e.target.value })}
                  >
                    <option value="USER">Standard User</option>
                    <option value="MANAGER">Team Manager</option>
                  </select>
                  <select
                    className="d-select"
                    aria-label="Platform view"
                    value={newTeamMember.view}
                    onChange={e => setNewTeamMember({ ...newTeamMember, view: e.target.value })}
                  >
                    <option value="VISIONLIGHT">VisionLight View (Full)</option>
                    <option value="PICDRIFT">PicDrift View (Limited)</option>
                  </select>
                  <div className="d-field">
                    <label className="d-label" htmlFor="new-member-projects">
                      Project limit
                    </label>
                    <input
                      id="new-member-projects"
                      type="number"
                      min={1}
                      className="d-input"
                      value={newTeamMember.maxProjects}
                      onChange={e =>
                        setNewTeamMember({
                          ...newTeamMember,
                          maxProjects: Math.max(1, toInt(e.target.value, 3)),
                        })
                      }
                    />
                    <p className="d-note sa-tight">
                      Max projects this member can create. Drawn from the agency's project pool.
                    </p>
                  </div>
                </>
              )}
              <div className="sa-dialog-foot">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddTeamModal(false);
                    resetNewTeamMemberForm();
                  }}
                  className="d-btn ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    actionLoading ||
                    checkingTeamMemberEmail ||
                    teamMemberEmailStatus?.existingProfileInOrganization === true
                  }
                  className="d-btn primary"
                >
                  {actionLoading ? (
                    <LoadingSpinner size="sm" color="text-gray-950" />
                  ) : checkingTeamMemberEmail ? (
                    "Checking..."
                  ) : canContinueTeamMember ? (
                    "Add Member"
                  ) : (
                    "Continue"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
