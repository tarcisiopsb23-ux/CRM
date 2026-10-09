-- ============================================================
-- Migration 00220: Rollback da 00219 — bloco de testemunhas
-- Banco A (Maestr.ia) — Totalmente idempotente
--
-- Desfaz as alterações da 00219:
--   1. Remove o bloco bloco_testemunhas inserido
--   2. Restaura o html_content original do bloco_assinaturas
--      (com TESTEMUNHAS integradas, layout em sig-table com colunas)
-- ============================================================

DO $$
DECLARE
  org RECORD;
BEGIN
  FOR org IN SELECT id FROM public.organizations LOOP

    -- 1. Remove o bloco de testemunhas criado pela 00219
    DELETE FROM public.contract_signature_blocks
    WHERE organization_id = org.id
      AND slug = 'bloco_testemunhas';

    -- 2. Restaura o bloco_assinaturas original com TESTEMUNHAS integradas
    --    Só atualiza se o conteúdo atual não tiver TESTEMUNHAS
    --    (ou seja, foi modificado pela 00219)
    UPDATE public.contract_signature_blocks
    SET html_content = $A$<table class="sig-table" style="width:100%;margin-top:36pt">
  <tbody>
    <tr>
      <td style="width:50%;text-align:center;padding:0 16pt;vertical-align:bottom">
        <p class="sig-line">&nbsp;</p>
        <p><strong>CONTRATADA</strong></p>
        <p><strong>AGÊNCIA C8 LTDA</strong></p>
        <p>Tarcísio Pereira da Silva Brito</p>
        <p>Sócio-Administrador</p>
      </td>
      <td style="width:50%;text-align:center;padding:0 16pt;vertical-align:bottom">
        <p class="sig-line">&nbsp;</p>
        <p><strong>CONTRATANTE</strong></p>
        <p><strong>{{contratante_razao_social}}</strong></p>
        <p>{{representante_nome}}</p>
      </td>
    </tr>
    <tr>
      <td colspan="2" style="padding-top:24pt">
        <p style="text-align:center"><strong>TESTEMUNHAS</strong></p>
      </td>
    </tr>
    <tr>
      <td style="width:50%;text-align:center;padding:0 16pt;vertical-align:bottom">
        <p class="sig-line">&nbsp;</p>
        <p>Nome:</p>
        <p>CPF:</p>
      </td>
      <td style="width:50%;text-align:center;padding:0 16pt;vertical-align:bottom">
        <p class="sig-line">&nbsp;</p>
        <p>Nome:</p>
        <p>CPF:</p>
      </td>
    </tr>
  </tbody>
</table>$A$
    WHERE organization_id = org.id
      AND slug = 'bloco_assinaturas'
      AND html_content NOT LIKE '%TESTEMUNHAS%';

  END LOOP;
END $$;

-- Remove registro da 00219 do histórico de migrations
DELETE FROM public.schema_migrations
WHERE version = 'signature_block_witnesses_v1';

-- ── Schema migrations version ─────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
VALUES ('rollback_signature_block_witnesses_v1')
ON CONFLICT (version) DO NOTHING;
