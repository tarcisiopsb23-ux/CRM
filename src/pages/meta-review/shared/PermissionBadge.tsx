/**
 * PermissionBadge
 *
 * Badge colorida que indica o status de uma permissão no contexto do App Review.
 */

import { cn } from "@/lib/utils";
import { CheckCircle2, Clock, XCircle, AlertTriangle, Eye } from "lucide-react";
import type { PermissionStatus } from "./types";

interface PermissionBadgeProps {
  status: PermissionStatus;
  className?: string;
  size?: "sm" | "md";
}

const CONFIG: Record<PermissionStatus, {
  label: string;
  className: string;
  icon: React.ElementType;
}> = {
  KEEP: {
    label: "KEEP",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    icon: CheckCircle2,
  },
  IMPLEMENT_LATER: {
    label: "IMPLEMENT LATER",
    className: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    icon: Clock,
  },
  NOT_READY: {
    label: "NOT READY FOR REVIEW",
    className: "bg-slate-500/15 text-slate-400 border-slate-500/30",
    icon: XCircle,
  },
  REMOVE: {
    label: "REMOVE",
    className: "bg-red-500/15 text-red-400 border-red-500/30",
    icon: XCircle,
  },
  REQUIRES_REVIEW: {
    label: "REQUIRES REVIEW",
    className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    icon: AlertTriangle,
  },
};

export function PermissionBadge({ status, className, size = "sm" }: PermissionBadgeProps) {
  const { label, className: badgeClass, icon: Icon } = CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-semibold uppercase tracking-wider",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs",
        badgeClass,
        className
      )}
    >
      <Icon className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />
      {label}
    </span>
  );
}

export function DemoAvailableBadge({ available }: { available: boolean }) {
  return available ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-400">
      <Eye className="h-2.5 w-2.5" />
      DEMO
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800/40 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
      NO DEMO
    </span>
  );
}
