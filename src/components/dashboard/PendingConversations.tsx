import { MessageCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

const conversations = [
  { name: "Maria Silva", company: "TechCorp", time: "2 min atrás" },
  { name: "João Santos", company: "AgênciaX", time: "5 min atrás" },
  { name: "Ana Costa", company: "StartupY", time: "12 min atrás" },
  { name: "Pedro Lima", company: "ConsultZ", time: "18 min atrás" },
];

export function PendingConversations() {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg font-semibold text-foreground">Aguardando Atendimento</h3>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs font-bold">
          {conversations.length}
        </span>
      </div>
      <div className="space-y-3">
        {conversations.map((c) => (
          <div key={c.name} className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/50 transition-colors">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent">
              <MessageCircle className="h-4 w-4 text-accent-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
              <p className="text-xs text-muted-foreground">{c.company}</p>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {c.time}
            </div>
          </div>
        ))}
      </div>
      <Button variant="outline" className="w-full mt-3 text-sm">
        Ver todas
      </Button>
    </div>
  );
}
