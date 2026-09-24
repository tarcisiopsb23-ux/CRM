/**
 * ContractTemplateEditor
 * Editor do template base do contrato (cláusulas comuns).
 * Usa TipTap para edição rica + campos de configuração de imagens
 * para papel timbrado (fundo, cabeçalho, rodapé) e margens.
 */
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { BulletList } from "@tiptap/extension-bullet-list";
import { OrderedList } from "@tiptap/extension-ordered-list";
import { ListItem } from "@tiptap/extension-list-item";
import { ListKeymap } from "@tiptap/extension-list-keymap";
import { liftListItem, sinkListItem } from "prosemirror-schema-list";
import { IndentExtension } from "@/lib/tiptap/IndentExtension";
import { AlphaListExtension } from "@/lib/tiptap/AlphaListExtension";
import { tableExtensions } from "@/lib/tiptap/tableExtensions";
import { TableToolbar } from "@/components/contracts/TableToolbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Bold, Italic, List, ListOrdered, Heading1, Heading2,
  Undo, Redo, Save, Image, FileText, Settings, Loader2, Upload, X, Eye,
  Lock, Unlock, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Indent, Outdent, Users,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useOrganization } from "@/hooks/useOrganization";
import { ContractViewer } from "@/components/contracts/ContractViewer";
import { useClauseCategories, useClauses, useSignatureBlocks } from "@/hooks/useContractTemplates";
import type { ContractTemplate, ClauseCategory, ContractClause, SignatureBlock } from "@/hooks/useContractTemplates";
import { SCHEDULE_PREVIEW_HTML } from "@/lib/contracts/buildScheduleHtml";
import { buildScopeString } from "@/lib/contracts/buildScopeString";

// Variáveis de categoria — inserem o bloco completo de uma cláusula no template
// A ordem aqui reflete a ordem das cláusulas no documento
const CATEGORY_VARIABLES = [
  { key: "clausula_objeto",                label: "Cláusula: Objeto",                          order: 1 },
  { key: "clausula_obrigacoes_contratada", label: "Cláusula: Obrigações da Contratada",        order: 2 },
  { key: "clausula_obrigacoes_contratante",label: "Cláusula: Obrigações do Contratante",       order: 3 },
  { key: "clausula_remuneracao",           label: "Cláusula: Remuneração e Pagamento",         order: 4 },
  { key: "clausula_sigilo",                label: "Cláusula: Sigilo e Confidencialidade",      order: 5 },
  { key: "clausula_responsabilidade",      label: "Cláusula: Responsabilidade Civil",          order: 6 },
  { key: "clausula_rescisao",              label: "Cláusula: Rescisão",                        order: 7 },
  { key: "clausula_disposicoes",           label: "Cláusula: Disposições Gerais",              order: 8 },
];

