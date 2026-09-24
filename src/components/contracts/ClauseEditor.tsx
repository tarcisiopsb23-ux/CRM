/**
 * ClauseEditor
 * Editor de uma alínea de cláusula.
 *
 * Permite:
 *  - Definir a categoria (qual cláusula do contrato ela pertence)
 *  - Se é fixa (entra em todo contrato) ou vinculada a um serviço específico
 *  - Título interno (não aparece no documento)
 *  - Conteúdo HTML com variáveis {{var}}
 *  - Ordem dentro da categoria
 */
import { useState, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { liftListItem, sinkListItem } from "prosemirror-schema-list";
import { IndentExtension } from "@/lib/tiptap/IndentExtension";
import { AlphaListExtension } from "@/lib/tiptap/AlphaListExtension";
import { tableExtensions } from "@/lib/tiptap/tableExtensions";
import { TableToolbar } from "@/components/contracts/TableToolbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, Heading2,
  Undo, Redo, Save, FileText, Wand2, Loader2, Lock, Unlock,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Indent, Outdent, Eye,
} from "lucide-react";
import { toast } from "sonner";
import { useClauseCategories } from "@/hooks/useContractTemplates";
import { useServiceCatalog } from "@/hooks/useServiceCatalog";
import { useOrganization } from "@/hooks/useOrganization";
import type { ContractClause } from "@/hooks/useContractTemplates";
import { buildScopeString } from "@/lib/contracts/buildScopeString";
import { generateHTML } from "@tiptap/html";

