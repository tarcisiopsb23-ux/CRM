/**
 * ChatbotAgentePage — Chatbot → Meu Agente
 *
 * Configuração do agente IA: identidade, personalidade, objetivo,
 * instruções livres e comportamentos habilitados.
 *
 * Estado atual: placeholder estrutural — será implementado na Fase 4
 * (agent_configs + LLM loop).
 * O toggle bot_active já é funcional (lê/escreve em client_ai_settings).
 */

import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bot, Sparkles, MessageSquare, Target, FileText,
  CheckSquare, Loader2, Info, Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { useDynamicClient } from "@/hooks/useDynamicClient";
import { useClientAuth } from "@/hooks/useClientAuth";
import { PageHeader } from "./components/PageHeader";
import { CredentialsErrorState } from "./components/CredentialsErrorState";

// ─── Tipos ─────────────────────────────────────────────────────────────────────

interface AgentForm {
  name: string;
  role: string;
  description: string;
  tone: string;
  formality: number;        // 1=informal → 5=formal
  objectivity: number;      // 1=detalhado → 5=objetivo
  use_emojis: boolean;
  response_length: string;  // 'curto' | 'medio' | 'longo'
  objective: string;
  instructions: string;
  // Comportamentos
  behavior_rag: boolean;
  behavior_collect_data: boolean;
  behavior_update_crm: boolean;
  behavior_create_deal: boolean;
  behavior_handoff: boolean;
  // Toggle global
  bot_active: boolean;
}

const defaultForm: AgentForm = {
  name: "Assistente",
  role: "Atendimento ao cliente",
  description: "",
  tone: "amigavel",
  formality: 3,
  objectivity: 3,
  use_emojis: false,
  response_length: "medio",
  objective: "atendimento",
  instructions: "",
  behavior_rag: true,
  behavior_collect_data: true,
  behavior_update_crm: false,
  behavior_create_deal: false,
  behavior_handoff: true,
  bot_active: true,
};

