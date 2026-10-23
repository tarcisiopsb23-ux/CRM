-- Migration 143: renomear whatsapp_conversations → omni_conversations
--                         whatsapp_messages       → omni_messages
-- Adiciona colunas de integração, atualiza Realtime, cria views de compatibilidade.
-- SEGURA PARA DADOS: usa ALTER TABLE RENAME (sem DROP).

-- ── 1. Rename das tabelas ─────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'whatsapp_conversations'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'omni_conversations'
  ) THEN
    ALTER TABLE public.whatsapp_conversations RENAME TO omni_conversations;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'whatsapp_messages'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'omni_messages'
  ) THEN
    ALTER TABLE public.whatsapp_messages RENAME TO omni_messages;
  END IF;
END $$;

-- ── 2. Novas colunas em omni_conversations ────────────────────────────────────
ALTER TABLE public.omni_conversations
  ADD COLUMN IF NOT EXISTS client_id       UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS omni_contact_id UUID REFERENCES public.omni_contacts(id) ON DELETE SET NULL;

-- Índices para as novas colunas
CREATE INDEX IF NOT EXISTS idx_omni_conv_client
  ON public.omni_conversations (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_omni_conv_omni_contact
  ON public.omni_conversations (omni_contact_id) WHERE omni_contact_id IS NOT NULL;

-- ── 3. Backfill: preencher omni_contact_id com base em contact_id ─────────────
-- contact_id ainda aponta para os IDs que foram copiados para omni_contacts
-- com os mesmos IDs na migration 142.
UPDATE public.omni_conversations
SET omni_contact_id = contact_id
WHERE omni_contact_id IS NULL
  AND contact_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.omni_contacts oc
    WHERE oc.id = omni_conversations.contact_id
  );

-- ── 4. Atualizar publicação Realtime ──────────────────────────────────────────
-- Remove tabelas antigas (se ainda estiverem publicadas com nome antigo) e
-- adiciona as renomeadas.
DO $$ BEGIN
  -- Remove whatsapp_conversations da publicação se ainda existir com esse nome
  -- (pode ter sido removida automaticamente pelo rename)
  BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.whatsapp_conversations;
  EXCEPTION WHEN undefined_table THEN NULL;
  WHEN others THEN NULL;
  END;
  -- Remove whatsapp_messages da publicação
  BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.whatsapp_messages;
  EXCEPTION WHEN undefined_table THEN NULL;
  WHEN others THEN NULL;
  END;
END $$;

-- Adiciona tabelas renomeadas (idempotente: se já estiver, ignora)
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.omni_conversations;
  EXCEPTION WHEN duplicate_object THEN NULL;
  WHEN others THEN NULL;
  END;
END $$;

DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.omni_messages;
  EXCEPTION WHEN duplicate_object THEN NULL;
  WHEN others THEN NULL;
  END;
END $$;

-- ── 5. Renomear trigger trg_sync_omni_agent_load (migration 138) ──────────────
-- O trigger foi criado em whatsapp_conversations; após rename está em omni_conversations
-- mas ainda com o mesmo nome. Recria-o idempotentemente por segurança.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_sync_omni_agent_load'
      AND tgrelid = 'public.omni_conversations'::regclass
  ) THEN
    CREATE TRIGGER trg_sync_omni_agent_load
    AFTER INSERT OR UPDATE OF assigned_agent_id OR DELETE
    ON public.omni_conversations
    FOR EACH ROW EXECUTE FUNCTION public.sync_omni_agent_current_load();
  END IF;
END $$;

-- ── 6. Renomear trigger updated_at se existir com nome antigo ─────────────────
DO $$ BEGIN
  -- Verifica se existe trigger com nome whatsapp_ em omni_conversations
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_whatsapp_conversations_updated_at'
      AND tgrelid = 'public.omni_conversations'::regclass
  ) THEN
    ALTER TRIGGER trg_whatsapp_conversations_updated_at
      ON public.omni_conversations
      RENAME TO trg_omni_conversations_updated_at;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_whatsapp_messages_updated_at'
      AND tgrelid = 'public.omni_messages'::regclass
  ) THEN
    ALTER TRIGGER trg_whatsapp_messages_updated_at
      ON public.omni_messages
      RENAME TO trg_omni_messages_updated_at;
  END IF;
END $$;

-- ── 7. Views de compatibilidade ───────────────────────────────────────────────
-- Permitem que código existente (Edge Functions, n8n, hooks) continue funcionando
-- durante a transição incremental. Remover após atualizar todos os clientes.
CREATE OR REPLACE VIEW public.whatsapp_conversations AS
  SELECT * FROM public.omni_conversations;

CREATE OR REPLACE VIEW public.whatsapp_messages AS
  SELECT * FROM public.omni_messages;

-- ── Schema migration marker ───────────────────────────────────────────────────
INSERT INTO public.schema_migrations (version)
  VALUES ('143_rename_whatsapp_tables')
  ON CONFLICT (version) DO NOTHING;
