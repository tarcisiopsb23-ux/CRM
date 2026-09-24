import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: string }) {
  const active = status === "active";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        active
          ? "bg-success/15 text-success ring-1 ring-success/25"
          : "bg-muted text-muted-foreground ring-1 ring-border"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          active ? "bg-success" : "bg-muted-foreground"
        )}
      />
      {active ? "Ativa" : "Inativa"}
    </span>
  );
}
