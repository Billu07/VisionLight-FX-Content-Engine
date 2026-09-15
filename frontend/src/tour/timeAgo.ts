/** "just now", "5 min ago", "3 h ago", "2 days ago" — older than a week: the date. */
export function timeAgo(when: string | Date | null | undefined): string {
  if (!when) return "";
  const t = new Date(when).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) {
    const d = Math.floor(s / 86400);
    return `${d} day${d === 1 ? "" : "s"} ago`;
  }
  return new Date(t).toLocaleDateString();
}
