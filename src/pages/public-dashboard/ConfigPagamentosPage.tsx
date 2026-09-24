/**
 * ConfigPagamentosPage
 *
 * Exibe para o cliente:
 *   1. Resumo financeiro — total pago, em aberto e vencido
 *   2. Tabela de cobranças — pagas e em aberto
 *   3. Ações de pagamento — gerar PIX / boleto / cartão
 *      (apenas os métodos habilitados no módulo C8 Control)
 *
 * Não expõe nenhuma configuração de integração (chaves de API, etc.).
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  QrCode, FileText, CreditCard, Loader2, CheckCircle2,
  Clock, AlertCircle, Copy, ExternalLink, Plus, Gift,
} from "lucide-react";
import { format, parseISO, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useDynamicClient } from "@/hooks/useDynamicClient";
import { PageHeader } from "./components/PageHeader";
import { CredentialsErrorState } from "./components/CredentialsErrorState";

// ─── Types ────────────────────────────────────────────────────────────────────

type BillingType = "PIX" | "BOLETO" | "CREDIT_CARD" | "UNDEFINED";

type ChargeStatus =
  | "PENDING" | "RECEIVED" | "CONFIRMED" | "OVERDUE"
  | "REFUNDED" | "CANCELLED" | "CHARGEBACK_REQUESTED"
  | "AWAITING_RISK_ANALYSIS";

interface Charge {
  id: string;
  description: string;
  value: number;
  due_date: string;
  payment_date: string | null;
  billing_type: BillingType;
  status: ChargeStatus;
  invoice_url: string | null;
  bank_slip_url: string | null;
  pix_qr_code: string | null;
  pix_copy_paste: string | null;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (d: string | null) =>
  d ? format(parseISO(d), "dd/MM/yyyy", { locale: ptBR }) : "—";

const PAID_STATUSES: ChargeStatus[] = ["RECEIVED", "CONFIRMED"];
const OPEN_STATUSES: ChargeStatus[] = ["PENDING", "AWAITING_RISK_ANALYSIS"];

function statusLabel(s: ChargeStatus): { label: string; className: string } {
  switch (s) {
    case "RECEIVED":
    case "CONFIRMED":
      return { label: "Pago", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" };
    case "PENDING":
      return { label: "Pendente", className: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" };
    case "OVERDUE":
      return { label: "Vencido", className: "bg-red-500/10 text-red-400 border-red-500/20" };
    case "CANCELLED":
      return { label: "Cancelado", className: "bg-slate-500/10 text-slate-400 border-slate-500/20" };
    case "REFUNDED":
      return { label: "Reembolsado", className: "bg-blue-500/10 text-blue-400 border-blue-500/20" };
    default:
      return { label: s, className: "bg-muted text-muted-foreground" };
  }
}

function billingIcon(type: BillingType) {
  switch (type) {
    case "PIX":         return <QrCode className="h-4 w-4 text-emerald-400" />;
    case "BOLETO":      return <FileText className="h-4 w-4 text-yellow-400" />;
    case "CREDIT_CARD": return <CreditCard className="h-4 w-4 text-blue-400" />;
    default:            return <CreditCard className="h-4 w-4 text-muted-foreground" />;
  }
}

// ─── Charge Row ───────────────────────────────────────────────────────────────

function ChargeRow({ charge }: { charge: Charge }) {
  const [expanded, setExpanded] = useState(false);
  const st = statusLabel(charge.status);
  const isOverdue = charge.status === "PENDING" && isPast(parseISO(charge.due_date));

  const copyPix = () => {
    if (!charge.pix_copy_paste) return;
    navigator.clipboard.writeText(charge.pix_copy_paste);
    toast.success("Código PIX copiado!");
  };

  return (
    <div className="border border-border/60 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/20 transition-colors text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="shrink-0">{billingIcon(charge.billing_type)}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{charge.description || "Cobrança"}</p>
          <p className="text-xs text-muted-foreground">
            Venc. {fmtDate(charge.due_date)}
            {charge.payment_date && ` · Pago em ${fmtDate(charge.payment_date)}`}
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-3">
          <span className="text-sm font-semibold text-foreground">{fmtCurrency(charge.value)}</span>
          <Badge
            variant="outline"
            className={cn("text-[10px] font-semibold", isOverdue && charge.status === "PENDING"
              ? "bg-red-500/10 text-red-400 border-red-500/20"
              : st.className
            )}
          >
            {isOverdue && charge.status === "PENDING" ? "Vencido" : st.label}
          </Badge>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/40 px-4 py-3 bg-muted/10 flex flex-wrap gap-2">
          {charge.pix_copy_paste && (
            <Button size="sm" variant="outline" onClick={copyPix} className="border-border gap-1.5">
              <Copy className="h-3.5 w-3.5" /> Copiar código PIX
            </Button>
          )}
          {charge.bank_slip_url && (
            <Button size="sm" variant="outline" asChild className="border-border gap-1.5">
              <a href={charge.bank_slip_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" /> Abrir boleto
              </a>
            </Button>
          )}
          {charge.invoice_url && (
            <Button size="sm" variant="outline" asChild className="border-border gap-1.5">
              <a href={charge.invoice_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" /> Ver cobrança
              </a>
            </Button>
          )}
          {!charge.pix_copy_paste && !charge.bank_slip_url && !charge.invoice_url && (
            <p className="text-xs text-muted-foreground">Nenhuma ação disponível para esta cobrança.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── New Charge Dialog ────────────────────────────────────────────────────────

interface NewChargeDialogProps {
  open: boolean;
  onClose: () => void;
  billingType: BillingType;
  dc: ReturnType<typeof useDynamicClient>;
  clientId: string;
  onCreated: () => void;
}

function NewChargeDialog({ open, onClose, billingType, dc, clientId, onCreated }: NewChargeDialogProps) {
  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");

  const isCard = billingType === "CREDIT_CARD";

  const typeLabel: Record<BillingType, string> = {
    PIX:         "PIX",
    BOLETO:      "Boleto",
    CREDIT_CARD: "Cartão de Crédito",
    UNDEFINED:   "Pagamento",
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!dc) throw new Error("Banco não conectado.");
      if (!description.trim()) throw new Error("Informe a descrição.");
      const numValue = parseFloat(value.replace(",", "."));
      if (isNaN(numValue) || numValue <= 0) throw new Error("Informe um valor válido.");
      if (!dueDate) throw new Error("Informe a data de vencimento.");

      const payload: Partial<Charge> & { client_id: string } = {
        client_id:    clientId,
        description:  description.trim(),
        value:        numValue,
        due_date:     dueDate,
        billing_type: billingType,
        status:       "PENDING",
      };

      // Para cartão, guarda dados básicos em metadata (integração real via webhook n8n)
      if (isCard) {
        (payload as any).metadata = {
          card_last4: cardNumber.slice(-4),
          card_name:  cardName.trim(),
        };
      }

      const { error } = await dc.from("client_charges").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Cobrança via ${typeLabel[billingType]} registrada!`);
      onCreated();
      onClose();
      setDescription(""); setValue(""); setDueDate("");
      setCardNumber(""); setCardName(""); setCardExpiry(""); setCardCvv("");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao criar cobrança."),
  });

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md border-border bg-card">
        <DialogHeader>
          <DialogTitle>Nova cobrança — {typeLabel[billingType]}</DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            Registre uma nova cobrança. O n8n sincronizará com o Asaas automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid gap-1.5">
            <Label>Descrição <span className="text-destructive">*</span></Label>
            <Input value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Ex: Mensalidade janeiro" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Valor (R$) <span className="text-destructive">*</span></Label>
              <Input value={value} onChange={e => setValue(e.target.value)}
                placeholder="0,00" inputMode="decimal" />
            </div>
            <div className="grid gap-1.5">
              <Label>Vencimento <span className="text-destructive">*</span></Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="[color-scheme:dark]" />
            </div>
          </div>

          {isCard && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dados do Cartão</p>
              <div className="grid gap-1.5">
                <Label className="text-xs">Número do cartão</Label>
                <Input value={cardNumber} onChange={e => setCardNumber(e.target.value.replace(/\D/g, "").slice(0, 16))}
                  placeholder="0000 0000 0000 0000" inputMode="numeric" className="font-mono" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Nome no cartão</Label>
                <Input value={cardName} onChange={e => setCardName(e.target.value.toUpperCase())}
                  placeholder="NOME SOBRENOME" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Validade</Label>
                  <Input value={cardExpiry} onChange={e => setCardExpiry(e.target.value)}
                    placeholder="MM/AA" maxLength={5} />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">CVV</Label>
                  <Input value={cardCvv} onChange={e => setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="000" inputMode="numeric" className="font-mono" />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Os dados são processados pelo Asaas via n8n. Nunca armazenamos o número completo do cartão.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>Cancelar</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="bg-gradient-ember text-primary-foreground"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Registrar cobrança
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ConfigPagamentosPage() {
  const dc = useDynamicClient();
  const { auth } = useClientAuth();
  const qc = useQueryClient();

  const [newChargeType, setNewChargeType] = useState<BillingType | null>(null);

  if (!dc) return <CredentialsErrorState />;

  const isOwner = ["owner", "admin"].includes(auth?.user?.role ?? "");
  const modules = auth?.modules_config;

  // Acesso gratuito — dashboard incluído em outro contrato (ex: assessoria)
  const isFreeAccess = modules?.c8_free_access === true || modules?.c8_included === true;
  const freeAccessUntil  = modules?.free_access_until  ?? null;
  const freeAccessReason = modules?.free_access_reason ?? null;

  // Métodos habilitados pelo C8 Control (flags do ai_settings no Banco B)
  const { data: settings } = useQuery({
    queryKey: ["payment_settings_flags"],
    queryFn: async () => {
      const { data } = await dc
        .from("ai_settings")
        .select("pix_enabled, boleto_enabled, credit_card_enabled, asaas_api_key_set")
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!dc,
    staleTime: 60_000,
  });

  const pixEnabled    = settings?.pix_enabled         ?? true;
  const boletoEnabled = settings?.boleto_enabled       ?? true;
  const cardEnabled   = settings?.credit_card_enabled  ?? false;

  // Cobranças
  const { data: charges = [], isLoading } = useQuery({
    queryKey: ["client_charges"],
    queryFn: async () => {
      const { data, error } = await dc
        .from("client_charges")
        .select("*")
        .order("due_date", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Charge[];
    },
    enabled: !!dc,
    staleTime: 30_000,
  });

  const paid    = charges.filter(c => PAID_STATUSES.includes(c.status));
  const open    = charges.filter(c => OPEN_STATUSES.includes(c.status));
  const overdue = open.filter(c => isPast(parseISO(c.due_date)));

  const totalPaid    = paid.reduce((s, c)    => s + c.value, 0);
  const totalOpen    = open.reduce((s, c)    => s + c.value, 0);
  const totalOverdue = overdue.reduce((s, c) => s + c.value, 0);

  const paymentMethods: { type: BillingType; label: string; icon: React.ReactNode; enabled: boolean }[] = [
    { type: "PIX"         as BillingType, label: "Gerar PIX",    icon: <QrCode      className="h-5 w-5 text-emerald-400" />, enabled: pixEnabled },
    { type: "BOLETO"      as BillingType, label: "Gerar Boleto", icon: <FileText    className="h-5 w-5 text-yellow-400"  />, enabled: boletoEnabled },
    { type: "CREDIT_CARD" as BillingType, label: "Cartão",       icon: <CreditCard  className="h-5 w-5 text-blue-400"   />, enabled: cardEnabled },
  ].filter(m => m.enabled);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Pagamentos"
        description="Acompanhe seus pagamentos e gere novas cobranças."
      />

      {/* ── Banner: acesso gratuito ── */}
      {isFreeAccess && (
        <div className="flex items-start gap-3 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-4">
          <Gift className="h-5 w-5 text-violet-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-violet-300">
              Acesso gratuito ao C8 Control
            </p>
            <p className="text-xs text-violet-400/80">
              {freeAccessReason
                ? freeAccessReason
                : "Este dashboard está incluído no seu contrato, sem cobrança separada."}
              {freeAccessUntil && (
                <> Válido até <strong>{new Date(freeAccessUntil).toLocaleDateString("pt-BR")}</strong>.</>
              )}
            </p>
          </div>
        </div>
      )}

      {/* ── Resumo financeiro ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: "Total pago",
            value: fmtCurrency(totalPaid),
            icon: <CheckCircle2 className="h-5 w-5 text-emerald-400" />,
            className: "border-emerald-500/20",
          },
          {
            label: "Em aberto",
            value: fmtCurrency(totalOpen - totalOverdue),
            icon: <Clock className="h-5 w-5 text-yellow-400" />,
            className: "border-yellow-500/20",
          },
          {
            label: "Vencido",
            value: fmtCurrency(totalOverdue),
            icon: <AlertCircle className="h-5 w-5 text-red-400" />,
            className: totalOverdue > 0 ? "border-red-500/20" : "border-border",
          },
        ].map(card => (
          <Card key={card.label} className={cn("card-surface", card.className)}>
            <CardContent className="flex items-center gap-3 pt-5">
              <div className="shrink-0">{card.icon}</div>
              <div>
                <p className="text-xs text-muted-foreground">{card.label}</p>
                <p className="text-xl font-bold text-foreground">{card.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Ações de pagamento (só para owner/admin) ── */}
      {isOwner && paymentMethods.length > 0 && (
        <Card className="card-surface">
          <CardHeader>
            <CardTitle className="text-base">Nova cobrança</CardTitle>
            <CardDescription>Escolha o método de pagamento para registrar uma nova cobrança.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {paymentMethods.map(m => (
                <Button
                  key={m.type}
                  variant="outline"
                  className="border-border gap-2"
                  onClick={() => setNewChargeType(m.type)}
                >
                  {m.icon}
                  {m.label}
                  <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Lista de cobranças ── */}
      <Card className="card-surface">
        <CardHeader>
          <CardTitle className="text-base">Cobranças</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : charges.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma cobrança encontrada.</p>
          ) : (
            <Tabs defaultValue="abertas">
              <TabsList className="mb-4">
                <TabsTrigger value="abertas">
                  Em aberto
                  {open.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-yellow-500/20 text-yellow-400 text-[10px] font-bold px-1.5">
                      {open.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="pagas">
                  Pagas
                  {paid.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-1.5">
                      {paid.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="todas">Todas</TabsTrigger>
              </TabsList>

              <TabsContent value="abertas" className="space-y-2 mt-0">
                {open.length === 0
                  ? <p className="text-sm text-muted-foreground text-center py-6">Nenhuma cobrança em aberto.</p>
                  : open.map(c => <ChargeRow key={c.id} charge={c} />)
                }
              </TabsContent>

              <TabsContent value="pagas" className="space-y-2 mt-0">
                {paid.length === 0
                  ? <p className="text-sm text-muted-foreground text-center py-6">Nenhum pagamento registrado ainda.</p>
                  : paid.map(c => <ChargeRow key={c.id} charge={c} />)
                }
              </TabsContent>

              <TabsContent value="todas" className="space-y-2 mt-0">
                {charges.map(c => <ChargeRow key={c.id} charge={c} />)}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* ── Dialog nova cobrança ── */}
      {newChargeType && (
        <NewChargeDialog
          open={!!newChargeType}
          onClose={() => setNewChargeType(null)}
          billingType={newChargeType}
          dc={dc}
          clientId={auth?.id ?? ""}
          onCreated={() => qc.invalidateQueries({ queryKey: ["client_charges"] })}
        />
      )}
    </div>
  );
}
