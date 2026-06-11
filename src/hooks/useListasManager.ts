import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Lista, ListaWithResponsavel, LeadListaHistory } from '@/types/database';
import type { TablesInsert, TablesUpdate } from '@/types/supabase';

export interface CreateListaInput {
  nome: string;
  cidade: string;
  estado: string;
  nicho: string;
  responsavel_id?: string | null;
  origem_principal?: string | null;
  observacoes?: string | null;
}

export interface UpdateListaInput {
  nome?: string;
  responsavel_id?: string | null;
  status?: 'ativa' | 'pausada' | 'encerrada';
  observacoes?: string | null;
}

export function useListasManager(organizationId: string | undefined) {
  const [listas, setListas] = useState<ListaWithResponsavel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // ==================
  // BUSCAR LISTAS
  // ==================
  const fetchListas = useCallback(async (filters?: {
    status?: string;
    cidade?: string;
    nicho?: string;
  }) => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('listas')
        .select('*, profiles:responsavel_id(full_name)')
        .eq('organization_id', organizationId);

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.cidade) {
        query = query.eq('cidade', filters.cidade);
      }
      if (filters?.nicho) {
        query = query.eq('nicho', filters.nicho);
      }

      const { data, error: fetchError } = await query.order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      // Cast para incluir o profile information
      const typed = (data as unknown as (Lista & { profiles: { full_name: string } | null })[]) ?? [];
      setListas(typed as ListaWithResponsavel[]);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      setListas([]);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  // ==================
  // BUSCAR LISTAS PARA AUTO-LINK
  // ==================
  const getLista = useCallback(async (
    cidade: string,
    nicho: string
  ): Promise<Lista | null> => {
    if (!organizationId) return null;

    const { data, error } = await supabase
      .from('listas')
      .select()
      .eq('organization_id', organizationId)
      .eq('cidade', cidade)
      .eq('nicho', nicho)
      .eq('status', 'ativa')
      .order('versao', { ascending: false })
      .limit(1)
      .single();

    if (error?.code === 'PGRST116') {
      // Não encontrou
      return null;
    }
    if (error) throw error;

    return data as Lista;
  }, [organizationId]);

  // ==================
  // CRIAR LISTA
  // ==================
  const createLista = useCallback(async (input: CreateListaInput): Promise<Lista> => {
    if (!organizationId) throw new Error('Sem organização');

    // Verificar se já existe (cidade + nicho + versão 1)
    const existing = await getLista(input.cidade, input.nicho);
    if (existing) {
      throw new Error(
        `Lista "${existing.nome}" já existe para ${input.cidade}, ${input.nicho}. ` +
        `Deseja criar uma nova versão?`
      );
    }

    const { data, error } = await supabase
      .from('listas')
      .insert([
        {
          organization_id: organizationId,
          nome: input.nome,
          cidade: input.cidade,
          estado: input.estado,
          nicho: input.nicho,
          versao: 1,
          responsavel_id: input.responsavel_id || null,
          origem_principal: input.origem_principal || null,
          observacoes: input.observacoes || null,
          status: 'ativa',
        } as TablesInsert<'listas'>,
      ])
      .select()
      .single();

    if (error) throw error;

    // Refetch
    await fetchListas();

    return data as Lista;
  }, [organizationId, fetchListas, getLista]);

  // ==================
  // CRIAR NOVA VERSÃO
  // ==================
  const createListaVersion = useCallback(async (
    cidade: string,
    nicho: string,
    input: CreateListaInput
  ): Promise<Lista> => {
    if (!organizationId) throw new Error('Sem organização');

    // Buscar última versão
    const { data: lastVersion, error: versionError } = await supabase
      .from('listas')
      .select('versao')
      .eq('organization_id', organizationId)
      .eq('cidade', cidade)
      .eq('nicho', nicho)
      .order('versao', { ascending: false })
      .limit(1)
      .single();

    if (versionError?.code !== 'PGRST116' && versionError) {
      throw versionError;
    }

    const newVersion = (lastVersion?.versao ?? 0) + 1;

    const { data, error } = await supabase
      .from('listas')
      .insert([
        {
          organization_id: organizationId,
          nome: input.nome,
          cidade: cidade,
          estado: input.estado,
          nicho: nicho,
          versao: newVersion,
          responsavel_id: input.responsavel_id || null,
          origem_principal: input.origem_principal || null,
          observacoes: input.observacoes || null,
          status: 'ativa',
        } as TablesInsert<'listas'>,
      ])
      .select()
      .single();

    if (error) throw error;

    // Refetch
    await fetchListas();

    return data as Lista;
  }, [organizationId, fetchListas]);

  // ==================
  // ATUALIZAR LISTA
  // ==================
  const updateLista = useCallback(async (
    listaId: string,
    input: UpdateListaInput
  ): Promise<Lista> => {
    if (!organizationId) throw new Error('Sem organização');

    const { data, error } = await supabase
      .from('listas')
      .update(input as TablesUpdate<'listas'>)
      .eq('id', listaId)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error) throw error;

    // Refetch
    await fetchListas();

    return data as Lista;
  }, [organizationId, fetchListas]);

  // ==================
  // DELETAR LISTA
  // ==================
  const deleteLista = useCallback(async (listaId: string): Promise<void> => {
    if (!organizationId) throw new Error('Sem organização');

    const { error } = await supabase
      .from('listas')
      .delete()
      .eq('id', listaId)
      .eq('organization_id', organizationId);

    if (error) throw error;

    // Refetch
    await fetchListas();
  }, [organizationId, fetchListas]);

  // ==================
  // VINCULAR LEAD A LISTA
  // ==================
  const linkLeadToLista = useCallback(async (
    leadId: string,
    listaId: string
  ): Promise<void> => {
    if (!organizationId) throw new Error('Sem organização');

    const { error } = await supabase
      .from('leads')
      .update({ lista_id: listaId })
      .eq('id', leadId)
      .eq('organization_id', organizationId);

    if (error) throw error;
  }, [organizationId]);

  // ==================
  // DESVINCULAR LEAD DE LISTA
  // ==================
  const unlinkLeadFromLista = useCallback(async (
    leadId: string
  ): Promise<void> => {
    if (!organizationId) throw new Error('Sem organização');

    const { error } = await supabase
      .from('leads')
      .update({ lista_id: null })
      .eq('id', leadId)
      .eq('organization_id', organizationId);

    if (error) throw error;
  }, [organizationId]);

  // ==================
  // AUTO-LINK LEAD (função RPC)
  // ==================
  const autoLinkLead = useCallback(async (leadId: string): Promise<string | null> => {
    if (!organizationId) throw new Error('Sem organização');

    try {
      const { data, error } = await supabase.rpc('link_lead_to_lista', {
        p_lead_id: leadId,
        p_organization_id: organizationId,
      });

      if (error) throw error;
      return data as string | null;
    } catch (err) {
      console.error('Erro ao auto-vincular lead:', err);
      return null;
    }
  }, [organizationId]);

  // ==================
  // AUTO-LINK LOTE (função RPC)
  // ==================
  const autoLinkPendingLeads = useCallback(async (): Promise<{ linked_count: number; error_msg: string | null }> => {
    if (!organizationId) throw new Error('Sem organização');

    try {
      const { data, error } = await supabase.rpc('auto_link_pending_leads', {
        p_organization_id: organizationId,
      });

      if (error) throw error;
      return data as { linked_count: number; error_msg: string | null };
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err));
    }
  }, [organizationId]);

  // ==================
  // OBTER HISTÓRICO DE VINCULAÇÃO
  // ==================
  const getListaHistory = useCallback(async (leadId: string): Promise<LeadListaHistory[]> => {
    if (!organizationId) return [];

    const { data, error } = await supabase
      .from('lead_lista_history')
      .select()
      .eq('organization_id', organizationId)
      .eq('lead_id', leadId)
      .order('changed_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar histórico:', error);
      return [];
    }

    return (data ?? []) as LeadListaHistory[];
  }, [organizationId]);

  return {
    listas,
    loading,
    error,
    fetchListas,
    getLista,
    createLista,
    createListaVersion,
    updateLista,
    deleteLista,
    linkLeadToLista,
    unlinkLeadFromLista,
    autoLinkLead,
    autoLinkPendingLeads,
    getListaHistory,
  };
}
