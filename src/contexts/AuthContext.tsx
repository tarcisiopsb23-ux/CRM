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
  organizationId: string | null;
  loading: boolean;
  profileLoading: boolean;
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
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const fetchingProfileRef = useRef<string | null>(null);

  const fetchProfile = useCallback(async (user: User) => {
    const uid = user.id;

    if (fetchingProfileRef.current === uid) return;
    fetchingProfileRef.current = uid;

    setProfileLoading(true);

    try {
      // Verificar se há sessão válida antes de qualquer chamada REST
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.warn("[Auth] fetchProfile chamado sem sessão válida, abortando.");
        return null;
      }

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
      // Só tenta criar se não houve erro de autenticação (401)
      if (selectError && (selectError as any).status === 401) {
        console.warn("[Auth] 401 — sessão inválida, não tentando criar perfil.");
        return null;
      }
      if (rpcError && (rpcError as any).status === 401) {
        console.warn("[Auth] 401 no RPC — sessão inválida, não tentando criar perfil.");
        return null;
      }

      console.log("[Auth] Perfil não encontrado, tentando criar organização e perfil...");
      const orgSlug = user.email?.split('@')[0]?.replace(/[^a-z0-9]/g, '') || 'org';
      const uniqueSlug = `${orgSlug}-${uid.slice(0, 5)}`;
      
      let orgId: string | undefined;

      // Tenta inserir a organização
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({ name: `${orgSlug.toUpperCase()} Org`, slug: uniqueSlug })
        .select('id')
        .maybeSingle();

      if (org?.id) {
        orgId = org.id;
      } else if (orgError?.message.includes("duplicate")) {
        // Se já existe uma organização com esse slug, tenta buscar o ID dela
        const { data: existingOrg } = await supabase
          .from('organizations')
          .select('id')
          .eq('slug', uniqueSlug)
          .maybeSingle();
        orgId = existingOrg?.id;
      }

      if (!orgId) {
        console.error("[Auth] Erro ao criar/buscar organização:", orgError);
        throw new Error(`Falha ao vincular organização: ${orgError?.message || 'Erro desconhecido'}`);
      }

      // 4. Cria o perfil vinculado
      console.log("[Auth] Criando perfil vinculado à organização:", orgId);
      const { data: newProfile, error: createError } = await supabase
        .from('profiles')
        .insert({
          id: uid,
          organization_id: orgId,
          full_name: user.user_metadata?.full_name || user.email?.split('@')[0],
          email: user.email!,
          role: 'owner'
        })
        .select('*, organization:organizations(*)')
        .maybeSingle();

      if (createError || !newProfile) {
        console.error("[Auth] Erro ao criar perfil:", createError);
        throw new Error(`Falha ao criar perfil de usuário: ${createError?.message || 'Erro desconhecido'}`);
      }

      console.log("[Auth] Novo perfil criado com sucesso.");
      setProfile(newProfile as Profile);
      setError(null);
      return newProfile as Profile;
    } catch (err) {
      const error = err as Error;
      console.error("[Auth] Erro no carregamento do perfil:", error.message);
      setError(error);
      return null;
    } finally {
      fetchingProfileRef.current = null;
      setProfileLoading(false);
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
      // Preserva chaves client_auth_* (sessões independentes do dashboard do cliente)
      // Preserva chaves n8n_config_cache_* (cache de configurações para evitar flash de campos vazios)
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && !k.startsWith('client_auth_') && !k.startsWith('n8n_config_cache_')) keysToRemove.push(k);
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));

      // Remover todas as chaves de formulário persistidas (prefixo form_) — já cobertas pela limpeza do localStorage acima
      
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
      // Não redirecionar se estiver em rota pública do dashboard do cliente
      if (!window.location.pathname.startsWith('/public/')) {
        window.location.href = '/login';
      }
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

  // ── Single-session enforcement via Realtime ──────────────────────────────
  // Subscribe to the user_sessions row. When another device logs in, the
  // edge function bumps force_logout_at with a new session_token. If the
  // token stored in sessionStorage doesn't match, this session is stale and
  // must be signed out.
  useEffect(() => {
    if (!user) return;

    const myToken = sessionStorage.getItem("session_token");

    const channel = supabase
      .channel(`user_session_${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_sessions",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as { session_token?: string } | null;
          if (!row) return;
          // If the token in the DB differs from ours, another device logged in
          if (row.session_token && row.session_token !== myToken) {
            console.log("[Auth] Sessão encerrada — login detectado em outro dispositivo.");
            signOut();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, signOut]);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    const INACTIVITY_LIMIT = 30 * 60 * 1000; // 30 minutos

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      // Não disparar em rotas públicas do dashboard do cliente
      if (user && !window.location.pathname.startsWith('/public/')) {
        timeoutId = setTimeout(() => {
          console.log("[Auth] Logout por inatividade (30 minutos)");
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
      organizationId: profile?.organization_id ?? null,
      loading,
      profileLoading,
      error,
      signIn,
      signUp,
      signUpWithCode,
      signOut,
      refetchProfile,
    }),
    [user, profile, loading, profileLoading, error, signIn, signUp, signUpWithCode, signOut, refetchProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
