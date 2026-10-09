/**
 * FiscalSection — Configurações do módulo Fiscal (Notaas API)
 * Exibida na aba Integrações das Configurações
 */
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useIntegration } from "@/hooks/useSettings";
import type { NotaasConfig } from "@/types/fiscal";

const REGIME_OPTIONS = [
  { value: "simples_nacional", label: "Simples Nacional" },
  { value: "mei",              label: "MEI" },
  { value: "lucro_presumido",  label: "Lucro Presumido" },
  { value: "lucro_real",       label: "Lucro Real" },
];

const SERVICE_TYPE_OPTIONS = [
  "Assessoria de Marketing",
  "Consultoria",
  "Gestão de Mídias",
  "Desenvolvimento de Site",
  "Ecossistema de Atendimento",
  "Outros",
];

interface Props {
  organizationId: string;
}

export function FiscalSection({ organizationId }: Props) {
  const integration = useIntegration(organizationId, "fiscal" as any);
  const config = (integration.data?.config ?? {}) as Record<string, unknown>;

  const [apiKey, setApiKey]                   = useState("");
  const [env, setEnv]                         = useState<"sandbox" | "production">("production");
  const [cnpj, setCnpj]                       = useState("");
  const [regime, setRegime]                   = useState("simples_nacional");
  const [aliquota, setAliquota]               = useState("");
  const [codigoPadrao, setCodigoPadrao]       = useState("");
  const [descricaoPadrao, setDescricaoPadrao] = useState("");
  const [emissaoAuto, setEmissaoAuto]         = useState(false);
  const [codigos, setCodigos]                 = useState<{ servico: string; codigo: string }[]>([]);
  const [saving, setSaving]                   = useState(false);

  // Inicializa com os valores salvos
  useEffect(() => {
    if (!integration.data) return;
    setApiKey((config.notaas_api_key as string) ?? "");
    setEnv((config.notaas_env as "sandbox" | "production") ?? "production");
    setCnpj((config.cnpj_emissor as string) ?? "");
    setRegime((config.regime_tributario as string) ?? "simples_nacional");
    setAliquota(config.aliquota_iss_padrao != null ? String(config.aliquota_iss_padrao) : "");
    setCodigoPadrao((config.codigo_servico_padrao as string) ?? "");
    setDescricaoPadrao((config.descricao_servico_padrao as string) ?? "");
    setEmissaoAuto((config.emissao_automatica as boolean) ?? false);
    const map = (config.codigos_por_servico as Record<string, string>) ?? {};
    setCodigos(Object.entries(map).map(([servico, codigo]) => ({ servico, codigo: String(codigo) })));
  }, [integration.data]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const codigosMap: Record<string, string> = {};
      codigos.forEach(({ servico, codigo }) => { if (servico && codigo) codigosMap[servico] = codigo; });

      await integration.upsert.mutateAsync({
        notaas_api_key:           apiKey.trim() || undefined,
        notaas_env:               env,
        cnpj_emissor:             cnpj.replace(/\D/g, "") || undefined,
        regime_tributario:        regime as NotaasConfig["regime_tributario"],
        aliquota_iss_padrao:      aliquota ? parseFloat(aliquota.replace(",", ".")) : undefined,
        codigo_servico_padrao:    codigoPadrao.trim() || undefined,
        descricao_servico_padrao: descricaoPadrao.trim() || undefined,
        emissao_automatica:       emissaoAuto,
        codigos_por_servico:      Object.keys(codigosMap).length > 0 ? codigosMap : undefined,
      } as NotaasConfig);
      toast.success("Configurações fiscais salvas!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold">Fiscal — Emissão de NFS-e</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Integração com a plataforma{" "}
          <a href="https://notaas.com.br" target="_blank" rel="noopener noreferrer" className="underline">
            Notaas
          </a>{" "}
          para emissão de notas fiscais de serviço.
        </p>
      </div>

      {/* Credenciais */}
      <div className="space-y-4 p-4 border rounded-lg">
        <h4 className="text-sm font-medium">Credenciais Notaas</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label>API Key</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="ntaas_..."
            />
          </div>
          <div>
            <Label>Ambiente</Label>
            <Select value={env} onValueChange={(v) => setEnv(v as "sandbox" | "production")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">Sandbox (testes)</SelectItem>
                <SelectItem value="production">Produção</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Dados do emissor */}
      <div className="space-y-4 p-4 border rounded-lg">
        <h4 className="text-sm font-medium">Dados do Emissor</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>CNPJ do Emissor</Label>
            <Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0001-00" />
          </div>
          <div>
            <Label>Regime Tributário</Label>
            <Select value={regime} onValueChange={setRegime}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REGIME_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Padrões de serviço */}
      <div className="space-y-4 p-4 border rounded-lg">
        <h4 className="text-sm font-medium">Padrões de Serviço</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Alíquota ISS padrão (%)</Label>
            <Input value={aliquota} onChange={(e) => setAliquota(e.target.value)} placeholder="2.0" />
          </div>
          <div>
            <Label>Código de serviço padrão (LC 116)</Label>
            <Input value={codigoPadrao} onChange={(e) => setCodigoPadrao(e.target.value)} placeholder="010700" />
          </div>
          <div className="col-span-2">
            <Label>Descrição padrão do serviço</Label>
            <Input
              value={descricaoPadrao}
              onChange={(e) => setDescricaoPadrao(e.target.value)}
              placeholder="Prestação de serviços de marketing digital"
            />
          </div>
        </div>
      </div>

      {/* Códigos por tipo de serviço */}
      <div className="space-y-4 p-4 border rounded-lg">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">Códigos por Tipo de Serviço</h4>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCodigos((prev) => [...prev, { servico: "", codigo: "" }])}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Adicionar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Mapeie cada tipo de serviço ao código LC 116 correspondente para emissão automática.
        </p>
        {codigos.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-2">Nenhum mapeamento configurado.</p>
        )}
        {codigos.map((item, i) => (
          <div key={i} className="flex gap-2 items-end">
            <div className="flex-1">
              <Label className="text-xs">Tipo de serviço</Label>
              <Select
                value={item.servico}
                onValueChange={(v) => setCodigos((prev) => prev.map((c, idx) => idx === i ? { ...c, servico: v } : c))}
              >
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPE_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-32">
              <Label className="text-xs">Código LC 116</Label>
              <Input
                value={item.codigo}
                onChange={(e) => setCodigos((prev) => prev.map((c, idx) => idx === i ? { ...c, codigo: e.target.value } : c))}
                placeholder="010700"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-destructive"
              onClick={() => setCodigos((prev) => prev.filter((_, idx) => idx !== i))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      {/* Automação */}
      <div className="flex items-center justify-between p-4 border rounded-lg">
        <div>
          <p className="text-sm font-medium">Emissão automática ao receber pagamento</p>
          <p className="text-xs text-muted-foreground">
            Emite a NFS-e automaticamente quando um pagamento é marcado como recebido.
          </p>
        </div>
        <Switch checked={emissaoAuto} onCheckedChange={setEmissaoAuto} />
      </div>

      <Button onClick={handleSave} disabled={saving}>
        {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Salvar configurações fiscais
      </Button>
    </div>
  );
}
