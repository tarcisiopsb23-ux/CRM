/**
 * SupportBannerSection
 *
 * Banner de sessão de suporte para ser incluído no topo de cada página,
 * dentro do container da página (max-w-... mx-auto).
 * Só renderiza para usuários com isSupport=true.
 */
import { useAuth } from "@/hooks/useAuth";
import { SupportBannerBar } from "@/components/auth/SupportLayout";

export function SupportBannerSection() {
  const { isSupport } = useAuth();
  if (!isSupport) return null;
  return <SupportBannerBar />;
}
