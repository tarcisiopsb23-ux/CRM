# Plano de Regularização do Projeto CRM Maestr.IA

## Objetivo
Garantir consistência das migrations, documentação e integração completa dos módulos.

---

## Etapas do Plano

### 1. Migrations Supabase
- [x] **00001**: Remover `ADD TABLE tasks` do realtime (tabela criada na 00011)
- [x] **00002**: Remover índices/policies/RLS para tabelas criadas em 00006 e 00011
- [x] **00012**: Criar `report_templates`, `report_snapshots`; adicionar tasks/events ao realtime; policies teams/team_members

### 2. Tipos e Frontend
- [ ] Regenerar tipos Supabase (`supabase gen types`)
- [ ] Remover `(supabase as any)` nos hooks
- [x] Integrar página **Equipe** com Supabase (profiles, teams)
- [x] Implementar página **Agenda** (events)

### 3. Documentação
- [x] Atualizar README com setup, variáveis de ambiente e comandos
- [x] Documentar ordem das migrations

---

## Ordem de Execução

1. Ajustar migrations 00001, 00002
2. Criar migration 00012 (report_templates, report_snapshots, realtime)
3. Atualizar README
4. Regenerar tipos
5. Integrar Equipe e Agenda
