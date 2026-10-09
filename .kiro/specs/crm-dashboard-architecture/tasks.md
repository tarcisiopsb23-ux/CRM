# Implementation Plan: CRM Dashboard Architecture

## Overview

Implementação da arquitetura transversal do CRM e Dashboard: autenticação por e-mail/senha, gestão de senhas via RPC, senha de suporte técnico, integrações com WhatsApp (n8n e QR Code), rastreamento GTM e Meta Pixel, contabilização de conversões, tela de perfil/integrações e importação de leads via CSV.

Stack: TypeScript + React + Supabase (frontend), SQL (migrações Supabase), Node.js (backend WhatsApp QR Code).

## Tasks

- [ ] 1. Autenticação por e-mail e senha — RPCs e tela de login
  - [x] 1.1 Criar migração SQL com as RPCs de autenticação
    - Criar `supabase/migrations/20260325000000_auth_rpcs.sql`
    - Implementar `validate_client_dashboard_password(p_slug, p_email, p_password)` com SECURITY DEFINER
    - Implementar `get_client_by_slug(p_slug)` retornando dados públicos sem expor senha
    - Implementar `recover_client_password(p_slug, p_email, p_new_temp_password)` com retorno vazio para slug/e-mail inválidos
    - Implementar `update_client_dashboard_password(p_client_id, p_new_password)` definindo `has_temp_password = false`
    - _Requirements: 2.4, 2.6, 2.7, 3.1, 3.2, 3.3, 3.5_

  - [x] 1.2 Escrever testes de propriedade para as RPCs de autenticação
    - **Property: validate_client_dashboard_password retorna false para qualquer slug/e-mail/senha inválidos**
    - **Property: recover_client_password retorna vazio para slug ou e-mail inexistentes**
    - **Validates: Requirements 2.3, 3.5**

  - [x] 1.3 Atualizar `PublicDashboardLoginPage.tsx` para fluxo completo de autenticação
    - Garantir que o campo e-mail está presente no formulário de login
    - Implementar fluxo `first-access` com troca de senha obrigatória quando `has_temp_password = true`
    - Implementar fluxo `recovery` chamando `recover_client_password` via RPC
    - Exibir mensagem de erro genérica sem revelar qual campo está incorreto (req 2.3)
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 3.1, 3.3_

  - [x] 1.4 Escrever testes unitários para `PublicDashboardLoginPage`
    - Testar que mensagem de erro não revela campo incorreto
    - Testar redirecionamento para `first-access` quando `has_temp_password = true`
    - _Requirements: 2.3, 2.5_

- [ ] 2. Senha de suporte técnico da agência
  - [x] 2.1 Criar migração SQL para RPC de suporte técnico
    - Criar `supabase/migrations/20260325000001_support_password_rpc.sql`
    - Implementar `set_support_password(p_slug, p_password)` que grava `metadata->>'support_password'`
    - Implementar `validate_support_password(p_slug, p_password)` que valida contra `support_password`
    - _Requirements: 4.1, 4.3, 4.5_

  - [x] 2.2 Atualizar `PublicDashboardLoginPage.tsx` para detectar sessão de suporte
    - Após login bem-sucedido, verificar se a senha usada corresponde a `support_password`
    - Persistir flag `is_support_session: true` no localStorage quando for sessão de suporte
    - _Requirements: 4.2_

  - [x] 2.3 Adicionar indicador visual de sessão de suporte em `PublicDashboardPage.tsx`
    - Ler flag `is_support_session` do localStorage
    - Renderizar banner/badge diferenciado quando a sessão for de suporte técnico
    - _Requirements: 4.4_

- [x] 3. Checkpoint — Autenticação e suporte
  - Garantir que todos os testes passam. Verificar que login com e-mail+senha funciona, que senha temporária força troca, e que sessão de suporte exibe indicador visual. Perguntar ao usuário se há dúvidas antes de continuar.

- [ ] 4. Rastreamento GTM e Meta Pixel
  - [x] 4.1 Criar hook `useTrackingInjection` em `src/hooks/useTrackingInjection.ts`
    - Receber `gtmId: string | null` e `metaPixelId: string | null` como parâmetros
    - Injetar snippet GTM no `<head>` e `<body>` quando `gtmId` for válido (formato `GTM-[A-Z0-9]+`)
    - Injetar snippet Meta Pixel no `<head>` quando `metaPixelId` for válido (15-16 dígitos numéricos)
    - Não injetar nada quando os campos estiverem ausentes ou vazios
    - Limpar snippets injetados ao desmontar (cleanup no useEffect)
    - _Requirements: 7.1, 7.2, 7.4, 8.1, 8.2, 8.4_

  - [x] 4.2 Escrever testes de propriedade para `useTrackingInjection`
    - **Property: GTM só é injetado para IDs no formato GTM-[A-Z0-9]+**
    - **Property: Meta Pixel só é injetado para IDs numéricos de 15-16 dígitos**
    - **Property: IDs ausentes/vazios nunca injetam snippets**
    - **Validates: Requirements 7.4, 7.5, 8.4, 8.5**

  - [x] 4.3 Integrar `useTrackingInjection` em `PublicDashboardPage.tsx`
    - Ler `metadata.gtm_id` e `metadata.meta_pixel_id` do `clientData`
    - Chamar o hook com os valores lidos
    - _Requirements: 7.2, 7.3, 8.2, 8.3_

