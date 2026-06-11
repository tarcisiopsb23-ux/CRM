import { useClientIntegrations } from "@/hooks/useHubPerformance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Lock, Check, ArrowRight,
  AlertCircle, CheckCircle2, Clock, Loader2, Zap, XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type C8ActivationStatus = "pendente" | "em_andamento" | "ativo" | "falhou" | null;

const ACTIVATION_CONFIG: Record<
  NonNullable<C8ActivationStatus>,
  { label: string; color: string; icon: React.ElementType; detail: string }
> = {
  pendente:     { label: "Ativação pendente",    color: "bg-amber-100 text-amber-700",    icon: Clock,        detail: "Aguardando provisionamento via n8n." },
  em_andamento: { label: "Ativando…",            color: "bg-blue-100 text-blue-700",      icon: Loader2,      detail: "O n8n está provisionando o banco do cliente." },
  ativo:        { label: "C8 Control ativado",   color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2, detail: "Banco provisionado e acesso liberado." },
  falhou:       { label: "Falha na ativação",    color: "bg-red-100 text-red-700",        icon: XCircle,      detail: "Erro ao provisionar. Clique em Gerenciar para tentar novamente." },
};

function StatusIndicator({
  active,
  activeLabel,
  inactiveLabel,
  reason,
  detail,
  actionLabel,
  onAction,
  badge,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
  reason?: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
  badge?: React.ReactNode;
}) {
  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border-2 ${active ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
      <div className={`mt-0.5 h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${active ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-400"}`}>
        {active ? <Check className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`text-sm font-bold ${active ? "text-emerald-700" : "text-slate-500"}`}>
            {active ? activeLabel : inactiveLabel}
          </p>
          {badge}
        </div>
        {reason && <p className="text-xs text-muted-foreground mt-0.5">{reason}</p>}
        {detail && <p className="text-xs text-slate-400 mt-0.5">{detail}</p>}
      </div>
      {onAction && (
        <Button size="sm" variant={active ? "outline" : "ghost"} onClick={onAction} className="gap-1.5 shrink-0">
          {actionLabel ?? "Gerenciar"}
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

export function ClientIntegrationsTab({ organizationId, clientId }: { organizationId: string; clientId: string }) {
  const navigate = useNavigate();
  const { data: integrations = [] } = useClientIntegrations(organizationId, clientId);

  const [c8AccessInfo, setC8AccessInfo] = useState<{
    hasAccess: boolean;
    reason: string;
    contracts: string[];
    activationStatus: C8ActivationStatus;
    activatedAt: string | null;
  }>({ hasAccess: false, reason: "Sem acesso", contracts: [], activationStatus: null, activatedAt: null });

  useEffect(() => {
    const load = async () => {
      const { data: client } = await supabase
        .from("clients")
        .select("c8_control_enabled, client_supabase_url, client_supabase_anon_key")
        .eq("id", clientId)
        .single();

      const { data: plan } = await supabase
        .from("crm_client_plans")
        .select("c8_activation_status, c8_activated_at, c8_included")
        .eq("client_id", clientId)
        .single();

      const { data: contracts } = await supabase
        .from("contracts")
        .select("id, service_contracted, status")
        .eq("client_id", clientId)
        .not("status", "in", '("cancelado","encerrado")');

      const c8Keywords = ["assessoria", "consultoria", "agente_ia", "agente ia", "c8 control", "c8control"];
      const matching = (contracts ?? []).filter((ct: any) =>
        c8Keywords.some(kw => (ct.service_contracted ?? "").toLowerCase().includes(kw))
      );

      const hasBankB = !!(client as any)?.client_supabase_url && !!(client as any)?.client_supabase_anon_key;
      const hasManual = !!(client as any)?.c8_control_enabled;
      const hasContract = matching.length > 0;
      const hasAccess = hasManual || hasContract || hasBankB;

      const activationStatus: C8ActivationStatus = (plan as any)?.c8_activation_status ?? (hasAccess ? "pendente" : null);

      setC8AccessInfo({
        hasAccess,
        reason: hasManual
          ? "Acesso habilitado manualmente"
          : hasContract
            ? "Acesso via contrato ativo"
            : hasBankB
              ? "Acesso via Banco B configurado"
              : "Sem contrato de assessoria, consultoria ou Agente IA",
        contracts: matching.map((ct: any) => ct.service_contracted ?? ct.id),
        activationStatus,
        activatedAt: (plan as any)?.c8_activated_at ?? null,
      });
    };
    load();
  }, [clientId]);

  const metaIntegration   = integrations.find((i: any) => i.platform === "meta");
  const googleIntegration = integrations.find((i: any) => i.platform === "google");

  const syncLabel = (integration: any) => {
    if (!integration) return undefined;
    const { sync_status, last_sync_at } = integration;
    if (sync_status === "syncing") return "Sincronizando...";
    if (sync_status === "error") return "Erro na última sync";
    if (sync_status === "success" && last_sync_at)
      return `Sync ${formatDistanceToNow(new Date(last_sync_at), { addSuffix: true, locale: ptBR })}`;
    if (sync_status === "no_data" && last_sync_at)
      return `Sem dados — ${formatDistanceToNow(new Date(last_sync_at), { addSuffix: true, locale: ptBR })}`;
    return "Nunca sincronizado";
  };

  const goToC8Control = () => {
    if (c8AccessInfo.activationStatus === "pendente" || c8AccessInfo.activationStatus === "falhou") {
      navigate(`/c8control?tab=pending&client=${clientId}`);
    } else {
      navigate(`/c8control?client=${clientId}`);
    }
  };

  // Badge de status de ativação
  const activationBadge = (() => {
    const st = c8AccessInfo.activationStatus;
    if (!st || !c8AccessInfo.hasAccess) return null;
    const cfg = ACTIVATION_CONFIG[st];
    const Icon = cfg.icon;
    return (
      <Badge className={`text-xs flex items-center gap-1 ${cfg.color}`}>
        <Icon className={`h-3 w-3 ${st === "em_andamento" ? "animate-spin" : ""}`} />
        {cfg.label}
      </Badge>
    );
  })();

  const activationDetail = (() => {
    const st = c8AccessInfo.activationStatus;
    if (!st || !c8AccessInfo.hasAccess) return undefined;
    const detail = ACTIVATION_CONFIG[st].detail;
    if (st === "ativo" && c8AccessInfo.activatedAt) {
      return `Ativado ${formatDistanceToNow(new Date(c8AccessInfo.activatedAt), { addSuffix: true, locale: ptBR })}`;
    }
    return detail;
  })();

  return (
    <div className="space-y-3">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-slate-800">Status das Integrações</h3>
        <p className="text-sm text-slate-500 mt-0.5">
          Todas as configurações são gerenciadas no módulo C8 Control.
        </p>
      </div>

      {/* C8 Control */}
      <StatusIndicator
        active={c8AccessInfo.hasAccess}
        activeLabel="C8 Control habilitado"
        inactiveLabel="C8 Control não habilitado"
        reason={c8AccessInfo.reason}
        detail={
          c8AccessInfo.hasAccess
            ? activationDetail
            : c8AccessInfo.contracts.length > 0
              ? `Contratos: ${c8AccessInfo.contracts.join(", ")}`
              : "Para liberar, adicione um contrato de assessoria, consultoria ou Agente IA."
        }
        badge={activationBadge}
        actionLabel={
          c8AccessInfo.activationStatus === "pendente" || c8AccessInfo.activationStatus === "falhou"
            ? "Ativar agora"
            : "Gerenciar C8 Control"
        }
        onAction={goToC8Control}
      />

      {/* Meta Ads */}
      <StatusIndicator
        active={!!metaIntegration}
        activeLabel={`Meta Ads conectado — ID: ${metaIntegration?.account_id ?? ""}`}
        inactiveLabel="Meta Ads não conectado"
        reason={syncLabel(metaIntegration)}
        actionLabel={metaIntegration ? "Ver no C8 Control" : "Configurar"}
        onAction={goToC8Control}
      />

      {/* Google Ads */}
      <StatusIndicator
        active={!!googleIntegration}
        activeLabel={`Google Ads conectado — ID: ${googleIntegration?.account_id ?? ""}`}
        inactiveLabel="Google Ads não conectado"
        reason={syncLabel(googleIntegration)}
        actionLabel={googleIntegration ? "Ver no C8 Control" : "Configurar"}
        onAction={goToC8Control}
      />
    </div>
  );
}
