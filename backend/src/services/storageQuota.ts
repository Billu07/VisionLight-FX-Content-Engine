import axios from "axios";
import { prisma } from "./database";

const BYTES_PER_MB = 1024 * 1024;

const toSafeNonNegativeInt = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
};

const toMb = (bytes: number) => bytes / BYTES_PER_MB;

export interface OrganizationStorageSummary {
  organizationId: string;
  limitMb: number;
  limitBytes: number;
  usedBytes: number;
  usedMb: number;
  remainingBytes: number;
  remainingMb: number;
  usagePercent: number;
  isOverLimit: boolean;
}

export class StorageLimitExceededError extends Error {
  statusCode = 400;
  summary: OrganizationStorageSummary;
  incomingBytes: number;

  constructor(summary: OrganizationStorageSummary, incomingBytes: number) {
    const incomingMb = toMb(incomingBytes).toFixed(2);
    const remainingMb = summary.remainingMb.toFixed(2);
    const limitMb = summary.limitMb.toFixed(2);
    const usedMb = summary.usedMb.toFixed(2);
    super(
      `Storage limit exceeded. Tried to add ${incomingMb}MB, remaining ${remainingMb}MB (used ${usedMb}MB of ${limitMb}MB).`,
    );
    this.name = "StorageLimitExceededError";
    this.summary = summary;
    this.incomingBytes = incomingBytes;
  }
}

const toStorageSummary = (
  organizationId: string,
  limitMb: number,
  usedBytesRaw: number,
): OrganizationStorageSummary => {
  const limitBytes = toSafeNonNegativeInt(limitMb) * BYTES_PER_MB;
  const usedBytes = toSafeNonNegativeInt(usedBytesRaw);
  const remainingBytes = Math.max(0, limitBytes - usedBytes);
  const usagePercent =
    limitBytes > 0 ? Math.min(100, (usedBytes / limitBytes) * 100) : 0;

  return {
    organizationId,
    limitMb: toSafeNonNegativeInt(limitMb),
    limitBytes,
    usedBytes,
    usedMb: toMb(usedBytes),
    remainingBytes,
    remainingMb: toMb(remainingBytes),
    usagePercent,
    isOverLimit: usedBytes > limitBytes,
  };
};

const parseContentLength = (value: unknown) => {
  if (Array.isArray(value)) return parseContentLength(value[0]);
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
};

export const storageQuotaService = {
  async getOrganizationStorageSummary(
    organizationId: string,
  ): Promise<OrganizationStorageSummary | null> {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, maxStorageMb: true },
    });
    if (!org) return null;

    const usage = await prisma.asset.aggregate({
      where: {
        organizationId,
        sizeBytes: { not: null },
      },
      _sum: { sizeBytes: true },
    });

    return toStorageSummary(
      org.id,
      org.maxStorageMb,
      Number(usage._sum.sizeBytes || 0),
    );
  },

  async getStorageUsageMapForOrganizations(
    organizationIds: string[],
  ): Promise<Record<string, number>> {
    if (!organizationIds.length) return {};

    const grouped = await prisma.asset.groupBy({
      by: ["organizationId"],
      where: {
        organizationId: { in: organizationIds },
        sizeBytes: { not: null },
      },
      _sum: { sizeBytes: true },
    });

    const usageMap: Record<string, number> = {};
    for (const row of grouped) {
      if (!row.organizationId) continue;
      usageMap[row.organizationId] = toSafeNonNegativeInt(
        Number(row._sum.sizeBytes || 0),
      );
    }
    return usageMap;
  },

  async getUserOrganizationStorageSummary(
    userId: string,
  ): Promise<OrganizationStorageSummary | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true },
    });
    if (!user?.organizationId) return null;
    return this.getOrganizationStorageSummary(user.organizationId);
  },

  async assertOrganizationCapacityForBytes(
    organizationId: string | null | undefined,
    incomingBytes: number,
  ) {
    const bytes = toSafeNonNegativeInt(incomingBytes);
    if (!organizationId || bytes <= 0) return null;

    const summary = await this.getOrganizationStorageSummary(organizationId);
    if (!summary) return null;

    if (summary.usedBytes + bytes > summary.limitBytes) {
      throw new StorageLimitExceededError(summary, bytes);
    }

    return summary;
  },

  async detectRemoteFileSizeBytes(url: string): Promise<number | null> {
    try {
      const headRes = await axios.head(url, {
        timeout: 10000,
        maxRedirects: 5,
        validateStatus: (status) => status >= 200 && status < 400,
      });
      const len = parseContentLength(headRes.headers?.["content-length"]);
      if (len !== null) return len;
    } catch {
      // HEAD isn't always available; continue with range probe.
    }

    try {
      const rangeRes = await axios.get(url, {
        timeout: 15000,
        maxRedirects: 5,
        responseType: "stream",
        headers: { Range: "bytes=0-0" },
        validateStatus: (status) =>
          status === 206 || (status >= 200 && status < 300),
      });

      const contentRange = String(rangeRes.headers?.["content-range"] || "");
      const rangeMatch = contentRange.match(/\/(\d+)$/);
      if (rangeMatch) {
        const parsed = Number(rangeMatch[1]);
        if (Number.isFinite(parsed) && parsed >= 0) {
          if (rangeRes.data && typeof rangeRes.data.destroy === "function") {
            rangeRes.data.destroy();
          }
          return Math.floor(parsed);
        }
      }

      const len = parseContentLength(rangeRes.headers?.["content-length"]);
      if (len !== null) {
        if (rangeRes.data && typeof rangeRes.data.destroy === "function") {
          rangeRes.data.destroy();
        }
        return len;
      }

      if (rangeRes.data && typeof rangeRes.data.destroy === "function") {
        rangeRes.data.destroy();
      }
    } catch {
      return null;
    }

    return null;
  },
};
