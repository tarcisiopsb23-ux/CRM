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
  const { user, profile, loading, profileLoading, error, refetchProfile, signOut } = useAuth();
  const location = useLocation();

  if (loading || (profileLoading && !profile)) {
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
        <div className="text-muted-foreground text-center max-w-md text-sm">
          {error ? (
            <>
              Erro ao carregar seu perfil. Isso pode ser causado por extensões do navegador (como Mapify ou Blur) bloqueando a conexão.
              <br />
              <small className="mt-2 text-xs text-red-400 block">
                {error.message}
              </small>
              <div className="mt-4 p-2 bg-amber-500/10 border border-amber-500/20 rounded text-amber-200 text-xs">
                Sugestão: Tente desativar extensões de IA/Segurança ou use o <strong>Modo Incógnito</strong> para confirmar.
              </div>
            </>
          ) : (
            'Seu perfil não foi carregado. Isso pode acontecer se sua conta ainda não estiver configurada.'
          )}
        </div>
        <div className="flex flex-col gap-2 w-full max-w-xs">
          <Button 
            onClick={() => window.location.reload()} 
            className="w-full"
          >
            Tentar novamente
          </Button>
          <Button 
            variant="outline" 
            onClick={() => signOut()} 
            className="w-full"
          >
            Sair da conta
          </Button>
        </div>
      </div>
    );
  }

  // Verificar se o perfil está completo
  const isProfileSetupPath = location.pathname === '/profile-setup';
  const isProfileIncomplete = profile && !(profile.metadata as any)?.profile_completed;

  if (profile && isProfileIncomplete && !isProfileSetupPath) {
    return <Navigate to="/profile-setup" replace />;
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
