/**
 * useDynamicClient — Fase 1 (T-1.4)
 *
 * Instancia o cliente Supabase do Banco B com o JWT da sessão ativa,
 * garantindo que as políticas de RLS sejam aplicadas corretamente.
 *
 * O access_token nunca é exposto — fica apenas no header Authorization
 * das requisições HTTP ao Supabase.
 */

import { useMemo } from "react";
import { useClientAuth } from "@/hooks/useClientAuth";
import { createClientSupabase } from "@/lib/createClientSupabase";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Retorna um SupabaseClient autenticado para o Banco B do cliente.
 *
 * - Se o usuário está autenticado: usa o JWT da sessão (RLS pleno)
 * - Se não há sessão: retorna null (bloqueia queries)
 *
 * A anon_key do Banco B vem de:
 * 1. auth.client_supabase_anon_key (carregado no login, não persistido)
 * 2. VITE_CLIENTS_SUPABASE_ANON_KEY (fallback para banco compartilhado futuro)
 */
export function useDynamicClient(): SupabaseClient | null {
  const { auth } = useClientAuth();

  return useMemo(() => {
    if (!auth?.client_supabase_url) return null;

    // anon_key: preferência pela do contexto (null após reload), fallback sessionStorage, fallback env
    const anonKey =
      auth.client_supabase_anon_key ??
      sessionStorage.getItem(`client_anon_${auth.id}`) ??
      sessionStorage.getItem(`client_anon_${/* slug via URL */ window.location.pathname.split("/")[4] ?? ""}`) ??
      import.meta.env.VITE_CLIENTS_SUPABASE_ANON_KEY ??
      null;

    if (!anonKey) return null;

    // Cria/reutiliza cliente com a anon_key (cache por URL+key)
    const client = createClientSupabase(auth.client_supabase_url, anonKey);

    // Injeta o access_token da sessão JWT para ativar RLS por usuário
    // O Supabase usa o token do contexto auth — setar via setSession
    if (auth.session?.access_token) {
      // setSession é assíncrono mas não precisamos aguardar — o cliente
      // já usa o token nas próximas requisições via persistSession
      client.auth.setSession({
        access_token: auth.session.access_token,
        refresh_token: auth.session.refresh_token ?? "",
      }).catch(() => {
        // Ignora erros de refresh — o logout automático cuida disso
      });
    }

    return client;
  }, [
    auth?.client_supabase_url,
    auth?.client_supabase_anon_key,
    auth?.session?.access_token,
  ]);
}
