-- =============================================================================
-- Migration 075: Cliente de Teste — Formato Banco A Unificado
-- Banco A — Idempotente
--
-- Substitui 073_seed_test_client.sql (dependia de Banco B externo).
-- Usa EXCLUSIVAMENTE o Banco A: tabelas client_crm_*, client_ai_*,
-- dashboard_users e auth.users no formato multi-tenant login_key.
--
-- CREDENCIAIS:  teste@teste.com  /  12345678
-- SLUG:         teste-agencia-c8
-- DASHBOARD:    /proposta/teste-agencia-c8
--
-- Execute: Supabase SQL Editor com service_role.
-- =============================================================================

-- Garante a tabela de versões no Banco A
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- Cria função temporária para evitar problemas de parsing do SQL Editor
-- com blocos DO $$ grandes (erro "relation v_xxx does not exist")
-- =============================================================================
CREATE OR REPLACE FUNCTION public._seed_test_client_075()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $func$
DECLARE
  v_org_id         UUID;
  v_client_id      UUID := '00000000-0000-0000-0000-000000000099';
  v_contract_id    UUID := '00000000-0000-0000-0000-000000000199';
  v_proposal_id    UUID := '00000000-0000-0000-0000-000000000299';
  v_contact1_id    UUID := '00000000-0000-0000-0000-000000000401';
  v_contact2_id    UUID := '00000000-0000-0000-0000-000000000402';
  v_contact3_id    UUID := '00000000-0000-0000-0000-000000000403';
  v_stage1_id      UUID := '00000000-0000-0000-0000-000000000501';
  v_stage2_id      UUID := '00000000-0000-0000-0000-000000000502';
  v_stage3_id      UUID := '00000000-0000-0000-0000-000000000503';
  v_stage4_id      UUID := '00000000-0000-0000-0000-000000000504';
  v_stage5_id      UUID := '00000000-0000-0000-0000-000000000505';
  v_deal1_id       UUID := '00000000-0000-0000-0000-000000000601';
  v_deal2_id       UUID := '00000000-0000-0000-0000-000000000602';
  v_product1_id    UUID := '00000000-0000-0000-0000-000000000701';
  v_product2_id    UUID := '00000000-0000-0000-0000-000000000702';
  v_du_id          UUID := '00000000-0000-0000-0000-000000000801';
  v_professional1_id UUID := '00000000-0000-0000-0000-000000000901';
  v_auth_user_id   UUID;
  v_login_key      TEXT := 'teste@teste.com::teste-agencia-c8';
  v_int_email      TEXT := 'teste@teste.com::teste-agencia-c8@c8.internal';
