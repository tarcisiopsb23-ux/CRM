/**
 * AgencyMetaTokenSection
 *
 * Seção de configurações do token global da agência Meta (System User Token).
 * Usado quando clientes não têm Business Manager próprio — a agência gerencia
 * todos os ativos com um único token.
 *
 * Fica em Configurações → Integrações do CRM (SettingsPage).
 * Visível apenas para owner/admin.
 */

import { useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, RefreshCcw, Trash2, Info, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { useMetaConnections } from "@/hooks/useMetaConnections";
import { useOrganization } from "@/hooks/useOrganization";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

const HEALTH_COLOR = {
  healthy: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  warning: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  failed:  "bg-red-500/15 text-red-400 border-red-500/30",
  unknown: "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

const TOKEN_TYPE_LABELS = {
  system_user: "System User",
  user:        "User Token",
  page:        "Page Token",
  app:         "App Token",
};

export function AgencyMetaTokenSection() {
  const organizationId = useOrganization();
  const {
    agencyCredential,
    agencyCredLoading,
    saveAgencyToken,
    removeAgencyToken,
    validateAgencyToken,
  } = useMetaConnections(organizationId);

  // Form state
  const [token,        setToken]        = useState("");
  const [showToken,    setShowToken]    = useState(false);
  const [displayName,  setDisplayName]  = useState("Token da Agência");
  const [tokenType,    setTokenType]    = useState<"system_user" | "user" | "page" | "app">("system_user");
  const [businessId,   setBusinessId]   = useState("");
  const [isSaving,     setIsSaving]     = useState(false);
  const [isTesting,    setIsTesting]    = useState(false);
  const [testResult,   setTestResult]   = useState<{ valid: boolean; permissions?: string[]; error?: string } | null>(null);
  const [showForm,     setShowForm]     = useState(false);

  const hasToken = agencyCredential?.token_is_set === true;

  const handleSave = async () => {
    if (!token.trim()) { toast.error("Informe o token."); return; }
    setIsSaving(true);
    try {
      await saveAgencyToken.mutateAsync({
        access_token: token,
        display_name: displayName || "Token da Agência",
        token_type:   tokenType,
        business_id:  businessId || undefined,
      });
      toast.success("Token da agência salvo com segurança!");
      setToken("");
      setShowToken(false);
      setShowForm(false);
      setTestResult(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar token.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!hasToken && !token.trim()) {
      toast.error("Configure o token antes de testar.");
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      // Valida o token da agência sem nenhum ativo específico — só verifica se é válido
      const result = await validateAgencyToken.mutateAsync({ provider: "facebook" });
      setTestResult({
        valid:       result.token.valid,
        permissions: result.token.permissions,
        error:       result.errors?.[0],
      });
      if (result.token.valid) {
        toast.success("Token da agência válido!");
      } else {
        toast.error("Token inválido ou expirado.");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao testar token.";
      setTestResult({ valid: false, error: msg });
      toast.error(msg);
    } finally {
      setIsTesting(false);
    }
  };

  const handleRemove = async () => {
    try {
      await removeAgencyToken.mutateAsync();
      toast.success("Token da agência removido.");
      setTestResult(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover token.");
    }
  };

  if (agencyCredLoading) return null;

  return (
    <SettingsSection
      title="Token Meta da Agência"
      description="System User Token ou User Token da agência para uso em conexões de clientes que não têm Business Manager próprio."
      icon={
        <svg className="h-5 w-5 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      }
    >
      <div className="space-y-4">

        {/* Status atual */}
        {hasToken && agencyCredential ? (
          <div className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{agencyCredential.display_name}</p>
                <p className="text-xs text-muted-foreground">
                  {TOKEN_TYPE_LABELS[agencyCredential.token_type] ?? agencyCredential.token_type}
                  {agencyCredential.business_id && ` · Business ${agencyCredential.business_id}`}
                </p>
              </div>
              <Badge className={cn("text-[10px] border shrink-0", HEALTH_COLOR[agencyCredential.health_status])}>
                {agencyCredential.health_status}
              </Badge>
            </div>

            {agencyCredential.token_preview && (
              <p className="text-[11px] font-mono text-muted-foreground">
                {agencyCredential.token_preview}
              </p>
            )}

            {agencyCredential.token_last_validated_at && (
              <p className="text-[10px] text-muted-foreground">
                Validado em {format(new Date(agencyCredential.token_last_validated_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
              </p>
            )}

            {agencyCredential.token_expires_at && (
              <p className="text-[10px] text-amber-400">
                Expira em {format(new Date(agencyCredential.token_expires_at), "dd/MM/yyyy", { locale: ptBR })}
              </p>
            )}

            {/* Resultado do último teste */}
            {testResult && (
              <div className={cn(
                "rounded p-2 text-xs flex items-start gap-1.5",
                testResult.valid ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
              )}>
                {testResult.valid
                  ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  : <AlertCircle  className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                <div>
                  <p>{testResult.valid ? "Token válido" : (testResult.error ?? "Token inválido")}</p>
                  {testResult.valid && testResult.permissions && testResult.permissions.length > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {testResult.permissions.slice(0, 5).join(", ")}
                      {testResult.permissions.length > 5 && ` +${testResult.permissions.length - 5}`}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={handleTest} disabled={isTesting}>
                {isTesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />}
                Testar
              </Button>
              <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => { setShowForm(true); }}>
                Substituir token
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/10">
                    <Trash2 className="h-3 w-3" /> Remover
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remover token da agência?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Conexões que usam o token da agência ficarão sem credencial e serão marcadas como inativas. Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleRemove} className="bg-destructive hover:bg-destructive/90">
                      Remover
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-4 text-center space-y-2">
            <p className="text-sm text-muted-foreground">Nenhum token da agência configurado.</p>
            <Button size="sm" onClick={() => setShowForm(true)}>Configurar token</Button>
          </div>
        )}

        {/* Formulário de configuração/substituição */}
        {showForm && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{hasToken ? "Substituir token" : "Configurar token da agência"}</p>
              <button type="button" onClick={() => { setShowForm(false); setToken(""); setTestResult(null); }}
                className="text-muted-foreground hover:text-foreground text-xs">
                Cancelar
              </button>
            </div>

            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 space-y-1">
              <p className="text-xs font-semibold text-blue-400 flex items-center gap-1">
                <Info className="h-3.5 w-3.5" /> Segurança
              </p>
              <p className="text-[10px] text-muted-foreground">
                O token é criptografado com AES-GCM antes de ser armazenado. Nunca aparece em logs ou respostas.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Nome de exibição</Label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="System User — Agência" className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo de token</Label>
                <Select value={tokenType} onValueChange={(v) => setTokenType(v as typeof tokenType)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system_user">System User (recomendado)</SelectItem>
                    <SelectItem value="user">User Token</SelectItem>
                    <SelectItem value="page">Page Token</SelectItem>
                    <SelectItem value="app">App Token</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Business Manager ID <span className="text-muted-foreground">(opcional)</span></Label>
              <Input value={businessId} onChange={(e) => setBusinessId(e.target.value)}
                placeholder="123456789" className="h-8 text-sm font-mono" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Access Token</Label>
              <div className="relative">
                <Input
                  type={showToken ? "text" : "password"}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="EAAGm0PX..."
                  className="font-mono text-sm pr-10 h-8"
                  autoComplete="off"
                  data-lpignore="true"
                  data-form-type="other"
                />
                <button type="button" onClick={() => setShowToken((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={handleSave} disabled={isSaving || !token.trim()}>
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Salvar token
              </Button>
            </div>

            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 flex items-start gap-2">
              <ShieldAlert className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[10px] text-amber-400">
                Use um <strong>System User Token</strong> com permissões sobre os ativos dos clientes (Pages, WABAs, Ad Accounts). Tokens de usuário expiram em ~60 dias.
              </p>
            </div>
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