- [ ] 5. Contabilização de conversões
  - [x] 5.1 Criar migração SQL para tabela de conversões
    - Criar `supabase/migrations/20260325000002_conversions_table.sql`
    - Criar tabela `crm_conversions(id, client_id, lead_id, campaign_id, converted_at)`
    - Criar função/trigger que insere em `crm_conversions` quando `crm_leads.status` muda para `'fechado'`
    - _Requirements: 9.1, 9.5_

  - [x] 5.2 Criar função `fireConversionEvents` em `src/lib/conversionEvents.ts`
    - Receber `clientMetadata` com `gtm_id` e `meta_pixel_id`
    - Disparar `dataLayer.push({ event: 'conversion' })` quando GTM estiver configurado
    - Disparar `fbq('track', 'Purchase')` quando Meta Pixel estiver configurado
    - _Requirements: 9.2, 9.3_

  - [x] 5.3 Integrar `fireConversionEvents` no `CrmSection` ao fechar lead
    - Chamar `fireConversionEvents` quando o status de um lead é atualizado para `'fechado'`
    - _Requirements: 9.2, 9.3_

  - [x] 5.4 Escrever testes unitários para `fireConversionEvents`
    - Testar que `dataLayer.push` é chamado apenas quando GTM está configurado
    - Testar que `fbq` é chamado apenas quando Meta Pixel está configurado
    - _Requirements: 9.2, 9.3_

- [ ] 6. Tela de perfil e configurações de integrações
  - [x] 6.1 Criar migração SQL para RPC de atualização de metadata
    - Criar `supabase/migrations/20260325000003_update_metadata_rpc.sql`
    - Implementar `update_client_integrations(p_client_id, p_gtm_id, p_meta_pixel_id, p_n8n_api_key, p_whatsapp_webhook_url)` com SECURITY DEFINER
    - Usar `jsonb_build_object` para merge parcial preservando campos existentes
    - Validar formatos antes de persistir (GTM: `GTM-[A-Z0-9]+`, Pixel: 15-16 dígitos)
    - _Requirements: 10.5, 13.2, 13.5_

  - [x] 6.2 Criar componente `ProfilePage` em `src/pages/ProfilePage.tsx`
    - Seção de troca de senha: campos senha atual, nova senha, confirmação
    - Validar senha atual antes de aceitar nova (req 10.2, 10.3)
    - Seção de integrações: campos GTM ID, Meta Pixel ID, chave API n8n, URL webhook WhatsApp
    - Exibir status de cada integração (ativa/inativa) com base nos valores salvos
    - Exibir mensagem de erro descritiva para integrações com problema sem expor credenciais (req 10.7)
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.6, 10.7_

  - [x] 6.3 Adicionar rota `/dashboard/:slug/profile` em `src/App.tsx`
    - Registrar a rota protegida para `ProfilePage`
    - Adicionar link de acesso ao perfil no menu dropdown de `PublicDashboardPage.tsx`
    - _Requirements: 10.1_

  - [x] 6.4 Escrever testes de propriedade para serialização de metadata
    - **Property: parse → serialize → parse produz objeto equivalente ao original (round-trip)**
    - **Property: campos ausentes no metadata usam valores padrão sem lançar exceção**
    - **Validates: Requirements 13.1, 13.3, 13.4**

- [x] 7. Checkpoint — Rastreamento, conversões e perfil
  - Garantir que todos os testes passam. Verificar que GTM e Pixel são injetados corretamente, que conversões são registradas ao fechar leads, e que a tela de perfil salva integrações. Perguntar ao usuário se há dúvidas antes de continuar.

- [ ] 8. Importação de leads via CSV
  - [x] 8.1 Criar utilitário `src/lib/csvParser.ts`
    - Detectar separador automaticamente (`,` ou `;`)
    - Suportar codificação UTF-8 e UTF-8 com BOM
    - Retornar array de objetos com cabeçalhos como chaves
    - Rejeitar arquivos acima de 5 MB com mensagem descritiva
    - _Requirements: 11.8, 11.9, 11.10_

  - [x] 8.2 Escrever testes de propriedade para `csvParser`
    - **Property: para qualquer CSV válido com separador `,` ou `;`, o parser retorna o mesmo número de linhas de dados**
    - **Property: arquivos acima de 5 MB sempre retornam erro de tamanho**
    - **Validates: Requirements 11.8, 11.10**

  - [x] 8.3 Criar componente `CsvImportPage` em `src/pages/CsvImportPage.tsx`
    - Upload de arquivo CSV com validação de tamanho (máx 5 MB)
    - Exibir prévia das primeiras 5 linhas com cabeçalhos detectados
    - Interface de mapeamento de colunas: associar coluna CSV → campo `crm_leads`
    - Campos disponíveis para mapeamento: `name`, `phone`, `email`, `address`, `company`, `origin`, `notes`, `proposal_value`, `potential_value`, `temperature`, `status`
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [x] 8.4 Implementar lógica de importação em `CsvImportPage`
    - Ao confirmar mapeamento, iterar linhas e inserir em `crm_leads` via Supabase
    - Ignorar linhas com `name` vazio e registrá-las no relatório de erros
    - Exibir relatório final: total processado, importados com sucesso, ignorados com motivos
    - _Requirements: 11.5, 11.6, 11.7_

  - [x] 8.5 Adicionar rota `/dashboard/:slug/import` em `src/App.tsx`
    - Registrar rota protegida para `CsvImportPage`
    - Adicionar link de acesso à importação no menu do CRM
    - _Requirements: 11.1_

  - [x] 8.6 Escrever testes unitários para lógica de importação
    - Testar que linhas com `name` vazio são ignoradas e aparecem no relatório
    - Testar que o relatório final contém contagens corretas
    - _Requirements: 11.6, 11.7_

