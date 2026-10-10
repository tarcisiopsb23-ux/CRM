-- =============================================================================
-- Migration 082: Views de compatibilidade CRM — suporte a escrita
--
-- Problema:
--   As views crm_pipeline_stages, crm_deals, crm_contacts, crm_products,
--   crm_users (migration 077) são somente leitura por padrão no Postgres.
--   O frontend (hooks useCrmPipeline, useCrmContacts, useCrmProducts) faz
--   INSERT/UPDATE/DELETE diretamente nessas views — o Supabase retorna 400.
--
-- Solução:
--   Triggers INSTEAD OF em cada view redirecionam as escritas para as
--   tabelas client_* correspondentes no Banco A.
--
--   A coluna client_id nas tabelas client_* é UUID → clients(id).
--   O frontend passa client_id como TEXT (legado do Banco B).
--   O trigger faz o cast TEXT → UUID via CAST(NEW.client_id AS UUID).
--
--   organization_id obrigatório nas tabelas client_*: obtido via lookup
--   em clients WHERE id = client_id_uuid.
--
-- Tabelas cobertas:
--   crm_pipeline_stages  → client_crm_pipeline_stages
--   crm_deals            → client_crm_deals
--   crm_contacts         → client_crm_contacts
--   crm_products         → client_crm_products
--   crm_users            → client_crm_users
--   ai_events            → client_ai_events
--   ai_notices           → client_ai_notices
--   ai_promotions        → client_ai_promotions
--   ai_suggestions       → client_ai_suggestions
--   ai_reminders         → client_ai_reminders
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Helper: resolve organization_id a partir do client_id (TEXT ou UUID) ────

