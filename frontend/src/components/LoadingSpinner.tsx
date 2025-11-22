// components/LoadingSpinner.tsx
interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  variant?: "default" | "neon" | "light";
}

export const LoadingSpinner = ({
  size = "md",
  variant = "default",
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

  return (
    <div
      className={`animate-spin rounded-full border-2 border-current border-t-transparent ${sizeClasses[size]} ${variantClasses[variant]}`}
    />
  );
};
