import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type AuditLogRow = {
  id: string | null;
  table_name: string | null;
  record_id: string | null;
  action: string | null;
  changed_by: string | null;
  changed_by_name: string | null;
  changed_at: string | null;
  changes: unknown;
};

export function useAdminAuditLogs(organizationId: string | undefined, limit = 200) {
  return useQuery({
    queryKey: ["audit_logs_view", organizationId, limit],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("audit_logs_view")
        .select("*")
        .order("changed_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as AuditLogRow[];
    },
    enabled: !!organizationId,
  });
}
