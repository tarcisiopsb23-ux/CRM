import { Badge } from "@/components/ui/badge";
import { UserCog } from "lucide-react";

interface FreelancerBadgeProps {
  className?: string;
  supplierName?: string;
}

/** Badge indicando que o item é atribuído a um terceirizado */
export function FreelancerBadge({ className, supplierName }: FreelancerBadgeProps) {
  return (
    <Badge
      className={`bg-orange-100 text-orange-700 border border-orange-200 flex items-center gap-1 text-xs ${className ?? ""}`}
    >
      <UserCog className="h-3 w-3" />
      Terceirizado{supplierName ? `: ${supplierName}` : ""}
    </Badge>
  );
}
