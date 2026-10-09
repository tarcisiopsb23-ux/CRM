/**
 * Tipos compartilhados para a Central de Meta App Review
 */

export type PermissionStatus =
  | "KEEP"             // Existe e pode ser demonstrado
  | "IMPLEMENT_LATER"  // Planejado, não implementado ainda
  | "NOT_READY"        // Não existe, não previsto
  | "REMOVE"           // Não necessário para o C8 Control
  | "REQUIRES_REVIEW"; // Precisa de avaliação adicional

export type TestMode = "LIVE_META_TEST" | "DEVELOPMENT_MOCK";

export interface PermissionEntry {
  permission: string;
  group: string;
  groupNumber: number;
  description: string;
  status: PermissionStatus;
  apiEndpoint?: string;
  demoPath?: string;
  requiresAppReview: boolean;
  notes?: string;
}

export interface ScreencastStep {
  step: number;
  total: number;
  action: string;
  highlight?: string;
}

export interface ApiCallResult {
  success: boolean;
  data?: unknown;
  error?: string;
  meta: {
    status: number;
    is_live_test: boolean;
    endpoint: string;
    permission: string;
  };
}

export interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
}

export const SCREENCAST_CHECKLIST_ITEMS: ChecklistItem[] = [
  { id: "test_account",    label: "Connected correct Meta test account",      checked: false },
  { id: "permission",      label: "Permission granted",                        checked: false },
  { id: "asset_selected",  label: "Real asset selected",                       checked: false },
  { id: "api_called",      label: "Real Meta API request executed",            checked: false },
  { id: "result_displayed",label: "Result displayed to user",                  checked: false },
  { id: "no_secrets",      label: "No secrets visible on screen",              checked: false },
  { id: "flow_recorded",   label: "Entire user flow recorded",                 checked: false },
  { id: "meta_result",     label: "Final Meta-side result demonstrated",       checked: false },
];
