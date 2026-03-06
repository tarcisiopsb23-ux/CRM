# Maestr.IA ↔ n8n Integration Design

Design for integrating Maestr.IA CRM with n8n workflows, with focus on WhatsApp Cloud API, lead ingestion, human handoff, and security.

---

## 1. Architecture Overview

```
┌─────────────────┐     Webhooks      ┌─────────────┐     Supabase     ┌─────────────┐
│ WhatsApp Cloud  │ ───────────────►  │    n8n      │ ◄──────────────► │  Maestr.IA  │
│     API         │   (messages,      │  Workflows  │   (REST/GraphQL) │   (CRM)     │
└─────────────────┘   statuses)       └─────────────┘                  └─────────────┘
        │                    ▲                │                                │
        │                    │                │                                │
        ▼                    │                ▼                                │
┌─────────────────┐          │         ┌─────────────┐                         │
│  Meta/Facebook  │          └─────────│   Maestr.IA │   Human handoff /        │
│  Verify Token   │                    │  Webhooks   │   close → return to AI   │
└─────────────────┘                    └─────────────┘                         │
```

**Data flow:**
1. WhatsApp Cloud API sends webhooks to n8n (or directly to Maestr.IA proxy)
2. n8n orchestrates: validates, normalizes, calls Maestr.IA APIs / Supabase
3. Maestr.IA triggers webhooks back to n8n for human handoff, close, etc.
4. n8n calls WhatsApp API to send messages / change status

---

## 2. Use Cases

### 2.1 WhatsApp Cloud API

- **Inbound:** messages → n8n webhook → create/update contact, conversation, message in Maestr.IA
- **Outbound:** Maestr.IA sends via n8n or direct API; status updates via webhook
- **Verify:** GET webhook for Meta verification (`hub.mode`, `hub.verify_token`, `hub.challenge`)

### 2.2 Lead Ingestion

- New contact + first message → create `whatsapp_contacts`, `whatsapp_conversations`, `leads`
- Map phone → contact; extract lead data (e.g. via AI) → `leads`
- Source/origin = `whatsapp`

### 2.3 Human Handoff

- AI (in n8n) decides to hand off → call Maestr.IA webhook or Supabase
- Maestr.IA: `whatsapp_conversations.status` = `em_atendimento`, `assigned_to` = agent
- n8n stops AI flow, routes to human agent in CRM

### 2.4 Conversation Close → Return to AI

- Agent closes conversation in Maestr.IA → webhook to n8n
- n8n: `whatsapp_conversations.status` = `encerrada` → resume AI flow for new messages
- Or: set flag `metadata.ai_enabled = true` for future messages

### 2.5 Webhook Security

- Validate Meta webhooks: HMAC-SHA256 (`X-Hub-Signature-256`)
- Validate Maestr.IA→n8n: API key or HMAC
- Idempotency and replay protection

---

## 3. Webhook Structure

### 3.1 Meta → n8n (WhatsApp Cloud API)

**Endpoint:** `POST https://<n8n-host>/webhook/whatsapp-cloud`

**Headers:**
```
Content-Type: application/json
X-Hub-Signature-256: sha256=<hex_digest>
```

**Payload (messages field):**
```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "WABA_ID",
      "changes": [
        {
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "15551234567",
              "phone_number_id": "PHONE_NUMBER_ID"
            },
            "contacts": [
              {
                "profile": { "name": "Contact Name" },
                "wa_id": "5511999999999"
              }
            ],
            "messages": [
              {
                "id": "wamid.XXX",
                "from": "5511999999999",
                "timestamp": "1234567890",
                "type": "text",
                "text": { "body": "Hello" }
              }
            ],
            "statuses": [],
            "errors": []
          },
          "field": "messages"
        }
      ]
    }
  ]
}
```

**Message types:** `text`, `image`, `audio`, `video`, `document`, `location`, `interactive`, `button`

**Statuses payload (field: messages, statuses array):**
```json
{
  "id": "wamid.XXX",
  "status": "delivered",
  "timestamp": "1234567890",
  "recipient_id": "5511999999999"
}
```

