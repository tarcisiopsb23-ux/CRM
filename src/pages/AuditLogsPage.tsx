import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { canManageRole } from "@/hooks/useAuth";
import { supabaseCrm } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ClipboardList, Loader2, RefreshCw } from "lucide-react";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { SupportBannerSection } from "@/components/auth/SupportBannerSection";

interface AuditLog {
  id: string;
  tenant_id: string;
  user_id: string;
  user_email: string | null;
  user_role: string;
  action: string;
  category: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  login:   "bg-blue-500/10 text-blue-400 border-blue-500/30",
  lead:    "bg-violet-500/10 text-violet-400 border-violet-500/30",
  config:  "bg-amber-500/10 text-amber-400 border-amber-500/30",
  user:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  crm:     "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
  support: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  geral:   "bg-slate-500/10 text-slate-400 border-slate-500/30",
};

const ROLE_LABEL: Record<string, string> = {
  admin:   "Admin",
  member:  "Membro",
  agency:  "Suporte",
  support: "Suporte",
};

export function AuditLogsPage() {
  const navigate = useNavigate();
  const { tenantId, role, isSupport, loading: authLoading, session } = useAuth();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));

  const effectiveTenantId = isSupport
    ? sessionStorage.getItem("support_selected_tenant_id")
    : tenantId;

  const canAccess = canManageRole(role, isSupport);

  const fetchLogs = async () => {
    if (!effectiveTenantId) return;
    setLoading(true);
    try {
      let query = supabaseCrm
        .from("audit_logs")
        .select("*")
        .eq("tenant_id", effectiveTenantId)
        .gte("created_at", dateFrom + "T00:00:00Z")
        .order("created_at", { ascending: false })
        .limit(200);

      if (filterCategory !== "all") {
        query = query.eq("category", filterCategory);
      }

      const { data, error } = await query;
      if (!error) setLogs(data ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && canAccess) fetchLogs();
    if (!authLoading && !canAccess) setLoading(false);
  }, [effectiveTenantId, filterCategory, dateFrom, authLoading]);

  if (authLoading) return (
    <div className="flex items-center justify-center min-h-screen bg-[#0F172A]">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#7C3AED] border-t-transparent" />
    </div>
  );

  if (!canAccess) return (
    <div className="flex items-center justify-center min-h-screen bg-[#0F172A]">
      <div className="text-center space-y-3">
        <p className="text-slate-400 text-lg font-bold">Acesso restrito.</p>
        <Button className="bg-[#7C3AED] hover:bg-[#7C3AED]/90 text-white font-bold" onClick={() => navigate("/dashboard")}>
          Voltar ao Dashboard
        </Button>
      </div>
    </div>
  );

  const categories = ["all", "login", "lead", "crm", "config", "user", "support", "geral"];

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">

        <SupportBannerSection />

        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white hover:bg-slate-800"
            onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-[#7C3AED]" />
              Logs de Auditoria
            </h1>
            <p className="text-slate-400 text-sm">Registro de todas as ações realizadas no dashboard.</p>
          </div>
          <Button variant="outline" size="sm" className="border-slate-700 text-slate-300 hover:bg-slate-800 gap-2"
            onClick={fetchLogs} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Atualizar
          </Button>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Categoria */}
          <div className="flex gap-1 flex-wrap">
            {categories.map(cat => (
              <button key={cat} onClick={() => setFilterCategory(cat)}
                className={cn("text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-all uppercase tracking-wide",
                  filterCategory === cat
                    ? "bg-[#7C3AED] border-[#7C3AED] text-white"
                    : "border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500"
                )}>
                {cat === "all" ? "Todos" : cat}
              </button>
            ))}
          </div>

          {/* Data */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-slate-500 text-xs">A partir de:</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#7C3AED]" />
          </div>
        </div>

        {/* Tabela */}
        <div className="bg-[#1E293B] border border-slate-800 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-[#7C3AED]" />
            </div>
          ) : logs.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-sm italic">
              Nenhum registro encontrado para os filtros selecionados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-slate-500 text-[10px] uppercase font-black tracking-widest border-b border-slate-800 bg-slate-900/30">
                    <th className="px-5 py-3">Data/Hora</th>
                    <th className="px-5 py-3">Usuário</th>
                    <th className="px-5 py-3">Perfil</th>
                    <th className="px-5 py-3">Categoria</th>
                    <th className="px-5 py-3">Ação</th>
                    <th className="px-5 py-3">Objeto</th>
                    <th className="px-5 py-3">Detalhes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {logs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-800/30 transition-colors text-sm">
                      <td className="px-5 py-3 text-slate-400 whitespace-nowrap text-xs font-mono">
                        {format(new Date(log.created_at), "dd/MM/yy HH:mm:ss", { locale: ptBR })}
                      </td>
                      <td className="px-5 py-3 text-slate-200 text-xs max-w-[160px] truncate">
                        {log.user_email ?? log.user_id.slice(0, 8) + "…"}
                      </td>
                      <td className="px-5 py-3">
                        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded border",
                          log.user_role === "admin" ? "bg-violet-500/10 text-violet-400 border-violet-500/30" :
                          log.user_role === "agency" || log.user_role === "support" ? "bg-orange-500/10 text-orange-400 border-orange-500/30" :
                          "bg-slate-700 text-slate-400 border-slate-600"
                        )}>
                          {ROLE_LABEL[log.user_role] ?? log.user_role}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded border uppercase",
                          CATEGORY_COLORS[log.category] ?? CATEGORY_COLORS.geral
                        )}>
                          {log.category}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-200 text-xs font-medium">{log.action}</td>
                      <td className="px-5 py-3 text-slate-500 text-xs">
                        {log.entity_type && (
                          <span className="text-slate-400">{log.entity_type}</span>
                        )}
                        {log.entity_id && (
                          <span className="text-slate-600 ml-1 font-mono text-[10px]">
                            #{log.entity_id.slice(0, 8)}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-500 text-xs max-w-[200px]">
                        {log.details ? (
                          <span className="font-mono text-[10px] text-slate-500 truncate block">
                            {JSON.stringify(log.details).slice(0, 60)}
                            {JSON.stringify(log.details).length > 60 ? "…" : ""}
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-slate-600 text-xs text-center">
          Exibindo até 200 registros mais recentes. Logs são mantidos por 90 dias.
        </p>
      </div>
    </div>
  );
}
