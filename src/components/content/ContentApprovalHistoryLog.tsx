/**
 * ContentApprovalHistoryLog — timeline do histórico de aprovações de um item.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Send, CheckCircle2, XCircle, AlertTriangle, Megaphone, Archive,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

type Decision =
  | "enviado_para_aprovacao"
  | "aprovado"
  | "reprovado"
  | "alteracao_solicitada"
  | "publicado"
  | "arquivado";

interface HistoryEntry {
  id:            string;
  decision:      Decision;
  decided_by:    string;
  decider_type:  "agency" | "client" | "partner";
  decider_name:  string | null;
  notes:         string | null;
  version_number: number | null;
  created_at:    string;
}

const DECISION_CONFIG: Record<Decision, {
  label:     string;
  icon:      React.ComponentType<{ className?: string }>;
  className: string;
}> = {
  enviado_para_aprovacao: { label: "Enviado para aprovação", icon: Send,          className: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
  aprovado:               { label: "Aprovado",               icon: CheckCircle2,  className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  reprovado:              { label: "Reprovado",              icon: XCircle,       className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  alteracao_solicitada:   { label: "Alteração solicitada",   icon: AlertTriangle, className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  publicado:              { label: "Publicado",              icon: Megaphone,     className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  arquivado:              { label: "Arquivado",              icon: Archive,       className: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
};

const DECIDER_LABEL: Record<string, string> = {
  agency:  "Agência",
  client:  "Cliente",
  partner: "Parceiro",
};

export function ContentApprovalHistoryLog({ itemId }: { itemId: string }) {
  const { data: history, isLoading } = useQuery({
    queryKey: ["content-approval-history", itemId],
    enabled:  !!itemId,
    queryFn:  async (): Promise<HistoryEntry[]> => {
      const { data, error } = await supabase
        .from("content_approval_history")
        .select("*")
        .eq("content_item_id", itemId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as HistoryEntry[];
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
      </div>
    );
  }

  if (!history?.length) {
    return (
      <div className="text-center text-sm text-muted-foreground py-10">
        Nenhum registro de aprovação ainda.
      </div>
    );
  }

  return (
    <div className="relative space-y-0">
      {/* Linha vertical da timeline */}
      <div className="absolute left-5 top-5 bottom-5 w-px bg-border/60" />

      {history.map((entry, idx) => {
        const config = DECISION_CONFIG[entry.decision] ?? DECISION_CONFIG.enviado_para_aprovacao;
        const Icon   = config.icon;
        return (
          <div key={entry.id} className={cn("flex gap-4 pb-4", idx === 0 && "pt-0")}>
            {/* Ícone */}
            <div className={cn(
              "relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-background",
              config.className,
            )}>
              <Icon className="h-4 w-4" />
            </div>

            {/* Conteúdo */}
            <div className="flex-1 min-w-0 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={cn("border-0 text-xs font-medium", config.className)}>
                  {config.label}
                </Badge>
                {entry.version_number && (
                  <span className="text-xs text-muted-foreground">v{entry.version_number}</span>
                )}
                <span className="text-xs text-muted-foreground ml-auto">
                  {format(parseISO(entry.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                <span className="font-medium text-foreground/70">
                  {entry.decider_name ?? DECIDER_LABEL[entry.decider_type] ?? entry.decider_type}
                </span>
                {" · "}
                {DECIDER_LABEL[entry.decider_type] ?? entry.decider_type}
              </p>
              {entry.notes && (
                <p className="text-sm text-foreground/80 mt-1 bg-muted/40 rounded px-2 py-1">
                  {entry.notes}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