---

### 3.2 Maestr.IA → n8n (Outbound Events)

**Endpoint:** `POST https://<n8n-host>/webhook/maestr-events`

**Headers:**
```
Content-Type: application/json
X-Maestr-Signature: <hmac_hex>
X-Maestr-Event: <event_type>
X-Maestr-Delivery: <idempotency_id>
```

**Event types:**

| Event | Trigger | Payload |
|-------|---------|---------|
| `conversation.assigned` | Human takes over | `conversation_id`, `assigned_to`, `organization_id` |
| `conversation.closed` | Agent closes chat | `conversation_id`, `closed_by`, `organization_id` |
| `conversation.reopened` | Reopened for AI | `conversation_id`, `organization_id` |
| `lead.created` | New lead from WhatsApp | `lead_id`, `contact_id`, `organization_id` |
| `message.sent` | CRM sends message | `message_id`, `conversation_id`, `external_id` |

**Payload (conversation.closed):**
```json
{
  "event": "conversation.closed",
  "timestamp": "2024-03-05T15:00:00Z",
  "organization_id": "uuid",
  "data": {
    "conversation_id": "uuid",
    "contact_id": "uuid",
    "closed_by": "uuid",
    "phone": "5511999999999",
    "metadata": {
      "return_to_ai": true
    }
  }
}
```

**Payload (lead.created):**
```json
{
  "event": "lead.created",
  "timestamp": "2024-03-05T15:00:00Z",
  "organization_id": "uuid",
  "data": {
    "lead_id": "uuid",
    "contact_id": "uuid",
    "phone": "5511999999999",
    "name": "Contact Name",
    "source": "whatsapp",
    "initial_message": "First message text"
  }
}
```

---

## 4. Security

### 4.1 Meta Webhooks (WhatsApp Cloud API)

**HMAC-SHA256 (X-Hub-Signature-256):**

```
X-Hub-Signature-256: sha256=<hex(hmac_sha256(raw_body, app_secret))>
```

**Verification (n8n Function node or Maestr.IA):**
```javascript
// Raw body must be used exactly as received
const crypto = require('crypto');
const rawBody = $json.rawBody;  // Enable "Raw Body" in Webhook node
const signature = $json.headers['x-hub-signature-256'];  // "sha256=abc123..."
const secret = $credentials.appSecret;  // Meta App Secret

const expected = 'sha256=' + crypto
  .createHmac('sha256', secret)
  .update(rawBody, 'utf8')
  .digest('hex');

if (expected !== signature) {
  throw new Error('Invalid signature');
}
```

**Verify token (GET):**
- Meta sends: `hub.mode=subscribe`, `hub.verify_token=<your_token>`, `hub.challenge=<challenge>`
- Respond with `hub.challenge` if `hub.verify_token` matches configured token

---

### 4.2 Maestr.IA → n8n

**Option A – HMAC:**
```
X-Maestr-Signature: sha256=<hex(hmac_sha256(JSON.stringify(body), webhook_secret))>
X-Maestr-Event: conversation.closed
X-Maestr-Delivery: <uuid>  // idempotency
```

**Option B – API key:**
```
Authorization: Bearer <n8n_webhook_secret>
X-Maestr-Event: conversation.closed
```

**Option C – Header secret:**
```
X-Webhook-Secret: <shared_secret>
```

**Recommended:** HMAC + idempotency key; store secret in n8n Credentials.

---

### 4.3 n8n → Maestr.IA (Supabase)

- Use **Service Role Key** only in n8n (backend)
- Never expose Service Role in frontend
- Scope by `organization_id`; consider RLS bypass via service role for automation

---

### 4.4 Secrets Storage

| Secret | Where | Purpose |
|--------|-------|---------|
| Meta App Secret | n8n Credentials | Validate WhatsApp webhooks |
| Meta Verify Token | n8n / env | Webhook verification |
| Maestr.IA Webhook Secret | Maestr.IA + n8n | Validate Maestr.IA→n8n |
| Supabase Service Role | n8n Credentials | DB writes from n8n |

