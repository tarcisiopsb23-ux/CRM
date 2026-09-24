/**
 * useMetaReviewOrg
 *
 * Retorna o organization_id no contexto das páginas de Meta App Review,
 * que rodam dentro do PublicDashboardLayout do C8 Control (ClientAuthContext),
 * não dentro do AuthProvider do Maestr.ia.
 *
 * Usa useClientAuth em vez de useAuth para evitar o erro:
 *   "useAuth must be used within AuthProvider"
 */

import { useClientAuth } from "@/hooks/useClientAuth";

export function useMetaReviewOrg(): string | undefined {
  const { auth } = useClientAuth();
  // auth.organization_id é o ID da organização da agência (Banco A)
  return (auth?.organization_id as string | undefined) ?? undefined;
}
