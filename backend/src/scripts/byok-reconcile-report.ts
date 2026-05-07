import { prisma } from "../services/database";
import { BYOK_PACKAGE_CONFIG, ByokPackageCode } from "../config/byok";
import { byokService } from "../services/byok";

const toPackageCode = (raw?: string | null): ByokPackageCode | "BYOK_TRIAL" => {
  const normalized = (raw || "").trim().toUpperCase();
  if (
    normalized === "PD_APP" ||
    normalized === "VFX_APP" ||
    normalized === "PD_STUDIO" ||
    normalized === "VFX_STUDIO" ||
    normalized === "VFX_STUDIO_AGENCY" ||
    normalized === "BYOK_TRIAL"
  ) {
    return normalized as ByokPackageCode | "BYOK_TRIAL";
  }
  return "BYOK_TRIAL";
};

const run = async () => {
  const repair = process.argv.includes("--repair");
  const orgs = await prisma.organization.findMany({
    where: { provisioningSource: "BYOK" },
    include: { entitlement: true },
    orderBy: [{ createdAt: "desc" }],
  });

  const diffs: Array<{
    organizationId: string;
    organizationName: string;
    expectedPackageCode: string;
    mismatches: string[];
  }> = [];

  for (const org of orgs) {
    const expected = toPackageCode(org.entitlement?.packageCode || org.entitlementCode || null);
    const config = BYOK_PACKAGE_CONFIG[expected];
    const mismatches: string[] = [];

    if (org.entitlementCode !== expected) mismatches.push("organization.entitlementCode");
    if ((org.routingDomain || null) !== (config.routingDomain || null)) {
      mismatches.push("organization.routingDomain");
    }
    if (org.adminPanelLocked !== config.adminPanelLocked) {
      mismatches.push("organization.adminPanelLocked");
    }
    if ((org.renderDailyLimit ?? null) !== (config.renderDailyLimit ?? null)) {
      mismatches.push("organization.renderDailyLimit");
    }
    if ((org.storageRetentionDays ?? null) !== (config.storageRetentionDays ?? null)) {
      mismatches.push("organization.storageRetentionDays");
    }
    if (org.maxUsers !== config.maxUsers) mismatches.push("organization.maxUsers");
    if (org.maxProjectsTotal !== config.maxProjectsTotal) {
      mismatches.push("organization.maxProjectsTotal");
    }
    if (org.maxStorageMb !== config.maxStorageMb) mismatches.push("organization.maxStorageMb");
    if (!org.entitlement) mismatches.push("entitlement.missing");
    if (org.entitlement && org.entitlement.packageCode !== expected) {
      mismatches.push("entitlement.packageCode");
    }
    if (org.entitlement && org.entitlement.status !== "ACTIVE") {
      mismatches.push("entitlement.status");
    }

    if (mismatches.length > 0) {
      diffs.push({
        organizationId: org.id,
        organizationName: org.name,
        expectedPackageCode: expected,
        mismatches,
      });
    }
  }

  let repaired = 0;
  let repairErrors = 0;
  const repairResults: Array<{
    organizationId: string;
    repaired: boolean;
    error?: string;
  }> = [];

  if (repair) {
    for (const diff of diffs) {
      try {
        const result = await byokService.reconcileOrganization(diff.organizationId);
        if (result.repaired) repaired += 1;
        repairResults.push({
          organizationId: diff.organizationId,
          repaired: result.repaired === true,
        });
      } catch (error: any) {
        repairErrors += 1;
        repairResults.push({
          organizationId: diff.organizationId,
          repaired: false,
          error: error?.message || "reconcile_failed",
        });
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    totalOrganizations: orgs.length,
    driftedOrganizations: diffs.length,
    repairMode: repair,
    repaired,
    repairErrors,
    diffs,
    repairResults,
  };

  console.log(JSON.stringify(report, null, 2));
};

run()
  .catch((error) => {
    console.error("[byok-reconcile-report] failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

