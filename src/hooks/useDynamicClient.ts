/**
 * useDynamicClient — Banco A unificado
 *
 * Retorna um SupabaseClient com o JWT da sessão ativa injetado.
 * Todos os clientes operam exclusivamente no Banco A.
 *
 * Estratégia:
 *   - Singleton — uma única instância do cliente Supabase para o Banco A
 *   - Injeta a sessão via setSession() para refresh automático
 *   - O token renovado é propagado de volta ao ClientAuthContext via updateSession
 *
 * null retornado se não há sessão válida → nenhuma query executada.
 */

import { useEffect, useMemo, useRef } from "react";
import { useClientAuth } from "@/hooks/useClientAuth";
import { createClientSupabase } from "@/lib/createClientSupabase";
import type { SupabaseClient } from "@supabase/supabase-js";

const BANK_A_URL      = import.meta.env.VITE_SUPABASE_URL      as string | undefined;
const BANK_A_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Singleton — evita múltiplas conexões WebSocket
let _bankAClient: SupabaseClient | null = null;

function getBankAClient(): SupabaseClient | null {
  if (!BANK_A_URL || !BANK_A_ANON_KEY) {
    console.error("[useDynamicClient] VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não definidos.");
    return null;
  }
  if (!_bankAClient) {
    _bankAClient = createClientSupabase(BANK_A_URL, BANK_A_ANON_KEY);
  }
  return _bankAClient;
}

export function useDynamicClient(): SupabaseClient | null {
  const { auth, updateSession } = useClientAuth();
  const lastTokenRef = useRef<string | null>(null);

  const client = useMemo(() => {
    if (!auth?.session?.access_token) return null;
    return getBankAClient();
  }, [auth?.session?.access_token]);

  // Injeta sessão quando o token muda (login ou refresh)
  useEffect(() => {
    if (!client || !auth?.session) return;
    const token = auth.session.access_token;
    if (token === lastTokenRef.current) return;
    lastTokenRef.current = token;

    client.auth.setSession({
      access_token:  token,
      refresh_token: auth.session.refresh_token ?? "",
    }).catch(() => { /* refresh falhou silenciosamente */ });
  }, [client, auth?.session?.access_token]);

  // Propaga renovação automática de token de volta ao contexto
  useEffect(() => {
    if (!client) return;
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if ((event === "TOKEN_REFRESHED" || event === "SIGNED_IN") && session && auth?.user) {
        if (session.access_token !== auth.session?.access_token) {
          updateSession(session, auth.user);
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [client]); // eslint-disable-line react-hooks/exhaustive-deps

  return client;
}
