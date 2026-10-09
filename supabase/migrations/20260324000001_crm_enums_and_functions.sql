-- Migration 1: CRM Enums e Funcoes Utilitarias
-- Idempotente: usa blocos DO com EXCEPTION para enums e CREATE OR REPLACE para funcao.

-- Enum: Status do Cliente
DO $$
BEGIN
  CREATE TYPE client_status_enum AS ENUM ('ativo', 'inativo', 'prospect');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Enum: Status do Contrato
DO $$
BEGIN
  CREATE TYPE contract_status_enum AS ENUM ('ativo', 'pausado', 'encerrado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Enum: Tipo de Servico do Contrato
DO $$
BEGIN
  CREATE TYPE service_type_enum AS ENUM (
    'trafego_pago',
    'branding',
    'site',
    'social_media',
    'consultoria',
    'outro'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Enum: Status do Lead (Pipeline Kanban)
DO $$
BEGIN
  CREATE TYPE lead_status_enum AS ENUM (
    'novo',
    'contato',
    'qualificado',
    'proposta',
    'negociacao',
    'fechado',
    'perdido'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Enum: Temperatura do Lead
DO $$
BEGIN
  CREATE TYPE lead_temperature_enum AS ENUM ('frio', 'morno', 'quente');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Enum: Tipo de Interacao com Lead
DO $$
BEGIN
  CREATE TYPE interaction_type_enum AS ENUM (
    'ligacao',
    'whatsapp',
    'email',
    'reuniao',
    'anotacao'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Enum: Tags de Lead
DO $$
BEGIN
  CREATE TYPE tag_label_enum AS ENUM (
    'interessado',
    'cliente',
    'alto_valor',
    'indicacao',
    'urgente'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Funcao: Atualizar updated_at automaticamente
-- Usada como trigger BEFORE UPDATE em contracts e crm_leads.
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
