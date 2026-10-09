-- =============================================================================
-- Migration 073: Cliente de Teste — Agência C8  ⚠️  DEPRECIADO
-- =============================================================================
--
-- !! SUBSTITUÍDO PELA MIGRATION 075_seed_test_client_banco_a.sql !!
--
-- Este seed foi criado quando o sistema ainda usava Banco B externo por cliente.
-- Ele depende de:
--   • Um projeto Supabase separado (Banco B) para o cliente de teste
--   • Provisionamento via Edge Function provision-client-db
--   • Credenciais client_supabase_url / anon_key preenchidas manualmente
--
-- O novo seed (075) usa EXCLUSIVAMENTE o Banco A (Maestr.IA):
--   • Usuário em dashboard_users + auth.users (formato login_key multi-tenant)
--   • Dados CRM em client_crm_*
--   • Dados IA em client_ai_*
--   • Sem Banco B, sem provision-client-db, sem placeholders
--
-- Use 075_seed_test_client_banco_a.sql para criar o cliente de teste.
-- Este arquivo é mantido apenas para referência histórica.
-- =============================================================================

DO $$
DECLARE
  v_org_id          UUID;
  v_client_id       UUID  := '00000000-0000-0000-0000-000000000099';
  v_contract_id     UUID  := '00000000-0000-0000-0000-000000000199';
  v_proposal_id     UUID  := '00000000-0000-0000-0000-000000000299';
BEGIN

  -- ── Obtém a organização principal ──────────────────────────────────────────
  SELECT id INTO v_org_id
  FROM public.organizations
  ORDER BY created_at
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma organização encontrada. Execute após criar a organização.';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 1. CLIENTE
  -- ═══════════════════════════════════════════════════════════════════════════
  INSERT INTO public.clients (
    id,
    organization_id,
    name,
    company,
    email,
    phone,
    document,
    niche,
    origin,
    registration_type,
    dashboard_slug,
    -- Banco B de teste: preencher com credenciais reais após criar o projeto Supabase
    -- Por ora usa placeholder para que o registro apareça no sistema
    client_supabase_url,
    client_supabase_anon_key,
    client_supabase_service_key_set,
    c8_control_enabled,
    is_active,
    metadata,
    created_at,
    updated_at
  ) VALUES (
    v_client_id,
    v_org_id,
    'Cliente Teste C8',
    'Empresa Teste Ltda',
    'teste@teste.com',
    '(11) 99999-0001',
    '00.000.000/0001-00',
    'Tecnologia',
    'Indicação',
    'cliente',
    'teste-agencia-c8',
    -- SUBSTITUIR pelas credenciais reais do Banco B de teste:
    'https://PLACEHOLDER.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.PLACEHOLDER',
    false,
    true,
    true,
    '{"is_test_client": true, "dashboard_password": "12345678"}'::jsonb,
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 2. CONTRATO (habilita acesso ao C8 Control via service_contracted)
  -- ═══════════════════════════════════════════════════════════════════════════
  INSERT INTO public.contracts (
    id,
    organization_id,
    client_id,
    title,
    service_contracted,
    value,
    status,
    start_date,
    end_date,
    billing_cycle,
    created_at,
    updated_at
  ) VALUES (
    v_contract_id,
    v_org_id,
    v_client_id,
    'Assessoria de Marketing e Vendas — Teste',
    'Assessoria de Marketing e Vendas',
    3000.00,
    'ativo',
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '12 months',
    'mensal',
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 3. PLANO C8 CONTROL
  --    c8_activation_status = 'ativo' → NÃO aparece na fila de pendentes
  --    provisioning_status  = 'confirmed' → marcado como provisionado
  -- ═══════════════════════════════════════════════════════════════════════════
  INSERT INTO public.crm_client_plans (
    organization_id,
    client_id,
    plan_name,
    plan_value,
    max_users,
    due_day,
    subscription_status,
    billing_cycle,
    primary_user_email,
    c8_activation_status,
    c8_activated_at,
    c8_included,
    provisioning_status,
    provisioned_at,
    contract_start,
    contract_end,
    modules,
    modules_config,
    created_at,
    updated_at
  ) VALUES (
    v_org_id,
    v_client_id,
    'Assessoria',
    3000.00,
    5,
    1,
    'ativo',
    'mensal',
    'teste@teste.com',
    'ativo',
    now(),
    false,
    'confirmed',
    now(),
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '12 months',
    ARRAY['crm', 'whatsapp', 'ia', 'financeiro'],
    '{
      "crm_enabled": true,
      "whatsapp_enabled": true,
      "ia_enabled": true,
      "asaas_enabled": false,
      "max_contacts": 500,
      "max_users": 5
    }'::jsonb,
    now(),
    now()
  )
  ON CONFLICT (client_id) DO NOTHING;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 4. PROPOSTA COM DADOS MOCKADOS (dashboard público)
  --    Acessível em: /proposta/teste-agencia-c8
  -- ═══════════════════════════════════════════════════════════════════════════
  INSERT INTO public.proposals (
    id,
    organization_id,
    client_id,
    title,
    public_slug,

    -- Hero
    hero_title,
    hero_subtitle,
    hero_message,
    hero_whatsapp_text,
    hero_whatsapp_number,
    hero_cta_text,
    hero_cta_color,

    -- Financeiro
    plan_value,
    schedule,

    -- Projeções mockadas
    projecoes,

    -- Status
    status,
    created_at,
    updated_at
  ) VALUES (
    v_proposal_id,
    v_org_id,
    v_client_id,
    'Proposta Comercial — Cliente Teste C8',
    'teste-agencia-c8',

    -- Hero
    'Acelere o Crescimento da Sua Empresa',
    'Assessoria de Marketing e Vendas com resultado comprovado',
    'Desenvolvemos uma estratégia personalizada para transformar o marketing da Empresa Teste Ltda em uma máquina de aquisição de clientes — com acompanhamento semanal, relatórios transparentes e metas claras.',
    'Falar no WhatsApp',
    '5511999990001',
    'Aprovar Proposta',
    '#7c3aed',

    -- Financeiro: R$ 3.000/mês
    3000.00,
    '{
      "mode": "mensal",
      "setup": null,
      "monthly": 3000,
      "months": 12
    }'::jsonb,

    -- Projeções mockadas realistas
    '{
      "kpis": [
        { "label": "Leads qualificados/mês",  "value": "80",      "suffix": "+" },
        { "label": "CAC estimado",             "value": "R$ 187",  "suffix": ""  },
        { "label": "ROAS esperado",            "value": "4,2x",    "suffix": ""  },
        { "label": "Crescimento em 6 meses",   "value": "38",      "suffix": "%"  }
      ],
      "comparativo": {
        "label_antes": "Sem Assessoria",
        "label_depois": "Com Assessoria C8",
        "items": [
          { "metric": "Leads/mês",          "antes": "12",     "depois": "80",      "suffix": "" },
          { "metric": "Taxa de conversão",  "antes": "4%",     "depois": "9%",      "suffix": "" },
          { "metric": "Custo por lead",     "antes": "R$ 420", "depois": "R$ 187",  "suffix": "" },
          { "metric": "Clientes fechados",  "antes": "1",      "depois": "7",       "suffix": "/mês" }
        ]
      },
      "crescimento": {
        "label": "Projeção de receita incremental (R$)",
        "data": [
          { "mes": "Mês 1",  "valor": 4200  },
          { "mes": "Mês 2",  "valor": 6800  },
          { "mes": "Mês 3",  "valor": 9500  },
          { "mes": "Mês 4",  "valor": 13200 },
          { "mes": "Mês 5",  "valor": 17400 },
          { "mes": "Mês 6",  "valor": 22000 }
        ]
      },
      "roi": {
        "investimento": 3000,
        "retorno_estimado": 22000,
        "prazo_meses": 6
      }
    }'::jsonb,

    'enviada',
    now(),
    now()
  )
  ON CONFLICT (id)       DO NOTHING;

  -- Se o slug já existe em outra proposta, atualiza a proposta existente com os dados mockados
  -- (cobre o caso de reexecução quando o UUID não conflita mas o slug sim)
  UPDATE public.proposals SET
    organization_id   = v_org_id,
    client_id         = v_client_id,
    title             = 'Proposta Comercial — Cliente Teste C8',
    hero_title        = 'Acelere o Crescimento da Sua Empresa',
    hero_subtitle     = 'Assessoria de Marketing e Vendas com resultado comprovado',
    hero_message      = 'Desenvolvemos uma estratégia personalizada para transformar o marketing da Empresa Teste Ltda em uma máquina de aquisição de clientes — com acompanhamento semanal, relatórios transparentes e metas claras.',
    hero_whatsapp_text    = 'Falar no WhatsApp',
    hero_whatsapp_number  = '5511999990001',
    hero_cta_text         = 'Aprovar Proposta',
    hero_cta_color        = '#7c3aed',
    plan_value        = 3000.00,
    status            = 'enviada',
    updated_at        = now()
  WHERE public_slug = 'teste-agencia-c8'
    AND id != v_proposal_id;

