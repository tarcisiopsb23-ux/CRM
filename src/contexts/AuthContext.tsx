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
    console.debug('[Auth] fetchProfile start', user);
    const uid = user.id;

    // Prefer RPC (bypasses RLS) - if migration 00016 not applied, fallback to direct query
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_my_profile');
    console.debug('[Auth] rpc result', { rpcData, rpcError });
    if (!rpcError && rpcData) {
      const p = rpcData as unknown as Profile;
      console.debug('[Auth] rpc profile', p);
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
    console.debug('[Auth] query profile', { data, error });
    if (error) {
      setError(error);
      setProfile(null);
      return null;
    }
    if (data) {
      const p = data as Profile;
      console.debug('[Auth] found profile via query', p);
      setError(null);
      setProfile(p);
      return p;
    }

    // Profile not found, try to create it
    console.debug('[Auth] profile missing; attempting creation');
    try {
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
      if (orgError) throw orgError;
      console.debug('[Auth] organization created', org);

      // Create profile
      const { data: newProfile, error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: uid,
          organization_id: org.id,
          full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
          email: user.email!,
          role: 'owner',
        })
        .select()
        .single();
      if (insertError) throw insertError;

      const p = newProfile as Profile;
      console.debug('[Auth] profile created', p);
      setError(null);
      setProfile(p);
      return p;
    } catch (createError) {
      console.error('[Auth] Failed to create profile:', createError);
      setError(createError as Error);
      setProfile(null);
      return null;
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
        if (error) {
          console.warn('[Auth] getSession error:', error);
        }
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchProfile(session.user);
        } else {
          setProfile(null);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('[Auth] Init failed:', err);
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
        console.debug('[Auth] onAuthStateChange', event, session);
        // clear user/profile only on explicit sign out or user deletion
        if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
          setUser(null);
          setProfile(null);
          return;
        }
        // for all other events, update user and refetch profile
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
    const { error: err, data } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (err) throw err;
    // After signing in, fetch profile immediately
    if (data?.session?.user) {
      await fetchProfile(data.session.user);
    } else {
      // try again via refetchProfile in case subscription handles it
      await refetchProfile();
    }
  }, [fetchProfile, refetchProfile]);

  const signUp = useCallback(
    async (email: string, password: string, fullName: string, invitationToken: string) => {
      setError(null);
      const { error: err, data } = await supabase.auth.signUp({
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
      if (data?.user) {
        await fetchProfile(data.user);
      }
    },
    [fetchProfile]
  );

  const signUpWithCode = useCallback(
    async (email: string, password: string, fullName: string, registrationCode: string) => {
      setError(null);
      const { error: err, data } = await supabase.auth.signUp({
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
      if (data?.user) {
        await fetchProfile(data.user);
      }
    },
    [fetchProfile]
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
