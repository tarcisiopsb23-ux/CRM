import { useIntegration } from "@/hooks/useSettings";
import type { RecruitmentConfig } from "@/types/recruitment";

export function useRecruitmentConfig(organizationId: string | undefined) {
  const integration = useIntegration(organizationId, "recruitment");
  const config = (integration.data?.config ?? {}) as RecruitmentConfig;

  return {
    config,
    isLoading: integration.isLoading,
    save: integration.upsert,
  };
}
