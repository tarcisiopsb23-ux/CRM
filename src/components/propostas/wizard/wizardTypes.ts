// src/components/propostas/wizard/wizardTypes.ts
// Tipos e estado global do wizard de criação de propostas.

import type { SectionKey, ScheduleConfig } from "@/types/proposals";
import type { Client } from "@/types/crm";

// ---------------------------------------------------------------------------
// Rascunho de serviço dentro do wizard
// ---------------------------------------------------------------------------

export interface WizardServiceDraft {
  /** ID no catálogo (undefined se item manual) */
  catalog_id?: string;
  name: string;
  description: string | null;
  value: number;
  is_bonus: boolean;
}

// ---------------------------------------------------------------------------
// Estado completo do wizard
// ---------------------------------------------------------------------------

export interface WizardState {
  // Etapa 1 — Cliente
  client: Client | null;

  // Etapa 2 — Serviços
  services: WizardServiceDraft[];
  planValue: number;

  // Etapa 3 — Proposta
  title: string;
  heroMessage: string;
  closerWhatsapp: string;
  schedule: ScheduleConfig;

  // Etapa 4 — Seções variáveis
  sections: Partial<Record<SectionKey, { content: string; is_visible: boolean }>>;

  // Controle de navegação
  visitedSteps: number[];
}

// ---------------------------------------------------------------------------
// Etapas
// ---------------------------------------------------------------------------

export const WIZARD_STEPS = [
  { index: 0, label: "Cliente",   shortLabel: "Cliente"   },
  { index: 1, label: "Serviços",  shortLabel: "Serviços"  },
  { index: 2, label: "Proposta",  shortLabel: "Proposta"  },
  { index: 3, label: "Seções",    shortLabel: "Seções"    },
  { index: 4, label: "Resumo",    shortLabel: "Resumo"    },
] as const;

export type WizardStepIndex = 0 | 1 | 2 | 3 | 4;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function defaultSchedule(): ScheduleConfig {
  return {
    firstValue: 0,
    firstDate: new Date().toISOString().split("T")[0],
    dueDay: 10,
    recurrence: "mensal",
    installments: 12,
  };
}

export const WIZARD_STORAGE_KEY = "proposta_wizard_draft";

export function loadWizardDraft(): Partial<WizardState> | null {
  try {
    const raw = sessionStorage.getItem(WIZARD_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<WizardState>;
  } catch {
    return null;
  }
}

export function saveWizardDraft(state: WizardState): void {
  try {
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(state));
  } catch { /* quota exceeded — silent */ }
}

export function clearWizardDraft(): void {
  try {
    sessionStorage.removeItem(WIZARD_STORAGE_KEY);
  } catch { /* silent */ }
}
