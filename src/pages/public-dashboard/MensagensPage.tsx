/**
 * MensagensPage — Caixa de Entrada
 *
 * Centro de mensagens em tempo real com clientes finais via WhatsApp e Instagram.
 * Suporta handoff IA → Humano, assignment de conversas e visualização do histórico.
 *
 * Estado atual: placeholder estrutural — será populado na Fase 3 (Conversas)
 * quando as tabelas channel_conversations e channel_messages estiverem disponíveis.
 */

import { MessageSquare, Bot, User, Clock, Search, Filter, Inbox } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "./components/PageHeader";

// ─── Status badges ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  ai_active:         { label: "Agente IA",        className: "bg-violet-500/15 text-violet-400 border-violet-500/20" },
  waiting_human:     { label: "Aguardando",        className: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
  human_active:      { label: "Em atendimento",    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  waiting_customer:  { label: "Aguardando cliente",className: "bg-slate-500/15 text-slate-400 border-slate-500/20" },
  paused:            { label: "Pausado",           className: "bg-slate-500/15 text-slate-400 border-slate-500/20" },
};

// ─── Placeholder de conversa ──────────────────────────────────────────────────

function ConversationPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-16">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <Inbox className="h-8 w-8 text-primary/60" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">Nenhuma conversa selecionada</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Selecione uma conversa na lista ao lado para visualizar o histórico e responder.
        </p>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyInbox() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-16 px-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <MessageSquare className="h-8 w-8 text-primary/60" />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">Caixa de entrada vazia</p>
        <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
          Quando clientes enviarem mensagens pelo WhatsApp ou Instagram, as conversas
          aparecerão aqui em tempo real.
        </p>
      </div>
      <div className="mt-2 rounded-xl border border-dashed border-border p-4 text-left w-full max-w-sm space-y-2">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          Para começar
        </p>
        <div className="space-y-1.5">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[9px] font-bold text-primary">1</span>
            <p className="text-xs text-muted-foreground">Conecte um canal em <strong className="text-foreground/70">Chatbot → Canais</strong></p>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[9px] font-bold text-primary">2</span>
            <p className="text-xs text-muted-foreground">Configure o agente em <strong className="text-foreground/70">Chatbot → Meu Agente</strong></p>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[9px] font-bold text-primary">3</span>
            <p className="text-xs text-muted-foreground">As conversas chegarão aqui automaticamente</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function MensagensPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] gap-0 -mx-4 md:-mx-8 -mt-6 md:-mt-8">

      {/* Header fixo */}
      <div className="px-4 md:px-8 pt-6 md:pt-8 pb-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold text-foreground uppercase tracking-tight">Mensagens</h2>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs text-muted-foreground">
              0 conversas
            </Badge>
          </div>
        </div>
      </div>

      {/* Body — lista + thread */}
      <div className="flex flex-1 min-h-0">

        {/* Lista de conversas */}
        <div className="w-80 shrink-0 border-r border-border flex flex-col min-h-0">

          {/* Filtros */}
          <div className="p-3 border-b border-border space-y-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar conversa..."
                className="pl-8 h-8 text-xs bg-secondary/30"
                disabled
              />
            </div>
            <div className="flex gap-1.5">
              {["Todas", "IA", "Aguardando", "Humano"].map(f => (
                <button
                  key={f}
                  className="text-[10px] px-2 py-1 rounded-md bg-secondary/40 text-muted-foreground hover:bg-secondary/70 transition-colors font-medium"
                  disabled
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Conversas */}
          <div className="flex-1 overflow-y-auto">
            <EmptyInbox />
          </div>
        </div>

        {/* Thread da conversa selecionada */}
        <div className="flex-1 flex flex-col min-h-0">
          <ConversationPlaceholder />
        </div>

        {/* Painel lateral direito — info do contato */}
        <div className="hidden xl:flex w-72 shrink-0 border-l border-border flex-col p-4 gap-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Informações do Contato
          </p>
          <div className="space-y-3">
            {[
              { icon: User,  label: "Nome" },
              { icon: MessageSquare, label: "Canal" },
              { icon: Bot,   label: "Agente" },
              { icon: Clock, label: "Última mensagem" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                <span className="text-xs text-muted-foreground/50">{label}</span>
              </div>
            ))}
          </div>
          <div className="mt-auto">
            <Card className="border-dashed">
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Disponível na <strong>Fase 3</strong> após conexão de canais via
                  Chatbot → Canais.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
