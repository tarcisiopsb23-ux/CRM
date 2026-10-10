# Requirements Document

## Introduction

Este documento descreve os requisitos para a migração do sistema de controle de acesso do CRM SaaS.
O objetivo é substituir todas as verificações de acesso hardcoded baseadas em `user_role` (ex.: `profile?.role === "admin"`, `requireRole="admin"`, `isAdmin`, `isExempt`) por um sistema dinâmico e configurável, onde as permissões são definidas no módulo de Configurações (seção "Cargos e Permissões").

A infraestrutura de permissões dinâmicas já existe: tabelas `user_permissions`, `job_title_permissions`, `user_permission_scopes`, `job_title_permission_scopes`, hook `usePermissions.ts` e UI em `PermissionsSection.tsx`. O trabalho consiste em (1) auditar todos os pontos com verificações hardcoded, (2) mapear cada ponto ao hook/permissão dinâmica correspondente e (3) substituir sistematicamente.

---

## Glossary

- **Permission_System**: O conjunto de tabelas, hooks e componentes que implementam o controle de acesso dinâmico (usePermissions, PermissionsSection, job_title_permissions, user_permissions, etc.).
- **Hardcoded_Role_Check**: Qualquer verificação direta de `profile.role` ou `user_role` no código frontend (ex.: `profile?.role === "admin"`, `requireRole="admin"`).
- **ModuleGuard**: Componente `src/components/auth/ModuleGuard.tsx` que bloqueia acesso a rotas com base em `can_view` do módulo.
- **ProtectedRoute**: Componente `src/components/auth/ProtectedRoute.tsx` que bloqueia acesso a rotas com base em `requireRole` (role hierárquica hardcoded).
- **TimeclockGuard**: Componente `src/components/auth/TimeclockGuard.tsx` que isenta `owner/admin` do controle de ponto via verificação hardcoded.
- **Audit_Tool**: Processo ou script que varre o código-fonte e lista todos os Hardcoded_Role_Checks com localização (arquivo, linha, tipo de verificação).
- **Permission_Module**: Enum `permission_module` do banco de dados que identifica um módulo do sistema (ex.: `team`, `financial`, `settings`, `audit`, `timeclock`).
- **Scope**: Sub-opção de um módulo (ex.: `timeclock_edit`, `payroll`, `reports`) usada em `user_permission_scopes` e `job_title_permission_scopes`.
- **Baseline_Function**: Função `baselineFor()` em `usePermissions.ts` que retorna permissões padrão por role — deve ser mantida como fallback durante a migração.
- **Owner_Admin_Exemption**: Regra de negócio que garante que `owner` e `admin` sempre têm acesso total, independente de configurações de permissão.
- **Dynamic_Permission**: Permissão configurada via PermissionsSection e consultada via `useModulePermission` ou `usePermissionForScope`.

---

## Requirements

### Requirement 1: Auditoria Completa de Verificações Hardcoded

**User Story:** Como desenvolvedor responsável pela migração, eu quero um inventário completo de todos os pontos do código que verificam `user_role` de forma hardcoded, para que eu possa planejar e executar a migração sem deixar pontos cegos.

#### Acceptance Criteria

1. THE Audit_Tool SHALL identificar todas as ocorrências de `profile?.role`, `profile.role`, `requireRole`, `isAdmin`, `isExempt`, `isOwner` e `isAdminOrOwner` nos arquivos `src/**/*.tsx` e `src/**/*.ts`.
2. THE Audit_Tool SHALL classificar cada ocorrência em uma das categorias: `route-guard` (bloqueio de rota), `ui-conditional` (exibição condicional de UI), `data-fetch-gate` (controle de busca de dados) ou `action-gate` (controle de ação/mutação).
3. THE Audit_Tool SHALL produzir uma lista com: caminho do arquivo, número da linha, trecho de código, categoria e módulo/permissão dinâmica correspondente sugerida.
4. WHEN a auditoria for concluída, THE Audit_Tool SHALL confirmar que os seguintes arquivos foram inspecionados: `App.tsx`, `ProtectedRoute.tsx`, `TimeclockGuard.tsx`, `ModuleGuard.tsx`, `usePermissions.ts`, `AppSidebar.tsx`, `TeamPage.tsx`, `ClientsPage.tsx`, `ReportsPage.tsx`, `SettingsPage.tsx`, `MyProfilePage.tsx`, `TimeclockEntryPage.tsx`, `TimeClockControl.tsx`.
5. IF um arquivo contiver Hardcoded_Role_Checks não mapeados para nenhuma Dynamic_Permission existente, THEN THE Audit_Tool SHALL sinalizar esses casos como "gap de permissão" para criação de nova entrada no Permission_System.

---

### Requirement 2: Migração dos Route Guards (ProtectedRoute com requireRole)

