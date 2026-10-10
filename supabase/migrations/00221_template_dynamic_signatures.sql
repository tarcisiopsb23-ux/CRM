-- ============================================================
-- Migration 00221: Atualiza templates para usar {{bloco_assinaturas}} dinâmico
-- Banco A (Maestr.ia) — Totalmente idempotente
--
-- O bloco de assinaturas agora é gerado dinamicamente pelo ContractGenerator
-- com base nos representantes reais do contratante. Isso elimina as variáveis
-- fixas {{representante_2_nome}} etc. que deixavam linhas vazias quando não
-- havia representante cadastrado.
--
-- Esta migration substitui qualquer bloco de assinatura estático nas
-- estruturas dos templates (campo structure->signature_block) pelo
-- marcador {{bloco_assinaturas}}, que é resolvido dinamicamente.
-- ============================================================

-- Atualiza o signature_block da estrutura dos templates que ainda usam
-- variáveis fixas de representante (não usa {{bloco_assinaturas}})
UPDATE public.contract_templates
SET structure = jsonb_set(
  structure,
  '{signature_block}',
  to_jsonb($$<div style="margin-top:28pt">{{bloco_assinaturas}}</div>$$::text)
)
WHERE structure IS NOT NULL
  AND (structure->>'signature_block') IS NOT NULL
  AND (structure->>'signature_block') NOT LIKE '%bloco_assinaturas%';

-- ── Schema migrations version ─────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
VALUES ('template_dynamic_signatures_v1')
ON CONFLICT (version) DO NOTHING;
