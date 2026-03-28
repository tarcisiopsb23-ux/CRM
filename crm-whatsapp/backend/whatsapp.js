'use strict'

const fs = require('fs')
const path = require('path')
const { Client, LocalAuth } = require('whatsapp-web.js')
const qrcode = require('qrcode-terminal')
const { hasBusinessKeyword } = require('./keywords')
const { upsertContato } = require('./db')

/** @type {'aguardando_qr' | 'conectado' | 'desconectado'} */
let waStatus = 'aguardando_qr'

/** @type {string | null} */
let currentQr = null

function getWaStatus() { return waStatus }
function getCurrentQr() { return currentQr }

/**
 * Removes Chromium's SingletonLock files left behind from a previous crashed session.
 * Without this, Chromium refuses to start after a container restart.
 */
function clearChromiumLocks() {
  const dataPath = '/app/.wwebjs_auth'
  const locks = ['SingletonLock', 'SingletonCookie', 'SingletonSocket']

  function scanDir(dir) {
    try {
      if (!fs.existsSync(dir)) return
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry)
        try {
          const stat = fs.statSync(full)
          if (stat.isDirectory()) {
            scanDir(full)
          } else if (locks.includes(entry)) {
            fs.unlinkSync(full)
            console.log(`[WA] Removed stale lock: ${full}`)
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  scanDir(dataPath)
}

/**
 * Detecta o tipo da mensagem com base no tipo do whatsapp-web.js.
 * @param {object} msg
 * @returns {string}
 */
function detectTipoMensagem(msg) {
  const type = msg.type || ''
  switch (type) {
    case 'chat':      return 'texto'
    case 'image':     return 'imagem'
    case 'video':     return 'video'
    case 'audio':     return 'audio'
    case 'ptt':       return 'audio_voz'
    case 'document':  return 'documento'
    case 'sticker':   return 'sticker'
    case 'location':  return 'localizacao'
    case 'vcard':     return 'contato'
    case 'list':
    case 'buttons_response':
    case 'interactive': return 'interativo'
    default:          return type || 'desconhecido'
  }
}

/**
 * Processa uma mensagem recebida e upserta o contato no banco.
 * Ignora grupos e mensagens enviadas por mim.
 */
async function handleMessage(msg, db) {
  try {
    if (msg.fromMe === true) return
    if (msg.from && msg.from.endsWith('@g.us')) return

    const telefone = msg.from.replace('@c.us', '')
    const nome = (msg._data && msg._data.notifyName) ? msg._data.notifyName : telefone
    const conteudo = msg.body || ''
    const tipo_mensagem = detectTipoMensagem(msg)
    const timestamp = new Date(msg.timestamp * 1000).toISOString()
    const tem_keyword = hasBusinessKeyword(conteudo)

    upsertContato(db, { nome, telefone, ultima_mensagem: conteudo, tipo_mensagem, data_ultima_interacao: timestamp, tem_keyword })
  } catch (err) {
    console.error('[WA] Erro ao processar mensagem:', err)
  }
}

/**
 * Ao conectar, sincroniza todas as conversas individuais existentes (não grupos).
 * Traz a última mensagem recebida de cada conversa.
 */
async function syncChats(client, db) {
  try {
    console.log('[WA] Sincronizando conversas existentes...')
    const chats = await client.getChats()
    let count = 0

    for (const chat of chats) {
      // ignora grupos
      if (chat.isGroup) continue

      const telefone = chat.id.user
      const nome = chat.name || telefone

      // pega a última mensagem da conversa (qualquer direção)
      let ultima_mensagem = null
      let tipo_mensagem = null
      let timestamp = null
      let tem_keyword = false

      if (chat.lastMessage) {
        const lm = chat.lastMessage
        ultima_mensagem = lm.body || ''
        tipo_mensagem = detectTipoMensagem(lm)
        timestamp = lm.timestamp ? new Date(lm.timestamp * 1000).toISOString() : null
        tem_keyword = hasBusinessKeyword(ultima_mensagem)
      }

      upsertContato(db, { nome, telefone, ultima_mensagem, tipo_mensagem, data_ultima_interacao: timestamp, tem_keyword })
      count++
    }

    console.log(`[WA] ${count} conversas sincronizadas`)
  } catch (err) {
    console.error('[WA] Erro ao sincronizar conversas:', err)
  }
}

function initWhatsApp(db) {
  clearChromiumLocks()

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: '/app/.wwebjs_auth' }),
    puppeteer: {
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-single-instance'],
    },
  })

  client.on('qr', qr => {
    waStatus = 'aguardando_qr'
    currentQr = qr
    qrcode.generate(qr, { small: true })
    console.log('[WA] QR Code gerado — acesse /api/qr no dashboard para escanear')
  })

  client.on('ready', async () => {
    waStatus = 'conectado'
    currentQr = null
    console.log('[WA] Conectado em', new Date().toISOString())
    await syncChats(client, db)
  })

  client.on('disconnected', reason => {
    waStatus = 'desconectado'
    currentQr = null
    console.log('[WA] Desconectado:', reason)
    client.initialize()
  })

  client.on('message', msg => handleMessage(msg, db))
  client.initialize()

  return client
}

module.exports = { initWhatsApp, getWaStatus, getCurrentQr, handleMessage, detectTipoMensagem, syncChats }