// ─── Helpers de UI ─────────────────────────────────────────────────────────────

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
  badge,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  children: React.ReactNode;
  badge?: string;
}) {
  return (
    <Card className="card-surface">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
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
          {badge && (
            <Badge variant="outline" className="text-[10px] text-muted-foreground border-border shrink-0">
              {badge}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// ─── Toggle comportamento ──────────────────────────────────────────────────────

function BehaviorRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border/50 last:border-0">
      <div className="space-y-0.5">
        <p className="text-sm font-medium text-foreground/90">{label}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} className="mt-0.5 shrink-0" />
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────

export function ChatbotAgentePage() {
  const dc = useDynamicClient();
  const { auth } = useClientAuth();
  const clientId = auth?.user?.client_id ?? "";

  const TABLE  = "client_ai_settings";
  const FILTER = { col: "client_id", val: clientId };

  const [form, setForm] = useState<AgentForm>(defaultForm);
  const [loaded, setLoaded] = useState(false);

  if (!dc) return <CredentialsErrorState />;

  useEffect(() => {
    if (!dc || loaded || !clientId) return;
    dc.from(TABLE)
      .select("bot_active, establishment_name, welcome_message")
      .eq(FILTER.col, FILTER.val)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setForm(prev => ({
            ...prev,
            bot_active: data.bot_active ?? true,
            name: data.establishment_name ? `Assistente ${data.establishment_name}` : prev.name,
            instructions: data.welcome_message ?? prev.instructions,
          }));
        }
        setLoaded(true);
      }).catch(() => setLoaded(true));
  }, [dc, loaded, clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!dc || !clientId) throw new Error("Banco não conectado");
      const { data: existing } = await dc
        .from(TABLE).select("id").eq(FILTER.col, FILTER.val).limit(1).maybeSingle();
      const payload = { bot_active: form.bot_active };
      if (existing?.id) {
        await dc.from(TABLE).update(payload).eq("id", existing.id);
      } else {
        await dc.from(TABLE).insert({ client_id: clientId, ...payload });
      }
    },
    onSuccess: () => toast.success("Configurações salvas com sucesso!"),
    onError: () => toast.error("Erro ao salvar configurações."),
  });

  const set = <K extends keyof AgentForm>(k: K, v: AgentForm[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <PageHeader
        title="Meu Agente"
        description="Configure como seu assistente se comporta nas conversas com clientes."
        action={
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !loaded}
            className="gap-2"
          >
            {saveMutation.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Save className="h-4 w-4" />}
            Salvar
          </Button>
        }
      />

      {/* Toggle principal — bot_active (funcional) */}
      <Card className="card-surface border-primary/20">
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                form.bot_active ? "bg-emerald-500/15" : "bg-muted/30"
              }`}>
                <Bot className={`h-4 w-4 ${form.bot_active ? "text-emerald-400" : "text-muted-foreground"}`} />
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

      {/* Identidade — placeholder (agent_configs — Fase 4) */}
      <SectionCard
        icon={Bot}
        title="Identidade"
        description="Nome e função do agente visíveis nas conversas."
        badge="Fase 4"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Nome do agente</Label>
            <Input
              value={form.name}
              onChange={e => set("name", e.target.value)}
              placeholder="Ex: Assistente, Ana, Max..."
              disabled
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Função</Label>
            <Input
              value={form.role}
              onChange={e => set("role", e.target.value)}
              placeholder="Ex: Atendimento ao cliente, SDR, Suporte..."
              disabled
            />
          </div>
          <DisabledNote />
        </div>
      </SectionCard>

      {/* Personalidade */}
      <SectionCard
        icon={Sparkles}
        title="Personalidade"
        description="Como o agente se comunica com os clientes."
        badge="Fase 4"
      >
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label className="text-xs">Tom de voz</Label>
            <Select value={form.tone} onValueChange={v => set("tone", v)} disabled>
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
              <span className="text-xs text-muted-foreground">{
                ["", "Muito informal", "Informal", "Neutro", "Formal", "Muito formal"][form.formality]
              }</span>
            </div>
            <Slider
              value={[form.formality]}
              onValueChange={([v]) => set("formality", v)}
              min={1} max={5} step={1}
              className="w-full"
              disabled
            />
            <div className="flex justify-between text-[10px] text-muted-foreground/60 px-0.5">
              <span>Informal</span><span>Formal</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-xs">Comprimento das respostas</Label>
            </div>
            <Select value={form.response_length} onValueChange={v => set("response_length", v)} disabled>
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
            <Switch checked={form.use_emojis} onCheckedChange={v => set("use_emojis", v)} disabled />
          </div>
          <DisabledNote />
        </div>
      </SectionCard>

      {/* Objetivo */}
      <SectionCard
        icon={Target}
        title="Objetivo principal"
        description="Define o foco padrão do agente nas conversas."
        badge="Fase 4"
      >
        <div className="space-y-3">
          <Select value={form.objective} onValueChange={v => set("objective", v)} disabled>
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
          <DisabledNote />
        </div>
      </SectionCard>

      {/* Instruções livres */}
      <SectionCard
        icon={FileText}
        title="Instruções específicas"
        description="Regras personalizadas para o agente seguir nas conversas."
        badge="Fase 4"
      >
        <div className="space-y-3">
          <textarea
            value={form.instructions}
            onChange={e => set("instructions", e.target.value)}
            placeholder={"Ex: Não ofereça descontos sem aprovação.\nSempre pergunte o nome do cliente antes de prosseguir.\nNão discuta assuntos fora do escopo do negócio."}
            rows={5}
            disabled
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <DisabledNote />
        </div>
      </SectionCard>

      {/* Comportamentos */}
      <SectionCard
        icon={CheckSquare}
        title="Comportamentos"
        description="O que o agente pode fazer automaticamente durante as conversas."
        badge="Fase 4"
      >
        <div>
          <BehaviorRow
            label="Consultar base de conhecimento"
            description="O agente busca informações no Conhecimento antes de responder."
            checked={form.behavior_rag}
            onChange={v => set("behavior_rag", v)}
            disabled
          />
          <BehaviorRow
            label="Coletar dados do contato"
            description="O agente solicita nome, telefone e e-mail quando não disponíveis."
            checked={form.behavior_collect_data}
            onChange={v => set("behavior_collect_data", v)}
            disabled
          />
          <BehaviorRow
            label="Atualizar CRM"
            description="Dados coletados são salvos automaticamente nos contatos do CRM."
            checked={form.behavior_update_crm}
            onChange={v => set("behavior_update_crm", v)}
            disabled
          />
          <BehaviorRow
            label="Criar oportunidade"
            description="O agente cria uma oportunidade no funil quando identificar interesse de compra."
            checked={form.behavior_create_deal}
            onChange={v => set("behavior_create_deal", v)}
            disabled
          />
          <BehaviorRow
            label="Transferir para humano"
            description="O agente identifica situações que exigem atendimento humano e solicita handoff."
            checked={form.behavior_handoff}
            onChange={v => set("behavior_handoff", v)}
            disabled
          />
          <DisabledNote className="mt-3" />
        </div>
      </SectionCard>

      {/* Rodapé com salvar */}
      <div className="flex justify-end pt-2 pb-6">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !loaded}
          className="gap-2"
        >
          {saveMutation.isPending
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Save className="h-4 w-4" />}
          Salvar configurações
        </Button>
      </div>
    </div>
  );
}

// ─── Nota de fase ──────────────────────────────────────────────────────────────

function DisabledNote({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-1.5 rounded-md bg-secondary/30 px-3 py-2 ${className}`}>
      <Info className="h-3 w-3 text-muted-foreground/60 shrink-0" />
      <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
        Disponível na <strong>Fase 4</strong> — motor de agente IA com LLM e function calling.
        O toggle "Agente ativo" acima já está funcional.
      </p>
    </div>
  );
}
