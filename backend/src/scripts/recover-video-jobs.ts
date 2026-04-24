import { dbService as airtableService, prisma } from "../services/database";
import { contentEngine } from "../services/engine";
import { getTenantApiKeys } from "../lib/app-runtime";

type RecoveryStatus = "PROCESSING" | "NEW" | "FAILED";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const includeNew = args.includes("--include-new");
const includeFailed = args.includes("--include-failed");

const getArgValue = (key: string): string | undefined => {
  const token = args.find((entry) => entry.startsWith(`${key}=`));
  if (!token) return undefined;
  const [, value] = token.split("=", 2);
  return value?.trim() || undefined;
};

const maxHours = (() => {
  const raw = getArgValue("--hours");
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 168;
  return Math.min(parsed, 24 * 90);
})();

const limit = (() => {
  const raw = getArgValue("--limit");
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 200;
  return Math.min(Math.floor(parsed), 1000);
})();

const userIdFilter = getArgValue("--user");

const statuses: RecoveryStatus[] = [
  "PROCESSING",
  ...(includeNew ? (["NEW"] as RecoveryStatus[]) : []),
  ...(includeFailed ? (["FAILED"] as RecoveryStatus[]) : []),
];

const isRecoverableProvider = (provider: string | null | undefined) => {
  const value = (provider || "").toLowerCase();
  return (
    value.includes("kie") ||
    value.includes("seedance-fal") ||
    value.includes("kling") ||
    value.includes("veo")
  );
};

const parseGenerationParams = (raw: unknown): Record<string, any> | null => {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw as Record<string, any>;
  return null;
};

async function main() {
  const cutoff = new Date(Date.now() - maxHours * 60 * 60 * 1000);
  const rawPosts = await prisma.post.findMany({
    where: {
      createdAt: { gte: cutoff },
      status: { in: statuses },
      ...(userIdFilter ? { userId: userIdFilter } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const candidates = rawPosts
    .map((post) => ({
      post,
      params: parseGenerationParams(post.generationParams),
    }))
    .filter(({ post, params }) => {
      if (!isRecoverableProvider(post.mediaProvider)) return false;
      const externalId = params?.externalId;
      return typeof externalId === "string" && externalId.trim().length > 0;
    });

  console.log(
    `Recovery scan: ${candidates.length} candidates (from ${rawPosts.length} posts, statuses=${statuses.join(",")}, hours=${maxHours}, limit=${limit}).`,
  );
  if (userIdFilter) {
    console.log(`User filter: ${userIdFilter}`);
  }

  for (const { post, params } of candidates) {
    const externalId = params?.externalId;
    console.log(
      `- ${post.id} | user=${post.userId} | status=${post.status} | provider=${post.mediaProvider || "n/a"} | externalId=${externalId}`,
    );
  }

  if (!apply) {
    console.log(
      "Dry run only. Re-run with --apply to check provider status and recover completed jobs.",
    );
    if (!includeFailed) {
      console.log(
        "Note: FAILED posts are excluded by default to avoid accidental double-refund/double-charge side effects.",
      );
    }
    return;
  }

  let recovered = 0;
  let stillProcessing = 0;
  let failed = 0;
  let skipped = 0;

  for (const { post } of candidates) {
    try {
      const apiKeys = await getTenantApiKeys(post.userId);
      if (post.status !== "PROCESSING") {
        await airtableService.updatePost(post.id, { status: "PROCESSING" });
      }

      await contentEngine.checkPostStatus(
        { ...post, status: "PROCESSING" } as any,
        apiKeys,
      );

      const latest = await airtableService.getPostById(post.id);
      const latestStatus = latest?.status || "UNKNOWN";
      if (latestStatus === "READY") recovered += 1;
      else if (latestStatus === "FAILED") failed += 1;
      else stillProcessing += 1;
      console.log(`  -> ${post.id}: ${latestStatus}`);
    } catch (error: any) {
      skipped += 1;
      console.error(
        `  -> ${post.id}: skipped (${error?.message || "unknown error"})`,
      );
    }
  }

  console.log(
    `Done. recovered=${recovered}, stillProcessing=${stillProcessing}, failed=${failed}, skipped=${skipped}`,
  );
}

main()
  .catch((error) => {
    console.error("recover-video-jobs failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
