# Plano de Implementação: Módulo Fiscal NFS-e

## Visão Geral

Implementação incremental do módulo fiscal integrado à API Notaas, seguindo os padrões arquiteturais do projeto (TanStack Query, shadcn/ui, RLS multi-tenant, ModuleGuard). As tarefas constroem umas sobre as outras: fundação de tipos e dados → cliente HTTP → hook principal → componentes visuais → integrações contextuais → webhook → testes.

## Tarefas

- [x] 1. Criar migration da tabela `invoices` e tipos TypeScript
  - Criar `migrations/015_create_invoices_table.sql` com a tabela `invoices`, todos os campos especificados no design, RLS usando `get_user_organization_id()`, e índices em `organization_id`, `client_id`, `contract_id`, `payment_id`, `status`, `competencia`
  - Criar `src/types/fiscal.ts` com as interfaces `Invoice`, `InvoiceStatus`, `InvoiceType`, `NotaasConfig`, `EmitirNFSePayload`, `NotaasEmissaoResponse`, `InvoiceEmitFormData`
  - Adicionar `'notaas'` ao `IntegrationType` em `src/types/settings.ts` e adicionar `NotaasConfig` ao union `IntegrationConfig`
  - _Requisitos: 9.1, 9.3, 9.5, 1.1_

- [x] 2. Implementar funções puras de validação e utilitários fiscais
  - [x] 2.1 Criar `src/lib/fiscalValidators.ts` com as funções puras: `validateCnpj(input: string): boolean`, `validateAliquota(value: number): boolean`, `validateCompetencia(value: string): boolean`, `validateValorServico(value: number): boolean`, `maskApiKey(value: string): string`, `resolveCodigoServico(contractType: string | null, config: NotaasConfig): string`, `deriveCompetencia(paidAt: string): string`
    - `validateCnpj`: aceita string com exatamente 14 dígitos numéricos (após remoção de formatação)
    - `validateAliquota`: aceita valores no intervalo [0, 100]
    - `validateCompetencia`: aceita strings no formato YYYY-MM com MM entre 01 e 12
    - `validateValorServico`: aceita apenas valores estritamente maiores que 0
    - `maskApiKey`: retorna `sk_****xxxx` expondo no máximo os últimos 4 caracteres
    - `resolveCodigoServico`: retorna `codigos_servico_por_tipo_contrato[contractType]` se existir, senão `codigo_servico_padrao`
    - `deriveCompetencia`: extrai YYYY-MM da data `paid_at`
    - _Requisitos: 1.2, 1.3, 1.5, 2.3, 2.8, 2.9, 3.7_

  - [ ]* 2.2 Escrever testes de propriedade para `validateCnpj`
    - **Propriedade 1: validateCnpj aceita apenas strings com exatamente 14 dígitos numéricos**
    - **Valida: Requisito 1.2**
    - Usar `fc.string()` e `fc.stringOf(fc.digit(), { minLength: 14, maxLength: 14 })` para gerar casos
    - Tag: `// Feature: fiscal-nfse-module, Property 1: validateCnpj`

  - [ ]* 2.3 Escrever testes de propriedade para `validateAliquota`
    - **Propriedade 2: validateAliquota aceita apenas valores no intervalo [0, 100]**
    - **Valida: Requisito 1.3**
    - Usar `fc.float()` e `fc.integer()` para gerar valores dentro e fora do intervalo
    - Tag: `// Feature: fiscal-nfse-module, Property 2: validateAliquota`

  - [ ]* 2.4 Escrever testes de propriedade para `maskApiKey`
    - **Propriedade 3: maskApiKey preserva apenas os últimos 4 caracteres e contém `****`**
    - **Valida: Requisito 1.5**
    - Usar `fc.string({ minLength: 5 })` para garantir strings com comprimento > 4
    - Tag: `// Feature: fiscal-nfse-module, Property 3: maskApiKey`

  - [ ]* 2.5 Escrever testes de propriedade para `validateValorServico`
    - **Propriedade 5: validateValorServico rejeita valores não-positivos**
    - **Valida: Requisito 2.8**
    - Usar `fc.float()` para gerar valores positivos e não-positivos
    - Tag: `// Feature: fiscal-nfse-module, Property 5: validateValorServico`

  - [ ]* 2.6 Escrever testes de propriedade para `validateCompetencia`
    - **Propriedade 6: validateCompetencia aceita apenas formato YYYY-MM com mês válido**
    - **Valida: Requisito 2.9**
    - Usar `fc.string()` e strings geradas no formato YYYY-MM com meses válidos e inválidos
    - Tag: `// Feature: fiscal-nfse-module, Property 6: validateCompetencia`

  - [ ]* 2.7 Escrever testes de propriedade para `resolveCodigoServico`
    - **Propriedade 7: resolveCodigoServico segue hierarquia de mapeamento**
    - **Valida: Requisitos 2.3, 2.2**
    - Usar `fc.record()` para gerar configs com e sem mapeamentos por tipo de contrato
    - Tag: `// Feature: fiscal-nfse-module, Property 7: resolveCodigoServico`

  - [ ]* 2.8 Escrever testes de propriedade para `deriveCompetencia`
    - **Propriedade 9: deriveCompetencia preserva mês e ano de paid_at**
    - **Valida: Requisito 3.7**
    - Usar `fc.date()` para gerar datas válidas e verificar que YYYY-MM é preservado
    - Tag: `// Feature: fiscal-nfse-module, Property 9: deriveCompetencia`

