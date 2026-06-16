// Edge Function: proposal-generate-contract
// Gera contrato automaticamente após aceite digital da proposta
// Chamada por: proposal-track-event (action=aceite) ou diretamente pelo frontend da agência

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const JSON_HEADERS = { ...CORS, "Content-Type": "application/json" };
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });

// Template padrão de contrato com todas as variáveis suportadas
const DEFAULT_CONTRACT_TEMPLATE = `
<h1>CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h1>

<p><strong>CONTRATANTE:</strong> {{cliente}} — {{empresa}} — CNPJ: {{cnpj}}</p>
<p><strong>CONTRATADA:</strong> Agência C8</p>
<p><strong>Data:</strong> {{data}}</p>

<h2>1. OBJETO DO CONTRATO</h2>
<p>A CONTRATADA se compromete a prestar os seguintes serviços ao CONTRATANTE:</p>
<p>{{servicos}}</p>

<h2>2. ESCOPO</h2>
<p>{{escopo}}</p>

<h2>3. VALOR E CONDIÇÕES DE PAGAMENTO</h2>
<p><strong>Valor do plano:</strong> {{valor}}</p>
<p><strong>Primeiro pagamento:</strong> {{primeiro_pagamento}}</p>
<p><strong>Vencimento:</strong> {{vencimento}}</p>
<p><strong>Cronograma:</strong> {{cronograma}}</p>

<h2>4. BONIFICAÇÕES</h2>
<p>{{bonificacoes}}</p>

<h2>5. CONSULTOR RESPONSÁVEL</h2>
<p>{{consultor}}</p>

<h2>6. APROVAÇÃO DIGITAL</h2>
<p>Este contrato foi aprovado digitalmente por {{cliente}} (CPF: {{cpf}}) em {{data}}.</p>
`;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("pt-BR");
  } catch {
    return dateStr;
  }
}

