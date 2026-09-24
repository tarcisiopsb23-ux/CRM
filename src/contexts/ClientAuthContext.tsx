/**
 * ClientAuthContext — Banco A unificado
 *
 * Todos os clientes operam no Banco A.
 * A sessão JWT é sempre do Banco A.
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
  /**
   * @deprecated Substituído por automation_enabled.
   * Mantido para compatibilidade com clientes antigos — quando
   * automation_enabled for true, whatsapp_enabled é ignorado na sidebar.
   */
  whatsapp_enabled?: boolean;
  demographics_enabled?: boolean;
  ia_enabled?: boolean;
  /** Módulo Agenda — agendamentos online + Google Calendar */
  agenda_enabled?: boolean;
  /** Dashboard de resultados */
  dashboard_enabled?: boolean;
  max_contacts?: number;
  max_users?: number;
  asaas_enabled?: boolean;
  pixel_config?: {
    meta_pixel_id?: string;
    google_tag_id?: string;
  };
  /** Acesso gratuito liberado (vinculado a outro contrato, ex: assessoria) */
  c8_free_access?: boolean;
  /** Acesso incluído em contrato pai — sem cobrança separada */
  c8_included?: boolean;
  free_access_until?: string | null;
  free_access_reason?: string | null;
  /**
   * Módulo Mensagens — Caixa de Entrada e Histórico de conversas com
   * clientes finais via WhatsApp/Instagram (canal oficial Meta).
   */
  messaging_enabled?: boolean;
  /**
   * Módulo Chatbot — Canais (conexão Instagram/WhatsApp via Meta),
   * Meu Agente (configuração do agente IA), Conhecimento (base de
   * conhecimento estruturada) e futuras Automações e Integrações.
   * Quando true, substitui whatsapp_enabled e show_ia_content na sidebar.
   */
  automation_enabled?: boolean;
}

/** Dados do cliente vindos do Banco A (imutáveis durante a sessão) */
export interface ClientInfo {
  id: string;
  organization_id: string;
  name: string;
  company: string | null;
  favicon_url: string | null;
  show_ia_content: boolean;
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
  user: DynamicUser;
  /** Sessão JWT do Banco A */
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
    if (!parsed?.id || !parsed?.authenticated || !parsed?.session?.access_token) return null;
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
  // Nunca persistir anon_key
  const safe: ClientAuth = { ...auth };
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
    navigate(`/${slug}/login`);
  }, [slug, navigate]);

  return (
    <ClientAuthContext.Provider value={{ auth, slug, setAuth, updateSession, logout }}>
      {children}
    </ClientAuthContext.Provider>
  );
}
