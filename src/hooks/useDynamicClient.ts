/**
 * useDynamicClient — Fase 2 (Banco A unificado)
 *
 * Retorna um SupabaseClient autenticado com a sessão ativa do dashboard.
 *
 * Estratégia:
 *   - Cria o cliente com autoRefreshToken: true e persistSession: false
 *   - Injeta a sessão via setSession() para que o Supabase gerencie refresh
 *   - Quando o token expira, o Supabase renova automaticamente via refresh_token
 *   - O token renovado é propagado de volta ao ClientAuthContext via onAuthStateChange
 *
 * null retornado se não há sessão válida → nenhuma query executada.
 */

import { useEffect, useMemo, useRef } from "react";
import { useClientAuth } from "@/hooks/useClientAuth";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const BANK_A_URL      = import.meta.env.VITE_SUPABASE_URL      as string | undefined;
const BANK_A_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Singleton do cliente Supabase — uma única instância para o Banco A
let bankAClient: SupabaseClient | null = null;

function getBankAClient(): SupabaseClient | null {
  if (!BANK_A_URL || !BANK_A_ANON_KEY) {
    console.error("[useDynamicClient] VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não definidos.");
    return null;
  }
  if (!bankAClient) {
    bankAClient = createClient(BANK_A_URL, BANK_A_ANON_KEY, {
      auth: {
        persistSession: false,   // Não usa localStorage — sessão gerenciada pelo ClientAuthContext
        autoRefreshToken: true,  // Supabase renova o token automaticamente quando necessário
        detectSessionInUrl: false,
      },
    });
  }
  return bankAClient;
}

export function useDynamicClient(): SupabaseClient | null {
  const { auth, updateSession } = useClientAuth();

  // Referência estável ao cliente (não recria a cada render)
  const client = useMemo(() => {
    if (auth?.mode === "bank_a" || !auth?.client_supabase_url) {
      return getBankAClient();
    }
    // Modo B legado — sem suporte a refresh automático (descontinuado)
    return null;
  }, [auth?.mode, auth?.client_supabase_url]);

  // Injeta a sessão no cliente quando muda (login, refresh externo)
  const lastTokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!client || !auth?.session) return;

    const token = auth.session.access_token;
    if (token === lastTokenRef.current) return; // já injetado
    lastTokenRef.current = token;

    // setSession injeta access_token + refresh_token
    // O Supabase passa a gerenciar o refresh automaticamente
    client.auth.setSession({
      access_token:  auth.session.access_token,
      refresh_token: auth.session.refresh_token ?? "",
    }).catch(() => {
      // Sessão inválida — ignora silenciosamente (o ClientAuthContext fará logout)
    });
  }, [client, auth?.session?.access_token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escuta renovações de token para manter o ClientAuthContext atualizado
  useEffect(() => {
    if (!client) return;

    const { data: { subscription } } = client.auth.onAuthStateChange(
      (event, session) => {
        if (event === "TOKEN_REFRESHED" && session) {
          // Propaga o novo token de volta ao contexto
          updateSession(session, auth?.user ?? { id: "", email: "", full_name: null, role: "member", client_id: "", avatar_url: null });
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [client]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!auth?.session?.access_token) return null;
  if (auth?.mode !== "bank_a" && auth?.client_supabase_url) return null; // Modo B legado sem suporte

  return client;
}
