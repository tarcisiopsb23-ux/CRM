import { useAuth } from '@/contexts/AuthContext';

/** Returns the current user's organization ID from their profile. */
export function useOrganization() {
  const { profile } = useAuth();
  return profile?.organization_id ?? undefined;
}
