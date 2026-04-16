/**
 * SupportLayout
 *
 * Injeta o banner de suporte via portal no topo do body.
 * O banner tem position sticky relativo ao scroll, aparece acima do conteúdo
 * sem quebrar o layout das páginas.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabaseCrm } from "@/lib/supabase";
import { AlertTriangle, ChevronDown, ChevronUp, ClipboardList } from "lucide-react";

const SUPPORT_RULES = [
  "Nenhuma alteração deve ser feita sem consentimento explícito do cliente.",
  "Dados exibidos são confidenciais — não compartilhe capturas de tela ou informações.",
  "Esta sessão é auditada. Todas as ações são registradas com data, hora e usuário.",
  "Acesso restrito a diagnóstico e suporte técnico autorizado.",
];

function SupportBannerPortal({ clientName }: { clientName?: string }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  return createPortal(
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 9999,
        background: "rgba(17,24,39,0.95)",
        borderBottom: "1px solid rgba(249,115,22,0.3)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div className="flex items-center justify-between gap-3 px-5 py-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-sm shrink-0">🛠️</span>
          <div className="min-w-0">
            <span className="text-[11px] font-black uppercase tracking-wide text-orange-400">
              Suporte Técnico
            </span>
            {clientName && (
              <span className="ml-2 text-[11px] text-orange-300 font-semibold">
                — {clientName}
              </span>
            )}
            <span className="ml-2 text-[10px] text-orange-300/50">· Sessão auditada</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => navigate("/dashboard/logs")}
            className="flex items-center gap-1 text-[10px] font-bold text-orange-400 hover:text-orange-200 border border-orange-500/30 hover:border-orange-400 rounded px-2 py-0.5 transition-colors"
          >
            <ClipboardList className="h-2.5 w-2.5" /> Logs
          </button>
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-orange-400/50 hover:text-orange-300 transition-colors"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
      {expanded && (
        <div
          style={{ borderTop: "1px solid rgba(249,115,22,0.15)", background: "rgba(17,24,39,0.98)" }}
          className="px-5 py-2.5 space-y-1"
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlertTriangle className="h-3 w-3 text-orange-400 shrink-0" />
            <p className="text-[9px] font-black uppercase tracking-widest text-orange-400/80">Regras de Conduta</p>
          </div>
          {SUPPORT_RULES.map((rule, i) => (
            <p key={i} className="text-[10px] text-orange-300/70 flex gap-1.5">
              <span className="text-orange-500/80 font-black shrink-0">{i + 1}.</span>{rule}
            </p>
          ))}
        </div>
      )}
    </div>,
    document.body.firstElementChild as Element ?? document.body
  );
}

interface Props {
  children: React.ReactNode;
}

export function SupportLayout({ children }: Props) {
  const { isSupport, tenantId } = useAuth();
  const [clientName, setClientName] = useState<string | undefined>(undefined);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!isSupport || !tenantId) return;
    supabaseCrm
      .from("clients")
      .select("name")
      .eq("tenant_id", tenantId)
      .maybeSingle()
      .then(({ data }) => setClientName(data?.name ?? undefined));
  }, [isSupport, tenantId]);

  return (
    <>
      {isSupport && mounted && <SupportBannerPortal clientName={clientName} />}
      {children}
    </>
  );
}
