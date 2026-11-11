/**
 * ChatbotCanaisPage
 *
 * Exibe 3 cards fixos independentes (WhatsApp, Instagram, Facebook Page)
 * derivados das conexões Meta do cliente.
 * Usa a EF get-meta-connections (service_role) para contornar RLS.
 *
 * Fase 3: Adiciona toggles Bot IA / Atendimento Humano por canal.
 */

import { useEffect, useState, useCallback, KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  MessageCircle, Instagram, ShieldCheck, CheckCircle2,
  AlertCircle, Loader2, ExternalLink, Facebook,
  Bot, Users, AlertTriangle, Info, X, GitBranch,
  Sparkles, Target, FileText, CheckSquare, Save, Clock,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge }       from "@/components/ui/badge";
import { Button }      from "@/components/ui/button";
import { Switch }      from "@/components/ui/switch";
import { Label }       from "@/components/ui/label";
import { Input }       from "@/components/ui/input";
import { Textarea }    from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Slider }      from "@/components/ui/slider";
import { PageHeader }  from "./components/PageHeader";
import { useClientAuth } from "@/hooks/useClientAuth";
import { supabase }    from "@/lib/supabase";
import { toast }       from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY     = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const DAYS = [
  { key: "seg", label: "Seg" },
  { key: "ter", label: "Ter" },
  { key: "qua", label: "Qua" },
  { key: "qui", label: "Qui" },
  { key: "sex", label: "Sex" },
  { key: "sab", label: "Sáb" },
  { key: "dom", label: "Dom" },
];

interface AttendanceConfig {
  fallback_assign_after_mins: number;
  queue_message: string;
  outside_hours_message: string;
  handoff_keywords: string[];
  human_hours_start: string;
  human_hours_end: string;
  human_days: string[];
  auto_assign: boolean;
}

const ATTENDANCE_DEFAULTS: AttendanceConfig = {
  fallback_assign_after_mins: 2,
  queue_message: "Aguarde, em breve um atendente irá assumir sua conversa.",
  outside_hours_message: "Nosso horário de atendimento humano terminou. Retornaremos em breve.",
  handoff_keywords: [],
  human_hours_start: "09:00",
  human_hours_end: "18:00",
  human_days: ["seg", "ter", "qua", "qui", "sex"],
  auto_assign: false,
};

interface MetaConn {
  id:                            string;
  provider:                      string;
  status:                        string;
  display_name:                  string | null;
  whatsapp_display_phone_number: string | null;
  whatsapp_phone_number_id:      string | null;
  instagram_username:            string | null;
  facebook_page_name:            string | null;
  waba_id:                       string | null;
  facebook_page_id:              string | null;
  instagram_account_id:          string | null;
  ad_account_id:                 string | null;
  health_status:                 string;
  last_error:                    string | null;
}

interface ChannelConfig {
  botWhatsapp: boolean;
  botInstagram: boolean;
  botFacebook: boolean;
  humanWhatsapp: boolean;
  humanInstagram: boolean;
  humanFacebook: boolean;
  flowWhatsapp: boolean;
  flowInstagram: boolean;
  flowFacebook: boolean;
  configLoading: boolean;
  configSaving: boolean;
}

const DEFAULT_CONFIG: ChannelConfig = {
  botWhatsapp:   true,
  botInstagram:  true,
  botFacebook:   true,
  humanWhatsapp: false,
  humanInstagram: false,
  humanFacebook: false,
  flowWhatsapp:  false,
  flowInstagram: false,
  flowFacebook:  false,
  configLoading: false,
  configSaving:  false,
};

// ─── Configuração do agente (inline, por canal) ──────────────────────────────

type AgentUiKey = "whatsapp" | "instagram" | "facebook";

// Mapeia a chave de UI do canal → channel_type do Banco A (agent_channel_configs)
const CHANNEL_TYPE_MAP: Record<AgentUiKey, string> = {
  whatsapp:  "whatsapp",
  instagram: "instagram_dm",
  facebook:  "facebook_dm",
};

