# Guia de Configuração dos Workflows n8n

Este documento descreve todos os workflows necessários para automatizar as integrações do Maestr.IA CRM com serviços externos via n8n.

## Pré-requisitos

- n8n versão 2.14 ou superior
- Credenciais Google OAuth2 configuradas no n8n (para Calendar e Drive)
- URL base do n8n acessível publicamente (ex: `https://n8n.suaagencia.com`)
- Configurações salvas em **Configurações > Integrações > n8n** no CRM

---

## Configuração Inicial no CRM

Em **Configurações > Integrações > n8n**, preencha:

| Campo | Valor |
|---|---|
| URL Base | `https://n8n.suaagencia.com` |
| API Key | Chave gerada no n8n (Settings > API) |
| Caminho do Webhook (Drive) | `/webhook/drive` |
| Webhook: Novos Leads | `https://n8n.suaagencia.com/webhook/leads` |
| Webhook: Novos Clientes | `https://n8n.suaagencia.com/webhook/clients` |
| Webhook: Financeiro | `https://n8n.suaagencia.com/webhook/payments` |
| Webhook: Notificações | `https://n8n.suaagencia.com/webhook/notifications` |
| Webhook: Google Calendar | `https://n8n.suaagencia.com/webhook/calendar` |
| Webhook: Métricas de Marketing | `https://n8n.suaagencia.com/webhook/marketing-data` |

---

## Workflow 1 — Google Drive (Documentos)

**Arquivo:** `n8n_workflow_drive.json`

### Função
Gerencia todas as operações de arquivos e pastas no Google Drive. O CRM envia uma requisição com o campo `action` indicando a operação desejada.

### Ações suportadas

| action | Descrição |
|---|---|
| `documents.list` | Lista arquivos de uma pasta |
| `documents.folders.list` | Lista subpastas de uma pasta |
| `documents.folders.create` | Cria uma nova subpasta |
| `documents.upload` | Faz upload de um arquivo |

### Nodes necessários

1. **Webhook** — Método: GET e POST, Path: `/webhook/drive`
2. **Switch** — Roteia pelo campo `action` (body ou query param)
3. **Google Drive: List Files** — Para `documents.list`
4. **Google Drive: List Files** (filtro mimeType folder) — Para `documents.folders.list`
5. **Google Drive: Create Folder** — Para `documents.folders.create`
6. **Google Drive: Upload File** — Para `documents.upload`
7. **Respond to Webhook** — Retorna JSON padronizado

### Configuração do Webhook no n8n
- Authentication: Header Auth (`x-api-key`)
- Response Mode: `Last Node`

### Formato de resposta esperado pelo CRM

**Listar arquivos:**
```json
{
  "files": [
    { "id": "abc123", "name": "Contrato.pdf", "url": "https://drive.google.com/...", "mimeType": "application/pdf", "modifiedTime": "2026-03-01" }
  ]
}
```

**Listar pastas:**
```json
{
  "folders": [
    { "id": "xyz789", "name": "Cliente XPTO", "mimeType": "application/vnd.google-apps.folder" }
  ]
}
```

**Criar pasta:**
```json
{ "id": "newFolderId", "name": "Nome da Pasta" }
```

---

## Workflow 2 — Google Calendar (Eventos)

**Arquivo:** `n8n_workflow_calendar.json`

### Função
Sincroniza eventos criados/editados/deletados no CRM com o Google Calendar da organização.

### Payload recebido do CRM

```json
{
  "action": "create" | "update" | "delete",
  "event": {
    "id": "uuid-do-evento-no-crm",
    "title": "Reunião com cliente",
    "description": "Pauta: revisão de resultados",
    "start_at": "2026-03-15T10:00:00.000Z",
    "end_at": "2026-03-15T11:00:00.000Z",
    "location": "Google Meet",
    "type": "reuniao"
  }
}
```

### Nodes necessários

1. **Webhook** — POST, Path: `/webhook/calendar`
2. **Switch** — Roteia por `action` (create / update / delete)
3. **Google Calendar: Create Event** — Para `create`
4. **Google Calendar: Update Event** — Para `update` (usa `event.id` como referência externa)
5. **Google Calendar: Delete Event** — Para `delete`
6. **Respond to Webhook** — Retorna `{ "success": true }`

### Mapeamento de campos

| Campo CRM | Campo Google Calendar |
|---|---|
| `title` | `summary` |
| `description` | `description` |
| `start_at` | `start.dateTime` |
| `end_at` | `end.dateTime` |
| `location` | `location` |

### Dica: armazenar o Google Event ID
Para updates e deletes, você precisa do ID do evento no Google Calendar. Recomenda-se salvar o `googleEventId` no campo `metadata` do evento no CRM via uma chamada de volta à API do Supabase após a criação.

---

## Workflow 3 — Novos Leads

**Arquivo:** `n8n_workflow_leads.json`

