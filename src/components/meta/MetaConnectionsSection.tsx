/**
 * MetaConnectionsSection
 *
 * Seção de configurações para conexões Meta dentro de
 * Configurações → Integrações da SettingsPage.
 *
 * Visível apenas para owner/admin.
 * Usa o padrão SettingsSection do projeto.
 */

import { useAuth, canManageRole } from "@/hooks/useAuth";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { MetaConnectionsList } from "./MetaConnectionsList";
import { Share2 } from "lucide-react";

export function MetaConnectionsSection() {
  const { role, isSupport } = useAuth();
  const isAdminOrOwner = canManageRole(role, isSupport);

  // Apenas owner/admin veem esta seção
  if (!isAdminOrOwner) return null;

  return (
    <SettingsSection
      title="Meta Connections"
      description="Gerencie as conexões com Facebook, Instagram e WhatsApp Business. Suporta OAuth (fluxo oficial) e configuração manual para uso administrativo."
      icon={<Share2 className="h-5 w-5" />}
    >
      <MetaConnectionsList />
    </SettingsSection>
  );
}
