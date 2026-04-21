import { toast } from "sonner";

type ConfirmOptions = {
  confirmLabel?: string;
  cancelLabel?: string;
  description?: string;
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

export const notify = {
  success: (message: unknown) => toast.success(normalizeMessage(message)),
  error: (message: unknown) => toast.error(normalizeMessage(message)),
  warning: (message: unknown) => toast.warning(normalizeMessage(message)),
  info: (message: unknown) => toast(normalizeMessage(message)),
};

export const confirmAction = (
  message: string,
  options: ConfirmOptions = {},
): Promise<boolean> =>
  new Promise((resolve) => {
    let resolved = false;
    const id = toast.warning(message, {
      description: options.description,
      duration: Infinity,
      action: {
        label: options.confirmLabel || "Confirm",
        onClick: () => {
          resolved = true;
          resolve(true);
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
