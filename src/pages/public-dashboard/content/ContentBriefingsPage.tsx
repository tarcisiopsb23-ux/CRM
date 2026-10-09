/**
 * ContentBriefingsPage — briefings e tarefas do cliente no C8 Control.
 */

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { FileText, CheckSquare } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useClientContentBriefs } from "@/hooks/useClientContent";
import { ClientBriefingView }     from "@/components/content/ClientBriefingView";
import type { ClientContentBrief } from "@/hooks/useClientContent";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  enviado:  { label: "Enviado",    className: "bg-blue-900/40 text-blue-300 border-0" },
  aceito:   { label: "Aceito",     className: "bg-emerald-900/40 text-emerald-300 border-0" },
  revisao:  { label: "Em Revisão", className: "bg-amber-900/40 text-amber-300 border-0" },
};

export function ContentBriefingsPage() {
  const { auth }   = useClientAuth();
  const clientId   = auth?.id ?? "";

  const { briefs, loading, updateTask } = useClientContentBriefs(clientId);
  const [selected, setSelected] = useState<ClientContentBrief | null>(null);

  async function handleTaskToggle(taskId: string, status: "pendente" | "concluido") {
    if (!selected) return;
    try {
      await updateTask({ briefId: selected.id, taskId, taskStatus: status });
      // Atualiza localmente o item selecionado para feedback imediato
      setSelected(prev => {
        if (!prev) return null;
        return {
          ...prev,
          client_tasks: prev.client_tasks.map(t =>
            t.id === taskId ? { ...t, status } : t,
          ),
        };
      });
    } catch {
      toast.error("Falha ao atualizar tarefa");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-black text-white tracking-tight">Briefings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Orientações e tarefas enviadas pela agência para produção de conteúdo.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : briefs.length === 0 ? (
        <div className="rounded-xl border border-[#1E293B] bg-[#0F172A]/50 p-10 text-center">
          <FileText className="h-10 w-10 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-400">Nenhum briefing disponível ainda.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {briefs.map(brief => {
            const statusCfg  = STATUS_CONFIG[brief.status] ?? STATUS_CONFIG.enviado;
            const totalTasks = brief.client_tasks.length;
            const doneTasks  = brief.client_tasks.filter(t => t.status === "concluido").length;
            const hasTasks   = totalTasks > 0;

            return (
              <Card
                key={brief.id}
                className="border border-[#1E293B] bg-[#0F172A] hover:bg-[#1E293B]/60 transition-colors cursor-pointer"
                onClick={() => setSelected(brief)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className={cn("text-xs", statusCfg.className)}>
                          {statusCfg.label}
                        </Badge>
                        {hasTasks && (
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <CheckSquare className="h-3 w-3" />
                            {doneTasks}/{totalTasks}
                          </span>
                        )}
                      </div>
                      <p className="font-semibold text-white text-sm truncate">{brief.title}</p>
                      {brief.objective && (
                        <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{brief.objective}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {brief.deadline && (
                        <p className="text-xs text-slate-500">
                          {format(parseISO(brief.deadline), "dd/MM/yy", { locale: ptBR })}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Barra de progresso das tarefas */}
                  {hasTasks && (
                    <div className="mt-3">
                      <div className="h-1 bg-[#1E293B] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-violet-600 rounded-full transition-all"
                          style={{ width: `${(doneTasks / totalTasks) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Sheet de detalhe */}
      <Sheet open={!!selected} onOpenChange={v => !v && setSelected(null)}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-lg bg-[#0B1120] border-[#1E293B] text-white overflow-y-auto"
        >
          <SheetHeader className="mb-5">
            <SheetTitle className="text-white">Briefing</SheetTitle>
          </SheetHeader>
          {selected && (
            <ClientBriefingView
              brief={selected}
              onTaskToggle={handleTaskToggle}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
