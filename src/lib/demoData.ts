/**
 * Mock data for the demo page (/demo)
 * Covers ~13 months of data (April 2025 – April 2026)
 */

import { subDays, format, subMonths, startOfMonth, addDays } from "date-fns";
import type { Lead } from "@/components/crm/types";
import type { ClientKPI, ClientKPIHistory } from "@/hooks/useClientKPIs";
import type { CampaignData, DailyMetrics } from "@/hooks/useHubPerformance";
import type { ConversationKpiRow, AgentKpiRow } from "@/hooks/useClientConversationKpis";

// ─── helpers ─────────────────────────────────────────────────────────────────
const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const rndF = (min: number, max: number) => parseFloat((Math.random() * (max - min) + min).toFixed(2));
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const uuid = (n: number) => `demo-${n.toString().padStart(4, "0")}`;

// ─── CLIENT INFO ─────────────────────────────────────────────────────────────
export const DEMO_CLIENT = {
  id: "demo-client",
  name: "Agência Demo",
  favicon_url: "/favicon.png",
  metadata: {
    display_name: "Agência Demo",
    dashboard_performance: true,
    dashboard_atendimento: true,
    dashboard_crm: true,
  },
  dashboard_performance: true,
  dashboard_atendimento: true,
  dashboard_crm: true,
};

// ─── DATE RANGE HELPERS ──────────────────────────────────────────────────────
export const DEMO_DATE_RANGE = {
  from: format(subMonths(new Date(), 12), "yyyy-MM-dd"),
  to: format(new Date(), "yyyy-MM-dd"),
};

// ─── CRM LEADS ───────────────────────────────────────────────────────────────
const NAMES = [
  "Ana Souza","Carlos Lima","Fernanda Rocha","João Pereira","Mariana Costa",
  "Rafael Alves","Beatriz Nunes","Diego Martins","Camila Ferreira","Lucas Oliveira",
  "Patrícia Santos","Thiago Mendes","Juliana Carvalho","Bruno Ribeiro","Larissa Gomes",
  "Eduardo Teixeira","Vanessa Pinto","Rodrigo Azevedo","Isabela Moreira","Felipe Castro",
  "Amanda Barbosa","Gustavo Correia","Natália Freitas","Henrique Lopes","Priscila Vieira",
  "Marcelo Cunha","Renata Dias","Leandro Nascimento","Tatiana Melo","André Cardoso",
  "Simone Araújo","Fábio Monteiro","Cristina Borges","Vinicius Ramos","Débora Cavalcanti",
  "Sérgio Figueiredo","Aline Machado","Danilo Sousa","Elaine Batista","Maurício Andrade",
];
const COMPANIES = [
  "Tech Solutions","Construtora ABC","Clínica Saúde+","Loja Fashion","Auto Center",
  "Imobiliária Prime","Escola Futuro","Restaurante Sabor","Academia Fit","Farmácia Vida",
  "Escritório Jurídico","Consultoria RH","Distribuidora Max","Gráfica Express","Pet Shop Amigo",
];
const ORIGINS = ["WhatsApp","Instagram","Facebook","Google","Indicação","Site","LinkedIn"];
const STATUSES: Lead["status"][] = ["novo","contato","proposta","negociacao","fechado","follow_up","perdido"];
const TEMPS: Lead["temperature"][] = ["quente","morno","frio"];
const LOST_REASONS = ["Preço alto","Escolheu concorrente","Sem orçamento","Não respondeu","Timing errado"];

