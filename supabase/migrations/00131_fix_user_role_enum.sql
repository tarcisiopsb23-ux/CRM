-- =============================================================================
-- Migration 00131: Fix user_role enum — garantir que todos os valores existem
-- Idempotente: usa blocos DO com verificação de existência
-- Não altera tabelas — apenas o tipo enum
-- =============================================================================

DO $$
BEGIN
  -- Criar o enum se não existir
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('owner', 'admin', 'manager', 'member', 'viewer');
  ELSE
    -- Adicionar valores ausentes de forma idempotente
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumlabel = 'owner'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
    ) THEN
      ALTER TYPE user_role ADD VALUE 'owner';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumlabel = 'admin'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
    ) THEN
      ALTER TYPE user_role ADD VALUE 'admin';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumlabel = 'manager'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
    ) THEN
      ALTER TYPE user_role ADD VALUE 'manager';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumlabel = 'member'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
    ) THEN
      ALTER TYPE user_role ADD VALUE 'member';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumlabel = 'viewer'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
    ) THEN
      ALTER TYPE user_role ADD VALUE 'viewer';
    END IF;
  END IF;
END $$;
