# Configuração de E-mail e Confirmação

## Erro: "Error sending confirmation email"

Esse erro costuma ocorrer quando o Supabase tenta enviar e-mails de confirmação usando o provedor padrão (resend), que tem limitações.

### Soluções

#### 1. Configurar SMTP próprio (recomendado para produção)

1. Acesse **Project Settings** → **Authentication** → **SMTP**
2. Ative **Enable Custom SMTP**
3. Preencha:
   - **Host:** seu servidor SMTP (ex: `smtp.gmail.com`, `smtp.office365.com`, SendGrid, Mailgun)
   - **Port:** 587 (TLS) ou 465 (SSL)
   - **User:** usuário SMTP
   - **Password:** senha ou senha de app
   - **Sender email:** e-mail remetente (deve ser válido e autenticado)
   - **Sender name:** nome exibido (ex: "Maestr.IA")

#### 2. Desabilitar confirmação de e-mail (desenvolvimento)

1. Acesse **Authentication** → **Providers** → **Email**
2. Desmarque **Confirm email**

⚠️ Use apenas em ambiente de desenvolvimento. Em produção, mantenha confirmação ativa com SMTP próprio.

#### 3. Usar Resend (provedor padrão do Supabase)

- Verifique o domínio em **Authentication** → **Email Templates**
- O remetente padrão pode estar bloqueado por provedores (Gmail, Outlook)
- Configure um domínio verificado no Resend para melhor entregabilidade

### Checklist

- [ ] SMTP configurado com credenciais corretas
- [ ] Porta 587/465 liberada no firewall
- [ ] Remetente autenticado no provedor
- [ ] Template de e-mail sem caracteres problemáticos
- [ ] Teste envio via Supabase Dashboard → Authentication → Users → Send magic link
