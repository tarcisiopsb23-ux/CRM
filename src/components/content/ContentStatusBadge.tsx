/**
 * ContentStatusBadge — badge visual de status do workflow de conteúdo.
 * ContentApprovalBadge — badge de status de aprovação do cliente.
 * ContentPlatformBadge — badge de plataforma (Instagram, Facebook, etc.).
 * ContentPriorityBadge — badge de prioridade.
 */

import { Badge } from "@/components/ui/badge";
import {
  Instagram, Facebook, Linkedin, Youtube,
  Mail, Globe, Clock, CheckCircle2, XCircle,
  AlertTriangle, FileText, Send, Archive,
  Pencil, Eye, Megaphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContentStatus, ContentApprovalStatus, ContentPriority, ContentPlatform } from "@/hooks/useContentItems";

// ── Status do workflow ─────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ContentStatus, {
  label: string;
  className: string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  briefing:              { label: "Briefing",          className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",              icon: FileText },
  producao:              { label: "Em Produção",        className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",               icon: Pencil },
  revisao_interna:       { label: "Revisão Interna",    className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",           icon: Eye },
  aguardando_aprovacao:  { label: "Aguardando Aprovação", className: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",     icon: Send },
  aprovado:              { label: "Aprovado",           className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",   icon: CheckCircle2 },
  reprovado:             { label: "Reprovado",          className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",                   icon: XCircle },
  publicado:             { label: "Publicado",          className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",           icon: Megaphone },
  arquivado:             { label: "Arquivado",          className: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",                  icon: Archive },
};

export function ContentStatusBadge({
  status,
  size = "default",
}: {
  status: ContentStatus;
  size?: "sm" | "default";
}) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.briefing;
  const Icon   = config.icon;
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-0 font-medium gap-1",
        config.className,
        size === "sm" && "text-xs px-1.5 py-0",
      )}
    >
      <Icon className={cn("shrink-0", size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5")} />
      {config.label}
    </Badge>
  );
}

// ── Aprovação ─────────────────────────────────────────────────────────────────

const APPROVAL_CONFIG: Record<ContentApprovalStatus, { label: string; className: string }> = {
  pendente:             { label: "Pendente",               className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300" },
  aprovado:             { label: "Aprovado",               className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  reprovado:            { label: "Reprovado",              className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  alteracao_solicitada: { label: "Alteração Solicitada",   className: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
};

export function ContentApprovalBadge({ status }: { status: ContentApprovalStatus }) {
  const config = APPROVAL_CONFIG[status] ?? APPROVAL_CONFIG.pendente;
  return (
    <Badge variant="outline" className={cn("border-0 font-medium text-xs", config.className)}>
      {config.label}
    </Badge>
  );
}

// ── Plataforma ────────────────────────────────────────────────────────────────

const PLATFORM_CONFIG: Record<ContentPlatform, {
  label: string;
  icon:  React.ComponentType<{ className?: string }>;
  color: string;
}> = {
  instagram: { label: "Instagram", icon: Instagram, color: "text-pink-500" },
  facebook:  { label: "Facebook",  icon: Facebook,  color: "text-blue-600" },
  linkedin:  { label: "LinkedIn",  icon: Linkedin,  color: "text-blue-500" },
  tiktok:    { label: "TikTok",    icon: Globe,     color: "text-gray-900 dark:text-white" },
  youtube:   { label: "YouTube",   icon: Youtube,   color: "text-red-600" },
  google:    { label: "Google",    icon: Globe,     color: "text-yellow-500" },
  email:     { label: "E-mail",    icon: Mail,      color: "text-slate-500" },
  outro:     { label: "Outro",     icon: Globe,     color: "text-gray-400" },
};

export function ContentPlatformBadge({ platform }: { platform: ContentPlatform | null }) {
  if (!platform) return null;
  const config = PLATFORM_CONFIG[platform] ?? PLATFORM_CONFIG.outro;
  const Icon   = config.icon;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className={cn("h-3.5 w-3.5 shrink-0", config.color)} />
      {config.label}
    </span>
  );
}

// ── Prioridade ────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<ContentPriority, { label: string; className: string }> = {
  baixa:   { label: "Baixa",   className: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
  media:   { label: "Média",   className: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" },
  alta:    { label: "Alta",    className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  urgente: { label: "Urgente", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

export function ContentPriorityBadge({ priority }: { priority: ContentPriority }) {
  const config = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.media;
  return (
    <Badge variant="outline" className={cn("border-0 font-medium text-xs", config.className)}>
      {config.label}
    </Badge>
  );
}

// ── Label legível de content_type ─────────────────────────────────────────────

export const CONTENT_TYPE_LABELS: Record<string, string> = {
  post:      "Post",
  reels:     "Reels",
  story:     "Story",
  carousel:  "Carrossel",
  email:     "E-mail",
  roteiro:   "Roteiro",
  banner:    "Banner",
  video:     "Vídeo",
  outro:     "Outro",
};

// ── Ícone de status para tooltip ─────────────────────────────────────────────

export function ContentStatusIcon({
  status,
  className,
}: {
  status: ContentStatus;
  className?: string;
}) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.briefing;
  const Icon   = config.icon;
  return <Icon className={cn("h-4 w-4", className)} />;
}
