/**
 * Nomes das subpastas criadas automaticamente pelo n8n ao criar um registro.
 * Essas pastas são protegidas e não podem ser excluídas pela UI.
 * Fonte: workflow "Google Drive - Pastas e Documentos" → nó "Preparar Subpastas Padrao"
 */
export const DRIVE_AUTO_FOLDERS = {
  client:   ["Contratos", "Documentos", "Relatorios", "Comunicacoes", "Notas Fiscais"],
  supplier: ["Contratos", "Notas Fiscais", "Documentos"],
  project:  ["Briefing", "Entregas", "Aprovacoes", "Arquivos"],
  employee: ["Documentos Pessoais", "Contratos", "Avaliacoes"],
} as const;
