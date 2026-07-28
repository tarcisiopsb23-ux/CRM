// src/components/propostas/ProposalTemplateTab.tsx
// Aba de configurações para o template padrão de propostas.
// Define hero, seções padrão e config de cronograma que são
// pré-carregados em todas as novas propostas.

import { useEffect, useState } from "react";
import { Save, Loader2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOrganization } from "@/hooks/useOrganization";
import {
  useProposalTemplate,
  type ProposalTemplateInput,
  type ProposalTemplateSectionEntry,
  DEFAULT_PROPOSAL_TEMPLATE,
} from "@/hooks/useProposalTemplate";
import { SECTION_LABELS, SECTION_ORDER, type SectionKey } from "@/types/proposals";

// Seções que são conteúdo padrão da agência (não mudam por cliente)
const STANDARD_SECTIONS: SectionKey[] = [
  "apresentacao",
  "metodologia",
  "diferenciais",
  "cases",
  "depoimentos",
  "garantias",
  "faq",
  "consideracoes_finais",
];

// Seções que variam por cliente (exibidas apenas no editor da proposta)
const CLIENT_SECTIONS: SectionKey[] = [
  "diagnostico",
  "objetivos",
  "estrategia",
  "solucao",
  "escopo",
  "cronograma",
];

const RECURRENCE_LABELS: Record<string, string> = {
  mensal: "Mensal",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
};

// ── Seção de campo de texto padrão ───────────────────────────────────────────

interface SectionFieldProps {
  sectionKey: SectionKey;
  entry: ProposalTemplateSectionEntry;
  onChange: (key: SectionKey, entry: ProposalTemplateSectionEntry) => void;
}

