# Design Técnico — Reformulação da Aba "Acessos"

## Visão Geral da Arquitetura

### Objetivo

Extrair a lógica da aba "Acessos" de `PermissionsSection.tsx` para componentes dedicados, expandir `MODULE_VIEWS` para cobrir todos os 19 módulos, e adicionar collapse/expand por módulo, busca/filtro e indicadores visuais de herança vs. override.

### Componentes a criar

| Arquivo | Responsabilidade |
|---|---|
| `src/components/settings/AccessesTab.tsx` | Componente principal da aba. Gerencia estado de seleção (cargo/colaborador), busca, módulos expandidos e orquestra os hooks. |
| `src/components/settings/ModuleRow.tsx` | Linha de cabeçalho de módulo com collapse/expand, checkboxes CRUD do módulo inteiro e botões "Marcar tudo" / "Resetar". |
| `src/components/settings/ScopeRow.tsx` | Linha de sub-escopo com checkboxes CRUD independentes, badge de override e botões de ação. |
| `src/components/settings/InheritanceBadge.tsx` | Badge/ícone visual que indica se a permissão é herdada do cargo ou é um override individual. |

### Componentes a modificar

| Arquivo | Mudança |
|---|---|
| `src/components/settings/PermissionsSection.tsx` | Remover o bloco `<TabsContent value="acessos">` e substituir por `<AccessesTab />`. Mover `MODULE_VIEWS` expandido para `src/hooks/usePermissions.ts` ou arquivo dedicado. |
| `src/hooks/usePermissions.ts` | Adicionar export de `MODULE_VIEWS` completo (todos os 19 módulos). |

### Separação de responsabilidades

- `AccessesTab` — estado de UI (seleção, busca, módulos expandidos), composição dos hooks, passagem de props para `ModuleRow`.
- `ModuleRow` — renderização de uma linha de módulo, delegação de eventos para callbacks recebidos via props.
- `ScopeRow` — renderização de uma linha de sub-escopo, lógica de exibição de herança vs. override.
- `InheritanceBadge` — componente puramente visual, sem lógica de negócio.
- `usePermissions.ts` — fonte única de verdade para `MODULE_VIEWS`, tipos e hooks de data fetching/mutation.

---

## Expansão do MODULE_VIEWS

O objeto `MODULE_VIEWS` passa a ser exportado de `src/hooks/usePermissions.ts` (ou de um arquivo `src/lib/moduleViews.ts` importado por ele) e cobre todos os 19 módulos:

