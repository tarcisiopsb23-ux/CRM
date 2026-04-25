/**
 * fiscal.ts
 * Tipos TypeScript para o módulo Fiscal NFS-e (integração Notaas)
 */

export type InvoiceStatus = 'pendente' | 'processando' | 'aguardando' | 'emitida' | 'rejeitada' | 'cancelada' | 'cancelamento_pendente' | 'cancelamento_erro';
export type InvoiceType = 'nfse' | 'nfe' | 'nfce';

export interface Invoice {
  id: string;
  organization_id: string;
  client_id: string;
  contract_id: string | null;
  payment_id: string | null;
  type: InvoiceType;
  status: InvoiceStatus;
  notaas_id: string | null;
  notaas_protocol: string | null;
  numero: string | null;
  serie: string | null;
  valor_servico: number;
  aliquota_iss: number | null;
  valor_iss: number | null;
  valor_liquido: number | null;
  codigo_servico: string | null;
  descricao_servico: string | null;
  competencia: string | null;           // YYYY-MM
  tomador_nome: string | null;
  tomador_cnpj_cpf: string | null;
  tomador_email: string | null;
  tomador_endereco: Record<string, unknown>;
  pdf_url: string | null;
  xml_url: string | null;
  emitida_em: string | null;
  cancelada_em: string | null;
  motivo_cancelamento: string | null;
  erro_mensagem: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  due_date: string | null; // Data de vencimento do pagamento vinculado (DATE)
}

/**
 * Mapeamento rico de produto/serviço para dados fiscais.
 * Usado em `codigos_servico_por_tipo_contrato`.
 */
export interface ServicoMapping {
  /** Código LC 116 (CNAE / código de serviço) */
  codigo: string;
  /** Descrição do serviço para a nota fiscal */
  descricao?: string;
  /** Alíquota ISS específica (%). Se ausente, usa a alíquota padrão */
  aliquota?: number;
}

export interface NotaasConfig {
  api_key?: string;
  cnpj_emissor?: string;
  codigo_servico_padrao?: string;
  aliquota_iss_padrao?: number;
  regime_tributario?: 'simples_nacional' | 'lucro_presumido' | 'lucro_real';
  descricao_servico_padrao?: string;
  /**
   * Mapeamento por produto/serviço.
   * Suporta dois formatos para retrocompatibilidade:
   *  - legado: Record<string, string>  (apenas código)
   *  - novo:   Record<string, ServicoMapping>  (código + descrição + alíquota)
   */
  codigos_servico_por_tipo_contrato?: Record<string, string | ServicoMapping>;
  sandbox_mode?: boolean;
  auto_emit_on_payment?: boolean;
  webhook_secret?: string;
  certificate_url?: string;       // URL do certificado A1 no Supabase Storage
  certificate_filename?: string;  // Nome original do arquivo para exibição
  certificate_password?: string;  // Senha do certificado A1
  n8n_webhook_url?: string;       // URL do webhook n8n para automação de NFS-e
  pdf_webhook_url?: string;       // URL do webhook n8n para geração e arquivamento de PDF
  check_webhook_url?: string;     // URL do webhook n8n para verificação automática de notas em processamento
  cancel_webhook_url?: string;    // URL do webhook n8n para cancelamento de NFS-e (fallback: n8n_webhook_url)
}

export interface EmitirNFSePayload {
  tomador: {
    cnpj_cpf: string;
    nome: string;
    email?: string;
    endereco?: Record<string, unknown>;
  };
  servico: {
    codigo: string;
    descricao: string;
  };
  valores: {
    total: number;
    aliquotaIss: number;
  };
  competencia: string; // YYYY-MM
}

export interface NotaasEmissaoResponse {
  id: string;
  protocol?: string;
  numero?: string;
  pdf_url?: string;
  xml_url?: string;
  emitida_em?: string;
}

export interface InvoiceEmitFormData {
  client_id: string;
  contract_id?: string;
  payment_id?: string;
  valor_servico: number;
  codigo_servico: string;
  descricao_servico: string;
  competencia: string; // YYYY-MM
  aliquota_iss: number;
}

export interface InvoiceFilters {
  status?: InvoiceStatus;
  competencia?: string;
  client_id?: string;
  contract_id?: string;
  payment_id?: string;
  due_date_from?: string; // DATE string YYYY-MM-DD — filtra due_date >= due_date_from
  due_date_to?: string;   // DATE string YYYY-MM-DD — filtra due_date <= due_date_to
}
