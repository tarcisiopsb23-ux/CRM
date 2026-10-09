/**
 * useAuth — adapter para compatibilidade com componentes compartilhados
 * (pasta @/components/meta) que esperam o formato do C8 Control.
 *
 * O CRM usa useAuth() de @/contexts/AuthContext que retorna { profile }.
 * Este adapter normaliza para { role, isSupport, ...rest }.
 */

import { useAuth as useAuthCtx } from "@/contexts/AuthContext";

export function useAuth() {
  const ctx = useAuthCtx();
  const role = ctx.profile?.role ?? "viewer";
  // No CRM, e-mails @agenciac8.com.br são suporte
  const email = ctx.user?.email ?? "";
  const isSupport = email.endsWith("@agenciac8.com.br");

  return {
    ...ctx,
    role,
    isSupport,
  };
}

/**
 * Verifica se o usuário tem permissão administrativa (owner/admin/agency).
 */
export function canManageRole(role: string, isSupport: boolean): boolean {
  if (isSupport) return true;
  if (role === "owner" || role === "admin") return true;
  return false;
}
