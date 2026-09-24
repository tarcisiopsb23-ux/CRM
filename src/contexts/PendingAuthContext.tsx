/**
 * PendingAuthContext
 * Provider global que mantém o polling de autorização remota vivo
 * independente de navegação ou desmontagem do PinAuthDialog.
 *
 * Fluxo:
 * 1. PinAuthDialog registra uma autorização pendente via registerPendingAuth()
 * 2. Este provider faz polling a cada 3s no Supabase
 * 3. Quando aprovado, executa o callback onApproved e limpa o estado
 * 4. Quando rejeitado/cancelado/expirado, executa onRejected e limpa
 */
import { createContext, useContext, useRef, useState, useCallback, useEffect, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";

const STORAGE_KEY = "global_pending_auth";
const POLL_INTERVAL = 3_000;

interface PendingAuthEntry {
  id: string;
  onApproved: () => Promise<void> | void;
  onRejected: () => void;
}

interface PendingAuthContextValue {
  registerPendingAuth: (entry: PendingAuthEntry) => void;
  clearPendingAuth: (id: string) => void;
  activePendingId: string | null;
}

const PendingAuthContext = createContext<PendingAuthContextValue | null>(null);

export function PendingAuthProvider({ children }: { children: ReactNode }) {
  const [activePendingId, setActivePendingId] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY)
  );
  const entryRef = useRef<PendingAuthEntry | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const clearPendingAuth = useCallback((id: string) => {
    if (entryRef.current?.id === id) {
      entryRef.current = null;
    }
    localStorage.removeItem(STORAGE_KEY);
    setActivePendingId(null);
    stopPolling();
  }, [stopPolling]);

  const poll = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("pending_authorizations")
      .select("status")
      .eq("id", id)
      .single();

    if (error || !data) return;

    if (data.status === "aprovado") {
      stopPolling();
      const entry = entryRef.current;
      clearPendingAuth(id);
      if (entry) await entry.onApproved();
    } else if (["rejeitado", "cancelado", "expirado"].includes(data.status)) {
      stopPolling();
      const entry = entryRef.current;
      clearPendingAuth(id);
      if (entry) entry.onRejected();
    }
  }, [stopPolling, clearPendingAuth]);

  const startPolling = useCallback((id: string) => {
    stopPolling();
    intervalRef.current = setInterval(() => poll(id), POLL_INTERVAL);
  }, [poll, stopPolling]);

  const registerPendingAuth = useCallback((entry: PendingAuthEntry) => {
    entryRef.current = entry;
    localStorage.setItem(STORAGE_KEY, entry.id);
    setActivePendingId(entry.id);
    startPolling(entry.id);
  }, [startPolling]);

  // Retoma polling se havia uma autorização pendente ao montar (ex: após reload)
  useEffect(() => {
    if (activePendingId && !intervalRef.current) {
      startPolling(activePendingId);
    }
    return () => stopPolling();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PendingAuthContext.Provider value={{ registerPendingAuth, clearPendingAuth, activePendingId }}>
      {children}
    </PendingAuthContext.Provider>
  );
}

export function usePendingAuthContext() {
  const ctx = useContext(PendingAuthContext);
  if (!ctx) throw new Error("usePendingAuthContext must be used within PendingAuthProvider");
  return ctx;
}
