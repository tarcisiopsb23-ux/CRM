-- =============================================================================
-- MAESTR.IA - Cadastro direto de colaborador (sem token)
-- =============================================================================
-- Admin cria usuário diretamente na aba Colaboradores. Sem link/convite.
-- Edge Function create-user-direct usa auth.admin.createUser com user_metadata.
-- =============================================================================

-- Atualiza handle_new_user para suportar direct_organization_id (cadastro direto)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  new_org_id UUID;
  token_row RECORD;
  token_val TEXT;
  direct_org_id TEXT;
  full_name_val TEXT;
  email_val TEXT;
BEGIN
  -- 1. Capturar dados básicos do usuário
  email_val := COALESCE(NEW.email, '');
  full_name_val := COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(email_val, '@', 1));

  -- 2. Identificar a Organização (4 caminhos possíveis)
  
  -- CAMINHO A: Cadastro Direto (via Edge Function admin)
  direct_org_id := NEW.raw_user_meta_data->>'direct_organization_id';
  
  IF direct_org_id IS NOT NULL AND direct_org_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    new_org_id := direct_org_id::UUID;
  
  ELSE
    -- CAMINHO B & C: Convite por Token ou Código
    token_val := COALESCE(
      NEW.raw_user_meta_data->>'invitation_token',
      NEW.raw_user_meta_data->>'registration_code'
    );

    IF token_val IS NOT NULL AND TRIM(token_val) != '' THEN
      -- Tenta Convite por Token
      SELECT id, organization_id INTO token_row
      FROM public.invitation_tokens
      WHERE token = TRIM(token_val) AND used_by IS NULL AND expires_at > NOW();

      IF FOUND THEN
        UPDATE public.invitation_tokens SET used_by = NEW.id, used_at = NOW() WHERE id = token_row.id;
        new_org_id := token_row.organization_id;
      ELSE
        -- Tenta Código de Registro
        SELECT id, organization_id INTO token_row
        FROM public.registration_codes
        WHERE code = TRIM(token_val) AND used_by IS NULL AND expires_at > NOW();

        IF FOUND THEN
          UPDATE public.registration_codes SET used_by = NEW.id, used_at = NOW() WHERE id = token_row.id;
          new_org_id := token_row.organization_id;
        END IF;
      END IF;
    END IF;
  END IF;

  -- CAMINHO D: Sem Token/Código - Criar nova organização (Owner)
  IF new_org_id IS NULL THEN
    DECLARE
      org_slug TEXT;
    BEGIN
      org_slug := LOWER(REGEXP_REPLACE(SPLIT_PART(email_val, '@', 1), '[^a-z0-9]', '', 'g'));
      IF LENGTH(org_slug) < 3 THEN
        org_slug := 'org-' || SUBSTRING(NEW.id::text, 1, 8);
      END IF;
      org_slug := org_slug || '-' || SUBSTRING(NEW.id::text, 1, 8);

      INSERT INTO public.organizations (name, slug)
      VALUES (full_name_val || '''s Organization', org_slug)
      RETURNING id INTO new_org_id;
      
      -- Se criar nova org, o papel é owner
      INSERT INTO public.profiles (id, organization_id, full_name, email, role)
      VALUES (NEW.id, new_org_id, full_name_val, email_val, 'owner')
      ON CONFLICT (id) DO UPDATE SET
        organization_id = EXCLUDED.organization_id,
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        role = EXCLUDED.role;
      
      RETURN NEW;
    END;
  END IF;

  -- 3. Inserir ou Atualizar Perfil (para Caminhos A, B e C)
  INSERT INTO public.profiles (
    id, 
    organization_id, 
    full_name, 
    email, 
    phone, 
    role, 
    metadata
  )
  VALUES (
    NEW.id,
    new_org_id,
    full_name_val,
    email_val,
    NEW.raw_user_meta_data->>'phone',
    'member',
    jsonb_build_object(
      'display_name', NEW.raw_user_meta_data->>'display_name',
      'cpf', NEW.raw_user_meta_data->>'cpf',
      'rg', NEW.raw_user_meta_data->>'rg',
      'pix_key', NEW.raw_user_meta_data->>'pix_key',
      'address_street', NEW.raw_user_meta_data->>'address_street',
      'address_city', NEW.raw_user_meta_data->>'address_city',
      'address_state', NEW.raw_user_meta_data->>'address_state',
      'address_zip', NEW.raw_user_meta_data->>'address_zip',
      'education_level', NEW.raw_user_meta_data->>'education_level',
      'graduation', NEW.raw_user_meta_data->>'graduation',
      'job_title', NEW.raw_user_meta_data->>'job_title',
      'base_salary', (NEW.raw_user_meta_data->>'base_salary')::NUMERIC,
      'commission_percent', (NEW.raw_user_meta_data->>'commission_percent')::NUMERIC,
      'overtime_factor', (NEW.raw_user_meta_data->>'overtime_factor')::NUMERIC,
      'notes', NEW.raw_user_meta_data->>'notes',
      'profile_completed', COALESCE((NEW.raw_user_meta_data->>'profile_completed')::BOOLEAN, false)
    )
  )
  ON CONFLICT (id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    role = EXCLUDED.role,
    metadata = EXCLUDED.metadata;

  RETURN NEW;
END;
$$;


COMMENT ON FUNCTION handle_new_user IS 'Cria perfil para novo usuário. Suporta: direct_organization_id (admin), invitation_token, registration_code, ou nova organização.';
