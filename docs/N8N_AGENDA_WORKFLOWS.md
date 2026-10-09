# Workflows n8n — Agenda (Agência + C8 Control)

## Arquitetura Geral

```
C8 Control (cliente)
    │
    ▼  POST /webhook/agenda-upsert
n8n: Maestr.IA — Google Calendar      ←── Workflow 1 (saída)
    │
    ├── Google Calendar API (criar/atualizar/excluir evento)
    └── Salva gcal_event_id no Supabase CRM

Google Calendar (push notification)
    │
    ▼  POST /webhook/gcal-push  ou  /webhook/gcal-sync-manual
n8n: Google Calendar → Maestr.ia      ←── Workflow 2 (entrada)
    │
    ├── Busca eventos atualizados na Google Calendar API
    ├── Cria/Atualiza/Deleta no Supabase CRM (via API REST)
    └── Cria/Atualiza task no ClickUp (opcional)

C8 Control (participantes de evento)
    │
    ▼  POST /webhook/gcal-participantes
n8n: Maestr.IA — GCal Participantes   ←── Workflow 3 (participantes)
    │
    └── PATCH Google Calendar API (adiciona/substitui attendees)

C8 Control (agenda + ClickUp)
    │
    ▼  POST /webhook/agenda-sync
n8n: Agenda Sync — ClickUp + GCal     ←── Workflow 4 (sync completo)
    │
    ├── ClickUp API (criar/atualizar/excluir task)
    └── Google Calendar API (criar/atualizar/excluir evento)

n8n (qualquer workflow acima)
    │
    ▼  PATCH Supabase REST API
Edge Function: agenda-n8n-receiver    ←── Receiver URL
```

---

## Os 4 Workflows de Agenda

### Workflow 1 — `Maestr.IA - Google Calendar.json`
**Propósito:** Agenda do CRM/C8 Control → Google Calendar  
**Webhook de entrada:** `POST /webhook/agenda-sync`

| Campo tela | Valor |
|---|---|
| **Webhook de Saída — C8 → n8n → Google Calendar** | `https://SEU-N8N/webhook/agenda-sync` |

**O que faz:**
- Recebe evento do C8 Control (create/update/delete)
- Cria, atualiza ou exclui evento no Google Calendar
- Suporta exclusão parcial de série recorrente (truncar a partir de uma data) ou total
- Salva `gcal_event_id` de volta no Supabase CRM

**Variáveis de ambiente necessárias no n8n:**
```
SUPABASE_URL         = https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_KEY = eyJ...
GCAL_CALENDAR_ID     = agenciac8br@gmail.com  (ou o calendar ID do cliente)
```

---

### Workflow 2 — `n8n_workflow_gcal_to_maestria.json`
**Propósito:** Google Calendar → CRM/C8 Control (sincronização bidirecional)  
**Webhooks de entrada:**
- `POST /webhook/gcal-push` — recebe push notifications do Google Calendar
- `POST /webhook/gcal-sync-manual` — disparo manual ao abrir a agenda

| Campo tela | Valor |
|---|---|
| **Webhook n8n — Entrada do Google Calendar** | `https://SEU-N8N/webhook/gcal-push` |
| **Receiver URL — n8n → C8 Control** | `https://SEU-PROJETO.supabase.co/functions/v1/agenda-n8n-receiver` |

**O que faz:**
- Recebe notificação push do Google Calendar (watch channel)
- Busca eventos atualizados via Google Calendar API
- Cria, atualiza ou deleta o evento correspondente no Supabase CRM
- Opcionalmente cria/atualiza task no ClickUp

**Variáveis de ambiente necessárias:**
```
SUPABASE_URL           = https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_KEY   = eyJ...
GCAL_CALENDAR_ID       = agenciac8br@gmail.com
CLICKUP_AGENDA_LIST_ID = ID da lista ClickUp de agenda (opcional)
CLICKUP_API_KEY        = pk_xxx (opcional)
DEFAULT_ORG_ID         = UUID da organização
```

> **Como configurar o watch channel (push notification):**
> 1. No Google Calendar API Console, ative o "Push Notifications"
> 2. Configure o canal apontando para `https://SEU-N8N/webhook/gcal-push`
> 3. Cole a mesma URL no campo **Webhook n8n — Entrada do Google Calendar** nas Configurações do CRM

---

### Workflow 3 — `Maestr.IA — Google Calendar Participantes.json`
**Propósito:** Adicionar ou substituir participantes (attendees) em eventos do Google Calendar  
**Webhook de entrada:** `POST /webhook/gcal-participantes`