// Variáveis de dados organizadas por categoria
// Cada grupo corresponde a uma seção na aba Variáveis
const DATA_VARIABLE_GROUPS: {
  label: string;
  color: { chip: string; border: string; text: string; hover: string };
  vars: { key: string; label: string }[];
}[] = [
  {
    label: "Contratante",
    color: { chip: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", hover: "hover:bg-blue-100" },
    vars: [
      { key: "qualificacao_contratante",  label: "Qualificação completa (PF/PJ + representantes)" },
      { key: "contratante_razao_social",  label: "Razão social / nome" },
      { key: "contratante_cnpj",          label: "CNPJ / CPF" },
      { key: "contratante_endereco",      label: "Endereço completo" },
      { key: "cnpj",                      label: "CNPJ (apenas PJ)" },
      { key: "cpf",                       label: "CPF (apenas PF)" },
    ],
  },
  {
    label: "Representantes",
    color: { chip: "bg-violet-50", border: "border-violet-200", text: "text-violet-700", hover: "hover:bg-violet-100" },
    vars: [
      { key: "representante_nome",             label: "1º Representante — Nome" },
      { key: "representante_cpf",              label: "1º Representante — CPF" },
      { key: "representante_qualificacao_cargo", label: "1º Representante — Cargo/qualificação" },
      { key: "representante_qualificacao",     label: "Todos os representantes (texto completo)" },
      { key: "tipo_assinatura",                label: "Tipo de assinatura (individual / conjunta)" },
    ],
  },
  {
    label: "Financeiro — Mensalidade",
    color: { chip: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", hover: "hover:bg-emerald-100" },
    vars: [
      { key: "valor",             label: "Valor do contrato (R$)" },
      { key: "valor_mensalidade", label: "Mensalidade recorrente (R$)" },
      { key: "forma_pagamento",   label: "Forma de pagamento recorrente" },
      { key: "chave_pix",         label: "Chave PIX" },
      { key: "dia_vencimento",    label: "Dia do vencimento mensal" },
      { key: "vencimento",        label: "Data do 1º vencimento" },
      { key: "primeiro_pagamento",label: "Data do 1º pagamento" },
      { key: "carencia_meses",    label: "Meses de carência" },
      { key: "carencia_extenso",  label: "Carência por extenso (ex: dois meses)" },
    ],
  },
  {
    label: "Financeiro — Setup",
    color: { chip: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", hover: "hover:bg-amber-100" },
    vars: [
      { key: "valor_setup",          label: "Valor de setup (R$)" },
      { key: "parcelas_setup",       label: "Nº de parcelas do setup" },
      { key: "parcela_setup",        label: "Valor de cada parcela do setup (R$)" },
      { key: "taxa_setup",           label: "Juros/taxa do setup (%)" },
      { key: "vencimento_setup",     label: "Vencimento da 1ª parcela do setup" },
      { key: "forma_pagamento_setup",label: "Forma de pagamento do setup" },
    ],
  },
  {
    label: "Datas e Vigência",
    color: { chip: "bg-sky-50", border: "border-sky-200", text: "text-sky-700", hover: "hover:bg-sky-100" },
    vars: [
      { key: "data_assinatura",       label: "Data de assinatura" },
      { key: "data",                  label: "Data de hoje" },
      { key: "vigencia_inicio",       label: "Início da vigência" },
      { key: "vigencia_fim",          label: "Término da vigência (calculado)" },
      { key: "prazo_minimo_meses",    label: "Prazo mínimo (meses)" },
      { key: "prazo_minimo_extenso",  label: "Prazo mínimo por extenso (ex: doze meses)" },
      { key: "prazo_vigencia_extenso",label: "Prazo de vigência por extenso (alias)" },
    ],
  },
  {
    label: "Serviços",
    color: { chip: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", hover: "hover:bg-orange-100" },
    vars: [
      { key: "lista_servicos",       label: "Lista de serviços (HTML)" },
      { key: "escopo",               label: "Escopo / descrição dos serviços" },
      { key: "servico_principal",    label: "Serviço principal (nome)" },
      { key: "servico_principal_slug", label: "Serviço principal (slug)" },
      { key: "cronograma_pagamento", label: "Cronograma de pagamento" },
    ],
  },
  {
    label: "Localização e Foro",
    color: { chip: "bg-slate-50", border: "border-slate-200", text: "text-slate-700", hover: "hover:bg-slate-100" },
    vars: [
      { key: "cidade_estado",  label: "Cidade/Estado" },
      { key: "foro_cidade",    label: "Cidade do foro" },
    ],
  },
  {
    label: "Assinaturas",
    color: { chip: "bg-rose-50", border: "border-rose-200", text: "text-rose-700", hover: "hover:bg-rose-100" },
    vars: [
      { key: "bloco_assinaturas", label: "Bloco completo de assinaturas (partes + testemunhas)" },
    ],
  },
];

interface Props {
  template: Partial<ContractTemplate> & { name: string };
  onSave: (data: Partial<ContractTemplate> & { name: string; html_content: string }) => Promise<void>;
  onClose: () => void;
  isSaving: boolean;
}

// ── Renderiza preview do template com cláusulas reais ─────────────────────────

function buildPreviewHtml(
  templateHtml: string,
  categories: ClauseCategory[],
  clauses: ContractClause[],
): string {
  // Dados fictícios para substituição no preview
  const previewVars: Record<string, string> = {
    contratante_razao_social: "Empresa Contratante Ltda.",
    contratante_cnpj:         "00.000.000/0001-00",
    contratante_endereco:     "Rua Exemplo, 123 — Centro, Cidade (UF)",
    representante_nome:       "Nome do Representante",
    representante_cpf:        "000.000.000-00",
    lista_servicos:           "<ul><li>Serviço Exemplo</li></ul>",
    servico_principal:        "Assessoria de Performance e Estratégia de Vendas",
    servico_principal_slug:   "assessoria",
    cronograma_pagamento:     SCHEDULE_PREVIEW_HTML,
    clausula_multa_atraso:    "O atraso no pagamento acarretará multa de 10% e juros de 1% ao mês.",
    clausula_suspensao:       "Atrasos superiores a 20 dias podem resultar na suspensão dos serviços.",
    data_assinatura:          new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }),
    cidade_estado:            "Teófilo Otoni (MG)",
    foro_cidade:              "Teófilo Otoni",
    prazo_vigencia_meses:     "12",
    prazo_vigencia_dias:      "365",
    prazo_vigencia_extenso:   "doze",
    data_inicio:              new Date().toLocaleDateString("pt-BR"),
  };

  // Monta cada categoria com suas alíneas (todas — preview mostra tudo)
  let clauseNumber = 1;
  const clauseMap: Record<string, string> = {};

  for (const cat of categories) {
    const alineas = clauses
      .filter(c => c.category_key === cat.key)
      .sort((a, b) => a.display_order - b.display_order);

    if (alineas.length === 0) {
      clauseMap[`clausula_${cat.key}`] = "";
      continue;
    }

    // Sub-numeração automática dentro da cláusula
    let subNum = 1;
    const resolvedAlineas = alineas.map((a, alineaIdx) => {
      let html = a.html_content;
      html = html.replace(/\{\{num_clausula\}\}/g, String(clauseNumber));
      const itemNum = alineaIdx + 1;
      html = html.replace(/\{\{num_item\}\}/g,    `${clauseNumber}.${itemNum}`);
      html = html.replace(/\{\{num_subitem\}\}/g,  `${clauseNumber}.${itemNum}.1`);
      html = html.replace(/\{\{num_detalhe\}\}/g,  `${clauseNumber}.${itemNum}.1.1`);
      Object.entries(previewVars).forEach(([k, v]) => {
        html = html.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
      });
      const badge = a.is_fixed
        ? `<span style="font-size:10px;background:#ede9fe;color:#7c3aed;border:1px solid #c4b5fd;border-radius:3px;padding:1px 5px;margin-left:6px;vertical-align:middle">Fixa</span>`
        : `<span style="font-size:10px;background:#fef3c7;color:#92400e;border:1px solid #fde68a;border-radius:3px;padding:1px 5px;margin-left:6px;vertical-align:middle">${a.service_slug}</span>`;
      const titleRow = a.title
        ? `<p style="font-size:10px;color:#9ca3af;margin:0 0 4px 0">${clauseNumber}.${subNum} — ${a.title}${badge}</p>`
        : "";
      subNum++;
      return `<div style="margin-bottom:8px;padding:8px;border-left:2px solid #e5e7eb">${titleRow}${html}</div>`;
    });

    const ordinal = `${clauseNumber}ª`;
    clauseMap[`clausula_${cat.key}`] = `
<section class="contract-clause" style="margin-bottom:24px">
  <h2 style="font-size:13px;font-weight:700;text-transform:uppercase;margin-bottom:8px">
    Cláusula ${ordinal} — ${cat.label.toUpperCase()}
  </h2>
  ${resolvedAlineas.map(h => `<div class="alinea" style="margin-bottom:4pt">${h}</div>`).join("\n")}
</section>`;
    clauseNumber++;
  }

  // Substitui {{clausula_<key>}} e variáveis de dados no template
  let html = templateHtml;
  // clauseMap já tem chaves no formato "clausula_objeto", "clausula_sigilo" etc.
  // então substituímos diretamente {{chave}} sem adicionar prefixo extra
  Object.entries(clauseMap).forEach(([key, content]) => {
    html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), content);
  });
  Object.entries(previewVars).forEach(([k, v]) => {
    html = html.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
  });

  return html;
}

