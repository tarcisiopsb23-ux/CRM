/**
 * Funções puras exportáveis para testes de propriedade.
 * Importado por app.js e pelos testes de frontend.
 */

'use strict'

/**
 * Calcula as métricas do dashboard a partir de uma lista de contatos.
 * @param {Array} contatos
 * @returns {{ total, pendentes, negocios, nao_negocios, conversao }}
 */
function calcDashboard(contatos) {
  const total = contatos.length
  const pendentes = contatos.filter(c => c.status === 'pendente').length
  const negocios = contatos.filter(c => c.status === 'negocio').length
  const nao_negocios = contatos.filter(c => c.status === 'nao_negocio').length

  const denominador = negocios + nao_negocios
  const conversao = denominador === 0
    ? '0.0%'
    : (negocios / denominador * 100).toFixed(1) + '%'

  return { total, pendentes, negocios, nao_negocios, conversao }
}

/**
 * Formata uma string de data ISO para exibição amigável.
 * @param {string|null} dataStr
 * @returns {string}
 */
function formatarData(dataStr) {
  if (!dataStr) return ''
  try {
    return new Date(dataStr).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  } catch {
    return dataStr
  }
}

/**
 * Trunca uma string para o comprimento máximo especificado.
 * @param {string|null} str
 * @param {number} max
 * @returns {string}
 */
function truncar(str, max = 80) {
  if (!str) return ''
  return str.length > max ? str.slice(0, max) + '…' : str
}

/**
 * Gera o HTML de um card de contato.
 * @param {Object} contato
 * @returns {string} HTML string
 */
function renderContatoCard(contato) {
  const badgeKeyword = contato.tem_keyword
    ? `<span class="badge-keyword">🔥 Potencial neg\u00F3cio</span>`
    : ''

  const dataFormatada = formatarData(contato.data_ultima_interacao)
  const mensagemTruncada = truncar(contato.ultima_mensagem)

  return `
<div class="contato-card" data-id="${contato.id}">
  <div class="contato-info">
    <span class="contato-nome">${escapeHtml(contato.nome)}</span>
    <span class="contato-telefone">${escapeHtml(contato.telefone)}</span>
    <span class="contato-mensagem">${escapeHtml(mensagemTruncada)}</span>
    <span class="contato-data">${escapeHtml(dataFormatada)}</span>
    <div class="contato-meta">
      <span class="badge-status ${contato.status}">${labelStatus(contato.status)}</span>
      ${badgeKeyword}
    </div>
  </div>
  <div class="contato-acoes">
    <button class="btn-negocio" onclick="classificar(${contato.id}, 'negocio')">✅ Negócio</button>
    <button class="btn-nao-negocio" onclick="classificar(${contato.id}, 'nao_negocio')">❌ Não é</button>
    <button class="btn-obs" onclick="toggleObs(${contato.id})">📝 Obs.</button>
  </div>
  <div class="obs-wrapper" id="obs-${contato.id}">
    <textarea class="obs-input" id="obs-input-${contato.id}" rows="2" placeholder="Adicionar observação...">${escapeHtml(contato.observacao || '')}</textarea>
    <button class="btn-salvar-obs" onclick="salvarObservacao(${contato.id}, document.getElementById('obs-input-${contato.id}').value)">Salvar</button>
  </div>
</div>`.trim()
}

/**
 * Escapa caracteres HTML especiais.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (str == null) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Retorna o label legível para um status.
 * @param {string} status
 * @returns {string}
 */
function labelStatus(status) {
  const labels = {
    pendente: 'Pendente',
    negocio: 'Negócio',
    nao_negocio: 'Não Negócio',
  }
  return labels[status] || status
}

// Exporta para uso em testes (Node.js / CommonJS via vitest)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calcDashboard, renderContatoCard, escapeHtml, formatarData, truncar, labelStatus }
}
