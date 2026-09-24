/**
 * FiscalSettingsTab.tsx
 * Aba dedicada às configurações do módulo Fiscal / NFS-e.
 *
 * Seções:
 *  1. Credenciais Notaas (API Key, Sandbox, Webhook Secret)
 *  2. Dados do Emissor (CNPJ, Regime Tributário)
 *  3. Padrões de Serviço (código LC 116, alíquota ISS, descrição)
 *  4. Mapeamentos por Tipo de Contrato
 *  5. Webhook (URL de destino, instruções de configuração)
 *  6. Certificado Digital A1 (informativo — upload futuro)
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  KeyRound,
  Building2,
  FileText,
  Webhook,
  ShieldCheck,
  Copy,
  CheckCheck,
  Upload,
  X,
  FileKey,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useIntegration } from "@/hooks/useSettings";
import { useOrganization } from "@/hooks/useOrganization";
import { useModulePermission } from "@/hooks/usePermissions";
import { maskApiKey, validateCnpj, validateAliquota } from "@/lib/fiscalValidators";
import { supabase } from "@/lib/supabase";
import type { NotaasConfig, ServicoMapping } from "@/types/fiscal";

// ── Constantes ────────────────────────────────────────────────────────────────

const REGIME_OPTIONS = [
  { value: "simples_nacional", label: "Simples Nacional" },
  { value: "lucro_presumido",  label: "Lucro Presumido"  },
  { value: "lucro_real",       label: "Lucro Real"       },
] as const;

/**
 * Produtos/serviços disponíveis no cadastro de contratos dos clientes.
 * Espelha as opções do select em ClientsPage.
 */
const SERVICE_OPTIONS = [
  "Assessoria",
  "Consultoria",
  "Google Meu Negócio",
  "Site/Landing Page",
  "Automação IA",
  "Captação Profissional",
  "Desenvolvimento e Programação",
  "Identidade Visual",
  "Lançamento",
  "Parceria/Collab",
];

const CUSTOM_VALUE = "__custom__";

const MAX_CODIGOS = 20;

// ── Tipos internos ────────────────────────────────────────────────────────────

interface CodigoEntry {
  contractType: string;   // nome do produto/serviço (referência)
  codigo: string;         // CNAE / código LC 116
  descricao: string;      // descrição para a nota fiscal
  aliquota: string;       // alíquota ISS específica (vazio = usar padrão)
  isCustom: boolean;      // true quando o usuário escolheu "Personalizado"
}

// ── Sub-componente: upload de certificado A1 ─────────────────────────────────

const CERT_BUCKET = "fiscal-certificates";
const ACCEPTED_CERT_TYPES = ".pfx,.p12";

interface CertificateUploadProps {
  organizationId: string | undefined;
  currentUrl?: string;
  currentFilename?: string;
  certPassword: string;
  onCertPasswordChange: (v: string) => void;
  onUploaded: (url: string, filename: string) => Promise<void>;
  onRemoved: () => Promise<void>;
}

