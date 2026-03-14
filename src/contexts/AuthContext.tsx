import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
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
  signUp: (email: string, password: string, fullName: string, invitationToken: string) => Promise<void>;
  signUpWithCode: (email: string, password: string, fullName: string, registrationCode: string) => Promise<void>;
  signOut: () => Promise<void>;
  refetchProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchProfile = useCallback(async (user: User) => {
    const uid = user.id;

    try {
      // Pequeno delay para garantir que o perfil tenha sido criado no backend se for um novo usuário
      await new Promise(resolve => setTimeout(resolve, 500));

      // 1. Tentar buscar via RPC (ignora RLS)
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_my_profile');
      if (!rpcError && rpcData) {
        const p = rpcData as unknown as Profile;
        setProfile(p);
        setError(null);
        return p;
      }

      // 2. Tentar buscar diretamente na tabela profiles
      const { data, error: selectError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .maybeSingle();

      if (data) {
        const p = data as Profile;
        setProfile(p);
        setError(null);
        return p;
      }

      // 3. Se não encontrar, tentar bootstrap via Edge Function
      console.log("Perfil não encontrado, tentando bootstrap...");
      try {
        const { data: fnData, error: fnError } = await supabase.functions.invoke('bootstrap-profile', { body: {} });
        if (!fnError && fnData?.profile) {
          const p = fnData.profile as Profile;
          setProfile(p);
          setError(null);
          return p;
        }
      } catch (e) {
        console.warn("Edge Function falhou, tentando criação manual...");
      }

      // 4. Criação manual de Organização e Perfil (Fallback final)
      try {
        const orgSlug = user.email?.split('@')[0]?.replace(/[^a-z0-9]/g, '') || 'org';
        const uniqueSlug = `${orgSlug}-${uid.slice(0, 8)}`;
        
        const { data: org, error: orgError } = await supabase
          .from('organizations')
          .insert({
            name: `${user.email?.split('@')[0] || 'User'}'s Organization`,
            slug: uniqueSlug,
          })
          .select('id')
          .single();

        if (orgError && !orgError.message.includes("duplicate key")) {
          throw orgError;
        }

        let finalOrgId = org?.id;
        
        if (!finalOrgId) {
          // Tenta buscar se a org já existir (caso o insert tenha falhado por conflito de slug)
          const { data: existingOrg } = await supabase
            .from('organizations')
            .select('id')
            .eq('slug', uniqueSlug)
            .maybeSingle();
          
          if (existingOrg) {
            finalOrgId = existingOrg.id;
          } else {
            throw new Error("Falha ao criar ou encontrar organização vinculada.");
          }
        }

        const { data: newProfile, error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: uid,
            organization_id: finalOrgId,
            full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Novo Usuário',
            email: user.email!,
            role: 'owner',
          })
          .select('*')
          .single();

        if (profileError) throw profileError;

        if (newProfile) {
          const p = newProfile as Profile;
          setProfile(p);
          setError(null);
          return p;
        }
      } catch (manualError) {
        console.error("Falha na criação manual de perfil:", manualError);
        throw manualError;
      }

      return null;
    } catch (err) {
      console.error("Erro no fetchProfile:", err);
      setError(err as Error);
      setProfile(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const refetchProfile = useCallback(async () => {
    if (user) await fetchProfile(user);
  }, [user, fetchProfile]);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        // Usar getUser em vez de getSession para forçar verificação no servidor
        // Isso ajuda a evitar sessões fantasmas de usuários deletados mas com tokens válidos localmente
        const { data: { user: authUser }, error } = await supabase.auth.getUser();
        
        if (cancelled) return;

        if (error || !authUser) {
          console.log("Nenhuma sessão válida encontrada no servidor.");
          setUser(null);
          setProfile(null);
        } else {
          console.log("Usuário autenticado encontrado:", authUser.email);
          setUser(authUser);
          await fetchProfile(authUser);
        }
      } catch (err) {
        console.error("Erro na inicialização do Auth:", err);
        if (!cancelled) {
          setUser(null);
          setProfile(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    init();
    const fallback = setTimeout(() => {
      setLoading(false);
    }, 8000);
    return () => {
      cancelled = true;
      clearTimeout(fallback);
    };
  }, [fetchProfile]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setProfile(null);
          return;
        }
        // INITIAL_SESSION is handled by init(); skip to avoid double fetch
        if (event === 'INITIAL_SESSION') return;
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchProfile(session.user);
        }
      }
    );
    return () => subscription.unsubscribe();
  }, [fetchProfile]);

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
    async (email: string, password: string, fullName: string, invitationToken: string) => {
      setError(null);
      const { error: err } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName || email.split('@')[0],
            invitation_token: invitationToken.trim(),
          },
        },
      });
      if (err) throw err;
      // onAuthStateChange(SIGNED_IN) will handle fetchProfile if session exists
    },
    []
  );

  const signUpWithCode = useCallback(
    async (email: string, password: string, fullName: string, registrationCode: string) => {
      setError(null);
      const { error: err } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName || email.split('@')[0],
            registration_code: registrationCode.trim(),
          },
        },
      });
      if (err) throw err;
      // onAuthStateChange(SIGNED_IN) will handle fetchProfile if session exists
    },
    []
  );

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