### Função
Recebe notificação quando um novo lead é criado no CRM e executa automações (ex: enviar e-mail de boas-vindas, notificar equipe no WhatsApp, criar tarefa).

### Payload recebido

```json
{
  "id": "uuid",
  "name": "João Silva",
  "company": "Empresa XPTO",
  "email": "joao@empresa.com",
  "phone": "11999999999",
  "stage": "novo",
  "organization_id": "org-uuid"
}
```

### Nodes sugeridos

1. **Webhook** — POST, Path: `/webhook/leads`
2. **Send Email (Resend/SMTP)** — Notificação interna para a equipe
3. **WhatsApp (Evolution API / Twilio)** — Mensagem para o responsável
4. **Respond to Webhook** — `{ "received": true }`

---

## Workflow 4 — Novos Clientes

**Arquivo:** `n8n_workflow_clients.json`

### Função
Recebe notificação quando um lead é convertido em cliente. Pode criar pasta no Drive, enviar e-mail de boas-vindas, etc.

### Payload recebido

```json
{
  "id": "uuid",
  "name": "João Silva",
  "company": "Empresa XPTO",
  "email": "joao@empresa.com",
  "organization_id": "org-uuid"
}
```

### Nodes sugeridos

1. **Webhook** — POST, Path: `/webhook/clients`
2. **Google Drive: Create Folder** — Cria pasta do cliente automaticamente
3. **Send Email** — E-mail de boas-vindas ao cliente
4. **Respond to Webhook**

---

## Workflow 5 — Financeiro (Pagamentos)

**Arquivo:** `n8n_workflow_payments.json`

### Função
Recebe eventos de pagamento (criado, recebido, vencido) para automações financeiras.

### Payload recebido

```json
{
  "event": "payment.received" | "payment.overdue" | "payment.created",
  "payment": {
    "id": "uuid",
    "client_id": "uuid",
    "value": 1500.00,
    "due_date": "2026-03-10",
    "paid_at": "2026-03-08",
    "status": "pago",
    "description": "Assessoria - Março/2026"
  }
}
```

### Nodes sugeridos

1. **Webhook** — POST, Path: `/webhook/payments`
2. **Switch** — Por `event`
3. **Send Email** — Confirmação de recebimento / alerta de vencimento
4. **Respond to Webhook**

---

## Workflow 6 — Notificações de Sistema

**Arquivo:** `n8n_workflow_notifications.json`

### Função
Centraliza envio de e-mails transacionais do sistema (convites, redefinição de senha, alertas).

### Payload recebido

```json
{
  "type": "invite" | "password_reset" | "alert",
  "to": "usuario@email.com",
  "subject": "Assunto do e-mail",
  "body": "Conteúdo HTML ou texto"
}
```

### Nodes sugeridos

1. **Webhook** — POST, Path: `/webhook/notifications`
2. **Switch** — Por `type`
3. **Send Email (Resend)** — Usando template por tipo
4. **Respond to Webhook**

---

## Workflow 7 — Ingestão de Métricas de Marketing

**Arquivo:** `n8n_workflow_marketing.json`

### Função
Busca dados de campanhas no Meta Ads e Google Ads e envia para o CRM via API do Supabase.

### Fluxo

1. **Schedule Trigger** — Executa diariamente (ex: 06:00)
2. **HTTP Request: Meta Ads API** — Busca métricas do período
3. **HTTP Request: Google Ads API** — Busca métricas do período
4. **Code Node** — Normaliza e combina os dados
5. **HTTP Request: Supabase API** — POST para `campaign_data` table
6. **Send Email** — Relatório diário (opcional)

### Estrutura de dados para o Supabase

```json
{
  "organization_id": "org-uuid",
  "campaign_name": "Nome da Campanha",
  "platform": "meta" | "google",
  "date": "2026-03-15",
  "spend": 250.00,
  "impressions": 15000,
  "clicks": 450,
  "leads": 12,
  "sales": 3,
  "revenue": 4500.00
}
```

---

## Autenticação

Todos os webhooks que recebem dados do CRM devem validar o header `x-api-key` com a API Key configurada no n8n. Configure em cada Webhook node:

```
Authentication: Header Auth
Header Name: x-api-key
Header Value: {{ $credentials.apiKey }}
```

---

## Credenciais Google OAuth2 no n8n

1. Acesse **Settings > Credentials > New Credential**
2. Selecione **Google OAuth2 API**
3. Preencha Client ID e Client Secret (do Google Cloud Console)
4. Autorize o acesso aos escopos:
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/drive`
5. Use esta credencial nos nodes Google Calendar e Google Drive

---

## Importar os Workflows

1. No n8n, acesse **Workflows > Import from File**
2. Selecione o arquivo JSON correspondente
3. Configure as credenciais em cada node
4. Ative o workflow (toggle no canto superior direito)
