/**
 * MetaManualConnectModal
 *
 * Modal de 4 etapas para configuração manual de uma conexão Meta.
 * Etapa 1 — Tipo de integração
 * Etapa 2 — Access Token (nunca exibido após salvo)
 * Etapa 3 — Identificadores de ativos
 * Etapa 4 — Teste + Salvar
 *
 * SEGURANÇA:
 * - O access_token NUNCA é salvo em estado local após o modal fechar.
 * - Não é armazenado em localStorage nem sessionStorage.
 * - É enviado diretamente para a Edge Function via HTTPS.
 * - Após salvo, apenas o token_preview (mascarado) é exibido.
 */

import { useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle, CheckCircle2, XCircle, Loader2, Eye, EyeOff,
  ChevronRight, ChevronLeft, ShieldAlert, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useMetaConnections,
  type MetaProvider,
  type ConnectionEnvironment,
  type ValidationResult,
} from "@/hooks/useMetaConnections";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Se informado, abre o modal já com uma conexão para editar os IDs */
  editConnectionId?: string;
  /** Quando usado fora do contexto do hook useOrganization (ex: modal de tenant) */
  organizationId?: string;
}

type ProviderChoice = MetaProvider | "facebook_instagram";

const PROVIDER_OPTIONS: { value: ProviderChoice; label: string; description: string }[] = [
  { value: "facebook",           label: "Facebook",                 description: "Facebook Page — comentários, mensagens, anúncios" },
  { value: "instagram",          label: "Instagram",                description: "Instagram Business Account — mensagens, insights" },
  { value: "whatsapp",           label: "WhatsApp Business",        description: "WABA + Phone Number ID — mensagens, templates" },
  { value: "facebook_instagram", label: "Facebook + Instagram",     description: "Página vinculada ao Instagram Business" },
  { value: "meta_multi",         label: "Meta completo",            description: "Facebook + Instagram + WhatsApp + Ads" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function needsFacebook(p: ProviderChoice) {
  return ["facebook", "facebook_instagram", "meta_multi"].includes(p);
}
function needsInstagram(p: ProviderChoice) {
  return ["instagram", "facebook_instagram", "meta_multi"].includes(p);
}
function needsWhatsApp(p: ProviderChoice) {
  return ["whatsapp", "meta_multi"].includes(p);
}
function toMetaProvider(p: ProviderChoice): MetaProvider {
  return p === "facebook_instagram" ? "meta_multi" : p;
}

// ── Componente de resultado de validação ──────────────────────────────────────

function ValidationRow({
  label, result,
}: {
  label: string;
  result?: { accessible: boolean; name?: string; username?: string; display_number?: string; error?: string } | null;
}) {
  if (!result) return null;
  return (
    <div className="flex items-start gap-2 py-1">
      {result.accessible
        ? <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
        : <XCircle     className="h-4 w-4 text-red-400    shrink-0 mt-0.5" />}
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {result.accessible && (result.name || result.username || result.display_number) && (
          <p className="text-xs text-muted-foreground">
            {result.name ?? result.username ?? result.display_number}
          </p>
        )}
        {!result.accessible && result.error && (
          <p className="text-xs text-red-400">{result.error}</p>
        )}
      </div>
    </div>
  );
}

// ── Modal Principal ───────────────────────────────────────────────────────────

export function MetaManualConnectModal({ open, onOpenChange, editConnectionId, organizationId: externalOrgId }: Props) {
  const { validate, create, checkDuplicate } = useMetaConnections(externalOrgId);

  // Etapa
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Etapa 1 — Provider
  const [provider,    setProvider]    = useState<ProviderChoice>("facebook");
  const [environment, setEnvironment] = useState<ConnectionEnvironment>("production");
  const [displayName, setDisplayName] = useState("");

  // Etapa 2 — Token (mantido em memória apenas durante o fluxo)
  const [accessToken,   setAccessToken]   = useState("");
  const [showToken,     setShowToken]     = useState(false);

  // Etapa 3 — IDs de ativos
  const [metaUserId,          setMetaUserId]          = useState("");
  const [businessId,          setBusinessId]          = useState("");
  const [facebookPageId,      setFacebookPageId]      = useState("");
  const [facebookPageName,    setFacebookPageName]    = useState("");
  const [instagramAccountId,  setInstagramAccountId]  = useState("");
  const [instagramUsername,   setInstagramUsername]   = useState("");
  const [wabaId,              setWabaId]              = useState("");
  const [phoneNumberId,       setPhoneNumberId]       = useState("");
  const [displayPhoneNumber,  setDisplayPhoneNumber]  = useState("");
  const [adAccountId,         setAdAccountId]         = useState("");
  const [catalogId,           setCatalogId]           = useState("");

  // Etapa 4 — Validação e estado de duplicidade
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isValidating,     setIsValidating]     = useState(false);
  const [isSaving,         setIsSaving]         = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<unknown[] | null>(null);

  // ── Reset ────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setStep(1);
    setProvider("facebook");
    setEnvironment("production");
    setDisplayName("");
    setAccessToken("");
    setShowToken(false);
    setMetaUserId("");
    setBusinessId("");
    setFacebookPageId("");
    setFacebookPageName("");
    setInstagramAccountId("");
    setInstagramUsername("");
    setWabaId("");
    setPhoneNumberId("");
    setDisplayPhoneNumber("");
    setAdAccountId("");
    setCatalogId("");
    setValidationResult(null);
    setIsValidating(false);
    setIsSaving(false);
    setDuplicateWarning(null);
  }, []);

  const handleClose = () => {
    // Limpa o token da memória ao fechar
    setAccessToken("");
    onOpenChange(false);
    // Aguarda animação para resetar
    setTimeout(reset, 300);
  };

  // ── Etapa 1 → 2 ─────────────────────────────────────────────────────────
  const goToStep2 = () => setStep(2);

  // ── Etapa 2 → 3 ─────────────────────────────────────────────────────────
  const goToStep3 = () => {
    if (!accessToken.trim()) {
      toast.error("Informe o access token antes de continuar.");
      return;
    }
    setShowToken(false); // oculta o token ao avançar
    setStep(3);
  };

  // ── Etapa 3 → 4 (Testar conexão) ─────────────────────────────────────────
  const handleValidate = async () => {
    setIsValidating(true);
    setValidationResult(null);
    setDuplicateWarning(null);

    try {
      // Checa duplicidade antes de validar
      const dups = await checkDuplicate({
        facebook_page_id:         facebookPageId || undefined,
        instagram_account_id:     instagramAccountId || undefined,
        whatsapp_phone_number_id: phoneNumberId || undefined,
        waba_id:                  wabaId || undefined,
      });
      if (dups.length > 0 && !editConnectionId) {
        setDuplicateWarning(dups);
      }

      const result = await validate.mutateAsync({
        access_token:          accessToken,
        provider:              toMetaProvider(provider),
        facebook_page_id:      facebookPageId      || undefined,
        instagram_account_id:  instagramAccountId  || undefined,
        waba_id:               wabaId              || undefined,
        phone_number_id:       phoneNumberId       || undefined,
        business_id:           businessId          || undefined,
        ad_account_id:         adAccountId         || undefined,
      });
      setValidationResult(result);
      setStep(4);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao validar";
      toast.error(msg);
    } finally {
      setIsValidating(false);
    }
  };

  // ── Salvar ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!validationResult?.token.valid) {
      toast.error("O token precisa ser válido antes de salvar.");
      return;
    }

    setIsSaving(true);
    try {
      await create.mutateAsync({
        provider:                     toMetaProvider(provider),
        connection_environment:       environment,
        display_name:                 displayName || undefined,
        access_token:                 accessToken,
        meta_user_id:                 metaUserId          || undefined,
        business_id:                  businessId          || undefined,
        facebook_page_id:             facebookPageId      || undefined,
        facebook_page_name:           facebookPageName    || (validationResult.facebook_page?.name) || undefined,
        instagram_account_id:         instagramAccountId  || undefined,
        instagram_username:           instagramUsername   || (validationResult.instagram?.username) || undefined,
        waba_id:                      wabaId              || undefined,
        whatsapp_phone_number_id:     phoneNumberId       || undefined,
        whatsapp_display_phone_number: displayPhoneNumber || (validationResult.whatsapp_phone?.display_number) || undefined,
        ad_account_id:                adAccountId         || undefined,
        catalog_id:                   catalogId           || undefined,
        token_expires_at:             validationResult.token.expires_at || undefined,
        force_update_existing_id:     editConnectionId    || undefined,
      });

      toast.success("Conexão Meta salva com sucesso!");
      handleClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao salvar";
      if (msg === "duplicate_asset") {
        toast.error("Este ativo já está conectado. Atualize a conexão existente.");
      } else {
        toast.error(msg);
      }
    } finally {
      setIsSaving(false);
    }
  };

  // ── Renderização por etapa ────────────────────────────────────────────────

  const stepTitles = [
    "Tipo de integração",
    "Access Token",
    "Identificadores",
    "Teste e confirmação",
  ];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>Configuração manual da Meta</span>
            <Badge variant="outline" className="text-[10px]">Admin</Badge>
          </DialogTitle>
          <DialogDescription asChild>
            <div className="text-xs text-amber-500/80 flex items-start gap-1.5 mt-1 bg-amber-500/10 border border-amber-500/20 rounded p-2">
              <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                Uso administrativo. Esta opção conecta ativos Meta usando credenciais configuradas manualmente.
                Para clientes finais, prefira a conexão automática.
              </span>
            </div>
          </DialogDescription>
        </DialogHeader>

        {/* Progress steps */}
        <div className="flex items-center gap-1 my-2">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center gap-1 flex-1">
              <div className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                step >= s ? "bg-primary" : "bg-muted"
              )} />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground -mt-1 mb-3">
          Etapa {step} de 4 — {stepTitles[step - 1]}
        </p>

        {/* ── Etapa 1: Tipo ───────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Qual integração deseja configurar?</Label>
              <div className="space-y-2">
                {PROVIDER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setProvider(opt.value)}
                    className={cn(
                      "w-full text-left p-3 rounded-lg border transition-all",
                      provider === opt.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40 hover:bg-muted/30"
                    )}
                  >
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="env">Ambiente</Label>
              <Select value={environment} onValueChange={(v) => setEnvironment(v as ConnectionEnvironment)}>
                <SelectTrigger id="env">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="production">Produção</SelectItem>
                  <SelectItem value="development">Desenvolvimento</SelectItem>
                  <SelectItem value="review">App Review</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="display_name">
                Nome de exibição
                <span className="ml-1 text-[10px] text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="display_name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ex: Empresa X — Produção"
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={goToStep2}>
                Próximo <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Etapa 2: Token ──────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 space-y-1">
              <p className="text-xs font-semibold text-blue-400 flex items-center gap-1">
                <Info className="h-3.5 w-3.5" /> Segurança do token
              </p>
              <ul className="text-[10px] text-muted-foreground space-y-0.5 pl-4 list-disc">
                <li>O token é enviado diretamente ao servidor via HTTPS</li>
                <li>É criptografado com AES-GCM antes de ser armazenado</li>
                <li>Nunca aparece em logs, respostas da API ou rastreamento de erros</li>
                <li>Após salvo, apenas os primeiros e últimos caracteres são exibidos</li>
              </ul>
            </div>

            <div className="space-y-2">
              <Label htmlFor="access_token">Meta Access Token</Label>
              <div className="relative">
                <Input
                  id="access_token"
                  type={showToken ? "text" : "password"}
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="EAAGm0PX..."
                  className="font-mono text-sm pr-10"
                  autoComplete="off"
                  // Impede que o browser salve este campo
                  data-lpignore="true"
                  data-form-type="other"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  title={showToken ? "Ocultar token" : "Mostrar token temporariamente"}
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Use um User Access Token, Page Access Token ou System User Token com as permissões necessárias para os ativos que deseja conectar.
              </p>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <Button onClick={goToStep3} disabled={!accessToken.trim()}>
                Próximo <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Etapa 3: IDs ───────────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            {/* Facebook */}
            {needsFacebook(provider) && (
              <div className="space-y-3 p-3 rounded-lg border border-border">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Facebook</p>
                <div className="space-y-2">
                  <Label htmlFor="fb_page_id">Facebook Page ID <span className="text-muted-foreground font-normal">(obrigatório)</span></Label>
                  <Input id="fb_page_id" value={facebookPageId} onChange={(e) => setFacebookPageId(e.target.value)} placeholder="123456789012345" className="font-mono text-sm" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fb_page_name">Nome da Página <span className="text-muted-foreground text-[10px] font-normal">(opcional)</span></Label>
                  <Input id="fb_page_name" value={facebookPageName} onChange={(e) => setFacebookPageName(e.target.value)} placeholder="Empresa X" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="meta_user_id">Meta User ID <span className="text-muted-foreground text-[10px] font-normal">(opcional)</span></Label>
                  <Input id="meta_user_id" value={metaUserId} onChange={(e) => setMetaUserId(e.target.value)} placeholder="10000000000" className="font-mono text-sm" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="business_id">Business Manager ID <span className="text-muted-foreground text-[10px] font-normal">(opcional)</span></Label>
                  <Input id="business_id" value={businessId} onChange={(e) => setBusinessId(e.target.value)} placeholder="987654321" className="font-mono text-sm" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ad_account_id">Ad Account ID <span className="text-muted-foreground text-[10px] font-normal">(opcional)</span></Label>
                  <Input id="ad_account_id" value={adAccountId} onChange={(e) => setAdAccountId(e.target.value)} placeholder="act_123456789" className="font-mono text-sm" />
                </div>
              </div>
            )}

            {/* Instagram */}
            {needsInstagram(provider) && (
              <div className="space-y-3 p-3 rounded-lg border border-border">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Instagram</p>
                <div className="space-y-2">
                  <Label htmlFor="ig_account_id">Instagram Account ID <span className="text-muted-foreground font-normal">(obrigatório)</span></Label>
                  <Input id="ig_account_id" value={instagramAccountId} onChange={(e) => setInstagramAccountId(e.target.value)} placeholder="17841400000000000" className="font-mono text-sm" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ig_username">Username <span className="text-muted-foreground text-[10px] font-normal">(opcional)</span></Label>
                  <Input id="ig_username" value={instagramUsername} onChange={(e) => setInstagramUsername(e.target.value)} placeholder="@empresax" />
                </div>
              </div>
            )}

            {/* WhatsApp */}
            {needsWhatsApp(provider) && (
              <div className="space-y-3 p-3 rounded-lg border border-border">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">WhatsApp Business</p>
                <div className="space-y-2">
                  <Label htmlFor="waba_id">WABA ID <span className="text-muted-foreground font-normal">(obrigatório)</span></Label>
                  <Input id="waba_id" value={wabaId} onChange={(e) => setWabaId(e.target.value)} placeholder="123456789012345" className="font-mono text-sm" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone_number_id">Phone Number ID <span className="text-muted-foreground font-normal">(obrigatório)</span></Label>
                  <Input id="phone_number_id" value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} placeholder="987654321098765" className="font-mono text-sm" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="display_phone">Número de exibição <span className="text-muted-foreground text-[10px] font-normal">(opcional)</span></Label>
                  <Input id="display_phone" value={displayPhoneNumber} onChange={(e) => setDisplayPhoneNumber(e.target.value)} placeholder="+55 11 99999-9999" />
                </div>
              </div>
            )}

            {/* Catalog (meta_multi) */}
            {provider === "meta_multi" && (
              <div className="space-y-2">
                <Label htmlFor="catalog_id">Catalog ID <span className="text-muted-foreground text-[10px] font-normal">(opcional)</span></Label>
                <Input id="catalog_id" value={catalogId} onChange={(e) => setCatalogId(e.target.value)} placeholder="456789012345678" className="font-mono text-sm" />
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <Button onClick={handleValidate} disabled={isValidating}>
                {isValidating
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Testando...</>
                  : "Testar conexão"}
              </Button>
            </div>
          </div>
        )}

        {/* ── Etapa 4: Resultado + Salvar ─────────────────────────────────── */}
        {step === 4 && validationResult && (
          <div className="space-y-4">
            {/* Aviso de duplicidade */}
            {duplicateWarning && duplicateWarning.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-1">
                <p className="text-xs font-semibold text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> Ativo já conectado
                </p>
                <p className="text-xs text-muted-foreground">
                  Este ativo já possui uma conexão ativa no C8 Control. Ao salvar, você atualizará a conexão existente.
                </p>
              </div>
            )}

            {/* Resultado do token */}
            <div className="rounded-lg border border-border p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Connection Validation</p>
              <Separator />
              <div className="flex items-center gap-2">
                {validationResult.token.valid
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  : <XCircle     className="h-4 w-4 text-red-400" />}
                <span className="text-sm font-medium">Meta Token</span>
                <Badge className={cn(
                  "text-[10px] ml-auto",
                  validationResult.token.valid
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-red-500/15 text-red-400"
                )}>
                  {validationResult.token.valid ? "Válido" : "Inválido"}
                </Badge>
              </div>

              {/* Ativos */}
              <ValidationRow label="Facebook Page" result={validationResult.facebook_page} />
              <ValidationRow label="Instagram"     result={validationResult.instagram} />
              <ValidationRow label="WhatsApp WABA" result={validationResult.whatsapp_waba} />
              <ValidationRow label="WhatsApp Phone" result={
                validationResult.whatsapp_phone
                  ? { ...validationResult.whatsapp_phone, name: validationResult.whatsapp_phone.display_number }
                  : undefined
              } />
              <ValidationRow label="Business Manager" result={validationResult.business} />
              <ValidationRow label="Ad Account"    result={validationResult.ad_account} />

              {/* Permissões */}
              {validationResult.token.permissions && validationResult.token.permissions.length > 0 && (
                <div className="pt-2">
                  <p className="text-xs text-muted-foreground mb-1">Permissões detectadas</p>
                  <div className="flex flex-wrap gap-1">
                    {validationResult.token.permissions.slice(0, 12).map((p) => (
                      <Badge key={p} variant="outline" className="text-[10px] font-mono">
                        {p}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Erros */}
              {validationResult.errors.length > 0 && (
                <div className="pt-2 space-y-1">
                  {validationResult.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-400 flex items-start gap-1">
                      <XCircle className="h-3 w-3 shrink-0 mt-0.5" /> {e}
                    </p>
                  ))}
                </div>
              )}
            </div>

            {/* Token expiration info */}
            {validationResult.token.expires_at && (
              <p className="text-xs text-muted-foreground">
                Token expira em: {new Date(validationResult.token.expires_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(3)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving || !validationResult.token.valid}
                className="gap-2"
              >
                {isSaving
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
                  : "Salvar conexão manual"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
