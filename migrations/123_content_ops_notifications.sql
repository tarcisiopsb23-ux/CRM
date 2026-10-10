-- =============================================================================
-- Migration 123: Content Operations — Novos Tipos de Notificação
-- Banco A — Idempotente
--
-- Adiciona os novos tipos de notificação do módulo de Gestão de Conteúdo
-- à tabela notifications.
--
-- Tipos adicionados:
--   content_item_sent_for_approval  — item enviado para aprovação do cliente
--   content_item_approved           — cliente aprovou
--   content_item_rejected           — cliente reprovou / solicitou alteração
--   content_brief_sent              — briefing enviado ao cliente
--   content_deliverable_available   — entregável disponível para consulta
--
-- Estratégia:
--   A tabela notifications.type usa um CHECK constraint (ou enum).
--   Este script detecta qual é o caso e trata ambos.
--   Para enums PostgreSQL, faz ALTER TYPE ... ADD VALUE.
--   Para CHECK constraint em TEXT, recria o constraint com os novos valores.
--
-- Dependências: tabela notifications já existente
-- =============================================================================

DO $migration$
DECLARE
  v_type_is_enum     BOOLEAN;
  v_constraint_name  TEXT;
  v_constraint_def   TEXT;
BEGIN

  -- ── Detecta se o campo type é um enum ou TEXT com CHECK ──────────────────

  SELECT EXISTS(
    SELECT 1
    FROM pg_attribute a
    JOIN pg_type     t ON t.oid = a.atttypid
    JOIN pg_class    c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'notifications'
      AND a.attname = 'type'
      AND t.typtype = 'e'   -- enum
  ) INTO v_type_is_enum;

  -- ── Caso 1: type é um ENUM ───────────────────────────────────────────────
  IF v_type_is_enum THEN

    -- Adiciona cada novo valor apenas se não existir
    -- (ADD VALUE IF NOT EXISTS disponível no PostgreSQL 9.6+)
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND e.enumlabel = 'content_item_sent_for_approval'
      ) THEN
        ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'content_item_sent_for_approval';
      END IF;
    END $$;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND e.enumlabel = 'content_item_approved'
      ) THEN
        ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'content_item_approved';
      END IF;
    END $$;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND e.enumlabel = 'content_item_rejected'
      ) THEN
        ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'content_item_rejected';
      END IF;
    END $$;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND e.enumlabel = 'content_brief_sent'
      ) THEN
        ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'content_brief_sent';
      END IF;
    END $$;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND e.enumlabel = 'content_deliverable_available'
      ) THEN
        ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'content_deliverable_available';
      END IF;
    END $$;

  -- ── Caso 2: type é TEXT com CHECK constraint ──────────────────────────────
  ELSE

    -- Busca o nome do constraint de CHECK no campo type
    SELECT con.conname, pg_get_constraintdef(con.oid)
    INTO v_constraint_name, v_constraint_def
    FROM pg_constraint con
    JOIN pg_class      rel ON rel.oid = con.conrelid
    JOIN pg_namespace  ns  ON ns.oid  = rel.relnamespace
    WHERE ns.nspname  = 'public'
      AND rel.relname = 'notifications'
      AND con.contype = 'c'                          -- CHECK
      AND pg_get_constraintdef(con.oid) LIKE '%type%'
    ORDER BY con.oid DESC
    LIMIT 1;

    -- Se encontrou o constraint, verifica se precisa adicionar os novos valores
    IF v_constraint_name IS NOT NULL THEN
      -- Só remove e recria se os novos valores não estiverem presentes
      IF v_constraint_def NOT LIKE '%content_item_sent_for_approval%' THEN
        EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS %I', v_constraint_name);

        ALTER TABLE public.notifications
          ADD CONSTRAINT notifications_type_check
          CHECK (type IN (
            -- Tipos legados
            'lead_ultra_quente',
            'lead_quente',
            'lead_morno',
            'lead_frio',
            'sistema',
            'contrato_pendente',
            -- Tipos do módulo de conteúdo
            'content_item_sent_for_approval',
            'content_item_approved',
            'content_item_rejected',
            'content_brief_sent',
            'content_deliverable_available'
          ));
      END IF;
    ELSE
      -- Sem constraint no campo type — adiciona um novo
      -- (compatível com implementations que usam tipo TEXT livre)
      -- Não faz nada — TEXT livre já aceita qualquer valor
      NULL;
    END IF;

  END IF;

END $migration$;

-- ─── Versão ───────────────────────────────────────────────────────────────────
INSERT INTO public.schema_migrations (version)
VALUES ('123_content_ops_notifications')
ON CONFLICT (version) DO NOTHING;