function CertificateUpload({
  organizationId,
  currentUrl,
  currentFilename,
  certPassword,
  onCertPasswordChange,
  onUploaded,
  onRemoved,
}: CertificateUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !organizationId) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "pfx" && ext !== "p12") {
      toast.error("Formato inválido. Envie um arquivo .pfx ou .p12.");
      e.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo 5 MB.");
      e.target.value = "";
      return;
    }

    setUploading(true);
    try {
      const path = `${organizationId}/certificado_a1_${Date.now()}.${ext}`;

      // Remove certificado anterior se existir
      if (currentUrl) {
        const oldPath = currentUrl.split(`${CERT_BUCKET}/`)[1];
        if (oldPath) {
          await supabase.storage.from(CERT_BUCKET).remove([oldPath]);
        }
      }

      const { error: uploadError } = await supabase.storage
        .from(CERT_BUCKET)
        .upload(path, file, { upsert: true, contentType: "application/octet-stream" });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from(CERT_BUCKET)
        .getPublicUrl(path);

      await onUploaded(publicUrl, file.name);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar certificado.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleRemove = async () => {
    if (!currentUrl) return;
    setRemoving(true);
    try {
      const oldPath = currentUrl.split(`${CERT_BUCKET}/`)[1];
      if (oldPath) {
        await supabase.storage.from(CERT_BUCKET).remove([oldPath]);
      }
      await onRemoved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover certificado.");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="space-y-4">
      {currentUrl ? (
        /* ── Certificado já enviado ── */
        <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
          <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 shrink-0">
            <FileKey className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {currentFilename ?? "certificado_a1.pfx"}
            </p>
            <p className="text-xs text-muted-foreground">Certificado A1 carregado</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Substituir */}
            <label className="cursor-pointer">
              <Button type="button" variant="outline" size="sm" asChild>
                <span>
                  {uploading
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    : <Upload className="h-3.5 w-3.5 mr-1" />}
                  Substituir
                </span>
              </Button>
              <input
                type="file"
                accept={ACCEPTED_CERT_TYPES}
                className="hidden"
                onChange={handleUpload}
                disabled={uploading || removing}
              />
            </label>
            {/* Remover */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={handleRemove}
              disabled={removing || uploading}
            >
              {removing
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <X className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      ) : (
        /* ── Nenhum certificado — área de upload ── */
        <label className="cursor-pointer block">
          <div className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors
            ${uploading ? "opacity-60 pointer-events-none" : "hover:border-primary hover:bg-muted/30"}`}>
            <div className="flex justify-center mb-3">
              <div className="p-3 rounded-full bg-muted">
                {uploading
                  ? <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
                  : <Upload className="h-6 w-6 text-muted-foreground" />}
              </div>
            </div>
            <p className="text-sm font-medium">
              {uploading ? "Enviando certificado..." : "Clique para enviar o certificado A1"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Formatos aceitos: <strong>.pfx</strong> ou <strong>.p12</strong> — máx. 5 MB
            </p>
          </div>
          <input
            type="file"
            accept={ACCEPTED_CERT_TYPES}
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
      )}

      {/* Senha do certificado */}
      <div className="space-y-1.5">
        <Label htmlFor="cert-password">Senha do Certificado</Label>
        <div className="flex gap-2">
          <Input
            id="cert-password"
            type={showPassword ? "text" : "password"}
            value={certPassword}
            onChange={(e) => onCertPasswordChange(e.target.value)}
            placeholder="Senha do arquivo .pfx / .p12"
            autoComplete="off"
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          A senha é usada pela Notaas para assinar os documentos fiscais. Armazenada de forma segura junto às credenciais.
        </p>
      </div>
    </div>
  );
}

// ── Sub-componente: cabeçalho de seção ────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof KeyRound;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-start gap-3 pb-3 border-b mb-4">
      <div className="p-2 rounded-lg bg-muted shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function FiscalSettingsTab() {
  const organizationId = useOrganization();
  const { canEdit, isAdminOrOwner } = useModulePermission("settings");
  const canEditSettings = isAdminOrOwner || canEdit;

  const integration = useIntegration(organizationId, "notaas");
  const config = (integration.data?.config ?? {}) as NotaasConfig;

  // ── Estado do formulário ──────────────────────────────────────────────────
  const [apiKey, setApiKey]                                   = useState("");
  const [showApiKey, setShowApiKey]                           = useState(false);
  const [sandboxMode, setSandboxMode]                         = useState(false);
  const [webhookSecret, setWebhookSecret]                     = useState("");
  const [showWebhookSecret, setShowWebhookSecret]             = useState(false);
  const [certPassword, setCertPassword]                       = useState("");
  const [cnpjEmissor, setCnpjEmissor]                         = useState("");
  const [regimeTributario, setRegimeTributario]               = useState<NotaasConfig["regime_tributario"]>("simples_nacional");
  const [codigoServicoPadrao, setCodigoServicoPadrao]         = useState("");
  const [aliquotaIss, setAliquotaIss]                         = useState("");
  const [descricaoServicoPadrao, setDescricaoServicoPadrao]   = useState("");
  const [codigos, setCodigos]                                 = useState<CodigoEntry[]>([]);
  const [saving, setSaving]                                   = useState(false);
  const [copiedWebhook, setCopiedWebhook]                     = useState(false);
  const [n8nWebhookUrl, setN8nWebhookUrl]                     = useState("");
  const [pdfWebhookUrl, setPdfWebhookUrl]                     = useState("");
  const [checkWebhookUrl, setCheckWebhookUrl]                 = useState("");
  const [cancelWebhookUrl, setCancelWebhookUrl]               = useState("");

  // ── Inicializa com valores salvos ─────────────────────────────────────────
  useEffect(() => {
    if (!integration.data) return;
    setApiKey(config.api_key ?? "");
    setSandboxMode(config.sandbox_mode ?? false);
    setWebhookSecret(config.webhook_secret ?? "");
    setCertPassword(config.certificate_password ?? "");
    setCnpjEmissor(config.cnpj_emissor ?? "");
    setRegimeTributario(config.regime_tributario ?? "simples_nacional");
    setCodigoServicoPadrao(config.codigo_servico_padrao ?? "");
    setAliquotaIss(config.aliquota_iss_padrao != null ? String(config.aliquota_iss_padrao) : "");
    setDescricaoServicoPadrao(config.descricao_servico_padrao ?? "");
    setN8nWebhookUrl(config.n8n_webhook_url ?? "");
    setPdfWebhookUrl(config.pdf_webhook_url ?? "");
    setCheckWebhookUrl(config.check_webhook_url ?? "");
    setCancelWebhookUrl(config.cancel_webhook_url ?? "");
    const map = config.codigos_servico_por_tipo_contrato ?? {};
    setCodigos(Object.entries(map).map(([contractType, value]) => {
      // Suporta formato legado (string) e novo (ServicoMapping)
      const isMappingObj = typeof value === "object" && value !== null;
      const codigo    = isMappingObj ? (value as any).codigo    ?? "" : (value as string);
      const descricao = isMappingObj ? (value as any).descricao ?? "" : "";
      const aliquota  = isMappingObj && (value as any).aliquota != null
        ? String((value as any).aliquota)
        : "";
      return {
        contractType,
        codigo,
        descricao,
        aliquota,
        isCustom: !SERVICE_OPTIONS.includes(contractType),
      };
    }));
  }, [integration.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Webhook URL ───────────────────────────────────────────────────────────
  const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL ?? "";
  const webhookUrl = supabaseUrl
    ? `${supabaseUrl}/functions/v1/notaas-webhook`
    : "Configure VITE_SUPABASE_URL no .env";

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 2000);
    });
  };

  // ── Mapeamentos ───────────────────────────────────────────────────────────
  const handleAddCodigo = () => {
    if (codigos.length >= MAX_CODIGOS) {
      toast.warning(`Máximo de ${MAX_CODIGOS} mapeamentos permitidos.`);
      return;
    }
    setCodigos((prev) => [...prev, { contractType: "", codigo: "", descricao: "", aliquota: "", isCustom: false }]);
  };

  const handleRemoveCodigo = (i: number) =>
    setCodigos((prev) => prev.filter((_, idx) => idx !== i));

  const handleCodigoChange = (i: number, field: keyof CodigoEntry, value: string) =>
    setCodigos((prev) =>
      prev.map((entry, idx) => (idx === i ? { ...entry, [field]: value } : entry))
    );

  /** Quando o usuário muda o select de produto/serviço */
  const handleSelectChange = (i: number, value: string) => {
    if (value === CUSTOM_VALUE) {
      setCodigos((prev) =>
        prev.map((entry, idx) =>
          idx === i ? { ...entry, contractType: "", isCustom: true } : entry
        )
      );
    } else {
      setCodigos((prev) =>
        prev.map((entry, idx) =>
          idx === i ? { ...entry, contractType: value, isCustom: false } : entry
        )
      );
    }
  };
  // ── Salvar ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!canEditSettings) {
      toast.error("Você não tem permissão para editar estas configurações.");
      return;
    }

    if (!apiKey.trim() && !config.api_key) {
      toast.error("A API Key é obrigatória.");
      return;
    }

    if (cnpjEmissor && !validateCnpj(cnpjEmissor)) {
      toast.error("CNPJ inválido. Informe exatamente 14 dígitos numéricos.");
      return;
    }

    const aliquotaNum = aliquotaIss ? parseFloat(aliquotaIss.replace(",", ".")) : undefined;
    if (aliquotaNum !== undefined && !validateAliquota(aliquotaNum)) {
      toast.error("Alíquota ISS inválida. Deve ser um valor entre 0 e 100.");
      return;
    }

    setSaving(true);
    try {
      const codigosMap: Record<string, string | ServicoMapping> = {};
      codigos.forEach(({ contractType, codigo, descricao, aliquota }) => {
        if (!contractType.trim() || !codigo.trim()) return;
        const aliquotaNum = aliquota.trim() ? parseFloat(aliquota.replace(",", ".")) : undefined;
        codigosMap[contractType.trim()] = {
          codigo: codigo.trim(),
          ...(descricao.trim() ? { descricao: descricao.trim() } : {}),
          ...(aliquotaNum != null && !isNaN(aliquotaNum) ? { aliquota: aliquotaNum } : {}),
        };
      });

      const payload: NotaasConfig = {
        // Preserva api_key existente se o campo estiver vazio (não foi alterado)
        api_key:                           apiKey.trim() || config.api_key,
        sandbox_mode:                      sandboxMode,
        webhook_secret:                    webhookSecret.trim() || undefined,
        cnpj_emissor:                      cnpjEmissor.replace(/\D/g, "") || undefined,
        regime_tributario:                 regimeTributario,
        codigo_servico_padrao:             codigoServicoPadrao.trim() || undefined,
        aliquota_iss_padrao:               aliquotaNum,
        descricao_servico_padrao:          descricaoServicoPadrao.trim() || undefined,
        codigos_servico_por_tipo_contrato: Object.keys(codigosMap).length > 0 ? codigosMap : undefined,
        // Preserva campos do certificado (gerenciados pelo CertificateUpload)
        certificate_url:                   config.certificate_url,
        certificate_filename:              config.certificate_filename,
        certificate_password:              certPassword.trim() || undefined,
        n8n_webhook_url:                   n8nWebhookUrl.trim() || undefined,
        pdf_webhook_url:                   pdfWebhookUrl.trim() || undefined,
        check_webhook_url:                 checkWebhookUrl.trim() || undefined,
        cancel_webhook_url:                cancelWebhookUrl.trim() || undefined,
      };

      await integration.upsert.mutateAsync(payload as any);
      toast.success("Configurações fiscais salvas com sucesso!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar configurações.");
    } finally {
      setSaving(false);
    }
  };

  // ── Sem permissão ─────────────────────────────────────────────────────────
  if (!canEditSettings) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3 text-muted-foreground">
        <ShieldCheck className="h-8 w-8" />
        <p className="font-medium">Acesso restrito</p>
        <p className="text-sm">Apenas owner, admin ou usuários com permissão de edição em Configurações podem acessar esta seção.</p>
      </div>
    );
  }

  if (integration.isLoading) {
    return (
      <div className="flex items-center gap-2 p-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando configurações fiscais...
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl">

      {/* ── 1. Credenciais Notaas ── */}
      <section>
        <SectionHeader
          icon={KeyRound}
          title="Credenciais Notaas"
          description="Chave de acesso à API Notaas para emissão de NFS-e."
        />

        <div className="space-y-4">
          {/* API Key */}
          <div className="space-y-1.5">
            <Label htmlFor="fiscal-api-key">
              API Key <span className="text-destructive">*</span>
            </Label>
            <div className="flex gap-2">
              <Input
                id="fiscal-api-key"
                type={showApiKey ? "text" : "password"}
                value={showApiKey ? apiKey : (apiKey ? maskApiKey(apiKey) : "")}
                onChange={(e) => { if (showApiKey) setApiKey(e.target.value); }}
                onFocus={() => setShowApiKey(true)}
                onBlur={() => setShowApiKey(false)}
                placeholder="sk_live_..."
                autoComplete="off"
                className="flex-1 font-mono text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowApiKey((v) => !v)}
                aria-label={showApiKey ? "Ocultar" : "Mostrar"}
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Obtida no painel da Notaas em <strong>Configurações → API</strong>. Exibida mascarada por segurança.
            </p>
          </div>

          {/* Sandbox */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium flex items-center gap-2">
                Modo Sandbox
                {sandboxMode && (
                  <Badge variant="outline" className="text-amber-600 border-amber-400 text-xs">
                    Ativo
                  </Badge>
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Direciona todas as requisições ao ambiente de testes da Notaas. Notas emitidas não têm validade fiscal.
              </p>
            </div>
            <Switch checked={sandboxMode} onCheckedChange={setSandboxMode} />
          </div>
        </div>
      </section>

      {/* ── 2. Dados do Emissor ── */}
      <section>
        <SectionHeader
          icon={Building2}
          title="Dados do Emissor"
          description="Informações da empresa que emite as notas fiscais."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="fiscal-cnpj">CNPJ do Emissor</Label>
            <Input
              id="fiscal-cnpj"
              value={cnpjEmissor}
              onChange={(e) => setCnpjEmissor(e.target.value)}
              placeholder="00.000.000/0001-00"
              maxLength={18}
            />
            <p className="text-xs text-muted-foreground">14 dígitos numéricos (formatação opcional).</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fiscal-regime">Regime Tributário</Label>
            <Select
              value={regimeTributario}
              onValueChange={(v) => setRegimeTributario(v as NotaasConfig["regime_tributario"])}
            >
              <SelectTrigger id="fiscal-regime">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REGIME_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* ── 3. Padrões de Serviço ── */}
      <section>
        <SectionHeader
          icon={FileText}
          title="Padrões de Serviço"
          description="Valores padrão usados na emissão quando não há configuração específica por contrato."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="fiscal-codigo-padrao">Código de Serviço Padrão (LC 116)</Label>
            <Input
              id="fiscal-codigo-padrao"
              value={codigoServicoPadrao}
              onChange={(e) => setCodigoServicoPadrao(e.target.value)}
              placeholder="Ex: 17.06"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fiscal-aliquota">Alíquota ISS Padrão (%)</Label>
            <Input
              id="fiscal-aliquota"
              value={aliquotaIss}
              onChange={(e) => setAliquotaIss(e.target.value)}
              placeholder="Ex: 5.0"
              inputMode="decimal"
            />
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="fiscal-descricao-padrao">Descrição Padrão do Serviço</Label>
            <Input
              id="fiscal-descricao-padrao"
              value={descricaoServicoPadrao}
              onChange={(e) => setDescricaoServicoPadrao(e.target.value)}
              placeholder="Ex: Prestação de serviços de marketing digital"
            />
          </div>
        </div>

        {/* Mapeamentos por tipo de contrato */}
        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Códigos por Tipo de Contrato</p>
              <p className="text-xs text-muted-foreground">
                Sobrescreve o código padrão para contratos de um tipo específico. Máx. {MAX_CODIGOS} entradas.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddCodigo}
              disabled={codigos.length >= MAX_CODIGOS}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Adicionar
            </Button>
          </div>

          {codigos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4 border rounded-lg">
              Nenhum mapeamento configurado.
            </p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">Produto / Serviço</TableHead>
                    <TableHead className="w-32">CNAE / Cód. LC 116</TableHead>
                    <TableHead className="min-w-[200px]">Descrição na nota</TableHead>
                    <TableHead className="w-28">Alíquota ISS (%)</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {codigos.map((entry, i) => (
                    <TableRow key={i}>
                      {/* Produto/Serviço — select + campo personalizado */}
                      <TableCell className="py-2 align-top space-y-1.5">
                        <Select
                          value={entry.isCustom ? CUSTOM_VALUE : (entry.contractType || "")}
                          onValueChange={(v) => handleSelectChange(i, v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione ou personalize..." />
                          </SelectTrigger>
                          <SelectContent>
                            {SERVICE_OPTIONS.map((opt) => (
                              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                            ))}
                            <SelectItem value={CUSTOM_VALUE}>✏️ Personalizado...</SelectItem>
                          </SelectContent>
                        </Select>
                        {entry.isCustom && (
                          <Input
                            value={entry.contractType}
                            onChange={(e) => handleCodigoChange(i, "contractType", e.target.value)}
                            placeholder="Nome do serviço"
                            autoFocus
                          />
                        )}
                      </TableCell>

                      {/* CNAE / Código LC 116 */}
                      <TableCell className="py-2 align-top">
                        <Input
                          value={entry.codigo}
                          onChange={(e) => handleCodigoChange(i, "codigo", e.target.value)}
                          placeholder="Ex: 17.06"
                        />
                      </TableCell>

                      {/* Descrição para a nota */}
                      <TableCell className="py-2 align-top">
                        <Input
                          value={entry.descricao}
                          onChange={(e) => handleCodigoChange(i, "descricao", e.target.value)}
                          placeholder="Descrição usada na NFS-e (opcional)"
                        />
                      </TableCell>

                      {/* Alíquota ISS específica */}
                      <TableCell className="py-2 align-top">
                        <Input
                          value={entry.aliquota}
                          onChange={(e) => handleCodigoChange(i, "aliquota", e.target.value)}
                          placeholder="Padrão"
                          inputMode="decimal"
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Vazio = usar padrão
                        </p>
                      </TableCell>

                      <TableCell className="py-2 align-top">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleRemoveCodigo(i)}
                          aria-label="Remover"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </section>

      {/* ── 4. Webhook ── */}
      <section>
        <SectionHeader
          icon={Webhook}
          title="Webhook"
          description="Configure a Notaas para enviar eventos de status das notas para este endpoint."
        />

        <div className="space-y-4">
          {/* URL do webhook */}
          <div className="space-y-1.5">
            <Label>URL do Webhook</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={webhookUrl}
                className="flex-1 font-mono text-xs bg-muted"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleCopyWebhook}
                aria-label="Copiar URL"
              >
                {copiedWebhook
                  ? <CheckCheck className="h-4 w-4 text-emerald-600" />
                  : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Cole esta URL no painel da Notaas em <strong>Configurações → Webhooks</strong>.
              Os eventos <code className="bg-muted px-1 rounded text-xs">nfse.autorizada</code> e{" "}
              <code className="bg-muted px-1 rounded text-xs">nfse.rejeitada</code> serão processados automaticamente.
            </p>
          </div>

          {/* Webhook Secret */}
          <div className="space-y-1.5">
            <Label htmlFor="fiscal-webhook-secret">Webhook Secret</Label>
            <div className="flex gap-2">
              <Input
                id="fiscal-webhook-secret"
                type={showWebhookSecret ? "text" : "password"}
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                placeholder="whsec_..."
                autoComplete="off"
                className="flex-1 font-mono text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowWebhookSecret((v) => !v)}
                aria-label={showWebhookSecret ? "Ocultar" : "Mostrar"}
              >
                {showWebhookSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Segredo HMAC-SHA256 gerado pela Notaas. Usado para validar a autenticidade dos eventos recebidos.
            </p>
          </div>
        </div>
      </section>

      {/* ── 5. Certificado Digital A1 ── */}
      <section>
        <SectionHeader
          icon={ShieldCheck}
          title="Certificado Digital A1"
          description="Certificado digital no formato A1 (.pfx / .p12) para assinatura de documentos fiscais."
        />

        <CertificateUpload
          organizationId={organizationId}
          currentUrl={config.certificate_url}
          currentFilename={config.certificate_filename}
          certPassword={certPassword}
          onCertPasswordChange={setCertPassword}
          onUploaded={async (url, filename) => {
            // Salva imediatamente na config sem precisar clicar em "Salvar"
            try {
              await integration.upsert.mutateAsync({
                ...config,
                certificate_url: url,
                certificate_filename: filename,
                certificate_password: certPassword.trim() || undefined,
              } as any);
              toast.success("Certificado salvo com sucesso!");
            } catch {
              toast.error("Erro ao salvar referência do certificado.");
            }
          }}
          onRemoved={async () => {
            try {
              await integration.upsert.mutateAsync({
                ...config,
                certificate_url: undefined,
                certificate_filename: undefined,
                certificate_password: undefined,
              } as any);
              toast.success("Certificado removido.");
            } catch {
              toast.error("Erro ao remover referência do certificado.");
            }
          }}
        />
      </section>

      {/* ── 6. Automação via n8n ── */}
      <section>
        <SectionHeader
          icon={Zap}
          title="Automação via n8n"
          description="Configure um workflow n8n para automatizar a geração de NFS-e a partir de eventos de pagamento."
        />

        <div className="space-y-4">
          {/* URL do webhook n8n */}
          <div className="space-y-1.5">
            <Label htmlFor="fiscal-n8n-url">URL do Webhook n8n</Label>
            <Input
              id="fiscal-n8n-url"
              type="url"
              value={n8nWebhookUrl}
              onChange={(e) => setN8nWebhookUrl(e.target.value)}
              placeholder="https://seu-n8n.com/webhook/nfse-automation"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Quando configurada, o CRM enviará um POST para esta URL ao confirmar pagamentos,
              permitindo que o n8n orquestre a emissão automática de NFS-e via Notaas.
            </p>
          </div>

          {/* Instruções */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              Como configurar o workflow n8n
            </p>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Importe o arquivo <code className="bg-muted px-1 rounded">docs/n8n_workflows/n8n_workflow_nfse.json</code> no seu n8n</li>
              <li>Configure as variáveis de ambiente: <code className="bg-muted px-1 rounded">SUPABASE_URL</code>, <code className="bg-muted px-1 rounded">SUPABASE_SERVICE_KEY</code> e <code className="bg-muted px-1 rounded">NOTAAS_API_KEY</code></li>
              <li>Ative o workflow e copie a URL do webhook gerada</li>
              <li>Cole a URL acima e salve as configurações</li>
            </ol>
            <p className="text-xs text-muted-foreground mt-2">
              O payload enviado pelo CRM inclui: <code className="bg-muted px-1 rounded">payment_id</code>,{" "}
              <code className="bg-muted px-1 rounded">client_id</code>,{" "}
              <code className="bg-muted px-1 rounded">organization_id</code>,{" "}
              <code className="bg-muted px-1 rounded">valor</code>,{" "}
              <code className="bg-muted px-1 rounded">paid_at</code> e{" "}
              <code className="bg-muted px-1 rounded">service_contracted</code>.
            </p>
          </div>

          {/* URL do webhook PDF */}
          <div className="space-y-1.5 pt-2 border-t">
            <Label htmlFor="fiscal-pdf-url">URL do Webhook — Geração de PDF</Label>
            <Input
              id="fiscal-pdf-url"
              type="url"
              value={pdfWebhookUrl}
              onChange={(e) => setPdfWebhookUrl(e.target.value)}
              placeholder="https://seu-n8n.com/webhook/nfse-pdf"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Acionado ao clicar em "Gerar PDF" na aba <strong>PDF Pendente</strong>. Baixa o PDF da Notaas e arquiva na pasta do cliente no Google Drive.
              Importe <code className="bg-muted px-1 rounded">n8n_workflow_nfse_pdf.json</code>.
            </p>
          </div>

          {/* URL do webhook de verificação automática */}
          <div className="space-y-1.5">
            <Label htmlFor="fiscal-check-url">URL do Webhook — Verificação Automática</Label>
            <Input
              id="fiscal-check-url"
              type="url"
              value={checkWebhookUrl}
              onChange={(e) => setCheckWebhookUrl(e.target.value)}
              placeholder="https://seu-n8n.com/webhook/nfse-check"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Opcional — para acionar a verificação manualmente. O workflow <code className="bg-muted px-1 rounded">n8n_workflow_nfse_check.json</code> já roda automaticamente a cada 15 min via agendamento interno do n8n.
            </p>
          </div>

          {/* URL do webhook de cancelamento */}
          <div className="space-y-1.5">
            <Label htmlFor="fiscal-cancel-url">URL do Webhook — Cancelamento de NFS-e</Label>
            <Input
              id="fiscal-cancel-url"
              type="url"
              value={cancelWebhookUrl}
              onChange={(e) => setCancelWebhookUrl(e.target.value)}
              placeholder="https://seu-n8n.com/webhook/nfse-cancel"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Acionado ao cancelar uma nota emitida ou em processamento. Chama a API Notaas, arquiva o comprovante no Google Drive e atualiza o status.
              Importe <code className="bg-muted px-1 rounded">n8n_workflow_nfse_cancel.json</code>.
              Se não configurado, usa a URL do webhook principal como fallback.
            </p>
          </div>
        </div>
      </section>

      {/* ── Botão salvar ── */}
      <div className="pt-2 border-t">
        <Button onClick={handleSave} disabled={saving || integration.upsert?.isPending}>
          {(saving || integration.upsert?.isPending) && (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          )}
          Salvar configurações fiscais
        </Button>
      </div>
    </div>
  );
}
