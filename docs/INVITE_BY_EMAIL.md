# Convite por e-mail

## Fluxo

1. Admin informa o e-mail do convidado em **Configurações → Convidar por e-mail**
2. O sistema gera um token (válido 24h) e envia e-mail com o link
3. Convidado acessa o link e completa cadastro (nome, senha)
4. Se não completar em 24h, o token expira e é necessário emitir novo convite

## Configuração da Edge Function

Para envio automático de e-mail, configure:

### 1. Secrets (Supabase Dashboard → Edge Functions → Secrets)

- `RESEND_API_KEY` – Chave da API Resend (https://resend.com)
- `SUPABASE_ANON_KEY` – Chave anônima do projeto (para RPC com contexto do usuário)
- `APP_URL` – URL do frontend (ex: `https://app.maestr.ia`)

### 2. Deploy da função

```bash
supabase functions deploy invite-by-email
```

### 3. Sem Resend

Se `RESEND_API_KEY` não estiver configurada, o token será criado e o link retornado na resposta (para copiar e enviar manualmente).

## URL do link no banco

O link no banco usa `https://app.maestr.ia` por padrão. Para alterar, edite a função `create_invitation_token` na migração 00010 ou use a variável `APP_URL` na Edge Function para construir o link antes de enviar o e-mail.
