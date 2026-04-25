-- =============================================================================
-- Migration 018: Backfill da tabela invoices a partir de payments existentes
--
-- Cria um invoice com status='pendente' para cada payment (pago ou pendente)
-- que ainda não possui um invoice ativo vinculado (status NOT IN rejeitada/cancelada).
--
-- Seguro para rodar múltiplas vezes: o INSERT usa ON CONFLICT DO NOTHING
-- combinado com o unique partial index criado na migration 017.
-- Payments sem client_id ou sem dados de cliente são ignorados.
-- =============================================================================

INSERT INTO invoices (
  organization_id,
  client_id,
  contract_id,
  payment_id,
  type,
  status,
  valor_servico,
  competencia,
  tomador_nome,
  tomador_cnpj_cpf,
  tomador_email,
  tomador_endereco,
  created_at,
  updated_at
)
SELECT
  p.organization_id,
  p.client_id,
  p.contract_id,
  p.id                                                        AS payment_id,
  'nfse'                                                      AS type,
  'pendente'                                                  AS status,
  p.value                                                     AS valor_servico,
  -- Competência: YYYY-MM derivado de paid_at (se pago) ou due_date
  TO_CHAR(
    COALESCE(p.paid_at, p.due_date::timestamptz),
    'YYYY-MM'
  )                                                           AS competencia,
  COALESCE(c.company, c.name)                                 AS tomador_nome,
  c.document                                                  AS tomador_cnpj_cpf,
  c.email                                                     AS tomador_email,
  '{}'::jsonb                                                 AS tomador_endereco,
  NOW()                                                       AS created_at,
  NOW()                                                       AS updated_at
FROM payments p
JOIN clients c ON c.id = p.client_id
-- Apenas payments sem invoice ativo já vinculado
WHERE p.id NOT IN (
  SELECT payment_id
  FROM invoices
  WHERE payment_id IS NOT NULL
    AND status NOT IN ('rejeitada', 'cancelada')
)
-- Apenas payments com valor positivo
AND p.value > 0
-- Apenas payments com client_id preenchido
AND p.client_id IS NOT NULL
-- Apenas payments com status relevante (pago ou pendente)
AND p.status IN ('pago', 'pendente')
ON CONFLICT DO NOTHING;
