// src/lib/contracts/schemas.ts
// Zod validation schemas for the Contract System.
// Requirements: 1.3, 1.4, 1.5, 2.2, 6.2, 6.6, 7.4

import { z } from 'zod';

// ---------------------------------------------------------------------------
// 1. subServiceSchema — Requirement 1.4, 1.5
// ---------------------------------------------------------------------------

/**
 * Validates a single sub-service item stored inside service_catalog.sub_services.
 *
 * Rules:
 * - id:      any non-empty string (UUID generated on the frontend)
 * - name:    non-empty string
 * - type:    one of 'number' | 'text' | 'boolean' | 'select'
 * - options: optional array of strings; when type === 'select', the array must
 *            exist and have 1–50 items (Requirement 1.5).
 */
export const subServiceSchema = z
  .object({
    id: z.string(),
    name: z.string().min(1, 'O nome do sub-serviço é obrigatório.'),
    type: z.enum(['number', 'text', 'boolean', 'select']),
    options: z.array(z.string()).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.type === 'select') {
      if (!val.options || val.options.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.too_small,
          minimum: 1,
          type: 'array',
          inclusive: true,
          message: 'Adicione ao menos uma opção.',
          path: ['options'],
        });
      } else if (val.options.length > 50) {
        ctx.addIssue({
          code: z.ZodIssueCode.too_big,
          maximum: 50,
          type: 'array',
          inclusive: true,
          message: 'O campo select suporta no máximo 50 opções.',
          path: ['options'],
        });
      }
    }
  });

export type SubServiceInput = z.infer<typeof subServiceSchema>;

// ---------------------------------------------------------------------------
// 2. deliverableSchema — Entregável estruturado (migration 062 + redesign v2)
// ---------------------------------------------------------------------------

/**
 * Validates a single deliverable item stored inside service_catalog.deliverables.
 *
 * Rules:
 * - id:            UUID gerado no frontend
 * - name:          obrigatório, máx 200 caracteres
 * - delivery_type: 'recorrente' | 'unico' | 'pontual'
 * - output_format: 'texto' | 'numero'
 * - text_value:    obrigatório quando output_format = 'texto', máx 500 chars
 * - unit:          opcional quando output_format = 'numero', máx 50 chars (singular)
 * - unit_plural:   opcional quando output_format = 'numero', máx 50 chars (plural)
 */
export const deliverableSchema = z
  .object({
    id: z.string(),
    name: z
      .string()
      .min(1, 'O nome do entregável é obrigatório.')
      .max(200, 'O nome deve ter no máximo 200 caracteres.'),
    delivery_type: z.enum(['recorrente', 'unico', 'pontual'], {
      required_error: 'Selecione o tipo de entrega.',
    }),
    output_format: z.enum(['texto', 'numero'], {
      required_error: 'Selecione o formato do entregável.',
    }),
    text_value: z
      .string()
      .max(500, 'O texto deve ter no máximo 500 caracteres.')
      .optional()
      .nullable(),
    unit: z
      .string()
      .max(50, 'A unidade deve ter no máximo 50 caracteres.')
      .optional()
      .nullable(),
    unit_plural: z
      .string()
      .max(50, 'O plural deve ter no máximo 50 caracteres.')
      .optional()
      .nullable(),
  })
  .superRefine((val, ctx) => {
    if (val.output_format === 'texto') {
      if (!val.text_value || val.text_value.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Informe o texto descritivo do entregável.',
          path: ['text_value'],
        });
      }
    }
  });

export type DeliverableInput = z.infer<typeof deliverableSchema>;

// ---------------------------------------------------------------------------
// 3. serviceCatalogSchema — Requirements 1.1, 1.3
// ---------------------------------------------------------------------------

/**
 * Validates the user-facing fields when creating / editing a service in the
 * Service Catalog. (id, organization_id, display_order, timestamps are managed
 * by Supabase and are not part of this form schema.)
 */
