import React, { useEffect, useMemo, useState } from "react";
import { SettingsSection } from "./SettingsSection";
import { useOrganization } from "@/hooks/useOrganization";
import { useProfiles } from "@/hooks/useProfiles";
import { useJobTitleRoleMappings } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { getJobTitleFromProfileMetadata } from "@/lib/jobTitles";
import { useJobTitleCatalog } from "@/hooks/useJobTitleCatalog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Pencil, Trash2, Check, X, Shield } from "lucide-react";
import { UserRole } from "@/types/auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { AccessesTab } from "./AccessesTab";

export function PermissionsSection() {
  const organizationId = useOrganization();
  const { profile } = useAuth();
  const isOwner = profile?.role === "owner";
  const isAdmin = profile?.role === "admin" || profile?.role === "owner";
  const { data: profiles = [] } = useProfiles(organizationId);
  const [mode, setMode] = useState<"cargos" | "permissoes" | "acessos">("cargos");

  const cargoCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of profiles) {
      const jt = getJobTitleFromProfileMetadata(p.metadata);
      if (!jt) continue;
      map.set(jt, (map.get(jt) ?? 0) + 1);
    }
    return map;
  }, [profiles]);

  const catalog = useJobTitleCatalog(organizationId);
  const mappings = useJobTitleRoleMappings(organizationId);

  const cargoOptions = useMemo(() => (catalog.data ?? []).map((r) => r.job_title), [catalog.data]);

  const [newCargo, setNewCargo] = useState("");
  const [editingCargo, setEditingCargo] = useState<string | null>(null);
  const [editingCargoValue, setEditingCargoValue] = useState("");

  const saveNewCargo = async () => {
    try {
      const title = newCargo.trim();
      if (!title) throw new Error("Informe um cargo");
      await catalog.create.mutateAsync({ job_title: title });
      setNewCargo("");
      toast.success("Cargo cadastrado");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar cargo");
    }
  };

  const startEditCargo = (title: string) => {
    setEditingCargo(title);
    setEditingCargoValue(title);
  };

  const saveEditCargo = async () => {
    try {
      if (!editingCargo) return;
      const oldTitle = editingCargo.trim();
      const newTitle = editingCargoValue.trim();
      if (!oldTitle || !newTitle) throw new Error("Informe um cargo");
      if (oldTitle === newTitle) { setEditingCargo(null); return; }
      await catalog.rename.mutateAsync({ old_title: oldTitle, new_title: newTitle });
      setEditingCargo(null);
      toast.success("Cargo atualizado");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar cargo");
    }
  };

  const deleteCargo = async (title: string) => {
    try {
      await catalog.remove.mutateAsync({ job_title: title });
      toast.success("Cargo removido");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover cargo");
    }
  };

  return (
    <SettingsSection
      title="Cargos e Permissões"
      description="Cadastre cargos, vincule cargos a user_role e defina acessos por cargo/colaborador."
      icon={<Shield className="h-5 w-5" />}
    >
      <div className="space-y-4">
        <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)} className="space-y-4">
          <TabsList className="w-full flex flex-wrap justify-start">
            <TabsTrigger value="cargos">Cargos</TabsTrigger>
            <TabsTrigger value="permissoes">Permissões</TabsTrigger>
            <TabsTrigger value="acessos">Acessos</TabsTrigger>
          </TabsList>

          {/* ── Aba Cargos ─────────────────────────────────────────────────── */}
          <TabsContent value="cargos" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
              <div className="space-y-1">
                <Label>Cargo</Label>
                <Input
                  value={newCargo}
                  onChange={(e) => setNewCargo(e.target.value)}
                  placeholder="Ex: SDR, Atendimento, Mídia"
                />
              </div>
              <div>
                <Button onClick={saveNewCargo} disabled={!isAdmin || catalog.create.isPending}>
                  Salvar
                </Button>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              {catalog.isLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left py-3 px-4 font-medium">Cargo</th>
                        <th className="text-left py-3 px-4 font-medium">Permissão</th>
                        <th className="text-left py-3 px-4 font-medium">Colaboradores</th>
                        <th className="text-right py-3 px-4 font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(catalog.data ?? []).map((r) => (
                        <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2 px-4">
                            {editingCargo === r.job_title ? (
                              <Input
                                value={editingCargoValue}
                                onChange={(e) => setEditingCargoValue(e.target.value)}
                              />
                            ) : (
                              <span className="font-medium">{r.job_title}</span>
                            )}
                          </td>
                          <td className="py-2 px-4">
                            <Select
                              value={r.role ?? "member"}
                              onValueChange={(v) =>
                                catalog.update.mutate({ id: r.id, job_title: r.job_title, role: v as UserRole })
                              }
                              disabled={!isAdmin || catalog.update.isPending}
                            >
                              <SelectTrigger className="max-w-[180px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="owner">Proprietário</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="manager">Gestor</SelectItem>
                                <SelectItem value="member">Membro</SelectItem>
                                <SelectItem value="viewer">Visualizador</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="py-2 px-4 text-muted-foreground">
                            {cargoCounts.get(r.job_title) ?? 0}
                          </td>
                          <td className="py-2 px-4">
                            <div className="flex justify-end gap-2">
                              {editingCargo === r.job_title ? (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setEditingCargo(null)}
                                    disabled={!isAdmin || catalog.rename.isPending}
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={saveEditCargo}
                                    disabled={!isAdmin || catalog.rename.isPending}
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => startEditCargo(r.job_title)}
                                    disabled={!isAdmin}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => deleteCargo(r.job_title)}
                                    disabled={!isAdmin || catalog.remove.isPending}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!catalog.isLoading && (catalog.data ?? []).length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-muted-foreground">
                            Nenhum cargo cadastrado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Aba Permissões ─────────────────────────────────────────────── */}
          <TabsContent value="permissoes" className="space-y-4">
            <div className="border rounded-lg overflow-hidden">
              {mappings.isLoading || catalog.isLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left py-3 px-4 font-medium">Cargo</th>
                        <th className="text-left py-3 px-4 font-medium">Colaboradores</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cargoOptions.map((title) => (
                        <tr key={title} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2 px-4 font-medium">{title}</td>
                          <td className="py-2 px-4 text-muted-foreground">{cargoCounts.get(title) ?? 0}</td>
                        </tr>
                      ))}
                      {cargoOptions.length === 0 && (
                        <tr>
                          <td colSpan={2} className="py-8 text-center text-muted-foreground">
                            Cadastre cargos na aba Cargos.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Aba Acessos ────────────────────────────────────────────────── */}
          <TabsContent value="acessos">
            <AccessesTab organizationId={organizationId} isAdmin={isAdmin} isOwner={isOwner} />
          </TabsContent>
        </Tabs>
      </div>
    </SettingsSection>
  );
}
