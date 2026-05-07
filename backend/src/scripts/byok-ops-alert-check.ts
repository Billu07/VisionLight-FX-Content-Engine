import { prisma } from "../services/database";
import { BYOK_PACKAGE_CONFIG, ByokPackageCode } from "../config/byok";

const THRESHOLD_WEBHOOK_ERROR_RATE_HOUR = Number.parseFloat(
  process.env.BYOK_ALERT_WEBHOOK_ERROR_RATE_HOUR || "20",
);
const THRESHOLD_STALE_PENDING = Number.parseInt(
  process.env.BYOK_ALERT_STALE_PENDING_COUNT || "10",
  10,
);
const THRESHOLD_ROUTING_DRIFT = Number.parseInt(
  process.env.BYOK_ALERT_ROUTING_DRIFT_COUNT || "1",
  10,
);
const THRESHOLD_ENTITLEMENT_DRIFT = Number.parseInt(
  process.env.BYOK_ALERT_ENTITLEMENT_DRIFT_COUNT || "1",
  10,
);
const STALE_MINUTES = Number.parseInt(process.env.BYOK_STALE_PENDING_MINUTES || "15", 10);

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
  const now = Date.now();
  const lastHour = new Date(now - 60 * 60 * 1000);
  const staleCutoff = new Date(now - Math.max(5, STALE_MINUTES) * 60 * 1000);

  const [hourEvents, stalePending, orgs] = await Promise.all([
    prisma.webhookEvent.findMany({
      where: {
        provider: { in: ["WIX", "WIX_CHECKOUT_SESSION"] },
        createdAt: { gte: lastHour },
      },
      select: { status: true },
    }),
    prisma.webhookEvent.count({
      where: {
        provider: "WIX_CHECKOUT_SESSION",
        status: { in: ["PENDING", "RECEIVED", "VERIFIED"] },
        createdAt: { lte: staleCutoff },
      },
    }),
    prisma.organization.findMany({
      where: { provisioningSource: "BYOK" },
      include: { entitlement: true },
      orderBy: [{ createdAt: "desc" }],
    }),
  ]);

  const totalHour = hourEvents.length;
  const errorHour = hourEvents.filter((e) => (e.status || "").toUpperCase() === "ERROR").length;
  const errorRateHour = totalHour > 0 ? (errorHour / totalHour) * 100 : 0;

  let routingDrift = 0;
  let entitlementDrift = 0;
  for (const org of orgs) {
    const expected = toPackageCode(org.entitlement?.packageCode || org.entitlementCode || null);
    const config = BYOK_PACKAGE_CONFIG[expected];
    if ((org.routingDomain || null) !== (config.routingDomain || null)) routingDrift += 1;

    const hasEntitlementDrift =
      org.entitlementCode !== expected ||
      org.entitlement?.packageCode !== expected ||
      (org.entitlement?.status || "ACTIVE") !== "ACTIVE";
    if (hasEntitlementDrift) entitlementDrift += 1;
  }

  const alerts: string[] = [];
  if (errorRateHour >= THRESHOLD_WEBHOOK_ERROR_RATE_HOUR) {
    alerts.push(
      `WEBHOOK_ERROR_RATE_HIGH:${errorRateHour.toFixed(2)}%>=${THRESHOLD_WEBHOOK_ERROR_RATE_HOUR}%`,
    );
  }
  if (stalePending >= THRESHOLD_STALE_PENDING) {
    alerts.push(`STALE_PENDING_HIGH:${stalePending}>=${THRESHOLD_STALE_PENDING}`);
  }
  if (routingDrift >= THRESHOLD_ROUTING_DRIFT) {
    alerts.push(`ROUTING_DRIFT_HIGH:${routingDrift}>=${THRESHOLD_ROUTING_DRIFT}`);
  }
  if (entitlementDrift >= THRESHOLD_ENTITLEMENT_DRIFT) {
    alerts.push(
      `ENTITLEMENT_DRIFT_HIGH:${entitlementDrift}>=${THRESHOLD_ENTITLEMENT_DRIFT}`,
    );
  }

  const report = {
    generatedAt: new Date().toISOString(),
    metrics: {
      totalHour,
      errorHour,
      errorRateHour: Number(errorRateHour.toFixed(2)),
      stalePending,
      routingDrift,
      entitlementDrift,
    },
    thresholds: {
      THRESHOLD_WEBHOOK_ERROR_RATE_HOUR,
      THRESHOLD_STALE_PENDING,
      THRESHOLD_ROUTING_DRIFT,
      THRESHOLD_ENTITLEMENT_DRIFT,
    },
    alerts,
  };

  console.log(JSON.stringify(report, null, 2));
  if (alerts.length > 0) {
    process.exit(2);
  }
};

run()
  .catch((error) => {
    console.error("[byok-ops-alert-check] failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

