/**
 * C8ControlDomainRouter
 *
 * Intercepta acessos vindos de c8control.com.br e redireciona para
 * a rota correta do Public Dashboard dentro do React Router.
 *
 * Mapeamento de URLs:
 *
 *   c8control.com.br/cantinho-do-churrasco
 *     → /public/dashboard/cantinho-do-churrasco
 *
 *   c8control.com.br/cantinho-do-churrasco/login
 *     → /public/dashboard/cantinho-do-churrasco/login
 *
 *   c8control.com.br/cantinho-do-churrasco/crm
 *     → /public/dashboard/cantinho-do-churrasco/crm
 *
 *   c8control.com.br  (raiz sem slug)
 *     → página de apresentação do C8 Control (a definir)
 *
 * Funciona para qualquer domínio configurado em C8_CONTROL_HOSTNAMES.
 * Adicione variantes (www, staging) conforme necessário.
 */

import { useEffect } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";

const C8_CONTROL_HOSTNAMES = [
  "app.c8control.com.br",
];

function isC8ControlDomain(): boolean {
  return C8_CONTROL_HOSTNAMES.includes(window.location.hostname);
}

export function C8ControlDomainRouter() {
  const navigate  = useNavigate();
  const location  = useLocation();

  useEffect(() => {
    if (!isC8ControlDomain()) return;

    const pathname = location.pathname;

    // Já está numa rota /public/dashboard — não redireciona novamente
    if (pathname.startsWith("/public/dashboard")) return;

    // Extrai o slug do primeiro segmento do path
    // Ex: /cantinho-do-churrasco/login → slug = "cantinho-do-churrasco", rest = "/login"
    const parts = pathname.replace(/^\//, "").split("/");
    const slug  = parts[0];
    const rest  = parts.slice(1).join("/");

    if (!slug) {
      // Raiz do domínio sem slug — redireciona para página de apresentação
      navigate("/c8control-home", { replace: true });
      return;
    }

    const target = `/public/dashboard/${slug}${rest ? `/${rest}` : ""}`;
    navigate(target, { replace: true });
  }, [location.pathname, navigate]);

  return <Outlet />;
}

/**
 * Hook para uso em componentes que precisam saber se estão
 * sendo acessados pelo domínio c8control.com.br.
 * Útil para ajustar branding, título da aba etc.
 */
export function useIsC8ControlDomain(): boolean {
  return isC8ControlDomain();
}
