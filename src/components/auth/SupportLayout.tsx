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
    <div
      style={{
        background: "#0F172A",
        borderBottom: "1px solid rgba(249,115,22,0.3)",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      <div
        style={{ background: "rgba(249,115,22,0.08)" }}
        className="flex items-center justify-between gap-3 px-5 py-2"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm shrink-0">🛠️</span>
          <p className="text-[11px] font-black uppercase tracking-wide text-orange-400 truncate">
            Suporte Técnico
            {clientName && (
              <span className="ml-1.5 text-orange-300 normal-case font-semibold">
                — {clientName}
              </span>
            )}
            <span className="ml-1.5 text-orange-300/50 font-normal normal-case">· Sessão auditada</span>
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => navigate("/dashboard/logs")}
            className="flex items-center gap-1 text-[10px] font-bold text-orange-400 hover:text-orange-200 border border-orange-500/25 hover:border-orange-400 rounded px-2 py-0.5 transition-colors"
          >
            <ClipboardList className="h-2.5 w-2.5" /> Logs
          </button>
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-orange-400/50 hover:text-orange-300 transition-colors p-0.5"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
      {expanded && (
        <div
          className="px-5 py-2.5 space-y-1"
          style={{ borderTop: "1px solid rgba(249,115,22,0.15)", background: "rgba(249,115,22,0.05)" }}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlertTriangle className="h-3 w-3 text-orange-400 shrink-0" />
            <p className="text-[9px] font-black uppercase tracking-widest text-orange-400/70">Regras de Conduta</p>
          </div>
          {SUPPORT_RULES.map((rule, i) => (
            <p key={i} className="text-[10px] text-orange-300/60 flex gap-1.5">
              <span className="text-orange-500/70 font-black shrink-0">{i + 1}.</span>{rule}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  children: React.ReactNode;
}

export function SupportLayout({ children }: Props) {
  const { isSupport, tenantId } = useAuth();
  const [clientName, setClientName] = useState<string | undefined>(undefined);

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

  // Injeta o banner antes do conteúdo da página
  // O children (cada página) tem seu próprio min-h-screen e bg
  // O banner fica sticky no topo dentro do mesmo scroll container
  return (
    <>
      <SupportBannerBar clientName={clientName} />
      {children}
    </>
  );
}
