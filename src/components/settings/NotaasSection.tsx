/**
 * NotaasSection — Configurações da integração Notaas (NFS-e)
 * Exibida na aba de Configurações / Integrações
 */
import { useState, useEffect } from "react";
import { SettingsSection } from "./SettingsSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { FileText, Plus, Trash2, Loader2, Eye, EyeOff, ExternalLink, Webhook } from "lucide-react";
import { toast } from "sonner";
import { useIntegration } from "@/hooks/useSettings";
import { useOrganization } from "@/hooks/useOrganization";
import { useModulePermission } from "@/hooks/usePermissions";
import { maskApiKey, validateCnpj, validateAliquota } from "@/lib/fiscalValidators";
import type { NotaasConfig, ServicoMapping } from "@/types/fiscal";

const REGIME_OPTIONS = [
  { value: "simples_nacional", label: "Simples Nacional" },
  { value: "lucro_presumido", label: "Lucro Presumido" },
  { value: "lucro_real", label: "Lucro Real" },
] as const;

const MAX_CODIGOS = 20;

interface CodigoEntry {
  contractType: string;
  codigo: string;
  descricao: string;
  aliquota: string;
}

export function NotaasSection() {
  const organizationId = useOrganization();
  const { canEdit } = useModulePermission("settings");

  const integration = useIntegration(organizationId, "notaas");
  const config = (integration.data?.config ?? {}) as NotaasConfig;

  // Form state
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [cnpjEmissor, setCnpjEmissor] = useState("");
  const [codigoServicoPadrao, setCodigoServicoPadrao] = useState("");
  const [aliquotaIss, setAliquotaIss] = useState("");
  const [regimeTributario, setRegimeTributario] = useState<NotaasConfig["regime_tributario"]>("simples_nacional");
  const [descricaoServicoPadrao, setDescricaoServicoPadrao] = useState("");
  const [sandboxMode, setSandboxMode] = useState(false);
  const [autoEmitOnPayment, setAutoEmitOnPayment] = useState(false);
  const [webhookSecret, setWebhookSecret] = useState("");
  const [n8nWebhookUrl, setN8nWebhookUrl] = useState("");
  const [useN8nAutomation, setUseN8nAutomation] = useState(false);
  const [pdfWebhookUrl, setPdfWebhookUrl] = useState("");
  const [checkWebhookUrl, setCheckWebhookUrl] = useState("");
  const [codigos, setCodigos] = useState<CodigoEntry[]>([]);
  const [saving, setSaving] = useState(false);

  // Populate form from saved config
  useEffect(() => {
    if (!integration.data) return;
    setApiKey(config.api_key ?? "");
    setCnpjEmissor(config.cnpj_emissor ?? "");
    setCodigoServicoPadrao(config.codigo_servico_padrao ?? "");
    setAliquotaIss(config.aliquota_iss_padrao != null ? String(config.aliquota_iss_padrao) : "");
    setRegimeTributario(config.regime_tributario ?? "simples_nacional");
    setDescricaoServicoPadrao(config.descricao_servico_padrao ?? "");
    setSandboxMode(config.sandbox_mode ?? false);
    setAutoEmitOnPayment(config.auto_emit_on_payment ?? false);
    setWebhookSecret(config.webhook_secret ?? "");
    setN8nWebhookUrl(config.n8n_webhook_url ?? "");
    setUseN8nAutomation(!!config.n8n_webhook_url);
    setPdfWebhookUrl(config.pdf_webhook_url ?? "");
    setCheckWebhookUrl(config.check_webhook_url ?? "");
    const map = config.codigos_servico_por_tipo_contrato ?? {};
    setCodigos(
      Object.entries(map).map(([contractType, value]) => {
        if (typeof value === "object" && value !== null) {
          const m = value as ServicoMapping;
          return {
            contractType,
            codigo: m.codigo ?? "",
            descricao: m.descricao ?? "",
            aliquota: m.aliquota != null ? String(m.aliquota) : "",
          };
        }
        // formato legado: apenas string
        return { contractType, codigo: String(value), descricao: "", aliquota: "" };
      })
    );
  }, [integration.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddCodigo = () => {
    if (codigos.length >= MAX_CODIGOS) {
      toast.warning(`Máximo de ${MAX_CODIGOS} mapeamentos permitidos.`);
      return;
    }
    setCodigos((prev) => [...prev, { contractType: "", codigo: "", descricao: "", aliquota: "" }]);
  };

  const handleRemoveCodigo = (index: number) => {
    setCodigos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCodigoChange = (index: number, field: keyof CodigoEntry, value: string) => {
    setCodigos((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry))
    );
  };

  const handleSave = async () => {
    // Validation
    if (!apiKey.trim()) {
      toast.error("A API Key é obrigatória.");
      return;
    }

    if (cnpjEmissor && !validateCnpj(cnpjEmissor)) {
      toast.error("CNPJ do emissor inválido. Informe 14 dígitos numéricos.");
      return;
    }

    const aliquotaNum = aliquotaIss ? parseFloat(aliquotaIss.replace(",", ".")) : 0;
    if (aliquotaIss && !validateAliquota(aliquotaNum)) {
      toast.error("Alíquota ISS inválida. Deve ser um valor entre 0 e 100.");
      return;
    }

    setSaving(true);
    try {
      const codigosMap: Record<string, string | ServicoMapping> = {};
      codigos.forEach(({ contractType, codigo, descricao, aliquota }) => {
        if (contractType.trim() && codigo.trim()) {
          const hasExtra = descricao.trim() || aliquota.trim();
          if (hasExtra) {
            const mapping: ServicoMapping = { codigo: codigo.trim() };
            if (descricao.trim()) mapping.descricao = descricao.trim();
            if (aliquota.trim()) {
              const al = parseFloat(aliquota.replace(",", "."));
              if (!isNaN(al)) mapping.aliquota = al;
            }
            codigosMap[contractType.trim()] = mapping;
          } else {
            codigosMap[contractType.trim()] = codigo.trim();
          }
        }
      });

      const payload: NotaasConfig = {
        api_key: apiKey.trim() || undefined,
        cnpj_emissor: cnpjEmissor.replace(/\D/g, "") || undefined,
        codigo_servico_padrao: codigoServicoPadrao.trim() || undefined,
        aliquota_iss_padrao: aliquotaIss ? aliquotaNum : undefined,
        regime_tributario: regimeTributario,
        descricao_servico_padrao: descricaoServicoPadrao.trim() || undefined,
        sandbox_mode: sandboxMode,
        auto_emit_on_payment: autoEmitOnPayment,
        webhook_secret: webhookSecret.trim() || undefined,
        n8n_webhook_url: useN8nAutomation ? (n8nWebhookUrl.trim() || undefined) : undefined,
        pdf_webhook_url: pdfWebhookUrl.trim() || undefined,
        check_webhook_url: checkWebhookUrl.trim() || undefined,
        codigos_servico_por_tipo_contrato:
          Object.keys(codigosMap).length > 0 ? codigosMap : undefined,
      };

      await integration.upsert.mutateAsync(payload as any);
      toast.success("Configurações Notaas salvas com sucesso!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar configurações.");
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit) {
    return (
      <SettingsSection
        title="Notaas — Emissão de NFS-e"
        icon={<FileText className="h-5 w-5" />}
      >
        <p className="text-sm text-muted-foreground">
          Você não tem permissão para editar estas configurações.
        </p>
      </SettingsSection>
    );
  }

  if (integration.isLoading) {
    return (
      <SettingsSection
        title="Notaas — Emissão de NFS-e"
        icon={<FileText className="h-5 w-5" />}
      >
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      title="Notaas — Emissão de NFS-e"
      description="Integração com a plataforma Notaas para emissão automática de notas fiscais de serviço."
      icon={<FileText className="h-5 w-5" />}
    >
      <div className="space-y-6">
        {/* Credenciais */}
        <div className="space-y-4 p-4 border rounded-lg">
          <h4 className="text-sm font-medium">Credenciais</h4>

          {/* API Key */}
          <div className="space-y-1">
            <Label htmlFor="notaas-api-key">API Key</Label>
            <div className="flex gap-2">
              <Input
                id="notaas-api-key"
                type={showApiKey ? "text" : "password"}
                value={showApiKey ? apiKey : (apiKey ? maskApiKey(apiKey) : "")}
                onChange={(e) => {
                  if (showApiKey) setApiKey(e.target.value);
                }}
                onFocus={() => setShowApiKey(true)}
                onBlur={() => setShowApiKey(false)}
                placeholder="sk_..."
                autoComplete="off"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowApiKey((v) => !v)}
                aria-label={showApiKey ? "Ocultar API Key" : "Mostrar API Key"}
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Chave de acesso à API Notaas. Exibida mascarada por segurança.
            </p>
          </div>

          {/* Webhook Secret */}
          <div className="space-y-1">
            <Label htmlFor="notaas-webhook-secret">Webhook Secret</Label>
            <Input
              id="notaas-webhook-secret"
              type="password"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder="whsec_..."
              autoComplete="off"
            />
          </div>
        </div>

        {/* Dados do Emissor */}
        <div className="space-y-4 p-4 border rounded-lg">
          <h4 className="text-sm font-medium">Dados do Emissor</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="notaas-cnpj">CNPJ do Emissor</Label>
              <Input
                id="notaas-cnpj"
                value={cnpjEmissor}
                onChange={(e) => setCnpjEmissor(e.target.value)}
                placeholder="00.000.000/0001-00"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="notaas-regime">Regime Tributário</Label>
              <Select
                value={regimeTributario}
                onValueChange={(v) => setRegimeTributario(v as NotaasConfig["regime_tributario"])}
              >
                <SelectTrigger id="notaas-regime">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REGIME_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Padrões de Serviço */}
        <div className="space-y-4 p-4 border rounded-lg">
          <h4 className="text-sm font-medium">Padrões de Serviço</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="notaas-aliquota">Alíquota ISS padrão (%)</Label>
              <Input
                id="notaas-aliquota"
                value={aliquotaIss}
                onChange={(e) => setAliquotaIss(e.target.value)}
                placeholder="2.0"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="notaas-codigo-padrao">Código de serviço padrão (LC 116)</Label>
              <Input
                id="notaas-codigo-padrao"
                value={codigoServicoPadrao}
                onChange={(e) => setCodigoServicoPadrao(e.target.value)}
                placeholder="010700"
              />
            </div>
            <div className="col-span-full space-y-1">
              <Label htmlFor="notaas-descricao-padrao">Descrição padrão do serviço</Label>
              <Input
                id="notaas-descricao-padrao"
                value={descricaoServicoPadrao}
                onChange={(e) => setDescricaoServicoPadrao(e.target.value)}
                placeholder="Prestação de serviços de marketing digital"
              />
            </div>
          </div>
        </div>

        {/* Códigos por Tipo de Contrato */}
        <div className="space-y-4 p-4 border rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium">Códigos por Tipo de Contrato</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Mapeie cada tipo de contrato ao código LC 116 correspondente (máx. {MAX_CODIGOS}).
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
            <p className="text-sm text-muted-foreground text-center py-2">
              Nenhum mapeamento configurado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo de contrato</TableHead>
                  <TableHead className="w-36">Código LC 116</TableHead>
                  <TableHead>Descrição do serviço</TableHead>
                  <TableHead className="w-28">Alíquota ISS (%)</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {codigos.map((entry, i) => (
                  <TableRow key={i}>
                    <TableCell className="py-2">
                      <Input
                        value={entry.contractType}
                        onChange={(e) => handleCodigoChange(i, "contractType", e.target.value)}
                        placeholder="Ex: Assessoria de Marketing"
                      />
                    </TableCell>
                    <TableCell className="py-2">
                      <Input
                        value={entry.codigo}
                        onChange={(e) => handleCodigoChange(i, "codigo", e.target.value)}
                        placeholder="010700"
                      />
                    </TableCell>
                    <TableCell className="py-2">
                      <Input
                        value={entry.descricao}
                        onChange={(e) => handleCodigoChange(i, "descricao", e.target.value)}
                        placeholder="Opcional — sobrescreve a descrição padrão"
                      />
                    </TableCell>
                    <TableCell className="py-2">
                      <Input
                        value={entry.aliquota}
                        onChange={(e) => handleCodigoChange(i, "aliquota", e.target.value)}
                        placeholder="Ex: 3.0"
                      />
                    </TableCell>
                    <TableCell className="py-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => handleRemoveCodigo(i)}
                        aria-label="Remover mapeamento"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Automação via n8n */}
        <div className="space-y-4 p-4 border rounded-lg">
          <div className="flex items-center gap-2">
            <Webhook className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-medium">Automação via n8n</h4>
          </div>
          <p className="text-xs text-muted-foreground">
            Quando ativado, a emissão automática de NFS-e é delegada ao workflow n8n em vez de
            ser processada diretamente pelo Maestr.IA. Útil para adicionar etapas customizadas
            antes ou depois da emissão.
          </p>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Usar n8n para emissão automática</p>
              <p className="text-xs text-muted-foreground">
                Requer que o workflow n8n esteja ativo e a URL do webhook configurada abaixo.
              </p>
            </div>
            <Switch checked={useN8nAutomation} onCheckedChange={setUseN8nAutomation} />
          </div>

          {useN8nAutomation && (
            <div className="space-y-1">
              <Label htmlFor="notaas-n8n-webhook-url">URL do Webhook n8n</Label>
              <Input
                id="notaas-n8n-webhook-url"
                value={n8nWebhookUrl}
                onChange={(e) => setN8nWebhookUrl(e.target.value)}
                placeholder="https://seu-n8n.com/webhook/nfse-automation"
                type="url"
              />
              <p className="text-xs text-muted-foreground">
                Cole aqui a URL gerada pelo nó "Webhook — Emitir NFS-e" no n8n.{" "}
                <a
                  href="https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-primary hover:underline"
                >
                  Como configurar
                  <ExternalLink className="h-3 w-3" />
                </a>
              </p>
              <div className="mt-2 rounded-md bg-muted p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Configuração do workflow n8n:</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Importe o arquivo <code className="bg-background px-1 rounded">docs/n8n_workflows/n8n_workflow_nfse.json</code> no n8n</li>
                  <li>Configure as variáveis de ambiente: <code className="bg-background px-1 rounded">SUPABASE_URL</code>, <code className="bg-background px-1 rounded">SUPABASE_SERVICE_KEY</code></li>
                  <li>Ative o workflow e copie a URL do webhook gerada</li>
                  <li>Cole a URL no campo acima e salve</li>
                </ol>
              </div>
            </div>
          )}
        </div>

        {/* Webhook PDF */}
        <div className="space-y-3 p-4 border rounded-lg">
          <div className="flex items-center gap-2">
            <Webhook className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-medium">Webhook — Geração de PDF</h4>
          </div>
          <p className="text-xs text-muted-foreground">
            URL do webhook n8n acionado ao solicitar a geração e arquivamento do PDF de uma nota
            autorizada na pasta do cliente no Google Drive.
          </p>
          <div className="space-y-1">
            <Label htmlFor="notaas-pdf-webhook-url">URL do Webhook PDF</Label>
            <Input
              id="notaas-pdf-webhook-url"
              value={pdfWebhookUrl}
              onChange={(e) => setPdfWebhookUrl(e.target.value)}
              placeholder="https://seu-n8n.com/webhook/nfse-pdf"
              type="url"
            />
            <p className="text-xs text-muted-foreground">
              Importe o arquivo{" "}
              <code className="bg-muted px-1 rounded">docs/n8n_workflows/n8n_workflow_nfse_pdf.json</code>{" "}
              no n8n, ative e cole a URL aqui.
            </p>
          </div>
        </div>

        {/* Webhook Verificação Automática */}
        <div className="space-y-3 p-4 border rounded-lg">
          <div className="flex items-center gap-2">
            <Webhook className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-medium">Webhook — Verificação Automática</h4>
          </div>
          <p className="text-xs text-muted-foreground">
            URL do webhook n8n que verifica automaticamente notas em processamento há mais de
            10 minutos, consultando a Notaas e atualizando o status. Executado a cada 15 minutos.
          </p>
          <div className="space-y-1">
            <Label htmlFor="notaas-check-webhook-url">URL do Webhook de Verificação</Label>
            <Input
              id="notaas-check-webhook-url"
              value={checkWebhookUrl}
              onChange={(e) => setCheckWebhookUrl(e.target.value)}
              placeholder="https://seu-n8n.com/webhook/nfse-check"
              type="url"
            />
            <p className="text-xs text-muted-foreground">
              Importe o arquivo{" "}
              <code className="bg-muted px-1 rounded">docs/n8n_workflows/n8n_workflow_nfse_check.json</code>{" "}
              no n8n, ative e cole a URL aqui. Este workflow é agendado — não precisa de URL se
              configurado diretamente no n8n com o trigger de agendamento.
            </p>
          </div>
        </div>

        {/* Automação */}
        <div className="space-y-3 p-4 border rounded-lg">
          <h4 className="text-sm font-medium">Automação</h4>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Modo Sandbox</p>
              <p className="text-xs text-muted-foreground">
                Ativa o ambiente de testes da Notaas. Notas emitidas não têm validade fiscal.
              </p>
            </div>
            <Switch checked={sandboxMode} onCheckedChange={setSandboxMode} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Emissão automática ao receber pagamento</p>
              <p className="text-xs text-muted-foreground">
                Emite a NFS-e automaticamente quando um pagamento é marcado como recebido.
              </p>
            </div>
            <Switch checked={autoEmitOnPayment} onCheckedChange={setAutoEmitOnPayment} />
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Salvar configurações Notaas
        </Button>
      </div>
    </SettingsSection>
  );
}