```typescript
export const MODULE_VIEWS: Record<PermissionModule, Array<{ id: string; label: string }>> = {
  dashboard: [
    { id: "overview",     label: "Visão Geral" },
    { id: "widgets",      label: "Widgets" },
    { id: "public_link",  label: "Link Público" },
  ],
  kanban: [
    { id: "pipeline",     label: "Pipeline" },
    { id: "lead_details", label: "Detalhes do Lead" },
    { id: "lead_create",  label: "Criar Lead" },
  ],
  crm: [
    { id: "leads",           label: "Leads" },
    { id: "contacts",        label: "Contatos" },
    { id: "pipeline_stages", label: "Etapas do Pipeline" },
  ],
  sales_analytics: [
    { id: "sales_dashboard", label: "Dashboard de Vendas" },
    { id: "funnel",          label: "Funil" },
    { id: "conversion",      label: "Conversão" },
  ],
  clients: [
    { id: "client_list",    label: "Lista de Clientes" },
    { id: "client_details", label: "Detalhes do Cliente" },
    { id: "contracts",      label: "Contratos" },
  ],
  financial: [
    { id: "dashboard",   label: "Dashboard" },
    { id: "cashflow",    label: "Fluxo de Caixa" },
    { id: "suppliers",   label: "Fornecedores" },
    { id: "expenses",    label: "Despesas" },
    { id: "receivables", label: "Contas a Receber" },
    { id: "payables",    label: "Contas a Pagar" },
    { id: "payroll",     label: "Folha de Pagamento" },
    { id: "contracts",   label: "Contratos" },
    { id: "dre",         label: "DRE" },
    { id: "reports",     label: "Relatórios" },
  ],
  projects: [
    { id: "project_list",    label: "Lista de Projetos" },
    { id: "project_details", label: "Detalhes do Projeto" },
    { id: "tasks",           label: "Tarefas" },
  ],
  agenda: [
    { id: "events",        label: "Eventos" },
    { id: "calendar_view", label: "Visualização de Calendário" },
  ],
  goals: [
    { id: "goals_list",  label: "Lista de Metas" },
    { id: "assignments", label: "Atribuições" },
    { id: "tracking",    label: "Acompanhamento" },
  ],
  whatsapp: [
    { id: "conversations", label: "Conversas" },
    { id: "contacts",      label: "Contatos" },
    { id: "broadcasts",    label: "Transmissões" },
  ],
  meetings: [
    { id: "meeting_list", label: "Lista de Reuniões" },
    { id: "ai_summaries", label: "Resumos por IA" },
    { id: "recordings",   label: "Gravações" },
  ],
  team: [
    { id: "employees",             label: "Colaboradores" },
    { id: "teams",                 label: "Equipes" },
    { id: "payroll",               label: "Folha de Pagamento" },
    { id: "timeclock",             label: "Controle de Ponto" },
    { id: "timeclock_edit",        label: "Editar/Excluir Registros de Ponto" },
    { id: "evaluations_360",       label: "Avaliações 360°" },
    { id: "technical_evaluations", label: "Avaliações Técnicas" },
    { id: "absences",              label: "Ausências" },
    { id: "trainings",             label: "Treinamentos" },
    { id: "documents",             label: "Documentos" },
    { id: "commissions",           label: "Comissões" },
    { id: "score",                 label: "Score" },
  ],
  settings: [
    { id: "permissions",  label: "Cargos e Permissões" },
    { id: "integrations", label: "Integrações" },
    { id: "general",      label: "Configurações Gerais" },
  ],
  reports: [
    { id: "general_reports",  label: "Relatórios Gerais" },
    { id: "campaign_reports", label: "Relatórios de Campanhas" },
  ],
  campaigns: [
    { id: "campaign_list",    label: "Lista de Campanhas" },
    { id: "campaign_reports", label: "Relatórios de Campanhas" },
  ],
  audit: [
    { id: "audit_logs", label: "Logs de Auditoria" },
  ],
  timeclock: [
    { id: "punch",         label: "Registro de Ponto" },
    { id: "history",       label: "Histórico" },
    { id: "timeclock_edit", label: "Editar Registros" },
  ],
  // CLIENT_ONLY_MODULES — sub-escopos exibidos apenas como controles de UI local
  performance: [
    { id: "hub_dashboard",      label: "Dashboard de Performance" },
    { id: "individual_metrics", label: "Métricas Individuais" },
  ],
  integrations: [
    { id: "api_keys",    label: "Chaves de API" },
    { id: "webhooks",    label: "Webhooks" },
    { id: "third_party", label: "Integrações de Terceiros" },
  ],
};
```

---

## Modelo de Estado

### Estado local em `AccessesTab`

```typescript
// Seleção de escopo e entidade
const [accessScope, setAccessScope] = useState<"cargo" | "user">("cargo");
const [selectedCargo, setSelectedCargo] = useState<string | null>(null);
const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

// Collapse/expand por módulo
const [expandedModules, setExpandedModules] = useState<Set<PermissionModule>>(new Set());

// Busca
const [searchQuery, setSearchQuery] = useState("");

// Quando há busca ativa, os módulos com match são expandidos automaticamente
// (ver derivação de filteredModules abaixo)
```

### Derivação de `filteredModules`

