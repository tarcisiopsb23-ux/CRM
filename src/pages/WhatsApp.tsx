import { useState, useRef, useEffect } from "react";
import {
  MessageCircle, Bot, Users, Search, Send, Clock, ShieldAlert, Sparkles,
  Calendar, FileText, Plus, X, Tag, Phone, Mail, Building, Briefcase, 
  TrendingUp, AlertTriangle, CheckCircle, EyeOff, ArrowRight, UserCheck, 
  FileSignature, DollarSign, Zap, Smile, Meh, Frown, Compass, 
  CheckSquare as CheckIcon, Play, BarChart2, Info
} from "lucide-react";

import { useOmnichannelChat, OmnichannelConversation, ChatMessage, TimelineItem, TimelineEvent, ChannelType, MessageType } from "@/hooks/useOmnichannelChat";
import { useLeadIntelligence } from "@/hooks/useLeadIntelligence";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";

// Recharts for Dashboard Analytics
import {
  AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Legend
} from "recharts";

// Mock RAG Knowledge base
const KNOWLEDGE_BASE = {
  faq: [
    { title: "Prazo de Setup", content: "Nosso prazo padrão de setup técnico de campanhas e automações é de 5 dias úteis a partir da entrega de todos os acessos.", category: "faq" },
    { title: "Horário de Atendimento", content: "Nosso suporte humano funciona de segunda a sexta, das 09:00 às 18:00. Fora desse horário, o Agente de IA assume.", category: "faq" }
  ],
  precos: [
    { title: "Plano Starter", content: "Plano Starter: R$ 2.500/mês. Foco em tráfego pago local, 1 canal de atendimento, relatórios quinzenais.", category: "precos" },
    { title: "Plano Growth", content: "Plano Growth: R$ 3.500/mês. 3 canais de atendimento, tráfego pago + inbound marketing, dashboard em tempo real.", category: "precos" },
    { title: "Plano Scale Enterprise", content: "Plano Scale Enterprise: A partir de R$ 6.500/mês. Omnichannel completo, IA customizada, SDR dedicado, SDR-Copilot.", category: "precos" }
  ],
  cases: [
    { title: "Case de Sucesso: Empresa A", content: "A Empresa A (e-commerce B2B) aumentou seu faturamento em 140% no primeiro trimestre utilizando o CRM integrado ao WhatsApp.", category: "cases" },
    { title: "Case de Sucesso: Clínica Médica B", content: "Redução de 45% nas faltas de consultas após ativação do agente de agendamento automático via Instagram Direct.", category: "cases" }
  ],
  politicas: [
    { title: "Reembolso e Cancelamento", content: "Cancelamento sem multa após o 3º mês de contrato. Reembolso da taxa de setup somente se solicitado em até 7 dias.", category: "politicas" }
  ]
};

// Folders List for Sidebar
const INBOX_FOLDERS = [
  "Minhas Conversas",
  "Não Lidas",
  "Urgentes",
  "Inbox Geral",
  "Finalizadas"
];

// Presets for webhook simulator
const SIMULATOR_PRESETS = [
  {
    label: "Preços (Growth)",
    channel: "whatsapp" as ChannelType,
    name: "Arthur Pendragon",
    phone: "+55 (11) 91111-2222",
    message: "Gostaria de saber qual o preço e o que inclui no plano Growth. Vocês parcelam o setup?"
  },
  {
    label: "Suporte Urgente",
    channel: "whatsapp" as ChannelType,
    name: "Carlos Eduardo",
    phone: "+55 (21) 94444-5555",
    message: "Meu anúncio está com link quebrado! Isso é urgente, estou perdendo vendas!"
  },
  {
    label: "Instagram Inbound",
    channel: "instagram" as ChannelType,
    name: "Beatriz Oliveira",
    phone: "+55 (81) 98888-3333",
    message: "Oi! Vi um post sobre a consultoria de IA de vocês. Qual o prazo de entrega de um projeto médio?"
  },
  {
    label: "Dúvida VIP",
    channel: "whatsapp" as ChannelType,
    name: "Doutora Amanda",
    phone: "+55 (31) 99999-0000",
    message: "Quero agendar uma reunião de briefing para amanhã. Qual link de agendamento posso usar?"
  }
];

