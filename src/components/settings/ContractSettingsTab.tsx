/**
 * ContractSettingsTab
 * Aba de Contratos em Configurações.
 * Permite gerenciar:
 *   - Templates base (estrutura/layout do documento)
 *   - Cláusulas (alíneas fixas e condicionais por serviço, agrupadas por categoria)
 *   - Assinaturas (blocos de assinatura configuráveis)
 */
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  FileText, Plus, Pencil, Trash2, Loader2, Eye, List,
  GripVertical, Hash, PenLine, FileSignature,
} from "lucide-react";
import { useContractTemplates, useAmendmentTemplates, useClauseCategories, useClauses, useSignatureBlocks } from "@/hooks/useContractTemplates";
import type { ContractTemplate, ClauseCategory, ClauseCategory as ClauseCategoryType, ContractClause, SignatureBlock } from "@/hooks/useContractTemplates";
import { ContractTemplateEditor } from "@/components/contracts/ContractTemplateEditor";
import { SignatureBlockEditor } from "@/components/contracts/SignatureBlockEditor";
import { ContractViewer } from "@/components/contracts/ContractViewer";
import { ClausesSettingsTab } from "@/components/contracts/ClausesSettingsTab";

// ── Monta variáveis de preview das cláusulas reais ────────────────────────────
function buildPreviewVariables(
  categories: ClauseCategoryType[],
  clauses: ContractClause[],
  signatureBlocks: SignatureBlock[] = [],
): Record<string, string> {
  const today = new Date();
  const fmtDate = (d: Date) => d.toLocaleDateString("pt-BR");
  const nextYear = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000);

  // Qualificação dinâmica de preview — simula uma PJ com representante legal
  const qualificacaoPreview =
    `<p><strong>Empresa Contratante LTDA</strong>, pessoa jurídica de direito privado, ` +
    `inscrita no CNPJ nº 00.000.000/0001-00, com sede na Rua Exemplo, 123, Centro, Teófilo Otoni/MG, ` +
    `neste ato representada por <strong>João da Silva</strong>, CPF nº 000.000.000-00, Sócio-Administrador, ` +
    `doravante denominado(a) <strong>CONTRATANTE</strong>.</p>`;

  const previewVars: Record<string, string> = {
    // Qualificação dinâmica
    qualificacao_contratante:      qualificacaoPreview,
    // Partes
    cliente:                       "Maria Oliveira",
    empresa:                       "Empresa Contratante LTDA",
    cnpj:                          "00.000.000/0001-00",
    cpf:                           "000.000.000-00",
    contratante_razao_social:      "Empresa Contratante LTDA",
    contratante_cnpj:              "00.000.000/0001-00",
    contratante_endereco:          "Rua Exemplo, 123, Centro, Teófilo Otoni/MG",
    // Representantes
    representante_nome:            "João da Silva",
    representante_cpf:             "000.000.000-00",
    representante_2_nome:          "Maria Oliveira",
    representante_2_cpf:           "111.111.111-11",
    representante_3_nome:          "",
    representante_3_cpf:           "",
    representante_qualificacao:    "João da Silva, inscrito no CPF nº 000.000.000-00, Sócio-Administrador",
    representante_qualificacao_cargo: "Sócio-Administrador",
    tipo_assinatura:               "individual",
    // Vigência
    vigencia_inicio:               fmtDate(today),
    vigencia_fim:                  fmtDate(nextYear),
    data_inicio:                   fmtDate(today),
    data_assinatura:               today.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }),
    data_inicio_vigencia:          today.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }),
    data_fim_vigencia:             nextYear.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }),
    prazo_vigencia_meses:          "12",
    prazo_vigencia_dias:           "365",
    prazo_vigencia_extenso:        "doze (12) meses",
    prazo_minimo:                  "12",
    prazo_minimo_meses:            "12",
    prazo_minimo_extenso:          "doze (12) meses",
    carencia_meses:                "3",
    carencia_extenso:              "três (3) meses",
    // Financeiro
    valor:                         "R$ 2.500,00",
    valor_mensalidade:             "R$ 2.500,00",
    valor_setup:                   "R$ 2.000,00",
    parcelas_setup:                "2",
    parcela_setup:                 "R$ 1.000,00",
    taxa_setup:                    "0%",
    vencimento:                    fmtDate(today),
    primeiro_pagamento:            fmtDate(today),
    cronograma_pagamento:          "<p>R$ 2.500,00 mensais, vencimento todo dia 10.</p>",
    texto_pagamento:               "Os pagamentos serão realizados exclusivamente via <strong>PIX</strong> (Chave CNPJ nº <strong>62.659.676/0001-49 – Agência C8 LTDA</strong>), vencendo-se a primeira parcela em <strong>10 de agosto de 2025</strong> e as demais no dia <strong>10</strong> de cada mês, sendo a adimplência condição indispensável para a continuidade da prestação dos serviços.",
    clausula_multa_atraso:         "O atraso no pagamento acarretará multa de 10% e juros de 1% ao mês.",
    clausula_suspensao:            "Atrasos superiores a 20 dias podem resultar na suspensão dos serviços.",
    // Serviços
    lista_servicos:                "<ul><li>Assessoria de Performance</li><li>Agente de IA</li></ul>",
    servicos:                      "<ul><li>Assessoria de Performance</li><li>Agente de IA</li></ul>",
    escopo:                        "<ul><li>Assessoria de Performance</li><li>Agente de IA</li></ul>",
    servico_principal:             "Assessoria de Performance e Estratégia de Vendas",
    servico_principal_slug:        "assessoria",
    // Local
    cidade_estado:                 "Teófilo Otoni/MG",
    foro_cidade:                   "Teófilo Otoni",
    data:                          fmtDate(today),
    // Formas de pagamento
    forma_pagamento:               "PIX",
    forma_pagamento_recorrente:    "PIX",
    forma_pagamento_setup:         "PIX",
    chave_pix:                     "62.659.676/0001-49",
    dia_vencimento:                "10",
    // Legado
    setup_valor:                   "R$ 2.000,00",
  };

  // Monta cada cláusula com suas alíneas reais
  let clauseNumber = 1;
  for (const cat of categories) {
    const alineas = clauses
      .filter(c => c.category_key === cat.key)
      .sort((a, b) => a.display_order - b.display_order);

    if (alineas.length === 0) {
      previewVars[`clausula_${cat.key}`] = "";
      continue;
    }

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
      return html;
    });

    const ordinal = `${clauseNumber}ª`;
    previewVars[`clausula_${cat.key}`] = `
<section class="contract-clause">
  <h2>Cláusula ${ordinal} — ${cat.label.toUpperCase()}</h2>
  ${resolvedAlineas.map(h => `<div class="alinea">${h}</div>`).join("\n")}
</section>`;
    clauseNumber++;
  }

  // Resolve blocos de assinatura com as vars de preview
  for (const block of signatureBlocks) {
    let html = block.html_content;
    Object.entries(previewVars).forEach(([k, v]) => {
      html = html.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
    });
    html = html.replace(/\{\{[^}]+\}\}/g, "___");
    previewVars[block.slug] = html;
  }

  return previewVars;
}

