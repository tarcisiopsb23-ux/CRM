import { useEffect, useState, useCallback, useRef } from "react";
import { supabaseCrm } from "@/lib/supabase";
import { supabaseAuth } from "@/lib/supabase-auth";
import { useAuth } from "@/hooks/useAuth";

const TENANT_STATUS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tenant-status`;
const SYNC_INTERVAL_MS  = 30 * 60 * 1000; // 30 minutos

export interface TenantStatusState {
  status:        "ativo" | "bloqueado" | "suspenso" | "cancelado" | null;
  maxUsers:      number | null;
  planName:      string | null;
  blockedReason: string | null;
  contractEnd:   string | null;
  isNearExpiry:  boolean;
  loading:       boolean;
  lastSyncedAt:  Date | null;
}

function calcIsNearExpiry(contractEnd: string | null): boolean {
  if (!contractEnd) return false;
  const end  = new Date(contractEnd);
  const now  = new Date();
  const diff = end.getTime() - now.getTime();
  const days = diff / (1000 * 60 * 60 * 24);
  return days >= 0 && days <= 30;
}

/**
 * Sincroniza o status do tenant com o Maestr.ia via Edge Function tenant-status.
 * - Sincroniza imediatamente ao montar (se tenant_id presente e role !== 'support')
 * - Intervalo de 30 minutos enquanto sessão ativa
 * - Detecta mudança de status para bloqueado/suspenso/cancelado → encerra sessão
 * - isNearExpiry = true quando contract_end dentro dos próximos 30 dias
 * - Nunca executa para role = 'support'
 */
export function useTenantStatus(): TenantStatusState {
  const { tenantId, isSupport, session } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [state, setState] = useState<TenantStatusState>({
    status:        null,
    maxUsers:      null,
    planName:      null,
    blockedReason: null,
    contractEnd:   null,
    isNearExpiry:  false,
    loading:       true,
    lastSyncedAt:  null,
  });

  const handleBlockedStatus = useCallback(async (
    status: string,
    blockedReason: string | null
  ) => {
    await supabaseAuth.auth.signOut();
    const messages: Record<string, string> = {
      bloqueado: `Acesso bloqueado: ${blockedReason ?? "Entre em contato com a agência."}`,
      suspenso:  "Acesso suspenso. Entre em contato com a agência.",
      cancelado: "Contrato cancelado. Entre em contato com a agência.",
    };
    // Redirecionar para login com mensagem — o PublicDashboardLoginPage lida com isso
    window.location.href = `/login?blocked=${encodeURIComponent(messages[status] ?? "Acesso negado.")}`;
  }, []);

  const sync = useCallback(async () => {
    if (!tenantId || isSupport) return; // isSupport = role 'agency' ou 'support'

    try {
      const { data: { session: currentSession } } = await supabaseAuth.auth.getSession();
      if (!currentSession?.access_token) return;

      const res = await fetch(TENANT_STATUS_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${currentSession.access_token}` },
      });

      if (res.status === 503) {
        // Maestr.ia indisponível — usar cache existente sem sobrescrever
        console.warn("[useTenantStatus] Maestr.ia indisponível, usando cache existente");
        return;
      }

      if (!res.ok) return;

      const data = await res.json();
      const newStatus = data.status ?? "ativo";

      setState({
        status:        newStatus,
        maxUsers:      data.max_users      ?? 3,
        planName:      data.plan_name      ?? "Starter",
        blockedReason: data.blocked_reason ?? null,
        contractEnd:   data.contract_end   ?? null,
        isNearExpiry:  calcIsNearExpiry(data.contract_end ?? null),
        loading:       false,
        lastSyncedAt:  new Date(),
      });

      // Detectar mudança de status para não-ativo
      if (newStatus !== "ativo") {
        await handleBlockedStatus(newStatus, data.blocked_reason ?? null);
      }
    } catch (err) {
      console.warn("[useTenantStatus] Erro na sincronização:", err);
    }
  }, [tenantId, isSupport, handleBlockedStatus]);

  // Carregar do cache local primeiro (sem esperar a sync com Maestr.ia)
  useEffect(() => {
    if (!tenantId || isSupport) {
      setState(s => ({ ...s, loading: false }));
      return;
    }

    supabaseCrm
      .from("tenant_config_cache")
      .select("status, max_users, plan_name, blocked_reason, contract_end, synced_at")
      .eq("tenant_id", tenantId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setState({
            status:        data.status        as TenantStatusState["status"],
            maxUsers:      data.max_users,
            planName:      data.plan_name,
            blockedReason: data.blocked_reason ?? null,
            contractEnd:   data.contract_end   ?? null,
            isNearExpiry:  calcIsNearExpiry(data.contract_end ?? null),
            loading:       false,
            lastSyncedAt:  data.synced_at ? new Date(data.synced_at) : null,
          });
        } else {
          setState(s => ({ ...s, loading: false }));
        }
      });
  }, [tenantId, isSupport]);

  // Sincronização imediata + intervalo de 30 minutos
  useEffect(() => {
    if (!tenantId || isSupport || !session) return;

    sync(); // sincroniza imediatamente

    intervalRef.current = setInterval(sync, SYNC_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [tenantId, isSupport, session, sync]);

  return state;
}
