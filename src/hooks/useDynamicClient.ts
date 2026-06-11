/**
 * useDynamicClient — Fase 1 (T-1.4)
 *
 * Instancia o cliente Supabase do Banco B com o JWT da sessão ativa,
 * garantindo que as políticas de RLS sejam aplicadas corretamente.
 *
 * O access_token nunca é exposto — fica apenas no header Authorization
 * das requisições HTTP ao Supabase.
 *
 * ISOLAMENTO: Cada cliente possui seu próprio Supabase (client_supabase_url
 * único por cliente). Sem URL configurada → retorna null e NENHUMA query
 * é executada. Não existe fallback para banco compartilhado — isso
 * evita qualquer possibilidade de vazamento de dados entre clientes.
 */

import { useMemo } from "react";
import { useClientAuth } from "@/hooks/useClientAuth";
import { createClientSupabase } from "@/lib/createClientSupabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export function useDynamicClient(): SupabaseClient | null {
  const { auth } = useClientAuth();

  return useMemo(() => {
    // Sem URL do banco do cliente → null imediato, sem fallback
    // Isso garante isolamento total: nunca há risco de queries de um
    // cliente atingirem dados de outro cliente.
    if (!auth?.client_supabase_url) return null;

    // anon_key: vem do contexto (carregada no login) ou do sessionStorage
    // temporário (definido logo após o login, antes do primeiro render).
    // NÃO existe fallback para variável de ambiente global — cada cliente
    // tem sua própria chave, armazenada apenas em memória de sessão.
    const anonKey =
      auth.client_supabase_anon_key ??
      sessionStorage.getItem(`client_anon_${auth.id}`) ??
      sessionStorage.getItem(`client_anon_${window.location.pathname.split("/")[4] ?? ""}`) ??
      null;

    // Sem anon_key → null (cliente sem banco configurado corretamente)
    if (!anonKey) return null;

    // Cria/reutiliza cliente Supabase isolado para este cliente específico
    const client = createClientSupabase(auth.client_supabase_url, anonKey);

    // Injeta o access_token da sessão JWT para ativar RLS por usuário
    if (auth.session?.access_token) {
      client.auth.setSession({
        access_token:  auth.session.access_token,
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
