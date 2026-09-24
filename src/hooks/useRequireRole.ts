import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { UserRole } from '@/types/auth';

const ROLE_HIERARCHY: UserRole[] = ['owner', 'admin', 'manager', 'member', 'viewer'];

function roleLevel(role: UserRole): number {
  const idx = ROLE_HIERARCHY.indexOf(role);
  return idx >= 0 ? idx : -1;
}

/** Returns whether the current user has at least the given role. */
export function useRequireRole(requiredRole: UserRole): boolean {
  const { profile } = useAuth();
  return useMemo(() => {
    if (!profile?.role) return false;
    return roleLevel(profile.role) <= roleLevel(requiredRole);
  }, [profile?.role, requiredRole]);
}
