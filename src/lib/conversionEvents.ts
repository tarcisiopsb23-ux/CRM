// Type declarations for tracking globals
declare global {
  interface Window {
    dataLayer: Record<string, unknown>[];
    fbq?: (command: string, event: string, ...args: unknown[]) => void;
  }
}

/**
 * Fires conversion tracking events for GTM and Meta Pixel when configured.
 * Requirements: 9.2, 9.3
 */
export function fireConversionEvents(metadata: {
  gtm_id?: string | null;
  meta_pixel_id?: string | null;
}): void {
  // GTM: fire dataLayer conversion event when gtm_id is valid (format GTM-[A-Z0-9]+)
  if (metadata.gtm_id && /^GTM-[A-Z0-9]+$/.test(metadata.gtm_id)) {
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: 'conversion' });
    } catch {
      // dataLayer not available — fail silently
    }
  }

  // Meta Pixel: fire Purchase event when meta_pixel_id is valid (15-16 digits)
  if (metadata.meta_pixel_id && /^\d{15,16}$/.test(metadata.meta_pixel_id)) {
    try {
      (window as Window).fbq?.('track', 'Purchase');
    } catch {
      // fbq not available — fail silently
    }
  }
}