export default function WhatsApp() {
  const {
    conversations,
    iaConversations,
    allConversationsCount,
    activeConversation,
    activeTimeline,
    selectedConversationId,
    setSelectedConversationId,
    activeFolder,
    setActiveFolder,
    searchQuery,
    setSearchQuery,
    sendMessage,
    assignAgent,
    transferConversation,
    updateLeadPipeline,
    updateLeadScore,
    addTag,
    removeTag,
    executeConversionAction,
    simulateIncomingMessage,
    closeConversation,
    agents,
    distributionRule,
    setDistributionRule,
    toggleChecklistItem,
    addChecklistItem,
    // Quick Filters
    filterAgent,
    setFilterAgent,
    filterChannel,
    setFilterChannel,
    filterPipeline,
    setFilterPipeline
  } = useOmnichannelChat();

  const { profile } = useAuth();

  // Check if user can see Inbox Geral
  const canSeeInboxGeral = ["owner", "admin", "manager", "supervisor"].includes(profile?.role || "");

  // Filter folders based on role
  const visibleFolders = INBOX_FOLDERS.filter(folder => {
    if (folder === "Inbox Geral") return canSeeInboxGeral;
    return true;
  });

  // Default active folder to "Minhas Conversas"
  useEffect(() => {
    if (activeFolder === "Inbox Geral" && !canSeeInboxGeral) {
      setActiveFolder("Minhas Conversas");
    } else if (!INBOX_FOLDERS.includes(activeFolder)) {
      setActiveFolder("Minhas Conversas");
    }
  }, [activeFolder, canSeeInboxGeral, setActiveFolder]);

  const [activeTab, setActiveTab] = useState<"inbox" | "supervision" | "ia">("inbox");
  const [msgInput, setMsgInput] = useState("");
  // Sempre envia como "regular" — tipos whisper/note removidos para evitar envio acidental ao cliente
  const msgType: MessageType = "regular";
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  // Notas internas por conversa (armazenadas localmente na sessão)
  const [internalNotes, setInternalNotes] = useState<Record<string, { id: string; text: string; createdAt: string }[]>>({});
  const [noteInput, setNoteInput] = useState("");

  // Indicadores automáticos do Lead Intelligence — passa o timeline atual para calcular engajamento
  const intelligence = useLeadIntelligence(activeConversation?.phone, activeTimeline);
  
  // Right details panel overlay drawer toggle (Sheet)
  const [isIntelligenceOpen, setIsIntelligenceOpen] = useState(false);

  const [activeRagTab, setActiveRagTab] = useState<"faq" | "precos" | "cases" | "politicas">("faq");

  // Simulator Form State
  const [simName, setSimName] = useState("");
  const [simPhone, setSimPhone] = useState("");
  const [simChannel, setSimChannel] = useState<ChannelType>("whatsapp");
  const [simMessage, setSimMessage] = useState("");

  // Transfer Modal State
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [transferType, setTransferType] = useState<"user" | "team" | "department" | "ia">("user");
  const [transferTarget, setTransferTarget] = useState("");
  const [transferReason, setTransferReason] = useState("");

  // Quick Checklist Add State
  const [newCheckText, setNewCheckText] = useState<Record<string, string>>({});

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom of chat
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeTimeline, selectedConversationId]);

  const handleSend = () => {
    if (!msgInput.trim()) return;
    sendMessage(msgInput, msgType);
    setMsgInput("");
  };

  const handleApplyPreset = (preset: typeof SIMULATOR_PRESETS[0]) => {
    setSimName(preset.name);
    setSimPhone(preset.phone);
    setSimChannel(preset.channel);
    setSimMessage(preset.message);
  };

  const triggerSimulation = () => {
    if (!simName || !simPhone || !simMessage) {
      toast.error("Por favor, preencha todos os campos do simulador.");
      return;
    }
    simulateIncomingMessage(simChannel, simName, simPhone, simMessage);
    setIsSimulatorOpen(false);
    toast.success(`Mensagem de ${simName} recebida via webhook!`);
  };

  const activeSlas = conversations.filter(c => c.status !== "encerrada" && c.lead_score >= 80).length;
  const avgResolutionTime = 94; // minutes

  const trendData = [
    { date: "06/06", conversations: 12, leads_identified: 5, conversions: 2 },
    { date: "07/06", conversations: 18, leads_identified: 8, conversions: 3 },
    { date: "08/06", conversations: 24, leads_identified: 12, conversions: 5 },
    { date: "09/06", conversations: 32, leads_identified: 15, conversions: 7 },
    { date: "10/06", conversations: 29, leads_identified: 14, conversions: 6 },
    { date: "11/06", conversations: 35, leads_identified: 18, conversions: 9 },
    { date: "12/06", conversations: 42, leads_identified: 22, conversions: 11 }
  ];

  return (
    <div className="flex flex-col h-full -m-6 overflow-hidden">
      
      {/* ── HEADER DA PÁGINA ── */}
      <div className="flex items-center justify-between shrink-0 px-6 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <MessageCircle className="h-6 w-6 text-primary" />
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Conversas</h1>
            <p className="text-sm text-muted-foreground">
              Módulo Omnichannel de atendimento comercial, suporte e automações de IA
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Alternador de abas */}
          <div className="flex items-center bg-muted p-1 rounded-lg border border-border">
            <button
              onClick={() => setActiveTab("inbox")}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-all ${activeTab === "inbox" ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"}`}
            >
              Atendimento
            </button>
            <button
              onClick={() => setActiveTab("supervision")}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-all ${activeTab === "supervision" ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"}`}
            >
              Supervisão
            </button>
            <button
              onClick={() => setActiveTab("ia")}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-all ${activeTab === "ia" ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"}`}
            >
              Conversas IA
            </button>
          </div>

          <Button
            onClick={() => setIsSimulatorOpen(true)}
            size="sm"
            className="gap-2 font-semibold text-xs"
          >
            <Sparkles className="h-4 w-4" />
            Simulador
          </Button>
        </div>
      </div>

      {/* ── CORPO PRINCIPAL ── */}
      {activeTab === "inbox" ? (
        <div className="flex flex-1 mx-6 mb-0 border border-border rounded-t-lg bg-card overflow-hidden shadow-sm relative min-h-0">
          
          {/* 1. SIDEBAR DE CONVERSAS (INBOX) */}
          <aside className="w-80 border-r border-border bg-muted/10 flex flex-col shrink-0">
            
            {/* Campo de Busca & Filtros Rápidos */}
            <div className="p-4 border-b border-border flex flex-col gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar conversa..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9 bg-background border-input text-sm h-9"
                />
              </div>

              {/* Filtros rápidos do CRM */}
              <div className="grid grid-cols-3 gap-1.5">
                <Select value={filterAgent} onValueChange={setFilterAgent}>
                  <SelectTrigger className="bg-background border-input text-xs h-7 px-2">
                    <SelectValue placeholder="Agente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Todos">Agente</SelectItem>
                    <SelectItem value="Carlos">Carlos</SelectItem>
                    <SelectItem value="Ana">Ana</SelectItem>
                    <SelectItem value="Pedro">Pedro</SelectItem>
                    <SelectItem value="Sem Responsável">Sem Responsável</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filterChannel} onValueChange={setFilterChannel}>
                  <SelectTrigger className="bg-background border-input text-xs h-7 px-2">
                    <SelectValue placeholder="Canal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Todos">Canais</SelectItem>
                    <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                    <SelectItem value="Instagram">Instagram</SelectItem>
                    <SelectItem value="Messenger">Messenger</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filterPipeline} onValueChange={setFilterPipeline}>
                  <SelectTrigger className="bg-background border-input text-xs h-7 px-2">
                    <SelectValue placeholder="Funil" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Todos">Funil</SelectItem>
                    <SelectItem value="Vendas Growth">Growth</SelectItem>
                    <SelectItem value="Enterprise">Enterprise</SelectItem>
                    <SelectItem value="Consultoria IA">Consultoria</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Pastas de Filtragem */}
            <div className="px-2 py-2 border-b border-border bg-muted/20 shrink-0 overflow-x-auto">
              <div className="flex gap-1.5 px-2">
                {visibleFolders.map(folder => {
                  const isSelected = activeFolder === folder;
                  return (
                    <button
                      key={folder}
                      onClick={() => setActiveFolder(folder)}
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all whitespace-nowrap ${isSelected ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:text-foreground"}`}
                    >
                      {folder}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Listagem de Conversas */}
            <ScrollArea className="flex-1">
              {conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground gap-2 h-48">
                  <MessageCircle className="h-8 w-8 opacity-25" />
                  <p className="text-xs">Nenhum contato encontrado.</p>
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {conversations.map(conv => {
                    const isSelected = conv.id === selectedConversationId;
                    const chanColor = conv.channel === "whatsapp" ? "text-emerald-600 bg-emerald-500/10 dark:text-emerald-455" : conv.channel === "instagram" ? "text-pink-650 bg-pink-500/10" : "text-blue-600 bg-blue-500/10";
                    const SentimentIcon = conv.sentiment === "positivo" ? Smile : conv.sentiment === "negativo" ? Frown : Meh;
                    const sentimentColor = conv.sentiment === "positivo" ? "text-emerald-500" : conv.sentiment === "negativo" ? "text-red-500" : "text-muted-foreground";

                    return (
                      <div
                        key={conv.id}
                        onClick={() => setSelectedConversationId(conv.id)}
                        className={`p-3.5 cursor-pointer transition-colors flex gap-3 ${isSelected ? "bg-muted border-l-4 border-primary" : "hover:bg-muted/30"}`}
                      >
                        <div className="relative shrink-0">
                          <Avatar className="h-10 w-10 border border-border">
                            <AvatarFallback className="bg-muted text-foreground text-xs font-bold uppercase">
                              {conv.contact_name.substring(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                          <span className={`absolute -bottom-1 -right-1 p-0.5 rounded-full border border-background ${chanColor}`}>
                            <MessageCircle className="h-3.5 w-3.5" />
                          </span>
                        </div>

                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-foreground truncate max-w-[120px]">{conv.contact_name}</span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(conv.last_message_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          
                          <p className="text-xs text-muted-foreground truncate">{conv.last_message}</p>

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <SentimentIcon className={`h-4 w-4 ${sentimentColor}`} />
                              <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 font-bold">
                                Score: {conv.lead_score}
                              </Badge>
                              <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-4 font-bold ${conv.assigned_user === "IA" ? "bg-indigo-500/5 text-indigo-650 dark:text-indigo-400 border-indigo-500/20" : conv.assigned_user ? "bg-muted text-muted-foreground border-border" : "bg-amber-500/10 text-amber-600 border-amber-500/20"}`}>
                                {conv.assigned_user ?? "Fila"}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1">
                              {conv.is_vip && (
                                <Badge className="bg-amber-500/10 text-amber-650 dark:text-amber-400 border border-amber-500/20 text-[9px] h-4 font-bold">
                                  VIP
                                </Badge>
                              )}
                              {conv.unread_count > 0 && (
                                <span className="h-4.5 min-w-[18px] px-1 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
                                  {conv.unread_count}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </aside>

          {/* 2. ÁREA CENTRAL (CHAT & HISTÓRICO DE MENSAGENS) */}
          <main className="flex-1 bg-background flex flex-col min-w-0">
            {activeConversation ? (
              <>
                {/* Chat Header */}
                <div className="px-6 py-3.5 border-b border-border bg-card/45 flex items-center justify-between gap-4 shrink-0">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 border border-border">
                      <AvatarFallback className="bg-muted text-foreground font-bold text-xs">
                        {activeConversation.contact_name.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-bold text-foreground">{activeConversation.contact_name}</h2>
                        {activeConversation.is_vip && (
                          <span className="inline-flex items-center gap-0.5 bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            ★ VIP
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5" /> {activeConversation.phone}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* SLA countdown */}
                    <div className="flex items-center bg-muted border border-border rounded px-2.5 py-1 gap-1 text-xs text-foreground font-medium h-8">
                      <Clock className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span>SLA: {activeConversation.sla_limit_mins}m</span>
                    </div>

                    {/* Quick Transfer */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsTransferOpen(true)}
                      className="text-xs font-semibold h-8"
                    >
                      Transferir
                    </Button>

                    {/* Assign Agent */}
                    <Select
                      value={activeConversation.assigned_user || "Fila"}
                      onValueChange={v => assignAgent(v === "Fila" ? null : v)}
                    >
                      <SelectTrigger className="w-40 bg-background border-input text-xs h-8">
                        <SelectValue placeholder="Responsável" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Fila">Sem Responsável (Fila)</SelectItem>
                        <SelectItem value="Carlos">Carlos (Closer)</SelectItem>
                        <SelectItem value="Ana">Ana (SDR)</SelectItem>
                        <SelectItem value="Pedro">Pedro (Suporte)</SelectItem>
                        <SelectItem value="IA">Agente IA</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Lead Intelligence Overlay Trigger Button */}
                    <Button
                      onClick={() => setIsIntelligenceOpen(true)}
                      size="sm"
                      className="gap-1.5 font-semibold text-xs h-8 bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                      <UserCheck className="h-4 w-4" />
                      Lead Intelligence
                    </Button>

                    {activeConversation.status !== "encerrada" && (
                      <Button
                        size="sm"
                        onClick={closeConversation}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8"
                      >
                        Finalizar
                      </Button>
                    )}
                  </div>
                </div>

                {/* Aviso + toggle de mensagens internas */}

                {/* Alerta de notas internas quando houver notas para esta conversa */}
                {activeConversation && (internalNotes[activeConversation.id] ?? []).length > 0 && (
                  <div
                    className="flex items-center justify-between px-4 py-2 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-300/60 dark:border-yellow-700/40 cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors"
                    onClick={() => setIsIntelligenceOpen(true)}
                  >
                    <div className="flex items-center gap-2 text-[11px] text-yellow-700 dark:text-yellow-400">
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        <strong>{(internalNotes[activeConversation.id] ?? []).length}</strong>{" "}
                        {(internalNotes[activeConversation.id] ?? []).length === 1
                          ? "nota interna salva"
                          : "notas internas salvas"}{" "}
                        para este lead
                      </span>
                    </div>
                    <span className="text-[11px] font-semibold text-yellow-700 dark:text-yellow-400 underline underline-offset-2">
                      Ver notas →
                    </span>
                  </div>
                )}

                {/* Timeline de Mensagens */}
                <ScrollArea className="flex-1 p-6 bg-muted/10" ref={scrollRef}>
                  <div className="space-y-4">
                    {activeTimeline.filter(item => {
                      if (item.type === "event") return true;
                      const msg = item as ChatMessage;
                      // Oculta whisper e nota — não aparecem mais na thread
                      return msg.message_type === "regular";
                    }).map((item, idx) => {
                      if (item.type === "event") {
                        const ev = item as TimelineEvent;
                        return (
                          <div key={ev.id || idx} className="flex justify-center">
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-muted/80 border border-border text-xs text-muted-foreground">
                              <Zap className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                              <span>
                                <strong>[{ev.actor}]</strong> {ev.metadata}
                              </span>
                              <span className="opacity-60">
                                • {new Date(ev.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                          </div>
                        );
                      } else {
                        const msg = item as ChatMessage;
                        const isInbound = msg.direction === "inbound";
                        const isWhisper = msg.message_type === "whisper";
                        const isNote = msg.message_type === "note";

                        let bubbleBg = isInbound ? "bg-muted text-foreground" : "bg-primary text-primary-foreground";
                        let bubbleAlign = isInbound ? "justify-start" : "justify-end";
                        let borderStyle = "border border-border/30";

                        if (isWhisper) {
                          bubbleBg = "bg-amber-500/5 text-amber-900 dark:text-amber-300";
                          borderStyle = "border border-amber-500/20";
                        } else if (isNote) {
                          bubbleBg = "bg-yellow-500/5 text-yellow-900 dark:text-yellow-300";
                          borderStyle = "border border-yellow-550/20";
                        }

                        return (
                          <div key={msg.id || idx} className={`flex ${bubbleAlign}`}>
                            <div className={`max-w-md rounded-lg p-3.5 ${bubbleBg} ${borderStyle} shadow-sm space-y-1`}>
                              <div className="flex items-center justify-between gap-6">
                                <span className={`text-[10px] font-bold uppercase ${isWhisper ? "text-amber-600 dark:text-amber-400" : isNote ? "text-yellow-600 dark:text-yellow-400" : isInbound ? "text-indigo-650 dark:text-indigo-400" : "text-primary-foreground/80"}`}>
                                  {msg.sender}
                                </span>
                                <span className="text-[9px] opacity-40 font-mono">
                                  {new Date(msg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                </span>
                              </div>

                              <p className="text-sm leading-relaxed">{msg.text}</p>

                              {msg.media_url && (
                                <div className="mt-2 p-2 rounded bg-background/50 border border-border flex items-center justify-between gap-4">
                                  <div className="flex items-center gap-2 overflow-hidden">
                                    <FileText className="h-4 w-4 text-indigo-500 shrink-0" />
                                    <span className="text-xs truncate text-foreground">{msg.media_url.split("/").pop()}</span>
                                  </div>
                                  <a
                                    href={msg.media_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                                  >
                                    Baixar
                                  </a>
                                </div>
                              )}

                              {isNote && msg.checklist && (
                                <div className="mt-2 pt-2 border-t border-yellow-500/10 space-y-1.5">
                                  <p className="text-[10px] font-bold uppercase text-yellow-600 dark:text-yellow-400">Sub-tarefas:</p>
                                  {msg.checklist.map((task, taskIdx) => (
                                    <div
                                      key={taskIdx}
                                      onClick={() => toggleChecklistItem(msg.id, taskIdx)}
                                      className="flex items-center gap-2 cursor-pointer hover:bg-yellow-500/5 p-1 rounded"
                                    >
                                      <span className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${task.done ? "bg-yellow-500 border-yellow-400 text-white" : "border-yellow-550/40 text-transparent"}`}>
                                        <CheckIcon className="h-3 w-3 font-bold" />
                                      </span>
                                      <span className={`text-xs ${task.done ? "line-through opacity-50" : ""}`}>{task.text}</span>
                                    </div>
                                  ))}
                                  <div className="flex gap-1.5 pt-1">
                                    <Input
                                      placeholder="Nova sub-tarefa..."
                                      value={newCheckText[msg.id] || ""}
                                      onChange={e => setNewCheckText(prev => ({ ...prev, [msg.id]: e.target.value }))}
                                      className="h-7 text-xs bg-background border-yellow-500/20 text-foreground"
                                      onKeyDown={e => {
                                        if (e.key === "Enter") {
                                          addChecklistItem(msg.id, newCheckText[msg.id]);
                                          setNewCheckText(prev => ({ ...prev, [msg.id]: "" }));
                                        }
                                      }}
                                    />
                                    <Button
                                      size="sm"
                                      onClick={() => {
                                        addChecklistItem(msg.id, newCheckText[msg.id]);
                                        setNewCheckText(prev => ({ ...prev, [msg.id]: "" }));
                                      }}
                                      className="h-7 bg-yellow-550 hover:bg-yellow-600 text-white text-xs px-2 font-bold"
                                    >
                                      Add
                                    </Button>
                                  </div>
                                </div>
                              )}

                              {isWhisper && (
                                <div className="mt-1.5 pt-1.5 border-t border-amber-500/10 flex items-center gap-1 text-[9px] text-amber-600 dark:text-amber-400 opacity-85">
                                  <EyeOff className="h-3 w-3" />
                                  <span>Whisper Mode (Invisível ao cliente)</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }
                    })}
                  </div>
                </ScrollArea>

                {/* AI Suggestions Quick bar — oculto */}
                {/* <div className="px-6 py-2 bg-muted/20 border-t border-border flex flex-wrap gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground flex items-center gap-1 font-semibold"><Sparkles className="h-3.5 w-3.5 text-amber-500" /> Sugestões AI:</span>
                  {[
                    "Olá! Como posso te ajudar?",
                    "Agendei um diagnóstico: calendly.com/briefing",
                    "Aceitamos cartão e emitimos NFSe.",
                    "Vou transferir para o especialista."
                  ].map((sug, idx) => (
                    <button
                      key={idx}
                      onClick={() => setMsgInput(sug)}
                      className="text-xs bg-card hover:bg-muted text-foreground border border-border px-2.5 py-1 rounded transition-all truncate max-w-[200px]"
                    >
                      {sug}
                    </button>
                  ))}
                </div> */}

                {/* Input Editor */}
                <div className="p-4 border-t border-border bg-card/10 flex flex-col gap-2 shrink-0">
                  <div className="flex gap-2.5">
                    <Textarea
                      placeholder="Digite uma mensagem para o cliente..."
                      value={msgInput}
                      onChange={e => setMsgInput(e.target.value)}
                      className="flex-1 bg-background border-input text-sm text-foreground placeholder:text-muted-foreground min-h-[44px] h-11 py-2 focus-visible:ring-slate-300 focus-visible:ring-offset-0 resize-none"
                      onKeyDown={e => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                    />
                    <Button
                      onClick={handleSend}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-11 w-12 flex items-center justify-center shrink-0"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center gap-3">
                <MessageCircle className="h-12 w-12 opacity-20 text-primary animate-pulse" />
                <p className="text-sm">Selecione uma conversa para iniciar o atendimento.</p>
              </div>
            )}
          </main>

        </div>
      ) : activeTab === "ia" ? (
        /* ── PAINEL DE CONVERSAS IA ── */
        <div className="flex flex-1 mx-6 mb-0 border border-border rounded-t-lg bg-card overflow-hidden shadow-sm relative min-h-0">
          {/* Sidebar for IA Conversations */}
          <aside className="w-80 border-r border-border bg-muted/10 flex flex-col shrink-0">
            {/* Campo de Busca & Filtros Rápidos (simplificado para IA) */}
            <div className="p-4 border-b border-border flex flex-col gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar conversa IA..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9 bg-background border-input text-sm h-7"
                />
              </div>
            </div>

            {/* Listagem de Conversas IA */}
            <ScrollArea className="flex-1">
              {iaConversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground gap-2 h-48">
                  <Bot className="h-8 w-8 opacity-25" />
                  <p className="text-xs">Nenhuma conversa com IA encontrada.</p>
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {iaConversations.map(conv => {
                    const isSelected = conv.id === selectedConversationId;
                    const chanColor = conv.channel === "whatsapp" ? "text-emerald-600 bg-emerald-500/10 dark:text-emerald-455" : conv.channel === "instagram" ? "text-pink-650 bg-pink-500/10" : "text-blue-600 bg-blue-500/10";
                    const SentimentIcon = conv.sentiment === "positivo" ? Smile : conv.sentiment === "negativo" ? Frown : Meh;
                    const sentimentColor = conv.sentiment === "positivo" ? "text-emerald-500" : conv.sentiment === "negativo" ? "text-red-500" : "text-muted-foreground";

                    return (
                      <div
                        key={conv.id}
                        onClick={() => setSelectedConversationId(conv.id)}
                        className={`p-3.5 cursor-pointer transition-colors flex gap-3 ${isSelected ? "bg-muted border-l-4 border-primary" : "hover:bg-muted/30"}`}
                      >
                        <div className="relative shrink-0">
                          <Avatar className="h-10 w-10 border border-border">
                            <AvatarFallback className="bg-muted text-foreground text-xs font-bold uppercase">
                              {conv.contact_name.substring(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                          <span className={`absolute -bottom-1 -right-1 p-0.5 rounded-full border border-background ${chanColor}`}>
                            <MessageCircle className="h-3.5 w-3.5" />
                          </span>
                        </div>

                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-foreground truncate max-w-[120px]">{conv.contact_name}</span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(conv.last_message_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          
                          <p className="text-xs text-muted-foreground truncate">{conv.last_message}</p>

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <SentimentIcon className={`h-4 w-4 ${sentimentColor}`} />
                              <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 font-bold">
                                Score: {conv.lead_score}
                              </Badge>
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-bold bg-indigo-500/5 text-indigo-650 dark:text-indigo-400 border-indigo-500/20">
                                IA
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1">
                              {conv.is_vip && (
                                <Badge className="bg-amber-500/10 text-amber-650 dark:text-amber-400 border border-amber-500/20 text-[9px] h-4 font-bold">
                                  VIP
                                </Badge>
                              )}
                              {conv.unread_count > 0 && (
                                <span className="h-4.5 min-w-[18px] px-1 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
                                  {conv.unread_count}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </aside>

          {/* Área Central (Chat & Histórico de Mensagens) for IA */}
          <main className="flex-1 bg-background flex flex-col min-w-0">
            {activeConversation ? (
              <>
                {/* Chat Header */}
                <div className="px-6 py-3.5 border-b border-border bg-card/45 flex items-center justify-between gap-4 shrink-0">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 border border-border">
                      <AvatarFallback className="bg-muted text-foreground font-bold text-xs">
                        {activeConversation.contact_name.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-bold text-foreground">{activeConversation.contact_name}</h2>
                        {activeConversation.is_vip && (
                          <span className="inline-flex items-center gap-0.5 bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            ★ VIP
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5" /> {activeConversation.phone}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Quick Transfer to Human */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsTransferOpen(true)}
                      className="text-xs font-semibold h-8"
                    >
                      Transferir para Humano
                    </Button>
                  </div>
                </div>

                {/* Aviso + toggle de mensagens internas (aba IA) */}

                {/* Alerta de notas internas (aba IA) */}
                {activeConversation && (internalNotes[activeConversation.id] ?? []).length > 0 && (
                  <div
                    className="flex items-center justify-between px-4 py-2 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-300/60 dark:border-yellow-700/40 cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors"
                    onClick={() => setIsIntelligenceOpen(true)}
                  >
                    <div className="flex items-center gap-2 text-[11px] text-yellow-700 dark:text-yellow-400">
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        <strong>{(internalNotes[activeConversation.id] ?? []).length}</strong>{" "}
                        {(internalNotes[activeConversation.id] ?? []).length === 1
                          ? "nota interna salva"
                          : "notas internas salvas"}{" "}
                        para este lead
                      </span>
                    </div>
                    <span className="text-[11px] font-semibold text-yellow-700 dark:text-yellow-400 underline underline-offset-2">
                      Ver notas →
                    </span>
                  </div>
                )}

                {/* Timeline de Mensagens */}
                <ScrollArea className="flex-1 p-6 bg-muted/10" ref={scrollRef}>
                  <div className="space-y-4">
                    {activeTimeline.filter(item => {
                      if (item.type === "event") return true;
                      const msg = item as ChatMessage;
                      return msg.message_type === "regular";
                    }).map((item, idx) => {
                      if (item.type === "event") {
                        const ev = item as TimelineEvent;
                        return (
                          <div key={ev.id || idx} className="flex justify-center">
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-muted/80 border border-border text-xs text-muted-foreground">
                              <Zap className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                              <span>
                                <strong>[{ev.actor}]</strong> {ev.metadata}
                              </span>
                              <span className="opacity-60">
                                • {new Date(ev.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                          </div>
                        );
                      } else {
                        const msg = item as ChatMessage;
                        const isInbound = msg.direction === "inbound";
                        const isWhisper = msg.message_type === "whisper";
                        const isNote = msg.message_type === "note";

                        let bubbleBg = isInbound ? "bg-muted text-foreground" : "bg-primary text-primary-foreground";
                        let bubbleAlign = isInbound ? "justify-start" : "justify-end";
                        let borderStyle = "border border-border/30";

                        if (isWhisper) {
                          bubbleBg = "bg-amber-500/5 text-amber-900 dark:text-amber-300";
                          borderStyle = "border border-amber-500/20";
                        } else if (isNote) {
                          bubbleBg = "bg-yellow-500/5 text-yellow-900 dark:text-yellow-300";
                          borderStyle = "border border-yellow-550/20";
                        }

                        return (
                          <div key={msg.id || idx} className={`flex ${bubbleAlign}`}>
                            <div className={`max-w-md rounded-lg p-3.5 ${bubbleBg} ${borderStyle} shadow-sm space-y-1`}>
                              <div className="flex items-center justify-between gap-6">
                                <span className={`text-[10px] font-bold uppercase ${isWhisper ? "text-amber-600 dark:text-amber-400" : isNote ? "text-yellow-600 dark:text-yellow-400" : isInbound ? "text-indigo-650 dark:text-indigo-400" : "text-primary-foreground/80"}`}>
                                  {msg.sender}
                                </span>
                                <span className="text-[9px] opacity-40 font-mono">
                                  {new Date(msg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                </span>
                              </div>

                              <p className="text-sm leading-relaxed">{msg.text}</p>

                              {msg.media_url && (
                                <div className="mt-2 p-2 rounded bg-background/50 border border-border flex items-center justify-between gap-4">
                                  <div className="flex items-center gap-2 overflow-hidden">
                                    <FileText className="h-4 w-4 text-indigo-500 shrink-0" />
                                    <span className="text-xs truncate text-foreground">{msg.media_url.split("/").pop()}</span>
                                  </div>
                                  <a
                                    href={msg.media_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                                  >
                                    Baixar
                                  </a>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }
                    })}
                  </div>
                </ScrollArea>

                {/* Input Editor — apenas mensagens ao cliente, sem tipos internos */}
                <div className="p-4 border-t border-border bg-card/10 flex flex-col gap-2 shrink-0">
                  <div className="flex gap-2.5">
                    <Textarea
                      placeholder="Digite uma mensagem como IA..."
                      value={msgInput}
                      onChange={e => setMsgInput(e.target.value)}
                      className="flex-1 bg-background border-input text-sm text-foreground placeholder:text-muted-foreground min-h-[44px] h-11 py-2 focus-visible:ring-slate-300 focus-visible:ring-offset-0 resize-none"
                      onKeyDown={e => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                    />
                    <Button
                      onClick={handleSend}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-11 w-12 flex items-center justify-center shrink-0"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center gap-3">
                <Bot className="h-12 w-12 opacity-25 text-indigo-500" />
                <p className="text-sm">Selecione uma conversa com IA para visualizar.</p>
              </div>
            )}
          </main>
        </div>
      ) : (
        /* ── PAINEL DE SUPERVISÃO & METRICAS (ESTILO CRM - METRICS/CHARTS) ── */
        <div className="flex-1 overflow-y-auto space-y-6 bg-background min-h-0 px-6 pb-6">
          
          {/* Row 1 - KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { title: "Conversas Ativas", value: allConversationsCount, sub: "Na fila de atendimento", icon: MessageCircle, color: "text-blue-500", bg: "bg-card border border-border" },
              { title: "Atendimentos IA", value: iaConversations.length, sub: "Respostas automatizadas", icon: Bot, color: "text-indigo-500", bg: "bg-card border border-border" },
              { title: "Filas Ativas (SLA)", value: activeSlas, sub: "Leads com score alto", icon: ShieldAlert, color: "text-amber-500", bg: "bg-card border border-border animate-pulse" },
              { title: "Tempo Resolução", value: `${avgResolutionTime} min`, sub: "Média total no CRM", icon: Clock, color: "text-emerald-500", bg: "bg-card border border-border" }
            ].map((card, idx) => {
              const Icon = card.icon;
              return (
                <Card key={idx} className={card.bg}>
                  <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">{card.title}</CardTitle>
                    <Icon className={`h-4 w-4 ${card.color}`} />
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-foreground">{card.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Operator table (Similar to CRM Lists) */}
            <Card className="lg:col-span-2 border border-border bg-card shadow-sm rounded-xl">
              <CardHeader className="border-b border-border pb-3.5">
                <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Users className="h-4 w-4 text-indigo-500" />
                  Operadores Online & Carga de Conversas
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {agents.map((agent, idx) => {
                    const statusConfig = {
                      online: { label: "Online", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
                      offline: { label: "Offline", color: "bg-muted text-muted-foreground border-border" },
                      ausente: { label: "Ausente", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
                      almoco: { label: "Almoço", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
                      reuniao: { label: "Reunião", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
                      ia: { label: "IA", color: "bg-indigo-500/10 text-indigo-650 dark:text-indigo-400 border-indigo-500/20" }
                    };

                    const cfg = statusConfig[agent.status] || statusConfig.offline;

                    return (
                      <div key={idx} className="p-3.5 flex items-center justify-between gap-6 hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9 border border-border">
                            <AvatarFallback className="bg-muted text-foreground text-xs font-bold">{agent.name.substring(0, 2)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-semibold text-foreground">{agent.name}</p>
                            <p className="text-xs text-muted-foreground">{agent.role}</p>
                          </div>
                        </div>

                        <div>
                          <Badge variant="outline" className={`text-xs uppercase font-bold border px-2 py-0.5 ${cfg.color}`}>
                            {cfg.label}
                          </Badge>
                        </div>

                        <div className="w-36 space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Carga:</span>
                            <span className="font-semibold text-foreground">{agent.conversations_count} ativas</span>
                          </div>
                          <Progress value={(agent.conversations_count / 15) * 100} className="h-1.5 bg-muted" />
                        </div>

                        <div className="text-right">
                          <p className="text-sm font-bold text-emerald-650 dark:text-emerald-400">{agent.closing_rate}% conv.</p>
                          <p className="text-xs text-muted-foreground">Resposta: {agent.avg_response_min}m</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Distribution rules cards */}
            <Card className="border border-border bg-card shadow-sm rounded-xl">
              <CardHeader className="border-b border-border pb-3.5">
                <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Compass className="h-4 w-4 text-indigo-500" />
                  Distribuição Inbound
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                <div className="space-y-2">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground">Regra Ativa no n8n:</p>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { key: "Round Robin", label: "Round Robin", desc: "Ana → Carlos → Pedro → Lucas" },
                      { key: "Least Load", label: "Menor Carga", desc: "Direciona para quem tiver menos conversas" },
                      { key: "Best Conversion", label: "Melhor Conversão", desc: "Prioriza closers com mais vendas" }
                    ].map(rule => {
                      const isActive = distributionRule === rule.key;
                      return (
                        <div
                          key={rule.key}
                          onClick={() => {
                            setDistributionRule(rule.key);
                            toast.success(`Regra de distribuição alterada para: ${rule.label}`);
                          }}
                          className={`p-2.5 rounded-lg border cursor-pointer transition-all ${isActive ? "bg-indigo-500/10 border-indigo-500 text-indigo-650 dark:text-indigo-400" : "bg-background border-border hover:border-muted-foreground"}`}
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-bold">{rule.label}</p>
                            {isActive && <CheckCircle className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{rule.desc}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-3 border-t border-border space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Transbordar para IA</p>
                      <p className="text-xs text-muted-foreground">IA assume se demorar &gt; 5m</p>
                    </div>
                    <Switch checked={true} onCheckedChange={() => {}} />
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>

          {/* Operational chart */}
          <Card className="border border-border bg-card shadow-sm rounded-xl">
            <CardHeader className="pb-3.5 border-b border-border flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold text-foreground">Fluxo de Conversas & Vendas</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">Volume operacional nos últimos 7 dias</CardDescription>
              </div>
              <Badge variant="outline" className="text-muted-foreground border-border text-xs py-0.5">7 Dias</Badge>
            </CardHeader>
            <CardContent className="pt-6">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="colorConversations" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorConversions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.15)" />
                  <XAxis dataKey="date" fontSize={11} tick={{ fill: "currentColor" }} />
                  <YAxis fontSize={11} tick={{ fill: "currentColor" }} />
                  <RechartsTooltip
                    contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 8 }}
                    labelStyle={{ fontWeight: "bold" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                  <Area type="monotone" dataKey="conversations" name="Conversas" stroke="#6366f1" fillOpacity={1} fill="url(#colorConversations)" strokeWidth={1.5} />
                  <Area type="monotone" dataKey="leads_identified" name="Leads" stroke="#3b82f6" fillOpacity={1} fill="url(#colorLeads)" strokeWidth={1.5} />
                  <Area type="monotone" dataKey="conversions" name="Vendas" stroke="#10b981" fillOpacity={1} fill="url(#colorConversions)" strokeWidth={1.5} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

        </div>
      )}

      {/* ── DRAWERS & MODALS ── */}

      {/* 1. LEAD INTELLIGENCE OVERLAY DRAWER (SHEET) */}
      <Sheet open={isIntelligenceOpen} onOpenChange={setIsIntelligenceOpen}>
        <SheetContent className="bg-card border-l border-border text-foreground max-w-md w-full overflow-y-auto">
          <SheetHeader className="pb-4 border-b border-border">
            <SheetTitle className="text-foreground text-sm font-bold flex items-center gap-1.5">
              <UserCheck className="h-4 w-4 text-indigo-500" />
              Lead Intelligence & AI Copilot
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              Histórico do lead, probabilidade de fechamento, score de vendas e copiloto de objeções.
            </SheetDescription>
          </SheetHeader>

          {activeConversation && (
            <div className="py-4 space-y-6">
              
              {/* Profile details */}
              <div className="flex items-center gap-4 p-3 bg-muted/40 border border-border rounded-xl">
                <Avatar className="h-12 w-12 border border-border">
                  <AvatarFallback className="bg-muted text-foreground text-sm font-bold">
                    {activeConversation.contact_name.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-foreground truncate">{activeConversation.contact_name}</h4>
                  {activeConversation.company && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Building className="h-3.5 w-3.5 shrink-0" /> {activeConversation.company}</p>}
                  {activeConversation.job_title && <p className="text-xs text-muted-foreground flex items-center gap-1"><Briefcase className="h-3.5 w-3.5 shrink-0" /> {activeConversation.job_title}</p>}
                </div>
              </div>

              {/* Pipeline details */}
              <div className="space-y-3 p-4 bg-muted/20 border border-border rounded-xl">
                <p className="text-xs uppercase font-bold text-muted-foreground tracking-wider">Funil & Vendas:</p>
                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span>Funil / Pipeline:</span>
                    <span className="font-semibold text-foreground">{activeConversation.pipeline}</span>
                  </div>
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span>Etapa do CRM:</span>
                    <div className="w-48">
                      <Select
                        value={activeConversation.stage}
                        onValueChange={stage => updateLeadPipeline(activeConversation.pipeline, stage)}
                      >
                        <SelectTrigger className="h-8 text-xs bg-background border-input text-foreground">
                          <SelectValue placeholder="Selecione etapa" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Novo">Novo</SelectItem>
                          <SelectItem value="Qualificado">Qualificado</SelectItem>
                          <SelectItem value="Proposta">Proposta</SelectItem>
                          <SelectItem value="Negociação">Negociação</SelectItem>
                          <SelectItem value="Ganho">Ganho (Fechado)</SelectItem>
                          <SelectItem value="Perdido">Perdido</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Score and metrics — detalhado por dimensão */}
              <div className="space-y-3 p-4 bg-muted/20 border border-border rounded-xl">
                <p className="text-xs uppercase font-bold text-muted-foreground tracking-wider">Indicadores & Valores:</p>

                {intelligence.isLoading ? (
                  <p className="text-xs text-muted-foreground animate-pulse">Calculando indicadores…</p>
                ) : (
                  <div className="space-y-3 text-xs text-muted-foreground">

                    {/* ── Score total ── */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-foreground">Lead Score Total</span>
                        <span className={`text-base font-black ${
                          intelligence.leadScore >= 70 ? "text-emerald-600 dark:text-emerald-400" :
                          intelligence.leadScore >= 40 ? "text-amber-600 dark:text-amber-400" :
                          "text-muted-foreground"
                        }`}>
                          {intelligence.leadScore}<span className="text-[10px] font-normal">/100</span>
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${
                            intelligence.leadScore >= 70 ? "bg-emerald-500" :
                            intelligence.leadScore >= 40 ? "bg-amber-500" : "bg-slate-400"
                          }`}
                          style={{ width: `${intelligence.leadScore}%` }}
                        />
                      </div>
                      {/* Decaimento temporal */}
                      {intelligence.scoreBreakdown.decayLabel && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          ⚠ {intelligence.scoreBreakdown.decayLabel}
                        </p>
                      )}
                    </div>

                    {/* ── Dimensões do score ── */}
                    <div className="space-y-2 pt-2 border-t border-border/60">
                      {[
                        {
                          label: "Perfil",
                          color: "bg-blue-500",
                          dim: intelligence.scoreBreakdown.perfil,
                        },
                        {
                          label: "Engajamento",
                          color: "bg-violet-500",
                          dim: intelligence.scoreBreakdown.engajamento,
                        },
                        {
                          label: "Estágio",
                          color: "bg-emerald-500",
                          dim: intelligence.scoreBreakdown.estagio,
                        },
                      ].map(({ label, color, dim }) => (
                        <div key={label} className="space-y-0.5">
                          <div className="flex justify-between items-center">
                            <span className="text-[11px]">{label}</span>
                            <span className="text-[11px] font-semibold text-foreground">
                              {dim.score}/{dim.max}
                            </span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-1">
                            <div
                              className={`h-1 rounded-full transition-all ${color}`}
                              style={{ width: `${(dim.score / dim.max) * 100}%` }}
                            />
                          </div>
                          {dim.reasons.length > 0 && (
                            <div className="space-y-0.5 pl-1">
                              {dim.reasons.map((r, i) => (
                                <p key={i} className="text-[10px] text-muted-foreground">
                                  • {r}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* ── Outros indicadores ── */}
                    <div className="pt-2 space-y-2 border-t border-border/60">
                      <div className="flex justify-between">
                        <span>Origem:</span>
                        <span className="text-foreground font-semibold truncate max-w-[140px] text-right">
                          {intelligence.origin !== "—" ? intelligence.origin : (activeConversation?.origin ?? "—")}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Estágio do Funil:</span>
                        <span className="text-foreground font-semibold">{intelligence.pipelineLabel}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Prob. Fechamento:</span>
                        <span className={`font-semibold ${
                          intelligence.closeProbability >= 75 ? "text-emerald-600 dark:text-emerald-400" :
                          intelligence.closeProbability >= 40 ? "text-amber-600 dark:text-amber-400" :
                          "text-muted-foreground"
                        }`}>
                          {intelligence.closeProbability}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>LTV Estimado:</span>
                        <span className={`font-bold ${
                          intelligence.estimatedLtv > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-muted-foreground"
                        }`}>
                          {intelligence.estimatedLtv > 0
                            ? `R$ ${intelligence.estimatedLtv.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                            : "—"}
                        </span>
                      </div>
                    </div>

                    {/* ── Badges de situação ── */}
                    <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/60">
                      {intelligence.hasContract && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                          ✓ Contrato
                        </span>
                      )}
                      {intelligence.hasApprovedProposal && !intelligence.hasContract && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                          ✓ Proposta Aprovada
                        </span>
                      )}
                      {intelligence.hasProposal && !intelligence.hasApprovedProposal && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          ⏳ Proposta Enviada
                        </span>
                      )}
                      {!intelligence.hasProposal && !intelligence.isLoading && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground">
                          Sem proposta
                        </span>
                      )}
                      {!intelligence.client && !intelligence.isLoading && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground">
                          Lead não encontrado no CRM
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="space-y-2">
                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Ações Comerciais Rápidas:</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      executeConversionAction("opportunity");
                      setIsIntelligenceOpen(false);
                    }}
                    className="h-9 text-xs justify-center gap-1.5 border-border"
                  >
                    <DollarSign className="h-4 w-4 text-emerald-500" /> Criar Negócio
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      executeConversionAction("meeting");
                      setIsIntelligenceOpen(false);
                    }}
                    className="h-9 text-xs justify-center gap-1.5 border-border"
                  >
                    <Calendar className="h-4 w-4 text-blue-500" /> Agendar Call
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      executeConversionAction("proposal");
                      setIsIntelligenceOpen(false);
                    }}
                    className="h-9 text-xs justify-center gap-1.5 border-border"
                  >
                    <FileText className="h-4 w-4 text-amber-500" /> Enviar Proposta
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      executeConversionAction("contract");
                      setIsIntelligenceOpen(false);
                    }}
                    className="h-9 text-xs justify-center gap-1.5 border-border"
                  >
                    <FileSignature className="h-4 w-4 text-indigo-500" /> Emitir Contrato
                  </Button>
                </div>
              </div>

              {/* Notas Internas — visíveis apenas para a equipe, nunca enviadas ao cliente */}
              <div className="space-y-3 pt-4 border-t border-border">
                <p className="text-xs uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-yellow-500" />
                  Notas Internas
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Visíveis apenas para a equipe. Nunca enviadas ao cliente.
                </p>

                {/* Input de nova nota */}
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Adicionar nota interna sobre este lead..."
                    value={noteInput}
                    onChange={e => setNoteInput(e.target.value)}
                    className="flex-1 bg-background border-input text-xs text-foreground placeholder:text-muted-foreground min-h-[60px] py-2 resize-none"
                    onKeyDown={e => {
                      if (e.key === "Enter" && e.ctrlKey) {
                        e.preventDefault();
                        if (!noteInput.trim() || !activeConversation) return;
                        const convId = activeConversation.id;
                        setInternalNotes(prev => ({
                          ...prev,
                          [convId]: [
                            ...(prev[convId] ?? []),
                            {
                              id: Date.now().toString(),
                              text: noteInput.trim(),
                              createdAt: new Date().toISOString(),
                            },
                          ],
                        }));
                        setNoteInput("");
                        toast.success("Nota interna salva.");
                      }
                    }}
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-8 text-xs font-semibold border-yellow-400/40 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/10"
                  onClick={() => {
                    if (!noteInput.trim() || !activeConversation) return;
                    const convId = activeConversation.id;
                    setInternalNotes(prev => ({
                      ...prev,
                      [convId]: [
                        ...(prev[convId] ?? []),
                        {
                          id: Date.now().toString(),
                          text: noteInput.trim(),
                          createdAt: new Date().toISOString(),
                        },
                      ],
                    }));
                    setNoteInput("");
                    toast.success("Nota interna salva.");
                  }}
                >
                  + Salvar nota (Ctrl+Enter)
                </Button>

                {/* Lista de notas */}
                {activeConversation && (internalNotes[activeConversation.id] ?? []).length > 0 && (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {(internalNotes[activeConversation.id] ?? [])
                      .slice()
                      .reverse()
                      .map(note => (
                        <div
                          key={note.id}
                          className="p-2.5 bg-yellow-500/5 border border-yellow-400/20 rounded-lg space-y-1"
                        >
                          <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">{note.text}</p>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(note.createdAt).toLocaleString("pt-BR", {
                                day: "2-digit", month: "2-digit", year: "2-digit",
                                hour: "2-digit", minute: "2-digit",
                              })}
                            </span>
                            <button
                              onClick={() => {
                                const convId = activeConversation.id;
                                setInternalNotes(prev => ({
                                  ...prev,
                                  [convId]: (prev[convId] ?? []).filter(n => n.id !== note.id),
                                }));
                              }}
                              className="text-[10px] text-red-400 hover:text-red-600 font-semibold"
                            >
                              Remover
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
                {activeConversation && (internalNotes[activeConversation.id] ?? []).length === 0 && (
                  <p className="text-[11px] text-muted-foreground text-center py-2 italic">
                    Nenhuma nota interna para esta conversa.
                  </p>
                )}
              </div>

            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* 2. WEBHOOK SIMULATOR */}
      <Sheet open={isSimulatorOpen} onOpenChange={setIsSimulatorOpen}>
        <SheetContent className="bg-card border-l border-border text-foreground max-w-sm w-full">
          <SheetHeader className="pb-3 border-b border-border">
            <SheetTitle className="text-foreground text-sm font-bold flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Simulador de Eventos Meta
            </SheetTitle>
            <SheetDescription className="text-[11px] text-muted-foreground">
              Simule a chegada de webhooks das APIs oficiais da Meta (WhatsApp, Instagram, Messenger).
            </SheetDescription>
          </SheetHeader>

          <div className="py-4 space-y-4">
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase font-bold text-muted-foreground">Templates:</p>
              <div className="grid grid-cols-2 gap-1.5">
                {SIMULATOR_PRESETS.map((preset, idx) => (
                  <Button
                    key={idx}
                    variant="outline"
                    onClick={() => handleApplyPreset(preset)}
                    className="h-8 text-[10px] bg-background border-border text-foreground px-2 py-0.5 justify-start text-left truncate block w-full"
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-3 pt-3 border-t border-border">
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Nome:</label>
                <Input
                  value={simName}
                  onChange={e => setSimName(e.target.value)}
                  placeholder="Arthur Pendragon"
                  className="bg-background border-input text-xs h-8"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Telefone:</label>
                <Input
                  value={simPhone}
                  onChange={e => setSimPhone(e.target.value)}
                  placeholder="+55 (11) 91111-2222"
                  className="bg-background border-input text-xs h-8"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Canal:</label>
                <Select value={simChannel} onValueChange={v => setSimChannel(v as ChannelType)}>
                  <SelectTrigger className="bg-background border-input text-xs text-foreground h-8">
                    <SelectValue placeholder="Selecione canal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp Cloud API</SelectItem>
                    <SelectItem value="instagram">Instagram Direct</SelectItem>
                    <SelectItem value="messenger">Facebook Messenger</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Mensagem:</label>
                <Textarea
                  value={simMessage}
                  onChange={e => setSimMessage(e.target.value)}
                  placeholder="Mensagem..."
                  className="bg-background border-input text-xs h-16 resize-none py-1.5"
                />
              </div>
            </div>

            <Button
              onClick={triggerSimulation}
              className="w-full bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-xs py-4 rounded"
            >
              Disparar Webhook
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* 3. TRANSFER MODAL */}
      <Sheet open={isTransferOpen} onOpenChange={setIsTransferOpen}>
        <SheetContent className="bg-card border-l border-border text-foreground max-w-sm w-full">
          <SheetHeader className="pb-3 border-b border-border">
            <SheetTitle className="text-foreground text-sm font-bold flex items-center gap-1.5">
              <ArrowRight className="h-4 w-4 text-indigo-500" />
              Transferir Conversa
            </SheetTitle>
          </SheetHeader>

          <div className="py-4 space-y-4">
            
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-muted-foreground">Destino:</label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { key: "user", label: "Operador" },
                  { key: "team", label: "Equipe" },
                  { key: "department", label: "Departamento" }
                ].map(type => {
                  const isSelected = transferType === type.key;
                  return (
                    <button
                      key={type.key}
                      onClick={() => {
                        setTransferType(type.key as any);
                        setTransferTarget("");
                      }}
                      className={`text-xs font-semibold py-1.5 rounded border transition-all ${isSelected ? "bg-indigo-600 text-white border-indigo-500 shadow-sm" : "bg-background border-border text-muted-foreground"}`}
                    >
                      {type.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {transferType !== "ia" && (
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Escolha o Destinatário:</label>
                <Select value={transferTarget} onValueChange={setTransferTarget}>
                  <SelectTrigger className="bg-background border-input text-xs text-foreground h-8">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {transferType === "user" ? (
                      <>
                        <SelectItem value="Carlos">Carlos (Closer)</SelectItem>
                        <SelectItem value="Ana">Ana (SDR)</SelectItem>
                        <SelectItem value="Pedro">Pedro (Suporte)</SelectItem>
                      </>
                    ) : transferType === "team" ? (
                      <>
                        <SelectItem value="Comercial SDR">Comercial SDR</SelectItem>
                        <SelectItem value="Comercial Closer">Comercial Closer</SelectItem>
                        <SelectItem value="Suporte Técnico">Suporte Técnico</SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="Vendas">Vendas / Comercial</SelectItem>
                        <SelectItem value="Financeiro">Financeiro / Cobrança</SelectItem>
                        <SelectItem value="Atendimento">Suporte Geral</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Motivo:</label>
              <Textarea
                placeholder="Qual o motivo?"
                value={transferReason}
                onChange={e => setTransferReason(e.target.value)}
                className="bg-background border-input text-xs h-16 resize-none py-1.5"
              />
            </div>

            <Button
              onClick={() => {
                if (transferType !== "ia" && !transferTarget) {
                  toast.error("Por favor, selecione o destinatário.");
                  return;
                }
                transferConversation(transferType, transferType === "ia" ? "IA" : transferTarget, transferReason || "Sem motivo");
                setIsTransferOpen(false);
                setTransferReason("");
                toast.success("Conversa transferida com sucesso!");
              }}
              className="w-full bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-xs h-9 rounded"
            >
              Confirmar
            </Button>
          </div>
        </SheetContent>
      </Sheet>

    </div>
  );
}
