import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import type { UserRole } from '@/types/auth';
import { Button } from '@/components/ui/button';

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
  const { user, profile, loading, error, refetchProfile, signOut } = useAuth();
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

  if (user && !profile && !loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <h2 className="text-xl font-semibold text-foreground">
          Perfil não encontrado
        </h2>
        <p className="text-muted-foreground text-center max-w-md">
          {error ? (
            <>
              Erro ao carregar seu perfil. Verifique se sua conta está vinculada a uma organização.
              <br />
              <small className="mt-2 text-xs text-red-400">
                {error.message}
              </small>
            </>
          ) : (
            'Seu perfil não foi carregado. Isso pode acontecer se sua conta ainda não estiver configurada.'
          )}
        </p>
        <div className="flex gap-2">
          <Button onClick={() => refetchProfile()} variant="outline">
            Tentar novamente
          </Button>
          <Button onClick={() => signOut()} variant="ghost" className="text-red-400 hover:text-red-300">
            Limpar dados e Sair
          </Button>
        </div>
      </div>
    );
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
