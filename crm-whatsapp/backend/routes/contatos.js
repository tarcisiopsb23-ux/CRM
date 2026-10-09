'use strict'

const express = require('express')
const { getContatos, updateContato } = require('../db')

const VALID_STATUSES = ['pendente', 'negocio', 'nao_negocio']

/**
 * Factory function that creates the Express router for /api/contatos and /api/status.
 * @param {object} db - database instance
 * @param {function} getWaStatus - returns current WhatsApp connection status
 * @returns {express.Router}
 */
module.exports = function createRouter(db, getWaStatus) {
  const router = express.Router()

  // GET /contatos — list all contacts, optionally filtered by status
  // Requirements: 7.1, 7.2
  router.get('/contatos', (req, res) => {
    const { status } = req.query
    const contatos = getContatos(db, status || undefined)
    res.json(contatos)
  })

  // PATCH /contatos/:id — update status and/or observacao
  // Requirements: 4.3, 7.3, 7.5, 7.6, 7.7
  router.patch('/contatos/:id', (req, res) => {
    const id = Number(req.params.id)
    const { status, observacao } = req.body

    // Validate status if provided
    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        error: 'Status inválido. Use: pendente, negocio, nao_negocio',
      })
    }

    const fields = {}
    if (status !== undefined) fields.status = status
    if (observacao !== undefined) fields.observacao = observacao

    const updated = updateContato(db, id, fields)

    if (updated === null) {
      return res.status(404).json({ error: 'Contato não encontrado' })
    }

    res.json(updated)
  })

  // GET /status — WhatsApp connection status
  // Requirements: 7.4
  router.get('/status', (req, res) => {
    res.json({ status: getWaStatus() })
  })

  return router
}
