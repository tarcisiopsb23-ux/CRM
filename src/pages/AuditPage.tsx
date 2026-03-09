import { useState, useMemo } from "react";
import { useOrganization } from "@/hooks/useOrganization";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, History, Filter } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const ACTION_LABELS: Record<string, string> = {
  INSERT: "Inclusão",
  UPDATE: "Alteração",
  DELETE: "Exclusão",
};

const TABLE_LABELS: Record<string, string> = {
  clients: "Clientes",
  suppliers: "Fornecedores",
  payments: "Financeiro (receber)",
  supplier_expenses: "Financeiro (pagar)",
  leads: "Leads",
  profiles: "Usuários",
  contracts: "Contratos",
  goals: "Metas",
  teams: "Equipes",
};

type AuditLog = {
  id: string | null;
  table_name: string | null;
  record_id: string | null;
  action: string | null;
  changed_by: string | null;
  changed_by_name: string | null;
  changed_at: string | null;
  changes: unknown;
};

export default function AuditPage() {
  const organizationId = useOrganization();
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterResponsible, setFilterResponsible] = useState("");
  const [filterTable, setFilterTable] = useState("");
  const [filterAction, setFilterAction] = useState("");

  const { data: logs = [], isLoading, error } = useQuery({
    queryKey: ["admin_audit_logs", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("admin_audit_logs")
        .select("*")
        .order("changed_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as AuditLog[];
    },
    enabled: !!organizationId,
  });

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
  const uniqueResponsibles = useMemo(
    () => [...new Set(logs.map((l) => l.changed_by_name).filter(Boolean))] as string[],
    [logs]
  );

  return (
    <div className="space-y-6">
      {!organizationId ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-muted-foreground">Nenhuma organização encontrada.</p>
        </div>
      ) : null}
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Auditoria
        </h1>
        <p className="text-sm text-muted-foreground">
          Histórico de inclusões, alterações e exclusões no sistema
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <History className="h-5 w-5" />
              Log de alterações
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-4">
            <div>
              <Label className="text-xs">Data de</Label>
              <Input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="h-8 mt-0.5"
              />
            </div>
            <div>
              <Label className="text-xs">Data até</Label>
              <Input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="h-8 mt-0.5"
              />
            </div>
            <div>
              <Label className="text-xs">Responsável</Label>
              <Input
                placeholder="Filtrar por nome"
                value={filterResponsible}
                onChange={(e) => setFilterResponsible(e.target.value)}
                className="h-8 mt-0.5"
              />
            </div>
            <div>
              <Label className="text-xs">Módulo/Tabela</Label>
              <Select
                value={filterTable || "all"}
                onValueChange={(v) => setFilterTable(v === "all" ? "" : v)}
              >
                <SelectTrigger className="h-8 mt-0.5">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {uniqueTables.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TABLE_LABELS[t] ?? t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select
                value={filterAction || "all"}
                onValueChange={(v) => setFilterAction(v === "all" ? "" : v)}
              >
                <SelectTrigger className="h-8 mt-0.5">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
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
            <div className="flex items-center gap-2 text-muted-foreground py-12">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando...
            </div>
          ) : error ? (
            <p className="text-destructive py-8">
              Erro ao carregar: {(error as Error).message}
            </p>
          ) : filteredLogs.length === 0 ? (
            <p className="text-muted-foreground py-12 text-center">
              {logs.length === 0
                ? "Nenhum registro de auditoria encontrado."
                : "Nenhum resultado para os filtros aplicados."}
            </p>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-3 font-medium">Data/Hora</th>
                      <th className="text-left p-3 font-medium">Tabela</th>
                      <th className="text-left p-3 font-medium">Ação</th>
                      <th className="text-left p-3 font-medium">Quem</th>
                      <th className="text-left p-3 font-medium">Detalhes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((log) => (
                      <tr
                        key={log.id ?? `${log.table_name}-${log.record_id}-${log.changed_at}`}
                        className="border-t border-border hover:bg-muted/30"
                      >
                        <td className="p-3 text-muted-foreground whitespace-nowrap">
                          {log.changed_at
                            ? format(new Date(log.changed_at), "dd/MM/yyyy HH:mm", {
                                locale: ptBR,
                              })
                            : "-"}
                        </td>
                        <td className="p-3 font-medium">{log.table_name ?? "-"}</td>
                        <td className="p-3">
                          <span
                            className={
                              log.action === "INSERT"
                                ? "text-emerald-600"
                                : log.action === "DELETE"
                                  ? "text-red-600"
                                  : "text-amber-600"
                            }
                          >
                            {ACTION_LABELS[log.action ?? ""] ?? log.action ?? "-"}
                          </span>
                        </td>
                        <td className="p-3">{log.changed_by_name ?? "-"}</td>
                        <td className="p-3 max-w-xs truncate" title={JSON.stringify(log.changes)}>
                          {log.changes && typeof log.changes === "object"
                            ? Object.keys(log.changes as Record<string, unknown>).join(", ")
                            : "-"}
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
