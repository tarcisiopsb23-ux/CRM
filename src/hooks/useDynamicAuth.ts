/**
 * useDynamicAuth
 * Gerencia a autenticação multi-usuário no Banco B (Supabase do cliente).
 *
 * Fase 1 — Fundação (T-1.3)
 *
 * Responsabilidades:
 * - Login/logout via Supabase Auth do Banco B
 * - Persistência da sessão via onAuthStateChange
 * - Leitura do role do usuário na tabela crm_users do Banco B
 * - Nunca armazena senha ou anon_key em localStorage
 */

import { useEffect, useState, useCallback } from "react";
import { createClient, type SupabaseClient, type Session, type User } from "@supabase/supabase-js";
import { createClientSupabase } from "@/lib/createClientSupabase";

export interface DynamicUser {
  id: string;
  email: string;
  full_name: string | null;
  role: "owner" | "admin" | "manager" | "member" | "viewer";
  client_id: string;
  avatar_url: string | null;
}

export interface DynamicAuthState {
  user: DynamicUser | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
}

export interface DynamicAuthActions {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
}

const RATE_LIMIT_KEY = (url: string) => `rl_login_${btoa(url).slice(0, 16)}`;
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutos

function checkRateLimit(url: string): { allowed: boolean; remaining: number } {
  const key = RATE_LIMIT_KEY(url);
  const raw = sessionStorage.getItem(key);
  const now = Date.now();

  interface RLEntry { count: number; window_start: number }
  let entry: RLEntry = raw ? JSON.parse(raw) : { count: 0, window_start: now };

  // Reseta janela se expirou
  if (now - entry.window_start > RATE_LIMIT_WINDOW_MS) {
    entry = { count: 0, window_start: now };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count };
}

function incrementRateLimit(url: string): void {
  const key = RATE_LIMIT_KEY(url);
  const raw = sessionStorage.getItem(key);
  const now = Date.now();

  interface RLEntry { count: number; window_start: number }
  let entry: RLEntry = raw ? JSON.parse(raw) : { count: 0, window_start: now };
  if (now - entry.window_start > RATE_LIMIT_WINDOW_MS) {
    entry = { count: 0, window_start: now };
  }
  entry.count += 1;
  sessionStorage.setItem(key, JSON.stringify(entry));
}

function resetRateLimit(url: string): void {
  sessionStorage.removeItem(RATE_LIMIT_KEY(url));
}

/**
 * Instancia um cliente Supabase autenticado para o Banco B.
 * Usa sempre a mesma instância cacheada para evitar múltiplas conexões WebSocket.
 */
function getBankBClient(url: string, anonKey: string): SupabaseClient {
  return createClientSupabase(url, anonKey);
}

export function useDynamicAuth(
  supabaseUrl: string | null | undefined,
  supabaseAnonKey: string | null | undefined
): DynamicAuthState & DynamicAuthActions {
  const [state, setState] = useState<DynamicAuthState>({
    user: null,
    session: null,
    loading: !!supabaseUrl,
    error: null,
  });

  const client = supabaseUrl && supabaseAnonKey
    ? getBankBClient(supabaseUrl, supabaseAnonKey)
    : null;

  // Carrega dados do usuário a partir da sessão ativa
  const loadUser = useCallback(async (
    client: SupabaseClient,
    session: Session
  ): Promise<DynamicUser | null> => {
    try {
      const { data, error } = await client
        .from("crm_users")
        .select("id, email, full_name, role, client_id, avatar_url")
        .eq("id", session.user.id)
        .eq("active", true)
        .maybeSingle();

      if (error || !data) return null;

      return {
        id: data.id,
        email: data.email,
        full_name: data.full_name ?? null,
        role: data.role as DynamicUser["role"],
        client_id: data.client_id,
        avatar_url: data.avatar_url ?? null,
      };
    } catch {
      return null;
    }
  }, []);

  // Subscreve mudanças de sessão ao montar
  useEffect(() => {
    if (!client || !supabaseUrl) {
      setState({ user: null, session: null, loading: false, error: null });
      return;
    }

    setState(s => ({ ...s, loading: true }));

    // Verifica sessão existente
    client.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        const user = await loadUser(client, session);
        setState({ user, session, loading: false, error: null });
      } else {
        setState({ user: null, session: null, loading: false, error: null });
      }
    });

    // Ouve mudanças futuras (login, logout, refresh)
    const { data: { subscription } } = client.auth.onAuthStateChange(
      async (event, session) => {
        if (session) {
          const user = await loadUser(client, session);
          setState({ user, session, loading: false, error: null });
        } else {
          setState({ user: null, session: null, loading: false, error: null });
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [supabaseUrl, supabaseAnonKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ────────────────────────────────────────────────────────────────

  const signIn = useCallback(async (
    email: string,
    password: string
  ): Promise<{ error: string | null }> => {
    if (!client || !supabaseUrl) return { error: "Credenciais do banco não configuradas." };

    // Rate limiting client-side (complementar ao server-side)
    const rl = checkRateLimit(supabaseUrl);
    if (!rl.allowed) {
      return { error: "Muitas tentativas de login. Aguarde 15 minutos e tente novamente." };
    }

    setState(s => ({ ...s, loading: true, error: null }));
    incrementRateLimit(supabaseUrl);

    const { data, error } = await client.auth.signInWithPassword({ email, password });

    if (error) {
      setState(s => ({ ...s, loading: false, error: error.message }));
      return { error: "E-mail ou senha inválidos." };
    }

    if (data.session) {
      resetRateLimit(supabaseUrl);
      const user = await loadUser(client, data.session);
      if (!user) {
        await client.auth.signOut();
        setState({ user: null, session: null, loading: false, error: null });
        return { error: "Usuário não encontrado ou desativado. Contate o administrador." };
      }
      setState({ user, session: data.session, loading: false, error: null });
    }

    return { error: null };
  }, [client, supabaseUrl, loadUser]);

  const signOut = useCallback(async () => {
    if (!client) return;
    await client.auth.signOut();
    setState({ user: null, session: null, loading: false, error: null });
  }, [client]);

  const resetPassword = useCallback(async (
    email: string
  ): Promise<{ error: string | null }> => {
    if (!client) return { error: "Credenciais do banco não configuradas." };

    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) return { error: "Erro ao enviar e-mail de recuperação." };
    return { error: null };
  }, [client]);

  return { ...state, signIn, signOut, resetPassword };
}
