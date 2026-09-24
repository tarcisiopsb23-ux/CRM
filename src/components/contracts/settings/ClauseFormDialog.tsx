// src/components/contracts/settings/ClauseFormDialog.tsx
// Dialog for creating or editing a Contract Clause.
// Requirements: 2.1, 2.2

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Eye, FileEdit } from "lucide-react";
import { toast } from "sonner";
import { generateHTML } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";

import {
  contractClauseSchema,
  type ContractClauseInput,
} from "@/lib/contracts/schemas";
import { useContractClauses } from "@/hooks/useContractClauses";
import type { ContractClause, JSONContent, ServiceCatalogItem } from "@/types/contracts";
import { ClauseEditor, isClauseContentEmpty } from "./ClauseEditor";
import { VariableMention } from "@/lib/contracts/tiptapExtensions";
import { buildScopeString } from "@/lib/contracts/buildScopeString";
import { SCHEDULE_PREVIEW_HTML } from "@/lib/contracts/buildScheduleHtml";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClauseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided → edit mode; when undefined → create mode */
  clause?: ContractClause;
  organizationId: string;
  availableServices?: ServiceCatalogItem[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONDITION_TYPE_OPTIONS = [
  // ── Sempre ────────────────────────────────────────────────────────────────
  { value: "always",                       label: "Sempre exibir",                          group: "geral" },
  // ── Contrato ──────────────────────────────────────────────────────────────
  { value: "has_setup",                    label: "Contrato possui setup/implantação",       group: "contrato" },
  { value: "has_min_duration",             label: "Contrato possui prazo mínimo",            group: "contrato" },
  { value: "has_setup_installments",       label: "Setup parcelado (mais de 1×)",            group: "contrato" },
  { value: "has_schedule",                 label: "Contrato possui cronograma de pagamento", group: "contrato" },
  { value: "has_grace_period",             label: "Contrato possui carência",                group: "contrato" },
  // ── Serviço ───────────────────────────────────────────────────────────────
  { value: "has_service",                  label: "Serviço específico incluído (por ID)",    group: "servico" },
  { value: "service",                      label: "Serviço incluído (por slug)",             group: "servico" },
  { value: "service_count",                label: "Nº de serviços ≥ mínimo",                group: "servico" },
  // ── Assinatura / representantes ───────────────────────────────────────────
  { value: "has_multiple_representatives", label: "Assinatura conjunta",                    group: "assinatura" },
  { value: "signing_type",                 label: "Tipo de assinatura específico",           group: "assinatura" },
  { value: "has_procurador",               label: "Contratante possui procurador",           group: "assinatura" },
  // ── Tipo de pessoa ────────────────────────────────────────────────────────
  { value: "is_pj",                        label: "Contratante é Pessoa Jurídica (CNPJ)",    group: "pessoa" },
  { value: "is_pf",                        label: "Contratante é Pessoa Física (CPF)",       group: "pessoa" },
] as const;

const CONDITION_GROUP_LABELS: Record<string, string> = {
  geral:      "Geral",
  contrato:   "Contrato",
  servico:    "Serviço",
  assinatura: "Assinatura / Representantes",
  pessoa:     "Tipo de Pessoa",
};

// ---------------------------------------------------------------------------
// ClausePreview — renders the clause in the same visual format as the contract
// ---------------------------------------------------------------------------

const PREVIEW_EXTENSIONS = [StarterKit, Underline, VariableMention];

// Build realistic service scope strings using the same buildScopeString logic
const PREVIEW_SERVICES = [
  {
    service_id: "ex-1",
    service_name: "Assessoria de Marketing Digital",
    selected_deliverables: [
      { deliverable_id: "d1", included: true, number_value: 4, period: "mes" as const, deadline_type: null, deadline_value: null, execution_format: null },
      { deliverable_id: "d2", included: true, number_value: null, period: null, deadline_type: "dias" as const, deadline_value: 30, execution_format: null },
    ],
  },
  {
    service_id: "ex-2",
    service_name: "Agente de IA",
    selected_deliverables: [
      { deliverable_id: "d3", included: true, number_value: null, period: null, deadline_type: null, deadline_value: null, execution_format: null },
    ],
  },
];

// Catalog map with deliverable metadata for rich output
const PREVIEW_CATALOG = new Map([
  ["d1", { id: "d1", name: "Relatório de performance", delivery_type: "recorrente" as const, output_format: "numero" as const, unit: "relatório", unit_plural: "relatórios" }],
  ["d2", { id: "d2", name: "Setup inicial", delivery_type: "unico" as const, output_format: "texto" as const, text_value: "Configuração inicial da conta e estrutura de campanhas." }],
  ["d3", { id: "d3", name: "Licença de acesso", delivery_type: "recorrente" as const, output_format: "texto" as const, text_value: "Licença ativa durante toda a vigência do contrato." }],
]);

// Catalog items with modality + scope
const PREVIEW_CATALOG_ITEMS = new Map([
  ["ex-1", {
    id: "ex-1", organization_id: "", name: "Assessoria de Marketing Digital", slug: "", category: "",
    modality: "Híbrida (consultiva e executiva)" as const,
    scope: "Planejamento estratégico, gestão de campanhas, acompanhamento de indicadores e otimizações contínuas.",
    deliverables: [
      { id: "d1", name: "Relatório de performance", delivery_type: "recorrente" as const, output_format: "numero" as const, unit: "relatório", unit_plural: "relatórios" },
      { id: "d2", name: "Setup inicial", delivery_type: "unico" as const, output_format: "texto" as const, text_value: "Configuração inicial da conta e estrutura de campanhas." },
    ],
    sub_services: [], display_order: 0, created_at: "", updated_at: "",
  }],
  ["ex-2", {
    id: "ex-2", organization_id: "", name: "Agente de IA", slug: "", category: "",
    modality: "Executiva" as const,
    scope: "Implementação e gestão do agente de atendimento automatizado via WhatsApp.",
    deliverables: [
      { id: "d3", name: "Licença de acesso", delivery_type: "recorrente" as const, output_format: "texto" as const, text_value: "Licença ativa durante toda a vigência do contrato." },
    ],
    sub_services: [], display_order: 1, created_at: "", updated_at: "",
  }],
]);

const PREVIEW_SCOPE = buildScopeString(PREVIEW_SERVICES, PREVIEW_CATALOG, PREVIEW_CATALOG_ITEMS);
const PREVIEW_LISTA = PREVIEW_SERVICES.map((s) => `• ${s.service_name}`).join("\n");

/**
 * Sample values used in preview mode so the user can see realistic output
 * instead of raw {{variable}} chips.
 */
const PREVIEW_VARS: Record<string, string> = {
  cliente:                  "João da Silva",
  empresa:                  "Empresa Exemplo Ltda",
  cnpj:                     "00.000.000/0001-00",
  cpf:                      "000.000.000-00",
  qualificacao_contratante: "EMPRESA EXEMPLO LTDA, pessoa jurídica de direito privado, inscrita no CNPJ sob nº 00.000.000/0001-00, com sede na Rua Exemplo, 123, São Paulo/SP",
  representante_nome:       "João da Silva",
  representante_cpf:        "000.000.000-00",
  contratante_endereco:     "Rua Exemplo, 123, São Paulo/SP",
  servicos:                 PREVIEW_SCOPE,
  escopo:                   PREVIEW_SCOPE,
  lista_servicos:           PREVIEW_LISTA,
  valor:                    "R$ 3.000,00",
  valor_mensalidade:        "R$ 3.000,00",
  forma_pagamento:          "PIX",
  dia_vencimento:           "10",
  vencimento:               "10/08/2025",
  chave_pix:                "financeiro@agenciac8.com.br",
  valor_setup:              "R$ 1.500,00",
  parcelas_setup:           "3",
  parcela_setup:            "R$ 500,00",
  taxa_setup:               "0%",
  vencimento_setup:         "10/08/2025",
  forma_pagamento_setup:    "PIX",
  vigencia_inicio:          "01/08/2025",
  vigencia_fim:             "31/07/2026",
  prazo_minimo:             "12",
  prazo_minimo_extenso:     "doze (12) meses",
  prazo_vigencia_extenso:   "doze (12) meses",
  carencia_meses:           "1",
  carencia_extenso:         "um (1) mês",
  data:                     new Date().toLocaleDateString("pt-BR"),
  data_assinatura:          new Date().toLocaleDateString("pt-BR"),
  cidade_estado:            "São Paulo/SP",
  foro_cidade:              "São Paulo/SP",
  cronograma:               "",
  cronograma_pagamento:     SCHEDULE_PREVIEW_HTML,
  texto_pagamento:          'Os pagamentos serão realizados exclusivamente via PIX (Chave CNPJ nº <strong>62.659.676/0001-49 – Agência C8 LTDA</strong>), vencendo-se a primeira parcela em <strong>10 de agosto de 2025</strong> e as demais no dia <strong>10</strong> de cada mês, sendo a adimplência condição indispensável para a continuidade da prestação dos serviços.',
  consultor:                "",
  primeiro_pagamento:       "10/08/2025",
  bloco_assinaturas:        "__SIGNATURE_BLOCK__",
};

/** Replaces {{variable}} tokens with preview sample values */
function applyPreviewVars(html: string): string {
  return html.replace(/\{\{([a-z_]{1,50})\}\}/g, (_match, name) => {
    const val = PREVIEW_VARS[name];
    if (val === "__SIGNATURE_BLOCK__") return renderPreviewSignatureBlock();
    if (val === undefined) {
      return `<span style="background:#fef3c7;color:#92400e;padding:0 3px;border-radius:3px;font-size:0.85em">{{${name}}}</span>`;
    }
    // servicos/escopo/lista_servicos are already HTML — don't convert newlines
    if (name === "servicos" || name === "escopo" || name === "lista_servicos") return val;
    return val.replace(/\n/g, "<br>");
  });
}

/** Renders a sample signature block identical in structure to the real one */
function renderPreviewSignatureBlock(): string {
  return `
<table style="width:100%;margin-top:36pt;border-collapse:collapse">
  <tbody>
    <tr>
      <td style="width:50%;text-align:center;padding:0 16pt;vertical-align:top;border:none">
        <p style="text-align:center"><strong>CONTRATADA</strong></p>
        <p style="text-align:center"><strong>AGÊNCIA C8 LTDA</strong></p>
        <p style="border-bottom:1px solid #000;margin:24pt 0 4pt">&nbsp;</p>
        <p style="text-align:center">Tarcísio Pereira da Silva Brito</p>
        <p style="text-align:center">Sócio-Administrador</p>
        <p style="text-align:center">CPF: 089.712.156-23</p>
      </td>
      <td style="width:50%;text-align:center;padding:0 16pt;vertical-align:top;border:none">
        <p style="text-align:center"><strong>CONTRATANTE</strong></p>
        <p style="text-align:center"><strong>EMPRESA EXEMPLO LTDA</strong></p>
        <p style="border-bottom:1px solid #000;margin:24pt 0 4pt">&nbsp;</p>
        <p style="text-align:center">João da Silva</p>
        <p style="text-align:center">Sócio-Administrador</p>
        <p style="text-align:center">CPF: 000.000.000-00</p>
      </td>
    </tr>
  </tbody>
</table>`;
}

interface ClausePreviewProps {
  title: string;
  content: JSONContent | undefined | null;
}

function ClausePreview({ title, content }: ClausePreviewProps) {
  let rawHtml = "";
  if (
    content &&
    typeof content === "object" &&
    (content as { type?: string }).type === "doc"
  ) {
    try {
      rawHtml = generateHTML(
        content as Parameters<typeof generateHTML>[0],
        PREVIEW_EXTENSIONS
      );
    } catch {
      rawHtml = "<em>Não foi possível renderizar o conteúdo.</em>";
    }
  }

  // Strip variable-chip wrapper spans → restore {{variable}} tokens → substitute
  const strippedHtml = rawHtml.replace(
    /<span[^>]*class="[^"]*variable-chip[^"]*"[^>]*>([^<]*)<\/span>/g,
    (_match, inner: string) => `{{${inner.replace(/^\{\{|\}\}$/g, "")}}}`,
  );

  // For block-level variables (servicos/escopo/lista_servicos), replace the
  // entire <p> that contains only the variable so block HTML doesn't nest inside <p>
  const withBlockVarsExtracted = strippedHtml.replace(
    /<p[^>]*>\s*(\{\{(servicos|escopo|lista_servicos)\}\})\s*<\/p>/g,
    (_match, token) => `__BLOCK__${token}__BLOCK__`
  );

  const renderedHtml = applyPreviewVars(withBlockVarsExtracted)
    // Clean up the block markers — the variable was already replaced with HTML
    .replace(/__BLOCK__([\s\S]*?)__BLOCK__/g, '$1');

  return (
    <div className="rounded-md border border-border overflow-hidden shadow-sm">
      {/* Contract-style render */}
      <div className="bg-white text-black px-10 py-8">
        {title && (
          <p className="font-semibold text-sm mb-3 leading-snug">{title}</p>
        )}
        {rawHtml ? (
          <div
            className="prose prose-sm max-w-none text-sm text-black leading-relaxed
              [&_p]:my-1.5 [&_strong]:font-semibold [&_em]:italic [&_u]:underline
              [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5
              [&_table]:w-full [&_table]:border-collapse [&_td]:border-0 [&_td]:p-0"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        ) : (
          <p className="text-sm italic text-gray-400">
            Conteúdo vazio — escreva algo no editor para ver o preview.
          </p>
        )}
      </div>
      <div className="bg-muted/40 border-t border-border px-4 py-1.5">
        <p className="text-[11px] text-muted-foreground">
          Valores de exemplo — o conteúdo real depende dos dados do contrato
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ClauseFormDialog({
  open,
  onOpenChange,
  clause,
  organizationId,
  availableServices = [],
}: ClauseFormDialogProps) {
  const isEditing = !!clause;
  const { createClause, updateClause } = useContractClauses(organizationId);

  // Tracks whether the TipTap editor is empty (content is z.any(), not tracked by RHF)
  const [isContentEmpty, setIsContentEmpty] = useState(true);

  // Toggle between edit and preview modes
  const [showPreview, setShowPreview] = useState(false);

  const form = useForm<ContractClauseInput>({
    resolver: zodResolver(contractClauseSchema),
    defaultValues: {
      title: "",
      content: undefined,
      condition_type: "always",
      condition_value: null,
      is_editable: false,
      service_id: null,
    },
  });

  // Reset form (and preview state) when the dialog opens or the clause changes
  useEffect(() => {
    if (open) {
      setShowPreview(false);
      if (clause) {
        form.reset({
          title: clause.title,
          content: clause.content,
          condition_type: clause.condition_type,
          condition_value: clause.condition_value,
          is_editable: clause.is_editable,
          service_id: clause.service_id,
        });
        setIsContentEmpty(isClauseContentEmpty(clause.content));
      } else {
        form.reset({
          title: "",
          content: undefined,
          condition_type: "always",
          condition_value: null,
          is_editable: false,
          service_id: null,
        });
        setIsContentEmpty(true);
      }
    }
  }, [open, clause, form]);

  // Watch condition_type to show/hide auxiliary fields
  const conditionType = form.watch("condition_type");
  const showServiceSelector   = conditionType === "has_service";
  const showServiceSlugInput  = conditionType === "service";
  const showServiceCountInput = conditionType === "service_count";
  const showSigningTypeInput  = conditionType === "signing_type";

  // Live values for the preview panel
  const watchedTitle   = form.watch("title");
  const watchedContent = form.watch("content") as JSONContent | undefined;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const onSubmit = async (values: ContractClauseInput) => {
    if (isContentEmpty) return;

    // The Zod schema guarantees condition_value shape at runtime; cast to the
    // canonical ContractClauseConditionValue type for the hook.
    const conditionValue = (values.condition_value ?? null) as ContractClause["condition_value"];

    try {
      if (isEditing && clause) {
        await updateClause.mutateAsync({
          id: clause.id,
          title: values.title,
          content: values.content,
          condition_type: values.condition_type,
          condition_value: conditionValue,
          is_editable: values.is_editable,
          service_id: values.service_id ?? null,
        });
        toast.success("Cláusula atualizada com sucesso.");
      } else {
        await createClause.mutateAsync({
          title: values.title,
          content: values.content,
          condition_type: values.condition_type,
          condition_value: conditionValue,
          is_editable: values.is_editable,
          service_id: values.service_id ?? null,
        });
        toast.success("Cláusula criada com sucesso.");
      }
      onOpenChange(false);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Erro ao salvar cláusula.";
      toast.error(message);
    }
  };

  const isBusy        = createClause.isPending || updateClause.isPending;
  const isSaveDisabled = isBusy || isContentEmpty;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!isBusy) onOpenChange(o);
      }}
    >
      {/* hideCloseButton remove o X nativo do Shadcn que sobrepõe o Salvar */}
      <DialogContent
        className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden"
        hideCloseButton
      >
        {/* ── Header fixo ── */}
        <DialogHeader className="px-6 pt-5 pb-0 shrink-0">
          <div className="flex items-center justify-between gap-3 mb-4">
            <DialogTitle className="text-base">
              {isEditing ? "Editar Alínea" : "Nova Alínea"}
            </DialogTitle>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={isBusy}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={isSaveDisabled}
                onClick={form.handleSubmit(onSubmit)}
                title={isContentEmpty ? "Adicione conteúdo antes de salvar." : undefined}
              >
                {isBusy ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Salvando...</>
                ) : (
                  "Salvar"
                )}
              </Button>
            </div>
          </div>

          {/* ── Abas Conteúdo / Preview ── */}
          <div className="flex border-b border-border -mb-px">
            <button
              type="button"
              onClick={() => setShowPreview(false)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                !showPreview
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <FileEdit className="h-3.5 w-3.5" />
              Conteúdo
            </button>
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                showPreview
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              Preview
            </button>
          </div>
        </DialogHeader>

        {/* ── Corpo scrollável ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── ABA PREVIEW ── */}
          {showPreview && (
            <ClausePreview title={watchedTitle} content={watchedContent} />
          )}

          {/* ── ABA CONTEÚDO ── */}
          {!showPreview && (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

                {/* Título */}
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Título <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Ex: Cláusula de Confidencialidade"
                          disabled={isBusy}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Conteúdo */}
                <FormField
                  control={form.control}
                  name="content"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Conteúdo <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <ClauseEditor
                          value={field.value}
                          onChange={(json) => field.onChange(json)}
                          onEmptyChange={setIsContentEmpty}
                          availableServices={availableServices}
                          disabled={isBusy}
                        />
                      </FormControl>
                      {isContentEmpty && form.formState.isSubmitted && (
                        <p className="text-sm font-medium text-destructive">
                          O conteúdo da alínea é obrigatório.
                        </p>
                      )}
                    </FormItem>
                  )}
                />

                {/* Tipo de condição */}
                <FormField
                  control={form.control}
                  name="condition_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Condição de inclusão</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(val) => {
                          field.onChange(val);
                          form.setValue("service_id", null, { shouldValidate: true });
                          form.setValue("condition_value", null, { shouldValidate: true });
                        }}
                        disabled={isBusy}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o tipo de condição" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(["geral", "contrato", "servico", "assinatura", "pessoa"] as const).map(
                            (grp) => {
                              const opts = CONDITION_TYPE_OPTIONS.filter((o) => o.group === grp);
                              if (opts.length === 0) return null;
                              return (
                                <SelectGroup key={grp}>
                                  <SelectLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                    {CONDITION_GROUP_LABELS[grp]}
                                  </SelectLabel>
                                  {opts.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              );
                            }
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Serviço vinculado — has_service */}
                {showServiceSelector && (
                  <FormField
                    control={form.control}
                    name="service_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Serviço vinculado <span className="text-destructive">*</span>
                        </FormLabel>
                        <Select
                          value={field.value ?? ""}
                          onValueChange={(val) => field.onChange(val === "" ? null : val)}
                          disabled={isBusy}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o serviço" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {availableServices.length === 0 ? (
                              <SelectItem value="_empty" disabled>
                                Nenhum serviço disponível
                              </SelectItem>
                            ) : (
                              availableServices.map((svc) => (
                                <SelectItem key={svc.id} value={svc.id}>
                                  {svc.name}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Slugs — condition_type = 'service' */}
                {showServiceSlugInput && (
                  <FormField
                    control={form.control}
                    name="condition_value"
                    render={({ field }) => {
                      const currentSlugs =
                        (field.value as { slugs?: string[] } | null)?.slugs ?? [];
                      return (
                        <FormItem>
                          <FormLabel>
                            Slugs dos serviços <span className="text-destructive">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Ex: agente_ia, assessoria"
                              value={currentSlugs.join(", ")}
                              onChange={(e) => {
                                const slugs = e.target.value
                                  .split(",")
                                  .map((s) => s.trim())
                                  .filter(Boolean);
                                field.onChange(slugs.length ? { slugs } : null);
                              }}
                              disabled={isBusy}
                            />
                          </FormControl>
                          <p className="text-xs text-muted-foreground">
                            Separe múltiplos slugs por vírgula.
                          </p>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                )}

                {/* Nº mínimo de serviços */}
                {showServiceCountInput && (
                  <FormField
                    control={form.control}
                    name="condition_value"
                    render={({ field }) => {
                      const minVal =
                        (field.value as { min?: number } | null)?.min ?? 1;
                      return (
                        <FormItem>
                          <FormLabel>
                            Nº mínimo de serviços <span className="text-destructive">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              value={minVal}
                              onChange={(e) => {
                                const n = parseInt(e.target.value, 10);
                                field.onChange(isNaN(n) ? null : { min: n });
                              }}
                              disabled={isBusy}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                )}

                {/* Tipo de assinatura */}
                {showSigningTypeInput && (
                  <FormField
                    control={form.control}
                    name="condition_value"
                    render={({ field }) => {
                      const typeVal =
                        (field.value as { type?: string } | null)?.type ?? "individual";
                      return (
                        <FormItem>
                          <FormLabel>
                            Tipo de assinatura <span className="text-destructive">*</span>
                          </FormLabel>
                          <Select
                            value={typeVal}
                            onValueChange={(val) => field.onChange({ type: val })}
                            disabled={isBusy}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="individual">Individual</SelectItem>
                              <SelectItem value="joint">Conjunta</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                )}

                {/* Editável pelo consultor */}
                <Controller
                  control={form.control}
                  name="is_editable"
                  render={({ field }) => (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="is_editable"
                        checked={field.value}
                        onCheckedChange={(checked) => field.onChange(checked === true)}
                        disabled={isBusy}
                      />
                      <Label
                        htmlFor="is_editable"
                        className="text-sm font-normal cursor-pointer"
                      >
                        Editável pelo consultor
                      </Label>
                    </div>
                  )}
                />
              </form>
            </Form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