export const serviceCatalogSchema = z.object({
  name: z
    .string()
    .min(1, 'O nome do serviço é obrigatório.')
    .max(150, 'O nome do serviço deve ter no máximo 150 caracteres.'),
  category: z
    .string()
    .min(1, 'A categoria é obrigatória.')
    .max(100, 'A categoria deve ter no máximo 100 caracteres.'),
  modality: z
    .enum(['Consultiva', 'Executiva', 'Híbrida (consultiva e executiva)'], {
      invalid_type_error: 'Selecione uma modalidade válida.',
    })
    .optional()
    .nullable(),
  description_text: z
    .string()
    .max(1000, 'A descrição deve ter no máximo 1000 caracteres.')
    .optional()
    .nullable(),
  scope: z
    .string()
    .max(1000, 'O escopo deve ter no máximo 1000 caracteres.')
    .optional()
    .nullable(),
  deliverables: z.array(deliverableSchema).default([]),
});

export type ServiceCatalogInput = z.infer<typeof serviceCatalogSchema>;

// ---------------------------------------------------------------------------
// 3. contractClauseSchema — Requirement 2.2
// ---------------------------------------------------------------------------

/**
 * Validates the form fields for a contract clause.
 *
 * Cross-validation: when condition_type === 'has_service', service_id must be
 * a non-null, non-empty string (Requirement 2.2).
 */
export const contractClauseSchema = z
  .object({
    title: z.string().min(1, 'O título da cláusula é obrigatório.'),
    // content is TipTap JSONContent — any non-null value is accepted here;
    // emptiness is enforced by the ClauseEditor component (button disabled).
    content: z.any(),
    condition_type: z.enum([
      'always',
      'has_setup',
      'has_min_duration',
      'has_service',
      'has_setup_installments',
      // Extended condition types (migration 00205+)
      'service',
      'has_multiple_representatives',
      'signing_type',
      'has_schedule',
      'service_count',
      'has_grace_period',
      'is_pf',
      'is_pj',
      'has_procurador',
    ]),
    condition_value: z.union([
      z.object({ slugs: z.array(z.string()).min(1) }),
      z.object({ type: z.enum(['joint', 'individual']) }),
      z.object({ min: z.number().int().min(1) }),
      z.null(),
    ]).optional().nullable(),
    is_editable: z.boolean().default(false),
    service_id: z.string().nullable().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.condition_type === 'has_service') {
      if (!val.service_id || val.service_id.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Selecione o serviço vinculado.',
          path: ['service_id'],
        });
      }
    }
    if (val.condition_type === 'service') {
      const slugs = (val.condition_value as { slugs?: string[] } | null)?.slugs;
      if (!slugs || slugs.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Informe ao menos um slug de serviço.',
          path: ['condition_value'],
        });
      }
    }
    if (val.condition_type === 'service_count') {
      const min = (val.condition_value as { min?: number } | null)?.min;
      if (min === undefined || min === null || min < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Informe o número mínimo de serviços (≥ 1).',
          path: ['condition_value'],
        });
      }
    }
  });

export type ContractClauseInput = z.infer<typeof contractClauseSchema>;

// ---------------------------------------------------------------------------
// 4. setupSectionSchema — Requirements 6.2
// ---------------------------------------------------------------------------

/**
 * Validates the setup/implantation block of the contract form.
 */
export const setupSectionSchema = z.object({
  setup_value: z
    .number({ required_error: 'O valor do setup é obrigatório.' })
    .positive('O valor do setup deve ser maior que zero.'),

  setup_installments: z
    .number({ required_error: 'O número de parcelas é obrigatório.' })
    .int('O número de parcelas deve ser um número inteiro.')
    .min(1, 'O mínimo de parcelas é 1.')
    .max(12, 'O máximo de parcelas é 12.'),

  setup_fees: z
    .number()
    .min(0, 'A taxa de juros deve ser maior ou igual a 0.')
    .max(100, 'A taxa de juros deve ser menor ou igual a 100.')
    .optional()
    .default(0),

  setup_first_due_date: z
    .string()
    .min(1, 'A data do 1º vencimento do setup é obrigatória.'),

  setup_payment_method: z
    .string()
    .min(1, 'A forma de pagamento do setup é obrigatória.'),
});