CREATE OR REPLACE FUNCTION public._resolve_org_id(p_client_id TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.clients
  WHERE id = p_client_id::UUID
  LIMIT 1;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. crm_pipeline_stages → client_crm_pipeline_stages
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._iof_crm_pipeline_stages()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_org := public._resolve_org_id(NEW.client_id::TEXT);
    INSERT INTO public.client_crm_pipeline_stages
      (id, client_id, organization_id, name, "order", color, bank_b_id, created_at)
    VALUES (
      COALESCE(NEW.id, gen_random_uuid()),
      NEW.client_id::UUID,
      v_org,
      NEW.name,
      COALESCE(NEW."order", 0),
      COALESCE(NEW.color, '#6366f1'),
      NEW.id,   -- bank_b_id = id original para rastreabilidade
      COALESCE(NEW.created_at, now())
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.client_crm_pipeline_stages SET
      name      = NEW.name,
      "order"   = NEW."order",
      color     = NEW.color
    WHERE id = OLD.id::UUID;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.client_crm_pipeline_stages WHERE id = OLD.id::UUID;
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS iof_crm_pipeline_stages ON public.crm_pipeline_stages;
CREATE TRIGGER iof_crm_pipeline_stages
  INSTEAD OF INSERT OR UPDATE OR DELETE
  ON public.crm_pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION public._iof_crm_pipeline_stages();

-- ════════════════════════════════════════════════════════════════════════════
-- 2. crm_deals → client_crm_deals
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._iof_crm_deals()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_org := public._resolve_org_id(NEW.client_id::TEXT);
    INSERT INTO public.client_crm_deals
      (id, client_id, organization_id, contact_id, product_id, stage_id,
       title, value, status, notes, expected_close_date, bank_b_id, created_at, updated_at)
    VALUES (
      COALESCE(NEW.id, gen_random_uuid()),
      NEW.client_id::UUID,
      v_org,
      CASE WHEN NEW.contact_id IS NOT NULL THEN NEW.contact_id::UUID ELSE NULL END,
      CASE WHEN NEW.product_id IS NOT NULL THEN NEW.product_id::UUID ELSE NULL END,
      CASE WHEN NEW.stage_id   IS NOT NULL THEN NEW.stage_id::UUID   ELSE NULL END,
      NEW.title,
      COALESCE(NEW.value, 0),
      COALESCE(NEW.status, 'open'),
      NEW.notes,
      NEW.expected_close_date,
      NEW.id,
      COALESCE(NEW.created_at, now()),
      COALESCE(NEW.updated_at, now())
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.client_crm_deals SET
      contact_id          = CASE WHEN NEW.contact_id IS NOT NULL THEN NEW.contact_id::UUID ELSE NULL END,
      product_id          = CASE WHEN NEW.product_id IS NOT NULL THEN NEW.product_id::UUID ELSE NULL END,
      stage_id            = CASE WHEN NEW.stage_id   IS NOT NULL THEN NEW.stage_id::UUID   ELSE NULL END,
      title               = NEW.title,
      value               = NEW.value,
      status              = NEW.status,
      notes               = NEW.notes,
      expected_close_date = NEW.expected_close_date,
      updated_at          = now()
    WHERE id = OLD.id::UUID;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.client_crm_deals WHERE id = OLD.id::UUID;
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS iof_crm_deals ON public.crm_deals;
CREATE TRIGGER iof_crm_deals
  INSTEAD OF INSERT OR UPDATE OR DELETE
  ON public.crm_deals
  FOR EACH ROW EXECUTE FUNCTION public._iof_crm_deals();

-- ════════════════════════════════════════════════════════════════════════════
-- 3. crm_contacts → client_crm_contacts
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._iof_crm_contacts()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_org := public._resolve_org_id(NEW.client_id::TEXT);
    INSERT INTO public.client_crm_contacts
      (id, client_id, organization_id, name, phone, email, source,
       tags, notes, metadata, bank_b_id, created_at, updated_at)
    VALUES (
      COALESCE(NEW.id, gen_random_uuid()),
      NEW.client_id::UUID,
      v_org,
      NEW.name,
      NEW.phone,
      NEW.email,
      NEW.source,
      COALESCE(NEW.tags, '{}'),
      NEW.notes,
      COALESCE(NEW.metadata, '{}'),
      NEW.id,
      COALESCE(NEW.created_at, now()),
      COALESCE(NEW.updated_at, now())
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.client_crm_contacts SET
      name       = NEW.name,
      phone      = NEW.phone,
      email      = NEW.email,
      source     = NEW.source,
      tags       = COALESCE(NEW.tags, '{}'),
      notes      = NEW.notes,
      metadata   = COALESCE(NEW.metadata, '{}'),
      updated_at = now()
    WHERE id = OLD.id::UUID;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.client_crm_contacts WHERE id = OLD.id::UUID;
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS iof_crm_contacts ON public.crm_contacts;
CREATE TRIGGER iof_crm_contacts
  INSTEAD OF INSERT OR UPDATE OR DELETE
  ON public.crm_contacts
  FOR EACH ROW EXECUTE FUNCTION public._iof_crm_contacts();

-- ════════════════════════════════════════════════════════════════════════════
-- 4. crm_products → client_crm_products
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._iof_crm_products()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_org := public._resolve_org_id(NEW.client_id::TEXT);
    INSERT INTO public.client_crm_products
      (id, client_id, organization_id, name, description, price, unit,
       active, bank_b_id, created_at, updated_at)
    VALUES (
      COALESCE(NEW.id, gen_random_uuid()),
      NEW.client_id::UUID,
      v_org,
      NEW.name,
      NEW.description,
      COALESCE(NEW.price, 0),
      COALESCE(NEW.unit, 'unidade'),
      COALESCE(NEW.active, true),
      NEW.id,
      COALESCE(NEW.created_at, now()),
      COALESCE(NEW.updated_at, now())
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.client_crm_products SET
      name        = NEW.name,
      description = NEW.description,
      price       = COALESCE(NEW.price, 0),
      unit        = NEW.unit,
      active      = COALESCE(NEW.active, true),
      updated_at  = now()
    WHERE id = OLD.id::UUID;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.client_crm_products WHERE id = OLD.id::UUID;
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS iof_crm_products ON public.crm_products;
CREATE TRIGGER iof_crm_products
  INSTEAD OF INSERT OR UPDATE OR DELETE
  ON public.crm_products
  FOR EACH ROW EXECUTE FUNCTION public._iof_crm_products();

-- ════════════════════════════════════════════════════════════════════════════
-- 5. ai_events → client_ai_events
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._iof_ai_events()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_org := public._resolve_org_id(NEW.client_id::TEXT);
    INSERT INTO public.client_ai_events
      (id, client_id, organization_id, title, description, rules,
       date, time, location, type, status, bank_b_id, created_at, updated_at)
    VALUES (
      COALESCE(NEW.id, gen_random_uuid()),
      NEW.client_id::UUID,
      v_org,
      NEW.title,
      NEW.description,
      NEW.rules,
      NEW.date,
      NEW.time,
      NEW.location,
      COALESCE(NEW.type, 'musica_ao_vivo'),
      COALESCE(NEW.status, 'active'),
      NEW.id,
      COALESCE(NEW.created_at, now()),
      COALESCE(NEW.updated_at, now())
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.client_ai_events SET
      title       = NEW.title,
      description = NEW.description,
      rules       = NEW.rules,
      date        = NEW.date,
      time        = NEW.time,
      location    = NEW.location,
      type        = NEW.type,
      status      = NEW.status,
      updated_at  = now()
    WHERE id = OLD.id::UUID;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.client_ai_events WHERE id = OLD.id::UUID;
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS iof_ai_events ON public.ai_events;
CREATE TRIGGER iof_ai_events
  INSTEAD OF INSERT OR UPDATE OR DELETE
  ON public.ai_events
  FOR EACH ROW EXECUTE FUNCTION public._iof_ai_events();

-- ════════════════════════════════════════════════════════════════════════════
-- 6. ai_notices → client_ai_notices
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._iof_ai_notices()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_org := public._resolve_org_id(NEW.client_id::TEXT);
    INSERT INTO public.client_ai_notices
      (id, client_id, organization_id, message, priority, validity,
       rules, status, bank_b_id, created_at, updated_at)
    VALUES (
      COALESCE(NEW.id, gen_random_uuid()),
      NEW.client_id::UUID,
      v_org,
      NEW.message,
      COALESCE(NEW.priority, 'baixa'),
      NEW.validity,
      NEW.rules,
      COALESCE(NEW.status, 'active'),
      NEW.id,
      COALESCE(NEW.created_at, now()),
      COALESCE(NEW.updated_at, now())
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.client_ai_notices SET
      message    = NEW.message,
      priority   = NEW.priority,
      validity   = NEW.validity,
      rules      = NEW.rules,
      status     = NEW.status,
      updated_at = now()
    WHERE id = OLD.id::UUID;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.client_ai_notices WHERE id = OLD.id::UUID;
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS iof_ai_notices ON public.ai_notices;
CREATE TRIGGER iof_ai_notices
  INSTEAD OF INSERT OR UPDATE OR DELETE
  ON public.ai_notices
  FOR EACH ROW EXECUTE FUNCTION public._iof_ai_notices();

-- ════════════════════════════════════════════════════════════════════════════
-- 7. ai_promotions → client_ai_promotions
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._iof_ai_promotions()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_org := public._resolve_org_id(NEW.client_id::TEXT);
    INSERT INTO public.client_ai_promotions
      (id, client_id, organization_id, title, description, validity,
       type, rules, status, bank_b_id, created_at, updated_at)
    VALUES (
      COALESCE(NEW.id, gen_random_uuid()),
      NEW.client_id::UUID,
      v_org,
      NEW.title,
      NEW.description,
      NEW.validity,
      NEW.type,
      NEW.rules,
      COALESCE(NEW.status, 'active'),
      NEW.id,
      COALESCE(NEW.created_at, now()),
      COALESCE(NEW.updated_at, now())
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.client_ai_promotions SET
      title       = NEW.title,
      description = NEW.description,
      validity    = NEW.validity,
      type        = NEW.type,
      rules       = NEW.rules,
      status      = NEW.status,
      updated_at  = now()
    WHERE id = OLD.id::UUID;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.client_ai_promotions WHERE id = OLD.id::UUID;
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS iof_ai_promotions ON public.ai_promotions;
CREATE TRIGGER iof_ai_promotions
  INSTEAD OF INSERT OR UPDATE OR DELETE
  ON public.ai_promotions
  FOR EACH ROW EXECUTE FUNCTION public._iof_ai_promotions();

-- ════════════════════════════════════════════════════════════════════════════
-- 8. ai_suggestions → client_ai_suggestions
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._iof_ai_suggestions()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_org := public._resolve_org_id(NEW.client_id::TEXT);
    INSERT INTO public.client_ai_suggestions
      (id, client_id, organization_id, name, description, price, image_url,
       rules, status, bank_b_id, created_at, updated_at)
    VALUES (
      COALESCE(NEW.id, gen_random_uuid()),
      NEW.client_id::UUID,
      v_org,
      NEW.name,
      NEW.description,
      NEW.price,
      NEW.image_url,
      NEW.rules,
      COALESCE(NEW.status, 'active'),
      NEW.id,
      COALESCE(NEW.created_at, now()),
      COALESCE(NEW.updated_at, now())
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.client_ai_suggestions SET
      name        = NEW.name,
      description = NEW.description,
      price       = NEW.price,
      image_url   = NEW.image_url,
      rules       = NEW.rules,
      status      = NEW.status,
      updated_at  = now()
    WHERE id = OLD.id::UUID;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.client_ai_suggestions WHERE id = OLD.id::UUID;
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS iof_ai_suggestions ON public.ai_suggestions;
CREATE TRIGGER iof_ai_suggestions
  INSTEAD OF INSERT OR UPDATE OR DELETE
  ON public.ai_suggestions
  FOR EACH ROW EXECUTE FUNCTION public._iof_ai_suggestions();

-- ════════════════════════════════════════════════════════════════════════════
-- 9. ai_reminders → client_ai_reminders
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._iof_ai_reminders()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_org := public._resolve_org_id(NEW.client_id::TEXT);
    INSERT INTO public.client_ai_reminders
      (id, client_id, organization_id, text, due_date, completed,
       bank_b_id, created_at, updated_at)
    VALUES (
      COALESCE(NEW.id, gen_random_uuid()),
      NEW.client_id::UUID,
      v_org,
      NEW.text,
      NEW.due_date,
      COALESCE(NEW.completed, false),
      NEW.id,
      COALESCE(NEW.created_at, now()),
      COALESCE(NEW.updated_at, now())
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.client_ai_reminders SET
      text       = NEW.text,
      due_date   = NEW.due_date,
      completed  = NEW.completed,
      updated_at = now()
    WHERE id = OLD.id::UUID;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.client_ai_reminders WHERE id = OLD.id::UUID;
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS iof_ai_reminders ON public.ai_reminders;
CREATE TRIGGER iof_ai_reminders
  INSTEAD OF INSERT OR UPDATE OR DELETE
  ON public.ai_reminders
  FOR EACH ROW EXECUTE FUNCTION public._iof_ai_reminders();

-- ─── Versão ───────────────────────────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
VALUES ('082_crm_views_writable_v1')
ON CONFLICT (version) DO NOTHING;
