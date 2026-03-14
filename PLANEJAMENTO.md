# Planejamento de Ajustes no CRM

Este documento detalha o passo a passo para as implementações solicitadas no CRM, abrangendo o Perfil do Usuário, Gestão de Colaboradores e Módulo Financeiro.

## 1. Ajustes no Perfil do Usuário (Header)

### Objetivo
Permitir que o usuário logado altere sua senha, foto e nome de exibição diretamente pelo header, com sincronização automática no cadastro de colaborador.

### Passo a Passo
1.  **Modificar `AppHeader.tsx`**:
    *   Adicionar estados para os diálogos de "Alterar Senha", "Alterar Foto" e "Alterar Perfil".
    *   Incluir opções no `DropdownMenu` do perfil: "Meu Perfil" (nome e foto) e "Alterar Senha".
    *   Implementar o diálogo de alteração de senha utilizando `supabase.auth.updateUser`.
    *   Implementar o diálogo de alteração de nome de exibição e foto.
    *   Garantir que ao alterar o `full_name` ou o `display_name` (no metadata), a alteração seja refletida na tabela `profiles`. Como o cadastro de colaboradores utiliza a tabela `profiles`, a sincronização será automática.
2.  **Upload de Foto**:
    *   Criar uma função de utilidade ou hook para upload de imagens para o storage do Supabase (bucket `avatars`).
    *   Integrar o upload no diálogo de perfil do header.

## 2. Gestão de Fotos nas Páginas de Colaborador

### Objetivo
Incluir a funcionalidade de gerenciar a foto (incluir, alterar, excluir) na visualização e edição de colaboradores.

### Passo a Passo
1.  **Modificar `TeamProfilesList.tsx`**:
    *   No modal de edição (`editing`), adicionar um componente de upload/exclusão de foto.
    *   Atualizar o estado `extraForm` ou `form` para incluir a URL da foto (`avatar_url`).
    *   Implementar a lógica de deleção da foto (remover do storage e limpar o campo `avatar_url` no banco).
2.  **Visualização**:
    *   Garantir que o componente `Avatar` em `TeamProfilesList` exiba a foto carregada do `avatar_url`.

## 3. Pop-ups de Cadastro no Módulo Financeiro

### Objetivo
Facilitar o lançamento de contas ao permitir o cadastro rápido de Clientes ou Fornecedores sem sair da tela de lançamento financeiro.

### Passo a Passo
1.  **Modificar `FinancialPage.tsx`**:
    *   Adicionar botões de "Novo" (ícone `UserPlus` ou `Plus`) ao lado dos selects de Cliente (em `modalReceber`) e Fornecedor (em `modalPagar`).
    *   Criar estados para controlar a abertura dos modais de cadastro rápido: `modalNovoCliente` e `modalNovoFornecedor`.
    *   Implementar os modais chamando os componentes existentes `ClientForm` (ou similar) ou criando versões simplificadas.
    *   **Fluxo**:
        1. Usuário clica em "Novo" no pop-up de lançamento.
        2. Abre o pop-up de cadastro de Cliente/Fornecedor.
        3. Após salvar com sucesso, o novo registro é selecionado automaticamente no pop-up de lançamento original.
        4. O pop-up de cadastro fecha e retorna ao de lançamento.

## 4. Verificação e Testes

*   Testar alteração de senha e logout/login com a nova senha.
*   Testar upload de foto no perfil e verificar se reflete no header e na lista de colaboradores.
*   Testar alteração de nome e verificar sincronização.
*   Testar o fluxo de "Nova conta -> Novo Cliente -> Salvar -> Voltar" no financeiro.