// ── Toolbar ───────────────────────────────────────────────────────────────────
function Toolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;
  const btn = (action: () => void, icon: React.ReactNode, label: string, active = false) => (
    <button
      type="button"
      onClick={action}
      title={label}
      className={`p-1.5 rounded hover:bg-muted transition-colors ${active ? "bg-muted" : ""}`}
    >
      {icon}
    </button>
  );

  // Inserir letra com recuo automático (a), b), c)...) — toggle
  const insertAlphaItem = () => editor.commands.toggleAlphaList();

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b px-2 py-1.5 bg-background sticky top-0 z-10">
      {btn(() => editor.chain().focus().toggleBold().run(),        <Bold className="h-4 w-4" />,         "Negrito",   editor.isActive("bold"))}
      {btn(() => editor.chain().focus().toggleItalic().run(),      <Italic className="h-4 w-4" />,       "Itálico",   editor.isActive("italic"))}
      <div className="w-px h-5 bg-border mx-1" />
      {btn(() => editor.chain().focus().toggleHeading({ level: 1 }).run(), <Heading1 className="h-4 w-4" />, "Título 1", editor.isActive("heading", { level: 1 }))}
      {btn(() => editor.chain().focus().toggleHeading({ level: 2 }).run(), <Heading2 className="h-4 w-4" />, "Título 2", editor.isActive("heading", { level: 2 }))}
      <div className="w-px h-5 bg-border mx-1" />
      {btn(() => editor.chain().focus().toggleBulletList().run(),  <List className="h-4 w-4" />,         "Lista com •",   editor.isActive("bulletList"))}
      {btn(() => editor.chain().focus().toggleOrderedList().run(), <ListOrdered className="h-4 w-4" />,  "Lista numerada", editor.isActive("orderedList"))}
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
      {btn(() => editor.commands.indent(),  <Indent  className="h-4 w-4" />, "Aumentar recuo")}
      {btn(() => editor.commands.outdent(), <Outdent className="h-4 w-4" />, "Reduzir recuo")}
      <div className="w-px h-5 bg-border mx-1" />
      {btn(() => editor.chain().focus().setTextAlign("left").run(),    <AlignLeft className="h-4 w-4" />,    "Alinhar à esquerda",   editor.isActive({ textAlign: "left" }))}
      {btn(() => editor.chain().focus().setTextAlign("center").run(),  <AlignCenter className="h-4 w-4" />,  "Centralizar",          editor.isActive({ textAlign: "center" }))}
      {btn(() => editor.chain().focus().setTextAlign("right").run(),   <AlignRight className="h-4 w-4" />,   "Alinhar à direita",    editor.isActive({ textAlign: "right" }))}
      {btn(() => editor.chain().focus().setTextAlign("justify").run(), <AlignJustify className="h-4 w-4" />, "Justificado",          editor.isActive({ textAlign: "justify" }))}
      <div className="w-px h-5 bg-border mx-1" />
      {btn(() => editor.chain().focus().undo().run(), <Undo className="h-4 w-4" />, "Desfazer")}
      {btn(() => editor.chain().focus().redo().run(), <Redo className="h-4 w-4" />, "Refazer")}
      {/* Tabela */}
      <TableToolbar editor={editor} />
    </div>
  );
}