- [x] 3. Implementar cliente HTTP Notaas (`src/lib/notaasClient.ts`)
  - [x] 3.1 Criar `src/lib/notaasClient.ts` com as funções: `getBaseUrl(sandboxMode: boolean): string`, `emitirNFSe(config: NotaasConfig, payload: EmitirNFSePayload): Promise<NotaasEmissaoResponse>`, `cancelarNFSe(config: NotaasConfig, notaasId: string, motivo: string): Promise<void>`
    - `getBaseUrl`: retorna `https://sandbox.notaas.com.br` quando `sandbox_mode=true`, `https://platform.notaas.com.br` quando `false`
    - `emitirNFSe`: `POST /api/v1/emitir` com header `x-api-key`, lança erro com mensagem da API em caso de falha
    - `cancelarNFSe`: `POST /api/v1/cancelar/:notaas_id` com header `x-api-key`
    - Seguir o padrão de lib pura sem React, análogo a `n8nWebhook.ts`
    - _Requisitos: 1.6, 2.5, 4.6_

  - [ ]* 3.2 Escrever testes de propriedade para `getBaseUrl`
    - **Propriedade 4: getBaseUrl respeita sandbox_mode**
    - **Valida: Requisito 1.6**
    - Usar `fc.boolean()` para gerar valores de `sandbox_mode` e verificar URL retornada
    - Tag: `// Feature: fiscal-nfse-module, Property 4: getBaseUrl`

