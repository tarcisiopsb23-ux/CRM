
## Solução de Problemas

### Erro: column "due_date" does not exist (42703)

Se você encontrar este erro ao criar ou editar tarefas, é devido a uma automação (trigger) antiga no banco de dados chamada `trg_update_project_deadline` que tenta acessar uma coluna removida.

Para corrigir, execute o seguinte comando no **Supabase SQL Editor**:

```sql
DROP TRIGGER IF EXISTS trg_update_project_deadline ON tasks;
DROP FUNCTION IF EXISTS update_project_deadline;
```

Este comando removerá a automação problemática e permitirá que as tarefas sejam gerenciadas normalmente.