// Apenas os 17 campos editáveis de "conteúdo" do agente.
// is_enabled e custom_flow_enabled são controlados pelos toggles rápidos
// (config.botX / config.flowX) — não são duplicados aqui.
interface AgentChannelConfig {
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

function makeAgentDefault(): AgentChannelConfig {
  return {
    agent_name:            "Assistente",
    agent_role:            "Atendimento ao cliente",
    agent_description:     "",
    tone:                  "amigavel",
    formality:             3,
    use_emojis:            false,
    response_length:       "medio",
    objective:             "atendimento",
    instructions:          "",
    behavior_use_knowledge:      true,
    behavior_collect_data:       true,
    behavior_create_opportunity: false,
    behavior_handoff:            true,
    handoff_keywords:            [],
    handoff_after_mins:          "",
    respond_outside_hours:        false,
    outside_hours_message:       "",
  };
}

const AGENT_FORMALITY_LABELS = ["", "Muito informal", "Informal", "Neutro", "Formal", "Muito formal"];

function AgentSectionCard({
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

function AgentBehaviorRow({
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

/**
 * Seção expansível "Configurar agente" renderizada inline em cada card de canal.
 * Espelha o layout da ChannelTab do antigo ChatbotAgentePage, sem o toggle de
 * canal ativo e sem o preview do system prompt.
 */
function AgentConfigSection({
  cfg,
  onChange,
  onSave,
  saving,
  loading,
  expanded,
  onToggle,
}: {
  cfg: AgentChannelConfig;
  onChange: (patch: Partial<AgentChannelConfig>) => void;
  onSave: () => void;
  saving: boolean;
  loading: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [keywordInput, setKeywordInput] = useState("");

  function set<K extends keyof AgentChannelConfig>(k: K, v: AgentChannelConfig[K]) {
    onChange({ [k]: v } as Partial<AgentChannelConfig>);
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
    <div className="mt-3 space-y-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded-lg border border-border/40 bg-secondary/20 px-3 py-2.5 text-left transition-colors hover:bg-secondary/30"
      >
        <span className="flex items-center gap-2 text-xs font-medium">
          <Sparkles className="h-4 w-4 text-primary" />
          Configurar agente
        </span>
        {expanded
          ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {expanded && (
        loading ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-border/40 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando configurações...
          </div>
        ) : (
          <div className="space-y-4">
            {/* Identidade */}
            <AgentSectionCard icon={Bot} title="Identidade" description="Nome e função do agente visíveis nas conversas.">
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
            </AgentSectionCard>

            {/* Personalidade */}
            <AgentSectionCard icon={Sparkles} title="Personalidade" description="Como o agente se comunica com os clientes.">
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
                    <span className="text-xs text-muted-foreground">{AGENT_FORMALITY_LABELS[cfg.formality]}</span>
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
            </AgentSectionCard>

            {/* Objetivo */}
            <AgentSectionCard icon={Target} title="Objetivo principal" description="Define o foco padrão do agente nas conversas deste canal.">
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
            </AgentSectionCard>

            {/* Instruções */}
            <AgentSectionCard icon={FileText} title="Instruções específicas" description="Regras personalizadas para o agente seguir neste canal.">
              <Textarea
                value={cfg.instructions}
                onChange={e => set("instructions", e.target.value)}
                placeholder={
                  "Ex: Não ofereça descontos sem aprovação.\nSempre pergunte o nome do cliente antes de prosseguir."
                }
                rows={5}
                className="resize-none"
              />
            </AgentSectionCard>

            {/* Comportamentos */}
            <AgentSectionCard icon={CheckSquare} title="Comportamentos" description="O que o agente pode fazer automaticamente neste canal.">
              <div>
                <AgentBehaviorRow
                  label="Consultar base de conhecimento"
                  description="O agente busca informações no Conhecimento antes de responder."
                  checked={cfg.behavior_use_knowledge}
                  onChange={v => set("behavior_use_knowledge", v)}
                />
                <AgentBehaviorRow
                  label="Coletar dados do contato"
                  description="O agente solicita nome, telefone e e-mail quando não disponíveis."
                  checked={cfg.behavior_collect_data}
                  onChange={v => set("behavior_collect_data", v)}
                />
                <AgentBehaviorRow
                  label="Criar oportunidade no CRM"
                  description="O agente cria uma oportunidade no funil quando identificar interesse de compra."
                  checked={cfg.behavior_create_opportunity}
                  onChange={v => set("behavior_create_opportunity", v)}
                />
                <AgentBehaviorRow
                  label="Transferir para humano"
                  description="O agente identifica situações que exigem atendimento humano."
                  checked={cfg.behavior_handoff}
                  onChange={v => set("behavior_handoff", v)}
                />
              </div>
            </AgentSectionCard>

            {/* Handoff — só mostrar quando behavior_handoff ativo */}
            {cfg.behavior_handoff && (
              <AgentSectionCard icon={Users} title="Transferência para humano" description="Quando e como o agente deve passar o atendimento para um humano.">
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
              </AgentSectionCard>
            )}

            {/* Fora do horário */}
            <AgentSectionCard icon={Clock} title="Fora do horário" description="Como o agente se comporta quando o estabelecimento está fechado.">
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
            </AgentSectionCard>

            <Button onClick={onSave} disabled={saving} className="w-full gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar configurações do agente
            </Button>
          </div>
        )
      )}
    </div>
  );
}

export function ChatbotCanaisPage() {
  const navigate       = useNavigate();
  const { auth, slug } = useClientAuth();
  const organizationId = auth?.organization_id as string | undefined;
  const clientId       = auth?.id as string | undefined;

  const [conns,   setConns]   = useState<MetaConn[]>([]);
  const [loading, setLoading] = useState(true);
  const [config,  setConfig]  = useState<ChannelConfig>(DEFAULT_CONFIG);
  const [attendance, setAttendance] = useState<AttendanceConfig>(ATTENDANCE_DEFAULTS);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceSaving, setAttendanceSaving] = useState(false);
  const [keywordInput, setKeywordInput] = useState("");

  // ── Configuração do agente por canal (campos de conteúdo) ────────────────
  const [agentConfigs, setAgentConfigs] = useState<Record<AgentUiKey, AgentChannelConfig>>({
    whatsapp:  makeAgentDefault(),
    instagram: makeAgentDefault(),
    facebook:  makeAgentDefault(),
  });
  const [agentLoading, setAgentLoading] = useState(true);
  const [agentSaving, setAgentSaving] = useState<Record<AgentUiKey, boolean>>({
    whatsapp:  false,
    instagram: false,
    facebook:  false,
  });
  const [agentExpanded, setAgentExpanded] = useState<Record<AgentUiKey, boolean>>({
    whatsapp:  false,
    instagram: false,
    facebook:  false,
  });

  const load = useCallback(async () => {
    if (!organizationId) { setLoading(false); return; }
    setLoading(true);
    try {
      const raw = sessionStorage.getItem(`client_auth_v2_${slug}`);
      const clientSession = raw ? JSON.parse(raw) : null;
      const token = clientSession?.session?.access_token ?? ANON_KEY;

      const res = await fetch(`${SUPABASE_URL}/functions/v1/get-meta-connections`, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${token}`,
          "apikey":        ANON_KEY,
        },
        body: JSON.stringify({ organization_id: organizationId, client_id: clientId }),
      });
      const data = await res.json() as { connections?: MetaConn[]; error?: string };
      setConns(data.connections ?? []);
    } catch (e) {
      console.error("[ChatbotCanaisPage] load:", e);
    } finally {
      setLoading(false);
    }
  }, [organizationId, clientId, slug]);

  useEffect(() => { load(); }, [load]);

  // ── Carregar configuração de canais ──────────────────────────────────────

  useEffect(() => {
    if (!clientId) return;
    setConfig(prev => ({ ...prev, configLoading: true }));
    supabase
      .rpc('get_agent_channel_config', { p_client_id: clientId })
      .then(({ data, error }) => {
        if (error || !data || (data as unknown[]).length === 0) return;
        // RPC retorna array de rows; pegamos o primeiro
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) return;
        setConfig(prev => ({
          ...prev,
          botWhatsapp:   row.handles_whatsapp  ?? true,
          botInstagram:  row.handles_instagram ?? true,
          botFacebook:   row.handles_facebook  ?? true,
          humanWhatsapp:  row.auto_assign ?? false,
          humanInstagram: row.auto_assign ?? false,
          humanFacebook:  row.auto_assign ?? false,
        }));
      })
      .finally(() => {
        setConfig(prev => ({ ...prev, configLoading: false }));
      });

    // Carrega custom_flow_enabled por canal + configuração completa do agente
    // via get_agent_channel_configs (JSONB keyed por channel_type)
    setAgentLoading(true);
    supabase
      .rpc('get_agent_channel_configs', { p_client_id: clientId })
      .then(({ data }) => {
        if (!data) return;
        // data é JSONB keyed por channel_type: { whatsapp: {...}, instagram_dm: {...}, ... }
        const d = data as Record<string, Record<string, unknown>>;
        setConfig(prev => ({
          ...prev,
          flowWhatsapp:  Boolean(d?.whatsapp?.custom_flow_enabled),
          flowInstagram: Boolean(d?.instagram_dm?.custom_flow_enabled),
          flowFacebook:  Boolean(d?.facebook_dm?.custom_flow_enabled),
        }));
        setAgentConfigs(prev => {
          const next = { ...prev };
          (["whatsapp", "instagram", "facebook"] as AgentUiKey[]).forEach(uiKey => {
            const remote = d?.[CHANNEL_TYPE_MAP[uiKey]] as Partial<AgentChannelConfig> | undefined;
            if (!remote) return;
            const base = makeAgentDefault();
            next[uiKey] = {
              ...base,
              ...remote,
              // Campos string: coerce null → "" para evitar crash em .trim()
              agent_name:            remote.agent_name            ?? base.agent_name,
              agent_role:            remote.agent_role            ?? "",
              agent_description:     remote.agent_description     ?? "",
              instructions:          remote.instructions          ?? "",
              outside_hours_message: remote.outside_hours_message ?? "",
              handoff_after_mins:
                remote.handoff_after_mins != null ? Number(remote.handoff_after_mins) : "",
              handoff_keywords: remote.handoff_keywords ?? [],
            };
          });
          return next;
        });
      })
      .finally(() => setAgentLoading(false));
  }, [clientId]);

  // ── Carregar configuração de atendimento ────────────────────────────────

  useEffect(() => {
    if (!clientId) return;
    setAttendanceLoading(true);
    supabase
      .rpc('get_client_attendance_config', { p_client_id: clientId })
      .then(({ data, error }) => {
        if (error || !data) return;
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) return;
        setAttendance({
          fallback_assign_after_mins: row.fallback_assign_after_mins ?? 2,
          queue_message: row.queue_message ?? ATTENDANCE_DEFAULTS.queue_message,
          outside_hours_message: row.outside_hours_message ?? ATTENDANCE_DEFAULTS.outside_hours_message,
          handoff_keywords: row.handoff_keywords ?? [],
          human_hours_start: row.human_hours_start ?? '09:00',
          human_hours_end: row.human_hours_end ?? '18:00',
          human_days: row.human_days ?? ATTENDANCE_DEFAULTS.human_days,
          auto_assign: row.auto_assign ?? false,
        });
      })
      .finally(() => setAttendanceLoading(false));
  }, [clientId]);

  // ── Salvar configuração de canal ─────────────────────────────────────────
  const saveChannelConfig = useCallback(
    async (channel: 'whatsapp' | 'instagram' | 'facebook', field: 'bot' | 'human', value: boolean) => {
      if (!clientId || !organizationId) return;

      // Atualização otimista do estado
      const prevConfig = { ...config };
      const updated: ChannelConfig = { ...config, configSaving: true };

      if (channel === 'whatsapp' && field === 'bot')     updated.botWhatsapp    = value;
      if (channel === 'instagram' && field === 'bot')    updated.botInstagram   = value;
      if (channel === 'facebook' && field === 'bot')     updated.botFacebook    = value;
      if (channel === 'whatsapp' && field === 'human')   updated.humanWhatsapp  = value;
      if (channel === 'instagram' && field === 'human')  updated.humanInstagram = value;
      if (channel === 'facebook' && field === 'human')   updated.humanFacebook  = value;

      setConfig(updated);

      try {
        const autoAssign = updated.humanWhatsapp || updated.humanInstagram || updated.humanFacebook;
        const { error } = await supabase.rpc('upsert_agent_channel_config', {
          p_client_id:          clientId,
          p_organization_id:    organizationId,
          p_handles_whatsapp:   updated.botWhatsapp,
          p_handles_instagram:  updated.botInstagram,
          p_handles_facebook:   updated.botFacebook,
          p_auto_assign:        autoAssign,
        });
        if (error) throw error;
      } catch (err) {
        console.error("[ChatbotCanaisPage] saveChannelConfig:", err);
        toast.error("Erro ao salvar configuração do canal.");
        // Reverter estado em caso de erro
        setConfig({ ...prevConfig, configSaving: false });
        return;
      }

      setConfig(prev => ({ ...prev, configSaving: false }));
    },
    [clientId, organizationId, config]
  );

  // ── Helper: monta o payload completo (22 params) do agente por canal ──────
  // Evita duplicar os 17 campos de conteúdo entre saveAgentConfig e saveFlowConfig.
  // Importante: o RPC faz ON CONFLICT DO UPDATE SET <todas as colunas> = <param>,
  // então salvar só alguns campos sobrescreveria os demais com defaults. Por isso
  // tanto o botão "Salvar agente" quanto o toggle de flow enviam a linha inteira.
  const buildAgentPayload = useCallback(
    (
      channel: AgentUiKey,
      pClientId: string,
      pOrganizationId: string,
      isBotEnabled: boolean,
      customFlow: boolean,
    ) => {
      const cfg = agentConfigs[channel];
      return {
        p_client_id:                   pClientId,
        p_organization_id:             pOrganizationId,
        p_channel_type:                CHANNEL_TYPE_MAP[channel],
        p_is_enabled:                  isBotEnabled,
        p_agent_name:                  cfg.agent_name,
        p_agent_role:                  cfg.agent_role,
        p_agent_description:           cfg.agent_description || null,
        p_tone:                        cfg.tone,
        p_formality:                   cfg.formality,
        p_use_emojis:                  cfg.use_emojis,
        p_response_length:             cfg.response_length,
        p_objective:                   cfg.objective,
        p_instructions:                cfg.instructions || null,
        p_behavior_use_knowledge:      cfg.behavior_use_knowledge,
        p_behavior_collect_data:       cfg.behavior_collect_data,
        p_behavior_create_opportunity: cfg.behavior_create_opportunity,
        p_behavior_handoff:            cfg.behavior_handoff,
        p_handoff_keywords:            cfg.handoff_keywords,
        p_handoff_after_mins:          cfg.handoff_after_mins === "" ? null : Number(cfg.handoff_after_mins),
        p_respond_outside_hours:       cfg.respond_outside_hours,
        p_outside_hours_message:       cfg.outside_hours_message || null,
        p_custom_flow_enabled:         customFlow,
      };
    },
    [agentConfigs]
  );

  // ── Salvar configuração completa do agente por canal ─────────────────────
  const saveAgentConfig = useCallback(
    async (channel: AgentUiKey) => {
      if (!clientId || !organizationId) return;
      const isBotEnabled =
        channel === 'whatsapp'  ? config.botWhatsapp  :
        channel === 'instagram' ? config.botInstagram :
                                  config.botFacebook;
      const isFlowEnabled =
        channel === 'whatsapp'  ? config.flowWhatsapp  :
        channel === 'instagram' ? config.flowInstagram :
                                  config.flowFacebook;
      setAgentSaving(prev => ({ ...prev, [channel]: true }));
      try {
        const { error } = await supabase.rpc(
          'upsert_agent_channel_config',
          buildAgentPayload(channel, clientId, organizationId, isBotEnabled, isFlowEnabled),
        );
        if (error) throw error;
        toast.success('Configurações do agente salvas!');
      } catch (err) {
        console.error('[ChatbotCanaisPage] saveAgentConfig:', err);
        toast.error('Erro ao salvar configurações do agente.');
      } finally {
        setAgentSaving(prev => ({ ...prev, [channel]: false }));
      }
    },
    [buildAgentPayload, config, clientId, organizationId]
  );

  // ── Salvar flow personalizado por canal ──────────────────────────────────
  // Upsert completo (22 params): o toggle de flow também reenvia os 17 campos de
  // conteúdo do agente, para não apagar a configuração já salva ao alternar flow.
  const saveFlowConfig = useCallback(
    async (channel: AgentUiKey, value: boolean) => {
      if (!clientId || !organizationId) return;

      // Atualização otimista
      setConfig(prev => ({
        ...prev,
        flowWhatsapp:  channel === 'whatsapp'  ? value : prev.flowWhatsapp,
        flowInstagram: channel === 'instagram' ? value : prev.flowInstagram,
        flowFacebook:  channel === 'facebook'  ? value : prev.flowFacebook,
      }));

      const isBotEnabled =
        channel === 'whatsapp'  ? config.botWhatsapp  :
        channel === 'instagram' ? config.botInstagram :
                                  config.botFacebook;

      try {
        const { error } = await supabase.rpc(
          'upsert_agent_channel_config',
          buildAgentPayload(channel, clientId, organizationId, isBotEnabled, value),
        );
        if (error) throw error;
        toast.success(`Flow personalizado ${value ? 'ativado' : 'desativado'} para ${channel}.`);
      } catch (err) {
        console.error("[ChatbotCanaisPage] saveFlowConfig:", err);
        toast.error("Erro ao salvar configuração de flow.");
        // Reverter
        setConfig(prev => ({
          ...prev,
          flowWhatsapp:  channel === 'whatsapp'  ? !value : prev.flowWhatsapp,
          flowInstagram: channel === 'instagram' ? !value : prev.flowInstagram,
          flowFacebook:  channel === 'facebook'  ? !value : prev.flowFacebook,
        }));
      }
    },
    [buildAgentPayload, config, clientId, organizationId]
  );

  // ── Helpers de atendimento ───────────────────────────────────────────────

  const setAtt = <K extends keyof AttendanceConfig>(key: K, val: AttendanceConfig[K]) =>
    setAttendance(prev => ({ ...prev, [key]: val }));

  const addKeyword = () => {
    const kw = keywordInput.trim().toLowerCase();
    if (!kw || attendance.handoff_keywords.includes(kw)) return;
    setAtt('handoff_keywords', [...attendance.handoff_keywords, kw]);
    setKeywordInput('');
  };

  const removeKeyword = (kw: string) =>
    setAtt('handoff_keywords', attendance.handoff_keywords.filter(k => k !== kw));

  const toggleDay = (day: string) => {
    const days = attendance.human_days.includes(day)
      ? attendance.human_days.filter(d => d !== day)
      : [...attendance.human_days, day];
    setAtt('human_days', days);
  };

  const saveAttendanceConfig = async () => {
    if (!clientId || !organizationId) return;
    if (attendance.human_hours_start && attendance.human_hours_end &&
        attendance.human_hours_start >= attendance.human_hours_end) {
      toast.error('O horário de início deve ser anterior ao horário de fim.');
      return;
    }
    const safeMins = Math.max(1, Math.min(60, attendance.fallback_assign_after_mins || 2));
    setAttendanceSaving(true);
    try {
      const { error } = await supabase.rpc('upsert_client_attendance_config', {
        p_client_id: clientId,
        p_organization_id: organizationId,
        p_whatsapp_bot_active: config.botWhatsapp,
        p_instagram_bot_active: config.botInstagram,
        p_facebook_bot_active: config.botFacebook,
        p_auto_assign: attendance.auto_assign,
        p_fallback_assign_after_mins: safeMins,
        p_queue_message: attendance.queue_message,
        p_outside_hours_message: attendance.outside_hours_message,
        p_human_hours_start: attendance.human_hours_start || null,
        p_human_hours_end: attendance.human_hours_end || null,
        p_human_days: attendance.human_days,
        p_handoff_keywords: attendance.handoff_keywords,
      });
      if (error) throw error;
      toast.success('Configurações de atendimento salvas!');
    } catch (err: unknown) {
      toast.error(`Erro ao salvar: ${(err as Error).message}`);
    } finally {
      setAttendanceSaving(false);
    }
  };

  // ── Channel detection ───────────────────────────────────────────────────
  const waConn = conns.find(c =>
    c.status === "active" &&
    (c.whatsapp_phone_number_id || c.waba_id ||
     c.provider === "whatsapp" || c.provider === "meta_multi")
  ) ?? null;

  const igConn = conns.find(c =>
    c.status === "active" &&
    (c.instagram_account_id ||
     c.provider === "instagram" || c.provider === "meta_multi")
  ) ?? null;

  const fbConn = conns.find(c =>
    c.status === "active" &&
    (c.facebook_page_id ||
     c.provider === "facebook" || c.provider === "meta_multi")
  ) ?? null;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <PageHeader
        title="Canais"
        description="Status das conexões Meta para atendimento e automações."
      />

      {/* Aviso de segurança */}
      <div className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
        <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-emerald-400">Conexão 100% oficial Meta</p>
          <p className="text-xs text-muted-foreground">
            Todos os canais são conectados exclusivamente via APIs oficiais da Meta.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* ── WhatsApp Business ── */}
          <Card className="card-surface">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                    <MessageCircle className="h-5 w-5 text-emerald-500" />
                  </div>
                  <div>
                    <CardTitle className="text-base">WhatsApp Business</CardTitle>
                    <CardDescription className="text-xs mt-0.5">API oficial WhatsApp Business</CardDescription>
                  </div>
                </div>
                {waConn ? (
                  <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/30">
                    Conectado
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-muted-foreground border-border">
                    Não configurado
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {waConn ? (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <p className="text-sm font-medium text-emerald-400">Conexão ativa</p>
                  </div>
                  {waConn.whatsapp_display_phone_number && (
                    <p className="text-xs text-muted-foreground pl-6">
                      {waConn.whatsapp_display_phone_number}
                    </p>
                  )}

                  {/* Toggles Bot IA / Atendimento humano */}
                  <div className="mt-3 border border-border/40 rounded-lg divide-y divide-border/30">
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Bot className="h-4 w-4 text-violet-400" />
                        <div>
                          <p className="text-xs font-medium">Bot IA</p>
                          <p className="text-[10px] text-muted-foreground">Responde automaticamente via IA</p>
                        </div>
                      </div>
                      <Switch
                        checked={config.botWhatsapp}
                        onCheckedChange={(v) => saveChannelConfig('whatsapp', 'bot', v)}
                        disabled={config.configSaving || config.configLoading}
                      />
                    </div>
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-blue-400" />
                        <div>
                          <p className="text-xs font-medium">Atendimento humano</p>
                          <p className="text-[10px] text-muted-foreground">Encaminhar para agentes no C8</p>
                        </div>
                      </div>
                      <Switch
                        checked={config.humanWhatsapp}
                        onCheckedChange={(v) => saveChannelConfig('whatsapp', 'human', v)}
                        disabled={config.configSaving || config.configLoading}
                      />
                    </div>
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <GitBranch className="h-4 w-4 text-violet-300" />
                        <div>
                          <p className="text-xs font-medium">Flow Personalizado</p>
                          <p className="text-[10px] text-muted-foreground">Ativa keyword triggers do flow ativo. Sem match, usa IA padrão.</p>
                        </div>
                      </div>
                      <Switch
                        checked={config.flowWhatsapp}
                        onCheckedChange={(v) => saveFlowConfig('whatsapp', v)}
                        disabled={config.configSaving || config.configLoading}
                      />
                    </div>
                  </div>

                  {/* Avisos condicionais */}
                  {!config.botWhatsapp && !config.humanWhatsapp && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-yellow-500 bg-yellow-500/10 rounded-md px-3 py-2">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Sem automação — mensagens não serão respondidas automaticamente.
                    </div>
                  )}
                  {config.botWhatsapp && config.humanWhatsapp && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-blue-400 bg-blue-500/10 rounded-md px-3 py-2">
                      <Info className="h-3.5 w-3.5 shrink-0" />
                      O bot responde primeiro. Se não resolver, transfere para um agente.
                    </div>
                  )}

                  <div className="pl-0 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => navigate("/mensagens/templates")}
                    >
                      Gerenciar Templates
                    </Button>
                  </div>

                  {/* Configurações do agente (expansível) */}
                  <AgentConfigSection
                    cfg={agentConfigs.whatsapp}
                    onChange={patch => setAgentConfigs(p => ({ ...p, whatsapp: { ...p.whatsapp, ...patch } }))}
                    onSave={() => saveAgentConfig("whatsapp")}
                    saving={agentSaving.whatsapp}
                    loading={agentLoading}
                    expanded={agentExpanded.whatsapp}
                    onToggle={() => setAgentExpanded(p => ({ ...p, whatsapp: !p.whatsapp }))}
                  />
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      A agência configura a conexão no painel administrativo.{" "}
                      <button
                        onClick={() => navigate(`/${slug}/configuracoes/integracoes`)}
                        className="text-primary underline hover:no-underline"
                      >
                        Ver Integrações
                      </button>
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Instagram ── */}
          <Card className="card-surface">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-500/10">
                    <Instagram className="h-5 w-5 text-pink-500" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Instagram</CardTitle>
                    <CardDescription className="text-xs mt-0.5">Conta profissional Instagram</CardDescription>
                  </div>
                </div>
                {igConn ? (
                  <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/30">
                    Conectado
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-muted-foreground border-border">
                    Não configurado
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {igConn ? (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <p className="text-sm font-medium text-emerald-400">Conexão ativa</p>
                  </div>
                  {igConn.instagram_username && (
                    <p className="text-xs text-muted-foreground pl-6">
                      @{igConn.instagram_username}
                    </p>
                  )}

                  {/* Toggles Bot IA / Atendimento humano */}
                  <div className="mt-3 border border-border/40 rounded-lg divide-y divide-border/30">
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Bot className="h-4 w-4 text-violet-400" />
                        <div>
                          <p className="text-xs font-medium">Bot IA</p>
                          <p className="text-[10px] text-muted-foreground">Responde automaticamente via IA</p>
                        </div>
                      </div>
                      <Switch
                        checked={config.botInstagram}
                        onCheckedChange={(v) => saveChannelConfig('instagram', 'bot', v)}
                        disabled={config.configSaving || config.configLoading}
                      />
                    </div>
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-blue-400" />
                        <div>
                          <p className="text-xs font-medium">Atendimento humano</p>
                          <p className="text-[10px] text-muted-foreground">Encaminhar para agentes no C8</p>
                        </div>
                      </div>
                      <Switch
                        checked={config.humanInstagram}
                        onCheckedChange={(v) => saveChannelConfig('instagram', 'human', v)}
                        disabled={config.configSaving || config.configLoading}
                      />
                    </div>
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <GitBranch className="h-4 w-4 text-violet-300" />
                        <div>
                          <p className="text-xs font-medium">Flow Personalizado</p>
                          <p className="text-[10px] text-muted-foreground">Ativa keyword triggers do flow ativo. Sem match, usa IA padrão.</p>
                        </div>
                      </div>
                      <Switch
                        checked={config.flowInstagram}
                        onCheckedChange={(v) => saveFlowConfig('instagram', v)}
                        disabled={config.configSaving || config.configLoading}
                      />
                    </div>
                  </div>

                  {/* Avisos condicionais */}
                  {!config.botInstagram && !config.humanInstagram && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-yellow-500 bg-yellow-500/10 rounded-md px-3 py-2">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Sem automação — mensagens não serão respondidas automaticamente.
                    </div>
                  )}
                  {config.botInstagram && config.humanInstagram && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-blue-400 bg-blue-500/10 rounded-md px-3 py-2">
                      <Info className="h-3.5 w-3.5 shrink-0" />
                      O bot responde primeiro. Se não resolver, transfere para um agente.
                    </div>
                  )}

                  {/* Configurações do agente (expansível) */}
                  <AgentConfigSection
                    cfg={agentConfigs.instagram}
                    onChange={patch => setAgentConfigs(p => ({ ...p, instagram: { ...p.instagram, ...patch } }))}
                    onSave={() => saveAgentConfig("instagram")}
                    saving={agentSaving.instagram}
                    loading={agentLoading}
                    expanded={agentExpanded.instagram}
                    onToggle={() => setAgentExpanded(p => ({ ...p, instagram: !p.instagram }))}
                  />
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      A agência configura a conexão no painel administrativo.{" "}
                      <button
                        onClick={() => navigate(`/${slug}/configuracoes/integracoes`)}
                        className="text-primary underline hover:no-underline"
                      >
                        Ver Integrações
                      </button>
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Facebook Page ── */}
          <Card className="card-surface">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                    <Facebook className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Facebook Page</CardTitle>
                    <CardDescription className="text-xs mt-0.5">Página do Facebook</CardDescription>
                  </div>
                </div>
                {fbConn ? (
                  <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/30">
                    Conectado
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-muted-foreground border-border">
                    Não configurado
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {fbConn ? (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <p className="text-sm font-medium text-emerald-400">Conexão ativa</p>
                  </div>
                  {(fbConn.facebook_page_name || fbConn.facebook_page_id) && (
                    <p className="text-xs text-muted-foreground pl-6">
                      {fbConn.facebook_page_name ?? fbConn.facebook_page_id}
                    </p>
                  )}

                  {/* Toggles Bot IA / Atendimento humano */}
                  <div className="mt-3 border border-border/40 rounded-lg divide-y divide-border/30">
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Bot className="h-4 w-4 text-violet-400" />
                        <div>
                          <p className="text-xs font-medium">Bot IA</p>
                          <p className="text-[10px] text-muted-foreground">Responde automaticamente via IA</p>
                        </div>
                      </div>
                      <Switch
                        checked={config.botFacebook}
                        onCheckedChange={(v) => saveChannelConfig('facebook', 'bot', v)}
                        disabled={config.configSaving || config.configLoading}
                      />
                    </div>
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-blue-400" />
                        <div>
                          <p className="text-xs font-medium">Atendimento humano</p>
                          <p className="text-[10px] text-muted-foreground">Encaminhar para agentes no C8</p>
                        </div>
                      </div>
                      <Switch
                        checked={config.humanFacebook}
                        onCheckedChange={(v) => saveChannelConfig('facebook', 'human', v)}
                        disabled={config.configSaving || config.configLoading}
                      />
                    </div>
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <GitBranch className="h-4 w-4 text-violet-300" />
                        <div>
                          <p className="text-xs font-medium">Flow Personalizado</p>
                          <p className="text-[10px] text-muted-foreground">Ativa keyword triggers do flow ativo. Sem match, usa IA padrão.</p>
                        </div>
                      </div>
                      <Switch
                        checked={config.flowFacebook}
                        onCheckedChange={(v) => saveFlowConfig('facebook', v)}
                        disabled={config.configSaving || config.configLoading}
                      />
                    </div>
                  </div>

                  {/* Avisos condicionais */}
                  {!config.botFacebook && !config.humanFacebook && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-yellow-500 bg-yellow-500/10 rounded-md px-3 py-2">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Sem automação — mensagens não serão respondidas automaticamente.
                    </div>
                  )}
                  {config.botFacebook && config.humanFacebook && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-blue-400 bg-blue-500/10 rounded-md px-3 py-2">
                      <Info className="h-3.5 w-3.5 shrink-0" />
                      O bot responde primeiro. Se não resolver, transfere para um agente.
                    </div>
                  )}

                  {/* Configurações do agente (expansível) */}
                  <AgentConfigSection
                    cfg={agentConfigs.facebook}
                    onChange={patch => setAgentConfigs(p => ({ ...p, facebook: { ...p.facebook, ...patch } }))}
                    onSave={() => saveAgentConfig("facebook")}
                    saving={agentSaving.facebook}
                    loading={agentLoading}
                    expanded={agentExpanded.facebook}
                    onToggle={() => setAgentExpanded(p => ({ ...p, facebook: !p.facebook }))}
                  />
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      A agência configura a conexão no painel administrativo.{" "}
                      <button
                        onClick={() => navigate(`/${slug}/configuracoes/integracoes`)}
                        className="text-primary underline hover:no-underline"
                      >
                        Ver Integrações
                      </button>
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Configurações de Atendimento ── */}
      <Card className="card-surface">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
              <Users className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <CardTitle className="text-base">Configurações de Atendimento</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Fila geral com fallback automático, handoff e horário de atendimento humano.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {attendanceLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando configurações...
            </div>
          ) : (
            <div className="space-y-6">

              {/* Fila geral com fallback automático */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Fila Geral com Fallback Automático</h4>
                <p className="text-[10px] text-slate-400 italic">
                  Conversas novas ficam visíveis para todos os atendentes online. Qualquer um pode assumir manualmente.
                  Se ninguém assumir no tempo configurado, o sistema atribui automaticamente ao atendente online há mais tempo sem conversa (round-robin).
                </p>
                <div className="flex items-center justify-between">
                  <Label htmlFor="auto_assign" className="text-sm font-medium cursor-pointer">Fallback automático ativo</Label>
                  <Switch
                    id="auto_assign"
                    checked={attendance.auto_assign}
                    onCheckedChange={val => setAtt('auto_assign', val)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tempo para auto-atribuição (minutos)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={attendance.fallback_assign_after_mins}
                    onChange={e => setAtt('fallback_assign_after_mins', parseInt(e.target.value) || 2)}
                    className="w-32 px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-slate-900 bg-white dark:text-white dark:bg-slate-950"
                  />
                </div>
              </div>

              {/* Handoff */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Handoff Bot → Humano</h4>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Palavras-chave de handoff
                  </label>
                  <p className="text-[10px] text-slate-400 italic mb-2">
                    Se o cliente digitar qualquer uma dessas palavras, o bot transfere para atendimento humano.
                  </p>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={keywordInput}
                      onChange={e => setKeywordInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
                      placeholder="ex: humano, atendente, falar com alguém"
                      className="flex-1 px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-slate-900 bg-white dark:text-white dark:bg-slate-950"
                    />
                    <Button type="button" variant="outline" size="sm" onClick={addKeyword}>Adicionar</Button>
                  </div>
                  {attendance.handoff_keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {attendance.handoff_keywords.map(kw => (
                        <span key={kw} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                          {kw}
                          <button type="button" onClick={() => removeKeyword(kw)} className="hover:text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Mensagem de espera na fila
                  </label>
                  <textarea
                    value={attendance.queue_message}
                    onChange={e => setAtt('queue_message', e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-slate-900 bg-white dark:text-white dark:bg-slate-950 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Mensagem fora do horário de atendimento
                  </label>
                  <textarea
                    value={attendance.outside_hours_message}
                    onChange={e => setAtt('outside_hours_message', e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-slate-900 bg-white dark:text-white dark:bg-slate-950 resize-none"
                  />
                </div>
              </div>

              {/* Horário de atendimento */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Horário de Atendimento Humano</h4>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleDay(key)}
                      className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                        attendance.human_days.includes(key)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground border-input hover:bg-muted'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Início</label>
                    <input
                      type="time"
                      value={attendance.human_hours_start}
                      onChange={e => setAtt('human_hours_start', e.target.value)}
                      className="px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-slate-900 bg-white dark:text-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Fim</label>
                    <input
                      type="time"
                      value={attendance.human_hours_end}
                      onChange={e => setAtt('human_hours_end', e.target.value)}
                      className="px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-slate-900 bg-white dark:text-white dark:bg-slate-950"
                    />
                  </div>
                </div>
              </div>

              <Button onClick={saveAttendanceConfig} disabled={attendanceSaving} className="w-full">
                {attendanceSaving ? 'Salvando...' : 'Salvar Configurações de Atendimento'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ExternalLink className="h-3.5 w-3.5 shrink-0" />        <a
          href="https://developers.facebook.com/docs/whatsapp/cloud-api"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
        >
          Documentação WhatsApp Business API
        </a>
      </div>
    </div>
  );
}