export type SetupSectionInput = z.infer<typeof setupSectionSchema>;

// ---------------------------------------------------------------------------
// 5. contractFormSchema — Requirements 6.6, 7.4
// ---------------------------------------------------------------------------

/**
 * Schema for a single selected deliverable inside a contract service entry.
 * Mirrors the SelectedDeliverable interface.
 */
const selectedDeliverableSchema = z.object({
  deliverable_id: z.string().min(1),
  included: z.boolean(),
  number_value: z.number().positive().optional().nullable(),
  period: z.enum(['dia', 'semana', 'mes', 'vigencia', 'nao_indicar']).optional().nullable(),
  deadline_type: z.enum(['dias', 'meses', 'data_limite']).optional().nullable(),
  deadline_value: z.union([z.number().int().positive(), z.string()]).optional().nullable(),
  execution_format: z.enum(['consultivo', 'executivo']).optional().nullable(),
});

/**
 * Base shape for the selected services array item.
 */
const selectedServiceSchema = z.object({
  service_id: z.string().min(1),
  service_name: z.string().min(1),
  selected_deliverables: z.array(selectedDeliverableSchema).default([]),
});

/**
 * Full contract form schema combining services, setup and min_duration.
 *
 * Cross-validation (Requirement 6.6 / 7.4):
 * When setup_enabled is true and setup_installments > 1,
 * min_duration_months must be >= setup_installments.
 */
export const contractFormSchema = z
  .object({
    services: z
      .array(selectedServiceSchema)
      .min(1, 'Selecione ao menos um serviço para o contrato.'),

    min_duration_months: z
      .number()
      .int('O prazo mínimo deve ser um número inteiro.')
      .min(0, 'O prazo mínimo não pode ser negativo.')
      .default(0),

    setup_enabled: z.boolean().optional(),

    // Setup fields — present only when setup_enabled === true.
    // They are optional at the schema level; the superRefine below enforces
    // their presence and cross-validation when setup_enabled is true.
    setup_value: z.number().positive().optional(),
    setup_installments: z
      .number()
      .int()
      .min(1)
      .max(12)
      .optional(),
    setup_fees: z.number().min(0).max(100).optional().default(0),
    setup_first_due_date: z.string().optional(),
    setup_payment_method: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.setup_enabled) return;

    // When setup is enabled, validate required setup fields.
    if (val.setup_value === undefined || val.setup_value <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'O valor do setup é obrigatório e deve ser maior que zero.',
        path: ['setup_value'],
      });
    }

    if (
      val.setup_installments === undefined ||
      val.setup_installments < 1 ||
      val.setup_installments > 12
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'O número de parcelas do setup deve ser entre 1 e 12.',
        path: ['setup_installments'],
      });
    }

    if (!val.setup_first_due_date || val.setup_first_due_date.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A data do 1º vencimento do setup é obrigatória.',
        path: ['setup_first_due_date'],
      });
    }

    if (!val.setup_payment_method || val.setup_payment_method.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A forma de pagamento do setup é obrigatória.',
        path: ['setup_payment_method'],
      });
    }

    // Cross-validation: min_duration_months >= setup_installments when
    // setup_installments > 1 (Requirements 6.6 and 7.4).
    const installments = val.setup_installments ?? 1;
    if (installments > 1 && val.min_duration_months < installments) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `O prazo mínimo de permanência não pode ser menor que o número de parcelas do setup (${installments} meses)`,
        path: ['min_duration_months'],
      });
    }
  });

export type ContractFormInput = z.infer<typeof contractFormSchema>;
