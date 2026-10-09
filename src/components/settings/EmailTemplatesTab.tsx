import { useState, useEffect } from "react";
import { useOrganization } from "@/hooks/useOrganization";
import { useEmailTemplates, DEFAULT_TEMPLATES, type EmailTemplate } from "@/hooks/useEmailTemplates";
import { UnlayerEditor } from "./UnlayerEditor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Mail, Pencil, Trash2, RotateCcw, Loader2 } from "lucide-react";

// ── Tab principal ─────────────────────────────────────────────────────────────
export function EmailTemplatesTab() {
  const organizationId = useOrganization();
  const { data: templates = [], isLoading, save, remove, restore, seedDefaults } = useEmailTemplates(organizationId);

  // Controla qual template está sendo editado (null = lista)
  const [editing, setEditing] = useState<(Partial<EmailTemplate> & { slug: string; name: string }) | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmailTemplate | null>(null);
  const [seeded, setSeeded] = useState(false);

  // Seed automático na primeira visita
  useEffect(() => {
    if (!isLoading && !seeded && organizationId && templates.length === 0) {
      setSeeded(true);
      seedDefaults.mutate();
    }
  }, [isLoading, seeded, organizationId, templates.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Agrupa por slug — os 3 templates padrão sempre aparecem, independente do banco
  // (usa DEFAULT_TEMPLATES como fonte de verdade para a lista)
  const bySlug = DEFAULT_TEMPLATES.map(def => {
    const custom = templates.find(t => t.slug === def.slug && !t.is_default);
    const dflt   = templates.find(t => t.slug === def.slug && t.is_default);
    // Ativo: customizado > padrão do banco > padrão embutido (sempre tem algo)
    const active = custom?.is_active ? custom : dflt?.is_active ? dflt : null;
    return { def, custom, dflt, active };
  });

  const handleSave = async (data: {
    subject: string; html_body: string;
    design_json: Record<string, unknown>; name: string;
  }) => {
    if (!editing) return;
    try {
      // Se está editando um template padrão (is_default = true ou sem id),
      // cria um novo template customizado em vez de sobrescrever o padrão.
      const isEditingDefault = editing.is_default || !editing.id;
      await save.mutateAsync({
        ...editing,
        id:         isEditingDefault ? undefined : editing.id, // força INSERT para padrão
        is_default: false,
        ...data,
      });
      toast.success("Template salvo com sucesso!");
      setEditing(null);
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao salvar template.");
    }
  };

  const handleDelete = async (tpl: EmailTemplate) => {
    try {
      await remove.mutateAsync(tpl.id);
      toast.success(tpl.is_default
        ? "Template padrão desativado. O layout interno do sistema será usado."
        : "Template personalizado removido. O padrão voltará a ser usado.");
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao remover template.");
    }
  };

  const handleRestore = async (tpl: EmailTemplate) => {
    try {
      await restore.mutateAsync(tpl.id);
      toast.success("Template restaurado.");
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao restaurar.");
    }
  };

  // ── Modo editor: tela cheia ───────────────────────────────────────────────
  if (editing) {
    return (
      <div
        className="flex flex-col"
        style={{ height: "calc(100vh - 120px)" }}
      >
        <UnlayerEditor
          template={editing}
          onSave={handleSave}
          onClose={() => setEditing(null)}
          isSaving={save.isPending}
        />
      </div>
    );
  }

  // ── Modo lista ────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando templates...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Mail className="h-4 w-4 text-violet-500" />
          Templates de E-mail
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Personalize os e-mails enviados pelo sistema com o editor visual.
          Ao excluir um template personalizado, o padrão é usado automaticamente.
        </p>
      </div>

      <div className="grid gap-4">
        {bySlug.map(({ def, custom, dflt, active }) => {
          const isUsingCustom = !!custom?.is_active;
          const isDisabled    = !active;

          return (
            <Card key={def.slug} className={isDisabled ? "opacity-60" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-sm">{def.name}</CardTitle>
                      {isUsingCustom && (
                        <Badge className="text-[10px] bg-violet-100 text-violet-700 border-violet-200">
                          Personalizado
                        </Badge>
                      )}
                      {!isUsingCustom && !isDisabled && (
                        <Badge variant="outline" className="text-[10px] text-slate-500">
                          Padrão
                        </Badge>
                      )}
                      {isDisabled && (
                        <Badge variant="outline" className="text-[10px] text-red-500 border-red-200">
                          Desativado
                        </Badge>
                      )}
                    </div>
                    {def.description && (
                      <CardDescription className="text-xs mt-0.5">{def.description}</CardDescription>
                    )}
                    <p className="text-[11px] text-muted-foreground mt-1 font-mono truncate">
                      Assunto: {active?.subject ?? def.subject}
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                      Variáveis: {def.variables.map(v => `{{${v}}}`).join(", ")}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {isDisabled ? (
                      <Button size="sm" variant="outline" className="gap-1 text-xs"
                        onClick={() => handleRestore((custom ?? dflt)!)}
                        disabled={restore.isPending}>
                        <RotateCcw className="h-3.5 w-3.5" /> Restaurar
                      </Button>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" className="gap-1 text-xs"
                          onClick={() => setEditing(
                            isUsingCustom
                              ? custom!
                              : {
                                  // Abre com dados do padrão do banco ou do DEFAULT_TEMPLATES
                                  id:          dflt?.id,
                                  slug:        def.slug,
                                  name:        dflt?.name ?? def.name,
                                  subject:     dflt?.subject ?? def.subject,
                                  html_body:   dflt?.html_body ?? def.html_body,
                                  design_json: dflt?.design_json ?? def.design_json ?? null,
                                  variables:   def.variables,
                                  is_default:  !!dflt,
                                }
                          )}>
                          <Pencil className="h-3.5 w-3.5" />
                          {isUsingCustom ? "Editar" : "Personalizar"}
                        </Button>
                        {/* Excluir só aparece se há algo no banco para excluir */}
                        {(custom || dflt) && (
                          <Button size="sm" variant="ghost"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => setDeleteTarget(isUsingCustom ? custom! : dflt!)}
                            disabled={remove.isPending}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      {/* Dialog confirmar exclusão */}
      {deleteTarget && (
        <Dialog open onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <Trash2 className="h-4 w-4" />
                {deleteTarget.is_default ? "Desativar template padrão" : "Remover template personalizado"}
              </DialogTitle>
              <DialogDescription>
                {deleteTarget.is_default
                  ? "O template padrão será desativado. Os e-mails deste tipo usarão o layout interno do sistema até que um novo seja criado."
                  : "O template personalizado será removido e o padrão voltará a ser usado automaticamente."}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
              <Button variant="destructive"
                onClick={() => handleDelete(deleteTarget)}
                disabled={remove.isPending}>
                {remove.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {deleteTarget.is_default ? "Desativar" : "Remover"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
