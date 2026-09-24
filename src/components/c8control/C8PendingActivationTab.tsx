import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Loader2, Zap, AlertTriangle, CheckCircle2, Clock,
  XCircle, ChevronDown, ChevronUp, RefreshCcw, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useC8PendingActivation, type C8PendingClient } from "@/hooks/useC8PendingActivation";
import { useNavigate } from "react-router-dom";

const fmtDate = (d: string | null) =>
  d ? format(parseISO(d), "dd/MM/yyyy", { locale: ptBR }) : "—";

const STATUS_CONFIG = {
  pendente:     { label: "Pendente",     color: "bg-amber-100 text-amber-700",   icon: Clock },
  em_andamento: { label: "Em andamento", color: "bg-blue-100 text-blue-700",     icon: Loader2 },
  ativo:        { label: "Ativado",      color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  falhou:       { label: "Falhou",       color: "bg-red-100 text-red-700",       icon: XCircle },
} as const;

function ReadinessIndicator({ client }: { client: C8PendingClient }) {
  const hasUrl  = !!client.supabase_url;
  const hasAnon = !!client.anon_key;
  const hasKey  = client.has_service_key;
  const hasSlug = !!client.dashboard_slug;
  const ready   = hasUrl && hasAnon && hasKey && hasSlug;

  if (ready) return (
    <Badge className="bg-emerald-100 text-emerald-700 text-xs">Pronto para ativar</Badge>
  );

  const missing = [
    !hasUrl  && "Supabase URL",
    !hasAnon && "Anon Key",
    !hasKey  && "Service Key",
    !hasSlug && "Slug do dashboard",
  ].filter(Boolean).join(", ");

  return (
    <Badge className="bg-red-100 text-red-700 text-xs" title={`Faltando: ${missing}`}>
      Incompleto — {missing}
    </Badge>
  );
}

function ClientActivationRow({
  client,
  onActivate,
  onReset,
  isActivating,
  isResetting,
  canEdit,
}: {
  client: C8PendingClient;
  onActivate: (id: string) => void;
  onReset: (id: string) => void;
  isActivating: boolean;
  isResetting: boolean;
  canEdit: boolean;
}) {
  const navigate = useNavigate();
  const [errorOpen, setErrorOpen] = useState(false);
  const status = STATUS_CONFIG[client.c8_activation_status] ?? STATUS_CONFIG.pendente;
  const StatusIcon = status.icon;
  const canActivate = !!client.supabase_url && !!client.anon_key && client.has_service_key && !!client.dashboard_slug;
  const isStuck = client.c8_activation_status === "em_andamento";

  return (
    <div className="p-4 rounded-xl border bg-white space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-slate-800">{client.client_name}</p>
            <Badge className={`text-xs flex items-center gap-1 ${status.color}`}>
              <StatusIcon className={`h-3 w-3 ${isStuck ? "animate-spin" : ""}`} />
              {status.label}
            </Badge>
            {client.c8_included && (
              <Badge className="bg-violet-100 text-violet-700 text-xs">Incluído no contrato</Badge>
            )}
          </div>
          {client.client_email && (
            <p className="text-xs text-muted-foreground mt-0.5">{client.client_email}</p>
          )}
          {client.contract_service && (
            <p className="text-xs text-slate-500 mt-0.5">
              Contrato: {client.contract_service}
              {client.contract_end && ` · até ${fmtDate(client.contract_end)}`}
            </p>
          )}
          {isStuck && (
            <p className="text-xs text-blue-500 mt-1">
              Aguardando resposta do provisionamento. Se ficar preso, cancele e tente novamente.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm" variant="ghost"
            onClick={() => navigate(`/c8control?tab=tenants&client=${client.client_id}&subtab=configuracoes`)}
            title="Ver configurações do cliente no C8 Control"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
          {canEdit && isStuck && (
            <Button
              size="sm"
              variant="outline"
              disabled={isResetting}
              onClick={() => onReset(client.client_id)}
              className="gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50"
              title="Cancelar e voltar para Pendente para tentar novamente"
            >
              {isResetting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
              Cancelar
            </Button>
          )}
          {canEdit && !isStuck && (
            <Button
              size="sm"
              disabled={isActivating || !canActivate}
              onClick={() => onActivate(client.client_id)}
              className="gap-1.5"
              variant={client.c8_activation_status === "falhou" ? "destructive" : "default"}
              title={!canActivate ? "Configure as credenciais do Supabase antes de ativar" : ""}
            >
              {isActivating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : client.c8_activation_status === "falhou" ? (
                <RefreshCcw className="h-3.5 w-3.5" />
              ) : (
                <Zap className="h-3.5 w-3.5" />
              )}
              {client.c8_activation_status === "falhou" ? "Tentar novamente" : "Ativar"}
            </Button>
          )}
        </div>
      </div>

      <ReadinessIndicator client={client} />

      {client.c8_activation_error && (
        <div className="space-y-1">
          <button
            onClick={() => setErrorOpen(v => !v)}
            className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 transition-colors"
          >
            {errorOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Ver erro da última tentativa
          </button>
          {errorOpen && (
            <p className="text-[10px] text-red-500 bg-red-50 border border-red-200 rounded p-2 font-mono">
              {client.c8_activation_error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

interface C8PendingActivationTabProps {
  organizationId: string;
  canEdit: boolean;
}

export function C8PendingActivationTab({ organizationId, canEdit }: C8PendingActivationTabProps) {
  const { data: pending = [], isLoading, refetch, activate, resetActivation } = useC8PendingActivation(organizationId);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);

  const handleActivate = async (clientId: string) => {
    setActivatingId(clientId);
    try {
      await activate.mutateAsync(clientId);
      toast.success("Ativação iniciada! O banco do cliente está sendo provisionado.", {
        description: "Aguarde alguns instantes e atualize a lista.",
      });
    } catch (err: any) {
      toast.error(`Erro ao ativar: ${err.message}`);
    } finally {
      setActivatingId(null);
    }
  };

  const handleReset = async (clientId: string) => {
    setResettingId(clientId);
    try {
      await resetActivation.mutateAsync(clientId);
      toast.info("Ativação cancelada. O cliente voltou para Pendente.");
    } catch (err: any) {
      toast.error(`Erro ao cancelar: ${err.message}`);
    } finally {
      setResettingId(null);
    }
  };

  const handleActivateAll = async () => {
    const eligible = pending.filter(
      c =>
        c.c8_activation_status !== "em_andamento" &&
        c.supabase_url && c.anon_key && c.has_service_key && c.dashboard_slug
    );
    if (eligible.length === 0) {
      toast.info("Nenhum cliente pronto para ativação em lote.");
      return;
    }
    for (const client of eligible) {
      setActivatingId(client.client_id);
      try {
        await activate.mutateAsync(client.client_id);
        await new Promise(r => setTimeout(r, 800)); // pequena pausa entre ativações
      } catch {
        // continua para o próximo
      }
    }
    setActivatingId(null);
    toast.success(`${eligible.length} cliente(s) enviados para ativação.`);
  };

  const pendingOnly   = pending.filter(c => c.c8_activation_status === "pendente");
  const failedOnly    = pending.filter(c => c.c8_activation_status === "falhou");
  const inProgressOnly = pending.filter(c => c.c8_activation_status === "em_andamento");
  const readyToActivate = pending.filter(
    c => (c.c8_activation_status === "pendente" || c.c8_activation_status === "falhou")
      && c.supabase_url && c.anon_key && c.has_service_key && c.dashboard_slug
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            Ativação do C8 Control Pendente
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Clientes com acesso habilitado por contrato aguardando provisionamento.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={() => refetch()} className="gap-1.5">
            <RefreshCcw className="h-3.5 w-3.5" />
            Atualizar
          </Button>
          {canEdit && readyToActivate.length > 1 && (
            <Button size="sm" onClick={handleActivateAll} disabled={!!activatingId} className="gap-1.5">
              <Zap className="h-3.5 w-3.5" />
              Ativar todos prontos ({readyToActivate.length})
            </Button>
          )}
        </div>
      </div>

      {/* Resumo */}
      {pending.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Pendentes",     count: pendingOnly.length,    color: "text-amber-600",   bg: "bg-amber-50" },
            { label: "Em andamento",  count: inProgressOnly.length, color: "text-blue-600",    bg: "bg-blue-50" },
            { label: "Prontos",       count: readyToActivate.length, color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Com falha",     count: failedOnly.length,     color: "text-red-600",     bg: "bg-red-50" },
          ].map(s => (
            <div key={s.label} className={`rounded-lg p-3 ${s.bg}`}>
              <p className={`text-xl font-bold ${s.color}`}>{s.count}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Lista */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Carregando...</span>
        </div>
      ) : pending.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-3" />
            <p className="font-semibold text-slate-700">Tudo em dia!</p>
            <p className="text-sm text-muted-foreground mt-1">
              Nenhum cliente com ativação do C8 Control pendente.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* Falhas primeiro */}
          {failedOnly.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-red-600 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                Falha na ativação ({failedOnly.length})
              </p>
              {failedOnly.map(c => (
                <ClientActivationRow
                  key={c.client_id} client={c} canEdit={canEdit}
                  isActivating={activatingId === c.client_id}
                  isResetting={resettingId === c.client_id}
                  onActivate={handleActivate}
                  onReset={handleReset}
                />
              ))}
            </div>
          )}

          {/* Em andamento */}
          {inProgressOnly.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 flex items-center gap-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Em andamento ({inProgressOnly.length})
              </p>
              {inProgressOnly.map(c => (
                <ClientActivationRow
                  key={c.client_id} client={c} canEdit={canEdit}
                  isActivating={activatingId === c.client_id}
                  isResetting={resettingId === c.client_id}
                  onActivate={handleActivate}
                  onReset={handleReset}
                />
              ))}
            </div>
          )}

          {/* Pendentes */}
          {pendingOnly.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-amber-600 flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Aguardando ativação ({pendingOnly.length})
              </p>
              {pendingOnly.map(c => (
                <ClientActivationRow
                  key={c.client_id} client={c} canEdit={canEdit}
                  isActivating={activatingId === c.client_id}
                  isResetting={resettingId === c.client_id}
                  onActivate={handleActivate}
                  onReset={handleReset}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
