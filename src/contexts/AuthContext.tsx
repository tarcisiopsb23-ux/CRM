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
    setLoading(true); // indicate profile fetch in progress
    const uid = user.id;

    try {
      // Prefer RPC (bypasses RLS - if migration 00016 not applied, fallback to direct query
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_my_profile');
      if (!rpcError && rpcData) {
        const p = rpcData as unknown as Profile;
        setError(null);
        setProfile(p);
        return p;
      }

      // Fallback: direct query (RLS applies)
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .maybeSingle();
      if (error) {
        try {
          const { data: fnData, error: fnError } = await supabase.functions.invoke('bootstrap-profile', { body: {} });
          if (!fnError && fnData?.profile) {
            const p = fnData.profile as Profile;
            setError(null);
            setProfile(p);
            return p;
          }
        } catch (e) {
          void e;
        }
        setError(error);
        setProfile(null);
        return null;
      }
      if (data) {
        const p = data as Profile;
        setError(null);
        setProfile(p);
        return p;
      }

      // Profile not found, try to create it
      console.log("Perfil não encontrado, tentando criar perfil inicial...");
      try {
        const { data: fnData, error: fnError } = await supabase.functions.invoke('bootstrap-profile', { body: {} });
        if (!fnError && fnData?.profile) {
          const p = fnData.profile as Profile;
          console.log("Perfil criado via Edge Function!");
          setError(null);
          setProfile(p);
          return p;
        }
        if (fnError) console.warn("Edge Function 'bootstrap-profile' falhou:", fnError.message);
      } catch (e) {
        console.error("Erro ao invocar Edge Function:", e);
      }
      
      try {
        console.log("Tentando criação manual de organização e perfil...");
        // Create organization first
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
        
        if (orgError) {
          console.error("Erro ao criar organização:", orgError.message);
          throw orgError;
        }

        const { data: newProfile, error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: uid,
            organization_id: org.id,
            full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Novo Usuário',
            role: 'owner',
          })
          .select('*')
          .single();

        if (profileError) {
          console.error("Erro ao criar perfil:", profileError.message);
          throw profileError;
        }

        if (newProfile) {
          console.log("Perfil e Organização criados com sucesso!");
          const p = newProfile as Profile;
          setError(null);
          setProfile(p);
          return p;
        }
      } catch (e) {
        console.error("Falha na criação manual:", e);
      }
      
      setError(new Error("Não foi possível carregar ou criar seu perfil. Verifique se as tabelas do banco de dados foram criadas."));
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
        const { data: { session }, error } = await supabase.auth.getSession();
        if (cancelled) return;
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchProfile(session.user);
        } else {
          setProfile(null);
        }
      } catch (err) {
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
    setError(null);
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
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
