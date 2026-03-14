-- Atualização da tabela de Clientes e Contratos

-- 1. Garantir que a tabela de contratos tenha os campos necessários (já parece ter, mas vamos reforçar/alterar se necessário)
-- A tabela 'contracts' já possui: start_date, end_date, value, status.
-- Vamos criar uma função para atualizar o status do contrato automaticamente baseada na data de fim.

CREATE OR REPLACE FUNCTION update_contract_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Se end_date for preenchido e for passado, status = 'cancelado' (ou encerrado/expirado)
  -- Se end_date for nulo ou futuro, status = 'ativo'
  -- Apenas se o status não for explicitamente 'cancelado' pelo usuário
  
  IF NEW.end_date IS NOT NULL AND NEW.end_date < CURRENT_DATE THEN
    -- Se já passou da data fim, marca como encerrado se ainda estiver ativo
    IF NEW.status = 'ativo' THEN
       NEW.status := 'encerrado'; 
    END IF;
  ELSIF NEW.end_date IS NULL OR NEW.end_date >= CURRENT_DATE THEN
     -- Se não tem data fim ou é futura, e estava como encerrado, volta para ativo
     -- Mas respeita se foi cancelado manualmente
     IF NEW.status = 'encerrado' THEN
        NEW.status := 'ativo';
     END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_contract_status ON contracts;
CREATE TRIGGER trg_update_contract_status
BEFORE INSERT OR UPDATE ON contracts
FOR EACH ROW
EXECUTE FUNCTION update_contract_status();

-- 2. View para Clientes com Status de Contrato Agregado
-- Facilita buscar clientes ativos vs cancelados
CREATE OR REPLACE VIEW clients_with_contracts AS
SELECT 
  c.*,
  co.id as contract_id,
  co.start_date as contract_start,
  co.end_date as contract_end,
  co.value as contract_value,
  co.status as contract_status,
  CASE 
    WHEN co.status = 'ativo' THEN 'ativo'
    WHEN co.status = 'cancelado' THEN 'cancelado'
    WHEN co.status = 'encerrado' THEN 'encerrado'
    ELSE 'sem_contrato'
  END as computed_status
FROM clients c
LEFT JOIN contracts co ON c.id = co.client_id AND co.status IN ('ativo', 'cancelado', 'encerrado')
-- Pega o contrato mais recente se houver múltiplos
ORDER BY co.created_at DESC;

-- 3. Atualizar Tabela de Tarefas (Tasks) para Projetos
-- Verifica se a tabela tasks existe e tem os campos necessários
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'backlog', -- backlog, todo, in_progress, done
  priority TEXT DEFAULT 'medium', -- low, medium, high, urgent
  assigned_to UUID REFERENCES profiles(id),
  start_date DATE,
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger para atualizar data fim do projeto baseado na última tarefa
CREATE OR REPLACE FUNCTION update_project_deadline()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE projects
  SET end_date = (
    SELECT MAX(due_date)
    FROM tasks
    WHERE project_id = NEW.project_id
  )
  WHERE id = NEW.project_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_project_deadline ON tasks;
CREATE TRIGGER trg_update_project_deadline
AFTER INSERT OR UPDATE OR DELETE ON tasks
FOR EACH ROW
EXECUTE FUNCTION update_project_deadline();

-- 4. Tabela de Pagamentos de Equipe (Payroll)
CREATE TABLE IF NOT EXISTS payrolls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  profile_id UUID NOT NULL REFERENCES profiles(id),
  reference_date DATE NOT NULL, -- Mês/Ano de referência (ex: 2024-03-01)
  payment_date DATE, -- Data do pagamento
  base_salary NUMERIC(10, 2) DEFAULT 0,
  commission NUMERIC(10, 2) DEFAULT 0,
  bonus NUMERIC(10, 2) DEFAULT 0,
  overtime NUMERIC(10, 2) DEFAULT 0,
  discounts NUMERIC(10, 2) DEFAULT 0,
  total_value NUMERIC(10, 2) GENERATED ALWAYS AS (base_salary + commission + bonus + overtime - discounts) STORED,
  status TEXT DEFAULT 'pending', -- pending, paid
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS para Payroll
ALTER TABLE payrolls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage payrolls" ON payrolls
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('owner', 'admin')))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('owner', 'admin')));

CREATE POLICY "Users can view own payroll" ON payrolls
  FOR SELECT USING (auth.uid() = profile_id);

