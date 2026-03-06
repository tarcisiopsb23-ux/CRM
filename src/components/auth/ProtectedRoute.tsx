import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import type { UserRole } from '@/types/auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Required role (user must have at least this role). Omit to allow any authenticated user. */
  requireRole?: UserRole;
  /** Redirect path when not authenticated */
  redirectTo?: string;
}

export function ProtectedRoute({
  children,
  requireRole,
  redirectTo = '/login',
}: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Carregando...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  if (requireRole && profile) {
    const ROLE_ORDER: UserRole[] = ['viewer', 'member', 'manager', 'admin', 'owner'];
    const userLevel = ROLE_ORDER.indexOf(profile.role);
    const requiredLevel = ROLE_ORDER.indexOf(requireRole);
    if (userLevel < requiredLevel) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <h2 className="text-xl font-semibold text-gray-dark">
            Acesso negado
          </h2>
          <p className="text-gray-500">
            Você não tem permissão para acessar esta página.
          </p>
        </div>
      );
    }
  }

  return <>{children}</>;
}