- [x] 4. Implementar hook `useInvoices` (`src/hooks/useInvoices.ts`)
  - [x] 4.1 Criar `src/hooks/useInvoices.ts` com query de listagem paginada com filtros opcionais (`status`, `competencia`, `client_id`, `contract_id`)
    - Seguir padrão TanStack Query com `queryKey: ["invoices", organizationId, filters]`
    - Ordenar por `created_at` decrescente
    - _Requisitos: 4.1, 4.2, 5.1_

  - [x] 4.2 Adicionar mutation `emit` ao `useInvoices`
    - Criar registro com `status='processando'` no Supabase antes de chamar a API
    - Chamar `notaasClient.emitirNFSe()` com o payload montado a partir de `InvoiceEmitFormData` e dados do cliente
    - Em sucesso: `UPDATE invoices SET status='autorizada', notaas_id, numero, pdf_url, xml_url, emitida_em`
    - Em erro: `UPDATE invoices SET status='rejeitada', erro_mensagem`
    - Invalidar query `["invoices", organizationId]` após mutação
    - _Requisitos: 2.4, 2.5, 2.6, 2.7, 9.2, 9.4_

  - [x] 4.3 Adicionar mutation `cancel` ao `useInvoices`
    - Chamar `notaasClient.cancelarNFSe()` com `notaas_id` e motivo
    - Em sucesso: `UPDATE invoices SET status='cancelada', cancelada_em, motivo_cancelamento`
    - Em erro: propagar erro sem alterar status do Invoice
    - _Requisitos: 4.6, 4.7_

  - [x] 4.4 Adicionar função `autoEmit` ao `useInvoices`
    - Verificar se já existe Invoice ativo para o `payment_id` (status diferente de `'rejeitada'` ou `'cancelada'`)
    - Se existir: registrar aviso no console e retornar sem criar duplicata
    - Se não existir: usar `codigo_servico_padrao` e `descricao_servico_padrao` das settings, derivar `competencia` de `paid_at` via `deriveCompetencia`, chamar `emit` internamente
    - Falha na emissão não deve propagar exceção (best-effort)
    - _Requisitos: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 4.5 Adicionar função `filterInvoices` pura ao módulo (utilitário de filtragem local)
    - Recebe lista de Invoices e filtro de status, retorna apenas os correspondentes
    - _Requisitos: 4.2_

  - [ ]* 4.6 Escrever testes de propriedade para `autoEmit` (idempotência)
    - **Propriedade 8: autoEmit é idempotente para pagamentos com Invoice ativo**
    - **Valida: Requisitos 3.3, 3.4**
    - Mockar Supabase para simular Invoice ativo existente e verificar que nenhum novo INSERT é feito
    - Tag: `// Feature: fiscal-nfse-module, Property 8: autoEmit idempotência`

  - [ ]* 4.7 Escrever testes de propriedade para `filterInvoices`
    - **Propriedade 10: filterInvoices retorna apenas Invoices correspondentes ao critério**
    - **Valida: Requisito 4.2**
    - Usar `fc.array(fc.record({ status: fc.constantFrom('pendente','processando','autorizada','rejeitada','cancelada') }))` para gerar listas
    - Tag: `// Feature: fiscal-nfse-module, Property 10: filterInvoices`

- [x] 5. Checkpoint — Fundação completa
  - Garantir que todos os testes das tarefas 2 e 3 passam, e que `useInvoices` compila sem erros de tipo. Perguntar ao usuário se há dúvidas antes de prosseguir.

- [x] 6. Implementar componentes visuais do módulo fiscal
  - [x] 6.1 Criar `src/components/fiscal/InvoiceStatusBadge.tsx`
    - Badge colorido por status: cinza (pendente), amarelo (processando), verde (autorizada), vermelho (rejeitada), cinza-escuro (cancelada)
    - Usar variantes do componente `Badge` do shadcn/ui
    - _Requisitos: 4.8_

  - [ ]* 6.2 Escrever testes de propriedade para `InvoiceStatusBadge`
    - **Propriedade 11: InvoiceStatusBadge renderiza variante correta para cada InvoiceStatus**
    - **Valida: Requisito 4.8**
    - Usar `fc.constantFrom('pendente','processando','autorizada','rejeitada','cancelada')` e verificar classe CSS/variante renderizada
    - Tag: `// Feature: fiscal-nfse-module, Property 11: InvoiceStatusBadge`

  - [x] 6.3 Criar `src/components/fiscal/InvoiceList.tsx`
    - Tabela paginada com colunas: número da nota, cliente, competência, valor, status (usando `InvoiceStatusBadge`), data de emissão
    - Filtros por `status`, `competencia` e nome do cliente
    - Botão de download/visualização do PDF quando `status='autorizada'` e `pdf_url` preenchido
    - Botão de cancelamento para usuários com `canDelete` no módulo `fiscal`
    - Exibir `erro_mensagem` ao expandir linha com `status='rejeitada'`
    - _Requisitos: 4.1, 4.2, 4.3, 4.4, 4.9_

  - [x] 6.4 Criar `src/components/fiscal/InvoiceEmitModal.tsx`
    - Modal com formulário: `client_id` (select), `contract_id` (opcional), `payment_id` (opcional), `valor_servico`, `codigo_servico`, `descricao_servico`, `competencia`, `aliquota_iss`
    - Pré-preencher `codigo_servico` e `aliquota_iss` das settings ao abrir
    - Pré-preencher `codigo_servico` com mapeamento por `contract_type` quando `contract_id` selecionado (via `resolveCodigoServico`)
    - Pré-preencher dados do tomador (nome, CPF/CNPJ, email, endereço) ao selecionar cliente
    - Validação inline com `fiscalValidators.ts` antes de submeter
    - Spinner no botão e desabilitar durante submissão para evitar duplo envio
    - Toast de sucesso com número da nota ou toast de erro com mensagem da API
    - _Requisitos: 2.1, 2.2, 2.3, 2.8, 2.9, 10.1, 10.2, 10.4, 10.5_

  - [x] 6.5 Criar `src/components/fiscal/InvoiceViewModal.tsx`
    - Modal de visualização com dados resumidos: número, competência, valor, status, link para PDF
    - Exibir `erro_mensagem` quando `status='rejeitada'`
    - _Requisitos: 6.2_

