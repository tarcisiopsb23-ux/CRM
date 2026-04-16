/**
 * SupportLayout
 *
 * Wrapper que adiciona o SupportBanner em todas as páginas quando isSupport: true.
 * Busca o nome do cliente automaticamente pelo tenant_id.
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabaseCrm } from "@/lib/supabase";
import { SupportBanner } from "@/components/auth/SupportBanner";

interface Props {
  children: React.ReactNode;
}

export function SupportLayout({ children }: Props) {
  const { isSupport, tenantId } = useAuth();
  const [clientName, setClientName] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!isSupport || !tenantId) return;
    supabaseCrm
      .from("clients")
      .select("name")
      .eq("tenant_id", tenantId)
      .maybeSingle()
      .then(({ data }) => setClientName(data?.name ?? undefined));
  }, [isSupport, tenantId]);

  if (!isSupport) return <>{children}</>;

  return (
    <div className="space-y-6">
      <SupportBanner tenantName={clientName} />
      {children}
    </div>
  );
}
