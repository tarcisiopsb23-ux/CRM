import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ChevronDown, ChevronUp, ClipboardList } from "lucide-react";

interface Props {
  tenantName?: string;
  onChangeTenant?: () => void;
}

const SUPPORT_RULES = [
  "Nenhuma alteração deve ser feita sem consentimento explícito do cliente.",
  "Dados exibidos são confidenciais — não compartilhe capturas de tela ou informações.",
  "Esta sessão é auditada. Todas as ações são registradas com data, hora e usuário.",
  "Acesso restrito a diagnóstico e suporte técnico autorizado.",
  "Em caso de dúvida, encerre a sessão e entre em contato com o responsável.",
];

export function SupportBanner({ tenantName, onChangeTenant }: Props) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="rounded-xl border border-orange-500/40 bg-orange-500/10 overflow-hidden">
      {/* Header sempre visível */}
      <div className="flex items-center justify-between gap-3 px-5 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-lg shrink-0">🛠️</span>
          <div className="min-w-0">
            <p className="text-sm font-black uppercase tracking-wide text-orange-400">
              Sessão de Suporte Técnico
            </p>
            <p className="text-xs text-orange-300/80 truncate">
              {tenantName ? `Visualizando: ${tenantName}` : "Selecione um cliente."}
              {" "}— Acesso monitorado e auditado.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Ver logs */}
          <button
            onClick={() => navigate("/dashboard/logs")}
            className="flex items-center gap-1.5 text-xs font-bold text-orange-400 hover:text-orange-200 border border-orange-500/40 hover:border-orange-400 rounded-lg px-3 py-1.5 transition-colors"
          >
            <ClipboardList className="h-3.5 w-3.5" />
            Logs
          </button>

          {/* Trocar cliente */}
          {onChangeTenant && (
            <button
              onClick={onChangeTenant}
              className="text-xs font-bold text-orange-400 hover:text-orange-200 border border-orange-500/40 hover:border-orange-400 rounded-lg px-3 py-1.5 transition-colors"
            >
              Trocar cliente
            </button>
          )}

          {/* Expandir regras */}
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-orange-400 hover:text-orange-200 transition-colors p-1"
            title={expanded ? "Recolher" : "Ver regras de conduta"}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Regras expandíveis */}
      {expanded && (
        <div className="border-t border-orange-500/20 px-5 py-4 space-y-2">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-orange-400 shrink-0" />
            <p className="text-xs font-black uppercase tracking-widest text-orange-400">
              Regras de Conduta — Sessão de Suporte
            </p>
          </div>
          <ul className="space-y-1.5">
            {SUPPORT_RULES.map((rule, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-orange-300/80">
                <span className="text-orange-500 font-black shrink-0 mt-0.5">{i + 1}.</span>
                {rule}
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-orange-400/50 pt-2 border-t border-orange-500/20">
            O descumprimento dessas regras pode resultar em revogação do acesso de suporte.
          </p>
        </div>
      )}
    </div>
  );
}
