# Tasks de Implementação — Reformulação da Aba "Acessos"

## Visão Geral

Tasks ordenadas por dependência: do mais fundamental (dados/tipos) ao mais específico (composição de UI e integração).

---

- [ ] 1. Expandir MODULE_VIEWS em usePermissions.ts para todos os 19 módulos

  **Descrição:** Substituir o `MODULE_VIEWS` parcial (que hoje cobre apenas 3 módulos) pelo mapeamento completo de todos os 19 módulos definidos em `MODULES`, conforme especificado no design técnico. Adicionar o `export` da constante para que outros arquivos possam importá-la diretamente.

  **Arquivos a modificar:**
  - `src/hooks/usePermissions.ts`

  **Sub-tasks:**
  - [ ] 1.1 Localizar a definição atual de `MODULE_VIEWS` em `usePermissions.ts`
  - [ ] 1.2 Substituir pelo objeto completo com os 19 módulos: `dashboard`, `kanban`, `crm`, `sales_analytics`, `clients`, `financial`, `projects`, `agenda`, `goals`, `whatsapp`, `meetings`, `team`, `settings`, `reports`, `campaigns`, `audit`, `timeclock`, `performance`, `integrations`
  - [ ] 1.3 Adicionar `export` à constante `MODULE_VIEWS` (atualmente pode ser local ao arquivo)
  - [ ] 1.4 Verificar que o tipo `Record<PermissionModule, Array<{ id: string; label: string }>>` está correto e sem erros de TypeScript

  **Critérios de conclusão:**
  - `MODULE_VIEWS` exportado cobre exatamente os 19 módulos listados no Requisito 1
  - Cada módulo possui ao menos um sub-escopo com `id` e `label` em português
  - Nenhum erro de TypeScript no arquivo
  - `CLIENT_ONLY_MODULES` (`performance`, `integrations`) estão presentes no mapa mas sem queries de scope disparadas (comportamento já existente)

---

- [ ] 2. Criar InheritanceBadge.tsx

  **Descrição:** Criar o componente puramente visual que indica se uma permissão é herdada do cargo ou é um override individual do colaborador. Utiliza `Badge` e `Tooltip` do shadcn/ui. Não contém lógica de negócio.

  **Arquivos a criar:**
  - `src/components/settings/InheritanceBadge.tsx`

  **Sub-tasks:**
  - [ ] 2.1 Criar o arquivo com a interface `InheritanceBadgeProps { hasOverride: boolean }`
  - [ ] 2.2 Implementar o estado "Override": `Badge` com `bg-amber-100 text-amber-800 border-amber-300` e texto "Override"
  - [ ] 2.3 Implementar o estado "Herdado": ícone `ArrowDownFromLine` (12px) + texto "Herdado" com `text-muted-foreground`
  - [ ] 2.4 Envolver ambos os estados em `Tooltip` / `TooltipTrigger` / `TooltipContent` do shadcn/ui
  - [ ] 2.5 Texto do tooltip: "Override" → "Permissão definida individualmente para este colaborador. Sobrescreve o cargo." / "Herdado" → "Permissão herdada do cargo. Nenhum override individual ativo."
  - [ ] 2.6 Verificar ausência de erros de TypeScript e lint

  **Critérios de conclusão:**
  - Componente renderiza badge âmbar quando `hasOverride === true`
  - Componente renderiza ícone + texto suave quando `hasOverride === false`
  - Tooltip presente em ambos os estados com texto correto
  - Componente não importa hooks, não faz queries, não tem estado interno

---

