/**
 * usePartnershipImpact
 * Calcula o impacto da parceria por KPI, gerando cards para o dashboard.
 * Para KPIs de faturamento, gera 2 cards:
 *   - "ultimo_mes": valor do último mês pós-contrato vs média pré-contrato
 *   - "evolucao": média pós-contrato vs média pré-contrato
 * Para os demais KPIs, gera 1 card (comportamento atual).
 */

import { useMemo } from "react";
import { startOfMonth, parseISO, isBefore, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { fmtKpiValue } from "@/lib/formatters";

export type ImpactCardType =
  | "evolucao"      // média pós vs média pré (card padrão)
  | "ultimo_mes"    // último mês pós vs média pré
  | "kpi_regular";  // KPIs que não são faturamento

export interface ImpactCard {
  /** ID único do card — usado para seleção no Dashboard Geral */
  id: string;
  /** Nome de exibição */
  label: string;
  /** Tipo do card */
  type: ImpactCardType;
  /** Nome do KPI de origem */
  kpiName: string;
  /** Unidade (currency, percentage, number) */
  unit: string;
  /** Valor "antes" (média pré-contrato) */
  pre: number;
  /** Valor "depois" (último mês ou média pós) */
  post: number;
  /** Crescimento percentual */
  growth: number | null;
  /** Número de meses pós-contrato considerados */
  postMonths: number;
  /** Subtítulo descritivo */
  subtitle: string;
}

const isFaturamento = (name: string) =>
  /faturamento|receita|revenue/i.test(name);

export const isLowerBetterImpact = (name: string) =>
  /cac|cpa|cpl|cpc|cpm|custo|inadimpl|churn|cancelamento|devolução|reclamação|tempo.*espera|prazo.*entrega/i.test(name);

export function buildPartnershipImpact(
  kpis: any[],
  kpiHistory: any[],
  contractStartDate: Date | null
): ImpactCard[] {
  if (!contractStartDate || kpiHistory.length === 0) return [];

  const splitDate = startOfMonth(contractStartDate);
  const cards: ImpactCard[] = [];

  for (const kpi of kpis) {
    const entries = kpiHistory
      .filter((h: any) => h.kpi_id === kpi.id)
      .sort((a: any, b: any) => String(a.month_year).localeCompare(String(b.month_year)));

    if (entries.length < 2) continue;

    const pre = entries.filter((h: any) =>
      isBefore(startOfMonth(parseISO(String(h.month_year).substring(0, 10))), splitDate)
    );
    const post = entries.filter((h: any) =>
      !isBefore(startOfMonth(parseISO(String(h.month_year).substring(0, 10))), splitDate)
    );

    if (pre.length === 0 || post.length === 0) continue;

    const preLast12 = pre.slice(-12);
    const preAvg = preLast12.reduce((a: number, h: any) => a + Number(h.value), 0) / preLast12.length;
    const postAvg = post.reduce((a: number, h: any) => a + Number(h.value), 0) / post.length;
    const lastPost = post[post.length - 1]; // mês mais recente
    const lastMonthValue = Number(lastPost?.value ?? 0);
    const lastMonthLabel = lastPost
      ? format(parseISO(String(lastPost.month_year).substring(0, 10)), "MMM/yy", { locale: ptBR })
      : "—";

    if (isFaturamento(kpi.name)) {
      // Card A — Faturamento Último Mês
      cards.push({
        id: `${kpi.id}__ultimo_mes`,
        label: `${kpi.name} — ${lastMonthLabel}`,
        type: "ultimo_mes",
        kpiName: kpi.name,
        unit: kpi.unit,
        pre: preAvg,
        post: lastMonthValue,
        growth: preAvg !== 0 ? ((lastMonthValue - preAvg) / preAvg) * 100 : null,        postMonths: 1,
        subtitle: `Último mês vs média antes da parceria`,
      });
      // Card B — Evolução do Faturamento
      cards.push({
        id: `${kpi.id}__evolucao`,
        label: `${kpi.name} — Evolução`,
        type: "evolucao",
        kpiName: kpi.name,
        unit: kpi.unit,
        pre: preAvg,
        post: postAvg,
        growth: preAvg !== 0 ? ((postAvg - preAvg) / preAvg) * 100 : null,
        postMonths: post.length,
        subtitle: `Média atual (${post.length} meses) vs média antes`,
      });
    } else {
      // Card único — comportamento atual
      cards.push({
        id: `${kpi.id}__evolucao`,
        label: kpi.name,
        type: "kpi_regular",
        kpiName: kpi.name,
        unit: kpi.unit,
        pre: preAvg,
        post: postAvg,
        growth: preAvg !== 0 ? ((postAvg - preAvg) / preAvg) * 100 : null,
        postMonths: post.length,
        subtitle: `Média atual vs média antes da parceria`,
      });
    }
  }

  return cards;
}

export function usePartnershipImpact(
  kpis: any[],
  kpiHistory: any[],
  contractStartDate: Date | null
): ImpactCard[] {
  return useMemo(
    () => buildPartnershipImpact(kpis, kpiHistory, contractStartDate),
    [kpis, kpiHistory, contractStartDate]
  );
}

/** Formata o valor de um ImpactCard */
export function fmtImpact(v: number, unit: string): string {
  return fmtKpiValue(v, unit);
}
