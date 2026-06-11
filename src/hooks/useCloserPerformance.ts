import { useCallback, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import type { Lead } from '@/types/database';

export interface CloserMetrics {
  closer_id: string | null;
  closer_name: string;
  leads_recebidos: number;
  contatos_efetivos: number;
  leads_qualificados: number;
  reunioes_agendadas: number;
  reunioes_realizadas: number;
  propostas_enviadas: number;
  clientes_fechados: number;
  receita_gerada: number;
  taxa_contato: number; // contatos / leads * 100
  taxa_reuniao: number; // reunioes / leads * 100
  taxa_cliente: number; // clientes / leads * 100
  taxa_pos_reuniao: number; // clientes / reunioes * 100
}

export function useCloserPerformance(
  organizationId: string | undefined,
  closerId?: string | null,
  dateRange?: { from: Date; to: Date }
) {
  // ==================
  // BUSCAR TODOS OS LEADS
  // ==================
  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['closer_performance', organizationId, closerId, dateRange],
    queryFn: async () => {
      if (!organizationId) return [];

      let query = supabase
        .from('leads')
        .select('*, profiles:assigned_to(full_name), profiles:closer_id(full_name)')
        .eq('organization_id', organizationId);

      // Filtrar por closer específico se fornecido
      if (closerId) {
        query = query.eq('closer_id', closerId);
      }

      // Filtrar por data se fornecido
      if (dateRange) {
        query = query
          .gte('created_at', dateRange.from.toISOString())
          .lte('created_at', dateRange.to.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data as unknown as Lead[]) ?? [];
    },
  });

  // ==================
  // CALCULAR MÉTRICAS
  // ==================
  const metricsMap = useMemo(() => {
    const map = new Map<string | null, CloserMetrics>();

    for (const lead of leads) {
      const cid = lead.closer_id;
      const closerName = (lead as any)?.profiles?.full_name || lead.closer_id || 'Sem responsável';

      if (!map.has(cid)) {
        map.set(cid, {
          closer_id: cid,
          closer_name: closerName,
          leads_recebidos: 0,
          contatos_efetivos: 0,
          leads_qualificados: 0,
          reunioes_agendadas: 0,
          reunioes_realizadas: 0,
          propostas_enviadas: 0,
          clientes_fechados: 0,
          receita_gerada: 0,
          taxa_contato: 0,
          taxa_reuniao: 0,
          taxa_cliente: 0,
          taxa_pos_reuniao: 0,
        });
      }

      const metrics = map.get(cid)!;

      // Contar lead recebido
      metrics.leads_recebidos += 1;

      // Contar conato efetivo (moveu da primeira etapa)
      if (lead.etapa_kanban !== 'leads_recebidos') {
        metrics.contatos_efetivos += 1;
      }

      // Contar qualificado (etapa qualificados ou além)
      if (['qualificados', 'reuniao_agendada', 'emissao_contrato', 'efetivados'].includes(lead.etapa_kanban)) {
        metrics.leads_qualificados += 1;
      }

      // Contar reunião agendada
      if (lead.etapa_kanban === 'reuniao_agendada') {
        metrics.reunioes_agendadas += 1;
      }

      // Contar reunião realizada (aqui consideramos efetivado ou emissao como realizado)
      if (['emissao_contrato', 'efetivados'].includes(lead.etapa_kanban)) {
        metrics.reunioes_realizadas += 1;
      }

      // Contar proposta enviada (emissao_contrato)
      if (lead.etapa_kanban === 'emissao_contrato') {
        metrics.propostas_enviadas += 1;
      }

      // Contar cliente fechado (efetivados)
      if (lead.etapa_kanban === 'efetivados') {
        metrics.clientes_fechados += 1;
      }

      // Somar receita
      if (lead.value) {
        metrics.receita_gerada += lead.value;
      }
    }

    // Calcular taxas
    for (const metrics of map.values()) {
      if (metrics.leads_recebidos > 0) {
        metrics.taxa_contato = (metrics.contatos_efetivos / metrics.leads_recebidos) * 100;
        metrics.taxa_reuniao = (metrics.reunioes_agendadas / metrics.leads_recebidos) * 100;
        metrics.taxa_cliente = (metrics.clientes_fechados / metrics.leads_recebidos) * 100;
      }

      if (metrics.reunioes_agendadas > 0) {
        metrics.taxa_pos_reuniao = (metrics.clientes_fechados / metrics.reunioes_agendadas) * 100;
      }
    }

    return map;
  }, [leads]);

  // ==================
  // EXPORTAR DADOS
  // ==================
  const allMetrics = Array.from(metricsMap.values()).sort(
    (a, b) => b.clientes_fechados - a.clientes_fechados
  );

  const closerMetrics = closerId ? metricsMap.get(closerId) : undefined;
  const totalMetrics = useMemo(() => {
    const total: CloserMetrics = {
      closer_id: null,
      closer_name: 'TOTAL',
      leads_recebidos: 0,
      contatos_efetivos: 0,
      leads_qualificados: 0,
      reunioes_agendadas: 0,
      reunioes_realizadas: 0,
      propostas_enviadas: 0,
      clientes_fechados: 0,
      receita_gerada: 0,
      taxa_contato: 0,
      taxa_reuniao: 0,
      taxa_cliente: 0,
      taxa_pos_reuniao: 0,
    };

    for (const metrics of allMetrics) {
      total.leads_recebidos += metrics.leads_recebidos;
      total.contatos_efetivos += metrics.contatos_efetivos;
      total.leads_qualificados += metrics.leads_qualificados;
      total.reunioes_agendadas += metrics.reunioes_agendadas;
      total.reunioes_realizadas += metrics.reunioes_realizadas;
      total.propostas_enviadas += metrics.propostas_enviadas;
      total.clientes_fechados += metrics.clientes_fechados;
      total.receita_gerada += metrics.receita_gerada;
    }

    if (total.leads_recebidos > 0) {
      total.taxa_contato = (total.contatos_efetivos / total.leads_recebidos) * 100;
      total.taxa_reuniao = (total.reunioes_agendadas / total.leads_recebidos) * 100;
      total.taxa_cliente = (total.clientes_fechados / total.leads_recebidos) * 100;
    }

    if (total.reunioes_agendadas > 0) {
      total.taxa_pos_reuniao = (total.clientes_fechados / total.reunioes_agendadas) * 100;
    }

    return total;
  }, [allMetrics]);

  return {
    leads,
    isLoading,
    allMetrics,
    closerMetrics,
    totalMetrics,
  };
}
