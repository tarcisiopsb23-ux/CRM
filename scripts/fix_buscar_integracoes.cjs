const fs = require('fs');
const wf = JSON.parse(fs.readFileSync('docs/n8n_workflows/n8n_workflow_marketing.json', 'utf8'));

const fetch = wf.nodes.find(n => n.name === 'Buscar Integrações Ativas');

// Remove filtro access_token not.is.null — Google usa refresh_token, não access_token
fetch.parameters.queryParameters.parameters = fetch.parameters.queryParameters.parameters.filter(
  p => !(p.name === 'access_token' && p.value === 'not.is.null')
);

console.log('Filters after fix:', fetch.parameters.queryParameters.parameters.map(p => p.name));

fs.writeFileSync('docs/n8n_workflows/n8n_workflow_marketing.json', JSON.stringify(wf, null, 2));
console.log('Done.');