// ── Upload de imagem para Supabase Storage ────────────────────────────────────
function ImageUploader({
  label, hint, value, field, onChange,
}: {
  label: string; hint: string; value: string | null | undefined;
  field: string; onChange: (field: string, url: string | null) => void;
}) {
  const organizationId = useOrganization();
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !organizationId) return;
    setUploading(true);
    try {
      const ext  = file.name.split(".").pop() ?? "png";
      // Bucket "public" com pasta "branding/" — conforme migration 00045_branding_storage.sql
      const path = `branding/contract-assets/${organizationId}/${field}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("public").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("public").getPublicUrl(path);
      onChange(field, publicUrl);
      toast.success(`${label} enviada!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Erro ao enviar ${label.toLowerCase()}: ${msg}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {value && (
        <div className="relative w-full max-h-24 overflow-hidden rounded border bg-muted">
          <img src={value} alt={label} className="w-full object-contain max-h-24" />
          <button
            type="button"
            onClick={() => onChange(field, null)}
            className="absolute top-1 right-1 bg-background rounded-full p-0.5 shadow"
          >
            <X className="h-3 w-3 text-red-500" />
          </button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <label className="cursor-pointer">
          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFile} />
          <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border hover:bg-muted transition-colors cursor-pointer">
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {uploading ? "Enviando..." : "Selecionar arquivo"}
          </span>
        </label>
        {value && (
          <Input
            value={value}
            onChange={e => onChange(field, e.target.value)}
            className="flex-1 h-7 text-xs"
            placeholder="ou cole a URL"
          />
        )}
      </div>
    </div>
  );
}

// ── SigPreviewFrame ───────────────────────────────────────────────────────────
// Renderiza o bloco de assinaturas num iframe com os mesmos estilos do contrato

