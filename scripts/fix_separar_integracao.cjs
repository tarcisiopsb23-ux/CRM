const fs = require('fs');
const wf = JSON.parse(fs.readFileSync('docs/n8n_workflows/n8n_workflow_marketing.json', 'utf8'));

const sep = wf.nodes.find(n => n.name === 'Separar por Integração1');

// Fix: aceita integrações com access_token OU refresh_token (Google usa refresh_token)
sep.parameters.jsCode = sep.parameters.jsCode.replace(
  'integrations = integrations.filter(i => i.id && i.account_id && i.access_token);',
  'integrations = integrations.filter(i => i.id && i.account_id && (i.access_token || i.refresh_token));'
);

// Also fix the comment
sep.parameters.jsCode = sep.parameters.jsCode.replace(
  '// Filtra apenas registros com account_id e access_token preenchidos',
  '// Filtra registros com account_id e access_token OU refresh_token (Google usa refresh_token)'
);

fs.writeFileSync('docs/n8n_workflows/n8n_workflow_marketing.json', JSON.stringify(wf, null, 2));
console.log('Done.');
console.log('New filter line:', sep.parameters.jsCode.split('\n').find(l => l.includes('filter(i =>')));
