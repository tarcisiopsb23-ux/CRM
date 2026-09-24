/**
 * SignatureBlockEditor
 *
 * Editor do bloco de assinaturas usando tabela nativa TipTap.
 * Colunas são criadas via <table class="sig-table"> inserida por JSON ProseMirror.
 * No editor: células com borda tracejada. No contrato: sem bordas, centralizado.
 */
import { useState, useCallback, useMemo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import { IndentExtension } from "@/lib/tiptap/IndentExtension";
import { AlphaListExtension } from "@/lib/tiptap/AlphaListExtension";
import { sigTableEditorCss } from "@/lib/tiptap/tableExtensions";
import { TableToolbar } from "@/components/contracts/TableToolbar";
import { ContractViewer } from "@/components/contracts/ContractViewer";
import { buildSignatureBlockHtml } from "@/lib/contracts/buildSignatureBlock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Indent, Outdent, Undo, Redo, Save, FileText, Wand2, Loader2,
  Columns, LayoutTemplate, Eye, User, Users,
} from "lucide-react";
import { toast } from "sonner";
import type { SignatureBlock } from "@/hooks/useContractTemplates";

// ── Extensão SigTable: preserva class="sig-table" no HTML gerado ──────────────
const SigTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      class: {
        default: null,
        parseHTML: (el) => el.getAttribute("class") || null,
        renderHTML: (attrs) => attrs.class ? { class: attrs.class } : {},
      },
    };
  },
});

const sigTableExtensions = [
  SigTable.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
];

// ── Variáveis disponíveis ─────────────────────────────────────────────────────

const SIG_VARIABLES = [
  { key: "contratante_razao_social",  label: "Razão Social do Contratante" },
  { key: "representante_nome",        label: "Representante — Nome (1º / responsável)" },
  { key: "representante_cpf",         label: "Representante — CPF (1º / responsável)" },
  { key: "representante_2_nome",      label: "Representante — Nome (2º)" },
  { key: "representante_2_cpf",       label: "Representante — CPF (2º)" },
  { key: "representante_3_nome",      label: "Representante — Nome (3º)" },
  { key: "representante_3_cpf",       label: "Representante — CPF (3º)" },
  { key: "representante_qualificacao",label: "Qualificação completa de todos" },
  { key: "data_assinatura",           label: "Data de Assinatura" },
  { key: "cidade_estado",             label: "Cidade / Estado" },
];

const SNIPPET_SIG_LINE = `<p class="sig-line"> </p>`;

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  block: Partial<SignatureBlock> & { name: string; slug: string };
  onSave: (data: Partial<SignatureBlock> & { name: string; slug: string; html_content: string }) => Promise<void>;
  onClose: () => void;
  isSaving: boolean;
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

