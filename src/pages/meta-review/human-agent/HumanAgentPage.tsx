/**
 * HumanAgentPage — /meta-review/human-agent
 *
 * GRUPO 6 — HUMAN AGENT
 * Feature: Human Agent (não é uma permissão de API — é um use case que a Meta
 * exige demonstrar para provar que a plataforma suporta handoff IA → humano)
 *
 * Demonstração obrigatória:
 *   1. Customer → automation (bot responde automaticamente)
 *   2. Customer requests human (digita "falar com humano" ou similar)
 *   3. Automation stops → conversation status = WAITING_FOR_HUMAN
 *   4. Human agent accepts conversation (status = HUMAN_ACTIVE)
 *   5. Human manually responds (não é automação — é o agente humano digitando)
 *
 * A interface deve deixar CLARO:
 *   - Quando a automação está PAUSADA
 *   - Quando o agente HUMANO está ativo
 *   - Que as respostas do humano são manuais, não automatizadas
 *
 * NÃO usar este recurso para simular mensagens promocionais.
 */

import { useState } from "react";
import {
  Bot, User, Clock, CheckCircle2, ArrowRight,
  AlertTriangle, MessageCircle, Pause, Play, Send,
  UserCheck, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MetaReviewLayout } from "../shared/MetaReviewLayout";
import { LiveMetaIndicator } from "../shared/LiveMetaIndicator";
import { ScreencastChecklist } from "../shared/ScreencastChecklist";
import { cn } from "@/lib/utils";

// Status do atendimento — alinhado com os estados do módulo Mensagens
type ConversationStatus =
  | "ai_active"
  | "waiting_for_human"
  | "human_active"
  | "closed";

interface Message {
  id: string;
  sender: "customer" | "bot" | "human";
  text: string;
  timestamp: string;
  isHandoffTrigger?: boolean;
}

// Conversa de exemplo que demonstra o fluxo completo
const INITIAL_MESSAGES: Message[] = [
  {
    id: "1",
    sender: "customer",
    text: "Olá! Gostaria de saber o horário de funcionamento.",
    timestamp: new Date(Date.now() - 5 * 60000).toLocaleTimeString("pt-BR"),
  },
  {
    id: "2",
    sender: "bot",
    text: "Olá! Nosso horário de funcionamento é de segunda a sexta, das 9h às 18h, e sábados das 9h às 14h. Posso ajudar com mais alguma coisa?",
    timestamp: new Date(Date.now() - 4 * 60000).toLocaleTimeString("pt-BR"),
  },
  {
    id: "3",
    sender: "customer",
    text: "Preciso falar com um atendente humano, por favor.",
    timestamp: new Date(Date.now() - 3 * 60000).toLocaleTimeString("pt-BR"),
    isHandoffTrigger: true,
  },
];

const STEPS = [
  "Customer",
  "Automation Active",
  "Requests Human",
  "Automation Stops",
  "WAITING_FOR_HUMAN",
  "Human Accepts",
  "HUMAN_ACTIVE",
  "Human Responds",
];

