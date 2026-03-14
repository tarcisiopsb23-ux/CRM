import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Eye } from "lucide-react";
import { formatBRL, formatPhoneBR } from "@/lib/formatters";
import { ETAPAS_KANBAN, type Lead, type EtapaKanban } from "@/types/database";

interface LeadsListViewProps {
  leads: Lead[];
  onDetalhes: (lead: Lead) => void;
  onEtapaChange: (leadId: string, etapa: EtapaKanban) => void;
}

const getPriorityColor = (p?: string | null) => {
  switch (p) {
    case "urgente": return "bg-red-500 hover:bg-red-600";
    case "alta": return "bg-orange-500 hover:bg-orange-600";
    case "media": return "bg-yellow-500 hover:bg-yellow-600";
    case "baixa": return "bg-green-500 hover:bg-green-600";
    default: return "bg-slate-500 hover:bg-slate-600";
  }
};

export function LeadsListView({ leads, onDetalhes, onEtapaChange }: LeadsListViewProps) {
  const getLifecycleDays = (createdAt: string) => {
    const created = parseISO(createdAt);
    const today = new Date();
    const days = differenceInCalendarDays(today, created) + 1;
    return Math.max(1, days);
  };

  return (
    // container enables scrolling in both directions. the table can grow large
    // horizontally because of many columns, and vertically with many rows.
    <div className="rounded-md border overflow-auto max-h-[70vh]">
      <Table className="min-w-full">
        <TableHeader>
          <TableRow>
            <TableHead>Empresa / Nome</TableHead>
            <TableHead>Contato</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead>Prioridade</TableHead>
            <TableHead>Etapa</TableHead>
            <TableHead>Responsável</TableHead>
            <TableHead>Tempo de Vida</TableHead>
            <TableHead>Criado em</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="h-24 text-center">
                Nenhum lead encontrado.
              </TableCell>
            </TableRow>
          ) : (
            leads.map((lead) => (
              <TableRow 
                key={lead.id} 
                className="hover:bg-muted/50"
              >
                <TableCell className="font-medium">
                  <div>{lead.company || "Sem empresa"}</div>
                  <div className="text-xs text-muted-foreground">{lead.name}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{lead.email || "-"}</div>
                  <div className="text-xs text-muted-foreground">{lead.phone ? formatPhoneBR(lead.phone) : "-"}</div>
                </TableCell>
                <TableCell>{typeof lead.value === "number" ? formatBRL(lead.value) : "-"}</TableCell>
                <TableCell>
                  <Badge className={getPriorityColor(lead.prioridade)}>
                    {lead.prioridade || "média"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Select 
                    value={lead.etapa_kanban || "leads_recebidos"} 
                    onValueChange={(v) => onEtapaChange(lead.id, v as EtapaKanban)}
                  >
                    <SelectTrigger className="h-8 w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ETAPAS_KANBAN.map((etapa) => (
                        <SelectItem key={etapa.id} value={etapa.id}>
                          {etapa.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  {
                    (
                      lead as Lead & {
                        profiles?: { full_name?: string | null } | null;
                      }
                    ).profiles?.full_name || "—"
                  }
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{getLifecycleDays(lead.created_at)} dias</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {format(new Date(lead.created_at), "dd/MM/yyyy", { locale: ptBR })}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => onDetalhes(lead)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
