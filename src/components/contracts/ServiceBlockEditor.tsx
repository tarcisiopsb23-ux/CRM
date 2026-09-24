/**
 * ServiceBlockEditor
 * Editor de um bloco de cláusulas de serviço.
 *
 * O bloco contém apenas o conteúdo HTML/TipTap com variáveis.
 * As regras financeiras (valores, carência, etc.) são configuradas
 * no cadastro do contrato no módulo Clientes — não aqui.
 */
import { useState, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bold, Italic, List, ListOrdered, Heading2,
  Undo, Redo, Save, FileText, Wand2, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import type { ServiceBlock } from "@/hooks/useContractTemplates";

// Variáveis disponíveis dentro de um bloco de serviço
// Todas vêm do contrato cadastrado no módulo Clientes
const BLOCK_VARIABLES = [
  // ── Numeração automática ──────────────────────────────────────────────────
  { key: "num",                     label: "Número da cláusula (automático)",       group: "Estrutura" },
  // ── Dados das partes ──────────────────────────────────────────────────────
  { key: "contratante_razao_social", label: "Razão Social / Nome do Contratante",   group: "Partes" },
  { key: "contratante_cnpj",         label: "CNPJ / CPF do Contratante",            group: "Partes" },
  { key: "contratante_endereco",     label: "Endereço do Contratante",              group: "Partes" },
  { key: "representante_nome",       label: "Nome do Representante",               group: "Partes" },
  { key: "representante_cpf",        label: "CPF do Representante",                group: "Partes" },
  // ── Vigência e prazos ─────────────────────────────────────────────────────
  { key: "prazo_vigencia_meses",     label: "Prazo de vigência (número em meses)", group: "Vigência" },
  { key: "prazo_vigencia_dias",      label: "Prazo de vigência (número em dias)",  group: "Vigência" },
  { key: "prazo_vigencia_extenso",   label: "Prazo por extenso (ex: doze meses)",  group: "Vigência" },
  { key: "data_inicio",              label: "Data de início do contrato",          group: "Vigência" },
  { key: "data_assinatura",          label: "Data de assinatura",                  group: "Vigência" },
  // ── Remuneração ───────────────────────────────────────────────────────────
  { key: "cronograma_pagamento",     label: "Bloco completo do cronograma",        group: "Remuneração" },
  // ── Local e foro ─────────────────────────────────────────────────────────
  { key: "cidade_estado",            label: "Cidade e Estado",                     group: "Local" },
  { key: "foro_cidade",              label: "Cidade do Foro",                      group: "Local" },
];

const GROUPS = [...new Set(BLOCK_VARIABLES.map(v => v.group))];

interface Props {
  block: Partial<ServiceBlock> & { slug: string; name: string };
  onSave: (data: Partial<ServiceBlock> & { slug: string; name: string; html_content: string }) => Promise<void>;
  onClose: () => void;
  isSaving: boolean;
}

function Toolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;
  const btn = (action: () => void, icon: React.ReactNode, label: string, active = false) => (
    <button type="button" onClick={action} title={label}
      className={`p-1.5 rounded hover:bg-muted transition-colors ${active ? "bg-muted" : ""}`}>
      {icon}
    </button>
  );
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b px-2 py-1.5 bg-background sticky top-0 z-10">
      {btn(() => editor.chain().focus().toggleBold().run(),        <Bold className="h-4 w-4" />,        "Negrito",  editor.isActive("bold"))}
      {btn(() => editor.chain().focus().toggleItalic().run(),      <Italic className="h-4 w-4" />,      "Itálico",  editor.isActive("italic"))}
      <div className="w-px h-5 bg-border mx-1" />
      {btn(() => editor.chain().focus().toggleHeading({ level: 2 }).run(), <Heading2 className="h-4 w-4" />, "Título", editor.isActive("heading", { level: 2 }))}
      {btn(() => editor.chain().focus().toggleBulletList().run(),  <List className="h-4 w-4" />,        "Lista",    editor.isActive("bulletList"))}
      {btn(() => editor.chain().focus().toggleOrderedList().run(), <ListOrdered className="h-4 w-4" />, "Numerada", editor.isActive("orderedList"))}
      <div className="w-px h-5 bg-border mx-1" />
      {btn(() => editor.chain().focus().undo().run(), <Undo className="h-4 w-4" />, "Desfazer")}
      {btn(() => editor.chain().focus().redo().run(), <Redo className="h-4 w-4" />, "Refazer")}
    </div>
  );
}

export function ServiceBlockEditor({ block, onSave, onClose, isSaving }: Props) {
  const [name,        setName]        = useState(block.name ?? "");
  const [slug,        setSlug]        = useState(block.slug ?? "");
  const [description, setDescription] = useState(block.description ?? "");

  const editor = useEditor({
    extensions: [StarterKit],
    content: block.html_content ?? "",
    editorProps: {
      attributes: { class: "prose prose-sm max-w-none focus:outline-none min-h-[400px] p-4" },
    },
  });

  const insertVariable = useCallback((key: string) => {
    editor?.chain().focus().insertContent(`{{${key}}}`).run();
  }, [editor]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Nome do bloco é obrigatório."); return; }
    if (!slug.trim()) { toast.error("Slug é obrigatório."); return; }
    await onSave({
      // Preserva todos os campos do bloco existente (incluindo regras financeiras
      // que são gerenciadas pelo sistema, não pelo editor de templates)
      ...block,
      name,
      slug,
      description: description || null,
      html_content: editor?.getHTML() ?? "",
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Barra superior */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-background shrink-0">
        <FileText className="h-4 w-4 text-violet-500 shrink-0" />
        <div className="flex items-center gap-2 flex-1">
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            className="h-8 text-sm max-w-xs"
            placeholder="Nome do bloco (ex: Agente de IA)"
          />
          <Input
            value={slug}
            onChange={e => setSlug(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
            className="h-8 text-sm max-w-[180px] font-mono"
            placeholder="slug_do_bloco"
            disabled={!!block.id}
            title={block.id ? "Slug não pode ser alterado após criação" : "Identificador único do bloco"}
          />
          <Input
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="h-8 text-sm flex-1"
            placeholder="Descrição interna (opcional)"
          />
        </div>
        <div className="flex items-center gap-2 ml-auto shrink-0">
          <Button size="sm" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving} className="gap-1.5">
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar
          </Button>
        </div>
      </div>

      {/* O conteúdo das cláusulas migrou para Configurações → Alíneas */}
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-4">
        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 space-y-1">
          <p className="font-semibold">Cláusulas condicionais</p>
          <p>
            O conteúdo das cláusulas deste serviço é gerenciado em{" "}
            <strong>Configurações → Contratos → Alíneas</strong>.
            Crie alíneas com condição <em>"Serviço específico"</em> e selecione o slug{" "}
            <code className="font-mono bg-blue-100 rounded px-1">{slug || "deste serviço"}</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
