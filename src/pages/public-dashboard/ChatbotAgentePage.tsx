/**
 * ChatbotAgentePage — Chatbot → Meu Agente
 *
 * Configuração independente do agente IA por canal/subtipo.
 * Salva em agent_channel_configs (Banco A) via RPCs:
 *   get_agent_channel_configs / upsert_agent_channel_config
 * O toggle bot_active salva em client_ai_settings (Banco B) via useDynamicClient.
 */

import { useState, useEffect, KeyboardEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bot, Sparkles, MessageSquare, Target, FileText,
  CheckSquare, Loader2, Save, ChevronDown, ChevronUp, X, Clock, Users, GitBranch,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDynamicClient } from "@/hooks/useDynamicClient";
import { useClientAuth } from "@/hooks/useClientAuth";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "./components/PageHeader";
import { CredentialsErrorState } from "./components/CredentialsErrorState";

// ─── Tipos ─────────────────────────────────────────────────────────────────────

interface ChannelConfig {
  is_enabled: boolean;
  agent_name: string;
  agent_role: string;
  agent_description: string;
  tone: string;
  formality: number;
  use_emojis: boolean;
  response_length: string;
  objective: string;
  instructions: string;
  behavior_use_knowledge: boolean;
  behavior_collect_data: boolean;
  behavior_create_opportunity: boolean;
  behavior_handoff: boolean;
  handoff_keywords: string[];
  handoff_after_mins: number | "";
  respond_outside_hours: boolean;
  outside_hours_message: string;
}

type ChannelType =
  | "whatsapp"
  | "instagram_dm"
  | "instagram_comment"
  | "facebook_dm"
  | "facebook_comment";

const CHANNELS: ChannelType[] = [
  "whatsapp",
  "instagram_dm",
  "instagram_comment",
  "facebook_dm",
  "facebook_comment",
];

const CHANNEL_LABELS: Record<ChannelType, string> = {
  whatsapp:          "WhatsApp",
  instagram_dm:      "Instagram DM",
  instagram_comment: "Comentário IG",
  facebook_dm:       "Facebook DM",
  facebook_comment:  "Comentário FB",
};

const CHANNEL_NOTES: Record<ChannelType, string> = {
  whatsapp:
    "Canal: WhatsApp. Seja proativo — antecipe dúvidas e sugira próximos passos.",
  instagram_dm:
    "Canal: Instagram Direct. Seja consultivo — qualifique o lead e guie para a conversão.",
  instagram_comment:
    "Canal: Comentário Instagram. Seja breve e cordial. Nunca compartilhe dados sensíveis.",
  facebook_dm:
    "Canal: Facebook Messenger. Tom amigável e direto.",
  facebook_comment:
    "Canal: Comentário Facebook. Seja breve e cordial. Nunca compartilhe dados sensíveis.",
};

// ─── Defaults por canal ────────────────────────────────────────────────────────

const baseDefault: ChannelConfig = {
  is_enabled: true,
  agent_name: "Assistente",
  agent_role: "Atendimento ao cliente",
  agent_description: "",
  tone: "amigavel",
  formality: 3,
  use_emojis: false,
  response_length: "medio",
  objective: "atendimento",
  instructions: "",
  behavior_use_knowledge: true,
  behavior_collect_data: true,
  behavior_create_opportunity: false,
  behavior_handoff: true,
  handoff_keywords: [],
  handoff_after_mins: "",
  respond_outside_hours: false,
  outside_hours_message: "",
};

const commentDefault: Partial<ChannelConfig> = {
  behavior_collect_data: false,
  behavior_create_opportunity: false,
  tone: "profissional",
  response_length: "curto",
  instructions:
    "Seja reativo — responda apenas o que foi perguntado. Nunca solicite dados pessoais em comentários públicos. Mantenha respostas curtas e cordiais.",
};

const dmDefault: Partial<ChannelConfig> = {
  behavior_collect_data: true,
  behavior_create_opportunity: false,
  objective: "qualificacao",
};