function SigPreviewFrame({
  html, mt, ml, mr,
}: { html: string; mt: number; ml: number; mr: number }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!doc) return;

    const css = `
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: "Calibri", Calibri, sans-serif;
        font-size: 12pt;
        line-height: 1.6;
        color: #000;
        padding: ${mt}mm ${mr}mm 25mm ${ml}mm;
        width: 210mm;
        min-height: 120mm;
      }
      p { margin: 3pt 0; text-align: center; }
      strong { font-weight: bold; }
      table { width: 100%; border-collapse: collapse; }
      table.sig-table { border: none; width: 100%; table-layout: fixed; margin-top: 24pt; }
      table.sig-table td { border: none; text-align: center; padding: 0 16pt; vertical-align: top; }
      table.sig-table p { margin: 3pt 0; text-align: center; }
      .sig-line { border-bottom: 1px solid #000; display: block; min-height: 18pt; margin: 24pt 0 4pt; }
      .sig-row-table { display: table; width: 100%; table-layout: fixed; margin-top: 24pt; }
      .sig-col { display: table-cell; text-align: center; padding: 0 16pt; vertical-align: bottom; }
      .sig-col .sig-line { border-bottom: 1px solid #000; margin-bottom: 4pt; min-height: 18pt; }
      .sig-col p { margin: 3pt 0; text-align: center; }
    `;

    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${css}</style></head><body>${html}</body></html>`);
    doc.close();

    // Ajusta altura do iframe ao conteúdo
    const adjust = () => {
      if (doc.body) {
        const h = doc.body.scrollHeight;
        if (h > 0) iframe.style.height = `${h + 32}px`;
      }
    };
    setTimeout(adjust, 100);
  }, [html, mt, ml, mr]);

  return (
    <div className="bg-white shadow-lg" style={{ width: 794 }}>
      <iframe
        ref={iframeRef}
        title="Preview de assinaturas"
        className="w-full border-none block"
        style={{ minHeight: 300 }}
      />
    </div>
  );
}

// ── Editor principal ──────────────────────────────────────────────────────────
export function ContractTemplateEditor({ template, onSave, onClose, isSaving }: Props) {
  const [name,        setName]        = useState(template.name ?? "");
  const [description, setDescription] = useState(template.description ?? "");
  const [letterhead,  setLetterhead]  = useState(template.letterhead_url ?? null);
  const [headerUrl,   setHeaderUrl]   = useState(template.header_url ?? null);
  const [footerUrl,   setFooterUrl]   = useState(template.footer_url ?? null);
  const [headerH,     setHeaderH]     = useState(template.header_height ?? 120);
  const [footerH,     setFooterH]     = useState(template.footer_height ?? 80);
  const [marginTop,   setMarginTop]   = useState(template.margin_top ?? 30);
  const [marginBot,   setMarginBot]   = useState(template.margin_bottom ?? 25);
  const [marginL,     setMarginL]     = useState(template.margin_left ?? 25);
  const [marginR,     setMarginR]     = useState(template.margin_right ?? 20);

  const { data: categories = [] } = useClauseCategories();
  const { data: allClauses = [] } = useClauses();
  const { data: sigBlocks  = [] } = useSignatureBlocks();

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      IndentExtension,
      AlphaListExtension,
      ...tableExtensions,
    ],
    content: template.html_content ?? "",
    editorProps: {
      attributes: {
        class: "contract-editor focus:outline-none min-h-[400px] p-4",
      },
    },
  });

  const handleImageChange = useCallback((field: string, url: string | null) => {
    if (field === "letterhead_url") setLetterhead(url);
    if (field === "header_url")     setHeaderUrl(url);
    if (field === "footer_url")     setFooterUrl(url);
  }, []);

  const insertVariable = useCallback((key: string) => {
    editor?.chain().focus().insertContent(`{{${key}}}`).run();
  }, [editor]);

  // Preview: modo de assinatura — individual (1 rep) ou conjunta (2 reps)
  const [previewSigningMode, setPreviewSigningMode] = useState<"individual" | "joint">("joint");

  // Preview: monta as variáveis fictícias para o ContractViewer
  const [activeTab, setActiveTab] = useState("editor");

  // Variáveis fictícias para o preview — recalculate whenever clauses or sig blocks change
  const previewVariables = useMemo(() => {
    const today = new Date();
    const nextYear = new Date(today);
    nextYear.setFullYear(today.getFullYear() + 1);

    const vars: Record<string, string> = {
      // Contratante
      qualificacao_contratante:       "<strong>Empresa Contratante LTDA</strong>, pessoa jurídica de direito privado, inscrita no CNPJ nº 00.000.000/0001-00, com sede na Rua Exemplo, 123, Centro, Cidade (UF), neste ato representada por <strong>João da Silva</strong>, CPF nº 000.000.000-00, sócio-administrador, doravante denominado(a) <strong>CONTRATANTE</strong>.",
      contratante_razao_social:       "Empresa Contratante LTDA",
      contratante_cnpj:               "00.000.000/0001-00",
      contratante_endereco:           "Rua Exemplo, 123, Centro, Cidade (UF)",
      cnpj:                           "00.000.000/0001-00",
      cpf:                            "",
      // Representantes
      representante_nome:             "João da Silva",
      representante_cpf:              "000.000.000-00",
      representante_qualificacao:     "João da Silva, CPF 000.000.000-00, Sócio-Administrador",
      representante_qualificacao_cargo: "Sócio-Administrador",
      tipo_assinatura:                "individual",
      // Financeiro — mensalidade
      valor:                          "R$ 3.000,00",
      valor_mensalidade:              "R$ 3.000,00",
      forma_pagamento:                "PIX",
      chave_pix:                      "pagamentos@agenciac8.com.br",
      dia_vencimento:                 "10",
      vencimento:                     today.toLocaleDateString("pt-BR"),
      primeiro_pagamento:             today.toLocaleDateString("pt-BR"),
      carencia_meses:                 "0",
      carencia_extenso:               "",
      // Financeiro — setup
      valor_setup:                    "R$ 2.000,00",
      parcelas_setup:                 "2",
      parcela_setup:                  "R$ 1.000,00",
      taxa_setup:                     "2%",
      vencimento_setup:               today.toLocaleDateString("pt-BR"),
      forma_pagamento_setup:          "PIX",
      // Datas e vigência
      data_assinatura:                today.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }),
      data:                           today.toLocaleDateString("pt-BR"),
      vigencia_inicio:                today.toLocaleDateString("pt-BR"),
      vigencia_fim:                   nextYear.toLocaleDateString("pt-BR"),
      prazo_minimo_meses:             "12",
      prazo_minimo_extenso:           "doze (12) meses",
      prazo_vigencia_extenso:         "doze (12) meses",
      // Serviços
      lista_servicos:                 buildScopeString([
        { service_id: "assessoria", service_name: "Assessoria de Performance", selected_deliverables: [] },
        { service_id: "ia", service_name: "Agente de IA", selected_deliverables: [] },
      ]),
      escopo:                         buildScopeString([
        { service_id: "assessoria", service_name: "Assessoria de Performance", selected_deliverables: [] },
        { service_id: "ia", service_name: "Agente de IA", selected_deliverables: [] },
      ]),
      servicos:                       buildScopeString([
        { service_id: "assessoria", service_name: "Assessoria de Performance", selected_deliverables: [] },
        { service_id: "ia", service_name: "Agente de IA", selected_deliverables: [] },
      ]),
      servico_principal:              "Assessoria de Performance e Estratégia de Vendas",
      servico_principal_slug:         "assessoria",
      cronograma_pagamento:           SCHEDULE_PREVIEW_HTML,
      // Localização
      cidade_estado:                  "Teófilo Otoni (MG)",
      foro_cidade:                    "Teófilo Otoni",
    };

    // Monta as cláusulas com as alíneas reais
    let clauseNumber = 1;
    for (const cat of categories) {
      const alineas = allClauses
        .filter(c => c.category_key === cat.key)
        .sort((a, b) => a.display_order - b.display_order);

      if (alineas.length === 0) { vars[`clausula_${cat.key}`] = ""; continue; }

      const resolvedAlineas = alineas.map((a, idx) => {
        let html = a.html_content;
        html = html.replace(/\{\{num_clausula\}\}/g, String(clauseNumber));
        html = html.replace(/\{\{num_item\}\}/g,    `${clauseNumber}.${idx + 1}`);
        html = html.replace(/\{\{num_subitem\}\}/g,  `${clauseNumber}.${idx + 1}.1`);
        html = html.replace(/\{\{num_detalhe\}\}/g,  `${clauseNumber}.${idx + 1}.1.1`);
        Object.entries(vars).forEach(([k, v]) => {
          html = html.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
        });
        return `<div class="alinea">${html}</div>`;
      });

      vars[`clausula_${cat.key}`] = `