// Variáveis disponíveis nas alíneas
const CLAUSE_VARIABLES = [
  // Numeração — apenas níveis 2, 3 e 4 (nível 1 = num_clausula é automático)
  { key: "num_item",    label: "Nível 2 — Item (ex: 1.1, 1.2…) — baseado na cláusula atual",  group: "Numeração" },
  { key: "num_subitem", label: "Nível 3 — Subitem (ex: 1.1.1…) — baseado no item atual",       group: "Numeração" },
  { key: "num_detalhe", label: "Nível 4 — Detalhe (ex: 1.1.1.1…) — baseado no subitem atual", group: "Numeração" },

  // Qualificação dinâmica (PF/PJ + representantes + procuradores)
  { key: "qualificacao_contratante", label: "Qualificação completa do contratante (PF/PJ + representantes)", group: "Partes" },
  // Partes — identificação
  { key: "contratante_razao_social", label: "Razão Social / Nome do Contratante",   group: "Partes" },
  { key: "contratante_cnpj",         label: "CNPJ / CPF do Contratante",            group: "Partes" },
  { key: "contratante_endereco",     label: "Endereço do Contratante",              group: "Partes" },
  { key: "cliente",                  label: "Nome do cliente / responsável",         group: "Partes" },
  { key: "empresa",                  label: "Razão social da empresa",               group: "Partes" },
  { key: "cnpj",                     label: "CNPJ (formatado)",                      group: "Partes" },
  { key: "cpf",                      label: "CPF (formatado)",                       group: "Partes" },
  // Partes — representantes legais (legado)
  { key: "representante_nome",             label: "Nome do 1º Representante",                        group: "Representantes" },
  { key: "representante_cpf",              label: "CPF do 1º Representante",                         group: "Representantes" },
  { key: "representante_2_nome",           label: "2º Representante — Nome",                        group: "Representantes" },
  { key: "representante_2_cpf",            label: "2º Representante — CPF",                         group: "Representantes" },
  { key: "representante_3_nome",           label: "3º Representante — Nome",                        group: "Representantes" },
  { key: "representante_3_cpf",            label: "3º Representante — CPF",                         group: "Representantes" },
  { key: "representante_qualificacao",     label: "Qualificação completa (todos os representantes)", group: "Representantes" },
  { key: "representante_qualificacao_cargo",label: "Qualificação/cargo do representante principal",  group: "Representantes" },
  { key: "tipo_assinatura",               label: "Tipo de assinatura (individual / conjunta)",       group: "Representantes" },

  // Vigência
  { key: "prazo_vigencia_meses",     label: "Prazo em meses (número)",                    group: "Vigência" },
  { key: "prazo_vigencia_dias",      label: "Prazo em dias (número)",                      group: "Vigência" },
  { key: "prazo_vigencia_extenso",   label: "Prazo por extenso (ex: doze (12) meses)",     group: "Vigência" },
  { key: "prazo_minimo",             label: "Prazo mínimo em meses (número)",              group: "Vigência" },
  { key: "prazo_minimo_meses",       label: "Prazo mínimo de permanência (meses)",         group: "Vigência" },
  { key: "prazo_minimo_extenso",     label: "Prazo mínimo por extenso (ex: doze (12) meses)", group: "Vigência" },
  { key: "vigencia_inicio",          label: "Data de início da vigência",                  group: "Vigência" },
  { key: "vigencia_fim",             label: "Data de término da vigência (calculada)",      group: "Vigência" },
  { key: "data_inicio",              label: "Data de início do contrato",                  group: "Vigência" },
  { key: "data_assinatura",          label: "Data de assinatura",                          group: "Vigência" },
  { key: "data_inicio_vigencia",     label: "Data de início da vigência (extenso)",        group: "Vigência" },
  { key: "data_fim_vigencia",        label: "Data de término da vigência (extenso)",       group: "Vigência" },
  { key: "carencia_meses",           label: "Meses de carência (número)",                  group: "Vigência" },
  { key: "carencia_extenso",         label: "Carência por extenso (ex: três (3) meses)",   group: "Vigência" },

  // Financeiro
  { key: "valor",                    label: "Valor total do contrato (R$)",                group: "Financeiro" },
  { key: "valor_mensalidade",        label: "Valor da mensalidade recorrente (R$)",        group: "Financeiro" },
  { key: "valor_setup",              label: "Valor de setup / implantação (R$)",           group: "Financeiro" },
  { key: "parcelas_setup",           label: "Número de parcelas do setup",                 group: "Financeiro" },
  { key: "parcela_setup",            label: "Valor de cada parcela do setup (R$)",         group: "Financeiro" },
  { key: "taxa_setup",               label: "Taxa/juros do setup (%)",                     group: "Financeiro" },
  { key: "forma_pagamento",          label: "Forma de pagamento recorrente (ex: PIX)",     group: "Financeiro" },
  { key: "forma_pagamento_recorrente", label: "Forma de pagamento recorrente (alias)",      group: "Financeiro" },
  { key: "forma_pagamento_setup",    label: "Forma de pagamento do setup",                 group: "Financeiro" },
  { key: "chave_pix",                label: "Chave PIX da contratada",                     group: "Financeiro" },
  { key: "vencimento",               label: "Data de vencimento do 1º pagamento",          group: "Financeiro" },
  { key: "dia_vencimento",           label: "Dia do mês para vencimento recorrente (ex: 20)", group: "Financeiro" },
  { key: "primeiro_pagamento",       label: "Data do primeiro pagamento",                  group: "Financeiro" },
  { key: "primeiro_vencimento",      label: "Primeiro vencimento do cronograma (qualquer tipo)", group: "Financeiro" },
  { key: "vencimento_primeira_mensalidade", label: "Vencimento da 1ª mensalidade recorrente", group: "Financeiro" },
  { key: "cronograma_pagamento",     label: "Bloco do cronograma de pagamento",            group: "Financeiro" },
  { key: "texto_pagamento",          label: "Frase completa de pagamento (via PIX/boleto + chave + datas)", group: "Financeiro" },
  { key: "clausula_multa_atraso",    label: "Cláusula de multa por atraso",                group: "Financeiro" },
  { key: "clausula_suspensao",       label: "Cláusula de suspensão por inadimplência",     group: "Financeiro" },

  // Serviços
  { key: "lista_servicos",           label: "Lista de serviços contratados (HTML)",        group: "Serviços" },
  { key: "servicos",                 label: "Lista de serviços (alias)",                   group: "Serviços" },
  { key: "escopo",                   label: "Escopo dos serviços (alias)",                 group: "Serviços" },
  { key: "servico_principal",        label: "Nome do serviço principal",                   group: "Serviços" },
  { key: "servico_principal_slug",   label: "Identificador (slug) do serviço principal",   group: "Serviços" },

  // Local
  { key: "cidade_estado",            label: "Cidade e Estado (ex: São Paulo/SP)",          group: "Local" },
  { key: "foro_cidade",              label: "Cidade do Foro",                              group: "Local" },
  { key: "data",                     label: "Data atual",                                   group: "Local" },

  // Assinatura
  { key: "bloco_assinaturas", label: "Bloco completo de assinaturas (partes + testemunhas)", group: "Assinatura" },

  // Garantias
  { key: "garantias",                label: "Tabela completa de garantias (HTML)",          group: "Garantias" },
  { key: "garantias_lista",          label: "Garantias em texto corrido (narrativa)",       group: "Garantias" },
  { key: "garantias_count",          label: "Número de garantias",                          group: "Garantias" },
  { key: "garantia_1_kpi",           label: "Garantia 1 — Nome da KPI",                    group: "Garantias" },
  { key: "garantia_1_crescimento",   label: "Garantia 1 — Meta de crescimento (%)",         group: "Garantias" },
  { key: "garantia_1_prazo",         label: "Garantia 1 — Prazo (data)",                   group: "Garantias" },
  { key: "garantia_1_base",          label: "Garantia 1 — Valor base",                     group: "Garantias" },
  { key: "garantia_2_kpi",           label: "Garantia 2 — Nome da KPI",                    group: "Garantias" },
  { key: "garantia_2_crescimento",   label: "Garantia 2 — Meta de crescimento (%)",         group: "Garantias" },
  { key: "garantia_2_prazo",         label: "Garantia 2 — Prazo (data)",                   group: "Garantias" },
  { key: "garantia_2_base",          label: "Garantia 2 — Valor base",                     group: "Garantias" },
  { key: "garantia_3_kpi",           label: "Garantia 3 — Nome da KPI",                    group: "Garantias" },
  { key: "garantia_3_crescimento",   label: "Garantia 3 — Meta de crescimento (%)",         group: "Garantias" },
  { key: "garantia_3_prazo",         label: "Garantia 3 — Prazo (data)",                   group: "Garantias" },
  { key: "garantia_3_base",          label: "Garantia 3 — Valor base",                     group: "Garantias" },
];

