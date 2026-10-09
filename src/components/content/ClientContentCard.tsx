/**
 * ClientContentCard — card de item de conteúdo para o portal do cliente.
 * Tema dark, design consistente com o C8 Control.
 * Exibe status de aprovação com ação rápida de aprovar/reprovar.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Calendar, MessageSquare, CheckCircle2, XCircle, AlertTriangle,
  Instagram, Facebook, Linkedin, Youtube, Mail, Globe, Paperclip,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { ClientContentItem } from "@/hooks/useClientContent";

// ── Labels ────────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  briefing:             { label: "Briefing",           className: "bg-slate-700/50 text-slate-300" },
  producao:             { label: "Em Produção",         className: "bg-blue-900/40 text-blue-300" },
  revisao_interna:      { label: "Em Revisão",          className: "bg-amber-900/40 text-amber-300" },
  aguardando_aprovacao: { label: "Aguardando sua aprovação", className: "bg-violet-900/40 text-violet-300 font-semibold" },
  aprovado:             { label: "Aprovado por você",   className: "bg-emerald-900/40 text-emerald-300" },
  reprovado:            { label: "Alteração solicitada", className: "bg-red-900/40 text-red-300" },
  publicado:            { label: "Publicado",           className: "bg-green-900/40 text-green-300" },
};

const APPROVAL_BADGE: Record<string, { label: string; className: string }> = {
  pendente:             { label: "Aguardando",         className: "border-violet-500/50 text-violet-300" },
  aprovado:             { label: "Aprovado",           className: "border-emerald-500/50 text-emerald-300" },
  reprovado:            { label: "Reprovado",          className: "border-red-500/50 text-red-300" },
  alteracao_solicitada: { label: "Alteração solicitada", className: "border-orange-500/50 text-orange-300" },
};

const PLATFORM_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  instagram: Instagram,
  facebook:  Facebook,
  linkedin:  Linkedin,
  youtube:   Youtube,
  email:     Mail,
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  post: "Post", reels: "Reels", story: "Story", carousel: "Carrossel",
  email: "E-mail", roteiro: "Roteiro", banner: "Banner", video: "Vídeo", outro: "Outro",
};

// ── Componente ────────────────────────────────────────────────────────────────

interface ClientContentCardProps {
  item:              ClientContentItem;
  onClick:           (item: ClientContentItem) => void;
  onApprove?:        (item: ClientContentItem) => void;
  onRequestChange?:  (item: ClientContentItem) => void;
}

export function ClientContentCard({
  item,
  onClick,
  onApprove,
  onRequestChange,
}: ClientContentCardProps) {
  const statusCfg  = STATUS_LABELS[item.status]          ?? STATUS_LABELS.producao;
  const approvalCfg = APPROVAL_BADGE[item.approval_status] ?? APPROVAL_BADGE.pendente;
  const PlatformIcon = item.platform ? (PLATFORM_ICONS[item.platform] ?? Globe) : null;

  const needsApproval = item.status === "aguardando_aprovacao";
  const date          = item.scheduled_date ?? null;

  return (
    <Card
      className={cn(
        "border border-[#1E293B] bg-[#0F172A] hover:bg-[#1E293B]/60 transition-colors",
        needsApproval && "border-violet-500/40 ring-1 ring-violet-500/20",
      )}
    >
      <CardContent className="p-4 space-y-3">

        {/* Linha 1: tipo + plataforma */}
        <div className="flex items-center gap-2">
          {item.content_type && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-[#334155] text-slate-400">
              {CONTENT_TYPE_LABELS[item.content_type] ?? item.content_type}
            </Badge>
          )}
          {PlatformIcon && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-400">
              <PlatformIcon className="h-3.5 w-3.5" />
              <span className="capitalize">{item.platform}</span>
            </span>
          )}
        </div>

        {/* Linha 2: título (clicável) */}
        <button
          className="text-left w-full"
          onClick={() => onClick(item)}
        >
          <p className="font-semibold text-white text-sm leading-snug hover:text-violet-300 transition-colors line-clamp-2">
            {item.title}
          </p>
        </button>

        {/* Linha 3: status */}
        <Badge variant="outline" className={cn("border-0 text-xs", statusCfg.className)}>
          {statusCfg.label}
        </Badge>

        {/* Linha 4: data + contadores */}
        <div className="flex items-center gap-3 text-xs text-slate-500">
          {date && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {format(parseISO(date), "dd/MM/yy", { locale: ptBR })}
            </span>
          )}
          {item.asset_count > 0 && (
            <span className="inline-flex items-center gap-1">
              <Paperclip className="h-3 w-3" />{item.asset_count}
            </span>
          )}
          {item.comment_count > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />{item.comment_count}
            </span>
          )}
          <Badge variant="outline" className={cn("ml-auto text-[10px] px-1.5 py-0", approvalCfg.className)}>
            {approvalCfg.label}
          </Badge>
        </div>

        {/* Ações rápidas de aprovação */}
        {needsApproval && onApprove && onRequestChange && (
          <div className="flex gap-2 pt-1 border-t border-[#1E293B]">
            <Button
              size="sm"
              className="flex-1 h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
              onClick={e => { e.stopPropagation(); onApprove(item); }}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Aprovar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-8 border-[#334155] text-slate-300 hover:bg-[#1E293B] text-xs"
              onClick={e => { e.stopPropagation(); onRequestChange(item); }}
            >
              <AlertTriangle className="h-3.5 w-3.5 mr-1" />Solicitar alteração
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