- [x] 7. Implementar página principal e configurações fiscais
  - [x] 7.1 Criar `src/components/settings/NotaasSection.tsx`
    - Formulário com campos: `api_key` (exibido mascarado via `maskApiKey`), `cnpj_emissor`, `codigo_servico_padrao`, `aliquota_iss_padrao`, `regime_tributario` (select), `descricao_servico_padrao`, `sandbox_mode` (toggle), `auto_emit_on_payment` (toggle), `webhook_secret`
    - Tabela de mapeamentos `codigos_servico_por_tipo_contrato` (até 20 entradas)
    - Validação com `fiscalValidators.ts` antes de salvar
    - Usar `useIntegration('notaas')` para ler/salvar em `organization_integrations`
    - Acessível apenas para `owner`, `admin` ou usuário com `can_edit` em `settings`
    - _Requisitos: 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 1.8, 1.9_

  - [x] 7.2 Criar `src/pages/FiscalPage.tsx`
    - Página principal da rota `/fiscal` com `InvoiceList` e botão "Emitir NFS-e" (abre `InvoiceEmitModal`)
    - Banner de aviso persistente quando `api_key` não está configurada nas settings
    - Ocultar botão de emissão quando usuário não tem `canCreate` no módulo `fiscal`
    - Usar `useModulePermission('fiscal')` para controle de acesso
    - _Requisitos: 2.10, 4.1, 4.2, 4.3, 4.4, 8.3, 10.6_

  - [x] 7.3 Adicionar rota `/fiscal` ao `src/App.tsx`
    - Importar `FiscalPage` e adicionar `<Route path="/fiscal" element={<FiscalPage />} />` dentro do `<ModuleGuard />`
    - _Requisitos: 8.3_

  - [x] 7.4 Atualizar `src/hooks/usePermissions.ts`
    - Adicionar `{ id: "fiscal", label: "Fiscal / NFS-e" }` ao array `MODULES`
    - Adicionar `"/fiscal": "fiscal"` ao `ROUTE_TO_MODULE`
    - Adicionar bloco `fiscal` ao `baselineFor()`: `manager` → `{canView: true, canCreate: true, canEdit: true, canDelete: false}`; demais roles → `{canView: false, canCreate: false, canEdit: false, canDelete: false}`
    - _Requisitos: 8.1, 8.2, 8.5, 8.6_

  - [ ]* 7.5 Escrever testes de propriedade para `baselineFor` com módulo `fiscal`
    - **Propriedade 14: baselineFor retorna permissões corretas para o módulo fiscal por role**
    - **Valida: Requisito 8.2**
    - Usar `fc.constantFrom('owner','admin','manager','member','viewer')` e verificar resultado para cada role
    - Tag: `// Feature: fiscal-nfse-module, Property 14: baselineFor fiscal`

  - [x] 7.6 Adicionar `NotaasSection` à `src/components/settings/SettingsPage.tsx` (ou equivalente)
    - Localizar onde outras seções de integração são renderizadas e adicionar `<NotaasSection />`
    - _Requisitos: 1.1, 1.9_