- [ ] 9. Integração WhatsApp via n8n (webhook)
  - [x] 9.1 Criar migração SQL para RPC de recebimento de webhook n8n
    - Criar `supabase/migrations/20260325000004_n8n_webhook_rpc.sql`
    - Implementar `upsert_lead_from_whatsapp(p_client_id, p_name, p_phone, p_whatsapp_link, p_last_contact_at)` com SECURITY DEFINER
    - Criar ou atualizar lead em `crm_leads` com `origin = 'whatsapp'`
    - _Requirements: 5.1, 5.2_

  - [x] 9.2 Criar endpoint de webhook em `crm-whatsapp/backend/routes/webhook.js`
    - `POST /api/webhook/n8n` — recebe payload do agente n8n
    - Validar campos obrigatórios (`name`, `phone`); retornar HTTP 400 com mensagem descritiva para dados inválidos/incompletos
    - Chamar `upsertContato` com os dados recebidos
    - _Requirements: 5.1, 5.5_

  - [x] 9.3 Escrever testes de propriedade para o webhook n8n
    - **Property: para qualquer payload com `name` e `phone` válidos, o lead é criado/atualizado sem erro**
    - **Property: para qualquer payload sem `name` ou `phone`, a API retorna HTTP 400**
    - **Validates: Requirements 5.5**

- [ ] 10. Integração WhatsApp via QR Code — status no dashboard
  - [x] 10.1 Expor status da conexão WhatsApp no backend existente
    - Verificar que `GET /api/status` em `crm-whatsapp/backend/routes/contatos.js` retorna `{ status: 'conectado' | 'aguardando_qr' | 'desconectado' }`
    - Garantir que o status é atualizado nos eventos `ready`, `qr` e `disconnected` do `whatsapp-web.js`
    - _Requirements: 6.6_

  - [x] 10.2 Criar componente `IntegrationStatusBadge` em `src/components/crm/IntegrationStatusBadge.tsx`
    - Receber `status: 'conectado' | 'aguardando_qr' | 'desconectado' | 'inativo'`
    - Renderizar badge com cor e texto correspondente ao status
    - _Requirements: 5.4, 6.6, 10.6_

  - [x] 10.3 Exibir status das integrações na `ProfilePage`
    - Usar `IntegrationStatusBadge` para cada integração configurada
    - Buscar status do WhatsApp QR Code via `GET /api/status` quando URL do webhook estiver configurada
    - _Requirements: 10.6, 10.7_

- [ ] 11. Isolamento de acesso e segurança
  - [x] 11.1 Auditar todas as RPCs existentes para garantir validação de `dashboard_slug`
    - Verificar que `get_client_by_slug`, `validate_client_dashboard_password`, `recover_client_password` e `update_client_dashboard_password` validam o slug antes de retornar dados
    - Verificar que todas as RPCs usam `SECURITY DEFINER`
    - _Requirements: 12.1, 12.6_

  - [x] 11.2 Adicionar guard de autenticação em `src/App.tsx`
    - Criar componente `ProtectedRoute` que verifica `localStorage` para `client_auth_${slug}`
    - Redirecionar para `/dashboard/:slug/login` quando sessão ausente ou expirada
    - _Requirements: 12.3, 12.5_

  - [x] 11.3 Escrever testes unitários para `ProtectedRoute`
    - Testar redirecionamento quando sessão ausente
    - Testar acesso permitido quando sessão válida presente
    - _Requirements: 12.3, 12.5_

- [ ] 12. Checkpoint final — Garantir que todos os testes passam
  - Garantir que todos os testes passam. Verificar isolamento de acesso, importação CSV, integrações WhatsApp e rastreamento end-to-end. Perguntar ao usuário se há dúvidas antes de finalizar.

## Notes

- Tarefas marcadas com `*` são opcionais e podem ser puladas para MVP mais rápido
- Cada tarefa referencia requisitos específicos para rastreabilidade
- Os checkpoints garantem validação incremental a cada bloco funcional
- As RPCs Supabase usam `SECURITY DEFINER` para garantir isolamento entre parceiros (Req 12.6)
- O campo `metadata` JSONB usa merge parcial em todas as escritas para preservar campos existentes (Req 13.2)
