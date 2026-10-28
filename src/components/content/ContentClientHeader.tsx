/**
 * ContentClientHeader
 * Cabeçalho do hub do cliente: breadcrumb, logo, nome, localização,
 * abas de navegação e botão "+ Novo conteúdo".
 */

import { useNavigate } from "react-router-dom";
import { Button }   from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ChevronRight, Plus, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Client } from "@/types/crm";

export type ContentClientTab =
  | "visao-geral"
  | "estrategia"
  | "briefing"
  | "campanhas"
  | "planejamento"
  | "conteudos"
  | "calendario"
  | "aprovacoes"
  | "biblioteca"
  | "entregaveis"
  | "parceiros";

const TABS: { key: ContentClientTab; label: string }[] = [
  { key: "visao-geral",   label: "Visão Geral"   },
  { key: "estrategia",    label: "Estratégia"    },
  { key: "briefing",      label: "Briefing"      },
  { key: "campanhas",     label: "Campanhas"     },
  { key: "planejamento",  label: "Planejamento"  },
  { key: "conteudos",     label: "Conteúdos"     },
  { key: "calendario",    label: "Calendário"    },
  { key: "aprovacoes",    label: "Aprovações"    },
  { key: "biblioteca",    label: "Biblioteca"    },
  { key: "entregaveis",   label: "Entregáveis"   },
  { key: "parceiros",     label: "Parceiros"     },
];

function initials(name: string) {
  return name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
}

interface ContentClientHeaderProps {
  client:         Pick<Client, "id" | "name" | "company" | "favicon_url"> & {
    city?:  string | null;
    state?: string | null;
  };
  activeTab:      ContentClientTab;
  onTabChange:    (tab: ContentClientTab) => void;
  onNewContent:   () => void;
}

export function ContentClientHeader({
  client,
  activeTab,
  onTabChange,
  onNewContent,
}: ContentClientHeaderProps) {
  const navigate = useNavigate();

  const location = [client.city, client.state].filter(Boolean).join(" – ");

  return (
    <div className="space-y-0 -mx-6 -mt-6 mb-0">
      {/* Barra superior: breadcrumb + ações */}
      <div className="flex items-center justify-between px-6 pt-4 pb-3 border-b border-border/60">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-sm">
          <button
            className="text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => navigate("/content")}
          >
            Clientes
          </button>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
          <span className="text-muted-foreground/60 truncate max-w-[120px]">
            {client.company || client.name}
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
          <span className="font-medium text-foreground">Gestão de Conteúdo</span>
        </nav>

        {/* Botão novo */}
        <Button size="sm" onClick={onNewContent}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Novo conteúdo
        </Button>
      </div>

      {/* Linha do cliente */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border/40">
        <Avatar className="h-8 w-8 shrink-0">
          {client.favicon_url ? (
            <img src={client.favicon_url} alt={client.name} className="object-contain" />
          ) : (
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
              {initials(client.company || client.name)}
            </AvatarFallback>
          )}
        </Avatar>
        <div className="min-w-0">
          <h1 className="font-display text-base font-bold leading-tight truncate">
            {client.company || client.name}
          </h1>
          {location && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPin className="h-2.5 w-2.5 shrink-0" />
              {location}
            </p>
          )}
        </div>
      </div>

      {/* Abas */}
      <div className="overflow-x-auto scrollbar-thin">
        <div className="flex items-end gap-0 px-6 min-w-max">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              className={cn(
                "px-3.5 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors",
                activeTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