export const DEMO_LEADS: Lead[] = Array.from({ length: 120 }, (_, i) => {
  const daysAgo = rnd(0, 365);
  const created = format(subDays(new Date(), daysAgo), "yyyy-MM-dd'T'HH:mm:ss");
  const status = pick(STATUSES);
  const proposalValue = rnd(1500, 45000);
  return {
    id: uuid(i + 1),
    name: NAMES[i % NAMES.length],
    phone: `(11) 9${rnd(1000, 9999)}-${rnd(1000, 9999)}`,
    email: `${NAMES[i % NAMES.length].split(" ")[0].toLowerCase()}@email.com`,
    company: i % 3 === 0 ? COMPANIES[i % COMPANIES.length] : null,
    address: i % 4 === 0 ? `Rua das Flores, ${rnd(10, 999)} - São Paulo` : null,
    origin: pick(ORIGINS),
    temperature: pick(TEMPS),
    proposal_value: proposalValue,
    potential_value: proposalValue * rndF(1.1, 2.0),
    product_id: null,
    product_name: pick(["Plano Básico","Plano Pro","Plano Enterprise","Consultoria","Pacote Mensal"]),
    whatsapp_link: `https://wa.me/5511${rnd(900000000, 999999999)}`,
    last_contact_at: format(subDays(new Date(), rnd(0, 30)), "yyyy-MM-dd"),
    next_followup_at: format(addDays(new Date(), rnd(1, 14)), "yyyy-MM-dd"),
    lost_reason: status === "perdido" ? pick(LOST_REASONS) : null,
    tags: pick(["vip","urgente","retorno","indicação",null,null]),
    notes: i % 5 === 0 ? "Cliente demonstrou interesse no plano anual." : null,
    status,
    created_at: created,
    updated_at: created,
  };
});

// ─── KPIs ─────────────────────────────────────────────────────────────────────
export const DEMO_KPIS: ClientKPI[] = [
  { id: "kpi-1", client_id: "demo-client", name: "Faturamento", category: "financeiro", unit: "currency", is_predefined: true, target_value: 80000, created_at: "", updated_at: "" },
  { id: "kpi-2", client_id: "demo-client", name: "Novos Clientes", category: "vendas", unit: "number", is_predefined: true, target_value: 15, created_at: "", updated_at: "" },
  { id: "kpi-3", client_id: "demo-client", name: "CAC", category: "marketing", unit: "currency", is_predefined: true, target_value: 350, created_at: "", updated_at: "" },
  { id: "kpi-4", client_id: "demo-client", name: "Taxa de Churn", category: "retenção", unit: "percentage", is_predefined: false, target_value: 5, created_at: "", updated_at: "" },
  { id: "kpi-5", client_id: "demo-client", name: "NPS", category: "satisfação", unit: "number", is_predefined: false, target_value: 70, created_at: "", updated_at: "" },
];

// 13 months of KPI history
export const DEMO_KPI_HISTORY: ClientKPIHistory[] = (() => {
  const rows: ClientKPIHistory[] = [];
  let id = 1;
  for (let m = 12; m >= 0; m--) {
    const date = subMonths(new Date(), m);
    const monthYear = format(startOfMonth(date), "yyyy-MM-dd");
    const trend = (12 - m) / 12; // 0→1 growth trend
    rows.push({ id: `kh-${id++}`, client_id: "demo-client", kpi_id: "kpi-1", month_year: monthYear, value: Math.round(45000 + trend * 35000 + rnd(-3000, 3000)), created_at: "", updated_at: "" });
    rows.push({ id: `kh-${id++}`, client_id: "demo-client", kpi_id: "kpi-2", month_year: monthYear, value: Math.round(6 + trend * 9 + rnd(-1, 2)), created_at: "", updated_at: "" });
    rows.push({ id: `kh-${id++}`, client_id: "demo-client", kpi_id: "kpi-3", month_year: monthYear, value: Math.round(480 - trend * 130 + rnd(-20, 20)), created_at: "", updated_at: "" });
    rows.push({ id: `kh-${id++}`, client_id: "demo-client", kpi_id: "kpi-4", month_year: monthYear, value: parseFloat((8 - trend * 3 + rndF(-0.5, 0.5)).toFixed(1)), created_at: "", updated_at: "" });
    rows.push({ id: `kh-${id++}`, client_id: "demo-client", kpi_id: "kpi-5", month_year: monthYear, value: Math.round(52 + trend * 20 + rnd(-3, 3)), created_at: "", updated_at: "" });
  }
  return rows;
})();