---

## 5. Retry Strategy

### 5.1 Meta → n8n (WhatsApp Cloud API)

- Meta retries: exponential backoff, up to ~7 days
- n8n must respond **200 OK** quickly; processing can be async
- If processing fails: still return 200, then retry internally or via queue

**Pattern:**
```
1. Receive webhook
2. Return 200 OK immediately (or within ~5–10s)
3. Enqueue for processing (n8n queue, Redis, etc.)
4. Process async; on failure → retry with backoff
```

### 5.2 Maestr.IA → n8n

| Attempt | Delay | Notes |
|---------|-------|-------|
| 1 | 0s | Immediate |
| 2 | 5s | First retry |
| 3 | 30s | Second retry |
| 4 | 2m | Third retry |
| 5 | 10m | Final retry |

- Use `X-Maestr-Delivery` for idempotency
- n8n stores delivery ID; deduplicate on receipt

### 5.3 n8n → Supabase / WhatsApp API

- n8n built-in retries (e.g. 3 attempts)
- Exponential backoff: 1s, 2s, 4s
- On 429: respect `Retry-After`

---

## 6. Error Handling

### 6.1 Webhook Receivers (n8n)

| Scenario | Response | Action |
|----------|----------|--------|
| Invalid signature | 401 | Log, reject |
| Invalid payload | 400 | Log, reject |
| Processing error | 200 + async retry | Return 200, retry in background |
| Duplicate (idempotency) | 200 | Ignore, return success |

### 6.2 Processing Errors

**Classification:**
- **Transient:** network, 5xx, rate limits → retry
- **Client:** 4xx, bad payload → no retry, alert
- **Business:** lead/contact already exists → upsert, return success

**Logging:**
- Log: event type, org, IDs, error
- Optional: send to alert channel (Slack, email)

### 6.3 WhatsApp API Errors

| Code | Action |
|------|--------|
| 131047 | Rate limit → backoff, retry |
| 131026 | Message expired → skip, log |
| 100 | Invalid param → fix payload, no retry |
| 190 | Token expired → refresh token |

### 6.4 Dead Letter Queue

- After max retries, store in DLQ (table or queue)
- Fields: payload, error, attempts, timestamp
- Process manually or via separate workflow

---

## 7. n8n Workflow Sketches

### 7.1 WhatsApp Inbound (messages)

```
[Webhook] → [Validate HMAC] → [Parse entry/changes]
    → [Loop messages] → [Upsert contact] → [Upsert conversation]
    → [Insert message] → [Check: new contact?] → [Create lead if new]
```

### 7.2 Human Handoff (Maestr.IA → n8n)

```
[Webhook] → [Validate signature] → [Check idempotency]
    → [Pause/resume AI flow for phone] or [Update CRM status]
```

### 7.3 Conversation Closed → Return to AI

```
[Webhook conversation.closed] → [Validate] → [Set metadata.return_to_ai = true]
    → [Update n8n/AI state: phone X is back to AI]
```

---

## 8. Database Alignment (Maestr.IA)

Events should map cleanly to existing tables:

| Maestr.IA Table | n8n / webhook use |
|-----------------|-------------------|
| `whatsapp_contacts` | Upsert by `(organization_id, phone)` |
| `whatsapp_conversations` | Create/get by contact; `status`, `assigned_to` |
| `whatsapp_messages` | Insert with `direction`, `content`, `metadata` |
| `leads` | Create on first contact; `source = 'whatsapp'` |

**Enums:** `conversation_status`: `aberta`, `em_atendimento`, `encerrada`, `aguardando`

---

## 9. Checklist

- [ ] Meta App: webhook URL, verify token, subscribe to `messages`
- [ ] n8n: Webhook nodes with Raw Body for HMAC
- [ ] Maestr.IA: webhook dispatch on conversation/lead events
- [ ] Secrets in n8n Credentials and Maestr.IA env
- [ ] Retry and DLQ for failed webhooks
- [ ] Idempotency for Maestr.IA→n8n deliveries
