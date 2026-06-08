import { toast } from "sonner";

type ConfirmOptions = {
  confirmLabel?: string;
  cancelLabel?: string;
  description?: string;
  critical?: boolean;
  confirmationText?: string;
};

const normalizeMessage = (message: unknown): string => {
  if (typeof message === "string") return message;
  if (message instanceof Error) return message.message;
  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
};

const CRITICAL_ACTION_PATTERN =
  /\b(delete|remove|purge|destroy|wipe|deactivat|forever)\b/i;

const resolveCriticalConfirmationText = (message: string, explicit?: string) => {
  if (explicit?.trim()) return explicit.trim();
  const quoted = message.match(/"([^"]+)"/)?.[1]?.trim();
  if (quoted) return quoted;
  return "DELETE";
};

const requestTypedConfirmation = async (
  phrase: string,
  message: string,
): Promise<boolean> =>
  new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(false);
      return;
    }

    let settled = false;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const overlay = document.createElement("div");
    overlay.className =
      "fixed inset-0 z-[1200] flex items-center justify-center bg-gray-950/85 p-4 backdrop-blur-sm";

    const panel = document.createElement("div");
    panel.className =
      "w-full max-w-lg rounded-2xl border border-rose-400/25 bg-gray-900/95 p-6 shadow-[0_30px_80px_rgba(2,8,23,0.75)]";

    const title = document.createElement("h3");
    title.className =
      "text-sm font-bold uppercase tracking-[0.14em] text-rose-200";
    title.textContent = "Critical Confirmation";

    const copy = document.createElement("p");
    copy.className = "mt-3 text-sm leading-relaxed text-gray-300";
    copy.textContent = message;

    const hint = document.createElement("p");
    hint.className = "mt-3 text-[11px] uppercase tracking-[0.14em] text-gray-500";
    hint.textContent = "Type this text exactly to continue";

    const phraseChip = document.createElement("div");
    phraseChip.className =
      "mt-2 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 font-mono text-xs text-cyan-100";
    phraseChip.textContent = phrase;

    const input = document.createElement("input");
    input.type = "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = "Paste confirmation text here";
    input.className =
      "mt-4 w-full rounded-lg border border-white/15 bg-gray-950/80 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-cyan-300";

    const error = document.createElement("p");
    error.className = "mt-2 min-h-[1rem] text-xs text-rose-300";
    error.textContent = "";

    const actions = document.createElement("div");
    actions.className = "mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className =
      "rounded-lg border border-white/12 bg-white/[0.04] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-gray-300 transition-colors hover:bg-white/[0.08]";
    cancelBtn.textContent = "Cancel";

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className =
      "rounded-lg border border-rose-400/40 bg-rose-500/15 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-rose-200 transition-colors disabled:cursor-not-allowed disabled:opacity-45";
    confirmBtn.textContent = "Confirm";
    confirmBtn.disabled = true;

    const cleanup = () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeydown);
      overlay.remove();
    };

    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const syncState = () => {
      const matched = input.value.trim() === phrase;
      confirmBtn.disabled = !matched;
      error.textContent = "";
    };

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        finish(false);
        return;
      }
      if (event.key === "Enter" && !confirmBtn.disabled) {
        event.preventDefault();
        finish(true);
      }
    };

    input.addEventListener("input", syncState);
    confirmBtn.addEventListener("click", () => finish(true));
    cancelBtn.addEventListener("click", () => finish(false));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) finish(false);
    });

    panel.appendChild(title);
    panel.appendChild(copy);
    panel.appendChild(hint);
    panel.appendChild(phraseChip);
    panel.appendChild(input);
    panel.appendChild(error);
    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    panel.appendChild(actions);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    window.addEventListener("keydown", handleKeydown);
    syncState();
    input.focus();
  });

export const notify = {
  success: (message: unknown) => toast.success(normalizeMessage(message)),
  successAction: (
    message: unknown,
    action: { label: string; onClick: () => void },
  ) => toast.success(normalizeMessage(message), { action }),
  error: (message: unknown) => toast.error(normalizeMessage(message)),
  warning: (message: unknown) => toast.warning(normalizeMessage(message)),
  info: (message: unknown) => toast.info(normalizeMessage(message)),
};

export const confirmAction = (
  message: string,
  options: ConfirmOptions = {},
): Promise<boolean> =>
  new Promise((resolve) => {
    let resolved = false;
    const critical = options.critical ?? CRITICAL_ACTION_PATTERN.test(message);
    const confirmationText = resolveCriticalConfirmationText(
      message,
      options.confirmationText,
    );
    const id = toast.warning(message, {
      description: options.description,
      duration: Infinity,
      action: {
        label: options.confirmLabel || "Confirm",
        onClick: async () => {
          resolved = true;
          if (!critical) {
            resolve(true);
            toast.dismiss(id);
            return;
          }
          const pass = await requestTypedConfirmation(confirmationText, message);
          resolve(pass);
          toast.dismiss(id);
        },
      },
      cancel: {
        label: options.cancelLabel || "Cancel",
        onClick: () => {
          resolved = true;
          resolve(false);
          toast.dismiss(id);
        },
      },
      onDismiss: () => {
        if (!resolved) resolve(false);
      },
    });
  });

export const installAlertBridge = () => {
  const nativeAlert = window.alert;
  window.alert = (message?: unknown) => {
    const text = normalizeMessage(message);
    const lower = text.toLowerCase();
    if (lower.includes("fail") || lower.includes("error") || lower.includes("cannot")) {
      notify.error(text);
      return;
    }
    if (
      lower.includes("warning") ||
      lower.includes("exceed") ||
      lower.includes("please") ||
      lower.includes("require")
    ) {
      notify.warning(text);
      return;
    }
    if (text.includes("✅") || lower.includes("saved") || lower.includes("success")) {
      notify.success(text);
      return;
    }
    notify.info(text);
  };

  return () => {
    window.alert = nativeAlert;
  };
};
