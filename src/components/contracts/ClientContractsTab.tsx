/**
 * ClientContractsTab
 * Aba "Contratos" dentro do detail sheet de um cliente no C8 Control.
 * Lista contratos v2 (novo sistema) + contratos legados (tabela contracts).
 * Permite criar novo contrato via wizard e visualizar/exportar PDF.
 */
import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  FileText, Plus, Eye, Download, MoreHorizontal,
  CheckCircle2, Clock, XCircle, Send, Loader2, Archive,
} from "lucide-react";
import { toast } from "sonner";
import { useClientContracts, useContracts } from "@/hooks/useContracts";
import { useContractTemplates } from "@/hooks/useContractTemplates";
import { ContractGenerator } from "./ContractGenerator";
import { ContractViewer } from "./ContractViewer";
import type { ContractV2 } from "@/hooks/useContracts";
import type { ContractRow } from "@/hooks/useContracts";

interface Props {
  clientId: string;
  clientName: string;
  clientCnpj?: string | null;
  clientAddress?: string | null;
  clientAddressStreet?: string | null;
  clientAddressNumber?: string | null;
  clientAddressComplement?: string | null;
  clientAddressNeighborhood?: string | null;
  clientAddressCity?: string | null;
  clientAddressState?: string | null;
  organizationId: string;
  canEdit: boolean;
  /** Contratos da tabela legada (contracts) — exibidos somente-leitura com badge "Legado" */
  legacyContracts?: ContractRow[];
  /** Abre o detalhe/edição de um contrato legado (gerenciado pelo pai) */
  onOpenLegacyContract?: (contractId: string) => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  rascunho: { label: "Rascunho",  color: "bg-slate-100 text-slate-600",    icon: Clock },
  emitido:  { label: "Emitido",   color: "bg-blue-100 text-blue-700",      icon: Send },
  assinado: { label: "Assinado",  color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  cancelado:{ label: "Cancelado", color: "bg-red-100 text-red-700",        icon: XCircle },
  encerrado:{ label: "Encerrado", color: "bg-gray-100 text-gray-600",      icon: XCircle },
};

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const fmtDate = (d: string | null) => d ? format(parseISO(d), "dd/MM/yyyy", { locale: ptBR }) : "—";

export function ClientContractsTab({ clientId, clientName, clientCnpj, clientAddress, clientAddressStreet, clientAddressNumber, clientAddressComplement, clientAddressNeighborhood, clientAddressCity, clientAddressState, organizationId, canEdit, legacyContracts = [], onOpenLegacyContract }: Props) {
  const { data: contracts = [], isLoading } = useClientContracts(clientId);
  const { data: templates = [] } = useContractTemplates();
  const { changeStatus } = useContracts();

  const [mode, setMode] = useState<"list" | "create" | "view">("list");
  const [viewing, setViewing] = useState<ContractV2 | null>(null);

  // ── Dialog de confirmação de assinatura ──────────────────────────────────
  const [signDialog, setSignDialog] = useState<{ contract: ContractV2 } | null>(null);
  const [signDate, setSignDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [isSigning, setIsSigning] = useState(false);

  const handleStatusChange = async (contract: ContractV2, status: ContractV2["status"]) => {
    if (status === "assinado") {
      // Intercepta: abre dialog para confirmar a data de assinatura
      setSignDate(format(new Date(), "yyyy-MM-dd"));
      setSignDialog({ contract });
      return;
    }
    try {
      await changeStatus.mutateAsync({ id: contract.id, clientId, status });
      toast.success(`Contrato marcado como "${STATUS_CONFIG[status]?.label}".`);
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao alterar status.");
    }
  };

  const handleConfirmSign = async () => {
    if (!signDialog) return;
    setIsSigning(true);
    try {
      await changeStatus.mutateAsync({
        id:       signDialog.contract.id,
        clientId,
        status:   "assinado",
        signedAt: signDate,
      });
      toast.success("Contrato marcado como Assinado.");
      setSignDialog(null);
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao registrar assinatura.");
    } finally {
      setIsSigning(false);
    }
  };

  // ── Modo criar ─────────────────────────────────────────────────────────────
  if (mode === "create") {
    return (
      <div className="flex flex-col flex-1 overflow-y-auto" style={{ minHeight: "calc(100vh - 220px)" }}>
        <ContractGenerator
          clientId={clientId}
          clientName={clientName}
          clientCnpj={clientCnpj}
          clientAddress={clientAddress}
          clientAddressStreet={clientAddressStreet}
          clientAddressNumber={clientAddressNumber}
          clientAddressComplement={clientAddressComplement}
          clientAddressNeighborhood={clientAddressNeighborhood}
          clientAddressCity={clientAddressCity}
          clientAddressState={clientAddressState}
          organizationId={organizationId}
          onSuccess={(contractId) => {
            setMode("list");
            toast.success("Contrato gerado! Clique em Visualizar para ver o documento.");
          }}
          onClose={() => setMode("list")}
        />
      </div>
    );
  }

  // ── Modo visualizar ────────────────────────────────────────────────────────
  if (mode === "view" && viewing) {
    const tpl = templates.find(t => t.id === viewing.template_id) ?? null;
    return (
      <div style={{ height: "calc(90vh - 100px)" }}>
        <ContractViewer
          contract={viewing}
          template={tpl}
          onClose={() => { setMode("list"); setViewing(null); }}
          onEmit={viewing.status === "rascunho" ? async () => {
            try {
              await changeStatus.mutateAsync({ id: viewing.id, clientId, status: "emitido" });
              // Atualiza o objeto local para o badge refletir imediatamente
              setViewing(prev => prev ? { ...prev, status: "emitido" } : prev);
            } catch { /* silencioso — o PDF já foi gerado */ }
          } : undefined}
        />
      </div>
    );
  }

  // ── Lista de contratos ─────────────────────────────────────────────────────
  const totalContracts = contracts.length + legacyContracts.length;

  return (
    <>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-violet-500" /> Contratos
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">{totalContracts} contrato(s)</p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => setMode("create")} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Novo contrato
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" /> Carregando...
        </div>
      ) : totalContracts === 0 ? (
        <div className="text-center py-12 space-y-3">
          <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">Nenhum contrato gerado para este cliente.</p>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setMode("create")} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Gerar primeiro contrato
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {/* ── Contratos v2 (novo sistema) ─────────────────────────── */}
          {contracts.map(c => {
            const statusCfg = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.rascunho;
            const StatusIcon = statusCfg.icon;
            const schedule = c.payment_schedule ?? [];
            const recurring = schedule.find(l => l.is_recurring);
            const setup = schedule.find(l => l.line_type === "setup" || l.line_type === "unico");

            return (
              <div key={c.id} className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                <FileText className="h-5 w-5 text-violet-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {c.contract_number && (
                      <span className="text-[10px] font-mono text-muted-foreground">{c.contract_number}</span>
                    )}
                    <p className="text-sm font-medium truncate">{c.title}</p>
                    <Badge className={`text-[10px] flex items-center gap-0.5 ${statusCfg.color}`}>
                      <StatusIcon className="h-2.5 w-2.5" /> {statusCfg.label}
                    </Badge>
                    {c.proposal_id && (
                      <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-300">
                        Proposta vinculada
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                    {c.service_slugs?.length > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        Serviços: {c.service_slugs.join(", ")}
                      </p>
                    )}
                    {setup && (
                      <p className="text-[10px] text-muted-foreground">
                        Setup: {fmt(setup.amount)}
                      </p>
                    )}
                    {recurring && (
                      <p className="text-[10px] text-muted-foreground">
                        Mensal: {fmt(recurring.amount)} · dia {c.due_day}
                      </p>
                    )}
                    {c.start_date && (
                      <p className="text-[10px] text-muted-foreground">
                        Início: {fmtDate(c.start_date)}
                      </p>
                    )}
                    {c.signed_at && (
                      <p className="text-[10px] text-emerald-600">
                        Assinado em {fmtDate(c.signed_at)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" className="gap-1 text-xs"
                    onClick={() => { setViewing(c); setMode("view"); }}>
                    <Eye className="h-3.5 w-3.5" /> Ver
                  </Button>
                  {canEdit && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {/* Emitido: gerado pelo ContractViewer ao imprimir/PDF — não manual */}
                        {(c.status === "rascunho" || c.status === "emitido") && (
                          <DropdownMenuItem onClick={() => handleStatusChange(c, "assinado")}>
                            <CheckCircle2 className="h-3.5 w-3.5 mr-2 text-emerald-600" /> Marcar como Assinado
                          </DropdownMenuItem>
                        )}
                        {c.status !== "cancelado" && c.status !== "encerrado" && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => handleStatusChange(c, "cancelado")}
                            >
                              <XCircle className="h-3.5 w-3.5 mr-2" /> Cancelar contrato
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            );
          })}

          {/* ── Contratos legados (tabela contracts) ─────────────────── */}
          {legacyContracts.map(ct => {
            const id       = String(ct.id ?? "");
            const title    = String(ct.title ?? ct.service_contracted ?? "Contrato");
            const status   = String(ct.status ?? "—");
            const value    = Number(ct.value ?? 0);
            const date     = ct.contract_date as string | null ?? ct.start_date as string | null;
            const isSigned = Boolean(ct.is_signed);

            const statusColor =
              status === "ativo"      ? "bg-emerald-100 text-emerald-700" :
              status === "suspenso"   ? "bg-yellow-100 text-yellow-700"   :
              status === "cancelado"  ? "bg-red-100 text-red-700"         :
              "bg-slate-100 text-slate-600";

            return (
              <div key={id} className="flex items-start gap-3 p-3 rounded-lg border border-dashed hover:bg-muted/20 transition-colors">
                <Archive className="h-5 w-5 text-muted-foreground/60 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">{title}</p>
                    <Badge variant="outline" className="text-[10px] text-muted-foreground border-muted-foreground/40">
                      Legado
                    </Badge>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${statusColor}`}>
                      {status}
                    </span>
                    {isSigned && (
                      <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-0.5">
                        <CheckCircle2 className="h-3 w-3" /> Assinado
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                    {date && (
                      <p className="text-[10px] text-muted-foreground">
                        Data: {fmtDate(date)}
                      </p>
                    )}
                    {value > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        Valor: {fmt(value)}
                      </p>
                    )}
                  </div>
                </div>
                {onOpenLegacyContract && (
                  <Button size="sm" variant="ghost" className="gap-1 text-xs shrink-0"
                    onClick={() => onOpenLegacyContract(id)}>
                    <Eye className="h-3.5 w-3.5" /> Ver
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>

    {/* ── Dialog: confirmar data de assinatura ─────────────────────────── */}
    <Dialog open={!!signDialog} onOpenChange={o => { if (!o) setSignDialog(null); }}>
      <DialogContent className="max-w-sm">
        <div className="space-y-4 p-1">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Registrar Assinatura
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Informe a data em que o contrato foi assinado pelo cliente.
              Essa data constará no documento.
            </p>
          </div>

          {signDialog && (
            <p className="text-xs text-muted-foreground border rounded-md px-3 py-2 bg-muted/30 truncate">
              {signDialog.contract.title}
            </p>
          )}

          <div className="space-y-1.5">
            <Label className="text-sm">Data de assinatura</Label>
            <Input
              type="date"
              value={signDate}
              onChange={e => setSignDate(e.target.value)}
              className="h-9"
              max={format(new Date(), "yyyy-MM-dd")}
            />
            {signDate && (
              <p className="text-xs text-muted-foreground">
                {format(new Date(signDate + "T12:00:00"), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setSignDialog(null)} disabled={isSigning}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleConfirmSign} disabled={!signDate || isSigning} className="gap-1.5">
              {isSigning && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Confirmar Assinatura
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
