import { useState, useMemo } from "react";
import { useOrganization } from "@/hooks/useOrganization";
import { useAdminAuditLogs } from "@/hooks/useAuditLogs";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, History, Filter, Download, FileText, Table as TableIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

const ACTION_LABELS: Record<string, string> = {
  INSERT: "Inclusão",
  UPDATE: "Alteração",
  DELETE: "Exclusão",
};

// Campos ignorados na descrição (técnicos/sem valor semântico)
const IGNORED_FIELDS = new Set([
  "id", "organization_id", "created_at", "updated_at", "metadata",
  "lead_id", "client_id", "supplier_id", "record_id", "changed_by",
]);

// Campos monetários
const CURRENCY_FIELDS = new Set(["value", "revenue", "salary", "target_value", "current_value"]);

// Mapa de nomes de campo → label legível
const FIELD_LABELS: Record<string, string> = {
  name: "Nome", email: "E-mail", phone: "Telefone", niche: "Nicho",
  origin: "Origem", address: "Endereço", company: "Empresa", document: "Documento",
  status: "Status", contract_status: "Status do contrato",
  contract_start: "Início do contrato", contract_end: "Fim do contrato",
  value: "Valor", due_date: "Vencimento", paid_at: "Data de pagamento",
  description: "Descrição", category: "Categoria", platform: "Plataforma",
  title: "Título", start_at: "Início", end_at: "Fim", type: "Tipo",
  full_name: "Nome completo", role: "Perfil", job_title: "Cargo",
  department: "Departamento", salary: "Salário", hired_at: "Admissão",
  target_value: "Meta", current_value: "Valor atual",
  period_start: "Início período", period_end: "Fim período",
  responsible_id: "Responsável", priority: "Prioridade",
  etapa_kanban: "Etapa", assigned_to: "Atribuído a", prioridade: "Prioridade",
  notes: "Observações", portfolio_team_id: "Carteira",
};

// Mapa de valores conhecidos → texto legível
const VALUE_LABELS: Record<string, Record<string, string>> = {
  status: { pago: "Pago", pendente: "Pendente", atrasado: "Atrasado", cancelado: "Cancelado", ativo: "Ativo" },
  contract_status: { ativo: "Ativo", cancelado: "Cancelado", suspenso: "Suspenso", encerrado: "Encerrado" },
  etapa_kanban: {
    leads_recebidos: "Leads Recebidos", qualificados: "Qualificados",
    contato_realizado: "Contato Realizado", reuniao_agendada: "Reunião Agendada", emissao_contrato: "Negociações",
    efetivados: "Efetivados", desqualificado: "Desqualificado",
  },
  role: { admin: "Administrador", manager: "Gestor", member: "Membro", viewer: "Visualizador" },
  prioridade: { alta: "Alta", media: "Média", baixa: "Baixa", urgente: "Urgente" },
  priority: { high: "Alta", medium: "Média", low: "Baixa" },
  type: { meeting: "Reunião", task: "Tarefa", call: "Ligação", other: "Outro" },
};

function fmtVal(field: string, val: unknown): string {
  if (val === null || val === undefined || val === "") return "vazio";
  const str = String(val);
  if (VALUE_LABELS[field]?.[str]) return VALUE_LABELS[field][str];
  if (CURRENCY_FIELDS.has(field)) {
    const n = Number(val);
    if (!isNaN(n)) return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    try { return new Date(str).toLocaleDateString("pt-BR"); } catch { /* noop */ }
  }
  return str.length > 40 ? str.slice(0, 40) + "…" : str;
}

function recordLabel(rec: Record<string, unknown>): string {
  return String(rec.name ?? rec.title ?? rec.full_name ?? rec.email ?? rec.description ?? "").trim();
}

function getRecordName(changes: unknown): string {
  if (!changes || typeof changes !== "object") return "-";
  const c = changes as { new?: Record<string, unknown>; old?: Record<string, unknown> };
  const rec = c.new ?? c.old ?? (changes as Record<string, unknown>);
  return recordLabel(rec) || "-";
}