| Campo tela | Valor |
|---|---|
| *(chamado internamente pelo sistema)* | `https://SEU-N8N/webhook/gcal-participantes` |

**O que faz:**
- Recebe lista de participantes (e-mails) e o `gcal_event_id`
- Modo **ADD**: adiciona à lista existente de attendees
- Modo **REPLACE**: substitui toda a lista de attendees

---

### Workflow 4 — `n8n_workflow_agenda_sync.json`
**Propósito:** Sync completo — Maestr.ia ↔ ClickUp ↔ Google Calendar  
**Webhook de entrada:** `POST /webhook/agenda-manager`

| Campo tela | Valor |
|---|---|
| **Webhook: Agenda Manager** | `https://SEU-N8N/webhook/agenda-manager` |

**O que faz:**
- Versão mais completa que sincroniza simultaneamente com Google Calendar **e** ClickUp
- Detecta se o evento é de terceirizado (ClickUp) ou interno (só GCal)
- Salva `gcal_event_id` e `clickup_task_id` de volta no Supabase

**Variáveis de ambiente necessárias:**
```
SUPABASE_URL         = https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_KEY = eyJ...
GCAL_CALENDAR_ID     = agenciac8br@gmail.com
CLICKUP_API_KEY      = pk_xxx
```

---

## Configuração Passo a Passo

### 1. Importar os workflows no n8n
1. No n8n → **Workflows → Import from File**
2. Importar nesta ordem:
   - `Maestr.IA - Google Calendar.json` → ativa como **agenda-sync**
   - `n8n_workflow_gcal_to_maestria.json` → ativa como **gcal-push** e **gcal-sync-manual**
   - `Maestr.IA — Google Calendar Participantes.json` → ativa como **gcal-participantes**
   - `n8n_workflow_agenda_sync.json` → ativa como **agenda-manager** (se usar ClickUp)

### 2. Configurar credenciais no n8n
- **Google OAuth2**: escopos `calendar` e `drive`
- **Variáveis de ambiente**: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GCAL_CALENDAR_ID`

### 3. Preencher os campos na tela
**Configurações → C8 Control → Webhooks C8 Control — Agenda**

| Campo | URL |
|---|---|
| Webhook de Saída — C8 → n8n → Google Calendar | `https://SEU-N8N/webhook/agenda-sync` |
| Webhook: Agenda Manager | `https://SEU-N8N/webhook/agenda-manager` |
| Token de Autenticação (X-Webhook-Token) | Token livre — configure o mesmo no n8n |
| Webhook n8n — Entrada do Google Calendar | `https://SEU-N8N/webhook/gcal-push` |
| Receiver URL — n8n → C8 Control | `https://SEU-PROJETO.supabase.co/functions/v1/agenda-n8n-receiver` |

### 4. Autenticação entre C8 Control e n8n
O campo **Token de Autenticação** é enviado como header `X-Webhook-Token` em todas as chamadas.  
No n8n, configure cada Webhook node com:
```
Authentication: Header Auth
Header Name:  X-Webhook-Token
Header Value: {{ mesmo token configurado no CRM }}
```

### 5. Hierarquia de configuração por cliente
A configuração global (passo 3) vale para todos os clientes do C8 Control.  
Para sobrescrever em um cliente específico:  
→ Dashboard do cliente → **Configurações → Integrações → Agenda**

---

## Diferença entre Agência e C8 Control

| | Agência (CRM) | C8 Control (cliente) |
|---|---|---|
| **Quem agenda** | Colaboradores da agência | Clientes finais (online booking) |
| **Configurado em** | Configurações → n8n → Google Calendar | Configurações → C8 Control → Webhooks Agenda |
| **Google Calendar** | Calendar da agência | Calendar do cliente (por cliente) |
| **Receiver URL** | `agenda-n8n-receiver` (Supabase CRM) | Mesma Edge Function |
| **ClickUp** | Opcional (`agenda-sync`) | Não usado diretamente |

---

## Arquivos de Referência

| Arquivo | Localização |
|---|---|
| Workflow 1 — Google Calendar (saída) | `docs/n8n_workflows/Maestr.IA - Google Calendar.json` |
| Workflow 2 — Google Calendar (entrada) | `docs/n8n_workflows/n8n_workflow_gcal_to_maestria.json` |
| Workflow 3 — Participantes | `docs/n8n_workflows/Maestr.IA — Google Calendar Participantes.json` |
| Workflow 4 — Agenda Manager (ClickUp) | `docs/n8n_workflows/n8n_workflow_agenda_sync.json` |
| Edge Function receiver | `supabase/functions/agenda-n8n-receiver/` |
