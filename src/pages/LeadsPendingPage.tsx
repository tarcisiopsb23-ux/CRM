import { useState, useEffect } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { useListasManager, type CreateListaInput } from '@/hooks/useListasManager';
import { useLeadsKanban } from '@/hooks/useLeadsKanban';
import { useProfiles } from '@/hooks/useProfiles';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Link2, Plus, Loader2, Zap, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Lead } from '@/types/database';

export function LeadsPendingPage() {
  const organizationId = useOrganization();
  const { data: profiles = [] } = useProfiles(organizationId);
  const { leads: allLeads, removeLead } = useLeadsKanban(organizationId);
  const {
    listas,
    loading: listasLoading,
    fetchListas,
    getLista,
    createLista,
    linkLeadToLista,
    autoLinkPendingLeads,
  } = useListasManager(organizationId);

  // Filtrar apenas leads sem lista_id
  const pendingLeads = allLeads.filter(l => !l.lista_id);

  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedListaId, setSelectedListaId] = useState<string>('');
  const [createListaOpen, setCreateListaOpen] = useState(false);
  const [creatingLista, setCreatingLista] = useState(false);
  const [autoLinking, setAutoLinking] = useState(false);
  const [filtering, setFiltering] = useState(false);

  // estado de exclusão
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [createForm, setCreateForm] = useState<CreateListaInput>({
    nome: '',
    cidade: '',
    estado: '',
    nicho: '',
  });

  useEffect(() => {
    if (organizationId) {
      fetchListas();
    }
  }, [organizationId, fetchListas]);

  // ==================
  // VINCULAR LEAD A LISTA
  // ==================
  const handleLinkLead = async (leadId: string, listaId: string) => {
    try {
      if (!listaId) {
        toast.error('Selecione uma lista');
        return;
      }
      await linkLeadToLista(leadId, listaId);
      toast.success('Lead vinculado com sucesso');
      setLinkDialogOpen(false);
      setSelectedLead(null);
      setSelectedListaId('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    }
  };

  // ==================
  // VINCULAR MÚLTIPLOS LEADS
  // ==================
  const handleLinkMultiple = async () => {
    if (selectedLeads.size === 0) {
      toast.error('Selecione pelo menos um lead');
      return;
    }
    if (!selectedListaId) {
      toast.error('Selecione uma lista');
      return;
    }

    try {
      setFiltering(true);
      for (const leadId of selectedLeads) {
        await linkLeadToLista(leadId, selectedListaId);
      }
      toast.success(`${selectedLeads.size} leads vinculados com sucesso`);
      setSelectedLeads(new Set());
      setSelectedListaId('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setFiltering(false);
    }
  };

  // ==================
  // CRIAR LISTA RÁPIDA (INLINE)
  // ==================
  const handleCreateListaRapida = async () => {
    try {
      if (!createForm.nome.trim() || !createForm.cidade.trim() || !createForm.nicho.trim()) {
        toast.error('Nome, Cidade e Nicho são obrigatórios');
        return;
      }

      setCreatingLista(true);
      const newLista = await createLista(createForm);
      toast.success('Lista criada com sucesso');

      // Vincular o lead selecionado se houver
      if (selectedLead && newLista) {
        await linkLeadToLista(selectedLead.id, newLista.id);
        toast.success('Lead vinculado à nova lista');
      }

      setCreateListaOpen(false);
      setCreateForm({
        nome: '',
        cidade: '',
        estado: '',
        nicho: '',
      });
      setSelectedLead(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setCreatingLista(false);
    }
  };

  // ==================
  // AUTO-LINK EM LOTE
  // ==================
  const handleAutoLinkBatch = async () => {
    if (!confirm('Executar auto-link para TODOS os leads pendentes? Isso pode levar alguns minutos.')) {
      return;
    }

    try {
      setAutoLinking(true);
      const result = await autoLinkPendingLeads();
      toast.success(`${result.linked_count} leads vinculados automaticamente`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setAutoLinking(false);
    }
  };

  // ==================
  // EXCLUIR LEAD PERMANENTEMENTE
  // ==================
  const handleDeleteLead = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await removeLead(deleteTarget.id);
      toast.success(`${deleteTarget.company || deleteTarget.name} excluído permanentemente.`);
      setDeleteTarget(null);
      // Remove da seleção em lote se estava marcado
      setSelectedLeads(prev => { const s = new Set(prev); s.delete(deleteTarget.id); return s; });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao excluir lead.');
    } finally {
      setDeleting(false);
    }
  };

  // ==================
  // OBTER DADOS ADICIONAIS
  // ==================
  const getCidadeFromLead = (lead: Lead) => {
    // Prefer the dedicated column; fall back to metadata for leads not yet migrated
    return lead.cidade || (lead.metadata?.cidade as string) || '—';
  };

  const getResponsavelName = (profileId: string | null | undefined) => {
    if (!profileId) return '—';
    const profile = profiles.find(p => p.id === profileId);
    return profile?.full_name || '—';
  };

  // ==================
  // OBTER LISTAS COMPATÍVEIS COM UM LEAD
  // ==================
  const getCompatibleListas = (lead: Lead) => {
    const cidade = getCidadeFromLead(lead);
    const nicho = lead.nicho || '';

    if (!cidade || !nicho) return [];

    return listas.filter(
      l => l.cidade === cidade && l.nicho === nicho && l.status === 'ativa'
    );
  };

  if (listasLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leads Pendentes de Vinculação</h1>
          <p className="text-muted-foreground mt-2">
            {pendingLeads.length} leads aguardando vinculação a listas
          </p>
        </div>
      </div>

      {pendingLeads.length === 0 ? (
        <Alert className="border-green-200 bg-green-50">
          <AlertCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800 ml-2">
            Excelente! Todos os leads foram vinculados a listas.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {/* AÇÕES EM LOTE */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ações em Lote</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={handleAutoLinkBatch}
                  disabled={autoLinking}
                  className="gap-2"
                  variant="secondary"
                >
                  {autoLinking && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Zap className="h-4 w-4" />
                  Auto-Link Automático
                </Button>

                <Button
                  onClick={handleLinkMultiple}
                  disabled={selectedLeads.size === 0 || !selectedListaId || filtering}
                  className="gap-2"
                >
                  {filtering && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Link2 className="h-4 w-4" />
                  Vincular {selectedLeads.size} Lead(s)
                </Button>

                {selectedLeads.size > 0 && (
                  <>
                    <span className="text-sm text-muted-foreground self-center">para:</span>
                    <Select value={selectedListaId} onValueChange={setSelectedListaId}>
                      <SelectTrigger className="w-[250px]">
                        <SelectValue placeholder="Selecione uma lista" />
                      </SelectTrigger>
                      <SelectContent>
                        {listas.map(lista => (
                          <SelectItem key={lista.id} value={lista.id}>
                            {lista.nome} ({lista.cidade}, {lista.nicho})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* TABELA DE LEADS PENDENTES */}
          <Card>
            <CardHeader>
              <CardTitle>Leads Pendentes</CardTitle>
              <CardDescription>
                Selecione leads para vincular em lote ou clique em um lead para opções específicas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="table-scroll-container">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedLeads.size === pendingLeads.length}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedLeads(new Set(pendingLeads.map(l => l.id)));
                            } else {
                              setSelectedLeads(new Set());
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Nicho</TableHead>
                      <TableHead>Cidade</TableHead>
                      <TableHead>Responsável</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Listas Compatíveis</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingLeads.map(lead => {
                      const compatibleListas = getCompatibleListas(lead);
                      const ciudad = getCidadeFromLead(lead);

                      return (
                        <TableRow key={lead.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedLeads.has(lead.id)}
                              onCheckedChange={(checked) => {
                                const newSet = new Set(selectedLeads);
                                if (checked) {
                                  newSet.add(lead.id);
                                } else {
                                  newSet.delete(lead.id);
                                }
                                setSelectedLeads(newSet);
                              }}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{lead.company || lead.name}</TableCell>
                          <TableCell>{lead.nicho || '—'}</TableCell>
                          <TableCell>{ciudad}</TableCell>
                          <TableCell className="text-sm">{getResponsavelName(lead.assigned_to)}</TableCell>
                          <TableCell className="text-sm">
                            R$ {lead.value?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell>
                            {compatibleListas.length > 0 ? (
                              <div className="flex gap-1 flex-wrap">
                                {compatibleListas.map(l => (
                                  <Badge key={l.id} variant="secondary" className="text-xs">
                                    {l.nome} v{l.versao}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">Sem listas compatíveis</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedLead(lead);
                                  setLinkDialogOpen(true);
                                }}
                                className="gap-1"
                              >
                                <Link2 className="h-4 w-4" />
                                Vincular
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setDeleteTarget(lead)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* DIALOG: VINCULAR LEAD */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Vincular Lead a Lista</DialogTitle>
            <DialogDescription>
              {selectedLead?.company || selectedLead?.name}
            </DialogDescription>
          </DialogHeader>

          {selectedLead && (
            <div className="space-y-4">
              <div className="bg-muted p-3 rounded-lg text-sm">
                <p><strong>Nicho:</strong> {selectedLead.nicho || '—'}</p>
                <p><strong>Cidade:</strong> {getCidadeFromLead(selectedLead)}</p>
              </div>

              <div>
                <Label htmlFor="link-lista">Selecione uma Lista</Label>
                <Select value={selectedListaId} onValueChange={setSelectedListaId}>
                  <SelectTrigger id="link-lista">
                    <SelectValue placeholder="Escolha uma lista" />
                  </SelectTrigger>
                  <SelectContent>
                    {listas
                      .filter(l => l.status === 'ativa')
                      .map(lista => (
                        <SelectItem key={lista.id} value={lista.id}>
                          {lista.nome} ({lista.cidade}, {lista.nicho})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedLead.nicho && getCidadeFromLead(selectedLead) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => {
                    setCreateListaOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Criar Nova Lista para este Lead
                </Button>
              )}

              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setLinkDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => handleLinkLead(selectedLead.id, selectedListaId)}
                >
                  Vincular
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* DIALOG: EXCLUIR LEAD */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm border-border bg-card">
          <DialogHeader>
            <DialogTitle>Excluir Lead</DialogTitle>
            <DialogDescription>
              <strong>{deleteTarget?.company || deleteTarget?.name}</strong> será excluído permanentemente da base de dados. Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeleteLead} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir permanentemente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: CRIAR LISTA RÁPIDA */}
      <Dialog open={createListaOpen} onOpenChange={setCreateListaOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Criar Nova Lista</DialogTitle>
            <DialogDescription>
              Crie uma lista rápida e vincule o lead imediatamente
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {selectedLead && (
              <div className="bg-muted p-3 rounded-lg text-sm">
                <p><strong>Lead:</strong> {selectedLead.company || selectedLead.name}</p>
                <p><strong>Nicho:</strong> {selectedLead.nicho || '—'}</p>
                <p><strong>Cidade:</strong> {getCidadeFromLead(selectedLead)}</p>
              </div>
            )}

            <div>
              <Label htmlFor="rapid-nome">Nome da Lista *</Label>
              <Input
                id="rapid-nome"
                value={createForm.nome}
                onChange={e => setCreateForm({ ...createForm, nome: e.target.value })}
                placeholder="ex: Clínicas SP"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="rapid-cidade">Cidade *</Label>
                <Input
                  id="rapid-cidade"
                  value={createForm.cidade}
                  onChange={e => setCreateForm({ ...createForm, cidade: e.target.value })}
                  placeholder={selectedLead ? getCidadeFromLead(selectedLead) : 'ex: São Paulo'}
                  defaultValue={selectedLead ? getCidadeFromLead(selectedLead) : ''}
                />
              </div>
              <div>
                <Label htmlFor="rapid-estado">Estado *</Label>
                <Select value={createForm.estado} onValueChange={estado => setCreateForm({ ...createForm, estado })}>
                  <SelectTrigger id="rapid-estado">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SP">SP</SelectItem>
                    <SelectItem value="RJ">RJ</SelectItem>
                    <SelectItem value="MG">MG</SelectItem>
                    <SelectItem value="BA">BA</SelectItem>
                    <SelectItem value="SC">SC</SelectItem>
                    <SelectItem value="RS">RS</SelectItem>
                    <SelectItem value="PR">PR</SelectItem>
                    <SelectItem value="DF">DF</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="rapid-nicho">Nicho *</Label>
              <Input
                id="rapid-nicho"
                value={createForm.nicho}
                onChange={e => setCreateForm({ ...createForm, nicho: e.target.value })}
                placeholder={selectedLead?.nicho || 'ex: Saúde'}
                defaultValue={selectedLead?.nicho || ''}
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setCreateListaOpen(false);
                  setCreateForm({
                    nome: '',
                    cidade: '',
                    estado: '',
                    nicho: '',
                  });
                }}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1"
                onClick={handleCreateListaRapida}
                disabled={creatingLista}
              >
                {creatingLista && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Criar e Vincular
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
