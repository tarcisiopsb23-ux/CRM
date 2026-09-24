import { useIntegration } from "@/hooks/useSettings";
import type { RecruitmentConfig } from "@/types/recruitment";

export function useRecruitmentConfig(organizationId: string | undefined) {
  const integration = useIntegration(organizationId, "recruitment");
  // Silencia erros 400 (enum não existe no banco ainda)
  const config = (integration.error ? {} : (integration.data?.config ?? {})) as RecruitmentConfig;

  return {
    config,
    isLoading: integration.isLoading && !integration.error,
    save: integration.upsert,
  };
}
