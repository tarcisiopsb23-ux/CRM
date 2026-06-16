// src/components/settings/ContractSettingsTab.tsx
// Refactored to a 3-tab structure: Catálogo de Serviços, Cláusulas, Templates.
// Requirements: 1.8, 2.4, 4.2, 4.3, 4.4, 4.6, 4.8

import { FileText, Trash2, Eye } from "lucide-react";
import { useOrganization } from "@/hooks/useOrganization";
import { useContractTemplates } from "@/hooks/useContractTemplates";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ClausesLibraryTab } from "@/components/contracts/settings/ClausesLibraryTab";
import { assembleContract } from "@/lib/contracts/assembleContract";
import { useContractClauses } from "@/hooks/useContractClauses";
import type { ContractTemplateV2 } from "@/types/contracts";

export function ContractSettingsTab() {
  const organizationId = useOrganization();
  const {
    templates,
    createTemplate,
    updateTemplate,
    setDefault,
    deleteTemplate,
  } = useContractTemplates(organizationId);

  // ── Edit / Create dialog state ─────────────────────────────────────────────
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ContractTemplateV2 | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateContent, setTemplateContent] = useState("");

  // ── Delete confirmation state ──────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<ContractTemplateV2 | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // ── Blocked-delete state ───────────────────────────────────────────────────
  const [blockedDialogOpen, setBlockedDialogOpen] = useState(false);
  const [blockedCount, setBlockedCount] = useState(0);

  // ── Preview state ──────────────────────────────────────────────────────────
  const [previewTemplate, setPreviewTemplate] = useState<ContractTemplateV2 | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Clauses for preview — loaded lazily
  const { clauses } = useContractClauses(organizationId);

  // Mock data for preview
  const MOCK_CONTRACT = {
    id: "preview", title: "Contrato Exemplo", value: 3000, min_duration_months: 12,
    metadata: { services: [{ service_id: "s1", service_name: "Assessoria Digital", sub_service_values: {} }], setup_installments: 0 },
  };
  const MOCK_CLIENT = {
    name: "João Silva", company_name: "Empresa Exemplo Ltda",
    cnpj: "00.000.000/0001-00", cpf: "000.000.000-00",
  };

  function handlePreview(template: ContractTemplateV2) {
    setPreviewError(null);
    setPreviewHtml(null);
    setPreviewTemplate(template);
    if (!template.structure) {
      setPreviewError("Este template ainda não tem estrutura configurada. Clique em Editar para configurá-lo.");
      return;
    }
    try {
      const result = assembleContract(MOCK_CONTRACT, clauses, template, MOCK_CLIENT);
      setPreviewHtml(result.html);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Erro ao gerar pré-visualização.");
    }
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleOpenCreate = () => {
    setEditingTemplate(null);
    setTemplateName("");
    setTemplateContent("");
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (template: ContractTemplateV2) => {
    setEditingTemplate(template);
    setTemplateName(template.name);
    setTemplateContent(template.content);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!templateName.trim()) {
      toast.error("Nome do template é obrigatório!");
      return;
    }

    try {
      if (editingTemplate) {
        await updateTemplate.mutateAsync({
          id: editingTemplate.id,
          name: templateName.trim(),
          content: templateContent.trim(),
        });
        toast.success("Template atualizado com sucesso!");
      } else {
        await createTemplate.mutateAsync({
          name: templateName.trim(),
          content: templateContent.trim(),
        });
        toast.success("Template criado com sucesso!");
      }
      setIsDialogOpen(false);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Erro desconhecido";
      toast.error(`Erro ao salvar template: ${msg}`);
    }
  };

  /** Request deletion — first query active contracts, then decide. */
  const handleRequestDelete = (template: ContractTemplateV2) => {
    setDeleteTarget(template);
    setConfirmDeleteOpen(true);
  };

  /** Confirmed by user — execute the delete (includes active-contract check). */
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setConfirmDeleteOpen(false);

    try {
      const result = await deleteTemplate.mutateAsync(deleteTarget.id);
      if (result.blocked) {
        setBlockedCount(result.affectedCount);
        setBlockedDialogOpen(true);
      } else {
        toast.success("Template excluído com sucesso!");
        setDeleteTarget(null);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Erro desconhecido";
      toast.error(`Erro ao excluir template: ${msg}`);
      setDeleteTarget(null);
    }
  };

  const handleSetDefault = (template: ContractTemplateV2) => {
    setDefault.mutate(template.id, {
      onSuccess: () => toast.success(`"${template.name}" definido como template padrão.`),
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : "Erro desconhecido";
        toast.error(`Erro ao definir padrão: ${msg}`);
      },
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <Tabs defaultValue="clausulas">
        <TabsList>
          <TabsTrigger value="clausulas">Cláusulas</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Cláusulas ── */}
        <TabsContent value="clausulas" className="mt-6">
          <ClausesLibraryTab />
        </TabsContent>

        {/* ── Tab 3: Templates ── */}
        <TabsContent value="templates" className="mt-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">Templates de Contrato</h2>
                <p className="text-sm text-muted-foreground">
                  Crie e gerencie templates para os contratos dos clientes.
                </p>
              </div>
              <Button size="sm" onClick={handleOpenCreate}>
                <FileText className="h-4 w-4 mr-2" />
                Novo Template
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templates.map((template) => (
                <Card key={template.id} className="bg-background">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    {/* Name + default badge */}
                    <div className="flex items-center gap-2 min-w-0">
                      <CardTitle className="text-sm font-semibold truncate">
                        {template.name}
                      </CardTitle>
                      {template.is_default && (
                        <Badge variant="secondary" className="shrink-0 text-xs">
                          Padrão
                        </Badge>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      {!template.is_default && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSetDefault(template)}
                          disabled={setDefault.isPending}
                        >
                          Definir como padrão
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenEdit(template)}
                      >
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleRequestDelete(template)}
                        disabled={deleteTemplate.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {template.content}
                    </p>
                  </CardContent>
                </Card>
              ))}

              {templates.length === 0 && (
                <div className="col-span-full text-center py-8 border border-dashed border-border rounded-lg bg-muted/20">
                  <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-muted-foreground">Nenhum template de contrato criado ainda.</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Create / Edit dialog ── */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Editar Template" : "Novo Template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome do Template</Label>
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Ex: Contrato de Assessoria"
              />
            </div>
            <div className="space-y-2">
              <Label>Conteúdo</Label>
              <Textarea
                value={templateContent}
                onChange={(e) => setTemplateContent(e.target.value)}
                rows={12}
                placeholder="Conteúdo do contrato... Você pode usar placeholders como {{nome_cliente}}, {{servico}}, etc."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={createTemplate.isPending || updateTemplate.isPending}
            >
              {createTemplate.isPending || updateTemplate.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation dialog ── */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir template?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  Tem certeza que deseja excluir o template{" "}
                  <strong>"{deleteTarget.name}"</strong>? Esta ação não pode ser desfeita.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Blocked-by-active-contracts dialog (Req 4.8) ── */}
      <AlertDialog open={blockedDialogOpen} onOpenChange={setBlockedDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Template em uso — exclusão bloqueada</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Este template está referenciado em{" "}
                  <strong>
                    {blockedCount} contrato{blockedCount !== 1 ? "s" : ""}
                  </strong>{" "}
                  com status <em>ativo</em> ou <em>gerado</em>.
                </p>
                <p className="text-sm">
                  Para excluí-lo, primeiro altere ou remova esses contratos.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                setBlockedDialogOpen(false);
                setDeleteTarget(null);
              }}
            >
              Entendi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
