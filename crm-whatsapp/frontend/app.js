/**
 * CRM WhatsApp — SPA Logic
 * Consome a API REST do backend e gerencia a UI.
 */

// ===== Estado global =====
let contatos = []
let filtroAtivo = 'todos'
let statusWA = 'aguardando_qr'

// ===== Carregamento de dados =====

async function loadContatos() {
  try {
    const res = await fetch('/api/contatos')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    contatos = await res.json()
    renderContatos()
    renderDashboard()
  } catch (err) {
    const lista = document.getElementById('lista-contatos')
    if (lista) {
      lista.innerHTML = `<div class="lista-vazia"><span>⚠️</span>Erro ao carregar contatos: ${err.message}</div>`
    }
  }
}

// ===== Renderização dos cards =====

function renderContatos() {
  const lista = document.getElementById('lista-contatos')
  if (!lista) return

  const filtrados = filtroAtivo === 'todos'
    ? contatos
    : contatos.filter(c => c.status === filtroAtivo)

  if (filtrados.length === 0) {
    lista.innerHTML = `<div class="lista-vazia"><span>📭</span>Nenhum contato encontrado</div>`
    return
  }

  lista.innerHTML = filtrados.map(renderContatoCard).join('')
}

// ===== Renderização do dashboard =====

function renderDashboard() {
  const { total, pendentes, negocios, nao_negocios, conversao } = calcDashboard(contatos)

  const set = (id, val) => {
    const el = document.getElementById(id)
    if (el) el.textContent = val
  }

  set('stat-total', total)
  set('stat-negocios', negocios)
  set('stat-nao-negocios', nao_negocios)
  set('stat-pendentes', pendentes)
  set('stat-conversao', conversao)
}

// ===== Filtros =====

function setFiltro(status) {
  filtroAtivo = status

  document.querySelectorAll('.btn-filtro').forEach(btn => {
    btn.classList.toggle('ativo', btn.dataset.status === status)
  })

  renderContatos()
}

// ===== Classificação =====

async function classificar(id, status) {
  try {
    const res = await fetch(`/api/contatos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `HTTP ${res.status}`)
    }

    const atualizado = await res.json()
    contatos = contatos.map(c => c.id === id ? atualizado : c)
    renderContatos()
    renderDashboard()
  } catch (err) {
    alert(`Erro ao classificar contato: ${err.message}`)
  }
}

// ===== Observação =====

function toggleObs(id) {
  const wrapper = document.getElementById(`obs-${id}`)
  if (wrapper) wrapper.classList.toggle('visivel')
}

async function salvarObservacao(id, obs) {
  try {
    const res = await fetch(`/api/contatos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ observacao: obs }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `HTTP ${res.status}`)
    }

    const atualizado = await res.json()
    contatos = contatos.map(c => c.id === id ? atualizado : c)

    // Fecha o campo inline
    const wrapper = document.getElementById(`obs-${id}`)
    if (wrapper) wrapper.classList.remove('visivel')
  } catch (err) {
    alert(`Erro ao salvar observação: ${err.message}`)
  }
}

// ===== Poll de status WhatsApp =====

function pollStatus() {
  const statusLabels = {
    conectado: 'Conectado',
    aguardando_qr: 'Aguardando QR',
    desconectado: 'Desconectado',
  }

  const atualizar = async () => {
    try {
      const res = await fetch('/api/status')
      if (!res.ok) return
      const data = await res.json()
      statusWA = data.status || 'desconectado'
    } catch {
      statusWA = 'desconectado'
    }

    const el = document.getElementById('wa-status')
    if (!el) return

    // Remove classes anteriores
    el.classList.remove('conectado', 'aguardando', 'desconectado')

    // Mapeia status da API para classe CSS
    const classeCSS = statusWA === 'conectado'
      ? 'conectado'
      : statusWA === 'aguardando_qr'
        ? 'aguardando'
        : 'desconectado'

    el.classList.add(classeCSS)

    const label = el.querySelector('.status-label')
    if (label) label.textContent = statusLabels[statusWA] || statusWA
  }

  atualizar()
  setInterval(atualizar, 5000)
}

// ===== Funções puras (também definidas em utils.js para testes) =====

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

function escapeHtml(str) {
  if (str == null) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

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

function truncar(str, max = 80) {
  if (!str) return ''
  return str.length > max ? str.slice(0, max) + '…' : str
}

function labelStatus(status) {
  const labels = {
    pendente: 'Pendente',
    negocio: 'Negócio',
    nao_negocio: 'Não Negócio',
  }
  return labels[status] || status
}

// ===== Inicialização =====

document.addEventListener('DOMContentLoaded', () => {
  // Bind filtros
  document.querySelectorAll('.btn-filtro').forEach(btn => {
    btn.addEventListener('click', () => setFiltro(btn.dataset.status))
  })
  loadContatos()
  pollStatus()
})
