import { useMutation, type UseMutationOptions, type UseMutationResult } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";

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
      } catch (error: unknown) {
        const err = error as { status?: number; message?: string };
        // Check for auth-related errors
        if (err?.status === 401 || err?.status === 403) {
          // Optionally trigger profile refetch to check current session
          try {
            await refetchProfile();
          } catch (e) {
            void e;
          }
          throw new Error("Sua sessão expirou ou você não tem permissão. Tente fazer login novamente.");
        }
        // Row-level security (RLS) error in Supabase
        if (err?.message?.includes("permission denied") || err?.message?.includes("row level security")) {
          throw new Error("Você não tem permissão para realizar esta ação. Verifique suas permissões de organização.");
        }
        throw error;
      }
    },
  });
}