const VAR_GROUPS = [...new Set(CLAUSE_VARIABLES.map(v => v.group))];

// ---------------------------------------------------------------------------
// Preview helpers (valores de exemplo para substituição)
// ---------------------------------------------------------------------------

const _PREVIEW_SERVICES = [
  {
    service_id: "ex-1",
    service_name: "Assessoria de Marketing Digital",
    selected_deliverables: [
      { deliverable_id: "d1", included: true, number_value: 4, period: "mes" as const, deadline_type: null, deadline_value: null, execution_format: "consultivo" as const },
      { deliverable_id: "d2", included: true, number_value: null, period: null, deadline_type: "dias" as const, deadline_value: 30, execution_format: "executivo" as const },
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

const _PREVIEW_DEL_MAP = new Map([
  ["d1", { id: "d1", name: "Relatório de performance", delivery_type: "recorrente" as const, output_format: "numero" as const, unit: "relatório", unit_plural: "relatórios" }],
  ["d2", { id: "d2", name: "Setup inicial", delivery_type: "unico" as const, output_format: "texto" as const, text_value: "Configuração inicial da conta e estrutura de campanhas." }],
  ["d3", { id: "d3", name: "Licença de acesso", delivery_type: "recorrente" as const, output_format: "texto" as const, text_value: "Licença ativa durante toda a vigência do contrato." }],
]);

const _PREVIEW_ITEM_MAP = new Map([
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

const _PREVIEW_SCOPE = buildScopeString(_PREVIEW_SERVICES, _PREVIEW_DEL_MAP, _PREVIEW_ITEM_MAP);

const PREVIEW_VARS: Record<string, string> = {
  num_item: "1.1", num_subitem: "1.1.1", num_detalhe: "1.1.1.1",
  qualificacao_contratante: "EMPRESA EXEMPLO LTDA, inscrita no CNPJ sob nº 00.000.000/0001-00",
  contratante_razao_social: "Empresa Exemplo Ltda", contratante_cnpj: "00.000.000/0001-00",
  contratante_endereco: "Rua Exemplo, 123, São Paulo/SP",
  cliente: "João da Silva", empresa: "Empresa Exemplo Ltda",
  cnpj: "00.000.000/0001-00", cpf: "000.000.000-00",
  representante_nome: "João da Silva", representante_cpf: "000.000.000-00",
  servicos: _PREVIEW_SCOPE, escopo: _PREVIEW_SCOPE,
  lista_servicos: "• Assessoria de Marketing Digital\n• Agente de IA",
  valor: "R$ 3.000,00", valor_mensalidade: "R$ 3.000,00",
  valor_setup: "R$ 1.500,00", parcelas_setup: "3",
  parcela_setup: "R$ 500,00", taxa_setup: "0%",
  forma_pagamento: "PIX", forma_pagamento_setup: "PIX",
  forma_pagamento_recorrente: "PIX", chave_pix: "financeiro@agenciac8.com.br",
  vencimento: "10/08/2025", dia_vencimento: "10", primeiro_pagamento: "10/08/2025",
  vencimento_setup: "10/08/2025",
  prazo_minimo: "12", prazo_minimo_meses: "12",
  prazo_minimo_extenso: "doze (12) meses", prazo_vigencia_extenso: "doze (12) meses",
  prazo_vigencia_meses: "12", prazo_vigencia_dias: "365",
  vigencia_inicio: "01/08/2025", vigencia_fim: "31/07/2026",
  data_inicio: "01/08/2025", data_assinatura: new Date().toLocaleDateString("pt-BR"),
  data: new Date().toLocaleDateString("pt-BR"),
  carencia_meses: "1", carencia_extenso: "um (1) mês",
  cidade_estado: "São Paulo/SP", foro_cidade: "São Paulo/SP",
  cronograma_pagamento: "",
  bloco_assinaturas: `<table style="width:100%;margin-top:24pt;border-collapse:collapse"><tbody><tr>
    <td style="width:50%;text-align:center;padding:0 12pt;vertical-align:top;border:none">
      <p style="text-align:center"><strong>CONTRATADA</strong></p>
      <p style="text-align:center"><strong>AGÊNCIA C8 LTDA</strong></p>
      <p style="border-bottom:1px solid #000;margin:20pt 0 4pt">&nbsp;</p>
      <p style="text-align:center">Tarcísio Pereira da Silva Brito</p>
      <p style="text-align:center">Sócio-Administrador · CPF: 089.712.156-23</p>
    </td>
    <td style="width:50%;text-align:center;padding:0 12pt;vertical-align:top;border:none">
      <p style="text-align:center"><strong>CONTRATANTE</strong></p>
      <p style="text-align:center"><strong>EMPRESA EXEMPLO LTDA</strong></p>
      <p style="border-bottom:1px solid #000;margin:20pt 0 4pt">&nbsp;</p>
      <p style="text-align:center">João da Silva</p>
      <p style="text-align:center">Sócio-Administrador · CPF: 000.000.000-00</p>
    </td>
  </tr></tbody></table>`,
};

function applyPreviewVars(html: string): string {
  return html.replace(/\{\{([a-z_0-9]{1,60})\}\}/g, (_m, name: string) => {
    const val = PREVIEW_VARS[name];
    if (val === undefined) {
      return `<span style="background:#fef3c7;color:#92400e;padding:0 2px;border-radius:2px;font-size:0.85em">{{${name}}}</span>`;
    }
    // servicos/escopo/lista_servicos are already HTML — don't convert newlines
    if (name === "servicos" || name === "escopo" || name === "lista_servicos") return val;
    return val.replace(/\n/g, "<br>");
  });
}

interface Props {
  clause: Partial<ContractClause> & { category_key: string; is_fixed: boolean; depth?: number; parent_id?: string | null; marker_type?: ContractClause['marker_type'] };
  onSave: (data: Partial<ContractClause> & { category_key: string; html_content: string; is_fixed: boolean }) => Promise<void>;
  onClose: () => void;
  isSaving: boolean;
  /** Título do nó pai — exibido como contexto quando depth > 0 */
  parentTitle?: string;
}

function Toolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;
  const btn = (action: () => void, icon: React.ReactNode, label: string, active = false) => (
    <button type="button" onClick={action} title={label}
      className={`p-1.5 rounded hover:bg-muted transition-colors ${active ? "bg-muted" : ""}`}>
      {icon}
    </button>
  );

  // Inserir letra com recuo automático (a), b), c)...) — toggle
  const insertAlphaItem = () => editor.commands.toggleAlphaList();

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b px-2 py-1.5 bg-background sticky top-0 z-10">
      {/* Formatação básica */}
      {btn(() => editor.chain().focus().toggleBold().run(),       <Bold className="h-4 w-4" />,          "Negrito",  editor.isActive("bold"))}
      {btn(() => editor.chain().focus().toggleItalic().run(),     <Italic className="h-4 w-4" />,        "Itálico",  editor.isActive("italic"))}
      {btn(() => editor.chain().focus().toggleUnderline().run(),  <UnderlineIcon className="h-4 w-4" />, "Sublinhado", editor.isActive("underline"))}
      <div className="w-px h-5 bg-border mx-1" />

      {/* Título */}
      {btn(() => editor.chain().focus().toggleHeading({ level: 2 }).run(), <Heading2 className="h-4 w-4" />, "Título", editor.isActive("heading", { level: 2 }))}
      <div className="w-px h-5 bg-border mx-1" />

      {/* Listas */}
      {btn(() => editor.chain().focus().toggleBulletList().run(),  <List className="h-4 w-4" />,        "Lista com • (bullet)",    editor.isActive("bulletList"))}
      {btn(() => editor.chain().focus().toggleOrderedList().run(), <ListOrdered className="h-4 w-4" />, "Lista numerada (1. 2. 3.)", editor.isActive("orderedList"))}
      {/* Letra: a) b) c) */}
      {/* Letra: a) b) c) — toggle com estado ativo */}
      <button
        type="button"
        onClick={insertAlphaItem}
        title="Marcador de letra a) b) c)... (toggle)"
        className={`p-1.5 rounded hover:bg-muted transition-colors text-xs font-bold ${
          editor.isActive("paragraph") &&
          editor.getAttributes("paragraph")["data-alpha-list"]
            ? "bg-muted text-foreground"
            : "text-muted-foreground"
        }`}
      >
        a)
      </button>
      <div className="w-px h-5 bg-border mx-1" />

      {/* Indentação — aumenta/reduz nível em listas via ProseMirror */}
      {btn(() => editor.commands.indent(),  <Indent  className="h-4 w-4" />, "Aumentar recuo")}
      {btn(() => editor.commands.outdent(), <Outdent className="h-4 w-4" />, "Reduzir recuo")}
      <div className="w-px h-5 bg-border mx-1" />

      {/* Alinhamento */}
      {btn(() => editor.chain().focus().setTextAlign("left").run(),    <AlignLeft className="h-4 w-4" />,    "Esquerda",   editor.isActive({ textAlign: "left" }))}
      {btn(() => editor.chain().focus().setTextAlign("center").run(),  <AlignCenter className="h-4 w-4" />,  "Centralizar", editor.isActive({ textAlign: "center" }))}
      {btn(() => editor.chain().focus().setTextAlign("right").run(),   <AlignRight className="h-4 w-4" />,   "Direita",    editor.isActive({ textAlign: "right" }))}
      {btn(() => editor.chain().focus().setTextAlign("justify").run(), <AlignJustify className="h-4 w-4" />, "Justificar", editor.isActive({ textAlign: "justify" }))}
      <div className="w-px h-5 bg-border mx-1" />

      {/* Desfazer/Refazer */}
      {btn(() => editor.chain().focus().undo().run(), <Undo className="h-4 w-4" />, "Desfazer")}
      {btn(() => editor.chain().focus().redo().run(), <Redo className="h-4 w-4" />, "Refazer")}
      {/* Tabela */}
      <TableToolbar editor={editor} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ClausePreviewPanel — renderiza o conteúdo do editor no formato do contrato
// ---------------------------------------------------------------------------

interface ClausePreviewPanelProps {
  editor: ReturnType<typeof useEditor>;
  title: string;
}

function ClausePreviewPanel({ editor, title }: ClausePreviewPanelProps) {
  // Pega o JSON atual do editor e converte para HTML
  const extensions = [
    StarterKit,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Underline,
    IndentExtension,
    AlphaListExtension,
    ...tableExtensions,
  ];

  let rawHtml = "";
  if (editor) {
    try {
      rawHtml = generateHTML(editor.getJSON(), extensions);
    } catch {
      rawHtml = editor.getHTML();
    }
  }

  const withBlockVarsExtracted = rawHtml.replace(
    /<p[^>]*>\s*(\{\{(servicos|escopo|lista_servicos)\}\})\s*<\/p>/g,
    (_match, token) => `__BLOCK__${token}__BLOCK__`
  );

  const renderedHtml = applyPreviewVars(withBlockVarsExtracted)
    .replace(/__BLOCK__([\s\S]*?)__BLOCK__/g, '$1');

  return (
    <div className="h-full flex flex-col">
      <div className="bg-muted/40 border-b px-4 py-2 shrink-0">
        <p className="text-[11px] text-muted-foreground">
          Valores de exemplo — o conteúdo real depende dos dados do contrato
        </p>
      </div>
      <div className="flex-1 overflow-y-auto bg-white px-8 py-6">
        {title && (
          <p className="font-semibold text-sm mb-3 leading-snug text-black">{title}</p>
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
            Conteúdo vazio — escreva algo na aba Conteúdo para ver o preview.
          </p>
        )}
      </div>
    </div>
  );
}

export function ClauseEditor({ clause, onSave, onClose, isSaving, parentTitle }: Props) {
  const { data: categories = [] } = useClauseCategories();
  const organizationId = useOrganization();
  const { services: serviceItems = [] } = useServiceCatalog(organizationId);

  const depth      = clause.depth      ?? 0;
  const isChild    = depth > 0;

  const [categoryKey,   setCategoryKey]   = useState(clause.category_key);
  const [isFixed,       setIsFixed]       = useState(clause.is_fixed);
  const [serviceSlug,   setServiceSlug]   = useState(clause.service_slug ?? "");
  const [title,         setTitle]         = useState(clause.title ?? "");
  const [markerType,    setMarkerType]    = useState<ContractClause['marker_type']>(
    clause.marker_type ?? "number"
  );

  // Novo sistema de condição
  // Se já tem condition_type → usa ele; senão deriva do is_fixed/service_slug
  const deriveInitialConditionType = () => {
    if (clause.condition_type) return clause.condition_type;
    if (clause.is_fixed) return "always";
    if (clause.service_slug) return "service";
    return "always";
  };
  const [conditionType,  setConditionType]  = useState<string>(deriveInitialConditionType());
  const [conditionValue, setConditionValue] = useState<Record<string, unknown>>(
    (clause.condition_value as Record<string, unknown>) ?? {}
  );
  const [conditionNegate, setConditionNegate] = useState<boolean>(
    clause.condition_negate ?? false
  );
  const [leftTab, setLeftTab] = useState<"editor" | "vars" | "preview">("editor");

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Underline,
      IndentExtension,
      AlphaListExtension,
      ...tableExtensions,
    ],
    content: clause.html_content ?? "",
    editorProps: {
      attributes: {
        class: "contract-editor focus:outline-none min-h-[300px] p-4",
      },
    },
  });

  const insertVariable = useCallback((key: string) => {
    editor?.chain().focus().insertContent(`{{${key}}}`).run();
  }, [editor]);

  const handleSave = async () => {
    if (!isChild && !categoryKey) { toast.error("Selecione a cláusula (categoria)."); return; }
    if (conditionType === "service" && !(conditionValue.slugs as string[] | undefined)?.length) {
      toast.error("Selecione ao menos um serviço para esta alínea condicional."); return;
    }
    await onSave({
      ...clause,
      category_key:    categoryKey,
      service_slug:    conditionType === "service" ? ((conditionValue.slugs as string[])?.[0] ?? null) : null,
      title:           title || null,
      html_content:    editor?.getHTML() ?? "",
      is_fixed:        conditionType === "always",
      condition_type:  conditionType,
      condition_value: conditionType === "always" ? null : conditionValue,
      condition_negate: conditionNegate,
      depth:           depth,
      parent_id:       clause.parent_id ?? null,
      marker_type:     markerType,
    });
  };

  const DEPTH_LABELS: Record<number, string> = {
    0: "Alínea",
    1: "Sub-alínea",
    2: "Detalhe",
    3: "Tópico",
  };

  const selectedCategory = categories.find(c => c.key === categoryKey);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Barra superior */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-background shrink-0">
        <FileText className="h-4 w-4 text-violet-500 shrink-0" />
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium">
            {clause.id ? `Editar ${DEPTH_LABELS[depth] ?? "nó"}` : `Nova ${DEPTH_LABELS[depth] ?? "alínea"}`}
          </span>
          {isChild && parentTitle && (
            <span className="text-[10px] text-muted-foreground truncate">
              dentro de: {parentTitle}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Button size="sm" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving} className="gap-1.5">
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Painel esquerdo: editor */}
        <div className="flex-1 flex flex-col min-w-0 border-r overflow-hidden">
          {/* Tab bar manual */}
          <div className="shrink-0 flex items-center gap-1 mx-4 mt-2">
            <button
              type="button"
              onClick={() => setLeftTab("editor")}
              className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-sm font-medium transition-colors
                ${leftTab === "editor"
                  ? "bg-background shadow-sm text-foreground border"
                  : "text-muted-foreground hover:text-foreground"}`}
            >
              <FileText className="h-3 w-3" /> Conteúdo
            </button>
            <button
              type="button"
              onClick={() => setLeftTab("vars")}
              className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-sm font-medium transition-colors
                ${leftTab === "vars"
                  ? "bg-background shadow-sm text-foreground border"
                  : "text-muted-foreground hover:text-foreground"}`}
            >
              <Wand2 className="h-3 w-3" /> Variáveis
            </button>
            <button
              type="button"
              onClick={() => setLeftTab("preview")}
              className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-sm font-medium transition-colors
                ${leftTab === "preview"
                  ? "bg-background shadow-sm text-foreground border"
                  : "text-muted-foreground hover:text-foreground"}`}
            >
              <Eye className="h-3 w-3" /> Preview
            </button>
          </div>

          {/* Painel editor */}
          <div className={`flex-1 min-h-0 overflow-y-auto border-t mt-2 ${leftTab === "editor" ? "flex flex-col" : "hidden"}`}>
            <Toolbar editor={editor} />
            <EditorContent editor={editor} />
          </div>

          {/* Painel variáveis */}
          <div className={`flex-1 min-h-0 overflow-y-auto border-t mt-2 p-4 space-y-5 ${leftTab === "vars" ? "block" : "hidden"}`}>
              <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                <strong>Como usar:</strong> Clique numa variável para inserir no cursor.
                Os valores são substituídos automaticamente na geração do contrato.
              </div>

              {/* Guia de numeração hierárquica */}
              <div className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2.5 space-y-1.5">
                <p className="text-[11px] font-bold text-violet-700 uppercase tracking-wide">Hierarquia de numeração</p>
                <div className="space-y-1 text-[11px] text-violet-700">
                  <div className="flex items-start gap-2 opacity-60">
                    <code className="font-mono bg-white border border-violet-200 rounded px-1">automático</code>
                    <span>Nível 1 — Cláusula: <strong>1</strong>, <strong>2</strong>, <strong>3</strong>… (definido pela ordem do cadastro)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <code className="font-mono bg-white border border-violet-200 rounded px-1">{"{{num_item}}"}</code>
                    <span>Nível 2 — Item: <strong>1.1</strong>, <strong>1.2</strong>… (baseado na cláusula atual)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <code className="font-mono bg-white border border-violet-200 rounded px-1">{"{{num_subitem}}"}</code>
                    <span>Nível 3 — Subitem: <strong>1.1.1</strong>… (baseado no item atual)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <code className="font-mono bg-white border border-violet-200 rounded px-1">{"{{num_detalhe}}"}</code>
                    <span>Nível 4 — Detalhe: <strong>1.1.1.1</strong>… (baseado no subitem atual)</span>
                  </div>
                  <div className="pt-1 border-t border-violet-200 text-[10px] text-violet-600">
                    Use <strong>Lista com •</strong> para bullet points e <strong>a)</strong> para letras.
                    Tab/Shift+Tab nos botões da toolbar aumenta/reduz o nível das listas.
                  </div>
                </div>
              </div>
              {VAR_GROUPS.map(group => (
                <div key={group}>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                    {group}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {CLAUSE_VARIABLES.filter(v => v.group === group).map(v => (
                      <button
                        key={v.key}
                        type="button"
                        onClick={() => insertVariable(v.key)}
                        className="inline-flex flex-col items-start rounded border bg-violet-50 border-violet-200 px-2 py-1.5 hover:bg-violet-100 transition-colors text-left"
                      >
                        <span className="font-mono text-[10px] text-violet-700">{`{{${v.key}}}`}</span>
                        <span className="text-[10px] text-muted-foreground mt-0.5">{v.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
          </div>

          {/* Painel preview */}
          {leftTab === "preview" && (
            <div className="flex-1 min-h-0 overflow-y-auto border-t mt-2">
              <ClausePreviewPanel editor={editor} title={title} />
            </div>
          )}
        </div>

        {/* Painel direito: configurações da alínea */}
        <div className="w-72 shrink-0 overflow-y-auto p-4 space-y-5">

          {/* Contexto: nível hierárquico */}
          {isChild && (
            <div className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2 space-y-0.5">
              <p className="text-[11px] font-semibold text-violet-700">
                {DEPTH_LABELS[depth]}
              </p>
              {parentTitle && (
                <p className="text-[10px] text-violet-600">
                  Filho de: <span className="font-medium">{parentTitle}</span>
                </p>
              )}
            </div>
          )}

          {/* Categoria — só para alíneas raiz (depth 0) */}
          {!isChild && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Cláusula <span className="text-red-500">*</span>
              </Label>
              <p className="text-xs text-muted-foreground">
                Em qual cláusula do contrato esta alínea aparecerá.
              </p>
              <Select value={categoryKey} onValueChange={setCategoryKey}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Selecione a cláusula…" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat.key} value={cat.key}>
                      <span className="font-medium">{cat.label}</span>
                      <span className="text-xs text-muted-foreground ml-1">
                        (Cláusula {cat.display_order}ª)
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCategory && (
                <p className="text-[10px] text-muted-foreground font-mono">
                  {selectedCategory.placeholder}
                </p>
              )}
            </div>
          )}

          {/* Tipo de marcador */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Tipo de marcador</Label>
            <p className="text-xs text-muted-foreground">
              Como este nó será numerado/marcado no contrato.
            </p>
            <Select value={markerType} onValueChange={v => setMarkerType(v as ContractClause['marker_type'])}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="number">Número — 1, 1.1, 1.1.1…</SelectItem>
                <SelectItem value="letter">Letra — a), b), c)…</SelectItem>
                <SelectItem value="bullet">Marcador — •</SelectItem>
                <SelectItem value="none">Sem marcador</SelectItem>
              </SelectContent>
            </Select>
            {/* Preview do marcador */}
            <div className="rounded border px-2 py-1 text-[11px] text-muted-foreground font-mono bg-muted/30">
              {markerType === "number" && (depth === 0 ? "1.1, 1.2, 1.3…" : depth === 1 ? "1.1.1, 1.1.2…" : "1.1.1.1…")}
              {markerType === "letter" && "a), b), c), d)…"}
              {markerType === "bullet" && "• • •"}
              {markerType === "none"   && "(sem prefixo)"}
            </div>
          </div>

          {/* Condição de inclusão */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Condição de inclusão</Label>
            <Select value={conditionType} onValueChange={v => { setConditionType(v); setConditionValue({}); }}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel className="text-xs uppercase text-muted-foreground tracking-wide">Geral</SelectLabel>
                  <SelectItem value="always"><Lock className="h-3 w-3 inline mr-1 text-violet-500" />Sempre (fixa)</SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel className="text-xs uppercase text-muted-foreground tracking-wide">Tipo de Pessoa</SelectLabel>
                  <SelectItem value="is_pj">Contratante é Pessoa Jurídica (CNPJ)</SelectItem>
                  <SelectItem value="is_pf">Contratante é Pessoa Física (CPF)</SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel className="text-xs uppercase text-muted-foreground tracking-wide">Assinatura / Representantes</SelectLabel>
                  <SelectItem value="has_multiple_representatives">Cliente tem múltiplos representantes</SelectItem>
                  <SelectItem value="signing_type">Tipo de assinatura</SelectItem>
                  <SelectItem value="has_procurador">Contratante possui procurador</SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel className="text-xs uppercase text-muted-foreground tracking-wide">Contrato</SelectLabel>
                  <SelectItem value="has_setup">Contrato tem setup (valor &gt; 0)</SelectItem>
                  <SelectItem value="has_min_duration">Contrato tem prazo mínimo</SelectItem>
                  <SelectItem value="has_schedule">Contrato tem cronograma de pagamento</SelectItem>
                  <SelectItem value="has_grace_period">Contrato tem carência</SelectItem>
                  <SelectItem value="has_deferred_start">Início de vigência diferido</SelectItem>
                  <SelectItem value="has_guarantees">Contrato tem garantias de resultado (KPI)</SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel className="text-xs uppercase text-muted-foreground tracking-wide">Serviço</SelectLabel>
                  <SelectItem value="service"><Unlock className="h-3 w-3 inline mr-1 text-amber-500" />Serviço específico</SelectItem>
                  <SelectItem value="service_count">Quantidade mínima de serviços</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>

            {/* Parâmetros por tipo */}
            {conditionType === "service" && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">
                  Serviços cadastrados em <strong>Configurações → Serviços/Produtos</strong>.
                </p>
                <Select
                  value={(conditionValue.slugs as string[] | undefined)?.[0] ?? ""}
                  onValueChange={v => setConditionValue({ slugs: [v] })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Selecione o serviço…" />
                  </SelectTrigger>
                  <SelectContent>
                    {serviceItems.length === 0 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        Nenhum serviço cadastrado em Configurações → Serviços/Produtos.
                      </div>
                    )}
                    {serviceItems.map(svc => (
                      <SelectItem key={svc.slug || svc.id} value={svc.slug || svc.id}>
                        <span className="font-medium">{svc.name}</span>
                        {svc.slug && (
                          <span className="text-xs text-muted-foreground ml-1 font-mono">({svc.slug})</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {conditionType === "has_min_duration" && (
              <div className="flex items-center gap-2">
                <Input
                  type="number" min={1}
                  className="h-8 text-sm w-24"
                  placeholder="12"
                  value={(conditionValue.min_months as number | undefined) ?? ""}
                  onChange={e => setConditionValue({ min_months: Number(e.target.value) })}
                />
                <span className="text-xs text-muted-foreground">meses mínimos</span>
              </div>
            )}

            {conditionType === "signing_type" && (
              <Select
                value={(conditionValue.type as string | undefined) ?? "joint"}
                onValueChange={v => setConditionValue({ type: v })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Assinatura individual</SelectItem>
                  <SelectItem value="joint">Assinatura conjunta</SelectItem>
                </SelectContent>
              </Select>
            )}

            {conditionType === "service_count" && (
              <div className="flex items-center gap-2">
                <Input
                  type="number" min={1}
                  className="h-8 text-sm w-24"
                  placeholder="2"
                  value={(conditionValue.min as number | undefined) ?? ""}
                  onChange={e => setConditionValue({ min: Number(e.target.value) })}
                />
                <span className="text-xs text-muted-foreground">serviços mínimos</span>
              </div>
            )}
          </div>

          {/* Inverter condição — ocultar quando verdadeiro */}
          {conditionType !== "always" && (
            <div className="flex items-start gap-3 rounded-lg border px-3 py-2.5 bg-muted/20">
              <Switch
                id="condition-negate"
                checked={conditionNegate}
                onCheckedChange={setConditionNegate}
                className="mt-0.5 shrink-0"
              />
              <div>
                <label
                  htmlFor="condition-negate"
                  className="text-sm font-medium cursor-pointer"
                >
                  Inverter condição
                </label>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {conditionNegate
                    ? "Alínea incluída quando a condição for FALSA (ocultar quando verdadeiro)."
                    : "Alínea incluída quando a condição for VERDADEIRA (comportamento padrão)."}
                </p>
              </div>
            </div>
          )}

          {/* Título interno */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Título interno</Label>
            <p className="text-xs text-muted-foreground">
              Usado apenas para identificar a alínea na lista. Não aparece no documento.
            </p>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="h-8 text-sm"
              placeholder="Ex: Implementação em etapas (Agente IA)"
            />
          </div>

        </div>
      </div>
    </div>
  );
}
