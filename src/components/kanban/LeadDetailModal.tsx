import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Lead } from "./KanbanCard";
import { Building2, Mail, MapPin, Phone, Calendar, DollarSign, User, Tag, FileText } from "lucide-react";

interface Props {
  lead: Lead | null;
  onClose: () => void;
}

export function LeadDetailModal({ lead, onClose }: Props) {
  if (!lead) return null;

  const fields = [
    { icon: Calendar, label: "Criado em", value: lead.createdAt },
    { icon: Building2, label: "Empresa", value: lead.company },
    { icon: Tag, label: "Nicho", value: lead.niche },
    { icon: MapPin, label: "Cidade", value: lead.city },
    { icon: Mail, label: "Email", value: lead.email },
    { icon: Phone, label: "Telefone", value: lead.phone },
    { icon: FileText, label: "Origem", value: lead.origin },
    { icon: DollarSign, label: "Receita", value: lead.revenue },
    { icon: User, label: "Responsável", value: lead.responsible },
  ];

  return (
    <Dialog open={!!lead} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            {lead.company}
            <Badge variant="outline" className="text-xs">
              {lead.stage === "closed" ? "Cliente" : "Prospect"}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 mt-2">
          {fields.map((f) => (
            <div key={f.label} className="flex items-start gap-2">
              <f.icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">{f.label}</p>
                <p className="text-sm font-medium text-foreground">{f.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3">
          <p className="text-xs text-muted-foreground mb-1">Prioridade</p>
          <Badge
            className={
              lead.priority === "alta"
                ? "bg-destructive/10 text-destructive border-destructive/20"
                : lead.priority === "média"
                ? "bg-warning/10 text-warning border-warning/20"
                : ""
            }
            variant="outline"
          >
            {lead.priority}
          </Badge>
        </div>

        {lead.stage === "closed" && (
          <Button className="w-full mt-4 gradient-primary text-primary-foreground border-0">
            Criar Cliente a partir deste Lead
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
