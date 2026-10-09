/**
 * ClientBriefingView — visualização de briefing com checklist de tarefas.
 * O cliente pode marcar tarefas como concluídas diretamente nesta tela.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Calendar, CheckSquare, Clock, Target, Users, Volume2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ClientContentBrief } from "@/hooks/useClientContent";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  rascunho: { label: "Rascunho",   className: "bg-gray-800 text-gray-400" },
  enviado:  { label: "Enviado",    className: "bg-blue-900/40 text-blue-300" },
  aceito:   { label: "Aceito",     className: "bg-emerald-900/40 text-emerald-300" },
  revisao:  { label: "Em Revisão", className: "bg-amber-900/40 text-amber-300" },
};

interface ClientBriefingViewProps {
  brief:      ClientContentBrief;
  onTaskToggle: (taskId: string, status: "pendente" | "concluido") => Promise<void>;
}

export function ClientBriefingView({ brief, onTaskToggle }: ClientBriefingViewProps) {
  const statusCfg = STATUS_CONFIG[brief.status] ?? STATUS_CONFIG.enviado;
  const doneTasks  = brief.client_tasks.filter(t => t.status === "concluido").length;
  const totalTasks = brief.client_tasks.length;

  async function handleTaskToggle(taskId: string, current: "pendente" | "concluido") {
    const next = current === "pendente" ? "concluido" : "pendente";
    try {
      await onTaskToggle(taskId, next);
    } catch {
      toast.error("Falha ao atualizar tarefa");
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white text-base">{brief.title}</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Enviado em {format(parseISO(brief.created_at), "dd/MM/yyyy", { locale: ptBR })}
          </p>
        </div>
        <Badge variant="outline" className={cn("border-0 text-xs shrink-0", statusCfg.className)}>
          {statusCfg.label}
        </Badge>
      </div>

      {/* Campos do briefing */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {brief.objective && (
          <Card className="bg-[#1E293B] border-[#334155]">
            <CardContent className="p-3 flex gap-2">
              <Target className="h-4 w-4 text-violet-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-0.5">Objetivo</p>
                <p className="text-sm text-slate-200">{brief.objective}</p>
              </div>
            </CardContent>
          </Card>
        )}
        {brief.target_audience && (
          <Card className="bg-[#1E293B] border-[#334155]">
            <CardContent className="p-3 flex gap-2">
              <Users className="h-4 w-4 text-violet-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-0.5">Público-alvo</p>
                <p className="text-sm text-slate-200">{brief.target_audience}</p>
              </div>
            </CardContent>
          </Card>
        )}
        {brief.tone_of_voice && (
          <Card className="bg-[#1E293B] border-[#334155]">
            <CardContent className="p-3 flex gap-2">
              <Volume2 className="h-4 w-4 text-violet-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-0.5">Tom de Voz</p>
                <p className="text-sm text-slate-200 capitalize">{brief.tone_of_voice}</p>
              </div>
            </CardContent>
          </Card>
        )}
        {brief.deadline && (
          <Card className="bg-[#1E293B] border-[#334155]">
            <CardContent className="p-3 flex gap-2">
              <Clock className="h-4 w-4 text-violet-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-0.5">Prazo</p>
                <p className="text-sm text-slate-200">
                  {format(parseISO(brief.deadline), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Mensagens-chave */}
      {brief.key_messages.length > 0 && (
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">
            Mensagens-chave
          </p>
          <ul className="space-y-1.5">
            {brief.key_messages.map((msg, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                <span className="h-5 w-5 rounded-full bg-violet-900/40 text-violet-400 text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {msg}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Restrições */}
      {brief.restrictions && (
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Restrições</p>
          <p className="text-sm text-slate-300 bg-red-900/10 border border-red-900/30 rounded-lg p-3">
            {brief.restrictions}
          </p>
        </div>
      )}

      {/* Notas */}
      {brief.notes && (
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Observações</p>
          <p className="text-sm text-slate-300">{brief.notes}</p>
        </div>
      )}

      {/* Checklist de tarefas do cliente */}
      {totalTasks > 0 && (
        <>
          <Separator className="bg-[#1E293B]" />
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-violet-400" />
                <p className="text-sm font-medium text-slate-200">
                  Suas tarefas
                </p>
              </div>
              <span className="text-xs text-slate-400">
                {doneTasks}/{totalTasks} concluídas
              </span>
            </div>

            {/* Barra de progresso */}
            <div className="h-1.5 bg-[#1E293B] rounded-full mb-4 overflow-hidden">
              <div
                className="h-full bg-violet-600 rounded-full transition-all"
                style={{ width: totalTasks > 0 ? `${(doneTasks / totalTasks) * 100}%` : "0%" }}
              />
            </div>

            <div className="space-y-2">
              {brief.client_tasks.map(task => (
                <div
                  key={task.id}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer",
                    task.status === "concluido"
                      ? "bg-emerald-900/10 border-emerald-900/30"
                      : "bg-[#1E293B] border-[#334155] hover:bg-[#243044]",
                  )}
                  onClick={() => handleTaskToggle(task.id, task.status)}
                >
                  <Checkbox
                    checked={task.status === "concluido"}
                    onCheckedChange={() => handleTaskToggle(task.id, task.status)}
                    className="mt-0.5 border-[#475569] data-[state=checked]:bg-violet-600 data-[state=checked]:border-violet-600"
                  />
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-sm",
                      task.status === "concluido"
                        ? "line-through text-slate-500"
                        : "text-slate-200",
                    )}>
                      {task.task}
                    </p>
                    {task.due_date && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                        <Calendar className="h-3 w-3" />
                        {format(parseISO(task.due_date), "dd/MM", { locale: ptBR })}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