```typescript
const filteredModules = useMemo(() => {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return MODULES; // sem filtro

  return MODULES.filter((m) => {
    const moduleMatch = m.label.toLowerCase().includes(q);
    const scopeMatch = MODULE_VIEWS[m.id]?.some((s) =>
      s.label.toLowerCase().includes(q)
    ) ?? false;
    return moduleMatch || scopeMatch;
  });
}, [searchQuery]);

// Módulos que devem ser expandidos por causa da busca
const searchExpandedModules = useMemo(() => {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return new Set<PermissionModule>();

  return new Set<PermissionModule>(
    MODULES
      .filter((m) =>
        MODULE_VIEWS[m.id]?.some((s) => s.label.toLowerCase().includes(q))
      )
      .map((m) => m.id)
  );
}, [searchQuery]);

// Módulo está expandido se: expandido manualmente OU expandido pela busca
const isExpanded = (moduleId: PermissionModule) =>
  expandedModules.has(moduleId) || searchExpandedModules.has(moduleId);
```

### Controle de expand/collapse

```typescript
const toggleModule = (moduleId: PermissionModule) => {
  setExpandedModules((prev) => {
    const next = new Set(prev);
    if (next.has(moduleId)) next.delete(moduleId);
    else next.add(moduleId);
    return next;
  });
};

const expandAll = () =>
  setExpandedModules(new Set(MODULES.map((m) => m.id)));

const collapseAll = () =>
  setExpandedModules(new Set());
```

---

## Componentes

### `AccessesTab`

Componente principal extraído de `PermissionsSection`. Responsável por:

- Renderizar os controles de seleção (escopo, cargo/colaborador).
- Renderizar o campo de busca e os botões "Expandir todos" / "Colapsar todos".
- Instanciar os hooks de data fetching (`useJobTitlePermissions`, `useJobTitlePermissionScopes`, `useUserPermissions`, `useUserPermissionScopes`).
- Derivar `filteredModules`, `isExpanded`, `permByModule`, `jobPermByModule`, `jobScopeByKey`, `userScopeByKey`.
- Renderizar a lista de `<ModuleRow>` passando todos os dados e callbacks necessários.
- Exibir spinner enquanto dados carregam.
- Exibir mensagem vazia quando `filteredModules.length === 0`.

```typescript
interface AccessesTabProps {
  organizationId: string | undefined;
  isAdmin: boolean;
  isOwner: boolean;
}
```

### `ModuleRow`

Linha de cabeçalho de módulo. Responsável por:

- Renderizar o nome do módulo com botão de toggle (chevron).
- Renderizar os 4 checkboxes CRUD do módulo inteiro.
- Renderizar os botões "Marcar tudo" e "Resetar".
- Quando expandido, renderizar a lista de `<ScopeRow>` para cada sub-escopo.
- Exibir mensagem "Sem sub-escopos configuráveis" quando `MODULE_VIEWS[moduleId]` é vazio.
- Usar `aria-expanded` e `aria-label` para acessibilidade.

```typescript
interface ModuleRowProps {
  module: { id: PermissionModule; label: string };
  flags: PermFlags | undefined;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleFlag: (field: keyof PermFlags, value: boolean) => void;
  onMarkAll: () => void;
  onReset: () => void;
  disabled: boolean;
  isOwner: boolean;
  // sub-escopos
  scopes: Array<{ id: string; label: string }>;
  getScopeFlags: (scopeId: string) => PermFlags | undefined;
  hasOverride: (scopeId: string) => boolean;
  getInheritedFlags: (scopeId: string) => PermFlags;
  onToggleScopeFlag: (scopeId: string, field: keyof PermFlags, value: boolean) => void;
  onMarkAllScope: (scopeId: string) => void;
  onResetScope: (scopeId: string) => void;
  isClientOnly: boolean;
  accessScope: "cargo" | "user";
}
```

### `ScopeRow`

Linha de sub-escopo. Responsável por:

- Renderizar o label do sub-escopo.
- Renderizar os 4 checkboxes CRUD com valor efetivo (override se existir, senão herdado do módulo).
- Renderizar `<InheritanceBadge>` quando `accessScope === "user"`.
- Renderizar botões "Marcar tudo" e "Resetar".
- Aplicar estilo visual diferenciado (opacidade reduzida) quando a permissão é herdada.

