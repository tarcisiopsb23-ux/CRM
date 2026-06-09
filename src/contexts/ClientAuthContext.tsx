/**
 * ClientAuthContext — Fase 1 (T-1.2)
 *
 * Substituição da autenticação por senha única por sessão JWT
 * do Supabase Auth do Banco B (multi-usuário com roles).
 *
 * O que está armazenado no contexto:
 * - Dados estáticos do cliente (vindos do Banco A via RPC get_client_by_slug)
 * - Dados do usuário autenticado (vindos do Banco B via crm_users)
 * - Sessão JWT (access_token, nunca a senha)
 *
 * O que NÃO é armazenado:
 * - Senhas
 * - anon_key do Banco B (fica em variável de ambiente)
 * - Tokens OAuth de Meta/Google
 */

import { createContext, ReactNode, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import type { DynamicUser } from "@/hooks/useDynamicAuth";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ConversionMetricsConfig {
  lead_field?: string;
  sale_field?: string;
  lead_fields?: string[];
  sale_fields?: string[];
}

export interface ModulesConfig {
  crm_enabled?: boolean;
  whatsapp_enabled?: boolean;
  demographics_enabled?: boolean;
  ia_enabled?: boolean;
  max_contacts?: number;
  max_users?: number;
  asaas_enabled?: boolean;
  pixel_config?: {
    meta_pixel_id?: string;
    google_tag_id?: string;
  };
}

/** Dados do cliente vindos do Banco A (imutáveis durante a sessão) */
export interface ClientInfo {
  id: string;
  organization_id: string;
  name: string;
  company: string | null;
  favicon_url: string | null;
  show_ia_content: boolean;
  client_supabase_url: string | null;
  client_supabase_anon_key: string | null;
  metadata: {
    dashboard_performance: boolean;
    dashboard_atendimento: boolean;
    conversion_metrics?: ConversionMetricsConfig;
    dashboard_kpis?: string[];
    geral_dashboard_cards?: string[];
    kpi_order?: string[];
  };
  modules_config?: ModulesConfig;
}

/** Estado completo de autenticação */
export interface ClientAuth extends ClientInfo {
  authenticated: true;
  // Usuário autenticado no Banco B
  user: DynamicUser;
  // Sessão JWT do Banco B (access_token para uso no useDynamicClient)
  session: Session;
}

export interface ClientAuthContextValue {
  auth: ClientAuth | null;
  slug: string;
  setAuth: (auth: ClientAuth) => void;
  updateSession: (session: Session, user: DynamicUser) => void;
  logout: () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

export const ClientAuthContext = createContext<ClientAuthContextValue | null>(null);

// ─── Storage helpers (nunca armazena senha ou anon_key) ──────────────────────

const STORAGE_KEY = (slug: string) => `client_auth_v2_${slug}`;

function loadFromStorage(slug: string): ClientAuth | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClientAuth;
    // Valida que tem os campos mínimos
    if (!parsed?.id || !parsed?.authenticated || !parsed?.session?.access_token) return null;
    // Verifica expiração do token JWT
    const exp = parsed.session.expires_at;
    if (exp && Date.now() / 1000 > exp) {
      sessionStorage.removeItem(STORAGE_KEY(slug));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveToStorage(slug: string, auth: ClientAuth): void {
  // Remove anon_key antes de salvar — ela virá de env vars
  const safe: ClientAuth = {
    ...auth,
    client_supabase_anon_key: null, // nunca persistir
  };
  sessionStorage.setItem(STORAGE_KEY(slug), JSON.stringify(safe));
}

function clearStorage(slug: string): void {
  sessionStorage.removeItem(STORAGE_KEY(slug));
  // Limpa também o formato antigo (senha única) para migração hard
  localStorage.removeItem(`client_auth_${slug}`);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ClientAuthProvider({
  children,
  slug,
}: {
  children: ReactNode;
  slug: string;
}) {
  const navigate = useNavigate();

  const [auth, setAuthState] = useState<ClientAuth | null>(() => {
    return loadFromStorage(slug);
  });

  const setAuth = useCallback((newAuth: ClientAuth) => {
    saveToStorage(slug, newAuth);
    setAuthState(newAuth);
  }, [slug]);

  /** Atualiza apenas sessão/user sem re-buscar dados do cliente */
  const updateSession = useCallback((session: Session, user: DynamicUser) => {
    setAuthState(prev => {
      if (!prev) return null;
      const updated: ClientAuth = { ...prev, session, user };
      saveToStorage(slug, updated);
      return updated;
    });
  }, [slug]);

  const logout = useCallback(() => {
    clearStorage(slug);
    setAuthState(null);
    navigate(`/public/dashboard/${slug}/login`);
  }, [slug, navigate]);

  return (
    <ClientAuthContext.Provider value={{ auth, slug, setAuth, updateSession, logout }}>
      {children}
    </ClientAuthContext.Provider>
  );
}
