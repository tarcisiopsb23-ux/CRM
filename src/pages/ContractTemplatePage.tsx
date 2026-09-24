import { useState } from "react";
import { Plus, Star, Pencil, Check, Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useContractTemplates } from "@/hooks/useContractTemplates";
import { useAuth } from "@/contexts/AuthContext";
import { assembleContract } from "@/lib/contracts/assembleContract";
import type { ContractTemplate } from "@/types/proposals";
import type { ContractTemplateV2 } from "@/types/contracts";

// Variáveis disponíveis para uso nos templates de contrato e aditivo.
// Mapeadas 1:1 com o varMap de assembleContract.ts.
const VARIABLES = [
  // ── Contratante ──────────────────────────────────────────────────────────
  "{{cliente}}",                   // Nome fantasia / nome do cliente
  "{{empresa}}",                   // Razão social da empresa
  "{{contratante_razao_social}}",  // Razão social ou nome completo (PF/PJ)
  "{{cnpj}}",                      // CNPJ do contratante
  "{{cpf}}",                       // CPF do contratante (PF)
  "{{contratante_cnpj}}",          // CNPJ (alias explícito)
  "{{contratante_endereco}}",      // Endereço formatado
  "{{qualificacao_contratante}}", // Bloco completo de qualificação (PJ/PF + representantes)
  "{{representante_nome}}",        // Nome do 1º representante legal
  "{{representante_cpf}}",         // CPF do 1º representante legal
  // ── Serviços ──────────────────────────────────────────────────────────────
  "{{servicos}}",                  // Lista de serviços com entregáveis (HTML)
  "{{escopo}}",                    // Alias de servicos
  "{{lista_servicos}}",            // Alias de servicos
  // ── Financeiro — recorrente ───────────────────────────────────────────────
  "{{valor}}",                     // Valor mensal formatado (R$)
  "{{valor_mensalidade}}",         // Alias de valor
  "{{forma_pagamento}}",           // Forma de pagamento recorrente (PIX, boleto…)
  "{{dia_vencimento}}",            // Dia do mês do vencimento (ex: 20)
  "{{vencimento}}",                // Data do primeiro vencimento (dd/mm/aaaa)
  "{{chave_pix}}",                 // Chave PIX da agência
  "{{cronograma_pagamento}}",      // Tabela completa do cronograma de pagamento
  "{{texto_pagamento}}",           // Frase completa: via PIX (chave X), vencimento dia Y, primeira em Z
  // ── Financeiro — setup ────────────────────────────────────────────────────
  "{{valor_setup}}",               // Valor total do setup (R$)
  "{{parcelas_setup}}",            // Número de parcelas do setup
  "{{parcela_setup}}",             // Valor de cada parcela do setup (R$)
  "{{taxa_setup}}",                // Percentual de taxas do setup
  "{{vencimento_setup}}",          // Vencimento da 1ª parcela do setup
  "{{forma_pagamento_setup}}",     // Forma de pagamento do setup
  // ── Vigência e prazos ─────────────────────────────────────────────────────
  "{{vigencia_inicio}}",           // Data de início da vigência (dd/mm/aaaa)
  "{{vigencia_fim}}",              // Data de término da vigência (dd/mm/aaaa)
  "{{prazo_minimo}}",              // Prazo mínimo em meses (número)
  "{{prazo_minimo_extenso}}",      // Prazo mínimo por extenso (ex: doze (12) meses)
  "{{prazo_vigencia_meses}}",      // Duração total em meses (número)
  "{{prazo_vigencia_extenso}}",    // Duração total por extenso
  "{{duracao_meses}}",             // Alias de prazo_vigencia_meses
  // ── Carência ─────────────────────────────────────────────────────────────
  "{{carencia_meses}}",            // Carência em meses (número)
  "{{carencia_extenso}}",          // Carência por extenso
  // ── Datas ─────────────────────────────────────────────────────────────────
  "{{data}}",                      // Data atual (dd/mm/aaaa)
  "{{data_assinatura}}",           // Data da contratação por extenso
  // ── Localização e foro ────────────────────────────────────────────────────
  "{{cidade_estado}}",             // Cidade/Estado do contratante
  "{{foro_cidade}}",               // Cidade do foro
  // ── Assinaturas ──────────────────────────────────────────────────────────
  "{{bloco_assinaturas}}",         // Tabela de assinaturas CONTRATADA + CONTRATANTE
];

