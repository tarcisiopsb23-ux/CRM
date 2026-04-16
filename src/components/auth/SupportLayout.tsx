/**
 * SupportLayout
 *
 * Adiciona o SupportBanner fixo no topo para usuários de suporte.
 * O banner empurra o conteúdo para baixo via padding-top.
 * Não interfere no layout interno das páginas.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabaseCrm } from "@/lib/supabase";
import { AlertTriangle, ChevronDown, ChevronUp, ClipboardList } from "lucide-react";

const SUPPORT_RULES = [
  "Nenhuma alteração deve ser feita sem consentimento explícito do cliente.",
  "Dados exibidos são confidenciais — não compartilhe capturas de tela ou informações.",
  "Esta sessão é auditada. Todas as ações são registradas com data, hora e usuário.",
  "Acesso restrito a diagnóstico e suporte técnico autorizado.",
  "Em caso de dúvida, encerre a sessão e entre em contato com o responsável.",
];

interface Props {
  children: React.ReactNode;
}

export function SupportLayout({ children }: Props) {
  const { isSupport, tenantId } = useAuth();
  const navigate = useNavigate();
  const [clientName, setClientName] = useState<string | undefined>(undefined);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!isSupport || !tenantId) return;
    supabaseCrm
      .from("clients")
      .select("name")
      .eq("tenant_id", tenantId)
      .maybeSingle()
      .then(({ data }) => setClientName(data?.name ?? undefined));
  }, [isSupport, tenantId]);

  if (!isSupport) return <>{children}</>;

  return (
    <>
      {/* Banner fixo no topo */}
      <div className="fixed top-0 left-0 right-0 z-50 border-b border-orange-500/40 bg-orange-500/10 backdrop-blur-sm">
        {/* Linha principal */}
        <div className="flex items-center justify-between gap-3 px-5 py-2.5">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-base shrink-0">🛠️</span>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-wide text-orange-400">
                Sessão de Suporte Técnico
                {clientName && (
                  <span className="ml-2 text-orange-300 normal-case font-bold">
                    — Cliente: {clientName}
                  </span>
                )}
              </p>
              <p className="text-[10px] text-orange-300/70">
                Acesso monitorado e auditado. Todas as ações são registradas.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => navigate("/dashboard/logs")}
              className="flex items-center gap-1.5 text-[11px] font-bold text-orange-400 hover:text-orange-200 border border-orange-500/40 hover:border-orange-400 rounded-lg px-2.5 py-1 transition-colors"
            >
              <ClipboardList className="h-3 w-3" />
              Logs
            </button>
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-orange-400 hover:text-orange-200 transition-colors p-1"
              title="Ver regras de conduta"
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* Regras expandíveis */}
        {expanded && (
          <div className="border-t border-orange-500/20 px-5 py-3 space-y-1.5">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-3.5 w-3.5 text-orange-400 shrink-0" />
              <p className="text-[10px] font-black uppercase tracking-widest text-orange-400">
                Regras de Conduta
              </p>
            </div>
            {SUPPORT_RULES.map((rule, i) => (
              <p key={i} className="text-[10px] text-orange-300/80 flex gap-2">
                <span className="text-orange-500 font-black shrink-0">{i + 1}.</span>
                {rule}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Espaçador para compensar o banner fixo */}
      <div style={{ paddingTop: expanded ? "120px" : "48px" }} className="transition-all duration-200">
        {children}
      </div>
    </>
  );
}