END $$;

-- =============================================================================
-- Registro de versão
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.schema_migrations (version)
VALUES ('seed_test_client_v1')
ON CONFLICT (version) DO NOTHING;

-- =============================================================================
-- PÓS-EXECUÇÃO — Passos manuais obrigatórios para o usuário teste@teste.com
-- =============================================================================
--
-- Este seed cria o cliente e os dados mockados no Banco A.
-- O usuário teste@teste.com/12345678 vive no Banco B (projeto Supabase do cliente).
-- Siga os passos abaixo para ativá-lo:
--
-- PASSO 1 — Obter o client_id criado:
--   SELECT id, name, dashboard_slug FROM public.clients
--   WHERE id = '00000000-0000-0000-0000-000000000099';
--
-- PASSO 2 — Salvar a service_key real do Banco B de teste:
--   SELECT public.save_client_supabase_credentials(
--     '00000000-0000-0000-0000-000000000099',
--     '<sua_service_role_key_do_banco_b>',
--     NULL, NULL
--   );
--
-- PASSO 3 — Atualizar as credenciais públicas (URL e anon key) no cliente:
--   UPDATE public.clients SET
--     client_supabase_url      = 'https://SEU-PROJETO.supabase.co',
--     client_supabase_anon_key = 'eyJ...anon_key...'
--   WHERE id = '00000000-0000-0000-0000-000000000099';
--
-- PASSO 4 — Provisionar o schema no Banco B:
--   POST /functions/v1/provision-client-db
--   Body: { "client_id": "00000000-0000-0000-0000-000000000099" }
--
-- PASSO 5 — Criar o usuário teste@teste.com no Banco B:
--   POST /functions/v1/c8-provision-tenant
--   Body: {
--     "client_id":          "00000000-0000-0000-0000-000000000099",
--     "admin_email":        "teste@teste.com",
--     "admin_password":     "12345678",
--     "send_welcome_email": false
--   }
--
-- Após isso:
--   • CRM → Clientes: aparece "Cliente Teste C8"
--   • CRM → C8 Control: aparece como ativo (c8_activation_status = 'ativo')
--   • Dashboard público: /proposta/teste-agencia-c8
--   • Login dashboard: teste@teste.com / 12345678
-- =============================================================================
