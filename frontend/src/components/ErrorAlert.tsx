interface ErrorAlertProps {
  message: string;
  onRetry?: () => void;
  type?: "error" | "warning" | "info";
}

export const ErrorAlert = ({
  message,
  onRetry,
  type = "error",
}: ErrorAlertProps) => {
  const getStyles = () => {
    switch (type) {
      case "warning":
        return {
          bg: "bg-yellow-50",
          border: "border-yellow-200",
          text: "text-yellow-800",
          button: "bg-yellow-600 hover:bg-yellow-700",
        };
      case "info":
        return {
          bg: "bg-blue-50",
          border: "border-blue-200",
          text: "text-blue-800",
          button: "bg-blue-600 hover:bg-blue-700",
        };
      default:
        return {
          bg: "bg-red-50",
          border: "border-red-200",
          text: "text-red-800",
          button: "bg-red-600 hover:bg-red-700",
        };
    }
  };

  const styles = getStyles();

  return (
    <div
      className={`p-4 rounded-xl border ${styles.bg} ${styles.border} mb-6 animate-fade-in`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1">
          <div className={`mt-0.5 flex-shrink-0 ${styles.text}`}>
            {type === "error" && "❌"}
            {type === "warning" && "⚠️"}
            {type === "info" && "ℹ️"}
          </div>
          <div className="flex-1">
            <p className={`font-medium ${styles.text}`}>{message}</p>
            {onRetry && (
              <p className={`text-sm mt-1 ${styles.text} opacity-80`}>
                Please try again or contact support if the issue persists.
              </p>
            )}
          </div>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className={`ml-4 px-4 py-2 text-white rounded-lg text-sm font-medium transition-colors flex-shrink-0 ${styles.button}`}
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
};