function formatChangeSummary(action: string, changes: unknown): string {
  if (!changes || typeof changes !== "object") return "-";

  const c = changes as { new?: Record<string, unknown>; old?: Record<string, unknown> };

  if (action === "INSERT") {
    const rec = c.new ?? (changes as Record<string, unknown>);
    const label = recordLabel(rec);
    return label ? `Criou "${label}"` : "Novo registro criado";
  }

  if (action === "DELETE") {
    const rec = c.old ?? (changes as Record<string, unknown>);
    const label = recordLabel(rec);
    return label ? `Removeu "${label}"` : "Registro excluído";
  }

  // UPDATE — comparar old vs new, ignorar campos técnicos
  if (c.new && c.old) {
    const recLabel = recordLabel(c.old);
    const changed = Object.keys(c.new)
      .filter((k) => !IGNORED_FIELDS.has(k) && JSON.stringify(c.new![k]) !== JSON.stringify(c.old![k]));

    if (changed.length === 0) return recLabel ? `Atualizou "${recLabel}"` : "Atualização sem mudanças visíveis";

    const parts = changed.slice(0, 2).map((k) => {
      const fieldLabel = FIELD_LABELS[k] ?? k;
      const oldVal = fmtVal(k, c.old![k]);
      const newVal = fmtVal(k, c.new![k]);
      return `${fieldLabel}: "${oldVal}" → "${newVal}"`;
    });

    const suffix = changed.length > 2 ? ` (+${changed.length - 2} campo${changed.length - 2 > 1 ? "s" : ""})` : "";
    const context = recLabel ? ` em "${recLabel}"` : "";
    return parts.join(" | ") + suffix + context;
  }

  return "-";
}

const TABLE_LABELS: Record<string, string> = {
  clients: "Clientes",
  suppliers: "Fornecedores",
  payments: "Financeiro",
  supplier_expenses: "Financeiro",
  leads: "CRM",
  profiles: "Equipe & Colaboradores",
  contracts: "Clientes",
  goals: "Metas",
  teams: "Equipe & Colaboradores",
  projects: "Projetos",
  tasks: "Projetos",
  events: "Agenda",
  invitation_tokens: "Configurações",
  whatsapp_conversations: "CRM",
  registration_codes: "Configurações",
  rep_p_punches: "Controle de Ponto",
  rep_p_inconsistencies: "Controle de Ponto",
  rep_p_overtime_authorizations: "Controle de Ponto",
};

