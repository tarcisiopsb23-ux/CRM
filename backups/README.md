# Backup do Banco de Dados (Estrutura e Tabelas)

Este diretório contém backups da estrutura (schema) do banco de dados Supabase do projeto CRM.

## Scripts de Manutenção

- `schema_backup.sql`: Snapshot consolidado das tabelas principais, enums e índices baseados no estado atual do projeto (2026-03-15).
- `db_cleanup.sql`: Script para limpeza total do banco de dados (Wipe), preservando apenas o usuário administrador `tarcisiopsb23@gmail.com`.
- `reports_cleanup.sql`: Script para limpeza específica de relatórios, fluxo de caixa, analytics de vendas e auditoria.

## Como Executar a Limpeza de Relatórios, Financeiro e Auditoria

1. Acesse o [Supabase Dashboard](https://supabase.com/dashboard).
2. Vá em **SQL Editor**.
3. Abra o arquivo `reports_cleanup.sql` deste diretório.
4. Cole o conteúdo no SQL Editor.
5. Clique em **Run**.

## Como Executar a Limpeza do Banco (Wipe Total)

**AVISO: Esta operação é irreversível e apagará todos os dados de negócio (Leads, Clientes, Contratos, etc).**

1. Acesse o [Supabase Dashboard](https://supabase.com/dashboard).
2. Vá em **SQL Editor**.
3. Abra o arquivo `db_cleanup.sql` deste diretório.
4. Cole o conteúdo no SQL Editor.
5. Clique em **Run**.

## Como Realizar um Backup Completo (Dados + Estrutura)

Para garantir a segurança total dos seus dados, recomendamos as seguintes opções:

### 1. Via Supabase CLI (Recomendado)
Se você tem o Supabase CLI instalado, execute o comando abaixo no seu terminal local:

```bash
supabase db dump --project-ref [SEU_ID_DO_PROJETO] > backup_completo_$(date +%Y%m%d).sql
```
*Este comando gera um arquivo SQL contendo tanto a estrutura quanto os dados atuais.*

### 2. Via Painel do Supabase (Dashboard)
1. Acesse [Supabase Dashboard](https://supabase.com/dashboard).
2. Vá em **Database** -> **Backups**.
3. O Supabase realiza backups diários automáticos. Você pode baixar um backup recente diretamente por lá.

### 3. Backup de Dados Específicos (CSV)
Para exportar apenas os dados de uma tabela (ex: Leads ou Clientes):
1. Vá em **Table Editor**.
2. Selecione a tabela desejada.
3. Clique em **Export** -> **Export to CSV**.

## Como Restaurar a Estrutura
Caso precise recriar as tabelas em um novo ambiente:
1. Copie o conteúdo de `schema_backup.sql`.
2. Vá no **SQL Editor** do Supabase.
3. Cole o código e clique em **Run**.

---
*Nota: Este backup de estrutura é baseado nas definições de código e migrations existentes no repositório.*
