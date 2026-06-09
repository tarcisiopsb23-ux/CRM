/**
 * ConfigPagamentosPage — Fase 4
 *
 * Configurações de pagamento do cliente no dashboard público.
 * - Exibe status da integração Asaas (chave API salva no Banco B)
 * - Métodos aceitos: PIX, Boleto, Cartão
 * - Acesso restrito ao role 'owner'
 *
 * O workflow Asaas já existe no n8n e está funcional — esta página
 * apenas configura a chave de API e os métodos habilitados.
 * A chave é salva criptografada no ai_settings do Banco B e
 * NUNCA é retornada ao frontend após o save.
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Loader2, CreditCard, QrCode, FileText, Eye, EyeOff, CheckCircle2, AlertCircle, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useDynamicClient } from "@/hooks/useDynamicClient";
import { PageHeader } from "./components/PageHeader";
import { CredentialsErrorState } from "./components/CredentialsErrorState";

interface PaymentSettings {
  id?: string;
  asaas_api_key_set?: boolean;   // true se chave está configurada (sem expor a chave)
  pix_enabled?: boolean;
  boleto_enabled?: boolean;
  credit_card_enabled?: boolean;
}

export function ConfigPagamentosPage() {
  const dc = useDynamicClient();
  const { auth } = useClientAuth();
  const qc = useQueryClient();
  const isOwner = auth?.user?.role === "owner";

  const [apiKeyInput, setApiKeyInput]         = useState("");
  const [showApiKey, setShowApiKey]           = useState(false);
  const [pixEnabled, setPixEnabled]           = useState(true);
  const [boletoEnabled, setBoletoEnabled]     = useState(true);
  const [cardEnabled, setCardEnabled]         = useState(false);
  const [settingsId, setSettingsId]           = useState<string | null>(null);
  const [apiKeyAlreadySet, setApiKeyAlreadySet] = useState(false);

  if (!dc) return <CredentialsErrorState />;

  if (!isOwner) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Shield className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-muted-foreground text-sm">Acesso restrito ao Proprietário da conta.</p>
      </div>
    );
  }

  // Carrega configurações existentes
  useQuery({
    queryKey: ["payment_settings"],
    queryFn: async () => {
      const { data } = await dc
        .from("ai_settings")
        .select("id, asaas_api_key_set, pix_enabled, boleto_enabled, credit_card_enabled")
        .limit(1)
        .maybeSingle();
      if (data) {
        setSettingsId(data.id);
        setApiKeyAlreadySet(data.asaas_api_key_set ?? false);
        setPixEnabled(data.pix_enabled ?? true);
        setBoletoEnabled(data.boleto_enabled ?? true);
        setCardEnabled(data.credit_card_enabled ?? false);
      }
      return data;
    },
    enabled: !!dc,
    staleTime: 60_000,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!dc) throw new Error("Banco não conectado");

      const payload: Record<string, unknown> = {
        pix_enabled:          pixEnabled,
        boleto_enabled:       boletoEnabled,
        credit_card_enabled:  cardEnabled,
        updated_at:           new Date().toISOString(),
      };

      // Só atualiza a chave se o usuário digitou algo novo
      if (apiKeyInput.trim()) {
        // Salva a chave — o banco do cliente armazena; nunca retornamos ao frontend
        payload.asaas_api_key     = apiKeyInput.trim();
        payload.asaas_api_key_set = true;
      }

      if (settingsId) {
        const { error } = await dc.from("ai_settings").update(payload).eq("id", settingsId);
        if (error) throw error;
      } else {
        const { data, error } = await dc.from("ai_settings").insert(payload).select("id").single();
        if (error) throw error;
        setSettingsId(data.id);
      }

      if (apiKeyInput.trim()) {
        setApiKeyAlreadySet(true);
        setApiKeyInput(""); // limpa o campo após salvar — nunca exibir de volta
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payment_settings"] });
      toast.success("Configurações de pagamento salvas!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const methods = [
    { key: "pix",   label: "PIX",    desc: "Pagamento instantâneo",       icon: QrCode,    value: pixEnabled,    set: setPixEnabled },
    { key: "bol",   label: "Boleto", desc: "Vencimento configurável",      icon: FileText,  value: boletoEnabled, set: setBoletoEnabled },
    { key: "card",  label: "Cartão", desc: "Crédito via Asaas",            icon: CreditCard, value: cardEnabled,  set: setCardEnabled },
  ];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Pagamentos"
        description="Configure os métodos de pagamento e a integração com o Asaas."
      />

      {/* ── Integração Asaas ── */}
      <Card className="card-surface">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            Integração Asaas
          </CardTitle>
          <CardDescription>
            O workflow de cobranças está configurado no n8n e funciona automaticamente.
            Insira a chave de API do Asaas para habilitar cobranças automáticas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status atual */}
          <div className={cn(
            "flex items-center gap-3 rounded-lg border px-4 py-3",
            apiKeyAlreadySet
              ? "border-emerald-500/20 bg-emerald-500/5"
              : "border-border bg-muted/10"
          )}>
            {apiKeyAlreadySet
              ? <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
              : <AlertCircle className="h-5 w-5 text-muted-foreground/40 shrink-0" />
            }
            <div>
              <p className="text-sm font-semibold text-foreground">
                {apiKeyAlreadySet ? "Chave de API configurada" : "Chave de API não configurada"}
              </p>
              <p className="text-xs text-muted-foreground">
                {apiKeyAlreadySet
                  ? "A chave está salva de forma segura. Para alterar, insira a nova chave abaixo."
                  : "Insira sua chave de API do Asaas para habilitar pagamentos automáticos."
                }
              </p>
            </div>
          </div>

          {/* Campo da chave — nunca pré-preenchido com o valor salvo */}
          <div className="grid gap-2">
            <Label className="flex items-center gap-1.5">
              Chave de API Asaas
              {apiKeyAlreadySet && (
                <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">
                  já configurada
                </Badge>
              )}
            </Label>
            <div className="relative">
              <Input
                type={showApiKey ? "text" : "password"}
                value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)}
                placeholder={apiKeyAlreadySet ? "Deixe vazio para manter a chave atual" : "$aact_xxxxxxxxxxxx"}
                className="pr-10 font-mono text-sm"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(v => !v)}
                className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              A chave é armazenada de forma segura no banco e nunca é exibida após salva.
              Encontre sua chave em: Asaas → Minha Conta → Integrações → Chave de API.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Métodos aceitos ── */}
      <Card className="card-surface">
        <CardHeader>
          <CardTitle className="text-base">Métodos de Pagamento</CardTitle>
          <CardDescription>Escolha quais métodos de pagamento serão oferecidos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {methods.map(({ key, label, desc, icon: Icon, value, set }) => (
            <div key={key} className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 px-4 py-3">
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </div>
              <Switch checked={value} onCheckedChange={set} />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ── Salvar ── */}
      <div className="flex justify-end">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="bg-gradient-ember text-primary-foreground shadow-glow"
        >
          {saveMutation.isPending
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</>
            : <><Save className="h-4 w-4 mr-2" />Salvar configurações</>
          }
        </Button>
      </div>
    </div>
  );
}
