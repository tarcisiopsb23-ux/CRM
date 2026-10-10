# Plano de Implementação: Permission System Migration

## Visão Geral

Migração cirúrgica de 12 pontos de verificação hardcoded (`profile.role === "admin"`, `requireRole`, `isAdmin`, `isExempt`) para o sistema de permissões dinâmicas já existente (`useModulePermission`, `usePermissionForScope`). A infraestrutura está completa — o trabalho é substituição sistemática, arquivo por arquivo, sem quebrar o build a cada passo.

## Tasks

- [x] 1. Instalar fast-check e criar arquivo de testes de propriedade base
  - Instalar `fast-check` como devDependency: `npm install --save-dev fast-check`
  - Criar `src/hooks/__tests__/usePermissions.property.test.ts` com setup do vitest + fast-check
  - Importar `baselineFor`, `applyHardOverrides`, `MODULES` de `usePermissions.ts`
  - _Requirements: 8.3_

  - [x] 1.1 Escrever Property 1: owner e admin têm acesso total irrestrito
    - **Property 1: Owner e Admin têm acesso total irrestrito**
    - Para qualquer módulo e scope, `baselineFor("owner", module, scope)` e `baselineFor("admin", module, scope)` retornam `{ canView: true, canCreate: true, canEdit: true, canDelete: true }`
    - **Validates: Requirements 2.4, 3.2, 6.3, 8.1**

  - [x] 1.2 Escrever Property 6: fallback para baselineFor quando não há permissão explícita
    - **Property 6: Fallback para Baseline_Function quando não há permissão explícita**
    - Para qualquer role não-admin/owner e qualquer módulo, `resolvePermission(role, module, [], [])` deve ser igual a `baselineFor(role, module)`
    - Implementar função auxiliar `resolvePermission` pura (sem hooks) para ser testável
    - **Validates: Requirements 8.2, 8.5**

- [x] 2. Migrar App.tsx — remover requireRole das rotas /team, /team/edit/:id, /settings e /audit
  - Em `src/App.tsx`, remover `requireRole="admin"` das rotas `/team` e `/team/edit/:id`
  - Remover `requireRole="admin"` da rota `/settings`
  - Remover `requireRole="manager"` da rota `/audit`
  - O `ModuleGuard` já envolve todas essas rotas via `getModuleForRoute` — nenhum componente adicional necessário
  - Verificar que `npm run build` passa sem erros após a mudança
  - _Requirements: 2.1, 2.2, 2.3_

  - [x] 2.1 Escrever Property 2: route guard usa permissão dinâmica
    - **Property 2: Route guard usa permissão dinâmica**
    - Para qualquer rota mapeada em `ROUTE_TO_MODULE`, usuário com `canView: false` recebe tela de acesso negado; com `canView: true` vê o conteúdo
    - Testar com mock do `useModulePermission` retornando `canView: false` e verificar que `ModuleGuard` renderiza a tela de acesso negado
    - **Validates: Requirements 2.1, 2.2, 2.3**

- [x] 3. Migrar TimeclockGuard.tsx — substituir verificação hardcoded por usePermissionForScope
  - Em `src/components/auth/TimeclockGuard.tsx`, substituir `const isExempt = profile?.role === "owner" || profile?.role === "admin"` por `const { canView: isExempt, isLoading: permLoading } = usePermissionForScope("team", "timeclock")`
  - Adicionar `permLoading` ao guard do `useEffect`: `if (isLoading || permLoading) return;`
  - Manter a lógica de redirecionamento existente inalterada
  - Verificar build após a mudança
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 3.1 Escrever Property 3: isenção do TimeclockGuard via permissão dinâmica
    - **Property 3: Isenção do TimeclockGuard via permissão dinâmica**
    - Para qualquer usuário com `usePermissionForScope("team", "timeclock").canView === true`, o `TimeclockGuard` não deve chamar `navigate("/timeclock/entry")`
    - Testar com mock do hook retornando `canView: true` e verificar que `navigate` não é chamado
    - **Validates: Requirements 3.1, 3.3**

