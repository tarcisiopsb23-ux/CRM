/**
 * SupportLayout
 *
 * Para usuários de suporte, adiciona um banner no topo da página.
 * Usa position sticky dentro do fluxo normal — sem duplicar backgrounds.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabaseCrm } from "@/lib/supabase";
import { ChevronDown, ChevronUp, ClipboardList, AlertTriangle } from "lucide-react";

const SUPPORT_RULES = [
  "Nenhuma alteração deve ser feita sem consentimento explícito do cliente.",
  "Dados exibidos são confidenciais — não compartilhe capturas de tela ou informações.",
  "Esta sessão é auditada. Todas as ações são registradas com data, hora e usuário.",
  "Acesso restrito a diagnóstico e suporte técnico autorizado.",
];

export function SupportBannerBar({ clientName }: { clientName?: string }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mx-4 md:mx-8 mt-4 md:mt-6 rounded-2xl border border-orange-500/40 bg-orange-500/10 overflow-hidden shadow-lg shadow-orange-500/5">
      {/* Header sempre visível */}
      <div className="flex items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl shrink-0">🛠️</span>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-widest text-orange-400/70">
              Sessão de Suporte Técnico · Auditada
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => navigate("/dashboard/logs")}
            className="flex items-center gap-1.5 text-xs font-bold text-orange-400 hover:text-orange-200 border border-orange-500/40 hover:border-orange-400 rounded-lg px-3 py-1.5 transition-colors"
          >
            <ClipboardList className="h-3.5 w-3.5" /> Logs
          </button>
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
        <div className="border-t border-orange-500/20 px-6 py-4 space-y-2">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-orange-400 shrink-0" />
            <p className="text-xs font-black uppercase tracking-widest text-orange-400">
              Regras de Conduta
            </p>
          </div>
          {SUPPORT_RULES.map((rule, i) => (
            <p key={i} className="text-xs text-orange-300/70 flex gap-2">
              <span className="text-orange-500 font-black shrink-0">{i + 1}.</span>{rule}
            </p>
          ))}
          <p className="text-[10px] text-orange-400/40 pt-2 border-t border-orange-500/20">
            O descumprimento dessas regras pode resultar em revogação do acesso de suporte.
          </p>
        </div>
      )}
    </div>
  );
}

interface Props {
  children: React.ReactNode;
}

export function SupportLayout({ children }: Props) {
  const { isSupport, tenantId, session } = useAuth();
  const [clientName, setClientName] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!isSupport) return;

    // Tentar obter tenant_id de múltiplas fontes — ignorar strings vazias
    const effectiveTenantId =
      (tenantId || null) ??
      (session?.user?.user_metadata?.tenant_id || null) ??
      (sessionStorage.getItem("support_selected_tenant_id") || null);

    if (!effectiveTenantId) {
      // Sem tenant_id — mostrar e-mail do suporte como identificação
      setClientName(session?.user?.email ?? "Suporte");
      return;
    }

    // Buscar nome do cliente — tenta por tenant_id e por id (fallback)
    supabaseCrm
      .from("clients")
      .select("name, company, metadata")
      .or(`tenant_id.eq.${effectiveTenantId},id.eq.${effectiveTenantId}`)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.warn("[SupportLayout] erro ao buscar cliente:", error.message);
        const name = data?.metadata?.display_name || data?.company || data?.name;
        setClientName(name ?? `Tenant: ${effectiveTenantId.slice(0, 8)}…`);
      });
  }, [isSupport, tenantId, session]);

  if (!isSupport) return <>{children}</>;

  return (
    <>{children}</>
  );
}