**User Story:** Como administrador do sistema, eu quero que o acesso às rotas seja controlado pelas permissões configuradas no painel, para que eu possa ajustar quem acessa cada módulo sem precisar de deploy.

#### Acceptance Criteria

1. WHEN um usuário tenta acessar `/team` ou `/team/edit/:id`, THE Permission_System SHALL verificar `can_view` do módulo `team` via `useModulePermission("team")` em vez de `requireRole="admin"`.
2. WHEN um usuário tenta acessar `/settings`, THE Permission_System SHALL verificar `can_view` do scope `permissions` dentro do módulo `settings` via `usePermissionForScope("settings", "permissions")` em vez de `requireRole="admin"`.
3. WHEN um usuário tenta acessar `/audit`, THE Permission_System SHALL verificar `can_view` do módulo `audit` via `useModulePermission("audit")` em vez de `requireRole="manager"`.
4. THE Permission_System SHALL manter a Owner_Admin_Exemption: usuários com `role === "owner"` ou `role === "admin"` sempre terão `can_view: true` em todos os módulos, garantido pela `Baseline_Function`.
5. IF um usuário não autenticado tenta acessar qualquer rota protegida, THEN THE ProtectedRoute SHALL redirecionar para `/login`, independente das permissões configuradas.
6. WHEN a verificação de permissão de rota estiver em andamento (loading), THE Permission_System SHALL exibir um indicador de carregamento em vez de redirecionar prematuramente.

---

### Requirement 3: Migração do TimeclockGuard

**User Story:** Como gestor de RH, eu quero configurar quais cargos são isentos do controle de ponto pelo painel de permissões, para que a isenção não dependa de alteração de código.

#### Acceptance Criteria

1. WHEN o TimeclockGuard avalia se um usuário é isento do controle de ponto, THE Permission_System SHALL consultar o scope `timeclock` do módulo `team` via `usePermissionForScope("team", "timeclock")` em vez de verificar `profile?.role === "owner" || profile?.role === "admin"`.
2. THE Permission_System SHALL manter a Owner_Admin_Exemption no TimeclockGuard: `owner` e `admin` são sempre isentos como fallback de segurança, mesmo que a permissão dinâmica não esteja configurada.
3. WHEN um usuário com `can_view: true` no scope `timeclock` tenta acessar o sistema sem registrar entrada, THE TimeclockGuard SHALL permitir o acesso sem redirecionar para `/timeclock/entry`.
4. IF a consulta de permissão do TimeclockGuard ainda estiver carregando, THEN THE TimeclockGuard SHALL aguardar o resultado antes de redirecionar, evitando redirecionamentos incorretos.

---

### Requirement 4: Migração das Verificações de UI Condicional

**User Story:** Como usuário do sistema, eu quero que os elementos de interface (botões, abas, seções) sejam exibidos ou ocultados de acordo com as permissões configuradas para meu cargo, para que eu veja apenas o que tenho permissão de acessar.

#### Acceptance Criteria

1. WHEN um usuário acessa `TeamPage`, THE Permission_System SHALL exibir a aba "Folha de Pagamento" somente se `usePermissionForScope("team", "payroll").canView` retornar `true`, em vez de verificar `isAdmin || profile?.role === "manager"`.
2. WHEN um usuário acessa `ClientsPage`, THE Permission_System SHALL habilitar ações de gerenciamento de contratos somente se `useModulePermission("financial").canEdit` retornar `true`, em vez de verificar `profile?.role === "owner" || profile?.role === "admin"`.
3. WHEN um usuário acessa `ReportsPage`, THE Permission_System SHALL exibir filtros e dados de relatórios financeiros somente se `usePermissionForScope("financial", "reports").canView` retornar `true`, em vez de verificar `me?.role === "owner" || me?.role === "admin"`.
4. WHEN um usuário acessa `AppSidebar`, THE Permission_System SHALL exibir o item de menu "Configurações" somente se `useModulePermission("settings").canView` retornar `true`, em vez de verificar `profile?.role === "admin" || profile?.role === "owner"`.
5. WHEN um usuário acessa `MyProfilePage` ou `TimeclockEntryPage`, THE Permission_System SHALL ocultar o botão de registro de ponto somente se `usePermissionForScope("team", "timeclock").canView` retornar `true` (isentos não precisam registrar ponto), em vez de verificar `profile?.role === "owner" || profile?.role === "admin"`.
6. WHEN um usuário acessa `SettingsPage`, THE Permission_System SHALL exibir a aba de configurações somente se `usePermissionForScope("settings", "general").canView` retornar `true`, em vez de verificar `profile?.role === "owner"`.

---

### Requirement 5: Migração dos Data-Fetch Gates

**User Story:** Como arquiteto de segurança, eu quero que nenhuma busca de dados sensíveis seja disparada para usuários sem permissão, para que dados confidenciais não trafeguem pela rede mesmo que a UI esteja oculta.

