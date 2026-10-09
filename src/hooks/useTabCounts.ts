/**
 * useTabCounts
 *
 * Retorna contagens para os badges das abas do CRM:
 *   leads       — total de leads no CRM (excluindo os da antecâmara do formulário)
 *   preQual     — leads em leads_recebidos sem pré-qualificação concluída
 *   formulario  — leads aguardando triagem (stage_id = 'formulario')
 *   listas      — total de listas ativas
 *   pendentes   — leads sem lista vinculada
 *
 * Os dados de leads/listas são recebidos como parâmetros para evitar queries
 * duplicadas. Apenas o count do formulário é buscado independentemente (leve:
 * usa .select('id', { count: 'exact', head: true })).
 */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Lead } from "@/types/database";

interface Lista {
  id: string;
  [key: string]: unknown;
}

interface TabCountsInput {
  organizationId: string | undefined;
  leads: Lead[];
  listas: Lista[];
}

export interface TabCounts {
  leads: number;
  preQual: number;
  formulario: number;
  listas: number;
  pendentes: number;
}

export function useTabCounts({ organizationId, leads, listas }: TabCountsInput): TabCounts {
  const [formularioCount, setFormularioCount] = useState(0);

  // Query leve: apenas HEAD count, sem trazer linhas
  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;

    (async () => {
      // Conta apenas leads ainda na antecâmara do formulário (stage_id = 'formulario')
      const { count } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("stage_id", "formulario");

      if (!cancelled) setFormularioCount(count ?? 0);
    })();

    return () => { cancelled = true; };
  }, [organizationId, leads]); // re-executa quando leads muda (promoção/descarte reflete rápido)

  const preQualCount = leads.filter((l) => {
    if (l.etapa_kanban !== "leads_recebidos") return false;
    const meta = (l.metadata ?? {}) as Record<string, unknown>;
    const pre = (meta.pre_qualificacao ?? null) as Record<string, unknown> | null;
    return pre?.concluida !== true;
  }).length;

  const pendentesCount = leads.filter((l) => !l.lista_id).length;

  return {
    leads: leads.length,
    preQual: preQualCount,
    formulario: formularioCount,
    listas: listas.length,
    pendentes: pendentesCount,
  };
}
