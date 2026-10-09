'use strict'

const express = require('express')
const path = require('path')
const { initDb } = require('./db')
const { initWhatsApp, getWaStatus, getCurrentQr } = require('./whatsapp')
const createRouter = require('./routes/contatos')
const createWebhookRouter = require('./routes/webhook')

const PORT = process.env.PORT || 3001
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*'

const db = initDb()
initWhatsApp(db)

const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// CORS — deve vir antes de qualquer rota
app.use((req, res, next) => {
  const origin = req.headers.origin || '*'
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN === '*' ? origin : CORS_ORIGIN)
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  if (req.method === 'OPTIONS') return res.status(204).end()
  next()
})

app.use('/api', createRouter(db, getWaStatus))
app.use('/api/webhook', createWebhookRouter(db))

// Expõe QR Code atual como string para o dashboard exibir
app.get('/api/qr', (req, res) => {
  const qr = getCurrentQr()
  if (!qr) return res.json({ qr: null, status: getWaStatus() })
  res.json({ qr, status: getWaStatus() })
})

// Serve o frontend React (build de produção)
app.use(express.static(path.join(__dirname, '../../dist')))

app.listen(PORT, () => {
  console.log(`[CRM] Servidor rodando em http://localhost:${PORT}`)
})
