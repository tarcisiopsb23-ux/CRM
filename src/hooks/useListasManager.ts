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
      let query = (supabase as any)
        .from('listas')
        .select('*, profiles:responsavel_id(full_name), leads(count)')
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

      // Normalise the embedded count: Supabase returns leads as [{ count: N }]
      const typed = ((data as any[]) ?? []).map((row: any) => ({
        ...row,
        leads_count: Array.isArray(row.leads) ? (row.leads[0]?.count ?? 0) : 0,
        leads: undefined, // drop the raw array from the object
      })) as ListaWithResponsavel[];
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
        } as any,
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
        } as any,
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
      .update(input as any)
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

  // ==================
  // LEADS SEM LISTA (lista_id IS NULL)
  // ==================
  const fetchLeadsSemLista = useCallback(async (): Promise<
    Array<{
      id: string;
      name: string;
      company: string | null;
      nicho: string | null;
      metadata: Record<string, unknown>;
      created_at: string;
    }>
  > => {
    if (!organizationId) return [];

    // lista_id may not be in the generated supabase.ts types yet, so we cast
    // the table reference to `any` to bypass type-checking on the filter.
    const { data, error } = await (supabase as any)
      .from('leads')
      .select('id, name, company, nicho, metadata, created_at, lista_id')
      .eq('organization_id', organizationId)
      .is('lista_id', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar leads sem lista:', error);
      return [];
    }

    return (data ?? []) as Array<{
      id: string;
      name: string;
      company: string | null;
      nicho: string | null;
      metadata: Record<string, unknown>;
      created_at: string;
    }>;
  }, [organizationId]);

  // ==================
  // VINCULAR LOTE DE LEADS A UMA LISTA
  // ==================
  const linkLeadsBatchToLista = useCallback(async (
    leadIds: string[],
    listaId: string
  ): Promise<void> => {
    if (!organizationId || leadIds.length === 0) return;

    // Fetch lista cidade/nicho once to backfill leads that have no cidade
    let listaCidade: string | null = null;
    let listaNicho: string | null = null;
    const { data: listaData } = await (supabase as any)
      .from('listas')
      .select('cidade, nicho')
      .eq('id', listaId)
      .single();
    if (listaData) {
      listaCidade = listaData.cidade ?? null;
      listaNicho  = listaData.nicho  ?? null;
    }

    // 1. Set lista_id on all leads in the batch
    const { error } = await (supabase as any)
      .from('leads')
      .update({ lista_id: listaId })
      .in('id', leadIds)
      .eq('organization_id', organizationId);

    if (error) throw error;

    // 2. Backfill metadata.cidade and nicho for leads that are missing them.
    //    We do this per-lead so we don't overwrite existing values.
    if (listaCidade) {
      // Fetch current metadata for all leads in batch
      const { data: leadsData } = await (supabase as any)
        .from('leads')
        .select('id, nicho, metadata')
        .in('id', leadIds)
        .eq('organization_id', organizationId);

      const updates: Array<Promise<void>> = (leadsData ?? [])
        .filter((l: any) => {
          const hasCidade = l.metadata?.cidade;
          const hasNicho  = l.nicho;
          return !hasCidade || !hasNicho;
        })
        .map(async (l: any) => {
          const patch: Record<string, unknown> = {};
          if (!l.metadata?.cidade) {
            patch.metadata = { ...(l.metadata ?? {}), cidade: listaCidade };
          }
          if (!l.nicho && listaNicho) {
            patch.nicho = listaNicho;
          }
          if (Object.keys(patch).length === 0) return;
          await (supabase as any)
            .from('leads')
            .update(patch)
            .eq('id', l.id)
            .eq('organization_id', organizationId);
        });

      await Promise.all(updates);
    }
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
    fetchLeadsSemLista,
    linkLeadsBatchToLista,
  };
}