- [ ] 3. Criar ScopeRow.tsx

  **Descrição:** Criar o componente que representa uma linha de sub-escopo dentro de um módulo expandido. Exibe o label do sub-escopo, os 4 checkboxes CRUD com valor efetivo (override ou herdado), o `InheritanceBadge` (quando em modo colaborador) e os botões "Marcar tudo" e "Resetar".

  **Arquivos a criar:**
  - `src/components/settings/ScopeRow.tsx`

  **Dependências:** Task 2 (InheritanceBadge)

  **Sub-tasks:**
  - [ ] 3.1 Definir a interface `ScopeRowProps` conforme o design:
    - `scopeId: string`
    - `label: string`
    - `flags: PermFlags | undefined` (override individual; `undefined` = herdado)
    - `inheritedFlags: PermFlags` (flags do módulo pai como fallback)
    - `hasOverride: boolean`
    - `onToggleFlag: (field: keyof PermFlags, value: boolean) => void`
    - `onMarkAll: () => void`
    - `onReset: () => void`
    - `disabled: boolean`
    - `isOwner: boolean`
    - `showInheritance: boolean` (true quando `accessScope === "user"`)
  - [ ] 3.2 Calcular o valor efetivo de cada flag: usar `flags[field]` se `hasOverride`, senão `inheritedFlags[field]`
  - [ ] 3.3 Renderizar os 4 checkboxes (Ver, Criar, Editar, Excluir) com os valores efetivos
  - [ ] 3.4 Aplicar estilo diferenciado quando herdado: `opacity-60` nos checkboxes, `text-muted-foreground` no label
  - [ ] 3.5 Renderizar `<InheritanceBadge hasOverride={hasOverride} />` quando `showInheritance === true`
  - [ ] 3.6 Renderizar botões "Marcar tudo" e "Resetar" com `disabled={disabled || isOwner}`
  - [ ] 3.7 Garantir que `can_create`, `can_edit`, `can_delete` são desmarcados automaticamente quando `can_view` é desmarcado (normalização)
  - [ ] 3.8 Verificar ausência de erros de TypeScript e lint

  **Critérios de conclusão:**
  - Checkboxes exibem valor efetivo correto (override se existir, senão herdado)
  - `InheritanceBadge` aparece apenas quando `showInheritance === true`
  - Normalização CRUD aplicada ao desmarcar `can_view`
  - Botões "Marcar tudo" e "Resetar" funcionam via callbacks recebidos por props
  - Estilo visual diferenciado aplicado corretamente no estado herdado

---

- [ ] 4. Criar ModuleRow.tsx

  **Descrição:** Criar o componente que representa a linha de cabeçalho de um módulo. Contém o botão de toggle (chevron), os 4 checkboxes CRUD do módulo inteiro, os botões "Marcar tudo" e "Resetar", e — quando expandido — a lista de `<ScopeRow>` para cada sub-escopo.

  **Arquivos a criar:**
  - `src/components/settings/ModuleRow.tsx`

  **Dependências:** Task 3 (ScopeRow)

  **Sub-tasks:**
  - [ ] 4.1 Definir a interface `ModuleRowProps` conforme o design:
    - `module: { id: PermissionModule; label: string }`
    - `flags: PermFlags | undefined`
    - `isExpanded: boolean`
    - `onToggleExpand: () => void`
    - `onToggleFlag: (field: keyof PermFlags, value: boolean) => void`
    - `onMarkAll: () => void`
    - `onReset: () => void`
    - `disabled: boolean`
    - `isOwner: boolean`
    - `scopes: Array<{ id: string; label: string }>`
    - `getScopeFlags: (scopeId: string) => PermFlags | undefined`
    - `hasOverride: (scopeId: string) => boolean`
    - `getInheritedFlags: (scopeId: string) => PermFlags`
    - `onToggleScopeFlag: (scopeId: string, field: keyof PermFlags, value: boolean) => void`
    - `onMarkAllScope: (scopeId: string) => void`
    - `onResetScope: (scopeId: string) => void`
    - `isClientOnly: boolean`
    - `accessScope: "cargo" | "user"`
  - [ ] 4.2 Renderizar linha de cabeçalho com ícone chevron (rotaciona quando expandido) e label do módulo
  - [ ] 4.3 Adicionar `aria-expanded` e `aria-label` no botão de toggle para acessibilidade
  - [ ] 4.4 Renderizar os 4 checkboxes CRUD do módulo inteiro
  - [ ] 4.5 Renderizar botões "Marcar tudo" e "Resetar" no cabeçalho
  - [ ] 4.6 Quando `isExpanded === true` e `scopes.length > 0`, renderizar lista de `<ScopeRow>` para cada sub-escopo
  - [ ] 4.7 Quando `isExpanded === true` e `scopes.length === 0`, exibir mensagem "Sem sub-escopos configuráveis para este módulo"
  - [ ] 4.8 Quando `isClientOnly === true`, desabilitar checkboxes de módulo e exibir aviso "Controlado apenas no frontend"
  - [ ] 4.9 Verificar ausência de erros de TypeScript e lint

  **Critérios de conclusão:**
  - Toggle de expand/collapse funciona via `onToggleExpand` callback
  - `aria-expanded` e `aria-label` presentes no botão de toggle
  - Sub-escopos renderizados apenas quando expandido
  - Mensagem de "sem sub-escopos" exibida corretamente
  - Módulos `CLIENT_ONLY` exibem aviso e têm checkboxes desabilitados
  - Todos os eventos delegados via callbacks (sem lógica de negócio interna)