<section class="contract-clause">
  <h2>Cláusula ${clauseNumber}ª — ${cat.label.toUpperCase()}</h2>
  ${resolvedAlineas.join("\n")}
</section>`;
      clauseNumber++;
    }

    // Resolve blocos de assinatura com as vars de preview
    for (const block of sigBlocks) {
      let html = block.html_content;
      Object.entries(vars).forEach(([k, v]) => {
        html = html.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
      });
      html = html.replace(/\{\{[^}]+\}\}/g, "___");
      vars[block.slug] = html;
    }

    // Sobrescreve bloco_assinaturas com preview dinâmico de múltiplos representantes
    const previewReps = previewSigningMode === "joint"
      ? [
          { nome: "João da Silva",  cargo: "Sócio-Administrador",  cpf: "000.000.000-00" },
          { nome: "Maria Oliveira", cargo: "Sócia-Administradora", cpf: "111.111.111-11" },
        ]
      : [
          { nome: "João da Silva",  cargo: "Sócio-Administrador",  cpf: "000.000.000-00" },
        ];

    const repLinhasPreview = previewReps.map((r, idx) => `
      ${idx > 0 ? "<br/>" : ""}
      <p class="sig-line" style="border-bottom:1px solid #000;margin:24pt 0 4pt">&nbsp;</p>
      <p style="text-align:center">${r.nome}</p>
      <p style="text-align:center">${r.cargo}</p>
      <p style="text-align:center">CPF: ${r.cpf}</p>`).join("");

    vars["bloco_assinaturas"] = `<table class="sig-table" style="width:100%;margin-top:36pt;border-collapse:collapse">
  <tbody>
    <tr>
      <td style="width:50%;text-align:center;padding:0 16pt;vertical-align:top;border:none">
        <p style="text-align:center"><strong>CONTRATADA</strong></p>
        <p style="text-align:center"><strong>AGÊNCIA C8 LTDA</strong></p>
        <p class="sig-line" style="border-bottom:1px solid #000;margin:24pt 0 4pt">&nbsp;</p>
        <p style="text-align:center">Tarcísio Pereira da Silva Brito</p>
        <p style="text-align:center">Sócio-Administrador</p>
        <p style="text-align:center">CPF: 089.712.156-23</p>
      </td>
      <td style="width:50%;text-align:center;padding:0 16pt;vertical-align:top;border:none">
        <p style="text-align:center"><strong>CONTRATANTE</strong></p>
        <p style="text-align:center"><strong>Empresa Contratante LTDA</strong></p>
        ${repLinhasPreview}
      </td>
    </tr>
  </tbody>