function makeDefaultConfigs(): Record<ChannelType, ChannelConfig> {
  return {
    whatsapp:          { ...baseDefault },
    instagram_dm:      { ...baseDefault, ...dmDefault },
    instagram_comment: { ...baseDefault, ...commentDefault },
    facebook_dm:       { ...baseDefault, ...dmDefault },
    facebook_comment:  { ...baseDefault, ...commentDefault },
  };
}

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

const toneLabels: Record<string, string> = {
  amigavel:     "amigável",
  profissional: "profissional",
  descontraido: "descontraído",
  tecnico:      "técnico",
};

const formalityLabels = ["", "Muito informal", "Informal", "Neutro", "Formal", "Muito formal"];

const lengthLabels: Record<string, string> = {
  curto: "curto e direto",
  medio: "médio",
  longo: "detalhado",
};

const objectiveLabels: Record<string, string> = {
  atendimento:  "atendimento ao cliente",
  qualificacao: "qualificação de leads",
  vendas:       "vendas",
  agendamento:  "agendamento",
  suporte:      "suporte técnico",
  personalizado: "objetivo personalizado",
};

function buildSystemPromptPreview(cfg: ChannelConfig, channel: ChannelType): string {
  const lines: string[] = [];

  lines.push(
    `Você é ${cfg.agent_name || "{nome}"}${cfg.agent_role ? `, ${cfg.agent_role}` : ""}.`,
  );

  if (cfg.agent_description) {
    lines.push("");
    lines.push(cfg.agent_description);
  }

  lines.push("");
  lines.push(
    `Tom: ${toneLabels[cfg.tone] ?? cfg.tone}. Formalidade: ${
      formalityLabels[cfg.formality] ?? "neutro"
    }. Respostas: ${lengthLabels[cfg.response_length] ?? cfg.response_length}. ${
      cfg.use_emojis ? "Use emojis quando adequado." : "Não use emojis."
    }`,
  );

  lines.push("");
  lines.push(`Objetivo principal: ${objectiveLabels[cfg.objective] ?? cfg.objective}.`);

  if (cfg.instructions.trim()) {
    lines.push("");
    lines.push("Regras específicas:");
    lines.push(cfg.instructions.trim());
  }

  if (cfg.behavior_handoff && cfg.handoff_keywords.length > 0) {
    lines.push("");
    lines.push(
      `Transferir para humano quando o cliente mencionar: ${cfg.handoff_keywords.join(", ")}.`,
    );
  }

  if (cfg.handoff_after_mins) {
    lines.push(
      `Transferir para humano se não houver resposta em ${cfg.handoff_after_mins} minutos.`,
    );
  }

  if (!cfg.respond_outside_hours) {
    lines.push("");
    lines.push("Fora do horário de atendimento: não responder.");
  } else if (cfg.outside_hours_message.trim()) {
    lines.push("");
    lines.push(`Fora do horário, enviar: "${cfg.outside_hours_message.trim()}"`);
  }

  lines.push("");
  lines.push(CHANNEL_NOTES[channel]);

  return lines.join("\n");
}

// ─── ChannelTab ────────────────────────────────────────────────────────────────

interface ChannelTabProps {
  channel: ChannelType;
  cfg: ChannelConfig;
  onChange: (patch: Partial<ChannelConfig>) => void;
}

