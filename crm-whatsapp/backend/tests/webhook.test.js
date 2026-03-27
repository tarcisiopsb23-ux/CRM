'use strict'

// Feature: crm-dashboard-architecture
// Validates: Requirements 5.5

import { describe, test, beforeAll } from 'vitest'
import { expect } from 'vitest'
import fc from 'fast-check'
import initSqlJs from 'sql.js'
import express from 'express'
import request from 'supertest'
import { initDbSqlJs } from '../db.js'
import createWebhookRouter from '../routes/webhook.js'

let SQL

beforeAll(async () => {
  SQL = await initSqlJs()
})

/** Creates a fresh in-memory db and Express app for webhook testing */
function makeApp() {
  const db = initDbSqlJs(SQL)
  const app = express()
  app.use(express.json())
  app.use('/api/webhook', createWebhookRouter(db))
  return { app, db }
}

// Arbitrary for a valid non-empty name (printable chars, no leading/trailing spaces)
const arbValidName = fc.string({ minLength: 1, maxLength: 100 }).map(s => s.trim()).filter(s => s.length > 0)

// Arbitrary for a valid non-empty phone (digits only, 8-15 chars)
const arbValidPhone = fc.stringMatching(/^[0-9]{8,15}$/)

// Arbitrary for optional fields
const arbOptionalString = fc.option(fc.string({ maxLength: 200 }), { nil: undefined })
const arbOptionalDate = fc.option(
  fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).map(d => d.toISOString()),
  { nil: undefined }
)
const arbOptionalKeyword = fc.option(fc.integer({ min: 0, max: 1 }), { nil: undefined })

// Feature: crm-dashboard-architecture, Property 9.3a
// Validates: Requirements 5.5
// Property: para qualquer payload com `name` e `phone` válidos, o lead é criado/atualizado sem erro
describe('Property 9.3a: payload válido cria/atualiza lead sem erro', () => {
  test('POST /api/webhook/n8n com name e phone válidos retorna 200 e { ok: true }', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbValidName,
        arbValidPhone,
        arbOptionalString,
        arbOptionalDate,
        arbOptionalKeyword,
        async (name, phone, ultima_mensagem, data_ultima_interacao, tem_keyword) => {
          const { app } = makeApp()

          const payload = { name, phone }
          if (ultima_mensagem !== undefined) payload.ultima_mensagem = ultima_mensagem
          if (data_ultima_interacao !== undefined) payload.data_ultima_interacao = data_ultima_interacao
          if (tem_keyword !== undefined) payload.tem_keyword = tem_keyword

          const res = await request(app)
            .post('/api/webhook/n8n')
            .send(payload)
            .expect(200)
            .expect('Content-Type', /application\/json/)

          expect(res.body).toEqual({ ok: true })
        }
      ),
      { numRuns: 100 }
    )
  })
})

// Feature: crm-dashboard-architecture, Property 9.3b
// Validates: Requirements 5.5
// Property: para qualquer payload sem `name` ou `phone`, a API retorna HTTP 400
describe('Property 9.3b: payload inválido retorna HTTP 400', () => {
  // Arbitrary for a payload missing `name` (phone present and valid)
  const arbMissingName = fc.record({
    phone: arbValidPhone,
    ultima_mensagem: arbOptionalString,
  })

  // Arbitrary for a payload missing `phone` (name present and valid)
  const arbMissingPhone = fc.record({
    name: arbValidName,
    ultima_mensagem: arbOptionalString,
  })

  // Arbitrary for a payload with empty `name` (phone present and valid)
  const arbEmptyName = fc.record({
    name: fc.constantFrom('', '   ', '\t', '\n'),
    phone: arbValidPhone,
  })

  // Arbitrary for a payload with empty `phone` (name present and valid)
  const arbEmptyPhone = fc.record({
    name: arbValidName,
    phone: fc.constantFrom('', '   ', '\t', '\n'),
  })

  test('POST /api/webhook/n8n sem `name` retorna 400 com campo error', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbMissingName,
        async (payload) => {
          const { app } = makeApp()

          const res = await request(app)
            .post('/api/webhook/n8n')
            .send(payload)
            .expect(400)
            .expect('Content-Type', /application\/json/)

          expect(res.body).toHaveProperty('error')
          expect(typeof res.body.error).toBe('string')
          expect(res.body.error.length).toBeGreaterThan(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  test('POST /api/webhook/n8n sem `phone` retorna 400 com campo error', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbMissingPhone,
        async (payload) => {
          const { app } = makeApp()

          const res = await request(app)
            .post('/api/webhook/n8n')
            .send(payload)
            .expect(400)
            .expect('Content-Type', /application\/json/)

          expect(res.body).toHaveProperty('error')
          expect(typeof res.body.error).toBe('string')
          expect(res.body.error.length).toBeGreaterThan(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  test('POST /api/webhook/n8n com `name` vazio retorna 400 com campo error', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbEmptyName,
        async (payload) => {
          const { app } = makeApp()

          const res = await request(app)
            .post('/api/webhook/n8n')
            .send(payload)
            .expect(400)
            .expect('Content-Type', /application\/json/)

          expect(res.body).toHaveProperty('error')
          expect(typeof res.body.error).toBe('string')
          expect(res.body.error.length).toBeGreaterThan(0)
        }
      ),
      { numRuns: 20 }
    )
  })

  test('POST /api/webhook/n8n com `phone` vazio retorna 400 com campo error', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbEmptyPhone,
        async (payload) => {
          const { app } = makeApp()

          const res = await request(app)
            .post('/api/webhook/n8n')
            .send(payload)
            .expect(400)
            .expect('Content-Type', /application\/json/)

          expect(res.body).toHaveProperty('error')
          expect(typeof res.body.error).toBe('string')
          expect(res.body.error.length).toBeGreaterThan(0)
        }
      ),
      { numRuns: 20 }
    )
  })
})