// ─── DAILY METRICS (365 days) ─────────────────────────────────────────────────
export const DEMO_DAILY_METRICS: DailyMetrics[] = Array.from({ length: 365 }, (_, i) => {
  const date = format(subDays(new Date(), 364 - i), "yyyy-MM-dd");
  const trend = i / 364;
  return {
    id: `dm-${i}`,
    client_id: "demo-client",
    date,
    total_spend: Math.round(800 + trend * 1200 + rnd(-100, 100)),
    total_leads: Math.round(8 + trend * 12 + rnd(-2, 3)),
    total_sales: Math.round(1 + trend * 3 + rnd(0, 1)),
    revenue: Math.round(3000 + trend * 7000 + rnd(-500, 500)),
    impressions: Math.round(15000 + trend * 25000 + rnd(-2000, 2000)),
    clicks: Math.round(300 + trend * 500 + rnd(-30, 50)),
  };
});

// ─── CAMPAIGN DATA ────────────────────────────────────────────────────────────
const CAMPAIGNS = [
  { name: "Campanha Verão 2025", platform: "Meta Ads" },
  { name: "Google Search - Marca", platform: "Google Ads" },
  { name: "Instagram Stories", platform: "Meta Ads" },
  { name: "Google Display", platform: "Google Ads" },
  { name: "Remarketing Facebook", platform: "Meta Ads" },
  { name: "YouTube Pre-roll", platform: "Google Ads" },
];

export const DEMO_CAMPAIGNS: CampaignData[] = Array.from({ length: 365 }, (_, i) => {
  const date = format(subDays(new Date(), 364 - i), "yyyy-MM-dd");
  const camp = CAMPAIGNS[i % CAMPAIGNS.length];
  const spend = rndF(200, 800);
  return {
    id: `cd-${i}`,
    client_id: "demo-client",
    date,
    platform: camp.platform,
    name: camp.name,
    spend,
    leads: rnd(2, 15),
    sales: rnd(0, 3),
    revenue: spend * rndF(1.5, 4.5),
  };
});

// ─── CONVERSATION KPIs ────────────────────────────────────────────────────────
export const DEMO_CONVERSATION_ROWS: ConversationKpiRow[] = Array.from({ length: 365 }, (_, i) => {
  const date = format(subDays(new Date(), 364 - i), "yyyy-MM-dd");
  const conversations = rnd(15, 60);
  const leads = Math.round(conversations * rndF(0.3, 0.6));
  const conversions = Math.round(leads * rndF(0.1, 0.3));
  const bot = Math.round(conversations * rndF(0.4, 0.7));
  return {
    period_date: date,
    source: pick(["whatsapp", "instagram", "facebook"]),
    campaign: pick(["Campanha Verão", "Google Search", "Instagram Stories", null, null]),
    conversations,
    bot_finished: bot,
    human_transfer: conversations - bot,
    leads_identified: leads,
    conversions,
  };
});

export const DEMO_AGENT_KPIS: AgentKpiRow[] = [
  { agent_name: "Ana Atendente", conversations_started: 312, conversations_finished: 289, conversions: 47 },
  { agent_name: "Carlos Vendas", conversations_started: 278, conversations_finished: 261, conversions: 53 },
  { agent_name: "Fernanda Suporte", conversations_started: 195, conversations_finished: 180, conversions: 28 },
  { agent_name: "Bot Automático", conversations_started: 890, conversations_finished: 712, conversions: 89 },
];

// ─── FUNNEL STATS ─────────────────────────────────────────────────────────────
export function getDemoFunnelStats(leads: Lead[]) {
  const counts = { novo: 0, contato: 0, proposta: 0, negociacao: 0, fechado: 0, perdido: 0 };
  for (const l of leads) {
    if (l.status in counts) counts[l.status as keyof typeof counts]++;
  }
  return counts;
}

// ─── AD CLICK STATS ───────────────────────────────────────────────────────────
export const DEMO_AD_CLICK_STATS = {
  totalClicks: 4823,
  uniqueCampaigns: 6,
  byCampaign: CAMPAIGNS.map((c, i) => ({ campaign: c.name, clicks: rnd(400, 1200), source: c.platform })),
  bySource: [
    { source: "Meta Ads", clicks: 2341 },
    { source: "Google Ads", clicks: 1987 },
    { source: "Link Rastreado", clicks: 495 },
  ],
  byDay: Array.from({ length: 30 }, (_, i) => ({
    date: format(subDays(new Date(), 29 - i), "yyyy-MM-dd"),
    clicks: rnd(80, 250),
  })),
  conversionRate: 18.4,
};