function ChannelTab({ channel, cfg, onChange }: ChannelTabProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [keywordInput, setKeywordInput] = useState("");

  function set<K extends keyof ChannelConfig>(k: K, v: ChannelConfig[K]) {
    onChange({ [k]: v } as Partial<ChannelConfig>);
  }

  function addKeyword(raw: string) {
    const word = raw.trim().replace(/,$/, "").trim();
    if (!word) return;
    onChange({
      handoff_keywords: cfg.handoff_keywords.includes(word)
        ? cfg.handoff_keywords
        : [...cfg.handoff_keywords, word],
    });
    setKeywordInput("");
  }

  function removeKeyword(kw: string) {
    onChange({ handoff_keywords: cfg.handoff_keywords.filter(k => k !== kw) });
  }

  function handleKeywordKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addKeyword(keywordInput);
    }
  }

  return (
    <div className="space-y-6">

      {/* Toggle: canal ativo */}
      <Card className="card-surface border-primary/20">
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">Este canal está ativo para o bot?</p>
              <p className="text-xs text-muted-foreground">
                Quando desligado, o bot não responde neste canal.
              </p>
            </div>
            <Switch checked={cfg.is_enabled} onCheckedChange={v => set("is_enabled", v)} />
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
              value={cfg.agent_name}
              onChange={e => set("agent_name", e.target.value)}
              placeholder="Ex: Assistente, Ana, Max..."
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Função</Label>
            <Input
              value={cfg.agent_role}
              onChange={e => set("agent_role", e.target.value)}
              placeholder="Ex: Atendimento ao cliente, SDR, Suporte..."
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Descrição / contexto adicional</Label>
            <Textarea
              value={cfg.agent_description}
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
            <Select value={cfg.tone} onValueChange={v => set("tone", v)}>
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
              <span className="text-xs text-muted-foreground">{formalityLabels[cfg.formality]}</span>
            </div>
            <Slider
              value={[cfg.formality]}
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
            <Select value={cfg.response_length} onValueChange={v => set("response_length", v)}>
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
            <Switch checked={cfg.use_emojis} onCheckedChange={v => set("use_emojis", v)} />
          </div>
        </div>
      </SectionCard>

      {/* Objetivo */}
      <SectionCard
        icon={Target}
        title="Objetivo principal"
        description="Define o foco padrão do agente nas conversas deste canal."
      >
        <Select value={cfg.objective} onValueChange={v => set("objective", v)}>
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

      {/* Instruções */}
      <SectionCard
        icon={FileText}
        title="Instruções específicas"
        description="Regras personalizadas para o agente seguir neste canal."
      >
        <Textarea
          value={cfg.instructions}
          onChange={e => set("instructions", e.target.value)}
          placeholder={
            "Ex: Não ofereça descontos sem aprovação.\nSempre pergunte o nome do cliente antes de prosseguir."
          }
          rows={5}
          className="resize-none"
        />
      </SectionCard>

      {/* Comportamentos */}
      <SectionCard
        icon={CheckSquare}
        title="Comportamentos"
        description="O que o agente pode fazer automaticamente neste canal."
      >
        <div>
          <BehaviorRow
            label="Consultar base de conhecimento"
            description="O agente busca informações no Conhecimento antes de responder."
            checked={cfg.behavior_use_knowledge}
            onChange={v => set("behavior_use_knowledge", v)}
          />
          <BehaviorRow
            label="Coletar dados do contato"
            description="O agente solicita nome, telefone e e-mail quando não disponíveis."
            checked={cfg.behavior_collect_data}
            onChange={v => set("behavior_collect_data", v)}
          />
          <BehaviorRow
            label="Criar oportunidade no CRM"
            description="O agente cria uma oportunidade no funil quando identificar interesse de compra."
            checked={cfg.behavior_create_opportunity}
            onChange={v => set("behavior_create_opportunity", v)}
          />
          <BehaviorRow
            label="Transferir para humano"
            description="O agente identifica situações que exigem atendimento humano."
            checked={cfg.behavior_handoff}
            onChange={v => set("behavior_handoff", v)}
          />
        </div>
      </SectionCard>

      {/* Handoff — só mostrar quando behavior_handoff ativo */}
      {cfg.behavior_handoff && (
        <SectionCard
          icon={Users}
          title="Transferência para humano"
          description="Quando e como o agente deve passar o atendimento para um humano."
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Palavras-chave de transferência</Label>
              <p className="text-[11px] text-muted-foreground">
                Pressione Enter ou vírgula para adicionar. Quando o cliente mencionar estas palavras, o agente transferirá o atendimento.
              </p>
              <div className="flex flex-wrap gap-1.5 rounded-md border border-border bg-background px-3 py-2 min-h-[40px]">
                {cfg.handoff_keywords.map(kw => (
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
                  placeholder={cfg.handoff_keywords.length === 0 ? "Ex: falar com atendente, reclamação..." : ""}
                  className="h-6 flex-1 min-w-[120px] border-0 bg-transparent px-0 py-0 text-xs shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/60"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Minutos sem resposta humana antes de transferir</Label>
              <Input
                type="number"
                min={1}
                value={cfg.handoff_after_mins}
                onChange={e =>
                  set("handoff_after_mins", e.target.value === "" ? "" : Number(e.target.value))
                }
                placeholder="Ex: 5 (deixe em branco para desativar)"
                className="h-9"
              />
            </div>
          </div>
        </SectionCard>
      )}

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
              <p className="text-xs text-muted-foreground">
                O agente envia uma mensagem automática quando fora do horário de funcionamento
              </p>
            </div>
            <Switch
              checked={cfg.respond_outside_hours}
              onCheckedChange={v => set("respond_outside_hours", v)}
            />
          </div>

          {!cfg.respond_outside_hours && (
            <div className="space-y-1.5">
              <Label className="text-xs">Mensagem enviada fora do horário</Label>
              <Textarea
                value={cfg.outside_hours_message}
                onChange={e => set("outside_hours_message", e.target.value)}
                placeholder="Ex: Olá! Nosso atendimento funciona de segunda a sexta das 9h às 18h. Retornaremos em breve!"
                rows={3}
                className="resize-none"
              />
            </div>
          )}
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
                  Como ficará o prompt final para este canal.
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
              {buildSystemPromptPreview(cfg, channel)}
            </pre>
          </CardContent>
        )}
      </Card>

    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────

export function ChatbotAgentePage() {
  const dc = useDynamicClient();
  const { auth } = useClientAuth();
  const clientId = auth?.id ?? "";
  const orgId    = auth?.organization_id ?? "";

  const [configs, setConfigs] = useState<Record<ChannelType, ChannelConfig>>(makeDefaultConfigs);
  const [botActive, setBotActive] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<ChannelType>("whatsapp");

  // ── Bot mode state ──────────────────────────────────────────────────────────
  const [botMode, setBotMode] = useState<'padrao' | 'flow'>('padrao');
  const [botModePerChannel, setBotModePerChannel] = useState<Record<string, 'padrao' | 'flow'>>({});
  const [agentConfigId, setAgentConfigId] = useState<string | null>(null);
  const [botModeLoading, setBotModeLoading] = useState(false);

  if (!dc) return <CredentialsErrorState />;

  // ── Carregar dados ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!clientId || loaded) return;

    async function load() {
      try {
        const [channelRes, botRes, agentCfgRes] = await Promise.all([
          supabase.rpc("get_agent_channel_configs", { p_client_id: clientId }),
          dc!.from("client_ai_settings")
            .select("bot_active")
            .eq("client_id", clientId)
            .limit(1)
            .maybeSingle(),
          supabase.rpc('get_agent_config_for_client', { p_client_id: clientId }),
        ]);

        // bot_active do Banco B
        if (botRes.data) {
          setBotActive(botRes.data.bot_active ?? true);
        }

        // agent_configs (bot_mode) do Banco A — retorna SETOF (array)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const agentCfg = (agentCfgRes.data as any[])?.[0] ?? null;
        if (agentCfg) {
          setAgentConfigId(agentCfg.id);
          setBotMode((agentCfg.bot_mode as 'padrao' | 'flow') ?? 'padrao');
          setBotModePerChannel((agentCfg.bot_mode_per_channel as Record<string, 'padrao' | 'flow'>) ?? {});
        }

        // channel configs do Banco A — merge com defaults
        const remote = (channelRes.data ?? {}) as Record<string, Partial<ChannelConfig>>;
        const defaults = makeDefaultConfigs();

        setConfigs(prev => {
          const next = { ...prev };
          for (const ch of CHANNELS) {
            if (remote[ch]) {
              next[ch] = {
                ...defaults[ch],
                ...remote[ch],
                // Garantir que handoff_after_mins seja number | ""
                handoff_after_mins:
                  remote[ch].handoff_after_mins != null
                    ? Number(remote[ch].handoff_after_mins)
                    : "",
                handoff_keywords: remote[ch].handoff_keywords ?? [],
              };
            }
          }
          return next;
        });
      } catch {
        // silencia erro — campos ficam com defaults
      } finally {
        setLoaded(true);
      }
    }

    load();
  }, [clientId, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Atualizar uma config de canal ───────────────────────────────────────────
  function patchChannel(ch: ChannelType, patch: Partial<ChannelConfig>) {
    setConfigs(prev => ({ ...prev, [ch]: { ...prev[ch], ...patch } }));
  }

  // ── Salvar modo do bot ──────────────────────────────────────────────────────
  async function saveBotMode() {
    if (!agentConfigId) return;
    setBotModeLoading(true);
    try {
      const { error } = await supabase.rpc('set_bot_mode', {
        p_client_id:           clientId,
        p_bot_mode:            botMode,
        p_bot_mode_per_channel: botModePerChannel,
      });
      if (error) throw error;
      toast.success('Modo do bot salvo!');
    } catch (e: unknown) {
      toast.error('Erro ao salvar modo do bot: ' + ((e as Error)?.message ?? 'erro desconhecido'));
    } finally {
      setBotModeLoading(false);
    }
  }

  // ── Salvar ──────────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!clientId || !orgId) throw new Error("Usuário não identificado");

      // 1. Salva todos os canais no Banco A em paralelo
      const saves = CHANNELS.map(ch =>
        supabase.rpc("upsert_agent_channel_config", {
          p_client_id:                   clientId,
          p_organization_id:             orgId,
          p_channel_type:                ch,
          p_is_enabled:                  configs[ch].is_enabled,
          p_agent_name:                  configs[ch].agent_name,
          p_agent_role:                  configs[ch].agent_role,
          p_agent_description:           configs[ch].agent_description || null,
          p_tone:                        configs[ch].tone,
          p_formality:                   configs[ch].formality,
          p_use_emojis:                  configs[ch].use_emojis,
          p_response_length:             configs[ch].response_length,
          p_objective:                   configs[ch].objective,
          p_instructions:                configs[ch].instructions || null,
          p_behavior_use_knowledge:      configs[ch].behavior_use_knowledge,
          p_behavior_collect_data:       configs[ch].behavior_collect_data,
          p_behavior_create_opportunity: configs[ch].behavior_create_opportunity,
          p_behavior_handoff:            configs[ch].behavior_handoff,
          p_handoff_keywords:            configs[ch].handoff_keywords,
          p_handoff_after_mins:
            configs[ch].handoff_after_mins === "" ? null : Number(configs[ch].handoff_after_mins),
          p_respond_outside_hours:  configs[ch].respond_outside_hours,
          p_outside_hours_message:  configs[ch].outside_hours_message || null,
        }),
      );

      const results = await Promise.all(saves);
      const firstErr = results.find(r => r.error)?.error;
      if (firstErr) throw firstErr;

      // 2. Salva bot_active no Banco B
      const { data: existing } = await dc!.from("client_ai_settings")
        .select("id")
        .eq("client_id", clientId)
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        const { error } = await dc!.from("client_ai_settings")
          .update({ bot_active: botActive })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await dc!.from("client_ai_settings")
          .insert({ client_id: clientId, bot_active: botActive });
        if (error) throw error;
      }

      // 3. Salva bot_mode / bot_mode_per_channel no Banco A via RPC (SECURITY DEFINER)
      if (agentConfigId) {
        const { error } = await supabase.rpc('set_bot_mode', {
          p_client_id:            clientId,
          p_bot_mode:             botMode,
          p_bot_mode_per_channel: botModePerChannel,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => toast.success("Configurações salvas com sucesso!"),
    onError:   (e: any) => toast.error("Erro ao salvar: " + (e?.message ?? "erro desconhecido")),
  });

  // ── Render ──────────────────────────────────────────────────────────────────
  const isSaving = saveMutation.isPending;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <PageHeader
        title="Meu Agente"
        description="Configure como seu assistente se comporta em cada canal."
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

      {/* Toggle principal — bot_active — sempre visível fora das abas */}
      <Card className="card-surface border-primary/20">
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                botActive ? "bg-emerald-500/15" : "bg-muted/30"
              }`}>
                <Bot className={`h-4 w-4 ${botActive ? "text-emerald-400" : "text-muted-foreground"}`} />
              </div>
              <div>
                <p className="text-sm font-semibold">
                  {botActive ? "Agente ativo" : "Agente offline"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {botActive
                    ? "Respondendo automaticamente. Mensagens fora do padrão encaminham para humano."
                    : "Todas as conversas são encaminhadas para atendimento humano."}
                </p>
              </div>
            </div>
            <Switch
              checked={botActive}
              onCheckedChange={setBotActive}
              disabled={!loaded}
            />
          </div>
        </CardContent>
      </Card>

      {/* Modo do Bot */}
      <Card className="card-surface">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <GitBranch className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Modo do Bot</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Define se o agente usa o flow padrão (IA humanizada) ou flows personalizados configurados no C8 Control
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!loaded ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : agentConfigId === null ? (
            <p className="text-sm text-muted-foreground">
              Configure o agente primeiro para ativar esta opção.
            </p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Select
                  value={botMode}
                  onValueChange={v => setBotMode(v as 'padrao' | 'flow')}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="padrao">Flow Padrão</SelectItem>
                    <SelectItem value="flow">Flow Personalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {botMode === 'flow' && (
                <div className="space-y-3 rounded-lg border border-border/50 bg-secondary/20 p-4">
                  <p className="text-xs font-medium text-muted-foreground">Substituição por canal (opcional)</p>
                  {(['whatsapp', 'instagram_dm', 'facebook_dm'] as const).map(ch => (
                    <div key={ch} className="flex items-center justify-between gap-3">
                      <span className="text-sm">{CHANNEL_LABELS[ch]}</span>
                      <Select
                        value={botModePerChannel[ch] ?? 'flow'}
                        onValueChange={v =>
                          setBotModePerChannel(prev => ({ ...prev, [ch]: v as 'padrao' | 'flow' }))
                        }
                      >
                        <SelectTrigger className="h-8 w-40 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="padrao">Flow Padrão</SelectItem>
                          <SelectItem value="flow">Flow Personalizado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={saveBotMode}
                  disabled={botModeLoading || !loaded}
                  className="gap-2"
                >
                  {botModeLoading
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Save className="h-3.5 w-3.5" />}
                  Salvar modo
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as ChannelType)}>
        <TabsList className="grid w-full grid-cols-5">
          {CHANNELS.map(ch => (
            <TabsTrigger key={ch} value={ch}>
              {CHANNEL_LABELS[ch]}
            </TabsTrigger>
          ))}
        </TabsList>

        {CHANNELS.map(ch => (
          <TabsContent key={ch} value={ch} className="space-y-6 mt-6">
            <ChannelTab
              channel={ch}
              cfg={configs[ch]}
              onChange={patch => patchChannel(ch, patch)}
            />
          </TabsContent>
        ))}
      </Tabs>

      {/* Rodapé — salvar */}
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
