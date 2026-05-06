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

const toastClassByType = {
  success:
    "!border-emerald-400/35 !bg-emerald-500/12 !text-emerald-100 !shadow-[0_10px_30px_rgba(16,185,129,0.18)]",
  error:
    "!border-rose-400/35 !bg-rose-500/14 !text-rose-100 !shadow-[0_10px_30px_rgba(244,63,94,0.22)]",
  warning:
    "!border-amber-400/35 !bg-amber-500/14 !text-amber-100 !shadow-[0_10px_30px_rgba(245,158,11,0.22)]",
  info: "!border-cyan-400/30 !bg-cyan-500/12 !text-cyan-100 !shadow-[0_10px_30px_rgba(6,182,212,0.2)]",
} as const;

const baseToastClass =
  "!rounded-xl !backdrop-blur-xl !ring-1 !ring-white/10 !font-medium";

const resolveCriticalConfirmationText = (message: string, explicit?: string) => {
  if (explicit?.trim()) return explicit.trim();
  const quoted = message.match(/"([^"]+)"/)?.[1]?.trim();
  if (quoted) return quoted;
  return "DELETE";
};

const requestTypedConfirmation = async (
  phrase: string,
  message: string,
): Promise<boolean> => {
  const typed = window.prompt(
    `${message}\n\nCritical action confirmation required.\nType exactly: ${phrase}`,
    "",
  );
  if (typed === null) return false;
  if (typed.trim() !== phrase) {
    toast.error("Confirmation text did not match. Action cancelled.", {
      className: `${baseToastClass} ${toastClassByType.error}`,
    });
    return false;
  }
  return true;
};

export const notify = {
  success: (message: unknown) =>
    toast.success(normalizeMessage(message), {
      className: `${baseToastClass} ${toastClassByType.success}`,
    }),
  error: (message: unknown) =>
    toast.error(normalizeMessage(message), {
      className: `${baseToastClass} ${toastClassByType.error}`,
    }),
  warning: (message: unknown) =>
    toast.warning(normalizeMessage(message), {
      className: `${baseToastClass} ${toastClassByType.warning}`,
    }),
  info: (message: unknown) =>
    toast(normalizeMessage(message), {
      className: `${baseToastClass} ${toastClassByType.info}`,
    }),
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
      className: `${baseToastClass} ${toastClassByType.warning}`,
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