function SectionField({ sectionKey, entry, onChange }: SectionFieldProps) {
  const label = SECTION_LABELS[sectionKey];
  return (
    <div className="space-y-2 rounded-lg border p-4 bg-muted/20">
      <div className="flex items-center justify-between">
        <Label className="font-medium">{label}</Label>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {entry.is_visible ? "Visível" : "Oculta"}
          </span>
          <Switch
            checked={entry.is_visible}
            onCheckedChange={(v) => onChange(sectionKey, { ...entry, is_visible: v })}
          />
        </div>
      </div>
      <Textarea
        rows={5}
        placeholder={`Conteúdo padrão de "${label}"...`}
        value={entry.content}
        disabled={!entry.is_visible}
        onChange={(e) => onChange(sectionKey, { ...entry, content: e.target.value })}
        className="resize-none text-sm font-mono"
      />
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function ProposalTemplateTab() {
  const organizationId = useOrganization();
  const { templateOrDefault, isLoading, save } = useProposalTemplate(organizationId);

  const [values, setValues] = useState<ProposalTemplateInput>(DEFAULT_PROPOSAL_TEMPLATE);
  const [isDirty, setIsDirty] = useState(false);

  // Preenche o formulário quando o template for carregado
  useEffect(() => {
    setValues(templateOrDefault);
    setIsDirty(false);
  }, [JSON.stringify(templateOrDefault)]); // eslint-disable-line react-hooks/exhaustive-deps

  function setField<K extends keyof ProposalTemplateInput>(
    key: K,
    value: ProposalTemplateInput[K]
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  }

  function handleSectionChange(key: SectionKey, entry: ProposalTemplateSectionEntry) {
    setValues((prev) => ({
      ...prev,
      default_sections: { ...prev.default_sections, [key]: entry },
    }));
    setIsDirty(true);
  }

  function getSectionEntry(key: SectionKey): ProposalTemplateSectionEntry {
    return values.default_sections[key] ?? { content: "", is_visible: true };
  }

  async function handleSave() {
    await save.mutateAsync(values);
    setIsDirty(false);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando template...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Template Padrão de Propostas</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure o que é igual em todas as propostas. Ao criar uma nova proposta
            esses valores são pré-carregados automaticamente.
          </p>
        </div>
        <Button onClick={handleSave} disabled={save.isPending || !isDirty} size="sm">
          {save.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <Save className="h-4 w-4 mr-1" />
          )}
          Salvar template
        </Button>
      </div>

      {/* Banner informativo */}
      <div className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/30 px-4 py-3">
        <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
          <p>
            <strong>Padrão:</strong> hero, seções da agência e configuração de cronograma — editados aqui uma única vez.
          </p>
          <p>
            <strong>Variável por cliente:</strong> título, serviços, valores, datas e seções de diagnóstico/objetivos/estratégia — editados em cada proposta.
          </p>
        </div>
      </div>

      <Tabs defaultValue="hero">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="hero">Hero</TabsTrigger>
          <TabsTrigger value="secoes">Seções padrão</TabsTrigger>
          <TabsTrigger value="cronograma">Cronograma padrão</TabsTrigger>
        </TabsList>

        {/* ── ABA HERO ── */}
        <TabsContent value="hero" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Bloco Hero</CardTitle>
              <CardDescription>
                Configurações visuais e de contato que aparecem no topo de todas as propostas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>URL do Logotipo</Label>
                  <Input
                    placeholder="https://..."
                    value={values.hero_logo_url ?? ""}
                    onChange={(e) => setField("hero_logo_url", e.target.value || null)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>URL da Imagem de Destaque</Label>
                  <Input
                    placeholder="https://..."
                    value={values.hero_image_url ?? ""}
                    onChange={(e) => setField("hero_image_url", e.target.value || null)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Título padrão</Label>
                <Input
                  placeholder="Ex: Proposta de Marketing Digital"
                  value={values.hero_title}
                  onChange={(e) => setField("hero_title", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Pode ser sobrescrito por proposta.
                </p>
              </div>

              <div className="space-y-1">
                <Label>Subtítulo</Label>
                <Input
                  placeholder="Subtítulo opcional"
                  value={values.hero_subtitle ?? ""}
                  onChange={(e) => setField("hero_subtitle", e.target.value || null)}
                />
              </div>

              <div className="space-y-1">
                <Label>
                  Mensagem de abertura{" "}
                  <Badge variant="outline" className="text-xs ml-1">variável por cliente</Badge>
                </Label>
                <Textarea
                  rows={3}
                  placeholder="Personalize por proposta — este campo é sugestão."
                  value={values.hero_message ?? ""}
                  onChange={(e) => setField("hero_message", e.target.value || null)}
                  className="resize-none"
                />
              </div>

              <div className="space-y-1">
                <Label>URL do Vídeo (embed)</Label>
                <Input
                  placeholder="https://youtube.com/embed/..."
                  value={values.hero_video_url ?? ""}
                  onChange={(e) => setField("hero_video_url", e.target.value || null)}
                />
              </div>

              <div className="pt-2 border-t space-y-1">
                <Label>Texto do botão WhatsApp</Label>
                <Input
                  placeholder="Falar no WhatsApp"
                  value={values.hero_whatsapp_text}
                  onChange={(e) => setField("hero_whatsapp_text", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  O número do WhatsApp é definido por proposta — depende do closer responsável.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Texto do botão CTA</Label>
                  <Input
                    placeholder="Aprovar Proposta"
                    value={values.hero_cta_text}
                    onChange={(e) => setField("hero_cta_text", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Cor do botão CTA</Label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={values.hero_cta_color}
                      onChange={(e) => setField("hero_cta_color", e.target.value)}
                      className="h-9 w-12 cursor-pointer rounded border"
                    />
                    <Input
                      value={values.hero_cta_color}
                      onChange={(e) => setField("hero_cta_color", e.target.value)}
                      className="font-mono text-sm"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ABA SEÇÕES ── */}
        <TabsContent value="secoes" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Seções padrão da agência</CardTitle>
              <CardDescription>
                Conteúdo que não muda de cliente para cliente — apresentação, metodologia,
                diferenciais, cases, etc. Pré-carregado em cada nova proposta.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {STANDARD_SECTIONS.map((key) => (
                <SectionField
                  key={key}
                  sectionKey={key}
                  entry={getSectionEntry(key)}
                  onChange={handleSectionChange}
                />
              ))}
            </CardContent>
          </Card>

          {/* Informativo sobre seções variáveis */}
          <Card className="border-dashed">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                Seções editadas por proposta
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {CLIENT_SECTIONS.map((key) => (
                  <Badge key={key} variant="secondary">
                    {SECTION_LABELS[key]}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Diagnóstico, objetivos, estratégia, solução, escopo e cronograma textual
                são específicos de cada cliente e ficam no editor da proposta.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ABA CRONOGRAMA ── */}
        <TabsContent value="cronograma" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configuração padrão do cronograma</CardTitle>
              <CardDescription>
                Recorrência, número de parcelas e dia de vencimento padrão. O valor e a
                data da primeira parcela são definidos em cada proposta.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-1">
                <Label>Recorrência padrão</Label>
                <Select
                  value={values.default_recurrence}
                  onValueChange={(v) =>
                    setField(
                      "default_recurrence",
                      v as ProposalTemplateInput["default_recurrence"]
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(RECURRENCE_LABELS).map(([val, label]) => (
                      <SelectItem key={val} value={val}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Nº de parcelas padrão</Label>
                <Input
                  type="number"
                  min={1}
                  max={360}
                  value={values.default_installments}
                  onChange={(e) =>
                    setField(
                      "default_installments",
                      Math.min(360, Math.max(1, parseInt(e.target.value) || 1))
                    )
                  }
                />
              </div>

              <div className="space-y-1">
                <Label>Dia de vencimento padrão</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={values.default_due_day}
                  onChange={(e) =>
                    setField(
                      "default_due_day",
                      Math.min(31, Math.max(1, parseInt(e.target.value) || 1))
                    )
                  }
                />
                <p className="text-xs text-muted-foreground">Dia do mês (1–31).</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Botão de salvar fixo no rodapé */}
      {isDirty && (
        <div className="sticky bottom-4 flex justify-end">
          <Button onClick={handleSave} disabled={save.isPending} className="shadow-lg">
            {save.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            Salvar template
          </Button>
        </div>
      )}
    </div>
  );
}
