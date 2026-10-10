# Integração WhatsApp via n8n

## Visão geral

Quando uma nova conversa chega pelo WhatsApp (via n8n), o fluxo automático:

1. **Verificar se o telefone já existe** em `whatsapp_contacts`
2. **Se não existir** → criar lead + contato
   - `etapa_kanban` = `leads_recebidos`
   - `source` = `WhatsApp`
3. **Obter ou criar conversa** em `whatsapp_conversations`
4. **Salvar mensagem** em `whatsapp_messages` (com deduplicação por `external_id`)

## Tabelas

| Tabela | Descrição |
|--------|-----------|
| `whatsapp_contacts` | Contatos (telefone + nome). Campo `lead_id` vincula ao lead. |
| `whatsapp_conversations` | Conversas. Uma por contato (ou múltiplas por política de negócio). |
| `whatsapp_messages` | Mensagens. `external_id` evita duplicatas. |
| `leads` | Leads do Kanban. Criados automaticamente para novos contatos. |

## Função RPC: `process_incoming_whatsapp_message`

Chamada pelo n8n via Supabase REST API.

### Parâmetros

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `p_organization_id` | UUID | Sim | ID da organização |
| `p_phone` | VARCHAR(50) | Sim | Telefone (com ou sem formatação) |
| `p_contact_name` | VARCHAR(255) | Não | Nome do perfil WhatsApp |
| `p_message_content` | TEXT | Não | Conteúdo da mensagem |
| `p_message_external_id` | VARCHAR(255) | Não | ID externo para deduplicação |
| `p_direction` | VARCHAR(10) | Não | `inbound` (padrão) ou `outbound` |

### Resposta (JSONB)

```json
{
  "ok": true,
  "contact_id": "uuid",
  "lead_id": "uuid",
  "conversation_id": "uuid",
  "message_id": "uuid",
  "is_new_contact": true,
  "is_new_conversation": true
}
```

### Exemplo de chamada (n8n)

**HTTP Request node:**

- Method: `POST`
- URL: `https://<project>.supabase.co/rest/v1/rpc/process_incoming_whatsapp_message`
- Headers: `apikey`, `Authorization: Bearer <service_role_key>`
- Body (JSON):

```json
{
  "p_organization_id": "uuid-da-organizacao",
  "p_phone": "5511999999999",
  "p_contact_name": "João Silva",
  "p_message_content": "Olá, gostaria de mais informações",
  "p_message_external_id": "wamid.xxx",
  "p_direction": "inbound"
}
```

## Fluxo n8n sugerido

1. **Webhook** recebe evento do WhatsApp Cloud API
2. **Extração** de `phone`, `name`, `body`, `message_id` do payload
3. **HTTP Request** chama `process_incoming_whatsapp_message`
4. Opcional: usar `is_new_contact` / `is_new_conversation` para lógicas extras (ex.: mensagem de boas-vindas)

## Segurança

- A função usa `SECURITY DEFINER` e deve ser chamada com a **service_role key** do Supabase (não a anon key).
- Garantir que o n8n tenha acesso apenas à service_role em ambiente seguro.