BEGIN

  SELECT id INTO v_org_id FROM public.organizations ORDER BY created_at LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma organização encontrada.';
  END IF;

  -- ── 1. CLIENTE ─────────────────────────────────────────────────────────────
  INSERT INTO public.clients (
    id, organization_id,
    name, company, email, phone, document,
    niche, origin, registration_type, dashboard_slug,
    client_supabase_url, client_supabase_anon_key,
    client_supabase_service_key_set,
    c8_control_enabled, is_active, show_ia_content, metadata,
    created_at, updated_at
  ) VALUES (
    v_client_id, v_org_id,
    'Cliente Teste C8', 'Empresa Teste Ltda',
    'teste@teste.com', '(11) 99999-0001', '00.000.000/0001-00',
    'Tecnologia', 'Indicação', 'cliente', 'teste-agencia-c8',
    NULL, NULL, false,
    true, true, true,   -- c8_control_enabled, is_active, show_ia_content
    '{"is_test_client":true,"banco_a_native":true}'::jsonb,
    now(), now()
  )
  ON CONFLICT (id) DO UPDATE SET
    c8_control_enabled = true,
    is_active          = true,
    show_ia_content    = true,
    updated_at         = now();

  -- ── 2. CONTRATO ────────────────────────────────────────────────────────────
  INSERT INTO public.contracts (
    id, organization_id, client_id,
    title, service_contracted,
    value, status, start_date, end_date, billing_cycle,
    created_at, updated_at
  ) VALUES (
    v_contract_id, v_org_id, v_client_id,
    'Assessoria de Marketing e Vendas — Teste',
    'Assessoria de Marketing e Vendas',
    3000.00, 'ativo',
    CURRENT_DATE, CURRENT_DATE + INTERVAL '12 months', 'mensal',
    now(), now()
  )
  ON CONFLICT (id) DO NOTHING;

  -- ── 3. PLANO C8 CONTROL ────────────────────────────────────────────────────
  INSERT INTO public.crm_client_plans (
    organization_id, client_id,
    plan_name, plan_value, max_users, due_day,
    subscription_status, billing_cycle, primary_user_email,
    c8_activation_status, c8_activated_at, c8_included,
    provisioning_status, provisioned_at,
    contract_start, contract_end,
    modules, modules_config,
    created_at, updated_at
  ) VALUES (
    v_org_id, v_client_id,
    'Assessoria', 3000.00, 5, 1,
    'ativo', 'mensal', 'teste@teste.com',
    'ativo', now(), false,
    'confirmed', now(),
    CURRENT_DATE, CURRENT_DATE + INTERVAL '12 months',
    ARRAY['crm','whatsapp','ia','financeiro','agenda'],
    '{"crm_enabled":true,"whatsapp_enabled":true,"ia_enabled":true,"asaas_enabled":false,"max_contacts":500,"max_users":5,"agenda_enabled":true}'::jsonb,
    now(), now()
  )
  ON CONFLICT (client_id) DO UPDATE SET
    c8_activation_status = 'ativo',
    provisioning_status  = 'confirmed',
    modules_config       = EXCLUDED.modules_config,
    updated_at           = now();

  -- ── 4. PROPOSTA (dashboard público) ───────────────────────────────────────
  INSERT INTO public.proposals (
    id, organization_id, client_id,
    title, public_slug,
    hero_title, hero_subtitle, hero_message,
    hero_whatsapp_text, hero_whatsapp_number,
    hero_cta_text, hero_cta_color,
    plan_value, schedule, projecoes,
    status, created_at, updated_at
  ) VALUES (
    v_proposal_id, v_org_id, v_client_id,
    'Proposta Comercial — Cliente Teste C8', 'teste-agencia-c8',
    'Acelere o Crescimento da Sua Empresa',
    'Assessoria de Marketing e Vendas com resultado comprovado',
    'Desenvolvemos uma estratégia personalizada para transformar o marketing da Empresa Teste Ltda em uma máquina de aquisição de clientes.',
    'Falar no WhatsApp', '5511999990001',
    'Aprovar Proposta', '#7c3aed',
    3000.00,
    '{"mode":"mensal","setup":null,"monthly":3000,"months":12}'::jsonb,
    '{"kpis":[{"label":"Leads qualificados/mês","value":"80","suffix":"+"},{"label":"CAC estimado","value":"R$ 187","suffix":""},{"label":"ROAS esperado","value":"4,2x","suffix":""},{"label":"Crescimento em 6 meses","value":"38","suffix":"%"}],"comparativo":{"label_antes":"Sem Assessoria","label_depois":"Com Assessoria C8","items":[{"metric":"Leads/mês","antes":"12","depois":"80","suffix":""},{"metric":"Taxa de conversão","antes":"4%","depois":"9%","suffix":""},{"metric":"Custo por lead","antes":"R$ 420","depois":"R$ 187","suffix":""},{"metric":"Clientes fechados","antes":"1","depois":"7","suffix":"/mês"}]},"crescimento":{"label":"Projeção de receita incremental (R$)","data":[{"mes":"Mês 1","valor":4200},{"mes":"Mês 2","valor":6800},{"mes":"Mês 3","valor":9500},{"mes":"Mês 4","valor":13200},{"mes":"Mês 5","valor":17400},{"mes":"Mês 6","valor":22000}]},"roi":{"investimento":3000,"retorno_estimado":22000,"prazo_meses":6}}'::jsonb,
    'enviada', now(), now()
  )
  ON CONFLICT (id) DO NOTHING;

  -- ── 5. ETAPAS DO PIPELINE ──────────────────────────────────────────────────
  INSERT INTO public.client_crm_pipeline_stages
    (id, client_id, organization_id, name, "order", color)
  VALUES
    (v_stage1_id, v_client_id, v_org_id, 'Leads',        0, '#6366f1'),
    (v_stage2_id, v_client_id, v_org_id, 'Qualificados', 1, '#3b82f6'),
    (v_stage3_id, v_client_id, v_org_id, 'Proposta',     2, '#f59e0b'),
    (v_stage4_id, v_client_id, v_org_id, 'Negociação',   3, '#ec4899'),
    (v_stage5_id, v_client_id, v_org_id, 'Ganhos',       4, '#10b981')
  ON CONFLICT (id) DO NOTHING;

  -- ── 6. CONTATOS ────────────────────────────────────────────────────────────
  INSERT INTO public.client_crm_contacts
    (id, client_id, organization_id, name, phone, email, source, tags, notes)
  VALUES
    (v_contact1_id, v_client_id, v_org_id,
     'Ana Lima', '(11) 91111-2222', 'ana.lima@email.com',
     'Instagram', ARRAY['lead-quente','social'], 'Interessada em gestão de redes sociais'),
    (v_contact2_id, v_client_id, v_org_id,
     'Bruno Martins', '(11) 93333-4444', 'bruno.martins@empresa.com',
     'Indicação', ARRAY['lead-morno','b2b'], 'Empresa de varejo, quer aumentar presença digital'),
    (v_contact3_id, v_client_id, v_org_id,
     'Carla Souza', '(11) 95555-6666', 'carla@startup.io',
     'Google Ads', ARRAY['lead-quente','startup'], 'Startup de tecnologia, já investe em marketing')
  ON CONFLICT (id) DO NOTHING;

  -- ── 7. PRODUTOS ────────────────────────────────────────────────────────────
  INSERT INTO public.client_crm_products
    (id, client_id, organization_id, name, description, price, unit, active)
  VALUES
    (v_product1_id, v_client_id, v_org_id,
     'Assessoria Mensal', 'Gestão completa de marketing digital com relatório semanal',
     3000.00, 'mês', true),
    (v_product2_id, v_client_id, v_org_id,
     'Setup Inicial', 'Diagnóstico, posicionamento e criação de identidade de marca',
     1500.00, 'único', true)
  ON CONFLICT (id) DO NOTHING;

  -- ── 8. NEGOCIAÇÕES ─────────────────────────────────────────────────────────
  INSERT INTO public.client_crm_deals
    (id, client_id, organization_id,
     contact_id, product_id, stage_id,
     title, value, status, notes, expected_close_date)
  VALUES
    (v_deal1_id, v_client_id, v_org_id,
     v_contact1_id, v_product1_id, v_stage3_id,
     'Assessoria Mensal — Ana Lima', 3000.00, 'open',
     'Reunião marcada para apresentar proposta completa',
     CURRENT_DATE + INTERVAL '7 days'),
    (v_deal2_id, v_client_id, v_org_id,
     v_contact3_id, v_product2_id, v_stage2_id,
     'Setup + Assessoria — Carla Souza', 4500.00, 'open',
     'Startup com orçamento aprovado, aguardando assinatura',
     CURRENT_DATE + INTERVAL '3 days')
  ON CONFLICT (id) DO NOTHING;

  -- ── 9. AI SETTINGS ─────────────────────────────────────────────────────────
  INSERT INTO public.client_ai_settings (
    client_id, organization_id,
    establishment_name, phone, whatsapp, instagram,
    address, opening_hours, welcome_message,
    auto_reply_24h, forward_to_human, bot_active,
    pix_enabled, boleto_enabled, credit_card_enabled, asaas_api_key_set
  ) VALUES (
    v_client_id, v_org_id,
    'Empresa Teste Ltda', '(11) 99999-0001', '5511999990001', '@empresateste',
    'Av. Paulista, 1000 — São Paulo, SP',
    '{"seg":[{"open":"09:00","close":"18:00"}],"ter":[{"open":"09:00","close":"18:00"}],"qua":[{"open":"09:00","close":"18:00"}],"qui":[{"open":"09:00","close":"18:00"}],"sex":[{"open":"09:00","close":"17:00"}],"sab":[],"dom":[]}',
    'Olá! Seja bem-vindo à Empresa Teste. Como posso ajudar você hoje?',
    true, true, true, true, false, false, false
  )
  ON CONFLICT (client_id) DO UPDATE SET
    establishment_name = EXCLUDED.establishment_name,
    updated_at         = now();

  -- ── 10. AVISOS ─────────────────────────────────────────────────────────────
  INSERT INTO public.client_ai_notices
    (client_id, organization_id, message, priority, validity, status)
  VALUES
    (v_client_id, v_org_id,
     'Black Friday: desconto de 20% na mensalidade para contratos fechados até 30/11!',
     'alta', (CURRENT_DATE + INTERVAL '30 days')::TEXT, 'active'),
    (v_client_id, v_org_id,
     'Webinar gratuito sobre tráfego pago: inscrições abertas pelo link na bio.',
     'média', (CURRENT_DATE + INTERVAL '14 days')::TEXT, 'active')
  ON CONFLICT DO NOTHING;

  -- ── 11. PROMOÇÕES ──────────────────────────────────────────────────────────
  INSERT INTO public.client_ai_promotions
    (client_id, organization_id, title, description, validity, type, status)
  VALUES
    (v_client_id, v_org_id,
     '1º Mês com 50% de Desconto',
     'Novo cliente fecha até o fim do mês e paga R$ 1.500 no primeiro mês.',
     (CURRENT_DATE + INTERVAL '30 days')::TEXT, 'desconto', 'active'),
    (v_client_id, v_org_id,
     'Indique e Ganhe',
     'Indique um amigo empresário e ganhe R$ 300 de crédito na sua fatura.',
     NULL, 'indicação', 'active')
  ON CONFLICT DO NOTHING;

  -- ── 12. SUGESTÕES ──────────────────────────────────────────────────────────
  INSERT INTO public.client_ai_suggestions
    (client_id, organization_id, name, description, price, status)
  VALUES
    (v_client_id, v_org_id,
     'Gestão de Instagram',
     'Produção de 12 posts/mês + stories diários + resposta de comentários',
     800.00, 'active'),
    (v_client_id, v_org_id,
     'Tráfego Pago (Google + Meta)',
     'Criação e gestão de campanhas com budget até R$ 3.000/mês incluso',
     1200.00, 'active')
  ON CONFLICT DO NOTHING;

  -- ── 13. EVENTOS SAZONAIS (client_ai_events) ────────────────────────────────
  -- Datas comemorativas e programações sazonais como base de dados para IA.
  -- Nenhuma informação interna — apenas datas relevantes para campanhas.
  INSERT INTO public.client_ai_events
    (client_id, organization_id, title, description, rules, date, time, type, status)
  VALUES
    (v_client_id, v_org_id,
     'Black Friday',
     'Última sexta-feira de novembro. Principal data de descontos do varejo brasileiro. Consumidores esperam ofertas agressivas, especialmente em tecnologia, moda e serviços.',
     'Iniciar comunicação de antecipação com 2 semanas de antecedência. Criar senso de urgência. Não prometer descontos que ainda não foram definidos pela gestão.',
     (DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '10 months 28 days')::DATE,
     NULL, 'dia_especial', 'active'),
    (v_client_id, v_org_id,
     'Natal',
     '25 de dezembro. Período de alto consumo para presentes, confraternizações e serviços especiais. Forte apelo emocional de reunião familiar e gratidão.',
     'Reforçar o apelo emocional e o valor do presente. Destacar prazos de entrega ou disponibilidade. Não criar falsas expectativas sobre personalização sem confirmar com a equipe.',
     (DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '11 months 24 days')::DATE,
     NULL, 'dia_especial', 'active'),
    (v_client_id, v_org_id,
     'Dia das Mães',
     'Segundo domingo de maio. Uma das datas de maior volume de vendas no Brasil. Público busca presentes, experiências e serviços diferenciados.',
     'Campanha deve iniciar com 3 semanas de antecedência. Valorizar o cuidado e a exclusividade. Evitar linguagem genérica — personalizar sempre que possível.',
     (DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '4 months 11 days')::DATE,
     NULL, 'dia_especial', 'active')
  ON CONFLICT DO NOTHING;

  -- ── 13b. PROFISSIONAL DE TESTE (client_schedule_professionals) ─────────────
  INSERT INTO public.client_schedule_professionals (
    id, client_id, organization_id,
    name, role, bio, color, active
  ) VALUES (
    v_professional1_id, v_client_id, v_org_id,
    'Ana Lima',
    'Consultora',
    'Especialista em marketing digital e estratégias de crescimento.',
    '#6366f1',
    true
  )
  ON CONFLICT (id) DO NOTHING;

  -- ── 13c. SERVIÇO DE AGENDA (client_schedule_services) ─────────────────────
  -- Vinculado ao produto "Assessoria Mensal" (v_product1_id)
  INSERT INTO public.client_schedule_services (
    client_id, crm_product_id,
    name, description, duration_min, price, color, active
  ) VALUES (
    v_client_id, v_product1_id,
    'Assessoria Mensal',
    'Gestão completa de marketing digital com relatório semanal',
    60, 3000.00, '#6366f1', true
  )
  ON CONFLICT DO NOTHING;

  -- ── 13d. CONFIGURAÇÃO DE EXIBIÇÃO DA AGENDA ────────────────────────────────
  -- Atualiza show_services e show_professionals nos horários existentes
  -- (ou insere config padrão se não existir)
  INSERT INTO public.client_schedule_config (
    client_id, weekday, start_time, end_time,
    slot_duration_min, max_per_slot, active,
    show_services, show_professionals
  )
  SELECT
    v_client_id, g.weekday, '09:00', '18:00',
    60, 1,
    g.weekday BETWEEN 1 AND 5,
    true,  -- show_services = true
    true   -- show_professionals = true
  FROM generate_series(0, 6) AS g(weekday)
  ON CONFLICT (client_id, weekday) DO UPDATE SET
    show_services      = true,
    show_professionals = true;

  -- ── 14. STATUS DE MIGRAÇÃO ─────────────────────────────────────────────────
  INSERT INTO public.client_migration_status (
    client_id, bank_b_slug, bank_b_url,
    status,
    users_migrated, crm_migrated, ai_migrated, charges_migrated,
    users_count, contacts_count, deals_count, events_count,
    started_at, completed_at
  ) VALUES (
    v_client_id, 'teste-agencia-c8', NULL,
    'completed',
    true, true, true, true,
    1, 3, 2, 1,
    now(), now()
  )
  ON CONFLICT (client_id) DO UPDATE SET
    status           = 'completed',
    users_migrated   = true,
    crm_migrated     = true,
    ai_migrated      = true,
    charges_migrated = true,
    completed_at     = COALESCE(client_migration_status.completed_at, now()),
    updated_at       = now();

  -- ── 15. auth.users ─────────────────────────────────────────────────────────
  SELECT id INTO v_auth_user_id
  FROM auth.users WHERE email = v_int_email LIMIT 1;

  IF v_auth_user_id IS NULL THEN
    INSERT INTO auth.users (
      id, instance_id, email,
      encrypted_password, email_confirmed_at,
      raw_user_meta_data, raw_app_meta_data,
      role, aud, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      '00000000-0000-0000-0000-000000000000',
      v_int_email,
      crypt('12345678', gen_salt('bf')),
      now(),
      jsonb_build_object(
        'login_key',    v_login_key,
        'real_email',   'teste@teste.com',
        'client_id',    v_client_id::TEXT,
        'client_slug',  'teste-agencia-c8',
        'full_name',    'Usuário Teste C8',
        'role',         'owner',
        'is_test_user', true
      ),
      jsonb_build_object('provider','email','providers',ARRAY['email']),
      'authenticated', 'authenticated', now(), now()
    )
    RETURNING id INTO v_auth_user_id;
    RAISE NOTICE 'auth.users criado: %', v_login_key;
  ELSE
    UPDATE auth.users SET
      encrypted_password = crypt('12345678', gen_salt('bf')),
      raw_user_meta_data = jsonb_build_object(
        'login_key',    v_login_key,
        'real_email',   'teste@teste.com',
        'client_id',    v_client_id::TEXT,
        'client_slug',  'teste-agencia-c8',
        'full_name',    'Usuário Teste C8',
        'role',         'owner',
        'is_test_user', true
      ),
      updated_at = now()
    WHERE id = v_auth_user_id;
    RAISE NOTICE 'auth.users atualizado: %', v_login_key;
  END IF;

  -- ── 16. dashboard_users ────────────────────────────────────────────────────
  INSERT INTO public.dashboard_users (
    id, client_id, organization_id,
    login_key, real_email, client_slug,
    auth_user_id, full_name, role,
    active, is_support
  ) VALUES (
    v_du_id, v_client_id, v_org_id,
    v_login_key, 'teste@teste.com', 'teste-agencia-c8',
    v_auth_user_id, 'Usuário Teste C8', 'owner',
    true, false
  )
  ON CONFLICT (login_key) DO UPDATE SET
    auth_user_id = COALESCE(EXCLUDED.auth_user_id, dashboard_users.auth_user_id),
    active       = true,
    updated_at   = now();

  RAISE NOTICE 'Seed 075 concluído. Login: teste@teste.com / 12345678';
END;
$func$;

-- Executa e remove a função temporária
SELECT public._seed_test_client_075();
DROP FUNCTION IF EXISTS public._seed_test_client_075();

-- Registra versão
INSERT INTO public.schema_migrations (version)
VALUES ('075_seed_test_client_banco_a_v1')
ON CONFLICT (version) DO NOTHING;

-- =============================================================================
-- Para verificar o resultado, execute o arquivo:
--   migrations/075_seed_test_client_verificacao.sql
-- =============================================================================
