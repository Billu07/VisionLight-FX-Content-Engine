type PromptFxItem = {
  name: string;
  prompt: string;
};

const STORAGE_KEY = "visionlight_prompt_fx_recent";

export const getPromptFxKey = (item: PromptFxItem) =>
  `${item.name}::${item.prompt}`;

export const getRecentPromptFxKeys = (): string[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === "string") : [];
  } catch {
    return [];
  }
};

export const saveRecentPromptFxKeys = (keys: string[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys.slice(0, 25)));
};

export const markPromptFxUsed = (item: PromptFxItem): string[] => {
  const key = getPromptFxKey(item);
  const next = [key, ...getRecentPromptFxKeys().filter((entry) => entry !== key)];
  saveRecentPromptFxKeys(next);
  return next;
};

export const orderPromptFxByRecent = <T extends PromptFxItem>(
  list: T[],
  recentKeys: string[],
): T[] => {
  const order = new Map(recentKeys.map((key, index) => [key, index]));
  return [...list].sort((a, b) => {
    const aRank = order.get(getPromptFxKey(a));
    const bRank = order.get(getPromptFxKey(b));
    if (aRank === undefined && bRank === undefined) return 0;
    if (aRank === undefined) return 1;
    if (bRank === undefined) return -1;
    return aRank - bRank;
  });
};
