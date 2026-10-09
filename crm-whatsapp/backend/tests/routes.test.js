'use strict'

import { describe, test, beforeAll } from 'vitest'
import { expect } from 'vitest'
import fc from 'fast-check'
import initSqlJs from 'sql.js'
import express from 'express'
import request from 'supertest'
import { initDbSqlJs, upsertContato } from '../db.js'
import createRouter from '../routes/contatos.js'

let SQL

beforeAll(async () => {
  SQL = await initSqlJs()
})

/** Creates a fresh in-memory db and Express app for testing */
function makeApp(waStatus = 'conectado') {
  const db = initDbSqlJs(SQL)
  const app = express()
  app.use(express.json())
  app.use('/api', createRouter(db, () => waStatus))
  return { app, db }
}

// Arbitrary for a non-empty phone string (digits only, 8-15 chars)
const arbTelefone = fc.stringMatching(/^[0-9]{8,15}$/)

// Arbitrary for a non-empty name
const arbNome = fc.string({ minLength: 1, maxLength: 50 })

// Arbitrary for ISO-8601-like date string
const arbData = fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
  .map(d => d.toISOString())

// Arbitrary for valid status values
const arbStatusValido = fc.constantFrom('pendente', 'negocio', 'nao_negocio')

// Arbitrary for invalid status values (non-empty strings that are not valid statuses)
const arbStatusInvalido = fc.string({ minLength: 1, maxLength: 30 }).filter(
  s => !['pendente', 'negocio', 'nao_negocio'].includes(s)
)

// Arbitrary for a contato input
const arbContato = fc.record({
  nome: arbNome,
  telefone: arbTelefone,
  ultima_mensagem: fc.string({ maxLength: 200 }),
  data_ultima_interacao: arbData,
  tem_keyword: fc.integer({ min: 0, max: 1 }),
})

// Feature: crm-whatsapp, Property 9: Filtragem por status na API
// Validates: Requirements 5.3, 7.2
describe('Property 9: Filtragem por status na API', () => {
  test('GET /api/contatos?status=X retorna apenas contatos com aquele status', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbStatusValido,
        fc.array(
          fc.record({
            nome: arbNome,
            telefone: arbTelefone,
            ultima_mensagem: fc.string({ maxLength: 100 }),
            data_ultima_interacao: arbData,
            tem_keyword: fc.integer({ min: 0, max: 1 }),
            status: arbStatusValido,
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (filtroStatus, contatosInput) => {
          const { app, db } = makeApp()

          // Deduplicate by telefone
          const byPhone = new Map()
          for (const c of contatosInput) byPhone.set(c.telefone, c)
          const unique = Array.from(byPhone.values())

          // Insert contacts and set their statuses
          for (const c of unique) {
            upsertContato(db, c)
            // Get the inserted contact id and update status
            const rows = db.prepare('SELECT id FROM contatos WHERE telefone = ?').all(c.telefone)
            if (rows.length > 0) {
              db.prepare('UPDATE contatos SET status = ? WHERE id = ?').run(c.status, rows[0].id)
            }
          }

          const res = await request(app)
            .get(`/api/contatos?status=${filtroStatus}`)
            .expect(200)
            .expect('Content-Type', /application\/json/)

          const body = res.body
          expect(Array.isArray(body)).toBe(true)
          for (const contato of body) {
            expect(contato.status).toBe(filtroStatus)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

// Feature: crm-whatsapp, Property 12: Validação de status inválido retorna HTTP 400
// Validates: Requirements 7.5, 7.7
describe('Property 12: Status inválido retorna HTTP 400', () => {
  test('PATCH /api/contatos/:id com status inválido retorna 400 com Content-Type application/json', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbContato,
        arbStatusInvalido,
        async (contato, statusInvalido) => {
          const { app, db } = makeApp()
          upsertContato(db, contato)
          const rows = db.prepare('SELECT id FROM contatos WHERE telefone = ?').all(contato.telefone)
          const id = rows[0].id

          const res = await request(app)
            .patch(`/api/contatos/${id}`)
            .send({ status: statusInvalido })
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
})

// Feature: crm-whatsapp, Property 13: ID inexistente retorna HTTP 404
// Validates: Requirements 7.6, 7.7
describe('Property 13: ID inexistente retorna HTTP 404', () => {
  test('PATCH /api/contatos/:id com id inexistente retorna 404 com Content-Type application/json', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 100000, max: 999999 }),
        arbStatusValido,
        async (idInexistente, status) => {
          const { app } = makeApp()

          const res = await request(app)
            .patch(`/api/contatos/${idInexistente}`)
            .send({ status })
            .expect(404)
            .expect('Content-Type', /application\/json/)

          expect(res.body).toHaveProperty('error')
          expect(typeof res.body.error).toBe('string')
          expect(res.body.error.length).toBeGreaterThan(0)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// Feature: crm-dashboard-architecture, Requirement 6.6
// Validates: Requirement 6.6 — GET /api/status retorna status da conexão WhatsApp
describe('Requirement 6.6: GET /api/status retorna status da conexão WhatsApp', () => {
  test.each([
    ['conectado'],
    ['aguardando_qr'],
    ['desconectado'],
  ])('retorna { status: "%s" } quando o status é "%s"', async (waStatus) => {
    const { app } = makeApp(waStatus)
    const res = await request(app)
      .get('/api/status')
      .expect(200)
      .expect('Content-Type', /application\/json/)

    expect(res.body).toEqual({ status: waStatus })
  })
})