- [x] 4. Migrar TimeclockEntryPage.tsx — substituir isExempt hardcoded
  - Em `src/pages/TimeclockEntryPage.tsx`, substituir `const isExempt = profile?.role === "owner" || profile?.role === "admin"` por `const { canView: isExempt } = usePermissionForScope("team", "timeclock")`
  - Adicionar import de `usePermissionForScope` de `@/hooks/usePermissions`
  - Verificar build após a mudança
  - _Requirements: 3.1, 4.5_

- [x] 5. Checkpoint — verificar build e lint após migrações de guards
  - Garantir que `npm run lint` e `npm run build` passam sem erros
  - Garantir que os testes de propriedade escritos até aqui passam: `npx vitest run src/hooks/__tests__/usePermissions.property.test.ts`
  - _Requirements: 8.3_

- [x] 6. Migrar AppSidebar.tsx — substituir isAdmin por hooks dinâmicos
  - Em `src/components/layout/AppSidebar.tsx`, remover `const isAdmin = profile?.role === "admin" || profile?.role === "owner"`
  - No filtro `visibleItems`, substituir `if (item.module === "settings") return isAdmin` por `return canViewSettings`
  - Substituir `if (item.url === "/team") return isAdmin` por `return canViewTeam`
  - Os hooks `canViewSettings` e `canViewTeam` já existem no componente — apenas remover a variável `isAdmin` e atualizar as condições
  - Verificar build após a mudança
  - _Requirements: 4.4_

- [x] 7. Migrar TeamPage.tsx — remover isAdmin da condição da aba Folha de Pagamento
  - Em `src/pages/TeamPage.tsx`, localizar a condição `payrollPermission.canView && (isAdmin || profile?.role === "manager")`
  - Substituir por `payrollPermission.canView` — o hook já encapsula a lógica de role via `baselineFor`
  - Fazer o mesmo para o `TabsContent` da aba payroll: remover `(isAdmin || profile?.role === "manager") &&`
  - Manter `isAdmin` apenas para o item de menu "Cadastrar diretamente (sem token)" no dropdown — esse é um caso de ação administrativa legítima que pode permanecer ou ser migrado para `employeesPermission.canCreate`
  - Substituir `isAdmin` no dropdown por `employeesPermission.canCreate` para consistência
  - Verificar build após a mudança
  - _Requirements: 4.1_

- [x] 8. Migrar SettingsPage.tsx — substituir isOwner por usePermissionForScope
  - Em `src/pages/SettingsPage.tsx`, substituir `const isOwner = profile?.role === "owner"` por `const { canView: canViewBranding } = usePermissionForScope("settings", "general")`
  - Adicionar import de `usePermissionForScope` de `@/hooks/usePermissions`
  - Substituir `{isOwner && (` pela condição `{canViewBranding && (` na seção de Identidade Visual
  - Verificar build após a mudança
  - _Requirements: 4.6_

- [x] 9. Migrar MyProfilePage.tsx — substituir isExempt hardcoded
  - Em `src/pages/MyProfilePage.tsx`, substituir `const isExempt = profile?.role === "owner" || profile?.role === "admin"` por `const { canView: isExempt } = usePermissionForScope("team", "timeclock")`
  - Adicionar import de `usePermissionForScope` de `@/hooks/usePermissions`
  - Verificar build após a mudança
  - _Requirements: 4.5_

- [x] 10. Checkpoint — verificar build e lint após migrações de UI condicional
  - Garantir que `npm run lint` e `npm run build` passam sem erros
  - _Requirements: 8.3_