</table>`;

    return vars;
  }, [categories, allClauses, sigBlocks, previewSigningMode]);

  // HTML atual do editor (sem salvar) — atualizado em tempo real
  // Inclui o signature_block da estrutura para que {{bloco_assinaturas}} seja resolvido no preview
  const currentEditorHtml = useMemo(() => {
    const editorHtml = activeTab !== "preview"
      ? (template.html_content ?? "")
      : (editor?.getHTML() ?? template.html_content ?? "");

    const sigBlock = template.structure?.signature_block ?? "";
    // Se o signature_block já tem {{bloco_assinaturas}}, usa ele
    // Senão, append direto do marcador para garantir que o preview sempre mostre
    const sigHtml = sigBlock.includes("bloco_assinaturas")
      ? sigBlock
      : `<div style="margin-top:28pt">{{bloco_assinaturas}}</div>`;

    return editorHtml + "\n" + sigHtml;
  }, [activeTab, editor, template.html_content, template.structure]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mantém compatibilidade — previewHtml não é mais usado
  const previewHtml = "";

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Nome do template é obrigatório."); return; }
    const html = editor?.getHTML() ?? "";
    await onSave({
      ...template,
      name, description: description || null,
      html_content:   html,
      letterhead_url: letterhead,
      header_url:     headerUrl,
      footer_url:     footerUrl,
      header_height:  headerH,
      footer_height:  footerH,
      margin_top:     marginTop,
      margin_bottom:  marginBot,
      margin_left:    marginL,
      margin_right:   marginR,
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Barra superior */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-background shrink-0">
        <FileText className="h-4 w-4 text-violet-500 shrink-0" />
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          className="h-8 text-sm flex-1 max-w-xs"
          placeholder="Nome do template"
        />
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
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
            <TabsList className="shrink-0 mx-4 mt-2 w-fit">
              <TabsTrigger value="editor"  className="text-xs gap-1"><FileText className="h-3 w-3" />Editor</TabsTrigger>
              <TabsTrigger value="vars"    className="text-xs gap-1"><Settings className="h-3 w-3" />Variáveis</TabsTrigger>
              <TabsTrigger value="preview" className="text-xs gap-1"><Eye className="h-3 w-3" />Preview</TabsTrigger>
              <TabsTrigger value="sigs"    className="text-xs gap-1"><Users className="h-3 w-3" />Assinaturas</TabsTrigger>
            </TabsList>

            {/* ── Tab: editor TipTap ──────────────────────────────────── */}
            <TabsContent value="editor" className="flex-1 min-h-0 overflow-y-auto mt-0 border-t">
              <Toolbar editor={editor} />
              <EditorContent editor={editor} />
            </TabsContent>

            {/* ── Tab: variáveis disponíveis ──────────────────────────── */}
            <TabsContent value="vars" className="flex-1 min-h-0 overflow-y-auto p-4 mt-0 border-t">
              <div className="space-y-6">

                {/* Cláusulas */}
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">
                    Cláusulas do contrato
                  </p>
                  <p className="text-xs text-muted-foreground mb-3">
                    Cada variável abaixo é substituída pelo bloco completo da cláusula correspondente,
                    com numeração automática e todas as alíneas (fixas + dos serviços contratados).
                    Posicione-as no template na ordem desejada.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORY_VARIABLES.map(v => (
                      <button
                        key={v.key}
                        type="button"
                        onClick={() => { insertVariable(v.key); setActiveTab("editor"); }}
                        className="inline-flex flex-col items-start rounded border bg-violet-50 border-violet-200 px-2 py-1 hover:bg-violet-100 transition-colors text-left"
                      >
                        <span className="font-mono text-[10px] text-violet-700">{`{{${v.key}}}`}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {v.order}ª — {v.label.replace("Cláusula: ", "")}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Grupos de dados */}
                {DATA_VARIABLE_GROUPS.map(group => (
                  <div key={group.label}>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                      {group.label}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {group.vars.map(v => (
                        <button
                          key={v.key}
                          type="button"
                          onClick={() => { insertVariable(v.key); setActiveTab("editor"); }}
                          className={`inline-flex flex-col items-start rounded border ${group.color.chip} ${group.color.border} px-2 py-1 ${group.color.hover} transition-colors text-left`}
                        >
                          <span className={`font-mono text-[10px] ${group.color.text}`}>{`{{${v.key}}}`}</span>
                          <span className="text-[10px] text-muted-foreground">{v.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}

              </div>
            </TabsContent>

            {/* ── Tab: preview WYSIWYG idêntico à impressão ──────────── */}
            <TabsContent value="preview" className="flex-1 min-h-0 mt-0 border-t data-[state=inactive]:hidden" asChild>
              <div className="flex flex-col flex-1 min-h-0">
              {allClauses.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Nenhuma alínea cadastrada ainda. Adicione alíneas em{" "}
                  <strong>Configurações → Contratos → Cláusulas</strong>.
                </div>
              ) : (
                <>
                  {/* Barra de controle do preview — fixa no topo */}
                  <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 shrink-0">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Assinatura no preview:</span>
                    <div className="flex items-center rounded-md border overflow-hidden text-xs">
                      <button
                        type="button"
                        onClick={() => setPreviewSigningMode("individual")}
                        className={`px-3 py-1 transition-colors ${
                          previewSigningMode === "individual"
                            ? "bg-violet-600 text-white font-medium"
                            : "bg-background text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        Individual (1 rep)
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewSigningMode("joint")}
                        className={`px-3 py-1 border-l transition-colors ${
                          previewSigningMode === "joint"
                            ? "bg-violet-600 text-white font-medium"
                            : "bg-background text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        Conjunta (2 reps)
                      </button>
                    </div>
                    <span className="text-[10px] text-muted-foreground ml-1">
                      — dados fictícios para visualização
                    </span>
                  </div>
                  {/* Área do viewer com scroll */}
                  <div className="flex-1 min-h-0 overflow-auto bg-[#cbd5e1]">
                    <ContractViewer
                      contract={{
                        id:              template.id ?? "preview",
                        organization_id: template.organization_id ?? "",
                        client_id:       "",
                        template_id:     template.id ?? null,
                        proposal_id:     null,
                        contract_number: "PREVIEW",
                        title:           `Preview — ${name}`,
                        service_slugs:   [],
                        variables:       previewVariables as unknown as Record<string, unknown>,
                        html_content:    currentEditorHtml,
                        due_day: null, first_payment_date: null,
                        total_monthly: null, total_setup: null,
                        status: "rascunho",
                        signed_at: null, cancelled_at: null,
                        cancellation_reason: null,
                        start_date: null, end_date: null, notes: null,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        payment_schedule: [],
                      }}
                      template={{
                        ...(template as ContractTemplate),
                        margin_top:     marginTop,
                        margin_bottom:  marginBot,
                        margin_left:    marginL,
                        margin_right:   marginR,
                        letterhead_url: letterhead ?? null,
                      }}
                    />
                  </div>
                </>
              )}
              </div>
            </TabsContent>

            {/* ── Tab: preview de assinaturas ────────────────────────── */}
            <TabsContent value="sigs" className="flex-1 min-h-0 mt-0 border-t data-[state=inactive]:hidden" asChild>
              <div className="flex flex-col flex-1 min-h-0">
                {/* Controle de modo */}
                <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 shrink-0">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Modo de assinatura:</span>
                  <div className="flex items-center rounded-md border overflow-hidden text-xs">
                    <button
                      type="button"
                      onClick={() => setPreviewSigningMode("individual")}
                      className={`px-3 py-1 transition-colors ${
                        previewSigningMode === "individual"
                          ? "bg-violet-600 text-white font-medium"
                          : "bg-background text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      Individual (1 rep)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewSigningMode("joint")}
                      className={`px-3 py-1 border-l transition-colors ${
                        previewSigningMode === "joint"
                          ? "bg-violet-600 text-white font-medium"
                          : "bg-background text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      Conjunta (2 reps)
                    </button>
                  </div>
                  <span className="text-[10px] text-muted-foreground ml-1">— dados fictícios</span>
                </div>

                {/* Renderização direta do bloco de assinaturas num iframe inline */}
                <div className="flex-1 min-h-0 overflow-auto bg-[#cbd5e1] flex items-start justify-center p-8">
                  <SigPreviewFrame
                    html={previewVariables["bloco_assinaturas"] ?? ""}
                    mt={marginTop} ml={marginL} mr={marginR}
                  />
                </div>
              </div>
            </TabsContent>

          </Tabs>
        </div>

        {/* Painel direito: configurações visuais */}
        <div className="w-72 shrink-0 overflow-y-auto p-4 space-y-5">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
              <Image className="h-4 w-4 text-violet-500" /> Papel Timbrado
            </h3>
            <div className="space-y-4">
              <ImageUploader
                label="Fundo / Timbrado"
                hint="Imagem de fundo do documento (A4). Usada como papel timbrado em toda a página."
                value={letterhead} field="letterhead_url" onChange={handleImageChange}
              />
              <ImageUploader
                label="Cabeçalho"
                hint="Imagem no topo de cada página. Recomendado: 1240×200px, fundo branco."
                value={headerUrl} field="header_url" onChange={handleImageChange}
              />
              <div className="space-y-1">
                <Label className="text-xs">Altura do cabeçalho (px)</Label>
                <Input type="number" value={headerH} min={40} max={300}
                  onChange={e => setHeaderH(Number(e.target.value))} className="h-7 text-xs" />
              </div>
              <ImageUploader
                label="Rodapé"
                hint="Imagem no rodapé de cada página. Recomendado: 1240×120px."
                value={footerUrl} field="footer_url" onChange={handleImageChange}
              />
              <div className="space-y-1">
                <Label className="text-xs">Altura do rodapé (px)</Label>
                <Input type="number" value={footerH} min={20} max={200}
                  onChange={e => setFooterH(Number(e.target.value))} className="h-7 text-xs" />
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-semibold mb-3">Margens (mm)</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Superior", value: marginTop,  setter: setMarginTop },
                { label: "Inferior", value: marginBot,  setter: setMarginBot },
                { label: "Esquerda", value: marginL,    setter: setMarginL },
                { label: "Direita",  value: marginR,    setter: setMarginR },
              ].map(({ label, value, setter }) => (
                <div key={label} className="space-y-0.5">
                  <Label className="text-xs">{label}</Label>
                  <Input type="number" value={value} min={0} max={60}
                    onChange={e => setter(Number(e.target.value))} className="h-7 text-xs" />
                </div>
              ))}
            </div>
          </div>

          <Separator />

          <div className="space-y-1.5">
            <Label className="text-xs">Descrição interna</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Opcional — para uso interno"
              className="text-xs min-h-[60px] resize-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
