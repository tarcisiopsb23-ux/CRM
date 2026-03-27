/**
 * Metadata utility — typed access and serialization for the `metadata` JSONB field.
 *
 * The `metadata` field in the `clients` table stores integration settings and
 * dashboard configuration flags. This module provides:
 *   - `parseMetadata`   — reads a raw JSONB value and returns a typed object with defaults
 *   - `serializeMetadata` — converts a typed object back to a plain JSON-serializable record
 *
 * Requirements: 13.1 (typed access with defaults), 13.3 (round-trip), 13.4 (unexpected types → defaults)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClientMetadata {
  // Integration fields
  gtm_id: string;
  meta_pixel_id: string;
  n8n_api_key: string;
  whatsapp_webhook_url: string;

  // Auth fields
  dashboard_password: string;
  support_password: string;
  has_temp_password: boolean;

  // Tab visibility flags
  show_tab_leads: boolean;
  show_tab_conversions: boolean;
  show_tab_whatsapp: boolean;
  show_tab_import: boolean;
}

/** Default values for every field — used when a field is absent or has an unexpected type. */
export const METADATA_DEFAULTS: ClientMetadata = {
  gtm_id: '',
  meta_pixel_id: '',
  n8n_api_key: '',
  whatsapp_webhook_url: '',
  dashboard_password: '',
  support_password: '',
  has_temp_password: false,
  show_tab_leads: false,
  show_tab_conversions: false,
  show_tab_whatsapp: false,
  show_tab_import: false,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns `value` if it is a string, otherwise returns `defaultValue`. */
function safeString(value: unknown, defaultValue: string): string {
  return typeof value === 'string' ? value : defaultValue;
}

/** Returns `value` if it is a boolean, otherwise returns `defaultValue`. */
function safeBool(value: unknown, defaultValue: boolean): boolean {
  return typeof value === 'boolean' ? value : defaultValue;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a raw metadata value (from JSONB / localStorage / API) into a typed
 * `ClientMetadata` object. Missing or wrongly-typed fields fall back to their
 * defaults without throwing. (Requirements 13.1, 13.4)
 */
export function parseMetadata(raw: unknown): ClientMetadata {
  const src: Record<string, unknown> =
    raw !== null && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  return {
    gtm_id: safeString(src.gtm_id, METADATA_DEFAULTS.gtm_id),
    meta_pixel_id: safeString(src.meta_pixel_id, METADATA_DEFAULTS.meta_pixel_id),
    n8n_api_key: safeString(src.n8n_api_key, METADATA_DEFAULTS.n8n_api_key),
    whatsapp_webhook_url: safeString(src.whatsapp_webhook_url, METADATA_DEFAULTS.whatsapp_webhook_url),
    dashboard_password: safeString(src.dashboard_password, METADATA_DEFAULTS.dashboard_password),
    support_password: safeString(src.support_password, METADATA_DEFAULTS.support_password),
    has_temp_password: safeBool(src.has_temp_password, METADATA_DEFAULTS.has_temp_password),
    show_tab_leads: safeBool(src.show_tab_leads, METADATA_DEFAULTS.show_tab_leads),
    show_tab_conversions: safeBool(src.show_tab_conversions, METADATA_DEFAULTS.show_tab_conversions),
    show_tab_whatsapp: safeBool(src.show_tab_whatsapp, METADATA_DEFAULTS.show_tab_whatsapp),
    show_tab_import: safeBool(src.show_tab_import, METADATA_DEFAULTS.show_tab_import),
  };
}

/**
 * Serialize a `ClientMetadata` object to a plain JSON-serializable record.
 * This is the inverse of `parseMetadata`. (Requirement 13.3)
 */
export function serializeMetadata(meta: ClientMetadata): Record<string, unknown> {
  return {
    gtm_id: meta.gtm_id,
    meta_pixel_id: meta.meta_pixel_id,
    n8n_api_key: meta.n8n_api_key,
    whatsapp_webhook_url: meta.whatsapp_webhook_url,
    dashboard_password: meta.dashboard_password,
    support_password: meta.support_password,
    has_temp_password: meta.has_temp_password,
    show_tab_leads: meta.show_tab_leads,
    show_tab_conversions: meta.show_tab_conversions,
    show_tab_whatsapp: meta.show_tab_whatsapp,
    show_tab_import: meta.show_tab_import,
  };
}