export default function AuditPage() {
  const organizationId = useOrganization();
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterResponsible, setFilterResponsible] = useState("");
  const [filterTable, setFilterTable] = useState("");
  const [filterAction, setFilterAction] = useState("");

  const { data: logs = [], isLoading, error } = useAdminAuditLogs(organizationId, 500);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (filterDateFrom && log.changed_at) {
        if (new Date(log.changed_at) < new Date(filterDateFrom + "T00:00:00")) return false;
      }
      if (filterDateTo && log.changed_at) {
        if (new Date(log.changed_at) > new Date(filterDateTo + "T23:59:59")) return false;
      }
      if (filterResponsible && !(log.changed_by_name ?? "").toLowerCase().includes(filterResponsible.toLowerCase())) {
        return false;
      }
      if (filterTable && (log.table_name ?? "") !== filterTable) return false;
      if (filterAction && (log.action ?? "") !== filterAction) return false;
      return true;
    });
  }, [logs, filterDateFrom, filterDateTo, filterResponsible, filterTable, filterAction]);

  const uniqueTables = useMemo(() => [...new Set(logs.map((l) => l.table_name).filter(Boolean))] as string[], [logs]);

  const exportToCSV = () => {
    if (filteredLogs.length === 0) return;

    const headers = ["Data/Hora", "Módulo", "Registro", "Ação", "Responsável", "Alterações"];
    const rows = filteredLogs.map(log => [
      log.changed_at ? format(new Date(log.changed_at), "dd/MM/yyyy HH:mm") : "-",
      TABLE_LABELS[log.table_name ?? ""] ?? log.table_name ?? "-",
      getRecordName(log.changes),
      ACTION_LABELS[log.action ?? ""] ?? log.action ?? "-",
      log.changed_by_name ?? "-",
      log.changes ? JSON.stringify(log.changes).replace(/"/g, '""') : "-"
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(e => e.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `relatorio_auditoria_${format(new Date(), "yyyy-MM-dd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {!organizationId ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-muted-foreground">Nenhuma organização encontrada.</p>
        </div>
      ) : null}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Auditoria
          </h1>
          <p className="text-sm text-muted-foreground">
            Histórico de inclusões, alterações e exclusões no sistema
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={exportToCSV}
            disabled={filteredLogs.length === 0}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <History className="h-5 w-5" />
              Log de alterações
            </h2>
            <Badge variant="secondary" className="font-normal">
              {filteredLogs.length} registros encontrados
            </Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-4 p-4 bg-muted/30 rounded-lg border border-border/50">
            <div>
              <Label className="text-xs font-bold uppercase text-muted-foreground">Data de</Label>
              <Input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="h-9 mt-1 bg-background"
              />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase text-muted-foreground">Data até</Label>
              <Input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="h-9 mt-1 bg-background"
              />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase text-muted-foreground">Responsável</Label>
              <Input
                placeholder="Filtrar por nome"
                value={filterResponsible}
                onChange={(e) => setFilterResponsible(e.target.value)}
                className="h-9 mt-1 bg-background"
              />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase text-muted-foreground">Módulo/Tabela</Label>
              <Select
                value={filterTable || "all"}
                onValueChange={(v) => setFilterTable(v === "all" ? "" : v)}
              >
                <SelectTrigger className="h-9 mt-1 bg-background">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os módulos</SelectItem>
                  {uniqueTables.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TABLE_LABELS[t] ?? t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-bold uppercase text-muted-foreground">Tipo de Ação</Label>
              <Select
                value={filterAction || "all"}
                onValueChange={(v) => setFilterAction(v === "all" ? "" : v)}
              >
                <SelectTrigger className="h-9 mt-1 bg-background">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as ações</SelectItem>
                  <SelectItem value="INSERT">Inclusão</SelectItem>
                  <SelectItem value="UPDATE">Alteração</SelectItem>
                  <SelectItem value="DELETE">Exclusão</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary" />
              <p>Carregando registros de auditoria...</p>
            </div>
          ) : error ? (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-md">
              <p className="font-bold">Erro ao carregar:</p>
              <p>{(error as Error).message}</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-muted/10 rounded-lg border-2 border-dashed">
              <Filter className="h-10 w-10 text-muted-foreground/30 mb-2" />
              <p className="text-muted-foreground font-medium">
                {logs.length === 0
                  ? "Nenhum registro de auditoria encontrado."
                  : "Nenhum resultado para os filtros aplicados."}
              </p>
              {logs.length > 0 && (
                <Button variant="link" onClick={() => {
                  setFilterDateFrom("");
                  setFilterDateTo("");
                  setFilterResponsible("");
                  setFilterTable("");
                  setFilterAction("");
                }}>
                  Limpar todos os filtros
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-lg border shadow-sm overflow-hidden bg-background">
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 hover:scrollbar-thumb-muted-foreground/40">
                <table className="w-full text-sm border-separate border-spacing-0">
                  <thead className="bg-muted sticky top-0 z-20 shadow-sm">
                    <tr>
                      <th className="text-left p-4 font-bold text-muted-foreground uppercase text-[10px] border-b bg-muted">Data/Hora</th>
                      <th className="text-left p-4 font-bold text-muted-foreground uppercase text-[10px] border-b bg-muted">Módulo</th>
                      <th className="text-left p-4 font-bold text-muted-foreground uppercase text-[10px] border-b bg-muted">Registro</th>
                      <th className="text-left p-4 font-bold text-muted-foreground uppercase text-[10px] border-b bg-muted">Ação</th>
                      <th className="text-left p-4 font-bold text-muted-foreground uppercase text-[10px] border-b bg-muted">Responsável</th>
                      <th className="text-left p-4 font-bold text-muted-foreground uppercase text-[10px] border-b bg-muted">Alterações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredLogs.map((log) => (
                      <tr
                        key={log.id ?? `${log.table_name}-${log.record_id}-${log.changed_at}`}
                        className="hover:bg-muted/30 transition-colors"
                      >
                        <td className="p-4 text-muted-foreground whitespace-nowrap font-medium">
                          {log.changed_at
                            ? format(new Date(log.changed_at), "dd/MM/yyyy HH:mm", {
                                locale: ptBR,
                              })
                            : "-"}
                        </td>
                        <td className="p-4">
                          <Badge variant="outline" className="font-medium bg-background gap-1.5">
                            <TableIcon className="h-3 w-3" />
                            {TABLE_LABELS[log.table_name ?? ""] ?? log.table_name ?? "-"}
                          </Badge>
                        </td>
                        <td className="p-4 text-sm text-foreground font-medium max-w-[160px]">
                          <span className="truncate block" title={getRecordName(log.changes)}>
                            {getRecordName(log.changes)}
                          </span>
                        </td>
                        <td className="p-4">
                          <span
                            className={cn(
                              "inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                              log.action === "INSERT"
                                ? "bg-emerald-100 text-emerald-700"
                                : log.action === "DELETE"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-amber-100 text-amber-700"
                            )}
                          >
                            {ACTION_LABELS[log.action ?? ""] ?? log.action ?? "-"}
                          </span>
                        </td>
                        <td className="p-4 font-medium text-foreground">
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                              {log.changed_by_name?.substring(0, 2).toUpperCase() ?? "??"}
                            </div>
                            {log.changed_by_name ?? "-"}
                          </div>
                        </td>
                        <td className="p-4 max-w-md">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <FileText className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate" title={JSON.stringify(log.changes)}>
                              {formatChangeSummary(log.action ?? "", log.changes)}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Badge({ children, variant = "default", className }: { children: React.ReactNode, variant?: "default" | "secondary" | "outline", className?: string }) {
  const variants = {
    default: "bg-primary text-primary-foreground",
    secondary: "bg-secondary text-secondary-foreground",
    outline: "text-foreground border border-input"
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors", variants[variant], className)}>
      {children}
    </span>
  );
}
