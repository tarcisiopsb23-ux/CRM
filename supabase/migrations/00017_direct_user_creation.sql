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
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_org_id UUID;
  org_slug TEXT;
  token_row RECORD;
  token_val TEXT;
  direct_org TEXT;
BEGIN
  -- Cadastro direto: admin criou usuário com organization_id no metadata
  direct_org := NEW.raw_user_meta_data->>'direct_organization_id';
  IF direct_org IS NOT NULL AND TRIM(direct_org) != '' THEN
    new_org_id := direct_org::UUID;
    IF EXISTS (SELECT 1 FROM organizations WHERE id = new_org_id) THEN
      INSERT INTO public.profiles (id, organization_id, full_name, email, phone, role, metadata)
      VALUES (
        NEW.id,
        new_org_id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        COALESCE(NEW.email, ''),
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
          'notes', NEW.raw_user_meta_data->>'notes'
        )
      );
      RETURN NEW;
    END IF;
  END IF;

  -- Suporta invitation_token (novo) ou registration_code (legado)
  token_val := COALESCE(
    NEW.raw_user_meta_data->>'invitation_token',
    NEW.raw_user_meta_data->>'registration_code'
  );

  IF token_val IS NOT NULL AND TRIM(token_val) != '' THEN
    SELECT id, organization_id INTO token_row
    FROM public.invitation_tokens
    WHERE token = TRIM(token_val)
      AND used_by IS NULL
      AND expires_at > NOW();

    IF NOT FOUND THEN
      SELECT id, organization_id INTO token_row
      FROM public.registration_codes
      WHERE code = TRIM(token_val)
        AND used_by IS NULL
        AND expires_at > NOW();
    ELSE
      UPDATE public.invitation_tokens
      SET used_by = NEW.id, used_at = NOW()
      WHERE id = token_row.id;
    END IF;

    IF token_row.id IS NOT NULL THEN
      new_org_id := token_row.organization_id;
      
      IF NOT EXISTS (SELECT 1 FROM public.invitation_tokens WHERE id = token_row.id) THEN
        UPDATE public.registration_codes
        SET used_by = NEW.id, used_at = NOW()
        WHERE id = token_row.id;
      END IF;

      INSERT INTO public.profiles (id, organization_id, full_name, email, phone, role, metadata)
      VALUES (
        NEW.id,
        new_org_id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        COALESCE(NEW.email, ''),
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
          'notes', NEW.raw_user_meta_data->>'notes'
        )
      );
      RETURN NEW;
    END IF;
  END IF;

  -- Fluxo original: novo usuário sem token - cria organização
  org_slug := LOWER(REGEXP_REPLACE(SPLIT_PART(NEW.email, '@', 1), '[^a-z0-9]', '', 'g'));
  IF LENGTH(org_slug) < 3 THEN
    org_slug := 'org-' || REPLACE(SUBSTRING(NEW.id::text, 1, 8), '-', '');
  END IF;
  org_slug := org_slug || '-' || SUBSTRING(NEW.id::text, 1, 8);

  INSERT INTO organizations (name, slug)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1)) || '''s Organization',
    org_slug
  )
  RETURNING id INTO new_org_id;

  INSERT INTO public.profiles (id, organization_id, full_name, email, role)
  VALUES (
    NEW.id,
    new_org_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    'owner'
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION handle_new_user IS 'Cria perfil para novo usuário. Suporta: direct_organization_id (admin), invitation_token, registration_code, ou nova organização.';