function substituteVariables(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => vars[key] ?? _match);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Authorization header required" }, 401);

    const body = await req.json() as { proposal_id: string };
    const { proposal_id } = body;
    if (!proposal_id) return json({ error: "proposal_id é obrigatório" }, 400);

    // 1. Fetch proposal
    const { data: propData, error: propError } = await admin
      .from("proposals")
      .select("*")
      .eq("id", proposal_id)
      .single();
    if (propError) throw propError;
    const proposal = propData as Record<string, unknown>;

    // 2. Fetch related data in parallel
    const [servicesRes, sectionsRes, clientRes, acceptanceRes, closerRes] = await Promise.all([
      admin.from("proposal_services").select("*").eq("proposal_id", proposal_id).order("sort_order"),
      admin.from("proposal_sections").select("*").eq("proposal_id", proposal_id).order("section_order"),
      admin.from("clients").select("name, email, whatsapp, cnpj, metadata").eq("id", proposal.client_id as string).single(),
      admin.from("proposal_acceptances").select("*").eq("proposal_id", proposal_id).maybeSingle(),
      proposal.closer_id
        ? admin.from("profiles").select("full_name").eq("id", proposal.closer_id as string).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (clientRes.error) throw clientRes.error;

    const client = clientRes.data as Record<string, unknown>;
    const services = (servicesRes.data ?? []) as Array<Record<string, unknown>>;
    const sections = (sectionsRes.data ?? []) as Array<Record<string, unknown>>;
    const acceptance = acceptanceRes.data as Record<string, unknown> | null;
    const closerName = (closerRes.data as Record<string, unknown> | null)?.full_name as string ?? "Agência C8";

    // 3. Fetch contract template (org default or system default)
    let templateContent = DEFAULT_CONTRACT_TEMPLATE;
    let usedDefaultTemplate = true;

    const { data: tmplData } = await admin
      .from("contract_templates")
      .select("content")
      .eq("organization_id", proposal.organization_id as string)
      .eq("is_default", true)
      .maybeSingle();

    if (tmplData && (tmplData as Record<string, unknown>).content) {
      templateContent = (tmplData as Record<string, unknown>).content as string;
      usedDefaultTemplate = false;
    }

    // 4. Build variable substitutions
    const regularServices = services.filter(s => !s.is_bonus);
    const bonusServices = services.filter(s => s.is_bonus);

    const servicosText = regularServices
      .map(s => `• ${s.name as string}: ${formatCurrency(Number(s.value))}`)
      .join("\n") || "—";

    const bonificacoesText = bonusServices.length > 0
      ? bonusServices
          .map(s => `🎁 ${s.name as string} (Bônus Exclusivo — De: ${formatCurrency(Number(s.value))} Por: R$ 0,00)`)
          .join("\n")
      : "Nenhuma bonificação";

    const escopoSection = sections.find(s => s.section_key === "escopo");
    const cronogramaSection = sections.find(s => s.section_key === "cronograma");
    const schedule = proposal.schedule as Record<string, unknown> | null;

    const cronogramaText = cronogramaSection?.content as string
      ?? (schedule
        ? `${schedule.installments} parcelas de ${formatCurrency(Number(schedule.firstValue))} a partir de ${formatDate(schedule.firstDate as string)}`
        : "—");

    const clientMeta = (client.metadata as Record<string, unknown>) ?? {};

    const vars: Record<string, string> = {
      cliente: client.name as string ?? "—",
      empresa: clientMeta.company as string ?? client.name as string ?? "—",
      cnpj: client.cnpj as string ?? "—",
      cpf: acceptance?.approver_cpf as string ?? "—",
      valor: formatCurrency(Number(proposal.plan_value ?? 0)),
      plano: proposal.title as string ?? "—",
      servicos: servicosText,
      bonificacoes: bonificacoesText,
      vencimento: schedule?.dueDay ? `Dia ${schedule.dueDay}` : "—",
      primeiro_pagamento: schedule?.firstDate ? formatDate(schedule.firstDate as string) : "—",
      data: formatDate(new Date().toISOString()),
      consultor: closerName,
      escopo: escopoSection?.content as string ?? "—",
      cronograma: cronogramaText,
    };

    // 5. Substitute variables
    const contractContent = substituteVariables(templateContent, vars);

    // 6. Find next version number
    const { data: existingContracts } = await admin
      .from("contracts")
      .select("contract_version")
      .eq("proposal_id", proposal_id)
      .order("contract_version", { ascending: false })
      .limit(1);

    const nextVersion = existingContracts && existingContracts.length > 0
      ? ((existingContracts[0] as Record<string, unknown>).contract_version as number ?? 0) + 1
      : 1;

    // 7. INSERT contract
    const { data: contractData, error: contractError } = await admin
      .from("contracts")
      .insert({
        organization_id: proposal.organization_id,
        client_id: proposal.client_id,
        proposal_id,
        title: proposal.title as string,
        value: Number(proposal.plan_value ?? 0),
        service_contracted: regularServices.map(s => s.name as string).join(", "),
        contract_date: new Date().toISOString().split("T")[0],
        status: "ativo",
        start_date: new Date().toISOString().split("T")[0],
        contract_version: nextVersion,
        contract_content: contractContent,
        // pdf_url: null — PDF generation requires additional infrastructure
      })
      .select("id")
      .single();

    if (contractError) throw contractError;
    const contractId = (contractData as Record<string, unknown>).id as string;

    // 8. Audit log
    await admin.from("proposal_audit_log").insert({
      organization_id: proposal.organization_id,
      proposal_id,
      action: "contrato_gerado",
      metadata: { contract_id: contractId, version: nextVersion },
    });

    // 9. Log if default template was used
    if (usedDefaultTemplate) {
      console.log(`[proposal-generate-contract] Org ${proposal.organization_id as string} usou template padrão — sugira personalizar em Configurações de Contratos.`);
    }

    return json({
      success: true,
      contract_id: contractId,
      version: nextVersion,
      used_default_template: usedDefaultTemplate,
    });

  } catch (err) {
    console.error("[proposal-generate-contract] Erro interno:", err);
    return json({ error: "Erro interno ao gerar contrato" }, 500);
  }
});
