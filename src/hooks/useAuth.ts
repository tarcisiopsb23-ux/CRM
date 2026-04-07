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
    const role = payload.role ?? payload.user_metadata?.role ?? "member";
    const tenantId =
      payload.tenant_id ?? payload.user_metadata?.tenant_id ?? null;
    setState({
      session,
      user: session.user,
      tenantId,
      role,
      isSupport: role === "support",
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
