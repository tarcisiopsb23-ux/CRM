# Integração de E-mail: CRM ↔ n8n ↔ Resend

Este documento detalha o funcionamento do workflow necessário no **n8n** para processar os envios de e-mail (notificações de sistema, senhas temporárias e recuperação de acesso) disparados pelo CRM.

## 1. Fluxo de Dados

1.  **CRM**: Dispara um `POST` para a URL de Webhook configurada em *Configurações > Integrações > n8n*.
2.  **n8n**: Recebe o payload, autentica a organização e utiliza o nó do Resend para enviar o e-mail.
3.  **Resend**: Entrega o e-mail ao destinatário final.

---

## 2. Estrutura do Webhook (Payload)

O CRM enviará um JSON com a seguinte estrutura para o n8n:

```json
{
  "type": "email_notification",
  "organization_id": "uuid-da-organizacao",
  "resend_key": "re_sua_api_key_aqui",
  "from": "Nome da Empresa <contato@seudominio.com>",
  "to": ["cliente@email.com"],
  "subject": "Assunto do E-mail",
  "html": "Conteúdo formatado em HTML..."
}
```

---

## 3. Configuração do Workflow no n8n

### Passo 1: Nó de Webhook
- **Método HTTP**: `POST`
- **Caminho (Path)**: Defina um nome amigável (ex: `notifications`)
- **Resposta**: `200 OK` (Imediata)

### Passo 2: Nó de Resend (ou HTTP Request)
Como o CRM envia a `resend_key` dinamicamente no payload, você tem duas opções no n8n:

#### Opção A: Nó HTTP Request (Recomendado para Multi-Organização)
Use este nó para injetar a API Key que vem do CRM em tempo real.
- **Method**: `POST`
- **URL**: `https://api.resend.com/emails`
- **Authentication**: `Header Auth`
    - **Name**: `Authorization`
    - **Value**: `Bearer {{ $json.resend_key }}`
- **Body Parameters**:
    - `from`: `{{ $json.from }}`
    - `to`: `{{ $json.to }}` (O CRM já envia como array)
    - `subject`: `{{ $json.subject }}`
    - `html`: `{{ $json.html }}`

#### Opção B: Nó Oficial do Resend
Ideal se você gerencia apenas uma única organização/API Key.
- **Resource**: `Email`
- **Operation**: `Send`
- **From**: `{{ $json.from }}`
- **To**: `{{ $json.to.join(',') }}` (Se o nó exigir string, use join)
- **Subject**: `{{ $json.subject }}`
- **Html**: `{{ $json.html }}`

---

## 4. Por que usar o n8n como Proxy?

1.  **Segurança (CORS)**: Navegadores bloqueiam chamadas diretas para a API do Resend a partir do frontend. O n8n (servidor) não sofre essa restrição.
2.  **Centralização**: Você pode adicionar logs, gravar histórico de envios no banco de dados ou integrar com outros serviços (como Slack/WhatsApp) no mesmo workflow sem mexer no código do CRM.
3.  **Flexibilidade**: Se decidir trocar o Resend pelo SendGrid ou Mailchimp no futuro, basta alterar o workflow no n8n, sem precisar atualizar o sistema.

---

## 5. Como Ativar no CRM

1.  Crie o workflow no n8n e **Ative-o (Execute Workflow)**.
2.  Copie a **Production URL** do Webhook gerada.
3.  No CRM, acesse **Configurações > Integrações > n8n**.
4.  Cole a URL no campo **"Webhook URL: Notificações de Sistema (E-mail)"**.
5.  Certifique-se de que a **API Key do Resend** também está preenchida no bloco de e-mail ao lado.

---

## 6. Segurança Adicional: Validação HMAC (Recomendado)

Para garantir que apenas o seu CRM possa disparar este workflow, é altamente recomendado configurar a validação HMAC. Isso funciona como uma assinatura digital que protege seu webhook contra chamadas não autorizadas.

### Passo 1: No CRM
1.  Em **Configurações > Integrações > n8n**, localize o campo **"Webhook Secret"** (se não existir, gere uma chave segura e guarde-a).
2.  Copie este valor. Ele será seu segredo compartilhado.

### Passo 2: No n8n
1.  Abra as configurações do seu nó de **Webhook**.
2.  Mude a **Authentication** para `Header Auth`.
3.  Ative a opção **HMAC Validation**.
4.  Em **Credential for HMAC**, clique em *Create New*.
5.  Configure a credencial da seguinte forma:
    - **Header Name**: `x-maestria-signature` (Este é o nome do cabeçalho que o CRM enviará)
    - **Secret**: Cole o valor que você copiou do CRM no Passo 1.
    - **Algorithm**: `sha256`
    - **Encoding**: `hex`
6.  Salve a credencial e o workflow.

Agora, o n8n só aceitará requisições que contenham a assinatura HMAC válida, tornando sua automação muito mais segura.
