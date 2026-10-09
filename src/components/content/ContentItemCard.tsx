/**
 * ContentItemCard — card de item de conteúdo para o kanban e listas.
 * Exibe título, plataforma, tipo, status de aprovação, prazo e assignee.
 * Clicável para abrir o detalhe completo.
 */

import { Calendar, MessageSquare, Paperclip, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format, isPast, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ContentStatusBadge,
  ContentApprovalBadge,
  ContentPlatformBadge,
  ContentPriorityBadge,
  CONTENT_TYPE_LABELS,
} from "./ContentStatusBadge";
import type { ContentItem } from "@/hooks/useContentItems";

interface ContentItemCardProps {
  item:        ContentItem;
  onClick:     (item: ContentItem) => void;
  compact?:    boolean;
  /** Mostra indicador de comentários/assets */
  showCounts?: boolean;
  commentCount?: number;
  assetCount?:   number;
}

export function ContentItemCard({
  item,
  onClick,
  compact = false,
  showCounts = false,
  commentCount = 0,
  assetCount   = 0,
}: ContentItemCardProps) {
  const deadline = item.production_deadline ?? item.scheduled_date;
  const isOverdue =
    deadline &&
    isPast(parseISO(deadline)) &&
    !["publicado", "arquivado"].includes(item.status);

  return (
    <Card
      onClick={() => onClick(item)}
      className={cn(
        "cursor-pointer border border-border/60 bg-card hover:bg-accent/30 transition-colors",
        "shadow-none hover:shadow-sm",
        isOverdue && "border-l-2 border-l-red-500",
      )}
    >
      <CardContent className={cn("p-3 space-y-2", compact && "p-2 space-y-1.5")}>

        {/* ── Linha 1: tipo + plataforma ── */}
        <div className="flex items-center gap-2 min-w-0">
          {item.content_type && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
              {CONTENT_TYPE_LABELS[item.content_type] ?? item.content_type}
            </Badge>
          )}
          <ContentPlatformBadge platform={item.platform} />
        </div>

        {/* ── Linha 2: título ── */}
        <p className={cn(
          "font-medium leading-snug text-foreground line-clamp-2",
          compact ? "text-xs" : "text-sm",
        )}>
          {item.title}
        </p>

        {/* ── Linha 3: status + aprovação ── */}
        {!compact && (
          <div className="flex flex-wrap gap-1">
            <ContentStatusBadge status={item.status} size="sm" />
            {item.is_visible_to_client && (
              <ContentApprovalBadge status={item.approval_status} />
            )}
          </div>
        )}

        {/* ── Linha 4: prazo + contadores ── */}
        <div className="flex items-center justify-between gap-2">
          {deadline && (
            <span className={cn(
              "inline-flex items-center gap-1 text-[11px]",
              isOverdue ? "text-red-500 font-medium" : "text-muted-foreground",
            )}>
              {isOverdue && <AlertCircle className="h-3 w-3" />}
              <Calendar className="h-3 w-3" />
              {format(parseISO(deadline), "dd/MM", { locale: ptBR })}
            </span>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <ContentPriorityBadge priority={item.priority} />
            {showCounts && (
              <>
                {assetCount > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                    <Paperclip className="h-3 w-3" />{assetCount}
                  </span>
                )}
                {commentCount > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                    <MessageSquare className="h-3 w-3" />{commentCount}
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Linha 5: nome do cliente (multi-cliente) ── */}
        {item.client_name && (
          <p className="text-[11px] text-muted-foreground truncate border-t border-border/40 pt-1.5">
            {item.client_name}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
