export function ProgressBar({
  progress,
  label,
}: {
  progress: number;
  label: string;
}) {
  return (
    <div className="w-full max-w-xs mx-auto">
      <div className="flex justify-between text-xs text-cyan-300 mb-1 font-bold">
        <span>{label}</span>
        <span>{progress}%</span>
      </div>
      <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden border border-gray-700">
        <div
          className="bg-gradient-to-r from-cyan-500 to-blue-600 h-full rounded-full transition-all duration-300 ease-out shadow-[0_0_10px_rgba(6,182,212,0.5)]"
          style={{ width: `${progress}%` }}
        ></div>
      </div>
    </div>
  );
}
