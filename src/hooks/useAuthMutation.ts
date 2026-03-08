import { useMutation, type UseMutationOptions, type UseMutationResult } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Enhanced useMutation that detects auth errors and provides clear feedback.
 * If a 401/403 error occurs, it indicates session expiration or permission issues.
 */
export function useAuthMutation<TData, TError, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: Partial<UseMutationOptions<TData, TError, TVariables>>
): UseMutationResult<TData, TError, TVariables> {
  const { user, refetchProfile } = useAuth();

  return useMutation({
    ...options,
    mutationFn: async (variables: TVariables) => {
      if (!user?.id) {
        throw new Error("Não autenticado. Faça login novamente.");
      }
      try {
        return await mutationFn(variables);
      } catch (error: any) {
        // Check for auth-related errors
        if (error?.status === 401 || error?.status === 403) {
          console.warn("[useAuthMutation] Auth error detected:", error);
          // Optionally trigger profile refetch to check current session
          try {
            await refetchProfile();
          } catch (e) {
            console.warn("[useAuthMutation] refetchProfile failed:", e);
          }
          throw new Error("Sua sessão expirou ou você não tem permissão. Tente fazer login novamente.");
        }
        // Row-level security (RLS) error in Supabase
        if (error?.message?.includes("permission denied") || error?.message?.includes("row level security")) {
          throw new Error("Você não tem permissão para realizar esta ação. Verifique suas permissões de organização.");
        }
        throw error;
      }
    },
  });
}
