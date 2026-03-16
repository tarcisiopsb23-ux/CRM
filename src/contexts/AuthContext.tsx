import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import type { Profile } from '@/types/auth';

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  error: Error | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string, invitationToken: string, metadata?: Record<string, any>) => Promise<void>;
  signUpWithCode: (email: string, password: string, fullName: string, registrationCode: string, metadata?: Record<string, any>) => Promise<void>;
  signOut: () => Promise<void>;
  refetchProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const fetchingProfileRef = useRef<string | null>(null);

  const fetchProfile = useCallback(async (user: User) => {
    const uid = user.id;

    if (fetchingProfileRef.current === uid) return;
    fetchingProfileRef.current = uid;

    try {
      // 1. SELECT direto (mais rápido e menos bloqueado)
      const { data, error: selectError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .maybeSingle();

      if (data) {
        setProfile(data as Profile);
        setError(null);
        return data as Profile;
      }

      // 2. Se não encontrou no SELECT, tenta RPC como fallback
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_my_profile');
      if (rpcData) {
        setProfile(rpcData as unknown as Profile);
        setError(null);
        return rpcData as unknown as Profile;
      }

      // 3. Se ainda não encontrou, tenta criar o perfil (fluxo simplificado)
      console.log("[Auth] Perfil não encontrado, criando novo perfil...");
      const orgSlug = user.email?.split('@')[0]?.replace(/[^a-z0-9]/g, '') || 'org';
      const uniqueSlug = `${orgSlug}-${uid.slice(0, 5)}`;
      
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({ name: `${orgSlug.toUpperCase()} Org`, slug: uniqueSlug })
        .select('id')
        .single();

      const orgId = org?.id;
      if (!orgId && !orgError?.message.includes("duplicate")) throw new Error("Falha ao vincular organização");

      const { data: newProfile, error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: uid,
          organization_id: orgId || (await supabase.from('organizations').select('id').eq('slug', uniqueSlug).single()).data?.id,
          full_name: user.user_metadata?.full_name || orgSlug,
          email: user.email!,
          role: 'owner'
        })
        .select('*')
        .single();

      if (newProfile) {
        setProfile(newProfile as Profile);
        setError(null);
        return newProfile as Profile;
      }

      throw new Error("Não foi possível carregar seu perfil.");
    } catch (err) {
      const error = err as Error;
      console.error("[Auth] Erro no carregamento do perfil:", error.message);
      setError(error);
      return null;
    } finally {
      fetchingProfileRef.current = null;
      setLoading(false);
    }
  }, []);

  const refetchProfile = useCallback(async () => {
    if (user) await fetchProfile(user);
  }, [user, fetchProfile]);

  const signOut = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      
      // Tentar logout via Supabase
      await supabase.auth.signOut();
      
      // Limpeza manual para garantir que nada sobrou
      // (Alguns problemas de cookies/cache persistem após signOut)
      localStorage.clear();
      sessionStorage.clear();
      
      // Limpar cookies do Supabase
      const cookies = document.cookie.split(";");
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i];
        const eqPos = cookie.indexOf("=");
        const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
        if (name.trim().includes("sb-")) {
          document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
        }
      }
      
      setUser(null);
      setProfile(null);
    } catch (err) {
      console.error("Erro no signOut:", err);
    } finally {
      setLoading(false);
      window.location.href = '/login'; // Forçar refresh total
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    // 1. Verificar sessão atual imediatamente
    supabase.auth.getUser().then(({ data: { user: authUser } }) => {
      if (cancelled) return;
      if (authUser) {
        setUser(authUser);
        fetchProfile(authUser);
      } else {
        setLoading(false);
      }
    });

    // 2. Ouvir mudanças de estado
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;
      
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        const u = session?.user ?? null;
        setUser(u);
        if (u) fetchProfile(u);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    const INACTIVITY_LIMIT = 5 * 60 * 1000; // 5 minutos

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (user) {
        timeoutId = setTimeout(() => {
          console.log("[Auth] Logout por inatividade (5 minutos)");
          signOut();
        }, INACTIVITY_LIMIT);
      }
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    
    if (user) {
      events.forEach(event => window.addEventListener(event, resetTimer));
      resetTimer();
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      events.forEach(event => window.removeEventListener(event, resetTimer));
    };
  }, [user, signOut]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      // Ao fechar a aba, limpamos o estado local.
      // Como usamos window.sessionStorage no lib/supabase.ts, a sessão morre aqui.
      console.log("[Auth] Janela fechada, limpando sessão...");
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (err) throw err;
    // onAuthStateChange(SIGNED_IN) will handle fetchProfile
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, fullName: string, invitationToken: string, metadata?: Record<string, any>) => {
      setError(null);
      const { error: err } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName || email.split('@')[0],
            invitation_token: invitationToken.trim(),
            ...metadata
          },
        },
      });
      if (err) throw err;
      // onAuthStateChange(SIGNED_IN) will handle fetchProfile if session exists
    },
    []
  );

  const signUpWithCode = useCallback(
    async (email: string, password: string, fullName: string, registrationCode: string, metadata?: Record<string, any>) => {
      setError(null);
      const { error: err } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName || email.split('@')[0],
            registration_code: registrationCode.trim(),
            ...metadata
          },
        },
      });
      if (err) throw err;
      // onAuthStateChange(SIGNED_IN) will handle fetchProfile if session exists
    },
    []
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      error,
      signIn,
      signUp,
      signUpWithCode,
      signOut,
      refetchProfile,
    }),
    [user, profile, loading, error, signIn, signUp, signUpWithCode, signOut, refetchProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
