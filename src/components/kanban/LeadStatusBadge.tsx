import { cn } from "@/lib/utils";
import {
  GMN_STATUS_CONFIG,
  ADS_LEVEL_CONFIG,
  SOCIAL_MEDIA_CONFIG,
} from "@/constants/leadStatusColors";

type FieldType = "gmn" | "ads" | "social";

interface LeadStatusBadgeProps {
  field: FieldType;
  value: string | null | undefined;
  className?: string;
}

const CONFIG_MAP: Record<FieldType, Record<string, { label: string; className: string }>> = {
  gmn:    GMN_STATUS_CONFIG,
  ads:    ADS_LEVEL_CONFIG,
  social: SOCIAL_MEDIA_CONFIG,
};

export function LeadStatusBadge({ field, value, className }: LeadStatusBadgeProps) {
  if (!value) return <span className="text-muted-foreground text-xs">—</span>;

  const config = CONFIG_MAP[field][value];
  if (!config) {
    // Fallback: show plain text for unknown values
    return (
      <span className={cn("text-xs capitalize", className)}>
        {value.replace(/_/g, " ")}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
