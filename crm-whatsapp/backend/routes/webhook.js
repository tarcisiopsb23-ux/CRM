'use strict'

const express = require('express')
const { upsertContato } = require('../db')

/**
 * Factory function that creates the Express router for /api/webhook.
 * @param {object} db - database instance
 * @returns {express.Router}
 */
module.exports = function createWebhookRouter(db) {
  const router = express.Router()

  // POST /n8n — receives payload from n8n agent and upserts contact
  // Requirements: 5.1, 5.5
  router.post('/n8n', (req, res) => {
    const { name, phone, ultima_mensagem, data_ultima_interacao, tem_keyword } = req.body

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: 'Campo obrigatório ausente ou inválido: name' })
    }

    if (!phone || typeof phone !== 'string' || phone.trim() === '') {
      return res.status(400).json({ error: 'Campo obrigatório ausente ou inválido: phone' })
    }

    upsertContato(db, {
      nome: name.trim(),
      telefone: phone.trim(),
      ultima_mensagem: ultima_mensagem || null,
      data_ultima_interacao: data_ultima_interacao || null,
      tem_keyword: tem_keyword ? 1 : 0,
    })

    res.status(200).json({ ok: true })
  })

  return router
}
