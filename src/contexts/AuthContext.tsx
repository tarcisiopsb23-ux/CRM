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
  const fetchingProfileRef = useRef<string | null>(null);

  const fetchProfile = useCallback(async (user: User) => {
    const uid = user.id;

    // Evitar chamadas simultâneas para o mesmo usuário
    if (fetchingProfileRef.current === uid) {
      console.log("[Auth] Já existe uma busca de perfil em andamento para este UID, ignorando...");
      return;
    }

    fetchingProfileRef.current = uid;
    console.log("[Auth] Iniciando fetchProfile para:", user.email, "UID:", uid);

    try {
      // Verificação rápida de internet
      if (!window.navigator.onLine) {
        throw new Error("Você parece estar offline. Verifique sua conexão.");
      }

      // Pequeno delay para garantir que o perfil tenha sido criado no backend se for um novo usuário
      await new Promise(resolve => setTimeout(resolve, 800));

      // 1. Tentar buscar diretamente na tabela profiles (Invertido: SELECT antes de RPC)
      console.log("[Auth] 1. Tentando SELECT direto na tabela profiles (timeout 8s)...");
      const selectPromise = supabase
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .maybeSingle();

      const timeoutPromiseSelect = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Timeout na chamada SELECT")), 8000)
      );

      try {
        const selectResult = await Promise.race([selectPromise, timeoutPromiseSelect]) as any;
        const { data, error: selectError } = selectResult;

        if (data) {
          console.log("[Auth] SELECT sucesso:", data);
          const p = data as Profile;
          setProfile(p);
          setError(null);
          return p;
        }
        if (selectError) console.warn("[Auth] SELECT erro:", selectError.message);
        else if (!data) console.log("[Auth] SELECT retornou nulo (perfil não existe)");
      } catch (err: any) {
        console.warn("[Auth] Falha ou timeout no SELECT:", err.message);
      }

      // 2. Tentar buscar via RPC (com timeout de 8 segundos)
      console.log("[Auth] 2. Tentando RPC get_my_profile (timeout 8s)...");
      
      const rpcPromise = supabase.rpc('get_my_profile');
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Timeout na chamada RPC")), 8000)
      );

      let rpcResult;
      try {
        rpcResult = await Promise.race([rpcPromise, timeoutPromise]) as any;
        const { data: rpcData, error: rpcError } = rpcResult;
        
        if (!rpcError && rpcData) {
          console.log("[Auth] RPC sucesso:", rpcData);
          const p = rpcData as unknown as Profile;
          setProfile(p);
          setError(null);
          return p;
        }
        if (rpcError) console.warn("[Auth] RPC erro:", rpcError.message);
        else if (!rpcData) console.log("[Auth] RPC retornou nulo (perfil não existe)");
      } catch (err: any) {
        console.warn("[Auth] Falha ou timeout no RPC:", err.message);
        if (err.message.includes("Timeout")) {
          console.error("[Auth] DICA: Se você usa a extensão 'Mapify', ela pode estar bloqueando esta requisição. Tente desativá-la ou use o modo incógnito.");
        }
      }

      // 3. Se não encontrar, tentar bootstrap via Edge Function (com timeout)
      console.log("[Auth] 3. Perfil não encontrado, tentando bootstrap via Edge Function...");
      try {
        const fnPromise = supabase.functions.invoke('bootstrap-profile', { body: {} });
        const fnTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout Edge Function")), 10000));
        
        const fnResult = await Promise.race([fnPromise, fnTimeout]) as any;
        const { data: fnData, error: fnError } = fnResult;

        if (!fnError && fnData?.profile) {
          console.log("[Auth] Edge Function sucesso:", fnData.profile);
          const p = fnData.profile as Profile;
          setProfile(p);
          setError(null);
          return p;
        }
        if (fnError) console.warn("[Auth] Edge Function erro:", fnError.message);
      } catch (e) {
        console.warn("[Auth] Edge Function falhou ou timeout:", e);
      }

      // 4. Criação manual de Organização e Perfil (Fallback final)
      console.log("[Auth] 4. Tentando criação manual de Organização e Perfil...");
      try {
        const orgSlug = user.email?.split('@')[0]?.replace(/[^a-z0-9]/g, '') || 'org';
        const uniqueSlug = `${orgSlug}-${uid.slice(0, 8)}`;
        
        console.log("[Auth] Criando organização com slug:", uniqueSlug);
        
        // Timeout de 10s para criação de organização
        const orgPromise = supabase
          .from('organizations')
          .insert({
            name: `${user.email?.split('@')[0] || 'User'}'s Organization`,
            slug: uniqueSlug,
          })
          .select('id')
          .single();
        
        const orgTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout Criar Org")), 10000));
        const orgResult = await Promise.race([orgPromise, orgTimeout]) as any;
        const { data: org, error: orgError } = orgResult;

        if (orgError && !orgError.message.includes("duplicate key")) {
          console.error("[Auth] Erro ao criar organização:", orgError.message);
          throw orgError;
        }

        let finalOrgId = org?.id;
        
        if (!finalOrgId) {
          console.log("[Auth] Organização já existe ou falhou insert, buscando ID...");
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

        console.log("[Auth] Criando perfil vinculado à org:", finalOrgId);
        
        // Timeout de 10s para criação de perfil
        const profilePromise = supabase
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
          
        const profileTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout Criar Perfil")), 10000));
        const profileResult = await Promise.race([profilePromise, profileTimeout]) as any;
        const { data: newProfile, error: profileError } = profileResult;

        if (profileError) {
          console.error("[Auth] Erro ao criar perfil manual:", profileError.message);
          throw profileError;
        }

        if (newProfile) {
          console.log("[Auth] Perfil manual criado com sucesso:", newProfile);
          const p = newProfile as Profile;
          setProfile(p);
          setError(null);
          return p;
        }
      } catch (manualError) {
        console.error("[Auth] Falha crítica na criação manual:", manualError);
        throw manualError;
      }

      console.error("[Auth] Fim do fetchProfile sem encontrar ou criar perfil.");
      setError(new Error("Não foi possível carregar ou criar seu perfil. Por favor, contate o suporte."));
      return null;
    } catch (err) {
      console.error("[Auth] Erro geral no fetchProfile:", err);
      setError(err as Error);
      setProfile(null);
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
    let initialCheckDone = false;

    const init = async () => {
      try {
        // Tentar recuperar usuário atual
        const { data: { user: authUser }, error } = await supabase.auth.getUser();
        
        if (cancelled) return;

        if (authUser) {
          console.log("[Auth] Usuário recuperado no init:", authUser.email);
          setUser(authUser);
          await fetchProfile(authUser);
        } else {
          console.log("[Auth] Nenhum usuário no init, aguardando onAuthStateChange...");
        }
      } catch (err) {
        console.error("[Auth] Erro no init:", err);
      } finally {
        initialCheckDone = true;
        // Não definimos loading(false) aqui para evitar o flicker do "Perfil não encontrado"
        // Deixamos o onAuthStateChange ou o fetchProfile cuidar disso.
      }
    };

    init();

    // Listener para mudanças de estado (Login/Logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (cancelled) return;
        
        console.log("[Auth] Evento de autenticação:", event);

        const authUser = session?.user ?? null;

        if (event === 'SIGNED_OUT') {
          setUser(null);
          setProfile(null);
          setLoading(false);
          return;
        }

        // Para eventos de entrada ou refresh, carregamos o perfil
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
          if (authUser) {
            setUser(authUser);
            await fetchProfile(authUser);
          } else if (event === 'INITIAL_SESSION') {
            // Se INITIAL_SESSION disparar e não houver usuário, aí sim paramos o loading
            setLoading(false);
          }
        }
      }
    );

    // Fallback de segurança: se nada acontecer em 12 segundos, libera o loading
    const fallback = setTimeout(() => {
      if (!cancelled) {
        console.warn("[Auth] Fallback de carregamento acionado após 12s");
        setLoading(false);
      }
    }, 12000);

    return () => {
      cancelled = true;
      clearTimeout(fallback);
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
