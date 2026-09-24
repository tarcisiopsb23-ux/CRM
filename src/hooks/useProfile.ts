import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types/auth';

/** Fetches profile for a given user ID. Use useAuth() for the current user. */
export function useProfile(userId: string | undefined) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(!!userId);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    if (!userId) return null;
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    setLoading(false);
    if (error) {
      setError(error);
      return null;
    }
    const p = data ? (data as Profile) : null;
    setProfile(p);
    return p;
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    refetch();
  }, [userId, refetch]);

  return { profile, loading, error, refetch };
}
