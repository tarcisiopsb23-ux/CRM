/**
 * useAuditLog
 *
 * Hook para registrar ações de auditoria na tabela audit_logs.
 * Uso: const { log } = useAuditLog();
 *      log("lead_created", "lead", leadId, { name: lead.name });
 */
import { useCallback } from "react";
import { supabaseCrm } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export type AuditCategory = "login" | "lead" | "config" | "user" | "crm" | "support" | "geral";

export interface AuditEntry {
  action: string;
  category?: AuditCategory;
  entity_type?: string;
  entity_id?: string;
  details?: Record<string, unknown>;
}

export function useAuditLog() {
  const { tenantId, session, role } = useAuth();

  const log = useCallback(async (entry: AuditEntry) => {
    const effectiveTenantId = tenantId
      ?? sessionStorage.getItem("support_selected_tenant_id")
      ?? null;

    if (!effectiveTenantId || !session?.user) return;

    try {
      await supabaseCrm.from("audit_logs").insert({
        tenant_id:   effectiveTenantId,
        user_id:     session.user.id,
        user_email:  session.user.email ?? null,
        user_role:   role ?? "member",
        action:      entry.action,
        category:    entry.category ?? "geral",
        entity_type: entry.entity_type ?? null,
        entity_id:   entry.entity_id ?? null,
        details:     entry.details ?? null,
        ip_hint:     "browser",
      });
    } catch {
      // Silencioso — log nunca deve quebrar a UX
    }
  }, [tenantId, session, role]);

  return { log };
}
