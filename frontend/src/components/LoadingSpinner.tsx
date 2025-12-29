// components/LoadingSpinner.tsx

export interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  variant?: "default" | "neon" | "light";
  className?: string; // ✅ Added support for custom classes
  color?: string; // ✅ Added support for custom colors
}

export const LoadingSpinner = ({
  size = "md",
  variant = "default",
  className = "",
  color,
}: LoadingSpinnerProps) => {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-8 h-8",
    lg: "w-12 h-12",
  };

  const variantClasses = {
    default: "text-gray-600",
    neon: "text-cyan-400",
    light: "text-white",
  };

  // Use specific color if provided, otherwise use variant
  const finalColor = color || variantClasses[variant];

  return (
    <div
      className={`animate-spin rounded-full border-2 border-current border-t-transparent ${sizeClasses[size]} ${finalColor} ${className}`}
    />
  );
};
