/**
 * ChatbotConhecimentoPage — Chatbot → Conhecimento
 *
 * Base de conhecimento estruturada do agente, organizada em tabs por tipo.
 * Cada tipo é uma tabela separada — reduz custo de tokens vs RAG puro.
 *
 * Tabs:
 *   • Avisos          — client_ai_notices   (substituiu grupo "Conteúdo IA")
 *   • Eventos         — client_ai_events
 *   • Promoções       — client_ai_promotions
 *   • Sugestões       — client_ai_suggestions
 *   • FAQ             — client_knowledge_faqs     (Fase 4)
 *   • Políticas       — client_knowledge_policies (Fase 4)
 *   • Serviços        — client_knowledge_services (Fase 4)
 *   • Horários        — client_knowledge_schedules(Fase 4)
 *   • Documentos RAG  — client_knowledge_docs     (Fase 4)
 *
 * Tabs atuais (Avisos, Eventos, Promoções, Sugestões) reutilizam os
 * componentes existentes sem qualquer alteração de lógica.
 *
 * Tabs futuras (Fase 4) exibem placeholder estrutural até implementação.
 */

import { useState } from "react";
import {
  BellRing, CalendarDays, Tag, UtensilsCrossed,
  HelpCircle, ScrollText, Package, Clock, FileText, Info,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

// ── Páginas existentes importadas diretamente ──────────────────────────────────
import { AvisosPage }    from "./AvisosPage";
import { EventosPage }   from "./EventosPage";
import { PromocoesPage } from "./PromocoesPage";
import { SugestoesPage } from "./SugestoesPage";

// ─── Tipos ─────────────────────────────────────────────────────────────────────

interface Tab {
  id: string;
  label: string;
  icon: React.ElementType;
  phase4?: boolean;
}

const TABS: Tab[] = [
  { id: "avisos",    label: "Avisos",      icon: BellRing },
  { id: "eventos",   label: "Eventos",     icon: CalendarDays },
  { id: "promocoes", label: "Promoções",   icon: Tag },
  { id: "sugestoes", label: "Sugestões",   icon: UtensilsCrossed },
  { id: "faq",       label: "FAQ",         icon: HelpCircle,   phase4: true },
  { id: "politicas", label: "Políticas",   icon: ScrollText,   phase4: true },
  { id: "servicos",  label: "Serviços",    icon: Package,      phase4: true },
  { id: "horarios",  label: "Horários",    icon: Clock,        phase4: true },
  { id: "docs",      label: "Documentos",  icon: FileText,     phase4: true },
];

// ─── Placeholder para tabs da Fase 4 ──────────────────────────────────────────

function Phase4Placeholder({ label, description }: { label: string; description: string }) {
  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="space-y-1">
        <h3 className="text-lg font-bold text-foreground">{label}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Card className="border-dashed card-surface">
        <CardContent className="p-8 flex flex-col items-center gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Info className="h-7 w-7 text-primary/60" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground/80">Disponível na Fase 4</p>
            <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
              Esta seção estará disponível quando o motor do agente IA (LLM + function calling)
              for implementado. As tabelas de banco de dados já estão planejadas.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Conteúdo de cada tab ──────────────────────────────────────────────────────

function TabContent({ tab }: { tab: string }) {
  switch (tab) {
    case "avisos":    return <AvisosPage />;
    case "eventos":   return <EventosPage />;
    case "promocoes": return <PromocoesPage />;
    case "sugestoes": return <SugestoesPage />;
    case "faq":
      return (
        <Phase4Placeholder
          label="Perguntas Frequentes (FAQ)"
          description="Cadastre perguntas e respostas para que o agente responda dúvidas comuns com precisão."
        />
      );
    case "politicas":
      return (
        <Phase4Placeholder
          label="Políticas e Regras"
          description="Políticas de cancelamento, entrega, uso e regras do negócio que o agente deve seguir e comunicar."
        />
      );
    case "servicos":
      return (
        <Phase4Placeholder
          label="Serviços e Preços"
          description="Catálogo de serviços com descrição, preço e duração — consultado pelo agente em tempo real."
        />
      );
    case "horarios":
      return (
        <Phase4Placeholder
          label="Horários de Funcionamento"
          description="Configure os horários de atendimento por dia da semana para que o agente informe corretamente."
        />
      );
    case "docs":
      return (
        <Phase4Placeholder
          label="Documentos (RAG)"
          description="Documentos longos como manuais, contratos e materiais institucionais indexados semanticamente."
        />
      );
    default:
      return null;
  }
}

// ─── Página principal ──────────────────────────────────────────────────────────

export function ChatbotConhecimentoPage() {
  const [activeTab, setActiveTab] = useState("avisos");
  const active = TABS.find(t => t.id === activeTab)!;

  return (
    <div className="space-y-0">

      {/* Header com título e tabs */}
      <div className="space-y-4 pb-6">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-foreground uppercase tracking-tight">
            Conhecimento
          </h2>
          <p className="text-sm text-muted-foreground">
            Informações que o agente consulta para responder com precisão.
            Cada tipo é uma tabela separada, reduzindo custo de tokens.
          </p>
        </div>

        {/* Tabs scrollável */}
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide border-b border-border/50">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  "flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-md whitespace-nowrap transition-colors border-b-2 -mb-[1px]",
                  isActive
                    ? "border-primary text-foreground bg-primary/5"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/40",
                ].join(" ")}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {tab.label}
                {tab.phase4 && (
                  <Badge
                    variant="outline"
                    className="text-[9px] px-1 py-0 h-3.5 border-border/60 text-muted-foreground/60 leading-none font-normal ml-0.5"
                  >
                    F4
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Conteúdo da tab ativa */}
      <div className="min-h-[400px]">
        <TabContent tab={active.id} />
      </div>
    </div>
  );
}