- [x] 8. Checkpoint — Módulo fiscal standalone funcional
  - Garantir que a rota `/fiscal` renderiza corretamente, `NotaasSection` salva configurações, e `InvoiceList` exibe dados. Perguntar ao usuário se há dúvidas antes de prosseguir.

- [x] 9. Integrar NFS-e no `ContractDetailPage`
  - [x] 9.1 Modificar `src/components/clients/ContractDetailPage.tsx`
    - Adicionar aba "Notas Fiscais" ao `<Tabs>` existente
    - Na aba: usar `useInvoices` filtrado por `contract_id` para listar invoices do contrato
    - Exibir para cada invoice: número, competência, valor, status (`InvoiceStatusBadge`), link para PDF
    - Botão "Emitir NFS-e" que abre `InvoiceEmitModal` pré-preenchido com `contract_id` e dados do cliente
    - Ocultar aba completamente quando usuário não tem `canView` no módulo `fiscal`
    - _Requisitos: 5.1, 5.2, 5.3, 5.4_

  - [x] 9.2 Adicionar botão NFS-e nas linhas de pagamento do `ContractDetailPage`
    - Na tabela de lançamentos: quando pagamento tem Invoice vinculado com `status='autorizada'`, exibir ícone de nota fiscal que abre `InvoiceViewModal`
    - Quando pagamento não tem Invoice vinculado e usuário tem `canCreate` em `fiscal`, exibir botão "Emitir NFS-e" que abre `InvoiceEmitModal` pré-preenchido com `payment_id`
    - Ocultar todos os controles fiscais quando usuário não tem `canView` em `fiscal`
    - _Requisitos: 6.1, 6.2, 6.3, 6.4_

- [x] 10. Integrar NFS-e no `C8TenantDetail` (mesmo comportamento do ContractDetailPage)
  - [x] 10.1 Modificar `src/components/c8control/C8TenantDetail.tsx`
    - Adicionar aba "Notas Fiscais" ao `<Tabs>` existente (após "Pagamentos")
    - Na aba: usar `useInvoices` filtrado por `contract_id` do tenant (obtido via `tenant.client_id` → contrato vinculado) para listar invoices
    - Exibir para cada invoice: número, competência, valor, status (`InvoiceStatusBadge`), link para PDF
    - Botão "Emitir NFS-e" que abre `InvoiceEmitModal` pré-preenchido com `contract_id` e dados do cliente do tenant
    - Ocultar aba completamente quando usuário não tem `canView` no módulo `fiscal`
    - _Requisitos: 5.1, 5.2, 5.3, 5.4 (escopo C8TenantDetail)_

  - [x] 10.2 Adicionar botão NFS-e nas linhas de pagamento da aba "Pagamentos" do `C8TenantDetail`
    - Na tabela de pagamentos (`allPayments`): quando pagamento tem Invoice vinculado com `status='autorizada'`, exibir ícone de nota fiscal que abre `InvoiceViewModal`
    - Quando pagamento não tem Invoice vinculado e usuário tem `canCreate` em `fiscal`, exibir botão "Emitir NFS-e" que abre `InvoiceEmitModal` pré-preenchido com `payment_id` e dados do tenant
    - Ocultar todos os controles fiscais quando usuário não tem `canView` em `fiscal`
    - _Requisitos: 6.1, 6.2, 6.3, 6.4 (escopo C8TenantDetail)_

