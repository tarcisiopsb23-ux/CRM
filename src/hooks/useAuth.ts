import { useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabaseAuth } from "@/lib/supabase-auth";

interface AuthState {
  session: Session | null;
  user: User | null;
  tenantId: string | null;
  role: string;
  isSupport: boolean;
  loading: boolean;
}

function parseJwtPayload(token: string): Record<string, any> {
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return {};
  }
}

// Roles da agência (Maestr.ia) que têm acesso ao CRM sem vínculo com tenant
const AGENCY_ROLES = ["agency", "support"] as const;

export function isAgencyRole(role: string): boolean {
  return (AGENCY_ROLES as readonly string[]).includes(role);
}

/** Roles com acesso total de gerenciamento (admin do tenant + owner + suporte da agência) */
export function canManageRole(role: string, isSupport: boolean): boolean {
  // Acesso liberado para: suporte, admin, owner, agency
  // Também libera se role não for explicitamente "member" ou "viewer"
  // (cobre casos onde o JWT hook não está ativo e role vem como string vazia ou undefined)
  if (isSupport) return true;
  if (role === "admin" || role === "owner" || role === "agency") return true;
  // Fallback: se o role não for um role restritivo conhecido, libera
  const restrictedRoles = ["member", "viewer"];
  return !restrictedRoles.includes(role);
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    tenantId: null,
    role: "member",
    isSupport: false,
    loading: true,
  });

  useEffect(() => {
    supabaseAuth.auth.getSession().then(({ data: { session } }) => {
      applySession(session);
    });

    const {
      data: { subscription },
    } = supabaseAuth.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  function applySession(session: Session | null) {
    if (!session) {
      setState({
        session: null,
        user: null,
        tenantId: null,
        role: "member",
        isSupport: false,
        loading: false,
      });
      return;
    }
    const payload = parseJwtPayload(session.access_token);

    // Custom claims devem vir diretamente do JWT (via custom_access_token_hook).
    // O fallback para user_metadata indica que o hook JWT pode não estar configurado.
    const hasCustomClaims = "tenant_id" in payload || "role" in payload;
    if (!hasCustomClaims) {
      console.warn(
        "[useAuth] JWT sem custom claims (tenant_id/role). " +
        "Verifique se o custom_access_token_hook está configurado no SaaS Auth."
      );
    }

    // Prioridade: custom claims do JWT > user_metadata do JWT > user_metadata do objeto session
    // O terceiro fallback garante funcionamento mesmo sem o hook configurado
    const role =
      payload.role ??
      payload.user_metadata?.role ??
      session.user.user_metadata?.role ??
      "member";

    const tenantId =
      payload.tenant_id ??
      payload.user_metadata?.tenant_id ??
      session.user.user_metadata?.tenant_id ??
      null;

    // isSupport: verdadeiro se role for da agência OU se não tiver tenant_id
    // (usuário de suporte criado pelo Maestr.IA não tem tenant_id)
    const resolvedIsSupport = isAgencyRole(role) || (tenantId === null && role !== "member");

    setState({
      session,
      user: session.user,
      tenantId,
      role,
      isSupport: resolvedIsSupport,
      loading: false,
    });
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await supabaseAuth.auth.signInWithPassword({
      email,
      password,
    });
    return error;
  };

  const signOut = async () => {
    await supabaseAuth.auth.signOut();
  };

  return { ...state, signIn, signOut };
}