function Toolbar({
  editor,
  onInsert,
  onInsertSigTable,
}: {
  editor: ReturnType<typeof useEditor>;
  onInsert: (html: string) => void;
  onInsertSigTable: (cols: number) => void;
}) {
  if (!editor) return null;

  const btn = (action: () => void, icon: React.ReactNode, label: string, active = false) => (
    <button type="button" onClick={action} title={label}
      className={`p-1.5 rounded hover:bg-muted transition-colors ${active ? "bg-muted" : ""}`}>
      {icon}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b px-2 py-1.5 bg-background sticky top-0 z-10">
      {btn(() => editor.chain().focus().toggleBold().run(),       <Bold className="h-4 w-4" />,          "Negrito",    editor.isActive("bold"))}
      {btn(() => editor.chain().focus().toggleItalic().run(),     <Italic className="h-4 w-4" />,        "Itálico",    editor.isActive("italic"))}
      {btn(() => editor.chain().focus().toggleUnderline().run(),  <UnderlineIcon className="h-4 w-4" />, "Sublinhado", editor.isActive("underline"))}
      <div className="w-px h-5 bg-border mx-1" />
      {btn(() => editor.chain().focus().toggleBulletList().run(),  <List className="h-4 w-4" />,        "Lista",    editor.isActive("bulletList"))}
      {btn(() => editor.chain().focus().toggleOrderedList().run(), <ListOrdered className="h-4 w-4" />, "Numerada", editor.isActive("orderedList"))}
      <div className="w-px h-5 bg-border mx-1" />
      {btn(() => editor.commands.indent(),  <Indent  className="h-4 w-4" />, "Aumentar recuo")}
      {btn(() => editor.commands.outdent(), <Outdent className="h-4 w-4" />, "Reduzir recuo")}
      <div className="w-px h-5 bg-border mx-1" />
      {btn(() => editor.chain().focus().setTextAlign("left").run(),    <AlignLeft className="h-4 w-4" />,    "Esquerda",   editor.isActive({ textAlign: "left" }))}
      {btn(() => editor.chain().focus().setTextAlign("center").run(),  <AlignCenter className="h-4 w-4" />,  "Centralizar",editor.isActive({ textAlign: "center" }))}
      {btn(() => editor.chain().focus().setTextAlign("right").run(),   <AlignRight className="h-4 w-4" />,   "Direita",    editor.isActive({ textAlign: "right" }))}
      {btn(() => editor.chain().focus().setTextAlign("justify").run(), <AlignJustify className="h-4 w-4" />, "Justificar", editor.isActive({ textAlign: "justify" }))}
      <div className="w-px h-5 bg-border mx-1" />
      {/* Linha de assinatura */}
      <button type="button" title="Inserir linha de assinatura (___)"
        onClick={() => onInsert(SNIPPET_SIG_LINE)}
        className="px-2 py-1 rounded hover:bg-muted transition-colors text-xs font-bold text-muted-foreground border border-border">
        ____
      </button>
      <div className="w-px h-5 bg-border mx-1" />
      {/* Tabelas de assinatura — via JSON ProseMirror, preserva class="sig-table" */}
      <button type="button" title="Inserir 1 coluna de assinatura"
        onClick={() => onInsertSigTable(1)}
        className="px-1.5 py-1 rounded hover:bg-violet-50 border border-border transition-colors flex items-center gap-0.5 text-xs font-semibold text-violet-600">
        <Columns className="h-3.5 w-3.5" /><span>1</span>
      </button>
      <button type="button" title="Inserir 2 colunas de assinatura lado a lado"
        onClick={() => onInsertSigTable(2)}
        className="px-1.5 py-1 rounded hover:bg-violet-50 border border-border transition-colors flex items-center gap-0.5 text-xs font-semibold text-violet-600">
        <Columns className="h-3.5 w-3.5" /><span>2</span>
      </button>
      <button type="button" title="Inserir 3 colunas de assinatura lado a lado"
        onClick={() => onInsertSigTable(3)}
        className="px-1.5 py-1 rounded hover:bg-violet-50 border border-border transition-colors flex items-center gap-0.5 text-xs font-semibold text-violet-600">
        <LayoutTemplate className="h-3.5 w-3.5" /><span>3</span>
      </button>
      <div className="w-px h-5 bg-border mx-1" />
      {btn(() => editor.chain().focus().undo().run(), <Undo className="h-4 w-4" />, "Desfazer")}
      {btn(() => editor.chain().focus().redo().run(), <Redo className="h-4 w-4" />, "Refazer")}
      <TableToolbar editor={editor} />
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function SignatureBlockEditor({ block, onSave, onClose, isSaving }: Props) {
  const [name, setName]           = useState(block.name ?? "");
  const [slug, setSlug]           = useState(block.slug ?? "");
  const [previewMode, setPreviewMode] = useState<"individual" | "conjunta">("individual");
  const [activeTab, setActiveTab] = useState("editor");

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Underline,
      IndentExtension,
      AlphaListExtension,
      ...sigTableExtensions,
    ],
    content: block.html_content ?? "",
    editorProps: {
      attributes: { class: "contract-editor focus:outline-none min-h-[400px] p-4" },
    },
  });

  const insertVariable = useCallback((key: string) => {
    editor?.chain().focus().insertContent(`{{${key}}}`).run();
    setActiveTab("editor");
  }, [editor]);

  const insertHtml = useCallback((html: string) => {
    editor?.chain().focus().insertContent(html).run();
  }, [editor]);

  // Insere tabela de assinatura via JSON do ProseMirror — preserva class="sig-table"
  const insertSigTable = useCallback((cols: number) => {
    if (!editor) return;

    const makeCell = (colIndex: number) => ({
      type: "tableCell",
      attrs: {},
      content: [
        {
          type: "paragraph",
          attrs: { textAlign: "center" },
          content: [{ type: "text", marks: [{ type: "bold" }], text: `COLUNA ${colIndex + 1}` }],
        },
        {
          type: "paragraph",
          attrs: {},
          content: [{ type: "text", text: " " }],
        },
        {
          type: "paragraph",
          attrs: { textAlign: "center" },
          content: [{ type: "text", text: "Nome" }],
        },
      ],
    });

    editor.chain().focus().insertContent({
      type: "table",
      attrs: { class: "sig-table" },
      content: [{
        type: "tableRow",
        content: Array.from({ length: cols }, (_, i) => makeCell(i)),
      }],
    }).run();
  }, [editor]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Nome é obrigatório."); return; }
    if (!slug.trim()) { toast.error("Slug é obrigatório."); return; }
    await onSave({ ...block, name, slug, html_content: editor?.getHTML() ?? "" });
  };

  const previewHtml = useMemo(() => {
    if (activeTab !== "preview") return "";
    // Simula o HTML exatamente como o ContractGenerator/assembleContract vai gerar
    // usando dados fictícios de acordo com o modo selecionado.
    const repsIndividual = [
      { nome: "João da Silva", cpf: "000.000.000-00", cargo: "Sócio-Administrador", qualificacao: null },
    ];
    const repsConjunta = [
      { nome: "João da Silva",   cpf: "000.000.000-00", cargo: null, qualificacao: "socio_administrador" as const },
      { nome: "Maria Oliveira",  cpf: "111.111.111-11", cargo: null, qualificacao: "socio" as const },
      { nome: "Carlos Santos",   cpf: "222.222.222-22", cargo: null, qualificacao: "representante_legal" as const },
    ];
    return buildSignatureBlockHtml({
      contratanteRazaoSocial: "EMPRESA XYZ LTDA",
      reps: previewMode === "individual" ? repsIndividual : repsConjunta,
    });
  }, [activeTab, previewMode]);

  const previewContract = useMemo(() => ({
    id: "sig-preview", organization_id: "", client_id: "",
    template_id: null, proposal_id: null,
    contract_number: "PREVIEW",
    title: `Preview — ${name || "Bloco de Assinaturas"}`,
    service_slugs: [] as string[],
    variables: {} as Record<string, unknown>,
    html_content: previewHtml,
    due_day: null, first_payment_date: null, total_monthly: null, total_setup: null,
    status: "rascunho" as const,
    signed_at: null, cancelled_at: null, cancellation_reason: null,
    start_date: null, end_date: null, notes: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    payment_schedule: [],
  }), [previewHtml, name]);

  return (
    <div className="flex flex-col h-full">
      <style>{sigTableEditorCss}</style>

      {/* Barra superior */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-background shrink-0">
        <FileText className="h-4 w-4 text-violet-500 shrink-0" />
        <div className="flex items-center gap-2 flex-1 flex-wrap">
          <Input value={name} onChange={e => setName(e.target.value)}
            className="h-8 text-sm max-w-xs" placeholder="Ex: Bloco de Assinaturas" />
          <Input
            value={slug}
            onChange={e => setSlug(e.target.value.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""))}
            className="h-8 text-sm max-w-[200px] font-mono"
            placeholder="bloco_assinaturas"
            disabled={!!block.id}
            title={block.id ? "Slug não pode ser alterado após criação" : "Identificador usado como {{slug}} no template"}
          />
          {slug && (
            <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded">
              {`{{${slug}}}`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 ml-auto shrink-0">
          <Button size="sm" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving} className="gap-1.5">
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Editor + abas */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
            <TabsList className="shrink-0 mx-4 mt-2 w-fit">
              <TabsTrigger value="editor" className="text-xs gap-1"><FileText className="h-3 w-3" /> Conteúdo</TabsTrigger>
              <TabsTrigger value="vars"   className="text-xs gap-1"><Wand2    className="h-3 w-3" /> Variáveis</TabsTrigger>
              <TabsTrigger value="preview" className="text-xs gap-1"><Eye     className="h-3 w-3" /> Preview</TabsTrigger>
            </TabsList>

            <TabsContent value="editor" className="flex-1 min-h-0 overflow-auto mt-0 border-t">
              <Toolbar editor={editor} onInsert={insertHtml} onInsertSigTable={insertSigTable} />
              <EditorContent editor={editor} />
            </TabsContent>

            <TabsContent value="vars" className="flex-1 overflow-y-auto p-4 mt-0 border-t space-y-4">
              <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                Clique numa variável para inserir no cursor do editor.
              </div>
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <strong>Assinatura conjunta:</strong> insira uma tabela de 2 ou 3 colunas e coloque{" "}
                <code className="font-mono">{"{{representante_2_nome}}"}</code> na segunda coluna.
              </div>
              <div className="flex flex-wrap gap-2">
                {SIG_VARIABLES.map(v => (
                  <button key={v.key} type="button" onClick={() => insertVariable(v.key)}
                    className="inline-flex flex-col items-start rounded border bg-violet-50 border-violet-200 px-2 py-1.5 hover:bg-violet-100 transition-colors text-left">
                    <span className="font-mono text-[10px] text-violet-700">{`{{${v.key}}}`}</span>
                    <span className="text-[10px] text-muted-foreground mt-0.5">{v.label}</span>
                  </button>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="preview" className="flex-1 min-h-0 overflow-auto mt-0 border-t">
              {/* Seletor individual / conjunta — só afeta as variáveis injetadas no preview */}
              <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30">
                <span className="text-xs text-muted-foreground">Simular:</span>
                <div className="flex items-center rounded-md border border-input overflow-hidden h-7">
                  <button
                    type="button"
                    onClick={() => setPreviewMode("individual")}
                    className={`flex items-center gap-1 px-2.5 h-full text-xs transition-colors ${
                      previewMode === "individual"
                        ? "bg-slate-100 text-slate-700 font-medium"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <User className="h-3 w-3" /> Individual
                  </button>
                  <div className="w-px h-full bg-border" />
                  <button
                    type="button"
                    onClick={() => setPreviewMode("conjunta")}
                    className={`flex items-center gap-1 px-2.5 h-full text-xs transition-colors ${
                      previewMode === "conjunta"
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <Users className="h-3 w-3" /> Conjunta (3 rep.)
                  </button>
                </div>
              </div>
              {previewHtml.trim() ? (
                <ContractViewer contract={previewContract} template={null} />
              ) : (
                <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                  Adicione conteúdo no editor para visualizar o preview.
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Painel direito: dicas */}
        <div className="w-60 shrink-0 border-l overflow-y-auto p-4 space-y-3">
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 space-y-1.5">
            <p className="font-semibold">Como usar no template</p>
            <code className="block font-mono bg-white border border-amber-200 rounded px-2 py-1 text-center">
              {`{{${slug || "slug_do_bloco"}}}`}
            </code>
          </div>
          <div className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2.5 text-xs text-violet-800 space-y-1.5">
            <p className="font-semibold">Colunas de assinatura</p>
            <p>Use os botões <strong className="text-violet-700">≡1</strong>, <strong className="text-violet-700">≡2</strong>, <strong className="text-violet-700">≡3</strong> para inserir tabela com 1, 2 ou 3 colunas. Borda tracejada no editor, sem borda no contrato.</p>
          </div>
          <div className="rounded-md border border-border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground space-y-1.5">
            <p className="font-semibold">Linha de assinatura</p>
            <p>Use <strong>____</strong> para inserir uma linha horizontal de assinatura.</p>
          </div>
          <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-700 space-y-1.5">
            <p className="font-semibold">Assinatura conjunta</p>
            <p>Tabela 2 colunas + <code className="font-mono">{"{{representante_nome}}"}</code> e <code className="font-mono">{"{{representante_2_nome}}"}</code> em células separadas.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
