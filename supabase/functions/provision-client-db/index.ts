/**
 * provision-client-db
 *
 * Aplica o schema completo do Banco B em um cliente específico.
 * Usa o arquivo único `bank_b_full_schema.sql` — idempotente,
 * pode ser executado múltiplas vezes sem efeito colateral.
 *
 * Chamada por:
 *   - n8n ao detectar novo cliente com client_supabase_url preenchido
 *   - n8n em massa quando bank_b_full_schema.sql for modificado
 *   - c8-provision-tenant ao criar novo cliente
 *
 * Secrets necessários (Supabase Edge Function Secrets):
 *   SUPABASE_URL              — Banco A (agência)
 *   SUPABASE_SERVICE_ROLE_KEY — Banco A service role
 *
 * Body: { client_id: string }
 *
 * O Banco B URL e service_role_key são lidos da tabela clients no Banco A.
 * Cada cliente tem seu próprio Supabase isolado — sem fallback para banco
 * compartilhado, evitando qualquer risco de vazamento de dados.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ── Schema completo do Banco B (gerado de bank_b_full_schema.sql) ─────────────
// Este bloco é a cópia inline do arquivo migrations/bank_b_full_schema.sql.
// Atualizar aqui sempre que o arquivo SQL for modificado.

const BANK_B_FULL_SCHEMA = `
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT        PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_migrations"  ON public.schema_migrations;
DROP POLICY IF EXISTS "write_migrations" ON public.schema_migrations;
CREATE POLICY "read_migrations"  ON public.schema_migrations FOR SELECT USING (true);
CREATE POLICY "write_migrations" ON public.schema_migrations FOR INSERT TO authenticated WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.crm_users (
  id           UUID        PRIMARY KEY,
  client_id    TEXT        NOT NULL,
  email        TEXT        NOT NULL,
  full_name    TEXT,
  role         TEXT        NOT NULL DEFAULT 'member'
               CHECK (role IN ('owner','admin','manager','member','viewer')),
  avatar_url   TEXT,
  active       BOOLEAN     NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_users_client_id ON public.crm_users(client_id);

CREATE TABLE IF NOT EXISTS public.crm_contacts (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  TEXT        NOT NULL,
  name       TEXT        NOT NULL,
  phone      TEXT,
  email      TEXT,
  source     TEXT,
  tags       TEXT[]      DEFAULT '{}',
  notes      TEXT,
  metadata   JSONB       DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_client_id ON public.crm_contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_phone     ON public.crm_contacts(phone);

CREATE TABLE IF NOT EXISTS public.crm_products (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   TEXT        NOT NULL,
  name        TEXT        NOT NULL,
  description TEXT,
  price       NUMERIC(12,2) DEFAULT 0,
  unit        TEXT        DEFAULT 'unidade',
  active      BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_products_client_id ON public.crm_products(client_id);

CREATE TABLE IF NOT EXISTS public.crm_pipeline_stages (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  TEXT        NOT NULL,
  name       TEXT        NOT NULL,
  "order"    INTEGER     NOT NULL DEFAULT 0,
  color      TEXT        NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_pipeline_client_id ON public.crm_pipeline_stages(client_id, "order");

CREATE TABLE IF NOT EXISTS public.crm_deals (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           TEXT        NOT NULL,
  contact_id          UUID        REFERENCES public.crm_contacts(id)        ON DELETE SET NULL,
  product_id          UUID        REFERENCES public.crm_products(id)        ON DELETE SET NULL,
  stage_id            UUID        REFERENCES public.crm_pipeline_stages(id) ON DELETE SET NULL,
  title               TEXT,
  value               NUMERIC(12,2) DEFAULT 0,
  status              TEXT        NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','won','lost')),
  notes               TEXT,
  expected_close_date DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_deals_client_id ON public.crm_deals(client_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_stage_id  ON public.crm_deals(stage_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_status    ON public.crm_deals(status);

CREATE TABLE IF NOT EXISTS public.crm_whatsapp_sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       TEXT        NOT NULL,
  phone_number    TEXT,
  session_status  TEXT        NOT NULL DEFAULT 'disconnected'
                  CHECK (session_status IN ('connected','disconnected','connecting','qr_pending')),
  connected_at    TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  last_sync_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_whatsapp_client_id ON public.crm_whatsapp_sessions(client_id);

CREATE TABLE IF NOT EXISTS public.ai_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   TEXT        NOT NULL,
  title       TEXT        NOT NULL,
  description TEXT,
  rules       TEXT,
  date        DATE        NOT NULL,
  time        TEXT,
  location    TEXT,
  type        TEXT        CHECK (type IN ('musica_ao_vivo','dia_especial')),
  status      TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_events_client_id ON public.ai_events(client_id);
CREATE INDEX IF NOT EXISTS idx_ai_events_date      ON public.ai_events(date);

CREATE TABLE IF NOT EXISTS public.ai_reminders (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  TEXT        NOT NULL,
  text       TEXT        NOT NULL,
  due_date   TIMESTAMPTZ,
  completed  BOOLEAN     NOT NULL DEFAULT false,
  created_by UUID        REFERENCES public.crm_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_reminders_client_id ON public.ai_reminders(client_id);
CREATE INDEX IF NOT EXISTS idx_ai_reminders_due_date  ON public.ai_reminders(due_date) WHERE NOT completed;

CREATE TABLE IF NOT EXISTS public.client_charges (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       TEXT          NOT NULL,
  asaas_id        TEXT          UNIQUE,
  description     TEXT          NOT NULL DEFAULT '',
  value           NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_date        DATE          NOT NULL,
  payment_date    DATE,
  billing_type    TEXT          NOT NULL DEFAULT 'PIX'
                  CHECK (billing_type IN ('PIX','BOLETO','CREDIT_CARD','UNDEFINED')),
  status          TEXT          NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN (
                    'PENDING','RECEIVED','CONFIRMED','OVERDUE',
                    'REFUNDED','REFUND_REQUESTED','CHARGEBACK_REQUESTED',
                    'CHARGEBACK_DISPUTE','AWAITING_CHARGEBACK_REVERSAL',
                    'DUNNING_REQUESTED','DUNNING_RECEIVED',
                    'AWAITING_RISK_ANALYSIS','CANCELLED'
                  )),
  invoice_url     TEXT,
  bank_slip_url   TEXT,
  pix_qr_code     TEXT,
  pix_copy_paste  TEXT,
  external_ref    TEXT,
  notes           TEXT,
  metadata        JSONB         DEFAULT '{}',
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_charges_client_id ON public.client_charges(client_id);
CREATE INDEX IF NOT EXISTS idx_client_charges_status    ON public.client_charges(status);
CREATE INDEX IF NOT EXISTS idx_client_charges_due_date  ON public.client_charges(due_date);
CREATE INDEX IF NOT EXISTS idx_client_charges_asaas_id  ON public.client_charges(asaas_id);

CREATE TABLE IF NOT EXISTS public.ai_settings (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_name   TEXT,
  phone                TEXT,
  whatsapp             TEXT,
  instagram            TEXT,
  address              TEXT,
  opening_hours        TEXT,
  welcome_message      TEXT,
  google_business_url  TEXT,
  sidebar_logo_url     TEXT,
  auto_reply_24h       BOOLEAN     NOT NULL DEFAULT true,
  forward_to_human     BOOLEAN     NOT NULL DEFAULT true,
  bot_active           BOOLEAN     NOT NULL DEFAULT true,
  meta_pixel_id        TEXT,
  google_tag_id        TEXT,
  asaas_api_key        TEXT,
  asaas_api_key_set    BOOLEAN     NOT NULL DEFAULT false,
  pix_enabled          BOOLEAN     NOT NULL DEFAULT true,
  boleto_enabled       BOOLEAN     NOT NULL DEFAULT true,
  credit_card_enabled  BOOLEAN     NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW public.ai_settings_safe WITH (security_invoker = true) AS
  SELECT id, establishment_name, phone, whatsapp, instagram, address,
    opening_hours, welcome_message, auto_reply_24h, forward_to_human,
    sidebar_logo_url, google_business_url, bot_active,
    meta_pixel_id, google_tag_id, asaas_api_key_set,
    pix_enabled, boleto_enabled, credit_card_enabled, updated_at, created_at
  FROM public.ai_settings;

DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'crm_users','crm_contacts','crm_products','crm_pipeline_stages',
    'crm_deals','crm_whatsapp_sessions','ai_reminders','ai_settings',
    'ai_events','client_charges'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "authenticated_access" ON public.%I', t);
    EXECUTE format('CREATE POLICY "authenticated_access" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
    EXECUTE format('DROP POLICY IF EXISTS "no_anon_access" ON public.%I', t);
    EXECUTE format('CREATE POLICY "no_anon_access" ON public.%I FOR ALL TO anon USING (false)', t);
  END LOOP;
END $rls$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DO $trg$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'crm_users','crm_contacts','crm_products','crm_deals',
    'crm_whatsapp_sessions','ai_reminders','ai_settings',
    'ai_events','client_charges'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t, t);
  END LOOP;
END $trg$;

CREATE OR REPLACE FUNCTION public.sync_auth_user_to_crm()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_client_id TEXT; v_role TEXT; v_full_name TEXT;
BEGIN
  v_client_id := COALESCE(NEW.raw_user_meta_data->>'client_id', NEW.raw_app_meta_data->>'client_id');
  v_role      := COALESCE(NEW.raw_user_meta_data->>'role', NEW.raw_app_meta_data->>'role', 'member');
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1));
  IF v_client_id IS NULL OR v_client_id = '' THEN RETURN NEW; END IF;
  INSERT INTO public.crm_users (id, client_id, email, full_name, role, active)
  VALUES (NEW.id, v_client_id, NEW.email, v_full_name, v_role, true)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, crm_users.full_name),
    updated_at = now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_auth_user ON auth.users;
CREATE TRIGGER trg_sync_auth_user
  AFTER INSERT OR UPDATE OF email, raw_user_meta_data, raw_app_meta_data ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_auth_user_to_crm();

CREATE OR REPLACE FUNCTION public.update_crm_user_last_seen()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.last_sign_in_at IS DISTINCT FROM NEW.last_sign_in_at AND NEW.last_sign_in_at IS NOT NULL THEN
    UPDATE public.crm_users SET last_seen_at = NEW.last_sign_in_at, updated_at = now() WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_crm_user_last_seen ON auth.users;
CREATE TRIGGER trg_crm_user_last_seen
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.update_crm_user_last_seen();

CREATE OR REPLACE FUNCTION public.save_asaas_settings(
  p_asaas_api_key TEXT DEFAULT NULL,
  p_pix_enabled BOOLEAN DEFAULT true,
  p_boleto_enabled BOOLEAN DEFAULT true,
  p_credit_card_enabled BOOLEAN DEFAULT false
) RETURNS JSONB SECURITY DEFINER LANGUAGE plpgsql AS $$
DECLARE v_id UUID;
BEGIN
  SELECT id INTO v_id FROM public.ai_settings LIMIT 1;
  IF v_id IS NOT NULL THEN
    IF p_asaas_api_key IS NOT NULL AND p_asaas_api_key <> '' THEN
      UPDATE public.ai_settings SET asaas_api_key=p_asaas_api_key, asaas_api_key_set=true,
        pix_enabled=p_pix_enabled, boleto_enabled=p_boleto_enabled,
        credit_card_enabled=p_credit_card_enabled, updated_at=now() WHERE id=v_id;
    ELSE
      UPDATE public.ai_settings SET pix_enabled=p_pix_enabled, boleto_enabled=p_boleto_enabled,
        credit_card_enabled=p_credit_card_enabled, updated_at=now() WHERE id=v_id;
    END IF;
  ELSE
    INSERT INTO public.ai_settings (asaas_api_key, asaas_api_key_set, pix_enabled, boleto_enabled, credit_card_enabled)
    VALUES (NULLIF(p_asaas_api_key,''), (p_asaas_api_key IS NOT NULL AND p_asaas_api_key<>''),
      p_pix_enabled, p_boleto_enabled, p_credit_card_enabled) RETURNING id INTO v_id;
  END IF;
  RETURN jsonb_build_object('success', true, 'asaas_api_key_set',
    (SELECT asaas_api_key_set FROM public.ai_settings WHERE id=v_id));
END; $$;

CREATE OR REPLACE FUNCTION public.exec_sql(sql_query TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  EXECUTE sql_query;
  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END; $$;

REVOKE ALL ON FUNCTION public.exec_sql(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exec_sql(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.exec_sql(TEXT) FROM authenticated;

-- ── Upgrades incrementais (aplicados em bancos legados a cada execução) ────────
-- Cada bloco é idempotente e corrige estruturas de versões anteriores do schema.

-- v3.1: ai_events — adiciona colunas novas se não existirem
ALTER TABLE public.ai_events ADD COLUMN IF NOT EXISTS client_id   TEXT;
ALTER TABLE public.ai_events ADD COLUMN IF NOT EXISTS rules       TEXT;
ALTER TABLE public.ai_events ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT now();

-- v3.1: ai_events — converte coluna time de TIME para TEXT se ainda for TIME
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'ai_events'
      AND column_name  = 'time'
      AND data_type    = 'time without time zone'
  ) THEN
    ALTER TABLE public.ai_events
      ALTER COLUMN time TYPE TEXT USING to_char(time, 'HH24:MI');
  END IF;
END $$;

-- v3.1: ai_events — migra valores legados do enum type
UPDATE public.ai_events SET type = 'musica_ao_vivo' WHERE type = 'schedule';
UPDATE public.ai_events SET type = 'dia_especial'   WHERE type = 'event';
UPDATE public.ai_events SET type = 'musica_ao_vivo'
  WHERE type IS NULL OR type NOT IN ('musica_ao_vivo','dia_especial');

-- v3.1: ai_events — remove constraint antiga e recria com novos valores
DO $$
DECLARE v_constraint TEXT;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.ai_events'::regclass
    AND contype  = 'c'
    AND pg_get_constraintdef(oid) LIKE '%type%'
    AND conname <> 'ai_events_type_check';
  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.ai_events DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

ALTER TABLE public.ai_events DROP CONSTRAINT IF EXISTS ai_events_type_check;
ALTER TABLE public.ai_events
  ADD CONSTRAINT ai_events_type_check
  CHECK (type IN ('musica_ao_vivo','dia_especial'));

-- v3.1: ai_events — recria índices que dependem de client_id
CREATE INDEX IF NOT EXISTS idx_ai_events_client_id ON public.ai_events(client_id);

-- v3.1: client_charges — garante colunas se tabela já existir sem algumas delas
ALTER TABLE public.client_charges ADD COLUMN IF NOT EXISTS notes        TEXT;
ALTER TABLE public.client_charges ADD COLUMN IF NOT EXISTS metadata     JSONB DEFAULT '{}';
ALTER TABLE public.client_charges ADD COLUMN IF NOT EXISTS external_ref TEXT;

INSERT INTO public.schema_migrations (version)
VALUES ('bank_b_full_schema_v3')
ON CONFLICT (version) DO NOTHING;

INSERT INTO public.schema_migrations (version)
VALUES ('bank_b_upgrade_v3_1')
ON CONFLICT (version) DO NOTHING;
`;

// ─────────────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Não autorizado" }, 401);

  let body: { client_id?: string };
  try { body = await req.json(); }
  catch { return json({ error: "JSON inválido" }, 400); }

  const { client_id } = body;
  if (!client_id) return json({ error: "client_id é obrigatório" }, 400);

  const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Valida o chamador (agente n8n usa service_role diretamente; usuário humano passa JWT)
  const jwt = authHeader.replace("Bearer ", "").trim();
  const { data: { user: caller } } = await adminClient.auth.getUser(jwt);
  if (caller) {
    // Chamada por usuário autenticado — verifica permissão
    const { data: profile } = await adminClient
      .from("profiles").select("role").eq("id", caller.id).single();
    if (!["owner", "admin"].includes(profile?.role ?? "")) {
      return json({ error: "Apenas owner/admin pode provisionar" }, 403);
    }
  }
  // Se caller === null, assume service_role (n8n interno) — sem restrição adicional

  // Busca credenciais do Banco B do cliente
  const { data: clientData, error: clientErr } = await adminClient
    .from("clients")
    .select("id, name, dashboard_slug, client_supabase_url, client_supabase_service_key")
    .eq("id", client_id)
    .maybeSingle();

  if (clientErr || !clientData) {
    return json({ error: "Cliente não encontrado" }, 404);
  }

  const bankBUrl        = clientData.client_supabase_url as string | null;
  // service_key obrigatória por cliente — sem fallback global (isolamento total)
  const bankBServiceKey = (clientData as Record<string, unknown>).client_supabase_service_key as string | null;

  if (!bankBUrl || !bankBServiceKey) {
    return json({
      error: `Cliente "${clientData.name}" não tem client_supabase_url ou client_supabase_service_key configurados. ` +
             "Preencha esses campos no C8 Control antes de provisionar.",
      client_id,
      client_name: clientData.name,
    }, 400);
  }

  // Conecta ao Banco B isolado do cliente
  const bankBAdmin = createClient(bankBUrl, bankBServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Executa o schema completo via exec_sql
  // Na primeira execução o exec_sql ainda não existe — usa rpc diretamente
  // com o schema completo que inclui a criação do próprio exec_sql
  try {
    const { error } = await bankBAdmin.rpc("exec_sql", { sql_query: BANK_B_FULL_SCHEMA });
    if (error) {
      // exec_sql pode não existir ainda (primeiro provisionamento)
      // Nesse caso o n8n deve rodar o schema via HTTP REST do Supabase
      console.warn("[provision-client-db] exec_sql não disponível:", error.message);
      return json({
        success: false,
        error:   "exec_sql não disponível neste banco. Execute bank_b_full_schema.sql manualmente uma vez para bootstrap inicial.",
        hint:    "Após o bootstrap, todas as atualizações futuras funcionarão automaticamente via esta Edge Function.",
        client_id,
        client_name: clientData.name,
      }, 422);
    }

    // Seed dos estágios padrão com o client_id real
    const seedSql = `
      UPDATE public.crm_pipeline_stages
      SET client_id = '${client_id}'
      WHERE client_id = '__pending__';

      INSERT INTO public.crm_pipeline_stages (client_id, name, "order", color)
      SELECT '${client_id}', name, ord, color FROM (VALUES
        ('Leads',        0, '#6366f1'),
        ('Qualificados', 1, '#3b82f6'),
        ('Proposta',     2, '#f59e0b'),
        ('Negociação',   3, '#ec4899'),
        ('Ganhos',       4, '#10b981')
      ) AS t(name, ord, color)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.crm_pipeline_stages WHERE client_id = '${client_id}'
      );
    `;
    await bankBAdmin.rpc("exec_sql", { sql_query: seedSql });

    return json({
      success:     true,
      client_id,
      client_name: clientData.name,
      message:     "Schema aplicado com sucesso.",
    });
  } catch (e: unknown) {
    return json({
      success: false,
      error:   e instanceof Error ? e.message : String(e),
      client_id,
    }, 500);
  }
});