---

- [ ] 5. Criar AccessesTab.tsx (componente principal)

  **Descrição:** Criar o componente principal da aba "Acessos", extraindo toda a lógica que hoje está embutida no bloco `<TabsContent value="acessos">` de `PermissionsSection.tsx`. Gerencia estado de seleção (cargo/colaborador), busca, módulos expandidos e orquestra os hooks de data fetching.

  **Arquivos a criar:**
  - `src/components/settings/AccessesTab.tsx`

  **Dependências:** Tasks 1, 4 (MODULE_VIEWS exportado, ModuleRow)

  **Sub-tasks:**
  - [ ] 5.1 Definir a interface `AccessesTabProps`:
    - `organizationId: string | undefined`
    - `isAdmin: boolean`
    - `isOwner: boolean`
  - [ ] 5.2 Implementar estado local:
    - `accessScope: "cargo" | "user"` (padrão: `"cargo"`)
    - `selectedCargo: string | null`
    - `selectedUserId: string | null`
    - `expandedModules: Set<PermissionModule>` (padrão: `new Set()` — todos colapsados)
    - `searchQuery: string`
  - [ ] 5.3 Instanciar hooks de data fetching: `useJobTitlePermissions`, `useJobTitlePermissionScopes`, `useUserPermissions`, `useUserPermissionScopes`
  - [ ] 5.4 Derivar `filteredModules` via `useMemo`: filtrar `MODULES` pelo `searchQuery` (match em label do módulo ou label de sub-escopo)
  - [ ] 5.5 Derivar `searchExpandedModules` via `useMemo`: conjunto de módulos que devem ser expandidos automaticamente por causa da busca
  - [ ] 5.6 Implementar `isExpanded(moduleId)`: retorna `true` se expandido manualmente OU expandido pela busca
  - [ ] 5.7 Implementar `toggleModule`, `expandAll`, `collapseAll`
  - [ ] 5.8 Derivar mapas `permByModule`, `jobPermByModule`, `jobScopeByKey`, `userScopeByKey` a partir dos dados dos hooks
  - [ ] 5.9 Implementar `hasModuleOverride` e `hasScopeOverride` para detecção de overrides individuais
  - [ ] 5.10 Implementar `effectiveFlag` para calcular o valor efetivo de cada flag por módulo/escopo
  - [ ] 5.11 Implementar handlers de toggle de flag com normalização CRUD e chamada aos hooks de mutação
  - [ ] 5.12 Implementar handlers de "Marcar tudo" e "Resetar" para módulo e sub-escopo
  - [ ] 5.13 Implementar `handleToggleScopeWithGuard` que verifica `CLIENT_ONLY_MODULES` antes de persistir
  - [ ] 5.14 Mover `clearUserOverridesForCargo` de `PermissionsSection.tsx` para este componente
  - [ ] 5.15 Renderizar controles de seleção (escopo cargo/colaborador, selects de cargo e colaborador)
  - [ ] 5.16 Renderizar campo de busca e botões "Expandir todos" / "Colapsar todos"
  - [ ] 5.17 Renderizar spinner enquanto dados carregam
  - [ ] 5.18 Renderizar mensagem vazia quando `filteredModules.length === 0`
  - [ ] 5.19 Renderizar lista de `<ModuleRow>` passando todos os dados e callbacks necessários
  - [ ] 5.20 Verificar ausência de erros de TypeScript e lint

  **Critérios de conclusão:**
  - Todos os módulos colapsados por padrão ao montar o componente
  - Busca filtra módulos e expande automaticamente módulos com sub-escopos correspondentes
  - Spinner exibido durante carregamento
  - Mensagem de lista vazia exibida quando busca não retorna resultados
  - `CLIENT_ONLY_MODULES` não disparam queries de scope
  - Overrides individuais detectados e passados corretamente para `ModuleRow`
  - `clearUserOverridesForCargo` executado ao alterar permissão de cargo