// ---------------------------------------------------------------------------
// Mock data para pré-visualização
// ---------------------------------------------------------------------------

const MOCK_CONTRACT = {
  id: "preview",
  title: "Contrato Exemplo",
  value: 2500,
  min_duration_months: 12,
  prazo_minimo_meses: 12,
  vigencia_inicio: new Date().toISOString().slice(0, 10),
  vigencia_fim: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  total_monthly: 2500,
  grace_months: 3,
  signing_type: "individual" as const,
  has_payment_schedule: false,
  cidade_estado: "Teófilo Otoni/MG",
  signed_at: new Date().toISOString(),
  metadata: {
    services: [] as import("@/types/contracts").SelectedService[],
    setup_installments: 2,
    setup_value: 2000,
    setup_parcel_value: 1000,
    setup_fees: 0,
    setup_first_due_date: new Date().toISOString().slice(0, 10),
    setup_payment_method: "pix",
  },
};

const MOCK_CLAUSES = [
  {
    id: "clause-preview-1",
    title: "Prestação de Serviços",
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", marks: [{ type: "bold" }], text: "1.1" },
            {
              type: "text",
              text: " O presente contrato tem por objeto a prestação de serviços de Assessoria de Marketing Digital.",
            },
          ],
        },
      ],
    },
    display_order: 0,
    condition_type: "always" as const,
    condition_value: null,
    is_editable: false,
    service_id: null,
    organization_id: "",
    created_at: "",
    updated_at: "",
  },
  {
    id: "clause-preview-2",
    title: "Vigência",
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", marks: [{ type: "bold" }], text: "2.1" },
            {
              type: "text",
              text: " A vigência do presente contrato será de {{prazo_minimo_extenso}}, com início em {{vigencia_inicio}}.",
            },
          ],
        },
      ],
    },
    display_order: 1,
    condition_type: "always" as const,
    condition_value: null,
    is_editable: false,
    service_id: null,
    organization_id: "",
    created_at: "",
    updated_at: "",
  },
];

const MOCK_CLIENT = {
  name: "Maria Oliveira",
  company_name: "Empresa Exemplo Ltda",
  document: "00000000000100",               // CNPJ — 14 dígitos → PJ
  cnpj: "00.000.000/0001-00",
  address: "Rua Exemplo, 123, Centro, Teófilo Otoni/MG",
  cidade: "Teófilo Otoni",
  estado: "MG",
  estado_civil: null,                        // PJ não tem estado civil
  nacionalidade: null,
  representatives: [
    {
      id: "rep-preview-1",
      nome: "João da Silva",
      cpf: "000.000.000-00",
      cargo: "Sócio-Administrador",
      qualificacao: "socio_administrador" as const,
      tipo_representacao: "legal" as const,
      procuracao_tipo: null,
      procuracao_data: null,
      procuracao_indeterminada: false,
      representa_ids: null,
      is_signing_responsible: true,
      is_legal_representative: true,
    },
  ],
};

// ---------------------------------------------------------------------------

