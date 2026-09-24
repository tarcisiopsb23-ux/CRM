import { scoreColor } from "@/lib/recruitmentScoring";

interface Props {
  percent: number;
  total?: number;
  max?: number;
  size?: "sm" | "md";
}

export function ScoreBadge({ percent, total, max, size = "md" }: Props) {
  const color = scoreColor(percent);
  const colorClass =
    color === "green"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
      : color === "yellow"
      ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
      : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";

  const textSize = size === "sm" ? "text-xs" : "text-sm";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${textSize} ${colorClass}`}>
      {percent.toFixed(0)}%
      {total !== undefined && max !== undefined && (
        <span className="opacity-70 text-[10px]">({total}/{max})</span>
      )}
    </span>
  );
}