#### Acceptance Criteria

1. WHEN `usePermissionForScope("financial", "reports").canView` retornar `false`, THE Permission_System SHALL passar `enabled: false` para todos os hooks de busca de dados financeiros em `ReportsPage` e `DashboardPage`.
2. WHEN `useModulePermission("team").canView` retornar `false`, THE Permission_System SHALL passar `enabled: false` para hooks de busca de dados de equipe em `TeamPage` e `TimeClockControl`.
3. THE Permission_System SHALL garantir que a verificação de permissão ocorra antes da execução de qualquer query, usando o padrão `enabled: canView` já adotado em `useFinancial.ts`.
4. IF `useModulePermission` retornar `isLoading: true`, THEN THE Permission_System SHALL tratar o estado como `enabled: false` até que a permissão seja resolvida, evitando fetches prematuros.

---

### Requirement 6: Padronização e Remoção de Verificações Residuais

**User Story:** Como desenvolvedor, eu quero que o código não contenha mais verificações hardcoded de `user_role` após a migração, para que futuras alterações de permissão sejam feitas exclusivamente pelo painel de configurações.

#### Acceptance Criteria

1. AFTER a migração ser concluída, THE Permission_System SHALL garantir que nenhum arquivo em `src/pages/**` e `src/components/**` contenha as expressões `profile?.role === "admin"`, `profile?.role === "owner"`, `profile?.role === "manager"` ou `requireRole=` fora dos arquivos `ProtectedRoute.tsx` e `usePermissions.ts`.
2. THE Permission_System SHALL manter as verificações de role em `ProtectedRoute.tsx` apenas para o guard de autenticação básica (usuário autenticado vs. não autenticado), removendo o uso de `requireRole` para controle de acesso a módulos.
3. THE Baseline_Function em `usePermissions.ts` SHALL ser mantida como fallback de segurança para usuários sem permissões explicitamente configuradas, garantindo que `owner` e `admin` sempre tenham acesso total.
4. WHEN um novo componente ou página for adicionado ao sistema, THE Permission_System SHALL fornecer um padrão documentado de como usar `useModulePermission` ou `usePermissionForScope` para controle de acesso, evitando reintrodução de Hardcoded_Role_Checks.

---

### Requirement 7: Compatibilidade com o Banco de Dados e RLS

**User Story:** Como DBA, eu quero que as políticas de Row Level Security (RLS) do Supabase estejam alinhadas com o sistema de permissões dinâmicas, para que o controle de acesso seja aplicado tanto no frontend quanto no banco de dados.

#### Acceptance Criteria

1. THE Permission_System SHALL garantir que as tabelas `user_permissions`, `job_title_permissions`, `user_permission_scopes` e `job_title_permission_scopes` possuam RLS habilitado e políticas que permitam leitura apenas pelo próprio usuário ou por `owner/admin` da organização.
2. WHEN um usuário sem permissão tenta acessar dados via API direta (bypass do frontend), THE Permission_System SHALL retornar erro de autorização via RLS, garantindo defesa em profundidade.
3. THE Permission_System SHALL manter as políticas RLS existentes para `supplier_expenses`, `contracts`, `payments` e `audit_logs` definidas nas migrações `00026`, `00028` e `00029`, sem regressão.
4. IF uma nova permissão dinâmica for criada para um módulo que ainda não possui RLS configurado, THEN THE Permission_System SHALL incluir uma migration SQL correspondente para aplicar as políticas de acesso no banco.

---

### Requirement 8: Não-Regressão e Testes

**User Story:** Como QA, eu quero que a migração não quebre funcionalidades existentes para nenhum nível de acesso, para que usuários com diferentes roles continuem tendo o comportamento esperado após a migração.

#### Acceptance Criteria

1. WHEN a migração for concluída, THE Permission_System SHALL garantir que usuários com `role === "owner"` tenham acesso a todos os módulos e ações, sem nenhuma restrição.
2. WHEN a migração for concluída, THE Permission_System SHALL garantir que usuários com `role === "member"` sem permissões explicitamente configuradas tenham o mesmo comportamento que tinham antes da migração (baseado na `Baseline_Function`).
3. THE Permission_System SHALL passar em todos os testes de lint (`npm run lint`) e build (`npm run build`) sem erros após cada etapa da migração.
4. WHEN um `owner` ou `admin` configura permissões para um cargo no painel de Configurações, THE Permission_System SHALL refletir as mudanças imediatamente para todos os usuários daquele cargo, sem necessidade de logout/login.
5. IF a tabela `job_title_permissions` não contiver registro para um módulo específico de um cargo, THEN THE Permission_System SHALL aplicar a `Baseline_Function` como fallback, garantindo que nenhum usuário fique sem acesso por ausência de configuração.
