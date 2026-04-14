import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePayments, usePaymentCards } from "@/hooks/usePayments";
import { supabaseAuth } from "@/lib/supabase-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, CreditCard, Loader2, ExternalLink, CheckCircle2, Clock, XCircle, AlertTriangle, RefreshCw, Plus, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

const PAYMENT_CARD_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/payment-card`;

const STATUS_CONFIG = {
  pago:         { label: "Pago",         icon: CheckCircle2, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  pendente:     { label: "Pendente",     icon: Clock,        color: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  vencido:      { label: "Vencido",      icon: AlertTriangle,color: "text-red-400 bg-red-500/10 border-red-500/30" },
  cancelado:    { label: "Cancelado",    icon: XCircle,      color: "text-slate-400 bg-slate-500/10 border-slate-500/30" },
  estornado:    { label: "Estornado",    icon: RefreshCw,    color: "text-orange-400 bg-orange-500/10 border-orange-500/30" },
  processando:  { label: "Processando",  icon: Loader2,      color: "text-blue-400 bg-blue-500/10 border-blue-500/30" },
};

const METHOD_LABEL: Record<string, string> = {
  boleto: "Boleto", pix: "PIX", credit_card: "Cartão de Crédito",
  debit_card: "Cartão de Débito", manual: "Manual",
};

const BRAND_ICON: Record<string, string> = {
  visa: "💳", mastercard: "💳", elo: "💳", amex: "💳", hipercard: "💳",
};

// Detecta bandeira pelos primeiros dígitos
function detectBrand(num: string): { name: string; icon: string } | null {
  const n = num.replace(/\s/g, "");
  if (/^4/.test(n))                          return { name: "Visa",       icon: "🟦" };
  if (/^5[1-5]/.test(n) || /^2[2-7]/.test(n)) return { name: "Mastercard", icon: "🔴" };
  if (/^3[47]/.test(n))                      return { name: "Amex",       icon: "🟩" };
  if (/^(636368|438935|504175|451416|636297|5067|4576|4011)/.test(n)) return { name: "Elo", icon: "🟡" };
  if (/^(606282|3841)/.test(n))              return { name: "Hipercard",  icon: "🟥" };
  if (n.length >= 1)                         return { name: "",           icon: "💳" };
  return null;
}

// Formata número do cartão com espaços a cada 4 dígitos
function formatCardNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 16);
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

export function PaymentsPage() {
  const navigate = useNavigate();
  const { tenantId, isSupport, loading: authLoading } = useAuth();
  const effectiveTenantId = isSupport
    ? (sessionStorage.getItem("support_selected_tenant_id") ?? tenantId ?? undefined)
    : (tenantId ?? undefined);

  const { data: payments = [], isLoading } = usePayments(effectiveTenantId);
  const { data: cards = [], isLoading: cardsLoading } = usePaymentCards(effectiveTenantId);
  const qc = useQueryClient();

  const [showAddCard, setShowAddCard] = useState(false);
  const [cardForm, setCardForm] = useState({
    gateway: "asaas", card_number: "", holder_name: "",
    exp_month: "", exp_year: "", cvv: "", set_default: true,
  });
  const [savingCard, setSavingCard] = useState(false);
  const [deletingCard, setDeletingCard] = useState<string | null>(null);

  const fmtBRL = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const totalPendente = payments.filter(p => p.status === "pendente" || p.status === "vencido")
    .reduce((a, p) => a + p.amount, 0);
  const totalPago = payments.filter(p => p.status === "pago")
    .reduce((a, p) => a + p.amount, 0);

  const handleSaveCard = async () => {
    if (!cardForm.card_number || !cardForm.holder_name || !cardForm.exp_month || !cardForm.exp_year || !cardForm.cvv) {
      toast.error("Preencha todos os campos do cartão.");
      return;
    }
    setSavingCard(true);
    try {
      const { data: { session } } = await supabaseAuth.auth.getSession();
      if (!session) { toast.error("Sessão expirada."); return; }
      const res = await fetch(PAYMENT_CARD_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
          "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ action: "save", ...cardForm }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { toast.error(data.error ?? "Erro ao salvar cartão."); return; }
      toast.success("Cartão salvo com sucesso!");
      setShowAddCard(false);
      setCardForm({ gateway: "asaas", card_number: "", holder_name: "", exp_month: "", exp_year: "", cvv: "", set_default: true });
      qc.invalidateQueries({ queryKey: ["payment_cards"] });
    } catch { toast.error("Erro ao salvar cartão."); }
    finally { setSavingCard(false); }
  };

  const handleDeleteCard = async (cardId: string) => {
    if (!confirm("Remover este cartão?")) return;
    setDeletingCard(cardId);
    try {
      const { data: { session } } = await supabaseAuth.auth.getSession();
      if (!session) return;
      await fetch(PAYMENT_CARD_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}`, "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({ action: "delete", card_id: cardId }),
      });
      toast.success("Cartão removido.");
      qc.invalidateQueries({ queryKey: ["payment_cards"] });
    } finally { setDeletingCard(null); }
  };

  if (authLoading) return (
    <div className="flex items-center justify-center min-h-screen bg-[#0F172A]">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#7C3AED] border-t-transparent" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white hover:bg-slate-800"
            onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-2">
              <CreditCard className="h-6 w-6 text-[#7C3AED]" /> Faturas e Pagamentos
            </h1>
            <p className="text-slate-400 text-sm">Histórico de cobranças e métodos de pagamento.</p>
          </div>
        </div>

        {/* Resumo */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-[#1E293B] border border-slate-800 rounded-xl p-5">
            <p className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-1">Em aberto</p>
            <p className="text-2xl font-black text-amber-400">{fmtBRL(totalPendente)}</p>
          </div>
          <div className="bg-[#1E293B] border border-slate-800 rounded-xl p-5">
            <p className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-1">Total pago</p>
            <p className="text-2xl font-black text-emerald-400">{fmtBRL(totalPago)}</p>
          </div>
        </div>

        {/* Cartões salvos */}
        <Card className="bg-[#1E293B] border-slate-800 shadow-2xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-white flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-[#7C3AED]" /> Cartões para Cobrança Recorrente
              </CardTitle>
              <CardDescription className="text-slate-400 text-xs">
                Cartões salvos para débito automático de mensalidades.
              </CardDescription>
            </div>
            <Button size="sm" className="bg-[#7C3AED] hover:bg-[#7C3AED]/90 gap-2"
              onClick={() => setShowAddCard(v => !v)}>
              <Plus className="h-4 w-4" /> Adicionar Cartão
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {showAddCard && (
              <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-5 space-y-4">
                <p className="text-sm font-bold text-white">Novo Cartão</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1">
                    <Label className="text-slate-300 text-xs">Número do Cartão</Label>
                    <div className="relative">
                      <Input placeholder="0000 0000 0000 0000" maxLength={19}
                        className="bg-slate-800 border-slate-700 text-white font-mono pr-12"
                        value={formatCardNumber(cardForm.card_number)}
                        onChange={e => {
                          const raw = e.target.value.replace(/\D/g, "").slice(0, 16);
                          setCardForm(f => ({ ...f, card_number: raw }));
                        }} />
                      {(() => {
                        const brand = detectBrand(cardForm.card_number);
                        return brand ? (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            <span className="text-lg leading-none">{brand.icon}</span>
                            {brand.name && <span className="text-[10px] font-bold text-slate-400">{brand.name}</span>}
                          </div>
                        ) : null;
                      })()}
                    </div>
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-slate-300 text-xs">Nome no Cartão</Label>
                    <Input placeholder="NOME SOBRENOME" className="bg-slate-800 border-slate-700 text-white uppercase"
                      value={cardForm.holder_name}
                      onChange={e => setCardForm(f => ({ ...f, holder_name: e.target.value.toUpperCase() }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-slate-300 text-xs">Validade (MM/AA)</Label>
                    <Input placeholder="12/28" maxLength={5} className="bg-slate-800 border-slate-700 text-white font-mono"
                      value={cardForm.exp_month && cardForm.exp_year ? `${cardForm.exp_month}/${cardForm.exp_year.slice(-2)}` : ""}
                      onChange={e => {
                        const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                        setCardForm(f => ({ ...f, exp_month: v.slice(0, 2), exp_year: v.length >= 3 ? "20" + v.slice(2) : "" }));
                      }} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-slate-300 text-xs">CVV</Label>
                    <Input placeholder="123" maxLength={4} type="password" className="bg-slate-800 border-slate-700 text-white font-mono"
                      value={cardForm.cvv}
                      onChange={e => setCardForm(f => ({ ...f, cvv: e.target.value.replace(/\D/g, "").slice(0, 4) }))} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="set_default" checked={cardForm.set_default}
                    onChange={e => setCardForm(f => ({ ...f, set_default: e.target.checked }))}
                    className="rounded border-slate-600" />
                  <label htmlFor="set_default" className="text-slate-300 text-sm">Definir como cartão padrão</label>
                </div>
                <p className="text-[10px] text-slate-500">🔒 Seus dados são criptografados e protegidos. Nunca compartilhamos as informações do seu cartão.</p>
                <div className="flex gap-3">
                  <Button variant="ghost" onClick={() => setShowAddCard(false)} className="text-slate-400">Cancelar</Button>
                  <Button onClick={handleSaveCard} disabled={savingCard} className="bg-[#7C3AED] hover:bg-[#7C3AED]/90 flex-1">
                    {savingCard ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Salvar Cartão
                  </Button>
                </div>
              </div>
            )}

            {cardsLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-[#7C3AED]" /></div>
            ) : cards.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-4 italic">Nenhum cartão salvo.</p>
            ) : (
              <div className="space-y-2">
                {cards.map(card => (
                  <div key={card.id} className="flex items-center justify-between rounded-lg bg-slate-900/50 border border-slate-700 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{detectBrand(card.last4 ?? "")?.icon ?? BRAND_ICON[card.brand] ?? "💳"}</span>
                      <div>
                        <p className="text-white font-bold text-sm capitalize">{card.brand} •••• {card.last4}</p>
                        <p className="text-slate-500 text-xs">{card.holder_name} · {card.exp_month}/{card.exp_year}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {card.is_default && <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded">Padrão</span>}
                      <button onClick={() => handleDeleteCard(card.id)} disabled={deletingCard === card.id}
                        className="text-slate-500 hover:text-red-400 transition-colors p-1">
                        {deletingCard === card.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Lista de faturas */}
        <Card className="bg-[#1E293B] border-slate-800 shadow-2xl">
          <CardHeader>
            <CardTitle className="text-white">Histórico de Faturas</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-[#7C3AED]" /></div>
            ) : payments.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-sm italic">Nenhuma fatura encontrada.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-slate-500 text-[10px] uppercase font-black tracking-widest border-b border-slate-800">
                      <th className="pb-3 px-2">Descrição</th>
                      <th className="pb-3 px-2">Vencimento</th>
                      <th className="pb-3 px-2">Valor</th>
                      <th className="pb-3 px-2">Método</th>
                      <th className="pb-3 px-2">Status</th>
                      <th className="pb-3 px-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {payments.map(p => {
                      const cfg = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.pendente;
                      const Icon = cfg.icon;
                      return (
                        <tr key={p.id} className="hover:bg-slate-800/30 transition-colors text-sm">
                          <td className="py-4 px-2">
                            <p className="text-slate-200 font-medium">{p.description}</p>
                            {p.is_recurring && <span className="text-[10px] text-violet-400 font-bold">↻ Recorrente</span>}
                          </td>
                          <td className="py-4 px-2 text-slate-400 text-xs whitespace-nowrap">
                            {p.due_date ? format(parseISO(p.due_date), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                          </td>
                          <td className="py-4 px-2 font-bold text-white whitespace-nowrap">
                            {fmtBRL(p.amount)}
                            {p.installments > 1 && <span className="text-slate-500 text-xs ml-1">/{p.installments}x</span>}
                          </td>
                          <td className="py-4 px-2 text-slate-400 text-xs">
                            {METHOD_LABEL[p.payment_method ?? ""] ?? p.payment_method ?? "—"}
                          </td>
                          <td className="py-4 px-2">
                            <span className={cn("flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded border w-fit", cfg.color)}>
                              <Icon className="h-3 w-3" /> {cfg.label}
                            </span>
                          </td>
                          <td className="py-4 px-2">
                            {p.gateway_url && (
                              <a href={p.gateway_url} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1 text-[#7C3AED] hover:text-[#7C3AED]/80 text-xs font-bold transition-colors">
                                Pagar <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-slate-600 text-xs text-center">
          Faturas sincronizadas do sistema financeiro. Para contestações, entre em contato com a agência.
        </p>
      </div>
    </div>
  );
}