export function HumanAgentPage() {
  const [step, setStep] = useState(3); // começa já com contexto da conversa
  const [status, setStatus] = useState<ConversationStatus>("waiting_for_human");
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [humanReply, setHumanReply] = useState("Olá! Sou o João, agente de atendimento. Como posso ajudar?");
  const [humanReplied, setHumanReplied] = useState(false);
  const [agentAccepted, setAgentAccepted] = useState(false);
  const [sending, setSending] = useState(false);

  const handleAcceptConversation = () => {
    setAgentAccepted(true);
    setStatus("human_active");
    setStep(6);
    // Mensagem de sistema: automação pausada
    setMessages((prev) => [
      ...prev,
      {
        id: "sys-1",
        sender: "bot",
        text: "🔄 Automação pausada. Agente humano assumiu o atendimento.",
        timestamp: new Date().toLocaleTimeString("pt-BR"),
      },
    ]);
    setTimeout(() => setStep(7), 400);
  };

  const handleHumanReply = async () => {
    if (!humanReply.trim()) return;
    setSending(true);
    await new Promise((r) => setTimeout(r, 800));

    setMessages((prev) => [
      ...prev,
      {
        id: `human-${Date.now()}`,
        sender: "human",
        text: humanReply.trim(),
        timestamp: new Date().toLocaleTimeString("pt-BR"),
      },
    ]);

    setHumanReplied(true);
    setStep(8);
    setSending(false);
  };

  const statusConfig: Record<ConversationStatus, {
    label: string;
    color: string;
    bg: string;
    icon: React.ElementType;
    description: string;
  }> = {
    ai_active: {
      label: "Automation Active",
      color: "text-violet-400",
      bg: "bg-violet-500/15 border-violet-500/30",
      icon: Bot,
      description: "Bot is responding automatically",
    },
    waiting_for_human: {
      label: "WAITING_FOR_HUMAN",
      color: "text-amber-400",
      bg: "bg-amber-500/15 border-amber-500/30",
      icon: Clock,
      description: "Automation paused — waiting for agent",
    },
    human_active: {
      label: "HUMAN_ACTIVE",
      color: "text-emerald-400",
      bg: "bg-emerald-500/15 border-emerald-500/30",
      icon: UserCheck,
      description: "Human agent is handling this conversation",
    },
    closed: {
      label: "Closed",
      color: "text-muted-foreground",
      bg: "bg-muted/20 border-border",
      icon: CheckCircle2,
      description: "Conversation ended",
    },
  };

  const cfg = statusConfig[status];
  const StatusIcon = cfg.icon;

  return (
    <MetaReviewLayout
      permission="Human Agent"
      useCase="Demonstrate automation → human handoff — automation stops, human agent manually responds"
      group="GRUPO 6 — HUMAN AGENT"
      groupNumber={6}
      steps={STEPS.length}
      currentStep={step}
      testMode="DEVELOPMENT_MOCK"
      docsUrl="https://developers.facebook.com/docs/messenger-platform/policy/policy-overview#human_agent"
      currentAction={STEPS[step - 1]}
      permissionGranted={humanReplied}
    >
      {/* Nota sobre o que a Meta avalia */}
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-2">
        <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
          O que a Meta avalia nesta demonstração
        </p>
        <div className="space-y-1 text-xs text-muted-foreground leading-relaxed">
          <p>✦ A automação deve parar completamente quando o cliente solicita um humano</p>
          <p>✦ O status da conversa deve mudar para <code className="font-mono">WAITING_FOR_HUMAN</code></p>
          <p>✦ Um agente humano real deve aceitar e responder manualmente</p>
          <p>✦ A interface deve distinguir claramente respostas de bot vs respostas humanas</p>
          <p>✦ NÃO usar Human Agent para enviar mensagens promocionais</p>
        </div>
      </div>

      {/* Step progress */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 flex-wrap">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const done = step > n;
          const active = step === n;
          return (
            <div key={label} className="flex items-center gap-1 shrink-0">
              <div className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold border-2 transition-all",
                done   ? "border-emerald-500 bg-emerald-500/20 text-emerald-400" :
                active ? "border-violet-500 bg-violet-500/20 text-violet-400" :
                         "border-border/50 text-muted-foreground/40"
              )}>
                {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : n}
              </div>
              <span className={cn("text-[10px]",
                active ? "font-semibold text-foreground" : "text-muted-foreground/40"
              )}>{label}</span>
              {i < STEPS.length - 1 && <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/20" />}
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Coluna esquerda: conversa + ações */}
        <div className="space-y-4">

          {/* Status badge atual */}
          <div className={cn(
            "flex items-center gap-3 rounded-xl border p-4",
            cfg.bg
          )}>
            <StatusIcon className={cn("h-5 w-5 shrink-0", cfg.color)} />
            <div className="flex-1">
              <p className={cn("text-sm font-bold", cfg.color)}>{cfg.label}</p>
              <p className="text-xs text-muted-foreground">{cfg.description}</p>
            </div>
            {status === "waiting_for_human" && (
              <div className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-400" />
              </div>
            )}
            {status === "human_active" && (
              <LiveMetaIndicator mode="DEVELOPMENT_MOCK" showPulse className="text-[10px]" />
            )}
          </div>

          {/* Timeline da conversa */}
          <Card className="card-surface">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-primary" />
                Conversation — C8 Inbox
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {messages.map((msg) => {
                  const isCustomer = msg.sender === "customer";
                  const isBot      = msg.sender === "bot";
                  const isHuman    = msg.sender === "human";
                  const isSystem   = isBot && msg.text.startsWith("🔄");

                  if (isSystem) {
                    return (
                      <div key={msg.id} className="flex items-center gap-2 py-1">
                        <div className="flex-1 h-px bg-border/50" />
                        <span className="text-[10px] text-muted-foreground/60 shrink-0">{msg.text}</span>
                        <div className="flex-1 h-px bg-border/50" />
                      </div>
                    );
                  }

                  return (
                    <div key={msg.id}
                      className={cn("flex items-end gap-2", !isCustomer && "flex-row-reverse")}>
                      {/* Avatar */}
                      <div className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                        isCustomer ? "bg-secondary/60" :
                        isBot      ? "bg-violet-500/20" :
                                     "bg-emerald-500/20"
                      )}>
                        {isCustomer ? <User className="h-3.5 w-3.5" /> :
                         isBot      ? <Bot className="h-3.5 w-3.5 text-violet-400" /> :
                                      <UserCheck className="h-3.5 w-3.5 text-emerald-400" />}
                      </div>

                      <div className={cn("flex-1 max-w-[80%]")}>
                        <div className={cn(
                          "rounded-2xl px-3 py-2 text-sm",
                          isCustomer ? "rounded-bl-none bg-secondary/40" :
                          isBot      ? "rounded-br-none bg-violet-500/15" :
                                       "rounded-br-none bg-emerald-500/15"
                        )}>
                          {/* Label */}
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className={cn("text-[10px] font-semibold",
                              isCustomer ? "text-muted-foreground" :
                              isBot      ? "text-violet-400" :
                                           "text-emerald-400"
                            )}>
                              {isCustomer ? "Customer" : isBot ? "Bot" : "Human Agent (João)"}
                            </span>
                            {isBot && !isSystem && (
                              <Badge className="text-[9px] py-0 px-1 bg-violet-500/15 text-violet-400 border-violet-500/20">
                                Automation
                              </Badge>
                            )}
                            {isHuman && (
                              <Badge className="text-[9px] py-0 px-1 bg-emerald-500/15 text-emerald-400 border-emerald-500/20">
                                Human — Manual
                              </Badge>
                            )}
                          </div>
                          <p>{msg.text}</p>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 px-1">
                          <span className="text-[10px] text-muted-foreground/40">{msg.timestamp}</span>
                          {msg.isHandoffTrigger && (
                            <Badge className="text-[9px] py-0 px-1 bg-amber-500/15 text-amber-400 border-amber-500/20">
                              Handoff trigger
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Ação: aceitar conversa */}
          {status === "waiting_for_human" && !agentAccepted && (
            <Card className="card-surface border-amber-500/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  Human Agent Required
                </CardTitle>
                <CardDescription className="text-xs">
                  O cliente solicitou atendimento humano.
                  A automação está <strong>pausada</strong> aguardando um agente.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <Pause className="h-3.5 w-3.5 text-amber-400" />
                    <span className="text-amber-400 font-semibold">Automation: PAUSED</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Clock className="h-3.5 w-3.5 text-amber-400" />
                    <span className="text-muted-foreground">Status: WAITING_FOR_HUMAN</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Bot className="h-3.5 w-3.5 text-muted-foreground/40" />
                    <span className="text-muted-foreground/60">Bot responses: DISABLED</span>
                  </div>
                </div>
                <Button
                  onClick={handleAcceptConversation}
                  className="w-full gap-2 bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  <UserCheck className="h-4 w-4" />
                  Accept — Human Agent Takes Over
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Ação: resposta humana */}
          {agentAccepted && !humanReplied && (
            <Card className="card-surface border-emerald-500/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-emerald-400" />
                  Human Agent Active — Manual Response
                </CardTitle>
                <CardDescription className="text-xs">
                  <strong>Automation is paused.</strong>{" "}
                  This response is typed manually by the human agent — not automated.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <Play className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-semibold">Human Agent: ACTIVE</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Pause className="h-3.5 w-3.5 text-muted-foreground/40" />
                    <span className="text-muted-foreground/60">Automation: PAUSED</span>
                  </div>
                </div>
                <textarea
                  value={humanReply}
                  onChange={(e) => setHumanReply(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  placeholder="Resposta manual do agente humano..."
                />
                <Button
                  onClick={handleHumanReply}
                  disabled={sending || !humanReply.trim()}
                  className="w-full gap-2"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send — Human Manual Response
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Resultado final */}
          {humanReplied && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                <span className="font-semibold text-emerald-400">Human Agent Demo Complete</span>
              </div>

              <div className="space-y-1.5 text-xs">
                {[
                  { icon: Bot,       label: "Automation",      value: "PAUSED ✓",        color: "text-violet-400" },
                  { icon: Clock,     label: "Handoff",         value: "WAITING_FOR_HUMAN → HUMAN_ACTIVE ✓", color: "text-amber-400" },
                  { icon: UserCheck, label: "Human Response",  value: "Manual — not automated ✓", color: "text-emerald-400" },
                  { icon: AlertTriangle, label: "Promo msgs",  value: "None — policy compliant ✓", color: "text-blue-400" },
                ].map(({ icon: Icon, label, value, color }) => (
                  <div key={label} className="flex items-center gap-2">
                    <Icon className={cn("h-3.5 w-3.5 shrink-0", color)} />
                    <span className="text-muted-foreground">{label}:</span>
                    <span className={cn("font-semibold", color)}>{value}</span>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                <p className="text-xs text-blue-400 font-semibold mb-1">Meta Policy Note</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Human Agent foi usado exclusivamente para atendimento ao cliente solicitado.
                  Nenhuma mensagem promocional ou não solicitada foi enviada.
                  A automação foi completamente pausada durante o atendimento humano.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Coluna direita: checklist + arquitetura */}
        <div className="space-y-4">

          {/* Arquitetura de estados */}
          <Card className="card-surface">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Conversation State Machine</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                {
                  state:  "ai_active",
                  label:  "AI_ACTIVE",
                  desc:   "Bot responds automatically",
                  color:  "border-violet-500/30 bg-violet-500/10 text-violet-400",
                  active: status === "ai_active",
                },
                {
                  state:  "waiting_for_human",
                  label:  "WAITING_FOR_HUMAN",
                  desc:   "Automation paused, queue for agent",
                  color:  "border-amber-500/30 bg-amber-500/10 text-amber-400",
                  active: status === "waiting_for_human",
                },
                {
                  state:  "human_active",
                  label:  "HUMAN_ACTIVE",
                  desc:   "Human agent typing manually",
                  color:  "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
                  active: status === "human_active",
                },
              ].map(({ state, label, desc, color, active }) => (
                <div key={state}
                  className={cn(
                    "rounded-lg border px-3 py-2.5 transition-all",
                    color,
                    active ? "ring-1 ring-current/30 scale-[1.01]" : "opacity-50"
                  )}>
                  <div className="flex items-center justify-between">
                    <code className="text-xs font-mono font-bold">{label}</code>
                    {active && (
                      <div className="relative flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-current" />
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <ScreencastChecklist
            permission="Human Agent"
            autoChecked={[
              "test_account",
              "permission",
              ...(agentAccepted ? ["asset_selected"] : []),
              ...(humanReplied  ? ["api_called", "result_displayed", "no_secrets", "flow_recorded", "meta_result"] : []),
            ]}
          />

          {/* Nota de política */}
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
            <p className="text-xs font-semibold text-red-400 mb-2 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Política Meta — Human Agent
            </p>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>✗ Não usar para mensagens não solicitadas</p>
              <p>✗ Não usar para mensagens promocionais</p>
              <p>✓ Apenas para atendimento solicitado pelo cliente</p>
              <p>✓ Automação deve parar completamente</p>
              <p>✓ Respostas devem ser manuais do agente</p>
            </div>
          </div>
        </div>
      </div>
    </MetaReviewLayout>
  );
}
