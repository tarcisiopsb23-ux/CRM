import { useState, useEffect } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { useListasManager, type CreateListaInput, type UpdateListaInput } from '@/hooks/useListasManager';
import { useProfiles } from '@/hooks/useProfiles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Plus, Edit2, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import type { Lista } from '@/types/database';

export function ListasPage() {
  const organizationId = useOrganization();
  const { data: profiles = [] } = useProfiles(organizationId);
  const {
    listas,
    loading,
    fetchListas,
    createLista,
    createListaVersion,
    updateLista,
    deleteLista,
  } = useListasManager(organizationId);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingLista, setEditingLista] = useState<Lista | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<{ lista: Lista; action: 'use' | 'version' } | null>(null);
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('ativa');
  const [filterCidade, setFilterCidade] = useState('');
  const [filterNicho, setFilterNicho] = useState('');

  const [createForm, setCreateForm] = useState<CreateListaInput>({
    nome: '',
    cidade: '',
    estado: '',
    nicho: '',
    responsavel_id: undefined,
    origem_principal: undefined,
    observacoes: undefined,
  });

  const [editForm, setEditForm] = useState<UpdateListaInput>({
    nome: '',
    status: 'ativa',
    responsavel_id: undefined,
    observacoes: undefined,
  });

  useEffect(() => {
    if (organizationId) {
      fetchListas({
        status: filterStatus || undefined,
        cidade: filterCidade || undefined,
        nicho: filterNicho || undefined,
      });
    }
  }, [organizationId, filterStatus, filterCidade, filterNicho, fetchListas]);

  // ==================
  // CRIAR LISTA
  // ==================
  const handleCreateLista = async () => {
    try {
      if (!createForm.nome.trim() || !createForm.cidade.trim() || !createForm.nicho.trim()) {
        toast.error('Nome, Cidade e Nicho são obrigatórios');
        return;
      }

      await createLista(createForm);
      toast.success('Lista criada com sucesso');
      setCreateOpen(false);
      setCreateForm({
        nome: '',
        cidade: '',
        estado: '',
        nicho: '',
        responsavel_id: undefined,
        origem_principal: undefined,
        observacoes: undefined,
      });
      setDuplicateWarning(null);
    } catch (err) {
      // Se erro de duplicata, mostrar opção de criar versão
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('já existe')) {
        const existingLista = listas.find(
          l => l.cidade === createForm.cidade && l.nicho === createForm.nicho && l.status === 'ativa'
        );
        if (existingLista) {
          setDuplicateWarning({ lista: existingLista, action: 'use' });
          return;
        }
      }
      toast.error(msg);
    }
  };

  const handleCreateVersion = async () => {
    if (!duplicateWarning) return;
    try {
      setCreatingVersion(true);
      await createListaVersion(createForm.cidade, createForm.estado, createForm);
      toast.success('Nova versão criada com sucesso');
      setCreateOpen(false);
      setCreateForm({
        nome: '',
        cidade: '',
        estado: '',
        nicho: '',
        responsavel_id: undefined,
        origem_principal: undefined,
        observacoes: undefined,
      });
      setDuplicateWarning(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setCreatingVersion(false);
    }
  };

  // ==================
  // EDITAR LISTA
  // ==================
  const handleEditLista = (lista: Lista) => {
    setEditingLista(lista);
    setEditForm({
      nome: lista.nome,
      status: lista.status,
      responsavel_id: lista.responsavel_id,
      observacoes: lista.observacoes,
    });
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingLista) return;
    try {
      if (!editForm.nome?.trim()) {
        toast.error('Nome é obrigatório');
        return;
      }
      await updateLista(editingLista.id, editForm);
      toast.success('Lista atualizada com sucesso');
      setEditOpen(false);
      setEditingLista(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    }
  };

  // ==================
  // DELETAR LISTA
  // ==================
  const handleDeleteLista = async (listaId: string) => {
    if (!confirm('Tem certeza? Os leads vinculados não serão deletados, apenas desvinculados.')) {
      return;
    }
    try {
      await deleteLista(listaId);
      toast.success('Lista deletada com sucesso');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    }
  };

  // ==================
  // OBTER NOME DO RESPONSÁVEL
  // ==================
  const getResponsavelName = (profileId: string | null | undefined) => {
    if (!profileId) return '—';
    const profile = profiles.find(p => p.id === profileId);
    return profile?.full_name || '—';
  };

  // ==================
  // OBTER CIDADES E NICHOS ÚNICOS PARA FILTROS
  // ==================
  const uniqueCidades = Array.from(new Set(listas.map(l => l.cidade))).sort();
  const uniqueNichos = Array.from(new Set(listas.map(l => l.nicho))).sort();

  if (loading) {
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
          <h1 className="text-3xl font-bold tracking-tight">Listas de Prospecção</h1>
          <p className="text-muted-foreground mt-2">
            Gerencie campanhas de prospecção por cidade e nicho com deduplicação automática
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Lista
        </Button>
      </div>

      {/* FILTROS */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-sm font-medium">Status</Label>
              <Select value={filterStatus || '__all__'} onValueChange={v => setFilterStatus(v === '__all__' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativa">Ativa</SelectItem>
                  <SelectItem value="pausada">Pausada</SelectItem>
                  <SelectItem value="encerrada">Encerrada</SelectItem>
                  <SelectItem value="__all__">Todas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-medium">Cidade</Label>
              <Select value={filterCidade || '__all__'} onValueChange={v => setFilterCidade(v === '__all__' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas as cidades" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {uniqueCidades.map(cidade => (
                    <SelectItem key={cidade} value={cidade}>
                      {cidade}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-medium">Nicho</Label>
              <Select value={filterNicho || '__all__'} onValueChange={v => setFilterNicho(v === '__all__' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os nichos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  {uniqueNichos.map(nicho => (
                    <SelectItem key={nicho} value={nicho}>
                      {nicho}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* TABELA DE LISTAS */}
      <Card>
        <CardHeader>
          <CardTitle>Listas ({listas.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {listas.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">Nenhuma lista encontrada</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Cidade</TableHead>
                    <TableHead>Nicho</TableHead>
                    <TableHead>Versão</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Criada em</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listas.map(lista => (
                    <TableRow key={lista.id}>
                      <TableCell className="font-medium">{lista.nome}</TableCell>
                      <TableCell>{lista.cidade}</TableCell>
                      <TableCell>{lista.nicho}</TableCell>
                      <TableCell className="text-center">v{lista.versao}</TableCell>
                      <TableCell>
                        <Badge
                          variant={lista.status === 'ativa' ? 'default' : 'secondary'}
                          className="capitalize"
                        >
                          {lista.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{getResponsavelName(lista.responsavel_id)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(lista.created_at).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditLista(lista)}
                            className="h-8 w-8 p-0"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteLista(lista.id)}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* DIALOG: CRIAR LISTA */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Lista de Prospecção</DialogTitle>
            <DialogDescription>
              Crie uma lista para gerenciar prospecções por cidade e nicho
            </DialogDescription>
          </DialogHeader>

          {duplicateWarning ? (
            <div className="space-y-4">
              <Alert className="border-yellow-200 bg-yellow-50">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-yellow-800 ml-2">
                  Já existe uma lista para <strong>{duplicateWarning.lista.cidade}, {duplicateWarning.lista.nicho}</strong>
                </AlertDescription>
              </Alert>

              <p className="text-sm text-muted-foreground">
                Deseja usar a lista existente "<strong>{duplicateWarning.lista.nome}</strong>" ou criar uma nova versão?
              </p>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setCreateOpen(false);
                    setDuplicateWarning(null);
                    setCreateForm({
                      nome: '',
                      cidade: '',
                      estado: '',
                      nicho: '',
                      responsavel_id: undefined,
                      origem_principal: undefined,
                      observacoes: undefined,
                    });
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setDuplicateWarning(null)}
                >
                  Usar Existente
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleCreateVersion}
                  disabled={creatingVersion}
                >
                  {creatingVersion && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Criar Versão
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="create-nome">Nome *</Label>
                  <Input
                    id="create-nome"
                    value={createForm.nome}
                    onChange={e => setCreateForm({ ...createForm, nome: e.target.value })}
                    placeholder="ex: Clínicas SP"
                  />
                </div>
                <div>
                  <Label htmlFor="create-cidade">Cidade *</Label>
                  <Input
                    id="create-cidade"
                    value={createForm.cidade}
                    onChange={e => setCreateForm({ ...createForm, cidade: e.target.value })}
                    placeholder="ex: São Paulo"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="create-estado">Estado *</Label>
                  <Select value={createForm.estado} onValueChange={estado => setCreateForm({ ...createForm, estado })}>
                    <SelectTrigger id="create-estado">
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
                <div>
                  <Label htmlFor="create-nicho">Nicho *</Label>
                  <Input
                    id="create-nicho"
                    value={createForm.nicho}
                    onChange={e => setCreateForm({ ...createForm, nicho: e.target.value })}
                    placeholder="ex: Saúde"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="create-responsavel">Responsável</Label>
                <Select value={createForm.responsavel_id || '__none__'} onValueChange={id => setCreateForm({ ...createForm, responsavel_id: id === '__none__' ? null : id })}>
                  <SelectTrigger id="create-responsavel">
                    <SelectValue placeholder="Selecione um responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem responsável</SelectItem>
                    {profiles.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="create-origem">Origem Principal</Label>
                <Input
                  id="create-origem"
                  value={createForm.origem_principal || ''}
                  onChange={e => setCreateForm({ ...createForm, origem_principal: e.target.value })}
                  placeholder="ex: Indicação, Google"
                />
              </div>

              <div>
                <Label htmlFor="create-obs">Observações</Label>
                <Textarea
                  id="create-obs"
                  value={createForm.observacoes || ''}
                  onChange={e => setCreateForm({ ...createForm, observacoes: e.target.value })}
                  placeholder="Notas adicionais"
                  rows={2}
                />
              </div>

              <div className="flex gap-2 pt-4">
                <Button variant="outline" className="flex-1" onClick={() => setCreateOpen(false)}>
                  Cancelar
                </Button>
                <Button className="flex-1" onClick={handleCreateLista}>
                  Criar Lista
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* DIALOG: EDITAR LISTA */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Lista</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-nome">Nome</Label>
              <Input
                id="edit-nome"
                value={editForm.nome || ''}
                onChange={e => setEditForm({ ...editForm, nome: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="edit-status">Status</Label>
              <Select value={editForm.status} onValueChange={status => setEditForm({ ...editForm, status: status as any })}>
                <SelectTrigger id="edit-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativa">Ativa</SelectItem>
                  <SelectItem value="pausada">Pausada</SelectItem>
                  <SelectItem value="encerrada">Encerrada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="edit-responsavel">Responsável</Label>
              <Select value={editForm.responsavel_id || '__none__'} onValueChange={id => setEditForm({ ...editForm, responsavel_id: id === '__none__' ? null : id })}>
                <SelectTrigger id="edit-responsavel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem responsável</SelectItem>
                  {profiles.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="edit-obs">Observações</Label>
              <Textarea
                id="edit-obs"
                value={editForm.observacoes || ''}
                onChange={e => setEditForm({ ...editForm, observacoes: e.target.value })}
                rows={2}
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button variant="outline" className="flex-1" onClick={() => setEditOpen(false)}>
                Cancelar
              </Button>
              <Button className="flex-1" onClick={handleSaveEdit}>
                Salvar Alterações
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