// ── Sub-aba: Templates base ───────────────────────────────────────────────────
function TemplatesSection() {
  const { data: templates = [], isLoading, saveTemplate, removeTemplate } = useContractTemplates();
  const { data: categories = [] } = useClauseCategories();
  const { data: allClauses = []  } = useClauses();
  const { data: sigBlocks = []   } = useSignatureBlocks();
  const [editing,    setEditing]    = useState<Partial<ContractTemplate> & { name: string } | null>(null);
  const [previewing, setPreviewing] = useState<ContractTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContractTemplate | null>(null);

  // Variáveis de preview montadas com as cláusulas reais do banco
  const previewVariables = useMemo(
    () => buildPreviewVariables(categories, allClauses, sigBlocks),
    [categories, allClauses, sigBlocks]
  );

  const handleSave = async (data: Partial<ContractTemplate> & { name: string; html_content: string }) => {
    try {
      await saveTemplate.mutateAsync(data);
      toast.success("Template salvo!");
      setEditing(null);
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao salvar template.");
    }
  };

  const handleDelete = async (tpl: ContractTemplate) => {
    try {
      await removeTemplate.mutateAsync(tpl.id);
      toast.success("Template desativado.");
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao remover.");
    }
  };

  // Modo preview em tela cheia
  if (previewing) {
    return (
      <div className="flex flex-col overflow-auto" style={{ height: "calc(100vh - 160px)" }}>
        <ContractViewer
          contract={{
            id: previewing.id,
            organization_id: previewing.organization_id,
            client_id: "",
            template_id: previewing.id,
            proposal_id: null,
            contract_number: "PREVIEW",
            title: `Preview — ${previewing.name}`,
            service_slugs: [],
            variables: previewVariables,
            html_content: previewing.html_content ?? null,
            due_day: null, first_payment_date: null,
            total_monthly: null, total_setup: null,
            status: "rascunho",
            signed_at: null, cancelled_at: null, cancellation_reason: null,
            start_date: null, end_date: null, notes: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            payment_schedule: [],
          }}
          template={previewing}
          onClose={() => setPreviewing(null)}
        />
      </div>
    );
  }

  // Modo editor em tela cheia
  if (editing) {
    return (
      <div className="flex flex-col" style={{ height: "calc(100vh - 160px)" }}>
        <ContractTemplateEditor
          template={editing}
          onSave={handleSave}
          onClose={() => setEditing(null)}
          isSaving={saveTemplate.isPending}
        />
      </div>
    );
  }

  if (isLoading) return <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">Templates Base</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            O template base contém as cláusulas comuns a todos os contratos (identificação das partes, sigilo, responsabilidade, rescisão e disposições gerais). Os blocos de serviço são inseridos automaticamente.
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing({ name: "Novo Template", html_content: "" })} className="gap-1.5 shrink-0">
          <Plus className="h-3.5 w-3.5" /> Novo template
        </Button>
      </div>

      <div className="grid gap-3">
        {templates.map(tpl => (
          <Card key={tpl.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-sm">{tpl.name}</CardTitle>
                    {tpl.is_default && <Badge variant="outline" className="text-[10px] text-violet-600 border-violet-300">Padrão</Badge>}
                    {tpl.letterhead_url && <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300">Com timbrado</Badge>}
                  </div>
                  {tpl.description && <CardDescription className="text-xs mt-0.5">{tpl.description}</CardDescription>}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Margens: {tpl.margin_top}mm top · {tpl.margin_bottom}mm bot · {tpl.margin_left}mm esq · {tpl.margin_right}mm dir
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" className="gap-1 text-xs text-muted-foreground"
                    title="Visualizar template"
                    onClick={() => setPreviewing(tpl)}>
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setEditing(tpl)}>
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    onClick={() => setDeleteTarget(tpl)} disabled={removeTemplate.isPending}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
        {templates.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhum template criado ainda.</p>
        )}
      </div>

      {deleteTarget && (
        <Dialog open onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-red-600 flex items-center gap-2"><Trash2 className="h-4 w-4" /> Desativar template</DialogTitle>
              <DialogDescription>O template <strong>{deleteTarget.name}</strong> será desativado. Contratos já gerados não serão afetados.</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
              <Button variant="destructive" onClick={() => handleDelete(deleteTarget)} disabled={removeTemplate.isPending}>
                {removeTemplate.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Desativar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── Sub-aba: Templates de Aditivo ────────────────────────────────────────────
function AmendmentTemplatesSection() {
  const { data: templates = [], isLoading, saveTemplate, removeTemplate } = useAmendmentTemplates();
  const [editing, setEditing] = useState<Partial<ContractTemplate> & { name: string; html_content: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContractTemplate | null>(null);
  const [previewing, setPreviewing] = useState<ContractTemplate | null>(null);

  const handleSave = async (data: Partial<ContractTemplate> & { name: string; html_content: string }) => {
    try {
      await saveTemplate.mutateAsync(data);
      toast.success("Template de aditivo salvo!");
      setEditing(null);
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao salvar template.");
    }
  };

  const handleDelete = async (tpl: ContractTemplate) => {
    try {
      await removeTemplate.mutateAsync(tpl.id);
      toast.success("Template desativado.");
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao remover.");
    }
  };

  if (editing) {
    return (
      <div className="flex flex-col" style={{ height: "calc(100vh - 160px)" }}>
        <ContractTemplateEditor
          template={editing}
          onSave={handleSave}
          onClose={() => setEditing(null)}
          isSaving={saveTemplate.isPending}
        />
      </div>
    );
  }

  if (isLoading) return <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">Templates de Aditivo</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Templates exclusivos para geração de documentos de aditivo contratual.
            Use variáveis como <code className="text-[10px] bg-muted px-1 rounded">{"{{tipo_aditivo}}"}</code>,{" "}
            <code className="text-[10px] bg-muted px-1 rounded">{"{{motivo}}"}</code>,{" "}
            <code className="text-[10px] bg-muted px-1 rounded">{"{{prazo_anterior}}"}</code>,{" "}
            <code className="text-[10px] bg-muted px-1 rounded">{"{{novo_prazo}}"}</code>,{" "}
            <code className="text-[10px] bg-muted px-1 rounded">{"{{valor_anterior}}"}</code>,{" "}
            <code className="text-[10px] bg-muted px-1 rounded">{"{{novo_valor}}"}</code>.
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing({ name: "Novo Template de Aditivo", html_content: "" })} className="gap-1.5 shrink-0">
          <Plus className="h-3.5 w-3.5" /> Novo template
        </Button>
      </div>

      <div className="grid gap-3">
        {templates.map(tpl => (
          <Card key={tpl.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-sm">{tpl.name}</CardTitle>
                    {tpl.letterhead_url && <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300">Com timbrado</Badge>}
                  </div>
                  {tpl.description && <CardDescription className="text-xs mt-0.5">{tpl.description}</CardDescription>}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Margens: {tpl.margin_top}mm top · {tpl.margin_bottom}mm bot · {tpl.margin_left}mm esq · {tpl.margin_right}mm dir
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setEditing(tpl)}>
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    onClick={() => setDeleteTarget(tpl)} disabled={removeTemplate.isPending}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
        {templates.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhum template de aditivo criado ainda.</p>
        )}
      </div>

      {deleteTarget && (
        <Dialog open onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-red-600 flex items-center gap-2"><Trash2 className="h-4 w-4" /> Desativar template</DialogTitle>
              <DialogDescription>O template <strong>{deleteTarget.name}</strong> será desativado.</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
              <Button variant="destructive" onClick={() => handleDelete(deleteTarget)} disabled={removeTemplate.isPending}>
                {removeTemplate.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Desativar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── Sub-aba: Categorias (cláusulas) ──────────────────────────────────────────
function CategoriesSection() {
  const { data: categories = [], isLoading, saveCategory, reorderCategory, removeCategory } = useClauseCategories();
  const [editing, setEditing] = useState<Partial<ClauseCategory> & { key: string; label: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClauseCategory | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.key.trim())   { toast.error("Identificador (key) é obrigatório."); return; }
    if (!editing.label.trim()) { toast.error("Nome da cláusula é obrigatório."); return; }
    // key só pode ter letras minúsculas, números e underscore
    if (!/^[a-z0-9_]+$/.test(editing.key)) {
      toast.error("Identificador deve conter apenas letras minúsculas, números e underscore.");
      return;
    }
    setIsSaving(true);
    try {
      await saveCategory.mutateAsync(editing);
      toast.success(editing.id ? "Cláusula atualizada!" : "Cláusula criada!");
      setEditing(null);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Erro ao salvar.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (cat: ClauseCategory) => {
    try {
      await removeCategory.mutateAsync(cat.id);
      toast.success("Cláusula removida.");
      setDeleteTarget(null);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Erro ao remover. Verifique se não há alíneas vinculadas.");
    }
  };

  const handleMoveUp = async (cat: ClauseCategory) => {
    const idx = categories.findIndex(c => c.id === cat.id);
    if (idx <= 0) return;
    const prev = categories[idx - 1];
    await reorderCategory.mutateAsync({ id: cat.id,  display_order: prev.display_order });
    await reorderCategory.mutateAsync({ id: prev.id, display_order: cat.display_order });
  };

  const handleMoveDown = async (cat: ClauseCategory) => {
    const idx = categories.findIndex(c => c.id === cat.id);
    if (idx >= categories.length - 1) return;
    const next = categories[idx + 1];
    await reorderCategory.mutateAsync({ id: cat.id,  display_order: next.display_order });
    await reorderCategory.mutateAsync({ id: next.id, display_order: cat.display_order });
  };

  if (isLoading) return (
    <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" /> Carregando...
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">Cláusulas (Categorias)</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Define quais cláusulas existem no contrato e a ordem em que aparecem no documento.
            A numeração (1ª, 2ª…) é gerada automaticamente conforme esta ordem.
            Cada cláusula gera o placeholder <code className="font-mono text-violet-600">{"{{clausula_<key>}}"}</code> para uso no template.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setEditing({ key: "", label: "", display_order: (categories[categories.length - 1]?.display_order ?? 0) + 1 })}
          className="gap-1.5 shrink-0"
        >
          <Plus className="h-3.5 w-3.5" /> Nova cláusula
        </Button>
      </div>

      <div className="grid gap-2">
        {categories.map((cat, idx) => (
          <Card key={cat.id} className="border-l-2 border-l-violet-200">
            <CardHeader className="py-3 px-4">
              <div className="flex items-center gap-3">
                {/* Número da ordem */}
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-violet-100 text-violet-700 text-xs font-bold shrink-0">
                  {cat.display_order}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-sm">{cat.label}</CardTitle>
                    <Badge variant="outline" className="text-[10px] font-mono text-slate-600">
                      {cat.placeholder}
                    </Badge>
                  </div>
                  {cat.description && (
                    <CardDescription className="text-xs mt-0.5">{cat.description}</CardDescription>
                  )}
                </div>

                {/* Ações */}
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground"
                    title="Mover para cima" disabled={idx === 0}
                    onClick={() => handleMoveUp(cat)}>↑</Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground"
                    title="Mover para baixo" disabled={idx === categories.length - 1}
                    onClick={() => handleMoveDown(cat)}>↓</Button>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 ml-1"
                    onClick={() => setEditing(cat)}>
                    <Pencil className="h-3 w-3" /> Editar
                  </Button>
                  <Button size="sm" variant="ghost"
                    className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 ml-0.5"
                    onClick={() => setDeleteTarget(cat)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
        {categories.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhuma cláusula cadastrada.</p>
        )}
      </div>

      {/* Dialog de edição */}
      {editing && (
        <Dialog open onOpenChange={open => { if (!open) setEditing(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-violet-500" />
                {editing.id ? "Editar cláusula" : "Nova cláusula"}
              </DialogTitle>
              <DialogDescription>
                A cláusula define uma seção do contrato. O identificador (key) é permanente após criação.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-1">
              {/* Key — só editável em criação */}
              <div className="space-y-1.5">
                <Label className="text-sm">
                  Identificador (key) <span className="text-red-500">*</span>
                </Label>
                <p className="text-xs text-muted-foreground">
                  Usado no placeholder do template. Apenas letras minúsculas, números e underscore.
                  Não pode ser alterado após a criação.
                </p>
                <Input
                  value={editing.key}
                  onChange={e => setEditing(prev => prev ? { ...prev, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") } : null)}
                  disabled={!!editing.id}
                  placeholder="ex: objeto, vigencia, penalidades"
                  className="h-8 font-mono text-sm"
                />
                {editing.key && (
                  <p className="text-[10px] text-violet-600 font-mono">
                    Placeholder: {`{{clausula_${editing.key}}}`}
                  </p>
                )}
              </div>

              {/* Label */}
              <div className="space-y-1.5">
                <Label className="text-sm">
                  Nome da cláusula <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={editing.label}
                  onChange={e => setEditing(prev => prev ? { ...prev, label: e.target.value } : null)}
                  placeholder="ex: Objeto, Vigência, Penalidades"
                  className="h-8 text-sm"
                />
              </div>

              {/* Ordem */}
              <div className="space-y-1.5">
                <Label className="text-sm">Ordem de exibição</Label>
                <p className="text-xs text-muted-foreground">
                  Determina a posição da cláusula no documento. Pode ser ajustada com as setas na listagem.
                </p>
                <Input
                  type="number"
                  min={1}
                  value={editing.display_order ?? ""}
                  onChange={e => setEditing(prev => prev ? { ...prev, display_order: Number(e.target.value) } : null)}
                  className="h-8 text-sm w-24"
                />
              </div>

              {/* Descrição */}
              <div className="space-y-1.5">
                <Label className="text-sm">Descrição interna</Label>
                <Textarea
                  value={editing.description ?? ""}
                  onChange={e => setEditing(prev => prev ? { ...prev, description: e.target.value } : null)}
                  placeholder="Opcional — descreve o propósito desta cláusula"
                  className="text-xs min-h-[60px] resize-none"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={isSaving} className="gap-1.5">
                {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Dialog de confirmação de exclusão */}
      {deleteTarget && (
        <Dialog open onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-red-600 flex items-center gap-2">
                <Trash2 className="h-4 w-4" /> Remover cláusula
              </DialogTitle>
              <DialogDescription>
                A cláusula <strong>{deleteTarget.label}</strong> será removida permanentemente.
                Isso falhará se houver alíneas cadastradas vinculadas a ela — remova as alíneas primeiro.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
              <Button variant="destructive" onClick={() => handleDelete(deleteTarget)} disabled={removeCategory.isPending}>
                {removeCategory.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Remover
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── Sub-aba: Assinaturas ─────────────────────────────────────────────────────
function SignaturesSection() {
  const { data: blocks = [], isLoading, saveSignatureBlock, removeSignatureBlock } = useSignatureBlocks();
  const { data: categories = [] } = useClauseCategories();
  const { data: allClauses  = [] } = useClauses();
  const [editing,     setEditing]     = useState<Partial<SignatureBlock> & { name: string; slug: string } | null>(null);
  const [previewing,  setPreviewing]  = useState<SignatureBlock | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SignatureBlock | null>(null);

  const previewVariables = useMemo(
    () => buildPreviewVariables(categories, allClauses, blocks),
    [categories, allClauses, blocks]
  );

  const handleSave = async (data: Partial<SignatureBlock> & { name: string; slug: string; html_content: string }) => {
    try {
      await saveSignatureBlock.mutateAsync(data);
      toast.success("Bloco de assinatura salvo!");
      setEditing(null);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Erro ao salvar.");
    }
  };

  const handleDelete = async (b: SignatureBlock) => {
    try {
      await removeSignatureBlock.mutateAsync(b.id);
      toast.success("Bloco desativado.");
      setDeleteTarget(null);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Erro ao remover.");
    }
  };

  if (editing) {
    return (
      <div className="flex flex-col" style={{ height: "calc(100vh - 160px)" }}>
        <SignatureBlockEditor
          block={editing}
          onSave={handleSave}
          onClose={() => setEditing(null)}
          isSaving={saveSignatureBlock.isPending}
        />
      </div>
    );
  }

  // Preview em tela cheia
  if (previewing) {
    const resolvedHtml = (() => {
      let html = previewing.html_content;
      Object.entries(previewVariables).forEach(([k, v]) => {
        html = html.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
      });
      html = html.replace(/\{\{[^}]+\}\}/g, "___");
      return html;
    })();
    return (
      <div className="flex flex-col overflow-auto" style={{ height: "calc(100vh - 160px)" }}>
        <ContractViewer
          contract={{
            id: previewing.id,
            organization_id: previewing.organization_id,
            client_id: "",
            template_id: null,
            proposal_id: null,
            contract_number: "PREVIEW",
            title: `Preview — ${previewing.name}`,
            service_slugs: [],
            variables: {},
            html_content: resolvedHtml,
            due_day: null, first_payment_date: null,
            total_monthly: null, total_setup: null,
            status: "rascunho",
            signed_at: null, cancelled_at: null, cancellation_reason: null,
            start_date: null, end_date: null, notes: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            payment_schedule: [],
          }}
          template={null}
          onClose={() => setPreviewing(null)}
        />
      </div>
    );
  }

  if (isLoading) return (
    <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" /> Carregando...
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">Blocos de Assinatura</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure os blocos de assinatura usados nos contratos. Cada bloco é inserido no
            template via variável (ex: <code className="font-mono">{"{{assinatura_contratada}}"}</code>).
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing({ name: "", slug: "", html_content: "" })} className="gap-1.5 shrink-0">
          <Plus className="h-3.5 w-3.5" /> Novo bloco
        </Button>
      </div>

      <div className="grid gap-3">
        {blocks.map(b => (
          <Card key={b.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-sm">{b.name}</CardTitle>
                    <Badge variant="outline" className="text-[10px] font-mono text-violet-600 border-violet-300">
                      {`{{${b.slug}}}`}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" title="Visualizar bloco"
                    className="gap-1 text-xs text-muted-foreground"
                    onClick={() => setPreviewing(b)}>
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setEditing(b)}>
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </Button>
                  <Button size="sm" variant="ghost"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    onClick={() => setDeleteTarget(b)}
                    disabled={removeSignatureBlock.isPending}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
        {blocks.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhum bloco configurado ainda.</p>
        )}
      </div>

      {deleteTarget && (
        <Dialog open onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-red-600 flex items-center gap-2">
                <Trash2 className="h-4 w-4" /> Desativar bloco
              </DialogTitle>
              <DialogDescription>
                O bloco <strong>{deleteTarget.name}</strong> será desativado.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
              <Button variant="destructive" onClick={() => handleDelete(deleteTarget)} disabled={removeSignatureBlock.isPending}>
                {removeSignatureBlock.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Desativar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export function ContractSettingsTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4 text-violet-500" /> Contratos
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure os templates, cláusulas e serviços usados na geração de contratos.
        </p>
      </div>

      <Tabs defaultValue="templates">
        <TabsList>
          <TabsTrigger value="templates" className="gap-1.5 text-xs">
            <FileText className="h-3.5 w-3.5" /> Templates Base
          </TabsTrigger>
          <TabsTrigger value="amendment-templates" className="gap-1.5 text-xs">
            <FileSignature className="h-3.5 w-3.5" /> Templates de Aditivo
          </TabsTrigger>
          <TabsTrigger value="categories" className="gap-1.5 text-xs">
            <Hash className="h-3.5 w-3.5" /> Cláusulas
          </TabsTrigger>
          <TabsTrigger value="clauses" className="gap-1.5 text-xs">
            <List className="h-3.5 w-3.5" /> Alíneas
          </TabsTrigger>
          <TabsTrigger value="signatures" className="gap-1.5 text-xs">
            <PenLine className="h-3.5 w-3.5" /> Assinaturas
          </TabsTrigger>
        </TabsList>
        <TabsContent value="templates" className="mt-4">
          <TemplatesSection />
        </TabsContent>
        <TabsContent value="amendment-templates" className="mt-4">
          <AmendmentTemplatesSection />
        </TabsContent>
        <TabsContent value="categories" className="mt-4">
          <CategoriesSection />
        </TabsContent>
        <TabsContent value="clauses" className="mt-4">
          <ClausesSettingsTab />
        </TabsContent>
        <TabsContent value="signatures" className="mt-4">
          <SignaturesSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
