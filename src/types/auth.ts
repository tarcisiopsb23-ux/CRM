/** User roles – hierarchy: owner > admin > manager > member > viewer */
export type UserRole = 'owner' | 'admin' | 'manager' | 'member' | 'viewer';

export interface Profile {
  id: string;
  organization_id: string | null;
  full_name: string;
  email: string;
  avatar_url: string | null;
  role: UserRole;
  phone: string | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email?: string;
}

export interface AuthState {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  error: Error | null;
}
