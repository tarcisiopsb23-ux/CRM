/**
 * useLeadIntelligence
 *
 * Calcula o Lead Score com o modelo BANT + comportamento + decaimento temporal.
 *
 * Dimensões:
 *   Perfil (30 pts)      — quem é o lead (empresa, decision maker, porte, nicho)
 *   Engajamento (40 pts) — o que fez (respondeu, visualizou proposta, sessão longa)
 *   Estágio (30 pts)     — onde está no funil (proposta, contrato, assinado)
 *
 * Decaimento temporal:
 *   Sem atividade >30d → ×0.8
 *   Sem atividade >90d → ×0.5
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useOrganization } from "@/hooks/useOrganization";
import type { Client } from "@/types/crm";
import type { Proposal } from "@/types/proposals";
import type { TimelineItem, ChatMessage } from "@/hooks/useOmnichannelChat";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface ScoreDimension {
  score:   number;  // pontuação obtida
  max:     number;  // máximo possível
  reasons: string[]; // motivos que contribuíram
}

export interface LeadScoreBreakdown {
  total:       number;
  perfil:      ScoreDimension;
  engajamento: ScoreDimension;
  estagio:     ScoreDimension;
  decayFactor: number;  // 1.0 = sem decaimento, 0.5 = decaimento máximo
  decayLabel:  string | null;
}

export interface ActiveContract {
  id:            string;
  status:        string;
  total_monthly: number | null;
  total_setup:   number | null;
  start_date:    string | null;
  service_slugs: string[];
}

export interface LeadIntelligenceData {
  client:              Client | null;
  proposals:           Proposal[];
  activeContract:      ActiveContract | null;

  // Score completo
  scoreBreakdown:      LeadScoreBreakdown;
  leadScore:           number;   // 0-100 (já com decaimento)

  // Outros indicadores
  closeProbability:    number;   // 0-100 (%)
  estimatedLtv:        number;   // R$
  origin:              string;
  pipelineStage:       string;
  pipelineLabel:       string;

  // Flags rápidas
  hasProposal:         boolean;
  hasApprovedProposal: boolean;
  hasContract:         boolean;
  isLoading:           boolean;
}

// ── Mapeamento estágio → probabilidade ───────────────────────────────────────

const STAGE_PROBABILITY: Record<string, number> = {
  "Novo":             10,
  "Qualificado":      20,
  "Reunião Agendada": 35,
  "Proposta":         50,
  "Negociação":       75,
  "Contrato Emitido": 90,
  "Ganho":           100,
  "Perdido":           0,
};

const STAGE_LABELS: Record<string, string> = {
  "Novo":             "Novo Lead",
  "Qualificado":      "Qualificado",
  "Reunião Agendada": "Reunião Agendada",
  "Proposta":         "Proposta Enviada",
  "Negociação":       "Em Negociação",
  "Contrato Emitido": "Contrato Emitido",
  "Ganho":            "Cliente Ativo",
  "Perdido":          "Perdido",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").slice(-11);
}

function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const ms = Date.now() - new Date(dateStr).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

// ── Dimensão 1: Perfil ────────────────────────────────────────────────────────
// Quem é o lead — dados cadastrais

function calcPerfil(client: Client): ScoreDimension {
  let score = 0;
  const reasons: string[] = [];

  if (client.company) {
    score += 10;
    reasons.push("Empresa identificada (+10)");
  }
  if (client.decision_maker_name || client.decision_maker_phone) {
    score += 10;
    reasons.push("Decision maker identificado (+10)");
  }
  if (client.revenue && client.revenue > 0) {
    score += 5;
    reasons.push("Porte/faturamento informado (+5)");
  }
  if (client.niche) {
    score += 5;
    reasons.push("Nicho identificado (+5)");
  }

  return { score: Math.min(score, 30), max: 30, reasons };
}

// ── Dimensão 2: Engajamento ───────────────────────────────────────────────────
// O que o lead fez — comportamento ativo

function calcEngajamento(
  proposals:      Proposal[],
  timeline:       TimelineItem[],
): ScoreDimension {
  let score = 0;
  const reasons: string[] = [];

  // Respondeu na conversa atual (mensagens inbound)
  const inboundMessages = timeline.filter(
    item => item.type === "message" && (item as ChatMessage).direction === "inbound"
  );
  if (inboundMessages.length >= 1) {
    score += 15;
    reasons.push(`Respondeu na conversa (${inboundMessages.length} msg${inboundMessages.length > 1 ? "s" : ""}) (+15)`);
  }

  // Proposta visualizada ao menos uma vez
  const viewedProposal = proposals.find(p => p.total_views > 0);
  if (viewedProposal) {
    score += 10;
    reasons.push(`Proposta visualizada (${viewedProposal.total_views}x) (+10)`);
  }

  // Alta intenção: visualizou 3+ vezes
  const highIntentProposal = proposals.find(p => p.total_views >= 3);
  if (highIntentProposal) {
    score += 10;
    reasons.push(`Alta intenção: ${highIntentProposal.total_views} visualizações (+10)`);
  }

  // Sessão longa na proposta (>60s = leu com atenção)
  const longSession = proposals.find(p => p.avg_session_secs >= 60);
  if (longSession) {
    score += 5;
    const mins = Math.round(longSession.avg_session_secs / 60);
    reasons.push(`Sessão longa na proposta (~${mins}min) (+5)`);
  }

  return { score: Math.min(score, 40), max: 40, reasons };
}

// ── Dimensão 3: Estágio comercial ─────────────────────────────────────────────
// Onde o lead está no funil

function calcEstagio(
  proposals:      Proposal[],
  activeContract: ActiveContract | null,
): ScoreDimension {
  let score = 0;
  const reasons: string[] = [];

  if (activeContract?.status === "assinado") {
    score = 30;
    reasons.push("Contrato assinado (+30)");
  } else if (activeContract) {
    score = 15;
    reasons.push("Contrato emitido (+15)");
  } else if (proposals.some(p => p.status === "aprovada")) {
    score = 10;
    reasons.push("Proposta aprovada (+10)");
  } else if (proposals.some(p => p.status === "visualizada")) {
    score = 7;
    reasons.push("Proposta visualizada pelo lead (+7)");
  } else if (proposals.some(p => p.status === "enviada")) {
    score = 5;
    reasons.push("Proposta enviada (+5)");
  } else if (proposals.length > 0) {
    score = 2;
    reasons.push("Proposta criada (rascunho) (+2)");
  }

  return { score: Math.min(score, 30), max: 30, reasons };
}

// ── Decaimento temporal ───────────────────────────────────────────────────────
// Baseado na última atividade conhecida do lead

function calcDecay(
  proposals:      Proposal[],
  activeContract: ActiveContract | null,
  timeline:       TimelineItem[],
): { factor: number; label: string | null } {
  // Última atividade: última mensagem inbound, último acesso à proposta, ou criação do contrato
  const dates: number[] = [];

  // Última mensagem inbound na conversa atual
  const lastInbound = timeline
    .filter(item => item.type === "message" && (item as ChatMessage).direction === "inbound")
    .map(item => new Date(item.created_at).getTime())
    .sort((a, b) => b - a)[0];
  if (lastInbound) dates.push(lastInbound);

  // Último acesso a qualquer proposta
  proposals.forEach(p => {
    if (p.last_accessed_at) dates.push(new Date(p.last_accessed_at).getTime());
    if (p.created_at)       dates.push(new Date(p.created_at).getTime());
  });

  // Data do contrato
  if (activeContract?.start_date) {
    dates.push(new Date(activeContract.start_date).getTime());
  }

  if (dates.length === 0) return { factor: 1.0, label: null };

  const lastActivityMs = Math.max(...dates);
  const daysSinceLast  = Math.floor((Date.now() - lastActivityMs) / (1000 * 60 * 60 * 24));

  if (daysSinceLast > 90) {
    return { factor: 0.5, label: `Sem atividade há ${daysSinceLast} dias (score ×0.5)` };
  }
  if (daysSinceLast > 30) {
    return { factor: 0.8, label: `Sem atividade há ${daysSinceLast} dias (score ×0.8)` };
  }

  return { factor: 1.0, label: null };
}

// ── Score final ───────────────────────────────────────────────────────────────

function buildScoreBreakdown(
  client:         Client,
  proposals:      Proposal[],
  activeContract: ActiveContract | null,
  timeline:       TimelineItem[],
): LeadScoreBreakdown {
  const perfil      = calcPerfil(client);
  const engajamento = calcEngajamento(proposals, timeline);
  const estagio     = calcEstagio(proposals, activeContract);
  const decay       = calcDecay(proposals, activeContract, timeline);

  const rawTotal = perfil.score + engajamento.score + estagio.score;
  const total    = Math.min(Math.round(rawTotal * decay.factor), 100);

  return {
    total,
    perfil,
    engajamento,
    estagio,
    decayFactor: decay.factor,
    decayLabel:  decay.label,
  };
}

// ── Estágio derivado dos dados ────────────────────────────────────────────────

function deriveStage(proposals: Proposal[], activeContract: ActiveContract | null): string {
  if (activeContract?.status === "assinado")  return "Ganho";
  if (activeContract?.status === "encerrado") return "Perdido";
  if (activeContract)                          return "Contrato Emitido";
  if (proposals.some(p => p.status === "aprovada"))                          return "Negociação";
  if (proposals.some(p => p.status === "enviada" || p.status === "visualizada")) return "Proposta";
  if (proposals.some(p => p.status === "recusada" || p.status === "expirada"))   return "Perdido";
  if (proposals.length > 0)                    return "Qualificado";
  return "Novo";
}

// ── LTV estimado ──────────────────────────────────────────────────────────────

function calcLtv(proposals: Proposal[], activeContract: ActiveContract | null): number {
  if (activeContract?.total_monthly) {
    return activeContract.total_monthly * 12 + (activeContract.total_setup ?? 0);
  }
  const approved = proposals.find(p => p.status === "aprovada");
  if (approved) return approved.plan_value;
  const latest = proposals
    .filter(p => p.plan_value > 0)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  return latest?.plan_value ?? 0;
}

// ── Hook principal ────────────────────────────────────────────────────────────

export function useLeadIntelligence(
  phone:    string | null | undefined,
  timeline: TimelineItem[] = [],
): LeadIntelligenceData {
  const organizationId = useOrganization();

  const EMPTY_BREAKDOWN: LeadScoreBreakdown = {
    total: 0,
    perfil:      { score: 0, max: 30, reasons: [] },
    engajamento: { score: 0, max: 40, reasons: [] },
    estagio:     { score: 0, max: 30, reasons: [] },
    decayFactor: 1.0,
    decayLabel:  null,
  };

  const query = useQuery({
    queryKey: ["lead_intelligence", organizationId, phone],
    queryFn: async () => {
      if (!organizationId || !phone) return null;
      const normalizedPhone = normalizePhone(phone);
      if (!normalizedPhone || normalizedPhone.length < 8) return null;

      const { data: clientsData } = await supabase
        .from("clients")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      const clients = (clientsData ?? []) as Client[];
      const client  = clients.find(c => {
        if (!c.phone) return false;
        const cn = normalizePhone(c.phone);
        return cn === normalizedPhone || cn.endsWith(normalizedPhone.slice(-8));
      }) ?? null;

      if (!client) return { client: null, proposals: [], activeContract: null };

      const [{ data: proposalsData }, { data: contractsData }] = await Promise.all([
        supabase
          .from("proposals")
          .select("*")
          .eq("organization_id", organizationId)
          .eq("client_id", client.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
        supabase
          .from("contracts_v2")
          .select("id, status, total_monthly, total_setup, start_date, service_slugs")
          .eq("organization_id", organizationId)
          .eq("client_id", client.id)
          .order("created_at", { ascending: false }),
      ]);

      const proposals  = (proposalsData  ?? []) as unknown as Proposal[];
      const contracts  = (contractsData  ?? []) as ActiveContract[];
      const activeContract =
        contracts.find(c => c.status === "assinado") ??
        contracts.find(c => c.status === "enviado")  ??
        contracts[0] ?? null;

      return { client, proposals, activeContract };
    },
    enabled: !!organizationId && !!phone,
    staleTime: 2 * 60_000,
  });

  const raw = query.data;
  if (!raw?.client) {
    return {
      client: null, proposals: [], activeContract: null,
      scoreBreakdown:      EMPTY_BREAKDOWN,
      leadScore:           0,
      closeProbability:    10,
      estimatedLtv:        0,
      origin:              "—",
      pipelineStage:       "Novo",
      pipelineLabel:       "Novo Lead",
      hasProposal:         false,
      hasApprovedProposal: false,
      hasContract:         false,
      isLoading:           query.isLoading,
    };
  }

  const { client, proposals, activeContract } = raw;

  const scoreBreakdown    = buildScoreBreakdown(client, proposals, activeContract, timeline);
  const pipelineStage     = deriveStage(proposals, activeContract);
  const hasApprovedProposal = proposals.some(p => p.status === "aprovada");

  return {
    client,
    proposals,
    activeContract,
    scoreBreakdown,
    leadScore:           scoreBreakdown.total,
    closeProbability:    STAGE_PROBABILITY[pipelineStage] ?? 10,
    estimatedLtv:        calcLtv(proposals, activeContract),
    origin:              proposals[0]?.lead_origin ?? proposals[0]?.campaign_origin ?? client.origin ?? "—",
    pipelineStage,
    pipelineLabel:       STAGE_LABELS[pipelineStage] ?? pipelineStage,
    hasProposal:         proposals.length > 0,
    hasApprovedProposal,
    hasContract:         !!activeContract,
    isLoading:           query.isLoading,
  };
}
