/**
 * ApiRequestLog
 *
 * Painel que exibe as chamadas à Meta API registradas em meta_review_api_logs.
 * Confirma que a API foi chamada de verdade antes do envio ao App Review.
 * Nunca exibe tokens ou secrets.
 */

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, XCircle, RefreshCw, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LiveMetaIndicator } from "./LiveMetaIndicator";
import { supabase } from "@/lib/supabase";
import { useMetaReviewOrg } from "@/hooks/useMetaReviewOrg";

interface ApiLogEntry {
  id: string;
  permission: string;
  endpoint: string;
  http_method: string;
  response_status: number | null;
  response_summary: string | null;
  is_live_test: boolean;
  created_at: string;
}

interface ApiRequestLogProps {
  /** Filtrar por permissão específica (opcional) */
  permission?: string;
  /** Número máximo de linhas */
  limit?: number;
}

export function ApiRequestLog({ permission, limit = 20 }: ApiRequestLogProps) {
  const organizationId = useMetaReviewOrg();

  const { data: logs = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["meta_review_api_logs", organizationId, permission],
    queryFn: async () => {
      if (!organizationId) return [];
      let q = supabase
        .from("meta_review_api_logs")
        .select("id, permission, endpoint, http_method, response_status, response_summary, is_live_test, created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (permission) q = q.eq("permission", permission);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ApiLogEntry[];
    },
    enabled: !!organizationId,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  return (
    <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/20">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Review API Calls</span>
          {permission && (
            <code className="rounded bg-secondary px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
              {permission}
            </code>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="h-7 px-2 gap-1 text-xs"
        >
          <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Tabela */}
      {isLoading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          Carregando logs...
        </div>
      ) : logs.length === 0 ? (
        <div className="p-8 text-center">
          <Activity className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Nenhuma chamada registrada ainda.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Execute a demonstração para registrar chamadas reais à Meta API.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/50 max-h-80 overflow-y-auto">
          {logs.map((log) => (
            <div key={log.id} className="flex items-start gap-3 px-4 py-3">
              {/* Status */}
              <div className="shrink-0 mt-0.5">
                {log.response_status && log.response_status >= 200 && log.response_status < 300 ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-400" />
                )}
              </div>

              {/* Detalhes */}
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono text-muted-foreground bg-secondary/40 px-1.5 rounded">
                    {log.http_method}
                  </span>
                  <code className="text-xs text-foreground/80 truncate">{log.endpoint}</code>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {log.response_status ?? "—"}
                  </Badge>
                  <LiveMetaIndicator
                    mode={log.is_live_test ? "LIVE_META_TEST" : "DEVELOPMENT_MOCK"}
                    showPulse={false}
                    className="text-[9px] px-1.5 py-0.5"
                  />
                </div>
                {log.response_summary && (
                  <p className="text-xs text-muted-foreground truncate">{log.response_summary}</p>
                )}
              </div>

              {/* Timestamp */}
              <span className="shrink-0 text-[10px] text-muted-foreground/50">
                {format(new Date(log.created_at), "HH:mm:ss", { locale: ptBR })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
