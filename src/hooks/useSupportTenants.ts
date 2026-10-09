import { useEffect, useState } from "react";
import { supabaseCrm } from "@/lib/supabase";
import { supabaseAuth } from "@/lib/supabase-auth";

interface TenantOption {
  id: string;
  name: string;
}

interface UseSupportTenantsResult {
  tenants: TenantOption[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetches all available tenants for support session tenant selection.
 * Waits for the SaaS session to be ready before querying the CRM_DB,
 * ensuring the JWT is injected into supabaseCrm before the first request.
 */
export function useSupportTenants(): UseSupportTenantsResult {
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Aguarda a sessão SaaS estar disponível antes de fazer a query
      const { data: { session } } = await supabaseAuth.auth.getSession();

      if (!session) {
        if (!cancelled) {
          setError("Sessão não encontrada. Faça login novamente.");
          setLoading(false);
        }
        return;
      }

      const { data, error: queryError } = await supabaseCrm
        .from("clients")
        .select("id, name")
        .order("name", { ascending: true });

      if (cancelled) return;

      if (queryError) {
        setError("Erro ao carregar clientes. Verifique sua sessão.");
      } else {
        setTenants(data ?? []);
      }
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return { tenants, loading, error };
}
