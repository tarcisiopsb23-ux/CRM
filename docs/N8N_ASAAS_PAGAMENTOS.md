# Integração n8n + Asaas para geração de Boleto / Cartão / PIX

## Objetivo

Planejar a função de geração de cobranças via Asaas a partir do CRM, usando n8n como orquestrador. Cada registro de pagamento de cliente deve ter botões de ação para gerar boleto, cartão ou PIX, e o pagamento deve ser reconhecido automaticamente quando o Asaas atualizar o status via n8n.

## Escopo

- Gerar cobranças em Asaas para pagamentos de clientes
- Suportar três meios de pagamento: `boleto`, `cartao`, `pix`
- Expor ação no front-end: botão por registro de pagamento
- Sincronizar status de pagamento de volta ao CRM via n8n, usando dados recebidos de Asaas
- Atualizar campos locais de pagamento e histórico de recebimento

## Componentes envolvidos

### CRM

- Tabela de `payments` ou equivalente no módulo financeiro
- UI de histórico de pagamentos do cliente
- Botões de ação no detalhe do pagamento ou na lista de parcelas
- API/endpoint para disparar a geração de cobrança

### n8n

- Workflow para criar cobrança no Asaas
- Workflow para receber atualização de status do Asaas
- Conexão segura com Supabase Service Role
- Mapeamento de cliente/registro de pagamento

### Asaas

- API de cobrança/charge
- Webhook de notificação de pagamento
- Retorno de informações como:
  - `status`
  - `value`
  - `paid_date`
  - `payment_method`
  - `pix_copy_padrao` / `pix_qr_code`
  - `bank_slip_url` / `bank_slip_barcode`
  - `credit_card_url`
  - `customer` / `external_reference`

## Modelo de dados sugerido

### payments

Campos necessários para integração:

- `id`
- `client_id`
- `contract_id`? (se aplicável)
- `description`
- `value`
- `due_date`
- `payment_method` (`boleto` | `pix` | `cartao` | `transferencia` | ...)
- `status` (`pending` | `issued` | `paid` | `cancelled` | `failed`)
- `external_id` / `asaas_id`
- `external_status`
- `asaas_charge_url`
- `asaas_boleto_url`
- `asaas_boleto_barcode`
- `asaas_pix_code`
- `asaas_pix_qr`
- `paid_at`
- `updated_at`
- `created_at`

### client_kpi_history / payment_history

- manter relacionamento com KPI e receita caso seja necessário refletir pagamento recebido

## Fluxo funcional

### 1. Geração de cobrança

1. Usuário visualiza lista de registros de pagamento do cliente
2. Para cada registro pendente, aparecem botões:
   - `Gerar Boleto`
   - `Gerar PIX`
   - `Gerar Cartão`
3. Ao clicar, o front chama uma rota interna do CRM ou endpoint n8n que executa a criação da cobrança
4. n8n recebe a requisição com:
   - `payment_id`
   - `client_id`
   - `amount`
   - `due_date`
   - `payment_method`
   - `description`
   - `customer_data` (nome, e-mail, CPF/CNPJ, telefone, endereço)
5. n8n chama a API Asaas para criar o objeto de cobrança
6. n8n grava o retorno em Supabase com as informações do Asaas:
   - `external_id`
   - `external_status`
   - URLs de pagamento
   - código PIX ou barcode
7. Front mostra os links / QR / códigos ao cliente ou operador do CRM

### 2. Reconhecimento do pagamento

1. Asaas envia webhook ao n8n quando o status da cobrança muda
2. n8n valida a origem do webhook e extrai:
   - `asaas_id`
   - `status`
   - `paid_date`
   - `payment_method`
   - `value`
   - `customer` / `external_reference`
3. n8n localiza o pagamento no Supabase por `asaas_id` ou `external_reference`
4. n8n atualiza o registro local com:
   - `status` = `paid`, `cancelled`, `failed`, etc.
   - `paid_at`
   - `external_status`
   - `payment_method`
   - `value`
   - `updated_at`
5. Se necessário, n8n dispara evento ou chamada adicional para atualizar histórico financeiro no CRM

## Detalhamento dos botões na UI

### Botão principal por registro

- `Gerar Boleto`  → solicita `payment_method=boleto`
- `Gerar PIX`     → solicita `payment_method=pix`
- `Gerar Cartão`  → solicita `payment_method=cartao`

### Regras de exibição

- Se `status` for `pending` e não tiver `external_id`, mostrar os 3 botões disponíveis
- Se já houver `external_id` e `status` for `issued`, mostrar:
  - `Abrir boleto`
  - `Copiar código PIX`
  - `Abrir link de cartão`
- Se `status` for `paid`, mostrar `Pago em <data>` e desabilitar geração
- Se o registro estiver cancelado, mostrar `Cancelado`

### Dados exibidos no card/linha

- Nome do cliente
- Valor
- Vencimento
- Meio de pagamento preferido
- Status atual
- Link / código do Asaas

## Requisitos de segurança

- n8n deve usar credenciais seguras em `Credentials`
- Supabase Service Role Key só em n8n, nunca no front-end
- Webhooks devem ser validados com HMAC ou segredo compartilhado
- Vínculo entre `asaas_id` e `payment_id` deve ser idempotente

## Orquestração n8n sugerida

### Workflow de criação de cobrança

1. `Webhook` ou `HTTP Request` de entrada do CRM
2. `Function` para montar payload Asaas
3. `HTTP Request` para Asaas `POST /payments` ou equivalente
4. `Set`/`Function` para extrair resposta
5. `Supabase` / `HTTP Request` para atualizar o `payments`
6. `Response` para o CRM com os links de pagamento

### Workflow de recebimento de webhook Asaas

1. `Webhook` de Asaas (evento de cobrança atualizada)
2. `Function` para validar assinatura / origem
3. `HTTP Request` para buscar pagamento local por `asaas_id`
4. `Supabase` / `HTTP Request` para atualizar `payment.status`, `paid_at`, `value`
5. `Function` opcional para sinalizar ao CRM ou enviar notificação

## Validações importantes

- Verificar se o pagamento já existe antes de criar nova cobrança
- Garantir que `amount` e `due_date` sejam válidos
- Tratar `400`/`422` do Asaas e retornar mensagem clara
- Ignorar webhooks duplicados usando `asaas_id` + `event_id`
- Atualizar apenas se o status realmente mudou ou se a data de pagamento for mais recente

## Possíveis melhorias futuras

- Suporte para reemissão de boleto vencido
- Notificação de lembrete automático via WhatsApp ou e-mail
- Tela de histórico de cobranças Asaas por cliente
- Painel de conciliação entre `payments` do CRM e `transactions` do Asaas
