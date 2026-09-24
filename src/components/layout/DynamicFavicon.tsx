import { useEffect } from 'react';
import { useOrganizationData, useOrganization } from '@/hooks/useOrganization';

export function DynamicFavicon() {
  const orgId = useOrganization();
  const { data: organization } = useOrganizationData(orgId);

  useEffect(() => {
    const settings = organization?.settings as { favicon_url?: string };
    const faviconUrl = settings?.favicon_url;
    
    if (faviconUrl) {
      const link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
      if (link) {
        link.href = faviconUrl;
      } else {
        const newLink = document.createElement('link');
        newLink.rel = 'icon';
        newLink.href = faviconUrl;
        document.head.appendChild(newLink);
      }
    }
  }, [organization]);

  return null;
}
