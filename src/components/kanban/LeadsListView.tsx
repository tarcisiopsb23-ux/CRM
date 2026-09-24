import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Eye, Pencil, Trash2, Flame, ExternalLink } from "lucide-react";
import { formatBRL, formatPhoneBR } from "@/lib/formatters";
import { ETAPAS_KANBAN, type Lead, type EtapaKanban, type LeadWithResponsavel } from "@/types/database";
import { cn } from "@/lib/utils";
import { LeadStatusBadge } from "@/components/kanban/LeadStatusBadge";

interface LeadsListViewProps {
  leads: LeadWithResponsavel[];
  onDetalhes: (lead: Lead) => void;
  onEdit: (lead: Lead) => void;
  onDelete: (id: string) => void;
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

export function LeadsListView({ leads, onDetalhes, onEdit, onDelete, onEtapaChange }: LeadsListViewProps) {
  // Cache breaker: 2026-03-16 06:10

  const formatDateSafe = (dateStr?: string | null) => {
    if (!dateStr) return "-";
    try {
      const date = parseISO(dateStr);
      if (isNaN(date.getTime())) return "-";
      return format(date, "dd/MM/yyyy");
    } catch (e) {
      return "-";
    }
  };

  const getLifecycleDays = (createdAt: string) => {
    if (!createdAt) return 0;
    try {
      const created = parseISO(createdAt);
      if (isNaN(created.getTime())) return 0;
      const today = new Date();
      const days = differenceInCalendarDays(today, created) + 1;
      return Math.max(1, days);
    } catch (e) {
      return 0;
    }
  };

  const renderTemperature = (temp: number | null | undefined) => {
    const t = typeof temp === "number" ? temp : 0;
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3].map((i) => (
          <Flame
            key={i}
            className={cn(
              "h-3 w-3",
              i <= t ? "text-orange-500 fill-orange-500" : "text-muted-foreground/30"
            )}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="relative rounded-md border bg-background flex flex-col h-[calc(100vh-250px)] min-h-[400px]">
      <div className="overflow-auto flex-1 scrollbar-thin scrollbar-thumb-muted-foreground/20 hover:scrollbar-thumb-muted-foreground/40">
        <Table className="min-w-[4000px] border-separate border-spacing-0">
          <TableHeader className="sticky top-0 z-30 bg-background shadow-sm">
            <TableRow className="bg-background hover:bg-background">
              <TableHead className="sticky left-0 z-40 bg-background border-r w-[250px] shadow-[2px_0_4px_rgba(0,0,0,0.05)]">Empresa / Nome</TableHead>
              <TableHead className="w-[200px]">Contato</TableHead>
              <TableHead className="w-[150px]">Valor</TableHead>
              <TableHead className="w-[120px]">Prioridade</TableHead>
              <TableHead className="w-[200px]">Etapa</TableHead>
              <TableHead className="w-[150px]">Responsável</TableHead>
              <TableHead className="w-[120px]">Tempo de Vida</TableHead>
              <TableHead className="w-[120px]">Criado em</TableHead>
              <TableHead className="w-[150px]">CPF/CNPJ</TableHead>
              <TableHead className="w-[150px]">Nicho</TableHead>
              <TableHead className="w-[150px]">Cidade</TableHead>
              <TableHead className="w-[150px]">Origem</TableHead>
              <TableHead className="w-[300px]">Observações</TableHead>
              <TableHead className="w-[120px]">Primeiro Contato</TableHead>
              <TableHead className="w-[120px]">Último Contato</TableHead>
              <TableHead className="w-[150px]">Produto/Serviço</TableHead>
              <TableHead className="w-[150px]">Origem Contato</TableHead>
              <TableHead className="w-[100px]">Decisor</TableHead>
              <TableHead className="w-[150px]">Nome Decisor</TableHead>
              <TableHead className="w-[150px]">Telefone Decisor</TableHead>
              <TableHead className="w-[200px]">GBP URL</TableHead>
              <TableHead className="w-[200px]">Instagram</TableHead>
              <TableHead className="w-[200px]">Website</TableHead>
              <TableHead className="w-[150px]">Status GMN</TableHead>
              <TableHead className="w-[150px]">Google Ads</TableHead>
              <TableHead className="w-[150px]">Meta Ads</TableHead>
              <TableHead className="w-[150px]">Social Media</TableHead>
              <TableHead className="w-[200px]">Motivo Perda</TableHead>
              <TableHead className="w-[100px]">Cadência</TableHead>
              <TableHead className="w-[100px]">Temperatura</TableHead>
              <TableHead className="sticky right-0 z-40 bg-background border-l w-[150px] text-center shadow-[-4px_0_4px_rgba(0,0,0,0.05)]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="bg-background">
            {leads.length === 0 ? (
              <TableRow className="bg-background">
                <TableCell colSpan={31} className="h-24 text-center bg-background">
                  Nenhum lead encontrado.
                </TableCell>
              </TableRow>
            ) : (
              leads.map((lead) => (
                <TableRow 
                  key={lead.id} 
                  className="hover:bg-muted group transition-colors bg-background"
                >
                  <TableCell className="sticky left-0 z-20 bg-background border-r font-medium group-hover:bg-muted shadow-[2px_0_4px_rgba(0,0,0,0.05)]">
                    <div className="truncate w-[230px]" title={lead.company || "Sem empresa"}>
                      {lead.company || "Sem empresa"}
                    </div>
                    <div className="text-xs text-muted-foreground truncate w-[230px]" title={lead.name}>
                      {lead.name}
                    </div>
                  </TableCell>
                  <TableCell className="bg-background group-hover:bg-muted">
                    <div className="text-sm truncate w-[180px]" title={lead.email || "-"}>{lead.email || "-"}</div>
                    <div className="text-xs text-muted-foreground">{lead.phone ? formatPhoneBR(lead.phone) : "-"}</div>
                  </TableCell>
                  <TableCell className="font-semibold bg-background group-hover:bg-muted">{typeof lead.value === "number" ? formatBRL(lead.value) : "-"}</TableCell>
                  <TableCell className="bg-background group-hover:bg-muted">
                    <Badge className={cn("text-[10px] px-1.5 py-0 h-5", getPriorityColor(lead.prioridade))}>
                      {lead.prioridade || "média"}
                    </Badge>
                  </TableCell>
                  <TableCell className="bg-background group-hover:bg-muted">
                    <Select 
                      value={lead.etapa_kanban || "leads_rece_recebidos"} 
                      onValueChange={(v) => onEtapaChange(lead.id, v as EtapaKanban)}
                    >
                      <SelectTrigger className="h-7 text-xs w-[180px] bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ETAPAS_KANBAN.map((etapa) => (
                          <SelectItem key={etapa.id} value={etapa.id} className="text-xs">
                            {etapa.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="bg-background group-hover:bg-muted">
                    <div className="truncate w-[130px]" title={lead.responsavel?.full_name || "—"}>
                      {lead.responsavel?.full_name || "—"}
                    </div>
                  </TableCell>
                  <TableCell className="bg-background group-hover:bg-muted">
                    <Badge variant="outline" className="text-[10px] h-5 bg-background">{getLifecycleDays(lead.created_at)} dias</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs bg-background group-hover:bg-muted">
                    {formatDateSafe(lead.created_at)}
                  </TableCell>
                  <TableCell className="text-xs bg-background group-hover:bg-muted">{lead.cpf_cnpj || "-"}</TableCell>
                  <TableCell className="text-xs truncate w-[130px] bg-background group-hover:bg-muted" title={lead.nicho || "-"}>{lead.nicho || "-"}</TableCell>
                  <TableCell className="text-xs truncate w-[130px] bg-background group-hover:bg-muted" title={(lead.metadata as { cidade?: string })?.cidade || "-"}>{(lead.metadata as { cidade?: string })?.cidade || "-"}</TableCell>
                  <TableCell className="text-xs truncate w-[130px] bg-background group-hover:bg-muted" title={lead.source || "-"}>{lead.source || "-"}</TableCell>
                  <TableCell className="text-xs truncate w-[280px] bg-background group-hover:bg-muted" title={lead.notes || "-"}>{lead.notes || "-"}</TableCell>
                  <TableCell className="text-xs bg-background group-hover:bg-muted">{formatDateSafe(lead.first_contact_date)}</TableCell>
                  <TableCell className="text-xs bg-background group-hover:bg-muted">{formatDateSafe(lead.last_contact_date)}</TableCell>
                  <TableCell className="text-xs capitalize bg-background group-hover:bg-muted">
                    {lead.product_service?.replace(/_/g, " ") || "-"}
                  </TableCell>
                  <TableCell className="text-xs capitalize bg-background group-hover:bg-muted">{lead.contact_origin?.replace("_", " ") || "-"}</TableCell>
                  <TableCell className="text-xs bg-background group-hover:bg-muted">{lead.decision_maker ? "Sim" : "Não"}</TableCell>
                  <TableCell className="text-xs truncate w-[130px] bg-background group-hover:bg-muted" title={lead.decision_maker_name || "-"}>{lead.decision_maker_name || "-"}</TableCell>
                  <TableCell className="text-xs bg-background group-hover:bg-muted">{lead.decision_maker_phone ? formatPhoneBR(lead.decision_maker_phone) : "-"}</TableCell>
                  <TableCell className="text-xs bg-background group-hover:bg-muted">
                    {lead.gbp_url ? (
                      <a href={lead.gbp_url} target="_blank" rel="noopener noreferrer" className="text-primary flex items-center gap-1 hover:underline">
                        Abrir <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : "-"}
                  </TableCell>
                  <TableCell className="text-xs bg-background group-hover:bg-muted">
                    {lead.instagram_url ? (
                      <a href={lead.instagram_url} target="_blank" rel="noopener noreferrer" className="text-primary flex items-center gap-1 hover:underline">
                        Abrir <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : "-"}
                  </TableCell>
                  <TableCell className="text-xs bg-background group-hover:bg-muted">
                    {lead.website_url ? (
                      <a href={lead.website_url} target="_blank" rel="noopener noreferrer" className="text-primary flex items-center gap-1 hover:underline">
                        Abrir <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : "-"}
                  </TableCell>
                  <TableCell className="bg-background group-hover:bg-muted"><LeadStatusBadge field="gmn" value={lead.gmn_status} /></TableCell>
                  <TableCell className="bg-background group-hover:bg-muted"><LeadStatusBadge field="ads" value={lead.google_ads_level} /></TableCell>
                  <TableCell className="bg-background group-hover:bg-muted"><LeadStatusBadge field="ads" value={lead.meta_ads_level} /></TableCell>
                  <TableCell className="bg-background group-hover:bg-muted"><LeadStatusBadge field="social" value={lead.social_media_status} /></TableCell>
                  <TableCell className="text-xs truncate w-[180px] bg-background group-hover:bg-muted" title={lead.lost_reason || "-"}>{lead.lost_reason || "-"}</TableCell>
                  <TableCell className="text-xs bg-background group-hover:bg-muted">{lead.cadence || "-"}</TableCell>
                  <TableCell className="bg-background group-hover:bg-muted">{renderTemperature(lead.temperature)}</TableCell>
                  <TableCell className="sticky right-0 z-20 bg-background border-l group-hover:bg-muted shadow-[-4px_0_4px_rgba(0,0,0,0.05)]">
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7 bg-background hover:bg-muted" onClick={() => onDetalhes(lead)} title="Visualizar">
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600 bg-background hover:bg-muted" onClick={() => onEdit(lead)} title="Alterar">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600 bg-background hover:bg-muted" onClick={() => onDelete(lead.id)} title="Excluir">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      
      {/* Horizontal scroll indicator hint */}
      <div className="bg-muted/30 px-4 py-1 text-[10px] text-muted-foreground border-t flex justify-between items-center">
        <span>Use a barra de rolagem horizontal para ver todos os dados</span>
        <span>Total de {leads.length} leads</span>
      </div>
    </div>
  );
}






