import { ArrowDownFromLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface InheritanceBadgeProps {
  hasOverride: boolean;
}

export function InheritanceBadge({ hasOverride }: InheritanceBadgeProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {hasOverride ? (
          <Badge
            variant="outline"
            className="bg-amber-100 text-amber-800 border-amber-300 text-xs cursor-default"
          >
            Override
          </Badge>
        ) : (
          <span className="flex items-center gap-1 text-xs text-muted-foreground cursor-default">
            <ArrowDownFromLine className="h-3 w-3" />
            Herdado
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        {hasOverride
          ? "Permissão definida individualmente para este colaborador. Sobrescreve o cargo."
          : "Permissão herdada do cargo. Nenhum override individual ativo."}
      </TooltipContent>
    </Tooltip>
  );
}