---

- [ ] 6. Substituir TabsContent "acessos" em PermissionsSection.tsx por `<AccessesTab />`

  **Descrição:** Remover o bloco `<TabsContent value="acessos">` existente em `PermissionsSection.tsx` e substituí-lo pela importação e uso do novo `<AccessesTab />`. Limpar código morto que foi movido para `AccessesTab.tsx`.

  **Arquivos a modificar:**
  - `src/components/settings/PermissionsSection.tsx`

  **Dependências:** Task 5 (AccessesTab)

  **Sub-tasks:**
  - [ ] 6.1 Importar `AccessesTab` de `./AccessesTab`
  - [ ] 6.2 Localizar o bloco `<TabsContent value="acessos">` em `PermissionsSection.tsx`
  - [ ] 6.3 Substituir o conteúdo interno do bloco por `<AccessesTab organizationId={organizationId} isAdmin={isAdmin} isOwner={isOwner} />`
  - [ ] 6.4 Remover imports, estados locais, hooks e funções que foram movidos para `AccessesTab.tsx` (ex: `clearUserOverridesForCargo`, estados de busca, estados de expand, derivações de `filteredModules`)
  - [ ] 6.5 Verificar que `PermissionsSection.tsx` não possui código duplicado ou imports não utilizados
  - [ ] 6.6 Verificar ausência de erros de TypeScript e lint em ambos os arquivos

  **Critérios de conclusão:**
  - `PermissionsSection.tsx` delega toda a renderização da aba "Acessos" para `<AccessesTab />`
  - Nenhum código duplicado entre `PermissionsSection.tsx` e `AccessesTab.tsx`
  - A aba "Cargos" e demais tabs de `PermissionsSection.tsx` continuam funcionando sem alteração
  - Nenhum erro de TypeScript ou lint nos arquivos modificados

---

- [ ] 7. Exportar MODULE_VIEWS de usePermissions.ts para uso externo

  **Descrição:** Garantir que `MODULE_VIEWS` está corretamente exportado de `usePermissions.ts` e que todos os novos componentes (`AccessesTab`, `ModuleRow`, `ScopeRow`) importam a constante a partir dessa fonte única de verdade, sem duplicação.

  **Arquivos a modificar:**
  - `src/hooks/usePermissions.ts`

  **Arquivos a verificar:**
  - `src/components/settings/AccessesTab.tsx`
  - `src/components/settings/ModuleRow.tsx`
  - `src/components/settings/ScopeRow.tsx`

  **Dependências:** Tasks 1, 5, 6 (todas as tasks anteriores concluídas)

  **Sub-tasks:**
  - [ ] 7.1 Confirmar que `MODULE_VIEWS` está declarado com `export const` em `usePermissions.ts`
  - [ ] 7.2 Confirmar que `AccessesTab.tsx` importa `MODULE_VIEWS` de `../../hooks/usePermissions` (sem redefinição local)
  - [ ] 7.3 Confirmar que nenhum outro arquivo do projeto redefine `MODULE_VIEWS` localmente (busca global)
  - [ ] 7.4 Confirmar que `MODULES`, `CLIENT_ONLY_MODULES`, `PermissionModule`, `PermFlags` também estão exportados e acessíveis pelos novos componentes
  - [ ] 7.5 Executar build ou verificação de tipos (`tsc --noEmit`) para garantir que não há erros de importação circular ou tipos ausentes

  **Critérios de conclusão:**
  - `MODULE_VIEWS` tem exatamente uma definição no codebase (em `usePermissions.ts`)
  - Todos os componentes que consomem `MODULE_VIEWS` importam da mesma fonte
  - Nenhum erro de importação circular
  - Build sem erros de TypeScript relacionados às novas exportações
