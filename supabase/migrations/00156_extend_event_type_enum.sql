-- Adiciona novos valores ao enum event_type
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'captacao';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'reuniao_integracao';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'reuniao_planejamento';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'reuniao_periodica';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'apresentacao_proposta';
