import { createContext, ReactNode, useState } from "react";
import { useNavigate } from "react-router-dom";

export interface ConversionMetricsConfig {
  lead_field: string;
  sale_field: string;
}

export interface ClientAuth {
  id: string;
  organization_id: string;
  name: string;
  company: string | null;
  favicon_url: string | null;
  authenticated: true;
  show_ia_content: boolean;
  client_supabase_url: string | null;
  client_supabase_anon_key: string | null;
  metadata: {
    dashboard_performance: boolean;
    dashboard_atendimento: boolean;
    conversion_metrics?: ConversionMetricsConfig;
    dashboard_kpis?: string[];
    geral_dashboard_cards?: string[];
  };
}

export interface ClientAuthContextValue {
  auth: ClientAuth | null;
  slug: string;
  setAuth: (auth: ClientAuth) => void;
  logout: () => void;
}

export const ClientAuthContext = createContext<ClientAuthContextValue | null>(null);

export function ClientAuthProvider({
  children,
  slug,
}: {
  children: ReactNode;
  slug: string;
}) {
  const navigate = useNavigate();

  const [auth, setAuthState] = useState<ClientAuth | null>(() => {
    const raw = localStorage.getItem(`client_auth_${slug}`);
    return raw ? (JSON.parse(raw) as ClientAuth) : null;
  });

  const setAuth = (newAuth: ClientAuth) => {
    localStorage.setItem(`client_auth_${slug}`, JSON.stringify(newAuth));
    setAuthState(newAuth);
  };

  const logout = () => {
    localStorage.removeItem(`client_auth_${slug}`);
    setAuthState(null);
    navigate(`/public/dashboard/${slug}/login`);
  };

  return (
    <ClientAuthContext.Provider value={{ auth, slug, setAuth, logout }}>
      {children}
    </ClientAuthContext.Provider>
  );
}