- [x] 11. Integrar emissão automática ao confirmar pagamento
  - Modificar `src/hooks/useFinancial.ts` nas mutations `updatePayment` e `updateStatus`
  - Após atualizar status para `'pago'`, verificar se `auto_emit_on_payment` está habilitado nas settings via `useIntegration('notaas')`
  - Se habilitado: chamar `autoEmit` do `useInvoices` de forma fire-and-forget (falha não reverte confirmação do pagamento)
  - Aplicar a mesma lógica no `registerPayment`
  - _Requisitos: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 12. Implementar Edge Function `notaas-webhook`
  - [x] 12.1 Criar `supabase/functions/notaas-webhook/index.ts`
    - Expor endpoint `POST /functions/v1/notaas-webhook`
    - Ler `organization_id` do payload ou header customizado
    - Buscar `webhook_secret` em `organization_integrations` com `integration_type='notaas'`
    - Validar assinatura HMAC-SHA256 do payload usando o secret; retornar HTTP 401 se inválida
    - Processar evento `nfse.autorizada`: localizar Invoice por `notaas_id`, atualizar `status='autorizada'`, `numero`, `pdf_url`, `xml_url`, `emitida_em`
    - Processar evento `nfse.rejeitada`: localizar Invoice por `notaas_id`, atualizar `status='rejeitada'`, `erro_mensagem`
    - Retornar HTTP 404 se Invoice não encontrado; HTTP 200 para eventos processados com sucesso
    - Processar de forma idempotente (mesmo evento duas vezes = mesmo estado final)
    - Seguir padrão de `dispatch-webhook/index.ts`
    - _Requisitos: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

  - [ ]* 12.2 Escrever testes de propriedade para validação HMAC-SHA256
    - **Propriedade 12: validateHmac aceita apenas assinaturas HMAC-SHA256 corretas**
    - **Valida: Requisitos 7.2, 7.3**
    - Usar `fc.string()` para gerar payloads e secrets; verificar que apenas a assinatura correta é aceita
    - Tag: `// Feature: fiscal-nfse-module, Property 12: validateHmac`

  - [ ]* 12.3 Escrever testes de propriedade para idempotência do webhook
    - **Propriedade 13: processWebhookEvent é idempotente**
    - **Valida: Requisito 7.8**
    - Simular processamento do mesmo evento `nfse.autorizada` duas vezes e verificar estado final idêntico
    - Tag: `// Feature: fiscal-nfse-module, Property 13: processWebhookEvent idempotência`

- [ ] 13. Escrever testes de propriedade restantes
  - [ ]* 13.1 Escrever testes de propriedade para snapshot do tomador
    - **Propriedade 15: snapshot do tomador é imutável após criação do Invoice**
    - **Valida: Requisito 9.2**
    - Criar Invoice com dados do tomador, simular alteração do cliente, verificar que campos `tomador_*` do Invoice não mudam
    - Tag: `// Feature: fiscal-nfse-module, Property 15: snapshot imutabilidade`

  - [ ]* 13.2 Escrever testes de propriedade para consistência de `organization_id`
    - **Propriedade 16: organization_id do Invoice é igual ao organization_id do cliente**
    - **Valida: Requisitos 9.4, 9.6**
    - Usar `fc.record()` para gerar pares (invoice, cliente) e verificar consistência de `organization_id`
    - Tag: `// Feature: fiscal-nfse-module, Property 16: organization_id consistência`

- [x] 14. Checkpoint final — Garantir que todos os testes passam
  - Executar `npx vitest run src/test/fiscal/` e garantir que todos os testes passam
  - Verificar que não há erros de TypeScript nos arquivos criados/modificados
  - Perguntar ao usuário se há dúvidas ou ajustes antes de encerrar.

## Notas

- Tarefas marcadas com `*` são opcionais e podem ser puladas para um MVP mais rápido
- Cada tarefa referencia requisitos específicos para rastreabilidade
- Os checkpoints garantem validação incremental antes de avançar para integrações mais complexas
- Testes PBT usam **fast-check** com mínimo de 100 iterações por propriedade
- A emissão automática é best-effort: falhas não revertem operações de pagamento
- O `C8TenantDetail` deve ter comportamento idêntico ao `ContractDetailPage` para NFS-e
- Arquivos de teste devem ser criados em `src/test/fiscal/` seguindo o padrão do projeto
