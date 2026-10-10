-- Migration 00107: Sistema de Avaliações V2
-- Adiciona: tipo probatorio, critérios expandidos, escala 1-10,
-- perguntas abertas, check-in, classificação no resultado
-- ESTRATÉGIA: 100% aditiva — nenhuma tabela dropada ou renomeada

-- ─── 1. Expandir tipo em ciclos_avaliacao ────────────────────────────────────
ALTER TABLE ciclos_avaliacao
  DROP CONSTRAINT IF EXISTS ciclos_avaliacao_tipo_check;

ALTER TABLE ciclos_avaliacao
  ADD CONSTRAINT ciclos_avaliacao_tipo_check
  CHECK (tipo IN ('360', 'checkin', 'probatorio'));

-- Campo extra para probatório: colaborador alvo específico
ALTER TABLE ciclos_avaliacao
  ADD COLUMN IF NOT EXISTS colaborador_alvo_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- ─── 2. Expandir critérios em respostas_avaliacao_360 ────────────────────────
ALTER TABLE respostas_avaliacao_360
  DROP CONSTRAINT IF EXISTS respostas_avaliacao_360_criterio_check;

ALTER TABLE respostas_avaliacao_360
  ADD CONSTRAINT respostas_avaliacao_360_criterio_check
  CHECK (criterio IN (
    -- 360 / Comportamental
    'comunicacao', 'trabalho_em_equipe', 'proatividade',
    'responsabilidade', 'alinhamento_cultural',
    -- 360 / Performance
    'qualidade_de_entrega', 'foco_em_resultados',
    -- 360 / Desenvolvimento
    'resolucao_de_problemas', 'evolucao_e_aprendizado',
    -- Probatório / Adaptação ao Cargo
    'dominio_tecnico', 'qualidade_entrega_prob', 'cumprimento_prazos',
    -- Probatório / Integração Cultural
    'adaptacao_cultura', 'relacionamento_equipe', 'comunicacao_prob',
    -- Probatório / Potencial
    'iniciativa', 'capacidade_aprendizado',
    -- Check-in (dimensões de sentimento)
    'bem_estar', 'progresso_metas', 'dificuldades',
    'alinhamento_gestor', 'motivacao'
  ));

-- ─── 3. Escala 1-10 (era 1-5) ────────────────────────────────────────────────
ALTER TABLE respostas_avaliacao_360
  DROP CONSTRAINT IF EXISTS respostas_avaliacao_360_nota_check;

ALTER TABLE respostas_avaliacao_360
  ADD CONSTRAINT respostas_avaliacao_360_nota_check
  CHECK (nota BETWEEN 1 AND 10);

-- ─── 4. Perguntas abertas obrigatórias (360 e probatório) ────────────────────
ALTER TABLE respostas_avaliacao_360
  ADD COLUMN IF NOT EXISTS ponto_forte    TEXT,
  ADD COLUMN IF NOT EXISTS ponto_melhoria TEXT;

-- ─── 5. Decisão final para probatório ────────────────────────────────────────
ALTER TABLE avaliacoes_360
  ADD COLUMN IF NOT EXISTS decisao_probatorio TEXT
  CHECK (decisao_probatorio IN ('efetivado', 'desligado', 'periodo_estendido') OR decisao_probatorio IS NULL);

-- ─── 6. Classificação automática no resultado final ──────────────────────────
ALTER TABLE resultado_final_360
  ADD COLUMN IF NOT EXISTS classificacao          TEXT
  CHECK (classificacao IN ('Top Performer', 'Alta Performance', 'Regular', 'Baixa Performance / Risco') OR classificacao IS NULL),
  ADD COLUMN IF NOT EXISTS media_comportamental   DECIMAL(4,2),
  ADD COLUMN IF NOT EXISTS media_performance      DECIMAL(4,2),
  ADD COLUMN IF NOT EXISTS media_desenvolvimento  DECIMAL(4,2),
  ADD COLUMN IF NOT EXISTS score_360              DECIMAL(4,2);

-- ─── 7. Índice para colaborador_alvo_id ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ciclos_colaborador_alvo ON ciclos_avaliacao(colaborador_alvo_id);
