import { useEffect } from "react";
import { useOrganizationData, useOrganization } from "@/hooks/useOrganization";

export function DynamicTitle() {
  const orgId = useOrganization();
  const { data: organization } = useOrganizationData(orgId);

  useEffect(() => {
    if (organization?.name) {
      document.title = `${organization.name} - Maestr.IA`;
    }
  }, [organization?.name]);

  return null;
}