- [x] 11. Migrar ReportsPage.tsx — substituir isAdmin por hooks dinâmicos e proteger data-fetch gates
  - Em `src/pages/ReportsPage.tsx`, substituir `const isAdmin = me?.role === "owner" || me?.role === "admin"` por:
    ```ts
    const { canView: canViewReports, isAdminOrOwner } = usePermissionForScope("financial", "reports");
    const { canView: canEditTimeclock } = usePermissionForScope("team", "timeclock_edit");
    ```
  - Adicionar import de `usePermissionForScope` de `@/hooks/usePermissions`
  - Em todas as queries que usam `if (!isAdmin && me?.id) q = q.eq("user_id", me.id)`, substituir `isAdmin` por `isAdminOrOwner`
  - Nas queries financeiras (`repPDaily`, `repPWeekly`, `repPMonthly`, etc.), adicionar `enabled: !!orgId && !!me?.id && canViewReports && reportTemplate === "ponto_eletronico"` (ou o template correspondente)
  - Verificar build após a mudança
  - _Requirements: 4.3, 5.1, 5.3, 5.4_

  - [x] 11.1 Escrever Property 5: data-fetch gate desabilita queries quando canView é false
    - **Property 5: Data-fetch gate desabilita queries quando canView é false**
    - Para qualquer valor de `canView`, a função `resolveQueryEnabled(canView, isLoading)` deve retornar `false` quando `canView === false` ou `isLoading === true`
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

- [x] 12. Migrar TimeClockControl.tsx — substituir isAdmin por usePermissionForScope
  - Em `src/components/team/TimeClockControl.tsx`, substituir `const isAdmin = me?.role === "owner" || me?.role === "admin"` por:
    ```ts
    const { canView: canEditTimeclock, isAdminOrOwner: isAdmin } = usePermissionForScope("team", "timeclock_edit");
    ```
  - Adicionar import de `usePermissionForScope` de `@/hooks/usePermissions`
  - Todas as referências a `isAdmin` no componente continuam funcionando via `isAdminOrOwner` renomeado
  - Verificar build após a mudança
  - _Requirements: 4.1, 5.2_

- [x] 13. Migrar TeamProfilesList.tsx — substituir isAdmin por usePermissionForScope
  - Em `src/components/team/TeamProfilesList.tsx`, substituir `const isAdmin = me?.role === "owner" || me?.role === "admin"` por:
    ```ts
    const { canView: canEditTimeclock, isAdminOrOwner: isAdmin } = usePermissionForScope("team", "timeclock_edit");
    ```
  - Adicionar import de `usePermissionForScope` de `@/hooks/usePermissions` (já importado — apenas adicionar o hook)
  - Todas as referências a `isAdmin` no componente continuam funcionando via `isAdminOrOwner` renomeado
  - Verificar build após a mudança
  - _Requirements: 4.1, 5.2_

- [x] 14. Checkpoint final — verificar ausência de verificações hardcoded residuais
  - Executar busca por `profile?.role === "admin"`, `profile?.role === "owner"`, `profile?.role === "manager"` e `requireRole=` em `src/pages/**` e `src/components/**`
  - Confirmar que as únicas ocorrências restantes estão em `ProtectedRoute.tsx` e `usePermissions.ts`
  - Garantir que `npm run lint` e `npm run build` passam sem erros
  - Rodar todos os testes de propriedade: `npx vitest run src/hooks/__tests__/`
  - _Requirements: 6.1, 6.2, 8.3_

  - [x] 14.1 Escrever Property 4: UI gate corresponde exatamente ao valor de canView
    - **Property 4: UI gate corresponde exatamente ao valor de canView**
    - Para qualquer componente migrado, um elemento controlado por `canView` deve estar visível se e somente se `canView === true`
    - Testar com mock do hook retornando `canView: false` e verificar que o elemento não é renderizado
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6**

## Notas

- Tasks marcadas com `*` são opcionais e podem ser puladas para MVP mais rápido
- Cada task deve passar em `npm run lint` e `npm run build` antes de avançar para a próxima
- A `baselineFor` e `applyHardOverrides` em `usePermissions.ts` **não devem ser alteradas** — são a fonte de verdade do fallback
- O `ProtectedRoute` mantém `requireRole` apenas para compatibilidade de API, mas as rotas migradas não o usam mais
- Checkpoints garantem que o projeto nunca fica em estado quebrado entre etapas
