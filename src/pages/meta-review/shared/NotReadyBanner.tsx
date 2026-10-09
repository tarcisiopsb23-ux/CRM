/**
 * NotReadyBanner
 *
 * Banner exibido nas páginas de permissões que ainda não têm
 * funcionalidade real implementada no C8 Control.
 * Deixa explícito que não haverá simulação ou demo falsa.
 */

import { XCircle, Clock } from "lucide-react";

interface NotReadyBannerProps {
  permission: string;
  reason: "not_implemented" | "planned" | "not_needed";
  plannedFor?: string;
  notes?: string;
}

const CONFIG = {
  not_implemented: {
    icon: XCircle,
    title: "NOT READY FOR REVIEW",
    color: "border-slate-700 bg-slate-800/50 text-slate-400",
    iconColor: "text-slate-500",
    description: "Esta permissão não possui funcionalidade real implementada no C8 Control.",
  },
  planned: {
    icon: Clock,
    title: "IMPLEMENT LATER",
    color: "border-blue-800/50 bg-blue-900/20 text-blue-400",
    iconColor: "text-blue-500",
    description: "Funcionalidade planejada mas ainda não implementada.",
  },
  not_needed: {
    icon: XCircle,
    title: "REMOVE — NOT NEEDED",
    color: "border-red-800/50 bg-red-900/20 text-red-400",
    iconColor: "text-red-500",
    description: "Esta permissão não é necessária para o C8 Control.",
  },
};

export function NotReadyBanner({ permission, reason, plannedFor, notes }: NotReadyBannerProps) {
  const { icon: Icon, title, color, iconColor, description } = CONFIG[reason];

  return (
    <div className={`rounded-xl border-2 ${color} p-6`}>
      <div className="flex items-start gap-4">
        <div className={`mt-0.5 shrink-0 ${iconColor}`}>
          <Icon className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <code className="rounded bg-black/30 px-2 py-0.5 font-mono text-sm">{permission}</code>
            <span className="text-xs font-bold uppercase tracking-widest opacity-70">{title}</span>
          </div>
          <p className="text-sm leading-relaxed opacity-80">{description}</p>
          {plannedFor && (
            <p className="text-xs opacity-60">
              <strong>Previsto para:</strong> {plannedFor}
            </p>
          )}
          {notes && (
            <p className="text-xs opacity-60 italic">{notes}</p>
          )}
          <div className="mt-3 rounded-lg border border-current/20 bg-black/20 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider opacity-60 mb-1">
              Política do App Review
            </p>
            <p className="text-xs leading-relaxed opacity-50">
              Nenhuma demonstração falsa ou simulada será criada para esta permissão.
              O objetivo é demonstrar uso legítimo — se o uso não existe, a recomendação é REMOVE ou IMPLEMENT LATER.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
