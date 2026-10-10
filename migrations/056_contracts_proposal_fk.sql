ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS proposal_id       UUID REFERENCES proposals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contract_version  INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS contract_content  TEXT,
  ADD COLUMN IF NOT EXISTS pdf_url           TEXT;

CREATE INDEX IF NOT EXISTS idx_contracts_proposal
  ON contracts(proposal_id) WHERE proposal_id IS NOT NULL;