export default function ContractTemplatePage() {
  const { organizationId } = useAuth();
  const { templates, isLoading, createTemplate, updateTemplate, setDefault } = useContractTemplates(organizationId ?? undefined);
  const [editingTemplate, setEditingTemplate] = useState<ContractTemplate | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");

  // Preview state
  const [previewTemplate, setPreviewTemplate] = useState<ContractTemplateV2 | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const openCreate = () => { setEditingTemplate(null); setName(""); setContent(""); setDialogOpen(true); };
  const openEdit = (t: ContractTemplate) => { setEditingTemplate(t); setName(t.name); setContent(t.content); setDialogOpen(true); };

  const openPreview = (t: ContractTemplateV2) => {
    setPreviewError(null);
    setPreviewHtml(null);
    setPreviewTemplate(t);
    try {
      const result = assembleContract(MOCK_CONTRACT, MOCK_CLAUSES, t, MOCK_CLIENT);
      setPreviewHtml(result.html);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao gerar pré-visualização.";
      setPreviewError(message);
    }
    setPreviewOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Informe o nome do template."); return; }
    try {
      if (editingTemplate) { await updateTemplate.mutateAsync({ id: editingTemplate.id, name, content }); toast.success("Atualizado!"); }
      else { await createTemplate.mutateAsync({ name, content }); toast.success("Criado!"); }
      setDialogOpen(false);
    } catch { toast.error("Erro ao salvar."); }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Templates de Contrato</h1><p className="text-sm text-muted-foreground">Templates para geração automática de contratos</p></div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" /> Novo Template</Button>
      </div>
      <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Variáveis disponíveis</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">{VARIABLES.map(v => <Badge key={v} variant="outline" className="font-mono text-xs">{v}</Badge>)}</CardContent>
      </Card>
      {isLoading ? <p className="text-muted-foreground text-sm">Carregando...</p>
      : templates.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-4">
          <p className="text-muted-foreground">Nenhum template criado.</p>
          <Button variant="outline" onClick={openCreate}><Plus className="h-4 w-4 mr-2" /> Criar primeiro</Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {templates.map(t => (
            <Card key={t.id}><CardContent className="pt-4 flex items-start justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2"><span className="font-semibold">{t.name}</span>{t.is_default && <Badge className="bg-amber-100 text-amber-700 border-amber-200">Padrão</Badge>}</div>
                <p className="text-xs text-muted-foreground line-clamp-2">{t.content || "Vazio"}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                {!t.is_default && <Button variant="outline" size="sm" onClick={async () => { try { await setDefault.mutateAsync(t.id); toast.success("Padrão atualizado!"); } catch { toast.error("Erro."); } }}><Star className="h-3.5 w-3.5 mr-1" /> Padrão</Button>}
                <Button variant="outline" size="sm" onClick={() => openPreview(t as unknown as ContractTemplateV2)}><Eye className="h-3.5 w-3.5 mr-1" /> Visualizar</Button>
                <Button variant="outline" size="sm" onClick={() => openEdit(t)}><Pencil className="h-3.5 w-3.5 mr-1" /> Editar</Button>
              </div>
            </CardContent></Card>
          ))}
        </div>
      )}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editingTemplate ? "Editar Template" : "Novo Template"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1"><Label>Nome</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Contrato Padrão" /></div>
            <div className="space-y-1"><Label>Conteúdo (HTML com variáveis)</Label><Textarea rows={14} value={content} onChange={e => setContent(e.target.value)} className="font-mono text-xs resize-none" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}><Check className="h-4 w-4 mr-1" /> Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal de pré-visualização ── */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b shrink-0">
            <DialogTitle>
              Pré-visualização — {previewTemplate?.name ?? "Template"}
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Dados fictícios para ilustrar o layout do template.
            </p>
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0 px-6 py-4">
            {previewError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                <strong>Erro na pré-visualização:</strong> {previewError}
              </div>
            ) : previewHtml ? (
              <div
                className="bg-white text-black p-8 shadow rounded prose max-w-none text-sm leading-relaxed"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            ) : (
              <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
                Nenhum conteúdo para visualizar.
              </div>
            )}
          </ScrollArea>

          <DialogFooter className="px-6 py-4 border-t shrink-0">
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
