const fs = require('fs');
const wf = JSON.parse(fs.readFileSync('docs/n8n_workflows/n8n_workflow_marketing.json', 'utf8'));

// Nó para renovar o access_token do Google usando o refresh_token
const refreshNode = {
  parameters: {
    url: "https://oauth2.googleapis.com/token",
    requestMethod: "POST",
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: "Content-Type", value: "application/x-www-form-urlencoded" }
      ]
    },
    sendBody: true,
    specifyBody: "string",
    body: "=client_id={{ $json.settings.client_id }}&client_secret={{ $json.settings.client_secret }}&refresh_token={{ $json.refresh_token }}&grant_type=refresh_token",
    options: { response: { response: { neverError: true } } }
  },
  id: "refresh-google-token",
  name: "Refresh Google Token",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [-2440, 3456]
};

// Nó para mesclar o novo access_token com os dados da integração
const mergeCode = [
  "const integration = $('Roteador por Plataforma').item.json;",
  "const tokenResp = $input.item.json;",
  "const accessToken = tokenResp.access_token;",
  "if (!accessToken) {",
  "  const errMsg = tokenResp.error_description || tokenResp.error || 'unknown';",
  "  return [{ json: { _skip: true, _error: 'Falha ao renovar token Google: ' + errMsg, integration_id: integration.id } }];",
  "}",
  "return [{ json: { ...integration, access_token: accessToken } }];"
].join("\n");

const mergeNode = {
  parameters: { jsCode: mergeCode },
  id: "merge-google-token",
  name: "Merge Google Token",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [-2350, 3456]
};

wf.nodes.push(refreshNode, mergeNode);

// Atualiza conexões: Router Google branch -> Refresh -> Merge -> Google Ads API
wf.connections["Roteador por Plataforma"].main[1] = [
  { node: "Refresh Google Token", type: "main", index: 0 }
];
wf.connections["Refresh Google Token"] = {
  main: [[{ node: "Merge Google Token", type: "main", index: 0 }]]
};
wf.connections["Merge Google Token"] = {
  main: [[{ node: "Google Ads API", type: "main", index: 0 }]]
};

fs.writeFileSync('docs/n8n_workflows/n8n_workflow_marketing.json', JSON.stringify(wf, null, 2));
console.log('Done. Total nodes:', wf.nodes.length);
console.log('Google branch:', JSON.stringify(wf.connections["Roteador por Plataforma"].main[1]));