```typescript
interface ScopeRowProps {
  scopeId: string;
  label: string;
  flags: PermFlags | undefined;          // override individual (null = herdado)
  inheritedFlags: PermFlags;             // flags do módulo pai (fallback)
  hasOverride: boolean;
  onToggleFlag: (field: keyof PermFlags, value: boolean) => void;
  onMarkAll: () => void;
  onReset: () => void;
  disabled: boolean;
  isOwner: boolean;
  showInheritance: boolean;              // true quando accessScope === "user"
}
```

### `InheritanceBadge`

Componente puramente visual. Exibe:

- Badge "Override" (cor de destaque, ex: `bg-amber-100 text-amber-800`) quando `hasOverride === true`.
- Ícone de herança + texto "Herdado" (cor suave, ex: `text-muted-foreground`) quando `hasOverride === false`.
- Tooltip explicando a diferença entre os dois estados.

```typescript
interface InheritanceBadgeProps {
  hasOverride: boolean;
}
```

Implementação com `shadcn/ui` `Badge` + `Tooltip`:

```tsx
export function InheritanceBadge({ hasOverride }: InheritanceBadgeProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {hasOverride ? (
          <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-xs">
            Override
          </Badge>
        ) : (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <ArrowDownFromLine className="h-3 w-3" />
            Herdado
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent>
        {hasOverride
          ? "Permissão definida individualmente para este colaborador. Sobrescreve o cargo."
          : "Permissão herdada do cargo. Nenhum override individual ativo."}
      </TooltipContent>
    </Tooltip>
  );
}
```

---

## Fluxo de Dados

### Resolução de permissão efetiva para exibição

A lógica de exibição na aba Acessos segue a mesma cadeia de prioridade do runtime, mas aplicada aos dados carregados pelos hooks de administração (não pelo hook `useModulePermission` do usuário logado):

```
1. Override individual (user_permissions / user_permission_scopes)
   ↓ se não existir
2. Permissão de cargo (job_title_permissions / job_title_permission_scopes)
   ↓ se não existir
3. Baseline (baselineFor(role, module, scope))
   ↓ sempre aplicado por último
4. applyHardOverrides(role, module, scope, resultado)
```

Na aba Acessos, o administrador edita diretamente as camadas 1 (modo colaborador) ou 2 (modo cargo). A camada 4 é apenas informativa — o sistema não impede o admin de salvar um valor que seria bloqueado pelo hard override, mas o runtime sempre aplicará o override correto.

### Detecção de override individual

```typescript
// Para módulo inteiro
const hasModuleOverride = (moduleId: PermissionModule): boolean =>
  permByModule.has(moduleId); // user_permissions tem registro para este módulo

// Para sub-escopo
const hasScopeOverride = (moduleId: PermissionModule, scopeId: string): boolean =>
  userScopeByKey.has(`${moduleId}::${scopeId}`); // user_permission_scopes tem registro
```

Quando `accessScope === "cargo"`, não há conceito de override — todas as permissões são do cargo, então `InheritanceBadge` não é exibido.

### Flags efetivas para exibição em `ScopeRow`

```typescript
// Valor exibido no checkbox de um sub-escopo
const effectiveFlag = (
  moduleId: PermissionModule,
  scopeId: string,
  field: keyof PermFlags
): boolean => {
  if (accessScope === "user") {
    const scopeOverride = userScopeByKey.get(`${moduleId}::${scopeId}`);
    if (scopeOverride) return scopeOverride[field]; // override individual de escopo
    const moduleOverride = permByModule.get(moduleId);
    if (moduleOverride) return moduleOverride[field]; // override individual de módulo
    const jobScope = jobScopeByKey.get(`${moduleId}::${scopeId}`);
    if (jobScope) return jobScope[field]; // permissão de cargo por escopo
    const jobModule = jobPermByModule.get(moduleId);
    return jobModule?.[field] ?? false; // permissão de cargo por módulo
  }
  // modo cargo
  const scopePerm = jobScopeByKey.get(`${moduleId}::${scopeId}`);
  if (scopePerm) return scopePerm[field];
  const modulePerm = jobPermByModule.get(moduleId);
  return modulePerm?.[field] ?? false;
};
```

### Tratamento de CLIENT_ONLY_MODULES

`performance` e `integrations` não existem no enum `permission_module` do banco. Para esses módulos:

