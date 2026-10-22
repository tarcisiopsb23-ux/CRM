/**
 * ChatbotAgentePage — Chatbot → Meu Agente
 *
 * Configuração completa do agente IA por cliente.
 * Salva em agent_configs (Banco A) via RPCs get_agent_config_for_client / upsert_agent_config.
 * O toggle bot_active salva em client_ai_settings (Banco B) via useDynamicClient.
 */

import { useState, useEffect, KeyboardEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bot, Sparkles, MessageSquare, Target, FileText,
  CheckSquare, Loader2, Save, ChevronDown, ChevronUp, X, Clock, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { useDynamicClient } from "@/hooks/useDynamicClient";
import { useClientAuth } from "@/hooks/useClientAuth";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "./components/PageHeader";
import { CredentialsErrorState } from "./components/CredentialsErrorState";

// ─── Tipos ─────────────────────────────────────────────────────────────────────

interface AgentForm {
  // Identidade
  agent_name: string;
  agent_role: string;
  agent_description: string;
  // Personalidade
  tone: string;
  formality: number;
  use_emojis: boolean;
  response_length: string;
  // Objetivo
  objective: string;
  // Instruções
  instructions: string;
  // Handoff
  behavior_handoff: boolean;
  handoff_keywords: string[];
  handoff_after_mins: number | "";
  // Fora do horário
  respond_outside_hours: boolean;
  outside_hours_message: string;
  // Comportamentos
  behavior_use_knowledge: boolean;
  behavior_collect_data: boolean;
  behavior_update_crm: boolean;
  behavior_create_deal: boolean;
  // Toggle global (Banco B)
  bot_active: boolean;
}

const defaultForm: AgentForm = {
  agent_name: "Assistente",
  agent_role: "Atendimento ao cliente",
  agent_description: "",
  tone: "amigavel",
  formality: 3,
  use_emojis: false,
  response_length: "medio",
  objective: "atendimento",
  instructions: "",
  behavior_handoff: true,
  handoff_keywords: [],
  handoff_after_mins: "",
  respond_outside_hours: false,
  outside_hours_message: "",
  behavior_use_knowledge: true,
  behavior_collect_data: true,
  behavior_update_crm: false,
  behavior_create_deal: false,
  bot_active: true,
};

// ─── Helpers de UI ─────────────────────────────────────────────────────────────

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="card-surface">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">{title}</CardTitle>
            {description && (
              <CardDescription className="text-xs mt-0.5">{description}</CardDescription>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function BehaviorRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border/50 last:border-0">
      <div className="space-y-0.5">
        <p className="text-sm font-medium text-foreground/90">{label}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5 shrink-0" />
    </div>
  );
}

// ─── Gerador de preview do system prompt ──────────────────────────────────────

function buildSystemPromptPreview(form: AgentForm): string {
  const toneLabels: Record<string, string> = {
    amigavel: "amigável",
    profissional: "profissional",
    descontraido: "descontraído",
    tecnico: "técnico",
  };
  const lengthLabels: Record<string, string> = {
    curto: "curto e direto",
    medio: "médio",
    longo: "detalhado",
  };
  const objectiveLabels: Record<string, string> = {
    atendimento: "atendimento ao cliente",
    qualificacao: "qualificação de leads",
    vendas: "vendas",
    agendamento: "agendamento",
    suporte: "suporte técnico",
    personalizado: "objetivo personalizado",
  };

  const lines: string[] = [];

  lines.push(`Você é ${form.agent_name || "{nome}"}${
    form.agent_role ? `, ${form.agent_role}` : ""
  }.`);

  if (form.agent_description) {
    lines.push("");
    lines.push(form.agent_description);
  }

  lines.push("");
  lines.push(`Tom: ${toneLabels[form.tone] ?? form.tone}. Formalidade: ${
    ["muito informal", "informal", "neutro", "formal", "muito formal"][form.formality - 1] ?? "neutro"
  }. Respostas: ${lengthLabels[form.response_length] ?? form.response_length}. ${
    form.use_emojis ? "Use emojis quando adequado." : "Não use emojis."
  }`);

  lines.push("");
  lines.push(`Objetivo principal: ${objectiveLabels[form.objective] ?? form.objective}.`);

  if (form.instructions.trim()) {
    lines.push("");
    lines.push("Regras específicas:");
    lines.push(form.instructions.trim());
  }

  if (form.behavior_handoff && form.handoff_keywords.length > 0) {
    lines.push("");
    lines.push(`Transferir para humano quando o cliente mencionar: ${form.handoff_keywords.join(", ")}.`);
  }

  if (form.handoff_after_mins) {
    lines.push(`Transferir para humano se não houver resposta em ${form.handoff_after_mins} minutos.`);
  }

  if (!form.respond_outside_hours) {
    lines.push("");
    lines.push("Fora do horário de atendimento: não responder.");
  } else if (form.outside_hours_message.trim()) {
    lines.push("");
    lines.push(`Fora do horário, enviar: "${form.outside_hours_message.trim()}"`);
  }

  return lines.join("\n");
}

// ─── Página principal ──────────────────────────────────────────────────────────

export function ChatbotAgentePage() {
  const dc = useDynamicClient();
  const { auth } = useClientAuth();
  const clientId = auth?.id ?? "";
  const orgId    = auth?.organization_id ?? "";

  const [form, setForm] = useState<AgentForm>(defaultForm);
  const [loaded, setLoaded] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [keywordInput, setKeywordInput] = useState("");

  if (!dc) return <CredentialsErrorState />;

  // ── Carregar dados ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!clientId || loaded) return;

    async function load() {
      try {
        // Paralelo: agent_configs (Banco A) + bot_active (Banco B)
        const [agentRes, botRes] = await Promise.all([
          supabase.rpc("get_agent_config_for_client", { p_client_id: clientId }),
          dc!.from("client_ai_settings")
            .select("bot_active")
            .eq("client_id", clientId)
            .limit(1)
            .maybeSingle(),
        ]);

        setForm(prev => {
          const next = { ...prev };

          // bot_active do Banco B
          if (botRes.data) {
            next.bot_active = botRes.data.bot_active ?? true;
          }

          // agent_configs do Banco A
          const ac = Array.isArray(agentRes.data) ? agentRes.data[0] : agentRes.data;
          if (ac) {
            next.agent_name          = ac.agent_name          ?? prev.agent_name;
            next.agent_role          = ac.agent_role          ?? prev.agent_role;
            next.agent_description   = ac.agent_description   ?? "";
            next.tone                = ac.tone                ?? prev.tone;
            next.formality           = ac.formality           ?? prev.formality;
            next.use_emojis          = ac.use_emojis          ?? prev.use_emojis;
            next.response_length     = ac.response_length     ?? prev.response_length;
            next.objective           = ac.objective           ?? prev.objective;
            next.instructions        = ac.instructions        ?? "";
            next.behavior_use_knowledge = ac.behavior_use_knowledge ?? prev.behavior_use_knowledge;
            next.behavior_collect_data  = ac.behavior_collect_data  ?? prev.behavior_collect_data;
            next.behavior_update_crm    = ac.behavior_update_crm    ?? prev.behavior_update_crm;
            next.behavior_create_deal   = ac.behavior_create_deal   ?? prev.behavior_create_deal;
            next.behavior_handoff       = ac.behavior_handoff       ?? prev.behavior_handoff;
            next.handoff_keywords       = ac.handoff_keywords       ?? [];
            next.handoff_after_mins     = ac.handoff_after_mins     ?? "";
            next.respond_outside_hours  = ac.respond_outside_hours  ?? prev.respond_outside_hours;
            next.outside_hours_message  = ac.outside_hours_message  ?? "";
          }

          return next;
        });
      } catch {
        // silencia erro de carregamento — campos ficam com defaults
      } finally {
        setLoaded(true);
      }
    }

    load();
  }, [clientId, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Salvar ──────────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!clientId || !orgId) throw new Error("Usuário não identificado");

      // 1. Salva agent_configs no Banco A
      const { error: agentErr } = await supabase.rpc("upsert_agent_config", {
        p_client_id:              clientId,
        p_organization_id:        orgId,
        p_agent_name:             form.agent_name,
        p_agent_role:             form.agent_role,
        p_agent_description:      form.agent_description || null,
        p_tone:                   form.tone,
        p_formality:              form.formality,
        p_use_emojis:             form.use_emojis,
        p_response_length:        form.response_length,
        p_objective:              form.objective,
        p_instructions:           form.instructions || null,
        p_behavior_use_knowledge: form.behavior_use_knowledge,
        p_behavior_collect_data:  form.behavior_collect_data,
        p_behavior_update_crm:    form.behavior_update_crm,
        p_behavior_create_deal:   form.behavior_create_deal,
        p_behavior_handoff:       form.behavior_handoff,
        p_handoff_keywords:       form.handoff_keywords,
        p_handoff_after_mins:     form.handoff_after_mins === "" ? null : Number(form.handoff_after_mins),
        p_respond_outside_hours:  form.respond_outside_hours,
        p_outside_hours_message:  form.outside_hours_message || null,
        p_handles_whatsapp:       true,
        p_handles_instagram:      true,
        p_handles_facebook:       true,
        p_handles_comments:       false,
        p_is_active:              form.bot_active,
      });
      if (agentErr) throw agentErr;

      // 2. Salva bot_active no Banco B
      const { data: existing } = await dc!.from("client_ai_settings")
        .select("id")
        .eq("client_id", clientId)
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        const { error } = await dc!.from("client_ai_settings")
          .update({ bot_active: form.bot_active })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await dc!.from("client_ai_settings")
          .insert({ client_id: clientId, bot_active: form.bot_active });
        if (error) throw error;
      }
    },
    onSuccess: () => toast.success("Configurações salvas com sucesso!"),
    onError:   (e: any) => toast.error("Erro ao salvar: " + (e?.message ?? "erro desconhecido")),
  });

  const set = <K extends keyof AgentForm>(k: K, v: AgentForm[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  // ── Tags de keywords ────────────────────────────────────────────────────────
  function addKeyword(raw: string) {
    const word = raw.trim().replace(/,$/, "").trim();
    if (!word) return;
    setForm(prev => ({
      ...prev,
      handoff_keywords: prev.handoff_keywords.includes(word)
        ? prev.handoff_keywords
        : [...prev.handoff_keywords, word],
    }));
    setKeywordInput("");
  }

  function removeKeyword(kw: string) {
    setForm(prev => ({ ...prev, handoff_keywords: prev.handoff_keywords.filter(k => k !== kw) }));
  }

  function handleKeywordKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addKeyword(keywordInput);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  const isSaving = saveMutation.isPending;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <PageHeader
        title="Meu Agente"
        description="Configure como seu assistente se comporta nas conversas com clientes."
        action={
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={isSaving || !loaded}
            className="gap-2"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </Button>
        }
      />

      {/* Toggle principal — bot_active */}
      <Card className="card-surface border-primary/20">
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                form.bot_active ? "bg-emerald-500/15" : "bg-muted/30"
              }`}>
                <Bot className={`h-4 w-4 ${
                  form.bot_active ? "text-emerald-400" : "text-muted-foreground"
                }`} />
              </div>
              <div>
                <p className="text-sm font-semibold">
                  {form.bot_active ? "Agente ativo" : "Agente offline"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {form.bot_active
                    ? "Respondendo automaticamente. Mensagens fora do padrão encaminham para humano."
                    : "Todas as conversas são encaminhadas para atendimento humano."}
                </p>
              </div>
            </div>
            <Switch
              checked={form.bot_active}
              onCheckedChange={v => set("bot_active", v)}
              disabled={!loaded}
            />
          </div>
        </CardContent>
      </Card>

      {/* Identidade */}
      <SectionCard
        icon={Bot}
        title="Identidade"
        description="Nome e função do agente visíveis nas conversas."
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Nome do agente</Label>
            <Input
              value={form.agent_name}
              onChange={e => set("agent_name", e.target.value)}
              placeholder="Ex: Assistente, Ana, Max..."
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Função</Label>
            <Input
              value={form.agent_role}
              onChange={e => set("agent_role", e.target.value)}
              placeholder="Ex: Atendimento ao cliente, SDR, Suporte..."
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Descrição / contexto adicional</Label>
            <Textarea
              value={form.agent_description}
              onChange={e => set("agent_description", e.target.value)}
              placeholder="Ex: Você trabalha para uma clínica de estética. Nunca confirme valores sem consultar o time."
              rows={3}
              className="resize-none"
            />
          </div>
        </div>
      </SectionCard>

      {/* Personalidade */}
      <SectionCard
        icon={Sparkles}
        title="Personalidade"
        description="Como o agente se comunica com os clientes."
      >
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label className="text-xs">Tom de voz</Label>
            <Select value={form.tone} onValueChange={v => set("tone", v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="amigavel">Amigável</SelectItem>
                <SelectItem value="profissional">Profissional</SelectItem>
                <SelectItem value="descontraido">Descontraído</SelectItem>
                <SelectItem value="tecnico">Técnico</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-xs">Formalidade</Label>
              <span className="text-xs text-muted-foreground">{[
                "", "Muito informal", "Informal", "Neutro", "Formal", "Muito formal",
              ][form.formality]}</span>
            </div>
            <Slider
              value={[form.formality]}
              onValueChange={([v]) => set("formality", v)}
              min={1} max={5} step={1}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground/60 px-0.5">
              <span>Informal</span><span>Formal</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Comprimento das respostas</Label>
            <Select value={form.response_length} onValueChange={v => set("response_length", v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="curto">Curto e direto</SelectItem>
                <SelectItem value="medio">Médio</SelectItem>
                <SelectItem value="longo">Detalhado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/50 bg-secondary/20 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Usar emojis</p>
              <p className="text-xs text-muted-foreground">O agente pode incluir emojis nas respostas</p>
            </div>
            <Switch checked={form.use_emojis} onCheckedChange={v => set("use_emojis", v)} />
          </div>
        </div>
      </SectionCard>

      {/* Objetivo */}
      <SectionCard
        icon={Target}
        title="Objetivo principal"
        description="Define o foco padrão do agente nas conversas."
      >
        <Select value={form.objective} onValueChange={v => set("objective", v)}>
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="atendimento">Atendimento geral</SelectItem>
            <SelectItem value="qualificacao">Qualificação de leads</SelectItem>
            <SelectItem value="vendas">Vendas</SelectItem>
            <SelectItem value="agendamento">Agendamento</SelectItem>
            <SelectItem value="suporte">Suporte</SelectItem>
            <SelectItem value="personalizado">Personalizado</SelectItem>
          </SelectContent>
        </Select>
      </SectionCard>

      {/* Instruções específicas */}
      <SectionCard
        icon={FileText}
        title="Instruções específicas"
        description="Regras personalizadas para o agente seguir nas conversas."
      >
        <Textarea
          value={form.instructions}
          onChange={e => set("instructions", e.target.value)}
          placeholder={"Ex: Não ofereça descontos sem aprovação.\nSempre pergunte o nome do cliente antes de prosseguir.\nNão discuta assuntos fora do escopo do negócio."}
          rows={5}
          className="resize-none"
        />
      </SectionCard>

      {/* Handoff — Transferência para humano */}
      <SectionCard
        icon={Users}
        title="Transferência para humano"
        description="Quando e como o agente deve passar o atendimento para um humano."
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border/50 bg-secondary/20 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Habilitar transferência</p>
              <p className="text-xs text-muted-foreground">O agente identifica situações que exigem atendimento humano</p>
            </div>
            <Switch checked={form.behavior_handoff} onCheckedChange={v => set("behavior_handoff", v)} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Palavras-chave de transferência</Label>
            <p className="text-[11px] text-muted-foreground">
              Pressione Enter ou vírgula para adicionar. Quando o cliente mencionar estas palavras, o agente transferirá o atendimento.
            </p>
            <div className="flex flex-wrap gap-1.5 rounded-md border border-border bg-background px-3 py-2 min-h-[40px]">
              {form.handoff_keywords.map(kw => (
                <span
                  key={kw}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                >
                  {kw}
                  <button
                    type="button"
                    onClick={() => removeKeyword(kw)}
                    className="ml-0.5 rounded-full hover:bg-primary/20 p-0.5"
                    aria-label={`Remover ${kw}`}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
              <Input
                value={keywordInput}
                onChange={e => setKeywordInput(e.target.value)}
                onKeyDown={handleKeywordKeyDown}
                onBlur={() => addKeyword(keywordInput)}
                placeholder={form.handoff_keywords.length === 0 ? "Ex: falar com atendente, reclamação..." : ""}
                className="h-6 flex-1 min-w-[120px] border-0 bg-transparent px-0 py-0 text-xs shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/60"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Minutos sem resposta humana antes de transferir</Label>
            <Input
              type="number"
              min={1}
              value={form.handoff_after_mins}
              onChange={e => set("handoff_after_mins", e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="Ex: 5 (deixe em branco para desativar)"
              className="h-9"
            />
          </div>
        </div>
      </SectionCard>

      {/* Fora do horário */}
      <SectionCard
        icon={Clock}
        title="Fora do horário"
        description="Como o agente se comporta quando o estabelecimento está fechado."
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border/50 bg-secondary/20 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Responder fora do horário</p>
              <p className="text-xs text-muted-foreground">O agente envia uma mensagem automática quando fora do horário de funcionamento</p>
            </div>
            <Switch checked={form.respond_outside_hours} onCheckedChange={v => set("respond_outside_hours", v)} />
          </div>

          {form.respond_outside_hours && (
            <div className="space-y-1.5">
              <Label className="text-xs">Mensagem enviada fora do horário</Label>
              <Textarea
                value={form.outside_hours_message}
                onChange={e => set("outside_hours_message", e.target.value)}
                placeholder="Ex: Olá! Nosso atendimento funciona de segunda a sexta das 9h às 18h. Retornaremos em breve!"
                rows={3}
                className="resize-none"
              />
            </div>
          )}
        </div>
      </SectionCard>

      {/* Comportamentos */}
      <SectionCard
        icon={CheckSquare}
        title="Comportamentos"
        description="O que o agente pode fazer automaticamente durante as conversas."
      >
        <div>
          <BehaviorRow
            label="Consultar base de conhecimento"
            description="O agente busca informações no Conhecimento antes de responder."
            checked={form.behavior_use_knowledge}
            onChange={v => set("behavior_use_knowledge", v)}
          />
          <BehaviorRow
            label="Coletar dados do contato"
            description="O agente solicita nome, telefone e e-mail quando não disponíveis."
            checked={form.behavior_collect_data}
            onChange={v => set("behavior_collect_data", v)}
          />
          <BehaviorRow
            label="Atualizar CRM"
            description="Dados coletados são salvos automaticamente nos contatos do CRM."
            checked={form.behavior_update_crm}
            onChange={v => set("behavior_update_crm", v)}
          />
          <BehaviorRow
            label="Criar oportunidade"
            description="O agente cria uma oportunidade no funil quando identificar interesse de compra."
            checked={form.behavior_create_deal}
            onChange={v => set("behavior_create_deal", v)}
          />
        </div>
      </SectionCard>

      {/* Preview do System Prompt */}
      <Card className="card-surface">
        <CardHeader className="pb-3">
          <button
            type="button"
            onClick={() => setPreviewOpen(p => !p)}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <MessageSquare className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">Preview do System Prompt</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Como o n8n vai montar as instruções para o LLM com esses dados.
                </CardDescription>
              </div>
            </div>
            {previewOpen
              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
        </CardHeader>
        {previewOpen && (
          <CardContent>
            <pre className="whitespace-pre-wrap rounded-md bg-secondary/40 p-4 text-xs text-foreground/80 leading-relaxed font-mono border border-border/50">
              {buildSystemPromptPreview(form)}
            </pre>
          </CardContent>
        )}
      </Card>

      {/* Rodapé */}
      <div className="flex justify-end pt-2 pb-6">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={isSaving || !loaded}
          className="gap-2"
        >
          {isSaving
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Save className="h-4 w-4" />}
          Salvar configurações
        </Button>
      </div>
    </div>
  );
}
