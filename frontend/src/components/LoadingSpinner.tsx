interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg" | "xl";
  color?: "blue" | "white" | "gray";
  text?: string;
}

export const LoadingSpinner = ({
  size = "md",
  color = "blue",
  text,
}: LoadingSpinnerProps) => {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8",
    xl: "w-12 h-12",
  };

  const colorClasses = {
    blue: "border-blue-600",
    white: "border-white",
    gray: "border-gray-400",
  };

  return (
    <div className="flex items-center gap-3">
      <div
        className={`animate-spin rounded-full border-2 border-t-transparent ${sizeClasses[size]} ${colorClasses[color]}`}
      />
      {text && (
        <span
          className={`text-sm ${
            color === "white" ? "text-white" : "text-gray-600"
          }`}
        >
          {text}
        </span>
      )}
    </div>
  );
};