- Os hooks `useJobTitlePermissionScopes` e `useUserPermissionScopes` já têm a guarda `canQueryDB = !CLIENT_ONLY_MODULES.has(module)` — nenhuma query de scope é disparada.
- Na aba Acessos, os sub-escopos de `performance` e `integrations` são exibidos normalmente na UI, mas ao tentar persistir uma alteração de scope, o handler deve verificar `CLIENT_ONLY_MODULES` e pular o upsert no banco, exibindo um toast informativo.
- As permissões de módulo inteiro (`job_title_permissions` / `user_permissions`) para esses módulos também não existem no banco (o enum não os suporta). Portanto, checkboxes de módulo para `performance` e `integrations` devem ser desabilitados ou exibir um aviso "Controlado apenas no frontend".

```typescript
const isClientOnly = CLIENT_ONLY_MODULES.has(moduleId);

const handleToggleScopeWithGuard = async (...) => {
  if (isClientOnly) {
    toast.info("Este módulo é controlado apenas no frontend e não persiste no banco.");
    return;
  }
  // ... lógica normal
};
```

---

## Estratégia de Indicadores Visuais

### Quando exibir

Os indicadores de herança são exibidos **somente quando `accessScope === "user"`** (modo Colaborador). No modo Cargo, todas as permissões são do cargo — não há herança a indicar.

### Badge "Override"

- Condição: existe registro em `user_permissions` (para módulo) ou `user_permission_scopes` (para sub-escopo) para o colaborador selecionado.
- Visual: `Badge` com `bg-amber-100 text-amber-800 border-amber-300`, texto "Override".
- Posição: ao lado do label do módulo/sub-escopo, dentro de `ModuleRow` / `ScopeRow`.

### Estilo "Herdado"

- Condição: não existe override individual; o valor exibido vem do cargo.
- Visual: checkboxes com `opacity-60`, label com `text-muted-foreground`, ícone `ArrowDownFromLine` de 12px.
- O `InheritanceBadge` exibe "Herdado" com ícone.

### Tooltip de legenda

Presente em `InheritanceBadge`. Texto:
- Override: "Permissão definida individualmente para este colaborador. Sobrescreve o cargo."
- Herdado: "Permissão herdada do cargo. Nenhum override individual ativo."

### Remoção de override

Quando o admin clica em "Resetar" em um sub-escopo no modo colaborador:
1. `userScopePerms.remove.mutateAsync({ module, scope })` é chamado.
2. O cache TanStack Query é invalidado.
3. `hasScopeOverride` retorna `false` → `InheritanceBadge` muda para "Herdado".
4. Os checkboxes passam a exibir o valor herdado do cargo.

---

## Compatibilidade e Migração

### Schema de banco

Nenhuma alteração de schema é necessária. As tabelas já existem:

- `user_permissions` — overrides individuais por módulo.
- `user_permission_scopes` — overrides individuais por módulo + scope.
- `job_title_permissions` — permissões de cargo por módulo.
- `job_title_permission_scopes` — permissões de cargo por módulo + scope.

### Migração de MODULE_VIEWS

`MODULE_VIEWS` é uma constante de frontend. A expansão de 3 para 19 módulos é uma mudança puramente de código — sem migration SQL. Os novos sub-escopos só passam a ter registros no banco quando o admin os configura explicitamente.

### Compatibilidade com código existente

- `clearUserOverridesForCargo` já existe em `PermissionsSection` e será movido para `AccessesTab` sem alteração de lógica.
- `normalizeFlags` e `getFieldValue` são utilitários puros — permanecem no arquivo ou são movidos para `src/lib/permissions.ts`.
- `baselineFor` e `applyHardOverrides` em `usePermissions.ts` não são alterados.
- `MODULES` em `usePermissions.ts` não é alterado.
- `CLIENT_ONLY_MODULES` em `usePermissions.ts` não é alterado.

### Rollout

A mudança é aditiva: `PermissionsSection` continua existindo, apenas o `<TabsContent value="acessos">` é substituído por `<AccessesTab />`. Não há breaking change para outros consumidores de `usePermissions`.
